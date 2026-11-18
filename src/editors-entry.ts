// Wejście pliku dist/stratum-card-editors.js (PKG-3, v1.110.0).
//
// Edytory i ich słowniki to ~41% kodu, którego dashboard nie pokazuje —
// ładuje je dopiero editor-loader.ts z getConfigElement() obu kart.
// Ten plik nie importuje i nie może importować niczego z runtime karty
// (stratum-card.ts, hass-watch, boot-guard…): to osobny build bez
// współdzielonych chunków, granicę pilnuje plugin `stratum-boundary`
// w rollup.config.js. Uzasadnienie: docs/architecture.md, ADR-005.
//
// Kolejność importów jest znacząca — guard pierwszy (patrz
// editors-boot-guard.ts). Sub-edytory (pokoje, chipy, sekcje, sceny…)
// dociągają edytory główne same.

import { editorsGuard } from './editors-boot-guard.js';
import './stratum-card-editor.js';
import './stratum-room-card-editor.js';

editorsGuard.release();
