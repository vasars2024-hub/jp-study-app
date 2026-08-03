/**
 * Phase 6 slice 8 — the media half joins Study OS's activity ledger.
 *
 * Every study surface in this app answers "did you study today?" from one store:
 * `renderer/stats.ts`, written only by the two *readers* (`NovelReader`, the immersion
 * browser). So an evening spent mining an episode in the adopted player produced a `0`
 * day streak, an empty heat-map cell, and a "Read today: 0s" widget — the app's own
 * judgement of the user's day was blind to the entire half of it this migration built.
 * This module is the honest half of the join: turning a video element's clock into
 * seconds that can be *claimed* as study time.
 *
 * It is pure. No `localStorage`, no DOM, no I/O — the caller samples the element and
 * hands the numbers in, the same rule `seanimeContinueWatching.ts` follows.
 *
 * ## Five rules, each with an obvious wrong alternative
 *
 * 1. **Wall-clock while playing, not media time.** The ledger's existing unit is *time
 *    spent*: `recordReading` flushes seconds the reader was open. Counting media time
 *    instead would credit a 2× rewatch with an hour the user never spent, and would
 *    credit nothing at all for the app's own line-loop. So an interval contributes the
 *    real time that elapsed across it — see rule 5 for why direction is then irrelevant.
 *
 * 2. **Both ends of an interval must be playing.** A pause somewhere inside an interval
 *    makes the playing fraction unknowable, and guessing half of it is an invented
 *    number. Nothing is credited for that interval instead. This costs almost nothing:
 *    `timeupdate` fires roughly four times a second during playback, so the discarded
 *    fragment is a fraction of a second, and the deliberate consequence is that the
 *    study overlay's auto-pause, shadowing and dictionary time are **not** counted.
 *    That under-states a study session, which is the direction to err in — the
 *    alternative is a number that grows while the user is asleep with a paused window.
 *
 * 3. **An interval is capped, not trusted.** {@link WATCH_TIME_MAX_INTERVAL_SEC} bounds
 *    what one sample gap may contribute. A suspended machine resumes with a `Date.now()`
 *    delta of hours across which the player was playing for none of it. Capping rather
 *    than discarding keeps a genuinely slow tick (a stutter, a busy main thread) honest.
 *
 * 4. **A frozen clock earns nothing.** Buffering can fire `timeupdate` with an unchanged
 *    `currentTime`; the element is "playing" and nothing is being watched. An interval
 *    of at least {@link WATCH_TIME_STALL_SEC} across which the position did not move at
 *    all is a stall and contributes zero.
 *
 * 5. **Going backwards is not cheating.** Replaying a line is the single most common
 *    action in this app's player. Clamping credit to *forward* media progress — the
 *    obvious anti-fraud reflex — would zero out precisely the behaviour the ledger
 *    should reward. Only elapsed time is counted, so a seek in either direction is just
 *    an interval like any other.
 *
 * The output is deliberately a *pending* balance the caller flushes on its own schedule
 * ({@link WATCH_TIME_FLUSH_SEC}), because the ledger write is a `localStorage`
 * read-modify-write and `timeupdate` fires four times a second.
 */

/**
 * The most one sample gap may contribute, in seconds.
 *
 * Above this the gap is a suspend, a throttled background window or a stopped debugger,
 * not viewing. `timeupdate` fires ~4×/s while playing, so a real gap is ~0.25 s and this
 * is two orders of magnitude of headroom.
 */
export const WATCH_TIME_MAX_INTERVAL_SEC = 10;

/** An interval at least this long with a completely unmoved position is a stall (rule 4). */
export const WATCH_TIME_STALL_SEC = 2;

/**
 * How much may accrue before the caller should write it to the ledger.
 *
 * The write is a JSON read-modify-write of the whole stats blob; doing it per
 * `timeupdate` would be four of those a second for the length of an episode.
 */
export const WATCH_TIME_FLUSH_SEC = 15;

/** Below this a flush is not worth a storage write — rounding noise, not viewing. */
export const WATCH_TIME_MIN_FLUSH_SEC = 0.5;

/** One observation of the video element. The caller reads all three from the same tick. */
export interface WatchTimeSample {
  /** Epoch ms. `Date.now()` at the moment the element was read. */
  atMs: number;
  /** The element's `currentTime`. */
  positionSec: number;
  /** `!video.paused` — not "has a play intent", the actual element state. */
  playing: boolean;
}

export interface WatchTimeState {
  /** The previous sample, or `null` before the first one. */
  last: WatchTimeSample | null;
  /** Credited but not yet handed to the ledger. */
  pendingSec: number;
  /** Everything this accumulator has ever credited. Diagnostics and tests. */
  creditedSec: number;
}

