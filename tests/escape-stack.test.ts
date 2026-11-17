import { describe, expect, it } from 'vitest';
import {
  EscapeLayers,
  escapePhase,
  isFromForeignDialog,
  isHostedInDialog,
  isLayerOwnerName,
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

  it('topHost: gospodarz najwyższej warstwy (do wykrycia dialogu-gospodarza)', () => {
    const layers = new EscapeLayers<string>();
    expect(layers.topHost).toBeUndefined();
    const releaseRoom = layers.push(() => {}, 'card');
    const releaseList = layers.push(() => {}, 'list');
    expect(layers.topHost).toBe('list');
    releaseList();
    expect(layers.topHost).toBe('card');
    releaseRoom();
    expect(layers.topHost).toBeUndefined();
  });
});

describe('dialog nadrzędny karty (przegląd v1.109.0)', () => {
  it('karta w podglądzie edytora: dialog za warstwą Stratum nie blokuje Escape', () => {
    expect(isFromForeignDialog(['div', 'stratum-room-card', 'div', 'stratum-card', 'hui-card-preview', 'ha-dialog', 'hui-dialog-edit-card', 'body'])).toBe(false);
  });
  it('more-info nad popupem: dialog przed warstwą Stratum blokuje', () => {
    expect(isFromForeignDialog(['input', 'ha-more-info-dialog', 'home-assistant', 'body'])).toBe(true);
  });
});

// Elementy warstwy w testach to nazwy tagów (tożsamość = równość napisu).
// Popup pokoju otwiera stratum-card — to ona jest gospodarzem warstwy.
const OWN = new Set(['stratum-card']);

describe('karta w dialogu-gospodarzu: faza capture (przegląd v1.109.3)', () => {
  const preview = ['div', 'stratum-room-card', 'div', 'stratum-card', 'hui-card-preview', 'ha-dialog', 'hui-dialog-edit-card', 'body'];

  it('podgląd edytora i browser_mod: karta w dialogu', () => {
    expect(isHostedInDialog(preview)).toBe(true);
    expect(isHostedInDialog(['div', 'stratum-card', 'ha-wa-dialog', 'browser-mod-popup', 'body'])).toBe(true);
    expect(isHostedInDialog(['div', 'stratum-card', 'dialog', 'body'])).toBe(true);
    expect(escapePhase(preview, OWN)).toBe('capture');
  });

  it('zwykły dashboard i more-info nad popupem: bubble jak dotąd', () => {
    expect(isHostedInDialog(['div', 'stratum-card', 'hui-view', 'home-assistant', 'body'])).toBe(false);
    // more-info leży poza kartą — na ścieżce nie ma elementu Stratum.
    expect(isHostedInDialog(['input', 'ha-more-info-dialog', 'home-assistant', 'body'])).toBe(false);
    expect(isHostedInDialog(['body', 'html'])).toBe(false);
    expect(escapePhase(['div', 'stratum-card', 'body'], OWN)).toBe('bubble');
  });

  it('fokus poza popupem, na elemencie dialogu-gospodarza: bubble na gospodarzu', () => {
    // Gospodarz wycięty ze ścieżki (to przodek karty, nie dialog nad nią).
    const path = ['button', 'body', 'html'];
    expect(escapePhase(path, OWN)).toBe('bubble');
    expect(escapePhase(path, OWN, true)).toBe('host');
    expect(isFromForeignDialog(path)).toBe(false);
  });

  it('pole gospodarza z własnym Escape (combo-box, edytor kodu) nie traci klawisza (przegląd v1.109.3 r2)', () => {
    // Capture na document zabierał Escape polu, zanim je osiągnął. Faza
    // „host" słucha w bubble — pole jest pierwsze.
    expect(escapePhase(['input', 'ha-combo-box', 'hui-card-element-editor', 'body', 'html'], OWN, true)).toBe('host');
    expect(escapePhase(['div', 'ha-code-editor', 'body', 'html'], OWN, true)).toBe('host');
    // Pole samo obsłużyło Escape (preventDefault) — warstwa zostaje.
    const layers = new EscapeLayers();
    let closed = 0;
    layers.push(() => closed++);
    expect(layers.handle({ key: 'Escape', defaultPrevented: true, pathNames: ['input', 'body'] })).toBe(false);
    expect(closed).toBe(0);
  });

  it('fokus w warstwie Stratum albo nigdzie (body): capture, jak dotąd', () => {
    expect(escapePhase(['button', 'stratum-room-card', 'div', 'stratum-card', 'body'], OWN, true)).toBe('capture');
    expect(escapePhase(['body', 'html'], OWN, true)).toBe('capture');
    expect(escapePhase([], OWN, true)).toBe('capture');
    // Bez gospodarza body to zwykły dashboard.
    expect(escapePhase(['body', 'html'], OWN)).toBe('bubble');
  });

  it('dialog nad warstwą (głębiej niż Stratum) to nie gospodarz', () => {
    expect(isHostedInDialog(['input', 'ha-md-dialog', 'stratum-card', 'body'])).toBe(false);
  });
});

