# Styling Stratum Card

Stratum ma trzy warstwy customizacji wyglądu, od najprostszej do najbardziej
zaawansowanej:

1. **YAML config** — pola jak `icon`, `color`, `image`, `size`, `columns`,
   `aspect`. Obowiązuje 80% przypadków.
2. **CSS variables** — nadpisy kolorów i wymiarów przez zmienne CSS
   z prefixem `--stratum-*`. Nadpisujesz na poziomie karty lub globalnie.
3. **Shadow parts** (`::part(...)`) — pełny dostęp do stylizacji przez
   `card-mod`. Pozwala zmienić dowolne property dowolnego elementu.

Przykłady na końcu dokumentu.

---

## CSS variables

### Karta globalnie (`stratum-card` i `stratum-room-card`)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-card-background` | `--ha-card-background` | tło całej karty |
| `--stratum-card-border-radius` | `--ha-card-border-radius` (12px) | zaokrąglenie rogów |
| `--stratum-card-color` | `--primary-text-color` | kolor domyślnego tekstu |
| `--stratum-card-divider-color` | `--divider-color` | pozioma linia pod headerem / nad body |
| `--stratum-card-focus-color` | `--primary-color` (#ff9b42) | obrys fokus (klawiatura) |

### Header główny (floor card)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-card-icon-size` | `22px` | rozmiar ikony area obok nazwy |
| `--stratum-card-icon-color` | `--primary-text-color` | kolor ikony area |
| `--stratum-card-title-size` | `17px` | rozmiar fontu tytułu |
| `--stratum-card-title-weight` | `500` | grubość tytułu |
| `--stratum-card-hover-background` | `rgba(255,255,255,0.04)` | tło headera przy hover |
| `--stratum-card-expander-color` | `--secondary-text-color` | kolor strzałki expandera |
| `--stratum-card-expander-duration` | `280ms` | czas animacji rozwijania |

### Wiersze pomieszczeń (`stratum-card-room-row`)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-card-room-divider` | `--divider-color` | separator między wierszami |
| `--stratum-card-room-icon-color` | `--secondary-text-color` | kolor ikony pokoju |
| `--stratum-card-room-hover` | `rgba(255,255,255,0.04)` | tło wiersza przy hover (tylko gdy klikalny) |

### Chipy headera (`stratum-card-chip`)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-chip-accent` | akcent per chip | kolor ikony i tekstu chipu aktywnego |
| `--stratum-chip-background` | `rgba(255,255,255,0.06)` | tło pigułki chipu |
| `--stratum-chip-padding` | `4px 8px` | wewnętrzny padding |
| `--stratum-chip-radius` | `999px` | zaokrąglenie (999 = pełna pigułka) |
| `--stratum-chip-font-size` | `12px` | rozmiar tekstu chipu |
| `--stratum-chip-icon-size` | `16px` | rozmiar ikony chipu |
| `--stratum-chip-inactive-opacity` | `0.35` | opacity chipa z zerowym licznikiem |
| `--stratum-chip-inactive-color` | `--secondary-text-color` | kolor tekstu chipu nieaktywnego |
| `--stratum-chip-hover-background` | `rgba(255,255,255,0.1)` | tło chipu przy hover (jeśli klikalny) |
| `--stratum-chip-lights-color` | `#ffc107` | domyślny akcent chipa „światła" |
| `--stratum-chip-motion-color` | `#4caf50` | domyślny akcent chipa „ruch" |
| `--stratum-chip-occupancy-color` | `#4caf50` | domyślny akcent chipa „obecność" |
| `--stratum-chip-windows-color` | `#42a5f5` | domyślny akcent chipa „okna" |
| `--stratum-chip-doors-color` | `#42a5f5` | domyślny akcent chipa „drzwi" |

### Pasek scen (`stratum-scene-bar`)

| Zmienna | Default | Opis |
|---|---|---|
| `--scene-columns` | `3` | liczba kolumn (ustawiane przez config, ale można forsować CSS) |
| `--scene-aspect` | `1/1` | proporcja tile |
| `--stratum-scene-gap` | `8px` | odstęp między tile'ami |
| `--stratum-scene-radius` | `12px` | zaokrąglenie tile scene |

### Tiles sekcji (`stratum-room-tile`)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-tile-background` | `rgba(255,255,255,0.03)` | tło tile (stan nieaktywny) |
| `--stratum-tile-hover-background` | `rgba(255,255,255,0.06)` | tło tile przy hover |
| `--stratum-tile-accent` | `--primary-color` | akcent border/ikony tile aktywnego |

### Room card — własne

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-room-padding` | `16px` | padding wewnętrzny room-card |

---

## Shadow parts

Używaj z zewnątrz przez `card-mod` (`style: | ... ::part(X) { ... }`) lub bezpośrednio w stylu globalnym.

### `stratum-card` (floor)

| Part | Opis |
|---|---|
| `card` | wewnętrzne `<ha-card>` |
| `header` | klikalny header (ikona + tytuł + chipy + expander) |
| `area-icon` | ikona area/floor w headerze |
| `title` | tekst nazwy |
| `chips` | wrapper flex chipów |
| `expander` | ikona chevron expandera |
| `body` | sekcja pod expanderem (scrolluje się rozwija) |
| `room` | pojedynczy wiersz pomieszczenia |
| `chip` | chip w `stratum-card-chip` |
| `popup` | `<dialog>` popup (room-card jako overlay) |

### `stratum-room-card`

| Part | Opis |
|---|---|
| `card` | `<ha-card>` |
| `header` | header z ikoną + tytułem + chipami |
| `room-icon` | ikona area |
| `title` | nazwa |
| `chips` | wrapper chipów |
| `body` | body z sekcjami |
| `section` | pojedyncza sekcja (summary/lights/...) |
| `section-header` | nagłówek sekcji (ikona + tytuł + licznik) |
| `tile` | kafelek encji w sekcji |
| `scene-bar` | pasek scen |
| `scene` | pojedyncza kafla sceny |

---

## Przykłady card-mod

Wymaga zainstalowanego [`card-mod`](https://github.com/thomasloven/lovelace-card-mod).

### Zmiana kolorów chipów

```yaml
type: custom:stratum-card
floor_id: parter
card_mod:
  style: |
    ha-card {
      --stratum-chip-lights-color: #ff5722;
      --stratum-chip-motion-color: #8bc34a;
      --stratum-chip-windows-color: #00bcd4;
    }
```

### Większa, ciemniejsza karta z animowanym obramowaniem przy obecności

```yaml
type: custom:stratum-card
floor_id: parter
card_mod:
  style: |
    ha-card {
      --stratum-card-background: #0f1419;
      --stratum-card-border-radius: 24px;
      --stratum-card-title-size: 20px;
      border: 2px solid rgba(76, 175, 80, 0);
      transition: border-color 0.3s ease;
    }
    {% if is_state('binary_sensor.parter_motion', 'on') %}
      ha-card {
        border-color: rgba(76, 175, 80, 0.6);
        box-shadow: 0 0 18px rgba(76, 175, 80, 0.25);
      }
    {% endif %}
```

### Chip „lights" — pulsuje gdy jest cokolwiek włączone

```yaml
card_mod:
  style:
    stratum-card-chip:
      $: |
        .chip.active {
          animation: glow 2s ease-in-out infinite;
        }
        @keyframes glow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.35); }
        }
