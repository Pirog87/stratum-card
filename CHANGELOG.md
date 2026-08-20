# Changelog

Wszystkie znaczące zmiany projektu. Format zgodny z
[Keep a Changelog](https://keepachangelog.com/), wersjonowanie
[SemVer](https://semver.org/).

<<<<<<< HEAD
## [1.79.3] — 2026-08-20

### Fixed
- **Kafle scen nadal ciemne** (sceny „jasne" z brightness ~60–70%
  robiły się brązowe): jasność sceny już NIE mnoży kolorów w dół —
  zamiast tego ustawia podłogę jasności w HSL (bri 100% → L min 0.62,
  bri 0% → L min 0.40, sufit 0.8). Kafle zawsze „świecą" jak w Hue,
  sceny nocne są tylko odrobinę głębsze. Nasycenie: ×1.35, podłoga 0.3,
  sufit 0.85.

## [1.79.2] — 2026-08-20

### Changed
- **Żywsze kolory gradientów scen**: umiarkowany boost nasycenia przez
  HSL (×1,35, sufit 0.85) po przyciemnieniu — ciepłe biele z żarówek CT
  robią się złote zamiast beżowo-błotnistych, kolory RGB dostają lekki
  „hue'owy" punch bez wpadania w neon.

## [1.79.1] — 2026-08-20

### Fixed
- **Czarniawe gradienty mgławicy**: podkładem plam był najciemniejszy
  kolor ×0.4 (prawie czerń) i prześwitywał między plamami niezależnie od
  jasności sceny. Teraz podkład to pełny gradient z kolorów sceny, plamy
  są większe (fade przy 75% zamiast 62%), a krzywa przyciemniania od
  jasności łagodniejsza (100% → pełny kolor, 0% → 55% zamiast 40%).

## [1.79.0] — 2026-08-20

### Changed (auto-gradienty scen)
- **Nowy domyślny styl „Mgławica"** (wybór usera z makiety): rozmyte
  plamy radialne w rogach kafla na ciemnym tle, jak w aplikacji Hue;
  pozycje plam deterministycznie różne per scena. Kafle z gradientem
  renderują nazwę na dole na scrimie (jak przy grafice), bez ikony
  palety.
- **Styl do wyboru**: Mgławica / Ukos / Poświata / Horyzont — globalnie
  w „Ustawieniach ogólnych" (`rooms_scene_gradient`), nadpisanie per
  pasek scen w panelu Sceny (`scenes.gradient`).

## [1.78.0] — 2026-08-20

### Added
- **Globalny rozmiar kafli scen** — „Ustawienia ogólne → Kafle scen —
  rozmiar (globalnie)" (Mały/Średni/Duży, default Mały) obowiązuje w
  popupach wszystkich pomieszczeń; per pokój nadal nadpisuje
  `scenes.size` (edycja pokoju → Sceny → Rozmiar tile). YAML:
  `rooms_scene_size: sm|md|lg`.
- **Auto-gradient kafla sceny (styl Philips Hue)** — scena bez grafiki
  i bez jawnego koloru dostaje tło zmiksowane z kolorów świateł, które
  ustawia (odczyt konfiguracji sceny przez REST, tylko sceny edytowalne
  w UI), przyciemnione proporcjonalnie do średniej jasności sceny.
  Fallback: dotychczasowy kolor akcentu.

## [1.77.1] — 2026-08-20

### Added
- **Przeglądarka „Pliki z www/img"** w edytorze grafik scen: listuje
  katalog `www/img` (z podfolderami) przez media source, siatka
  miniatur z zaznaczeniem, klik = zapis stabilnej ścieżki
  `/local/img/<plik>`. Wymaga jednorazowego wpisu w
  `configuration.yaml`:
  `homeassistant: → media_dirs: → local: /media` + `img: /config/www/img`
  (+ restart HA) — bez wpisu panel pokazuje instrukcję.

## [1.77.0] — 2026-08-18

### Added
- **Galeria HA w edytorze scen** — pod polem „Grafika sceny" zwijany
  panel „Galeria HA": siatka miniatur obrazów z natywnego magazynu
  obrazów Home Assistanta (WS `image/list`) + przycisk „Wgraj nowy
  obraz" (POST `/api/image/upload`). Klik w miniaturę ustawia grafikę
  sceny (`/api/image/serve/<id>/original`). Uwaga: HA nie udostępnia
  listingu katalogu `www/` — pliki z `www/img` trzeba raz wgrać przez
  galerię (albo dalej wpisywać ścieżki `/local/...` ręcznie).

## [1.76.0] — 2026-08-18

### Changed
- **Sesyjne zwijanie zamiast timera**: karta zwija się do stanu
  domyślnego przy wyjściu z widoku (re-render) i przy zejściu do tła
  (wygaszony ekran / inna aplikacja). Dopóki jesteś w widoku,
  rozwinięcie trzyma się bez limitu czasu — koniec ze zwijaniem „pod
  ręką". Timer „Auto-zwijanie po" zostaje jako opcja (np. tablet
  ścienny), domyślnie **wyłączony**.

## [1.75.1] — 2026-08-17

### Changed (popup pomieszczenia)
- **Pasek akcji zbiorczych rolet ukryty domyślnie** (Otwórz / Stop /
  Zamknij / %) — per-roleta ↑■↓ wystarcza; `master: true` w sekcji
  covers przywraca pasek.
- **Sekcje „Drzwi" i „Przełączniki" usunięte z auto-wykrywania** —
  jawna sekcja w configu nadal działa.

## [1.75.0] — 2026-08-17

### Changed (listy chipów)
- **Odwrócona hierarchia tekstu w wierszach**: wyboldowana nazwa
  pomieszczenia u góry, pod spodem mniejsza nazwa urządzenia — w
  światłach dodatkowo z `· %` jasności. Dotyczy wszystkich list
  (obecność, drzwi, okna, światła, rolety…).
- **Widok „Wszystkie" sortowany pomieszczeniami** (ta sama kolejność
  co zakładki, alfabetycznie).

## [1.74.0] — 2026-08-17

### Added
- **5 nowych presetów „Kinkiet"** (grafiki usera, styl Hue): Kinkiet
  ciepły, przygaszony, czerwony, fioletowy, niebieski. Oryginały
  (~230 KB/szt., prawie bezstratne) przekompresowane do WebP q85
  (~13 KB/szt.) — na kaflu ~200 px bez widocznej różnicy.

## [1.73.1] — 2026-08-17

### Changed
- **Nowa grafika sceny „Relaks"** — przytulny salon przy kominku (WebP
  640×360, podmiana wpisu w `scene-photos.ts`).

