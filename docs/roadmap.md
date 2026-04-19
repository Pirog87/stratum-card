# Roadmap — stratum-card

Od szkieletu do publikacji w HACS. Każdy milestone jest osobnym commitem
(lub serią) z tagiem `v0.X.0`. Nie wyprzedzaj — iterujemy w kolejności.

Legenda: ✅ zrobione · 🚧 w trakcie · ⬜ nie zaczęte

---

## v0.1 — szkielet ✅

- ✅ Projekt TypeScript + Lit + Rollup
- ✅ Karta się rejestruje w HA (`customCards`)
- ✅ `setConfig` waliduje obecność `area_id` lub `name`
- ✅ Header z ikoną, nazwą, placeholder chipem, expanderem
- ✅ Toggle expandera (CSS rotate + conditional render body)
- ✅ CSS variables dla kolorów i wymiarów
- ✅ Shadow parts dla pełnej stylizacji
- ✅ Rozwiązywanie nazwy/ikony z `hass.areas[area_id]`

**Test:** karta się renderuje z `area_id: parter`, pokazuje nazwę z HA,
klik w header toggluje body z placeholderem.

---

## v0.2 — czytanie encji area ⬜

- Helper `getEntitiesInArea(hass, area_id): HassEntity[]` — resolve przez
  `hass.entities` → filter po `area_id`, dodatkowo po `hass.devices[].area_id`
  (encja może dziedziczyć area z urządzenia)
- Helper `filterByDomain(entities, domain)` — `"light"`, `"binary_sensor"` etc.
- Helper `filterBinarySensorDeviceClass(entities, class)` — `"motion"`,
  `"window"`, `"door"`, `"occupancy"`
- Test manualny: `console.log` z listy encji parteru

**Commit:** `feat: read entities in area from hass registry`

---

## v0.3 — rendering chipów ⬜

- Typ `ChipConfig` w `types.ts`
- Domyślne chipy jeśli `config.chips` nie podane:
  - światła (liczba ON z area)
  - obecność (ikona jeśli cokolwiek z `device_class: motion|occupancy` jest ON)
  - okna (liczba z `device_class: window` w stanie `on`)
- Podkomponent `<stratum-card-chip>` (osobny plik `src/chip.ts`)
- Każdy chip ma: icon, value, color, optional tap_action (v0.6)
- CSS variables per chip: `--area-chip-lights-color` etc.

**Test:** Parter z kilkoma włączonymi światłami pokazuje chip „💡 3"
w kolorze pomarańczowym.

**Commit:** `feat(chips): default chip set for area summary`

---

## v0.4 — animacja expandera ⬜

- Zamiast `this._expanded ? html`<body>` : nothing`, body zawsze w DOM-ie,
  z `max-height` transition
- `overflow: hidden` na body, `max-height: 0` zamknięte, `500px` (lub
  dynamicznie) otwarte
