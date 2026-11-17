// Kolory scen dla gradientów kafli: skąd je brać i jak nie zalać HA
// zapytaniami. Czysta logika (bez Lita, bez DOM-u) — testy w
// `tests/scene-colors.test.ts`.
//
// Łańcuch fallbacków (wzór z CLAUDE.md, „Fallback chains"):
//  1. Config sceny przez REST (`/api/config/scene/config/<id>`) — docelowe
//     kolory sceny, ale tylko dla scen z UI (`attributes.id`) i tylko dla
//     ADMINA (endpoint /api/config/* jest za bramką uprawnień).
//  2. Bieżące kolory świateł należących do sceny (`attributes.entity_id`
//     widzi każdy użytkownik) — przybliżenie, liczone synchronicznie.
//  3. Deterministyczny, stonowany duet z hasha entity_id — kafel nigdy nie
//     jest pusty.
//
// Dlaczego 2 i 3 są synchroniczne i NIE trafiają do cache: dawniej kafel
// do czasu odpowiedzi REST rysował się jako „bez grafiki" (kolor akcentu,
// ikona na środku), a po odpowiedzi przeskakiwał na gradient z nazwą na
// dole — popup przy każdym pierwszym otwarciu widocznie „skakał". Teraz
// pierwszy kadr ma już układ gradientu z kolorów na żywo, a odpowiedź
// REST zmienia co najwyżej odcienie. Kolory na żywo idą też za światłami.

import type { HomeAssistant } from './types.js';
import { lightColorOf } from './tile-data.js';
import { hslToRgbStr, seedOf, type SceneColors } from './scene-gradient.js';

/** Ile zapytań o config scen naraz — reszta czeka w kolejce. */
export const SCENE_FETCH_CONCURRENCY = 2;

/**
 * Jak długo wynik z sessionStorage uznajemy za świeży (bez ponownego
 * pytania). Starszy dalej rysuje pierwszy kadr, ale raz na załadowanie
 * strony jest odświeżany — edycja sceny w HA w końcu dociera do kafla.
 */
export const SCENE_CACHE_TTL_MS = 30 * 60 * 1000;

/** Klucz sessionStorage — jeden wpis na całą kartę, nie po jednym na scenę. */
export const SCENE_STORAGE_KEY = 'stratum-scene-colors';

/** Kolory z obiektu `entities` configu sceny (ścieżka 1). */
export function sceneColorsFromConfig(cfg: unknown): SceneColors | null {
  const entities =
    typeof cfg === 'object' && cfg !== null
      ? (cfg as { entities?: unknown }).entities
      : undefined;
  if (typeof entities !== 'object' || entities === null) return null;
  const colors: string[] = [];
  let briSum = 0;
  let briN = 0;
  for (const [id, raw] of Object.entries(entities as Record<string, unknown>)) {
    if (!id.startsWith('light.')) continue;
    const attrs =
      typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)
        : { state: raw };
    if (attrs.state === 'off') continue;
    const color = lightColorOf({ state: 'on', attributes: attrs });
    if (color && !colors.includes(color)) colors.push(color);
    const b = attrs.brightness;
    if (typeof b === 'number') {
      briSum += Math.max(0, Math.min(255, b));
      briN += 1;
    }
  }
  if (colors.length === 0) return null;
  return { colors, bri: briN > 0 ? briSum / briN / 255 : 1 };
}

/** Ścieżki 2 + 3: zawsze coś zwraca, bez sieci. */
export function liveSceneColors(
  hass: HomeAssistant | undefined,
  entityId: string,
): SceneColors {
  const members = hass?.states?.[entityId]?.attributes?.entity_id;
  if (Array.isArray(members)) {
    const colors: string[] = [];
    let briSum = 0;
    let briN = 0;
    for (const id of members) {
      if (typeof id !== 'string' || !id.startsWith('light.')) continue;
      const color = lightColorOf(hass?.states?.[id]);
      if (color && !colors.includes(color)) colors.push(color);
      const b = hass?.states?.[id]?.attributes?.brightness;
      if (typeof b === 'number') {
        briSum += Math.max(0, Math.min(255, b));
        briN += 1;
      }
    }
    if (colors.length > 0) {
      return { colors, bri: briN > 0 ? briSum / briN / 255 : 1 };
    }
  }
  const h = seedOf(entityId) % 360;
  return {
    colors: [hslToRgbStr(h, 0.5, 0.58), hslToRgbStr((h + 42) % 360, 0.45, 0.52)],
    bri: 1,
  };
}

