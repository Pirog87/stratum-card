# Reguły projektu — stratum-card

Ten plik czytasz na starcie każdej sesji. Jest priorytetowy nad Twoimi
ogólnymi skłonnościami.

## Co budujemy

Customowa karta Lovelace dla Home Assistant. Pokazuje podsumowanie area
(strefy) z rozwijaną listą pomieszczeń. Priorytet: **customization** — użytkownik
ma mieć pełną kontrolę nad tym, które metryki się pokazują i jak wyglądają.

## Stos i konwencje

- **Język**: TypeScript (`strict: true`)
- **Framework**: Lit 3 (dekoratory, `@customElement`, `@property`, `@state`)
- **Bundler**: Rollup z pluginami `typescript`, `node-resolve`, `terser`
- **CSS**: Lit's `css` template tag (scoped do komponentu), **CSS variables**
  jako publiczne API stylizacji, `::part()` dla głębszej kustomizacji
- **Ikony**: MDI przez wbudowany `<ha-icon>` z HA (nie bundlujemy własnej biblioteki)
- **Testy**: Vitest (`npm test`) — czyste funkcje, bez DOM-u i bez Lita
- **Dystrybucja**: HACS. Jeden plik `dist/stratum-card.js`, dwa custom elementy
  (`stratum-card` + `stratum-room-card`) w jednym bundlu. Tag `vX.Y.Z` → GitHub
  Action buduje i podpina artefakt do release'u; HACS ciągnie asset z release'u.
- **Brak zależności runtime poza Lit.** Bundle ma być mały.

## Zasady kodu

1. **Jeden komponent = jeden plik.** `src/stratum-card.ts` to główna karta.
   Podkomponenty (chipy, editor, room-row) w osobnych plikach w `src/`.
2. **Typy** w `src/types.ts` — współdzielone interface'y (`StratumCardConfig`,
   `ChipConfig`, `HomeAssistant` stub).
3. **Lokalizacja** — teksty UI w `src/localize/pl.json` i `en.json`.
   Nigdy nie hardcoduj stringów user-facing w komponentach.
4. **Unit testy** — Vitest, `npm test`. Testujemy czyste funkcje (bez
   DOM/Lit) w `tests/`; helpery wymagające testów wydzielamy z komponentów
   do osobnych modułów (wzór: `scene-gradient.ts`). CI odpala testy przed
   buildem releasu.
5. **Nazwy plików**: kebab-case (`stratum-card.ts`, `chip-renderer.ts`).
6. **Klasa**: PascalCase (`StratumCard`, `ChipRenderer`).
7. **Nazwa custom elementu**: kebab-case, prefixed (`stratum-card`,
   `stratum-card-editor`, `stratum-card-chip`).
8. **Commity**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`).

## Dev loop

1. `npm run watch` — rollup w trybie watch, rebuild on save do `dist/`
2. Skopiuj `dist/stratum-card.js` do `/config/www/` w HA (symlink działa szybciej
   — patrz `docs/development.md`)
3. Ctrl+Shift+R w przeglądarce po każdej zmianie
4. DevTools Console — karta loguje swoją wersję przy starcie

Nie zakładaj że masz dostęp do żywej instancji HA — nie masz. Po zmianie
piszesz userowi: *„Zbuduj `npm run build`, skopiuj do www, odśwież — i powiedz
czy widać zmianę."*

## Roadmap — trzymaj się kolejności

Szczegóły w `docs/roadmap.md`. Krótko:

- **v0.1** ✅ Szkielet: header z nazwą area, placeholder chipów, toggle expandera
- **v0.2** Czytanie encji area z `hass.entities` + filtrowanie po typie
- **v0.3** Rendering chipów (lights on, motion, windows open) z configu
- **v0.4** Animacja expandera (CSS `max-height` transition)
- **v0.5** Lista pomieszczeń w body expandera — klikalna
- **v0.6** Tap na pomieszczenie → `navigate` lub `more-info` (configurable)
- **v0.7** Wizualny editor (`stratum-card-editor`) — no-code config w HA UI
- **v0.8** Customowe chipy — user definiuje entity/template/icon/color
- **v0.9** Stylizacja — pełna lista CSS vars, `::part`, kompat z `card-mod`
- **v1.0** Polish + dokumentacja + publikacja HACS

**Nie wyprzedzaj.** Implementacja v0.4 gdy user prosi o v0.2 to źle — użytkownik
traci kontrolę nad tempem i może nie zrozumieć co działa, a co nie.

## Style API — zasady długoterminowe

Od samego początku projektujemy tak, żeby **użytkownik mógł zmienić wygląd**:

1. **CSS variables** dla kolorów i wymiarów. Wszystkie mają prefix `--stratum-card-*`
   i fallback do zmiennych HA (`--ha-card-background` etc.).
2. **Shadow parts** (`part="card"`, `part="header"`, `part="chip"`) — pozwalają
   stylizować z zewnątrz przez `::part()`.
3. **Config-level overrides** — paleta, ikony, typografia configurowalne przez
   YAML, nie wymuszone z kodu.
4. **card-mod compat** — nie robimy niczego co blokowałoby card-mod (np.
   `delegatesFocus: true` na shadow root).

## Reguły wyglądu — obowiązujące w każdym nowym CSS

Te reguły są twarde. Jeśli któraś Ci przeszkadza w konkretnym przypadku,
napisz to userowi i zapytaj — nie omijaj po cichu.

### 1. Kolory wyłącznie przez zmienne CSS motywu HA

Karta ma wyglądać jak część motywu użytkownika, nie jak wyspa. Motyw HA
(Minimalist, Mushroom, Catppuccin, własny) ma móc ją przemalować bez
card-moda.

**Zero hexów w komponentach.** Każdy kolor to `var(--stratum-*, <fallback do
zmiennej HA>)`:

```css
/* ŹLE */
background: #1e1f22;
color: #ffc107;
border: 1px solid rgba(255, 255, 255, 0.08);

