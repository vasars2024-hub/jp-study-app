import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findSidecarSubtitles, sidecarFlagTags, sidecarNameMatchesStem } from '../subtitleLocalSources';

// P7: a sidecar belongs to a media file only when its name is the media stem
// followed by a separator, and its flags are read from the tags AFTER the stem.

const dirs: string[] = [];
function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidecar-stem-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('sidecarNameMatchesStem', () => {
  it('requires a separator right after the stem', () => {
    expect(sidecarNameMatchesStem('Show - 01.ja.srt', 'Show - 01')).toBe(true);
    expect(sidecarNameMatchesStem('Show - 01.srt', 'Show - 01')).toBe(true);
    expect(sidecarNameMatchesStem('show - 01.JA.srt', 'Show - 01')).toBe(true);
    expect(sidecarNameMatchesStem('Show - 01_ja_JP.vtt', 'Show - 01')).toBe(true);
    expect(sidecarNameMatchesStem('Show - 010.ja.srt', 'Show - 01')).toBe(false);
    expect(sidecarNameMatchesStem('Show - 01v2.ja.srt', 'Show - 01')).toBe(false);
    expect(sidecarNameMatchesStem('Show - 01', 'Show - 01')).toBe(false);
    expect(sidecarNameMatchesStem('Show.srt', '')).toBe(false);
  });
});

describe('sidecarFlagTags', () => {
  it('reads hearing-impaired and forced tags after the stem only', () => {
    expect(sidecarFlagTags('Hi Score Girl - 01.ja.srt', 'Hi Score Girl - 01')).toEqual({ forced: false, hearingImpaired: false });
    expect(sidecarFlagTags('CC Lemon - 01.ja.srt', 'CC Lemon - 01')).toEqual({ forced: false, hearingImpaired: false });
    expect(sidecarFlagTags('Forced Love - 01.en.srt', 'Forced Love - 01')).toEqual({ forced: false, hearingImpaired: false });
    expect(sidecarFlagTags('Show - 01.en.sdh.srt', 'Show - 01')).toEqual({ forced: false, hearingImpaired: true });
    expect(sidecarFlagTags('Show - 01.en.hi.srt', 'Show - 01')).toEqual({ forced: false, hearingImpaired: true });
    expect(sidecarFlagTags('Show - 01.en.cc.srt', 'Show - 01')).toEqual({ forced: false, hearingImpaired: true });
    expect(sidecarFlagTags('Show - 01.en [SDH].srt', 'Show - 01')).toEqual({ forced: false, hearingImpaired: true });
    expect(sidecarFlagTags('Show - 01_en_forced.srt', 'Show - 01')).toEqual({ forced: true, hearingImpaired: false });
    expect(sidecarFlagTags('Show - 01.en.FORCED.srt', 'Show - 01')).toEqual({ forced: true, hearingImpaired: false });
  });
});

describe('findSidecarSubtitles stem boundaries', () => {
  it('does not attach episode 010 to episode 01, nor read "Hi" in a title as SDH', () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, 'Hi Show - 01.mkv'), '');
    fs.writeFileSync(path.join(dir, 'Hi Show - 01.ja.srt'), '');
    fs.writeFileSync(path.join(dir, 'Hi Show - 01.en.sdh.srt'), '');
    fs.writeFileSync(path.join(dir, 'Hi Show - 010.ja.srt'), '');
    const found = findSidecarSubtitles(path.join(dir, 'Hi Show - 01.mkv'))
      .map((s) => ({ name: s.fileName, hi: s.hearingImpaired, lang: s.language }))
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(found).toEqual([
      { name: 'Hi Show - 01.en.sdh.srt', hi: true, lang: 'en' },
      { name: 'Hi Show - 01.ja.srt', hi: false, lang: 'ja' },
    ]);
  });
});
