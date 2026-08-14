/**
 * The `*.meta.json` sidecar that sits beside a fused Japanese subtitle track.
 *
 * Plan stage F6 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md`. The SRT itself
 * cannot carry provenance — a cue is a timestamp and a string, and anything else
 * written into it becomes text a player paints on the video. So the per-cue
 * `{basis, score, confidence}` the F4 scoring already produces goes in a sidecar,
 * indexed by cue position in the written SRT.
 *
 * Two properties this file exists to hold:
 *
 *  - **It is keyed by cue index, not window index.** A merged ASR window yields one
 *    cue and a dropped window yields none, so window indices do not survive the
 *    write. `windowDecisionsToFusedCues` is the single skip rule both the SRT
 *    writer and this builder go through.
 *  - **Reading is total.** A sidecar is optional data about an optional track: a
 *    missing, truncated, hand-edited or future-version file must yield `null`, never
 *    an exception, because the track is still perfectly readable without it.
 *
 * Pure and leaf-ish (only the fusion core's types), so main writes it, the renderer
 * reads it, and neither needs the other's runtime.
 */

import {
  windowDecisionsToFusedCues,
  type AsrWindow,
  type FusedWindowDecision,
  type FusionBasis,
  type FusionCue,
} from './subtitleFusionCore';

/**
 * Bumped only when an older reader would *misread* a newer file. A reader that
 * sees a higher version declines the whole sidecar rather than guessing at fields.
 */
export const FUSION_META_VERSION = 2;

/**
 * The bases a version-1 reader knows. F5's arbitration added two more, and a v1
 * reader drops a cue whose basis it does not recognise — which would under-count
 * a track and hide every repair. So a sidecar declares **2 only when it actually
 * contains an arbitrated cue**: an offline-only track stays readable by older
 * builds, and the files a v1 reader would misread are exactly the ones it now
 * refuses outright.
 */
const V1_BASES: readonly FusionBasis[] = ['whisper', 'whisper-unverified', 'reference', 'empty'];

/** Provenance for one line of the fused track. */
export interface FusedCueMeta {
  /** 0-based position in the fused SRT's cue list. */
  index: number;
  startSec: number;
  endSec: number;
  basis: FusionBasis;
  /** Bigram Dice overlap of transcript and reference, 0–1. */
  score: number;
  /** 0–1. The record's track-level `confidence` is the 0–100 form of the mean. */
  confidence: number;
}

export interface FusionTrackMeta {
  version: number;
  /** Epoch ms the fusion job wrote this track. */
  createdAt: number;
  /** The English record whose cue grid the track borrowed. */
  sourceSubtitleId: string;
  sourceLang: string;
  lang: string;
  /** Seconds F1 shifted the English cues by; 0 when the estimator declined. */
  offsetSec: number;
  offsetConfident: boolean;
  /** Mean confidence over emitted cues, 0–1. */
  meanConfidence: number;
  cues: FusedCueMeta[];
}

/**
 * Where the sidecar lives, given the track's own path.
 *
 * Derived rather than stored on the `SubtitleRecord`: a path recorded in two
 * places is a path that can disagree with itself, and a record written before F6
 * would have carried nothing anyway. Works on both the relative userData paths the
 * fusion job writes and an absolute one.
 */
export function fusionMetaPathFor(subtitlePath: string): string {
  return `${subtitlePath.replace(/\.[^.\\/]*$/, '')}.meta.json`;
}

