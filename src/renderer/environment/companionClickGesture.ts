/**
 * Arbitration for left-button gestures on an in-app desktop pet.
 *
 * Three gestures share the left button — drag, single click (primary routine)
 * and double click (secondary routine) — and the primary used to win all three:
 *
 * - It ran on the *first* click of a double click, so a double click always
 *   fired primary-then-secondary instead of secondary alone.
 * - It ran again when a drag released. `onBuddyClick`'s `dragRef.current?.moved`
 *   guard cannot see the drag: the window `pointerup` listener nulls `dragRef`
 *   and the DOM only fires `click` after `pointerup`, so the guard reads `null`
 *   every time. The drag outcome has to be carried across the gap explicitly,
 *   which is what `suppress` is.
 *
 * Kept pure and separate from the component so the three-way arbitration is
 * unit-testable — it is all deadlines, and deadlines are what a live probe is
 * worst at pinning down.
 */

/** Window in which a second click counts as a double click. */
export const CLICK_GAP_MS = 320;

/**
 * How long a completed drag swallows the `click` it produces. Only needs to
 * cover pointerup→click (same task in practice); the margin is for a stalled
 * frame, and it is bounded so a later, genuine click is never eaten.
 */
export const DRAG_CLICK_SUPPRESS_MS = 600;

/**
 * Press-and-hold before the hold gesture fires. Long enough that an ordinary
 * click never reaches it, short enough to feel deliberate — and the pointer must
 * not have travelled `DRAG_THRESHOLD`, or the press is a drag and hold is off.
 */
export const HOLD_MS = 550;

export interface ClickGestureState {
  /** A drag that moved the pet, waiting to swallow the click it will produce. */
  suppress: { id: string; t: number } | null;
  /** First click of a possible double click, with its primary run deferred. */
  pending: { id: string; t: number } | null;
}

export type ClickGestureAction =
  /** The click ended a drag — no routine runs. */
  | { kind: 'ignore'; reason: 'drag' }
  /** Run the primary routine after `delayMs`, unless a second click arrives. */
  | { kind: 'schedulePrimary'; delayMs: number }
  /** Second click inside the gap — run the secondary and cancel the primary. */
  | { kind: 'runSecondary' };

export function emptyClickGestureState(): ClickGestureState {
  return { suppress: null, pending: null };
}

/**
 * Call from the drag `pointerup` handler. A drag that moved cancels any primary
 * still pending from an earlier click as well as the click it is about to
 * produce — otherwise grabbing the pet right after clicking it fires a routine
 * mid-drag.
 */
export function noteDragEnd(
  state: ClickGestureState,
  id: string,
  moved: boolean,
  now: number,
): { next: ClickGestureState; cancelPending: boolean } {
  if (!moved) return { next: state, cancelPending: false };
  return { next: { suppress: { id, t: now }, pending: null }, cancelPending: true };
}

/**
 * Call when the hold gesture fires. A hold consumes the press outright: the
 * `click` that release will produce is swallowed by the same mechanism a drag
 * uses, and a primary still counting down from an earlier click is dropped.
 */
export function noteHold(state: ClickGestureState, id: string, now: number): ClickGestureState {
  void state;
  return { suppress: { id, t: now }, pending: null };
}

export function decideClick(
  state: ClickGestureState,
  id: string,
  now: number,
): { action: ClickGestureAction; next: ClickGestureState } {
  const sup = state.suppress;
  if (sup && sup.id === id && now - sup.t < DRAG_CLICK_SUPPRESS_MS) {
    return { action: { kind: 'ignore', reason: 'drag' }, next: emptyClickGestureState() };
  }
  const pending = state.pending;
  if (pending && pending.id === id && now - pending.t < CLICK_GAP_MS) {
    return { action: { kind: 'runSecondary' }, next: emptyClickGestureState() };
  }
  return {
    action: { kind: 'schedulePrimary', delayMs: CLICK_GAP_MS },
    next: { suppress: null, pending: { id, t: now } },
  };
}

/** Call when the deferred primary actually fires. */
export function clearPending(state: ClickGestureState): ClickGestureState {
  return { ...state, pending: null };
}
