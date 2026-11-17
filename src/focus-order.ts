// Kolejność fokusa przez granice shadow DOM — dla pułapki fokusa popupu.
//
// Popup pokoju to arkusz z przyciskami karty piętra (uchwyt, ×) i z całą
// kartą pokoju w środku, która ma własny shadow root, a w nim kolejne
// (kafle, suwaki, chipy). `querySelectorAll` nie wchodzi do shadow rootów,
// więc „ostatni focusowalny element arkusza" trzeba znaleźć ręcznie: idąc
// po drzewie tak, jak idzie Tab — przez shadow root zamiast dzieci z light
// DOM, a w slocie przez elementy do niego przypisane.
//
// Moduł nie zna DOM-u: dostaje sondę (`FocusProbe`), która mówi, jakie są
// dzieci węzła i czy węzeł przyjmuje Tab. Dzięki temu sam porządek da się
// przetestować w Vitest bez przeglądarki, a sonda DOM-owa w komponencie
// jest krótka i oczywista.

export interface FocusProbe<N> {
  /** Dzieci w kolejności Tab: shadow root zamiast light DOM, slot → przypisane. */
  children(node: N): readonly N[];
  /** Węzeł sam przyjmuje fokus z Tab (tabIndex ≥ 0, widoczny, nie disabled). */
  tabbable(node: N): boolean;
  /**
   * Całe poddrzewo wypada z kolejności (inert, display: none, wartownik
   * pułapki). Sprawdzane przed `tabbable` — element w ukrytym poddrzewie
   * nie przyjmie fokusa, nawet jeśli ma tabindex.
   */
  skip(node: N): boolean;
}

/** Pierwszy węzeł przyjmujący Tab w poddrzewie `root` (bez samego `root`). */
export function firstTabbable<N>(root: N, probe: FocusProbe<N>): N | undefined {
  for (const child of probe.children(root)) {
    if (probe.skip(child)) continue;
    if (probe.tabbable(child)) return child;
    const inner = firstTabbable(child, probe);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

/**
 * Ostatni węzeł przyjmujący Tab w poddrzewie `root` (bez samego `root`).
 * Idziemy od końca, a rodzic przegrywa z własnymi potomkami: w kolejności
 * Tab focusowalny rodzic stoi PRZED swoją treścią, więc ostatnim
 * przystankiem jest najgłębszy ostatni potomek, nie kontener.
 */
export function lastTabbable<N>(root: N, probe: FocusProbe<N>): N | undefined {
  const kids = probe.children(root);
  for (let i = kids.length - 1; i >= 0; i--) {
    const child = kids[i]!;
    if (probe.skip(child)) continue;
    const inner = lastTabbable(child, probe);
    if (inner !== undefined) return inner;
    if (probe.tabbable(child)) return child;
  }
  return undefined;
}