## [1.73.0] — 2026-08-17

### Changed (grafiki scen)
- **21 fotograficznych grafik scen** (WebP 640×360, styl Philips Hue,
  wygenerowane przez usera) zaszytych w bundlu jako data URI — zastępują
  wbudowane SVG dla 15 scen; nowe warianty jako osobne presety:
  Czytanie 2, TV 2, Impreza 2, Kąpiel ciepła, Kąpiel fiolet, Noc 2.
- Istniejące configi `stratum:<id>` działają bez zmian — te same id
  wskazują teraz zdjęcia. Sceny bez zdjęcia (Praca, Gotowanie, Medytacja,
  Muzyka, Kino, Gaming, Sport, Goście, Bezpieczeństwo) zostają na SVG.
- Nowy generowany moduł `src/scene-photos.ts`; `ScenePreset` ma pola
  `photo`/`svg` (photo wygrywa). Bundle rośnie ~320 KB → ~830 KB
  (jednorazowe pobranie, cache przeglądarki).

## [1.72.1] — 2026-08-17

### Fixed
- **Nieaktualny kolor żarówek** na kaflach świateł i w listach chipów:
  gdy żarówka świeci w trybie temperatury barwowej (ciepła biel), część
  integracji zostawia w `rgb_color` ostatni kolor RGB (np. czerwony).
  Kolor liczymy teraz wg `color_mode` — w trybie `color_temp` z
  `color_temp_kelvin`, `rgb_color` tylko w trybach kolorowych. Wspólny
  helper `lightColorOf()` użyty we wszystkich miejscach (kafle rail/tint,
  ambient, toggle, wiersz pomieszczenia, popup chipów).

## [1.72.0] — 2026-08-17

### Changed (popup list chipów — wariant C)
- **Zakładki pokojów** zamiast nagłówków sekcji: „Wszystkie · N" + per pokój
  z licznikiem; klik filtruje listę do jednego pomieszczenia.
- **Światła / przełączniki / rolety**: duży wiersz — kolorowa okrągła ikona
  (kolor żarówki, klik = more-info), nazwa + „pokój · %", toggle w kolorze
  światła, **gruby suwak** jasności/pozycji pod nazwą.
- **Czujki (obecność, drzwi, okna, wyciek…)**: maksymalnie prosty wiersz —
  ikona, nazwa + pokój, po prawej **czas od zmiany stanu** (16s / 4min / 2h,
  format mushroom). Klik w wiersz = more-info. Pokazywane tylko aktywne.
- **Sticky stopka „Wyłącz wszystkie (N)"** dla sterowalnych — działa na
  aktualnie widoczne (wybrana zakładka), zamiast przycisków per sekcja.

=======
>>>>>>> origin/main
## [1.71.0] — 2026-08-17

### Changed
- **Usunięty zielony ring obecności** na tle ikony pomieszczenia (decyzja
  usera po teście). Obecność pokazuje ikonka statusu po prawej.
- **Ikony statusów po prawej jeszcze większe**: 25 px (fill/pill),
  22 px (pozostałe presety i ikonka obecności).

## [1.70.0] — 2026-08-17

### Changed (wiersz pomieszczenia)
- **Domyślna wysokość wiersza: 85 px** (było 64) — stadion ikony i rozmiar
  ikony skalują się proporcjonalnie; suwak w edytorze pokazuje nowy default.
- **Ikona pomieszczenia koloruje się WYŁĄCZNIE gdy świeci światło** —
  kolorem świateł. Sama obecność (motion) nie barwi już ikony.
- **Większe ikony statusów po prawej** (18 → 22 px w fill/pill, 16 → 20 px
  w pozostałych presetach).

### Added
- **Zielony ring tła ikony przy wykrytej obecności** — stadion ikony
  dostaje zielone obramowanie, gdy w pomieszczeniu jest ruch. Kolor:
  `--stratum-room-row-motion-ring` (default kolor motion #4caf50).

## [1.69.0] — 2026-08-17

### Fixed
- **Zliczanie świateł bez dublowania** — chipy, pola wiersza/kafla i lista
  po kliknięciu chipa liczą oraz pokazują WYŁĄCZNIE encje bezpośrednie;
  grupy-pomocniki są pomijane (jedna świecąca lampka = 1, nie 2). Dotyczy
  też suwaka jasności wiersza i akcji toggle-lights (bez podwójnych
  komend grupa+encja). Jawne `field_entities.lights` bez zmian.

### Changed
- **Sceny: domyślny rozmiar kafla „Mały"** (było „Średni").
- **Odświeżony popup listy chipa** (Włączone światła itd.): szerszy panel
  (do 560 px, radius 20), większe wiersze z okrągłą ikoną 40 px, nazwa
  14.5/600, **gruby suwak jasności z wypełnieniem w kolorze światła**
  i dużym uchwytem (live), większy przełącznik 48×26.

## [1.68.1] — 2026-08-14

### Fixed
- **Wybór „Rozmiar tile" / „Pozycja paska" / „Kolumny" w scenach nie
  znikał już po chwili** — przy liście auto zmiana ustawień globalnych
  emitowała config bez itemów, który cleanup kasował w całości. Teraz
  zmiana tych pól materializuje auto-listę (jak każda inna zmiana).

## [1.68.0] — 2026-08-14

### Fixed (skalowanie widgetów popupu na różnych ekranach)
- **Sceny: responsywna siatka** — bez ustawionych „Kolumn" kafle układają
  się automatycznie (min 150 px, tyle kolumn ile się mieści) zamiast
  puchnąć na pół ekranu dużego telefonu. Jawna liczba kolumn dalej wygrywa.
  Override szerokości: `--stratum-scene-tile-min`.
- **Grupy i encje świateł: auto-dopasowanie kolumn** — siatka
  `auto-fill` wg minimalnej szerokości kafla; na wąskim telefonie 1–2
  kolumny, na szerokim 3–4, koniec kafli na całą szerokość składaka.

### Added
- **Konfigurowalna szerokość i wysokość kafli świateł** — suwaki
  „Min. szerokość kafla" (140–520 px, default 240) i „Wysokość kafla"
  (64–180 px, default 96) w grupie „Grupy świateł pomieszczenia";
  działają na oba bloki świateł. YAML: `tile_min_width` / `tile_height`
  w sekcji lights.

