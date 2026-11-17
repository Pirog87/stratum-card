import { describe, expect, it } from 'vitest';
import {
  HACS_PHOTO_BASE,
  cssImageLayers,
  photoBaseFromModuleUrl,
  scenePhotoUrls,
} from '../src/scene-photo-url.js';
import { resolveSceneBackground, resolveSceneImage } from '../src/scene-presets.js';

describe('photoBaseFromModuleUrl', () => {
  it('HACS: ta sama względna ścieżka co przed zmianą (query obcięte)', () => {
    expect(
      photoBaseFromModuleUrl('https://ha.example/hacsfiles/stratum-card/stratum-card.js?hacstag=123'),
    ).toBe(HACS_PHOTO_BASE);
  });

  it('instalacja ręczna /local/: katalog bundla', () => {
    expect(photoBaseFromModuleUrl('http://ha.local:8123/local/stratum-card.js?v=2')).toBe(
      'http://ha.local:8123/local/',
    );
  });

  it('podkatalog w www i symlink: katalog bundla', () => {
    expect(photoBaseFromModuleUrl('https://x.ui.nabu.casa/local/karty/stratum/stratum-card.js')).toBe(
      'https://x.ui.nabu.casa/local/karty/stratum/',
    );
  });

  it('brak/nie-http URL-a → deterministycznie HACS', () => {
    expect(photoBaseFromModuleUrl(undefined)).toBe(HACS_PHOTO_BASE);
    expect(photoBaseFromModuleUrl('')).toBe(HACS_PHOTO_BASE);
    expect(photoBaseFromModuleUrl('file:///home/u/stratum-card/src/scene-presets.ts')).toBe(
      HACS_PHOTO_BASE,
    );
    expect(photoBaseFromModuleUrl('blob:https://ha/1234-5678')).toBe(HACS_PHOTO_BASE);
    expect(photoBaseFromModuleUrl('nie url')).toBe(HACS_PHOTO_BASE);
  });
});

describe('scenePhotoUrls', () => {
  it('obok bundla, potem HACS', () => {
    expect(scenePhotoUrls('noc', 'http://ha/local/')).toEqual([
      'http://ha/local/sceny-noc.webp',
      '/hacsfiles/stratum-card/sceny-noc.webp',
    ]);
  });

  it('bez duplikatu, gdy bundle jest w HACS', () => {
    expect(scenePhotoUrls('noc', HACS_PHOTO_BASE)).toEqual([
      '/hacsfiles/stratum-card/sceny-noc.webp',
    ]);
  });
});

describe('cssImageLayers', () => {
  it('warstwy po przecinku, cudzysłów zakodowany', () => {
    expect(cssImageLayers(['/a.webp', '/b"c.webp'])).toBe('url("/a.webp"), url("/b%22c.webp")');
  });
});

describe('resolveSceneBackground (Vitest = file:// → baza HACS)', () => {
  it('preset ze zdjęciem i zachowanym SVG: zdjęcie, a pod nim SVG', () => {
    const bg = resolveSceneBackground('stratum:jasne')!;
    expect(bg.startsWith('url("/hacsfiles/stratum-card/sceny-jasne.webp"), url("data:image/svg+xml;utf8,')).toBe(true);
  });

  it('preset ze zdjęciem bez SVG: jedna warstwa', () => {
    expect(resolveSceneBackground('stratum:kinkiet-cieply')).toBe(
      'url("/hacsfiles/stratum-card/sceny-kinkiet-cieply.webp")',
    );
  });

  it('preset tylko z SVG: data URI', () => {
    expect(resolveSceneBackground('stratum:praca')).toMatch(/^url\("data:image\/svg\+xml;utf8,[^"]+"\)$/);
  });

  it('własny URL: jedna warstwa, bez zmian', () => {
    expect(resolveSceneBackground('/local/salon.jpg')).toBe('url("/local/salon.jpg")');
  });

  it('nieznany preset i pusta wartość → undefined', () => {
    expect(resolveSceneBackground('stratum:nie-ma-takiej')).toBeUndefined();
    expect(resolveSceneBackground(undefined)).toBeUndefined();
    expect(resolveSceneBackground('')).toBeUndefined();
  });

  it('resolveSceneImage nadal zwraca pojedynczy adres', () => {
    expect(resolveSceneImage('stratum:noc')).toBe('/hacsfiles/stratum-card/sceny-noc.webp');
  });
});
