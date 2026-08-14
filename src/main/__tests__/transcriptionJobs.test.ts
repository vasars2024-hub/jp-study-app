// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { __transcriptionTestables } from '../transcriptionJobs';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}));

// media.ts is imported for extractAudioPcm; stub it so no ffmpeg is spawned.
vi.mock('../media', () => ({ extractAudioPcm: async () => new ArrayBuffer(0) }));

const { chunksToSrt, timestamp, pickEnglishTrack } = __transcriptionTestables;

describe('timestamp', () => {
  it('formats SRT timestamps with a comma before the milliseconds', () => {
    expect(timestamp(0)).toBe('00:00:00,000');
    expect(timestamp(1.5)).toBe('00:00:01,500');
    expect(timestamp(61)).toBe('00:01:01,000');
    expect(timestamp(3723.25)).toBe('01:02:03,250');
  });

  it('clamps a negative time rather than emitting a broken cue', () => {
    expect(timestamp(-5)).toBe('00:00:00,000');
  });
});

describe('chunksToSrt', () => {
  it('numbers cues from one and spans each chunk window', () => {
    const srt = chunksToSrt(['first', 'second'], 30);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:30,000\nfirst');
    expect(srt).toContain('2\n00:00:30,000 --> 00:01:00,000\nsecond');
  });

  it('skips silent chunks but keeps the timing of the ones that follow', () => {
    // A gap in the middle must not shift later cues earlier — the numbering is
    // sequential but the times come from the chunk index.
    const srt = chunksToSrt(['one', '   ', 'three'], 30);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:30,000\none');
    expect(srt).toContain('2\n00:01:00,000 --> 00:01:30,000\nthree');
    expect(srt).not.toContain('00:00:30,000 --> 00:01:00,000');
  });

  it('returns an empty string when nothing was transcribed', () => {
    expect(chunksToSrt([])).toBe('');
    expect(chunksToSrt(['', '  ', '\n'])).toBe('');
  });

  it('trims cue text', () => {
    expect(chunksToSrt(['  padded  '], 30)).toContain('\npadded\n');
  });

  it('honours a non-default chunk length', () => {
    expect(chunksToSrt(['a', 'b'], 10)).toContain('2\n00:00:10,000 --> 00:00:20,000\nb');
  });
});

describe('pickEnglishTrack', () => {
  const record = (over: Record<string, unknown>): Record<string, unknown> => ({
    id: 'r', lang: 'en', source: 'sidecar', format: 'srt', path: 'x.srt', addedAt: 1, ...over,
  });
  const item = (subtitles: unknown[]): Parameters<typeof pickEnglishTrack>[0] =>
    ({ id: 'm', subtitles } as unknown as Parameters<typeof pickEnglishTrack>[0]);

  it('ignores every track that is not English', () => {
    expect(pickEnglishTrack(item([record({ id: 'ja', lang: 'ja' })]))).toBeUndefined();
    expect(pickEnglishTrack(item([]))).toBeUndefined();
  });

  it('matches a region-tagged tag but not a language that merely starts with en', () => {
    expect(pickEnglishTrack(item([record({ id: 'us', lang: 'en-US' })]))?.id).toBe('us');
    // `enm` is Middle English, a different language; the word-boundary is the point.
    expect(pickEnglishTrack(item([record({ id: 'enm', lang: 'enm' })]))).toBeUndefined();
  });

  it('prefers a human track over a machine-generated one regardless of confidence', () => {
    const picked = pickEnglishTrack(item([
      record({ id: 'whisper', machineGenerated: true, confidence: 99, addedAt: 900 }),
      record({ id: 'human', confidence: 1, addedAt: 1 }),
    ]));
    expect(picked?.id).toBe('human');
  });

  it('falls back to confidence, then to the newest', () => {
    expect(pickEnglishTrack(item([
      record({ id: 'weak', confidence: 10 }),
      record({ id: 'strong', confidence: 80 }),
    ]))?.id).toBe('strong');
    expect(pickEnglishTrack(item([
      record({ id: 'old', addedAt: 1 }),
      record({ id: 'new', addedAt: 2 }),
    ]))?.id).toBe('new');
  });

  it('honours a pinned id, and refuses when that id is not an English track', () => {
    const subs = [record({ id: 'a' }), record({ id: 'b' }), record({ id: 'ja', lang: 'ja' })];
    expect(pickEnglishTrack(item(subs), 'b')?.id).toBe('b');
    expect(pickEnglishTrack(item(subs), 'ja')).toBeUndefined();
  });
});