## [1.67.0] — 2026-08-13

### Added
- **Przycisk „wstecz" na Androidzie zamyka popup** zamiast wychodzić
  z widoku — otwarcie popupu pokoju albo listy chipa dopisuje wpis do
  historii przeglądarki (jak natywne dialogi HA), a gest/przycisk wstecz
  cofa o jeden poziom: lista chipa → popup → dashboard. Zamknięcie przez
  × / Escape / tło zdejmuje wpis historii, więc nic się nie rozjeżdża.

## [1.66.0] — 2026-08-13

### Added
- **Sceny piętra pod nagłówkiem karty głównej** — panel „Sceny" karty
  auto-wykrywa teraz sceny ze WSZYSTKICH pomieszczeń piętra (albo obszaru
  przy `area_id`), z pełnym schematem list: oko, nazwa, grafika,
  kolejność, separatory (np. z nazwami pokoi), sceny spoza piętra.
  Pierwsza zmiana utrwala listę i włącza pasek — renderuje się między
  nagłówkiem (np. „Parter") a listą pomieszczeń (`position: top`,
  default) albo pod listą (`bottom`).

## [1.65.0] — 2026-08-13

### Fixed
- **Auto-listy nie pokazują już „pustych" encji** — z auto-discovery
  bloków popupu (i edytorów list) odfiltrowane są encje ukryte lub
  wyłączone w rejestrze HA (`hidden`/`hidden_by`/`disabled_by`), encje
  kategorii config/diagnostic oraz stany `unavailable`/`unknown`.
  Jawnie dodane przez usera pozycje NIE są filtrowane.

## [1.64.0] — 2026-08-13

### Added
- **Separatory w scenach** — jak w pozostałych sekcjach: przycisk „Dodaj
  separator" w edytorze scen (opcjonalny podpis, oko, kolejność, kosz),
  a w popupie linia przecinająca siatkę kafli scen (z podpisem po środku
  lub sama linia). `separator: true` / `label` w YAML sceny.

## [1.63.0] — 2026-08-13

### Added (bubble-card / mushroom jako styl kafli bloków popupu)
- **Przełącznik „Styl kafli"** w blokach Grupy świateł (wspólny ze
  Światłami-encjami), Rolety i Media: **Stratum / Bubble Card / Mushroom**.
  Wybór karty z HACS renderuje każdą pozycję listy tą kartą (z zachowaniem
  kolejności, ukrywania i separatorów). Niezainstalowane karty wyszarzone.
- **Auto-config bubble-card zestrojony z dashboardem usera**: światła jako
  `button_type: slider` z `relative_slide`, `slider_live_update`,
  `light_transition`, tap = more-info; rolety jako `card_type: cover`
  z pozycją; media jako `card_type: media-player`. Mushroom: light z
  brightness control + kolorem światła, cover z przyciskami, media player
  z pełnym sterowaniem.
- Kafle w stylu custom układają się domyślnie w 1 kolumnie (jak u usera).

### Changed
- **Sekcje explicit MERGE'UJĄ się z auto-wykrytymi** (zamiast je zastępować):
  wpis sekcji nadpisuje konfigurację swojego typu, a pozostałe auto-typy są
  doklejane. Wyłączanie bloków: oko przy bloku (popup_order) albo
  `hidden` sekcji.

## [1.62.0] — 2026-08-13

### Added (chipy w stylu mushroom + badge Auto — z YAML usera)
- **Chip obecności z czasem od ostatniej zmiany** („16s" / „5min" / „2h" /
  „1d" zamiast licznika) — `show_last_changed: true`, domyślnie włączone
  dla chipa motion w popupie pomieszczenia. Bursztynowy gdy ruch aktywny.
- **Nowe wbudowane chipy `temperature` i `humidity`** z dynamiczną ikoną
  i skalą kolorów jak w mushroom-template usera: temperatura
  (thermometer-low/high/alert; niebieski → zielony → bursztyn → pomarańcz →
  czerwień), wilgotność (water-off/percent/alert; bursztyn → błękit →
  niebieski → indygo → fiolet). Auto-discovery sensora po device_class
  albo wskazanie `entity`. Domyślne chipy popupu używają nowych typów;
  dostępne też w edytorze chipów („Temperatura", „Wilgotność").
- **Badge „Auto" przy Światłach popupu** — pole „Pomocnik auto-świateł"
  w grupie „Grupy świateł pomieszczenia" (input_boolean / switch /
  automation): badge w nagłówku bloku, czerwony gdy włączony, klik =
  toggle (jak `input_boolean.pomocnik_*_light_auto` w dashboardzie usera).
  YAML: `light_auto_entity` per pokój.

## [1.61.0] — 2026-08-13

### Changed (kafle popupu jak w bubble-dashboardzie usera)
- **Kafel światła (rail)**: poziome wypełnienie NA CAŁĄ WYSOKOŚĆ kafla
  w kolorze światła (solidny blok jak bubble slider — LED przy 86% jest
  w ~86% bursztynowy), nazwa u góry, pod nią stan („86%" / „wyłączono"),
  ikona w ciemnym kółku na dole. Zniknął procent w prawym rogu. Swipe,
  toggle i klik w ikonę (more-info) bez zmian.
- **Roleta = zwarty jeden wiersz**: ikona | nazwa + pozycja % pod nazwą |
  ↑ ■ ↓ jako czyste ikony bez ramek (jak w starym dashboardzie). Klik w
  wiersz = more-info, klik w ikonę = more-info, strzałki sterują.

## [1.60.0] — 2026-08-13

### Fixed (połączone pomieszczenia w edytorach list)
- **Edytory bloków popupu (sceny, grupy świateł, encje światła, rolety,
  media) wykrywają teraz encje ze WSZYSTKICH połączonych obszarów**
  (`merge_with`), nie tylko z primary — np. Sypialnia + garderoba +
  łazienka pokazuje w listach encje trzech obszarów. Popup liczył je tak
  już wcześniej; teraz edytor i popup są spójne.
- Chipy: domyślnie agregują wszystkie połączone obszary (nadrzędny zestaw);
  świadoma zmiana na własne encje — jak dotąd w „Chipy nagłówka".
- Hint przy „Połącz z innymi pomieszczeniami" opisuje tę zasadę.

## [1.59.0] — 2026-08-13

