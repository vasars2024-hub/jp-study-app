/**
 * The debug bridge's forced collection, made safe to call more than a handful of times.
 *
 * WHY THIS FILE EXISTS — a crash, measured 2026-09-05. `/mem {gc:true}` used to do this on
 * EVERY request:
 *
 *     v8.setFlagsFromString('--expose_gc');
 *     (vm.runInNewContext('gc') as () => void)();
 *     ... finally v8.setFlagsFromString('--no-expose_gc');
 *
 * wrapped in a `try/catch` whose comment promised "never take the app down for a measurement".
 * On the fifth call of a rubric run the main process died with
 * `ReferenceError: require is not defined at Immediate.<anonymous>` — an anonymous compiled
 * script, which is what `vm.runInNewContext` produces — after the route had already answered
 * 200. **A `try/catch` cannot catch a throw that happens on a later tick**, so the promise in
 * that comment was never true, and Node documents `v8.setFlagsFromString` after startup as
 * unpredictable behaviour including crashes. Toggling a V8 flag twice per request, and minting
 * a fresh V8 context each time, is the hazard.
 *
 * Two things change and both keep the capability the rubric needs (correction 34's
 * `--long-session` requires a collector control that actually fires):
 *
 *  1. If the app was launched with `--expose-gc`, `globalThis.gc` is used directly. No flag is
 *     touched and no context is created. This is the path a measurement run should prefer.
 *  2. Otherwise the borrow happens AT MOST ONCE per process and the resulting function is
 *     cached. A second call reuses it; it never re-toggles the flag. If the borrow fails, the
 *     failure is remembered so it is not retried on a loop.
 *
 * The route already reports `gcRan`, so a refusal is honest rather than silent: `reason` says
 * which of the three outcomes happened and callers can put it in their evidence.
 */

type GcFn = () => void;

export type GcOutcome = {
  ran: boolean;
  /** `native` = globalThis.gc, `borrowed` = the one-time v8 flag borrow, or why it did not run. */
  source: 'native' | 'borrowed' | 'unavailable' | 'failed';
  reason: string;
};

/** `undefined` = not resolved yet, `null` = resolved and unavailable. */
let cached: GcFn | null | undefined;
let cachedReason = '';

/** Test seam only. Never called by the bridge. */
export function resetGcBorrowForTests(): void {
  cached = undefined;
  cachedReason = '';
}

/**
 * Resolve the collector once. `deps` is injected so this is testable without a live V8 —
 * the bridge passes the real `node:v8` and `node:vm`.
 */
export function resolveCollector(deps: {
  globalGc?: unknown;
  setFlagsFromString: (flag: string) => void;
  runInNewContext: (code: string) => unknown;
}): GcOutcome {
  if (typeof deps.globalGc === 'function') {
    // Not cached: if the app was started with --expose-gc this is free and always valid.
    return { ran: false, source: 'native', reason: 'globalThis.gc (app launched with --expose-gc)' };
  }
  if (cached === undefined) {
    try {
      deps.setFlagsFromString('--expose_gc');
      const fn = deps.runInNewContext('gc');
      if (typeof fn !== 'function') throw new Error('vm context did not expose gc');
      cached = fn as GcFn;
      cachedReason = 'borrowed once via --expose_gc; reused for the life of this process';
    } catch (err) {
      cached = null;
      cachedReason = `borrow failed: ${String(err)}`;
    } finally {
      // Restore the flag exactly once, alongside the single borrow that flipped it.
      try {
        deps.setFlagsFromString('--no-expose_gc');
      } catch {
        /* ignore — the borrow above is what mattered */
      }
    }
  }
  if (cached === null) return { ran: false, source: 'failed', reason: cachedReason };
  return { ran: false, source: 'borrowed', reason: cachedReason };
}

/**
 * Run a collection if one can be run safely. Never throws: a measurement route must not be
 * able to fail a request, and — unlike the code this replaces — it also never arms a throw on
 * a later tick, because after the first call no flag is toggled and no context is created.
 */
export function forceCollect(deps: {
  globalGc?: unknown;
  setFlagsFromString: (flag: string) => void;
  runInNewContext: (code: string) => unknown;
}): GcOutcome {
  const resolved = resolveCollector(deps);
  if (resolved.source === 'native') {
    try {
      (deps.globalGc as GcFn)();
      return { ran: true, source: 'native', reason: resolved.reason };
    } catch (err) {
      return { ran: false, source: 'failed', reason: `globalThis.gc threw: ${String(err)}` };
    }
  }
  if (resolved.source !== 'borrowed' || !cached) return resolved;
  try {
    cached();
    return { ran: true, source: 'borrowed', reason: resolved.reason };
  } catch (err) {
    return { ran: false, source: 'failed', reason: `borrowed gc threw: ${String(err)}` };
  }
}
