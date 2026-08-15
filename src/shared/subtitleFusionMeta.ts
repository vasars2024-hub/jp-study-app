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
 * The bases a version-1 reader knows. F5's arbitration added two, and the
 * unrefereed split added a third; a v1 reader drops a cue whose basis it does not
 * recognise — which would under-count a track and hide every repair. So a sidecar
 * declares **2 only when it actually contains a cue a v1 reader cannot read**: a
 * fully refereed offline track stays readable by older builds, and the files a v1
 * reader would misread are exactly the ones it now refuses outright.
 *
 * `whisper-unrefereed` is deliberately *not* in this list even though it predates
 * F5 in spirit. A v1 build reading it as an unknown basis drops the cue, but a v1
 * build that had been told it was plain `whisper` would count it as verified —
 * which is the exact false claim the split exists to stop. Refusing the file beats
 * reading it wrong.
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

/**
 * What F5 actually did, as opposed to what its per-cue bases let you guess.
 *
 * Two runs on the same install with the same key produced `applied: 22` and
 * `applied: 0`, and nothing on disk said why — a provider that failed every batch
 * looked identical to a provider that was never configured, because both leave
 * every disputed cue `whisper-unverified`. Counting bases cannot tell them apart
 * either: zero applied verdicts is zero arbitration bases in both cases.
 *
 * Optional, and deliberately **not** a version bump: a reader that does not know
 * this field ignores it and still reads every cue correctly, which is the only
 * thing `version` exists to protect. Absent means "written before this field",
 * never "arbitration did not run".
 */
export interface FusionArbitrationSummary {
  /** Windows sent to the provider. */
  attempted: number;
  /** Verdicts that survived the parse and the fidelity guard. */
  applied: number;
  /** Batches whose request or parse produced nothing. */
  failedBatches: number;
  /** Why no verdicts were produced, when none were; `null` when it ran. */
  skipped: 'no-key' | 'no-candidates' | 'cancelled' | null;
  /**
   * Failed batches counted by reason, e.g. `{ timeout: 1 }` — the provider's own
   * error code for a request that threw, or `unparsable` / `empty` / `rejected`
   * for a response that arrived and could not be used. `failedBatches` says how
   * many; this says which, and the three response-side causes need three
   * different fixes. Absent when no batch failed.
   */
  failures?: Record<string, number>;
  /**
   * Verdicts the model returned that the guards discarded, summed over batches
   * that still yielded something. A batch can half-fail; `failedBatches` cannot
   * see that, and a model losing a third of every batch is a real defect.
   */
  dropped?: number;
  /**
   * Verdicts won back by re-asking a failed batch in halves. A run with
   * `failures` but a matching `recovered` was rescued rather than degraded, and
   * the two must not be read as the same outcome.
   */
  recovered?: number;
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
  /** Absent on sidecars written before the field existed. */
  arbitration?: FusionArbitrationSummary;
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
    arbitration?: FusionArbitrationSummary;
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
    ...(track.arbitration ? { arbitration: track.arbitration } : {}),
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
  'whisper-unrefereed',
];

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const ARBITRATION_SKIPS: readonly FusionArbitrationSummary['skipped'][] = [
  'no-key',
  'no-candidates',
  'cancelled',
  null,
];

/**
 * Reasons are open-ended by design — a request-side one is whatever error code
 * the provider layer produced, and that list grows without this file. So the
 * reader validates shape, not vocabulary, and bounds both dimensions: a corrupt
 * or hostile sidecar may not hand a caller an unbounded map or a giant key.
 */
const MAX_FAILURE_REASONS = 16;
const MAX_FAILURE_REASON_LEN = 40;

function readFailures(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [reason, count] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_FAILURE_REASONS) break;
    if (!reason || reason.length > MAX_FAILURE_REASON_LEN) continue;
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
    out[reason] = Math.floor(count);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Total, like the rest of this reader: anything that is not a summary reads as
 * absent. A half-written `arbitration` block must not cost the caller the cues.
 */
function readArbitration(value: unknown): FusionArbitrationSummary | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const skipped = row.skipped === undefined || row.skipped === null
    ? null
    : ARBITRATION_SKIPS.find((candidate) => candidate === row.skipped);
  if (skipped === undefined) return undefined;
  const failures = readFailures(row.failures);
  const dropped = readNumber(row.dropped);
  const recovered = readNumber(row.recovered);
  return {
    attempted: readNumber(row.attempted),
    applied: readNumber(row.applied),
    failedBatches: readNumber(row.failedBatches),
    skipped,
    ...(failures ? { failures } : {}),
    ...(dropped > 0 ? { dropped } : {}),
    ...(recovered > 0 ? { recovered } : {}),
  };
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
  const arbitration = readArbitration(source.arbitration);
  return {
    version,
    createdAt: readNumber(source.createdAt),
    sourceSubtitleId: typeof source.sourceSubtitleId === 'string' ? source.sourceSubtitleId : '',
    sourceLang: typeof source.sourceLang === 'string' ? source.sourceLang : '',
    lang: typeof source.lang === 'string' ? source.lang : '',
    offsetSec: readNumber(source.offsetSec),
    offsetConfident: source.offsetConfident === true,
    meanConfidence: readNumber(source.meanConfidence),
    ...(arbitration ? { arbitration } : {}),
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
  unrefereed: number;
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
  // Never checked, as opposed to checked and doubted. Reported on its own
  // because the fix is different: a doubted line needs reading, an unrefereed
  // one needs the translator installed.
  const unrefereed = count('whisper-unrefereed');
  const reference = count('reference');
  return {
    total: meta.cues.length,
    verified,
    corrected,
    unverified,
    unrefereed,
    reference,
    // Unrefereed lines count here too. `uncertain` is what a caller reaches for
    // to answer "how much of this needs a second look", and a line nothing ever
    // compared against anything needs one as much as a disputed line does.
    // Folding it in keeps every existing consumer honest by default; the
    // separate field above is for a surface that wants to say *why*.
    uncertain: unverified + reference + unrefereed,
  };
}

/** Track-level `SubtitleRecord.confidence` is a 0–100 match score, not a 0–1 ratio. */
export function fusionConfidencePercent(meanConfidence: number): number {
  return Math.max(0, Math.min(100, Math.round(meanConfidence * 100)));
}
