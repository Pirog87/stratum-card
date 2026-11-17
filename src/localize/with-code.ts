// Fragmenty kodu w tekstach słownika: `<config/www>` → `<code>config/www</code>`.
//
// Podpowiedzi edytora mieszają zdania z nazwami plików i kluczami YAML.
// Słownik trzyma je jako jeden napis (tłumacz widzi całe zdanie), a znaczniki
// `<…>` zamieniamy tu na węzły Lita. Bez innerHTML/unsafeHTML: dzielimy napis
// i każdy kawałek idzie do szablonu jako zwykły tekst.

import { html, type TemplateResult } from 'lit';

export function withCode(text: string): Array<string | TemplateResult> {
  return text
    .split(/<([^>]+)>/)
    .map((part, i) => (i % 2 === 1 ? html`<code>${part}</code>` : part));
}
