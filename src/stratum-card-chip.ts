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

  /** Kolor akcentu aktywnego chipa: ikona i zabarwienie; tekst — mieszany z kolorem tekstu (kontrast). */
  @property({ type: String }) public color?: string;

  /** Czy pokazywać label nawet przy nieaktywnym chipie (np. temperatura). */
  @property({ type: Boolean, attribute: 'show-when-zero' })
  public showWhenZero = false;

  /** Czy chip ma reagować na klik (dodaje rolę button + cursor). */
  @property({ type: Boolean, reflect: true }) public clickable = false;

  /**
   * Tło aktywnego chipa lekko zabarwione kolorem akcentu — dla belki
   * `stripes`, gdzie chipy stoją na poświacie i szara pigułka ginie.
   */
  @property({ type: Boolean, reflect: true }) public tinted = false;

  private _onClick = (ev?: Event): void => {
    if (!this.clickable) return;
    // Klik obsłużony przez chip nie może dojść do rodzica. W belce
    // klasycznej chipy siedzą wewnątrz <button> headera, więc natywny klik
    // (composed) zwijał albo rozwijał kartę w tej samej chwili, w której
    // otwierała się lista chipa. Chip nieklikalny przepuszcza klik dalej —
    // tam tapnięcie dalej przełącza kartę, jak cała reszta headera.
    ev?.stopPropagation();
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
      /* Fallback z tła karty w stronę tekstu, nie z bieli: chip osadzony poza
         kartą Stratum (bez tokenów powierzchni) nie znika na jasnym motywie. */
      background: var(
        --stratum-chip-background,
        color-mix(in srgb, var(--card-background-color) 93%, var(--primary-text-color))
      );
      font-size: var(--stratum-chip-font-size, 12px);
      font-weight: 600;
      transition: opacity 0.2s ease, color 0.2s ease, transform 0.1s ease;
    }

    :host([clickable]) .chip {
      cursor: pointer;
    }

    /* Hover tylko przy prawdziwym kursorze — na dotyku chip po tapnięciu
       zostawał podświetlony, aż palec trafił w coś innego. (hover: hover)
       pyta o urządzenie, nie o rozmiar, więc media query jest właściwe. */
    @media (hover: hover) {
      :host([clickable]) .chip:hover {
        /* Wewnątrz kart --stratum-chip-hover-background = --stratum-surface-3
           (surface-tokens.ts). Fallback z tła karty, nie z samego surface-3:
           chip poza kartą Stratum nie ma tokenów powierzchni i var() bez
           fallbacku dałby przezroczyste tło. */
        background: var(
          --stratum-chip-hover-background,
          color-mix(in srgb, var(--card-background-color) 89%, var(--primary-text-color))
        );
      }
    }

    /* Chip klikalny otwiera listę — bez :active tapnięcie nie dawało
       żadnego natychmiastowego śladu, zanim lista się pojawiła. */
    :host([clickable]) .chip:active {
      transform: scale(0.96);
    }

    @media (prefers-reduced-motion: reduce) {
      .chip {
        transition: none;
      }
      :host([clickable]) .chip:active {
        transform: none;
      }
    }

    /* Obrys z --stratum-focus-ring (surface-tokens.ts, :host i ha-card karty),
       tak jak kafle i przyciski popupu. Dawniej karta piętra brała tylko
       --stratum-card-focus-color, a popup --stratum-focus — motyw ustawiający
       --stratum-focus przemalowywał pół karty. Łańcuch po przecinkach to
       fallback dla chipa osadzonego poza kartą Stratum. */
    :host([clickable]) .chip:focus-visible {
      outline: 2px solid var(--stratum-focus-ring, var(--stratum-focus, var(--stratum-card-focus-color, var(--primary-color))));
      outline-offset: 2px;
    }

    .chip.inactive {
      opacity: var(--stratum-chip-inactive-opacity, 0.35);
      color: var(--stratum-chip-inactive-color, var(--secondary-text-color));
    }

    .chip.active {
      color: var(--stratum-chip-accent, var(--primary-text-color));
    }

    /* Liczba w kolorze akcentu była nieczytelna na jasnym motywie: żółty
       chipa świateł na jasnej pigułce to 1,4:1, zielony ruchu 2,4:1 (WCAG
       wymaga 4,5:1 dla 12 px). Akcent zostaje na ikonie i w zabarwieniu
       pigułki, a tekst bierze 40% akcentu i 60% koloru tekstu karty. Na
       jasnym motywie to ciemna oliwka/zieleń (≥ 4,8:1 dla wszystkich
       domyślnych akcentów), na ciemnym — jasny odcień akcentu (≥ 5,4:1;
       przy okazji ratuje ciemne akcenty jak fiolet wilgotności, 2:1 → 5,9:1).
       Jeden zapis dla obu motywów, bez prefers-color-scheme. Kto chce
       dawny wygląd (pełny akcent), ustawia --stratum-chip-label-color:
       currentColor — tekst dziedziczy wtedy kolor akcentu z pigułki. */
    .chip.active .count {
      color: var(
        --stratum-chip-label-color,
        color-mix(
          in srgb,
          var(--stratum-chip-accent, var(--primary-text-color)) 40%,
          var(--stratum-surface-ink, var(--primary-text-color))
        )
      );
    }

    :host([tinted]) .chip.active {
      background: color-mix(
        in srgb,
        var(--stratum-chip-accent, var(--primary-text-color)) 16%,
        transparent
      );
    }

    :host([tinted]) .count {
      font-variant-numeric: tabular-nums;
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