- `transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- Expander ikona rotate istnieje już w v0.1
- Dodać `prefers-reduced-motion` media query — bez animacji gdy user ma
  zmniejszone animacje w OS

**Commit:** `feat: animated expander with reduced-motion support`

---

## v0.5 — lista pomieszczeń ⬜

- Jeśli `config.rooms` podane → render z configu
- Jeśli brak → auto-inferencja: dla każdego unikalnego `device.area_id`
  wśród dzieci area (nie ma, bo `area_id` per device jest flat — ale można
  grupować np. po prefixie entity_id lub labels)
  - W praktyce: dla v0.5 tylko `config.rooms` — auto-inferencja w v0.6+
- Podkomponent `<stratum-card-room-row>` (`src/room-row.ts`)
- Row pokazuje: ikonę, nazwę, optional mini-chip (temperatura, ruch)

**Test:** Parter ze zdefiniowanymi rooms (Salon, Kuchnia, ...) renderuje
ich listę w body.

**Commit:** `feat: render room list from config`

---

## v0.6 — tap actions ⬜

- Row jest klikalny (button)
- `tap_action` config: `{ action: 'navigate', navigation_path: '/dashboard/salon' }`
  lub `{ action: 'more-info', entity: 'light.salon' }`
- Wsparcie `browser_mod.popup` przez `fire-dom-event`
- Long press, double tap — jeśli HA standard to wspiera w innych kartach,
  my też (użyj `handle-action` helper z HA, patrz Mushroom source)

**Commit:** `feat: tap/hold/double-tap actions on room rows`

---

## v0.7 — visual editor ⬜

- Komponent `stratum-card-editor` (`src/editor.ts`) wykorzystujący HA form
- User w UI dashboardu klika „edytuj kartę" → formularz
- Pola: area picker (select z `hass.areas`), name, icon, expanded_default,
  chips (multi-select), rooms (repeatable list)
- Eksport: `getConfigElement()` na klasie karty zwraca `stratum-card-editor`

**Commit:** `feat: visual editor for no-code configuration`

**Od tego momentu:** Vitest + unit testy dla `setConfig` i helperów.

---

## v0.8 — customowe chipy ⬜

- User definiuje własny chip w YAML:
  ```yaml
  chips:
    - type: template
      icon: mdi:thermometer
      value: "{{ states('sensor.parter_temp') }}°C"
      color: amber
  ```
- Rendering template przez `hass.callApi('POST', 'template', ...)` lub
  przez klienta template (jeśli HA zrobi to dla nas)
- Kolor: albo semantyczny (`amber`, `red`, `green`) albo hex

**Commit:** `feat(chips): user-defined template chips`

---

## v0.9 — stylizacja finalna ⬜

- Pełna lista CSS variables w docs (README + docs/styling.md)
- Wszystkie szczegóły: radiusy, paddingi, rozmiary ikon, fonty
- Testy kompatybilności z popularnymi theme (Minimalist, Mushroom, default HA)
- `card-mod` snippet w docs jako przykład głębokiej customizacji

**Commit:** `docs: styling guide + card-mod examples`

---

## v0.9 — explicit rooms config + per-room overrides ⬜

- `rooms: []` w configu — jawna lista pomieszczeń zamiast auto-discover
  ```yaml
  rooms:
    - area_id: salon
      name: "Salon główny"   # override
      icon: mdi:sofa         # override
      tap_action:             # per-room override globalnego room_tap_action
        action: navigate
        navigation_path: /dashboard/salon
  ```
- Jeśli `rooms` brak — nadal auto-discover (kompatybilność wsteczna)
- Kolejność w configu = kolejność wyświetlania (drag&drop w v0.11)
- **Editor**: po wyborze `floor_id` pokazujemy listę area z tego floor-a z
  checkboxami „Pokaż na liście". Dla każdej zaznaczonej — expandable z name,
  icon, tap_action.

**Commit:** `feat: explicit rooms config with per-room overrides`

---

## v0.10 — merge rooms (hierarchia pomieszczeń) ⬜

- `merge_with: [area_id, ...]` w `RoomConfig` — łączy agregaty podrzędne
  do głównego wiersza
  ```yaml
  rooms:
    - area_id: kuchnia
      merge_with: [spizarnia]
  ```
- Wiersz pokazuje sumaryczne liczniki z obu area, motion z każdej zapala
  indicator, temperatura bierze z primary
- `primary` implicit = `area_id` roota, sub = `merge_with`
- Flag `aggregate: sum | primary_only` — czy chipy mini-chipa w wierszu są
  sumą (sum) czy tylko primary
- Scope v0.10 dotyczy tylko głównej karty (floor) — detail view dziedziczy
  merge info w v1.0+

**Commit:** `feat(rooms): merge multiple areas into a single row`

---

## v0.11 — UX polish rooms selection ⬜

- Drag&drop w editorze rooms (zmiana kolejności)
- Przycisk „Dodaj wszystkie z floor" / „Wyklucz wybrane"
- Pole `excluded: []` jako alternatywa do jawnej listy (gdy user chce
  „wszystkie oprócz")

**Commit:** `feat(rooms): reorder + bulk actions in editor`

---

## v1.0 — room detail view (stratum-room-card) ⬜

Nowy custom element `stratum-room-card` — widok pojedynczego pomieszczenia.
Automatycznie generuje sekcje na podstawie encji area (i ich merge children):

- Header: ikona + nazwa area + mini-chipy (temp / motion / wilgotność)
- Sekcja **Światła**: każde światło jako mini-karta (slider, toggle)
- Sekcja **Rolety**: cover entities z przyciskami ↑/■/↓
- Sekcja **Okna/Drzwi**: binary_sensor device_class=window|door — status
- Sekcja **Klimat**: climate entities — mini-card
- Sekcja **Inne**: media_player, fan itd.

Wzorzec: karta Sypialnia z ekranu użytkownika (sekcje, mini-karty).

Config:
```yaml
type: custom:stratum-room-card
area_id: sypialnia
merge_with: [sypialnia_garderoba, sypialnia_lazienka]
sections:              # opcjonalne, domyślnie auto
  - lights
  - covers
  - windows
