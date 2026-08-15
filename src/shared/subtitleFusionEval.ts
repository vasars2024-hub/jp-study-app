/**
 * F7 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md` — the honesty gate's arithmetic.
 *
 * Every threshold in the fusion pipeline is provisional until something measures
 * whether fusing actually beats not fusing. This module is that measurement: given
 * a human Japanese track and the tracks the pipeline produced, it reports character
 * error rate and answers the one question the feature's marketing depends on —
 * **what may this feature honestly claim?** If the answer is "nothing", the plan
 * says it must not ship as "highly accurate".
 *
 * The rules differ by `FusionEvalMode`, and that split is the point: the offline
 * path cannot beat raw Whisper on CER *by construction*, so grading it as if it
 * could would make the gate untestable rather than strict. See `evaluateEpisode`
 * for what each mode measures and `FusionClaim` for what a pass licenses.
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
import type { FusionArbitrationSummary } from './subtitleFusionMeta';

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

/**
 * Which path produced the fused track, because the two make different claims.
 *
 * Offline (`F5` skipped — no key, no disputes, or a provider that failed) the
 * pipeline never overwrites Whisper text with the reference except in a window
 * Whisper returned nothing for. So on an episode with no empty window the fused
 * track is *character-identical* to `whisperOnly`, and "fused beats whisperOnly
 * strictly" is unpassable by construction rather than unmet by measurement.
 * Grading that run strictly does not test the pipeline, it tests whether the
 * arbiter ran.
 */
export type FusionEvalMode = 'offline' | 'arbitrated';

/**
 * The mode an episode's own sidecar licenses, as opposed to the one the operator
 * typed on the command line.
 *
 * `--mode arbitrated` was an assertion with nothing behind it, and the assertion
 * was wrong on a real run: episode 1 was graded arbitrated after F5 sent its one
 * batch, got it back unusable and applied **zero** verdicts. A run where
 * arbitration contributed no text is the offline pipeline, whatever configuration
 * it had — grading it strictly tests whether the arbiter ran, and quoting
 * `beats-both` off it is the exact false claim the mode split exists to stop.
 *
 * So: `arbitrated` requires the arbiter to have both run (`skipped === null`) and
 * changed something (`applied > 0`). Absent summary means a sidecar written
 * before the field existed, which cannot testify either way and therefore does
 * not license the stronger claim.
 */
export function fusionModeFromArbitration(
  summary?: Pick<FusionArbitrationSummary, 'applied' | 'skipped'> | null,
): FusionEvalMode {
  if (!summary || summary.skipped !== null) return 'offline';
  return summary.applied > 0 ? 'arbitrated' : 'offline';
}

/** A baseline (or the coverage rule) the fused track failed, named for the report. */
export type FusionLoss = 'whisperOnly' | 'mtOnly' | 'coverage';

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
  /** The mode this episode was graded under. Defaults to the stricter-to-claim `offline`. */
  mode: FusionEvalMode;
  fused: TrackEvaluation;
  whisperOnly: TrackEvaluation;
  mtOnly: TrackEvaluation;
  /** The mode's rules all satisfied. */
  passed: boolean;
  /** Baselines (and the coverage rule) the fused track failed. */
  lostTo: FusionLoss[];
  /**
   * The fused track carries the same characters as `whisperOnly` after
   * normalization — so the CER comparison between them is degenerate, not close.
   * Reported so a passing offline run can never be quoted as "fusing beat Whisper".
   */
  identicalToWhisper: boolean;
}

/**
 * Score one episode and decide whether it passes, under its mode's rules.
 *
 * `documentCer` is the number the gate reads. `alignedCer` is reported but does
 * not gate: it punishes the fused track for using the English grid, which is the
 * very design decision the feature rests on, so gating on it would fail the
 * pipeline for working as intended.
 *
 * **Arbitrated** keeps the plan's original rule — fused strictly below both
 * baselines. A tie there means arbitration bought nothing, and the claim under
 * test is that it buys accuracy.
 *
 * **Offline** grades the three things the offline path actually does, and only
 * those. It may not be *worse* than Whisper (a reference substitution in an empty
 * window that damages the track fails here); it must still beat translation alone
 * strictly, which is a real measurement because the two tracks genuinely differ;
 * and it may not cover fewer reference cues than Whisper did, because filling a
 * window Whisper returned nothing for is the offline path's whole contribution to
 * the text. What it deliberately does **not** claim is a strict CER win over
 * Whisper — see `FusionEvalMode`.
 */
