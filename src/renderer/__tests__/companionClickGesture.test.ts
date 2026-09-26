import { describe, expect, it } from 'vitest';
import {
  CLICK_GAP_MS,
  DRAG_CLICK_SUPPRESS_MS,
  HOLD_MS,
  clearPending,
  decideClick,
  emptyClickGestureState,
  noteDragEnd,
  noteHold,
} from '../environment/companionClickGesture';

const PET = 'c-aero';

describe('companion click gesture arbitration', () => {
  it('defers the primary on a lone click instead of running it immediately', () => {
    const { action, next } = decideClick(emptyClickGestureState(), PET, 1000);
    expect(action).toEqual({ kind: 'schedulePrimary', delayMs: CLICK_GAP_MS });
    expect(next.pending).toEqual({ id: PET, t: 1000 });
  });

  it('runs the secondary alone on a double click — the primary never fires', () => {
    const first = decideClick(emptyClickGestureState(), PET, 1000);
    expect(first.action.kind).toBe('schedulePrimary');

    const second = decideClick(first.next, PET, 1000 + CLICK_GAP_MS - 1);
    expect(second.action).toEqual({ kind: 'runSecondary' });
    // Nothing left pending, so the deferred primary has nothing to fire from.
    expect(second.next.pending).toBeNull();
  });

  it('treats a second click after the gap as a fresh single click', () => {
    const first = decideClick(emptyClickGestureState(), PET, 1000);
    const second = decideClick(first.next, PET, 1000 + CLICK_GAP_MS);
    expect(second.action.kind).toBe('schedulePrimary');
  });

  it('does not pair clicks across two different pets', () => {
    const first = decideClick(emptyClickGestureState(), PET, 1000);
    const other = decideClick(first.next, 'c-critter', 1010);
    expect(other.action.kind).toBe('schedulePrimary');
  });

  it('swallows the click a completed drag produces', () => {
    const dragged = noteDragEnd(emptyClickGestureState(), PET, true, 2000);
    expect(dragged.cancelPending).toBe(true);

    const click = decideClick(dragged.next, PET, 2001);
    expect(click.action).toEqual({ kind: 'ignore', reason: 'drag' });
    expect(click.next).toEqual(emptyClickGestureState());
  });

  it('lets the next genuine click through after the suppression window', () => {
    const dragged = noteDragEnd(emptyClickGestureState(), PET, true, 2000);
    const click = decideClick(dragged.next, PET, 2000 + DRAG_CLICK_SUPPRESS_MS);
    expect(click.action.kind).toBe('schedulePrimary');
  });

  it('leaves a press that never moved alone — that is a click, not a drag', () => {
    const state = decideClick(emptyClickGestureState(), PET, 1000).next;
    const released = noteDragEnd(state, PET, false, 1005);
    expect(released.cancelPending).toBe(false);
    expect(released.next).toBe(state);
  });

  it('cancels a primary still pending when a drag starts from a prior click', () => {
    const clicked = decideClick(emptyClickGestureState(), PET, 1000);
    const dragged = noteDragEnd(clicked.next, PET, true, 1100);
    expect(dragged.cancelPending).toBe(true);
    expect(dragged.next.pending).toBeNull();
  });

  it('does not suppress a click on a different pet than the one dragged', () => {
    const dragged = noteDragEnd(emptyClickGestureState(), PET, true, 2000);
    const click = decideClick(dragged.next, 'c-critter', 2001);
    expect(click.action.kind).toBe('schedulePrimary');
  });

  it('a hold swallows the click its release produces', () => {
    const held = noteHold(emptyClickGestureState(), PET, 3000);
    const click = decideClick(held, PET, 3001);
    expect(click.action).toEqual({ kind: 'ignore', reason: 'drag' });
  });

  it('a hold cancels a primary still pending from an earlier click', () => {
    const clicked = decideClick(emptyClickGestureState(), PET, 1000);
    expect(clicked.next.pending).not.toBeNull();
    expect(noteHold(clicked.next, PET, 1600).pending).toBeNull();
  });

  it('holds long enough that an ordinary click can never reach it', () => {
    // If HOLD_MS fell inside the double-click gap, every deliberate double
    // click would trip the hold on its way through.
    expect(HOLD_MS).toBeGreaterThan(CLICK_GAP_MS);
  });

  it('clearPending drops only the pending click', () => {
    const state = { suppress: { id: PET, t: 5 }, pending: { id: PET, t: 10 } };
    expect(clearPending(state)).toEqual({ suppress: { id: PET, t: 5 }, pending: null });
  });
});
