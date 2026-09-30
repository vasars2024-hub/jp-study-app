// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NOSTALGIC_WALLPAPER_ID,
  buildNostalgicDefaultRule,
  buildNostalgicWallpaperPlaylist,
  NOSTALGIC_WALLPAPER_PACK,
  NOSTALGIC_WALLPAPER_PACK_ID,
  NOSTALGIC_WALLPAPERS,
} from '../environment/nostalgicWallpaperPack';
import {
  getWallpaper,
  listWallpaperPacks,
  listWallpapers,
} from '../environment/wallpaperFramework';

beforeAll(() => {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
  });
});

describe('default nostalgic wallpaper pack', () => {
  it('registers one deterministic offline pack with five unique static scenes', () => {
    const ids = NOSTALGIC_WALLPAPERS.map((wallpaper) => wallpaper.id);

    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(DEFAULT_NOSTALGIC_WALLPAPER_ID);
    expect(NOSTALGIC_WALLPAPER_PACK.wallpaperIds).toEqual(ids);
    expect(listWallpaperPacks()).toContainEqual(NOSTALGIC_WALLPAPER_PACK);
    expect(listWallpapers({ packId: NOSTALGIC_WALLPAPER_PACK_ID }).map((wallpaper) => wallpaper.id))
      .toEqual(ids);
    expect(NOSTALGIC_WALLPAPERS.every((wallpaper) => wallpaper.kind === 'static')).toBe(true);
  });

  it('uses bundled SVG URLs over deterministic CSS fallbacks without remote URLs', () => {
    for (const wallpaper of NOSTALGIC_WALLPAPERS) {
      expect(wallpaper.css).toMatch(/^url\(".+\.svg"\), linear-gradient\(/);
      expect(wallpaper.css).not.toMatch(/https?:\/\//);
      expect(wallpaper.thumbnail).toMatch(/\.svg$/);
      expect(getWallpaper(wallpaper.id)?.css).toBe(wallpaper.css);
    }
  });

  it('binds the pack to Secret Aero and selects the hillside scene by default', async () => {
    const { FRUTIGER_AERO_THEME } = await import('../theme/frutiger-aero');
    const playlist = buildNostalgicWallpaperPlaylist();
    const rule = buildNostalgicDefaultRule();

    expect(FRUTIGER_AERO_THEME.assetPack?.wallpapers).toBe(NOSTALGIC_WALLPAPER_PACK_ID);
    expect(playlist.items.map((item) => item.ref)).toEqual(
      NOSTALGIC_WALLPAPERS.map((wallpaper) => wallpaper.id),
    );
    expect(playlist.items.every((item) => item.kind === 'preset')).toBe(true);
    expect(rule).toMatchObject({
      itemId: `secret-${DEFAULT_NOSTALGIC_WALLPAPER_ID}`,
      priority: 100,
    });
  });
});