### Added (jeden schemat edycji dla wszystkich bloków popupu)
- **Encje światła / Rolety / Media mają teraz TEN SAM edytor list co Grupy
  świateł**: pełna auto-wykryta lista z obszaru + per pozycja oko
  (ukryj/pokaż), nazwa, ikona, **akcja kliknięcia** (override), kolejność
  strzałkami, usuwanie, **separatory poziome** z podpisem i dodawanie
  encji **spoza obszaru**. Pierwsza zmiana utrwala listę; „Przywróć
  auto-wykrywanie" cofa. (Sceny i Chipy miały już swoje pełne edytory.)
- **Popup renderuje jawne listy**: rolety z paskiem master + kafle wg
  configu; media — pierwszy widoczny (albo wskazany) jako duży player,
  reszta zwinięta; encje światła jako otwarta sekcja wg configu.
- **`tap_action` per pozycja listy** — nadpisuje klik w kafel (toggle);
  klik w ikonę nadal otwiera more-info. Nowe pola YAML per pokój:
  `light_singles`, `covers_list`, `media_list` (format jak `lights`).

## [1.58.0] — 2026-08-13

### Fixed (podział bloków świateł wg intencji usera)
- **„Grupy świateł" = wyłącznie pomocniki „Grupa światła"** — koniec
  fallbacku na wszystkie encje. Obszar bez grup: blok się nie renderuje,
  a edytor pokazuje wskazówkę zamiast zasysać pojedyncze encje.
- **„Encje światła" = WSZYSTKIE pojedyncze światła pomieszczenia** (nie
  tylko „poza grupami"). Gdy pokój ma grupy — zwinięte pod przyciskiem;
  bez grup — zwykła otwarta sekcja.

### Added
- **Klik w ikonę kafla = domyślna akcja encji HA (more-info)** — na
  kaflach rail/tint i tile ikona przechwytuje klik i otwiera dialog
  encji; reszta kafla dalej robi toggle, swipe dalej steruje jasnością.
- **„Dodaj encje spoza obszaru" we WSZYSTKICH blokach popupu** — nowe
  pickery w blokach Encje światła / Rolety / Media (`popup_extra` per
  pokój, doliczane do auto-list na końcu). Sceny, Grupy świateł i Chipy
  miały już własne pickery bez ograniczenia do obszaru; w „Dodatkowych
  sekcjach" służy do tego pole „Ograniczenie do encji".

## [1.57.0] — 2026-08-13

### Changed (edycja pokoju: zwijane grupy + kolejność bloków popupu)
- **Wszystkie grupy edycji pokoju domyślnie ZWINIĘTE** — panel pokoju to
  teraz czytelna lista: Ogólne · Chipy nagłówka · Sceny pomieszczenia ·
  Grupy świateł pomieszczenia · Encje światła pomieszczenia · Rolety
  pomieszczenia · Media · Dodatkowe sekcje · Zaawansowane (połącz z innymi,
  encje pól, custom CSS).
- **Kolejność bloków popupu jest konfigurowalna** — strzałki przy każdej
  grupie (poza Chipami nagłówka) przestawiają bloki, a **oko włącza/wyłącza
  widoczność** bloku w popupie. Zapis w `popup_order` per pokój; default
  kasowany z configu.
- **Popup renderuje bloki wg tej kolejności**: sceny → grupy świateł →
  encje światła (poza grupami, zwinięte pod przyciskiem) → rolety → media →
  pozostałe sekcje. „Encje światła" to teraz osobny, wyłączalny blok.

## [1.56.0] — 2026-08-13

### Added (pełne zarządzanie światłami popupu — jak sceny)
- **Nowa grupa „Światła popupu"** w edycji pokoju: edytor pokazuje ZAWSZE
  pełną listę — jawną z konfiguracji, a bez niej auto-wykrytą z obszaru
  (grupy-pomocniki jeśli są, inaczej wszystkie encje light). Per pozycja:
  **ukryj okiem**, zmień **nazwę** i **ikonę**, przestaw **kolejność**,
  usuń. Do tego „**Dodaj światło**" (dowolna encja, także spoza obszaru)
  i „**Dodaj separator**" — pozioma linia z opcjonalnym podpisem,
  rozdzielająca kafle w popupie. Pierwsza zmiana utrwala listę;
  „Przywróć auto-wykrywanie" wraca do auto.
- Popup: sekcja Światła renderuje jawną listę z separatorami (kafle rail
  jak dotąd; ukryte pominięte, nazwy/ikony z override'ów).
- `RoomConfig.lights` / `RoomLightsConfig` w YAML.

## [1.55.0] — 2026-08-13

### Fixed (skalowanie popupu na szerokich ekranach)
- **Popup skaluje się rozsądnie**: na telefonie (≤600 px) nadal fullscreen
  z 8 px marginesu, ale na tablecie/desktopie szerokość jest ograniczona
  do `min(94vw, 720px)` (jak dialogi HA), a wysokość dopasowuje się do
  treści — koniec z kaflami rozciągniętymi na pół monitora i pustką na
  dole. Override: `--stratum-popup-max-width`.

## [1.54.0] — 2026-08-13

### Changed (czytelność edycji pokoju)
- **Wyraźny nagłówek edycji pokoju**: przycisk „← Wróć do listy pomieszczeń",
  duży tytuł z badge „EDYTUJESZ POMIESZCZENIE" i linijka „Wszystko poniżej
  dotyczy TYLKO pokoju …". Grupy opisane, czego dotyczą (wiersz na karcie
  vs okno popup po kliknięciu).
- **Grafika sceny bez selektora z uploadem** — proste pole tekstowe z
  podglądem miniatury i instrukcją: plik png/jpg wrzucasz do
  `config/www`, wpisujesz `/local/…` (np. `www/sceny/noc.jpg` →
  `/local/sceny/noc.jpg`) albo pełny URL. Wbudowane grafiki-presety
  bez zmian.

## [1.53.0] — 2026-08-12

### Changed (przebudowa konfiguracji pomieszczenia)
- **Widok szczegółu pokoju zamiast zagnieżdżonych zwijek** — ołówek przy
  pokoju otwiera pełny panel (ze strzałką powrotu) z płaskimi, opisanymi
  grupami: Ogólne · Chipy nagłówka popupu · Sceny popupu · Sekcje popupu ·
  Zaawansowane (łączenie pokojów, encje pól, custom CSS). Koniec z trzema
  poziomami rozwijania.
