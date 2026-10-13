/**
 * Condensed audio: an episode's speech only, as one MP3 to listen to away from the screen.
 *
 * The immersion community's standard passive-listening tool (asbplayer and mpvacious both
 * offer it): a 24-minute episode is usually 8-12 minutes of dialogue, and a file of just
 * that is something a learner replays on a walk. Built from the study track as the learner
 * has it — their subtitle delay applied, their clip padding around each line.
 *
 * ## How
 *
 * - **Plan** ({@link planCondensedSpans}): each spoken line padded, lines closer than
 *   `mergeGapSec` merged into one span (so a fast exchange is not chopped into pieces with a
 *   fade on every line), spans capped below the cutter's 30 s ceiling.
 * - **Cut**: each span through the existing `extractAudioClip` IPC — ffmpeg in main, the
 *   same MP3 a mined card gets, from the audio stream the learner is listening to. Nothing
 *   plays: the cut never touches the player.
 * - **Join** ({@link concatMp3}): MP3 is a sequence of self-contained frames, so files are
 *   joined by concatenating frames once each file's container bits are dropped — the ID3v2
 *   tag at the front, the Xing/Info header frame (which states the length of ONE clip, and
 *   would make players report the whole file as a few seconds long) and an ID3v1 tag at the
 *   end. No re-encode, no new dependency.
 *
 * A span that fails to cut is skipped and counted, not fatal: one bad seek should not cost
 * the other hundred lines.
 */
import {
  isTypesettingCueText,
  stripAssCueText,
  type VideoCoreStudyCue,
} from '../shared/videoCoreStudy';
import type { ClipPadding } from './clipPadding';
import { base64ToBytes } from '../shared/systemAudioRing';

export interface CondensedSpan {
  startSec: number;
  endSec: number;
}

export interface CondensedPlanOptions {
  /** Lines this close (after padding) are one span. */
  mergeGapSec?: number;
  /** Longest span; the cutter refuses more than 30 s. */
  maxSpanSec?: number;
}

export const CONDENSED_MERGE_GAP_SEC = 1;
export const CONDENSED_MAX_SPAN_SEC = 25;

/** Spoken lines of `cues`, padded and merged into spans to cut, in playback seconds. */
export function planCondensedSpans(
  cues: readonly VideoCoreStudyCue[],
  subtitleDelaySec: number,
  padding: Pick<ClipPadding, 'beforeMs' | 'afterMs'>,
  options: CondensedPlanOptions = {},
): CondensedSpan[] {
  const delay = Number.isFinite(subtitleDelaySec) ? subtitleDelaySec : 0;
  const mergeGap = Math.max(0, options.mergeGapSec ?? CONDENSED_MERGE_GAP_SEC);
  const maxSpan = Math.max(1, options.maxSpanSec ?? CONDENSED_MAX_SPAN_SEC);
  const ranges = cues
    .filter((cue) => cue.endMs > cue.startMs && stripAssCueText(cue.text) && !isTypesettingCueText(cue.text))
    .map((cue) => ({
      startSec: Math.max(0, cue.startMs / 1000 + delay - padding.beforeMs / 1000),
      endSec: Math.max(0, cue.endMs / 1000 + delay + padding.afterMs / 1000),
    }))
    .filter((range) => range.endSec > range.startSec)
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  const merged: CondensedSpan[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.startSec - last.endSec <= mergeGap && Math.max(last.endSec, range.endSec) - last.startSec <= maxSpan) {
      last.endSec = Math.max(last.endSec, range.endSec);
    } else if (last && range.endSec <= last.endSec) {
      // Wholly inside the previous span (an overlapping second speaker): already covered.
      continue;
    } else {
      merged.push({ startSec: last ? Math.max(range.startSec, last.endSec) : range.startSec, endSec: range.endSec });
    }
  }
  // A single line longer than the ceiling (a song, a monologue) is cut in pieces.
  const spans: CondensedSpan[] = [];
  for (const span of merged) {
    for (let start = span.startSec; start < span.endSec - 1e-6; start += maxSpan) {
      spans.push({ startSec: round3(start), endSec: round3(Math.min(span.endSec, start + maxSpan)) });
    }
  }
  return spans.filter((span) => span.endSec - span.startSec >= 0.1);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Total seconds of audio the spans hold. */
export function condensedSeconds(spans: readonly CondensedSpan[]): number {
  return spans.reduce((sum, span) => sum + (span.endSec - span.startSec), 0);
}

// ----- MP3 frames ----------------------------------------------------------------------------

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

interface Mp3FrameHeader {
  length: number;
  /** Where a Xing/Info tag would sit inside this frame. */
  sideInfoEnd: number;
}

