import path from 'path';
import type { LlamaModel } from 'node-llama-cpp';
import { getSharedLlama } from './llamaBackend';

/**
 * One `LlamaModel` per GGUF file for the whole main process, reference-counted by its users.
 *
 * `llamaBackend.ts` already shares the native addon. It does not share the WEIGHTS, and those are
 * where the gigabytes are: `translate.ts` and `localAgent.ts` resolve their model from the same two
 * roots (`userData/models`, then `~/Downloads`) over overlapping candidate name lists, so on an
 * ordinary profile they pick the SAME file and each used to call `llama.loadModel()` on it. The
 * comment on `TRANSLATE_CONTEXT_SIZE` records what that cost when both were warm — main settled at
 * 7,222 MB "after the local agent's own copy idle-unloaded". Two copies of a 1,223 MB Qwen3-1.7B.
 *
 * The second reason is defect D2. A load/unload cycle does not come back to where it started: with
 * the backend already shared, a measured second cycle still cost **+1,212 handles / +103.2 MB**
 * (`src/.coordination/liquid-workplace/L7_PERF_DICTIONARY.md`, 2026-08-24), which is native
 * teardown residue this process cannot reclaim from JavaScript. So the lever that is actually left
 * is to perform FEWER cycles, and this pool removes two whole classes of them: the second module
 * loading a file the first already has, and a release immediately followed by a re-acquire.
 *
 * Contexts are deliberately NOT pooled. The KV cache is per-consumer, sized differently by each
 * (`translate.ts` fixes 8,192; the agent follows its settings), and it is the part that is cheap to
 * rebuild. Callers keep creating and disposing their own context and only share the weights.
 */

/**
 * How long a model with no users stays resident before it is disposed.
 *
 * Not an idle timeout — the callers already have one (5 minutes each) and this sits under it. It
 * exists for the near miss: the user whose next lookup lands just after their own idle unload
 * fired, and the agent that asks for the file translate released a moment ago. Each of those used
 * to cost a full native cycle; inside this window they cost nothing. Short on purpose, because the
 * resource it holds is 1.2 GB.
 */
export const MODEL_RELEASE_GRACE_MS = 60_000;

interface PoolEntry {
  /** The path as first requested, kept for diagnostics and passed to `loadModel` verbatim. */
  modelPath: string;
  loading: Promise<LlamaModel>;
  /** Set once `loading` resolves; the handle that must eventually be disposed. */
  model: LlamaModel | null;
  leases: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

const pool = new Map<string, PoolEntry>();

/**
 * Windows paths are case-insensitive, so `Models\Qwen3-1.7B.gguf` and `models\qwen3-1.7b.gguf` are
 * one file and must be one entry — otherwise the pool would load the same weights twice while
 * believing it had deduplicated them, which is the exact bug it exists to prevent.
 */
function poolKey(modelPath: string): string {
  const resolved = path.resolve(modelPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** A borrowed model. `release()` is idempotent — calling it twice does not drop someone else's use. */
export interface LlamaModelLease {
  readonly model: LlamaModel;
  readonly modelPath: string;
  release(): Promise<void>;
}

function disarmGrace(entry: PoolEntry): void {
  if (entry.graceTimer) {
    clearTimeout(entry.graceTimer);
    entry.graceTimer = null;
  }
}

async function disposeEntry(key: string, entry: PoolEntry): Promise<void> {
  disarmGrace(entry);
  if (pool.get(key) === entry) pool.delete(key);
  const model = entry.model;
  entry.model = null;
  try {
    await (model as unknown as { dispose?: () => unknown } | null)?.dispose?.();
  } catch {
    /* Native teardown is best effort, as everywhere else that touches llama.cpp. */
  }
}

/**
 * Borrows the model at `modelPath`, loading it only if no one already holds it.
 *
 * Concurrent callers share one in-flight load. A load that fails is not cached, so the next attempt
 * genuinely retries rather than inheriting the rejection — the same rule `getSharedLlama` follows,
 * and for the same reason: the user who drops the GGUF into Downloads after the first error must
 * not have to restart the app.
 */
export async function acquireLlamaModel(modelPath: string): Promise<LlamaModelLease> {
  const key = poolKey(modelPath);
  // A model inside its grace window has no users but is still resident: that is the free hit, and
  // it needs no special case here — the increment below happens before any yield, so a grace timer
  // that fires later sees a non-zero count, and the unconditional `disarmGrace` after the load
  // clears the pending disposal. An extra disarm on this branch was written first and deleted: the
  // mutation control could not make it fail, because it genuinely never does anything.
  let entry = pool.get(key);

  if (!entry) {
    entry = {
      modelPath,
      model: null,
      leases: 0,
      graceTimer: null,
      loading: (async () => {
        const llama = await getSharedLlama();
        return llama.loadModel({ modelPath });
      })(),
    };
    pool.set(key, entry);
    entry.loading.catch(() => {
      if (pool.get(key) === entry) pool.delete(key);
    });
  }

  const claimed = entry;
  claimed.leases += 1;
  let model: LlamaModel;
  try {
    model = await claimed.loading;
  } catch (err) {
    // Give the count back before rethrowing, or a failed load would pin the entry at a phantom
    // user forever and its eventual successor would never be released.
    claimed.leases -= 1;
    throw err;
  }
  claimed.model = model;

  // Two cases, and this one line covers both: a release that ran while this caller was awaiting an
  // in-flight first load left the entry at zero with a timer armed, and a reacquire inside the
  // grace window arrives with the previous user's timer still pending. Either would otherwise
  // dispose a model this lease is about to hand out.
  disarmGrace(claimed);

  let released = false;
  return {
    model,
    modelPath: claimed.modelPath,
    async release(): Promise<void> {
      if (released) return;
      released = true;
      claimed.leases -= 1;
      if (claimed.leases > 0) return;
      if (pool.get(key) !== claimed) {
        // Already evicted by a shutdown; nothing of ours is left to schedule.
        return;
      }
      disarmGrace(claimed);
      claimed.graceTimer = setTimeout(() => {
        claimed.graceTimer = null;
        // Unreachable as the module stands, and kept deliberately: a lease only exists once the
        // load resolved, so an armed timer always has a settled `loading`, and any reacquire
        // therefore disarms this before the event loop can run it. No mutation control kills this
        // line — removing it is silent today and frees a model under a live context the moment
        // anything makes `loading` slow again.
        if (claimed.leases === 0) void disposeEntry(key, claimed);
      }, MODEL_RELEASE_GRACE_MS);
      // A model waiting out its grace must not keep the app alive at quit.
      claimed.graceTimer.unref?.();
    },
  };
}

/** What the pool is holding. Read by the tests and the perf probes; allocates nothing native. */
export function llamaModelPoolStats(): Array<{ modelPath: string; leases: number; resident: boolean; awaitingRelease: boolean }> {
  return [...pool.values()].map((entry) => ({
    modelPath: entry.modelPath,
    leases: entry.leases,
    resident: entry.model !== null,
    awaitingRelease: entry.graceTimer !== null,
  }));
}

/**
 * Drops every pooled model regardless of who still holds a lease. Shutdown and tests only: a caller
 * whose context outlives its model would be reading freed native memory, so nothing in normal
 * operation may call this.
 */
export async function disposeAllLlamaModels(): Promise<void> {
  const entries = [...pool.entries()];
  pool.clear();
  await Promise.all(entries.map(([key, entry]) => {
    entry.leases = 0;
    return disposeEntry(key, entry);
  }));
}
