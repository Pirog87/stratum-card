# Changelog

Wszystkie znaczące zmiany projektu. Format zgodny z
[Keep a Changelog](https://keepachangelog.com/), wersjonowanie
[SemVer](https://semver.org/).

## [1.21.0] — 2026-04-20

### Changed
- **Rozdzielona konfiguracja wyglądu dla wiersza i kafla.** Nowe klucze
  top-level `row_config` i `tile_config` (oba schema `TileDisplayConfig`).
  Reguły warunkowe `conditions` przeniesione na top-level (wspólne dla
  obu form). Dotychczasowe `display_config` jest automatycznie migrowane
  przy pierwszym zapisaniu (backward-compat).
- Edytor „Wygląd — Wiersz" pokazuje tylko pola istotne dla formy
  kompaktowej (bez `aspect`, `background_image`, `icon_position`).
  Edytor „Wygląd — Kafel" ma pełny zestaw.
- Nowa struktura paneli edytora:
  1. Karta (podstawy + zachowanie)
  2. Wygląd — Wiersz
  3. Wygląd — Kafel
  4. Warunki stylu
  5. Pomieszczenia
  6. Sceny

### Fixed
- **Podgląd karty nie zwija się przy każdej edycji.** `setConfig`
  zachowuje stan `_expanded` między re-renderami edytora — resetuje tylko
  gdy config explicit zmienia flagę `expanded` albo przy pierwszym setConfig.

### Migration
Stare YAML działa bez zmian — migracja zachodzi automatycznie w runtime.
Przy pierwszej edycji w visual editorze config zostanie zapisany
w nowej strukturze (`display_config` usunięte, `row_config` + `tile_config`
+ top-level `conditions` wstawione).

## [1.20.0] — 2026-04-20

### Changed
- **Nowy edytor „Wygląd pomieszczeń" — full UX overhaul.** Zamiast wall-of-text
  inputów dostajesz:
  - **Pola** — rząd chipów z ikonami (klik = toggle)
  - **Proporcje kafla** — preset chips (1:1, 4:3, 3:2, 16:9, 2:1) z miniaturą
    proporcji + pole „Niestandardowe"
  - **Kolor akcentu** — 8 swatch-chipów (amber/green/blue/red/purple/orange/
    teal/pink) + pole na custom hex/var
  - **Obrazek tła** — dropdown z 24 presetami scen (Stratum) + opcja Custom URL
  - **Wymiary** — trzy slidery z widocznymi wartościami live (px)
  - **Ikona** — slider rozmiaru + chipy stylu (bubble/flat/none) + **mini-grid
    3×2 do wyboru pozycji** (góra-lewo/prawo, środek, dół-lewo/prawo, inline)
  - **Reakcje na dotyk** — chipy efektu hover + slider press_scale
- Defaulty są widoczne w UI (14px/12px/110px/22px/0.98) ale zapisują się do
  YAML tylko gdy user zmienił wartość — czysty config.

### Internals
- Nowy komponent `stratum-display-editor` — samowystarczalny, używa tylko
  natywnych elementów (range/select/checkbox/text) stylowanych przez Lit CSS.
  Bez zależności od HA internals poza `ha-icon`.

## [1.19.0] — 2026-04-20

### Added
- **Warunki stylu zależne od encji** — nowe pole
  `display_config.conditions: DisplayConditionConfig[]`. Każda reguła łączy
  pole (temperatura/wilgotność/lights/motion/windows/doors) z operatorem
  (`any_on`, `none_on`, `count_gt`, `gt`, `lt`, `eq`) i overrides stylu
  (`accent_color`, `border_color`, `border_width`, `background_color`).
  Pierwsza spełniona reguła wygrywa.
- Nowy sub-editor `stratum-conditions-editor` — panel „Warunki — styl
  zależny od encji" w głównym edytorze. Dodawanie/usuwanie, zmiana
  kolejności, live podsumowanie per reguła.

### Examples
```yaml
type: custom:stratum-card
display_config:
  conditions:
    # czerwony border gdy jakiekolwiek okno otwarte
    - field: windows
      when: any_on
      border_color: '#e53935'
      border_width: 2
    # zielony akcent przy obecności
    - field: motion
      when: any_on
      accent_color: '#4caf50'
    # pomarańczowy akcent gdy temperatura > 25
    - field: temperature
      when: gt
      value: 25
      accent_color: '#ff9800'
```

## [1.18.0] — 2026-04-20

### Added
- **Prymitywy stylu w `display_config`** — pełna kontrola nad wyglądem
  wiersza/kafla z UI:
  - `border_radius` — zaokrąglenie rogów (0–40 px)
  - `padding` — wewnętrzny odstęp
  - `min_height` — minimalna wysokość kafla (wiersz ignoruje)
  - `icon_size` — rozmiar ikony MDI
  - `icon_style` — `bubble` (kółko z tłem), `flat` (sama ikona), `none`
  - `icon_position` — `top-left` / `top-right` / `bottom-left` /
    `bottom-right` / `center` / `left` (inline)
  - `hover_effect` — `none` / `subtle` / `lift` / `glow`
  - `press_scale` — skala podczas tap/click (0.9–1.0)
- Edytor: trzy nowe panele expandable w „Wygląd pomieszczeń" —
  „Wymiary i zaokrąglenia", „Ikona", „Reakcje na dotyk".

### Changed
- Wiersz (row) dostał efekty hover i press konfigurowalne tak samo jak kafel
  — do tej pory miał na sztywno zmianę tła.

## [1.17.0] — 2026-04-20

### Changed
- **Wygląd pozycji pomieszczeń skonfigurujesz raz dla całej karty.**
  Nowy klucz top-level `display_config` (`fields`, `aspect`, `accent_color`,
  `background_image`, `show_icon`, `show_name`) zastępuje dotychczasowy
  per-room `tile_config`. Obowiązuje zarówno dla wiersza (`row`) jak i
  kafla (`tile`) — obie formy honorują teraz tę samą listę pól.
- Per pomieszczenie zostały tylko trzy rzeczy:
  - `display` — `row` albo `tile`
  - opcjonalny `field_entities` — wskazanie konkretnej encji dla każdego
    pola (temperatura / wilgotność / światła / motion / okna / drzwi),
    zamiast domyślnego auto-discovery z area
  - opcjonalny `style_override` — surowy CSS wstrzykiwany do pozycji
- Wbudowana forma `row` pokazuje teraz te same pola co kafel zgodnie
  z `display_config.fields` (dotąd `row` miał twardy układ).
- Edytor: nowy panel „Wygląd pomieszczeń (globalny)" z ustawieniami.
  Per-pokój sub-form zredukowany do `display` + panel encji + panel CSS.

### Removed
- `RoomConfig.tile_config` — migracja do top-level `display_config`.
- `RoomConfig.tile_card_config` oraz opcja `display: custom:xxx` dla
  pojedynczego pomieszczenia — kafle w sekcjach popup nadal wspierają karty
  HACS (niezmienione).

### Migration
```yaml
# stare (≤ v1.16)
type: custom:stratum-card
rooms:
  - area_id: salon
    display: tile
    tile_config:
      aspect: 16/9
      fields: [temperature, lights, motion]
      accent_color: amber

# nowe (v1.17)
type: custom:stratum-card
display_config:            # JEDEN raz dla wszystkich pokoi
  aspect: 16/9
  fields: [temperature, lights, motion]
  accent_color: amber
rooms:
  - area_id: salon
    display: tile          # tylko forma
    field_entities:        # opcjonalnie
      temperature: sensor.salon_termometr_balkonowy
```

## [1.13.0] — 2026-04-20

### Added
- Pełny rewrite README.md z aktualną listą features
- Katalog `examples/` z trzema gotowymi konfiguracjami:
  - `parter-basic.yaml` — minimalistyczny floor
  - `parter-advanced.yaml` — merge + custom sections + sceny
  - `sypialnia-room.yaml` — standalone room card
- Ten `CHANGELOG.md` z historią wersji

## [1.12.0] — 2026-04-20

### Changed
- **Zunifikowany system wizualny** we wszystkich edytorach (floor, room,
  rooms, sections, scenes). Jeden wspólny plik `editor-shared-styles.ts`
  z prymitywami `.stratum-panel` / `.stratum-row` / `.stratum-toolbar` /
  `.stratum-badge` / `.stratum-icon-btn` / `.stratum-collapsible` itd.
- Panele z avatarami-ikonami (primary-color tinted), spójne nagłówki z hintami
- Jednolite wiersze list z animacjami (fade-in sub-form)
- Scene preset picker: większe miniatury (92px), glow ring przy selected

## [1.11.0] — 2026-04-20

### Added
- **Custom HACS cards w dropdown trybów wyświetlania** sekcji.
  Czyta `window.customCards` i oferuje wszystkie zainstalowane karty
  (mushroom, bubble, button-card, ...) do wyboru per sekcja
- `buildDefaultCustomConfig()` auto-konfiguruje child card z `entity` dla
  każdej encji sekcji (bubble-card dostaje też `card_type: button`)

## [1.10.0] — 2026-04-20

### Added
- 10 nowych scene presets: sport / medytacja / gotowanie / goscie /
  gaming / ogrod / kapiel / muzyka / kawa / bezpieczenstwo (łącznie 24)

### Changed
- **Wszystkie 24 presety przeprojektowane** — viewBox 320:180, radialne
  gradienty, glow filter, rounded shapes, mniej kanciastych kształtów
- Default aspect sceny zmieniony z `1/1` na `16/9`
- Edytorskie miniatury również 16:9

## [1.9.0] — 2026-04-20

### Added
- **`bubble` mode** dla sekcji — duża ikona w kółku + label (mushroom-style)
- **`icon` mode** — sama ikona, kompaktowy flex-wrap (dla windows/doors
  zielony = zamknięte, czerwony = otwarte)
- **`ambient` mode dla lights** — tile zmienia kolor i jasność live wg
  `light.rgb_color` + `brightness`, slider `accent-color` matcha odcień
- `MODE_OPTIONS_BY_TYPE` rozszerzony: lights dostaje 6 opcji, covers 5

## [1.8.0] — 2026-04-20

### Added
- **Nowy typ sekcji `custom`** — dowolna karta HA/HACS jako sekcja popup,
  z `card:` config jako plain object
- `<ha-yaml-editor>` pod sub-formą sekcji `custom`

### Fixed
- **Entity filter fix**: gdy `section.entities` podane jawnie, bierzemy
  encje z `hass.entities` bez filtra area scope. Grupa / template bez
  `area_id` (np. `light.kuchnia_blat`) znowu się renderuje

## [1.7.0] — 2026-04-20

### Added
- **`chips` mode** dla sekcji — kompaktowy pasek pigułek, per-domain
  akcent (lights amber, windows red/green, ...)
- **`chips` mode dla summary** — pasek mini-pigułek z ikoną + wartością
- Dropdown „Tryb wyświetlania" pojawia się dla każdego typu sekcji

## [1.6.2] — 2026-04-20

### Fixed
- Popup renderuje się teraz jako fixed overlay div zamiast `<dialog>` —
  prawidłowe centrowanie w Shadow DOM HA, animacja pop-in, ESC/backdrop
  close

## [1.6.1] — 2026-04-20

### Fixed
- `tap_action: 'default'` z HA ui_action selektora traktowany jako
  fallback, nie jako jawna akcja. Klik w pokój bez configu otwiera popup

## [1.6.0] — 2026-04-20

### Added
- `docs/styling.md` — pełna dokumentacja CSS variables, shadow parts,
  8 gotowych snippetów card-mod
- README sekcja „Stylizacja" z linkiem

## [1.5.0] — 2026-04-20

### Added
- **Per-room popup configuration** w edytorze floor. Każdy pokój w
  edytorze rooms ma teraz collapsible:
  - „Sekcje popup pomieszczenia" (stratum-sections-editor inline)
  - „Sceny popup pomieszczenia" (stratum-scene-editor inline)
- `RoomConfig` rozszerzony o `sections` / `scenes` / `chips`

## [1.4.0] — 2026-04-20

### Added
- **14 wbudowanych grafik scen** jako inline SVG (data URI):
  jasne, noc, usypianie, czytanie, relaks, disco, nauka, tv, poranek,
  wieczor, kino, praca, romantyczne, impreza
- Picker galerii pod polem URL w sub-formie sceny

## [1.3.0] — 2026-04-20

### Added
- **`RoomSectionConfig`** — sekcje jako pełne obiekty z overrides
  (title, icon, entities, mode, columns, fields, hidden)
- **Nowa sekcja `summary`** z 8 polami (motion / occupancy / temperature /
  humidity / lights_on / windows_open / doors_open / battery_low / leak)
- **Slider mode** dla lights (brightness) i covers (position)
- `stratum-sections-editor` z dynamic subform per typ sekcji

## [1.2.0] — 2026-04-20

### Added
- **Pasek scen** w obu kartach — `SceneConfig` z entity / name / icon /
  image / color / tap_action
- Globalne: position / size / columns / aspect
- Full visual editor scen z drag&drop-friendly reorder

## [1.1.0] — 2026-04-20

### Added
- **Popup room-card przy klik wiersza** (nowy default)
- Fallback chain: per-room tap_action → global → popup
- `<dialog>`-based modal (zamieniony na div overlay w v1.6.2)

## [1.0.0] — 2026-04-20

### Added
- **`stratum-room-card`** — drugi card type z auto-generowanymi sekcjami
- Visual editor dla room-card
- Final polish CSS (spacing, mobile breakpoint)

## [0.10.0] — 2026-04-19

### Added
- **Merge rooms** — `merge_with` + `aggregate` w RoomConfig
- Primary row agreguje encje + liczniki ze wszystkich połączonych area

## [0.9.0] — 2026-04-19

### Added
- **Jawny `rooms` config** z per-room overrides
- `stratum-card-rooms-editor` z checkboxami + sub-formami

## [0.8.0] — 2026-04-19

### Added
- Custom chipy: `entity` / `filter` / `template` (live Jinja2 przez WebSocket)
- Semantyczne nazwy kolorów

## [0.7.0] — 2026-04-19

### Added
- Tap actions na wierszach pokoi (navigate / more-info / call-service / none)
- Placeholdery `{area_id}` / `{area_name}` w navigation_path

## [0.6.0] — 2026-04-19

### Added
- Animacja expandera (grid-template-rows transition)
- Lista pomieszczeń w body expandera

## [0.5.0] — 2026-04-19

### Added
- Default chipy w headerze (lights / motion / windows / doors)

## [0.4.0] — 2026-04-19

### Changed
- **Floor-first model** (HA 2024.3+) — `floor_id` jako primary, `area_id`
  jako alternatywa
- `HassFloor` typy + helpery `getAreasInFloor` / `getEntitiesInFloor`

## [0.3.0] — 2026-04-19

### Added
- Area entity helpers
- Visual editor (szkielet)
- Auto-release workflow (push to main → tag + release automatycznie)

## [0.1.0] — 2026-04-19

### Added
- Initial skeleton
- Podstawowy header z chipami (placeholder)
- Expander toggle
- CSS variables + shadow parts
