# Decyzje projektowe — stratum-card

Format ADR (Architecture Decision Record). Każda decyzja: co, dlaczego,
alternatywy odrzucone. Nie zmieniaj retroaktywnie — dopisuj nowe ADR-y
gdy zmieniasz kurs.

---

## ADR-000: Nazwa — Stratum

**Decyzja:** Nazwa karty to `stratum-card` (custom element), public name
„Stratum".

**Dlaczego:**
- Łacińskie _stratum_ = warstwa, geologiczna bądź społeczna hierarchia
- Metafora idealna: dom ma warstwy (piętra, strefy), każda warstwa ma
  swoje pomieszczenia — karta to eksponuje
- Krótka (8 znaków), niekolizyjna w ekosystemie HACS, brzmi technicznie
  bez bycia przezabawnym

**Alternatywy odrzucone:**
- _Matryoshka_ — silna metafora zagnieżdżenia, ale długie, trudne do wpisania
- _Atrium_ — architektonicznie trafne, ale zbyt konkretne (atrium to tylko
  jeden typ pomieszczenia)
- _Origami_ — ładne, ale oderwane od semantyki (composing vs unfolding)
- _Area card_ (pierwotna robocza nazwa) — opisowe, nijakie, trafia w tysiące
  wyników w HACS search

---

## ADR-001: Custom card, nie integracja

**Decyzja:** Budujemy custom Lovelace card w TypeScript/Lit, nie Python
integrację Home Assistant.

**Dlaczego:**
- Cel jest wizualny — podsumowanie UI dla area
- Custom card ma dostęp do `hass.areas`, `hass.entities`, `hass.devices` —
  może client-side agregować wszystko czego potrzebuje
- Zmiany w card nie wymagają restartu HA (tylko odświeżenia przeglądarki)
- Prostsze dystrybuowanie przez HACS

**Alternatywa odrzucona:** Integracja Python która expose sensory
`sensor.area_parter_lights_on` etc. Plus: automatyki mogą z tego korzystać.
Minus: wymaga restartu przy zmianach, więcej kodu, osobny język.

**Furtka:** Jeśli kiedyś okaże się że agregaty są potrzebne w automatykach,
dodamy **osobny** companion integration. Card i integration żyją niezależnie.

---

## ADR-002: Lit, nie vanilla JS ani React

**Decyzja:** Framework komponentowy Lit 3.

**Dlaczego:**
- Standard w ekosystemie HA custom cards (mushroom, bubble, button-card)
- Mały bundle (~8KB Lit vs ~45KB React)
- Native Web Components — zero Shadow DOM friction z HA
- Świetna integracja z TypeScript i dekoratorami

**Alternatywa odrzucona:** vanilla JS z template literals — mniejsza bariera
wejścia dla contributors, ale brak reaktywności wymusza ręczne DOM updates
i ręczny DX dla state.

---

## ADR-003: TypeScript strict

**Decyzja:** `strict: true` + `noUnusedLocals` + `noImplicitReturns`.

**Dlaczego:**
- HA `hass` object jest skomplikowany (areas, entities, devices, states) —
  type-safety chroni przed cichymi błędami
- Złapanie `undefined` w chipach jest krytyczne (inaczej user zobaczy `NaN`
  w liczniku świateł)

---

## ADR-004: Customization API — trzy warstwy

**Decyzja:** User może customizować wygląd karty na trzech poziomach,
od najprostszego do najbardziej zaawansowanego:

1. **Config YAML** — `name`, `icon`, `chips`, `rooms` — 80% przypadków
2. **CSS variables** — `--stratum-card-background`, `--area-chip-color` etc. —
   dla zmiany kolorów / rozmiarów bez pisania JS
3. **Shadow parts** — `::part(card)`, `::part(header)`, `::part(chip)` —
   dla pełnej zmiany layoutu przez `card-mod`

**Dlaczego:**
- Typowy user zatrzyma się na warstwie 1
- Power user (sam autor repo) będzie chciał warstwy 2–3
- Trzy warstwy pozwalają na proporcjonalną inwestycję złożoności

> Status: zmienne mają prefix `--stratum-` (nazwy `--area-*` nie istnieją).
> Party zagnieżdżonych elementów (`chip`, `room`, `tile`, `scene`) nie są
> eksportowane przez `exportparts` — co jest osiągalne skąd, opisuje
> `docs/styling.md`.

