import { describe, expect, it } from 'vitest';
import {
  binaryStateText,
  entityStateText,
  fallbackStateText,
  fillTemplate,
  formatNumberState,
  mediaStateText,
  tileStrings,
} from '../src/tile-state-text.js';
import { tileEn, tilePl } from '../src/localize/tile.js';
import type { HassEntity } from '../src/types.js';

const st = (state: string, attributes: Record<string, unknown> = {}): HassEntity =>
  ({ entity_id: 'sensor.x', state, attributes, last_changed: '', last_updated: '' }) as HassEntity;

describe('tileStrings', () => {
  it('brak języka i polski → PL, inny → EN', () => {
    expect(tileStrings(undefined)).toBe(tilePl);
    expect(tileStrings('pl')).toBe(tilePl);
    expect(tileStrings('pl-PL')).toBe(tilePl);
    expect(tileStrings('en')).toBe(tileEn);
    expect(tileStrings('de')).toBe(tileEn);
  });

  it('EN ma te same klucze co PL (płasko i zagnieżdżone)', () => {
    const keys = (o: object, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' ? keys(v as object, `${p}${k}.`) : [`${p}${k}`],
      );
    expect(keys(tileEn).sort()).toEqual(keys(tilePl).sort());
  });
});

describe('fillTemplate', () => {
  it('podstawia znane klucze, nieznane zostawia', () => {
    expect(fillTemplate('HTTP {status} {x}', { status: 403 })).toBe('HTTP 403 {x}');
  });
});

describe('formatNumberState', () => {
  it('przecinek po polsku, zachowuje precyzję encji', () => {
    expect(formatNumberState('21.5', 'pl')).toBe('21,5');
    expect(formatNumberState('21.50', 'pl')).toBe('21,50');
    expect(formatNumberState('21', 'pl')).toBe('21');
    expect(formatNumberState('21.5', 'en')).toBe('21.5');
  });
});

describe('fallbackStateText', () => {
  it('liczba + jednostka; % i ° bez spacji', () => {
    expect(fallbackStateText(st('21.5', { unit_of_measurement: '°C' }), tilePl, 'pl')).toBe('21,5 °C');
    expect(fallbackStateText(st('45', { unit_of_measurement: '%' }), tilePl, 'pl')).toBe('45%');
    expect(fallbackStateText(st('-3', {}), tilePl, 'pl')).toBe('-3');
  });

  it('znane stany po polsku, nieznane surowo', () => {
    expect(fallbackStateText(st('not_home'), tilePl, 'pl')).toBe('poza domem');
    expect(fallbackStateText(st('unknown'), tilePl, 'pl')).toBe('nieznany');
    expect(fallbackStateText(st('eco'), tilePl, 'pl')).toBe('eco');
  });
});

describe('entityStateText', () => {
  it('formatEntityState z HA wygrywa', () => {
    const hass = { language: 'pl', formatEntityState: (s: HassEntity) => `HA:${s.state}` };
    expect(entityStateText(hass, st('21.5'))).toBe('HA:21.5');
  });

  it('wyjątek albo pusty wynik z HA → fallback, nigdy pusty kafel', () => {
    const throwing = {
      language: 'pl',
      formatEntityState: () => {
        throw new Error('x');
      },
    };
    expect(entityStateText(throwing, st('on'))).toBe('włączone');
    expect(entityStateText({ language: 'pl', formatEntityState: () => '' }, st('off'))).toBe(
      'wyłączone',
    );
    expect(entityStateText(undefined, st('on'))).toBe('włączone');
  });
});

describe('binaryStateText', () => {
  it('okno/drzwi: otwarte/zamknięte', () => {
    expect(binaryStateText({ language: 'pl' }, st('on', { device_class: 'window' }))).toBe('otwarte');
    expect(binaryStateText({ language: 'pl' }, st('off', { device_class: 'door' }))).toBe('zamknięte');
  });

  it('ruch: wykryto/brak — nie „otwarte"', () => {
    expect(binaryStateText({ language: 'pl' }, st('on', { device_class: 'motion' }))).toBe('wykryto');
    expect(binaryStateText({ language: 'en' }, st('off', { device_class: 'occupancy' }))).toBe('clear');
  });

  it('inne klasy przez tłumaczenia HA albo fallback', () => {
    const hass = { language: 'pl', formatEntityState: () => 'Wykryto dym' };
    expect(binaryStateText(hass, st('on', { device_class: 'smoke' }))).toBe('Wykryto dym');
    expect(binaryStateText({ language: 'pl' }, st('on', { device_class: 'smoke' }))).toBe('włączone');
  });

  it('unknown nie udaje „zamknięte" / „brak" (czujnik po restarcie HA)', () => {
    expect(binaryStateText({ language: 'pl' }, st('unknown', { device_class: 'window' }))).toBe(
      'nieznany',
    );
    expect(binaryStateText({ language: 'pl' }, st('unknown', { device_class: 'motion' }))).toBe(
      'nieznany',
    );
    expect(binaryStateText({ language: 'en' }, st('unavailable', { device_class: 'door' }))).toBe(
      tileEn.unavailable,
    );
    const hass = { language: 'pl', formatEntityState: () => 'Nieznany' };
    expect(binaryStateText(hass, st('unknown', { device_class: 'window' }))).toBe('Nieznany');
  });
});

describe('mediaStateText', () => {
  it('stany playera po polsku i angielsku', () => {
    expect(mediaStateText('playing', tilePl)).toBe('odtwarza');
    expect(mediaStateText('paused', tilePl)).toBe('pauza');
    expect(mediaStateText('unavailable', tilePl)).toBe('niedostępne');
    expect(mediaStateText('paused', tileEn)).toBe('paused');
    expect(mediaStateText('on_hold', tilePl)).toBe('on_hold');
  });
});
