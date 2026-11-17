# Styling Stratum Card

Stratum ma trzy warstwy customizacji wyglądu, od najprostszej do najbardziej
zaawansowanej:

1. **YAML config** — pola jak `icon`, `color`, `image`, `size`, `columns`,
   `aspect`, `header.title_size`. Obowiązuje 80% przypadków.
2. **CSS variables** — nadpisy kolorów i wymiarów przez zmienne CSS
   z prefixem `--stratum-*`. Nadpisujesz w motywie HA albo w card-modzie
   karty.
3. **Shadow parts** (`::part(...)`) — stylizacja konkretnych elementów
   z zewnątrz shadow rootu, w którym leżą.

Przykłady na końcu dokumentu.

---

## Gdzie ustawiać zmienne

Zmienne CSS dziedziczą się przez shadow DOM, więc wartość ustawiona wyżej
dociera do wszystkich elementów karty. Liczy się tylko **gdzie** ją
ustawisz:

| Miejsce | Co obejmuje |
|---|---|
| motyw HA (`themes:`) | wszystkie karty Stratum, razem z popupem pokoju i listą chipa |
| card-mod: `:host { … }` | cała ta karta, razem z jej popupem pokoju i listą chipa |
| card-mod: `ha-card { … }` | wnętrze `ha-card` tej karty — **bez** popupu pokoju i listy chipa karty piętra: obie warstwy są rodzeństwem `ha-card`, nie jego dziećmi |

Dwie pułapki:

- **Tokeny, które karta sama definiuje** (powierzchnie `--stratum-surface-*`,
  `--stratum-lights`, `--stratum-ok`, `--stratum-warn`, `--stratum-ink-*`)
  liczą się na `:host` karty ze zmiennych bazowych. Wartość z motywu przegrywa
  z tą definicją — w motywie ustawiaj zmienną bazową (np.
  `--stratum-chip-lights-color`, `--stratum-card-background`,
  `--success-color`). Zmiennej liczonej z innej zmiennej nie przemalujesz
  na `ha-card` przez jej źródło: wartość policzona wyżej, na `:host`, jest już
  zamrożona. Dlatego:
  - **wypełnienia** zmieniasz na `ha-card` tokenami, których czytają
    elementy — `--stratum-room-row-bg`, `--stratum-tile-background`,
    `--stratum-room-tile-bg`, `--stratum-chip-background` i reszta listy
    z „Powierzchnie". `ha-card { --stratum-surface-1: … }` nie zmieni
    wierszy ani kafli, bo te tokeny policzyły się z surface-1 na `:host`.
    Sam stopień `--stratum-surface-N` nie da się nadpisać ani w motywie,
    ani przez card-mod `:host { … }` — definicja karty jest w kaskadzie
    później; zadziała tylko z `!important`. Żeby przesunąć wszystkie
    stopnie naraz, zmień bazę `--stratum-card-background` (w motywie albo
    na `:host`) — stopnie liczą się z niej;
  - **kolor świateł**: `ha-card { --stratum-chip-lights-color: … }`
    przemaluje chipy, przełącznik w wierszu, kafle i przełącznik nagłówka
    sekcji w karcie pokoju (czytają zmienną bazową wprost), ale nie paski
    belki „Smugi", które idą za `--stratum-lights` z `:host`;
    `:host { … }` przemaluje wszystko.
- **Zmienne ustawiane inline z configu** (np. `--stratum-card-title-size`
  z `header.title_size`) siedzą bezpośrednio na elemencie i wygrywają
  z każdą wartością odziedziczoną. Zmieniaj je przez config albo
  `!important` na tym elemencie — opis przy zmiennej.

card-mod wstrzykuje swój `style:` do shadow rootu karty, a style komponentu
są w kaskadzie po nim. Zwykłe właściwości (nie zmienne), które karta sama
ustawia — `padding`, `border`, `height` — nadpiszesz w card-modzie tylko
z `!important` (patrz przykłady).

---

## CSS variables

### Powierzchnie (od v1.102.0)