```

Rejestracja jako drugi card type (obok `stratum-card`).

**Commits:** `feat: stratum-room-card auto-generated room detail view`
(rozłożymy na 2–3 PR: szkielet + sekcje + styl).

---

## v1.1 — sceny per pomieszczenie ⬜

- `scenes:` w `stratum-room-card` i `RoomConfig`
  ```yaml
  scenes:
    - entity: scene.sypialnia_jasne
      name: Jasne
      image: /local/img/HUE_Jasne.png
    - entity: scene.sypialnia_odpoczynek
      image: /local/img/HUE_Odpoczynek.png
  ```
- Renderowane jako grid nad sekcją Światła (3 kolumny, aspect-ratio)
- Auto-discover jeśli `scenes` brak: pola scene z prefixem area_id

**Commit:** `feat(rooms): scenes section in room detail view`

---

## v1.2 — room navigation from floor card ⬜

- Gdy user kliknie row pomieszczenia w głównej karcie — zamiast `navigate`
  do innego dashboardu otwieramy **stratum-room-card** w popup (`more-info`
  dialog) albo sub-route `/stratum/<area_id>`
- Flag `room_open_mode: navigate | popup | inline` (inline = karta rozwija
  się w miejsce wiersza)

**Commit:** `feat: open room detail as popup/navigate from floor card`

---

## v1.3 — stylizacja finalna (ex-v0.9 z pierwszego planu) ⬜

- Pełna lista CSS variables w `docs/styling.md`
- Kompatybilność z Minimalist / Mushroom / default HA
- `card-mod` snippety w docs

**Commit:** `docs: styling guide + card-mod examples`

---

## v2.0 — HACS publication + dashboard generator ⬜

- GitHub release (już jest — tagi `vX.Y.Z` → auto-release)
- HACS submission — PR do `hacs/default`
- README PL + EN (osobne sekcje)
- Video/GIF demo
- Screenshot galeria
- **Dashboard generator** — nowy service: karta Stratum eksponuje metodę
  generującą YAML view dla całego piętra (każde pomieszczenie jako
  stratum-room-card) — user kliknie „Wygeneruj dashboard piętra" i dostaje
  gotowy YAML do wklejenia

**Commit:** `chore: 2.0.0 release + dashboard generator`

---

## Post-v2.0 — pomysły

- Performance — virtual scroll dla floor z 20+ pokojami
- Sections view compat — `grid-layout-options`
- Presets — zapisane zestawy chipów
- Companion integration Python — expose agregaty jako sensory
- Multi-floor dashboard (cały dom)

