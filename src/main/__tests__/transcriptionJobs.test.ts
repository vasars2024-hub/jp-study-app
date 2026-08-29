// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  __transcriptionTestables,
  cancelTranscription,
  enqueueTranscription,
  onMainTranscriptionProgress,
  registerTranscriptionIpc,
  transcriptionQueue,
} from '../transcriptionJobs';
import {
  MAX_NO_WINDOW_ATTEMPTS,
  normalizeTranscriptionCardOptions,
} from '../../shared/transcriptionIpc';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-test-'));

// No window, ever: every chunk request answers `no-window`, which is the whole
// point of the drain-bound test below.
vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}));

// media.ts is imported for extractAudioPcm; stub it so no ffmpeg is spawned.
// Mutable so a test can hand the job enough audio to be worth a chunk request.
const pcm = vi.hoisted(() => ({ bytes: 0 }));
vi.mock('../media', () => ({ extractAudioPcm: async () => new ArrayBuffer(pcm.bytes) }));

const {
  chunksToSrt,
  timestampedCuesToSrt,
  timestamp,
  pickEnglishTrack,
  planNoWindowRetry,
} = __transcriptionTestables;

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
  it('preserves the local Whisper timestamps when they are available', () => {
    const srt = timestampedCuesToSrt([
      { start: 1.25, end: 2.8, text: '一つ目。' },
      { start: 3.1, end: 4.05, text: '二つ目。' },
    ]);
    expect(srt).toContain('00:00:01,250 --> 00:00:02,800\n一つ目。');
    expect(srt).toContain('00:00:03,100 --> 00:00:04,050\n二つ目。');
  });

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

describe('planNoWindowRetry', () => {
  const job = (over: Record<string, unknown> = {}): Parameters<typeof planNoWindowRetry>[0] =>
    ({ mediaId: 'm', title: 't', lang: 'ja', queuedAt: 1, attempts: 0, ...over }) as
      Parameters<typeof planNoWindowRetry>[0];

  it('counts an absent counter as zero, so an older persisted queue restores', () => {
    expect(planNoWindowRetry(job()).job.noWindowAttempts).toBe(1);
  });

  it('climbs without touching the attempts the media itself is judged on', () => {
    const next = planNoWindowRetry(job({ noWindowAttempts: 5, attempts: 2 }));
    expect(next.job.noWindowAttempts).toBe(6);
    expect(next.job.attempts).toBe(2);
    expect(next.retire).toBe(false);
  });

  it('retires exactly at the bound, and keeps the rest of the job intact', () => {
    expect(planNoWindowRetry(job({ noWindowAttempts: MAX_NO_WINDOW_ATTEMPTS - 2 })).retire).toBe(false);
    const last = planNoWindowRetry(job({ noWindowAttempts: MAX_NO_WINDOW_ATTEMPTS - 1, kind: 'fuse-en-ja' }));
    expect(last.retire).toBe(true);
    expect(last.job.kind).toBe('fuse-en-ja');
  });
});

describe('transcript card options', () => {
  it('keeps old persisted jobs on the full card behavior by default', () => {
    expect(normalizeTranscriptionCardOptions()).toEqual({
      createCards: true,
      translateToEnglish: true,
      includeAudio: true,
    });
  });

  it('persists an explicit no-card request and reports it with queued progress', () => {
    const media = {
      id: 'options-media',
      title: 'Options source',
      fileName: 'options.wav',
      path: '/tmp/options.wav',
      subtitles: [],
    };
    const seen: Array<ReturnType<typeof normalizeTranscriptionCardOptions> | undefined> = [];
    const off = onMainTranscriptionProgress((progress) => seen.push(progress.cardOptions));
    try {
      registerTranscriptionIpc({ listItems: () => [media], patchItems: () => undefined } as never);
      enqueueTranscription({
        mediaId: media.id,
        cardOptions: { createCards: false, translateToEnglish: false, includeAudio: false },
      });
      expect(transcriptionQueue()[0]?.cardOptions).toEqual({
        createCards: false,
        translateToEnglish: false,
        includeAudio: false,
      });
      expect(seen[0]).toEqual(transcriptionQueue()[0]?.cardOptions);
    } finally {
      cancelTranscription(media.id);
      off();
    }
  });
});

