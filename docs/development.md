# Development — jak iterować lokalnie

## Pierwsza konfiguracja

```bash
git clone https://github.com/<user>/stratum-card.git
cd stratum-card
npm install
```

Wymagane: Node 20+, npm 10+.

## Build raz

```bash
npm run build
```

Produkcyjny build (z terser-em) → dwa pliki w `dist/`:

- `stratum-card.js` — obie karty; to jest zasób Lovelace,
- `stratum-card-editors.js` — edytory wizualne, które karta dociąga sama
  (z tego samego katalogu) dopiero przy „Edytuj" (ADR-005).

Oba kopiujesz do HA, **do jednego katalogu**. `npm run build` najpierw
czyści `dist/`, więc nie zostają tam pozostałości (np. `.map` z watcha) —
`validate.yml` przepuszcza wyłącznie te dwa pliki.

## Watch mode (zalecane do dev)

```bash
npm run watch
```

Rollup będzie rebuildował przy każdym save oba pliki (`dist/stratum-card.js`
i `dist/stratum-card-editors.js`). Build watch jest bez terser-a (czytalne
+ sourcemaps). W dev-buildzie adres edytorów dostaje znacznik czasu
ładowania strony (`?sv=<wersja>-<znacznik>`), więc po Ctrl+Shift+R
przeglądarka nie poda starych edytorów z cache, choć wersja w
`package.json` się nie zmieniła.

## Podpięcie do Home Assistant

### Opcja A — kopiowanie pliku (najprostsza)

Po każdym buildzie:

```bash
cp dist/stratum-card.js dist/stratum-card-editors.js /path/to/ha/config/www/
```

W HA raz: *Settings → Dashboards → Resources → Add resource*
- URL: `/local/stratum-card.js?v=1`
- Type: `JavaScript Module`

Przy każdej zmianie: zmień `?v=2`, `?v=3` żeby wymusić cache bust.
Albo Ctrl+Shift+R. Query zasobu (`?v=…`, a u HACS `?hacstag=…`) karta
przepisuje do adresu edytorów, więc cache bust działa na oba pliki.
`stratum-card-editors.js` **nie** dodawaj jako zasobu.

### Opcja B — symlink (szybszy dev loop)

Jeśli masz HA jako docker / HAOS z dostępem do `/config`:

```bash
ln -s /path/to/stratum-card/dist/stratum-card.js /path/to/ha/config/www/stratum-card.js
ln -s /path/to/stratum-card/dist/stratum-card-editors.js /path/to/ha/config/www/stratum-card-editors.js
```

Albo jeden symlink na cały katalog (`ln -s /path/to/stratum-card/dist
/path/to/ha/config/www/stratum`) i zasób `/local/stratum/stratum-card.js` —
karta szuka edytorów i zdjęć scen obok siebie, więc podkatalog działa.

Teraz `npm run watch` automatycznie aktualizuje plik w HA. Tylko F5 w
przeglądarce i widzisz zmiany.

### Zdjęcia scen (instalacja bez HACS)

Wbudowane sceny ze zdjęciem (`image: stratum:<id>`, np. `jasne`, `noc`,
`kinkiet-cieply`) nie są w bundlu — to osobne pliki. Karta szuka
`sceny-<id>.webp` **w katalogu, z którego załadował się
`stratum-card.js`**, potem pod `/hacsfiles/stratum-card/`, a na końcu —
jeśli scena ma jeszcze wersję SVG — rysuje wektor. Bez HACS skopiuj więc
zdjęcia obok bundla, z prefiksem `sceny-` (w repo leżą bez niego,
w `assets/sceny/<id>.webp`):

```bash
for f in assets/sceny/*.webp; do
  cp "$f" "/path/to/ha/config/www/sceny-$(basename "$f")"
done
```

Bez prefiksu albo w innym katalogu sceny tylko-ze-zdjęciem (np.
`kinkiet-*`) zostają pustymi kaflami z nazwą. Jeśli masz też instalację
z HACS, zdjęcia przyjdą stamtąd i ten krok możesz pominąć.

### Opcja C — remote HA przez SSH/Samba

Jeśli HA jest na innej maszynie (np. raspberry), użyj `rsync`:

```bash
# w jednym terminalu
npm run watch

# w drugim — restartuje się w pętli po zmianie
while inotifywait -e close_write dist/stratum-card.js dist/stratum-card-editors.js; do
  rsync dist/stratum-card.js dist/stratum-card-editors.js user@ha-host:/config/www/
done
```

