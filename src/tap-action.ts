// Wykonanie tap_action zgodnie z konwencją Home Assistant.
//
// Obsługiwane: navigate, url, more-info, toggle, perform-action,
// call-service (starszy zapis), none. Template-like placeholdery
// `{area_id}` i `{area_name}` dla navigate/url.
//
// Rozdział na `resolveTapAction` (czysta funkcja: config → plan) i
// `runTapAction` (wykonanie planu) jest celowy: wywołujący muszą wiedzieć
// JUŻ przy renderze / przed stopPropagation, czy akcja w ogóle coś zrobi.
// Kafel z akcją, której nie umiemy wykonać (np. `assist` z edytora HA albo
// `toggle` bez encji), ma wrócić do swojego domyślnego kliknięcia, a chip
// — do listy encji, zamiast udawać przycisk, który nic nie robi.

import {
  currentHistoryIndex,
  isGuardOnTop,
  liveGuards,
  navigateMode,
} from './back-guard.js';
import type { HomeAssistant, TapActionConfig } from './types.js';

/** Kontekst potrzebny do rozwiązania akcji (bez DOM-u — testowalny). */
export interface TapResolveContext {
  /** Kontekst tapnięcia — podstawiany do placeholderów. */
  area_id?: string;
  area_name?: string;
  /**
   * Encja „pod palcem" (kafel, chip encji, scena). Edytor akcji HA nie ma
   * pola encji dla `more-info` / `toggle` — bez tego fallbacku obie akcje
   * byłyby zawsze no-opem.
   */
  entity_id?: string;
}

export interface TapContext extends TapResolveContext {
  /** Element z którego emitujemy eventy (`hass-more-info` bubbles). */
  source: HTMLElement;
}

/** Rozwiązana akcja — co dokładnie zostanie wykonane. */
export type TapPlan =
  | { kind: 'navigate'; path: string }
  | { kind: 'url'; url: string; newTab: boolean }
  | { kind: 'more-info'; entityId: string }
  | {
      kind: 'service';
      domain: string;
      service: string;
      data: Record<string, unknown>;
      target?: Record<string, unknown>;
    };

/**
 * Akcje oferowane w edytorze tam, gdzie nie ma encji (wiersz pokoju).
 * `assist` celowo pominięte — karta nie umie otworzyć dialogu Assist.
 */
export const ROW_UI_ACTIONS = ['navigate', 'url', 'perform-action', 'none'];

/** Akcje oferowane tam, gdzie jest encja kontekstu (kafel, chip encji, scena). */
export const ENTITY_UI_ACTIONS = ['more-info', 'toggle', ...ROW_UI_ACTIONS];

/**
 * Config → plan albo `null`, gdy akcja nic by nie zrobiła (nieznany typ,
 * brak ścieżki, brak encji, brak hass dla usługi). `none`, `popup` i
 * `toggle-lights` też dają `null` — dwie ostatnie to akcje Stratum
 * obsługiwane w stratum-card (wymagają kontekstu pokoju).
 */
export function resolveTapAction(
  hass: HomeAssistant | undefined,
  action: TapActionConfig | undefined,
  ctx: TapResolveContext,
): TapPlan | null {
  if (!action) return null;
  switch (action.action) {
    case 'navigate': {
      // `interpolate(undefined)` rzucał wyjątkiem — config z YAML bywa niepełny.
      if (!action.navigation_path) return null;
      return { kind: 'navigate', path: interpolate(action.navigation_path, ctx) };
    }
    case 'url': {
      if (!action.url_path) return null;
      return {
        kind: 'url',
        url: interpolate(action.url_path, ctx),
        newTab: action.new_tab !== false,
      };
    }
    case 'more-info': {
      const entityId = action.entity ?? ctx.entity_id;
      return entityId ? { kind: 'more-info', entityId } : null;
    }
    case 'toggle': {
      const entityId = action.entity ?? ctx.entity_id;
      if (!hass || !entityId) return null;
      return toggleServiceFor(hass, entityId);
    }
    case 'perform-action':
    case 'call-service': {
      if (!hass) return null;
      // Edytor HA od 2024.8 pisze `perform_action` + `data`; starsze configi
      // `service` + `service_data` albo `data`. Czytamy wszystkie warianty,
      // bo user nie widzi, którym zapisem ma akcję w YAML.
      const a = action as {
        perform_action?: string;
        service?: string;
        data?: Record<string, unknown>;
        service_data?: Record<string, unknown>;
        target?: Record<string, unknown>;
      };
      const name = a.perform_action ?? a.service;
      if (!name) return null;
      const [domain, service] = name.split('.');
      if (!domain || !service) return null;
      const target =
        a.target && Object.keys(a.target).length > 0 ? { ...a.target } : undefined;
      return {
        kind: 'service',
        domain,
        service,
        data: { ...(a.data ?? a.service_data ?? {}) },
        ...(target ? { target } : {}),
      };
    }
    default:
      return null;
  }
}

