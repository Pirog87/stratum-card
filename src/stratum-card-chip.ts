// Pojedynczy chip w headerze karty Stratum.
//
// Renderuje ikonę + label (tekst: liczba albo dowolna wartość). Kolor akcentu
// i rozmiar przez CSS variables. `active=false` → półprzezroczysty (0.35).

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('stratum-card-chip')
export class StratumCardChip extends LitElement {
  @property({ type: String }) public icon = 'mdi:help';

  /** Tekst obok ikony — liczba, stan encji, wynik template, cokolwiek. */
  @property({ type: String }) public label = '';

  /** Wyróżnienie kolorem (count>0 dla built-in, active_template dla custom). */
  @property({ type: Boolean, reflect: true }) public active = false;

  /** Kolor akcentu (ikona + tekst gdy aktywny). */
  @property({ type: String }) public color?: string;

  /** Czy pokazywać label nawet przy nieaktywnym chipie (np. temperatura). */
  @property({ type: Boolean, attribute: 'show-when-zero' })
  public showWhenZero = false;

  /** Czy chip ma reagować na klik (dodaje rolę button + cursor). */
  @property({ type: Boolean, reflect: true }) public clickable = false;

  private _onClick = (): void => {
    if (!this.clickable) return;
    this.dispatchEvent(
      new CustomEvent('chip-tap', { bubbles: true, composed: true }),
    );
  };

  private _onKey = (ev: KeyboardEvent): void => {
    if (!this.clickable) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this._onClick();
    }
  };

  protected render(): TemplateResult {
    const showLabel = this.active || this.showWhenZero || this.label !== '';
    const style = this.active && this.color ? `--stratum-chip-accent:${this.color};` : '';
    return html`
      <div
        class="chip ${this.active ? 'active' : 'inactive'}"
        part="chip"
        role=${this.clickable ? 'button' : 'group'}
        tabindex=${this.clickable ? '0' : '-1'}
        style=${style}
        @click=${this._onClick}
        @keydown=${this._onKey}
      >
        <ha-icon class="icon" .icon=${this.icon}></ha-icon>
        ${showLabel && this.label !== '' ? html`<span class="count">${this.label}</span>` : null}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: inline-flex;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: var(--stratum-chip-padding, 4px 8px);
      border-radius: var(--stratum-chip-radius, 999px);
      background: var(--stratum-chip-background, rgba(255, 255, 255, 0.06));
      font-size: var(--stratum-chip-font-size, 12px);
      font-weight: 600;
      transition: opacity 0.2s ease, color 0.2s ease;
    }

    :host([clickable]) .chip {
      cursor: pointer;
    }

    :host([clickable]) .chip:hover {
      background: var(--stratum-chip-hover-background, rgba(255, 255, 255, 0.1));
    }

    :host([clickable]) .chip:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: 2px;
    }

    .chip.inactive {
      opacity: var(--stratum-chip-inactive-opacity, 0.35);
      color: var(--stratum-chip-inactive-color, var(--secondary-text-color));
    }

    .chip.active {
      color: var(--stratum-chip-accent, var(--primary-text-color));
    }

    .icon {
      --mdc-icon-size: var(--stratum-chip-icon-size, 16px);
    }

    .count {
      line-height: 1;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'stratum-card-chip': StratumCardChip;
  }
}
