/**
 * The renderer's pack list: Gum's own characters are complete, the owner's
 * private packs are optional, and a public clone (no private-assets/) still
 * gives every companion a character.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANION_PACK_MOTIONS, REQUIRED_STANDARD_FRAMES, sniffImage } from '../../shared/companionPacks';
import {
  BUILTIN_PACK_IDS,
  buildBuiltinPacks,
  buildPrivatePacks,
  privateDefaultPacks,
} from './shimejiPacks';
import { resolveCompanionPack } from './companionPackChoice';
import { privateImageUrl } from '../privateAssets';
import { defFor, type CompanionTypeId } from './companionCatalog';

const TYPES: CompanionTypeId[] = ['study-buddy', 'critter', 'timekeeper', 'aero-assistant', 'wired-navi'];

const ASSETS = path.resolve(__dirname, '../assets/companions');

describe('built-in characters', () => {
  it.each(BUILTIN_PACK_IDS)('%s ships every frame the engine plays, as real 128px PNGs', (id) => {
    const files = new Set(fs.readdirSync(path.join(ASSETS, id)));
    for (const frame of REQUIRED_STANDARD_FRAMES) {
      expect(files.has(frame), `${id}/${frame}`).toBe(true);
      const img = sniffImage(fs.readFileSync(path.join(ASSETS, id, frame)));
      expect(img).toEqual({ type: 'png', width: 128, height: 128 });
    }
  });

  it('every motion of every built-in pack resolves to its own frames, with no fallback', () => {
    const packs = buildBuiltinPacks();
    expect(packs.map((p) => p.id)).toEqual([...BUILTIN_PACK_IDS]);
    for (const p of packs) {
      for (const m of COMPANION_PACK_MOTIONS) {
        expect(p.frames[m].length, `${p.id}.${m}`).toBeGreaterThan(0);
      }
      // Distinct frames per motion: wall is not a copy of walk, drag not of stand.
      expect(p.frames.wall).not.toEqual(p.frames.walk);
      expect(p.frames.drag).not.toEqual(p.frames.stand);
    }
  });

  it('every companion defaults to a built-in character and the licence is written down', () => {
    for (const type of TYPES) {
      expect(BUILTIN_PACK_IDS).toContain(defFor(type).spritePack);
    }
    expect(defFor('aero-assistant').spritePack).toBe('orbi');
    const notice = fs.readFileSync(path.join(ASSETS, 'NOTICE.md'), 'utf8');
    expect(notice).toMatch(/CC0 1\.0/);
    expect(fs.existsSync(path.join(ASSETS, 'guide-portrait.png'))).toBe(true);
  });
});

describe('private packs (owner-only, git-ignored)', () => {
  it('a public clone has none, and nothing breaks', () => {
    expect(buildPrivatePacks({}, {})).toEqual([]);
    expect(privateDefaultPacks({})).toEqual({});
    expect(privateImageUrl('wired-guide-reference.jpg', {})).toBeNull();
    // With no private default the companion keeps its own character.
    expect(resolveCompanionPack('study-buddy', 'beni', {}, {})).toBe('beni');
    // A private default whose pack is absent is ignored, not followed into nothing.
    expect(resolveCompanionPack('study-buddy', 'beni', {}, { 'study-buddy': 'private-gone' })).toBe('beni');
    // So is a stale user choice.
    expect(resolveCompanionPack('study-buddy', 'beni', { 'study-buddy': 'deleted-1234abcd' }, {})).toBe('beni');
  });

  it('lists a present private folder like a built-in, honouring its sequences.json', () => {
    const glob = Object.fromEntries(
      [...REQUIRED_STANDARD_FRAMES, 'extra-a.png'].map((f) => [`/private-assets/shimeji/my_pack/${f}`, `/url/${f}`]),
    );
    const packs = buildPrivatePacks(glob, {
      '/private-assets/shimeji/my_pack/sequences.json': { celebrate: ['extra-a.png', 'SHIME1.png'] },
    });
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({ id: 'private-my_pack', kind: 'private', name: 'My Pack' });
    expect(packs[0].frames.celebrate).toEqual(['/url/extra-a.png', '/url/shime1.png']);
    expect(packs[0].frames.walk).toEqual(['/url/shime1.png', '/url/shime2.png', '/url/shime1.png', '/url/shime3.png']);
    expect(privateDefaultPacks({ '/private-assets/shimeji/defaults.json': { critter: 'My_Pack' } })).toEqual({
      critter: 'private-my_pack',
    });
    expect(privateImageUrl('Ref.JPG', { '/private-assets/images/ref.jpg': '/u/ref.jpg' })).toBe('/u/ref.jpg');
  });
});
