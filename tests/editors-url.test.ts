import { describe, expect, it } from 'vitest';
import {
  EDITORS_FILE,
  LOAD_TIMEOUT_MS,
  RETRY_COOLDOWN_MS,
  editorsUrl,
  editorsVerdict,
  loadStep,
  mayRetry,
} from '../src/editors-url.js';
import { HACS_PHOTO_BASE } from '../src/scene-photo-url.js';

const HACS = 'https://ha.example/hacsfiles/stratum-card/stratum-card.js?hacstag=123';

describe('editorsUrl', () => {
  it('HACS: hacstag zostaje, dochodzi sv=<wersja>', () => {
    expect(editorsUrl(HACS, '1.110.0')).toBe(
      'https://ha.example/hacsfiles/stratum-card/stratum-card-editors.js?hacstag=123&sv=1.110.0',
    );
  });

  it('/local/ bez query', () => {
    expect(editorsUrl('http://ha.local:8123/local/stratum-card.js', '1.110.0')).toBe(
      'http://ha.local:8123/local/stratum-card-editors.js?sv=1.110.0',
    );
  });

  it('?v=1 użytkownika zostaje nietknięte', () => {
    expect(editorsUrl('http://ha.local/local/stratum-card.js?v=1', '1.110.0')).toBe(
      'http://ha.local/local/stratum-card-editors.js?v=1&sv=1.110.0',
    );
  });

  it('istniejące sv w adresie karty jest nadpisywane, nie dublowane', () => {
    const url = editorsUrl('http://ha/local/stratum-card.js?sv=stare&a=1', '1.110.0');
    expect(new URL(url).searchParams.getAll('sv')).toEqual(['1.110.0']);
    expect(new URL(url).searchParams.get('a')).toBe('1');
  });

  it('podkatalog i przemianowany plik karty — ten sam katalog, nazwa edytorów', () => {
    expect(editorsUrl('http://ha/local/karty/stratum/stratum-card-dev.js', 'x')).toBe(
      'http://ha/local/karty/stratum/stratum-card-editors.js?sv=x',
    );
  });

  it('hash jest obcinany', () => {
    expect(editorsUrl('http://ha/local/stratum-card.js?v=2#frag', '1.0.0')).toBe(
      'http://ha/local/stratum-card-editors.js?v=2&sv=1.0.0',
    );
  });

  it('retry=n tylko przy ponownej próbie', () => {
    expect(editorsUrl(HACS, '1.110.0', 0)).not.toContain('retry');
    expect(editorsUrl(HACS, '1.110.0', 2)).toBe(
      'https://ha.example/hacsfiles/stratum-card/stratum-card-editors.js?hacstag=123&sv=1.110.0&retry=2',
    );
  });

  it('https z portem i originem zostaje', () => {
    expect(editorsUrl('https://dom.duckdns.org:8443/hacsfiles/stratum-card/stratum-card.js', 'v')).toBe(
      'https://dom.duckdns.org:8443/hacsfiles/stratum-card/stratum-card-editors.js?sv=v',
    );
  });

  it.each([
    ['undefined', undefined],
    ['file:', 'file:///home/x/dist/stratum-card.js'],
    ['blob:', 'blob:http://ha/123-456'],
    ['data:', 'data:text/javascript,export{}'],
    ['śmieci', 'to nie jest url'],
    ['pusty', ''],
  ])('%s → fallback na katalog HACS', (_name, moduleUrl) => {
    expect(editorsUrl(moduleUrl, '1.110.0')).toBe(`${HACS_PHOTO_BASE}${EDITORS_FILE}?sv=1.110.0`);
  });

  it('fallback HACS też dostaje retry', () => {
    expect(editorsUrl(undefined, '1.0.0', 1)).toBe(`${HACS_PHOTO_BASE}${EDITORS_FILE}?sv=1.0.0&retry=1`);
  });

  it('token dev-buildu jest kodowany w query', () => {
    const url = editorsUrl('http://ha/local/stratum-card.js', '1.110.0-lz9k a+b');
    expect(new URL(url).searchParams.get('sv')).toBe('1.110.0-lz9k a+b');
    expect(url).not.toContain(' ');
  });
});

describe('mayRetry', () => {
  it('pierwsza próba zawsze', () => {
    expect(mayRetry(undefined, 0)).toBe(true);
  });
  it('w trakcie odstępu — nie', () => {
    expect(mayRetry(1000, 1000 + RETRY_COOLDOWN_MS - 1)).toBe(false);
  });
  it('dokładnie po odstępie — tak', () => {
    expect(mayRetry(1000, 1000 + RETRY_COOLDOWN_MS)).toBe(true);
  });
  it('odstęp 30 s, timeout krótszy od odstępu', () => {
    expect(RETRY_COOLDOWN_MS).toBe(30_000);
    expect(LOAD_TIMEOUT_MS).toBeLessThan(RETRY_COOLDOWN_MS);
  });
});

describe('loadStep', () => {
  it('pierwsze wywołanie startuje import', () => {
    expect(loadStep('none', undefined, 0)).toBe('start');
  });
  it('import w toku — czekamy na tę samą próbę (jedno żądanie)', () => {
    expect(loadStep('loading', undefined, 5)).toBe('await');
  });
  it('po timeoucie nie czekamy drugi raz na wiszący import', () => {
    // Timeout zapisuje failedAt — kolejne wywołanie w odstępie wraca od razu.
    const failedAt = 20_000;
    expect(loadStep('failed', failedAt, failedAt + 3_000)).toBe('skip');
  });
  it('po odstępie od timeoutu albo błędu — nowa próba', () => {
    expect(loadStep('failed', 20_000, 20_000 + RETRY_COOLDOWN_MS)).toBe('start');
  });
  it('plik wykonany, a edytora brak — nie ponawiamy', () => {
    expect(loadStep('loaded', undefined, 1e9)).toBe('skip');
  });
});

describe('editorsVerdict', () => {
  it('ok, gdy edytor zdefiniowany i wersja zgodna', () => {
    expect(editorsVerdict(true, '1.110.0', '1.110.0')).toBe('ok');
  });
  it('missing, gdy edytora nie ma', () => {
    expect(editorsVerdict(false, '1.110.0', '1.110.0')).toBe('missing');
  });
  it('mismatch, gdy edytory z innej wersji', () => {
    expect(editorsVerdict(true, '1.109.3', '1.110.0')).toBe('mismatch');
  });
  it('mismatch, gdy ta sama wersja, ale inny build', () => {
    expect(editorsVerdict(true, '1.110.0.aaaaaaaa', '1.110.0.bbbbbbbb')).toBe('mismatch');
  });
  it('mismatch, gdy brak znacznika albo nie-string', () => {
    expect(editorsVerdict(true, undefined, '1.110.0')).toBe('mismatch');
    expect(editorsVerdict(true, 1110, '1.110.0')).toBe('mismatch');
  });
});
