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
 *  - **Bounded cost.** `FUSION_ARBITRATION_MAX_WINDOWS` caps the windows, the batch
 *    size caps the requests, and a batch that fails does not retry. A user pressing
 *    "fuse" is not signing up for an unbounded number of paid calls.
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
  type ArbitrationVerdict,
  type FusedWindowDecision,
} from '../shared/subtitleFusionCore';
import { callAiProvider } from './aiProviderClient';
import { getConfiguredAiProvider } from './mining';

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
  });

  const candidates = selectArbitrationCandidates(decisions, englishTexts, references);
  if (!candidates.length) return unchanged('no-candidates');
  if (options.isCancelled?.()) return unchanged('cancelled');

  // The key check comes *after* candidate selection so the common offline case
  // still reports honestly which of the two reasons applied.
  let send = options.call;
  if (!send) {
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
  for (let i = 0; i < batches.length; i += 1) {
    if (options.isCancelled?.()) break;
    const batch = batches[i];
    try {
      const raw = await send(buildFusionArbitrationPrompt(batch), batch.length);
      const result = inspectFusionArbitration(raw, batch);
      if (!result.verdicts.length) {
        failedBatches += 1;
        // Three different defects, and they were indistinguishable before this:
        // a model that answered with prose, a model that returned an empty list,
        // and a model whose every row the fidelity guard threw out.
        if (!result.parsed) fail('unparsable');
        else if (!result.rows) fail('empty');
        else fail('rejected');
      } else {
        // A batch that yielded *something* is not failed, but losing half its
        // rows is still worth seeing — this is the half `failedBatches` is blind to.
        dropped += Math.max(0, result.rows - result.verdicts.length);
      }
      verdicts.push(...result.verdicts);
    } catch (error) {
      // No retry. A failing provider fails the next batch too, and the whole
      // point of this stage being optional is that losing it costs confidence
      // rather than the track.
      failedBatches += 1;
      fail(failureReason(error));
    }
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
  };
}
