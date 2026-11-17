import { describe, expect, it } from 'vitest';
import { removeAt, restoreRemoved } from '../src/editor-list-ops.js';
import { DEFAULT_CHIPS } from '../src/chip-defaults.js';
import type { ChipConfig } from '../src/types.js';

describe('removeAt', () => {
  it('usuwa element i oddaje go', () => {
    expect(removeAt(['a', 'b', 'c'], 1)).toEqual({ next: ['a', 'c'], removed: 'b' });
  });

  it('indeks poza listą nic nie usuwa', () => {
    expect(removeAt(['a'], 5)).toEqual({ next: ['a'], removed: undefined });
  });
});

describe('restoreRemoved — Cofnij', () => {
  it('bez zmian po drodze wraca dokładnie do stanu sprzed', () => {
    const before = ['a', 'b', 'c'];
    const { next, removed } = removeAt(before, 1);
    expect(restoreRemoved(next, next, before, 1, removed!)).toEqual(['a', 'b', 'c']);
  });

  it('przywraca pustą listę „pokaż domyślne", a nie zmaterializowany zestaw', () => {
    // Usunięcie z podglądu defaultów emituje zmaterializowaną listę bez
    // jednego elementu; cofnięcie ma wrócić do `chips` = [] (defaulty).
    const before: ChipConfig[] = [];
    const effective = DEFAULT_CHIPS.map((c) => ({ ...c }));
    const { next, removed } = removeAt(effective, 0);
    // Config wrócił z HA jako nowa tablica z nowymi obiektami.
    const roundTripped = JSON.parse(JSON.stringify(next)) as ChipConfig[];
    expect(restoreRemoved(roundTripped, next, before, 0, removed!)).toEqual([]);
  });

  it('po innej zmianie wstawia element na jego miejsce, nie nadpisuje zmiany', () => {
    const before = ['a', 'b', 'c'];
    const { next, removed } = removeAt(before, 1);
    const edited = ['a', 'c', 'd'];
    expect(restoreRemoved(edited, next, before, 1, removed!)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lista się skróciła — element ląduje na końcu', () => {
    const before = ['a', 'b', 'c'];
    const { next, removed } = removeAt(before, 2);
    expect(restoreRemoved(['a'], next, before, 2, removed!)).toEqual(['a', 'c']);
  });

  it('nie dubluje elementu, który już wrócił (np. reset do domyślnych)', () => {
    const before: ChipConfig[] = [{ type: 'lights' }, { type: 'smoke' }];
    const { next, removed } = removeAt(before, 0);
    const reset = DEFAULT_CHIPS.map((c) => ({ ...c }));
    expect(restoreRemoved(reset, next, before, 0, removed!)).toEqual(reset);
  });
});
