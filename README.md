# Stratum

![GitHub release](https://img.shields.io/github/v/release/Pirog87/stratum-card?style=flat-square)
![License](https://img.shields.io/github/license/Pirog87/stratum-card?style=flat-square)
![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg?style=flat-square)

![Stratum card preview](docs/images/preview.png)

> Dwie customowe karty Home Assistant: **Stratum** (podsumowanie piętra z listą pomieszczeń) + **Stratum Room** (widok pojedynczego pokoju). Jedna konfiguracja, pełna kontrola.

**Stratum** (łac. _warstwa_) — metafora jest dokładna: dom ma warstwy (piętra, strefy), każda warstwa ma swoje pomieszczenia. Karta pokazuje stan warstwy na głównym poziomie (ile świateł, obecność, otwarte okna) i pozwala kliknąć każdy pokój żeby zobaczyć jego detale w popup.

## Dwie karty, jeden bundle

### `stratum-card` (floor card)
Jeden wiersz per pomieszczenie piętra. Header z chipami agregującymi (lights / motion / windows / doors / custom), expandable body z listą pokoi. Klik pokoju → popup z widokiem tego pomieszczenia.

### `stratum-room-card` (room card)
Widok detalu pomieszczenia. Header z chipami specyficznymi dla pokoju, sekcje auto-wykryte (lub ręcznie skonfigurowane): Podsumowanie, Światła, Rolety, Okna, Drzwi, Klimat, Media, Wentylacja, Sceny, **Dowolna karta custom z HACS**.

## Funkcje

### Floor card
- Automatyczna detekcja pomieszczeń z `hass.floors` (HA 2024.3+)
- **Merge rooms** — łączenie pokoi (Kuchnia+Spiżarnia → jeden wiersz z zagregowanymi licznikami)
- **Auto-collapse** po N sekundach bezczynności (domyślnie 60 s, configurable)
- **Klik pokoju otwiera popup** z widokiem tego pomieszczenia (bez potrzeby osobnego dashboardu)
- **Pasek scen** opcjonalny — nad / pod listą pomieszczeń
- Pełna kontrola kolejności + per-room overrides (nazwa, ikona, tap_action, widoki popup)

### Room card (popup)
- **9 typów sekcji**: `summary` / `lights` / `covers` / `windows` / `doors` / `climate` / `media` / `fans` / `switches` / `scenes` / `custom`
- **7 trybów wyświetlania** per sekcja:
  - `tile` (default) — pełny kafel z toggle
  - `slider` — brightness (lights) / position (covers)
  - `ambient` (lights) — tile zmienia kolor i jasność wg encji 🌈
  - `bubble` — duża ikona w kółku (mushroom-style)
  - `chips` — kompaktowy pasek pigułek
  - `icon` — sama ikona
  - **`custom:<any-hacs-card>`** — każda encja w sekcji jako dowolna karta HACS (mushroom, bubble-card, button-card…)

### Sceny
- **24 wbudowane grafiki** SVG (jasne / noc / usypianie / czytanie / relaks / kino / disco / gaming / medytacja / …)
- Własne URL obrazków albo ikony + kolor
- Konfigurowalna pozycja, rozmiar, kolumny, aspect ratio (default 16:9, 3 kolumny)
- Tap action override per scena

### Konfiguracja
- **Pełny wizualny edytor** — bez pisania YAML
- Per-pokój: checkbox + override name/icon/tap_action/merge_with
- Per-pokój popup: niezależna lista sekcji + scen
- Per-sekcja: filter encji, kolumny, tryb wyświetlania
- Custom HACS cards w dropdown „Tryb wyświetlania" (auto-enumerate z `window.customCards`)

### Stylizacja
- CSS variables (`--stratum-*`) dla wszystkich kolorów i wymiarów
- Shadow parts (`::part(card)`, `::part(chip)`, `::part(popup)` itd.)
- Kompatybilność z `card-mod`
- Pełna dokumentacja stylizacji w [`docs/styling.md`](docs/styling.md)

## Instalacja przez HACS (custom repository)

1. W Home Assistant otwórz **HACS**
2. Kliknij ⋮ (menu) → **Custom repositories**
3. Wypełnij:
   - Repository: `https://github.com/Pirog87/stratum-card`
   - Type: **Plugin** (NIE „Integration"!)
4. **Add**
5. W HACS wyszukaj **Stratum** → **Download**
6. Zaakceptuj dodanie resource (albo ręcznie: *Settings → Dashboards → Resources* → URL `/hacsfiles/stratum-card/stratum-card.js`, type `JavaScript Module`)
7. Ctrl+Shift+R

## Przykłady

Konkretne konfiguracje YAML w katalogu [`examples/`](examples/):

- [`parter-basic.yaml`](examples/parter-basic.yaml) — prosty floor z auto-discovery
- [`parter-advanced.yaml`](examples/parter-advanced.yaml) — pełna konfiguracja z merge, sekcjami popup, scenami
- [`sypialnia-room.yaml`](examples/sypialnia-room.yaml) — standalone `stratum-room-card`

## Szybki start

Najprostsza konfiguracja — karta dla parteru:

```yaml
type: custom:stratum-card
floor_id: parter
```

Z konfiguracją scen:

```yaml
type: custom:stratum-card
floor_id: parter
scenes:
  items:
    - entity: scene.jasne
      image: stratum:jasne
    - entity: scene.noc
      image: stratum:noc
    - entity: scene.odpoczynek
      image: stratum:relaks
```

Kliknięcie pokoju otwiera popup z automatycznie wykrytymi sekcjami na bazie encji tej area.

## Dev

```bash
git clone https://github.com/Pirog87/stratum-card.git
cd stratum-card
npm install
npm run build      # jednorazowy
npm run watch      # rebuild on save
```

Plik wyjściowy: `dist/stratum-card.js`. Skopiuj do `/config/www/` swojej instancji HA żeby testować zmiany.

Szczegóły dev loopu w [`docs/development.md`](docs/development.md).

## Historia zmian

Pełna lista w [`CHANGELOG.md`](CHANGELOG.md). Highlighty:

- **v1.12** — zunifikowany system wizualny wszystkich edytorów
- **v1.11** — custom HACS cards w dropdown trybów wyświetlania
- **v1.10** — 24 scene presets (redesign + 10 nowych), 16:9 default
- **v1.9** — bubble + icon + **ambient** (kolor żarówki na tile) modes
- **v1.8** — custom card jako sekcja + fix entity filter
- **v1.7** — chips mode dla sekcji i summary
- **v1.6** — styling guide + fix `tap_action: default`
- **v1.5** — per-room popup configuration w edytorze floor
- **v1.3** — RoomSectionConfig + summary section + slider tile
- **v1.2** — sceny z 14 grafikami
- **v1.1** — popup room-card przy klik wiersza
- **v1.0** — stratum-room-card (drugi card type)

## Architektura

Decyzje projektowe: [`docs/architecture.md`](docs/architecture.md).
Roadmap: [`docs/roadmap.md`](docs/roadmap.md).

## Stylizacja

Trzy warstwy customizacji: YAML config, CSS variables, shadow parts. Pełna lista zmiennych (`--stratum-*`) i gotowe snippety card-mod: [`docs/styling.md`](docs/styling.md).

## Licencja

MIT — patrz [`LICENSE`](LICENSE).
