// @vitest-environment node
//
// `media:subtitleForPath` with `lang`: the second line for a video the library
// has never seen comes from a sidecar beside it, which only the main process
// can read.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pickSidecarSubtitleForLanguage, sidecarTagMatches } from '../subtitleSidecar';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-sidecar-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function touch(name: string, text = name): void {
  fs.writeFileSync(path.join(dir, name), text, 'utf8');
}

describe('sidecarTagMatches', () => {
  it('reads the spellings releases use', () => {
    for (const tag of ['en', 'eng', 'EN', 'en-US', 'English', 'en.forced', 'eng.sdh', 'a.en']) {
      expect(sidecarTagMatches(tag, 'en')).toBe(true);
    }
    expect(sidecarTagMatches('ja', 'en')).toBe(false);
    expect(sidecarTagMatches('jpn', 'ja')).toBe(true);
    expect(sidecarTagMatches('zh-Hans', 'zh')).toBe(true);
  });
});

describe('pickSidecarSubtitleForLanguage', () => {
  it('returns the English sidecar of a file the library does not know', () => {
    const video = path.join(dir, 'Show - 01.mkv');
    touch('Show - 01.mkv', '');
    touch('Show - 01.ja.srt', 'japanese');
    touch('Show - 01.en.srt', 'english');
    expect(pickSidecarSubtitleForLanguage(video, 'en')).toEqual({ name: 'Show - 01.en.srt', text: 'english' });
    expect(pickSidecarSubtitleForLanguage(video, 'ja')?.text).toBe('japanese');
  });

  it('accepts .eng.srt and .en.ass, and prefers a creator track over auto captions', () => {
    const video = path.join(dir, 'clip.mp4');
    touch('clip.a.en.vtt', 'auto-captions');
    touch('clip.eng.ass', 'ass-track');
    expect(pickSidecarSubtitleForLanguage(video, 'en')?.text).toBe('ass-track');
    fs.rmSync(path.join(dir, 'clip.eng.ass'));
    expect(pickSidecarSubtitleForLanguage(video, 'en')?.name).toBe('clip.a.en.vtt');
  });

  it('never offers another episode\'s sidecar, and answers null when there is none', () => {
    const video = path.join(dir, 'Show - 01.mkv');
    touch('Show - 02.en.srt');
    touch('Show - 01.ja.srt');
    expect(pickSidecarSubtitleForLanguage(video, 'en')).toBeNull();
    expect(pickSidecarSubtitleForLanguage(path.join(dir, 'missing-dir', 'x.mkv'), 'en')).toBeNull();
    expect(pickSidecarSubtitleForLanguage(video, '')).toBeNull();
  });
});
