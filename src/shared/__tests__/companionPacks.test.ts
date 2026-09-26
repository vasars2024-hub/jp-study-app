/**
 * Sprite-pack import rules: what a pack may contain (zip-slip, limits, real
 * image bytes) and how its frames map onto the engine's motions.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPANION_PACK_LIMITS,
  COMPANION_PACK_MOTIONS,
  REQUIRED_STANDARD_FRAMES,
  STANDARD_SHIMEJI_SEQUENCES,
  buildPackSequences,
  imageProblem,
  isSafeCompanionPackId,
  isSafeFrameName,
  isUnsafeEntryPath,
  parseCompanionPackFrameUrl,
  parseCompanionPackManifest,
  planCompanionPackImport,
  sequencesFromNamedFrames,
  sequencesFromShimejiActions,
  sniffImage,
  storedFrameName,
  type PackSourceEntry,
} from '../companionPacks';

/** A minimal PNG header claiming `w`×`h` — enough for the sniffer. */
function pngHeader(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

const shimejiEntries = (prefix = 'img/'): PackSourceEntry[] =>
  REQUIRED_STANDARD_FRAMES.map((f) => ({ path: `${prefix}${f}`, size: 4000 }));

describe('zip-slip and path safety', () => {
  it.each(['../evil.png', 'img/../../evil.png', '/etc/passwd', 'C:/Windows/evil.png', 'c:evil.png', '\\\\server\\share\\x.png', 'a\0b.png'])(
    'refuses %s',
    (p) => {
      expect(isUnsafeEntryPath(p)).toBe(true);
    },
  );

  it('accepts ordinary relative paths', () => {
    expect(isUnsafeEntryPath('img/Beni/shime1.png')).toBe(false);
    expect(isUnsafeEntryPath('conf/actions.xml')).toBe(false);
  });

  it('refuses the whole import when any entry escapes, rather than importing the rest', () => {
    const plan = planCompanionPackImport([...shimejiEntries(), { path: '../../AppData/evil.png', size: 10 }], 'x');
    expect(plan).toEqual({ ok: false, error: 'not-a-pack' });
  });

  it('stores frames under a fresh, separator-free name', () => {
    expect(storedFrameName('img/Sub Dir/Shime1.PNG')).toBe('shime1.png');
    expect(storedFrameName('walk (2).png')).toBe('walk-2.png');
    expect(storedFrameName('evil.exe')).toBeNull();
    expect(storedFrameName('.png')).toBeNull();
    expect(isSafeFrameName('../shime1.png')).toBe(false);
    expect(isSafeCompanionPackId('..')).toBe(false);
    expect(isSafeCompanionPackId('beni-1a2b3c4d')).toBe(true);
  });

  it('parses only well-formed pack frame URLs', () => {
    expect(parseCompanionPackFrameUrl('localfile://pet/beni-1a2b3c4d/shime1.png')).toEqual({
      packId: 'beni-1a2b3c4d',
      frame: 'shime1.png',
    });
    expect(parseCompanionPackFrameUrl('localfile://pet/beni-1a2b3c4d/%2e%2e%2fmain.json')).toBeNull();
    expect(parseCompanionPackFrameUrl('localfile://pet/../x/shime1.png')).toBeNull();
    expect(parseCompanionPackFrameUrl('localfile://wall/abc')).toBeNull();
  });
});

describe('limits', () => {
  it('refuses an archive with too many entries', () => {
    const many = Array.from({ length: COMPANION_PACK_LIMITS.maxEntries + 1 }, (_, i) => ({ path: `img/f${i}.png`, size: 1 }));
    expect(planCompanionPackImport(many, 'x')).toEqual({ ok: false, error: 'too-many-files' });
  });

  it('skips an oversize image but keeps the pack', () => {
    const plan = planCompanionPackImport(
      [...shimejiEntries(), { path: 'img/shime40.png', size: COMPANION_PACK_LIMITS.maxFileBytes + 1 }],
      'x',
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.skipped).toBe(1);
      expect(plan.packs[0].frames.some((f) => f.stored === 'shime40.png')).toBe(false);
    }
  });

  it('refuses a pack whose images together exceed the total budget', () => {
    const big = Array.from({ length: 40 }, (_, i) => ({ path: `img/shime${i + 1}.png`, size: 1_900_000 }));
    expect(planCompanionPackImport(big, 'x')).toEqual({ ok: false, error: 'too-large' });
  });

  it('caps frames per pack', () => {
    const n = COMPANION_PACK_LIMITS.maxFramesPerPack + 10;
    const plan = planCompanionPackImport(
      Array.from({ length: n }, (_, i) => ({ path: `img/shime${i + 1}.png`, size: 10 })),
      'x',
    );
    expect(plan.ok && plan.packs[0].frames.length).toBe(COMPANION_PACK_LIMITS.maxFramesPerPack);
  });

  it('checks the bytes, not the extension', () => {
    expect(imageProblem(pngHeader(128, 128), 'shime1.png')).toBeNull();
    expect(imageProblem(new TextEncoder().encode('MZ not a png at all, really'), 'shime1.png')).toBe('not-image');
    expect(imageProblem(pngHeader(4096, 128), 'shime1.png')).toBe('too-large');
    expect(imageProblem(pngHeader(128, 128), 'shime1.gif')).toBe('not-image');
    expect(sniffImage(pngHeader(64, 32))).toEqual({ type: 'png', width: 64, height: 32 });
  });

  it('reports a folder with no usable frames', () => {
    expect(planCompanionPackImport([{ path: 'readme.txt', size: 10 }, { path: 'photo.png', size: 10 }], 'x')).toEqual({
      ok: false,
      error: 'no-frames',
    });
  });
});

