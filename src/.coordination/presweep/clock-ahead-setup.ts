/**
 * Pre-sweep class 8 — the TIME BOMB control.
 *
 * D419 (2026-09-08): `flashcardReviewPool.test.ts` turned the whole branch red
 * between one turn and the next, with no commit in between. Its fixture pinned a
 * card at a literal `Date.UTC(2026, 8, 7, 12) + one day` and called it "a valid
 * future schedule", while `filterLocalReviewsDue` defaults its `now` to
 * `Date.now()` and nothing froze the clock. At 12:00 UTC on 2026-09-08 that
 * future became the past and the assertion inverted.
 *
 * A green run today proves nothing about tomorrow, which is the whole reason it
 * reached the branch. This setup file is the control that DOES prove something:
 * move the wall clock forward and see which suites change their answer.
 *
 *     npx vitest run <files> --setupFiles src/.coordination/presweep/clock-ahead-setup.ts
 *     JP_CLOCK_AHEAD_DAYS=400 npx vitest run <files> --setupFiles ...
 *
 * A suite that passes its own `now` into the subject is deterministic and does
 * not move. A suite that computes a RELATIVE offset from a FIXED epoch and then
 * calls a function whose `now` DEFAULTS to `Date.now()` flips — and that is the
 * only shape that is dangerous.
 *
 * **Why a Date shim and not `vi.setSystemTime`.** `setSystemTime` requires fake
 * timers, and installing those globally stalls every `await` that is waiting on
 * a real timer, so half the suite would fail for a reason that has nothing to do
 * with dates. Shifting only the wall-clock READS leaves the timer wheel alone.
 *
 * This file is an INSTRUMENT, never part of the default run: it is passed on the
 * command line, and no config references it.
 *
 * **KNOWN BLIND SPOT, and the tell that identifies it.** This shifts the test
 * realm's `globalThis.Date` only. `extensionHarness.ts` runs the extension's
 * scripts in a `node:vm` context with its own globals, so the code under test
 * keeps the REAL clock while the fixtures around it move — which makes
 * `extensionRetryQueue.test.ts` report two failures that are artefacts, not
 * bombs. The tell is unmistakable and generalises to any future sandbox: the
 * discrepancy is EXACTLY `JP_CLOCK_AHEAD_DAYS` (34,560,000,000 ms at 400 days),
 * because two clocks are being compared rather than one clock being wrong.
 * A genuine bomb fails by an amount that has nothing to do with the offset.
 */

const AHEAD_DAYS = Number(process.env.JP_CLOCK_AHEAD_DAYS ?? '400');
const OFFSET_MS = AHEAD_DAYS * 24 * 60 * 60 * 1000;

const RealDate = Date;

class ShiftedDate extends RealDate {
  constructor(...args: ConstructorParameters<typeof Date> | []) {
    if (args.length === 0) {
      super(RealDate.now() + OFFSET_MS);
    } else {
      // @ts-expect-error — forwarding the real overload set verbatim is the point.
      super(...args);
    }
  }

  static now(): number {
    return RealDate.now() + OFFSET_MS;
  }
}

// `performance.now()` is deliberately NOT shifted: it is a monotonic duration
// clock, not a calendar, and nothing that reads it can be a date time bomb.
globalThis.Date = ShiftedDate as unknown as DateConstructor;
