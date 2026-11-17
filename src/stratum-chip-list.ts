// Popup z listą encji pasujących do chipa.
//
// Klik w chip nagłówka otwiera ten panel. Układ (wariant C):
// - zakładki pokojów ("Wszystkie · N" + per pokój) filtrują listę,
// - light/switch/cover: duży wiersz z kolorową ikoną, toggle i grubym
//   suwakiem jasności/pozycji, sticky stopka "Wyłącz wszystkie",
// - czujki (motion/occupancy/drzwi/okna/...): prosty wiersz — ikona,
//   nazwa + pokój, po prawej czas od zmiany stanu (16s / 4min / 2h).
//   Klik = more-info. Lista zawiera tylko aktywne encje.
//
// Zamykany: klik w backdrop, ×, Escape, Android wstecz.

import {
  LitElement,
  html,
  css,
  type PropertyValues,
  type TemplateResult,
  nothing,
} from 'lit';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { customElement, property, state } from 'lit/decorators.js';
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
import { ALARM_CLASS_LABELS } from './chip-list-helpers.js';
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

  /** Aktywna zakładka pokoju — null = „Wszystkie". */
  @state() private _areaFilter: string | null = null;

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
    this._releaseEscape = pushEscapeLayer(() => this._close());
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
      return;
    }
    const known = new Set(this._shown);
    const added = this.entityIds.filter((id) => !known.has(id));
    if (added.length > 0) this._shown = [...this._shown, ...added];
  }

  private _areaOf(id: string): { key: string; name: string } {
    const entry = this.hass?.entities?.[id];
    let areaId = entry?.area_id ?? undefined;
    if (!areaId && entry?.device_id) {
      areaId = this.hass?.devices?.[entry.device_id]?.area_id ?? undefined;
    }
    if (!areaId) return { key: '__none__', name: 'Bez pomieszczenia' };
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
      markPower(this.hass, targets, 'off');
      void Promise.resolve(
        this.hass.callService(domain, 'turn_off', {}, { entity_id: targets }),
      ).catch(() => clearPower(targets));
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

  private _setBrightness(entity_id: string, ev: Event): void {
    if (!this.hass) return;
    const pct = parseInt((ev.target as HTMLInputElement).value, 10);
    this._lastPct.set(entity_id, pct);
    // Suwak stoi też przy zgaszonej lampie — przeciągnięcie zapala ją na tym
    // poziomie (light.turn_on z brightness_pct), więc przełącznik ma się
    // przestawić od razu, jak przy tapnięciu.
    const marked = isOnEffective(this.hass, entity_id)
      ? undefined
      : markPower(this.hass, [entity_id], 'on');
    void Promise.resolve(
      this.hass.callService('light', 'turn_on', {
        entity_id,
        brightness_pct: pct,
      }),
    ).catch(() => {
      if (marked) clearPower(marked);
    });
  }

  private _onCoverInput(entity_id: string, ev: Event): void {
    const el = ev.target as HTMLInputElement;
    el.style.setProperty('--pct', `${el.value}%`);
    // W trakcie przeciągania kciuk należy do palca — render z raportem
    // pozycji (roleta w ruchu) nie może go przestawić.
    this._coverTarget.set(entity_id, { pos: Number(el.value), at: Date.now(), sent: false });
  }

  /**
   * Koniec przeciągania bez zatwierdzenia (palec wrócił na start — wtedy
   * `change` nie przychodzi — albo gest przerwany). Niewysłany cel znika po
   * ewentualnym `change`, inaczej suwak zamarzałby na stałe.
   */
  private _endCoverDrag(entity_id: string): void {
    const t = this._coverTarget.get(entity_id);
    if (!t || t.sent) return;
    window.setTimeout(() => {
      if (this._coverTarget.get(entity_id) === t) {
        this._coverTarget.delete(entity_id);
        this.requestUpdate();
      }
    }, 0);
  }

  private _setCoverPosition(entity_id: string, ev: Event): void {
    if (!this.hass) return;
    const pos = parseInt((ev.target as HTMLInputElement).value, 10);
    this._coverTarget.set(entity_id, { pos, at: Date.now(), sent: true });
    void this.hass.callService('cover', 'set_cover_position', {
      entity_id,
      position: pos,
    });
    // Gdy roleta w ogóle nie ruszy, po 3 s suwak wraca do jej pozycji.
    window.setTimeout(() => this.requestUpdate(), 3100);
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

  protected render(): TemplateResult {
    const groups = this._groupByArea();
    // Jedna podstawa liczników: ile z widocznych wierszy jest nadal
    // aktywnych (przypięte, już zgaszone wiersze nie są liczone).
    const active = new Set(this.entityIds);
    const isActive = (id: string): boolean => active.has(id);
    const total = this._shown.filter(isActive).length;
    // Zakładka może wskazywać pokój, który właśnie zniknął z listy
    // (ostatnia encja zgasła) — wtedy wracamy na „Wszystkie".
    const filter =
      this._areaFilter && groups.some((g) => g.area_id === this._areaFilter)
        ? this._areaFilter
        : null;
    // „Wszystkie" — posortowane pomieszczeniami (kolejność jak zakładki).
    const visible = filter
      ? groups.find((g) => g.area_id === filter)!.entity_ids
      : groups.flatMap((g) => g.entity_ids);
    // Tyle, ile „Wyłącz wszystkie" naprawdę wyłączy — stopka tylko wtedy.
    const offCount = this._offTargets(visible).length;
    const showFooter = offCount > 0;
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
                ${total} ${total === 1 ? 'pozycja' : 'pozycji'} ·
                ${groups.length} ${groups.length === 1 ? 'pokój' : 'pokoi'}
              </div>
            </div>
            <button class="close" title="Zamknij" @click=${this._close}>
              <ha-icon .icon=${'mdi:close'}></ha-icon>
            </button>
          </div>

          ${groups.length > 1
            ? html`<div class="tabs">
                <button
                  class="tab ${filter === null ? 'on' : ''}"
                  @click=${() => (this._areaFilter = null)}
                >
                  Wszystkie · ${total}
                </button>
                ${groups.map(
                  (g) => html`<button
                    class="tab ${filter === g.area_id ? 'on' : ''}"
                    @click=${() => (this._areaFilter = g.area_id)}
                  >
                    ${g.area_name} · ${g.entity_ids.filter(isActive).length}
                  </button>`,
                )}
              </div>`
            : nothing}

          ${this._shown.length === 0
            ? html`<div class="empty">
                <ha-icon .icon=${'mdi:check-circle-outline'}></ha-icon>
                <span>Nic aktywnego — wszystko pod kontrolą.</span>
              </div>`
            : html`<div class="list">
                ${repeat(visible, (id) => id, (id) => this._renderRow(id))}
              </div>`}
          ${showFooter
            ? html`<div class="foot">
                <button
                  class="master"
                  @click=${() => this._masterOffAll(visible)}
                >
                  <ha-icon .icon=${'mdi:power'}></ha-icon>
                  <span>Wyłącz wszystkie (${offCount})</span>
                </button>
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderRow(entity_id: string): TemplateResult {
    const domain = entity_id.split('.')[0] ?? '';
    switch (this._rowKind(entity_id)) {
      case 'offline':
        return this._renderOfflineRow(entity_id, domain);
      case 'control':
        return this._renderControlRow(entity_id, domain);
      default:
        return this._renderSensorRow(entity_id);
    }
  }

  /**
   * Wiersz encji niedostępnej — ten sam wzorzec co kafel i wiersz pokoju:
   * przekreślona ikona + plakietka „offline", bez martwego przełącznika
   * i suwaka. Klik = more-info (diagnoza, historia).
   */
  private _renderOfflineRow(entity_id: string, domain: string): TemplateResult {
    const state = this.hass?.states?.[entity_id];
    const icon =
      (state?.attributes?.icon as string | undefined) ??
      this._defaultIcon(domain, false);
    return html`
      <button
        class="prow offline"
        @click=${() => this._moreInfo(entity_id)}
        title="Więcej info"
      >
        <span class="bub unav-icon" aria-hidden="true">
          <ha-icon .icon=${icon}></ha-icon>
        </span>
        <span class="mid">
          <span class="nm">${this._areaOf(entity_id).name}</span>
          <span class="sub">${this._friendlyName(entity_id)}</span>
        </span>
        <span class="off-pill">offline</span>
      </button>
    `;
  }

  /** Duży wiersz sterowalny: ikona + pokój/urządzenie + toggle + gruby suwak. */
  private _renderControlRow(
    entity_id: string,
    domain: string,
  ): TemplateResult {
    const state = this.hass?.states?.[entity_id];
    const isOn = this._isOn(entity_id);
    const name = this._friendlyName(entity_id);
    const icon =
      (state?.attributes?.icon as string | undefined) ??
      this._defaultIcon(domain, isOn);
    // Suwak jasności stoi w wierszu zawsze, gdy lampa jest ściemnialna — też
    // zgaszona. Dawniej był tylko przy świecącej i z raportem jasności, więc
    // gaszenie skracało wiersz o 21 px, a następny przełącznik uciekał spod
    // kciuka; zapalanie wydłużało go z powrotem, gdy HA odesłał jasność.
    // supported_color_modes HA podaje także dla zgaszonej lampy; „widziana
    // już jako ściemnialna" chroni starsze integracje bez listy trybów.
    const dimmable =
      domain === 'light' && (isDimmable(state) || this._lastPct.has(entity_id));
    const slider = dimmable
      ? sliderPct(isOn, state?.attributes?.brightness, this._lastPct.get(entity_id))
      : undefined;
    if (slider?.live) this._lastPct.set(entity_id, slider.pct);
    const coverPosRaw = state?.attributes?.current_position;
    let coverPos: number | undefined;
    if (domain === 'cover' && typeof coverPosRaw === 'number') {
      const shown = coverShownPos(
        Math.round(coverPosRaw),
        state?.state,
        this._coverTarget.get(entity_id),
        Date.now(),
      );
      if (shown.settled) this._coverTarget.delete(entity_id);
      coverPos = shown.pos;
    }
    const lightColor =
      domain === 'light' && isOn ? lightColorOf(state) : undefined;
    // Pokój wyboldowany u góry, pod spodem urządzenie (+ % gdy jest).
    const area = this._areaOf(entity_id).name;
    const hintParts: string[] = [name];
    if (slider && isOn) hintParts.push(`${slider.pct}%`);
    if (coverPos !== undefined) hintParts.push(`${coverPos}%`);
    const sub = hintParts.join(' · ');

    return html`
      <div
        class="crow ${isOn ? 'active' : ''}"
        style=${lightColor ? `--c:${lightColor};` : ''}
      >
        <div class="crow-top">
          <button
            class="bub"
            @click=${() => this._moreInfo(entity_id)}
            title="Więcej info"
          >
            <ha-icon .icon=${icon}></ha-icon>
          </button>
          <div class="mid">
            <span class="nm">${area}</span>
            ${sub ? html`<span class="sub">${sub}</span>` : nothing}
          </div>
          <button
            class="toggle ${isOn ? 'on' : ''}"
            @click=${() => this._toggle(entity_id)}
            role="switch"
            aria-checked=${isOn}
            title=${isOn ? 'Wyłącz' : 'Włącz'}
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
        ${slider
          ? html`<input
              type="range"
              class="bri-slider"
              min="1"
              max="100"
              step="1"
              aria-label=${name}
              style="--pct:${slider.pct}%;"
              .value=${String(Math.max(1, slider.pct))}
              @input=${(ev: Event) => {
                const el = ev.target as HTMLInputElement;
                el.style.setProperty('--pct', `${el.value}%`);
              }}
              @change=${(ev: Event) => this._setBrightness(entity_id, ev)}
              @click=${(ev: Event) => ev.stopPropagation()}
            />`
          : nothing}
        ${coverPos !== undefined
          ? // live() i styleMap porównują z DOM-em / zapisują przy każdym
            // renderze, a nie z ostatnią wartością zatwierdzoną przez Lita.
            // Przeciąganie zmienia suwak poza Litem (`_onCoverInput`), więc
            // zwykłe wiązanie widziało „50 → 50" i pomijało zapis: gdy roleta
            // nie ruszyła albo gest przerwano, suwak zostawał na 80% na stałe.
            html`<input
              type="range"
              class="bri-slider"
              min="0"
              max="100"
              step="1"
              aria-label=${name}
              style=${styleMap({ '--pct': `${coverPos}%` })}
              .value=${live(String(coverPos))}
              @input=${(ev: Event) => this._onCoverInput(entity_id, ev)}
              @pointerup=${() => this._endCoverDrag(entity_id)}
              @pointercancel=${() => this._endCoverDrag(entity_id)}
              @blur=${() => this._endCoverDrag(entity_id)}
              @change=${(ev: Event) => this._setCoverPosition(entity_id, ev)}
              @click=${(ev: Event) => ev.stopPropagation()}
            />`
          : nothing}
      </div>
    `;
  }

  /**
   * Prosty wiersz czujki (obecność, drzwi, okna, wyciek...): ikona,
   * nazwa + pokój, po prawej czas od zmiany stanu. Klik = more-info.
   */
  private _renderSensorRow(entity_id: string): TemplateResult {
    const state = this.hass?.states?.[entity_id];
    const isOn = state?.state === 'on';
    const name = this._friendlyName(entity_id);
    const icon =
      (state?.attributes?.icon as string | undefined) ??
      this._defaultIcon(entity_id.split('.')[0] ?? '', isOn);
    const area = this._areaOf(entity_id).name;
    const lastChanged = (state as { last_changed?: string } | undefined)
      ?.last_changed;
    return html`
      <button
        class="prow ${isOn ? 'active' : ''}"
        @click=${() => this._moreInfo(entity_id)}
        title="Więcej info"
      >
        <span class="bub">
          <ha-icon .icon=${icon}></ha-icon>
        </span>
        <span class="mid">
          <span class="nm">${area}</span>
          <span class="sub">${name}</span>
        </span>
        ${this.showClassBadge
          ? (() => {
              const cls = state?.attributes?.device_class as string | undefined;
              const label = cls ? ALARM_CLASS_LABELS[cls] ?? cls : undefined;
              return label
                ? html`<span class="cls">${label}</span>`
                : nothing;
            })()
          : nothing}
        ${lastChanged
          ? html`<span class="tm">${ago(lastChanged)}</span>`
          : nothing}
      </button>
    `;
  }

  private _defaultIcon(domain: string, on: boolean): string {
    if (domain === 'light') return on ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline';
    if (domain === 'switch') return on ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off-outline';
    if (domain === 'cover') return on ? 'mdi:window-shutter-open' : 'mdi:window-shutter';
    if (domain === 'binary_sensor') return 'mdi:motion-sensor';
    return 'mdi:label-outline';
  }

  static styles = css`
    :host {
      display: contents;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: var(--stratum-popup-backdrop-filter, blur(6px));
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fade-in 0.15s ease-out;
    }

    /* Telefon: bez rozmycia pod listą, jak pod popupem pokoju. Pełnoekranowy
       backdrop-filter kazał GPU rozmywać cały dashboard przy każdej klatce
       przewijania listy i każdym ruchu suwaka. Token przywraca rozmycie. */
    @media (max-width: 600px) {
      .backdrop {
        backdrop-filter: var(--stratum-popup-backdrop-filter, none);
      }
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .panel {
      position: relative;
      max-width: min(560px, 94vw);
      width: 100%;
      max-height: 86vh;
      display: flex;
      flex-direction: column;
      border-radius: 20px;
      background: var(--ha-card-background, var(--card-background-color, #1e1f22));
      color: var(--primary-text-color);
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      animation: pop-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes pop-in {
      from { transform: scale(0.94); opacity: 0.5; }
      to { transform: scale(1); opacity: 1; }
    }

    .head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 18px 14px;
      border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--accent, var(--primary-color, #ff9b42)) 16%, transparent),
        transparent
      );
      flex-shrink: 0;
    }

    .avatar {
      width: 46px;
      height: 46px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: color-mix(
        in srgb,
        var(--accent, var(--primary-color, #ff9b42)) 22%,
        transparent
      );
      color: var(--accent, var(--primary-color, #ff9b42));
    }

    .avatar ha-icon {
      --mdc-icon-size: 24px;
    }

    .head-body {
      flex: 1;
      min-width: 0;
    }

    .head-title {
      font-size: 17px;
      font-weight: 700;
      color: var(--primary-text-color);
    }

    .head-count {
      font-size: 12px;
      color: var(--secondary-text-color);
      font-variant-numeric: tabular-nums;
    }

    .close {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 0;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
      color: var(--primary-text-color);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s ease, transform 0.08s ease;
      flex-shrink: 0;
    }
    .close:hover {
      background: color-mix(in srgb, var(--error-color, #e53935) 22%, transparent);
      color: var(--error-color, #e53935);
    }
    .close:active {
      transform: scale(0.95);
    }

    .tabs {
      display: flex;
      gap: 8px;
      padding: 12px 16px 2px;
      overflow-x: auto;
      scrollbar-width: none;
      flex-shrink: 0;
    }
    .tabs::-webkit-scrollbar { display: none; }

    .tab {
      flex-shrink: 0;
      border: 1px solid transparent;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 14px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      font-variant-numeric: tabular-nums;
    }
    .tab.on {
      background: color-mix(in srgb, var(--accent, var(--primary-color, #ff9b42)) 16%, transparent);
      border-color: color-mix(in srgb, var(--accent, var(--primary-color, #ff9b42)) 45%, transparent);
      color: var(--accent, var(--primary-color, #ff9b42));
    }

    .empty {
      padding: 40px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      color: var(--secondary-text-color);
      font-size: 14px;
      text-align: center;
    }
    .empty ha-icon {
      --mdc-icon-size: 36px;
      color: var(--success-color, #4caf50);
    }

    .list {
      overflow-y: auto;
      /* Koniec listy nie przewija dashboardu pod tłem. */
      overscroll-behavior: contain;
      padding: 12px 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* --- wiersz sterowalny (światła / przełączniki / rolety) --- */

    .crow {
      display: flex;
      flex-direction: column;
      gap: 9px;
      border-radius: 16px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
      padding: 12px 14px;
    }

    .crow-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .crow .bub {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      border: 0;
      background: color-mix(
        in srgb,
        var(--c, var(--accent, var(--primary-color, #ff9b42))) 20%,
        transparent
      );
      color: var(--c, var(--accent, var(--primary-color, #ff9b42)));
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform 0.08s ease;
    }
    .crow .bub:hover { transform: scale(1.06); }
    .crow .bub:active { transform: scale(0.94); }
    .crow .bub ha-icon { --mdc-icon-size: 20px; }

    .mid {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .nm {
      font-size: 14.5px;
      font-weight: 600;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }

    .sub {
      font-size: 11.5px;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
      font-variant-numeric: tabular-nums;
    }

    .toggle {
      position: relative;
      width: 48px;
      height: 26px;
      border-radius: 999px;
      border: 0;
      background: var(--divider-color, rgba(255, 255, 255, 0.2));
      cursor: pointer;
      padding: 0;
      transition: background 0.15s ease;
      flex-shrink: 0;
    }

    .toggle.on {
      background: var(--c, var(--accent, var(--primary-color, #ff9b42)));
    }

    .toggle-knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .toggle.on .toggle-knob {
      transform: translateX(22px);
    }

    /* Tor bez bieli: rgba(255,255,255,.12) znikał na jasnym motywie HA.
       Kciuk i cień z tokenów --stratum-ink-* (definiowanych przez kartę,
       w której lista jest osadzona). */
    .bri-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 12px;
      margin: 0;
      border-radius: 999px;
      background: linear-gradient(
        90deg,
        var(--c, var(--accent, var(--primary-color))) var(--pct, 0%),
        color-mix(in srgb, var(--primary-text-color) 12%, transparent) var(--pct, 0%)
      );
      cursor: pointer;
      transition: opacity 0.15s ease;
    }

    /* Suwak zgaszonej lampy zostaje na miejscu (stała wysokość wiersza),
       tylko przygaszony — nadal działa: przeciągnięcie zapala lampę na
       wybranym poziomie. */
    .crow:not(.active) .bri-slider {
      opacity: 0.45;
    }

    .bri-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--stratum-ink-tint);
      border: 0;
      box-shadow: 0 1px 4px color-mix(in srgb, var(--stratum-ink-shade) 45%, transparent);
      cursor: pointer;
    }

    .bri-slider::-moz-range-thumb {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--stratum-ink-tint);
      border: 0;
      box-shadow: 0 1px 4px color-mix(in srgb, var(--stratum-ink-shade) 45%, transparent);
      cursor: pointer;
    }

    .bri-slider:focus-visible {
      outline: 2px solid var(--c, var(--accent, var(--primary-color)));
      outline-offset: 2px;
    }

    .toggle:focus-visible,
    .crow .bub:focus-visible,
    .prow:focus-visible {
      outline: 2px solid var(--accent, var(--primary-color));
      outline-offset: 2px;
    }

    /* --- prosty wiersz czujki --- */

    .prow {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 58px;
      padding: 10px 14px;
      border-radius: 16px;
      border: 0;
      font: inherit;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
      color: var(--primary-text-color);
      cursor: pointer;
      text-align: left;
      transition: background 0.12s ease, transform 0.1s ease;
      width: 100%;
    }
    .prow:hover {
      background: color-mix(
        in srgb,
        var(--accent, var(--primary-color)) 8%,
        var(--secondary-background-color)
      );
    }
    .prow:active {
      transform: scale(0.98);
    }

    /* --- wiersz encji niedostępnej (wzorzec off-pill z kafla pokoju) --- */

    .prow.offline .bub,
    .prow.offline .mid {
      opacity: 0.6;
    }
    .prow .unav-icon {
      position: relative;
    }
    /* Przekreślenie ikony — „urządzenie nie odpowiada", nie „wyłączone". */
    .prow .unav-icon::after {
      content: '';
      position: absolute;
      left: 22%;
      right: 22%;
      top: 50%;
      height: 2px;
      border-radius: 1px;
      background: var(--secondary-text-color);
      transform: rotate(-40deg);
    }
    .off-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      color: var(--secondary-text-color);
      background: var(--stratum-surface-3);
      border-radius: 999px;
      padding: 2px 8px;
      flex-shrink: 0;
    }
    .off-pill::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--disabled-text-color, var(--secondary-text-color));
    }

    .prow .bub {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: var(--stratum-surface-2);
      color: var(--secondary-text-color);
    }
    .prow.active .bub {
      background: color-mix(
        in srgb,
        var(--accent, var(--primary-color, #ff9b42)) 18%,
        transparent
      );
      color: var(--accent, var(--primary-color, #ff9b42));
    }
    .prow .bub ha-icon { --mdc-icon-size: 20px; }

    .prow .cls {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 999px;
      background: color-mix(
        in srgb,
        var(--accent, var(--primary-color, #ff9b42)) 16%,
        transparent
      );
      color: var(--accent, var(--primary-color, #ff9b42));
      flex-shrink: 0;
    }

    .prow .tm {
      font-size: 12.5px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--secondary-text-color);
      flex-shrink: 0;
    }
    .prow.active .tm {
      color: var(--accent, var(--primary-color, #ff9b42));
    }

    /* --- sticky stopka --- */

    .foot {
      padding: 10px 16px 14px;
      flex-shrink: 0;
      background: linear-gradient(
        to top,
        var(--ha-card-background, var(--card-background-color, #1e1f22)) 65%,
        transparent
      );
    }

    .master {
      width: 100%;
      border: 0;
      border-radius: 14px;
      padding: 13px;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: color-mix(in srgb, var(--error-color, #e53935) 16%, transparent);
      color: var(--error-color, #e53935);
      cursor: pointer;
      transition: background 0.12s ease;
    }
    .master:hover {
      background: color-mix(in srgb, var(--error-color, #e53935) 26%, transparent);
    }
    .master ha-icon { --mdc-icon-size: 18px; }

    @media (prefers-reduced-motion: reduce) {
      .backdrop,
      .panel,
      .toggle-knob,
      .bri-slider,
      .prow {
        animation: none;
        transition: none;
      }
      .prow:active {
        transform: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-chip-list': StratumChipList;
  }
}
