// Lokalizacja karty — czyste funkcje, bez Lita i bez DOM-u (testy
// w tests/localize.test.ts).
//
// Dlaczego słowniki w TS (`pl.ts`, `en.ts`), a nie JSON: rollup nie ma
// pluginu JSON, a dokładanie zależności dla kilkuset napisów łamie regułę
// „bundle mały, zero nowych zależności". TS daje do tego coś, czego JSON
// nie da: `en.ts` jest typowany kształtem `pl.ts`, więc brak klucza po
// angielsku to błąd kompilacji, nie pusty napis u użytkownika.
//
// Wybór języka: polski jest bazą (użytkownik jest Polakiem, CLAUDE.md).
// Każdy inny język HA dostaje angielski — niemiecki użytkownik lepiej
// zrozumie „Close" niż „Zamknij". Brak języka (karta przed pierwszym
// `hass`, podgląd bez profilu) = polski.

import { pl } from './pl.js';
import { en } from './en.js';

export type Lang = 'pl' | 'en';

/**
 * Formy liczby mnogiej. Polski: one (1) / few (2–4, ale nie 12–14) /
 * many (reszta). Angielski: one / other. Kategorie jak w CLDR, więc
 * `Intl.PluralRules` wybiera je bez tłumaczenia.
 */
export interface PluralForms {
  one: string;
  few?: string;
  many?: string;
  other?: string;
}

/**
 * Kształt słownika wyprowadzony z `pl.ts`: liście to napisy albo formy
 * liczby mnogiej (obiekt z `one`), reszta to zagnieżdżone grupy. Literały
 * z `pl` są poszerzane do `string`, żeby `en` mogło mieć inne słowa.
 */
type Shape<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends { one: string }
    ? PluralForms
    : Shape<T[K]>;
};

export type Messages = Shape<typeof pl>;

/** Klucze kropkowe (`'card.expand'`) — tylko te, które istnieją w słowniku. */
type KeysOf<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends { one: string }
    ? `${P}${K}`
    : KeysOf<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = KeysOf<Messages>;

export type Vars = Record<string, string | number>;

/**
 * Źródło języka: obiekt `hass` (albo jego wycinek), sam kod języka, albo
 * nic. `locale.language` (HA ≥ 2022.x) wygrywa nad starszym `language`.
 */
export type LangSource =
  | string
  | { language?: string; locale?: { language?: string } }
  | null
  | undefined;

const DICTS: Record<Lang, Messages> = { pl, en };

export function langOf(src: LangSource): Lang {
  const raw =
    typeof src === 'string' ? src : src?.locale?.language || src?.language;
  if (!raw) return 'pl';
  return raw.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

/** Cały słownik — do lookupów po kluczu z danych (typ chipa, klasa alarmu). */
export function messages(src: LangSource): Messages {
  return DICTS[langOf(src)];
}

/**
 * Język dokumentu — dla napisów powstających zanim karta dostanie `hass`
 * (wpis w katalogu kart, błąd `setConfig`). HA ustawia `<html lang>` na
 * język profilu przy starcie frontendu.
 */
export function docLanguage(): string | undefined {
  try {
    return typeof document !== 'undefined'
      ? document.documentElement?.lang || undefined
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Kategoria liczby mnogiej. Najpierw `Intl.PluralRules` (zna CLDR dla
 * obu języków), bez niego — deterministyczna reguła poniżej, ta sama co
 * w CLDR dla liczb całkowitych.
 */
export function pluralCategory(lang: Lang, n: number): keyof PluralForms {
  const intl = intlRules(lang);
  if (intl) {
    const cat = intl.select(n);
    if (cat === 'one' || cat === 'few' || cat === 'many' || cat === 'other') return cat;
  }
  return pluralCategoryFallback(lang, n);
}

/** Reguła bez Intl. Ułamki: PL `other`, EN `other` (jak CLDR). */
export function pluralCategoryFallback(lang: Lang, n: number): keyof PluralForms {
  const abs = Math.abs(n);
  if (!Number.isInteger(abs)) return 'other';
  if (lang === 'en') return abs === 1 ? 'one' : 'other';
  if (abs === 1) return 'one';
  const d = abs % 10;
  const dd = abs % 100;
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return 'few';
  return 'many';
}

const intlCache = new Map<Lang, Intl.PluralRules | null>();
function intlRules(lang: Lang): Intl.PluralRules | null {
  if (!intlCache.has(lang)) {
    let rules: Intl.PluralRules | null = null;
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function') {
        rules = new Intl.PluralRules(lang);
      }
    } catch {
      rules = null;
    }
    intlCache.set(lang, rules);
  }
  return intlCache.get(lang) ?? null;
}

/**
 * Forma dla kategorii. Brakująca forma spada na `other` → `many` → `one`
 * — nigdy pusty napis (np. PL nie ma osobnego `other` dla ułamków).
 */
export function pickPlural(lang: Lang, forms: PluralForms, n: number): string {
  const cat = pluralCategory(lang, n);
  return forms[cat] ?? forms.other ?? forms.many ?? forms.one;
}

/** Podstawia `{nazwa}`; nieznane zostawia, żeby błąd był widoczny. */
export function interpolate(text: string, vars: Vars): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m,
  );
}

function resolve(dict: Messages, key: string): string | PluralForms | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    // hasOwnProperty: klucz „constructor" nie może trafić w prototyp.
    if (!Object.prototype.hasOwnProperty.call(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object' && 'one' in node) return node as PluralForms;
  return undefined;
}

/**
 * Napis dla klucza. Formy liczby mnogiej wybiera `vars.count`. Ścieżka
 * awaryjna: brak w słowniku języka → polski → sam klucz (widoczny, ale
 * nigdy wyjątek ani pusty element).
 */
export function localize(src: LangSource, key: MessageKey, vars?: Vars): string {
  const lang = langOf(src);
  const entry = resolve(DICTS[lang], key) ?? resolve(pl as Messages, key);
  if (entry === undefined) return key;
  const text =
    typeof entry === 'string'
      ? entry
      : pickPlural(lang, entry, Number(vars?.count ?? 0));
  return vars ? interpolate(text, vars) : text;
}

/**
 * Lookup w grupie po kluczu z danych (typ chipa, klasa urządzenia, typ
 * akcji). `undefined`, gdy klucza nie ma — wywołujący decyduje o fallbacku.
 */
export function lookup(
  group: Readonly<Record<string, string>>,
  key: string | undefined,
): string | undefined {
  if (!key || !Object.prototype.hasOwnProperty.call(group, key)) return undefined;
  return group[key];
}
