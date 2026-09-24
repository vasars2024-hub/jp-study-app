/**
 * F5 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md` — the optional second opinion.
 *
 * F4 leaves every window where the reference translation disagreed with the
 * transcript marked `whisper-unverified`: Whisper's words, kept, flagged. This
 * module is the only place that can change one of those, and it does it by asking
 * a cloud model what was actually said, in batches, with the schema and the
 * fidelity guard from `shared/subtitleFusionCore.ts`.
 *
 * Three properties this file exists to hold, all of them the plan's requirements
 * rather than preferences:
 *
 *  - **Never throws.** Every failure mode — no key, no candidates, a network
 *    error, a timeout, a cancelled job, a model that answers with prose — resolves
 *    to fewer verdicts. Zero verdicts is `applyFusionArbitration`'s identity case,
 *    so the offline output is reached by doing nothing, not by a fallback branch.
 *  - **Bounded cost.** `FUSION_ARBITRATION_MAX_WINDOWS` caps the windows and the
 *    batch size caps the requests. A batch that fails for a size-shaped reason is
 *    re-asked once in halves and no further, so the ceiling is 3x the batch count.
 *    A user pressing "fuse" is not signing up for an unbounded number of paid calls.
 *  - **No opinion on the rest of the track.** Only disputed windows are sent, and
 *    only the windows a verdict names are changed.
 *
 * The HTTP call is here and the reasoning is in the core, deliberately: that keeps
 * the prompt, the parse and the fidelity rule unit-testable without a key.
 */

import {
  applyFusionArbitration,
  batchArbitrationCandidates,
  buildFusionArbitrationPrompt,
  inspectFusionArbitration,
  selectArbitrationCandidates,
  FUSION_ARBITRATION_SCHEMA,
  type ArbitrationCandidate,
  type ArbitrationVerdict,
  type FusedWindowDecision,
} from '../shared/subtitleFusionCore';
import { callAiProvider } from './aiProviderClient';
import { getConfiguredAiProvider } from './mining';
import { aiFeaturesEnabled } from './aiFeatureGate';

/** Why a job produced no verdicts, when it produced none. */
export type FusionArbitrationSkip = 'no-key' | 'no-candidates' | 'cancelled' | null;

export interface FusionArbitrationOutcome {
  decisions: FusedWindowDecision[];
  /** Windows sent to the provider. */
  attempted: number;
  /** Verdicts that survived the parse and the fidelity guard. */
  applied: number;
  /** Batches whose request or parse produced nothing. */
  failedBatches: number;
  skipped: FusionArbitrationSkip;
  /** Failed batches counted by reason; see `failureReason`. Empty when none failed. */
  failures: Record<string, number>;
  /** Verdicts discarded by the guards in batches that still yielded something. */
  dropped: number;
  /** Verdicts won back by re-asking a failed batch in halves. */
  recovered: number;
}

/**
 * Name a batch failure so the next reader does not have to guess.
 *
 * A request that threw reports the provider layer's own `code` — `timeout`,
 * `rate-limit`, `invalid-response` and the rest — because those are already the
 * vocabulary the rest of main uses for the same failures, and a code is stable
 * where a message is prose. Anything unrecognisable is `error` rather than the
 * message text: an arbitrary provider string ends up in a file on disk, and this
 * summary is not the place to find out it quoted the user's audio back.
 */
function failureReason(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : 'error';
}

/**
 * Reasons that plausibly scale with how much was asked for in one request, and
 * are therefore worth asking again in halves.
 *
 * Deliberately short. `rejected` and `empty` mean the model answered and the
 * answer was no — a smaller question gets the same no, at twice the price.
 * `authentication`, `rate-limit`, `cost-budget` and `cancelled` get *worse*
 * with more requests. `unparsable` is here because a response cut off mid-JSON
 * arrives as unparsable text whenever the provider does not label it, which is
 * every streaming path and some non-streaming ones.
 */
const SPLITTABLE_REASONS: ReadonlySet<string> = new Set([
  'output-truncated',
  'unparsable',
  'timeout',
]);

function splittableBatch(batch: readonly ArbitrationCandidate[], reason: string): boolean {
  return batch.length > 1 && SPLITTABLE_REASONS.has(reason);
}

