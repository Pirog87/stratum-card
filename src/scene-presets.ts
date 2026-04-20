// Wbudowane grafiki dla scen — inline SVG, 16:9 (320x180), bez zewnętrznych
// zasobów.
//
// Styl: radialne/liniowe gradienty, glow filter, rounded shapes.
// Użycie: `image: 'stratum:<id>'` w configu — runtime zamienia na data URI.

export interface ScenePreset {
  id: string;
  label: string;
  svg: string;
}

/** Budowa jednego SVG — wspólny wrapper z glow filterem. */
function makeSvg(id: string, body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180"><defs><filter id="glow-${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>${defs}</defs>${body}</svg>`;
}

function radialBg(id: string, color1: string, color2: string, cx = '30%', cy = '30%'): string {
  return `<defs><radialGradient id="g-${id}" cx="${cx}" cy="${cy}" r="85%"><stop offset="0" stop-color="${color1}"/><stop offset="1" stop-color="${color2}"/></radialGradient></defs><rect width="320" height="180" fill="url(#g-${id})"/>`;
}

// =========== PRESETS ===========

const SCENES = {
  jasne: makeSvg(
    'jasne',
    `${radialBg('jasne', '#ffe082', '#f57c00', '30%', '35%')}
    <circle cx="160" cy="80" r="40" fill="#fff59d" filter="url(#glow-jasne)" opacity="0.95"/>
    <circle cx="160" cy="80" r="26" fill="#fff8e1"/>
    <g stroke="#fff59d" stroke-width="3" stroke-linecap="round" opacity="0.85">
      <line x1="160" y1="22" x2="160" y2="36"/>
      <line x1="160" y1="124" x2="160" y2="138"/>
      <line x1="102" y1="80" x2="116" y2="80"/>
      <line x1="204" y1="80" x2="218" y2="80"/>
      <line x1="121" y1="41" x2="130" y2="51"/>
      <line x1="190" y1="109" x2="199" y2="119"/>
      <line x1="199" y1="41" x2="190" y2="51"/>
      <line x1="130" y1="109" x2="121" y2="119"/>
    </g>`,
  ),

  noc: makeSvg(
    'noc',
    `${radialBg('noc', '#283593', '#0d0b2b', '70%', '70%')}
    <g filter="url(#glow-noc)"><circle cx="185" cy="72" r="38" fill="#f3e5f5"/></g>
    <circle cx="170" cy="64" r="38" fill="#1a1844"/>
    <g fill="#fff">
      <circle cx="55" cy="45" r="1.6"/>
      <circle cx="240" cy="30" r="2"/>
      <circle cx="280" cy="110" r="1.8"/>
      <circle cx="40" cy="120" r="1.5"/>
      <circle cx="95" cy="150" r="1.2"/>
      <circle cx="220" cy="145" r="1.4"/>
      <circle cx="120" cy="25" r="1"/>
      <circle cx="295" cy="70" r="1.5"/>
      <circle cx="260" cy="55" r="1.1"/>
      <circle cx="70" cy="85" r="1"/>
    </g>`,
  ),

  usypianie: makeSvg(
    'usypianie',
    `${radialBg('usypianie', '#8e24aa', '#311b92', '25%', '70%')}
    <g fill="#fff" opacity="0.95" filter="url(#glow-usypianie)">
      <rect x="80" y="100" width="180" height="32" rx="8"/>
      <rect x="80" y="70" width="70" height="38" rx="10"/>
    </g>
    <rect x="80" y="130" width="180" height="10" rx="3" fill="#4a148c"/>
    <g fill="#f3e5f5" filter="url(#glow-usypianie)"><circle cx="255" cy="45" r="16"/></g>
    <circle cx="246" cy="40" r="16" fill="#4a148c"/>
    <g fill="#fff" opacity="0.7">
      <circle cx="60" cy="40" r="1.4"/>
      <circle cx="290" cy="120" r="1.4"/>
      <circle cx="40" cy="130" r="1"/>
    </g>`,
  ),

  czytanie: makeSvg(
    'czytanie',
    `${radialBg('czytanie', '#ffecb3', '#5d4037', '70%', '70%')}
    <g>
      <path d="M90 50 L230 50 Q240 50 240 60 L240 135 Q240 145 230 145 L90 145 Q80 145 80 135 L80 60 Q80 50 90 50Z" fill="#6d4c41"/>
      <path d="M90 55 L160 62 L160 138 L90 138 Q85 138 85 133 L85 60 Q85 55 90 55Z" fill="#fff8e1"/>
      <path d="M230 55 L160 62 L160 138 L230 138 Q235 138 235 133 L235 60 Q235 55 230 55Z" fill="#fff3e0"/>
      <g stroke="#a1887f" stroke-width="1.5" opacity="0.55">
        <line x1="100" y1="78" x2="150" y2="78"/>
        <line x1="100" y1="88" x2="145" y2="88"/>
        <line x1="100" y1="98" x2="148" y2="98"/>
        <line x1="170" y1="78" x2="225" y2="78"/>
        <line x1="170" y1="88" x2="220" y2="88"/>
      </g>
    </g>
    <g filter="url(#glow-czytanie)"><circle cx="265" cy="55" r="18" fill="#ffd54f" opacity="0.9"/></g>`,
  ),

  relaks: makeSvg(
    'relaks',
    `${radialBg('relaks', '#26c6da', '#004d40', '70%', '20%')}
    <g filter="url(#glow-relaks)"><circle cx="260" cy="55" r="22" fill="#fff59d" opacity="0.85"/></g>
    <g stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7">
      <path d="M20 100 Q 70 85 120 100 T 220 100 T 320 100"/>
      <path d="M20 118 Q 70 103 120 118 T 220 118 T 320 118" opacity="0.85"/>
      <path d="M20 136 Q 70 121 120 136 T 220 136 T 320 136" opacity="0.55"/>
      <path d="M20 154 Q 70 139 120 154 T 220 154 T 320 154" opacity="0.35"/>
    </g>`,
  ),

  disco: makeSvg(
    'disco',
    `${radialBg('disco', '#6a1b9a', '#1a0033', '50%', '50%')}
    <g filter="url(#glow-disco)">
      <circle cx="160" cy="85" r="38" fill="#e91e63"/>
      <g stroke="#fff" stroke-width="1" opacity="0.7" fill="none">
        <line x1="160" y1="47" x2="160" y2="123"/>
        <line x1="122" y1="85" x2="198" y2="85"/>
        <ellipse cx="160" cy="85" rx="38" ry="12"/>
        <ellipse cx="160" cy="85" rx="38" ry="24"/>
      </g>
    </g>
    <line x1="160" y1="30" x2="160" y2="47" stroke="#fff" stroke-width="2.5"/>
    <g filter="url(#glow-disco)">
      <circle cx="45" cy="40" r="4" fill="#ffeb3b"/>
      <circle cx="280" cy="50" r="4" fill="#00e5ff"/>
      <circle cx="65" cy="150" r="4" fill="#76ff03"/>
      <circle cx="270" cy="145" r="4" fill="#ff4081"/>
      <circle cx="110" cy="35" r="3" fill="#ff9800"/>
      <circle cx="230" cy="30" r="3" fill="#ba68c8"/>
    </g>`,
  ),

  nauka: makeSvg(
    'nauka',
    `${radialBg('nauka', '#42a5f5', '#0d47a1', '35%', '35%')}
    <g filter="url(#glow-nauka)">
      <path d="M160 40 C 125 40 100 67 100 100 C 100 120 112 135 125 147 L 125 155 L 195 155 L 195 147 C 208 135 220 120 220 100 C 220 67 195 40 160 40 Z" fill="#fff59d" opacity="0.95"/>
    </g>
    <rect x="130" y="155" width="60" height="7" rx="2" fill="#9e9e9e"/>
    <rect x="134" y="162" width="52" height="5" rx="2" fill="#757575"/>
    <g stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.65">
      <line x1="60" y1="95" x2="80" y2="95"/>
      <line x1="240" y1="95" x2="260" y2="95"/>
      <line x1="90" y1="55" x2="105" y2="68"/>
      <line x1="215" y1="68" x2="230" y2="55"/>
    </g>`,
  ),

  tv: makeSvg(
    'tv',
    `${radialBg('tv', '#37474f', '#0a0f12', '50%', '50%')}
    <rect x="55" y="40" width="210" height="110" rx="10" fill="#1a2327"/>
    <rect x="65" y="50" width="190" height="85" rx="4" fill="#0d47a1"/>
    <rect x="80" y="60" width="160" height="65" fill="#1976d2" opacity="0.6"/>
    <path d="M140 78 L180 95 L140 112 Z" fill="#fff" opacity="0.85"/>
    <rect x="125" y="148" width="70" height="5" rx="2" fill="#455a64"/>
    <g filter="url(#glow-tv)"><circle cx="250" cy="58" r="3" fill="#4caf50"/></g>`,
  ),

  poranek: makeSvg(
    'poranek',
    `${radialBg('poranek', '#ffcc80', '#e91e63', '50%', '100%')}
    <g filter="url(#glow-poranek)"><circle cx="160" cy="125" r="36" fill="#fff59d"/></g>
    <path d="M0 125 L320 125 L320 180 L0 180 Z" fill="url(#g-poranek)" opacity="0.5"/>
    <g stroke="#fff59d" stroke-width="2.5" stroke-linecap="round" opacity="0.6">
      <line x1="160" y1="60" x2="160" y2="75"/>
      <line x1="105" y1="85" x2="115" y2="95"/>
      <line x1="205" y1="95" x2="215" y2="85"/>
    </g>`,
  ),

  wieczor: makeSvg(
    'wieczor',
    `${radialBg('wieczor', '#ff7043', '#311b92', '50%', '110%')}
    <g filter="url(#glow-wieczor)"><circle cx="160" cy="115" r="40" fill="#ff5722" opacity="0.95"/></g>
    <path d="M0 120 L320 120 L320 180 L0 180 Z" fill="#1a0033" opacity="0.3"/>
    <g stroke="#fff" stroke-width="2" opacity="0.4" fill="none">
      <path d="M0 135 Q 80 127 160 135 T 320 135"/>
      <path d="M0 155 Q 80 147 160 155 T 320 155"/>
    </g>`,
  ),

  kino: makeSvg(
    'kino',
    `${radialBg('kino', '#b71c1c', '#1a0000', '50%', '50%')}
    <g fill="none" stroke="#fff" stroke-width="3" filter="url(#glow-kino)">
      <circle cx="115" cy="90" r="40"/>
      <circle cx="115" cy="90" r="7" fill="#fff"/>
      <circle cx="115" cy="62" r="8"/>
      <circle cx="115" cy="118" r="8"/>
      <circle cx="87" cy="90" r="8"/>
      <circle cx="143" cy="90" r="8"/>
    </g>
    <g transform="translate(185 50)">
      <rect width="85" height="90" rx="10" fill="#f44336" filter="url(#glow-kino)"/>
      <path d="M0 20 L85 20 M0 40 L85 40 M0 60 L85 60" stroke="#fff" stroke-width="2" opacity="0.4"/>
      <text x="42" y="65" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="38" fill="#fff">🍿</text>
    </g>`,
  ),

  praca: makeSvg(
    'praca',
    `${radialBg('praca', '#4fc3f7', '#01579b', '30%', '30%')}
    <g filter="url(#glow-praca)">
      <rect x="105" y="60" width="120" height="70" rx="6" fill="#263238"/>
      <rect x="112" y="67" width="106" height="56" rx="2" fill="#4fc3f7"/>
    </g>
    <rect x="95" y="132" width="140" height="7" rx="3" fill="#37474f"/>
    <g transform="translate(65 85)" fill="#fff59d" opacity="0.95" filter="url(#glow-praca)">
      <circle cx="0" cy="0" r="12"/>
    </g>
    <line x1="65" y1="97" x2="65" y2="130" stroke="#9e9e9e" stroke-width="2"/>`,
  ),

  romantyczne: makeSvg(
    'romantyczne',
    `${radialBg('romantyczne', '#f48fb1', '#4a0033', '50%', '60%')}
    <g filter="url(#glow-romantyczne)" fill="#fff">
      <path d="M160 135 C 90 100 65 55 115 55 C 135 55 152 72 160 85 C 168 72 185 55 205 55 C 255 55 230 100 160 135 Z"/>
    </g>
    <g fill="#fff" opacity="0.7">
      <circle cx="55" cy="50" r="2"/>
      <circle cx="275" cy="60" r="2.5"/>
      <circle cx="265" cy="140" r="2"/>
      <circle cx="50" cy="135" r="2.5"/>
      <circle cx="30" cy="85" r="1.5"/>
      <circle cx="290" cy="100" r="1.5"/>
    </g>`,
  ),

  impreza: makeSvg(
    'impreza',
    `${radialBg('impreza', '#4527a0', '#00bcd4', '70%', '30%')}
    <g filter="url(#glow-impreza)">
      <circle cx="160" cy="90" r="32" fill="#fff"/>
    </g>
    <text x="160" y="103" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="34" fill="#6a1b9a">🎉</text>
    <g filter="url(#glow-impreza)">
      <rect x="40" y="35" width="10" height="4" fill="#ffeb3b" transform="rotate(20 45 37)"/>
      <rect x="265" y="45" width="10" height="4" fill="#e91e63" transform="rotate(-30 270 47)"/>
      <rect x="55" y="135" width="10" height="4" fill="#4fc3f7" transform="rotate(45 60 137)"/>
      <rect x="255" y="130" width="10" height="4" fill="#76ff03" transform="rotate(-15 260 132)"/>
      <rect x="100" y="60" width="8" height="3" fill="#ff9800" transform="rotate(30 104 61)"/>
      <rect x="220" y="75" width="8" height="3" fill="#ba68c8" transform="rotate(-45 224 76)"/>
      <rect x="85" y="150" width="8" height="3" fill="#00e5ff" transform="rotate(12 89 151)"/>
      <rect x="235" y="25" width="8" height="3" fill="#76ff03" transform="rotate(55 239 26)"/>
    </g>`,
  ),

  sport: makeSvg(
    'sport',
    `${radialBg('sport', '#66bb6a', '#1b5e20', '50%', '100%')}
    <g filter="url(#glow-sport)">
      <circle cx="160" cy="90" r="44" fill="#fff"/>
      <path d="M160 46 L172 74 L202 74 L178 92 L188 122 L160 104 L132 122 L142 92 L118 74 L148 74 Z" fill="#2e7d32"/>
    </g>
    <line x1="0" y1="150" x2="320" y2="150" stroke="#fff" stroke-width="2" opacity="0.35"/>`,
  ),

  medytacja: makeSvg(
    'medytacja',
    `${radialBg('medytacja', '#7e57c2', '#1a0033', '50%', '50%')}
    <g filter="url(#glow-medytacja)" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.8">
      <circle cx="160" cy="90" r="15"/>
      <circle cx="160" cy="90" r="28"/>
      <circle cx="160" cy="90" r="42"/>
      <circle cx="160" cy="90" r="56"/>
    </g>
    <g filter="url(#glow-medytacja)">
      <circle cx="160" cy="90" r="9" fill="#fff"/>
    </g>
    <g fill="#fff" opacity="0.6">
      <circle cx="160" cy="40" r="1.8"/>
      <circle cx="160" cy="140" r="1.8"/>
      <circle cx="90" cy="90" r="1.8"/>
      <circle cx="230" cy="90" r="1.8"/>
    </g>`,
  ),

  gotowanie: makeSvg(
    'gotowanie',
    `${radialBg('gotowanie', '#ff8a65', '#4a0000', '50%', '60%')}
    <g>
      <rect x="110" y="95" width="100" height="50" rx="6" fill="#263238"/>
      <rect x="120" y="80" width="80" height="15" rx="4" fill="#424242"/>
      <rect x="90" y="105" width="20" height="8" rx="3" fill="#424242"/>
      <rect x="210" y="105" width="20" height="8" rx="3" fill="#424242"/>
    </g>
    <g filter="url(#glow-gotowanie)" fill="#fff" opacity="0.85">
      <path d="M130 80 Q 125 60 135 45 Q 145 60 140 80 Z"/>
      <path d="M160 80 Q 155 55 168 40 Q 175 55 168 80 Z"/>
      <path d="M190 80 Q 185 60 195 45 Q 205 60 200 80 Z"/>
    </g>`,
  ),

  goscie: makeSvg(
    'goscie',
    `${radialBg('goscie', '#ffab91', '#4e342e', '50%', '60%')}
    <g fill="#fff3e0" filter="url(#glow-goscie)">
      <path d="M115 50 L150 50 L145 95 Q 132 105 120 95 Z"/>
      <rect x="131" y="100" width="3" height="25"/>
      <rect x="115" y="125" width="35" height="5" rx="2"/>
      <path d="M170 50 L205 50 L200 95 Q 187 105 175 95 Z"/>
      <rect x="186" y="100" width="3" height="25"/>
      <rect x="170" y="125" width="35" height="5" rx="2"/>
    </g>
    <g fill="#b71c1c" opacity="0.9">
      <path d="M117 52 L148 52 L145 80 Q 132 90 120 80 Z"/>
      <path d="M172 52 L203 52 L200 80 Q 187 90 175 80 Z"/>
    </g>`,
  ),

  gaming: makeSvg(
    'gaming',
    `${radialBg('gaming', '#7b1fa2', '#1a0033', '50%', '50%')}
    <g filter="url(#glow-gaming)">
      <path d="M90 75 Q 70 75 70 100 L 70 115 Q 70 135 90 135 L 100 135 L 115 120 L 205 120 L 220 135 L 230 135 Q 250 135 250 115 L 250 100 Q 250 75 230 75 Z" fill="#263238"/>
      <circle cx="103" cy="100" r="10" fill="#4fc3f7"/>
      <circle cx="217" cy="100" r="10" fill="#e91e63"/>
      <rect x="150" y="95" width="20" height="4" rx="1" fill="#fff"/>
      <rect x="158" y="87" width="4" height="20" rx="1" fill="#fff"/>
    </g>
    <g fill="#00e5ff" opacity="0.7">
      <rect x="40" y="40" width="6" height="6"/>
      <rect x="280" y="50" width="6" height="6"/>
      <rect x="50" y="145" width="6" height="6"/>
      <rect x="265" y="140" width="6" height="6"/>
    </g>`,
  ),

  ogrod: makeSvg(
    'ogrod',
    `${radialBg('ogrod', '#a5d6a7', '#1b5e20', '30%', '20%')}
    <g>
      <rect x="155" y="105" width="10" height="40" fill="#5d4037"/>
      <g filter="url(#glow-ogrod)">
        <circle cx="145" cy="90" r="22" fill="#66bb6a"/>
        <circle cx="175" cy="85" r="25" fill="#4caf50"/>
        <circle cx="160" cy="65" r="22" fill="#81c784"/>
        <circle cx="180" cy="105" r="18" fill="#388e3c"/>
        <circle cx="140" cy="110" r="18" fill="#43a047"/>
      </g>
    </g>
    <path d="M0 145 Q 80 140 160 145 T 320 145 L 320 180 L 0 180 Z" fill="#4e342e" opacity="0.8"/>`,
  ),

  kapiel: makeSvg(
    'kapiel',
    `${radialBg('kapiel', '#4fc3f7', '#01579b', '50%', '60%')}
    <g>
      <rect x="75" y="85" width="170" height="50" rx="22" fill="#fff"/>
      <rect x="77" y="87" width="166" height="25" rx="20" fill="#81d4fa"/>
      <g filter="url(#glow-kapiel)" fill="#fff" opacity="0.85">
        <circle cx="115" cy="80" r="10"/>
        <circle cx="145" cy="72" r="7"/>
        <circle cx="180" cy="78" r="12"/>
        <circle cx="210" cy="70" r="8"/>
        <circle cx="230" cy="85" r="6"/>
        <circle cx="100" cy="68" r="5"/>
      </g>
    </g>`,
  ),

  muzyka: makeSvg(
    'muzyka',
    `${radialBg('muzyka', '#ec407a', '#4a148c', '30%', '30%')}
    <g filter="url(#glow-muzyka)" fill="#fff">
      <rect x="125" y="55" width="8" height="70" rx="2"/>
      <rect x="195" y="45" width="8" height="70" rx="2"/>
      <rect x="125" y="55" width="80" height="8" rx="2"/>
      <ellipse cx="115" cy="127" rx="15" ry="10"/>
      <ellipse cx="185" cy="117" rx="15" ry="10"/>
    </g>`,
  ),

  kawa: makeSvg(
    'kawa',
    `${radialBg('kawa', '#a1887f', '#3e2723', '50%', '60%')}
    <g>
      <path d="M105 85 L225 85 L215 140 Q 215 150 205 150 L 125 150 Q 115 150 115 140 Z" fill="#fff" stroke="#6d4c41" stroke-width="2"/>
      <path d="M225 95 Q 255 100 255 115 Q 255 130 225 130" fill="none" stroke="#6d4c41" stroke-width="3"/>
      <rect x="115" y="95" width="100" height="22" fill="#4e342e"/>
    </g>
    <g filter="url(#glow-kawa)" fill="#fff" opacity="0.55">
      <path d="M135 80 Q 130 65 140 50 Q 148 65 140 80 Z"/>
      <path d="M160 80 Q 153 60 165 43 Q 175 60 168 80 Z"/>
      <path d="M190 80 Q 185 65 195 50 Q 203 65 195 80 Z"/>
    </g>`,
  ),

  bezpieczenstwo: makeSvg(
    'bezpieczenstwo',
    `${radialBg('bezpieczenstwo', '#43a047', '#0f2e14', '50%', '40%')}
    <g filter="url(#glow-bezpieczenstwo)">
      <path d="M160 40 L210 60 L210 100 Q 210 135 160 150 Q 110 135 110 100 L 110 60 Z" fill="#fff"/>
    </g>
    <path d="M160 60 L190 72 L190 100 Q 190 125 160 138 Q 130 125 130 100 L 130 72 Z" fill="#388e3c"/>
    <g fill="#fff">
      <rect x="152" y="92" width="16" height="22" rx="2"/>
      <path d="M155 92 L 155 84 Q 155 76 160 76 Q 165 76 165 84 L 165 92 Z" fill="none" stroke="#fff" stroke-width="3"/>
    </g>`,
  ),
};

export const SCENE_PRESETS: ScenePreset[] = [
  { id: 'jasne', label: 'Jasne', svg: SCENES.jasne },
  { id: 'poranek', label: 'Poranek', svg: SCENES.poranek },
  { id: 'kawa', label: 'Kawa', svg: SCENES.kawa },
  { id: 'praca', label: 'Praca', svg: SCENES.praca },
  { id: 'nauka', label: 'Nauka', svg: SCENES.nauka },
  { id: 'czytanie', label: 'Czytanie', svg: SCENES.czytanie },
  { id: 'gotowanie', label: 'Gotowanie', svg: SCENES.gotowanie },
  { id: 'relaks', label: 'Relaks', svg: SCENES.relaks },
  { id: 'medytacja', label: 'Medytacja', svg: SCENES.medytacja },
  { id: 'muzyka', label: 'Muzyka', svg: SCENES.muzyka },
  { id: 'tv', label: 'TV', svg: SCENES.tv },
  { id: 'kino', label: 'Kino', svg: SCENES.kino },
  { id: 'gaming', label: 'Gaming', svg: SCENES.gaming },
  { id: 'sport', label: 'Sport', svg: SCENES.sport },
  { id: 'goscie', label: 'Goście', svg: SCENES.goscie },
  { id: 'impreza', label: 'Impreza', svg: SCENES.impreza },
  { id: 'disco', label: 'Disco', svg: SCENES.disco },
  { id: 'romantyczne', label: 'Romantyczne', svg: SCENES.romantyczne },
  { id: 'kapiel', label: 'Kąpiel', svg: SCENES.kapiel },
  { id: 'ogrod', label: 'Ogród', svg: SCENES.ogrod },
  { id: 'wieczor', label: 'Wieczór', svg: SCENES.wieczor },
  { id: 'usypianie', label: 'Usypianie', svg: SCENES.usypianie },
  { id: 'noc', label: 'Noc', svg: SCENES.noc },
  { id: 'bezpieczenstwo', label: 'Bezpieczeństwo', svg: SCENES.bezpieczenstwo },
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