---

## ADR-005: Bundling — dwa samodzielne pliki ES: dashboard + edytory na żądanie

**Status:** od v1.110.0 (PKG-3). Zastępuje pierwotną decyzję „jeden plik"
(zachowana niżej, w „Historii").

**Decyzja:** Rollup buduje dwa niezależne, samodzielne pliki ES:

| Plik | Wejście | Co zawiera | v1.110.0 (surowy / gzip -9) |
|---|---|---|---|
| `dist/stratum-card.js` | `src/stratum-card.ts` | obie karty, cały runtime dashboardu, słowniki `pl.ts`/`en.ts` | 340 618 B / 89 329 B |
| `dist/stratum-card-editors.js` | `src/editors-entry.ts` | wszystkie edytory (`*-editor.ts`), ich słowniki `editor-pl.ts`/`editor-en.ts`, style i helpery tylko-edytorowe — plus własne kopie `lit`, słowników karty `pl.ts`/`en.ts` i wspólnych helperów (`tap-action`, `area-entities`, `tile-data`, `room-sections`, `scene-presets`, `custom-cards`…) | 278 217 B / 69 584 B |

Dla porównania v1.109.3 (jeden plik): 573 094 B / 142 059 B. Dashboard
pobiera i parsuje o ~41% mniej (gzip −37%).

- Użytkownik dalej dodaje **jeden** zasób Lovelace (`stratum-card.js`).
  Plik edytorów nie jest zasobem — ładuje go `loadEditor()`
  (`src/editor-loader.ts`) z `getConfigElement()` obu kart, czyli dopiero
  przy „Edytuj".
- Adres edytorów liczy `editorsUrl()` (`src/editors-url.ts`, czyste,
  testy w `tests/editors-url.test.ts`): katalog z `import.meta.url` karty,
  **to samo query** co karta (`?hacstag=<n>` z HACS, `?v=1` z instalacji
  ręcznej) plus `sv=<id builda>`. Id builda (`BUILD_ID`, `src/version.ts`)
  to wersja + 8 znaków sha256 ze źródeł (`src/`, `package.json`,
  `package-lock.json`, `rollup.config.js`, `tsconfig.json`), liczone raz
  w `rollup.config.js` i wstrzykiwane do obu plików. Po aktualizacji przez
  HACS **i po każdym przebudowaniu ze zmienionym kodem** adres się zmienia,
  więc przeglądarka nie sparuje nowej karty ze starymi edytorami z cache.
  Sama wersja nie wystarczała: HA serwuje `/local/` z `max-age` 31 dni,
  a Ctrl+Shift+R omija cache tylko dla żądań w trakcie ładowania strony —
  `import()` edytorów idzie później, przy „Edytuj", więc rebuild bez
  podbicia wersji dawał świeżą kartę ze starymi edytorami, a bramka wersji
  tego nie widziała. Skrót, a nie znacznik czasu: ten sam kod = ten sam
  adres (cache działa, build w CI i lokalny są identyczne). W dev-buildzie
  (`npm run watch`) id to `<wersja>-dev`, a `sv` ma dodatkowo znacznik czasu
  ładowania strony. Ponowna próba po błędzie dostaje `retry=<n>` (Chrome
  pamięta nieudany import pod danym adresem), najwcześniej po 30 s.
  Fallback jak dla zdjęć scen (ADR-010): adres nie-http(s) →
  `/hacsfiles/stratum-card/`.
- Próba po timeoucie liczy się jako nieudana, choć `import()` dalej wisi
  (przerwać go nie umiemy): kolejne wywołania nie czekają na nią drugi raz,
  tylko od razu oddają YAML, a po 30 s idzie nowa próba z `retry=<n>`
  (decyzja: `loadStep()` w `editors-url.ts`). Spóźniony plik, jeśli dojdzie,
  rejestruje edytory i następne „Edytuj" je pokaże.
- Brak pliku, timeout (20 s) albo edytory z innego builda niż karta →
  `getConfigElement()` **rozwiązuje się `undefined`, nie odrzuca**. Sprawdzone
  w źródłach frontendu HA: odrzucenie ustawia w `hui-element-editor`
  `_errors` i `GUImode=false`, a `_canSave` w `hui-dialog-edit-card` zwraca
  przy błędzie `false` — „Zapisz" zablokowany, podgląd rozmyty, a każda
  zmiana YAML-u woła `getConfigElement()` ponownie i znów kończy się błędem.
  `undefined` → komunikat „Edytor wizualny nie jest obsługiwany" + YAML
  z działającym „Zapisz". Do tego jedno zlokalizowane ostrzeżenie w konsoli
  (`console.editors_unavailable`) na stronę.
- Plik edytorów ma własny guard (`src/editors-boot-guard.ts`, ten sam
  `installLoadGuard` co karta, z wartownikiem `stratum-card-editor` i kluczem
  `Symbol.for('stratum-card.editors-version')`): druga ewaluacja pod innym
  adresem niczego nie definiuje i nie rzuca, a zapisane id builda pozwala
  loaderowi odrzucić niezgodne edytory.
- `getStubConfig()` i rejestracja w `window.customCards` zostają w pliku
  dashboardu — katalog kart i „Dodaj kartę" działają bez pliku edytorów.

**Granica pilnowana przy buildzie.** Plugin `stratum-boundary`
w `rollup.config.js` zatrzymuje build, gdy któryś plik ma więcej niż jeden
chunk albo jakikolwiek import statyczny lub `import()` z literałem
(wyliczony adres w loaderze edytorów jest dozwolony — rollup go nie
rozwiązuje); gdy moduł z `src/` importuje dekorator `customElement` pod
aliasem (skan definicji by go nie zobaczył); gdy dashboard zawiera moduł edytora (ścieżka
z „editor" poza loaderem albo jawna lista modułów tylko-edytorowych); gdy
plik edytorów zawiera runtime karty (`stratum-card`, `hass-watch`,
`boot-guard`, …) albo moduł definiujący nie-edytorowy element `stratum-*`.
Liczą się tylko moduły, które naprawdę trafiły do wyjścia; ich kod plugin
czyta przy każdym buildzie z `getModuleInfo()`, więc w `npm run watch` błąd
znika razem z cofniętą zmianą. Wspólne helpery
(`lit`, `localize`, `tap-action`, `area-entities`…) są w obu plikach
osobno — trzymają tylko cache, więc dwie kopie niczego nie psują.
`validate.yml` sprawdza, że `dist/` to dokładnie te dwa pliki, a dashboard
mieści się w budżecie 360 000 B.

**Dlaczego:**
- Edytory to ~41% kodu, którego dashboard nie pokazuje, a telefon pobierał
  i parsował je przy każdym zimnym starcie
- Dwa samodzielne pliki zamiast chunków, bo HACS ładuje kartę jako
  `/hacsfiles/stratum-card/stratum-card.js?hacstag=<n>` — patrz niżej
- ES module = natywny import w nowoczesnych przeglądarkach

**Alternatywy odrzucone:**
- _Code-splitting rollupa (wspólny chunk / `import('./…')`)_ — chunk
  edytorów importuje `./stratum-card.js` (albo chunk wspólny) **bez**
  `?hacstag=…`. Dla przeglądarki to inny URL = druga instancja modułu karty:
  drugi `customElements.define` (`NotSupportedError`), drugi obserwator
  `hass`, drugi baner.
- _Wstrzykiwanie powiązań karty do edytorów (wspólny `lit` przez obiekt
  na karcie)_ — wymaga przepisywania wyjścia rollupa po renderze (AST,
  analiza zasięgu, nowa devDependency) i eksponuje zminifikowane nazwy;
  oszczędza ~15 KB gzip tylko przy otwarciu edytora, dashboard zyskuje
  tyle samo co tutaj.
- _Współdzielenie `lit` w runtime (import map, globalny `lit`)_ — HA nie daje
  kartom import map, a poleganie na wewnętrznej kopii `lit` z frontendu HA
  wiąże nas z jego wersją.
- _`output.inlineDynamicImports`_ — wklejony moduł ewaluuje się od razu,
  bajty i parsowanie zostają w dashboardzie.
- _Jeden plik (pierwotna decyzja)_ — prosty, ale każdy start dashboardu
  płaci za edytory.

**Konsekwencje:**
- Release niesie dwa pliki JS, każdy ze świeżym `.gz` (ADR-010).
- Instalacja ręczna: oba pliki do **jednego** katalogu, zasobem jest tylko
  `stratum-card.js`. Bez pliku edytorów karta działa, a edycja jest tylko
  w YAML-u (`README.md`, `docs/development.md`).

**Historia (do v1.109.3):** „Jeden plik wyjściowy `dist/stratum-card.js`,
format `es`, wszystkie zależności bundlowane. HACS dostarcza jeden plik,
użytkownik dodaje jeden `resource`. Multi-chunk z lazy loadingiem odrzucony
jako overkill." Edytory urosły do ~41% bundla (v1.109.3), a ich słowniki
wydzielono już wtedy (ADR-007) — to przesądziło o zmianie.

---

## ADR-006: Nie bundlujemy `<ha-icon>` / MDI

**Decyzja:** Używamy globalnych `<ha-icon>` z Home Assistant, nie bundlujemy
własnej biblioteki ikon.

**Dlaczego:**
- HA już ma pełny MDI załadowany
- Bundle rośnie o ~500KB jeśli dociągniemy `@mdi/js` lub podobne
- User może używać tych samych ikon co w pozostałych kartach

**Ryzyko:** `<ha-icon>` to element HA — jeśli nazwa się zmieni w przyszłości,
musimy się dostosować. Ale stabilne od lat.

---

## ADR-007: Localization — słowniki TS + runtime lookup

**Status:** wdrożone w v1.109.3 (wcześniej JSON-y istniały, ale nic ich nie
czytało — cały UI był po polsku na sztywno).

**Decyzja:** Stringi UI w `src/localize/pl.ts` (baza) i `src/localize/en.ts`.
Runtime wybiera słownik z `hass.locale.language`, potem `hass.language`:
`pl*` → polski, każdy inny język → angielski, brak języka → polski.
Komponenty wołają `localize(hass, 'grupa.klucz', { param })`
(`src/localize/localize.ts`, czyste funkcje, testy w `tests/localize.test.ts`).
Podkomponenty bez `hass` dostają `.uiLang=${langOf(hass)}`. Napisy sprzed
`hass` (katalog kart, błąd `setConfig`, ostrzeżenia w konsoli) biorą język
z `<html lang>` (`docLanguage()`).

**Dlaczego TS, a nie JSON:**
- Rollup nie ma pluginu JSON, a dokładanie zależności łamie zasadę „Lit
  i nic więcej"
- `en.ts` jest typowany kształtem `pl.ts` — brak klucza po angielsku to błąd
  kompilacji, nie pusty napis; klucze w `localize()` też są typowane
- Prostsze niż `i18next` / `lit-translate` dla projektu tej wielkości

**Konwencja:** klucze nested (`chip_list.items`), placeholdery `{count}`,
`{name}`. Liczba mnoga to obiekt form: PL `{ one, few, many }` (2–4 bez
12–14 = few), EN `{ one, other }`; wybór przez `Intl.PluralRules`
z deterministyczną regułą awaryjną. Fragmenty kodu w podpowiedziach edytora
zapisujemy jako `<…>` — komponent renderuje je jako `<code>` bez innerHTML.
Nowy język = nowy plik typu `Messages` + wpis w `DICTS` i `langOf`.

**Słowniki edytorów osobno.** Napisy edytorów (`editor.*`) to ~83%
słowników, a dashboard ich nie pokazuje. Leżą w `src/localize/editor-pl.ts`
i `editor-en.ts` (typ `EditorMessages` z `editor-pl.ts`), a czytają je tylko
edytory przez `localizeUi()` / `editorMessages()` z
`src/localize/editor-localize.ts` — ta sama ścieżka awaryjna, klucze z pełnym
prefiksem `editor.…`. Runtime karty importuje wyłącznie `pl.ts`/`en.ts`.
Od v1.110.0 (PKG-3, ADR-005) słowniki edytorów jadą w pliku
`stratum-card-editors.js` ładowanym na żądanie — dashboard ich nie pobiera.
Budżet: 1.109.2 → 1.109.3 bundle 482 306 → 573 094 B
(gzip −9: 121 722 → 142 059 B; build wydanego 502cb62 — CHANGELOG 1.109.3
podaje 573 151 / 142 073 B z pomiaru sprzed wydania), z czego słowniki
~65 KB po minifikacji; w v1.110.0 dashboard 340 618 B (gzip −9: 89 329 B).

> Status: obowiązuje — mechanizm. Decyzję, który język widzi użytkownik,
> opisuje ADR-009.

---

## ADR-008: Testowanie — odłożone do v0.7

**Decyzja:** Do v0.6 brak unit testów. Od v0.7 dodajemy Vitest + happy-dom.

**Dlaczego:**
- Pierwsze milestone'y to eksploracja API HA — testy by się zmieniały
  każdego tygodnia
- Manual testing na żywej instancji HA jest szybszy dla UI
- Od v0.7 (visual editor) mamy stabilny kontrakt — sensowne do testowania

**Co testujemy od v0.7:**
- `setConfig` walidację (rzucanie na brak `area_id`/`name`)
- Rezolucję nazwy area / ikony z HA
- Logikę agregacji chipów (policz lights on w area)
- **NIE** testujemy renderingu wizualnego — to robi manual / screenshot testing

> Status: zastąpione przez ADR-011.

---

## ADR-009: Język interfejsu — za językiem użytkownika HA

**Decyzja:** Interfejs karty idzie za językiem użytkownika Home Assistanta:
polski, dla pozostałych języków angielski. Uzupełnia ADR-007, który
opisuje mechanizm (słowniki `pl.ts`/`en.ts`, `localize()`, `.uiLang`).

**Dlaczego:**
- Główny użytkownik ma HA po polsku, a karta trafia też do HACS — angielski
  jest rozsądnym wspólnym mianownikiem dla reszty świata
- Dwa języki to mało tekstów do utrzymania; kolejny język to tłumaczenie,
  nie zmiana logiki

**Konsekwencja:** teksty user-facing nie są wpisywane w komponenty
(CLAUDE.md, „Zasady kodu").

---

## ADR-010: Release — pliki JS + zdjęcia scen jako osobne assety

**Decyzja:** Release niesie pliki JS z ADR-005 — od v1.110.0 dwa:
`stratum-card.js` i `stratum-card-editors.js`, każdy ze swoim `.gz` —
oraz zdjęcia wbudowanych scen `sceny-<id>.webp`. HACS pobiera wszystkie
assety płasko do jednego katalogu. Karta szuka zdjęć obok bundla (adres
liczony z `import.meta.url`), potem pod `/hacsfiles/stratum-card/`, na końcu
rysuje wersję SVG, jeśli scena ją ma; plik edytorów — tak samo obok bundla
(ADR-005).

**Dlaczego:**
- Zdjęcia w bundlu (base64) rozdęłyby JS, który telefon pobiera i parsuje
  przy każdym starcie — a zdjęcie potrzebne jest tylko scenie, która je
  pokazuje
- `.gz` nadpisuje pozostałość po starszej instalacji (HA potrafi serwować
  `.gz` zamiast `.js`) — dlatego **każdy** plik JS ma świeży `.gz`, a release
  sprawdza go (`gzip -t` + porównanie z `.js`) przed publikacją

**Konsekwencja:** instalacja ręczna i dev-loop bez HACS muszą skopiować
plik edytorów i zdjęcia obok bundla (zdjęcia z prefiksem `sceny-`,
`docs/development.md`). Workflow `validate.yml` pilnuje, że `dist/` to
dokładnie dwa pliki JS (do v1.109.3: jeden).

> Status: obowiązuje; do v1.109.3 kod był jednym plikiem JS.

---

## ADR-011: Testowanie — czyste funkcje w Vitest

**Decyzja:** Vitest w środowisku `node`, bez DOM-u i bez Lita. Testujemy
czyste funkcje w `tests/`; logikę, która wymaga testów, wydzielamy
z komponentów do osobnych modułów. Zastępuje ADR-008.

**Dlaczego:**
- Logika, która się psuje (agregacja świateł i alarmów, historia „wstecz",
  kolejka Escape, gest jasności, kolory scen, ładowanie bundla), da się
  wyrazić jako funkcje na danych `hass` — test jest szybki i deterministyczny
- Rendering i stany interaktywne sprawdzamy ręcznie na żywej instancji HA

**CI:** `validate.yml` odpala typecheck, testy i build na każdym PR i pushu
do `main`; `release.yml` powtarza je przed utworzeniem releasu.

---

## Otwarte pytania

- [ ] v1.1+: czy dodajemy sub-view routing (`/dashboard/parter/salon`) czy
      zostajemy przy modal pop-upie?
- [ ] v1.1+: czy karta zgłasza się do HA jako `GridCardLayoutOptions` dla
      lepszej integracji z sections view?
- [ ] v2.0: companion integration Python — czy warto?
