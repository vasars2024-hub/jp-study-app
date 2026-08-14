/**
 * F7 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md` — the honesty gate's arithmetic.
 *
 * Every threshold in the fusion pipeline is provisional until something measures
 * whether fusing actually beats not fusing. This module is that measurement: given
 * a human Japanese track and the tracks the pipeline produced, it reports character
 * error rate, and it answers the one question the feature's marketing depends on —
 * **does the fused track beat both raw Whisper and translation alone?** If it does
 * not, the fusion is not adding accuracy and the plan says it must not ship as
 * "highly accurate".
 *
 * Pure, with no Node or Electron imports, for two reasons. The scoring has to be
 * unit-testable without a 24-minute episode and a Whisper runtime, and the CLI in
 * `tools/fusion-eval.cjs` has to be able to bundle it. The parts that need real
 * media live in the CLI; nothing here reads a file.
 *
 * Normalization is `normalizeForFusionCompare`, deliberately the same function F4
 * scores with. Measuring the pipeline through a different normalizer than it
 * decides with would produce numbers that do not describe the shipped behaviour —
 * a difference in punctuation policy alone can move a CER by whole points.
 */

import { normalizeForFusionCompare } from './subtitleFusionCore';

/** A timed line from any track — reference or candidate. */
export interface EvalCue {
  start: number;
  end: number;
  text: string;
}

/**
 * Levenshtein distance over code points, two rows at a time.
 *
 * Code points rather than UTF-16 units so a surrogate pair counts as the one
 * character a reader sees. Two rows because a full matrix for a 20,000-character
 * episode transcript is 400 M cells and this runs over three candidates.
 */
