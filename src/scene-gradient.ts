// Czyste helpery gradientów scen (bez zależności od Lit/hass) —
// wydzielone z stratum-scene-bar, żeby dały się testować w Vitest.
//
// tone(): nasycenie w górę, jasność stała (ciemność sceny pokazuje
// winieta na kaflu). buildGradient(): style mesh/linear/glow/horizon.

/** Kolory sceny + uśredniona jasność (0–1) do winiety. */
export interface SceneColors {
  colors: string[];
  bri: number;
}

export type SceneGradientStyle = 'mesh' | 'linear' | 'glow' | 'horizon';

export function scaleRgb(rgb: string, factor: number): string {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb;
  const f = (v: string): number => Math.round(parseInt(v, 10) * factor);
  return `rgb(${f(m[1]!)}, ${f(m[2]!)}, ${f(m[3]!)})`;
}

/**
 * Toning koloru sceny (przez HSL) — kafle mają świecić jak w galerii Hue:
 * - nasycenie ×1.35 z podłogą 0.3 i sufitem 0.85 (ciepłe biele → złoto,
 *   bez neonów),
 * - jasność sceny NIE dotyka kolorów W OGÓLE (wariant A z makiety) —
 *   stała podłoga L 0.55, sufit 0.8. Ciemność sceny pokazuje winieta
 *   (inset shadow na kaflu), nie kolory.
 */
export function tone(rgb: string): string {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb;
  const r = parseInt(m[1]!, 10) / 255;
  const g = parseInt(m[2]!, 10) / 255;
  const b = parseInt(m[3]!, 10) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  s = Math.min(0.85, Math.max(0.3, s * 1.35));
  l = Math.min(0.8, Math.max(l, 0.55));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const to255 = (v: number): number => Math.round(v * 255);
  return `rgb(${to255(hue(h + 1 / 3))}, ${to255(hue(h))}, ${to255(hue(h - 1 / 3))})`;
}

export function luminance(rgb: string): number {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return 0;
  return (
    0.2126 * parseInt(m[1]!, 10) +
    0.7152 * parseInt(m[2]!, 10) +
    0.0722 * parseInt(m[3]!, 10)
  );
}

/** Deterministyczny seed z entity_id — sąsiednie kafle różnią się kompozycją. */
export function seedOf(entityId: string): number {
  let h = 0;
  for (let i = 0; i < entityId.length; i++) {
    h = (h * 31 + entityId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Buduje CSS background z kolorów sceny wg wybranego stylu. */
export function buildGradient(
  style: SceneGradientStyle,
  data: SceneColors,
  entityId: string,
): string {
  // Toning: nasycenie w górę, jasność stała — ciemność sceny pokazuje
  // winieta na kaflu, nie kolory (patrz komentarz przy tone()).
  const scaled = data.colors.slice(0, 4).map((c) => tone(c));
  const byLum = [...scaled].sort((a, b) => luminance(b) - luminance(a));
  const darkest = byLum[byLum.length - 1]!;

  if (style === 'linear') {
    if (scaled.length === 1) {
      return `linear-gradient(135deg, ${scaled[0]}, ${scaleRgb(scaled[0]!, 0.55)})`;
    }
    return `linear-gradient(135deg, ${scaled.join(', ')})`;
  }

  if (style === 'glow') {
    // Najjaśniejszy kolor świeci z lewego dołu jak lampa.
    const stops =
      byLum.length === 1
        ? `${byLum[0]} 0%, ${scaleRgb(byLum[0]!, 0.3)} 100%`
        : `${byLum[0]} 0%, ${byLum.slice(1).map((c, i) => `${c} ${Math.round(((i + 1) / byLum.length) * 70)}%`).join(', ')}, ${scaleRgb(darkest, 0.3)} 100%`;
    return `radial-gradient(120% 150% at 30% 105%, ${stops})`;
  }

  if (style === 'horizon') {
    // Pionowo: najjaśniejszy u góry, najciemniejszy przy ziemi.
    const stops = [...byLum, scaleRgb(darkest, 0.55)];
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
  }

  // mesh (default) — rozmyte plamy radialne jak w Hue. Podkładem jest
  // pełny gradient z kolorów sceny (nie ciemna baza — inaczej między
  // plamami prześwituje czerń i kafel wygląda czarniawo nawet przy 100%
  // jasności); plamy tylko wzbogacają kompozycję.
  const positions = ['12% 12%', '88% 85%', '85% 20%', '15% 80%'];
  const offset = seedOf(entityId) % positions.length;
  const layers = scaled.map((c, i) => {
    const pos = positions[(i + offset) % positions.length]!;
    return `radial-gradient(100% 130% at ${pos}, ${c} 0%, transparent 75%)`;
  });
  const base =
    scaled.length === 1
      ? `linear-gradient(135deg, ${scaled[0]}, ${scaleRgb(scaled[0]!, 0.7)})`
      : `linear-gradient(135deg, ${[...scaled].reverse().join(', ')})`;
  return `${layers.join(', ')}, ${base}`;
}

/** HSL → "rgb(r, g, b)" (format zgodny z lightColorOf/tone). */
export function hslToRgbStr(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number): number => Math.round((v + m) * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}
