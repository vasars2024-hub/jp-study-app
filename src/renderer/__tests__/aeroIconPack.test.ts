/**
 * Phase 5 · M7 — the Secret OS icon system.
 *
 * The interesting failures here are not "does it render" but the rules that
 * make the pack a system rather than a pile of SVGs: it must never break a name
 * it does not cover, its status and lifecycle icons must be told apart without
 * colour, and it must disappear cleanly when the theme does.
 *
 * The suite runs in a node environment, so this exercises `resolveIcon` — the
 * pure decision `Icons.tsx` renders from — rather than the DOM.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IconName } from '../components/Icons';
import { AERO_ICON_PACK, AERO_ICON_PACK_ID, registerAeroIconPack } from '../theme/aeroIconPack';
import {
  clearIconPacks,
  getActiveIconPackId,
  registerIconPack,
  resolveGlyph,
  resolveIcon,
  setActiveIconPack,
  subscribeIconPack,
  TILE_MIN_SIZE,
} from '../theme/iconPacks';

beforeEach(() => {
  clearIconPacks();
  registerIconPack(AERO_ICON_PACK);
  setActiveIconPack(AERO_ICON_PACK_ID);
});

afterEach(() => {
  clearIconPacks();
});

const names = Object.keys(AERO_ICON_PACK.glyphs) as IconName[];
const glyph = (n: IconName) => AERO_ICON_PACK.glyphs[n]!;

describe('pack integrity', () => {
  it('covers a meaningful share of the shell, not a token few', () => {
    expect(names.length).toBeGreaterThanOrEqual(40);
  });

  it('every glyph names a family the pack actually defines', () => {
    expect(names.filter((n) => !AERO_ICON_PACK.families[glyph(n).family])).toEqual([]);
  });

  it('every object glyph has a body — a tile draws the plate, an object cannot', () => {
    expect(names.filter((n) => glyph(n).form === 'object' && !glyph(n).body)).toEqual([]);
  });

  it('every path is real path data, so a typo cannot ship as an invisible icon', () => {
    for (const n of names) {
      const g = glyph(n);
      for (const [field, d] of Object.entries({ body: g.body, accent: g.accent, detail: g.detail })) {
        if (d === undefined) continue;
        expect(d, `${n}.${field}`).toMatch(/^M[\s\-\d.]/);
        expect(d.length, `${n}.${field}`).toBeGreaterThan(8);
      }
    }
  });

  it('every family carries its own dark edge, so icons hold an outline on any wallpaper', () => {
    const lum = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    for (const [id, fam] of Object.entries(AERO_ICON_PACK.families)) {
      for (const [slot, value] of Object.entries(fam)) {
        expect(value, `${id}.${slot}`).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(lum(fam.edge), id).toBeLessThan(lum(fam.bottom));
      expect(lum(fam.bottom), id).toBeLessThan(lum(fam.top));
    }
  });

  it('states the artwork is original — the milestone requires the provenance claim', () => {
    expect(AERO_ICON_PACK.provenance).toMatch(/original/i);
  });

  it('leaves inline chrome alone', () => {
    // A glossy amber plate inside a search field is the Phase 4.5 mistake in the
    // other direction. These names must stay monochrome line glyphs.
    for (const n of ['search', 'close', 'plus', 'chevron', 'check', 'refresh', 'edit'] as IconName[]) {
      expect(AERO_ICON_PACK.glyphs[n], n).toBeUndefined();
    }
  });
});

describe('non-colour differentiation', () => {
  const distinctShapes = (group: IconName[]) => {
    const shapes = group.map((n) => glyph(n).shape);
    expect(new Set(shapes).size, shapes.join(',')).toBe(group.length);
  };

  it('the four status icons have four different silhouettes', () => {
    distinctShapes(['info', 'warning', 'error', 'success']);
  });

  it('the five lifecycle icons have five different silhouettes', () => {
    distinctShapes(['power', 'sleep', 'restart', 'logout', 'lock']);
  });

  it('every application shares the one plate silhouette — apps are told apart by glyph', () => {
    const tiles = names.filter((n) => glyph(n).form === 'tile');
    expect(tiles.length).toBeGreaterThan(15);
    expect(new Set(tiles.map((n) => glyph(n).shape))).toEqual(new Set(['plate']));
  });
});

describe('resolution', () => {
  it('resolves an application to its family palette', () => {
    const r = resolveIcon('dictionary', 32);
    expect(r?.glyph.form).toBe('tile');
    expect(r?.family.top).toBe(AERO_ICON_PACK.families.language.top);
  });

  it('falls back to the line glyph for a name the pack does not cover', () => {
    expect(resolveGlyph('search')).toBeNull();
    expect(resolveIcon('search', 32)).toBeNull();
  });

  it('drops an application plate below the shell size threshold', () => {
    // Window chrome renders at 15px; a gradient plate there is mud.
    expect(resolveIcon('dictionary', TILE_MIN_SIZE - 1)).toBeNull();
    expect(resolveIcon('dictionary', TILE_MIN_SIZE)).not.toBeNull();
  });

  it('keeps shell objects dimensional at every size — a folder is a folder at 12px', () => {
    expect(resolveIcon('folder', 12)?.glyph.shape).toBe('folder');
  });

  it('honours `flat` so a caller in inline chrome can opt out', () => {
    expect(resolveIcon('folder', 32, true)).toBeNull();
  });
});

describe('pack activation', () => {
  it('renders base line glyphs when no pack is active', () => {
    setActiveIconPack(null);
    expect(resolveIcon('folder', 32)).toBeNull();
  });

  it('ignores an unknown pack id rather than blanking every icon', () => {
    setActiveIconPack('no-such-pack');
    expect(getActiveIconPackId()).toBeNull();
    expect(resolveIcon('folder', 32)).toBeNull();
  });

  it('notifies subscribers on a real change only', () => {
    let hits = 0;
    const off = subscribeIconPack(() => {
      hits += 1;
    });
    setActiveIconPack(AERO_ICON_PACK_ID); // already active
    expect(hits).toBe(0);
    setActiveIconPack(null);
    expect(hits).toBe(1);
    off();
    setActiveIconPack(AERO_ICON_PACK_ID);
    expect(hits).toBe(1);
  });

  it('registers idempotently', () => {
    registerAeroIconPack();
    registerAeroIconPack();
    setActiveIconPack(AERO_ICON_PACK_ID);
    expect(resolveGlyph('folder')).not.toBeNull();
  });
});

describe('theme wiring', () => {
  it('the Aero theme names this pack, and registering the theme installs it', async () => {
    clearIconPacks();
    const { FRUTIGER_AERO_THEME, registerFrutigerAero } = await import('../theme/frutiger-aero');
    expect(FRUTIGER_AERO_THEME.assetPack?.icons).toBe(AERO_ICON_PACK_ID);
    registerFrutigerAero();
    setActiveIconPack(AERO_ICON_PACK_ID);
    expect(getActiveIconPackId()).toBe(AERO_ICON_PACK_ID);
  });
});
