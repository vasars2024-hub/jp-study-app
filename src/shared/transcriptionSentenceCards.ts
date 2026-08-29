import type { TranscriptCardTiming } from './transcriptionIpc';

/**
 * What the resulting cards' timestamps are worth, decided by the one thing that
 * determines it: whether the worker returned cue windows at all. Kept here, and
 * pure, so the honest-label contract is testable without an Electron job run.
 */
export function transcriptTimingSource(timedCueCount: number): TranscriptCardTiming {
  return timedCueCount > 0 ? 'cue-aligned' : 'chunk-estimated';
}

/** Timed transcript cue produced by Whisper or a subtitle track. */
export interface TimedTranscriptCue {
  start: number;
  end: number;
  text: string;
}

/** A natural sentence and the audio range that contains it. */
export interface TranscriptSentenceSegment extends TimedTranscriptCue {
  cueCount: number;
}

export interface SentenceSegmentationOptions {
  /** Flush an unfinished sentence when the speaker has paused this long. */
  maxGapSec?: number;
  /** Keep pathological ASR runs bounded even when punctuation is absent. */
  maxCharacters?: number;
  /** Keep generated clips useful as cards rather than long listening passages. */
  maxDurationSec?: number;
}

const TERMINAL = /[。！？!?…]/u;
const STUDY_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface TimedFragment extends TimedTranscriptCue {
  terminal: boolean;
}

/**
 * Split one Whisper cue on sentence punctuation while retaining a bounded
 * timestamp for every fragment. Whisper timestamps are token-window aligned;
 * proportional placement is only used when one returned window contains more
 * than one written sentence.
 */
function splitCue(cue: TimedTranscriptCue): TimedFragment[] {
  const text = cleanText(cue.text);
  if (!text) return [];
  const duration = Math.max(0.05, cue.end - cue.start);
  const chars = [...text];
  const ranges: Array<{ from: number; to: number }> = [];
  let from = 0;
  for (let i = 0; i < chars.length; i += 1) {
    if (TERMINAL.test(chars[i])) {
      ranges.push({ from, to: i + 1 });
      from = i + 1;
    }
  }
  if (from < chars.length) ranges.push({ from, to: chars.length });

  return ranges.flatMap(({ from: startIndex, to: endIndex }) => {
    const fragment = cleanText(chars.slice(startIndex, endIndex).join(''));
    if (!fragment) return [];
    return [{
      start: cue.start + duration * (startIndex / chars.length),
      end: cue.start + duration * (endIndex / chars.length),
      text: fragment,
      terminal: TERMINAL.test(chars[endIndex - 1] ?? ''),
    }];
  });
}

/**
 * Convert timed ASR/subtitle cues into short, natural study sentences.
 * Unpunctuated fragments are joined across adjacent cues; punctuation, a real
 * speaker pause, or the safety bounds close the sentence.
 */
export function segmentTranscriptSentences(
  cues: readonly TimedTranscriptCue[],
  options: SentenceSegmentationOptions = {},
): TranscriptSentenceSegment[] {
  const maxGapSec = Math.max(0, options.maxGapSec ?? 1.25);
  const maxCharacters = Math.max(12, Math.floor(options.maxCharacters ?? 90));
  const maxDurationSec = Math.max(2, options.maxDurationSec ?? 24);
  const ordered = cues
    .filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const result: TranscriptSentenceSegment[] = [];
  let current: TranscriptSentenceSegment | null = null;

  const flush = (): void => {
    if (!current) return;
    const text = cleanText(current.text);
    if (text && STUDY_TEXT.test(text)) result.push({ ...current, text });
    current = null;
  };

  for (const cue of ordered) {
    for (const fragment of splitCue(cue)) {
      // Whisper commonly emits bracketed music/noise labels. Do not let one
      // become the prefix of the next real sentence merely because it shares a
      // timestamp window.
      if (!STUDY_TEXT.test(fragment.text)) continue;
      if (current && fragment.start - current.end > maxGapSec) flush();
      if (!current) {
        current = { start: fragment.start, end: fragment.end, text: fragment.text, cueCount: 1 };
      } else {
        current.text = `${current.text}${fragment.text}`;
        current.end = Math.max(current.end, fragment.end);
        current.cueCount += 1;
      }
      const length = [...current.text].length;
      const duration = current.end - current.start;
      if (fragment.terminal || length >= maxCharacters || duration >= maxDurationSec) flush();
    }
  }
  flush();
  return result;
}
