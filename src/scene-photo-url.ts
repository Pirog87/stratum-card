// Adresy zdjęć scen (`sceny-<id>.webp`) względem miejsca, z którego
// załadował się bundle (PKG-4).
//
// Wcześniej adres był zaszyty jako /hacsfiles/stratum-card/… — przy
// instalacji ręcznej (/local/stratum-card.js + webp obok) i w dev-loopie
// bez HACS kafle scen `stratum:<id>` wychodziły puste: bez zdjęcia i bez
// ikony. Teraz łańcuch fallbacków:
//   1. katalog bundla z import.meta.url — działa dla /hacsfiles/, /local/
//      i symlinków, bo zdjęcia leżą płasko obok stratum-card.js;
//   2. /hacsfiles/stratum-card/ — gdy dev-build z /local/ stoi obok
//      instalacji HACS (webp są tylko tam); warstwa CSS niżej łapie 404;
//   3. wbudowane SVG sceny (gdy dla tego id jeszcze istnieje).
// Przeglądarka maluje kolejne warstwy background-image od góry, a warstwa,
// której obraz się nie wczytał, jest przezroczysta — więc pierwsza udana
// wygrywa bez JS-owego sondowania i bez onerror.
//
// Moduł czysty — Vitest sprawdza go bez DOM-u.

/** Katalog, do którego HACS pobiera assety releasu (płasko). */
export const HACS_PHOTO_BASE = '/hacsfiles/stratum-card/';

/**
 * Katalog bundla z `import.meta.url`. Tylko http(s): w Vitest to file://,
 * a z blob:/data: nie da się wyprowadzić katalogu z assetami — wtedy
 * deterministycznie HACS. Bundle spod /hacsfiles/stratum-card/ zwraca
 * dokładnie tę samą względną ścieżkę co wcześniej, więc u użytkowników
 * HACS adresy zdjęć nie zmieniają się ani o znak (zero nowego pobierania).
 */
export function photoBaseFromModuleUrl(moduleUrl: string | undefined): string {
  if (!moduleUrl) return HACS_PHOTO_BASE;
  let dir: URL;
  try {
    // '.' obcina nazwę pliku i query (?hacstag=…), zostaje sam katalog.
    dir = new URL('.', moduleUrl);
  } catch {
    return HACS_PHOTO_BASE;
  }
  if (dir.protocol !== 'http:' && dir.protocol !== 'https:') return HACS_PHOTO_BASE;
  if (dir.pathname === HACS_PHOTO_BASE) return HACS_PHOTO_BASE;
  return dir.href;
}

export function scenePhotoFile(id: string): string {
  return `sceny-${id}.webp`;
}

/** Kandydaci na adres zdjęcia, od najlepszego; bez duplikatów. */
export function scenePhotoUrls(id: string, base: string): string[] {
  const file = scenePhotoFile(id);
  const urls = [`${base}${file}`, `${HACS_PHOTO_BASE}${file}`];
  return urls.filter((u, i) => urls.indexOf(u) === i);
}

/**
 * Lista warstw do `background-image`. Cudzysłów w adresie zamykałby
 * `url("…")` i rozwalał całą deklarację — kodujemy go jak w URL-u.
 */
export function cssImageLayers(urls: readonly string[]): string {
  return urls.map((u) => `url("${u.replace(/"/g, '%22')}")`).join(', ');
}
