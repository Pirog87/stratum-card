import { describe, expect, it } from 'vitest';
import {
  decidePopState,
  GUARD_STATE,
  isGuardState,
  navigateMode,
  planConsume,
  stateHasDialog,
  type GuardEntry,
} from '../src/back-guard.js';

const chipAt = (index: number | null): GuardEntry => ({ kind: 'chip', index });
const roomAt = (index: number | null): GuardEntry => ({ kind: 'room', index });
const roomChipAt = (index: number | null): GuardEntry => ({ kind: 'room-chip', index });

describe('lista chipa karty pokoju w popupie (room-chip, przegląd v1.109.3)', () => {
  it('Android wstecz przy liście nad popupem zdejmuje tylko listę', () => {
    // Dashboard 4, popup 5, lista karty pokoju 6 → wstecz ląduje na 5.
    expect(decidePopState([roomAt(5), roomChipAt(6)], 5, 0, false).pop).toBe(1);
    expect(decidePopState([roomAt(null), roomChipAt(null)], null, 0, false).pop).toBe(1);
  });

  it('zamknięcie more-info otwartego z listy nie zamyka niczego', () => {
    expect(decidePopState([roomAt(5), roomChipAt(6)], 6, 0, true).pop).toBe(0);
    expect(decidePopState([roomAt(null), roomChipAt(null)], null, 1, true)).toEqual({ pop: 0, dialogsAbove: 0 });
  });

  it('× popupu przy otwartej liście cofa o dwa wpisy i zamyka obie warstwy', () => {
    expect(planConsume([roomAt(5), roomChipAt(6)], 'room')).toEqual({ kind: 'back', steps: 2 });
    // history.go(-2) ląduje na 4 — indeks zdejmuje oba; bez API decyduje licznik.
    expect(decidePopState([roomAt(5), roomChipAt(6)], 4, 0, false, 2).pop).toBe(2);
    expect(decidePopState([roomAt(null), roomChipAt(null)], null, 1, true, 2)).toEqual({ pop: 2, dialogsAbove: 0 });
  });

  it('× listy cofa o jeden wpis', () => {
    expect(planConsume([roomAt(5), roomChipAt(6)], 'room-chip')).toEqual({ kind: 'back', steps: 1 });
    expect(decidePopState([roomAt(5), roomChipAt(6)], 5, 0, false, 1).pop).toBe(1);
  });
});

describe('planConsume', () => {
  it('strażnik na szczycie: cofnięcie o jeden', () => {
    expect(planConsume([chipAt(5)], 'chip')).toEqual({ kind: 'back', steps: 1 });
    expect(planConsume([roomAt(5)], 'room')).toEqual({ kind: 'back', steps: 1 });
  });

  it('obca warstwa nad strażnikiem: tylko wyjęcie ze stosu', () => {
    expect(planConsume([roomAt(5), chipAt(6)], 'room')).toEqual({ kind: 'drop', at: 0 });
    // Lista karty pokoju nie jest dzieckiem listy karty piętra.
    expect(planConsume([chipAt(5), roomChipAt(6)], 'chip')).toEqual({ kind: 'drop', at: 0 });
  });

  it('brak strażnika danego rodzaju', () => {
    expect(planConsume([], 'room')).toEqual({ kind: 'none' });
    expect(planConsume([roomAt(5)], 'room-chip')).toEqual({ kind: 'none' });
  });
});

describe('navigate z popupu nadpisuje wpis strażnika (przegląd v1.109.3)', () => {
  it('strażnik na szczycie historii → replace', () => {
    expect(isGuardState({ ...GUARD_STATE })).toBe(true);
    expect(navigateMode({ ...GUARD_STATE })).toBe('replace');
  });

  it('zwykły wpis, dialog HA, null → push', () => {
    expect(navigateMode(null)).toBe('push');
    expect(navigateMode(undefined)).toBe('push');
    expect(navigateMode({ dialog: 'ha-more-info-dialog', open: true })).toBe('push');
    expect(navigateMode({ root: true })).toBe('push');
    expect(isGuardState({ stratum: 'true' })).toBe(false);
  });

  it('po nadpisaniu jedno wstecz zamyka popup, gdy karta została na widoku', () => {
    // Popup 5 nadpisany ścieżką navigate (ten sam widok) → wstecz na 4.
    expect(decidePopState([roomAt(5)], 4, 0, false).pop).toBe(1);
  });
});

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
