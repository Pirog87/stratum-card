// Popup z listą encji pasujących do chipa.
//
// Klik w chip nagłówka otwiera ten panel. Układ „wąskie wiersze" (v1.111):
// - wiersz 36 px dla każdej encji; pokój jako nagłówek sekcji tylko wtedy,
//   gdy któryś pokój ma 2+ pozycje — inaczej pogrubiony w wierszu,
// - nazwa bez pokoju i bez słów wspólnych dla całej listy
//   („Czujka obecności … Zajętość" → „schody"),
// - światło/przełącznik: tło = jasność (przeciągnięcie w bok), tap
//   i przełącznik po prawej = włącz/wyłącz; roleta: tło = pozycja,
//   przyciski góra/dół (w ruchu = stop); stopka „Wyłącz/Zamknij wszystkie",
// - czujki: pokój + co odróżnia, po prawej czas od zmiany albo poziom;
//   klik = more-info. Kolejność wg rodzaju listy (chip-list-rows.ts).
//
// Zamykany: klik w backdrop, ×, Escape, Android wstecz.

import {
  LitElement,
  html,
  type PropertyValues,
  type TemplateResult,
  nothing,
} from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { customElement, property } from 'lit/decorators.js';
import type { ChipConfig, HomeAssistant } from './types.js';
import { ago } from './chip-defaults.js';
import { AgoTicker } from './ago-ticker.js';
import {
  clearPower,
  isOnEffective,
  markPower,
  subscribePower,
  tapPower,
} from './power-pending.js';
import {
  alarmClassLabel,
  listRowsUpdate,
  ROW_LEAVE_MS,
} from './chip-list-helpers.js';
import { localize } from './localize/localize.js';
import {
  commonWords,
  dragIntent,
  needsSections,
  pctFromX,
  sortModeFor,
  sortRows,
  stripAreaName,
  withoutWords,
  type RowSortInfo,
} from './chip-list-rows.js';
import { chipListStyles } from './stratum-chip-list-styles.js';
import { flushSwipesTouching } from './light-swipe.js';
import { lightColorOf } from './tile-data.js';
import { pushEscapeLayer } from './escape-stack.js';
import { isDimmable } from './light-dimming.js';
import {
  COVER_WANT_TTL_MS,
  chipRowKind,
  coverServiceForTap,
  coverShownOpen,
  coverShownPos,
  isControlDomain,
  sliderPct,
  type ChipRowKind,
  type CoverTarget,
  type CoverWant,
} from './chip-list-control.js';

/** Etykieta wiersza: pokój, nazwa bez pokoju i słów wspólnych, nazwa bez pokoju. */
interface RowLabel {
  room: string;
  name: string;
  full: string;
  noArea: boolean;
}

interface AreaGroup {
  /** Area ID albo pusty string dla „Bez pomieszczenia". */
  area_id: string;
  area_name: string;
  entity_ids: string[];
}

@customElement('stratum-chip-list')
export class StratumChipList extends LitElement {
  /** Odświeża kolumnę „5min temu", gdy lista stoi otwarta bez zmian stanów. */
  protected readonly _agoTicker = new AgoTicker(this);

  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public chip?: ChipConfig;

  /** Lista entity_id do pokazania. Rozwiązana przez wywołującego. */
  @property({ attribute: false }) public entityIds: string[] = [];

  /** Tytuł (np. „Włączone światła"). */
  @property({ type: String }) public label = '';

  /** Ikona MDI nagłówka. */
  @property({ type: String }) public icon = 'mdi:label-outline';

  /** Kolor akcentu nagłówka (CSS color). */
  @property({ type: String }) public color = 'var(--primary-color, #ff9b42)';

  /** Plakietka typu (device_class) przy wierszach — tryb „Aktywne alarmy". */
  @property({ type: Boolean, attribute: 'show-class-badge' })
  public showClassBadge = false;

  private _close(): void {
    this.dispatchEvent(
      new CustomEvent('close', { bubbles: true, composed: true }),
    );
  }

