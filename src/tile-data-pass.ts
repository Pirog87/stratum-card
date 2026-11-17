// Dane wiersza pokoju liczone raz na render karty piętra.
//
// Belka `stripes` potrzebuje dla każdego pokoju liczby zapalonych świateł
// i ich koloru, a lista pomieszczeń — pełnych danych wiersza. Oba miejsca
// wołały `computeTileData` osobno, więc przy każdej istotnej zmianie (echo
// lampy w trakcie gestu jasności, ruch) karta liczyła agregację każdego
// pokoju dwa razy: ~18 przejść po klasach czujników plus kolor i poziom
// świateł. Na telefonie to ok. 40% więcej czasu renderu niż belka klasyczna.
//
// Pamięć żyje tylko w obrębie jednego renderu: `begin()` na jego początku
// czyści ją bezwarunkowo. Nie wolno przenosić wyników między renderami
// nawet przy tym samym `hass` — stan „w toku" (power-pending) i jego
// wygaśnięcie zmieniają wynik bez zmiany `hass` (render z gołego
// `requestUpdate()`).

import type {
  HassEntityRegistryEntry,
  HomeAssistant,
  TileFieldEntities,
} from './types.js';
import { computeTileData, type TileData } from './tile-data.js';

type Compute = (
  hass: HomeAssistant,
  entries: readonly HassEntityRegistryEntry[],
  fieldEntities?: TileFieldEntities,
) => TileData;

export class TileDataPass {
  private _hass?: HomeAssistant;
  /**
   * Klucz: tożsamość tablicy wpisów (stała dla zestawu stref do zmiany
   * rejestru — patrz `_roomEntries` w karcie) i obiektu `field_entities`
   * z configu pokoju. Ten sam pokój w belce i na liście daje oba klucze
   * identyczne.
   */
  private _memo = new WeakMap<
    readonly HassEntityRegistryEntry[],
    Map<TileFieldEntities | undefined, TileData>
  >();

  constructor(private readonly _compute: Compute = computeTileData) {}

  /** Początek renderu — zapomina wszystko, co policzył poprzedni. */
  public begin(hass: HomeAssistant | undefined): void {
    this._hass = hass;
    this._memo = new WeakMap();
  }

  public get(
    hass: HomeAssistant,
    entries: readonly HassEntityRegistryEntry[],
    fieldEntities?: TileFieldEntities,
  ): TileData {
    // Inny `hass` niż na początku renderu (nie powinno się zdarzyć, ale
    // render potrafi wołać pomocników poza kolejnością) — liczymy od nowa.
    if (hass !== this._hass) this.begin(hass);
    let byFields = this._memo.get(entries);
    if (!byFields) {
      byFields = new Map();
      this._memo.set(entries, byFields);
    }
    const hit = byFields.get(fieldEntities);
    if (hit) return hit;
    const data = this._compute(hass, entries, fieldEntities);
    byFields.set(fieldEntities, data);
    return data;
  }
}
