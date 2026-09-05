/**
 * The interlinear's *in-process* caches, warmed once while nobody is waiting.
 *
 * ## This is the second half of a warm-up that already exists
 *
 * `dictionary/warmup.ts` warms the OS **file** cache by reading `dict.db`
 * through. That was the right half of the problem and it is not this one: the
 * caches below live in V8, are rebuilt in every new process, and no amount of
 * file-cache warming touches them.
 *
 * ## What is actually slow, measured rather than assumed
 *
 * cat7/translate measured a **4.2 s main-process freeze** on the first language
 * swap of a fresh process, and only the first: swap 2 cost 5,886 ms and swaps
 * 3-8 cost 12-48 ms over the identical token pair (`1cd6874e`). That was
 * recorded as "cold index pages on a 375 MB dict.db". **It is not.** Measured
 * 2026-09-05 against this installation, outside Electron, one arm per process:
 *
 *   `lookupOfflineInterlinear` over the real 537 MB dict.db    86.0 ms
 *   warm with a DISJOINT passage first, then the scored one    53.2 ms
 *   the same passage twice                                     41.6 ms
 *
 * 86 ms is not 5,886 ms, and the three arms agree with each other — which is
 * what rules the SQLite half out, rather than one lucky reading. The cost is
 * three *other* caches `lookupOfflineInterlinearMerged` builds lazily, each
 * exactly once per process, each synchronously on main:
 *
 *   `listFrequencyDictionaryFiles()`  2,315 ms cold / 525 ms warm-file-cache
 *       — `mining.ts:957` JSON.parses every rank table into memory. Measured
 *         here: 4 files, 20.12 MB, **551,605 ranks**. Reached once per passage
 *         via `resolveCustomFrequencyRanks`, and the first token pays for all.
 *   kuromoji's IPADIC build              938 ms cold / 265 ms warm-file-cache
 *       — `getMainJapaneseTokenizer()`, awaited by the part-of-speech pass.
 *   the prepared-statement cache + db open                      86 ms
 *       — `prepareCached` already fixed the ruinous half (2,960 ms, see
 *         `dictionary/db.ts`); the open and the first compile are what remain.
 *
 * ## Why a timer and not a worker
 *
 * CLAUDE.md says heavy work goes to a worker *or* is safely chunked. A worker
 * cannot help: every cache above is process-wide state that **main itself**
 * reads on the next lookup, so building it elsewhere builds it in the wrong
 * process. Chunking is the honest option and its limit is stated plainly — a
 * single `JSON.parse` cannot be split, so the longest block this can promise is
 * one leg, not one frame. What it does promise is that the loop drains before
 * every leg and that none of it lands on the boot path.
 *
 * ## Why this module knows nothing about dictionaries
 *
 * Its legs are injected. `dictionary.ts` already imports all three sources and
 * supplies them at the wiring site; importing them here instead would close a
 * cycle (`dictionary.ts` -> this -> `dictionary.ts`) for no gain. What is left
 * is a scheduler that can be tested without a 537 MB file.
 */

export interface CacheWarmupLegReport {
  name: string;
  ms: number;
  ok: boolean;
  /** Present only when the leg threw. The warm-up itself still succeeds. */
  error?: string;
}

export interface CacheWarmupReport {
  legs: CacheWarmupLegReport[];
  totalMs: number;
  /** The longest single leg — the number this module exists to keep off a swap. */
  longestLegMs: number;
}

export interface CacheWarmupLeg {
  name: string;
  run: () => unknown | Promise<unknown>;
}

export interface CacheWarmupOptions {
  legs: readonly CacheWarmupLeg[];
  /** Injected in tests; `performance.now` in production. */
  now?: () => number;
  /** Drains the event loop before each leg. Injected so a test can observe it. */
  yieldToLoop?: () => Promise<void>;
  log?: (report: CacheWarmupReport) => void;
}

/**
 * Armed after `DICT_WARMUP_DELAY_MS`, deliberately: the page warm-up puts
 * `dict.db` in the file cache first, which is what makes the interlinear leg
 * below cheap rather than another cold read. Late enough, too, that first paint
 * and the renderer's own first render have gone by — this is not keyed to
 * `did-finish-load`, which fires at the busiest moment of the boot, not the
 * settled one.
 */