describe('escapePhase: edytor karty obok podglądu (przegląd v1.109.3 r3)', () => {
  // Dialog edycji karty HA po wycięciu gospodarzy (ha-dialog / ha-md-dialog):
  // formularz to stratum-card-editor w hui-card-element-editor, podgląd to
  // stratum-card w hui-card-preview — rodzeństwo, nie przodek i potomek.
  const editorTail = ['stratum-card-editor', 'hui-card-element-editor', 'hui-dialog-edit-card', 'home-assistant', 'body', 'html'];

  it('pola formularza Stratum oddają Escape sobie, nie popupowi podglądu', () => {
    const fields = [
      ['input', 'ha-combo-box', 'ha-selector-entity', 'ha-selector', 'ha-form', ...editorTail],
      ['div', 'ha-code-editor', 'ha-yaml-editor', ...editorTail],
      ['input', 'ha-textfield', 'ha-form', 'stratum-card-rooms-editor', ...editorTail],
      ['input', 'ha-icon-picker', 'stratum-popup-header-editor', 'stratum-card-rooms-editor', ...editorTail],
    ];
    for (const path of fields) expect(escapePhase(path, OWN, true)).toBe('host');
  });

  it('Escape z wnętrza popupu podglądu (E3): capture, zamyka tylko popup', () => {
    const popup = ['button', 'stratum-room-tile', 'div', 'stratum-room-card', 'div', 'stratum-card', 'hui-card-preview', 'hui-dialog-edit-card', 'home-assistant', 'body', 'html'];
    expect(escapePhase(popup, OWN, true)).toBe('capture');
    // Sam dialog popupu (div role="dialog" w stratum-card) i karta pod nim.
    expect(escapePhase(['div', 'stratum-card', 'hui-card-preview', 'body'], OWN, true)).toBe('capture');
  });

  it('lista chipa nad popupem: fokus w liście albo w popupie pod nią — capture', () => {
    const own = new Set(['stratum-card', 'stratum-chip-list', 'stratum-room-card']);
    expect(escapePhase(['button', 'stratum-chip-list', 'stratum-room-card', 'stratum-card', 'body'], own, true)).toBe('capture');
    expect(escapePhase(['button', 'stratum-room-card', 'stratum-card', 'body'], own, true)).toBe('capture');
    // Formularz edytora nadal nie należy do warstwy.
    expect(escapePhase(['input', 'ha-combo-box', ...editorTail], own, true)).toBe('host');
  });

  it('dwie karty Stratum: element tej samej nazwy, ale nie gospodarz, to nie warstwa', () => {
    // Tożsamość węzłów, nie nazwa tagu: druga stratum-card w dialogu nie
    // należy do warstwy, którą otworzyła pierwsza.
    const mine = { localName: 'stratum-card' };
    const other = { localName: 'stratum-card' };
    const field = { localName: 'input' };
    expect(escapePhase([field, other], new Set([mine]), true)).toBe('host');
    expect(escapePhase([field, mine], new Set([mine]), true)).toBe('capture');
  });

  it('węzły bez nazwy (ShadowRoot, document) nie psują rozpoznania body', () => {
    const body = { localName: 'body' };
    expect(escapePhase([body, {}, null], new Set<unknown>(), true)).toBe('capture');
    expect(escapePhase([{ localName: 'button' }, body], new Set<unknown>(), true)).toBe('host');
  });

  it('bez dialogu-gospodarza zawsze bubble, także z edytora', () => {
    expect(escapePhase(['input', 'ha-combo-box', ...editorTail], OWN)).toBe('bubble');
    expect(escapePhase(['button', 'stratum-card', 'hui-view', 'body'], OWN)).toBe('bubble');
  });

  it('isLayerOwnerName: karty i listy tak, edytory nie', () => {
    expect(isLayerOwnerName('stratum-card')).toBe(true);
    expect(isLayerOwnerName('stratum-room-card')).toBe(true);
    expect(isLayerOwnerName('stratum-chip-list')).toBe(true);
    expect(isLayerOwnerName('stratum-card-editor')).toBe(false);
    expect(isLayerOwnerName('stratum-card-rooms-editor')).toBe(false);
    expect(isLayerOwnerName('hui-card-element-editor')).toBe(false);
  });
});

describe('EscapeLayers.hosts', () => {
  it('gospodarze wszystkich warstw, od spodu', () => {
    const layers = new EscapeLayers<string>();
    const a = layers.push(() => {}, 'stratum-card');
    layers.push(() => {});
    layers.push(() => {}, 'stratum-chip-list');
    expect(layers.hosts).toEqual(['stratum-card', 'stratum-chip-list']);
    a();
    expect(layers.hosts).toEqual(['stratum-chip-list']);
  });
});