/* DOBRZE */
background: var(--stratum-surface-1);
color: var(--stratum-accent-lights);
border: 1px solid var(--stratum-line);
```

Zasady szczegółowe:

- **Baza to zmienne HA**: `--primary-color`, `--card-background-color`,
  `--ha-card-background`, `--primary-text-color`, `--secondary-text-color`,
  `--divider-color`, `--secondary-background-color`, `--error-color`,
  `--warning-color`, `--success-color`, `--state-*-color`.
- **Nasze zmienne mają prefix `--stratum-`** i domyślnie delegują do HA:
  `--stratum-accent: var(--primary-color)`. Użytkownik nadpisuje nasz token
  albo zmienia motyw — jedno i drugie działa.
- **Jedyne miejsce, gdzie wolno napisać hex**, to warstwa definicji tokenów
  (blok `:host`/`ha-card` z listą `--stratum-*`), jako ostatni fallback dla
  instalacji bez motywu. Nigdzie indziej. W regule `.player-btn` czy
  `.tile.on` hex jest błędem, nawet jako fallback w `var()`.
- **Nie buduj powierzchni z bieli.** `rgba(255,255,255,0.04)` to biały na
  białym w jasnym motywie HA — element znika. Powierzchnie wyprowadzaj z tła
  karty: `color-mix(in srgb, var(--card-background-color) 94%,
  var(--primary-text-color))`. To jedna zmiana, która naprawia jasny motyw.
- **`color-mix(in srgb, …)` zamiast osobnych odcieni.** Jeden token akcentu
  + `color-mix` na tinty, ramki i poświaty. Nie wprowadzaj drugiego czerwonego
  bo pierwszy był „za jasny".
- **Kolor ma jedno znaczenie.** Akcent = interakcja i focus. Żółty = światła.
  Czerwony = alarm. Szary = niedostępne. Jeśli potrzebujesz koloru na nową
  rzecz — najpierw sprawdź, czy nie da się użyć istniejącego znaczenia.

**Stan faktyczny (dług):** w `src/` jest dziś ~330 literałów hex, w tym 149 ×
`#ff9b42` i 138 × `rgba(255,255,255,…)`. Reguła obowiązuje bezwzględnie dla
nowego kodu; stare miejsca migrujemy przy okazji dotykania pliku, nie
wielkim bang-refactorem.

### 2. Container queries zamiast media queries

Karta Lovelace nie wie, jaki jest viewport — wie tylko, ile dostała miejsca.
Ta sama karta stoi w kolumnie 300 px na telefonie i 900 px w sections view.
`@media (max-width: 480px)` mierzy złą rzecz.

```css
/* ŹLE */
@media (max-width: 480px) { .tiles { grid-template-columns: 1fr; } }

/* DOBRZE */
:host { container-type: inline-size; }
@container (max-width: 480px) { .tiles { grid-template-columns: 1fr; } }
```

- Kontener deklaruj na `:host` albo na `ha-card` (`container-type: inline-size`).
- Nazywaj kontenery, gdy zagnieżdżasz (`container-name: stratum-room`), i
  odwołuj się po nazwie — inaczej trafisz w najbliższy przodek, nie w ten,
  o który Ci chodziło.
- **Wyjątek: `prefers-reduced-motion` i `prefers-color-scheme` zostają
  media queries.** To zapytania o preferencje użytkownika, nie o rozmiar —
  container query ich nie obsłuży.
