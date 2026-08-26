/**
 * Liquid Workplace — L3.2, the READER half of per-window presentation.
 *
 * `liquidWindowPresentation.ts` is the seam for a floating `.fwin`;
 * `popoutPresentation.ts` is the same seam for `?popout=<section>`. This is the
 * third and last host a study surface can be mounted in: the full-screen
 * reader, which `App.tsx` returns as the WHOLE app render whenever a library
 * item is open, so it is inside neither `.fwin` nor `.popout-root`.
 *
 * Why it exists, measured rather than assumed: L1 category 3's remaining two
 * cells are Novels and manga, both `@.reader`. Every interior rule in
 * `theme/liquid-window.css` named `.fwin.fwin-liquid` and
 * `.popout-root.popout-liquid`, so no region inside a reader could ever be
 * treated — `contextualTreated` could not pass on a surface with real
 * navigation and transport chrome. That is the same defect class the pop-out
 * host fixed: an enable flow whose destination does not exist, not a style gap.
 *
 * Three decisions, mirroring the pop-out's and diverging where the host does:
 *
 * 1. THE READER ADOPTS THE INTERIOR ONLY, NEVER THE FRAME. The frame here is
 *    the main OS window, which the reader fills edge to edge; there is no
 *    window box of our own to tint. A `backdrop-filter` on `.reader` would
 *    sample the desktop compositor rather than anything this process paints —
 *    the same silently-inert glass `liquid-window.css` rule 2 forbids on
 *    `.fwin-bar`. So `.reader` keeps its opaque `#101015` stage and what Liquid
 *    buys is the region language over it: the bar and the footer are
 *    navigation and transport by §2.3, the page itself is dense reading work
 *    and stays on its anchor. Universal glass over a page of Japanese prose is
 *    the failure the plan names, not the maximum.
 * 2. THE TOGGLE NEVER MOVES THE READER, so the round trip is the identity by
 *    construction — the rect handed to `togglePresentation` is the live main
 *    window's own and nothing ever writes it back. It is captured only so
 *    `parsePresentation` can vouch for the blob, since a liquid state with no
 *    geometry to come back to is exactly what that parser rejects.
 * 3. STORED PER KIND, NOT PER BOOK. A reader has no persistent window identity
 *    and a per-item key would make the toggle feel random — the same chrome,
 *    liquid on one novel and conventional on the next. `LibraryKind` is the
 *    durable unit because the two readers genuinely have different chrome:
 *    Novels carries a seek/chapter footer, manga a page scrubber. `localStorage`
 *    and not the window-snapshot store, for the pop-out's reason: that store
 *    belongs to the desktop shell's windows and the reader is not one of them.
 */

import { useCallback, useState } from 'react';
import type { LibraryKind } from '../shared/types';
import { parsePresentation, type LiquidPresentationState } from '../shared/liquidWindowState';
import { canPresentLiquid, toggleWinPresentation } from './liquidWindowPresentation';

export const READER_PRESENTATION_KEY = 'lq.reader.presentation';

type PresentationMap = Partial<Record<string, LiquidPresentationState>>;

function readMap(): PresentationMap {
  try {
    const raw = localStorage.getItem(READER_PRESENTATION_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: PresentationMap = {};
    for (const [kind, value] of Object.entries(parsed as Record<string, unknown>)) {
      // Total, exactly as the shell's and the pop-out's loaders are: anything
      // the schema cannot fully vouch for is dropped rather than rendered as
      // something half liquid the user has no control to leave.
      const state = parsePresentation(value);
      if (state) out[kind] = state;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The persisted presentation for one reader kind, or `undefined` for the
 * conventional default. Absence IS conventional — see `liquidWindowState.ts`
 * decision 1 — so a kind that has never been toggled reads exactly as one that
 * was toggled back.
 */
export function readReaderPresentation(kind: LibraryKind): LiquidPresentationState | undefined {
  if (!canPresentLiquid(kind)) return undefined;
  return readMap()[kind];
}

/**
 * Persist (or clear) one reader kind's presentation. Clearing DELETES the key
 * rather than storing `{mode:'standard'}`, so `write(read())` after a round trip
 * leaves a blob byte-identical to the one before it was ever toggled.
 */
export function writeReaderPresentation(
  kind: LibraryKind,
  state: LiquidPresentationState | undefined,
): void {
  try {
    const map = readMap();
    if (state && state.mode === 'liquid') map[kind] = state;
    else delete map[kind];
    if (Object.keys(map).length === 0) localStorage.removeItem(READER_PRESENTATION_KEY);
    else localStorage.setItem(READER_PRESENTATION_KEY, JSON.stringify(map));
  } catch {
    /* A quota or private-mode failure must not cost the user the toggle itself. */
  }
}

/** The live main window's own rect, in the shape the pure commands take. */
function readerRect(): { x: number; y: number; w: number; h: number; maximized: boolean } {
  return {
    x: Math.round(window.screenX),
    y: Math.round(window.screenY),
    // `outerWidth`/`outerHeight` and not `innerWidth`: the reader fills the
    // window's content box, but what a presentation returns to is the WINDOW,
    // which is what the shell's `w`/`h` also mean.
    w: Math.max(1, Math.round(window.outerWidth)),
    h: Math.max(1, Math.round(window.outerHeight)),
    maximized: false,
  };
}

/**
 * Flip one reader kind between conventional and Liquid presentation and persist
 * the result. Returns the new state so the caller renders from the same value it
 * stored rather than re-reading.
 */
export function toggleReaderPresentation(
  kind: LibraryKind,
  current: LiquidPresentationState | undefined,
): LiquidPresentationState | undefined {
  if (!canPresentLiquid(kind)) return undefined;
  const rect = readerRect();
  const next = toggleWinPresentation({
    section: kind,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    max: rect.maximized,
    ...(current ? { presentation: current } : {}),
  });
  writeReaderPresentation(kind, next.presentation);
  return next.presentation;
}

export interface ReaderPresentation {
  /** Whether this reader is currently presented as Liquid. */
  liquid: boolean;
  /** Whether the toggle should be rendered at all. */
  presentable: boolean;
  /** `data-presentation` for the reader root, or `undefined` when not presentable. */
  dataPresentation: 'liquid' | 'standard' | undefined;
  toggle: () => void;
}

/**
 * The reader's presentation, as one value both readers render from.
 *
 * A hook rather than App-side wiring — which is how the pop-out does it —
 * because the toggle's home is the reader's OWN bar, next to the controls it
 * changes, and because `App.tsx` mounts a fresh reader per item so the state
 * has no reason to outlive the surface it belongs to.
 */
export function useReaderPresentation(kind: LibraryKind): ReaderPresentation {
  const [presentation, setPresentation] = useState(() => readReaderPresentation(kind));
  const presentable = canPresentLiquid(kind);
  const liquid = presentable && presentation?.mode === 'liquid';
  const toggle = useCallback(() => {
    setPresentation((current) => toggleReaderPresentation(kind, current));
  }, [kind]);
  return {
    liquid,
    presentable,
    dataPresentation: presentable ? (liquid ? 'liquid' : 'standard') : undefined,
    toggle,
  };
}
