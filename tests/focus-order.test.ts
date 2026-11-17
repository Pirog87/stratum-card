import { describe, expect, it } from 'vitest';
import { firstTabbable, lastTabbable, type FocusProbe } from '../src/focus-order.js';

// Atrapa drzewa: węzeł z dziećmi light DOM, opcjonalnym shadow rootem
// i flagami, które sonda DOM-owa w komponencie czyta z elementu.
interface FakeNode {
  id: string;
  tab?: boolean;
  hidden?: boolean;
  inert?: boolean;
  sentinel?: boolean;
  kids?: FakeNode[];
  shadow?: FakeNode[];
}

const probe: FocusProbe<FakeNode> = {
  // Jak w przeglądarce: host z shadow rootem pokazuje swój shadow root,
  // nie light DOM (ten trafia do środka tylko przez slot).
  children: (n) => n.shadow ?? n.kids ?? [],
  tabbable: (n) => Boolean(n.tab),
  skip: (n) => Boolean(n.hidden || n.inert || n.sentinel),
};

const n = (id: string, extra: Partial<FakeNode> = {}): FakeNode => ({ id, ...extra });

// Arkusz popupu: wartownik, uchwyt, ×, karta pokoju (shadow root
// z kaflami i zagnieżdżonym chipem), wartownik.
const sheet = (grabHidden = false): FakeNode =>
  n('sheet', {
    kids: [
      n('start', { tab: true, sentinel: true }),
      n('grab', { tab: true, hidden: grabHidden }),
      n('close', { tab: true }),
      n('room-card', {
        kids: [n('light-dom-ignored', { tab: true })],
        shadow: [
          n('header', { kids: [n('chip-host', { shadow: [n('chip', { tab: true })] })] }),
          n('tiles', {
            kids: [
              n('tile-1', { tab: true, kids: [n('tile-1-badge', { tab: true })] }),
              n('tile-2', { tab: true }),
              n('tile-off', { tab: true, hidden: true }),
            ],
          }),
        ],
      }),
      n('end', { tab: true, sentinel: true }),
    ],
  });

describe('firstTabbable', () => {
  it('pomija wartownika i ukryty uchwyt', () => {
    expect(firstTabbable(sheet(), probe)?.id).toBe('grab');
    expect(firstTabbable(sheet(true), probe)?.id).toBe('close');
  });

  it('focusowalny rodzic wygrywa z dziećmi', () => {
    const tree = n('r', { kids: [n('p', { tab: true, kids: [n('c', { tab: true })] })] });
    expect(firstTabbable(tree, probe)?.id).toBe('p');
  });

  it('brak kandydatów → undefined', () => {
    expect(firstTabbable(n('r', { kids: [n('a'), n('b', { hidden: true, tab: true })] }), probe)).toBeUndefined();
  });
});

describe('lastTabbable', () => {
  it('schodzi do shadow rootów karty pokoju i pomija ukryty kafel', () => {
    expect(lastTabbable(sheet(), probe)?.id).toBe('tile-2');
  });

  it('ostatnim przystankiem jest potomek, nie focusowalny kontener', () => {
    const tree = n('r', { kids: [n('row', { tab: true, kids: [n('switch', { tab: true })] })] });
    expect(lastTabbable(tree, probe)?.id).toBe('switch');
  });

  it('light DOM hosta z shadow rootem nie liczy się (nie jest renderowany)', () => {
    const tree = n('r', { kids: [n('host', { kids: [n('x', { tab: true })], shadow: [n('y')] })] });
    expect(lastTabbable(tree, probe)).toBeUndefined();
  });

  it('poddrzewo inert wypada w całości', () => {
    const tree = n('r', {
      kids: [n('a', { tab: true }), n('body', { inert: true, kids: [n('row', { tab: true })] })],
    });
    expect(lastTabbable(tree, probe)?.id).toBe('a');
  });
});
