// Teksty kafla encji (`stratum-room-tile`) — grupa `tile` wspólnych
// słowników pl.ts / en.ts. Ten moduł zostaje jako wąskie wejście dla
// kafla, intercomu i tile-state-text: jedno źródło prawdy, bez kopii.

import type { Messages } from './localize.js';
import { pl } from './pl.js';
import { en } from './en.js';

export type TileStrings = Messages['tile'];

export const tilePl: TileStrings = pl.tile;
export const tileEn: TileStrings = en.tile;