```

### Kompaktowy tryb (mniejsze paddingi i tytuł)

```yaml
card_mod:
  style: |
    ha-card {
      --stratum-card-title-size: 14px;
      --stratum-card-icon-size: 18px;
      --stratum-chip-font-size: 11px;
      --stratum-chip-icon-size: 14px;
      --stratum-chip-padding: 2px 6px;
    }
    .header {
      padding: 8px 12px !important;
    }
```

### Full-screen popup zamiast wycentrowanego

```yaml
card_mod:
  style: |
    dialog.stratum-popup {
      max-width: 100vw !important;
      max-height: 100vh !important;
      border-radius: 0 !important;
      margin: 0 !important;
    }
    .stratum-popup-inner {
      max-height: 100vh !important;
    }
```

### Inny font dla całego Stratum

```yaml
card_mod:
  style: |
    ha-card {
      font-family: 'Aptos', 'Segoe UI', system-ui, sans-serif;
      letter-spacing: -0.015em;
    }
```

### Dark accent w scenach (overlay jaśniejszy tekst)

```yaml
card_mod:
  style:
    stratum-scene-bar:
      $: |
        .tile .tile-name {
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
          font-size: 15px;
        }
```

---

## Kompatybilność z popularnymi theme'ami

- **Minimalist** — Stratum dziedziczy `--primary-color`, `--divider-color`,
  `--ha-card-*`. Bez override wygląda spójnie.
- **Mushroom** — Stratum nie ingeruje w Mushroom; możesz mieszać karty bez
  konfliktów. Jeżeli chcesz identyczny radius, ustaw
  `--stratum-card-border-radius: 24px`.
- **Default HA** — `:host` dziedziczy `--ha-card-background` i
  `--ha-card-border-color`, więc tryb jasny/ciemny HA działa out-of-the-box.

---

## Gdzie zgłaszać braki

Jeśli brakuje zmiennej dla czegoś co chcesz zmienić, a nie da się tego zrobić
przez `::part(...)` — otwórz issue w repo z kodem który próbujesz napisać,
dodamy zmienną lub part w kolejnym release.
