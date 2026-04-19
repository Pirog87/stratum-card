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

## v1.0 — HACS publication ⬜

- GitHub release workflow (już jest — tag `v1.0.0` → build → asset)
- HACS submission: PR do `hacs/default` repo z dodaniem naszego repo
- Full README po polsku i angielsku (osobne sekcje)
- Video demo / GIF w README
- Screenshot galeria w `docs/screenshots/`
- Retrospektywa w `docs/lessons-learned.md`

**Commit:** `chore: 1.0.0 release`

---

## Post-v1.0 — pomysły

- **v1.1**: Performance — virtual scroll dla area z 20+ pokojami
- **v1.1**: Sections view compat — `grid-layout-options`
- **v1.2**: Grupy area (Parter zawiera Kuchnię która zawiera X) — hierarchia
- **v1.3**: Presets — zapisane zestawy chipów („home monitoring",
  „security overview") wybierane jednym polem
- **v2.0**: Companion integration Python — expose agregaty jako sensory
- **v2.0**: Multi-area w jednej karcie (dashboard „Cały dom" z każdą area jako sekcją)