- **Container query zastępuje ręczne mierzenie.** W `stratum-card-room-row.ts`
  jest `ResizeObserver` liczący `narrow_mode` — to obejście z czasów przed
  container queries. Nowego takiego nie dodawaj; ResizeObserver zostaje tylko
  tam, gdzie potrzebna jest wartość w JS (np. próg przekazywany do logiki
  renderu), nie do samego przełączania stylów.

### 3. Stany interaktywne — komplet, nie tylko hover

Każdy element klikalny ma **cztery** stany. Brak któregokolwiek to bug,
nie „polish na później".

| Stan | Reguła |
|---|---|
| `:hover` | Tylko wizualna zapowiedź. Nigdy jedyny nośnik informacji — na dotyku nie istnieje. Zmiana tła/jasności, nie przesunięcie treści. |
| `:focus-visible` | **Zawsze widoczny obrys.** `outline: 2px solid var(--stratum-focus)` + `outline-offset`. Nigdy `outline: none` bez podania zamiennika w tej samej regule. |
| `:active` | Natychmiastowy feedback dotyku: `transform: scale(0.96–0.98)`. Krótki (≤ 120 ms). |
| `:disabled` / `[disabled]` | `opacity: ~0.5`, `cursor: default`, **brak** reakcji hover — pisz `:hover:not(:disabled)`, nie samo `:hover`. |

Dodatkowo:

- **Nie mieszaj hover z focus w jednej regule.** W `stratum-room-tile.ts` jest
  `.tile:hover, .tile:focus-visible { … outline: none; }` — to kasuje obrys
  fokusa dla klawiatury. Tak nie robimy; to miejsce jest do naprawy.
- **Encja niedostępna to stan wizualny, nie znikanie.** Wzorzec jest już
  ustalony (`.off-pill` + przekreślony okrąg ikony w `room-row` i `room-tile`)
  — używaj go, nie wymyślaj drugiego.
- **`cursor: pointer` tylko gdy element naprawdę reaguje.** Wiersz niekliklany
  nie udaje przycisku.
- Element klikalny to `<button>` albo ma `role="button"` + `tabindex="0"` +
  obsługę Enter/Space. `aria-expanded` na expanderach, `aria-checked` na
  przełącznikach, `aria-label` gdy jedyną treścią jest ikona,
  `aria-hidden="true"` na ikonach dekoracyjnych.

### 4. Ruch — zawsze z furtką

- Każda animacja i tranzycja musi mieć wyłącznik:

```css
@media (prefers-reduced-motion: reduce) {
  .foo { animation: none; transition: none; }
}
```

- To dotyczy też `transform` na `:hover`/`:active` — użytkownik z reduced
  motion nie chce, żeby karta skakała pod palcem.
- Animuj `opacity` i `transform`. Nie animuj `width`/`height`/`top`/`left`
  (layout thrash). Wyjątek już w kodzie: `width` na paskach wypełnienia
  (`.fill`, `.glight-fill`) — to świadoma decyzja, bo pasek *jest* szerokością.
- Expander rozwijaj przez `grid-template-rows: 0fr → 1fr` (wzór już w
  `stratum-card-styles.ts`), nie przez `max-height` z magiczną liczbą.
- Czasy: mikro-feedback 80–150 ms, tranzycja stanu 150–250 ms, rozwijanie
  ~280 ms. Nic dłuższego bez uzasadnienia.
- Animacja niesie znaczenie albo jej nie ma. Pulsowanie = alarm wymagający
  reakcji. Nie dekorujemy ruchem.

### 5. Tokeny wymiarów — skala, nie chmura wartości

- **Typografia**: sześć stopni, trzy role — `label` (mikro, uppercase,
  `letter-spacing`), `body`, `display`. Maksymalnie trzy grubości.
  Nie dodawaj rozmiaru różniącego się o 0.5 px od istniejącego — to niewidoczne,
  a rozwala rytm. (Dziś w kodzie jest 15 rozmiarów i 5 grubości, w tym `650`,
  którego większość fontów nie ma. To dług.)
- **Promienie**: cztery wartości — pigułka (`999px`), kafel, kontener, hairline.
  Sąsiadujące kafle muszą mieć ten sam promień. (Dziś: 14 wartości.)
- **Odstępy**: krok 4 px. `gap`/`padding` z tej siatki, nie „7 px bo pasowało".
- **Liczby w UI**: `font-variant-numeric: tabular-nums` wszędzie, gdzie wartość
  się zmienia w miejscu (temperatura, %, licznik) — inaczej tekst drga.

## Konwencje z istniejącego kodu

Tak ten projekt jest napisany. Trzymaj się tego, zamiast wprowadzać własny styl.

### Struktura komponentu

- `@customElement('stratum-…')`, `LitElement`, na końcu pliku
  `declare global { interface HTMLElementTagNameMap { … } }` — zawsze.
