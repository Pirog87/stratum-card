// Wspólne style CSS dla wszystkich edytorów Stratum.
//
// Ujednolicona hierarchia wizualna: panel → header z ikoną → hint → content.
// Spójne row dla list (rooms / sections / scenes) — avatar ikony, tytuł,
// badges, akcje po prawej. Kolor akcentu = `--primary-color`.

import { css } from 'lit';

export const editorSharedStyles = css`
  /* === Panel (wrapper sekcji edytora) === */

  .stratum-panel {
    margin-top: 20px;
    padding: 18px 16px 16px;
    border-radius: 14px;
    background: var(--stratum-editor-panel-bg, var(--card-background-color, rgba(255, 255, 255, 0.02)));
    border: 1px solid var(--divider-color);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .stratum-panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }

  .stratum-panel-avatar {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary-color, #ff9b42) 18%, transparent);
    color: var(--primary-color, #ff9b42);
    flex-shrink: 0;
  }

  .stratum-panel-avatar ha-icon {
    --mdc-icon-size: 20px;
  }

  .stratum-panel-title {
    flex: 1;
    min-width: 0;
  }

  .stratum-panel-title h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--primary-text-color);
  }

  .stratum-panel-hint {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--secondary-text-color);
    line-height: 1.4;
  }

  .stratum-panel-body {
    margin-top: 14px;
  }

  /* === Toolbar (nad listami) === */

  .stratum-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.02));
    font-size: 12px;
  }

  .stratum-toolbar .stratum-count {
    flex: 1;
    color: var(--secondary-text-color);
    font-weight: 500;
  }

  .stratum-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid var(--divider-color);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    color: var(--primary-text-color);
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .stratum-pill-btn:hover {
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.05));
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .stratum-pill-btn ha-icon {
    --mdc-icon-size: 16px;
  }

  /* === Row (pojedynczy element listy) === */

  .stratum-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stratum-row {
    border: 1px solid var(--divider-color);
    border-radius: 12px;
    padding: 8px 12px;
    background: var(--card-background-color, rgba(255, 255, 255, 0.02));
    transition: border-color 0.15s ease, background 0.15s ease,
      box-shadow 0.15s ease, transform 0.12s ease;
  }

  .stratum-row:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  .stratum-row.active {
    border-color: var(--primary-color, #ff9b42);
    background: color-mix(in srgb, var(--primary-color, #ff9b42) 4%, var(--card-background-color, transparent));
  }

  .stratum-row-head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
  }

  .stratum-row-avatar {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
    color: var(--secondary-text-color);
    flex-shrink: 0;
  }

  .stratum-row.active .stratum-row-avatar {
    background: color-mix(in srgb, var(--primary-color, #ff9b42) 20%, transparent);
    color: var(--primary-color, #ff9b42);
  }

  .stratum-row-avatar ha-icon {
    --mdc-icon-size: 18px;
  }

  .stratum-row-title {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    font-size: 14px;
    color: var(--primary-text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stratum-row-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
  }

  /* === Badge === */

  .stratum-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
    color: var(--secondary-text-color);
  }

  .stratum-badge.accent {
    background: var(--primary-color, #ff9b42);
    color: #fff;
  }

  .stratum-badge.merge {
    background: #42a5f5;
    color: #fff;
  }

  .stratum-badge.ghost {
    background: transparent;
    border: 1px solid var(--divider-color);
    color: var(--secondary-text-color);
    text-transform: none;
    font-style: italic;
    letter-spacing: 0;
  }

  /* === Icon buttons (right actions) === */

  .stratum-icon-btn {
    background: transparent;
    border: 0;
    padding: 5px;
    cursor: pointer;
    color: var(--secondary-text-color);
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .stratum-icon-btn:hover:not(:disabled) {
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
    color: var(--primary-text-color);
  }

  .stratum-icon-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .stratum-icon-btn.accent {
    background: var(--primary-color, #ff9b42);
    color: #fff;
  }

  .stratum-icon-btn.accent:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .stratum-icon-btn.danger:hover:not(:disabled) {
    background: rgba(244, 67, 54, 0.15);
    color: #f44336;
  }

  .stratum-icon-btn ha-icon {
    --mdc-icon-size: 18px;
  }

  /* === Sub-form (po rozwinięciu row) === */

  .stratum-row-sub {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--divider-color);
    animation: stratum-sub-in 0.18s ease-out;
  }

  @keyframes stratum-sub-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* === Collapsible block (details-like) === */

  .stratum-collapsible {
    margin-top: 12px;
    border: 1px solid var(--divider-color);
    border-radius: 10px;
    background: color-mix(in srgb, var(--secondary-background-color, rgba(255, 255, 255, 0.02)) 50%, transparent);
    overflow: hidden;
  }

  .stratum-collapsible summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    color: var(--primary-text-color);
    list-style: none;
    user-select: none;
  }

  .stratum-collapsible summary::-webkit-details-marker {
    display: none;
  }

  .stratum-collapsible summary ha-icon {
    --mdc-icon-size: 18px;
    color: var(--primary-color, #ff9b42);
  }

  .stratum-collapsible summary::after {
    content: '';
    width: 8px;
    height: 8px;
    margin-left: auto;
    border-right: 2px solid var(--secondary-text-color);
    border-bottom: 2px solid var(--secondary-text-color);
    transform: rotate(-45deg);
    transition: transform 0.15s ease;
  }

  .stratum-collapsible[open] summary::after {
    transform: rotate(45deg);
  }

  .stratum-collapsible summary:hover {
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
  }

  .stratum-collapsible-body {
    padding: 12px 14px 14px;
    border-top: 1px solid var(--divider-color);
  }

  .stratum-collapsible-hint {
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--secondary-text-color);
  }

  /* === Add button (dodaj scenę / sekcję) === */

  .stratum-add-btn {
    width: 100%;
    margin-top: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1.5px dashed var(--divider-color);
    background: transparent;
    color: var(--secondary-text-color);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
  }

  .stratum-add-btn:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color, #ff9b42) 5%, transparent);
  }

  .stratum-add-btn ha-icon {
    --mdc-icon-size: 18px;
  }

  /* === Empty state === */

  .stratum-empty {
    padding: 18px;
    color: var(--secondary-text-color);
    font-size: 13px;
    text-align: center;
    border: 1.5px dashed var(--divider-color);
    border-radius: 10px;
    background: transparent;
  }
`;
