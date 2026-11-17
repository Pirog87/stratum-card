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

    /* Kolor „świeci się" — jeden na całą kartę (chip świateł, paski i
       poświata belki). Domyślnie ten sam, którego używa chip świateł. */
    --stratum-lights: var(--stratum-chip-lights-color, #ffc107);

    /* Skrajne końce dla napisów na kolorowym tle (pasek belki bierze kolor
       z żarówki, więc tekst liczymy z tła w stronę czerni albo bieli). */
    --stratum-ink-shade: #000;
    --stratum-ink-tint: #fff;

    /* Znaczenia stanów — jedno źródło na kartę, delegowane do motywu HA
       (Mushroom/Catppuccin przemalowują je bez card-moda). Dawniej kafle
       binarne miały wpisane #f44336/#4caf50 i ignorowały motyw. Alarm jest
       niżej, w bloku :host + ha-card. */
    --stratum-ok: var(--success-color, #4caf50);
    --stratum-warn: var(--warning-color, #ffa600);

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

  /* Tokeny liczone ze ZMIENNYCH UŻYTKOWNIKA — liczone drugi raz na
     ha-card. Zmienna CSS dziedziczy się jako wartość już policzona:
     definicja tylko na :host zamraża ją z tym, co widzi :host, więc
     card-mod w zwykłej formie (ha-card { --stratum-focus: … }) nie docierał
     do niczego pod spodem — kafle, popup i lista chipa dziedziczyły obrys
     policzony piętro wyżej. Druga definicja na ha-card liczy go od nowa
     z wartości ustawionej na karcie. Wolno tu trzymać tylko tokeny
     prywatne i aliasy: nasza reguła ha-card wygrywa z regułą card-moda
     (arkusz komponentu jest w kaskadzie po <style> w shadow root), więc
     publiczna zmienna użytkownika zdefiniowana tutaj przestałaby działać. */
  :host,
  ha-card {
    /* Alarm idzie najpierw za --stratum-chip-leak-color — tak samo definiują
       go wiersz i kafel pokoju (stratum-card-room-row/-tile), a docs/styling.md
       każe ustawiać właśnie tę zmienną. Bez tego alarm miałby dwa źródła:
       wiersz w kolorze użytkownika, kafel popupu w --error-color. */
    --stratum-alarm: var(--stratum-chip-leak-color, var(--error-color, #f44336));

    /* Obrys fokusa klawiatury — prywatny token rozwiązywany tutaj.
       Celowo NIE definiujemy samego --stratum-focus: to zmienna
       użytkownika (docs/styling.md), a nasza definicja przykrywała
       wartość dziedziczoną z motywu HA (html → karta) i obrys wracał do
       --primary-color. Kolejność: --stratum-focus → starsza nazwa
       --stratum-card-focus-color → akcent motywu. */
    --stratum-focus-ring: var(
      --stratum-focus,
      var(--stratum-card-focus-color, var(--primary-color, #ff9b42))
    );
  }
`;
