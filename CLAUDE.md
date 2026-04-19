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
- **Brak zależności runtime poza Lit.** Bundle ma być mały.

## Zasady kodu

1. **Jeden komponent = jeden plik.** `src/stratum-card.ts` to główna karta.
   Podkomponenty (chipy, editor, room-row) w osobnych plikach w `src/`.
2. **Typy** w `src/types.ts` — współdzielone interface'y (`StratumCardConfig`,
   `ChipConfig`, `HomeAssistant` stub).
3. **Lokalizacja** — teksty UI w `src/localize/pl.json` i `en.json`.
   Nigdy nie hardcoduj stringów user-facing w komponentach.
4. **Unit testy** — na razie brak (v0.x). Od v0.7+ dodajemy Vitest.
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
