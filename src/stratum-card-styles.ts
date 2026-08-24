// Style stratum-card — wydzielone z komponentu (dlug techniczny),
// zero zmian w tresci CSS.

import { css } from 'lit';

export const cardStyles = css`
    :host {
      display: block;
    }

    ha-card {
      background: var(--stratum-card-background, var(--ha-card-background, var(--card-background-color, #1e1f22)));
      border-radius: var(--stratum-card-border-radius, var(--ha-card-border-radius, 12px));
      color: var(--stratum-card-color, var(--primary-text-color, #e8e8e8));
      overflow: hidden;
      box-shadow: var(--ha-card-box-shadow, none);
      border: var(--ha-card-border-width, 1px) solid
        var(--ha-card-border-color, var(--divider-color, transparent));
      transition: background 0.15s ease;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: var(--stratum-card-header-padding, 14px) 16px;
      cursor: pointer;
      user-select: none;
      background: transparent;
      border: 0;
      width: 100%;
      color: inherit;
      font: inherit;
      text-align: left;
      position: relative;
    }

    .header.has-accent-bar::before {
      content: '';
      position: absolute;
      top: 10px;
      bottom: 10px;
      left: 0;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: var(--stratum-card-accent-bar-color, var(--primary-color, #ff9b42));
    }

    .header:hover {
      background: var(--stratum-card-hover-background, rgba(255, 255, 255, 0.04));
    }

    .header:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
      outline-offset: -2px;
    }

    .area-icon {
      --mdc-icon-size: var(--stratum-card-icon-size, 22px);
      color: var(--stratum-card-icon-color, var(--primary-text-color));
      flex-shrink: 0;
    }

    .title {
      flex: 1;
      /* min-width: 0 jest kluczowe — bez tego flex nie pozwala się skurczyć
         i długa nazwa piętra rozpycha nagłówek poza kartę. */
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--stratum-card-title-size, 17px);
      font-weight: var(--stratum-card-title-weight, 500);
      letter-spacing: -0.01em;
      color: var(--stratum-card-title-color, var(--primary-text-color));
    }

    .chips {
      display: flex;
      gap: 6px;
      align-items: center;
      /* Chipy mogą się kurczyć i scrollować poziomo zamiast łamać nagłówek. */
      flex-shrink: 1;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
      padding: 4px 0;
    }

    /* Badge alarmu na belce piętra — jak ⚠ N na wierszach. */
    .header-alarm-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1.5px solid
        color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 65%, transparent);
      background: color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 18%, transparent);
      color: var(--stratum-chip-leak-color, #f44336);
      font-size: 12.5px;
      font-weight: 800;
      cursor: pointer;
      flex-shrink: 0;
      animation: stratum-header-alarm-pulse 1.6s ease-in-out infinite;
    }
    .header-alarm-badge ha-icon {
      --mdc-icon-size: 15px;
    }
    @keyframes stratum-header-alarm-pulse {
      0%,
      100% {
        box-shadow: 0 0 0 0
          color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 40%, transparent);
      }
      50% {
        box-shadow: 0 0 8px 3px
          color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 25%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .header-alarm-badge {
        animation: none;
      }
    }

    .chips::-webkit-scrollbar {
      display: none;
    }

    .expander {
      --mdc-icon-size: 20px;
      transition: transform 0.2s ease;
      color: var(--stratum-card-expander-color, var(--secondary-text-color));
      flex-shrink: 0;
    }

    .expander.open {
      transform: rotate(180deg);
    }

    .body-wrap {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows var(--stratum-card-expander-duration, 280ms)
        cubic-bezier(0.4, 0, 0.2, 1);
    }

    .body-wrap.open {
      grid-template-rows: 1fr;
    }

    .body {
      overflow: hidden;
      /* Wąskie boczne paddingi — wiersze-suwaki mają dochodzić blisko
         krawędzi karty (feedback: za dużo pustego miejsca po bokach). */
      padding: 0 var(--stratum-card-body-padding, 8px);
      border-top: 0.5px solid
        var(--stratum-card-divider-color, var(--divider-color, rgba(255, 255, 255, 0.08)));
    }

    .body-wrap.open .body {
      padding: 6px var(--stratum-card-body-padding, 8px) 10px;
    }

    .rooms-grid {
      display: grid;
      /* grid-template-columns ustawiane inline-style z render() wg
         rooms_tile_columns (auto albo 1..6). minmax(0, 1fr) chroni
         przed rozpychaniem kolumny ponad dostępną szerokość. */
      gap: 8px;
    }

    .body-divider {
      height: 0;
      margin: 10px 0;
      border-top: 1px solid
        var(--stratum-card-divider-color, var(--divider-color, rgba(255, 255, 255, 0.08)));
    }

    .rooms-grid .room-item.row-mode {
      grid-column: 1 / -1;
    }

    .placeholder {
      padding: 14px 0;
      color: var(--secondary-text-color);
      font-size: 13px;
      text-align: center;
    }

    @media (prefers-reduced-motion: reduce) {
      .body-wrap {
        transition: none;
      }
    }

    /* Popup: na telefonie fullscreen z 8 px marginesu; na szerszych ekranach
       rozsądny cap szerokości (jak dialogi HA) i wysokość wg treści — kafle
       nie rozciągają się na pół monitora. Overrides: --stratum-popup-margin,
       --stratum-popup-max-width, --stratum-popup-radius. */
    .stratum-popup-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--stratum-popup-margin, 8px);
      animation: stratum-popup-fade 0.15s ease-out;
    }

    @keyframes stratum-popup-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .stratum-popup-card {
      position: relative;
      width: 100%;
      max-width: var(--stratum-popup-max-width, min(94vw, 720px));
      height: auto;
      max-height: calc(100vh - 2 * var(--stratum-popup-margin, 8px));
      max-height: calc(100dvh - 2 * var(--stratum-popup-margin, 8px));
      overflow-y: auto;
      border-radius: var(--stratum-popup-radius, 16px);
      background: var(--ha-card-background, var(--card-background-color, #1e1f22));
      animation: stratum-popup-pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* Karta pokoju bez własnej ramki wewnątrz popupu. */
    .stratum-popup-card stratum-room-card {
      display: block;
      /* Rezerwa w headerze na przycisk × — chipy nie wjadą pod krzyżyk. */
      --stratum-room-header-pad-right: 46px;
    }

    .stratum-popup-card stratum-room-card::part(card) {
      box-sizing: border-box;
      border-radius: 0;
      border: 0;
      box-shadow: none;
    }

    /* Telefon: prawdziwy fullscreen — pełna szerokość i wysokość. */
    @media (max-width: 600px) {
      .stratum-popup-backdrop {
        align-items: stretch;
      }

      .stratum-popup-card {
        max-width: none;
        height: 100%;
      }

      .stratum-popup-card stratum-room-card {
        min-height: 100%;
      }

      .stratum-popup-card stratum-room-card::part(card) {
        min-height: calc(100vh - 2 * var(--stratum-popup-margin, 8px));
        min-height: calc(100dvh - 2 * var(--stratum-popup-margin, 8px));
      }
    }

    @keyframes stratum-popup-pop {
      from { transform: scale(0.95); opacity: 0.6; }
      to { transform: scale(1); opacity: 1; }
    }

    .stratum-popup-close {
      /* sticky (nie absolute): przycisk × zostaje w kadrze podczas scrollowania
         treści popupu. Ujemny margin-bottom nakłada go na kartę pod spodem.
         Neutralny, półprzezroczysty — nie konkuruje z chipami headera
         (header pokoju ma rezerwę --stratum-room-header-pad-right). */
      position: sticky;
      top: 10px;
      z-index: 5;
      margin-left: auto;
      margin-right: 10px;
      margin-bottom: -34px;
      transform: translateY(10px);
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.16));
      background: color-mix(in srgb, var(--card-background-color, #1c1e22) 72%, #000);
      color: var(--primary-text-color, #fff);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }

    .stratum-popup-close:hover {
      background: color-mix(in srgb, var(--card-background-color, #1c1e22) 45%, #000);
    }

    .stratum-popup-close ha-icon {
      --mdc-icon-size: 18px;
    }

    @media (prefers-reduced-motion: reduce) {
      .stratum-popup-backdrop,
      .stratum-popup-card {
        animation: none;
      }
    }
  `;
