/**
 * Exactly-once player mining.
 *
 * Two ways the one-key mine used to make a second card:
 *
 *   - **Replay on remount.** The mine request lives in the overlay's state and reaches the
 *     card panel as a prop. A panel that remounts (a layout change, the card block opened
 *     or docked) ran its "new request" effect again with the request it had already
 *     handled, and mined the line a second time. Requests now carry an id, and an id is
 *     consumed once per window, whichever panel instance sees it first.
 *   - **Double press.** Two presses on one line were two requests, so two ffmpeg cuts and
 *     two mines ran side by side. A line (source + subtitle track + cue) now has at most
 *     one mine in flight; a press while it is running is the same mine.
 *
 * Module state on purpose: the guard has to outlive the component that asks.
 */

const CONSUMED_LIMIT = 500;
const consumed = new Set<string>();
const inFlight = new Set<string>();

/**
 * Take a request for handling. True the first time an id is seen in this window, false
 * after; a request with no id (an older caller) is always taken.
 */
export function claimMineRequest(id: string | undefined | null): boolean {
  if (!id) return true;
  if (consumed.has(id)) return false;
  consumed.add(id);
  if (consumed.size > CONSUMED_LIMIT) {
    const oldest = consumed.values().next().value;
    if (oldest !== undefined) consumed.delete(oldest);
  }
  return true;
}

/** A line's identity for the in-flight guard: the source, the subtitle track and the cue. */
export function mineCueIdentity(
  sourceId: string,
  cue: { trackNumber: number; index: number; startMs: number; endMs: number },
): string {
  return `${sourceId}|${cue.trackNumber}|${cue.index}|${Math.round(cue.startMs)}|${Math.round(cue.endMs)}`;
}

/** Start mining a line. False when a mine of that same line is already running. */
export function beginCueMine(identity: string): boolean {
  if (inFlight.has(identity)) return false;
  inFlight.add(identity);
  return true;
}

export function endCueMine(identity: string): void {
  inFlight.delete(identity);
}

/** A fresh id for a mine request: unique across overlays and sessions in one window. */
export function newMineRequestId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `mine-${random}`;
}

/** Tests only. */
export function resetMineGuardsForTests(): void {
  consumed.clear();
  inFlight.clear();
}
