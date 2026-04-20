// Wbudowane grafiki dla scen — inline SVG, bez zewnętrznych zasobów.
//
// Aspect 270:150 (pasuje do `aspect: '270/150'` z configu scen).
// Użycie: w configu `image: 'stratum:noc'` — runtime zamienia na data URI.

export interface ScenePreset {
  id: string;
  label: string;
  svg: string;
}

const wrap = (id: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 150" width="270" height="150"><defs><linearGradient id="g-${id}" x1="0" x2="0" y1="0" y2="1">${defsFor(id)}</linearGradient></defs>${body}</svg>`;

function defsFor(id: string): string {
  const grad: Record<string, [string, string]> = {
    jasne: ['#ffd54f', '#fb8c00'],
    noc: ['#1a237e', '#3949ab'],
    usypianie: ['#5e35b1', '#c2185b'],
    czytanie: ['#8d6e63', '#d7ccc8'],
    relaks: ['#00897b', '#26c6da'],
    disco: ['#6a1b9a', '#ec407a'],
    nauka: ['#1565c0', '#42a5f5'],
    tv: ['#37474f', '#102027'],
    poranek: ['#ffcc80', '#ce93d8'],
    wieczor: ['#ff6f00', '#6a1b9a'],
    kino: ['#212121', '#b71c1c'],
    praca: ['#0d47a1', '#4fc3f7'],
    romantyczne: ['#ad1457', '#f48fb1'],
    impreza: ['#4527a0', '#00bcd4'],
  };
  const [a, b] = grad[id] ?? ['#455a64', '#90a4ae'];
  return `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`;
}

function bg(id: string): string {
  return `<rect fill="url(#g-${id})" width="270" height="150"/>`;
}

const SUN = `<circle cx="135" cy="75" r="32" fill="#fff59d" opacity="0.95"/><g stroke="#fff59d" stroke-width="4" stroke-linecap="round">
  <line x1="135" y1="20" x2="135" y2="35"/><line x1="135" y1="115" x2="135" y2="130"/>
  <line x1="80" y1="75" x2="95" y2="75"/><line x1="175" y1="75" x2="190" y2="75"/>
  <line x1="96" y1="36" x2="106" y2="46"/><line x1="164" y1="104" x2="174" y2="114"/>
  <line x1="174" y1="36" x2="164" y2="46"/><line x1="106" y1="104" x2="96" y2="114"/>
</g>`;

const MOON = `<g><circle cx="140" cy="70" r="34" fill="#e1bee7"/><circle cx="128" cy="62" r="34" fill="url(#g-noc)"/></g>
<g fill="#fff">
  <circle cx="60" cy="35" r="1.5"/><circle cx="200" cy="25" r="2"/><circle cx="225" cy="110" r="1.8"/>
  <circle cx="40" cy="95" r="1.5"/><circle cx="80" cy="120" r="1.2"/><circle cx="175" cy="120" r="1.5"/>
  <circle cx="105" cy="20" r="1"/><circle cx="240" cy="60" r="1.5"/>
</g>`;

const BED = `<g fill="#fff" opacity="0.95">
  <rect x="70" y="85" width="130" height="24" rx="4"/>
  <rect x="70" y="60" width="50" height="30" rx="6"/>
  <rect x="70" y="108" width="6" height="20"/><rect x="194" y="108" width="6" height="20"/>
</g>
<g fill="#e1bee7"><circle cx="220" cy="40" r="10"/><circle cx="214" cy="36" r="10" fill="url(#g-usypianie)"/></g>`;

const BOOK = `<g>
  <path d="M80 40 L190 40 L190 120 L135 108 L80 120 Z" fill="#6d4c41"/>
  <path d="M80 40 L135 48 L135 108 L80 120 Z" fill="#fff8e1"/>
  <path d="M190 40 L135 48 L135 108 L190 120 Z" fill="#fff8e1" opacity="0.85"/>
  <rect x="92" y="62" width="34" height="2" fill="#8d6e63"/>
  <rect x="92" y="70" width="30" height="2" fill="#8d6e63"/>
  <rect x="92" y="78" width="32" height="2" fill="#8d6e63"/>
  <rect x="145" y="62" width="34" height="2" fill="#8d6e63"/>
  <rect x="145" y="70" width="30" height="2" fill="#8d6e63"/>
</g>
<g><circle cx="215" cy="50" r="10" fill="#ffd54f"/></g>`;

const WAVES = `<g stroke="#fff" stroke-width="3" fill="none" opacity="0.7" stroke-linecap="round">
  <path d="M20 60 Q 60 50 100 60 T 180 60 T 260 60"/>
  <path d="M20 80 Q 60 70 100 80 T 180 80 T 260 80" opacity="0.85"/>
  <path d="M20 100 Q 60 90 100 100 T 180 100 T 260 100" opacity="0.6"/>
</g>
<circle cx="210" cy="35" r="12" fill="#fff59d" opacity="0.9"/>`;

const DISCO = `<g>
  <circle cx="135" cy="70" r="30" fill="#e91e63"/>
  <g stroke="#fff" stroke-width="1" opacity="0.6">
    <line x1="135" y1="40" x2="135" y2="100"/>
    <line x1="105" y1="70" x2="165" y2="70"/>
    <ellipse cx="135" cy="70" rx="30" ry="10" fill="none"/>
    <ellipse cx="135" cy="70" rx="30" ry="20" fill="none"/>
  </g>
  <line x1="135" y1="30" x2="135" y2="42" stroke="#fff" stroke-width="2"/>
</g>
<g fill="#ffeb3b"><circle cx="40" cy="30" r="3"/><circle cx="240" cy="40" r="3"/><circle cx="60" cy="120" r="3"/><circle cx="220" cy="115" r="3"/></g>
<g fill="#00e5ff"><circle cx="85" cy="45" r="2.5"/><circle cx="200" cy="55" r="2.5"/></g>
<g fill="#76ff03"><circle cx="45" cy="75" r="2.5"/><circle cx="230" cy="90" r="2.5"/></g>`;

const BULB = `<g>
  <path d="M135 40 C 115 40 100 56 100 74 C 100 86 108 94 115 100 L 115 110 L 155 110 L 155 100 C 162 94 170 86 170 74 C 170 56 155 40 135 40 Z" fill="#fff9c4"/>
  <rect x="118" y="112" width="34" height="5" fill="#9e9e9e"/>
  <rect x="121" y="119" width="28" height="4" fill="#757575"/>
  <g stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.8">
    <line x1="70" y1="70" x2="82" y2="70"/><line x1="188" y1="70" x2="200" y2="70"/>
    <line x1="90" y1="40" x2="100" y2="48"/><line x1="170" y1="48" x2="180" y2="40"/>
  </g>
</g>`;

const TV = `<g>
  <rect x="55" y="40" width="160" height="90" rx="6" fill="#263238"/>
  <rect x="63" y="48" width="144" height="66" rx="2" fill="#0d47a1"/>
  <rect x="75" y="60" width="120" height="44" fill="#1976d2" opacity="0.6"/>
  <rect x="100" y="128" width="70" height="4" fill="#455a64"/>
  <circle cx="200" cy="55" r="2" fill="#4caf50"/>
</g>`;

const SUNRISE = `<g>
  <circle cx="135" cy="105" r="28" fill="#fff59d"/>
  <rect x="0" y="105" width="270" height="45" fill="url(#g-poranek)"/>
  <g stroke="#fff59d" stroke-width="3" stroke-linecap="round" opacity="0.8">
    <line x1="135" y1="55" x2="135" y2="65"/>
    <line x1="95" y1="75" x2="102" y2="80"/><line x1="168" y1="80" x2="175" y2="75"/>
  </g>
</g>`;

const SUNSET = `<g>
  <circle cx="135" cy="100" r="30" fill="#ff7043"/>
  <rect x="0" y="100" width="270" height="50" fill="#311b92" opacity="0.4"/>
  <g stroke="#fff" stroke-width="2" opacity="0.5" fill="none">
    <path d="M0 115 Q 90 108 135 115 T 270 115"/>
    <path d="M0 130 Q 90 123 135 130 T 270 130"/>
  </g>
</g>`;

const CINEMA = `<g>
  <circle cx="95" cy="75" r="32" fill="none" stroke="#fff" stroke-width="4"/>
  <circle cx="95" cy="75" r="5" fill="#fff"/>
  <circle cx="95" cy="55" r="6" fill="none" stroke="#fff" stroke-width="2"/>
  <circle cx="95" cy="95" r="6" fill="none" stroke="#fff" stroke-width="2"/>
  <circle cx="75" cy="75" r="6" fill="none" stroke="#fff" stroke-width="2"/>
  <circle cx="115" cy="75" r="6" fill="none" stroke="#fff" stroke-width="2"/>
</g>
<g transform="translate(155 40)">
  <rect width="70" height="70" rx="6" fill="#b71c1c"/>
  <path d="M0 20 L70 20 M0 35 L70 35 M0 50 L70 50" stroke="#fff" stroke-width="2" opacity="0.4"/>
  <text x="35" y="50" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="30" fill="#fff">🍿</text>
</g>`;

const DESK = `<g>
  <rect x="110" y="55" width="90" height="50" rx="4" fill="#263238"/>
  <rect x="115" y="60" width="80" height="40" rx="1" fill="#4fc3f7"/>
  <rect x="100" y="105" width="110" height="5" rx="2" fill="#37474f"/>
  <rect x="90" y="110" width="130" height="4" fill="#6d4c41"/>
  <g transform="translate(60 70)" fill="#fff59d" opacity="0.9">
    <circle cx="0" cy="0" r="10"/>
    <rect x="-1" y="10" width="2" height="30" fill="#9e9e9e"/>
  </g>
</g>`;

const HEART = `<g fill="#fff" opacity="0.95">
  <path d="M135 110 C 80 80 60 40 100 40 C 115 40 130 55 135 65 C 140 55 155 40 170 40 C 210 40 190 80 135 110 Z"/>
</g>
<g fill="#fff" opacity="0.6"><circle cx="50" cy="40" r="2"/><circle cx="230" cy="55" r="2.5"/><circle cx="220" cy="115" r="2"/><circle cx="45" cy="110" r="2.5"/></g>`;

const CONFETTI = `<g>
  <rect x="40" y="30" width="10" height="4" fill="#ffeb3b" transform="rotate(20 45 32)"/>
  <rect x="220" y="40" width="10" height="4" fill="#e91e63" transform="rotate(-30 225 42)"/>
  <rect x="60" y="110" width="10" height="4" fill="#4fc3f7" transform="rotate(45 65 112)"/>
  <rect x="210" y="105" width="10" height="4" fill="#76ff03" transform="rotate(-15 215 107)"/>
  <rect x="90" y="60" width="8" height="3" fill="#ff9800" transform="rotate(30 94 61)"/>
  <rect x="180" y="70" width="8" height="3" fill="#ba68c8" transform="rotate(-45 184 71)"/>
  <circle cx="135" cy="75" r="24" fill="#fff"/>
  <text x="135" y="86" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="28" fill="#6a1b9a">🎉</text>
</g>`;

export const SCENE_PRESETS: ScenePreset[] = [
  { id: 'jasne', label: 'Jasne', svg: wrap('jasne', bg('jasne') + SUN) },
  { id: 'noc', label: 'Noc', svg: wrap('noc', bg('noc') + MOON) },
  { id: 'usypianie', label: 'Usypianie', svg: wrap('usypianie', bg('usypianie') + BED) },
  { id: 'czytanie', label: 'Czytanie', svg: wrap('czytanie', bg('czytanie') + BOOK) },
  { id: 'relaks', label: 'Relaks', svg: wrap('relaks', bg('relaks') + WAVES) },
  { id: 'disco', label: 'Disco', svg: wrap('disco', bg('disco') + DISCO) },
  { id: 'nauka', label: 'Nauka', svg: wrap('nauka', bg('nauka') + BULB) },
  { id: 'tv', label: 'TV', svg: wrap('tv', bg('tv') + TV) },
  { id: 'poranek', label: 'Poranek', svg: wrap('poranek', bg('poranek') + SUNRISE) },
  { id: 'wieczor', label: 'Wieczór', svg: wrap('wieczor', bg('wieczor') + SUNSET) },
  { id: 'kino', label: 'Kino', svg: wrap('kino', bg('kino') + CINEMA) },
  { id: 'praca', label: 'Praca', svg: wrap('praca', bg('praca') + DESK) },
  { id: 'romantyczne', label: 'Romantyczne', svg: wrap('romantyczne', bg('romantyczne') + HEART) },
  { id: 'impreza', label: 'Impreza', svg: wrap('impreza', bg('impreza') + CONFETTI) },
];

const PRESET_PREFIX = 'stratum:';

export function isPresetImage(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PRESET_PREFIX);
}

/** Zamienia `stratum:<id>` na data URI gotowe do użycia w `background-image`. */
export function resolveSceneImage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith(PRESET_PREFIX)) return value;
  const id = value.slice(PRESET_PREFIX.length);
  const preset = SCENE_PRESETS.find((p) => p.id === id);
  if (!preset) return undefined;
  return `data:image/svg+xml;utf8,${encodeURIComponent(preset.svg)}`;
}

export function presetIdFromValue(value: string | undefined): string | undefined {
  if (!isPresetImage(value)) return undefined;
  return value!.slice(PRESET_PREFIX.length);
}