/** Wycinek Storage, którego używamy — w testach podmieniany na Mapę. */
export interface SceneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Entry {
  /** null = config czytelny, ale bez kolorów świateł (albo 404). */
  data: SceneColors | null;
  at: number;
  /** Tylko w pamięci: błąd sieci — nie zapisujemy, nie ponawiamy do przeładowania. */
  transient?: boolean;
}

interface Persisted {
  v: 1;
  /** Chwila odmowy 401/403 — od niej nie pytamy o żadną scenę. */
  denied?: number;
  scenes?: Record<string, { c?: string[]; b?: number; at: number }>;
}

export interface SceneConfigColorsOptions {
  /** Funkcja, nie obiekt: sessionStorage potrafi rzucić przy samym dostępie. */
  storage?: () => SceneStorage | undefined;
  now?: () => number;
  concurrency?: number;
  ttlMs?: number;
}

/**
 * Cache ścieżki 1 + kolejka zapytań. Moduł trzyma jedną instancję, żeby
 * kilka pasków scen (belka piętra + popupy) nie pytało o to samo.
 *
 * - Bramka admina: `user.is_admin === false` nie pyta w ogóle (ten sam
 *   warunek co krótkofalówka w stratum-room-tile).
 * - 401/403 = brak uprawnień dla WSZYSTKICH scen, nie dla jednej: jedna
 *   odmowa wyłącza ścieżkę 1 na resztę sesji (zapis w sessionStorage, więc
 *   także po przeładowaniu WebView w aplikacji). Dawniej nie-admin dostawał
 *   serię 401 przy każdym załadowaniu dashboardu.
 * - Co najwyżej `concurrency` zapytań naraz — przez Nabu Casa każde kosztuje
 *   100–400 ms i konkuruje ze zdjęciami scen.
 * - Słuchacze dostają JEDNO powiadomienie po opróżnieniu kolejki, nie po
 *   każdej odpowiedzi — dawniej każda odpowiedź to osobny render paska.
 */
export class SceneConfigColors {
  private readonly _mem = new Map<string, Entry>();
  /** Sceny sprawdzone (albo w drodze) w tym załadowaniu strony. */
  private readonly _checked = new Set<string>();
  private readonly _queue: Array<{ sceneId: string; hass: HomeAssistant }> = [];
  private readonly _listeners = new Set<() => void>();
  private _active = 0;
  /** Zmieniły się kolory — paski trzeba przerysować. */
  private _changed = false;
  /** Zmieniło się coś do zapisania (choćby sam znacznik czasu). */
  private _dirty = false;
  private _denied?: number;
  private _loaded = false;
  private readonly _now: () => number;
  private readonly _concurrency: number;
  private readonly _ttl: number;

  constructor(private readonly _opts: SceneConfigColorsOptions = {}) {
    this._now = _opts.now ?? (() => Date.now());
    this._concurrency = Math.max(1, _opts.concurrency ?? SCENE_FETCH_CONCURRENCY);
    this._ttl = _opts.ttlMs ?? SCENE_CACHE_TTL_MS;
  }

  /** Kolory z configu sceny, jeśli już je znamy (także z poprzedniej sesji). */
  public get(hass: HomeAssistant | undefined, entityId: string): SceneColors | undefined {
    const sceneId = sceneIdOf(hass, entityId);
    if (!sceneId) return undefined;
    this._load();
    return this._mem.get(sceneId)?.data ?? undefined;
  }

  /** Czy ścieżka 1 w ogóle ma sens dla tego użytkownika. */
  public canFetch(hass: HomeAssistant | undefined): boolean {
    if (!hass?.fetchWithAuth || hass.user?.is_admin === false) return false;
    this._load();
    return !this._isDenied();
  }

  /** Dokłada do kolejki sceny, których jeszcze nie sprawdziliśmy. */
  public request(hass: HomeAssistant | undefined, entityIds: readonly string[]): void {
    if (!hass || !this.canFetch(hass)) return;
    const now = this._now();
    for (const entityId of entityIds) {
      const sceneId = sceneIdOf(hass, entityId);
      if (!sceneId || this._checked.has(sceneId)) continue;
      const known = this._mem.get(sceneId);
      // Świeży wynik z poprzedniego załadowania — nie pytamy drugi raz.
      if (known && !known.transient && now - known.at < this._ttl) {
        this._checked.add(sceneId);
        continue;
      }
      this._checked.add(sceneId);
      this._queue.push({ sceneId, hass });
    }
    this._pump();
  }

