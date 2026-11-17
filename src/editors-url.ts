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
//     `sv=<wersja>`. Po aktualizacji przez HACS zmienia się adres, więc
//     przeglądarka nigdy nie sparuje nowej karty ze starymi edytorami z cache.
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

export type EditorsVerdict = 'ok' | 'missing' | 'mismatch';

/**
 * Czy wolno użyć zarejestrowanego edytora. Edytor innej wersji niż karta
 * (stary plik obok nowej karty, druga kopia zasobu) mógłby zapisać config
 * w kształcie, którego ta karta nie zna — wtedy uczciwiej oddać YAML.
 */
export function editorsVerdict(
  defined: boolean,
  editorsVersion: unknown,
  version: string,
): EditorsVerdict {
  if (!defined) return 'missing';
  return editorsVersion === version ? 'ok' : 'mismatch';
}
