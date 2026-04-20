# Changelog

Wszystkie znaczące zmiany projektu. Format zgodny z
[Keep a Changelog](https://keepachangelog.com/), wersjonowanie
[SemVer](https://semver.org/).

## [1.29.0] — 2026-04-20

### Added
- **Nowy built-in chip `leak`** (wycieki). Zlicza sensory z
  `device_class: moisture`. Ikona `mdi:water-alert`, kolor czerwony
  (alarm). Dostępny w quick-pick menu edytora.

### Fixed
- **Chip `windows` i row-tile windows nie widziały `device_class: opening`.**
  Wiele sensorów Aqara / Xiaomi / Zigbee raportuje otwarcia jako generyczne
  `opening` zamiast `window`. Teraz chip zlicza oba device_class
  (window + opening), zdeduplikowane. Analogicznie `doors` obejmuje
  `door` + `garage_door`.
- **Toggle „Popup z listą po kliknięciu" pokazywał się jako OFF**
  gdy realnie był ON (default true). Edytor teraz materializuje
  default w ha-form data → toggle pokazuje rzeczywisty stan.
  Zapis do YAML dalej czysty (pomijamy `show_list: true` jako default).

## [1.28.0] — 2026-04-20

### Changed
- **Popup listy chipów grupuje teraz po pokojach.** Zamiast jednej sekcji
  „Światła · 13" widzisz pokoje: „Goścni · 2", „Korytarz parter · 1",
  „Schody · 10" itd. Każda grupa ma własny przycisk „Wyłącz" (wyłącza
  wszystkie kontrolowalne encje w tym pokoju).
- **Globalny „Wyłącz wszystkie"** przeniesiony do nagłówka popupu (obok ×).
- Items zmniejszone wizualnie: ikona 30 px, single-line layout z hintem
  (np. `26%`) inline, toggle 36×20 — zmieści się więcej w tym samym widoku.

### Fixed
- **Chip „Motion" nie liczył `device_class: occupancy`.** Domowe czujki
  z presence mmWave (binary_sensor.xxx_occupancy) były widoczne w wierszu
  pokoju jako aktywne, ale chip nagłówka pokazywał 0. Teraz motion chip
  zlicza OBA device_class (motion + occupancy), zdeduplikowane — spójnie
  z zachowaniem `row`/`tile`. Dotyczy też popupu listy.

## [1.27.0] — 2026-04-20

### Added
- **Popup listy encji po kliknięciu chipa.** Klik np. na chip „Światła" →
  otwiera się panel z listą świateł które są włączone. Dla
  kontrolowalnych domen (light / switch / cover):
  - per-item **toggle switch** (włącz / wyłącz / przełącz)
  - per-light **slider brightness** (lub position dla rolet)
  - kolor tła ikony = aktualny `rgb_color` żarówki
  - master przycisk **„Wyłącz wszystkie"** / **„Zamknij wszystkie"**
- Dla czujników (motion / occupancy / windows / doors / filter z
  binary_sensor) lista jest **read-only** — badge stanu per pozycja.
- Per-item klik w ikonę otwiera HA more-info dialog.
- Konfiguracja: nowe pole `show_list?: boolean` na chipach (default `true`
  dla built-in i filter; ignorowane dla entity/template).
  Jeśli `tap_action` jest ustawione, wygrywa nad listą.
- Lista aktualizuje się live — zmiana stanu encji w HA natychmiast
  odświeża popup (też wewnętrznie gdy toggle zmienia stan).

### UI
- Popup z blur backdrop, pop-in animation, Escape zamyka, klik w tło
  zamyka. Nagłówek ma tinted gradient w kolorze chipu.
- Lista pogrupowana per domena (Światła / Przełączniki / Rolety / Czujniki)
  z mini-headerem sekcji i lokalnym master button.

## [1.26.0] — 2026-04-20

### Added
- **Presety warunków** — 8 gotowych scenariuszy z pre-fillem (alarm okno
  otwarte, światła aktywne, motion live, gorąco, zimno, wilgotno, wyciszenie).
  Rozwijane przyciskiem „Presety" w sekcji Warunki.
- **6 typów animacji** dla całej pozycji i dla samej ikony:
  `pulse`, `blink`, `shake`, `glow`, `bounce`, `spin` (tylko ikona).
  Stare `pulse: true` (deprecated) migrowane do `animation: 'pulse'`.
- **Nowe pola w `DisplayConditionConfig`:**
  - `animation` — animacja całej pozycji
  - `icon_animation` — animacja samej ikony (osobno)
  - `text_color` — kolor nazwy + wartości pól
  - `opacity` (0–1) — np. wyciszenie gdy pokój nieaktywny
  - `icon_size_scale` — skala ikony (0.5–2.0)
- Chipy w nagłówku: **domyślne chipy są widoczne i edytowalne** w edytorze
  (dotąd „Brak chipów"). Przycisk „Przywróć domyślne" cofa zmiany.

### Changed
- **Conditions editor rebuild** — pola pogrupowane w trzy sekcje:
  „Styl pozycji" / „Styl ikony" / „Styl tekstu". Chip rowe animacji
  (z mini-animowanymi ikonami w chipach gdy wybrane). Slidery przezroczystości
  i skali ikony z przyciskiem clear.

### Fixed
- **Podgląd karty w edytorze — mocniejsze wykrywanie.** Walk-up przez
  shadow DOM szukając `hui-card-preview` / `hui-dialog-edit-card`, plus
  standardowy setter `preview` obsługiwany przez HA. Force-expand na
  każde setConfig w trybie edytora (niezależnie od `isFirst` —
  HA potrafi recycling elementów).

## [1.25.0] — 2026-04-20

### Added
- **Nowa sekcja „Belka nagłówka"** (collapsible) z rich UX:
  - Rozmiar tytułu — chipy z live preview (Mały / Średni / Duży)
  - Waga tytułu — chipy (400 / 500 / 600 / 700) z widoczną grubością
  - Kolor tytułu / ikony — 8 swatch-chipów + custom hex/var
  - Rozmiar ikony, padding belki — slidery z live wartościami
  - Toggle: ukryj chevron expandera
  - Toggle: akcentowy pasek z lewej + kolor
- **Nowa sekcja „Chipy w nagłówku"** (collapsible):
  - Lista chipów z add/remove/reorder
  - Add menu z quick-pickami: Światła / Motion / Zajętość / Okna / Drzwi
    + Encja / Filtr / Template
  - Per-chip ha-form z polami pasującymi do typu (entity / filter / template)
- Top-level `header: HeaderConfig` w `StratumCardConfig`.

### Fixed
- **Podgląd karty w edytorze nie zwija się automatycznie.** Karta
  wykrywa tryb edytora (obecność `hui-dialog-edit-card` w DOM) i:
  - startuje zawsze rozwinięta
  - pomija `auto_collapse` timer
  - zachowuje stan `_expanded` gdy user ręcznie zwinie/rozwinie

## [1.24.0] — 2026-04-20

### Changed
- **Wszystkie panele głównego edytora teraz collapsible.** Startują zwinięte,
  klik w nagłówek rozwija:
  - „Karta Stratum" → rename na **„Ustawienia ogólne"**
  - „Warunki — styl zależny od encji"
  - „Pomieszczenia"
  - „Sceny"
  - (Wygląd — Wiersz/Kafel już były collapsible od v1.22)
- **Rewrite editora Warunków.** Zamiast ha-form:
  - Pole + operator jako chipy z ikonami
  - Kolor akcentu / borderu / tła / ikony — swatch rows (8 kolorów)
    + custom hex/var — spójnie z display editorem
  - Grubość borderu — slider z live wartością (0-8 px)
  - Ikona override — picker (ha-icon)

### Added
- **Nowe opcje warunków:**
  - `icon` — override MDI ikony area gdy warunek spełniony
    (np. `mdi:window-open-variant` gdy `windows any_on`)
  - `icon_color` — osobny kolor ikony (niezależny od accent)
  - `pulse: true` — animacja glow pulse (1.6s loop). Respektuje
    `prefers-reduced-motion`.

## [1.23.0] — 2026-04-20

### Added
- **Dynamiczny akcent z aktywnych świateł.** Nowy tryb
  `accent_mode: 'lights'` w row/tile config — kafel/wiersz odzwierciedla
  `rgb_color` i `brightness` pierwszego świecącego światła w pomieszczeniu.
  Kafel zmienia kolor live gdy zmieniasz barwę żarówki; jasność wpływa
  na intensywność akcentu (tło + border).
- W edytorze nowy chip „💡 Z świateł" w sekcji „Kolor akcentu" — klik
  toggluje tryb. Gdy aktywny, swatche i pole hex są wyłączone.
- Fallback dla świateł w trybie CCT (`color_temp_kelvin`) —
  aproksymacja Tannera Helland do RGB.

### Fixed
- **Wysokość kafla nie zmniejszała się poniżej wartości z `aspect-ratio`.**
  Slider „Min. wysokość" dla tile traktowany jest teraz jako explicit
  `height` z `aspect-ratio: auto` — pozwala zarówno zwiększyć jak i
  zmniejszyć rozmiar niezależnie od proporcji.
- **Brak odstępu między scenami a listą pomieszczeń.** Dodany `.body-divider`
  (linia + margines 10px) w body karty gdy obecne są oba elementy.

## [1.22.0] — 2026-04-20

### Added
- **`rooms_tile_columns`** — nowy klucz top-level: `auto` (default) albo
  `1..6`. Określa liczbę kolumn siatki kafli. Kafle same dzielą szerokość
  równo, koniec z ręcznym ustawianiem `px`. Stare `rooms_tile_min_width`
  działa dalej jako fallback gdy `rooms_tile_columns` nie ustawione.
- `minmax(0, 1fr)` w grid — chroni przed nakładaniem się kafli przy
  długiej zawartości / aspect-ratio.

### Changed
- **Panel „Karta Stratum" przepisany na chip/slider/toggle UX:**
  - Liczba kolumn jako chipy `Auto / 1 / 2 / 3 / 4 / 5 / 6`
  - Forma pozycji jako chipy (Wiersz / Kafel)
  - Auto-zwijanie jako slider z live wartością (0 = „wyłączone")
  - Rozwinięta / Debug jako natywne checkboxy
  - ha-form zostaje tylko dla floor/area/name/icon/tap_action
- **Panele „Wygląd — Wiersz" i „Wygląd — Kafel" są teraz collapsible.**
  Startują zwinięte — kliknij nagłówek żeby rozwinąć. Z defaultu nie
  pokazujemy ściany ustawień — tylko to co chcesz edytować.
- Wspólne prymitywy `stratum-chip`, `stratum-slider-row`, `stratum-toggle`
  wyniesione do `editor-shared-styles` — spójny look we wszystkich panelach.

### Removed (z UI)
- Pole „Min. szerokość kafla (px)" — zastąpione chipem liczby kolumn.
  YAML-owo `rooms_tile_min_width` nadal działa dla backward-compat.

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
