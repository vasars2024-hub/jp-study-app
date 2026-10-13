import { describe, expect, it, vi } from 'vitest';
import {
  buildCondensedAudio,
  concatMp3,
  condensedFileName,
  condensedSeconds,
  mp3AudioFrames,
  mp3FrameAt,
  planCondensedSpans,
  type CondensedClipRequest,
} from '../condensedAudio';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

const cue = (index: number, startMs: number, endMs: number, text = `line ${index}`): VideoCoreStudyCue => ({
  index,
  trackNumber: 1,
  text,
  startMs,
  endMs,
});

const NO_PAD = { beforeMs: 0, afterMs: 0 };

describe('planCondensedSpans', () => {
  it('pads each line, applies the delay and merges lines closer than the gap', () => {
    const spans = planCondensedSpans(
      [cue(0, 10_000, 12_000), cue(1, 12_500, 14_000), cue(2, 30_000, 31_000)],
      1,
      { beforeMs: 200, afterMs: 300 },
    );
    expect(spans).toEqual([
      { startSec: 10.8, endSec: 15.3 },
      { startSec: 30.8, endSec: 32.3 },
    ]);
  });

  it('leaves out signs and empty events, and lines inside another span', () => {
    const spans = planCondensedSpans(
      [cue(0, 0, 5_000), cue(1, 1_000, 2_000, 'second speaker'), cue(2, 6_000, 7_000, '{\\pos(1,1)}看板'), cue(3, 8_000, 9_000, '  ')],
      0,
      NO_PAD,
      { mergeGapSec: 0 },
    );
    expect(spans).toEqual([{ startSec: 0, endSec: 5 }]);
  });

  it('keeps every span under the cutter\'s ceiling', () => {
    const lines = Array.from({ length: 20 }, (_, i) => cue(i, i * 3_000, i * 3_000 + 2_800));
    const spans = planCondensedSpans(lines, 0, NO_PAD, { maxSpanSec: 10 });
    for (const span of spans) expect(span.endSec - span.startSec).toBeLessThanOrEqual(10.0001);
    // Nothing lost, nothing doubled.
    expect(condensedSeconds(spans)).toBeCloseTo(20 * 2.8 + 19 * 0.2 - spansGaps(spans), 3);
    const long = planCondensedSpans([cue(0, 0, 62_000)], 0, NO_PAD, { maxSpanSec: 25 });
    expect(long.map((span) => [span.startSec, span.endSec])).toEqual([[0, 25], [25, 50], [50, 62]]);
  });
});

/** Gaps between consecutive spans that the merge did NOT bridge (they were not audio). */
function spansGaps(spans: Array<{ startSec: number; endSec: number }>): number {
  let gaps = 0;
  for (let i = 1; i < spans.length; i += 1) gaps += Math.max(0, spans[i].startSec - spans[i - 1].endSec);
  return gaps;
}

// ---- MP3 framing -----------------------------------------------------------------------------

/** One MPEG-1 Layer III frame, 64 kb/s, 44.1 kHz, mono: 208 bytes. */
function frame(fill: number, tag?: 'Info' | 'Xing'): Uint8Array {
  const bytes = new Uint8Array(208).fill(fill);
  bytes.set([0xff, 0xfb, 0x50, 0xc0], 0);
  if (tag) bytes.set([...tag].map((c) => c.charCodeAt(0)), 4 + 17);
  return bytes;
}

function id3v2(size: number): Uint8Array {
  const bytes = new Uint8Array(10 + size);
  bytes.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, (size >> 7) & 0x7f, size & 0x7f], 0);
  return bytes;
}

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

describe('MP3 frames', () => {
  it('reads a Layer III frame header', () => {
    expect(mp3FrameAt(frame(1), 0)).toEqual({ length: 208, sideInfoEnd: 21 });
    expect(mp3FrameAt(new Uint8Array([0x49, 0x44, 0x33, 4]), 0)).toBeNull();
  });

  it('drops the ID3v2 tag, the Info header frame and an ID3v1 tag', () => {
    const tagV1 = new Uint8Array(128);
    tagV1.set([0x54, 0x41, 0x47], 0);
    const file = join(id3v2(300), frame(0, 'Info'), frame(7), frame(8), tagV1);
    const audio = mp3AudioFrames(file);
    expect(audio.length).toBe(416);
    expect(audio[4]).toBe(7);
    expect(audio[208 + 4]).toBe(8);
  });

  it('joins clips as one frame stream with a single header-free body', () => {
    const a = join(id3v2(20), frame(0, 'Xing'), frame(1));
    const b = join(id3v2(20), frame(0, 'Info'), frame(2), frame(3));
    const joined = concatMp3([a, b]);
    expect(joined.length).toBe(3 * 208);
    for (let at = 0; at < joined.length; at += 208) expect(mp3FrameAt(joined, at)?.length).toBe(208);
    expect([joined[4], joined[208 + 4], joined[416 + 4]]).toEqual([1, 2, 3]);
  });
});

// ---- the run ---------------------------------------------------------------------------------

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

describe('buildCondensedAudio', () => {
  const spans = [{ startSec: 1, endSec: 2 }, { startSec: 5, endSec: 7 }, { startSec: 9, endSec: 10 }];

  it('cuts every span with no extra padding from the stream listened to, and joins them in order', async () => {
    const requests: CondensedClipRequest[] = [];
    const progress: number[] = [];
    const result = await buildCondensedAudio({
      filePath: 'C:/anime/ep.mkv',
      spans,
      audioStreamOrdinal: 1,
      extract: async (request) => {
        requests.push(request);
        // The second span finishes first; the order must still follow the spans.
        await new Promise((resolve) => setTimeout(resolve, request.startSec === 5 ? 1 : 10));
        return { ok: true, base64: toBase64(join(id3v2(10), frame(0, 'Info'), frame(request.startSec))) };
      },
      onProgress: (done) => progress.push(done),
    });
    expect(requests.map((r) => [r.startSec, r.endSec, r.padBeforeSec, r.padAfterSec, r.audioStreamOrdinal]))
      .toEqual([[1, 2, 0, 0, 1], [5, 7, 0, 0, 1], [9, 10, 0, 0, 1]]);
    expect([result.bytes[4], result.bytes[208 + 4], result.bytes[416 + 4]]).toEqual([1, 5, 9]);
    expect(result).toMatchObject({ spans: 3, failed: 0, seconds: 4 });
    expect(progress).toEqual([1, 2, 3]);
  });

  it('leaves out a span that fails to cut and counts it', async () => {
    const result = await buildCondensedAudio({
      filePath: 'x',
      spans,
      extract: async (request) => (request.startSec === 5
        ? { ok: false }
        : { ok: true, base64: toBase64(frame(request.startSec)) }),
    });
    expect(result).toMatchObject({ spans: 2, failed: 1, seconds: 2 });
    expect(result.bytes.length).toBe(416);
  });

  it('stops on abort without producing a file', async () => {
    const controller = new AbortController();
    const extract = vi.fn(async () => {
      controller.abort();
      return { ok: true, base64: toBase64(frame(1)) };
    });
    await expect(buildCondensedAudio({ filePath: 'x', spans, extract, signal: controller.signal, concurrency: 1 }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(extract).toHaveBeenCalledTimes(1);
  });
});

describe('condensedFileName', () => {
  it('names the MP3 after the episode', () => {
    expect(condensedFileName('C:\\anime\\Show - 01.mkv')).toBe('Show - 01 (condensed).mp3');
    expect(condensedFileName('/x/.mkv')).toBe('audio (condensed).mp3');
  });
});
