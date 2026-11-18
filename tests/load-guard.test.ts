import { describe, expect, it } from 'vitest';
import {
  EDITORS_SENTINEL_TAG,
  EDITORS_VERSION_KEY,
  SENTINEL_TAG,
  VERSION_KEY,
  consoleBanner,
  duplicateLoadNotice,
  installLoadGuard,
  type ElementRegistry,
} from '../src/load-guard.js';

/** Rejestr jak w przeglądarce: define na prototypie, rzuca przy duplikacie. */
class FakeRegistry implements ElementRegistry {
  defined = new Map<string, unknown>();
  get(name: string): unknown {
    return this.defined.get(name);
  }
  define(name: string, ctor: CustomElementConstructor): void {
    if (this.defined.has(name)) throw new Error(`"${name}" has already been used`);
    this.defined.set(name, ctor);
  }
}

const Ctor = class {} as unknown as CustomElementConstructor;

describe('installLoadGuard', () => {
  it('pierwsza kopia: nie dotyka rejestru, zapisuje swoją wersję', () => {
    const reg = new FakeRegistry();
    const store: Record<symbol, unknown> = {};
    const guard = installLoadGuard(reg, store, '1.2.3');
    expect(guard.duplicate).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(reg, 'define')).toBe(false);
    expect(store[VERSION_KEY]).toBe('1.2.3');
    reg.define(SENTINEL_TAG, Ctor);
    expect(reg.get(SENTINEL_TAG)).toBe(Ctor);
  });

  it('duplikat: każdy stratum-* pominięty bez wyjątku, cudze definicje przechodzą', () => {
    const reg = new FakeRegistry();
    const store: Record<symbol, unknown> = {};
    installLoadGuard(reg, store, '1.0.0');
    reg.define(SENTINEL_TAG, Ctor);

    const guard = installLoadGuard(reg, store, '2.0.0');
    expect(guard.duplicate).toBe(true);
    expect(guard.activeVersion).toBe('1.0.0');
    const Other = class {} as unknown as CustomElementConstructor;
    expect(() => reg.define(SENTINEL_TAG, Other)).not.toThrow();
    // Nowy podkomponent też pominięty — nie mieszamy wersji w jednym drzewie.
    reg.define('stratum-nowy-element', Other);
    expect(reg.get('stratum-nowy-element')).toBeUndefined();
    expect(reg.get(SENTINEL_TAG)).toBe(Ctor);
    reg.define('cudza-karta', Other);
    expect(reg.get('cudza-karta')).toBe(Other);
    // Wersja aktywnej kopii nie zostaje nadpisana przez duplikat.
    expect(store[VERSION_KEY]).toBe('1.0.0');
  });

  it('release przywraca oryginalny define (bez własnej właściwości) i jest idempotentne', () => {
    const reg = new FakeRegistry();
    reg.define(SENTINEL_TAG, Ctor);
    const guard = installLoadGuard(reg, {}, '2.0.0');
    expect(Object.prototype.hasOwnProperty.call(reg, 'define')).toBe(true);
    guard.release();
    guard.release();
    expect(Object.prototype.hasOwnProperty.call(reg, 'define')).toBe(false);
    expect(() => reg.define(SENTINEL_TAG, Ctor)).toThrow(/already been used/);
  });

  it('release nie zrywa cudzego wrappera założonego po nas, ale wyłącza filtr', () => {
    const reg = new FakeRegistry();
    reg.define(SENTINEL_TAG, Ctor);
    const guard = installLoadGuard(reg, {}, '2.0.0');
    const ours = reg.define;
    const calls: string[] = [];
    const theirs = function (this: unknown, name: string, ctor: CustomElementConstructor) {
      calls.push(name);
      return ours.call(this, name, ctor);
    };
    reg.define = theirs;
    guard.release();
    expect(reg.define).toBe(theirs);
    reg.define('stratum-po-release', Ctor);
    expect(calls).toEqual(['stratum-po-release']);
    expect(reg.get('stratum-po-release')).toBe(Ctor);
  });

  it('aktywna kopia bez znacznika (starsza) → activeVersion undefined', () => {
    const reg = new FakeRegistry();
    reg.define(SENTINEL_TAG, Ctor);
    const guard = installLoadGuard(reg, {}, '2.0.0');
    expect(guard.activeVersion).toBeUndefined();
  });
});