  public subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => {
      this._listeners.delete(fn);
    };
  }

  /** Ile zapytań jest teraz w locie (do testów i pomiarów). */
  public get inflight(): number {
    return this._active;
  }

  private _isDenied(): boolean {
    return this._denied !== undefined && this._now() - this._denied < this._ttl;
  }

  private _pump(): void {
    while (this._active < this._concurrency && this._queue.length > 0) {
      const job = this._queue.shift()!;
      // Odmowa z innego zapytania przyszła, gdy to czekało w kolejce.
      if (this._isDenied()) continue;
      this._active += 1;
      void this._fetch(job.sceneId, job.hass).finally(() => {
        this._active -= 1;
        this._pump();
        this._maybeSettle();
      });
    }
    this._maybeSettle();
  }

  private _maybeSettle(): void {
    if (this._active > 0 || this._queue.length > 0) return;
    if (this._dirty) {
      this._dirty = false;
      this._save();
    }
    if (!this._changed) return;
    this._changed = false;
    for (const fn of [...this._listeners]) fn();
  }

  private async _fetch(sceneId: string, hass: HomeAssistant): Promise<void> {
    const fetcher = hass.fetchWithAuth;
    if (!fetcher) return;
    const prev = this._mem.get(sceneId)?.data;
    let next: Entry;
    try {
      const resp = await fetcher(`/api/config/scene/config/${encodeURIComponent(sceneId)}`);
      if (resp.status === 401 || resp.status === 403) {
        // Brak uprawnień dotyczy całego endpointu — kolejka staje.
        this._denied = this._now();
        this._queue.length = 0;
        this._dirty = true;
        return;
      }
      if (!resp.ok) {
        // 404 = scena usunięta/przemianowana; 5xx traktujemy jak sieć.
        next =
          resp.status === 404
            ? { data: null, at: this._now() }
            : { data: null, at: this._now(), transient: true };
      } else {
        next = { data: sceneColorsFromConfig(await resp.json()), at: this._now() };
      }
    } catch {
      // Sieć / zerwane połączenie — w tym załadowaniu strony nie ponawiamy,
      // ale też nie zapisujemy: następne otwarcie dashboardu spróbuje znów.
      next = { data: null, at: this._now(), transient: true };
    }
    // Wynik przejściowy nie kasuje dobrych kolorów z poprzedniej sesji.
    if (next.transient && prev) return;
    this._mem.set(sceneId, next);
    if (!next.transient) this._dirty = true;
    if (!sameColors(prev ?? null, next.data)) this._changed = true;
  }

  private _storage(): SceneStorage | undefined {
    try {
      return this._opts.storage?.();
    } catch {
      return undefined;
    }
  }

  private _load(): void {
    if (this._loaded) return;
    this._loaded = true;
    let raw: string | null = null;
    try {
      raw = this._storage()?.getItem(SCENE_STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as Persisted;
      if (p?.v !== 1) return;
      if (typeof p.denied === 'number') this._denied = p.denied;
      for (const [id, e] of Object.entries(p.scenes ?? {})) {
        if (typeof e?.at !== 'number') continue;
        const data =
          Array.isArray(e.c) && e.c.length > 0 && e.c.every((c) => typeof c === 'string')
            ? { colors: e.c, bri: typeof e.b === 'number' ? e.b : 1 }
            : null;
        this._mem.set(id, { data, at: e.at });
      }
    } catch {
      // Uszkodzony wpis — zaczynamy od zera, sieć go nadpisze.
    }
  }

  private _save(): void {
    const scenes: Persisted['scenes'] = {};
    for (const [id, e] of this._mem) {
      if (e.transient) continue;
      scenes[id] = e.data ? { c: e.data.colors, b: e.data.bri, at: e.at } : { at: e.at };
    }
    const p: Persisted = { v: 1, scenes };
    if (this._denied !== undefined) p.denied = this._denied;
    try {
      this._storage()?.setItem(SCENE_STORAGE_KEY, JSON.stringify(p));
    } catch {
      // Tryb prywatny / pełny magazyn — cache zostaje tylko w pamięci.
    }
  }
}

function sceneIdOf(hass: HomeAssistant | undefined, entityId: string): string | undefined {
  const id = hass?.states?.[entityId]?.attributes?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function sameColors(a: SceneColors | null, b: SceneColors | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.bri === b.bri &&
    a.colors.length === b.colors.length &&
    a.colors.every((c, i) => c === b.colors[i])
  );
}