## Debug

### Logi w konsoli

Karta loguje swoją wersję przy starcie (`console.info`) — jeden baner dla
obu kart: `STRATUM v<wersja> · stratum-card + stratum-room-card`. Wersja
pochodzi z `package.json` (build wstrzykuje ją do `src/version.ts`).
Drugi załadowany egzemplarz bundla nie rzuca błędem, tylko ostrzega
w konsoli, która wersja jest aktywna.

### Inspekcja `hass` object

W DevTools, po otwarciu dashboardu z kartą:

```js
// w konsoli
document.querySelector('home-assistant')?.hass
```

Dostaniesz cały obiekt `hass` — tutaj `areas`, `entities`, `devices`.
Pomocne do eksploracji danych.

### Breakpoint w kodzie karty

W Rollup watch mode sourcemaps są generowane. W DevTools:
1. Sources → Page → `/local/stratum-card.js`
2. Będzie dostępny oryginalny TypeScript (jeśli sourcemaps działają)
3. Kliknij numer linii żeby postawić breakpoint

### Stan karty

W DevTools Console, z zaznaczoną kartą w elementach:

```js
$0.hass              // obiekt hass
$0._config           // config z YAML
$0._expanded         // stan expandera
```

## Lint i typecheck

```bash
npm run typecheck
npm test           # Vitest — czyste funkcje z tests/
```

Nie ma eslintów (na razie). TypeScript strict łapie większość błędów.

## Testowe config YAML

W dashboard HA:

```yaml
type: custom:stratum-card
area_id: parter        # użyj realnego area_id z twojego HA
name: "Parter"         # optional — override
icon: "mdi:home"       # optional
```

Masz dev dashboard który edytujesz tylko przez YAML? Dobra praktyka.
Patrz `examples/` w repo.

## Wersjonowanie i release

1. Bump `version` w `package.json` w tym samym commicie co zmiana —
   to jedyne miejsce z wersją (plugin rollupa `stratum-version` wstrzykuje
   ją do bundla, baner w konsoli pokazuje ją sam).
2. Wpis w `CHANGELOG.md`.
3. Merge do `main`. Workflow `release.yml` czyta wersję z `package.json`;
   jeśli tagu `v<wersja>` jeszcze nie ma, odpala typecheck, testy i build,
   tworzy tag i release z assetami: `stratum-card.js`, `stratum-card.js.gz`,
   `stratum-card-editors.js`, `stratum-card-editors.js.gz` i zdjęciami scen
   `sceny-*.webp`. Każdy `.gz` jest sprawdzany (`gzip -t` + porównanie
   z `.js`) przed publikacją.

## Częste problemy

**„card type: custom:stratum-card not found"** — nie dodałeś resource w HA
albo cache. Force refresh Ctrl+Shift+R.

**„Cannot read properties of undefined (reading 'areas')"** — `hass` nie
jest jeszcze wstrzyknięty. Zawsze `if (!this.hass) return nothing`.

**Zmiana w TS nie widać w HA** — sprawdź czy `npm run watch` chodzi
i czy `dist/stratum-card.js` został zaktualizowany (timestamp pliku).

**„Edytor wizualny nie jest obsługiwany" przy edycji karty Stratum** — karta
nie dostała pliku edytorów; edycja w YAML-u działa, „Zapisz" też. W konsoli
jest jedno ostrzeżenie `Stratum: edytor wizualny niedostępny (<powód>)`:

- *nie udało się wczytać pliku* — `stratum-card-editors.js` nie leży w tym
  samym katalogu co `stratum-card.js` (instalacja ręczna, symlink tylko na
  kartę) albo serwer zwrócił błąd. W zakładce Network widać żądanie
  `stratum-card-editors.js?…&sv=<wersja>` z błędem. Skopiuj plik i zrób
  Ctrl+Shift+R. Karta sama ponawia próbę najwcześniej po 30 s;
- *plik edytorów jest z innej wersji niż karta* — obok nowej karty leży
  stary plik edytorów (podmieniony tylko jeden plik) albo na stronie są dwie
  kopie karty w różnych wersjach. Podmień oba pliki naraz;
- *plik ładuje się zbyt długo* — brak odpowiedzi przez 20 s (wolna sieć).
  Gdy plik dojdzie, kolejne otwarcie edytora pokaże już wersję wizualną.