export function createWatchTimeState(): WatchTimeState {
  return { last: null, pendingSec: 0, creditedSec: 0 };
}

function isUsableSample(sample: WatchTimeSample | null | undefined): sample is WatchTimeSample {
  return (
    !!sample
    && typeof sample.atMs === 'number'
    && Number.isFinite(sample.atMs)
    && typeof sample.positionSec === 'number'
    && Number.isFinite(sample.positionSec)
    && typeof sample.playing === 'boolean'
  );
}

/**
 * How much the interval between two samples is worth, in seconds. Exported for tests and
 * so the rules above have exactly one implementation.
 */
export function watchTimeCredit(
  previous: WatchTimeSample,
  next: WatchTimeSample,
): number {
  // Rule 2 — a pause at either end makes the playing fraction unknowable.
  if (!previous.playing || !next.playing) return 0;

  const elapsedSec = (next.atMs - previous.atMs) / 1000;
  // A clock that went backwards (a system time change) is not an interval.
  if (!(elapsedSec > 0)) return 0;

  // Rule 4 — "playing" with a frozen clock is buffering, not viewing.
  if (elapsedSec >= WATCH_TIME_STALL_SEC && next.positionSec === previous.positionSec) {
    return 0;
  }

  // Rule 3 — cap, do not trust. Rule 5 — direction of the seek never enters this.
  return Math.min(elapsedSec, WATCH_TIME_MAX_INTERVAL_SEC);
}

/**
 * Fold one observation in. Pure: returns the next state, never mutates the one given.
 *
 * A malformed sample is dropped *and* clears `last`, so the next good sample starts a
 * fresh interval rather than being paired with a stale one across an unknown gap.
 */
export function watchTimeSample(
  state: WatchTimeState,
  sample: WatchTimeSample,
): WatchTimeState {
  if (!isUsableSample(sample)) {
    return { last: null, pendingSec: state.pendingSec, creditedSec: state.creditedSec };
  }
  const credit = isUsableSample(state.last) ? watchTimeCredit(state.last, sample) : 0;
  return {
    last: sample,
    pendingSec: state.pendingSec + credit,
    creditedSec: state.creditedSec + credit,
  };
}

/** True once the pending balance is worth a ledger write. */
export function watchTimeShouldFlush(state: WatchTimeState): boolean {
  return state.pendingSec >= WATCH_TIME_FLUSH_SEC;
}

export interface WatchTimeFlush {
  state: WatchTimeState;
  /** Seconds to hand to the ledger. `0` means "do not write". */
  seconds: number;
}

/**
 * Take the pending balance.
 *
 * `last` is preserved, so flushing mid-playback does not lose the interval in progress —
 * a flush is a bookkeeping event, not an interruption. Anything below
 * {@link WATCH_TIME_MIN_FLUSH_SEC} is left pending rather than written, so a flush on
 * unmount immediately after one on a timer does not cost a storage round-trip for a
 * hundredth of a second.
 */
export function watchTimeFlush(state: WatchTimeState): WatchTimeFlush {
  if (!(state.pendingSec >= WATCH_TIME_MIN_FLUSH_SEC)) {
    return { state, seconds: 0 };
  }
  // Two decimals: the ledger is JSON in localStorage and float tails serialise as noise.
  const seconds = Math.round(state.pendingSec * 100) / 100;
  return {
    state: { last: state.last, pendingSec: 0, creditedSec: state.creditedSec },
    seconds,
  };
}

/**
 * End the current interval without discarding what it already earned.
 *
 * Called when the element goes away or the file changes: the next sample must not be
 * paired with this one, because the gap between them is not viewing time.
 */
export function watchTimeInterrupt(state: WatchTimeState): WatchTimeState {
  return { last: null, pendingSec: state.pendingSec, creditedSec: state.creditedSec };
}

/**
 * Close out a playing interval at the exact moment playback stopped, then interrupt.
 *
 * For the `pause` and `ended` events specifically. By the time either handler runs the
 * element already reports `paused === true`, so sampling it verbatim would let rule 2
 * discard the fragment since the last `timeupdate` — up to a quarter second every time
 * the user pauses, which in a study session is constantly. The event *is* the transition,
 * so the interval that ends at it was playing for all of it, and saying so here is a fact
 * rather than the guess rule 2 refuses to make.
 *
 * Still safe if playback was already stopped: rule 2 sees the previous sample's
 * `playing: false` and credits nothing.
 */
export function watchTimeStop(
  state: WatchTimeState,
  stoppedAt: Omit<WatchTimeSample, 'playing'>,
): WatchTimeState {
  return watchTimeInterrupt(watchTimeSample(state, { ...stoppedAt, playing: true }));
}
