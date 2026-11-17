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

## ADR-005: Bundling — single file, ES module

**Decyzja:** Jeden plik wyjściowy `dist/stratum-card.js`, format `es`,
wszystkie zależności bundlowane.

**Dlaczego:**
- HACS dostarcza jeden plik do `/config/www/`
- Użytkownik dodaje jeden `resource` w HA
- ES module = natywny import w nowoczesnych przeglądarkach

**Alternatywa odrzucona:** Multi-chunk z lazy loadingiem — overkill dla
komponentu tej wielkości. Dodatkowe HTTP requesty spowolnią ładowanie.

> Status: JS dalej jest jednym plikiem; release ma jednak więcej assetów
> (zdjęcia scen, `.gz`) — patrz ADR-010.

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

## ADR-007: Localization — JSON + runtime lookup

**Decyzja:** Stringi UI w `src/localize/{pl,en}.json`. Runtime wybiera na
podstawie `hass.language`.

**Dlaczego:**
- Prostsze niż `i18next` / `lit-translate` dla projektu tej wielkości
- JSON jest łatwo edytowalny
- Community może dodawać języki przez PR bez kodu

**Konwencja:** klucze nested (`chips.lights_on`), placeholdery `{count}`.

> Status: zastąpione przez ADR-009.

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
polski, dla pozostałych języków angielski. Zastępuje ADR-007.

**Dlaczego:**
- Główny użytkownik ma HA po polsku, a karta trafia też do HACS — angielski
  jest rozsądnym wspólnym mianownikiem dla reszty świata
- Dwa języki to mało tekstów do utrzymania; kolejny język to tłumaczenie,
  nie zmiana logiki

**Konsekwencja:** teksty user-facing nie są wpisywane w komponenty
(CLAUDE.md, „Zasady kodu").

---

## ADR-010: Release — bundle JS + zdjęcia scen jako osobne assety

**Decyzja:** Kod dalej jest jednym plikiem `stratum-card.js` (ADR-005),
ale release niesie też `stratum-card.js.gz` i zdjęcia wbudowanych scen
`sceny-<id>.webp`. HACS pobiera wszystkie assety płasko do jednego
katalogu, a karta szuka zdjęć obok bundla (adres liczony z
`import.meta.url`), potem pod `/hacsfiles/stratum-card/`, na końcu rysuje
wersję SVG, jeśli scena ją ma.

**Dlaczego:**
- Zdjęcia w bundlu (base64) rozdęłyby JS, który telefon pobiera i parsuje
  przy każdym starcie — a zdjęcie potrzebne jest tylko scenie, która je
  pokazuje
- `.gz` nadpisuje pozostałość po starszej instalacji (HA potrafi serwować
  `.gz` zamiast `.js`)

**Konsekwencja:** instalacja ręczna i dev-loop bez HACS muszą skopiować
zdjęcia obok bundla z prefiksem `sceny-` (`docs/development.md`).
Workflow `validate.yml` pilnuje, że `dist/` to wciąż jeden plik JS.

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
