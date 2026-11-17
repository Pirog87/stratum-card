// Ochrona przed podwójnym załadowaniem bundla (PKG-6).
//
// Scenariusz z życia: w zasobach Lovelace zostaje dev-loopowe
// `/local/stratum-card.js` obok `/hacsfiles/stratum-card/stratum-card.js`.
// Druga kopia rzucała `NotSupportedError: "stratum-…" has already been used`
// już przy pierwszym `@customElement` — po cichu wygrywała ta, która
// załadowała się pierwsza (często stara), a baner drugiej nigdy się nie
// pokazywał.
//
// Dlaczego filtr na `define`, a nie `customElements.get` w każdym pliku:
// definicje robią dekoratory `@customElement` w ~30 modułach, ewaluowanych
// zanim kod wejścia w ogóle ruszy (importy ES są hoistowane). Jedyne miejsce,
// które biegnie PRZED nimi, to pierwszy import wejścia (boot-guard.ts).
// Filtr zakładamy tylko w kopii-duplikacie i tylko na czas jej synchronicznej
// ewaluacji — pierwsza kopia w ogóle nie dotyka globalnego rejestru.
//
// Moduł czysty: rejestr i magazyn wersji są wstrzykiwane, więc Vitest
// sprawdza go bez DOM-u.

import { localize, type LangSource } from './localize/localize.js';

/** Minimalny kształt CustomElementRegistry, którego potrzebujemy. */
export interface ElementRegistry {
  get(name: string): unknown;
  define(name: string, ctor: CustomElementConstructor, options?: ElementDefinitionOptions): void;
}

/**
 * Klucz wersji aktywnej kopii na `window`. Symbol.for — wspólny dla
 * wszystkich kopii bundla, a nie zaśmieca globalnej przestrzeni nazw.
 */
export const VERSION_KEY: symbol = Symbol.for('stratum-card.version');

/** Tag, po którym poznajemy, że karty są już zarejestrowane. */
export const SENTINEL_TAG = 'stratum-card';

/** Tylko nasze elementy są pomijane — cudze definicje przechodzą bez zmian. */
const GUARDED_PREFIX = 'stratum-';

export interface LoadGuard {
  /** true: inna kopia już zarejestrowała karty, ta niczego nie definiuje. */
  readonly duplicate: boolean;
  /** Wersja aktywnej kopii; undefined, gdy to kopia bez znacznika (starsza). */
  readonly activeVersion?: string;
  /** Zdejmuje filtr z `define`. Idempotentne, bezpieczne do wielokrotnego wołania. */
  release(): void;
}

export function installLoadGuard(
  registry: ElementRegistry,
  store: Record<symbol, unknown>,
  version: string,
): LoadGuard {
  if (!registry.get(SENTINEL_TAG)) {
    store[VERSION_KEY] = version;
    return { duplicate: false, release: () => {} };
  }

  const active = store[VERSION_KEY];
  const activeVersion = typeof active === 'string' ? active : undefined;
  const hadOwn = Object.prototype.hasOwnProperty.call(registry, 'define');
  const original = registry.define;
  let released = false;

  // Pomijamy KAŻDY `stratum-*`, nie tylko już zajęte: gdy aktywna jest
  // starsza kopia, nowe podkomponenty z tej kopii wymieszałyby wersje
  // w jednym drzewie. Spójnie stara > niespójnie pół na pół.
  const filtered: ElementRegistry['define'] = function (
    this: unknown,
    name,
    ctor,
    options,
  ) {
    if (!released && name.startsWith(GUARDED_PREFIX)) return;
    return original.call(this, name, ctor, options);
  };
  registry.define = filtered;

  return {
    duplicate: true,
    activeVersion,
    release() {
      if (released) return;
      released = true;
      // Ktoś mógł owinąć define po nas — wtedy nie zrywamy jego wrappera;
      // flaga `released` i tak wyłącza nasz filtr.
      if (registry.define !== filtered) return;
      if (hadOwn) registry.define = original;
      else delete (registry as { define?: unknown }).define;
    },
  };
}

/**
 * Komunikat do konsoli dla kopii-duplikatu. Czyta go użytkownik szukający
 * przyczyny „starej wersji", więc idzie w jego języku (`lang` — zwykle
 * `<html lang>`, bo przy ładowaniu bundla nie ma jeszcze `hass`).
 */
export function duplicateLoadNotice(
  activeVersion: string | undefined,
  thisVersion: string,
  lang?: LangSource,
): string {
  const active = activeVersion
    ? `v${activeVersion}`
    : localize(lang, 'console.older_copy');
  return localize(lang, 'console.duplicate_load', { active, version: thisVersion });
}

/**
 * Argumenty `console.info` dla banera — jeden dla obu kart, bo to jeden
 * bundle w jednej wersji. Kolory w stylach konsoli to nie CSS komponentu:
 * DevTools nie zna zmiennych motywu HA, więc literały są tu jedyną opcją.
 */
export function consoleBanner(version: string): [string, string, string] {
  return [
    `%c STRATUM %c v${version} · stratum-card + stratum-room-card `,
    'color: #fff; background: #ff9b42; padding: 2px 6px; border-radius: 3px 0 0 3px; font-weight: 500;',
    'color: #ff9b42; background: #1e1f22; padding: 2px 6px; border-radius: 0 3px 3px 0;',
  ];
}
