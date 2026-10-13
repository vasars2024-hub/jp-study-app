/**
 * How much of the audio around a subtitle line a mined card (audio, clip) and the
 * condensed-audio export take — the learner's setting, applied the same way everywhere.
 *
 * Before this the padding was three different hardcoded answers: a cut cue audio file got
 * 0.25 s / 0.35 s, a cut video clip 0.25 s / 0.25 s, and a cue recorded off a stream none at
 * all, so the same line mined twice could start on different syllables. asbplayer and
 * Language Reactor both let the learner choose, because subtitle timing varies by release:
 * one fansub group's lines end on the last mora, another's 300 ms early.
 *
 * The padding fills silence, never the next speaker: with `stopAtNeighbours` on (the
 * default) the lead-in stops where the previous line ends and the tail where the next line
 * starts, so a long tail does not open the card with someone else's first word. Lines that
 * overlap this one are not neighbours — they are said at the same time and are already in
 * the range.
 *
 * Stored on the player preferences object (whose normaliser keeps unknown keys), clamped
 * here on every read, so a hand-edited value can never ask ffmpeg for a minute of padding.
 */
import {
  isTypesettingCueText,
  stripAssCueText,
  type VideoCoreStudyCue,
} from '../shared/videoCoreStudy';

export interface ClipPadding {
  /** Lead-in before the line, ms. */
  beforeMs: number;
  /** Tail after the line, ms. */
  afterMs: number;
  /** Keep the padding out of the previous / next line. */
  stopAtNeighbours: boolean;
}

/** The preference keys, on `jp-media-player-preferences-v1`. */
export const CLIP_PAD_PREF = {
  beforeMs: 'clipPadBeforeMs',
  afterMs: 'clipPadAfterMs',
  stopAtNeighbours: 'clipPadStopAtNeighbours',
} as const;

/** The one-key mine's long-standing defaults (`videoClip.ts` MINE_AUDIO_PAD_*), kept. */
export const DEFAULT_CLIP_PADDING: Readonly<ClipPadding> = {
  beforeMs: 250,
  afterMs: 350,
  stopAtNeighbours: true,
};

export const CLIP_PAD_MAX_MS = 2000;
export const CLIP_PAD_STEP_MS = 50;

function clampMs(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const snapped = Math.round(value / CLIP_PAD_STEP_MS) * CLIP_PAD_STEP_MS;
  return Math.max(0, Math.min(CLIP_PAD_MAX_MS, snapped));
}

/** The padding stored on the preferences, each value clamped and snapped to the step. */
export function clipPaddingFromPreferences(preferences: Readonly<Record<string, unknown>> | null | undefined): ClipPadding {
  const raw = preferences ?? {};
  return {
    beforeMs: clampMs(raw[CLIP_PAD_PREF.beforeMs], DEFAULT_CLIP_PADDING.beforeMs),
    afterMs: clampMs(raw[CLIP_PAD_PREF.afterMs], DEFAULT_CLIP_PADDING.afterMs),
    stopAtNeighbours: raw[CLIP_PAD_PREF.stopAtNeighbours] !== false,
  };
}

export interface PaddedCueRange {
  /** The line itself, playback seconds (subtitle delay applied). */
  cueStartSec: number;
  cueEndSec: number;
  /** The padding actually granted (after the neighbour limits), seconds. */
  padBeforeSec: number;
  padAfterSec: number;
  /** The padded range, never before 0. */
  startSec: number;
  endSec: number;
}

/** A line that is speech, not a sign or an empty event: only those are neighbours. */
function isSpokenCue(cue: VideoCoreStudyCue): boolean {
  return cue.endMs > cue.startMs && !!stripAssCueText(cue.text) && !isTypesettingCueText(cue.text);
}

function sameCue(left: VideoCoreStudyCue, right: VideoCoreStudyCue): boolean {
  return left.trackNumber === right.trackNumber
    && left.index === right.index
    && left.startMs === right.startMs
    && left.endMs === right.endMs;
}

/**
 * The range to cut or record for `cue`, padded by the learner's setting.
 *
 * `cues` is the track the line belongs to (any order); pass `[]` to pad without neighbour
 * limits. The neighbour limit only ever shortens the padding — it never cuts into the line.
 */
export function paddedCueRange(
  cue: VideoCoreStudyCue,
  cues: readonly VideoCoreStudyCue[],
  subtitleDelaySec: number,
  padding: ClipPadding,
): PaddedCueRange {
  const delay = Number.isFinite(subtitleDelaySec) ? subtitleDelaySec : 0;
  const cueStartSec = Math.max(0, cue.startMs / 1000 + delay);
  const cueEndSec = Math.max(cueStartSec, cue.endMs / 1000 + delay);
  let padBeforeSec = padding.beforeMs / 1000;
  let padAfterSec = padding.afterMs / 1000;
  if (padding.stopAtNeighbours) {
    let previousEndMs = Number.NEGATIVE_INFINITY;
    let nextStartMs = Number.POSITIVE_INFINITY;
    for (const other of cues) {
      if (sameCue(other, cue) || !isSpokenCue(other)) continue;
      if (other.endMs <= cue.startMs) previousEndMs = Math.max(previousEndMs, other.endMs);
      if (other.startMs >= cue.endMs) nextStartMs = Math.min(nextStartMs, other.startMs);
    }
    if (Number.isFinite(previousEndMs)) {
      padBeforeSec = Math.min(padBeforeSec, (cue.startMs - previousEndMs) / 1000);
    }
    if (Number.isFinite(nextStartMs)) {
      padAfterSec = Math.min(padAfterSec, (nextStartMs - cue.endMs) / 1000);
    }
  }
  padBeforeSec = Math.max(0, Math.min(padBeforeSec, cueStartSec));
  padAfterSec = Math.max(0, padAfterSec);
  return {
    cueStartSec,
    cueEndSec,
    padBeforeSec,
    padAfterSec,
    startSec: cueStartSec - padBeforeSec,
    endSec: cueEndSec + padAfterSec,
  };
}