  private _onBackdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this._close();
  }

  private _unsubPower?: () => void;

  /**
   * Escape przez wspólny stos warstw: lista otwarta nad popupem pokoju jest
   * na szczycie, więc Escape zamyka tylko ją, a Escape wciśnięty w more-info
   * HA (otwartym z wiersza listy) nie zamyka listy wcale.
   */
  private _releaseEscape?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._releaseEscape?.();
    this._releaseEscape = pushEscapeLayer(() => this._close(), this);
    this._unsubPower = subscribePower((ids) => {
      if (this._shown.some((id) => ids.has(id))) this.requestUpdate();
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._releaseEscape?.();
    this._releaseEscape = undefined;
    this._unsubPower?.();
    this._unsubPower = undefined;
    for (const t of this._leaving.values()) window.clearTimeout(t);
    this._leaving.clear();
    this._unpinned = false;
  }

  /**
   * Wiersze listy — „przypięte" na czas otwarcia. Rodzic podaje świeżą listę
   * aktywnych encji przy każdym renderze; dawniej wiersz znikał zaraz po
   * zgaszeniu lampy, wiersze niżej podjeżdżały o wysokość wiersza i drugi
   * tap trafiał w przełącznik INNEJ lampy. Teraz wiersz zostaje (pokazuje
   * „wyłączone"), a nowe aktywne encje dopisujemy na końcu — nic nie
   * przesuwa się pod palcem. Lista odświeża się przy następnym otwarciu.
   */
  private _shown: string[] = [];

  private _shownChip?: ChipConfig;

  private _pinnable(): boolean {
    if (this.showClassBadge) return false;
    const ids = this.entityIds;
    if (this.chip?.type === 'lights') return true;
    return ids.length > 0 && ids.every((id) => this._canControl(id.split('.')[0] ?? ''));
  }

  protected willUpdate(changed: PropertyValues): void {
    if (!changed.has('entityIds') && !changed.has('chip')) return;
    // Przypinamy tylko listy, w których coś się przełącza. Lista alarmów,
    // ruchu czy niedostępnych ma pokazywać, co dzieje się TERAZ — wiersz
    // wyłączonego alarmu nie ma tam czego szukać.
    if (!this._pinnable()) {
      this._shownChip = this.chip;
      this._shown = [...this.entityIds];
      return;
    }
    if (this.chip !== this._shownChip) {
      this._shownChip = this.chip;
      this._shown = [...this.entityIds];
      this._unpinned = false;
      this._syncLeaving([]);
      return;
    }
    const next = listRowsUpdate(this._shown, this.entityIds, this._unpinned);
    this._shown = next.shown;
    this._syncLeaving(next.leaving);
  }

  private _areaOf(id: string): { key: string; name: string } {
    const entry = this.hass?.entities?.[id];
    let areaId = entry?.area_id ?? undefined;
    if (!areaId && entry?.device_id) {
      areaId = this.hass?.devices?.[entry.device_id]?.area_id ?? undefined;
    }
    if (!areaId) return { key: '__none__', name: localize(this.hass, 'chip_list.no_room') };
    return { key: areaId, name: this.hass?.areas?.[areaId]?.name ?? areaId };
  }

  /** Grupy encji wg area — do zakładek. */
  private _groupByArea(): AreaGroup[] {
    const groups = new Map<string, AreaGroup>();
    for (const id of this._shown) {
      const { key, name } = this._areaOf(id);
      if (!groups.has(key)) {
        groups.set(key, { area_id: key, area_name: name, entity_ids: [] });
      }
      groups.get(key)!.entity_ids.push(id);
    }
    // Sortuj: named areas alfabetycznie, „Bez pomieszczenia" na końcu.
    return Array.from(groups.values()).sort((a, b) => {
      if (a.area_id === '__none__') return 1;
      if (b.area_id === '__none__') return -1;
      return a.area_name.localeCompare(b.area_name, 'pl');
    });
  }

  private _canControl(domain: string): boolean {
    return isControlDomain(domain);
  }

  /**
   * Ostatnia znana jasność (%) lampy w tej sesji listy — suwak zgaszonej
   * lampy stoi na niej (przygaszony), zamiast znikać i skracać wiersz.
   */
  private _lastPct = new Map<string, number>();

  /** Oczekiwany stan przełącznika rolety po tapnięciu (patrz coverShownOpen). */
  private _coverWant = new Map<string, CoverWant>();

  /** Cel suwaka rolety trzymany do dojechania (patrz coverShownPos). */
  private _coverTarget = new Map<string, CoverTarget>();

  private _rowKind(id: string): ChipRowKind {
    return chipRowKind(id.split('.')[0] ?? '', this.hass?.states?.[id]);
  }

  /**
   * „Włączony" w sensie przełącznika wiersza. Roleta: otwarta/otwierająca
   * się (HA nigdy nie mówi o niej `on`), z uwzględnieniem świeżego tapu.
   * Reszta: stan z power-pending (natychmiastowa reakcja na tap).
   */
  private _isOn(id: string): boolean {
    if (!id.startsWith('cover.')) return isOnEffective(this.hass, id);
    const shown = coverShownOpen(
      this.hass?.states?.[id]?.state,
      this._coverWant.get(id),
      Date.now(),
    );
    if (shown.settled) this._coverWant.delete(id);
    return shown.open;
  }

  /**
   * Co „Wyłącz wszystkie" naprawdę wyłączy: sterowalne, dostępne i pokazane
   * jako włączone. Jedna reguła dla widoczności stopki, licznika na
   * przycisku i samej komendy — dawniej licznik doliczał każdą roletę,
   * a stopka żadnej, więc lista „Otwarte rolety" nie miała stopki wcale.
   */
  private _offTargets(ids: readonly string[]): string[] {
    return ids.filter((id) => this._rowKind(id) === 'control' && this._isOn(id));
  }

  /** Zwraca mapę domain → ids dla zbioru encji — do master off. */
  private _splitByDomain(ids: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const id of ids) {
      const domain = id.split('.')[0] ?? '';
      if (!map.has(domain)) map.set(domain, []);
      map.get(domain)!.push(id);
    }
    return map;
  }

  /** Master off dla zbioru encji — iteruje po domenach. */
  private _masterOffAll(ids: string[]): void {
    if (!this.hass) return;
    // Tylko to, co faktycznie włączone — bez komend do już zgaszonych
    // i zamkniętych, i bez komend do encji niedostępnych.
    const byDomain = this._splitByDomain(this._offTargets(ids));
    for (const [domain, targets] of byDomain) {
      if (domain === 'cover') {
        this._wantCovers(targets, false);
        void Promise.resolve(
          this.hass.callService('cover', 'close_cover', {}, { entity_id: targets }),
        ).catch(() => this._forgetCovers(targets));
        continue;
      }
      // Odroczona komenda gestu na tych światłach idzie pierwsza — inaczej
      // przyszłaby po naszym turn_off i go nadpisała. Cofnięcie przez zbiór
      // z markPower: nieudana komenda nie kasuje nowszego tapnięcia.
      flushSwipesTouching(targets);
      const marked = markPower(this.hass, targets, 'off');
      void Promise.resolve(
        this.hass.callService(domain, 'turn_off', {}, { entity_id: targets }),
      ).catch(() => clearPower(marked));
    }
  }

  /**
   * Po „Wyłącz wszystkie" lista przestaje przypinać wiersze: każda lampa
   * znika, gdy HA potwierdzi jej zgaszenie, i na końcu zostaje pusta lista
   * („Nic aktywnego"). Widać, co już zgasło, a co jeszcze nie.
   */
  private _unpinned = false;

  /** Wiersze w trakcie zwijania → timer usunięcia. */
  private _leaving = new Map<string, number>();

  private _onMasterOff(visible: string[]): void {
    this._unpinned = true;
    this._masterOffAll(visible);
  }

  private _syncLeaving(leaving: readonly string[]): void {
    const want = new Set(leaving);
    // Lampa zapaliła się z powrotem w trakcie zwijania — zostaje.
    for (const [id, t] of this._leaving) {
      if (!want.has(id)) {
        window.clearTimeout(t);
        this._leaving.delete(id);
      }
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    for (const id of leaving) {
      if (this._leaving.has(id)) continue;
      this._leaving.set(
        id,
        window.setTimeout(() => {
          this._leaving.delete(id);
          this._shown = this._shown.filter((x) => x !== id);
          this.requestUpdate();
        }, reduce ? 0 : ROW_LEAVE_MS),
      );
    }
  }

  /** Przełącznik rolety przestawia się od razu, zanim silnik zgłosi kierunek. */
  private _wantCovers(ids: readonly string[], open: boolean): void {
    const at = Date.now();
    for (const id of ids) this._coverWant.set(id, { open, at });
    this.requestUpdate();
    // Bez potwierdzenia z HA przełącznik ma wrócić do prawdy, a nie wisieć.
    window.setTimeout(() => this.requestUpdate(), COVER_WANT_TTL_MS + 50);
  }

  private _forgetCovers(ids: readonly string[]): void {
    for (const id of ids) this._coverWant.delete(id);
    this.requestUpdate();
  }

  private _toggle(entity_id: string): void {
    if (!this.hass) return;
    const domain = entity_id.split('.')[0] ?? '';
    if (this._rowKind(entity_id) !== 'control') return;
    if (domain === 'cover') {
      // Jawne otwórz/zamknij wg tego, co pokazuje przełącznik — `toggle`
      // odwracał stan z HA, więc „włącz" przy otwartej rolecie ją zamykał.
      const open = this._isOn(entity_id);
      this._wantCovers([entity_id], !open);
      void Promise.resolve(
        this.hass.callService('cover', coverServiceForTap(open), {}, { entity_id }),
      ).catch(() => this._forgetCovers([entity_id]));
      return;
    }
    // Jawne włącz/wyłącz ze stanu, który widać — drugi tap w trakcie nie
    // odwraca akcji, a przełącznik przestawia się od razu (power-pending.ts).
    if (tapPower(this.hass, entity_id)) return;
    void this.hass.callService(domain, 'toggle', { entity_id });
  }

  /** Jasność z gestu na wierszu albo z klawiatury — light.turn_on z %. */
  private _setBrightnessPct(entity_id: string, pct: number): void {
    if (!this.hass) return;
    this._lastPct.set(entity_id, pct);
    // Gest na zgaszonej lampie zapala ją na tym poziomie, więc przełącznik
    // ma się przestawić od razu, jak przy tapnięciu.
    const marked = isOnEffective(this.hass, entity_id)
      ? undefined
      : markPower(this.hass, [entity_id], 'on');
    void Promise.resolve(
      this.hass.callService('light', 'turn_on', { entity_id, brightness_pct: pct }),
    ).catch(() => {
      if (marked) clearPower(marked);
    });
  }

  /** Pozycja rolety z gestu na wierszu albo z klawiatury. */
  private _setCoverPos(entity_id: string, pos: number): void {
    if (!this.hass) return;
    this._coverTarget.set(entity_id, { pos, at: Date.now(), sent: true });
    void this.hass.callService('cover', 'set_cover_position', { entity_id, position: pos });
    // Gdy roleta w ogóle nie ruszy, po 3 s wiersz wraca do jej pozycji.
    window.setTimeout(() => this.requestUpdate(), 3100);
  }

  /** Przyciski góra/dół rolety; w trakcie jazdy przycisk kierunku = stop. */
  private _coverCmd(entity_id: string, cmd: 'open_cover' | 'close_cover' | 'stop_cover'): void {
    if (!this.hass) return;
    if (cmd !== 'stop_cover') this._wantCovers([entity_id], cmd === 'open_cover');
    this._coverTarget.delete(entity_id);
    void Promise.resolve(
      this.hass.callService('cover', cmd, {}, { entity_id }),
    ).catch(() => this._forgetCovers([entity_id]));
  }

  /**
   * Gest na wierszu sterowalnym. Wiersz sam jest suwakiem (tło = poziom):
   * przeciągnięcie w bok zmienia jasność/pozycję, krótki tap przełącza.
   * Pionowy ruch oddajemy przewijaniu listy (touch-action: pan-y +
   * dragIntent) — inaczej przewijanie długiej listy ściemniałoby lampy.
   * W trakcie gestu ruszamy tylko zmienną CSS i tekst wartości, bez
   * re-renderu Lita; render z raportem HA nie przestawia palca.
   */
  private _drag?: {
    id: string;
    kind: 'light' | 'cover' | 'plain';
    el: HTMLElement;
    x: number;
    y: number;
    pid: number;
    live: boolean;
    pct?: number;
    min: number;
  };

  /** Klik po przeciągnięciu nie może przełączyć lampy. */
  private _swallowClick = false;

  private _rowDown(ev: PointerEvent, id: string, kind: 'light' | 'cover' | 'plain'): void {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest('button')) return;
    this._drag = {
      id,
      kind,
      el: ev.currentTarget as HTMLElement,
      x: ev.clientX,
      y: ev.clientY,
      pid: ev.pointerId,
      live: false,
      min: kind === 'light' ? 1 : 0,
    };
  }

  private _rowMove(ev: PointerEvent): void {
    const d = this._drag;
    if (!d || ev.pointerId !== d.pid || d.kind === 'plain') return;
    if (!d.live) {
      const intent = dragIntent(ev.clientX - d.x, ev.clientY - d.y);
      if (intent === 'scroll') {
        this._drag = undefined;
        return;
      }
      if (intent === 'none') return;
      d.live = true;
      try {
        d.el.setPointerCapture(d.pid);
      } catch {
        /* przeglądarka bez capture — gest działa, dopóki palec jest nad wierszem */
      }
      d.el.classList.add('dragging');
    }
    const r = d.el.getBoundingClientRect();
    d.pct = pctFromX(ev.clientX, r.left, r.width, d.min);
    d.el.style.setProperty('--p', `${d.pct}%`);
    const val = d.el.querySelector('.val');
    if (val) val.textContent = `${d.pct}%`;
  }

  private _rowUp(ev: PointerEvent): void {
    const d = this._drag;
    if (!d || ev.pointerId !== d.pid) return;
    this._drag = undefined;
    d.el.classList.remove('dragging');
    if (d.live && d.pct !== undefined) {
      this._swallowClick = true;
      window.setTimeout(() => (this._swallowClick = false), 0);
      if (d.kind === 'light') this._setBrightnessPct(d.id, d.pct);
      else if (d.kind === 'cover') this._setCoverPos(d.id, d.pct);
      return;
    }
  }

  private _rowCancel(): void {
    const d = this._drag;
    this._drag = undefined;
    if (!d) return;
    d.el.classList.remove('dragging');
    // Gest przerwany (przewijanie przejęło palec) — wiersz wraca do stanu.
    this.requestUpdate();
  }

  /** Tap w treść wiersza (nie w przycisk) = przełącz; po przeciągnięciu nic. */
  private _rowClick(ev: MouseEvent, id: string): void {
    if (this._swallowClick) return;
    if ((ev.target as HTMLElement).closest('button')) return;
    this._toggle(id);
  }

  /** Klawiatura na suwaku wiersza: strzałki ±10, Home/End skrajne. */
  private _keyTimer?: number;

  private _sliderKey(ev: KeyboardEvent, id: string, kind: 'light' | 'cover', rendered: number): void {
    const min = kind === 'light' ? 1 : 0;
    // Seria strzałek idzie bez re-renderu — bieżąca wartość siedzi
    // w aria-valuenow, nie w tej z ostatniego renderu.
    const attr = Number((ev.currentTarget as HTMLElement).getAttribute('aria-valuenow'));
    const now = Number.isFinite(attr) ? attr : rendered;
    let next: number | undefined;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') next = Math.min(100, now + 10);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') next = Math.max(min, now - 10);
    else if (ev.key === 'Home') next = min;
    else if (ev.key === 'End') next = 100;
    if (next === undefined) return;
    ev.preventDefault();
    const row = (ev.currentTarget as HTMLElement).closest('.r') as HTMLElement | null;
    row?.style.setProperty('--p', `${next}%`);
    const val = row?.querySelector('.val');
    if (val) val.textContent = `${next}%`;
    (ev.currentTarget as HTMLElement).setAttribute('aria-valuenow', String(next));
    (ev.currentTarget as HTMLElement).setAttribute('aria-valuetext', `${next}%`);
    // Seria strzałek = jedna komenda po chwili ciszy, nie dziesięć do mostu.
    if (kind === 'light') this._lastPct.set(id, next);
    else this._coverTarget.set(id, { pos: next, at: Date.now(), sent: false });
    window.clearTimeout(this._keyTimer);
    const value = next;
    this._keyTimer = window.setTimeout(() => {
      if (kind === 'light') this._setBrightnessPct(id, value);
      else this._setCoverPos(id, value);
    }, 400);
  }


  private _moreInfo(entity_id: string): void {
    const event = new CustomEvent('hass-more-info', {
      detail: { entityId: entity_id },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private _friendlyName(entity_id: string): string {
    return (
      (this.hass?.states?.[entity_id]?.attributes?.friendly_name as
        | string
        | undefined) ?? entity_id
    );
  }


  /** Pokój pogrubiony / nazwa bez pokoju i bez słów wspólnych dla listy. */
  private _labels(ids: readonly string[]): Map<string, RowLabel> {
    const stripped = ids.map((id) => {
      const a = this._areaOf(id);
      return { id, a, s: stripAreaName(this._friendlyName(id), a.key === '__none__' ? '' : a.name) };
    });
    const common = commonWords(stripped.map((x) => x.s).filter(Boolean));
    const out = new Map<string, RowLabel>();
    for (const { id, a, s } of stripped) {
      // `name` może zostać pusty (same słowa wspólne) — wtedy w wierszu bez
      // sekcji widać tylko pokój; `full` to nazwa bez pokoju na wiersz w sekcji.
      out.set(id, {
        room: a.name,
        name: withoutWords(s, common),
        full: s,
        noArea: a.key === '__none__',
      });
    }
    return out;
  }

  private _sortInfo(id: string, name: string): RowSortInfo {
    const st = this.hass?.states?.[id];
    const changed = Date.parse((st as { last_changed?: string } | undefined)?.last_changed ?? '');
    const num = parseFloat(st?.state ?? '');
    const lvl = id.startsWith('sensor.') && Number.isFinite(num)
      ? num
      : (st?.attributes?.battery_level as number | undefined);
    return {
      name,
      changed: Number.isFinite(changed) ? changed : undefined,
      device_class: st?.attributes?.device_class as string | undefined,
      level: typeof lvl === 'number' && Number.isFinite(lvl) ? lvl : undefined,
    };
  }

  protected render(): TemplateResult {
    const groups = this._groupByArea();
    // Jedna podstawa liczników: ile z widocznych wierszy jest nadal
    // aktywnych (przypięte, już zgaszone wiersze nie są liczone).
    const active = new Set(this.entityIds);
    const isActive = (id: string): boolean => active.has(id);
    const total = this._shown.filter(isActive).length;
    const labels = this._labels(this._shown);
    const mode = sortModeFor(this.chip?.type, this.showClassBadge);
    const sort = (ids: readonly string[]): string[] =>
      sortRows(ids, mode, (id) => this._sortInfo(id, labels.get(id)?.full || this._friendlyName(id)));
    // Sekcje pokojów zastąpiły zakładki: nagłówek sekcji niesie nazwę pokoju
    // (raz, nie w każdym wierszu) i akcję „Zgaś" dla pokoju. Bez sekcji
    // (każdy pokój ma jedną pozycję) pokój stoi pogrubiony w wierszu.
    const sections = needsSections(this._shown.map((id) => this._areaOf(id).key));
    const visible = sections ? groups.flatMap((g) => sort(g.entity_ids)) : sort(this._shown);
    // Tyle, ile „Wyłącz wszystkie" naprawdę wyłączy — stopka tylko wtedy.
    const offTargets = this._offTargets(visible);
    const offCount = offTargets.length;
    const allCovers = offCount > 0 && offTargets.every((id) => id.startsWith('cover.'));
    const row = (id: string): TemplateResult => html`<div
      class="row-wrap ${this._leaving.has(id) ? 'leaving' : ''}"
    >
      <div class="row-in"><div class="row-pad">${this._renderRow(id, labels, sections)}</div></div>
    </div>`;
    return html`
      <div
        class="backdrop"
        part="chip-list-popup"
        @click=${this._onBackdropClick}
      >
        <div
          class="panel"
          role="dialog"
          aria-modal="true"
          aria-label=${this.label}
          style="--accent:${this.color};"
        >
          <div class="head">
            <span class="avatar">
              <ha-icon .icon=${this.icon}></ha-icon>
            </span>
            <div class="head-body">
              <div class="head-title">${this.label}</div>
              <div class="head-count">
                ${localize(this.hass, 'chip_list.items', { count: total })} ·
                ${localize(this.hass, 'chip_list.rooms', { count: groups.length })}
              </div>
            </div>
            <button
              class="close"
              title=${localize(this.hass, 'common.close')}
              aria-label=${localize(this.hass, 'common.close')}
              @click=${this._close}
            >
              <ha-icon .icon=${'mdi:close'}></ha-icon>
            </button>
          </div>

          ${this._shown.length === 0
            ? html`<div class="empty">
                <ha-icon .icon=${'mdi:check-circle-outline'}></ha-icon>
                <span>${localize(this.hass, 'chip_list.empty')}</span>
              </div>`
            : html`<div class="list">
                ${sections
                  ? repeat(
                      groups,
                      (g) => g.area_id,
                      (g) => html`${this._renderSection(g, isActive)}${repeat(
                        sort(g.entity_ids),
                        (id) => id,
                        row,
                      )}`,
                    )
                  : repeat(visible, (id) => id, row)}
              </div>`}
          ${offCount > 0
            ? html`<div class="foot">
                <button
                  class="master"
                  @click=${() => this._onMasterOff(visible)}
                >
                  <ha-icon .icon=${allCovers ? 'mdi:arrow-down' : 'mdi:power'}></ha-icon>
                  <span>${localize(
                    this.hass,
                    allCovers ? 'chip_list.close_all' : 'chip_list.off_all',
                    { count: offCount },
                  )}</span>
                </button>
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  /** Nagłówek sekcji pokoju: nazwa · liczba aktywnych + „Zgaś"/„Zamknij". */
  private _renderSection(g: AreaGroup, isActive: (id: string) => boolean): TemplateResult {
    const targets = this._offTargets(g.entity_ids);
    const covers = targets.length > 0 && targets.every((id) => id.startsWith('cover.'));
    return html`<div class="sec" part="chip-list-section">
      <span class="sec-t">${g.area_name}
        <span class="cnt">· ${g.entity_ids.filter(isActive).length}</span></span>
      ${targets.length > 0
        ? html`<button
            class="sec-btn"
            part="chip-list-section-action"
            aria-label=${localize(
              this.hass,
              covers ? 'chip_list.room_close_aria' : 'chip_list.room_off_aria',
              { room: g.area_name },
            )}
            @click=${() => this._onMasterOff(g.entity_ids)}
          >
            ${localize(this.hass, covers ? 'chip_list.room_close' : 'chip_list.room_off')}
          </button>`
        : nothing}
    </div>`;
  }

  private _renderRow(
    id: string,
    labels: Map<string, RowLabel>,
    sections: boolean,
  ): TemplateResult {
    const domain = id.split('.')[0] ?? '';
    const l = labels.get(id) ?? { room: '', name: '', full: '', noArea: true };
    // W sekcji pokój jest w nagłówku → wiersz to sama nazwa. Bez sekcji
    // pokój pogrubiony + nazwa tylko, gdy coś odróżnia (po obcięciu pokoju
    // i słów wspólnych dla listy). Encja bez pokoju — pełna nazwa.
    const main = sections || l.noArea ? l.name || l.full || this._friendlyName(id) : l.room;
    const sub = sections || l.noArea ? '' : l.name;
    const text = html`<b>${main}</b>${sub ? html`<em>· ${sub}</em>` : nothing}`;
    const name = this._friendlyName(id);
    switch (this._rowKind(id)) {
      case 'offline':
        return this._renderOfflineRow(id, domain, text, name);
      case 'control':
        return domain === 'cover'
          ? this._renderCoverRow(id, text, name)
          : this._renderSwitchRow(id, domain, text, name);
      default:
        return this._renderSensorRow(id, domain, text, name);
    }
  }

  /** Przycisk ikony = szczegóły encji w HA (historia, ustawienia). */
  private _iconBtn(id: string, icon: string, name: string): TemplateResult {
    return html`<button
      class="ic"
      part="chip-list-row-icon"
      title=${localize(this.hass, 'common.more_info')}
      aria-label=${localize(this.hass, 'common.entity_details_named', { name })}
      @click=${() => this._moreInfo(id)}
    >
      <ha-icon .icon=${icon}></ha-icon>
    </button>`;
  }

  /**
   * Światło / przełącznik: wąski wiersz, tło = jasność. Przełącznik po
   * prawej (jawne włącz/wyłącz, także dla czytnika ekranu), tap w treść
   * przełącza, przeciągnięcie w bok ściemnia.
   */
  private _renderSwitchRow(
    id: string,
    domain: string,
    text: TemplateResult,
    name: string,
  ): TemplateResult {
    const state = this.hass?.states?.[id];
    const isOn = this._isOn(id);
    const icon = (state?.attributes?.icon as string | undefined) ?? this._defaultIcon(domain, isOn);
    // Suwak (tło wiersza) zostaje też przy zgaszonej, ściemnialnej lampie —
    // przeciągnięcie zapala ją na wybranym poziomie. supported_color_modes HA
    // podaje także dla zgaszonej; „widziana już jako ściemnialna" chroni
    // starsze integracje bez listy trybów.
    const dimmable = domain === 'light' && (isDimmable(state) || this._lastPct.has(id));
    const slider = dimmable
      ? sliderPct(isOn, state?.attributes?.brightness, this._lastPct.get(id))
      : undefined;
    if (slider?.live) this._lastPct.set(id, slider.pct);
    const color = domain === 'light' && isOn ? lightColorOf(state) : undefined;
    const pct = slider ? slider.pct : isOn ? 100 : 0;
    const kind = dimmable ? 'light' : 'plain';
    return html`<div
      class="r ctl ${isOn ? 'on' : 'off'} ${dimmable ? 'slide' : ''}"
      part="chip-list-row"
      style="--p:${pct}%;${color ? `--k:${color};` : ''}"
      @pointerdown=${(e: PointerEvent) => this._rowDown(e, id, kind)}
      @pointermove=${(e: PointerEvent) => this._rowMove(e)}
      @pointerup=${(e: PointerEvent) => this._rowUp(e)}
      @pointercancel=${() => this._rowCancel()}
      @click=${(e: MouseEvent) => this._rowClick(e, id)}
    >
      <span class="fill" aria-hidden="true"><span></span></span>
      ${this._iconBtn(id, icon, name)}
      ${dimmable
        ? html`<span
            class="tx"
            role="slider"
            tabindex="0"
            aria-label=${localize(this.hass, 'chip_list.brightness_aria', { name })}
            aria-valuemin="1"
            aria-valuemax="100"
            aria-valuenow=${pct}
            aria-valuetext="${pct}%"
            @keydown=${(e: KeyboardEvent) => this._sliderKey(e, id, 'light', pct)}
            >${text}</span>`
        : html`<span class="tx">${text}</span>`}
      <span class="val">${dimmable && isOn ? `${pct}%` : nothing}</span>
      <button
        class="sw ${isOn ? 'on' : ''}"
        part="chip-list-row-switch"
        role="switch"
        aria-checked=${isOn ? 'true' : 'false'}
        aria-label=${name}
        title=${localize(this.hass, isOn ? 'common.turn_off' : 'common.turn_on')}
        @click=${() => this._toggle(id)}
      >
        <span class="knob"></span>
      </button>
    </div>`;
  }

  /**
   * Roleta: tło = stopień otwarcia, przyciski góra/dół po prawej. W trakcie
   * jazdy przycisk kierunku zamienia się w stop — drugi tap zatrzymuje,
   * zamiast wysyłać tę samą komendę jeszcze raz.
   */
  private _renderCoverRow(id: string, text: TemplateResult, name: string): TemplateResult {
    const state = this.hass?.states?.[id];
    const isOpen = this._isOn(id);
    const icon = (state?.attributes?.icon as string | undefined) ?? this._defaultIcon('cover', isOpen);
    const raw = state?.attributes?.current_position;
    let pos: number | undefined;
    if (typeof raw === 'number') {
      const shown = coverShownPos(Math.round(raw), state?.state, this._coverTarget.get(id), Date.now());
      if (shown.settled) this._coverTarget.delete(id);
      pos = shown.pos;
    }
    const s = state?.state;
    const valText =
      pos !== undefined && s !== 'opening' && s !== 'closing'
        ? `${pos}%`
        : localize(this.hass, s === 'opening' ? 'tile.opening' : s === 'closing' ? 'tile.closing' : isOpen ? 'tile.open' : 'tile.closed');
    const upCmd = s === 'opening' ? 'stop_cover' : 'open_cover';
    const downCmd = s === 'closing' ? 'stop_cover' : 'close_cover';
    const btn = (cmd: 'open_cover' | 'close_cover' | 'stop_cover', dir: 'up' | 'down'): TemplateResult => {
      const stop = cmd === 'stop_cover';
      const key = stop ? 'chip_list.cover_stop' : dir === 'up' ? 'chip_list.cover_open' : 'chip_list.cover_close';
      return html`<button
        class="cb ${stop ? 'stop' : ''}"
        part="chip-list-row-cover-btn"
        aria-label=${localize(this.hass, key, { name })}
        title=${localize(this.hass, key, { name })}
        @click=${() => this._coverCmd(id, cmd)}
      >
        <ha-icon .icon=${stop ? 'mdi:stop' : dir === 'up' ? 'mdi:arrow-up' : 'mdi:arrow-down'}></ha-icon>
      </button>`;
    };
    return html`<div
      class="r ctl cover ${isOpen ? 'on' : 'off'} ${pos !== undefined ? 'slide' : ''}"
      part="chip-list-row"
      style="--p:${pos ?? (isOpen ? 100 : 0)}%;"
      @pointerdown=${(e: PointerEvent) => this._rowDown(e, id, pos !== undefined ? 'cover' : 'plain')}
      @pointermove=${(e: PointerEvent) => this._rowMove(e)}
      @pointerup=${(e: PointerEvent) => this._rowUp(e)}
      @pointercancel=${() => this._rowCancel()}
    >
      <span class="fill" aria-hidden="true"><span></span></span>
      ${this._iconBtn(id, icon, name)}
      ${pos !== undefined
        ? html`<span
            class="tx"
            role="slider"
            tabindex="0"
            aria-label=${localize(this.hass, 'chip_list.position_aria', { name })}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${pos}
            aria-valuetext="${pos}%"
            @keydown=${(e: KeyboardEvent) => this._sliderKey(e, id, 'cover', pos ?? 0)}
            >${text}</span>`
        : html`<span class="tx">${text}</span>`}
      <span class="val">${valText}</span>
      ${btn(upCmd, 'up')}${btn(downCmd, 'down')}
    </div>`;
  }

  /** Wartość po prawej wiersza czujki: poziom (sensor liczbowy) albo czas od zmiany. */
  private _valueText(id: string): string | undefined {
    const st = this.hass?.states?.[id];
    if (!st) return undefined;
    if (id.startsWith('sensor.')) {
      const n = parseFloat(st.state);
      if (Number.isFinite(n)) {
        const unit = (st.attributes?.unit_of_measurement as string | undefined) ?? '';
        return unit === '%' ? `${Math.round(n)}%` : `${st.state}${unit ? ` ${unit}` : ''}`;
      }
    }
    const lc = (st as { last_changed?: string }).last_changed;
    return lc ? ago(lc) : undefined;
  }

  /**
   * Wiersz czujki (obecność, okna, wyciek, bateria...): ikona, pokój + co
   * odróżnia, po prawej czas od zmiany albo poziom. Cały wiersz = szczegóły.
   */
  private _renderSensorRow(
    id: string,
    domain: string,
    text: TemplateResult,
    name: string,
  ): TemplateResult {
    const state = this.hass?.states?.[id];
    const isOn = state?.state === 'on' || domain === 'sensor';
    const icon = (state?.attributes?.icon as string | undefined) ?? this._defaultIcon(domain, isOn);
    const cls = this.showClassBadge ? (state?.attributes?.device_class as string | undefined) : undefined;
    const badge = cls ? alarmClassLabel(this.hass, cls) : undefined;
    const val = this._valueText(id);
    return html`<button
      class="r sens ${isOn ? 'on' : ''} ${this.showClassBadge ? 'alarm' : ''}"
      part="chip-list-row"
      aria-label=${localize(this.hass, 'common.entity_details_named', { name })}
      @click=${() => this._moreInfo(id)}
    >
      <span class="ic" aria-hidden="true"><ha-icon .icon=${icon}></ha-icon></span>
      <span class="tx">${text}</span>
      ${badge ? html`<span class="badge">${badge}</span>` : nothing}
      ${val ? html`<span class="val">${val}</span>` : nothing}
    </button>`;
  }

  /**
   * Encja niedostępna — wzorzec off-pill (przekreślona ikona + plakietka),
   * bez martwego przełącznika. Tap = szczegóły (diagnoza, historia).
   */
  private _renderOfflineRow(
    id: string,
    domain: string,
    text: TemplateResult,
    name: string,
  ): TemplateResult {
    const state = this.hass?.states?.[id];
    const icon = (state?.attributes?.icon as string | undefined) ?? this._defaultIcon(domain, false);
    const lc = (state as { last_changed?: string } | undefined)?.last_changed;
    return html`<button
      class="r unav"
      part="chip-list-row"
      aria-label=${localize(this.hass, 'common.entity_details_named', { name })}
      @click=${() => this._moreInfo(id)}
    >
      <span class="ic unav-icon" aria-hidden="true"><ha-icon .icon=${icon}></ha-icon></span>
      <span class="tx">${text}</span>
      <span class="off-pill">${localize(this.hass, 'common.offline')}</span>
      ${lc ? html`<span class="val">${ago(lc)}</span>` : nothing}
    </button>`;
  }

  private _defaultIcon(domain: string, on: boolean): string {
    if (domain === 'light') return on ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline';
    if (domain === 'switch') return on ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off-outline';
    if (domain === 'cover') return on ? 'mdi:window-shutter-open' : 'mdi:window-shutter';
    if (domain === 'binary_sensor') return 'mdi:motion-sensor';
    return 'mdi:label-outline';
  }

  static styles = chipListStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-chip-list': StratumChipList;
  }
}
