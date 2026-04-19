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

Produkcyjny build (z terser-em) → `dist/stratum-card.js`. Ten plik kopiujesz
do HA żeby go użyć.

## Watch mode (zalecane do dev)

```bash
npm run watch
```

Rollup będzie rebuildował przy każdym save do `dist/stratum-card.js`.
Build watch jest bez terser-a (czytalne + sourcemaps).

## Podpięcie do Home Assistant

### Opcja A — kopiowanie pliku (najprostsza)

Po każdym buildzie:

```bash
cp dist/stratum-card.js /path/to/ha/config/www/stratum-card.js
```

W HA raz: *Settings → Dashboards → Resources → Add resource*
- URL: `/local/stratum-card.js?v=0.1`
- Type: `JavaScript Module`

Przy każdej zmianie: zmień `?v=0.2`, `?v=0.3` żeby wymusić cache bust.
Albo Ctrl+Shift+R.

### Opcja B — symlink (szybszy dev loop)

Jeśli masz HA jako docker / HAOS z dostępem do `/config`:

```bash
ln -s /path/to/stratum-card/dist/stratum-card.js /path/to/ha/config/www/stratum-card.js
```

Teraz `npm run watch` automatycznie aktualizuje plik w HA. Tylko F5 w
przeglądarce i widzisz zmiany.

### Opcja C — remote HA przez SSH/Samba

Jeśli HA jest na innej maszynie (np. raspberry), użyj `rsync`:

```bash
# w jednym terminalu
npm run watch

# w drugim — restartuje się w pętli po zmianie
while inotifywait -e close_write dist/stratum-card.js; do
  rsync dist/stratum-card.js user@ha-host:/config/www/stratum-card.js
done
```

## Debug

### Logi w konsoli

Karta loguje swoją wersję przy starcie (`console.info`). Szukaj
`STRATUM v0.1.0` w DevTools Console.

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

1. Update `package.json` — bump `version`
2. Update `src/stratum-card.ts` — stała `VERSION`
3. Update `docs/roadmap.md` — zaznacz milestone jako ✅
4. Commit: `chore: release v0.2.0`
5. Tag: `git tag v0.2.0 && git push --tags`
6. GitHub Action zbuildu i wrzuci `dist/stratum-card.js` jako asset release

## Częste problemy

**„card type: custom:stratum-card not found"** — nie dodałeś resource w HA
albo cache. Force refresh Ctrl+Shift+R.

**„Cannot read properties of undefined (reading 'areas')"** — `hass` nie
jest jeszcze wstrzyknięty. Zawsze `if (!this.hass) return nothing`.

**Zmiana w TS nie widać w HA** — sprawdź czy `npm run watch` chodzi
i czy `dist/stratum-card.js` został zaktualizowany (timestamp pliku).
