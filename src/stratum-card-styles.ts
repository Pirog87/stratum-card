// Style stratum-card — wydzielone z komponentu (dlug techniczny),
// zero zmian w tresci CSS.

import { css } from 'lit';
import { surfaceTokens } from './surface-tokens.js';

export const cardStyles = css`
    ${surfaceTokens}

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

    /* ── Belka w stylu „stripes" (header.style: 'stripes') ──────────────
       Ikona w kwadracie, chipy pod nazwą, z prawej skośne paski z nazwami
       pokoi, w których świeci się światło. Kontener nazwany, bo paski
       zwężają się wg szerokości BELKI, nie viewportu. */
    /* Kompozycja z paskami liczy na wyraźnie zaokrąglony róg karty — przy
       typowych 12 px z motywu ostatni pasek kończy się kanciasto i wygląda
       jak doklejony. Stąd własny, większy domyślny promień; nadpisanie
       --stratum-card-border-radius dalej wygrywa. */
    ha-card.stripes-card {
      border-radius: var(--stratum-card-border-radius, 24px);
    }

    .header.stripes {
      container-type: inline-size;
      container-name: stratum-header;
      box-sizing: border-box;
      min-height: 76px;
      padding: 0 12px 0 16px;
      gap: 12px;
      /* Paski wystają poza belkę (skos) — obcinamy je tutaj, nie na ha-card,
         żeby poświata ikony nie była cięta przez własny kontener. */
      overflow: hidden;
      --stratum-header-glow: var(--stratum-header-glow-color, var(--stratum-lights));
    }

    .header.stripes.lit:not(.no-glow) {
      background: radial-gradient(
        200px 110px at 36px 50%,
        color-mix(in srgb, var(--stratum-header-glow) 17%, transparent),
        transparent
      );
    }

    .hs-icon {
      display: grid;
      place-items: center;
      flex: none;
      box-sizing: border-box;
      width: 44px;
      height: 44px;
      border-radius: var(--stratum-header-icon-radius, 12px);
      background: var(--stratum-surface-2);
      border: 1px solid var(--stratum-surface-4);
      transition: background 0.2s ease, border-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    .header.stripes.lit .hs-icon {
      background: color-mix(in srgb, var(--stratum-header-glow) 18%, transparent);
      border-color: color-mix(in srgb, var(--stratum-header-glow) 45%, transparent);
    }

    .header.stripes.lit:not(.no-glow) .hs-icon {
      box-shadow: 0 0 20px
        color-mix(in srgb, var(--stratum-header-glow) 32%, transparent);
    }

    .header.stripes.lit .area-icon {
      color: var(--stratum-card-icon-color, var(--stratum-header-glow));
    }

    .hs-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      flex: 1;
      /* min-width: 0 — inaczej długa nazwa piętra wypycha paski poza belkę. */
      min-width: 0;
    }

    .hs-title {
      max-width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      font: inherit;
      font-size: var(--stratum-card-title-size, 17px);
      font-weight: var(--stratum-card-title-weight, 500);
      letter-spacing: -0.01em;
      color: var(--stratum-card-title-color, var(--primary-text-color));
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      border-radius: 4px;
      transition: transform 0.1s ease;
    }

    .hs-title:hover {
      color: color-mix(
        in srgb,
        var(--stratum-card-title-color, var(--primary-text-color)) 82%,
        var(--stratum-surface-base)
      );
    }

    .hs-title:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color));
      outline-offset: 2px;
    }

    .hs-title:active {
      transform: scale(0.98);
    }

    .header.stripes .chips {
      padding: 0;
      max-width: 100%;
      /* Liczniki w tej belce są głównym nośnikiem stanu (obok pasków), więc
         dostają większą pigułkę niż chipy belki klasycznej. */
      --stratum-chip-padding: 5px 10px 5px 8px;
      --stratum-chip-font-size: 13px;
      --stratum-chip-icon-size: 16px;
    }

    .hs-stripes {
      display: flex;
      flex: none;
      align-self: stretch;
      /* Ujemne marginesy: paski sięgają poza belkę na górze/dole i z prawej,
         żeby skos nie odsłaniał narożników. Nadmiar tnie overflow belki. */
      margin: -14px -36px -14px 0;
    }

    .hs-stripe {
      display: grid;
      place-items: center;
      flex: none;
      box-sizing: border-box;
      width: var(--stratum-header-stripe-width, 44px);
      margin-left: 2px;
      padding: 0;
      border: 0;
      font: inherit;
      background: var(--stratum-header-stripe-bg, var(--stratum-lights));
      transform: skewX(-22deg);
      transition: filter 0.15s ease;
    }

    /* Co drugi pasek o ton ciemniejszy — przy jednym, domyślnym kolorze
       sąsiednie paski inaczej zlewają się w plamę. Paski z kolorem żarówki
       (inline --stratum-header-stripe-bg) zostają nietknięte: przyciemnienie
       przekłamywałoby barwę światła. */
    .hs-stripe:nth-child(even):not([style*='stripe-bg']) {
      background: color-mix(
        in srgb,
        var(--stratum-header-stripe-bg, var(--stratum-lights)) 88%,
        var(--stratum-ink-shade)
      );
    }

    /* Ostatni pasek jest szerszy o część schowaną za krawędzią karty;
       padding trzyma napis w widocznej połowie. */
    .hs-stripe:last-child {
      width: calc(var(--stratum-header-stripe-width, 44px) + 32px);
      padding-right: 32px;
    }

    button.hs-stripe {
      cursor: pointer;
    }

    button.hs-stripe:hover {
      filter: brightness(1.07);
    }

    button.hs-stripe:focus-visible {
      outline: 2px solid var(--stratum-card-focus-color, var(--primary-color));
      outline-offset: -4px;
    }

    button.hs-stripe:active {
      filter: brightness(0.93);
    }

    .hs-stripe-label {
      display: block;
      max-width: 72px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      /* Odwrócenie skosu rodzica + obrót wzdłuż paska (90° − 22° = 68°). */
      transform: skewX(22deg) rotate(-68deg);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .hs-stripe.ink-dark {
      color: color-mix(
        in srgb,
        var(--stratum-header-stripe-bg, var(--stratum-lights)) 28%,
        var(--stratum-ink-shade)
      );
    }

    .hs-stripe.ink-light {
      color: color-mix(
        in srgb,
        var(--stratum-header-stripe-bg, var(--stratum-lights)) 12%,
        var(--stratum-ink-tint)
      );
    }

    /* Uwaga: container query mierzy content-box belki, czyli szerokość karty
       pomniejszoną o padding (28 px). Progi 300/240 odpowiadają kartom
       ok. 330 i 270 px — wcześniejsze 340/270 łapały zwykły telefon
       (karta 366 px) i niepotrzebnie zwężały paski. */
    @container stratum-header (max-width: 300px) {
      .hs-stripe {
        --stratum-header-stripe-width: 34px;
      }
    }

    @container stratum-header (max-width: 240px) {
      .hs-stripes {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .hs-icon,
      .hs-title,
      .hs-stripe {
        transition: none;
      }
      .hs-title:active {
        transform: none;
      }
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
      transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Uchwyt arkusza — tylko na telefonie, gdzie popup jest pełnoekranowy.
       Zapowiada, że to arkusz (dotąd nic nie sugerowało, jak wyjść) i daje
       wyjście w zasięgu kciuka: przeciągnięcie w dół zamyka. × w prawym
       górnym rogu zostaje jako trzecia droga, obok dotknięcia tła i Escape. */
    .stratum-popup-grab {
      display: none;
    }

    @media (max-width: 600px) {
      .stratum-popup-grab {
        display: flex;
        position: sticky;
        top: 0;
        z-index: 6;
        align-items: center;
        justify-content: center;
        height: 24px;
        flex-shrink: 0;
        touch-action: none;
        cursor: grab;
      }

      .stratum-popup-grab::before {
        content: '';
        width: 40px;
        height: 4px;
        border-radius: 999px;
        background: color-mix(
          in srgb,
          var(--primary-text-color, #e8e8e8) 32%,
          transparent
        );
      }

      .stratum-popup-grab:active {
        cursor: grabbing;
      }

      .stratum-popup-grab:focus-visible {
        outline: 2px solid var(--stratum-card-focus-color, var(--primary-color, #ff9b42));
        outline-offset: -2px;
        border-radius: 6px;
      }
    }

    /* Arkusz dostaje fokus programowo przy otwarciu — obrys byłby tu
       szumem, bo użytkownik go nie wywołał klawiszem. Kontrolki w środku
       zachowują swoje :focus-visible. */
    .stratum-popup-card:focus {
      outline: none;
    }

    /* Wartownicy pułapki fokusa — muszą być focusowalne, więc nie mogą mieć
       display:none ani visibility:hidden. Zero wymiaru wystarczy. */
    .stratum-popup-sentinel {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    /* Karta pokoju bez własnej ramki wewnątrz popupu. */
    .stratum-popup-card stratum-room-card {
      display: block;
      /* Popup jest kontenerem przewijania, więc nagłówki sekcji mają się
         przyklejać. Na dashboardzie karta tego nie włącza — tam sticky
         łapałby viewport całej strony. */
      --stratum-section-sticky: sticky;
      /* Rezerwa w headerze na przycisk × — chipy nie wjadą pod krzyżyk.
         48 px przycisku + 10 px marginesu + luz. */
      --stratum-room-header-pad-right: 62px;
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
      margin-bottom: -48px;
      transform: translateY(10px);
      width: 48px;
      height: 48px;
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
      --mdc-icon-size: 22px;
    }

    @media (prefers-reduced-motion: reduce) {
      .stratum-popup-backdrop,
      .stratum-popup-card {
        animation: none;
        transition: none;
      }
    }
  
  /* ====== Chip niedostepnych urzadzen w naglowku ====== */
  .header-unav-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1.5px solid
      color-mix(in srgb, var(--stratum-chip-unavailable-color, #9e9e9e) 55%, transparent);
    background: color-mix(in srgb, var(--stratum-chip-unavailable-color, #9e9e9e) 14%, transparent);
    color: var(--stratum-chip-unavailable-color, #9e9e9e);
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
  }
  .header-unav-badge ha-icon {
    --mdc-icon-size: 14px;
  }

  /* ====== Skeleton ladowania ====== */
  .sk-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
  }
  .sk-body {
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .sk-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--stratum-room-row-bg, rgba(255, 255, 255, 0.035));
    border-radius: 999px;
    min-height: var(--stratum-room-row-min-height, 72px);
    padding: 0 16px 0 8px;
  }
  .sk-circle {
    width: 46px;
    height: 46px;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .sk-bar {
    height: 13px;
    border-radius: 7px;
  }
  .sk-anim {
    position: relative;
    overflow: hidden;
    background: var(--stratum-surface-3);
  }
  .sk-anim::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      transparent 30%,
      color-mix(in srgb, var(--stratum-surface-ink) 12%, transparent) 50%,
      transparent 70%
    );
    animation: stratum-shimmer 1.4s infinite;
  }
  @keyframes stratum-shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sk-anim::after { animation: none; }
  }
`;
