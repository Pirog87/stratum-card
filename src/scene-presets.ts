// Wbudowane grafiki dla scen — inline SVG, 16:9 (320x180), bez zewnętrznych
// zasobów.
//
// Styl inspirowany Philips Hue: atmosferyczne gradienty i glow zamiast
// symbolicznych ikon. Każda scena to kompozycja barwna oddająca nastrój
// oświetlenia (nie literalny obraz kawy/TV/etc).
//
// Użycie: `image: 'stratum:<id>'` w configu — runtime zamienia na data URI.

export interface ScenePreset {
  id: string;
  label: string;
  svg: string;
}

/** Wrapper SVG z soft-glow filterem. */
function wrap(body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180"><defs>${defs}</defs>${body}</svg>`;
}

/** Linear multi-stop gradient (top → bottom). Zwraca def + rect wypełniający. */
function linearSky(id: string, stops: Array<[number, string]>): string {
  const gradient = `<linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1">${stops
    .map(
      ([offset, color]) =>
        `<stop offset="${offset}" stop-color="${color}"/>`,
    )
    .join('')}</linearGradient>`;
  return `${gradient}__BG__<rect width="320" height="180" fill="url(#sky-${id})"/>`;
}

/** Radial gradient wypełnienie całego tła. */
function radialBg(
  id: string,
  innerColor: string,
  outerColor: string,
  cx = '50%',
  cy = '50%',
  r = '80%',
): string {
  const gradient = `<radialGradient id="bg-${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${innerColor}"/><stop offset="1" stop-color="${outerColor}"/></radialGradient>`;
  return `${gradient}__BG__<rect width="320" height="180" fill="url(#bg-${id})"/>`;
}

/**
 * Miękki „orb światła" — radialny glow z wartościami opacity.
 * Używaj dla sun/moon/głównego źródła światła w scenie.
 */
function glowOrb(
  id: string,
  cx: number,
  cy: number,
  r: number,
  innerColor: string,
  outerColor: string = innerColor,
  innerOpacity = 1,
  fadeOpacity = 0,
): string {
  const gradient = `<radialGradient id="orb-${id}"><stop offset="0" stop-color="${innerColor}" stop-opacity="${innerOpacity}"/><stop offset="0.5" stop-color="${outerColor}" stop-opacity="${(innerOpacity + fadeOpacity) / 2}"/><stop offset="1" stop-color="${outerColor}" stop-opacity="${fadeOpacity}"/></radialGradient>`;
  return `${gradient}__DEF__<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#orb-${id})"/>`;
}

/** Łączy kompozycję: helper rozdziela `__BG__` i `__DEF__` na <defs> vs treść. */
function compose(parts: string[]): string {
  // Każdy part może zawierać `__BG__` albo `__DEF__` — oznacza granicę defs/body.
  const defs: string[] = [];
  const body: string[] = [];
  for (const p of parts) {
    const marker = p.includes('__BG__') ? '__BG__' : p.includes('__DEF__') ? '__DEF__' : null;
    if (marker) {
      const [d, b] = p.split(marker);
      if (d) defs.push(d);
      if (b) body.push(b);
    } else {
      body.push(p);
    }
  }
  return wrap(body.join(''), defs.join(''));
}

// =========== HELPER SCENES ===========

/** Scena z radialnym tłem + centralnym orbem światła. */
function atmosphericScene(
  id: string,
  bgInner: string,
  bgOuter: string,
  orb: { x: number; y: number; r: number; color: string; fadeColor?: string },
  extras = '',
): string {
  return compose([
    radialBg(id, bgInner, bgOuter, '50%', '45%', '80%'),
    glowOrb(`${id}-o`, orb.x, orb.y, orb.r, orb.color, orb.fadeColor ?? orb.color, 1, 0),
    extras,
  ]);
}

// =========== PRESETS ===========

