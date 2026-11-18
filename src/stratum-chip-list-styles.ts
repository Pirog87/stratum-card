// Style listy encji chipa (stratum-chip-list). Wydzielone z komponentu,
// gdy plik przekroczył próg ~800 linii (CLAUDE.md, „Struktura komponentu").

import { css } from 'lit';

export const chipListStyles = css`
    :host {
      display: contents;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: color-mix(in srgb, var(--stratum-ink-shade, var(--primary-background-color)) 65%, transparent);
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
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      /* Akcent jako TEKST (aktywna zakładka, klasa i czas czujki): 40%
         akcentu + 60% koloru tekstu. Żółty świateł i zielony ruchu jako
         tekst na jasnym motywie miały 1,4–2,4:1; po zmieszaniu ≥ 4,8:1 na
         jasnym i ≥ 5,4:1 na ciemnym, a odcień nadal mówi, czego dotyczy
         lista. Ikony i tła zostają w czystym akcencie. */
      --accent-ink: color-mix(
        in srgb,
        var(--accent, var(--primary-color)) 40%,
        var(--primary-text-color)
      );
      box-shadow: 0 10px 40px color-mix(in srgb, var(--stratum-ink-shade, var(--primary-background-color)) 50%, transparent);
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
      border-bottom: 1px solid var(--divider-color);
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--accent, var(--primary-color)) 16%, transparent),
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
        var(--accent, var(--primary-color)) 22%,
        transparent
      );
      color: var(--accent, var(--primary-color));
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
      background: var(--stratum-surface-2, var(--secondary-background-color));
      color: var(--primary-text-color);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s ease, transform 0.08s ease;
      flex-shrink: 0;
    }
    /* Hover tylko przy prawdziwym wskaźniku: na telefonie :hover zostaje po
       tapnięciu i × wyglądał na „uzbrojony". Bez czerwieni — czerwony w
       karcie znaczy alarm, a zamknięcie listy niczego nie niszczy;
       przyciemnienie/rozjaśnienie tła z koloru tekstu działa w obu motywach. */
    @media (hover: hover) {
      .close:hover {
        background: color-mix(
          in srgb,
          var(--secondary-background-color) 82%,
          var(--primary-text-color)
        );
      }
    }
    .close:active {
      transform: scale(0.96);
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
      color: var(--success-color);
    }

    .list {
      overflow-y: auto;
      /* Koniec listy nie przewija dashboardu pod tłem. */
      overscroll-behavior: contain;
      padding: 8px 12px 12px;
      display: flex;
      flex-direction: column;
    }

    /* Wiersz w opakowaniu, które umie się zwinąć (grid 1fr → 0fr, ten sam
       wzór co expander karty). Odstęp między wierszami siedzi w .row-pad,
       a nie w gap listy — inaczej po zwinięciu wiersza zostawałaby dziura
       i lista podskakiwała na końcu. */
    .row-wrap {
      display: grid;
      grid-template-rows: 1fr;
      transition: grid-template-rows 0.26s ease, opacity 0.18s ease;
    }
    .row-wrap.leaving {
      grid-template-rows: 0fr;
      opacity: 0;
    }
    .row-in {
      min-height: 0;
    }
    /* overflow tylko przy zwijaniu — na stałe ciąłby obrys fokusu wiersza. */
    .row-wrap.leaving .row-in {
      overflow: hidden;
    }
    .row-wrap:not(:last-child) .row-pad {
      padding-bottom: 6px;
    }

    /* --- nagłówek sekcji pokoju (zastępuje zakładki) --- */

    .sec {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 28px;
      padding: 10px 2px 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .sec:first-child {
      padding-top: 2px;
    }
    .sec-t {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cnt {
      font-variant-numeric: tabular-nums;
      font-weight: 500;
      letter-spacing: 0;
      text-transform: none;
    }
    .sec-btn {
      border: 0;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0;
      text-transform: none;
      height: 28px;
      padding: 0 12px;
      border-radius: 999px;
      background: var(--stratum-surface-2, color-mix(in srgb, var(--card-background-color) 93%, var(--primary-text-color)));
      color: var(--primary-text-color);
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.12s ease, transform 0.08s ease;
    }

    /* --- wąski wiersz (wszystkie rodzaje) --- */

    /* Wiersz bez overflow: hidden — obcinałby obrys fokusu przycisków przy
       krawędzi. Zaokrąglenie wypełnienia trzyma osobna warstwa .fill. */
    .r {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      width: 100%;
      min-height: 40px;
      padding: 0 6px 0 4px;
      border: 0;
      border-radius: 12px;
      font: inherit;
      text-align: left;
      color: var(--primary-text-color);
      background: var(--stratum-surface-1, color-mix(in srgb, var(--card-background-color) 96%, var(--primary-text-color)));
    }
    .r > :not(.fill) {
      position: relative;
    }
    /* Tło = poziom (jasność, pozycja rolety). --p ustawia render albo gest
       palca wprost na wierszu; kolor --k to kolor żarówki, inaczej akcent
       listy. Zgaszona lampa ma pusty pasek — kolor znaczy „włączone". */
    .fill {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      overflow: hidden;
      pointer-events: none;
    }
    .fill > span {
      display: block;
      height: 100%;
      width: var(--p, 0%);
      background: color-mix(in srgb, var(--k, var(--accent, var(--primary-color))) 26%, transparent);
      transition: width 0.15s ease;
    }
    .r.ctl.off:not(.cover) .fill > span {
      width: 0;
    }
    .r.dragging .fill > span {
      transition: none;
    }
    .r.ctl {
      cursor: pointer;
      touch-action: pan-y;
      user-select: none;
      -webkit-user-select: none;
    }

    .ic {
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--k, var(--accent, var(--primary-color)));
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      --mdc-icon-size: 18px;
    }
    button.ic {
      cursor: pointer;
      transition: background 0.12s ease, transform 0.08s ease;
    }
    .r.ctl.off .ic,
    .r.sens:not(.on) .ic,
    .r.unav .ic {
      color: var(--secondary-text-color);
    }

    .tx {
      flex: 1;
      min-width: 0;
      font-size: 14px;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-radius: 6px;
    }
    .tx b {
      font-weight: 600;
    }
    /* Odstęp przed „· nazwa" marginesem, nie spacją w szablonie — minifier
       szablonów zjada białe znaki na granicy znaczników. */
    .tx em {
      font-style: normal;
      color: var(--secondary-text-color);
      margin-left: 4px;
    }
    .r.ctl.off .tx b {
      font-weight: 500;
      color: var(--secondary-text-color);
    }

    .val {
      flex-shrink: 0;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      color: var(--secondary-text-color);
    }
    .r.sens.on .val {
      color: var(--accent-ink);
      font-weight: 600;
    }

    /* Przełącznik — jawne włącz/wyłącz (także dla czytnika ekranu). */
    .sw {
      position: relative;
      width: 40px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: var(--stratum-surface-3, color-mix(in srgb, var(--card-background-color) 82%, var(--primary-text-color)));
      flex-shrink: 0;
      cursor: pointer;
      transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.08s ease;
    }
    .sw.on {
      background: var(--k, var(--accent, var(--primary-color)));
    }
    .knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--stratum-ink-tint, var(--text-primary-color));
      box-shadow: 0 1px 2px color-mix(in srgb, var(--stratum-ink-shade, var(--primary-text-color)) 30%, transparent);
      transition: transform 0.18s ease;
    }
    .sw.on .knob {
      transform: translateX(18px);
    }

    /* Rolety: góra / dół (w ruchu: stop). */
    .cb {
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: var(--stratum-surface-2, color-mix(in srgb, var(--card-background-color) 93%, var(--primary-text-color)));
      color: var(--primary-text-color);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      cursor: pointer;
      --mdc-icon-size: 18px;
      transition: background 0.12s ease, transform 0.08s ease;
    }
    .cb.stop {
      color: var(--accent-ink);
    }

    /* Czujka: cały wiersz = szczegóły encji. */
    .r.sens,
    .r.unav {
      cursor: pointer;
      transition: background 0.12s ease, transform 0.08s ease;
    }
    /* Lista alarmów: wiersz podbarwiony kolorem listy (czerwień alarmu
       przychodzi jako --accent z koloru chipa, nie wpisana tutaj). */
    .r.sens.alarm {
      background: color-mix(
        in srgb,
        var(--accent, var(--primary-color)) 12%,
        var(--stratum-surface-1, var(--card-background-color))
      );
    }
    .badge {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent, var(--primary-color)) 16%, transparent);
      color: var(--accent-ink);
    }

    /* --- encja niedostępna (wzorzec off-pill z kafla pokoju) --- */

    .r.unav .tx,
    .r.unav .ic {
      opacity: 0.6;
    }
    .unav-icon {
      position: relative;
    }
    /* Przekreślenie ikony — „urządzenie nie odpowiada", nie „wyłączone". */
    .unav-icon::after {
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

    /* --- sticky stopka --- */

    .foot {
      padding: 10px 16px 14px;
      flex-shrink: 0;
      background: linear-gradient(
        to top,
        var(--ha-card-background, var(--card-background-color)) 65%,
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
      background: color-mix(in srgb, var(--error-color) 16%, transparent);
      color: var(--error-color);
      cursor: pointer;
      transition: background 0.12s ease, transform 0.08s ease;
    }
    @media (hover: hover) {
      .master:hover {
        background: color-mix(in srgb, var(--error-color) 26%, transparent);
      }
    }

    /* Stany interaktywne (§3): hover tylko przy wskaźniku, tło w stronę
       koloru tekstu (działa w obu motywach), bez przesuwania treści. */
    @media (hover: hover) {
      button.ic:hover,
      .cb:hover,
      .sec-btn:hover {
        background: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
      }
      .r.sens:hover,
      .r.unav:hover {
        background: color-mix(
          in srgb,
          var(--accent, var(--primary-color)) 8%,
          var(--stratum-surface-1, var(--card-background-color))
        );
      }
      .sw:hover {
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-text-color) 12%, transparent);
      }
    }
    button.ic:active,
    .cb:active,
    .sw:active {
      transform: scale(0.96);
    }
    .r.sens:active,
    .r.unav:active,
    .sec-btn:active,
    .master:active {
      transform: scale(0.98);
    }

    /* Kolor obrysu to token fokusa karty, NIE --accent/--k: --accent jest
       kolorem chipa (na liście alarmu czerwony), a --k kolorem żarówki.
       Jeden kolor = jedno znaczenie: fokus. Suwak w wierszu (.tx) ma obrys
       do środka — wiersz kończy się tuż przy nim. */
    .close:focus-visible,
    .master:focus-visible,
    .sec-btn:focus-visible,
    button.ic:focus-visible,
    .sw:focus-visible,
    .cb:focus-visible,
    .r.sens:focus-visible,
    .r.unav:focus-visible {
      outline: 2px solid var(--stratum-focus-ring, var(--stratum-focus, var(--primary-color)));
      outline-offset: 2px;
    }
    .tx[role='slider']:focus-visible {
      outline: 2px solid var(--stratum-focus-ring, var(--stratum-focus, var(--primary-color)));
      outline-offset: -2px;
    }
    .master ha-icon { --mdc-icon-size: 18px; }

    /* Furtka ruchu (§4): zwijanie wierszy, pasek, przełącznik i wciśnięcia. */
    @media (prefers-reduced-motion: reduce) {
      .row-wrap,
      .backdrop,
      .panel,
      .fill > span,
      .sw,
      .knob,
      .cb,
      button.ic,
      .sec-btn,
      .r.sens,
      .r.unav,
      .close,
      .master {
        animation: none;
        transition: none;
      }
      button.ic:active,
      .cb:active,
      .sw:active,
      .r.sens:active,
      .r.unav:active,
      .sec-btn:active,
      .close:active,
      .master:active {
        transform: none;
      }
    }
`;