describe('a drain that never finds a renderer', () => {
  const media = {
    id: 'm1', title: 'Episode 1', fileName: 'ep1.mkv', path: '/tmp/ep1.mkv', subtitles: [],
  };

  it('bounds the wait instead of holding the queue head for the whole session', async () => {
    // One full chunk of audio, so the job actually reaches a chunk request and
    // the `no-window` throw — an empty buffer would finish as an empty transcript.
    pcm.bytes = 16_000 * 4;
    vi.useFakeTimers();
    const errors: string[] = [];
    const off = onMainTranscriptionProgress((p) => {
      if (p.phase === 'error') errors.push(p.error ?? '');
    });
    try {
      registerTranscriptionIpc({ listItems: () => [media], patchItems: () => undefined } as never);
      enqueueTranscription({ mediaId: 'm1' });
      await vi.advanceTimersByTimeAsync(0);

      // Still queued — the window usually does arrive — but the wait is counted now.
      expect(transcriptionQueue()).toHaveLength(1);
      expect(transcriptionQueue()[0].noWindowAttempts).toBe(1);

      await vi.advanceTimersByTimeAsync(15_000);
      expect(transcriptionQueue()[0].noWindowAttempts).toBe(2);
      // The file is blameless: its own attempts are untouched.
      expect(transcriptionQueue()[0].attempts).toBe(0);

      // Left alone it retires, rather than re-extracting the audio every 15 s forever.
      await vi.advanceTimersByTimeAsync(15_000 * MAX_NO_WINDOW_ATTEMPTS);
      expect(transcriptionQueue()).toHaveLength(0);
      expect(errors).toContain('no-window');
    } finally {
      off();
      vi.useRealTimers();
      pcm.bytes = 0;
    }
  });

  it('keeps draining the jobs behind a head job that retires', async () => {
    // `drain` is only re-entered from a timer, an enqueue or boot. If retiring
    // the head job breaks the loop without re-arming the timer, everything
    // queued behind it is stranded with no error of its own — a silently dead
    // queue entry. One job could never show that; two can.
    pcm.bytes = 16_000 * 4;
    vi.useFakeTimers();
    const errors: string[] = [];
    const off = onMainTranscriptionProgress((p) => {
      if (p.phase === 'error') errors.push(`${p.mediaId}:${p.error ?? ''}`);
    });
    try {
      const second = { ...media, id: 'm2', title: 'Episode 2', fileName: 'ep2.mkv' };
      registerTranscriptionIpc({
        listItems: () => [media, second],
        patchItems: () => undefined,
      } as never);
      enqueueTranscription({ mediaId: 'm1' });
      enqueueTranscription({ mediaId: 'm2' });
      await vi.advanceTimersByTimeAsync(0);
      expect(transcriptionQueue().map((job) => job.mediaId)).toEqual(['m1', 'm2']);

      // The head job attempts once per retry window, so it retires one window
      // short of the bound. m2 must not have been touched by any of that.
      await vi.advanceTimersByTimeAsync(15_000 * (MAX_NO_WINDOW_ATTEMPTS - 1));
      expect(errors).toEqual(['m1:no-window']);
      expect(transcriptionQueue().map((job) => job.mediaId)).toEqual(['m2']);
      // The regression: a retire that does not re-arm leaves zero timers here,
      // and m2 then waits for the rest of the session.
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // And it really does progress, rather than merely holding a timer.
      await vi.advanceTimersByTimeAsync(15_000);
      expect(transcriptionQueue()[0]?.noWindowAttempts).toBe(1);

      await vi.advanceTimersByTimeAsync(15_000 * MAX_NO_WINDOW_ATTEMPTS);
      expect(transcriptionQueue()).toHaveLength(0);
      expect(errors).toEqual(['m1:no-window', 'm2:no-window']);
    } finally {
      off();
      vi.useRealTimers();
      pcm.bytes = 0;
    }
  });
});