/**
 * Czy akcja może zmienić stan encji (przełączyć, wywołać usługę).
 *
 * Kafel grupy świateł trzyma po geście jasność docelową na pasku, aż HA ją
 * potwierdzi. Tap, który przełącza światło — także override z listy
 * (`toggle`, `perform-action`) — musi tę wartość porzucić, inaczej pasek
 * pokazuje np. 40% nad zgaszonym światłem do 6 s. Akcje tylko „patrzące"
 * (more-info, navigate, url) i świadome `none` nic nie zmieniają, więc
 * trzymana wartość zostaje — porzucona mignęłaby starym poziomem do echa
 * HA. Nieznany typ liczymy jako zmianę: lepiej raz mignąć niż kłamać.
 */
export function tapMayChangeState(action: TapActionConfig | undefined): boolean {
  if (!action) return false;
  switch (action.action) {
    case 'none':
    case 'navigate':
    case 'url':
    case 'more-info':
      return false;
    default:
      return true;
  }
}

/**
 * Wykonuje tap_action. Zwraca `true`, gdy akcja została obsłużona; `false`,
 * gdy nie było czego wykonać — wywołujący wraca wtedy do swojego
 * domyślnego zachowania (toggle kafla, lista chipa, aktywacja sceny).
 */
export function runTapAction(
  hass: HomeAssistant | undefined,
  action: TapActionConfig | undefined,
  ctx: TapContext,
): boolean {
  const plan = resolveTapAction(hass, action, ctx);
  if (!plan) return false;
  switch (plan.kind) {
    case 'navigate': {
      // Z wnętrza popupu (strażnik „wstecz" na szczycie) na inny widok
      // nadpisujemy wpis strażnika — uzasadnienie przy navigateMode
      // w back-guard.ts. `replace` w szczególe zdarzenia — tak samo woła
      // router HA navigate().
      const guardOnTop = isGuardOnTop(liveGuards(), currentHistoryIndex(), history.state);
      const replace =
        navigateMode({ guardOnTop, fromHref: window.location.href, toPath: plan.path }) === 'replace';
      if (replace) history.replaceState(null, '', plan.path);
      else history.pushState(null, '', plan.path);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace } }));
      return true;
    }
    case 'url':
      if (plan.newTab) window.open(plan.url, '_blank', 'noopener');
      else window.location.href = plan.url;
      return true;
    case 'more-info':
      ctx.source.dispatchEvent(
        new CustomEvent('hass-more-info', {
          detail: { entityId: plan.entityId },
          bubbles: true,
          composed: true,
        }),
      );
      return true;
    case 'service':
      // Odrzucenie (brak usługi, błąd integracji) nie może wylecieć jako
      // nieobsłużony wyjątek — tap już się odbył, zostaje ślad w konsoli.
      // `target` idzie osobnym argumentem: HA rozwija w nim też area_id /
      // device_id / label_id, czego płaskie `entity_id` w danych nie umie.
      void hass!
        .callService(
          plan.domain,
          plan.service,
          plan.data,
          plan.target as Parameters<HomeAssistant['callService']>[3],
        )
        .catch((err: unknown) => {
          console.warn(`[stratum] tap_action ${plan.domain}.${plan.service}:`, err);
        });
      return true;
  }
}

/**
 * Usługa dla `toggle` — wzorem frontendu HA: domeny bez usługi `toggle`
 * dostają swój odpowiednik (scena/skrypt = uruchom, przycisk = naciśnij,
 * zamek = zamknij/otwórz wg stanu). Reszta przez `homeassistant.toggle`,
 * które samo deleguje do `<domena>.toggle`.
 */
function toggleServiceFor(hass: HomeAssistant, entityId: string): TapPlan {
  const domain = entityId.split('.')[0];
  const data = { entity_id: entityId };
  if (domain === 'scene' || domain === 'script') {
    return { kind: 'service', domain, service: 'turn_on', data };
  }
  if (domain === 'button' || domain === 'input_button') {
    return { kind: 'service', domain, service: 'press', data };
  }
  if (domain === 'lock') {
    const locked = hass.states?.[entityId]?.state === 'locked';
    return { kind: 'service', domain, service: locked ? 'unlock' : 'lock', data };
  }
  return { kind: 'service', domain: 'homeassistant', service: 'toggle', data };
}

function interpolate(template: string, ctx: TapResolveContext): string {
  return template
    .replace(/\{area_id\}/g, ctx.area_id ?? '')
    .replace(/\{area_name\}/g, encodeURIComponent(ctx.area_name ?? ''));
}