Wszystkie wypełnienia w karcie liczą się z **tła karty** w stronę koloru
tekstu, a nie z bieli. Dzięki temu ten sam zapis daje jaśniejszą warstwę na
ciemnym motywie i ciemniejszą na jasnym — bez drugiej palety i bez
`prefers-color-scheme`. Definicje siedzą na `:host` karty (zob. „Gdzie
ustawiać zmienne").

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-surface-base` | `--stratum-card-background` → `--ha-card-background` → `--card-background-color` | punkt odniesienia dla wszystkich powierzchni |
| `--stratum-surface-ink` | `--stratum-card-color` → `--primary-text-color` | kierunek, w którym powierzchnie odchodzą od tła |
| `--stratum-surface-1` | `96%` base | ledwie widoczne wypełnienie — wiersze, kafle |
| `--stratum-surface-2` | `93%` base | chipy, hover belki i wiersza |
| `--stratum-surface-3` | `89%` base | hover chipa i kafla, separatory |
| `--stratum-surface-4` | `82%` base | tor przełącznika, elementy wymagające kontrastu |
| `--stratum-surface-well` | `85%` base + czerń | zagłębienie (stadion ikony w wierszu) |
| `--stratum-ink-tint` | `#fff` | jasny koniec dla napisów i poświat na kolorowym tle (napis na ciemnym pasku belki, rdzeń poświaty przełącznika świateł, napis na kaflu sceny) |
| `--stratum-ink-shade` | `#000` | ciemny koniec: atrament na jasnym tle, cienie „lift" wiersza i kafla, scrim i winieta scen |

Te tokeny zasilają domyślne wartości `--stratum-tile-background`,
`--stratum-room-row-bg`, `--stratum-room-tile-bg`,
`--stratum-tile-chip-background` (surface-1), `--stratum-chip-background`,
`--stratum-card-hover-background`, `--stratum-card-room-hover` (surface-2),
`--stratum-chip-hover-background` i `--stratum-tile-hover-background`
(surface-3). To one są właściwym miejscem na zmianę wypełnień przez card-mod
na `ha-card` — sam `--stratum-surface-N` ustawiony na `ha-card` przychodzi
za późno (zob. „Gdzie ustawiać zmienne").

`--stratum-card-background` ustawione na `ha-card` zmienia samo tło karty,
ale powierzchnie dalej liczą się z tła motywu. Żeby poszły za nowym tłem,
ustaw zmienną na `:host` (card-mod) albo w motywie.

```yaml
# przykład: mocniej kontrastowe wypełnienia w obu motywach
card_mod:
  style: |
    ha-card {
      --stratum-room-row-bg: color-mix(in srgb, var(--card-background-color) 90%, var(--primary-text-color));
      --stratum-tile-background: color-mix(in srgb, var(--card-background-color) 90%, var(--primary-text-color));
    }
    /* albo cały stopień naraz — tylko z !important, bo karta sama
       definiuje --stratum-surface-N na :host później w kaskadzie */
    :host {
      --stratum-surface-1: color-mix(in srgb, var(--card-background-color) 90%, var(--primary-text-color)) !important;
    }
```

### Znaczenia stanów

Jeden kolor = jedno znaczenie. Te tokeny delegują do zmiennych motywu HA,
więc Mushroom, Catppuccin czy własny motyw przemalowują je bez card-moda.

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-focus` | nieustawiona → `--stratum-card-focus-color` → `--primary-color` | **obrys fokusu klawiatury** we wszystkich elementach obu kart: przycisk belki (`header-toggle`, tytuł „Smug"), paski, odznaki belki, chipy, wiersze i ich przełącznik świateł, ikona wiersza, kafle pokoi, lista chipa (×, zakładki, przycisk zbiorczy, przełączniki, kółka koloru, wiersze, suwak), popup pokoju (×, uchwyt, kafle, player, sceny) i przyciski karty pokoju. Karta jej nie definiuje — ustaw w motywie, na `:host` albo na `ha-card` (wtedy bez popupu karty piętra, patrz wyżej) |
| `--stratum-card-focus-color` | `--primary-color` | starsza nazwa obrysu fokusu — działa, gdy `--stratum-focus` nie jest ustawione |
| `--stratum-focus-ring` | wynik łańcucha wyżej | **wewnętrzny**, nie ustawiaj — karta liczy go sama na `:host` i `ha-card` |
| `--stratum-chip-leak-color` | `--error-color` (bez motywu `#f44336`) | **kolor alarmu w całej karcie**: odznaka ⚠ w belce, wiersz i kafel pokoju (ramka, ikona, odznaka ⚠ N), blok „Aktywne alarmy" karty pokoju, chip wycieku, aktywne czujniki binarne w popupie, hover przycisku ↓ rolety, obwódka nieudanej sceny |
| `--stratum-alarm` | `--stratum-chip-leak-color` → `--error-color` | **wewnętrzny alias** alarmu — ustawiaj `--stratum-chip-leak-color`. Karta definiuje alias na `:host` i `ha-card`, więc jego nadpisanie w card-modzie przegrywa |
| `--stratum-ok` | `--success-color` | spoczynek czujników binarnych w popupie (stan `off`: zamknięte, brak ruchu) i hover przycisku ↑ rolety |
| `--stratum-warn` | `--warning-color` | hover przycisku ■ (stop) rolety |

### Sekcje room-card (od v1.103.0)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-section-sticky` | `static`; w popupie `sticky` | `sticky` przykleja nagłówki sekcji do góry przy przewijaniu. Popup ustawia to sam; na dashboardzie zostaje `static`, żeby nagłówki nie łapały viewportu całej strony. |
| `--stratum-section-sticky-top` | `0px`; w popupie na telefonie (≤ 600 px) = `--stratum-popup-grab-height` | odległość przyklejonego nagłówka sekcji od góry. W popupie na telefonie nagłówek staje pod uchwytem arkusza, a nie pod nim — inaczej master-switch świateł w nagłówku był zasłonięty paskiem uchwytu. |
| `--stratum-room-header-pad-right` | `0px`; w popupie `62px` | rezerwa z prawej w headerze pokoju **i** w nagłówkach sekcji na przycisk × popupu. Bez niej przyklejony nagłówek wjeżdżał pod ×, a tap w master-switch zamykał popup. |
| `--stratum-popup-grab-height` | `24px` | wysokość uchwytu arkusza popupu (tylko telefon, ≤ 600 px). Jeden token — o tyle samo schodzą w dół przyklejone nagłówki sekcji. Ustawiaj w motywie albo na `:host` karty (card-mod) — popup jest rodzeństwem `ha-card`, nie jego dzieckiem, więc zmienna ustawiona na `ha-card` do niego nie dotrze. |

```yaml
# przykład: przyklejone nagłówki także w karcie na dashboardzie
card_mod:
  style: |
    ha-card { --stratum-section-sticky: sticky; }
```

### Karta globalnie (`stratum-card` i `stratum-room-card`)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-card-background` | `--ha-card-background` → `--card-background-color` | tło całej karty (i baza powierzchni, gdy ustawione na `:host` albo w motywie) |
| `--stratum-card-border-radius` | `--ha-card-border-radius` (12px); w stylu belki „Smugi" domyślnie 24px | zaokrąglenie rogów |
| `--stratum-card-color` | `--primary-text-color` | kolor domyślnego tekstu |
| `--stratum-card-divider-color` | `--divider-color` | linia nad listą pokoi (górna krawędź body) i separator między paskiem scen a listą (`::part(body-divider)`) |
| `--stratum-card-body-padding` | `8px` | boczny padding listy pokoi |
| `--stratum-popup-backdrop-filter` | `blur(6px)`; na telefonie (≤ 600 px) `none` | rozmycie dashboardu pod popupem pokoju i listą chipa. Na telefonie arkusz pokoju zakrywa cały ekran, więc rozmycie jest wyłączone (kosztowało płynność przewijania); `blur(6px)` przywraca je wszędzie, `none` wyłącza także na desktopie |
| `--stratum-popup-max-width` | `min(94vw, 720px)`; na telefonie bez limitu | maksymalna szerokość popupu pokoju |
| `--stratum-popup-radius` | `16px` | zaokrąglenie popupu pokoju |
| `--stratum-popup-margin` | `8px` | odstęp popupu pokoju od krawędzi ekranu. W `calc()` — podawaj z jednostką (`0px`, nie `0`) |

Zmienne `--stratum-popup-*` ustawiaj na `:host` (card-mod) albo w motywie —
popup nie leży w `ha-card`.

### Header główny (floor card)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-card-icon-size` | `22px`; w belce „Smugi" `36px` | rozmiar ikony area obok nazwy. Ustawiana inline, gdy w configu jest `header.icon_size` |
| `--stratum-card-icon-color` | `--primary-text-color`; w belce „Smugi", gdy świeci, kolor poświaty | kolor ikony area. Inline z `header.icon_color` |
| `--stratum-card-title-size` | `17px` | rozmiar fontu tytułu. **Zawsze ustawiana inline** na `::part(header)` z `header.title_size` (`sm` 14px · `md` 17px · `lg` 20px), więc wartość z motywu ani z `ha-card` jej nie zmieni. Zmieniaj przez `header.title_size` albo `.header { --stratum-card-title-size: 15px !important; }` w card-modzie |
| `--stratum-card-title-weight` | `500` | grubość tytułu. Inline z `header.title_weight` |
| `--stratum-card-title-color` | `--primary-text-color` | kolor tytułu. Inline z `header.title_color` |
| `--stratum-card-header-padding` | `14px` | pionowy padding belki. Inline z `header.padding` |
| `--stratum-card-accent-bar-color` | `--primary-color` | kolor paska akcentu przy `header.accent_bar` (inline z `header.accent_bar_color`) |
| `--stratum-card-hover-background` | `--stratum-surface-2` | tło belki przy hover (tylko przy myszy, patrz „Hover") |
| `--stratum-card-expander-color` | `--secondary-text-color` | kolor strzałki expandera |
| `--stratum-card-expander-duration` | `280ms` | czas animacji rozwijania |

### Header w stylu „Smugi" (`header.style: stripes`)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-lights` | `--stratum-chip-lights-color` (#ffc107) | kolor „świeci się": paski bez własnego koloru, poświata i ikona belki. Liczony na `:host` — zob. „Gdzie ustawiać zmienne". Kafle i przełącznik nagłówka w karcie pokoju biorą najpierw `--stratum-chip-lights-color`, a ten token dopiero, gdy bazy nie ustawiono nigdzie (`--stratum-tile-lights`) |
| `--stratum-header-glow-color` | `--stratum-lights` | kolor poświaty i ikony belki, gdy na piętrze świeci światło (też z configu: `header.glow_color`) |
| `--stratum-header-icon-radius` | `12px` | zaokrąglenie kwadratu ikony (`header.icon_frame: true`) |
| `--stratum-header-stripe-width` | `44px` (34px, gdy karta jest węższa niż ok. 330px) | szerokość pojedynczego paska |
| `--stratum-header-stripe-bg` | kolor światła w pokoju / `--stratum-lights` | tło paska (ustawiane inline per pasek przy `stripes_color: lights`) |

Chipy w belce „Smugi" dostają większą pigułkę: belka ustawia im
`--stratum-chip-padding: 5px 10px 5px 8px`, `--stratum-chip-font-size: 13px`
i `--stratum-chip-icon-size: 16px`.

### Wiersze pomieszczeń (`stratum-card-room-row`)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-card-room-icon-color` | `--secondary-text-color` | kolor ikony pokoju (inline z koloru ikony pokoju w configu) |
| `--stratum-card-room-hover` | `--stratum-surface-2` | tło wiersza przy hover w stylu `subtle` (tylko klikalny wiersz i tylko przy myszy) |
| `--stratum-row-lights` | `--stratum-chip-lights-color` (#ffc107) | **wewnętrzny alias** koloru przełącznika świateł w wierszu (tor, poświata, licznik). Ustawiaj `--stratum-chip-lights-color` — dociera tu także z `ha-card` |
| `--stratum-row-lights-core` | `--stratum-row-lights` 55% + `--stratum-ink-tint` | wewnętrzny: jasny rdzeń poświaty przełącznika |
| `--stratum-row-lights-ink` | `--stratum-row-lights` 25% + `--stratum-ink-shade` | wewnętrzny: licznik na zapalonym przełączniku |

Wiersze nie mają własnej zmiennej separatora: w presecie `cards` obrys
pigułki bierze `--divider-color` motywu, pozostałe presety stoją na
`gap` bez linii.

### Chipy headera (`stratum-card-chip`)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-chip-accent` | kolor typu chipa | kolor ikony i zabarwienia pigułki aktywnego chipu; tekst licznika dostaje go tylko przez mieszankę (`--stratum-chip-label-color`). Ustawiany inline z koloru chipa — zmieniaj kolor typu (tabela niżej) albo `color` chipa w configu |
| `--stratum-chip-label-color` | 40% `--stratum-chip-accent` + 60% koloru tekstu karty | kolor liczby w aktywnym chipie. Mieszanka jest czytelna w obu motywach (żółty licznik świateł na jasnym motywie miał 1,4:1). **Dawny wygląd — liczba w pełnym kolorze akcentu: `--stratum-chip-label-color: currentColor`** |
| `--stratum-chip-background` | `--stratum-surface-2` (poza kartą Stratum: 93% tła karty + kolor tekstu) | tło pigułki chipu |
| `--stratum-chip-hover-background` | `--stratum-surface-3` (poza kartą: 89% tła karty + kolor tekstu) | tło klikalnego chipu przy hover (tylko przy myszy) |
| `--stratum-chip-padding` | `4px 8px` | wewnętrzny padding |
| `--stratum-chip-radius` | `999px` | zaokrąglenie (999 = pełna pigułka) |
| `--stratum-chip-font-size` | `12px` | rozmiar tekstu chipu |
| `--stratum-chip-icon-size` | `16px` | rozmiar ikony chipu |
| `--stratum-chip-inactive-opacity` | `0.35` | opacity chipa z zerowym licznikiem |
| `--stratum-chip-inactive-color` | `--secondary-text-color` | kolor tekstu chipu nieaktywnego |

Kolory typów chipów — te same zmienne kolorują pola wierszy i kafelków
pokoi oraz listę chipa, tam gdzie dany typ występuje:

| Zmienna | Default |
|---|---|
| `--stratum-chip-lights-color` | `#ffc107` (też baza `--stratum-lights`) |
| `--stratum-chip-motion-color` | `#4caf50` |
| `--stratum-chip-occupancy-color` | `#4caf50` (lista chipa obecności bierze kolor ruchu) |
| `--stratum-chip-windows-color` | `#42a5f5` |
| `--stratum-chip-doors-color` | `#ba68c8` |
| `--stratum-chip-leak-color` | `--error-color` (bez motywu `#f44336`) — chip, lista i wszystkie alarmy karty (patrz „Znaczenia stanów") |
| `--stratum-chip-smoke-color` | `#e53935` |
| `--stratum-chip-gas-color` | `#ff5722` |
| `--stratum-chip-co-color` | `#d84315` |
| `--stratum-chip-problem-color` | `#ff9800` |
| `--stratum-chip-battery-color` | `#ff5252` |
| `--stratum-chip-temperature-color` | `#ffc107` |
| `--stratum-chip-humidity-color` | `#42a5f5` |
| `--stratum-chip-unavailable-color` | `#9e9e9e` (odznaka niedostępnych w belce) |

Bez ustawionej zmiennej lista chipa okien i drzwi bierze nieco inne odcienie
(`#2196f3` / `#9c27b0`) — ustaw zmienną, żeby chip i lista miały ten sam kolor.

### Pasek scen (`stratum-scene-bar`)

Liczba kolumn i proporcja kafla idą z configu (`scenes.columns`,
`scenes.aspect`, domyślnie `16/9`; jawny pasek bez `columns` sam dobiera
liczbę kolumn). Sekcja „Sceny" w popupie, zbudowana ze scen pokoju, ma
domyślnie 3 kolumny (`rooms_scene_columns` albo `columns` sekcji). Pasek
ustawia je inline, więc nie da się ich nadpisać z CSS.

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-scene-gap` | `8px` | odstęp między kaflami |
| `--stratum-scene-radius` | `12px` | zaokrąglenie kafla sceny |
| `--stratum-scene-tile-min` | `150px` | minimalna szerokość kafla w siatce bez `scenes.columns` |
| `--stratum-scene-on-image` | `--stratum-ink-tint` (#fff) | napis i ikona na kaflu (kafel leży na zdjęciu albo gradiencie, więc napis jest zawsze jasny) |
| `--stratum-scene-shade` | `--stratum-ink-shade` (#000) | scrim pod nazwą, cień napisu, podkład pod zdjęciem i kontur obwódek |
| `--stratum-scene-ack-ring` | 92% `--stratum-scene-on-image` | obwódka potwierdzenia po tapnięciu (gaśnie w 0,9 s; stoi, dopóki scena się ustawia) |
| `--stratum-scene-fail-ring` | `--stratum-alarm` | obwódka, gdy HA odrzucił aktywację sceny (klasa `failed`, 1,6 s) |
| `--stratum-scene-vignette` | `#080502` | kolor winiety ciemności sceny (krycie liczone z jasności świateł) |

Tokeny `--stratum-scene-*` (poza `gap`, `radius` i `tile-min`) pasek
definiuje na własnym `:host`. Nadpisuj je selektorem elementu w card-modzie
karty, w której pasek stoi — `stratum-scene-bar { --stratum-scene-shade: … }`
— albo przez `--stratum-ink-tint` / `--stratum-ink-shade` na `ha-card`.
Ustawione bezpośrednio na `ha-card` przegrywają z definicją paska.

Kafel ze zdjęciem ma klasę `photo` i podkład liczony z tła karty — zdjęcie,
które się jeszcze nie wczytało albo nie istnieje, nie zostawia pustej
dziury.

### Tiles sekcji (`stratum-room-tile`)

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-tile-background` | `--stratum-surface-1` | tło kafla (stan nieaktywny) |
| `--stratum-tile-hover-background` | `--stratum-surface-3` | tło kafla przy hover (tylko przy myszy) |
| `--stratum-tile-accent` | `--primary-color`; włączony kafel przełączalny (klasa `toggle`): `--stratum-tile-lights` | akcent ramki/ikony aktywnego kafla. Włączone światło ustawia go inline na swój kolor świecenia |
| `--stratum-tile-lights` | `--stratum-chip-lights-color` → `--stratum-lights` | **wewnętrzny alias** koloru świateł kafla (akcent, pasek jasności kafla grupy, żarówka bez koloru w trybie `ambient`). Kafel liczy go na własnym `:host`, więc `--stratum-chip-lights-color` ustawione na `ha-card` dociera do kafli. Ustawiaj zmienną bazową, nie alias |
| `--stratum-tile-bubble-ink` | 25% akcentu kółka + `--stratum-ink-shade` | kolor glifu na wypełnionym kółku w trybie `bubble`. Ciemny atrament podbarwiony akcentem — biała ikona na żółtym kółku miała ~1,6:1. Motyw z ciemnymi akcentami ustawia tu jasny kolor |
| `--stratum-player-accent` | `--primary-color` | akcent playera: przycisk ⏯, pasek postępu, suwak głośności, stan „wysyłanie" krótkofalówki |
| `--stratum-player-min-height` | `168px` | minimalna wysokość kafla playera (`mode: player`) |
| `--stratum-glight-pad` | `12px` | **wewnętrzna** — padding kafla grupy świateł (rail/tint), z którego liczy się krawędź napisu na pasku jasności. Nie nadpisuj |
| `--stratum-glight-t` | inline, `0`–`1` | **wewnętrzna** — jasność jako ułamek; ustawiana przez kafel w każdej klatce gestu |

Napis na pasku jasności kafla `rail` (klasy `ink-dark` / `ink-light`) kafel
dobiera sam: mierzy w przeglądarce kolor paska (80% krycia) złożony na
własnym tle i bierze ten z dwóch atramentów (`--stratum-ink-shade` /
`--stratum-ink-tint` z domieszką koloru światła), który ma wyższy kontrast.
Dzięki temu działa też z kolorem świateł z motywu i z żarówką bez koloru.

Rząd sterowania playera zawija się w dwa rzędy (transport / głośność), gdy
kafel ma poniżej ~430 px szerokości — to container query na kaflu
(`container: stratum-player`), nie media query, więc działa tak samo w
kolumnie na telefonie i w wąskiej kolumnie sections view.

### Room card — własne

| Zmienna | Default | Opis |
|---|---|---|
| `--stratum-room-padding` | `16px` | padding wewnętrzny room-card |

### Hover

Efekty hover (belka, odznaki belki, chipy, wiersze i kafle pokoi w stylach
`subtle` / `lift` / `glow`, kafle popupu, sceny, lista chipa, × popupu)
działają tylko na urządzeniach z prawdziwym wskaźnikiem —
`@media (hover: hover)`. Na telefonie przeglądarka trzymała `:hover` na
ostatnio tkniętym elemencie i wiersz zostawał podświetlony po zamknięciu
popupu. Wyjątek: paski belki „Smugi" rozjaśniają się przy hover także na
dotyku. Własne reguły `:hover` w card-modzie warto owinąć tak samo.

---

## Shadow parts

Karta nie eksportuje partów z zagnieżdżonych elementów (`exportparts`), więc
`::part(X)` trafia tylko w part leżący **bezpośrednio** w shadow roocie
elementu przed `::part`:

- **Z zewnątrz karty** (motyw, card-mod karty-rodzica, np. stacka):
  `stratum-card::part(header)` — tylko party z kolumny „własne" niżej.
- **Z card-moda samej karty** — `style:` leży już w shadow roocie karty,
  więc jej własne elementy stylujesz zwykłym selektorem (`.header`,
  `.stratum-popup-card`), a party zagnieżdżonych elementów selektorem
  z nazwą elementu: `stratum-card-chip::part(chip)`,
  `stratum-card-room-row::part(room)`, `stratum-scene-bar::part(scene)`.
- Party dwa poziomy niżej (np. kafel `tile` karty pokoju w popupie karty
  piętra) wymagają card-moda z przejściem do shadow rootu (`$`, patrz
  przykład z chipem) albo zmiennych CSS, które dziedziczą się przez
  wszystkie poziomy.

### `stratum-card` (floor) — własne

| Part | Opis |
|---|---|
| `card` | wewnętrzne `<ha-card>` |
| `header` | kontener belki (`<div>`, klasyczna i „Smugi"): padding, tło, hover, pasek akcentu. W belce klasycznej od v1.109.3 to już nie przycisk — nie dostaje fokusu |
| `header-toggle` | przycisk rozwijania belki klasycznej (ikona + nazwa, `aria-expanded`). **Tu jest obrys fokusu** — `::part(header-toggle):focus-visible` |
| `area-icon` | ikona area/floor w headerze |
| `area-icon-wrap` | kwadrat ikony w belce „Smugi" (`header.style: stripes`) |
| `title` | tekst nazwy; w belce „Smugi" to przycisk rozwijania (z fokusem) |
| `chips` | wrapper chipów i odznak belki |
| `expander` | ikona chevron expandera |
| `stripes` | wrapper skośnych pasków w belce „Smugi" |
| `stripe` | pojedynczy pasek (pokój albo „+N") |
| `body` | rozwijana treść pod belką; zwinięta jest `inert` (poza Tabem i czytnikiem ekranu) |
| `body-divider` | linia między paskiem scen a listą pokoi |
| `popup` | tło (`<div>`) popupu pokoju; sam arkusz to `.stratum-popup-card` bez partu (card-mod karty: selektor klasy) |

### `stratum-card` — w zagnieżdżonych elementach

| Part | Element (shadow root) | Opis |
|---|---|---|
| `room` | `stratum-card-room-row` / `stratum-card-room-tile` | pojedynczy wiersz albo kafel pomieszczenia |
| `alarm-badge` | `stratum-card-room-row` / `stratum-card-room-tile` | odznaka ⚠ N przy aktywnym alarmie; ikona = najważniejszy aktywny alarm, klik otwiera listę czujników |
| `chip` | `stratum-card-chip` | chip w belce |
| `scene-bar` | `stratum-scene-bar` | cały pasek scen |
| `scene` | `stratum-scene-bar` | pojedynczy kafel sceny (klasy `photo`, `ack`, `failed`) |
| `chip-list-popup` | `stratum-chip-list` | tło listy encji chipa |

Popup pokoju zawiera `stratum-room-card` — jego party (tabela niżej) z
card-moda karty piętra: `stratum-room-card::part(section)`.

### `stratum-room-card` — własne

| Part | Opis |
|---|---|
| `card` | `<ha-card>` |
| `header` | header z ikoną + tytułem + chipami |
| `room-icon` | ikona area |
| `title` | nazwa pokoju (`role="heading"` — w popupie nagłówek dialogu) |
| `chips` | wrapper chipów |
| `body` | body z sekcjami |
| `alarms` | blok „Aktywne alarmy" |
| `section` | pojedyncza sekcja (summary/lights/...) |
| `section-header` | nagłówek sekcji (ikona + tytuł + licznik) |
| `cover-master` | rząd przycisków „wszystkie rolety". Od v1.109.3 ma 4 px paddingu z ujemnym marginesem (−2px góra/dół, −4px boki) — miejsce na obrys fokusu przycisków; pudełko jest o 4 px szersze z każdej strony |

### `stratum-room-card` — w zagnieżdżonych elementach

| Part | Element (shadow root) | Opis |
|---|---|---|
| `tile` | `stratum-room-tile` | kafelek encji w sekcji (każdy tryb) |
| `player-controls` | `stratum-room-tile` | cały rząd sterowania playera |
| `player-transport` | `stratum-room-tile` | grupa ⏮ ⏯ ⏭ |
| `player-volume-row` | `stratum-room-tile` | grupa głośności: wycisz, −, suwak, +, 🎙 |
| `player-volume` | `stratum-room-tile` | suwak głośności (`<input type="range">`) |
| `scene-bar`, `scene` | `stratum-scene-bar` | pasek scen sekcji „Sceny" |
| `chip` | `stratum-card-chip` | chip w headerze pokoju |
| `chip-list-popup` | `stratum-chip-list` | tło listy encji chipa |

Przykład dla samodzielnej karty pokoju (card-mod tej karty):
`stratum-room-tile::part(player-controls) { … }`.

---

## Przykłady card-mod

Wymaga zainstalowanego [`card-mod`](https://github.com/thomasloven/lovelace-card-mod).

### Zmiana kolorów chipów

`:host`, nie `ha-card` — wtedy kolor świateł dochodzi też do pasków belki
„Smugi", popupu i listy chipa.

```yaml
type: custom:stratum-card
floor_id: parter
card_mod:
  style: |
    :host {
      --stratum-chip-lights-color: #ff5722;
      --stratum-chip-motion-color: #8bc34a;
      --stratum-chip-windows-color: #00bcd4;
    }
```

### Liczniki chipów w pełnym kolorze akcentu (wygląd sprzed v1.109.3)

```yaml
card_mod:
  style: |
    :host { --stratum-chip-label-color: currentColor; }
```

### Kolor obrysu fokusu

```yaml
card_mod:
  style: |
    :host { --stratum-focus: var(--accent-color); }
```

Ten sam efekt dla wszystkich kart: `stratum-focus` w motywie HA.

### Większa, ciemniejsza karta z animowanym obramowaniem przy obecności

```yaml
type: custom:stratum-card
floor_id: parter
header:
  title_size: lg
card_mod:
  style: |
    :host {
      --stratum-card-background: #0f1419;
      --stratum-card-border-radius: 24px;
    }
    ha-card {
      border: 2px solid rgba(76, 175, 80, 0) !important;
      transition: border-color 0.3s ease !important;
    }
    {% if is_state('binary_sensor.parter_motion', 'on') %}
      ha-card {
        border-color: rgba(76, 175, 80, 0.6) !important;
        box-shadow: 0 0 18px rgba(76, 175, 80, 0.25) !important;
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
        @media (prefers-reduced-motion: reduce) {
          .chip.active { animation: none; }
        }
```

### Kompaktowy tryb (mniejsze paddingi i tytuł)

```yaml
header:
  title_size: sm
card_mod:
  style: |
    ha-card {
      --stratum-card-icon-size: 18px;
      --stratum-chip-font-size: 11px;
      --stratum-chip-icon-size: 14px;
      --stratum-chip-padding: 2px 6px;
    }
    .header {
      padding: 8px 12px !important;
    }
```

### Obrys fokusu przycisku belki z zewnątrz

Do v1.109.2 obrys fokusu był na `::part(header)`. Belka klasyczna jest teraz
kontenerem, a fokus dostaje przycisk w środku:

```css
/* było */
stratum-card::part(header):focus-visible { outline-color: gold; }
/* jest */
stratum-card::part(header-toggle):focus-visible { outline-color: gold; }
```

Padding, tło i hover belki dalej stylujesz przez `::part(header)`.

### Full-screen popup zamiast wycentrowanego

```yaml
card_mod:
  style: |
    :host {
      --stratum-popup-margin: 0px;
      --stratum-popup-max-width: 100vw;
      --stratum-popup-radius: 0;
    }
    .stratum-popup-card {
      height: 100% !important;
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
          font-size: 15px !important;
        }
```

---

## Kompatybilność z popularnymi theme'ami

- **Minimalist** — Stratum dziedziczy `--primary-color`, `--divider-color`,
  `--ha-card-*`. Bez override wygląda spójnie.
- **Mushroom** — Stratum nie ingeruje w Mushroom; możesz mieszać karty bez
  konfliktów. Jeżeli chcesz identyczny radius, ustaw
  `--stratum-card-border-radius: 24px`.
- **Default HA** — `ha-card` bierze `--ha-card-background`,
  `--ha-card-border-color`, `--ha-card-border-width` i
  `--ha-card-box-shadow`, a powierzchnie liczą się z tła karty, więc tryb
  jasny/ciemny HA działa out-of-the-box.

---

## Gdzie zgłaszać braki

Jeśli brakuje zmiennej dla czegoś co chcesz zmienić, a nie da się tego zrobić
przez `::part(...)` — otwórz issue w repo z kodem który próbujesz napisać,
dodamy zmienną lub part w kolejnym release.
