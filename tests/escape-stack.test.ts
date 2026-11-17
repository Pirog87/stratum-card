import { describe, expect, it } from 'vitest';
import {
  EscapeLayers,
  isFromForeignDialog,
  shouldHandleEscape,
  type EscapeEventLike,
} from '../src/escape-stack.js';

const esc = (pathNames: string[] = ['div', 'body', 'html'], defaultPrevented = false): EscapeEventLike => ({
  key: 'Escape',
  defaultPrevented,
  pathNames,
});

describe('isFromForeignDialog', () => {
  it('łapie dialogi HA i natywny <dialog>', () => {
    expect(isFromForeignDialog(['ha-switch', 'ha-more-info-dialog', 'body'])).toBe(true);
    expect(isFromForeignDialog(['button', 'ha-md-dialog'])).toBe(true);
    expect(isFromForeignDialog(['input', 'dialog', 'ha-wa-dialog'])).toBe(true);
  });

  it('nasze popupy (role="dialog" na zwykłym div) nie są cudzym dialogiem', () => {
    expect(isFromForeignDialog(['div', 'stratum-chip-list', 'stratum-card', 'body'])).toBe(false);
  });
});

describe('shouldHandleEscape', () => {
  it('tylko Escape, nieobsłużony i spoza dialogu HA', () => {
    expect(shouldHandleEscape(esc())).toBe(true);
    expect(shouldHandleEscape({ ...esc(), key: 'Enter' })).toBe(false);
    expect(shouldHandleEscape(esc(['div'], true))).toBe(false);
    expect(shouldHandleEscape(esc(['ha-more-info-dialog']))).toBe(false);
  });
});

describe('EscapeLayers', () => {
  it('reaguje tylko najwyższa warstwa', () => {
    const calls: string[] = [];
    const layers = new EscapeLayers();
    layers.push(() => calls.push('room'));
    const releaseList = layers.push(() => calls.push('list'));
    expect(layers.handle(esc())).toBe(true);
    expect(calls).toEqual(['list']);
    releaseList();
    layers.handle(esc());
    expect(calls).toEqual(['list', 'room']);
  });

  it('Escape z more-info nie zamyka żadnej warstwy', () => {
    const calls: string[] = [];
    const layers = new EscapeLayers();
    layers.push(() => calls.push('list'));
    expect(layers.handle(esc(['ha-more-info-dialog', 'body']))).toBe(false);
    expect(calls).toEqual([]);
  });

  it('zdjęcie warstwy spod spodu nie rusza szczytu', () => {
    const calls: string[] = [];
    const layers = new EscapeLayers();
    const releaseRoom = layers.push(() => calls.push('room'));
    layers.push(() => calls.push('list'));
    releaseRoom();
    releaseRoom(); // podwójne zdjęcie bez skutków ubocznych
    expect(layers.size).toBe(1);
    layers.handle(esc());
    expect(calls).toEqual(['list']);
  });

  it('pusty stos niczego nie obsługuje', () => {
    expect(new EscapeLayers().handle(esc())).toBe(false);
  });
});