export function evaluateEpisode(
  episode: string,
  reference: readonly EvalCue[],
  candidates: EpisodeCandidates,
  mode: FusionEvalMode = 'offline',
): EpisodeVerdict {
  const fused = evaluateTrack(reference, candidates.fused);
  const whisperOnly = evaluateTrack(reference, candidates.whisperOnly);
  const mtOnly = evaluateTrack(reference, candidates.mtOnly);
  const lostTo: FusionLoss[] = [];
  const beatsWhisper = mode === 'arbitrated'
    ? fused.documentCer < whisperOnly.documentCer
    : fused.documentCer <= whisperOnly.documentCer;
  if (!beatsWhisper) lostTo.push('whisperOnly');
  if (!(fused.documentCer < mtOnly.documentCer)) lostTo.push('mtOnly');
  if (mode === 'offline' && fused.missedCues > whisperOnly.missedCues) lostTo.push('coverage');
  return {
    episode,
    mode,
    fused,
    whisperOnly,
    mtOnly,
    passed: lostTo.length === 0,
    lostTo,
    identicalToWhisper:
      normalizeForFusionCompare(documentText(candidates.fused))
      === normalizeForFusionCompare(documentText(candidates.whisperOnly)),
  };
}

/** The plan's minimum evidence: the gate is not meaningful on one episode. */
export const FUSION_GATE_MIN_EPISODES = 2;

/**
 * The strongest sentence a passing run licenses. `none` when it did not pass.
 *
 * This exists so the gate's own output, not a reader's memory of the plan, decides
 * what the feature may say about itself. An all-offline run can only ever reach
 * `no-regression`, however green it prints.
 */
export type FusionClaim = 'beats-both' | 'no-regression' | 'none';

export interface ShipGate {
  passed: boolean;
  episodes: EpisodeVerdict[];
  /** Why the gate failed, in the words the report prints. */
  reasons: string[];
  /**
   * True of the run but not gating — degenerate comparisons, mode mixes, and other
   * things that limit what the numbers mean without making them wrong.
   */
  notes: string[];
  claim: FusionClaim;
}

/** The claim's one sentence, so every caller prints the same words. */
export function fusionClaimSentence(claim: FusionClaim): string {
  switch (claim) {
    case 'beats-both':
      return 'fusing beats both raw Whisper and translation alone on every episode scored';
    case 'no-regression':
      return 'fusing is no worse than raw Whisper, loses no lines to it, and beats '
        + 'translation alone — it does not claim a Whisper accuracy win';
    default:
      return 'nothing; this run supports no accuracy claim';
  }
}

/**
 * The whole gate: every episode must pass its mode's rules, and there must be
 * enough of them.
 *
 * A single passing episode is not evidence — one lucky recording can beat the
 * baselines by accident, and the plan asks for two precisely so that it cannot.
 * Too few episodes is a failure of the *gate*, not of the pipeline, and the reason
 * string says so rather than letting a thin run read as a green one.
 *
 * The strict `beats-both` claim needs **every** episode arbitrated. One offline
 * episode in the set caps the whole run at `no-regression`, because the run's claim
 * is only as strong as its weakest episode.
 */
export function fusionShipGate(episodes: readonly EpisodeVerdict[]): ShipGate {
  const reasons: string[] = [];
  const notes: string[] = [];
  if (episodes.length < FUSION_GATE_MIN_EPISODES) {
    reasons.push(
      `only ${episodes.length} episode(s) scored; the gate needs ${FUSION_GATE_MIN_EPISODES}`,
    );
  }
  for (const verdict of episodes) {
    const fusedCer = verdict.fused.documentCer.toFixed(4);
    for (const lost of verdict.lostTo) {
      if (lost === 'coverage') {
        reasons.push(
          `${verdict.episode}: fused misses ${verdict.fused.missedCues} reference cues `
          + `where whisperOnly misses ${verdict.whisperOnly.missedCues}`,
        );
      } else if (lost === 'whisperOnly' && verdict.mode === 'offline') {
        reasons.push(
          `${verdict.episode}: fused CER ${fusedCer} is worse than `
          + `whisperOnly ${verdict.whisperOnly.documentCer.toFixed(4)}`,
        );
      } else {
        const baseline = lost === 'whisperOnly' ? verdict.whisperOnly : verdict.mtOnly;
        reasons.push(
          `${verdict.episode}: fused CER ${fusedCer} `
          + `does not beat ${lost} ${baseline.documentCer.toFixed(4)}`,
        );
      }
    }
    if (verdict.identicalToWhisper) {
      notes.push(
        `${verdict.episode}: fused and whisperOnly are character-identical, so their `
        + 'CER comparison is degenerate — fusion changed no text on this episode',
      );
    }
  }
  const passed = reasons.length === 0;
  const claim: FusionClaim = !passed
    ? 'none'
    : episodes.every((verdict) => verdict.mode === 'arbitrated')
      ? 'beats-both'
      : 'no-regression';
  return { passed, episodes: [...episodes], reasons, notes, claim };
}
