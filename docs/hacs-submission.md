# HACS default repo — procedura submission

Repozytorium jest gotowe do włączenia do oficjalnej listy HACS (tak że użytkownicy mogą instalować bez dodawania jako custom repo).

## Checklist przed PR

- [x] README.md z opisem, instalacją, przykładami
- [x] LICENSE (MIT)
- [x] `hacs.json` z `filename`, `render_readme`, `homeassistant`
- [x] Przynajmniej jeden publikowany GitHub release
- [x] `stratum-card.js` jako asset releasu (auto-release workflow)
- [x] GitHub topics: `home-assistant`, `lovelace`, `hacs`, `custom-card`, `lovelace-card`, `homeassistant`
- [x] Obrazek w README (`preview.png`)
- [x] Ten guide + CHANGELOG
- [x] HACS validation workflow → green (obok build workflow)
- [x] `examples/` z konfiguracjami

## Procedura

1. Fork https://github.com/hacs/default
2. W forku edytuj plik `plugin` (lub `integration` jeśli integration)
3. Dodaj linię: `Pirog87/stratum-card` (alfabetycznie)
4. Commit + push do własnego forka
5. Stwórz PR do `hacs/default`, tytuł np. `Add Pirog87/stratum-card`
6. W PR description linkuj:
   - Home page: https://github.com/Pirog87/stratum-card
   - Category: Plugin
   - Short description: same co w `hacs.json:name`

## Kontrola HACS przy PR

HACS bot uruchomi automatyczną walidację:
- Repozytorium istnieje i jest publiczne
- README jest sensowne, ma obrazek
- Przynajmniej jeden tagowany release
- Plik z `hacs.json:filename` istnieje w release assets
- Topics pasują
- Brak blacklistowanych nazw

## Po merge

Stratum pojawi się w domyślnej liście HACS. Użytkownicy zainstalują przez:
HACS → Frontend → **Stratum** → Download

Custom repository w ich HA zniknie z listy (dobry stan).

## Dalsze utrzymanie

- Trzymanie w głowie `Breaking changes` w tytule PR do main (widoczne w HACS changelog)
- Semver tag na każdy release (auto — workflow z package.json version)
- README zawsze aktualny
