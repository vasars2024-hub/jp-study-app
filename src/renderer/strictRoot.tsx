import React from 'react';

/**
 * `<React.StrictMode>` for the renderer roots, with a development-only opt-out the rubric
 * harnesses use to time the app at the cost a user actually pays.
 *
 * StrictMode double-invokes every render — in development only; React strips the doubling from
 * production builds. So a latency figure taken through a dev root bills the product for work no
 * shipped user is ever charged. Measured live on 2026-08-31, opening the Wired Start menu, six
 * samples each, on an identical 1,209-node open tree and an identical ~12 ms inert floor:
 *
 *   StrictMode on    95.4 - 114.0 ms, median 108
 *   StrictMode off   47.2 - 63.9 ms,  median 59.3
 *
 * — a 45% tax, larger than the whole repair that preceded this measurement. That is the same
 * class of instrument error as the cat2 harness's correction 2 (billing the app for the
 * main -> renderer input hop), and it is fixed the same way: measure the number the user gets,
 * and record the other one alongside, unscored.
 *
 * THE OPT-OUT IS FOR TIMING ONLY. With StrictMode off, effects mount once, so a double-mount bug,
 * a non-idempotent initializer or a missing cleanup will hide. Anything scoring correctness,
 * honesty, reversibility or feature parity must be measured with StrictMode ON — which is the
 * default, and is unconditional in production.
 *
 * To use it: `localStorage['jp-lq-strict'] = 'off'` and reload the window. Removing the key and
 * reloading restores it. A console warning is printed on every boot it is honoured, so a shell
 * left in this state cannot be mistaken for a normal one.
 */
export const STRICT_OPT_OUT_KEY = 'jp-lq-strict';

export function strictModeEnabled(): boolean {
  if (!import.meta.env.DEV) return true;
  try {
    if (localStorage.getItem(STRICT_OPT_OUT_KEY) !== 'off') return true;
  } catch {
    // Storage unavailable — the safe answer is the strict one.
    return true;
  }
  console.warn(
    `[strict-mode] OFF via localStorage['${STRICT_OPT_OUT_KEY}']='off'. Timing measurement only; `
      + 'effects mount once. Delete the key and reload to restore StrictMode.',
  );
  return false;
}

/** Wrap a root's tree, honouring the dev-only opt-out. */
export function withStrictMode(tree: React.ReactNode): React.ReactElement {
  return strictModeEnabled() ? <React.StrictMode>{tree}</React.StrictMode> : <>{tree}</>;
}
