// Pojedynczy chip w headerze karty Stratum.
//
// Renderuje ikonę + licznik. Kolor i rozmiar sterowane CSS variables;
// chip jest "wyłączony wizualnie" gdy licznik = 0 (półprzezroczysty).

import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('stratum-card-chip')
export class StratumCardChip extends LitElement {
  @property({ type: String }) public icon = 'mdi:help';

  @property({ type: Number }) public count = 0;

  /** Kolor akcentu chipu (tekst + ikona gdy aktywny). */
  @property({ type: String }) public color?: string;

  /** Jeśli true — pokazuje licznik nawet przy 0. Domyślnie ukrywamy przy 0. */
  @property({ type: Boolean, attribute: 'show-when-zero' })
  public showWhenZero = false;

  protected render(): TemplateResult {
    const active = this.count > 0;
    const style = active && this.color ? `--stratum-chip-accent:${this.color};` : '';
    return html`
      <div class="chip ${active ? 'active' : 'inactive'}" style=${style} part="chip">
        <ha-icon class="icon" .icon=${this.icon}></ha-icon>
        ${active || this.showWhenZero
          ? html`<span class="count">${this.count}</span>`
          : null}
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