- **Auto-wykryte sceny obszaru renderują się jako graficzne kafle**
  (scene-bar: grafika/kolor + nazwa) zamiast listy „aktywuj". Explicit
  `mode` w sekcji scen przywraca stare renderowanie.

### Added (pełne zarządzanie scenami — także auto)
- **Edytor scen pokazuje sceny wykryte automatycznie z obszaru** jako
  edytowalną listę — widzisz WSZYSTKIE, możesz każdej zmienić nazwę,
  grafikę (upload / `/local/...`), ikonę, kolejność, **ukryć okiem** albo
  usunąć; da się też dodać scenę spoza obszaru. Pierwsza zmiana utrwala
  listę w konfiguracji; przycisk „Przywróć auto-wykrywanie" wraca do auto.
- `hidden` w konfiguracji sceny + miniatury grafik na liście edytora.

## [1.52.0] — 2026-08-12

### Added (popup pomieszczenia — krok 3 redesignu)
- **Pasek akcji zbiorczych rolet** nad listą w sekcji Covers: Otwórz /
  Stop / Zamknij + szybkie pozycje % (default 50 i 75) — działa na
  WSZYSTKIE rolety sekcji naraz (jak w dashboardzie usera). Wyłączenie:
  `master: false`; własne pozycje: `positions: [30, 60]`.
- Edytor sekcji (Covers): przełącznik „Pasek akcji zbiorczych" i pole
  „Szybkie pozycje (%)" z możliwością własnych wartości.

## [1.51.0] — 2026-08-12

### Added (popup pomieszczenia — krok 2 redesignu)
- **Sekcja Media = jeden duży player z okładką** (default, mode `player`):
  okładka (entity_picture) jako tło z gradientem, tytuł i artysta, pasek
  postępu, przyciski poprzedni / play-pauza / następny + suwak głośności.
  Klik w okładkę = more-info. Bez okładki — kompaktowa neutralna karta.
- **Auto-wybór głównego odtwarzacza**: playing > pauza > włączony >
  pierwszy dostępny. Ręczny wybór: pole „Główny odtwarzacz" w edytorze
  sekcji (`entity` w YAML). Pozostałe odtwarzacze (w tym unavailable,
  posortowane wg stanu) w zwijanym „Pozostałe odtwarzacze (n)".
- Edytor sekcji: tryb „Player" (default) na liście trybów media; preset
  „Media — Player". `mode: tile` przywraca starą płaską listę.

## [1.50.0] — 2026-08-12

### Changed
- **Popup pomieszczenia jest niemal fullscreen** — 8 px marginesu z każdej
  strony (mobil, tablet, desktop), karta wypełnia całą wysokość ekranu.
  Override: `--stratum-popup-margin`, `--stratum-popup-max-width`,
  `--stratum-popup-radius`.
- **Przycisk × nie nachodzi na chipy** — neutralny półprzezroczysty krążek
  (zamiast koloru primary), a header karty pokoju dostaje rezerwę
  `--stratum-room-header-pad-right`, więc chipy kończą się przed krzyżykiem.

### Added (konfiguracja per pomieszczenie)
- **„Chipy popup pomieszczenia"** — nowy panel w edycji pokoju (sekcja
  Pomieszczenia): pełne zarządzanie chipami nagłówka popupu per pokój
  (które, w jakiej kolejności, własne encje/kolory). Puste = automatyczne.
- **Grafika sceny przez upload lub ścieżkę** — pole „Obraz" w scenach używa
  selektora obrazu HA: wgraj plik z dysku (trafia do storage HA) albo wpisz
  ścieżkę serwera `/local/...`. Nazwy i kolejność scen per pokój — jak dotąd
  w panelu „Sceny popup pomieszczenia".

## [1.49.0] — 2026-08-12

### Added (popup pomieszczenia — krok 1 redesignu)
- **Światła jako GRUPY z pomocników** — sekcja `lights` w popupie wykrywa
  light-grupy (pomocniki „Grupa światła") przypisane do obszaru i pokazuje
  TYLKO je; encje-składowe są chowane automatycznie. Światła spoza grup
  lądują w zwijanym przycisku „Pozostałe światła (n)". Wyłączenie:
  `group_by: none` w configu sekcji.
- **Nowe kafle świateł `rail` i `tint`** (default dla widoku grup: `rail`):
  - `rail` — pionowy pasek jasności z lewej w kolorze światła, ikona
    w ciemnym kółku (jak dashboard bubble-card usera)
  - `tint` — tło kafla podbarwione kolorem światła + pasek jasności na dole
  Oba: tap = toggle, **swipe poziomy = jasność** (live), long-press /
  prawy klik = more-info (dla grupy HA pokazuje listę składowych).
- Edytor sekcji: tryby „Rail" i „Tint" na liście trybów świateł; nowy preset
  „Światła — Grupy" w presetach sekcji.

## [1.48.0] — 2026-08-12

### Fixed
- **Fill znów od lewej krawędzi wiersza** — warstwa jasności „oblewa"
  neutralny stadion ikony (jak w bubble-card), cofnięty offset z 1.47.
  Tło stadionu pozostaje neutralne — poprawka koloru z 1.47 zostaje.

### Added
- **Nowe akcje kliknięcia**: `popup` (otwórz popup pokoju) i
  `toggle-lights` (przełącz światła pokoju: cokolwiek świeci → zgaś
  wszystkie, inaczej zapal wszystkie).
- **Osobna akcja kliknięcia w ikonę** — `room_icon_tap_action` (globalnie)
  i `icon_tap_action` (per pokój). Gdy ustawiona, klik w stadion ikony nie
  odpala akcji wiersza — np. ikona → popup, wiersz → przełącz światła.
- **Edytor: sekcja „Wygląd — Wiersz"** ma teraz dwie grupy chipów:
  „Klik na wiersz" (Popup domyślnie / Przełącz światła / Nic /
  Niestandardowa…) i „Klik na ikonę" (Tak jak wiersz / Popup pokoju /
  Przełącz światła / Nic / Niestandardowa…). „Niestandardowa" otwiera
  pełny selektor akcji HA. Formularz akcji zniknął z „Ustawień ogólnych"
  (jedno źródło prawdy).

## [1.47.0] — 2026-08-11

### Fixed
- **Tło stadionu ikony jest zawsze neutralne** — nie przejmuje już koloru
  świateł w stanie aktywnym (jak w bubble-card). Kolorem sygnalizują sama
  ikona i warstwa wypełnienia; czerwony tint alarmowy zostaje.