describe('installLoadGuard — plik edytorów (PKG-3)', () => {
  const opts = { sentinel: EDITORS_SENTINEL_TAG, versionKey: EDITORS_VERSION_KEY };

  it('osobny klucz wersji: edytory nie nadpisują wersji karty', () => {
    const reg = new FakeRegistry();
    const store: Record<symbol, unknown> = { [VERSION_KEY]: '1.110.0' };
    reg.define(SENTINEL_TAG, Ctor);
    const guard = installLoadGuard(reg, store, '1.110.1', opts);
    // Karta zarejestrowana, ale wartownikiem edytorów jest ich własny tag.
    expect(guard.duplicate).toBe(false);
    expect(store[EDITORS_VERSION_KEY]).toBe('1.110.1');
    expect(store[VERSION_KEY]).toBe('1.110.0');
  });

  it('druga ewaluacja edytorów: stratum-* pominięte bez wyjątku, cudze przechodzą', () => {
    const reg = new FakeRegistry();
    const store: Record<symbol, unknown> = {};
    installLoadGuard(reg, store, '1.110.0', opts);
    reg.define(EDITORS_SENTINEL_TAG, Ctor);
    reg.define('stratum-chips-editor', Ctor);

    const guard = installLoadGuard(reg, store, '1.110.0', opts);
    expect(guard.duplicate).toBe(true);
    expect(guard.activeVersion).toBe('1.110.0');
    const Other = class {} as unknown as CustomElementConstructor;
    expect(() => reg.define(EDITORS_SENTINEL_TAG, Other)).not.toThrow();
    expect(() => reg.define('stratum-chips-editor', Other)).not.toThrow();
    expect(reg.get('stratum-chips-editor')).toBe(Ctor);
    reg.define('ha-cos-cudzego', Other);
    expect(reg.get('ha-cos-cudzego')).toBe(Other);
    guard.release();
    guard.release();
    expect(Object.prototype.hasOwnProperty.call(reg, 'define')).toBe(false);
    expect(() => reg.define('stratum-chips-editor', Other)).toThrow(/already been used/);
  });

  it('wartownik karty nie uznaje edytorów za duplikat (domyślne opcje bez zmian)', () => {
    const reg = new FakeRegistry();
    reg.define(EDITORS_SENTINEL_TAG, Ctor);
    const store: Record<symbol, unknown> = {};
    const guard = installLoadGuard(reg, store, '2.0.0');
    expect(guard.duplicate).toBe(false);
    expect(store[VERSION_KEY]).toBe('2.0.0');
    expect(store[EDITORS_VERSION_KEY]).toBeUndefined();
  });
});

describe('komunikaty w konsoli', () => {
  it('duplicateLoadNotice podaje obie wersje', () => {
    const msg = duplicateLoadNotice('1.0.0', '2.0.0');
    expect(msg).toContain('v1.0.0');
    expect(msg).toContain('v2.0.0');
  });

  it('duplicateLoadNotice dla starszej kopii bez znacznika', () => {
    expect(duplicateLoadNotice(undefined, '2.0.0')).toContain('bez znacznika wersji');
  });

  it('jeden baner dla obu kart z prawdziwą wersją', () => {
    const [fmt, a, b] = consoleBanner('1.109.3');
    expect(fmt).toContain('v1.109.3');
    expect(fmt).toContain('stratum-card');
    expect(fmt).toContain('stratum-room-card');
    expect(fmt.match(/%c/g)).toHaveLength(2);
    expect(a).toBeTypeOf('string');
    expect(b).toBeTypeOf('string');
  });
});
