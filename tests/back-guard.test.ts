import { describe, expect, it } from 'vitest';
import { decidePopState, stateHasDialog, type GuardEntry } from '../src/back-guard.js';

const chipAt = (index: number | null): GuardEntry => ({ kind: 'chip', index });
const roomAt = (index: number | null): GuardEntry => ({ kind: 'room', index });

describe('decidePopState — Navigation API (indeks historii)', () => {
  it('zamknięcie more-info wraca na indeks strażnika — lista zostaje', () => {
    // Dashboard 4, lista 5, more-info 6 → history.back() ląduje na 5.
    expect(decidePopState([chipAt(5)], 5, 0, true)).toEqual({ pop: 0, dialogsAbove: 0 });
  });

  it('zwykłe „wstecz" pod strażnika zamyka listę', () => {
    expect(decidePopState([chipAt(5)], 4, 0, false).pop).toBe(1);
  });

  it('wpis dashboardu z `{dialog, open:false}` nie blokuje „wstecz"', () => {
    // HA zostawia stan dialogu na wpisie dashboardu po wcześniejszym more-info.
    expect(decidePopState([chipAt(5)], 4, 0, true).pop).toBe(1);
  });

  it('popup pokoju + lista nad nim: jedno „wstecz" zamyka tylko listę', () => {
    expect(decidePopState([roomAt(5), chipAt(6)], 5, 0, false).pop).toBe(1);
  });

  it('skok o dwa wpisy zamyka oba poziomy', () => {
    expect(decidePopState([roomAt(5), chipAt(6)], 4, 0, false).pop).toBe(2);
  });

  it('pop w przód (forward) niczego nie zamyka', () => {
    expect(decidePopState([chipAt(5)], 7, 0, false).pop).toBe(0);
  });

  it('nasze history.back() zawsze zamyka szczyt', () => {
    expect(decidePopState([chipAt(5)], 6, 0, false, true).pop).toBe(1);
  });

  it('pusty stos — nic do zamknięcia', () => {
    expect(decidePopState([], 3, 2, true)).toEqual({ pop: 0, dialogsAbove: 0 });
  });
});

describe('decidePopState — tryb zapasowy (licznik dialogów HA)', () => {
  it('pop dialogu HA otwartego nad listą — lista zostaje, licznik spada', () => {
    expect(decidePopState([chipAt(null)], null, 1, true)).toEqual({ pop: 0, dialogsAbove: 0 });
  });

  it('po zamknięciu more-info następne „wstecz" zamyka listę', () => {
    expect(decidePopState([chipAt(null)], null, 0, true)).toEqual({ pop: 1, dialogsAbove: 0 });
  });

  it('nigdy nie ignoruje popa tylko z powodu `dialog` w stanie', () => {
    expect(decidePopState([chipAt(null)], null, 0, true).pop).toBe(1);
  });

  it('pop bez `dialog` przy liczniku > 0 zamyka i zeruje rozjechany licznik', () => {
    expect(decidePopState([chipAt(null)], null, 2, false)).toEqual({ pop: 1, dialogsAbove: 0 });
  });

  it('nasze history.back() zamyka mimo rozjechanego licznika', () => {
    expect(decidePopState([chipAt(null)], null, 1, true, true)).toEqual({ pop: 1, dialogsAbove: 0 });
  });

  it('brak indeksu na szczycie przełącza na tryb zapasowy nawet z indeksem bieżącym', () => {
    expect(decidePopState([chipAt(null)], 5, 1, true)).toEqual({ pop: 0, dialogsAbove: 0 });
  });
});

describe('stateHasDialog', () => {
  it('rozpoznaje wpis dialogu HA', () => {
    expect(stateHasDialog({ dialog: 'ha-more-info-dialog', open: false })).toBe(true);
  });

  it('nasz strażnik, null i prymitywy to nie dialog', () => {
    expect(stateHasDialog({ stratum: true })).toBe(false);
    expect(stateHasDialog(null)).toBe(false);
    expect(stateHasDialog('dialog')).toBe(false);
    expect(stateHasDialog({ dialog: '' })).toBe(false);
  });
});