- **Koniec kolorowych „półksiężyców" wokół stadionu** — warstwa fill
  (jasność świateł) startuje teraz ZA stadionem ikony zamiast pod nim,
  więc nie prześwituje wokół jego zaokrągleń. Prawa krawędź fill nadal
  wypada dokładnie na X% szerokości wiersza; bez ikony fill biegnie od
  lewej krawędzi jak dotąd.

### Changed
- **Akcja kliknięcia w wiersz dostępna w sekcji „Wygląd — Wiersz"** —
  selektor `room_tap_action` (Przejdź / Więcej info / Wywołaj serwis /
  Nic itd.) jest teraz na górze panelu wyglądu wiersza, nie tylko w
  „Ustawieniach ogólnych". To samo pole — zmiana w jednym miejscu widoczna
  w obu. Per-pokój nadal nadpisujesz w sekcji „Pomieszczenia".

## [1.46.0] — 2026-08-11

### Changed (defaulty wg preferencji usera)
- **`status_layout: 'right'` jest teraz domyślne** (jedna linia, wszystkie
  statusy po prawej). „Dwie linie" pozostaje jako opcja.
- **Wysokość wiersza domyślnie 64 px** (było 72) — cała geometria stadionu
  i ikony skaluje się.
- **Domyślne pola bez Dymu i Gazu/CO** — zestaw: temperatura, światła,
  obecność, okna, drzwi, wyciek, problem. Dym/Gaz dostępne jednym
  kliknięciem w „Pola w sekcji info".
- **Węższe boczne marginesy body karty** (16 → 8 px, konfigurowalne przez
  `--stratum-card-body-padding`) — wiersze-suwaki dochodzą bliżej krawędzi
  karty, mniej martwej przestrzeni po bokach.

## [1.45.1] — 2026-08-11

### Fixed
- **Suwak „Wysokość wiersza" wyniesiony na wierzch** sekcji „Wygląd — Wiersz"
  (obok presetu i układu statusów) — był zakopany w zwijanym panelu
  „Wymiary i zaokrąglenia". Zakres 40–120 px, default 72. Cała geometria
  (stadion ikony, rozmiar ikony) skaluje się proporcjonalnie.

## [1.45.0] — 2026-08-11

