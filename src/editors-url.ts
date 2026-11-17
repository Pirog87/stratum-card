// Adres i decyzje loadera edytorów (PKG-3, v1.110.0) — moduł czysty,
// Vitest sprawdza go bez DOM-u. Sam import() żyje w editor-loader.ts.
//
// Dlaczego adres budujemy z import.meta.url karty, a nie zwykłym
// `import('./stratum-card-editors.js')` (chunk rollupa):
//   - HACS ładuje kartę jako /hacsfiles/stratum-card/stratum-card.js?hacstag=…
//     Chunk współdzielony importowałby `./stratum-card.js` BEZ query, a dla
//     przeglądarki to inny URL = druga instancja modułu karty: drugi
//     customElements.define (wyjątek) i drugi obserwator hass. Dlatego plik
//     edytorów jest osobnym, samodzielnym buildem bez żadnych importów;
//   - query karty (`hacstag`) przepisujemy do adresu edytorów, a do tego
//     `sv=<id builda>` (wersja + skrót źródeł, version.ts). Po aktualizacji
//     przez HACS — i po każdym przebudowaniu ze zmienionym kodem, także przy
//     tej samej wersji — zmienia się adres, więc przeglądarka nigdy nie
//     sparuje nowej karty ze starymi edytorami z cache. Sama wersja nie
//     wystarczała: HA serwuje /local/ z max-age 31 dni, a Ctrl+Shift+R
//     omija cache tylko dla żądań w trakcie ładowania strony — import()
//     edytorów idzie później, przy „Edytuj", i brał stary plik z cache.
// Łańcuch fallbacków jak w scene-photo-url.ts: katalog bundla (http/https)
// → /hacsfiles/stratum-card/ (file:, blob:, data:, śmieci).

import { HACS_PHOTO_BASE } from './scene-photo-url.js';

/** Nazwa pliku edytorów — leży płasko obok stratum-card.js. */
export const EDITORS_FILE = 'stratum-card-editors.js';

/**
 * Parametr wersji. Nie `v`: README każe ręcznym instalacjom dopisywać
 * `?v=1` do zasobu, a to query przepisujemy dalej — kolizja nadpisałaby
 * wartość użytkownika albo naszą.
 */
export const VERSION_PARAM = 'sv';

/**
 * Numer ponownej próby. Chrome pamięta nieudany import modułu pod danym
 * adresem do końca życia strony — bez zmiany adresu kolejna próba (np. po
 * dograniu pliku przez użytkownika) od razu dostałaby ten sam błąd.
 */
export const RETRY_PARAM = 'retry';

/**
 * Odstęp między próbami. HA woła getConfigElement() przy KAŻDEJ zmianie
 * configu, dopóki nie dostanie edytora — bez przerwy każde naciśnięcie
 * klawisza w YAML-u robiłoby żądanie o brakujący plik.
 */
export const RETRY_COOLDOWN_MS = 30_000;

/**
 * Ile czekamy na plik edytorów. Dłużej niż kilkanaście sekund użytkownik
 * patrzy na pusty dialog — lepiej oddać YAML, a gdy plik dojdzie później,
 * następne wywołanie dostanie już edytor wizualny.
 */
export const LOAD_TIMEOUT_MS = 20_000;

/** Adres pliku edytorów dla danego adresu modułu karty. */
export function editorsUrl(
  moduleUrl: string | undefined,
  token: string,
  attempt = 0,
): string {
  let url: URL | undefined;
  try {
    const self = moduleUrl ? new URL(moduleUrl) : undefined;
    if (self && (self.protocol === 'http:' || self.protocol === 'https:')) {
      // Względny adres zachowuje katalog (i ewentualny symlink / podkatalog
      // użytkownika), zmienia tylko nazwę pliku — także przemianowanej karty.
      url = new URL(EDITORS_FILE, self);
      url.search = self.search;
      url.hash = '';
    }
  } catch {
    url = undefined;
  }
  const params = url ? url.searchParams : new URLSearchParams();
  params.set(VERSION_PARAM, token);
  if (attempt > 0) params.set(RETRY_PARAM, String(attempt));
  return url ? url.href : `${HACS_PHOTO_BASE}${EDITORS_FILE}?${params.toString()}`;
}

/** Czy minął odstęp od ostatniej nieudanej próby (albo żadnej nie było). */
export function mayRetry(failedAt: number | undefined, now: number): boolean {
  return failedAt === undefined || now - failedAt >= RETRY_COOLDOWN_MS;
}

/**
 * Stan bieżącej próby importu: `none` — jeszcze żadnej; `loading` — trwa
 * i nie przekroczyła LOAD_TIMEOUT_MS; `loaded` — plik się wykonał;
 * `failed` — błąd albo timeout.
 */
export type AttemptStatus = 'none' | 'loading' | 'loaded' | 'failed';

/** Co zrobić przy wywołaniu getConfigElement(), gdy edytora jeszcze nie ma. */
export type LoadStep = 'await' | 'start' | 'skip';

/**
 * Decyzja loadera. Próba po timeoucie liczy się jako nieudana, mimo że
 * import() dalej wisi (przerwać go nie umiemy): gdybyśmy na nią dalej
 * czekali, KAŻDE kolejne „Edytuj" i każdy klawisz w YAML-u stałby 20 s
 * na szkielecie, a nowej próby nie byłoby do przeładowania strony (np.
 * WebView aplikacji mobilnej uśpiony w trakcie pobierania). Jeśli wiszący
 * import jednak dojdzie, edytory się zarejestrują i loader ich użyje bez
 * pytania o stan próby.
 */
export function loadStep(
  status: AttemptStatus,
  failedAt: number | undefined,
  now: number,
): LoadStep {
  if (status === 'loading') return 'await';
  // Plik się wykonał, a edytora brak (cudzy plik pod tą nazwą) — ponowny
  // import tego samego adresu nic nie zmieni.
  if (status === 'loaded') return 'skip';
  return mayRetry(failedAt, now) ? 'start' : 'skip';
}

export type EditorsVerdict = 'ok' | 'missing' | 'mismatch';

/**
 * Czy wolno użyć zarejestrowanego edytora. Edytor z innego builda niż karta
 * (stary plik obok nowej karty, druga kopia zasobu) mógłby zapisać config
 * w kształcie, którego ta karta nie zna — wtedy uczciwiej oddać YAML.
 * Porównujemy id builda (BUILD_ID), nie samą wersję: dwa buildy tej samej
 * wersji z innym kodem też są niezgodne.
 */
export function editorsVerdict(
  defined: boolean,
  editorsVersion: unknown,
  version: string,
): EditorsVerdict {
  if (!defined) return 'missing';
  return editorsVersion === version ? 'ok' : 'mismatch';
}