export const DICT_CACHE_WARMUP_DELAY_MS = 12_000;

const drainLoop = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

let running: Promise<CacheWarmupReport> | null = null;
let warmupTimer: NodeJS.Timeout | null = null;
/**
 * Armed-ness is tracked separately from the handle rather than read off it. A
 * scheduler is allowed to return nothing — `setTimeout` happens to return a
 * truthy `Timeout`, but nothing in the contract says so — and a guard that keys
 * on the handle would then arm the warm-up once per call.
 */
let warmupArmed = false;

/**
 * Run the warm-up once per process. A second call returns the first result
 * rather than paying again — the caches it builds are process-wide, so repeating
 * it is pure cost.
 */
export function runDictionaryCacheWarmup(options: CacheWarmupOptions): Promise<CacheWarmupReport> {
  if (running) return running;
  running = warmOnce(options);
  return running;
}

async function warmOnce(options: CacheWarmupOptions): Promise<CacheWarmupReport> {
  const now = options.now ?? (() => performance.now());
  const yieldToLoop = options.yieldToLoop ?? drainLoop;
  const reports: CacheWarmupLegReport[] = [];
  const started = now();

  for (const leg of options.legs) {
    // Drain BEFORE each leg rather than merely between them, so the first leg
    // cannot run in the same tick as whatever scheduled it.
    await yieldToLoop();
    const legStarted = now();
    try {
      await leg.run();
      reports.push({ name: leg.name, ms: now() - legStarted, ok: true });
    } catch (error) {
      // A warm-up is an optimisation. A missing rank file or an unbuildable
      // tokenizer must degrade to "the next real lookup pays what it would have
      // paid anyway", never to an error a reader can see.
      reports.push({
        name: leg.name,
        ms: now() - legStarted,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report: CacheWarmupReport = {
    legs: reports,
    totalMs: now() - started,
    longestLegMs: reports.reduce((max, leg) => (leg.ms > max ? leg.ms : max), 0),
  };
  (options.log ?? defaultLog)(report);
  return report;
}

function defaultLog(report: CacheWarmupReport): void {
  const legs = report.legs
    .map((leg) => `${leg.name} ${leg.ms.toFixed(0)}ms${leg.ok ? '' : ` FAILED(${leg.error})`}`)
    .join(', ');
  console.log(
    `[dict-cache-warmup] ${report.totalMs.toFixed(0)}ms total, longest leg ${report.longestLegMs.toFixed(0)}ms — ${legs}`,
  );
}

export interface ScheduleCacheWarmupOptions extends CacheWarmupOptions {
  delayMs?: number;
  /** Injected in tests; `setTimeout` in production. */
  schedule?: (fn: () => void, ms: number) => NodeJS.Timeout | unknown;
}

/**
 * Arm the warm-up. Returns nothing on purpose: the caller is a registration
 * function, and being able to await this would put the whole warm-up back on the
 * boot path it exists to stay off.
 */
export function scheduleDictionaryCacheWarmup(options: ScheduleCacheWarmupOptions): void {
  if (warmupArmed) return;
  warmupArmed = true;
  const schedule = options.schedule ?? setTimeout;
  const handle = schedule(() => {
    warmupTimer = null;
    void runDictionaryCacheWarmup(options);
  }, options.delayMs ?? DICT_CACHE_WARMUP_DELAY_MS);
  warmupTimer = (handle ?? null) as NodeJS.Timeout | null;
  // Not a reason to keep the process alive: quitting during the delay should quit.
  warmupTimer?.unref?.();
}

/** Cancels a scheduled-but-not-started warm-up. Test seam and quit path. */
export function cancelScheduledDictionaryCacheWarmup(): void {
  if (warmupTimer) clearTimeout(warmupTimer);
  warmupTimer = null;
  warmupArmed = false;
}

/** Test seam: forget that this process was warmed. Never called in production. */
export function resetDictionaryCacheWarmupForTests(): void {
  cancelScheduledDictionaryCacheWarmup();
  running = null;
}
