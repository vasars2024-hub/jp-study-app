/**
 * Liquid Workplace — L3.2, the pop-out half of per-window presentation.
 *
 * `liquidWindowPresentation.ts` is the seam between the pure commands and
 * `DesktopShell`'s in-memory `Win`. This is the same seam for the OTHER host a
 * study app can be mounted in: `?popout=<section>`, its own borderless OS
 * window, which renders `AppSection` directly and never touches `.fwin`.
 *
 * Why this module exists at all, measured rather than assumed:
 * `L5_CORE_STUDY_TOOLS.md:211` records that the Agent pop-out "mounts outside
 * `.fwin` — no chrome, no `Make Liquid`, no `data-presentation` — so that host
 * has no Liquid destination". Every interior rule in `theme/liquid-window.css`
 * was scoped to `.fwin.fwin-liquid`, so the four apps that adopted Liquid
 * regions in L5 had them permanently inert the moment the same app was popped
 * out. That is an enable flow with no reachable destination, not a style gap.
 *
 * Three decisions, each recorded because each is a way this normally goes wrong:
 *
 * 1. A POP-OUT ADOPTS THE INTERIOR ONLY, NEVER THE FRAME. The frame here is the
 *    OS window: `frame: false` but opaque, with the desktop compositor behind
 *    it rather than the app's own wallpaper. A `backdrop-filter` on
 *    `.popout-root` would sample nothing this process paints — the classic
 *    silently-inert glass `liquid-window.css` rule 2 already forbids on
 *    `.fwin-bar`. So `.popout-root`/`.popout-bar` keep their conventional fill
 *    and what Liquid buys is the region language (`.lq-contextual` and its
 *    per-region exceptions) over the app's own opaque body.
 *
 * 2. THE TOGGLE NEVER MOVES A POP-OUT, so the round trip is the identity by
 *    construction. The rect handed to `togglePresentation` is the live OS
 *    window's own (`screenX/screenY/outerWidth/outerHeight`) and nothing ever
 *    writes it back — it is captured so `parsePresentation` can vouch for the
 *    blob, since a liquid state with no geometry to come back to is exactly
 *    what that parser rejects. Decision 1 of `liquidWindowPresentation.ts`
 *    ("the shell does not move a window that goes Liquid") taken to its limit.
 *
 * 3. STORED PER SECTION, NOT PER WINDOW. A pop-out has no persistent identity —
 *    close it and re-open it from the desktop and it is a new BrowserWindow —
 *    so the only durable key is the section it shows. `localStorage` and not
 *    the window-snapshot store, because that store belongs to the desktop
 *    shell's windows and a pop-out is deliberately not one of them.
 */

import type { DesktopWinSection } from '../shared/desktop';
import { parsePresentation, type LiquidPresentationState } from '../shared/liquidWindowState';
import { canPresentLiquid, liveWindowRect, toggleWinPresentation } from './liquidWindowPresentation';

export const POPOUT_PRESENTATION_KEY = 'lq.popout.presentation';

type PresentationMap = Partial<Record<string, LiquidPresentationState>>;

function readMap(): PresentationMap {
  try {
    const raw = localStorage.getItem(POPOUT_PRESENTATION_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: PresentationMap = {};
    for (const [section, value] of Object.entries(parsed as Record<string, unknown>)) {
      // Total, exactly as the shell's loader is: anything the schema cannot
      // fully vouch for is dropped rather than rendered as something half
      // liquid the user has no control to leave.
      const state = parsePresentation(value);
      if (state) out[section] = state;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The persisted presentation for one pop-out section, or `undefined` for the
 * conventional default. Absence IS conventional — see `liquidWindowState.ts`
 * decision 1 — so a section that has never been toggled reads exactly as one
 * that was toggled back.
 */
export function readPopoutPresentation(
  section: DesktopWinSection,
): LiquidPresentationState | undefined {
  if (!canPresentLiquid(section, 'popout')) return undefined;
  return readMap()[section];
}

/**
 * Persist (or clear) one section's presentation. Clearing DELETES the key
 * rather than storing `{mode:'standard'}`, so `write(read())` after a round
 * trip leaves a blob byte-identical to the one before it was ever toggled.
 */
export function writePopoutPresentation(
  section: DesktopWinSection,
  state: LiquidPresentationState | undefined,
): void {
  try {
    const map = readMap();
    if (state && state.mode === 'liquid') map[section] = state;
    else delete map[section];
    if (Object.keys(map).length === 0) localStorage.removeItem(POPOUT_PRESENTATION_KEY);
    else localStorage.setItem(POPOUT_PRESENTATION_KEY, JSON.stringify(map));
  } catch {
    /* A quota or private-mode failure must not cost the user the toggle itself. */
  }
}

/**
 * Flip one pop-out section between conventional and Liquid presentation and
 * persist the result. Returns the new state so the caller renders from the same
 * value it stored rather than re-reading.
 *
 * The rect used to be read here with a `Math.max(1, …)` clamp on
 * `outerWidth`/`outerHeight`. Measured live 2026-08-26: those globals read **0**
 * in this renderer, so the clamp stored `{x:0,y:0,w:1,h:1}` — one above the
 * `w <= 0` that `parseRect` rejects, so it validated. `liveWindowRect` carries
 * the full measurement and the latent cost; unmeasurable now refuses the ENTER
 * instead of entering against a rect nothing can come back to. The RETURN never
 * needs one: `returnToStandard` restores the rect already inside the blob.
 */
export function togglePopoutPresentation(
  section: DesktopWinSection,
  current: LiquidPresentationState | undefined,
): LiquidPresentationState | undefined {
  if (!canPresentLiquid(section, 'popout')) return undefined;
  const entering = current?.mode !== 'liquid';
  const rect = liveWindowRect();
  if (entering && !rect) return current;
  const next = toggleWinPresentation({
    section,
    x: rect?.x ?? 0,
    y: rect?.y ?? 0,
    w: rect?.w ?? 1,
    h: rect?.h ?? 1,
    max: false,
    ...(current ? { presentation: current } : {}),
  });
  writePopoutPresentation(section, next.presentation);
  return next.presentation;
}