/** The Layer III frame header at `offset`, or null when there is none. */
export function mp3FrameAt(bytes: Uint8Array, offset: number): Mp3FrameHeader | null {
  if (offset + 4 > bytes.length) return null;
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  if (bytes[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 0x03; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5, 1 reserved
  const layer = (b1 >> 1) & 0x03; // 1 = Layer III
  if (version === 1 || layer !== 1) return null;
  const bitrateIndex = (b2 >> 4) & 0x0f;
  const rateIndex = (b2 >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const padding = (b2 >> 1) & 0x01;
  const mono = ((b3 >> 6) & 0x03) === 3;
  const mpeg1 = version === 3;
  const bitrate = (mpeg1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  const length = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding;
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17);
  return length > 4 ? { length, sideInfoEnd: 4 + sideInfo } : null;
}

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

/**
 * The audio frames of one MP3 file: ID3v2 at the front, a Xing/Info (or VBRI) header frame
 * and an ID3v1 tag at the end removed. A file that does not start with a frame after its
 * tag is returned from the first frame sync found.
 */
export function mp3AudioFrames(bytes: Uint8Array): Uint8Array {
  let start = 0;
  let end = bytes.length;
  if (end >= 10 && ascii(bytes, 0, 'ID3')) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    const footer = (bytes[5] & 0x10) !== 0 ? 10 : 0;
    start = Math.min(end, 10 + size + footer);
  }
  if (end - start >= 128 && ascii(bytes, end - 128, 'TAG')) end -= 128;
  // First frame sync at or after the tag (some muxers leave padding).
  while (start < end - 4 && !mp3FrameAt(bytes, start)) start += 1;
  const first = mp3FrameAt(bytes, start);
  if (first) {
    const tagAt = start + first.sideInfoEnd;
    if (ascii(bytes, tagAt, 'Xing') || ascii(bytes, tagAt, 'Info') || ascii(bytes, start + 36, 'VBRI')) {
      start = Math.min(end, start + first.length);
    }
  }
  return start < end ? bytes.subarray(start, end) : new Uint8Array(0);
}

/** One MP3 from several, frame streams back to back. */
export function concatMp3(parts: readonly Uint8Array[]): Uint8Array {
  const frames = parts.map(mp3AudioFrames).filter((part) => part.length > 0);
  const total = frames.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of frames) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ----- the run -------------------------------------------------------------------------------

export interface CondensedClipRequest {
  filePath: string;
  startSec: number;
  endSec: number;
  padBeforeSec: number;
  padAfterSec: number;
  audioStreamOrdinal?: number | null;
}

export type CondensedExtract = (request: CondensedClipRequest) => Promise<{ ok: boolean; base64?: string }>;

export interface CondensedResult {
  bytes: Uint8Array;
  /** Spans cut and joined. */
  spans: number;
  /** Spans that failed to cut and were left out. */
  failed: number;
  /** Seconds of audio planned into the joined spans. */
  seconds: number;
}

/**
 * Cut every span and join them, `concurrency` cuts at a time, in order. Rejects with an
 * `AbortError` when `signal` aborts (no partial file). Resolves with `bytes` empty when
 * every cut failed.
 */
export async function buildCondensedAudio(input: {
  filePath: string;
  spans: readonly CondensedSpan[];
  audioStreamOrdinal?: number | null;
  extract: CondensedExtract;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  concurrency?: number;
}): Promise<CondensedResult> {
  const { spans } = input;
  const parts: Array<Uint8Array | null> = new Array(spans.length).fill(null);
  const concurrency = Math.max(1, Math.min(4, input.concurrency ?? 2));
  let next = 0;
  let done = 0;
  const aborted = (): boolean => input.signal?.aborted === true;
  const abortError = (): Error => Object.assign(new Error('aborted'), { name: 'AbortError' });
  const worker = async (): Promise<void> => {
    while (next < spans.length) {
      if (aborted()) return;
      const index = next;
      next += 1;
      const span = spans[index];
      try {
        // Padding is already in the span: the cutter adds none of its own.
        const result = await input.extract({
          filePath: input.filePath,
          startSec: span.startSec,
          endSec: span.endSec,
          padBeforeSec: 0,
          padAfterSec: 0,
          audioStreamOrdinal: input.audioStreamOrdinal ?? null,
        });
        if (result.ok && result.base64) parts[index] = base64ToBytes(result.base64);
      } catch {
        parts[index] = null;
      }
      done += 1;
      if (!aborted()) input.onProgress?.(done, spans.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, spans.length) }, () => worker()));
  if (aborted()) throw abortError();
  const cut = parts.filter((part): part is Uint8Array => part != null);
  const seconds = spans.reduce((sum, span, index) => sum + (parts[index] ? span.endSec - span.startSec : 0), 0);
  return {
    bytes: concatMp3(cut),
    spans: cut.length,
    failed: spans.length - cut.length,
    seconds,
  };
}

/** `Episode 01.mkv` → `Episode 01 (condensed).mp3`. */
export function condensedFileName(videoPath: string, suffix = 'condensed'): string {
  const base = videoPath.split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.[^.]+$/, '').trim() || 'audio';
  return `${stem} (${suffix}).mp3`;
}
