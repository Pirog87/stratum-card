// Wybór atramentu (jasny / ciemny) dla napisu na półprzezroczystym pasku.
//
// Pasek jasności kafla grupy świateł (.glight-fill) jest kryty w 80%, a pod
// nim leży powierzchnia kafla. Atrament wybierany z SUROWEGO koloru żarówki
// (stripeInk, próg luminancji 0.3 z nieprzezroczystych pasków belki) mylił
// się w obie strony:
// - jasny motyw: czerwień 255,80,80 ma luminancję 0.276 → biały napis, a na
//   pasku zmieszanym z bielą kafla wychodziło 2,3:1;
// - żarówka bez rgb: kolor paska to token motywu (--stratum-lights), którego
//   JS nie zna — zakładaliśmy żółty i ciemny napis, a na granatowym tokenie
//   wychodziło 2,3:1.
// Dlatego kafel mierzy w przeglądarce kolory, które naprawdę widać (pasek,
// powierzchnia, końce atramentu z tokenów), a tu jest czysta arytmetyka:
// złożenie paska na powierzchni i porównanie kontrastu WCAG obu atramentów.

export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

const clamp255 = (v: number): number => Math.min(255, Math.max(0, v));

/** sRGB z oklab (getComputedStyle oddaje oklab w trakcie tranzycji koloru). */
function oklabToRgb(l: number, a: number, b: number): Rgb {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.abs(v) ** (1 / 2.4) - 0.055;
    return clamp255(c * 255);
  }) as Rgb;
}

/**
 * Kolor CSS w postaci, jaką zwraca getComputedStyle (albo jaką wpisuje się
 * w token): `rgb()/rgba()`, `color(srgb …)`, `oklab()`, `#rgb`/`#rrggbb`.
 * Nieznany zapis → undefined (wołający zostaje przy swoim domyśle).
 */
export function parseCssColor(raw: string | undefined | null): Rgba | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  const num = (v: string, scale = 1): number =>
    v.endsWith('%') ? (parseFloat(v) / 100) * scale : parseFloat(v);
  const alpha = (v: string | undefined): number =>
    v === undefined ? 1 : v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return undefined;
    const p = (i: number): number => parseInt(h.slice(i, i + 2), 16);
    return [p(0), p(2), p(4), h.length === 8 ? p(6) / 255 : 1];
  }
  m = s.match(/^rgba?\(\s*([^,\s/]+)[\s,]+([^,\s/]+)[\s,]+([^,\s/)]+)\s*(?:[,/]\s*([^)\s]+))?\s*\)$/);
  if (m) {
    return [num(m[1]!, 255), num(m[2]!, 255), num(m[3]!, 255), alpha(m[4])];
  }
  m = s.match(/^color\(\s*srgb\s+([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)\s*(?:\/\s*([^)\s]+))?\s*\)$/);
  if (m) {
    return [
      clamp255(num(m[1]!) * 255),
      clamp255(num(m[2]!) * 255),
      clamp255(num(m[3]!) * 255),
      alpha(m[4]),
    ];
  }
  m = s.match(/^oklab\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)\s*(?:\/\s*([^)\s]+))?\s*\)$/);
  if (m) {
    const [r, g, b] = oklabToRgb(num(m[1]!), num(m[2]!, 0.4), num(m[3]!, 0.4));
    return [r, g, b, alpha(m[4])];
  }
  return undefined;
}

/** Kolor `top` (z alfą) położony na nieprzezroczystym `bottom`. */
export function composite(top: Rgba, bottom: Rgb): Rgb {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i]! * a + bottom[i]! * (1 - a)) as Rgb;
}

/** color-mix(in srgb, a pct%, b) bez alfy. */
export function mixRgb(a: Rgb, pct: number, b: Rgb): Rgb {
  const t = pct / 100;
  return [0, 1, 2].map((i) => a[i]! * t + b[i]! * (1 - t)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const ch = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Kontrast WCAG 2.x dwóch nieprzezroczystych kolorów (1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Atrament napisu na pasku: ten z dwóch, który ma wyższy kontrast z paskiem
 * ZŁOŻONYM na powierzchni kafla. Remis → ciemny (domyślny dla żółtego
 * paska, tak jak dotąd).
 */
export function inkForFill(
  fill: Rgba,
  surface: Rgb,
  lightInk: Rgb,
  darkInk: Rgb,
): 'light' | 'dark' {
  const bg = composite(fill, surface);
  return contrastRatio(lightInk, bg) > contrastRatio(darkInk, bg) ? 'light' : 'dark';
}