const SCENES: Record<string, string> = {
  // Jasne — bright daylight, duży warm sun
  jasne: atmosphericScene(
    'jasne',
    '#ffe082',
    '#f57c00',
    { x: 160, y: 90, r: 95, color: '#fffde7', fadeColor: '#fff59d' },
    `<circle cx="160" cy="90" r="28" fill="#fffde7" opacity="0.95"/>`,
  ),

  // Poranek — dawn sky, pink horizon, rising sun
  poranek: compose([
    linearSky('poranek', [
      [0, '#1a237e'],
      [0.35, '#7e57c2'],
      [0.6, '#ef9a9a'],
      [0.85, '#ffab91'],
      [1, '#ffe0b2'],
    ]),
    glowOrb('poranek-sun', 160, 145, 55, '#fff9c4', '#ffab91', 0.95, 0),
    `<rect x="0" y="150" width="320" height="30" fill="#5d4037" opacity="0.5"/>`,
  ]),

  // Kawa — warm amber café glow
  kawa: atmosphericScene(
    'kawa',
    '#6d4c41',
    '#1b0000',
    { x: 100, y: 80, r: 80, color: '#ffcc80', fadeColor: '#8d6e63' },
    `<ellipse cx="230" cy="100" rx="45" ry="55" fill="url(#orb-kawa-o)" opacity="0.4"/>`,
  ),

  // Praca — focused cool daylight, clean
  praca: compose([
    linearSky('praca', [
      [0, '#0d47a1'],
      [0.5, '#42a5f5'],
      [1, '#e3f2fd'],
    ]),
    glowOrb('praca-l', 160, 90, 75, '#ffffff', '#bbdefb', 0.85, 0),
  ]),

  // Nauka — concentrated task light
  nauka: atmosphericScene(
    'nauka',
    '#1a237e',
    '#000',
    { x: 160, y: 85, r: 70, color: '#e8eaf6', fadeColor: '#3f51b5' },
  ),

  // Czytanie — warm reading cocoon
  czytanie: atmosphericScene(
    'czytanie',
    '#ffd180',
    '#3e2723',
    { x: 160, y: 95, r: 85, color: '#fff8e1', fadeColor: '#ff9800' },
  ),

  // Gotowanie — bright warm kitchen
  gotowanie: compose([
    radialBg('gotowanie', '#fffde7', '#ff8f00', '50%', '40%', '90%'),
    glowOrb('gotowanie-c', 160, 85, 100, '#fff9c4', '#ff8f00', 1, 0),
  ]),

  // Relaks — soft peach/coral
  relaks: compose([
    linearSky('relaks', [
      [0, '#4a148c'],
      [0.4, '#e91e63'],
      [0.75, '#ff8a65'],
      [1, '#ffccbc'],
    ]),
    glowOrb('relaks-g', 160, 110, 80, '#ffe0b2', '#ff6e40', 0.7, 0),
  ]),

  // Medytacja — deep serene purple
  medytacja: compose([
    radialBg('medytacja', '#7b1fa2', '#0d0d2b', '50%', '55%', '90%'),
    glowOrb('medytacja-core', 160, 95, 55, '#e1bee7', '#7b1fa2', 0.85, 0),
    glowOrb('medytacja-halo', 160, 95, 85, '#ce93d8', '#4a148c', 0.3, 0),
  ]),

  // Muzyka — vibrant magenta/pink
  muzyka: compose([
    radialBg('muzyka', '#ad1457', '#1a0033', '50%', '55%', '85%'),
    glowOrb('muzyka-c1', 115, 100, 45, '#f48fb1', '#880e4f', 0.85, 0),
    glowOrb('muzyka-c2', 205, 90, 45, '#ea80fc', '#6a1b9a', 0.85, 0),
  ]),

  // TV — dim cool blue, subtle screen glow
  tv: compose([
    radialBg('tv', '#1a237e', '#000', '50%', '70%', '80%'),
    `<rect x="40" y="50" width="240" height="85" rx="8" fill="url(#orb-tv-s)" opacity="0.75"/>`,
    glowOrb('tv-s', 160, 90, 140, '#64b5f6', '#0d47a1', 0.85, 0),
  ]),

  // Kino — very dim, warm accent
  kino: compose([
    radialBg('kino', '#3e2723', '#000', '50%', '60%', '70%'),
    glowOrb('kino-warm', 160, 100, 60, '#ff6e40', '#3e2723', 0.55, 0),
    glowOrb('kino-core', 160, 100, 25, '#ffab91', '#ff6e40', 0.75, 0),
  ]),

  // Gaming — cyan/magenta neon split
  gaming: compose([
    linearSky('gaming', [
      [0, '#001f3f'],
      [0.5, '#1a0033'],
      [1, '#000'],
    ]),
    glowOrb('gaming-c1', 100, 90, 70, '#00e5ff', '#006064', 0.85, 0),
    glowOrb('gaming-m1', 220, 90, 70, '#f50057', '#880e4f', 0.85, 0),
  ]),

  // Sport — vibrant active green
  sport: compose([
    radialBg('sport', '#aeea00', '#1b5e20', '50%', '55%', '90%'),
    glowOrb('sport-c', 160, 90, 80, '#f4ff81', '#64dd17', 0.95, 0),
  ]),

  // Goście — welcoming warm amber
  goscie: compose([
    linearSky('goscie', [
      [0, '#bf360c'],
      [0.5, '#ff8a65'],
      [1, '#ffe0b2'],
    ]),
    glowOrb('goscie-c', 160, 100, 100, '#fff8e1', '#ff6e40', 0.8, 0),
  ]),

  // Impreza — multi-color party spots
  impreza: compose([
    radialBg('impreza', '#311b92', '#000', '50%', '55%', '85%'),
    glowOrb('imp-1', 80, 70, 45, '#ff1744', '#b71c1c', 0.9, 0),
    glowOrb('imp-2', 240, 75, 45, '#00e5ff', '#006064', 0.9, 0),
    glowOrb('imp-3', 160, 120, 50, '#f50057', '#880e4f', 0.9, 0),
    glowOrb('imp-4', 260, 140, 35, '#ffd600', '#ff6f00', 0.85, 0),
    glowOrb('imp-5', 60, 135, 35, '#76ff03', '#1b5e20', 0.85, 0),
  ]),

  // Disco — purple/pink with spots (disco ball vibe)
  disco: compose([
    radialBg('disco', '#e91e63', '#12003a', '50%', '55%', '85%'),
    glowOrb('disco-c', 160, 90, 75, '#ff80ab', '#e91e63', 0.8, 0),
    `<circle cx="80" cy="50" r="4" fill="#fff" opacity="0.85"/>
     <circle cx="240" cy="55" r="3" fill="#fff" opacity="0.75"/>
     <circle cx="110" cy="140" r="3.5" fill="#fff" opacity="0.8"/>
     <circle cx="260" cy="130" r="4" fill="#fff" opacity="0.85"/>
     <circle cx="200" cy="40" r="2.5" fill="#fff" opacity="0.7"/>
     <circle cx="60" cy="110" r="2.5" fill="#fff" opacity="0.7"/>`,
  ]),

  // Romantyczne — deep red with soft heart-glow
  romantyczne: compose([
    radialBg('romantyczne', '#c2185b', '#1a0008', '50%', '55%', '80%'),
    glowOrb('rom-c', 160, 95, 65, '#ff80ab', '#c2185b', 0.9, 0),
    glowOrb('rom-halo', 160, 95, 105, '#f06292', '#880e4f', 0.4, 0),
  ]),

  // Kąpiel — cool teal spa
  kapiel: compose([
    radialBg('kapiel', '#00bcd4', '#003d40', '50%', '50%', '85%'),
    glowOrb('kap-c', 160, 90, 80, '#b2ebf2', '#0097a7', 0.85, 0),
    `<path d="M 40 120 Q 80 110 120 120 T 200 120 T 280 120" stroke="#b2ebf2" stroke-width="2.5" fill="none" opacity="0.4"/>
     <path d="M 40 140 Q 80 130 120 140 T 200 140 T 280 140" stroke="#b2ebf2" stroke-width="2" fill="none" opacity="0.3"/>`,
  ]),

  // Ogród — fresh green garden
  ogrod: compose([
    linearSky('ogrod', [
      [0, '#1b5e20'],
      [0.4, '#43a047'],
      [1, '#dcedc8'],
    ]),
    glowOrb('ogrod-c', 160, 95, 80, '#fff9c4', '#43a047', 0.75, 0),
  ]),

  // Wieczór — sunset orange/red
  wieczor: compose([
    linearSky('wieczor', [
      [0, '#311b92'],
      [0.3, '#d81b60'],
      [0.65, '#ff7043'],
      [1, '#ffc107'],
    ]),
    glowOrb('wiecz-sun', 160, 145, 65, '#fff9c4', '#ff6f00', 0.95, 0),
    `<rect x="0" y="150" width="320" height="30" fill="#3e2723" opacity="0.55"/>`,
  ]),

  // Usypianie — dim amber fading to black
  usypianie: compose([
    radialBg('usypianie', '#d84315', '#000', '45%', '55%', '70%'),
    glowOrb('usyp-c', 145, 100, 75, '#ffcc80', '#d84315', 0.75, 0),
    glowOrb('usyp-moon', 230, 60, 22, '#fff8e1', '#ffe082', 0.9, 0),
  ]),

  // Noc — deep night sky with stars
  noc: compose([
    radialBg('noc', '#1a237e', '#000010', '70%', '30%', '90%'),
    glowOrb('noc-moon', 225, 70, 30, '#e3f2fd', '#bbdefb', 1, 0),
    `<circle cx="225" cy="70" r="16" fill="#f5f5f5"/>
     <circle cx="219" cy="66" r="14" fill="#1a237e" opacity="0.85"/>
     <circle cx="50" cy="40" r="1.3" fill="#fff" opacity="0.9"/>
     <circle cx="90" cy="55" r="1" fill="#fff" opacity="0.75"/>
     <circle cx="130" cy="35" r="1.5" fill="#fff" opacity="0.95"/>
     <circle cx="175" cy="60" r="1" fill="#fff" opacity="0.7"/>
     <circle cx="70" cy="100" r="1.2" fill="#fff" opacity="0.85"/>
     <circle cx="110" cy="130" r="1" fill="#fff" opacity="0.7"/>
     <circle cx="170" cy="140" r="1.3" fill="#fff" opacity="0.85"/>
     <circle cx="35" cy="150" r="1" fill="#fff" opacity="0.7"/>
     <circle cx="260" cy="120" r="1.1" fill="#fff" opacity="0.8"/>
     <circle cx="290" cy="95" r="0.9" fill="#fff" opacity="0.65"/>
     <circle cx="200" cy="30" r="0.8" fill="#fff" opacity="0.6"/>`,
  ]),

  // Bezpieczeństwo — alert green with shield
  bezpieczenstwo: compose([
    radialBg('bezp', '#2e7d32', '#0d1f11', '50%', '55%', '80%'),
    glowOrb('bezp-g', 160, 95, 80, '#a5d6a7', '#388e3c', 0.8, 0),
    `<path d="M 160 50 L 200 65 L 200 100 Q 200 125 160 140 Q 120 125 120 100 L 120 65 Z"
       fill="#1b5e20" stroke="#a5d6a7" stroke-width="3" opacity="0.9"/>
     <path d="M 140 95 L 156 111 L 182 82" stroke="#a5d6a7" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  ]),
};

export const SCENE_PRESETS: ScenePreset[] = [
  { id: 'jasne', label: 'Jasne', svg: SCENES.jasne! },
  { id: 'poranek', label: 'Poranek', svg: SCENES.poranek! },
  { id: 'kawa', label: 'Kawa', svg: SCENES.kawa! },
  { id: 'praca', label: 'Praca', svg: SCENES.praca! },
  { id: 'nauka', label: 'Nauka', svg: SCENES.nauka! },
  { id: 'czytanie', label: 'Czytanie', svg: SCENES.czytanie! },
  { id: 'gotowanie', label: 'Gotowanie', svg: SCENES.gotowanie! },
  { id: 'relaks', label: 'Relaks', svg: SCENES.relaks! },
  { id: 'medytacja', label: 'Medytacja', svg: SCENES.medytacja! },
  { id: 'muzyka', label: 'Muzyka', svg: SCENES.muzyka! },
  { id: 'tv', label: 'TV', svg: SCENES.tv! },
  { id: 'kino', label: 'Kino', svg: SCENES.kino! },
  { id: 'gaming', label: 'Gaming', svg: SCENES.gaming! },
  { id: 'sport', label: 'Sport', svg: SCENES.sport! },
  { id: 'goscie', label: 'Goście', svg: SCENES.goscie! },
  { id: 'impreza', label: 'Impreza', svg: SCENES.impreza! },
  { id: 'disco', label: 'Disco', svg: SCENES.disco! },
  { id: 'romantyczne', label: 'Romantyczne', svg: SCENES.romantyczne! },
  { id: 'kapiel', label: 'Kąpiel', svg: SCENES.kapiel! },
  { id: 'ogrod', label: 'Ogród', svg: SCENES.ogrod! },
  { id: 'wieczor', label: 'Wieczór', svg: SCENES.wieczor! },
  { id: 'usypianie', label: 'Usypianie', svg: SCENES.usypianie! },
  { id: 'noc', label: 'Noc', svg: SCENES.noc! },
  { id: 'bezpieczenstwo', label: 'Bezpieczeństwo', svg: SCENES.bezpieczenstwo! },
];

const PRESET_PREFIX = 'stratum:';

export function isPresetImage(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PRESET_PREFIX);
}

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