- `@property({ attribute: false }) public hass?: HomeAssistant` — `hass` nigdy
  nie jest atrybutem.
- `@property({ type: Boolean, reflect: true })` gdy stan ma być stylowalny
  z zewnątrz przez `:host([foo])` (wzór: `clickable`, `active` w
  `stratum-card-chip.ts`).
- Duże komponenty trzymają CSS w osobnym pliku `*-styles.ts` eksportującym
  `css\`…\`` (`stratum-card-styles.ts`, `stratum-room-card-styles.ts`,
  `editor-shared-styles.ts`). Małe — `static styles` w pliku komponentu.
  Próg: gdy plik komponentu przekracza ~800 linii, wydziel style.

### Importy

- Zawsze rozszerzenie `.js` w ścieżkach lokalnych (`'./types.js'`) — ESM.
- `import type { … }` dla typów, `import { customElement } from
  'lit/decorators.js'`.
- Typy współdzielone wyłącznie z `src/types.ts`. Nie duplikuj interface'ów.

### Stylizacja jako publiczne API

- `part="…"` na każdym elemencie, który ktoś może chcieć przestylizować
  z zewnątrz. Nowy element w renderze → nowy `part` → wpis w `docs/styling.md`.
- Nowa zmienna CSS → wpis w tabeli w `docs/styling.md`. Bez wpisu zmienna nie
  istnieje dla użytkownika.
- Wartości sterowane configem (kolumny, aspect, offsety) idą przez `style=`
  inline jako CSS variables, nie przez generowanie klas.

### Komentarze i język

- Komentarze po polsku, wyjaśniają **dlaczego**, nie co. Wzór z kodu:
  *„min-width: 0 jest kluczowe — bez tego flex nie pozwala się skurczyć
  i długa nazwa piętra rozpycha nagłówek poza kartę."* Tak piszemy.
- Obejścia i decyzje nieoczywiste (fallback chain dla nie-adminów, przekodowanie
  WAV, winieta scen) mają blok komentarza z uzasadnieniem. Nie usuwaj ich.
- Teksty user-facing wyłącznie z `src/localize/pl.json` / `en.json`.

### Fallback chains

Dane z HA bywają niedostępne (uprawnienia, YAML zamiast UI, brak encji).
Wzór z `stratum-scene-bar.ts`: ścieżka najlepsza → przybliżenie → deterministyczny
default, każda opisana komentarzem. Nigdy pusty ekran, nigdy rzucony wyjątek
do użytkownika.

### Commity

Conventional Commits + zakres + wersja w nawiasie, po polsku:

```
feat(media): panel „Źródło" — wejścia TV i tryb dźwięku (pkt 3 makiety, v1.100.0)
fix(intercom): przekodowanie nagrania do WAV PCM — cisza na Cast/TV (v1.97.1)
```

Bump wersji w `package.json` idzie w tym samym commicie co zmiana.

## Rzeczy których NIE robisz

1. Nie dodajesz runtime dependency bez rozmowy (Lit + tslib wystarczą długo).
2. Nie używasz `innerHTML` / `unsafeHTML` bez ekstremalnego uzasadnienia.
3. Nie bundlujesz assetów innych niż JS (ikony MDI są globalne w HA).
4. Nie wymyślasz nowego formatu config — patrz typy w `src/types.ts`.
5. Nie piszesz "this should work" — buildujesz, testujesz (w granicach środowiska).
6. Nie commitujesz do `main` bez commita z message zgodnym z Conventional Commits.

## Workflow sesji

1. Odczytaj aktualny kod (`view` na pliki które modyfikujesz)
2. Odczytaj `docs/roadmap.md` — sprawdź na którym milestonie jesteśmy
3. Zaplanuj zmianę w 1–2 zdaniach
4. Wprowadź, `npm run build` w terminalu, sprawdź czy się buildu
5. Powiedz userowi co zrobiłeś i jak to przetestować
6. Commituj (Conventional Commits) po ack userze

## Specyfika użytkownika (Asseco Poland)

- Dom: Parter / Piętro / Ogród — patrz `examples/dom-example.yaml`
- Stos: Mushroom + Bubble Card + card-mod (istniejące karty zostają,
  ta karta jest dodatkiem, nie zamiennikiem)
- Priorytet mobilka — desktop jest secondary use case
- Język UI: polski (`src/localize/pl.json` ma pierwszeństwo)

## Wersjonowanie

Semver. Tag `v0.1.0`, `v0.2.0` etc. Minor bump przy każdym ukończonym
milestone. Patch gdy bugfix. Major na v1.0 przy stabilnym API.

Release: push taga → GitHub Action buildu + attach `dist/stratum-card.js` jako asset.
