import path from 'path';
import type { LlamaContext, LlamaContextSequence, LlamaModel } from 'node-llama-cpp';
import {
  acquireLlamaModel,
  MODEL_RELEASE_GRACE_MAX_MS,
  MODEL_RELEASE_GRACE_MS,
  type LlamaModelLease,
} from './llamaModelPool';

/**
 * One warm `LlamaContext` per (GGUF, contextSize) for the whole main process.
 *
 * `llamaModelPool.ts` shares the WEIGHTS and made a repeat user's reload free. Measuring three
 * cycles afterwards decomposed what was left of defect D2 and produced the reason this module
 * exists (`src/.coordination/liquid-workplace/L7_PERF_DICTIONARY.md`, 2026-08-24): with the weights
 * already resident, a cycle still cost **612 handles and +1,298.5 MB**, and that is the KV CACHE.
 * At 8,192 tokens × ~112 KB/token for Qwen3-1.7B it is now the LARGER half of the bill — 1,298 MB
 * against a 1,223 MB model file — because `translate.ts` disposes its context on every idle unload
 * and `createContext()` rebuilds the cache from nothing on the next lookup.
 *
 * Shrinking `TRANSLATE_CONTEXT_SIZE` is deliberately NOT the lever: `sentenceAnalysis.ts:212` and
 * `mining.ts:1408` legitimately ask for up to 8,192 output tokens, so a smaller context clamps real
 * work. Performing fewer cycles is the lever, exactly as it was for the weights.
 *
 * A context is checked out EXCLUSIVELY, unlike a model. Two reasons, both structural rather than
 * cautious: a `LlamaContext` created with the default `sequences: 1` has one sequence to give, and
 * a shared one would carry one consumer's chat history into another's prompt. So the pool holds at
 * most one entry per key and hands it to at most one holder; a second concurrent caller for the
 * same key gets its own unpooled context, which is exactly what every caller got before this
 * module existed. The win is across TIME (the idle unload that comes straight back), not across
 * concurrent consumers.
 */

/**
 * A reacquire this soon after a disposal is churn. Same window and same reasoning as the model
 * pool's, which is not a coincidence: both callers arm a 5-minute idle deadline, so the user whose
 * pauses are longer than that deadline and shorter than this is the one paying for cycles.
 */
const CONTEXT_CHURN_WINDOW_MS = 5 * 60_000;

/**
 * The grace and its ceiling are the model pool's own exported constants rather than copies, so the
 * two residency policies cannot drift apart. The churn bookkeeping below is duplicated instead of
 * shared because the KEY differs — a model is keyed by file, a context by file AND size, and the
 * same file at two sizes churns independently.
 */
export const CONTEXT_RELEASE_GRACE_MS = MODEL_RELEASE_GRACE_MS;
export const CONTEXT_RELEASE_GRACE_MAX_MS = MODEL_RELEASE_GRACE_MAX_MS;

interface ContextEntry {
  modelPath: string;
  contextSize: number;
  modelLease: LlamaModelLease;
  context: LlamaContext;
  sequence: LlamaContextSequence;
  /** At most one holder at a time; see the exclusivity note above. */
  leased: boolean;
  graceTimer: ReturnType<typeof setTimeout> | null;
  graceMs: number;
  /**
   * Set by `teardown`, and the reason it exists: `disposeAllLlamaContexts` can evict an entry whose
   * holder still has a lease, and that holder's later `release()` would otherwise free the same
   * native handles a second time and hand the model pool a second decrement it never lent out.
   */
  torn: boolean;
}

const pool = new Map<string, ContextEntry>();
/** Per-key churn history, kept across disposals, exactly as the model pool keeps its own. */
const churn = new Map<string, { disposedAt: number; count: number }>();

function contextKey(modelPath: string, contextSize: number): string {
  // Windows paths are case-insensitive, so the same normalisation the model pool applies has to
  // apply here or one file at one size would occupy two entries and neither would ever be a hit.
  const resolved = path.resolve(modelPath);
  const filePart = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  return `${filePart}::${contextSize}`;
}

/**
 * How long this context lingers after its holder lets go. Doubling per churned rebuild, capped:
 * a cycle's cost is permanent and cumulative while residency is temporary and bounded, so a size
 * the user keeps returning to stops being rebuilt, and one they have finished with frees on the
 * first gap longer than `CONTEXT_CHURN_WINDOW_MS`.
 */
function churnGraceMs(key: string, now: number): number {
  const history = churn.get(key);
  if (!history) return CONTEXT_RELEASE_GRACE_MS;
  if (now - history.disposedAt > CONTEXT_CHURN_WINDOW_MS) {
    churn.delete(key);
    return CONTEXT_RELEASE_GRACE_MS;
  }
  history.count += 1;
  return Math.min(CONTEXT_RELEASE_GRACE_MS * 2 ** history.count, CONTEXT_RELEASE_GRACE_MAX_MS);
}

/**
 * A borrowed context and the one sequence it has to give.
 *
 * `model` is on the lease because both callers tokenize against the exact weights the generation
 * uses when they budget their output (`translate.ts:165`, `localAgent.ts:241`), and asking them to
 * hold a second lease just to reach it would reintroduce the retention shape the pool exists to
 * remove.
 */
export interface LlamaContextLease {
  readonly context: LlamaContext;
  readonly sequence: LlamaContextSequence;
  readonly model: LlamaModel;
  readonly modelPath: string;
  readonly contextSize: number;
  /** True when this lease reused a resident KV cache instead of building one. */
  readonly warm: boolean;
  release(): Promise<void>;
}

