// Tokeny powierzchni — wspólne dla stratum-card i stratum-room-card.
//
// Problem, który to rozwiązuje: karta budowała każdą powierzchnię z bieli
// (`rgba(255,255,255,0.04)` i pochodne). Na ciemnym motywie to działa, na
// jasnym — a jasny jest w HA domyślny — biel na bieli znaczy, że wiersze,
// kafle i chipy po prostu znikają.
//
// Powierzchnie liczymy więc z tła karty w stronę koloru tekstu: ten sam
// zapis daje jaśniejszą warstwę na ciemnym motywie i ciemniejszą na jasnym,
// bez pisania drugiej palety i bez `prefers-color-scheme`.
//
// Definicje siedzą na `:host`, żeby zostały nadpisywalne: reguła z zewnątrz
// (card-mod, theme, `ha-card { --stratum-tile-background: … }`) wygrywa
// z `:host`, więc dotychczasowe override'y użytkownika działają bez zmian.
// Fallbacki `rgba(255,255,255,…)` przy użyciach tych zmiennych zostają
// w kodzie jako martwa gałąź — nie ruszamy 31 miejsc, skoro token jest
// teraz zawsze zdefiniowany.

import { css } from 'lit';

export const surfaceTokens = css`
  :host {
    /* Baza: tło karty i kolor tekstu — obie z motywu HA. */
    --stratum-surface-base: var(
      --stratum-card-background,
      var(--ha-card-background, var(--card-background-color, #1e1f22))
    );
    --stratum-surface-ink: var(
      --stratum-card-color,
      var(--primary-text-color, #e8e8e8)
    );

    /* Cztery stopnie oddalenia od tła. 1 = ledwie widoczne wypełnienie,
       4 = tor przełącznika / element wymagający wyraźnego kontrastu. */
    --stratum-surface-1: color-mix(
      in srgb,
      var(--stratum-surface-base) 96%,
      var(--stratum-surface-ink)
    );
    --stratum-surface-2: color-mix(
      in srgb,
      var(--stratum-surface-base) 93%,
      var(--stratum-surface-ink)
    );
    --stratum-surface-3: color-mix(
      in srgb,
      var(--stratum-surface-base) 89%,
      var(--stratum-surface-ink)
    );
    --stratum-surface-4: color-mix(
      in srgb,
      var(--stratum-surface-base) 82%,
      var(--stratum-surface-ink)
    );

    /* Zagłębienie (stadion ikony w wierszu) — jedyna powierzchnia, która
       idzie w stronę czerni, nie tekstu: ma czytać się jak wnęka i na
       ciemnym, i na jasnym motywie. */
    --stratum-surface-well: color-mix(
      in srgb,
      var(--stratum-surface-base) 85%,
      #000
    );

    /* Mapowanie na tokeny, których używa reszta kodu. Nadpisanie
       któregokolwiek z nich z zewnątrz dalej wygrywa. */
    --stratum-tile-background: var(--stratum-surface-1);
    --stratum-room-tile-bg: var(--stratum-surface-1);
    --stratum-room-row-bg: var(--stratum-surface-1);
    --stratum-tile-chip-background: var(--stratum-surface-1);
    --stratum-card-hover-background: var(--stratum-surface-2);
    --stratum-card-room-hover: var(--stratum-surface-2);
    --stratum-chip-background: var(--stratum-surface-2);
    --stratum-tile-hover-background: var(--stratum-surface-3);
    --stratum-chip-hover-background: var(--stratum-surface-3);
  }
`;
