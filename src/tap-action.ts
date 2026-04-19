// Wykonanie tap_action zgodnie z konwencją Home Assistant.
//
// Podzbiór akcji: navigate, more-info, url, call-service, none.
// Template-like placeholdery `{area_id}` i `{area_name}` dla navigate/url.

import type { HomeAssistant, TapActionConfig } from './types.js';

export interface TapContext {
  /** Element z którego emitujemy eventy (`hass-more-info` bubbles). */
  source: HTMLElement;
  /** Kontekst tapnięcia — podstawiany do placeholderów. */
  area_id?: string;
  area_name?: string;
}

export async function runTapAction(
  hass: HomeAssistant | undefined,
  action: TapActionConfig | undefined,
  ctx: TapContext,
): Promise<void> {
  if (!action || action.action === 'none') return;

  switch (action.action) {
    case 'navigate': {
      const path = interpolate(action.navigation_path, ctx);
      history.pushState(null, '', path);
      window.dispatchEvent(new Event('location-changed'));
      return;
    }
    case 'more-info': {
      const entity = action.entity;
      if (!entity) return;
      ctx.source.dispatchEvent(
        new CustomEvent('hass-more-info', {
          detail: { entityId: entity },
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }
    case 'url': {
      const url = interpolate(action.url_path, ctx);
      if (action.new_tab === false) window.location.href = url;
      else window.open(url, '_blank', 'noopener');
      return;
    }
    case 'call-service': {
      if (!hass) return;
      const [domain, service] = action.service.split('.');
      if (!domain || !service) return;
      await hass.callService(domain, service, {
        ...(action.service_data ?? {}),
        ...(action.target ?? {}),
      });
      return;
    }
  }
}

function interpolate(template: string, ctx: TapContext): string {
  return template
    .replace(/\{area_id\}/g, ctx.area_id ?? '')
    .replace(/\{area_name\}/g, encodeURIComponent(ctx.area_name ?? ''));
}