function disarmGrace(entry: ContextEntry): void {
  if (entry.graceTimer) {
    clearTimeout(entry.graceTimer);
    entry.graceTimer = null;
  }
}

/** Innermost first: the sequence belongs to the context, the context to the weights. Idempotent. */
async function teardown(entry: ContextEntry): Promise<void> {
  if (entry.torn) return;
  entry.torn = true;
  try {
    entry.sequence.dispose();
  } catch {
    /* Native teardown is best effort here for the same reason it is everywhere else in this area. */
  }
  try {
    await entry.context.dispose();
  } catch {
    /* As above. */
  }
  try {
    await entry.modelLease.release();
  } catch {
    /* As above. */
  }
}

async function disposeEntry(key: string, entry: ContextEntry): Promise<void> {
  disarmGrace(entry);
  if (pool.get(key) === entry) pool.delete(key);
  // Only a real disposal counts as churn, so the window means "how long the cache was actually
  // gone" rather than "how long since somebody let go of it".
  churn.set(key, { disposedAt: Date.now(), count: churn.get(key)?.count ?? 0 });
  await teardown(entry);
}

function leaseFor(key: string, entry: ContextEntry, warm: boolean): LlamaContextLease {
  let released = false;
  return {
    context: entry.context,
    sequence: entry.sequence,
    model: entry.modelLease.model,
    modelPath: entry.modelPath,
    contextSize: entry.contextSize,
    warm,
    async release(): Promise<void> {
      if (released) return;
      released = true;
      entry.leased = false;
      if (pool.get(key) !== entry) {
        // Either an unpooled second context, or one already evicted by a shutdown. Both own their
        // native memory outright and nothing else can hand them out, so they go now.
        await teardown(entry);
        return;
      }
      disarmGrace(entry);
      entry.graceTimer = setTimeout(() => {
        entry.graceTimer = null;
        if (!entry.leased) void disposeEntry(key, entry);
      }, entry.graceMs);
      // A cache waiting out its grace must not keep the app alive at quit.
      entry.graceTimer.unref?.();
    },
  };
}

/** Builds a context from scratch. Releases everything it managed to allocate if any step fails. */
async function buildEntry(modelPath: string, contextSize: number, graceMs: number): Promise<ContextEntry> {
  const modelLease = await acquireLlamaModel(modelPath);
  let context: LlamaContext | null = null;
  try {
    context = await modelLease.model.createContext({ contextSize });
    const sequence = context.getSequence();
    return {
      modelPath,
      contextSize,
      modelLease,
      context,
      sequence,
      leased: true,
      graceTimer: null,
      graceMs,
      torn: false,
    };
  } catch (err) {
    // `createContext` is the biggest allocation in this function and `out of VRAM` on a KV cache is
    // its ordinary failure, so the partial state has to be given back here — an unreachable context
    // over borrowed weights is the exact retention shape this area keeps producing.
    try {
      await context?.dispose();
    } catch {
      /* Best effort. */
    }
    await modelLease.release();
    throw err;
  }
}

/**
 * Borrows a context of `contextSize` over the model at `modelPath`, reusing a resident one when the
 * pool is holding a free match.
 *
 * The reused sequence has its history cleared before it is handed over, so a caller always receives
 * an empty context and can build a fresh `LlamaChatSession` on it. A sequence that refuses to clear
 * is not safe to hand out: the entry is disposed and a cold one built, which costs what the caller
 * would have paid anyway.
 */
export async function acquireLlamaContext(modelPath: string, contextSize: number): Promise<LlamaContextLease> {
  const key = contextKey(modelPath, contextSize);
  const resident = pool.get(key);

  if (resident && !resident.leased) {
    // Claimed before the first await, so a concurrent caller cannot take the same entry.
    resident.leased = true;
    disarmGrace(resident);
    try {
      await resident.sequence.clearHistory();
      return leaseFor(key, resident, true);
    } catch {
      resident.leased = false;
      await disposeEntry(key, resident);
    }
  }

  const entry = await buildEntry(modelPath, contextSize, churnGraceMs(key, Date.now()));
  // Not `else` on the branch above: an entry can have appeared while this load was in flight, and
  // whoever got there first owns the slot. The loser is unpooled and disposes itself on release,
  // which is precisely the behaviour every caller had before this module.
  if (!pool.has(key)) pool.set(key, entry);
  return leaseFor(key, entry, false);
}

/** What the pool is holding. Read by the tests and the perf probes; allocates nothing native. */
export function llamaContextPoolStats(): Array<{
  modelPath: string;
  contextSize: number;
  leased: boolean;
  awaitingRelease: boolean;
  graceMs: number;
}> {
  return [...pool.values()].map((entry) => ({
    modelPath: entry.modelPath,
    contextSize: entry.contextSize,
    leased: entry.leased,
    awaitingRelease: entry.graceTimer !== null,
    graceMs: entry.graceMs,
  }));
}

/**
 * Drops every pooled context regardless of who still holds it. Shutdown and tests only: a caller
 * still prompting through a freed sequence would be reading freed native memory.
 */
export async function disposeAllLlamaContexts(): Promise<void> {
  const entries = [...pool.entries()];
  pool.clear();
  await Promise.all(entries.map(([key, entry]) => {
    entry.leased = false;
    return disposeEntry(key, entry);
  }));
  // Shutdown is not churn, and a test that left history behind would score the next one's backoff.
  churn.clear();
}