export function editDistance(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = new Array<number>(right.length + 1);
  let current = new Array<number>(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) previous[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[right.length];
}

export interface CerResult {
  /** Edits / reference characters. 0 is perfect; above 1 is possible. */
  cer: number;
  edits: number;
  /** Reference characters after normalization — the denominator. */
  referenceChars: number;
}

/** CER of one string against one reference, both normalized as F4 normalizes. */
export function characterErrorRate(reference: string, candidate: string): CerResult {
  const ref = normalizeForFusionCompare(reference);
  const hyp = normalizeForFusionCompare(candidate);
  if (!ref.length) {
    // No reference characters means there is no rate to report. Returning 0 would
    // read as a perfect score for a candidate nothing was compared against.
    return { cer: hyp.length ? 1 : 0, edits: [...hyp].length, referenceChars: 0 };
  }
  const edits = editDistance(ref, hyp);
  return { cer: edits / [...ref].length, edits, referenceChars: [...ref].length };
}

/** Every track's text in time order, as one string. */
function documentText(cues: readonly EvalCue[]): string {
  return [...cues]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((cue) => cue.text)
    .join('');
}

/** Seconds two cues share. Zero when they merely touch. */
export function overlapSeconds(a: EvalCue, b: EvalCue): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export interface AlignedPair {
  reference: EvalCue;
  /** Candidate cues overlapping this reference cue, in time order, joined. */
  candidateText: string;
  overlapSec: number;
}

/**
 * Attach candidate text to each reference cue by time overlap.
 *
 * A candidate cue may serve several reference cues and vice versa — the fused
 * track's grid comes from the English captions and the human Japanese track was
 * authored independently, so the two grids genuinely do not correspond. Anything
 * that forced a one-to-one match would be inventing a correspondence and then
 * measuring it.
 *
 * A reference cue nothing overlaps gets an empty candidate, which scores as a full
 * deletion. That is the honest reading: the track failed to say that line.
 */
export function alignByOverlap(
  reference: readonly EvalCue[],
  candidate: readonly EvalCue[],
): AlignedPair[] {
  const sorted = [...candidate].sort((a, b) => a.start - b.start || a.end - b.end);
  return [...reference]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((cue) => {
      const hits = sorted.filter((entry) => overlapSeconds(cue, entry) > 0);
      return {
        reference: cue,
        candidateText: hits.map((entry) => entry.text).join(''),
        overlapSec: hits.reduce((sum, entry) => sum + overlapSeconds(cue, entry), 0),
      };
    });
}

export interface TrackEvaluation {
  /** CER over the whole track concatenated in time order — the headline number. */
  documentCer: number;
  /**
   * CER summed over time-overlap-aligned cues.
   *
   * Stricter than `documentCer`: a line the track says correctly but at the wrong
   * moment is an error here and free there. Reported alongside rather than instead,
   * because the fused track borrows the English grid and can legitimately place a
   * line a second from where a human subtitler did.
   */
  alignedCer: number;
  edits: number;
  referenceChars: number;
  /** Reference cues no candidate cue overlapped at all. */
  missedCues: number;
  referenceCues: number;
  candidateCues: number;
}

/** Score one candidate track against the human reference track. */
export function evaluateTrack(
  reference: readonly EvalCue[],
  candidate: readonly EvalCue[],
): TrackEvaluation {
  const document = characterErrorRate(documentText(reference), documentText(candidate));
  const pairs = alignByOverlap(reference, candidate);
  let edits = 0;
  let chars = 0;
  let missed = 0;
  for (const pair of pairs) {
    const scored = characterErrorRate(pair.reference.text, pair.candidateText);
    edits += scored.edits;
    chars += scored.referenceChars;
    if (!pair.candidateText.trim()) missed += 1;
  }
  return {
    documentCer: document.cer,
    alignedCer: chars ? edits / chars : 0,
    edits: document.edits,
    referenceChars: document.referenceChars,
    missedCues: missed,
    referenceCues: reference.length,
    candidateCues: candidate.length,
  };
}

/** The three tracks one episode contributes to the gate. */
export interface EpisodeCandidates {
  /** The pipeline's output — F1–F6, arbitration on or off. */
  fused: readonly EvalCue[];
  /** Whisper's transcript alone, on the same cue grid. The floor to beat. */
  whisperOnly: readonly EvalCue[];
  /** The EN→JA reference translation alone. The other floor to beat. */
  mtOnly: readonly EvalCue[];
}

export interface EpisodeVerdict {
  episode: string;
  fused: TrackEvaluation;
  whisperOnly: TrackEvaluation;
  mtOnly: TrackEvaluation;
  /** Fused CER strictly below both baselines. The plan's ship gate, per episode. */
  passed: boolean;
  /** Baselines the fused track failed to beat, named for the report. */
  lostTo: Array<'whisperOnly' | 'mtOnly'>;
}

/**
 * Score one episode and decide whether it passes.
 *
 * `documentCer` is the number the gate reads. `alignedCer` is reported but does
 * not gate: it punishes the fused track for using the English grid, which is the
 * very design decision the feature rests on, so gating on it would fail the
 * pipeline for working as intended.
 *
 * "Strictly below" is deliberate — a tie means fusing bought nothing, and the
 * claim under test is that it buys accuracy.
 */
export function evaluateEpisode(
  episode: string,
  reference: readonly EvalCue[],
  candidates: EpisodeCandidates,
): EpisodeVerdict {
  const fused = evaluateTrack(reference, candidates.fused);
  const whisperOnly = evaluateTrack(reference, candidates.whisperOnly);
  const mtOnly = evaluateTrack(reference, candidates.mtOnly);
  const lostTo: Array<'whisperOnly' | 'mtOnly'> = [];
  if (!(fused.documentCer < whisperOnly.documentCer)) lostTo.push('whisperOnly');
  if (!(fused.documentCer < mtOnly.documentCer)) lostTo.push('mtOnly');
  return { episode, fused, whisperOnly, mtOnly, passed: lostTo.length === 0, lostTo };
}

/** The plan's minimum evidence: the gate is not meaningful on one episode. */
export const FUSION_GATE_MIN_EPISODES = 2;

export interface ShipGate {
  passed: boolean;
  episodes: EpisodeVerdict[];
  /** Why the gate failed, in the words the report prints. */
  reasons: string[];
}

/**
 * The whole gate: every episode must pass, and there must be enough of them.
 *
 * A single passing episode is not evidence — one lucky recording can beat both
 * baselines by accident, and the plan asks for two precisely so that it cannot.
 * Too few episodes is a failure of the *gate*, not of the pipeline, and the reason
 * string says so rather than letting a thin run read as a green one.
 */
export function fusionShipGate(episodes: readonly EpisodeVerdict[]): ShipGate {
  const reasons: string[] = [];
  if (episodes.length < FUSION_GATE_MIN_EPISODES) {
    reasons.push(
      `only ${episodes.length} episode(s) scored; the gate needs ${FUSION_GATE_MIN_EPISODES}`,
    );
  }
  for (const verdict of episodes) {
    for (const lost of verdict.lostTo) {
      const baseline = lost === 'whisperOnly' ? verdict.whisperOnly : verdict.mtOnly;
      reasons.push(
        `${verdict.episode}: fused CER ${verdict.fused.documentCer.toFixed(4)} `
        + `does not beat ${lost} ${baseline.documentCer.toFixed(4)}`,
      );
    }
  }
  return { passed: reasons.length === 0, episodes: [...episodes], reasons };
}