describe('planning', () => {
  it('imports every character of a Shimeji-ee bundle and finds the shared actions.xml', () => {
    const plan = planCompanionPackImport(
      [
        ...shimejiEntries('Bundle/img/Alpha/'),
        ...shimejiEntries('Bundle/img/Bravo/'),
        { path: 'Bundle/conf/actions.xml', size: 900 },
        { path: '__MACOSX/Bundle/img/Alpha/._shime1.png', size: 10 },
      ],
      'Bundle',
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.packs.map((p) => p.name)).toEqual(['Alpha', 'Bravo']);
    expect(plan.packs.every((p) => p.actionsEntry === 'Bundle/conf/actions.xml')).toBe(true);
  });

  it('names a single img/ pack after its parent folder', () => {
    const plan = planCompanionPackImport([...shimejiEntries('Kitsune/img/'), { path: 'Kitsune/conf/actions.xml', size: 5 }], 'z');
    expect(plan.ok && plan.packs[0].name).toBe('Kitsune');
    expect(plan.ok && plan.packs[0].actionsEntry).toBe('Kitsune/conf/actions.xml');
  });
});

describe('frame mapping', () => {
  it('a classic Shimeji set fills every motion from the standard map', () => {
    const built = buildPackSequences([...REQUIRED_STANDARD_FRAMES]);
    expect(built?.source).toBe('shimeji');
    expect(built?.sequences).toEqual(STANDARD_SHIMEJI_SEQUENCES);
  });

  it('reads actions.xml poses, ignores actions the engine does not use, and falls back for the rest', () => {
    const xml = `
      <Mascot xmlns="http://www.group-finity.com/Mascot">
        <ActionList>
          <Action Name="Stand" Type="Stay" BorderType="Floor"><Animation><Pose Image="/shime1.png" ImageAnchor="64,128" Velocity="0,0" Duration="250"/></Animation></Action>
          <Action Name="Walk" Type="Move" BorderType="Floor"><Animation>
            <Pose Image="/shime1.png" Velocity="-2,0" Duration="6"/><Pose Image="/shime2.png" Velocity="-2,0" Duration="6"/>
          </Animation></Action>
          <Action Name="ThrowIE" Type="Embedded"><Animation><Pose Image="/shime37.png"/></Animation></Action>
          <Action Name="Pinched" Type="Embedded"><Animation><Pose Image="/shime9.png"/></Animation></Action>
        </ActionList>
      </Mascot>`;
    expect(sequencesFromShimejiActions(xml)).toEqual({
      stand: ['shime1.png'],
      walk: ['shime1.png', 'shime2.png'],
      drag: ['shime9.png'],
    });
    // Only shime1, 2 and 9 exist: no standard frame fills sit/wall/…, so they borrow.
    const built = buildPackSequences(['shime1.png', 'shime2.png', 'shime9.png', 'shime37.png'], { actionsXml: xml });
    expect(built?.sequences.walk).toEqual(['shime1.png', 'shime2.png']);
    expect(built?.sequences.drag).toEqual(['shime9.png']);
    expect(built?.sequences.sit).toEqual(['shime1.png']);
    expect(built?.sequences.ceiling).toEqual(['shime1.png', 'shime2.png']);
    expect(built?.sequences.fall).toEqual(['shime9.png']);
    for (const m of COMPANION_PACK_MOTIONS) expect(built?.sequences[m].length).toBeGreaterThan(0);
  });

  it('maps a plain folder of named frames, ordered by number', () => {
    const frames = ['walk-2.png', 'walk-1.png', 'stand.png', 'sleep.png', 'cheer1.png', 'cheer2.png', 'hat.png'];
    expect(sequencesFromNamedFrames(frames)).toEqual({
      stand: ['stand.png'],
      walk: ['walk-1.png', 'walk-2.png'],
      sit: ['sleep.png'],
      celebrate: ['cheer1.png', 'cheer2.png'],
    });
    const built = buildPackSequences(frames);
    expect(built?.source).toBe('frames');
    expect(built?.sequences.wall).toEqual(['walk-1.png', 'walk-2.png']);
    expect(built?.sequences.drag).toEqual(['stand.png']);
  });

  it('a manifest that names missing frames is repaired, one with no frames is refused', () => {
    const m = parseCompanionPackManifest({
      version: 1,
      id: 'pack-1a2b3c4d',
      name: '  My\u0000 pet  ',
      source: 'frames',
      frames: ['stand.png', '../evil.png'],
      sequences: { stand: ['stand.png', 'gone.png'] },
      importedAt: 1,
    });
    expect(m?.frames).toEqual(['stand.png']);
    expect(m?.name).toBe('My pet');
    expect(m?.sequences.walk).toEqual(['stand.png']);
    expect(parseCompanionPackManifest({ version: 1, id: 'pack-1a2b3c4d', frames: [] })).toBeNull();
  });
});
