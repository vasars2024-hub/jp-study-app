/**
 * `subtitleArchive.ts` against real `.7z` files.
 *
 * Every fixture here is BUILT by the same 7-Zip that reads it, in `beforeAll` —
 * a hand-written byte fixture of a solid LZMA2 archive is not something that can
 * be reviewed, and a mock of the decoder would test nothing. The one thing
 * these must never do is assert on a stub: the defect gate 11 measured was that
 * a real release could not be opened at all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  extractSubtitlesFromArchive,
  isExtractableArchive,
  EXTRACTABLE_ARCHIVE_EXT,
} from '../subtitleArchive';

const SUBS = ['.ass', '.srt', '.ssa', '.vtt', '.lrc'];

let dir = '';

/** One `.srt` of `lines` cues, big enough that sizes are not all identical. */
function srt(episode: number, lines: number): string {
  let out = '';
  for (let i = 1; i <= lines; i += 1) {
    out += `${i}\n00:0${i % 9}:00,000 --> 00:0${i % 9}:02,000\n`
      + `エピソード${episode} の字幕 ${i} 行目です。\n\n`;
  }
  return out;
}

/** Packs `dir/<source>` into `dir/<archive>` with the bundled 7-Zip. */
async function pack(source: string, archive: string): Promise<void> {
  const req = createRequire(import.meta.url);
  const factory = req('7z-wasm/7zz.umd.js');
  const wasmBinary = fs.readFileSync(req.resolve('7z-wasm/7zz.wasm'));
  const quiet = (): void => { /* 7-Zip chatter is not a test result */ };
  const sz = await factory({ wasmBinary, print: quiet, printErr: quiet });
  sz.FS.mkdir('/mnt');
  sz.FS.mount(sz.NODEFS, { root: dir }, '/mnt');
  sz.FS.chdir('/mnt');
  sz.callMain(['a', '-t7z', '-mx=1', archive, source]);
}

beforeAll(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jp-subarchive-'));

  // A pack the shape Route A actually meets: episodes numbered in the name,
  // one non-subtitle member, and a nested folder.
  await fsp.mkdir(path.join(dir, 'pack/Subs'), { recursive: true });
  for (const ep of [1, 2, 3]) {
    await fsp.writeFile(path.join(dir, `pack/Subs/Show - ${String(ep).padStart(2, '0')}.srt`), srt(ep, 40));
  }
  await fsp.writeFile(path.join(dir, 'pack/readme.txt'), 'not a subtitle');
  await fsp.writeFile(path.join(dir, 'pack/Subs/install.exe'), 'MZ not a subtitle either');
  await pack('pack', 'pack.7z');

  // A pack whose declared unpacked size is large, for the ceiling.
  await fsp.mkdir(path.join(dir, 'big'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'big/Show - 01.srt'), srt(1, 20_000));
  await pack('big', 'big.7z');
}, 120_000);

afterAll(async () => {
  if (dir) await fsp.rm(dir, { recursive: true, force: true });
});

describe('isExtractableArchive', () => {
  it('accepts the containers 7-Zip is wired for and refuses the rest', () => {
    expect(isExtractableArchive('Detective Conan 0001-0520 (Subs).7z')).toBe(true);
    expect(isExtractableArchive('Subs.ZIP')).toBe(true);
    expect(isExtractableArchive('subs.tar')).toBe(true);
    // The negative half: `noSubtitlesReason` still tells the user to extract
    // these themselves, and that sentence must stay true.
    expect(isExtractableArchive('subs.rar')).toBe(false);
    expect(isExtractableArchive('Show - 01.ass')).toBe(false);
    expect(EXTRACTABLE_ARCHIVE_EXT.has('.rar')).toBe(false);
  });
});

describe('extractSubtitlesFromArchive', () => {
  it('returns every subtitle member of a real .7z as text, with its path', async () => {
    const out = await extractSubtitlesFromArchive(path.join(dir, 'pack.7z'), {
      extensions: SUBS,
      maxUnpackedBytes: 50 * 1024 * 1024,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.files.map((file) => file.name).sort()).toEqual([
      'pack/Subs/Show - 01.srt',
      'pack/Subs/Show - 02.srt',
      'pack/Subs/Show - 03.srt',
    ]);
    // Real decoded text, not a placeholder — and the Japanese survived UTF-8.
    expect(out.files[0].text).toContain('エピソード1 の字幕 1 行目です。');
    expect(out.files[0].text.split('-->').length - 1).toBe(40);
    expect(out.files[0].sizeBytes).toBeGreaterThan(0);
    expect(out.unreadable).toBe(0);
  }, 120_000);

  it('leaves everything that is not a cue format inside the archive', async () => {
    const out = await extractSubtitlesFromArchive(path.join(dir, 'pack.7z'), {
      extensions: SUBS,
      maxUnpackedBytes: 50 * 1024 * 1024,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.files.some((file) => file.name.endsWith('.exe'))).toBe(false);
    expect(out.files.some((file) => file.name.endsWith('.txt'))).toBe(false);
    // Both non-subtitle members were seen and declined, not missed.
    expect(out.skippedNonSubtitle).toBe(2);
  }, 120_000);

  it('CONTROL — widening the allow-list is what would let the .exe out', async () => {
    // The guard above passes trivially if extraction were broken. This proves
    // the two files are in the archive and reachable, and that the ONLY thing
    // keeping them in is the extension allow-list.
    const out = await extractSubtitlesFromArchive(path.join(dir, 'pack.7z'), {
      extensions: [...SUBS, '.exe', '.txt'],
      maxUnpackedBytes: 50 * 1024 * 1024,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.files.some((file) => file.name.endsWith('.exe'))).toBe(true);
    expect(out.files.some((file) => file.name.endsWith('.txt'))).toBe(true);
    expect(out.skippedNonSubtitle).toBe(0);
  }, 120_000);

  it('refuses on the DECLARED unpacked size, before decompressing anything', async () => {
    const out = await extractSubtitlesFromArchive(path.join(dir, 'big.7z'), {
      extensions: SUBS,
      maxUnpackedBytes: 64 * 1024,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/unpack to \d+ MB, over the 0 MB/);
  }, 120_000);

  it('takes the same archive when the ceiling allows it', async () => {
    // The control for the refusal above: same archive, same members, only the
    // ceiling changed — so the refusal is the ceiling and not a broken read.
    const out = await extractSubtitlesFromArchive(path.join(dir, 'big.7z'), {
      extensions: SUBS,
      maxUnpackedBytes: 50 * 1024 * 1024,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.files).toHaveLength(1);
    expect(out.unpackedBytes).toBeGreaterThan(64 * 1024);
  }, 120_000);

  it('reports a missing archive rather than throwing', async () => {
    const out = await extractSubtitlesFromArchive(path.join(dir, 'nope.7z'), {
      extensions: SUBS,
      maxUnpackedBytes: 50 * 1024 * 1024,
    });
    expect(out).toEqual({ ok: false, reason: 'The downloaded archive could not be opened.' });
  });

  it('reports a file that is not an archive rather than hanging', async () => {
    const at = path.join(dir, 'garbage.7z');
    await fsp.writeFile(at, 'this is not a 7z archive at all');
    const out = await extractSubtitlesFromArchive(at, {
      extensions: SUBS,
      maxUnpackedBytes: 50 * 1024 * 1024,
      timeoutMs: 60_000,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 7-Zip lists nothing it can parse, so there is nothing to extract. An
    // empty, honest result — never a claim of success with cues in it.
    expect(out.files).toEqual([]);
  }, 120_000);
});
