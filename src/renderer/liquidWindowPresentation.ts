/**
 * Liquid Workplace — L3.2, the shell side of per-window presentation.
 *
 * `shared/liquidWindowState.ts` owns the schema and the two commands and knows
 * nothing about the desktop. This module is the seam between those pure
 * commands and `DesktopShell`'s in-memory `Win`: it converts, it toggles, and
 * it is the ONLY place the shell's own field names (`max`, `rect`, `min`) meet
 * the snapshot's (`maximized`, `restoreRect`, `visible`).
 *
 * It exists as its own module rather than four helpers inside a 3,300-line
 * component for one reason: L3's gate is byte-for-byte reversibility across a
 * save/load cycle, and a gate you cannot instantiate in a test is a gate you
 * check by eye.
 *
 * Two decisions worth the next worker's minute:
 *
 * 1. THE SHELL DOES NOT MOVE A WINDOW THAT GOES LIQUID. Entering Liquid changes
 *    presentation only; the geometry it captures is the geometry it already
 *    has, so enter-then-leave with no drag in between is the identity. What
 *    `standardRect` actually buys is the drag that happens WHILE liquid — that
 *    one returns home. A shell that also repositioned on entry would make the
 *    round trip depend on the layout engine agreeing with itself twice.
 * 2. `presentation` IS OMITTED, NEVER SET TO `undefined`. `JSON.stringify`
 *    drops an undefined value, so a persisted blob would look identical either
 *    way — but the in-memory snapshot would not, and `toEqual` cannot see the
 *    difference. The round trip is asserted on the key set, so the key must
 *    genuinely not be there.
 */

import {
  isLiquid,
  parsePresentation,
  togglePresentation,
  type LiquidPresentationState,
} from '../shared/liquidWindowState';

/**
 * The subset of `DesktopShell`'s `Win` this module touches. Structural on
 * purpose: a pop-out, a Blanc window or a fixture can use it without being a
 * full `Win`, and the shell's z-order, pin and visibility stay out of reach.
 */
export interface PresentableWin {
  section?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  max?: boolean;
  presentation?: LiquidPresentationState;
}

/**
 * The ONE predicate for "this section can be presented as Liquid at all".
 *
 * Sticky notes and the frameless garden and visualizer trinkets have no
 * conventional chrome to swap, so they never offer the toggle. Before this was
 * one function the shell carried two hand-written lists that differed by
 * `visualizer` (boss audit 2026-08-17, finding 2): a visualizer window whose
 * persisted blob validated rendered Liquid while the button that leaves Liquid
 * was not rendered at all — an enable flow with no disable path, at the exact
 * seam L3 exists to guarantee. Presentability and reversibility are now the
 * same expression, so they cannot disagree again.
 *
 * It gates the SNAPSHOT converters too, not just the render: a non-presentable
 * section drops the key on load instead of re-persisting a blob nothing can
 * act on.
 */
export function canPresentLiquid(section?: string): boolean {
  return section !== 'note' && section !== 'city' && section !== 'visualizer';
}

/** The snapshot fields the presentation round trip reads and writes. */
export interface PresentableSnapshot {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
  presentation?: LiquidPresentationState;
}

/** Whether this window is currently presented as Liquid. Re-exported so the shell has one import. */
export function isWinLiquid(win: Pick<PresentableWin, 'presentation'>): boolean {
  return isLiquid(win);
}

/**
 * The Make Liquid / Return to standard command, in the shell's own vocabulary.
 *
 * Returns a NEW object with only the presentation-owned fields changed. Every
 * other key on the caller's window — id, section, z, min, pin, rect — is
 * spread through untouched, because a command that also moved those could not
 * be proven reversible in one place.
 */
export function toggleWinPresentation<T extends PresentableWin>(win: T): T {
  const next = togglePresentation({
    x: win.x,
    y: win.y,
    w: win.w,
    h: win.h,
    maximized: win.max === true,
    ...(win.presentation ? { presentation: win.presentation } : {}),
  });
  const { presentation: _dropped, ...rest } = win;
  return {
    ...rest,
    x: next.x,
    y: next.y,
    w: next.w,
    h: next.h,
    max: next.maximized,
    ...(next.presentation ? { presentation: next.presentation } : {}),
  } as T;
}

/**
 * Read a persisted presentation blob. Total, and deliberately the SAME
 * validation the schema module uses: a corrupt or future-versioned blob comes
 * back `undefined`, which the shell renders as a conventional window rather
 * than as something half-liquid it cannot get out of.
 */
export function presentationFromSnapshot(raw: unknown): LiquidPresentationState | undefined {
  return parsePresentation(raw);
}

/**
 * The half-object to spread into a `WindowSnapshot`. Empty when the window is
 * conventional — see decision (2); this is why it returns a fragment rather
 * than a value.
 */
export function presentationToSnapshot(
  win: Pick<PresentableWin, 'presentation' | 'section'>,
): { presentation?: LiquidPresentationState } {
  if (!canPresentLiquid(win.section)) return {};
  return win.presentation ? { presentation: win.presentation } : {};
}
