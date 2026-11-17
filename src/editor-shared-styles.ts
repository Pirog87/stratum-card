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
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease,
      transform 0.1s ease;
  }

  .stratum-pill-btn:hover:not(:disabled) {
    background: var(--secondary-background-color);
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .stratum-pill-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .stratum-pill-btn:disabled {
    opacity: 0.5;
    cursor: default;
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

  /*
   * flex-wrap + podstawa tytułu 96 px: na wąskim telefonie akcje (4–5
   * przycisków po 40 px) schodzą do drugiej linii, zamiast ściskać tytuł
   * do „…" albo wypychać kosz poza wiersz. Na szerokim ekranie nic się
   * nie zawija.
   */
  .stratum-row-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    min-height: 40px;
  }

  .stratum-row-head > .stratum-row-title {
    flex: 1 1 96px;
  }

  /*
   * Nagłówek wiersza jako przycisk rozwijania (chip editor) — wygląda jak
   * zwykły wiersz, ale dostaje klawiaturę, fokus i aria-expanded.
   */
  .stratum-row-toggle {
    flex: 1 1 140px;
    min-width: 0;
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    padding: 0 4px 0 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .stratum-row-toggle:hover {
    background: color-mix(in srgb, var(--primary-text-color) 4%, transparent);
  }

  .stratum-row-chevron {
    --mdc-icon-size: 18px;
    margin-left: auto;
    flex-shrink: 0;
    color: var(--secondary-text-color);
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

  /* gap 4 px (było 2) — sąsiednie cele dotyku muszą mieć oddech. */
  .stratum-row-actions {
    display: flex;
    align-items: center;
    gap: 4px;
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

  /*
   * Cel dotyku 40×40 (było 28×28 przy ikonie 18 px) — na telefonie
   * celowanie w ołówek kończyło się trafieniem w kosz obok.
   */
  .stratum-icon-btn {
    background: transparent;
    border: 0;
    min-width: 40px;
    min-height: 40px;
    padding: 8px;
    cursor: pointer;
    color: var(--secondary-text-color);
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s ease, color 0.12s ease, transform 0.1s ease;
  }

  .stratum-icon-btn:hover:not(:disabled) {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
  }

  .stratum-icon-btn:active:not(:disabled) {
    transform: scale(0.96);
  }

  .stratum-icon-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .stratum-icon-btn.accent {
    background: var(--primary-color, #ff9b42);
    color: #fff;
  }

  .stratum-icon-btn.accent:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .stratum-icon-btn.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--error-color) 15%, transparent);
    color: var(--error-color);
  }

  .stratum-icon-btn ha-icon {
    --mdc-icon-size: 18px;
  }

  /*
   * Fokus z klawiatury / switch access — wcześniej żaden przycisk edytora
   * nie miał widocznego obrysu (focus-visible był tylko na polach tekstu).
   * Jedna reguła dla wszystkich wspólnych klas przycisków.
   */
  .stratum-icon-btn:focus-visible,
  .stratum-pill-btn:focus-visible,
  .stratum-chip:focus-visible,
  .stratum-add-btn:focus-visible,
  .stratum-row-toggle:focus-visible,
  .stratum-undo-btn:focus-visible,
  .stratum-collapsible summary:focus-visible,
  details.stratum-panel > summary.stratum-panel-header:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  /* === Cofnij po usunięciu (editor-undo.ts) === */

  .stratum-undo-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 4px 4px 4px 12px;
    border-radius: 12px;
    border: 1px solid var(--divider-color);
    background: color-mix(in srgb, var(--card-background-color) 92%, var(--primary-text-color));
    color: var(--primary-text-color);
    font-size: 12px;
    animation: stratum-sub-in 0.18s ease-out;
  }

  .stratum-undo-bar > ha-icon {
    --mdc-icon-size: 16px;
    color: var(--secondary-text-color);
    flex-shrink: 0;
  }

  .stratum-undo-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stratum-undo-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 40px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--primary-color);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s ease, transform 0.1s ease;
  }

  .stratum-undo-btn:hover {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }

  .stratum-undo-btn:active {
    transform: scale(0.96);
  }

  .stratum-undo-btn ha-icon {
    --mdc-icon-size: 16px;
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
    transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease,
      transform 0.1s ease;
  }

  .stratum-add-btn:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color, #ff9b42) 5%, transparent);
  }

  .stratum-add-btn:active {
    transform: scale(0.98);
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

  /* === Form primitives (chipy / slidery / toggles) === */

  .stratum-group {
    margin-bottom: 16px;
  }

  .stratum-group:last-child {
    margin-bottom: 0;
  }

  .stratum-group-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-text-color);
    margin-bottom: 8px;
  }

  .stratum-group-label.sub {
    margin-top: 14px;
  }

  .stratum-group-hint {
    margin: 6px 0 0;
    font-size: 11px;
    color: var(--secondary-text-color);
  }

  .stratum-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .stratum-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--divider-color);
    background: var(--card-background-color, rgba(255, 255, 255, 0.02));
    color: var(--primary-text-color);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
  }

  .stratum-chip ha-icon {
    --mdc-icon-size: 14px;
  }

  .stratum-chip:hover {
    background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
  }

  .stratum-chip:active {
    transform: scale(0.97);
  }

  .stratum-chip.on {
    background: color-mix(in srgb, var(--primary-color, #ff9b42) 22%, transparent);
    border-color: var(--primary-color, #ff9b42);
    color: var(--primary-color, #ff9b42);
    font-weight: 600;
  }

  .stratum-slider-row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    column-gap: 10px;
    row-gap: 2px;
    margin-bottom: 12px;
  }

  .stratum-slider-label {
    grid-column: 1;
    grid-row: 1;
    font-size: 12px;
    color: var(--secondary-text-color);
  }

  .stratum-slider-value {
    grid-column: 2;
    grid-row: 1;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--primary-text-color);
    font-weight: 600;
  }

  .stratum-slider {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 100%;
    accent-color: var(--primary-color, #ff9b42);
    margin: 0;
  }

  .stratum-toggles-row {
    display: flex;
    gap: 20px;
    align-items: center;
    flex-wrap: wrap;
  }

  .stratum-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
    color: var(--primary-text-color);
  }

  .stratum-toggle input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--primary-color, #ff9b42);
    cursor: pointer;
  }

  /* === Collapsible panel (kliknij nagłówek żeby rozwinąć) === */

  details.stratum-panel {
    padding: 0;
  }

  details.stratum-panel > summary.stratum-panel-header {
    margin: 0;
    padding: 14px 16px;
    cursor: pointer;
    list-style: none;
    user-select: none;
    border-radius: 14px;
  }

  details.stratum-panel > summary.stratum-panel-header::-webkit-details-marker {
    display: none;
  }

  details.stratum-panel > summary.stratum-panel-header::after {
    content: '';
    width: 10px;
    height: 10px;
    margin-left: auto;
    border-right: 2px solid var(--secondary-text-color);
    border-bottom: 2px solid var(--secondary-text-color);
    transform: rotate(-45deg);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  details.stratum-panel[open] > summary.stratum-panel-header::after {
    transform: rotate(45deg);
  }

  details.stratum-panel > summary.stratum-panel-header:hover {
    background: color-mix(in srgb, var(--primary-color, #ff9b42) 4%, transparent);
  }

  details.stratum-panel > .stratum-panel-body {
    padding: 4px 16px 16px;
    margin-top: 0;
    border-top: 1px solid var(--divider-color);
  }

  /*
   * Furtka reduced motion dla wszystkiego, co wyżej się rusza: wjazd
   * rozwiniętego formularza i paska „Cofnij", tranzycje oraz skalowanie
   * pod palcem — edytor nie ma skakać użytkownikowi, który ruchu nie chce.
   */
  @media (prefers-reduced-motion: reduce) {
    .stratum-row-sub,
    .stratum-undo-bar {
      animation: none;
    }
    .stratum-row,
    .stratum-pill-btn,
    .stratum-icon-btn,
    .stratum-row-toggle,
    .stratum-chip,
    .stratum-add-btn,
    .stratum-undo-btn,
    .stratum-collapsible summary::after,
    details.stratum-panel > summary.stratum-panel-header::after {
      transition: none;
    }
    .stratum-pill-btn:active:not(:disabled),
    .stratum-icon-btn:active:not(:disabled),
    .stratum-chip:active,
    .stratum-add-btn:active,
    .stratum-undo-btn:active {
      transform: none;
    }
  }
`;
