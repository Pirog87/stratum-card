import { describe, expect, it } from 'vitest';
import { TemplateRenderer } from '../src/template-renderer.js';
import type { HomeAssistant } from '../src/types.js';

/** Fałszywe połączenie WS: zapamiętuje subskrypcje i pozwala „pchnąć" wynik. */
function fakeConnection() {
  const subs: Array<{ cb: (msg: { result: string }) => void; active: boolean }> = [];
  const connection = {
    subscribeMessage: (cb: (msg: { result: string }) => void) => {
      const entry = { cb, active: true };
      subs.push(entry);
      return Promise.resolve(() => {
        entry.active = false;
      });
    },
  };
  const hass = { states: {}, connection } as unknown as HomeAssistant;
  return {
    hass,
    subs,
    push: (result: string) => subs.filter((s) => s.active).forEach((s) => s.cb({ result })),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('TemplateRenderer — powrót karty z pamięci widoków HA', () => {
  it('po destroy() ostatni wynik zostaje, a ponowna subskrypcja dostaje świeże wartości', async () => {
    const ws = fakeConnection();
    let updates = 0;
    const r = new TemplateRenderer(() => {
      updates += 1;
    });
    r.setHass(ws.hass);
    r.subscribe('{{ 1 }}');
    await flush();
    ws.push('12 kWh');
    expect(r.get('{{ 1 }}')).toBe('12 kWh');

    // Karta odpięta: subskrypcja zwolniona, ale etykieta nie mruga pustką.
    r.destroy();
    expect(ws.subs[0]!.active).toBe(false);
    expect(r.get('{{ 1 }}')).toBe('12 kWh');

    // Karta wraca: render zakłada subskrypcję od nowa (nie blokuje jej stary wpis).
    r.subscribe('{{ 1 }}');
    await flush();
    expect(ws.subs).toHaveLength(2);
    ws.push('15 kWh');
    expect(r.get('{{ 1 }}')).toBe('15 kWh');
    expect(updates).toBe(2);
  });
});
