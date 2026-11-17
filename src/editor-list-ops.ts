// Czyste operacje na listach edytorów (chipy, sekcje) — usuwanie z
// możliwością cofnięcia. Bez DOM-u i Lita, testowane w Vitest.

/** Usuwa element `index`; zwraca nową listę i usunięty element. */
export function removeAt<T>(
  list: readonly T[],
  index: number,
): { next: T[]; removed: T | undefined } {
  return {
    next: list.filter((_, i) => i !== index),
    removed: list[index],
  };
}

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Cofnięcie usunięcia.
 *
 * Gdy od usunięcia nic się nie zmieniło (`current` = to, co wyemitowaliśmy
 * po usunięciu), wracamy DOKŁADNIE do stanu sprzed — także do pustej listy
 * „pokazuj domyślne", której usunięcie z podglądu defaultów
 * zmaterializowało. Porównujemy strukturalnie, bo config wraca do edytora
 * przez HA i referencja tablicy nie musi przetrwać.
 *
 * Gdy user zdążył coś zmienić, nie nadpisujemy tej zmiany starym
 * snapshotem — wstawiamy usunięty element z powrotem na jego miejsce
 * (albo na koniec, gdy lista się skróciła).
 */
export function restoreRemoved<T>(
  current: readonly T[],
  afterRemove: readonly T[],
  before: readonly T[],
  index: number,
  item: T,
): T[] {
  if (sameList(current, afterRemove)) return [...before];
  // Element już jest (np. user przywrócił domyślny zestaw, w którym on
  // siedzi) — drugi egzemplarz byłby dublem, nie cofnięciem.
  const key = JSON.stringify(item);
  if (current.some((c) => JSON.stringify(c) === key)) return [...current];
  const next = [...current];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
}
