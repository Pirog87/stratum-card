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

---

## Otwarte pytania

- [ ] v1.1+: czy dodajemy sub-view routing (`/dashboard/parter/salon`) czy
      zostajemy przy modal pop-upie?
- [ ] v1.1+: czy karta zgłasza się do HA jako `GridCardLayoutOptions` dla
      lepszej integracji z sections view?
- [ ] v2.0: companion integration Python — czy warto?