function halve<T>(items: readonly T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

export interface FusionArbitrationOptions {
  isCancelled?: () => boolean;
  /** Called once per finished batch so the job can move its progress bar. */
  onBatch?: (done: number, total: number) => void;
  /**
   * Seam for tests: the real one is a paid network call, and a unit test that
   * needs a key to prove the fidelity guard would never run.
   */
  call?: (prompt: string, itemCount: number) => Promise<string>;
}

/** The active provider, or `null` — an unreadable mining config is "no cloud". */
function readProvider(): { providerId: ReturnType<typeof getConfiguredAiProvider>['providerId']; apiKey: string } | null {
  try {
    return getConfiguredAiProvider();
  } catch {
    return null;
  }
}

/**
 * Arbitrate the disputed windows, returning decisions that are safe either way.
 *
 * `englishTexts` and `references` are indexed by window, exactly as F3/F4 index
 * them, so a missing entry is an empty string and simply disqualifies that window
 * from arbitration rather than shifting anything.
 */
export async function arbitrateFusionDecisions(
  decisions: readonly FusedWindowDecision[],
  englishTexts: readonly string[],
  references: readonly string[],
  options: FusionArbitrationOptions = {},
): Promise<FusionArbitrationOutcome> {
  const unchanged = (skipped: FusionArbitrationSkip, attempted = 0): FusionArbitrationOutcome => ({
    decisions: applyFusionArbitration(decisions, []),
    attempted,
    applied: 0,
    failedBatches: 0,
    skipped,
    failures: {},
    dropped: 0,
    recovered: 0,
  });

  const candidates = selectArbitrationCandidates(decisions, englishTexts, references);
  if (!candidates.length) return unchanged('no-candidates');
  if (options.isCancelled?.()) return unchanged('cancelled');

  // The key check comes *after* candidate selection so the common offline case
  // still reports honestly which of the two reasons applied.
  let send = options.call;
  if (!send) {
    // "Use AI features" off reads as the same honest outcome as no key: the
    // cloud check did not run. Refused here rather than per batch, where it
    // would surface as a failed arbitration.
    if (!aiFeaturesEnabled()) return unchanged('no-key');
    const provider = readProvider();
    if (!provider?.apiKey) return unchanged('no-key');
    send = (prompt: string, itemCount: number) => callAiProvider(
      provider.providerId,
      provider.apiKey,
      prompt,
      FUSION_ARBITRATION_SCHEMA,
      { itemCount },
    );
  }

  const batches = batchArbitrationCandidates(candidates);
  const verdicts: ArbitrationVerdict[] = [];
  const failures: Record<string, number> = {};
  const fail = (reason: string): void => {
    failures[reason] = (failures[reason] ?? 0) + 1;
  };
  let failedBatches = 0;
  let dropped = 0;
  let recovered = 0;

  /** One request. `reason` is `null` exactly when the batch yielded verdicts. */
  const runBatch = async (batch: readonly ArbitrationCandidate[]): Promise<{
    verdicts: ArbitrationVerdict[];
    dropped: number;
    reason: string | null;
  }> => {
    try {
      const raw = await send(buildFusionArbitrationPrompt(batch), batch.length);
      const result = inspectFusionArbitration(raw, batch);
      if (result.verdicts.length) {
        // A batch that yielded *something* is not failed, but losing half its
        // rows is still worth seeing — the half `failedBatches` is blind to.
        return {
          verdicts: result.verdicts,
          dropped: Math.max(0, result.rows - result.verdicts.length),
          reason: null,
        };
      }
      // Three different defects, indistinguishable before this: a model that
      // answered with prose, one that returned an empty list, and one whose
      // every row the fidelity guard threw out.
      if (!result.parsed) return { verdicts: [], dropped: 0, reason: 'unparsable' };
      return { verdicts: [], dropped: 0, reason: result.rows ? 'rejected' : 'empty' };
    } catch (error) {
      return { verdicts: [], dropped: 0, reason: failureReason(error) };
    }
  };

  for (let i = 0; i < batches.length; i += 1) {
    if (options.isCancelled?.()) break;
    const batch = batches[i];
    const first = await runBatch(batch);
    verdicts.push(...first.verdicts);
    dropped += first.dropped;

    if (first.reason) {
      // The reason is recorded whether or not the split rescues it: the failure
      // happened, and a run that only ever succeeds on the second try is a
      // finding, not a clean run.
      fail(first.reason);
      const halves = splittableBatch(batch, first.reason) ? halve(batch) : null;
      if (!halves || options.isCancelled?.()) {
        failedBatches += 1;
      } else {
        let rescued = 0;
        for (const half of halves) {
          if (options.isCancelled?.()) break;
          // One level only. The halves do not split again, so a failed batch
          // costs at most two extra requests and the whole stage stays bounded
          // at 3x its batch count — a user pressing "fuse" is still not signing
          // up for an unbounded number of paid calls.
          const retry = await runBatch(half);
          verdicts.push(...retry.verdicts);
          dropped += retry.dropped;
          rescued += retry.verdicts.length;
          if (retry.reason) fail(retry.reason);
        }
        recovered += rescued;
        if (!rescued) failedBatches += 1;
      }
    }
    // Progress counts the original batches, so a split does not make the bar go
    // backwards or overshoot its total.
    options.onBatch?.(i + 1, batches.length);
  }

  return {
    decisions: applyFusionArbitration(decisions, verdicts),
    attempted: candidates.length,
    applied: verdicts.length,
    failedBatches,
    skipped: null,
    failures,
    dropped,
    recovered,
  };
}
