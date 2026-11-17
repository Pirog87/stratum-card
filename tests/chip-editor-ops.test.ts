import { describe, expect, it } from 'vitest';
import { chipFromForm } from '../src/chip-editor-ops.js';
import type { ChipConfig } from '../src/types.js';

/** Symuluje ha-form: oddaje cały obiekt danych z naniesioną zmianą. */
function form(chip: ChipConfig, change: Record<string, unknown>): Record<string, unknown> {
  return {
    show_when_zero: chip.show_when_zero !== false,
    show_list: (chip as { show_list?: boolean }).show_list !== false,
    ...chip,
    ...change,
  };
}

describe('chipFromForm — wyczyszczone pole wraca do defaultu', () => {
  it('kasuje wyczyszczony kolor i ikonę (pusty string i undefined)', () => {
    const chip: ChipConfig = { type: 'lights', color: 'red', icon: 'mdi:star' };
    const out = chipFromForm(chip, form(chip, { color: '', icon: undefined }));
    expect(out).toEqual({ type: 'lights' });
  });

  it('kasuje klucz, którego formularz w ogóle nie oddał', () => {
    const chip: ChipConfig = { type: 'lights', color: 'red' };
    const value = form(chip, {});
    delete value.color;
    expect(chipFromForm(chip, value)).toEqual({ type: 'lights' });
  });

  it('kasuje sufiks i atrybut chipu encji, zostawia encję', () => {
    const chip: ChipConfig = {
      type: 'entity',
      entity: 'sensor.temp',
      format: 'attribute',
      attribute: 'temperature',
      suffix: '°C',
    };
    const out = chipFromForm(chip, form(chip, { suffix: '', attribute: null, format: undefined }));
    expect(out).toEqual({ type: 'entity', entity: 'sensor.temp' });
  });

  it('kasuje stan i device_class chipu filtra', () => {
    const chip: ChipConfig = { type: 'filter', domain: 'binary_sensor', device_class: 'motion', state: 'on' };
    const out = chipFromForm(chip, form(chip, { state: '', device_class: '' }));
    expect(out).toEqual({ type: 'filter', domain: 'binary_sensor' });
  });

  it('kasuje wyczyszczony tap_action', () => {
    const chip: ChipConfig = { type: 'motion', tap_action: { action: 'more-info' } };
    const out = chipFromForm(chip, form(chip, { tap_action: undefined }));
    expect(out).toEqual({ type: 'motion' });
  });

  it('zapisuje nową wartość i nie gubi pól spoza formularza', () => {
    const chip: ChipConfig = { type: 'motion', show_last_changed: true };
    const out = chipFromForm(chip, form(chip, { color: 'green' }));
    expect(out).toEqual({ type: 'motion', show_last_changed: true, color: 'green' });
  });

  it('nie pozwala formularzowi zmienić ani skasować typu', () => {
    const chip: ChipConfig = { type: 'doors', show_when_zero: false };
    const value = form(chip, { type: undefined });
    expect(chipFromForm(chip, value).type).toBe('doors');
  });
});

describe('chipFromForm — toggle’e z defaultem', () => {
  it('show_when_zero: zapisuje tylko false, true kasuje klucz', () => {
    const alarm: ChipConfig = { type: 'leak', show_when_zero: false };
    expect(chipFromForm(alarm, form(alarm, { show_when_zero: true }))).toEqual({ type: 'leak' });
    const plain: ChipConfig = { type: 'lights' };
    expect(chipFromForm(plain, form(plain, { show_when_zero: false }))).toEqual({
      type: 'lights',
      show_when_zero: false,
    });
  });

  it('show_list: domyślne true nie trafia do YAML-a', () => {
    const chip: ChipConfig = { type: 'lights', show_list: false };
    expect(chipFromForm(chip, form(chip, { show_list: true }))).toEqual({ type: 'lights' });
  });

  it('show_last_changed: zapisuje tylko true', () => {
    const chip: ChipConfig = { type: 'motion', show_last_changed: true };
    expect(chipFromForm(chip, form(chip, { show_last_changed: false }))).toEqual({ type: 'motion' });
    const off: ChipConfig = { type: 'occupancy' };
    expect(chipFromForm(off, form(off, { show_last_changed: true }))).toEqual({
      type: 'occupancy',
      show_last_changed: true,
    });
  });

  it('formularz z samymi defaultami nie zmienia chipu', () => {
    const chip: ChipConfig = { type: 'windows', show_when_zero: false };
    expect(chipFromForm(chip, form(chip, {}))).toEqual(chip);
  });
});
