// Style stratum-room-card — wydzielone z komponentu (dług techniczny),
// zero zmian w treści CSS.

import { css } from 'lit';

export const roomCardStyles = css`
    :host {
      display: block;
    }

    ha-card {
      background: var(--stratum-card-background, var(--ha-card-background, var(--card-background-color, #1e1f22)));
      border-radius: var(--stratum-card-border-radius, var(--ha-card-border-radius, 12px));
      color: var(--stratum-card-color, var(--primary-text-color, #e8e8e8));
      overflow: hidden;
      padding: var(--stratum-room-padding, 16px);
      box-shadow: var(--ha-card-box-shadow, none);
      border: var(--ha-card-border-width, 1px) solid
        var(--ha-card-border-color, var(--divider-color, transparent));
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      /* Rezerwa na przycisk × popupu — ustawiana z zewnątrz przez wrapper. */
      padding-right: var(--stratum-room-header-pad-right, 0px);
      border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
    }

    .icon {
      --mdc-icon-size: 28px;
      color: var(--primary-text-color);
      flex-shrink: 0;
    }

    /* Warianty belki popupu (popup_header). */
    .header.compact {
      gap: 8px;
    }
    .header .hicon {
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--primary-text-color);
    }
    .header .hicon.sq {
      border-radius: 12px;
    }
    .header.has-below {
      flex-direction: column;
      align-items: stretch;
      gap: 9px;
      padding-right: 0;
    }
    .header .hrow {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-right: var(--stratum-room-header-pad-right, 0px);
    }
    .header .chips.below {
      overflow-x: auto;
      scrollbar-width: none;
      justify-content: flex-start;
      flex-wrap: nowrap;
    }
    .header .chips.below::-webkit-scrollbar {
      display: none;
    }
    .title .subtitle {
      display: block;
      font-size: 11.5px;
      font-weight: 500;
      color: var(--secondary-text-color);
      line-height: 1.25;
      letter-spacing: 0;
    }

    .title {
      flex: 1;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--secondary-text-color);
    }

    .section-header ha-icon {
      --mdc-icon-size: 16px;
    }

    .section-header .count {
      margin-left: auto;
      font-weight: 500;
      text-transform: none;
      letter-spacing: 0;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
      color: var(--secondary-text-color);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }

    .summary-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .summary-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
      background: var(--stratum-tile-chip-background, rgba(255, 255, 255, 0.04));
      font-size: 12px;
      font-weight: 600;
      color: var(--primary-text-color);
    }

    .summary-chip.inactive {
      opacity: 0.45;
    }

    .summary-chip.active {
      color: var(--stratum-sum-accent, var(--primary-color));
      border-color: var(--stratum-sum-accent, var(--primary-color));
      background: color-mix(in srgb, var(--stratum-sum-accent, var(--primary-color)) 18%, transparent);
    }

    .summary-chip ha-icon {
      --mdc-icon-size: 16px;
    }

    .summary-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      transition: opacity 0.15s ease;
    }

    .summary-item.inactive {
      opacity: 0.5;
    }

    .summary-item ha-icon {
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
      flex-shrink: 0;
    }

    .summary-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .summary-label {
      font-size: 11px;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .summary-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (max-width: 480px) {
      ha-card {
        padding: 12px;
      }
      .header {
        gap: 8px;
      }
      .title {
        font-size: 17px;
      }
      .body {
        gap: 14px;
      }
    }

    .tiles {
      display: grid;
      gap: 8px;
    }

    .tiles.chips-layout {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tiles.icon-layout {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tiles.bubble-layout {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      gap: 8px;
    }

    .custom-card-slot {
      display: block;
    }

    .custom-card-slot > * {
      display: block;
      width: 100%;
    }

    .tiles.grid-1 {
      grid-template-columns: 1fr;
    }

    .tiles.grid-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tiles.grid-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    @media (max-width: 480px) {
      .tiles.grid-3 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .placeholder {
      padding: 20px;
      text-align: center;
      color: var(--secondary-text-color);
    }

    /* A3: blok „Aktywne alarmy" na górze popupu. */
    .alarms-block {
      border: 1.5px solid
        color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 50%, transparent);
      background: color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 7%, transparent);
      border-radius: 14px;
      padding: 10px 12px;
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .alarms-head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--stratum-chip-leak-color, #f44336);
      margin-bottom: 4px;
    }
    .alarms-head ha-icon {
      --mdc-icon-size: 16px;
    }
    .alarms-count {
      margin-left: auto;
      font-size: 10px;
      padding: 1px 7px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 18%, transparent);
    }
    .alarm-row {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 7px 4px;
      border: 0;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      text-align: left;
      cursor: pointer;
      border-radius: 10px;
    }
    .alarm-row:hover {
      background: color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 8%, transparent);
    }
    .ab-bub {
      width: 38px;
      height: 38px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 16%, transparent);
      color: var(--stratum-chip-leak-color, #f44336);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .ab-bub ha-icon {
      --mdc-icon-size: 18px;
    }
    .ab-mid {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .ab-mid b {
      font-size: 13.5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ab-mid span {
      font-size: 11.5px;
      color: var(--secondary-text-color);
    }
    .ab-cls {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--stratum-chip-leak-color, #f44336) 15%, transparent);
      color: var(--stratum-chip-leak-color, #f44336);
      flex-shrink: 0;
    }
    .ab-tm {
      font-size: 12px;
      font-weight: 700;
      color: var(--stratum-chip-leak-color, #f44336);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }

    /* Para przełączników nagłówka bloku świateł (E2): automatyka + master. */
    .hdr-switches {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .hdr-switch {
      position: relative;
      width: 56px;
      height: 30px;
      border-radius: 999px;
      border: 0;
      padding: 0;
      cursor: pointer;
      background: var(--divider-color, rgba(255, 255, 255, 0.2));
      transition: background 0.15s ease;
      flex-shrink: 0;
    }
    .hdr-switch .knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
    }
    .hdr-switch .knob ha-icon {
      --mdc-icon-size: 15px;
    }
    .hdr-switch.on .knob {
      transform: translateX(26px);
    }
    .hdr-switch.lights.on {
      background: var(--stratum-chip-lights-color, #ffc107);
    }
    .hdr-switch.lights.on .knob {
      color: #b07908;
    }
    .hdr-switch.auto.on {
      background: var(--error-color, #e53935);
    }
    .hdr-switch.auto.on .knob {
      color: var(--error-color, #e53935);
    }
    /* Licznik przy tytule (nie na prawej krawędzi) gdy są switche. */
    .section-header .count.inline {
      margin-left: 2px;
    }

    .lights-sep {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 4px 0;
      color: var(--secondary-text-color);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .lights-sep::before,
    .lights-sep::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--divider-color, rgba(255, 255, 255, 0.12));
    }

    .lights-sep.plain {
      gap: 0;
      margin: 6px 0;
    }

    .cover-master {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .cm-btn {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 999px;
      border: 0;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: filter 0.12s ease, transform 0.08s ease;
    }

    .cm-btn:hover {
      filter: brightness(1.2);
    }

    .cm-btn:active {
      transform: scale(0.95);
    }

    .cm-btn ha-icon {
      --mdc-icon-size: 16px;
    }

    .cm-open {
      background: rgba(102, 187, 106, 0.16);
      color: #66bb6a;
    }

    .cm-stop {
      background: rgba(255, 183, 77, 0.15);
      color: #ffb74d;
    }

    .cm-close {
      background: rgba(239, 83, 80, 0.15);
      color: #ef5350;
    }

    .cm-pct {
      background: rgba(100, 169, 232, 0.13);
      color: #64a9e8;
    }

    .rest-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      background: var(--stratum-tile-background, rgba(255, 255, 255, 0.03));
      border: 1px dashed var(--divider-color, rgba(255, 255, 255, 0.14));
      border-radius: 10px;
      padding: 8px 12px;
      color: var(--secondary-text-color);
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .rest-toggle:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .rest-toggle ha-icon {
      --mdc-icon-size: 16px;
    }

    .rest-count {
      margin-left: auto;
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
      font-size: 11px;
    }
  
  /* ====== Sekcja media — zakładki głośników (media_style: tabs) ====== */
  .media-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .media-tab {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: none;
    cursor: pointer;
    border-radius: 999px;
    padding: 6px 13px;
    font: inherit;
    font-size: 12.5px;
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
    color: var(--secondary-text-color);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .media-tab.on {
    background: var(--stratum-card-accent, var(--primary-color, #ff9b42));
    color: #fff;
    font-weight: 600;
  }
  .mt-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(128, 132, 140, 0.9);
    flex-shrink: 0;
  }
  .mt-dot.play {
    background: var(--stratum-chip-motion-color, #4caf50);
    box-shadow: 0 0 5px var(--stratum-chip-motion-color, #4caf50);
  }
  .mt-dot.pause {
    background: var(--stratum-chip-lights-color, #ffc107);
  }
  .mt-name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ====== Sekcja media — skróty/ulubione ====== */
  .media-shortcuts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .media-sc {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: none;
    cursor: pointer;
    border-radius: 999px;
    padding: 7px 13px;
    font: inherit;
    font-size: 12.5px;
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
    color: var(--primary-text-color);
    transition: background 0.15s ease;
  }
  .media-sc:hover {
    background: color-mix(
      in srgb,
      var(--stratum-card-accent, var(--primary-color, #ff9b42)) 20%,
      transparent
    );
  }
  .media-sc ha-icon {
    --mdc-icon-size: 16px;
    color: var(--stratum-card-accent, var(--primary-color, #ff9b42));
  }

  /* ====== Sekcja media — grupowanie głośników ====== */
  .media-group-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-top: 10px;
    border: none;
    cursor: pointer;
    border-radius: 12px;
    padding: 9px 13px;
    font: inherit;
    font-size: 12.5px;
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
    color: var(--secondary-text-color);
  }
  .media-group-btn.on {
    color: var(--primary-text-color);
  }
  .media-group-btn ha-icon {
    --mdc-icon-size: 17px;
  }
  .media-group-btn .mg-count {
    background: color-mix(
      in srgb,
      var(--stratum-card-accent, var(--primary-color, #ff9b42)) 25%,
      transparent
    );
    color: var(--primary-text-color);
    border-radius: 999px;
    padding: 0 8px;
    font-size: 11.5px;
    font-weight: 650;
  }
  .media-group-btn .mg-chev {
    margin-left: auto;
  }
  .media-group {
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
    border-radius: 12px;
    padding: 8px 12px;
    margin-top: 6px;
  }
  .mg-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    font-size: 13px;
  }
  .mg-cb {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 2px solid var(--divider-color, rgba(255, 255, 255, 0.25));
    background: none;
    cursor: pointer;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: #191a1d;
  }
  .mg-cb.on {
    background: var(--stratum-card-accent, var(--primary-color, #ff9b42));
    border-color: var(--stratum-card-accent, var(--primary-color, #ff9b42));
  }
  .mg-cb[disabled] {
    opacity: 0.65;
    cursor: default;
  }
  .mg-cb ha-icon {
    --mdc-icon-size: 15px;
  }
  .mg-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--primary-text-color);
  }
  .mg-name.dim {
    color: var(--secondary-text-color);
  }
  .mg-vol {
    width: 110px;
    accent-color: var(--stratum-card-accent, var(--primary-color, #ff9b42));
  }
  .mg-pc {
    width: 38px;
    text-align: right;
    font-size: 11.5px;
    color: var(--secondary-text-color);
    font-variant-numeric: tabular-nums;
  }
  .mg-master {
    border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
    margin-top: 4px;
    padding-top: 10px;
  }

  /* ====== Sekcja media — panel źródła / trybu dźwięku ====== */
  .media-group-btn .ms-cur {
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--stratum-card-accent, var(--primary-color, #ff9b42));
    font-weight: 600;
  }
  .ms-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: none;
    cursor: pointer;
    border-radius: 9px;
    padding: 9px 10px;
    font: inherit;
    font-size: 13px;
    background: none;
    color: var(--secondary-text-color);
    text-align: left;
  }
  .ms-row.on {
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.07));
    color: var(--primary-text-color);
    font-weight: 600;
  }
  .ms-row ha-icon {
    --mdc-icon-size: 16px;
    color: var(--stratum-card-accent, var(--primary-color, #ff9b42));
  }
  .ms-sub {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--secondary-text-color);
    padding: 10px 10px 4px;
    border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
    margin-top: 6px;
  }
`;