### Added
- **`row_config.status_layout`** — wybór układu statusów dla fill/pill:
  - `two-line` (default) — temp/wilgotność/motion w sublinii pod nazwą,
    po prawej tylko liczniki i alarmy
  - `right` — jedna linia, wszystkie statusy po prawej (max 4 + „+n")
  W edytorze „Wygląd — Wiersz" jako chipy „Dwie linie / Wszystko po prawej".
- Nazwa pokoju w układzie jednoliniowym fill/pill zachowuje typografię 17 px/600.

## [1.44.0] — 2026-08-11

### Changed (wdrożenie makiety A″ wariant C — wybór usera)
- **Layout dwuliniowy dla fill/pill:** nazwa (17 px/600) + sublinia pod nią
  (temperatura · wilgotność · ikona motion, 12 px wyciszone). Prawa strona
  wiersza pokazuje tylko liczniki i alarmy (max 3 + „+n") — koniec z pustą
  przestrzenią w środku wiersza.
- **Ikona w spłaszczonym stadionie zakotwiczonym na dole** (jak bubble
  100×80/r40): wysokość = 4/5 wiersza, szerokość 1.35× wysokości stadionu,
  dolna krawędź flush z dołem pigułki. Górna ćwiartka wiersza zostaje
  „lekka". Ikona = 1/2 wysokości stadionu (mniejsza niż dotąd).
- Default `min_height` wiersza: **72 px** (suwak w edytorze pokazuje
  właściwy default per tryb: 72 row / 110 tile).
- Rail i cards zachowują klasyczny jednoliniowy layout.

## [1.43.0] — 2026-08-11

### Fixed
- **Fill nie prześwituje już jako „kleks" pod ikoną przy niskiej jasności.**
  Koło ikony jest teraz nieprzezroczyste (mix koloru karty z czernią) —
  wypełnienie chowa się ZA nim i wynurza dopiero na prawo od koła,
  dokładnie jak slider w bubble-card.

### Changed
- **Skala bubble jako default dla fill/pill** (porównanie side-by-side
  z konfiguracją bubble-card usera: 80 px wiersze, 50 px ikony, nazwa 24 px):
  - wysokość wiersza 56 → **64 px** (koło ikony rośnie razem z nią)
  - ikona proporcjonalna **0.5×** koła (32 px przy default)
  - nazwa pokoju **16 px / 600** (było 14/500)
  - statusy 13 px, ikony statusów 18 px
  Wszystko dalej konfigurowalne: `min_height`, `icon_size` w edytorze.

## [1.42.0] — 2026-08-11

### Fixed (geometria fill po porównaniu z bubble-card)
- **Koło ikony = pełna wysokość wiersza, flush z lewą krawędzią pigułki**
  (jak bubble-card) — koniec z ikoną „pływającą" w za dużym kole z insetem.
- **Ikona proporcjonalna do koła (0.46×)** zamiast sztywnych 24 px —
  brak croppingu przy każdej wysokości wiersza; explicit `icon_size`
  nadal wygrywa. `overflow: hidden` na kole ucina wszelkie glow/efekty.
- **Wypełnienie fill to zdecydowany blok koloru** (20% + jaśniejszy „cap"
  2 px na prawej krawędzi jako wskaźnik poziomu) zamiast rozmytego
  gradientu-mgławicy. Min-szerokość = średnica koła, więc niska jasność
  nie renderuje „ogryzka".
- Usunięte podwójne odstępy (margin-bottom wierszy nakładał się
  z gap siatki).

## [1.41.0] — 2026-08-11

### Changed
- **Akcent ze świateł jest teraz DOMYŚLNY.** Bez konfiguracji wiersz/kafel
  bierze kolor z `rgb_color` pierwszej świecącej żarówki. Ustawienie
  `accent_color` przełącza na kolor statyczny; toggle „Z świateł" w
  edytorze pozwala wymusić dowolną kombinację.
- **Geometria pigułki (fill/pill) policzona na sztywno:** koło ikony =
  wysokość wiersza − 8 px (48 px przy default 56 px), inset 4 px z każdej
  strony — ikona zawsze idealnie wpisana, przy każdej wysokości.
  Ikona MDI w pigułce: 24 px (było 20).

### Added
- **Suwak jasności gestem (jak bubble-card slider).** Przeciągnięcie
  poziome po wierszu ustawia jasność wszystkich świateł pokoju:
  - relative slide — start od aktualnej średniej jasności
  - live update co 300 ms podczas gestu + finalna wartość po puszczeniu
  - wypełnienie `fill` podąża za palcem
  - przeciągnięcie do ~0% wyłącza światła
  - próg 8 px odróżnia gest od tapnięcia; pionowy scroll działa normalnie
    (`touch-action: pan-y`)
  - wyłączane per karta: `row_config.slider: false` (toggle w edytorze)

## [1.40.0] — 2026-04-20

### Changed
- **Nowy domyślny wygląd wiersza pokoju: preset `fill`** (z makiet redesignu).
  Pigułka z okrągłą ikoną 44 px i wypełnieniem tła = **średnia jasność
  włączonych świateł w pokoju** (0–100%, subtelny gradient amber).
  Kolor niesie informację, nie dekoruje.
- Cztery presety kształtu wiersza: `row_config.preset`:
  - `fill` (default) — pigułka z wypełnieniem jasności
  - `pill` — pigułka z ringiem aktywności
  - `rail` — dawny płaski wygląd z paskiem akcentu z lewej
  - `cards` — miękkie karty z gradient-tintem
  Wybór chipami w edytorze „Wygląd — Wiersz" → „Kształt wiersza".
- **Limit 4 statusów w wierszu + „+n".** Alarmy (dym > gaz > wyciek > problem)
  mają najwyższy priorytet i nigdy nie są ucinane. Stała kolejność
  wyświetlania: temperatura → wilgotność → światła → ruch → okna → drzwi → alarmy.
- Alarmy sygnalizowane na poziomie wiersza: czerwony tint ikony + ring
  (fill/pill), czerwony pasek (rail), czerwony border (cards).

### Fixed (quick-wins z audytu)
- **Nagłówek karty nie rozjeżdża się na wąskim ekranie** — tytuł dostał
  `min-width: 0` + ellipsis, chipy przewijają się poziomo zamiast łamać layout.
- **Wiersz pokoju ma min. 48–54 px wysokości** (dotąd ~34 px) — touch targets OK.
- **Przycisk × popupu jest sticky** — nie odjeżdża przy przewijaniu treści.

### Build
- **Bundle −58 KB (305 → 247 KB).** Nowy krok builda minifikuje wnętrza
  template literals (`css`/`html`), których Terser nie dotyka —
  sam whitespace wcięć CSS ważył ~45 KB.

## [1.39.0] — 2026-04-20

### Added
- **Alert chips i pola inspirowane room-summary-card:**
  - Nowe built-in chipy: `smoke` (dym), `gas` (gaz + carbon_monoxide),
    `co` (tylko CO), `problem` (agregator problem + safety + tamper),
    `battery_low` (binary_sensor battery w stanie on = niska)
  - Nowe `TileField`: `smoke`, `gas`, `problem` — wiersz/kafel pokoju
    pokazuje aktywne alarmy (kolorowe liczniki, tylko gdy > 0)
  - Wsparcie w conditions editorze (reguły stylu na alarmy),
    field_entities override i popup listy chipa
- Wszystkie nowe chipy w quick-pick menu „Dodaj chip", domyślnie
  `show_when_zero: false` (alarm-only).

### Fixed
- Wiersz (row) nie dostawał liczników `leak` — przekazywane były tylko
  do kafla. Teraz oba tryby dostają pełny zestaw alertów.

## [1.38.0] — 2026-04-20

### Changed
- **Scene preset SVGs przeprojektowane w stylu Philips Hue.** Zamiast
  literalnych symboli (kubek kawy, pad gamingowy, rolka filmu itp.) każda
  scena to atmosferyczna kompozycja barwna oddająca *nastrój oświetlenia*:
  - Wielowarstwowe radialne/liniowe gradienty
  - Miękkie orby światła z fadeout opacity
  - Spójna paleta inspirowana Hue (Poranek, Wieczór, Noc, Medytacja, Disco,
    Gaming, Kino, Kąpiel itd.)
  - Subtelne gwiazdy dla „Noc", ripple dla „Kąpiel", multi-color spots
    dla „Impreza", neon split dla „Gaming"
- 24 sceny zachowują te same `id` + `label` — istniejące configi
  `image: 'stratum:noc'` działają bez zmian, zmienia się tylko wygląd.

## [1.37.0] — 2026-04-20

### Changed
- **Wizualny mode picker w edytorze sekcji.** Zamiast tekstowego dropdowna
  (Tryb wyświetlania → Tile / Slider / Bubble / …) edytor pokazuje teraz
  grid presetów pasujących do typu sekcji. Klik przełącza tryb + aktualizuje
  `card_template` z presetu.
  - Aktywny preset: checkmark ✓ + niebieski border + tinted bg
  - Presety HACS niedostępne: wyszarzone z labelem „Brak: mushroom-…"
  - Gdy user ma tryb spoza presetów → warning hint „Aktualny tryb: xxx"
- `summary` zachowuje klasyczny dropdown (cards/chips są specyficzne i nie
  trafiają do section-presets).

## [1.36.0] — 2026-04-20

### Added
- **Presety sekcji** — gotowe szablony dodawane jednym kliknięciem.
  Editor sekcji popup pokoju ma teraz przycisk „Dodaj sekcję z presetu"
  który rozwija grid prestów pogrupowanych w 4 kategorie:
  - **Wbudowane (Stratum)** — Światła tile/slider/ambient, Rolety tile/slider,
    Sceny, Okna chips, Drzwi chips, Przełączniki, Klimat, Media, Wentylatory
  - **Mushroom (HACS)** — Light, Cover, Climate, Media, Fan, Entity
    (z prekonfigurowanym `card_template`: fill_container, use_light_color,
    show_brightness_control, collapsible_controls itd.)
  - **Bubble Card (HACS)** — Lights, Covers, Climate, Media
    (z prekonfigurowanym `card_type` + buttons/slider)
  - **Inne** — Podsumowanie, Custom YAML
- Presety wymagające zainstalowanej karty HACS są **markowane jako
  niedostępne** (wyszarzone + label „Brak: mushroom-light-card") gdy
  odpowiednia paczka nie jest w `window.customCards`.
- Kolorowe avatary per kategoria (amber / purple / blue / green).

### Changed
- Typ `RoomSectionConfig.mode` rozszerzony o template literal type
  `custom:${string}` — TypeScript teraz poprawnie akceptuje dowolne
  `custom:xxx` mode.

## [1.35.0] — 2026-04-20

### Added
- **`card_template` per sekcja** — gdy user wybiera `mode: 'custom:xxx'`
  (np. `custom:mushroom-light-card`), może teraz przekazać dodatkowe pola
  YAML które są merge'owane z auto-configiem per encja:
  ```yaml
  sections:
    - type: lights
      mode: custom:mushroom-light-card
      card_template:
        fill_container: true
        use_light_color: true
        icon_color: amber
        secondary_info: last-changed
  ```
  Każda żarówka dostaje konfig `{fill_container: true, use_light_color: true,
  icon_color: amber, secondary_info: last-changed, type: custom:mushroom-light-card,
  entity: <własny>}`. `type` i `entity` z auto-config zawsze wygrywają.
- Sections editor: `<ha-yaml-editor>` dla `card_template` pokazuje się
  automatycznie gdy user wybierze mode `custom:xxx`. Dla `type: custom`
  nadal dostępny pełny YAML karty (bez iteracji).

## [1.34.0] — 2026-04-20

### Changed
- **Fallback tile polish** (stratum-room-tile) — gdy user nie przypisuje
  custom HACS card do sekcji, domyślny tile wygląda lepiej:
  - Ikona w kolorowym kafelku 36×36 (tinted bg gdy aktywna)
  - Active light bierze `rgb_color` żarówki jako akcent (tło + ikona)
  - Brightness bar (3px line) na dole gdy światło on
  - Position bar dla cover (0-100%)
  - Przyciski cover (↑/⏹/↓) z hover-color (zielony/pomarańcz/czerwony)
  - Active press animation (scale 0.98)
- Switch / fan: kompaktowy iOS-style toggle po prawej (mini-toggle).

### Note
Dedykowany redesign popupu pokoju (mushroom-style natywnie) został
porzucony na rzecz szerszego wsparcia dla HACS cards w przyszłych
wersjach. Budowanie sekcji z `custom:mushroom-light-card` / `custom:bubble-card`
już teraz jest wspierane — per tile `mode: 'custom:xxx'` i per sekcja
`type: custom, card: {...}`.

## [1.33.0] — 2026-04-20

### Changed
- **Spójne ikony i kolory** dla pól windows/doors/leak w całej karcie:
  - Ikona okien: `mdi:window-open-variant` (było: różne w chipie i wierszu)
  - Ikona drzwi: `mdi:door-open`
  - Ikona wycieku: `mdi:water-alert`
- **Kolorowanie pól** w wierszu/kaflu pokoju:
  - 🪟 Okna — niebieski (`--stratum-chip-windows-color`)
  - 🚪 Drzwi — fioletowy (`--stratum-chip-doors-color`)
  - 💧 Wyciek — czerwony (`--stratum-chip-leak-color`)
  - 💡 Światła — amber (było)
  - 🏃 Motion — zielony (było)
- Chip kolor drzwi zmieniony z niebieskiego na fioletowy — żeby wizualnie
  odróżniał się od okien w nagłówku.

## [1.32.0] — 2026-04-20

### Added
- **`leak` jako `TileField`** — wiersz / kafel pokoju pokazuje teraz
  liczbę aktywnych czujek wycieku (ikona `mdi:water-alert`, czerwony).
- Display editor i conditions editor: nowe pole „Wyciek" w chipach wyboru.
- Rooms editor: override encji `leak` w panelu „Encje pól".

### Changed
- **Domyślny zestaw chipów**: 5 built-in (lights, motion, windows, doors, leak)
  zamiast 4. Spójnie na karcie głównej floor-a i w popup pokoju.
- **Per-typ `show_when_zero`:**
  - `lights` / `motion` — zawsze widoczne (nawet gdy 0)
  - `windows` / `doors` / `leak` — znikają gdy wartość 0 (alarm-only)
  To samo zastosowane w quick-pick menu „Dodaj chip" — nowe okna/drzwi/wyciek
  startują z `show_when_zero: false`.
- **Domyślny zestaw pól row/tile** rozszerzony o windows, doors, leak.
  Każde pole renderuje się tylko gdy ma wartość > 0, więc „lista z zapasem"
  nie zaśmieca wierszy spokojnych pokoi.
- Room card: chip visibility teraz respektuje `show_when_zero` (filtrowanie
  tak jak w głównej karcie).

## [1.31.0] — 2026-04-20

### Fixed
- **`device_class` user override (właściwy fix).** W v1.30 próbowaliśmy
  czytać `hass.entities[id].device_class`, ale HA na frontzie eksponuje
  tylko `EntityRegistryDisplayEntry` — bez `device_class`. Pełny
  entity registry dostępny jest tylko przez WebSocket
  (`config/entity_registry/list`).
  - Nowy moduł `entity-registry-cache` fetchuje pełny registry przez
    `hass.callWS` przy montowaniu karty
  - Subskrybuje `entity_registry_updated` event — zmiany w HA UI
    są widoczne live
  - `filterBinarySensorDeviceClass` używa tego cache jako 3. fallback
- Skutek: okna / drzwi z ustawionym „Pokaż jako klasę urządzenia"
  w Entity Options (np. SATEL Integra, ESPHome custom) są wreszcie
  wykrywane w chipie i wierszu pokoju.

## [1.30.0] — 2026-04-20

### Fixed
- **`device_class` user override (Entity Options → „Pokaż jako klasę
  urządzenia") nie był czytany.** Niektóre integracje (np. SATEL Integra)
  nie aktualizują `state.attributes.device_class` po zmianie w UI,
  tylko `hass.entities[id].device_class`. Teraz `filterBinarySensorDeviceClass`
  sprawdza oba źródła + `original_device_class` — okno oznaczone w HA
  jako „Okno" wreszcie pojawia się w chipie `windows` i row pokoju.
- **Toggle „Pokazuj też gdy wartość 0" nie działał.** Chip był renderowany
  zawsze niezależnie od flagi. Teraz:
  - `show_when_zero: true` (default) → chip zawsze widoczny
  - `show_when_zero: false` → chip znika gdy `active=false` / wartość 0
- Edytor form pokazuje toggle `show_when_zero` jako ON zgodnie z rzeczywistym
  defaultem. Zapis do YAML pomija wartość `true` (default — niepotrzebny szum).

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
