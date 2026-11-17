import { describe, expect, it } from 'vitest';
import { iconActionLabel } from '../src/icon-action-label.js';
import { pl } from '../src/localize/pl.js';

const FALLBACK_PL = pl.icon_action.fallback;

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
    expect(iconActionLabel('Salon', 'assist')).toBe(`Salon: ${FALLBACK_PL}`);
    expect(iconActionLabel('Salon', undefined)).toBe(`Salon: ${FALLBACK_PL}`);
  });

  it('klucz z prototypu nie wycieka jako opis', () => {
    expect(iconActionLabel('Salon', 'constructor')).toBe(`Salon: ${FALLBACK_PL}`);
    expect(iconActionLabel('Salon', 'toString')).toBe(`Salon: ${FALLBACK_PL}`);
  });

  it('bez nazwy pokoju zostaje sam czasownik', () => {
    expect(iconActionLabel(undefined, 'url')).toBe('otwórz link');
    expect(iconActionLabel('  ', 'url')).toBe('otwórz link');
  });

  it('język z hass: angielski dla EN i innych języków', () => {
    expect(iconActionLabel('Kitchen', 'url', { language: 'en' })).toBe('Kitchen: open link');
    expect(iconActionLabel('Küche', 'navigate', 'de')).toBe('Küche: go to view');
    expect(iconActionLabel('Kitchen', 'assist', 'en')).toBe('Kitchen: icon action');
  });
});
