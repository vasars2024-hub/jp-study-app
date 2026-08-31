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
 * The frameless garden and visualizer trinkets have no conventional chrome to
 * swap, so they never offer the toggle. Sticky notes deliberately do: their
 * conventional paper stays the default, while Liquid reveals the compact color
 * edge palette required by the Note transformation contract. Before this was
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
  return section !== 'city' && section !== 'visualizer';
}

/**
 * The live rect of the OS window this renderer is painting into, or `undefined`
 * when it cannot be measured — which is a refusal, not a default.
 *
 * MEASURED LIVE 2026-08-26, and it is why this function exists at all. The two
 * hosts that are their own OS window — the pop-out and the reader — each read
 * `screenX/screenY/outerWidth/outerHeight` and clamped the size with
 * `Math.max(1, …)`. These globals are INTERMITTENT in this renderer. Two
 * readings, same window, same day:
 *
 *     11:55  outerWidth 0     outerHeight 0    screenX 0    screenY 0
 *     12:09  outerWidth 1280  outerHeight 860  screenX 320  screenY 86
 *
 * `innerWidth`/`innerHeight` read 1264x821 in both. The mechanism was NOT
 * established — focus was the obvious suspect and was tested and cleared, the
 * values being identical with the window focused and blurred — so do not trust
 * a doc that claims one. What is established is that a 0 reading happens and
 * reaches the store: the clamp turned it into `{x:0,y:0,w:1,h:1}`, `parseRect`
 * rejects `w <= 0` and 1 is the smallest value that passes, so the clamp
 * stepped over the guard rather than tripping it. Confirmed on disk before the
 * fix landed: `lq.reader.presentation` held `standardRect:{x:0,y:0,w:1,h:1}`
 * and the reader still came back `.reader.reader-liquid` after a full reload —
 * the blob validated.
 *
 * Intermittency is exactly why the answer is a fallback and a refusal rather
 * than a repair: correctness must not depend on catching the good reading.
 *
 * What it costs is latent, not visible, and that is the trap: `standardRect` is
 * the geometry `returnToStandard` writes back, and today both of these hosts
 * keep only the `presentation` field and drop the restored `x/y/w/h`, so
 * nothing is resized yet. The moment either host honours that rect — which is
 * the field's entire purpose, and what the `.fwin` host already does — leaving
 * Liquid restores a 1x1 window. Neither suite could see it: both pin
 * `outerWidth: 980` in jsdom, so neither had ever met the live value.
 *
 * `innerWidth`/`innerHeight` are the fallback because they are the numbers that
 * are actually true — and for a borderless host the content box IS the window.
 * If even those are unusable the answer is `undefined`, so a caller stores
 * nothing rather than a geometry nothing can come back to.
 */
export function liveWindowRect(): { x: number; y: number; w: number; h: number } | undefined {
  const w = Math.round(window.outerWidth || window.innerWidth);
  const h = Math.round(window.outerHeight || window.innerHeight);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
  const x = Math.round(window.screenX);
  const y = Math.round(window.screenY);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    w,
    h,
  };
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
