/**
 * Liquid Workplace — L3.2, the MEDIA WORKSPACE half of per-window presentation.
 *
 * `liquidWindowPresentation.ts` is the seam for a floating `.fwin`,
 * `popoutPresentation.ts` for `?popout=<section>`, `readerPresentation.ts` for
 * the full-screen reader. This is the FOURTH host, and the last one a study
 * surface is mounted in: the Media workspace overlay, `.seanime-host`, which
 * `MediaWorkspaceHost.tsx` renders as `position: fixed; inset: 0` at
 * `body > div` — inside none of the other three.
 *
 * Why it exists, MEASURED rather than assumed. `parity-ledger.json` carries six
 * `mediaWorkspace` rows (7–12: open a study-ready file, segment navigation,
 * readiness filters, the transcript rail, detach a Study Block, send it to
 * another monitor). Every one of them is driven and proven in STANDARD, and
 * every one is stuck at `status: "pending"` — "no Liquid destination yet" — on
 * one recorded finding, re-derived at this HEAD before this module was written:
 * the overlay has no window chrome, no `Make Liquid` control and no
 * `data-presentation`, so per-window presentation state could not reach it at
 * all. That is the same defect class the pop-out and the reader each fixed one
 * host earlier: an enable flow whose destination does not exist, not a style
 * gap. Six of the ledger's fifty rows are 100% of what is not `both`.
 *
 * Three decisions, mirroring the reader's and diverging where the host does:
 *
 * 1. THE WORKSPACE ADOPTS THE INTERIOR ONLY, NEVER THE FRAME — the reader's
 *    decision 1, for the same measured reason and one more. `.seanime-host` is
 *    `inset: 0` with `background: var(--bg)`, i.e. it fills the OS window edge
 *    to edge and is opaque; a `backdrop-filter` on it would sample the desktop
 *    compositor rather than anything this process paints, which is the silently
 *    inert glass `liquid-window.css` rule 2 forbids on `.fwin-bar`. The extra
 *    reason here: the overlay's own comment in `styles.css` records that it is
 *    opaque ON PURPOSE, so that everything numbered below it is hidden rather
 *    than merely behind. Making the root translucent would not be a material
 *    change, it would put the desktop grid back on screen underneath a modal
 *    dialog. So the root keeps its opaque stage and what Liquid buys is the
 *    region language over it: the host bar is navigation by §2.3 and takes
 *    `ContextualSurface`; the body — the player, the readiness table, the mined
 *    review list — is dense work and stays on its anchor.
 * 2. THE TOGGLE NEVER MOVES THE OVERLAY, so the round trip is the identity by
 *    construction. The rect handed to `togglePresentation` is the live main
 *    window's own and nothing ever writes it back; it is captured only so
 *    `parsePresentation` can vouch for the blob, since a liquid state with no
 *    geometry to come back to is exactly what that parser rejects.
 * 3. ONE KEY, NOT A MAP. The reader stores per `LibraryKind` because Novels and
 *    manga genuinely have different chrome. There is exactly one Media
 *    workspace overlay, so a map would be a single-entry object forever.
 */

import { useCallback, useState } from 'react';
import { parsePresentation, type LiquidPresentationState } from '../shared/liquidWindowState';
import { canPresentLiquid, liveWindowRect, toggleWinPresentation } from './liquidWindowPresentation';

export const WORKSPACE_PRESENTATION_KEY = 'lq.workspace.presentation';

/** The section name this host presents, for `canPresentLiquid` and the blob. */
export const WORKSPACE_PRESENTATION_SECTION = 'mediaWorkspace';

/**
 * The persisted presentation, or `undefined` for the conventional default.
 * Absence IS conventional — see `liquidWindowState.ts` decision 1 — so a
 * workspace that has never been toggled reads exactly as one toggled back.
 */
export function readWorkspacePresentation(): LiquidPresentationState | undefined {
  if (!canPresentLiquid(WORKSPACE_PRESENTATION_SECTION, 'workspace')) return undefined;
  try {
    const raw = localStorage.getItem(WORKSPACE_PRESENTATION_KEY);
    if (!raw) return undefined;
    // Total, exactly as the shell's, the pop-out's and the reader's loaders
    // are: anything the schema cannot fully vouch for is dropped rather than
    // rendered as something half liquid the user has no control to leave.
    return parsePresentation(JSON.parse(raw) as unknown) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persist (or clear) the workspace presentation. Clearing REMOVES the key
 * rather than storing `{mode:'standard'}`, so `write(read())` after a round
 * trip leaves storage byte-identical to before it was ever toggled.
 */
export function writeWorkspacePresentation(state: LiquidPresentationState | undefined): void {
  try {
    if (state && state.mode === 'liquid') {
      localStorage.setItem(WORKSPACE_PRESENTATION_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(WORKSPACE_PRESENTATION_KEY);
    }
  } catch {
    /* A quota or private-mode failure must not cost the user the toggle itself. */
  }
}

/**
 * Flip the workspace between conventional and Liquid presentation and persist
 * the result. Returns the new state so the caller renders from the same value
 * it stored rather than re-reading.
 *
 * The rect comes from the shared `liveWindowRect`, whose doc comment carries
 * the live measurement: `outerWidth` and friends read 0 intermittently in this
 * renderer, and a clamped fallback stored a 1x1 geometry that `parseRect`
 * accepts. Unmeasurable therefore means the ENTER is REFUSED — a no-op the
 * user can retry — rather than entered against a rect nothing can come back to.
 */
export function toggleWorkspacePresentation(
  current: LiquidPresentationState | undefined,
): LiquidPresentationState | undefined {
  if (!canPresentLiquid(WORKSPACE_PRESENTATION_SECTION, 'workspace')) return undefined;
  const entering = current?.mode !== 'liquid';
  const rect = liveWindowRect();
  if (entering && !rect) return current;
  const next = toggleWinPresentation({
    section: WORKSPACE_PRESENTATION_SECTION,
    x: rect?.x ?? 0,
    y: rect?.y ?? 0,
    w: rect?.w ?? 1,
    h: rect?.h ?? 1,
    max: false,
    ...(current ? { presentation: current } : {}),
  });
  writeWorkspacePresentation(next.presentation);
  return next.presentation;
}

export interface WorkspacePresentation {
  /** Whether the workspace is currently presented as Liquid. */
  liquid: boolean;
  /** Whether the toggle should be rendered at all. */
  presentable: boolean;
  /** `data-presentation` for the overlay root, or `undefined` when not presentable. */
  dataPresentation: 'liquid' | 'standard' | undefined;
  toggle: () => void;
}

/**
 * The workspace's presentation, as one value the host renders from.
 *
 * A hook rather than App-side wiring — the reader's choice, for the reader's
 * reason: the toggle's home is the overlay's OWN bar, next to the controls it
 * changes, and the overlay is mounted and unmounted by its own `open` state
 * which `App.tsx` knows nothing about.
 */
export function useWorkspacePresentation(): WorkspacePresentation {
  const [presentation, setPresentation] = useState(() => readWorkspacePresentation());
  const presentable = canPresentLiquid(WORKSPACE_PRESENTATION_SECTION, 'workspace');
  const liquid = presentable && presentation?.mode === 'liquid';
  const toggle = useCallback(() => {
    setPresentation((current) => toggleWorkspacePresentation(current));
  }, []);
  return {
    liquid,
    presentable,
    dataPresentation: presentable ? (liquid ? 'liquid' : 'standard') : undefined,
    toggle,
  };
}
