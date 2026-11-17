// Lokalizacja edytorów — osobne wejście, żeby napisy edytorów (editor-pl.ts,
// editor-en.ts) importowały WYŁĄCZNIE edytory. Runtime karty (dashboard)
// woła localize() z localize.ts i nie ciągnie ~54 KB tekstów, których nie
// pokazuje. Dziś bundle jest jednym plikiem (ADR-005), więc bajty jeszcze
// się nie zmieniają; podział jest pod PKG-3 (v1.110.0): edytory ładowane
// na żądanie zabiorą swoje słowniki ze sobą bez dalszych zmian.
//
// Klucze edytora zachowują pełną ścieżkę `editor.…`, więc teksty w kodzie
// czyta się tak samo jak dotąd, a `localizeUi` przyjmuje też zwykłe klucze
// karty (`common.close`, `sections.lights`) — edytory mieszają oba rodzaje.

import {
  langOf,
  localize,
  translate,
  type KeysOf,
  type Lang,
  type LangSource,
  type MessageKey,
  type Shape,
  type Vars,
} from './localize.js';
import { editorPl } from './editor-pl.js';
import { editorEn } from './editor-en.js';

export type EditorMessages = Shape<typeof editorPl>;

/** Klucze edytora z prefiksem: `'editor.rooms.labels.name'`. */
export type EditorKey = `editor.${KeysOf<EditorMessages>}`;

/** Dowolny klucz, którego może użyć edytor: karty albo edytora. */
export type UiKey = MessageKey | EditorKey;

const EDITOR_DICTS: Record<Lang, EditorMessages> = { pl: editorPl, en: editorEn };
const PREFIX = 'editor.';

/** Cały słownik edytora — do lookupów po kluczu z danych (typ chipa, preset). */
export function editorMessages(src: LangSource): EditorMessages {
  return EDITOR_DICTS[langOf(src)];
}

/** Napis dla klucza karty albo edytora; te same zasady co localize(). */
export function localizeUi(src: LangSource, key: UiKey, vars?: Vars): string {
  if (!key.startsWith(PREFIX)) return localize(src, key as MessageKey, vars);
  const lang = langOf(src);
  return translate(lang, EDITOR_DICTS[lang], editorPl, key.slice(PREFIX.length), key, vars);
}
