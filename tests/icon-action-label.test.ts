import { describe, expect, it } from 'vitest';
import {
  ICON_ACTION_FALLBACK_PL,
  iconActionLabel,
} from '../src/icon-action-label.js';

describe('iconActionLabel', () => {
  it('opisuje akcję z typu, nie ogólnikiem', () => {
    expect(iconActionLabel('Kuchnia', 'navigate')).toBe('Kuchnia: przejdź do widoku');
    expect(iconActionLabel('Kuchnia', 'url')).toBe('Kuchnia: otwórz link');
    expect(iconActionLabel('Kuchnia', 'popup')).toBe('Kuchnia: pokaż szczegóły pokoju');
    expect(iconActionLabel('Kuchnia', 'toggle-lights')).toBe('Kuchnia: przełącz światła');
  });

  it('stary i nowy zapis usługi dają ten sam opis', () => {
    expect(iconActionLabel('Salon', 'call-service')).toBe(
      iconActionLabel('Salon', 'perform-action'),
    );
  });

  it('nieznany typ i brak typu → deterministyczny default', () => {
    expect(iconActionLabel('Salon', 'assist')).toBe(`Salon: ${ICON_ACTION_FALLBACK_PL}`);
    expect(iconActionLabel('Salon', undefined)).toBe(`Salon: ${ICON_ACTION_FALLBACK_PL}`);
  });

  it('klucz z prototypu nie wycieka jako opis', () => {
    expect(iconActionLabel('Salon', 'constructor')).toBe(`Salon: ${ICON_ACTION_FALLBACK_PL}`);
    expect(iconActionLabel('Salon', 'toString')).toBe(`Salon: ${ICON_ACTION_FALLBACK_PL}`);
  });

  it('bez nazwy pokoju zostaje sam czasownik', () => {
    expect(iconActionLabel(undefined, 'url')).toBe('otwórz link');
    expect(iconActionLabel('  ', 'url')).toBe('otwórz link');
  });

  it('przyjmuje własny słownik (pod lokalizację)', () => {
    expect(iconActionLabel('Kitchen', 'url', { url: 'open link' }, 'icon action')).toBe(
      'Kitchen: open link',
    );
    expect(iconActionLabel('Kitchen', 'navigate', { url: 'open link' }, 'icon action')).toBe(
      'Kitchen: icon action',
    );
  });
});