/** Build the sidecar from exactly the windows/decisions that produced the SRT. */
export function buildFusionTrackMeta(
  windows: readonly AsrWindow[],
  cues: readonly FusionCue[],
  decisions: readonly FusedWindowDecision[],
  track: {
    createdAt: number;
    sourceSubtitleId: string;
    sourceLang: string;
    lang: string;
    offsetSec: number;
    offsetConfident: boolean;
  },
): FusionTrackMeta {
  const rows = windowDecisionsToFusedCues(windows, cues, decisions);
  const meanConfidence = rows.length
    ? Math.round((rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length) * 1000) / 1000
    : 0;
  const arbitrated = rows.some((row) => !V1_BASES.includes(row.basis));
  return {
    version: arbitrated ? FUSION_META_VERSION : 1,
    createdAt: track.createdAt,
    sourceSubtitleId: track.sourceSubtitleId,
    sourceLang: track.sourceLang,
    lang: track.lang,
    offsetSec: Math.round(track.offsetSec * 1000) / 1000,
    offsetConfident: track.offsetConfident,
    meanConfidence,
    cues: rows.map((row, index) => ({
      index,
      startSec: Math.round(row.start * 1000) / 1000,
      endSec: Math.round(row.end * 1000) / 1000,
      basis: row.basis,
      score: Math.round(row.score * 1000) / 1000,
      confidence: row.confidence,
    })),
  };
}

export function serializeFusionTrackMeta(meta: FusionTrackMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

const FUSION_BASES: readonly FusionBasis[] = [
  ...V1_BASES,
  'whisper-as-is',
  'whisper-corrected',
];

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readCue(value: unknown, index: number): FusedCueMeta | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const basis = FUSION_BASES.find((candidate) => candidate === row.basis);
  if (!basis) return null;
  return {
    index: Number.isInteger(row.index) ? (row.index as number) : index,
    startSec: readNumber(row.startSec),
    endSec: readNumber(row.endSec),
    basis,
    score: readNumber(row.score),
    confidence: readNumber(row.confidence),
  };
}

/**
 * Parse a sidecar, or return `null` for anything that is not one.
 *
 * Deliberately total. The only hard rejections are a version this build cannot
 * read and a missing cue list; individual malformed cues are dropped rather than
 * failing the file, so one corrupt line does not cost the other four hundred.
 */
export function parseFusionTrackMeta(raw: string): FusionTrackMeta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const source = parsed as Record<string, unknown>;
  const version = readNumber(source.version, 0);
  if (version < 1 || version > FUSION_META_VERSION) return null;
  if (!Array.isArray(source.cues)) return null;
  return {
    version,
    createdAt: readNumber(source.createdAt),
    sourceSubtitleId: typeof source.sourceSubtitleId === 'string' ? source.sourceSubtitleId : '',
    sourceLang: typeof source.sourceLang === 'string' ? source.sourceLang : '',
    lang: typeof source.lang === 'string' ? source.lang : '',
    offsetSec: readNumber(source.offsetSec),
    offsetConfident: source.offsetConfident === true,
    meanConfidence: readNumber(source.meanConfidence),
    cues: source.cues
      .map((cue, index) => readCue(cue, index))
      .filter((cue): cue is FusedCueMeta => cue !== null),
  };
}

/**
 * How much of a fused track is worth a second look.
 *
 * `whisper` is the transcript with the reference agreeing; everything else is a
 * line the pipeline itself is unsure about, and that is the number a user wants
 * before deciding whether to study from the track or fix it first.
 */
export function fusionCueCounts(meta: FusionTrackMeta): {
  total: number;
  verified: number;
  corrected: number;
  unverified: number;
  reference: number;
  uncertain: number;
} {
  const count = (basis: FusionBasis): number =>
    meta.cues.filter((cue) => cue.basis === basis).length;
  // `whisper-as-is` joins `whisper` because both mean "the transcript stood up
  // to a check" — one against the reference translation, one against the F5
  // arbiter. `whisper-corrected` is counted apart: the line is trusted, but the
  // user is looking at text no microphone produced, and that is worth saying.
  const verified = count('whisper') + count('whisper-as-is');
  const corrected = count('whisper-corrected');
  const unverified = count('whisper-unverified');
  const reference = count('reference');
  return {
    total: meta.cues.length,
    verified,
    corrected,
    unverified,
    reference,
    uncertain: unverified + reference,
  };
}

/** Track-level `SubtitleRecord.confidence` is a 0–100 match score, not a 0–1 ratio. */
export function fusionConfidencePercent(meanConfidence: number): number {
  return Math.max(0, Math.min(100, Math.round(meanConfidence * 100)));
}
