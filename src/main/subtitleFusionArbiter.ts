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
  parseFusionArbitration,
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
  let failedBatches = 0;
  for (let i = 0; i < batches.length; i += 1) {
    if (options.isCancelled?.()) break;
    const batch = batches[i];
    try {
      const raw = await send(buildFusionArbitrationPrompt(batch), batch.length);
      const parsed = parseFusionArbitration(raw, batch);
      if (!parsed.length) failedBatches += 1;
      verdicts.push(...parsed);
    } catch {
      // No retry. A failing provider fails the next batch too, and the whole
      // point of this stage being optional is that losing it costs confidence
      // rather than the track.
      failedBatches += 1;
    }
    options.onBatch?.(i + 1, batches.length);
  }

  return {
    decisions: applyFusionArbitration(decisions, verdicts),
    attempted: candidates.length,
    applied: verdicts.length,
    failedBatches,
    skipped: null,
  };
}
