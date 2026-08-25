/**
 * Liquid Workplace — L6's common content canvas and reading-side-tool contract.
 *
 * L6's Gate is two sentences: "content remains legible and stable at all sizes;
 * no tool obscures the document." Both halves are geometry, so both can be
 * decided here instead of being re-argued in every reader.
 *
 * ## The defect this replaces
 *
 * Every reading surface currently anchors its side tools as absolutely
 * positioned popovers — `.settings-panel` in `renderer/styles.css` is
 * `position: absolute; right: 0; width: 264px`, and NovelReader opens bookmarks,
 * translate and reader settings through it. At a 1200 px window that covers a
 * strip of margin. At a 640 px pop-out it covers 41% of the text the user is
 * reading, which is the Gate's second sentence failing by construction. The
 * popover is not the wrong control; the wrong part is that nothing decides
 * whether there is room for it.
 *
 * ## The contract
 *
 * A reading side tool has exactly two placements and there is no third:
 *
 * - `docked` — beside the document. The document reflows and stays fully
 *   visible. Chosen whenever the canvas can still give the document at least
 *   `minContentWidth` afterwards.
 * - `sheet` — over the whole canvas. The document is explicitly set aside, not
 *   half-hidden, and one dismissal brings it back at the same width.
 *
 * A PARTIAL COVER IS NEVER A LEGAL OUTCOME. That is the whole point: "no tool
 * obscures the document" is unenforceable as a review note and trivial as an
 * invariant, because the resolver has no way to express it.
 *
 * ## Why the measure clamp is in the same module
 *
 * "Legible AND stable" interact. A column that grows with the window fails
 * legibility past ~90 characters; a column pinned to a fixed pixel width fails
 * stability, because docking a tool then reflows every line and the reader loses
 * their place. Clamping the measure gives both: past `maxContentWidth` the text
 * stops widening, so on a wide canvas a tool docks into slack margin and
 * `measureWidth` does not move at all — `readingCanvasReflows` is how a caller
 * or a probe asserts that.
 *
 * Pure, dependency-free, and imported by renderer surfaces and by probes. No
 * React, no Electron, no DOM.
 */

/** Placement of an open reading side tool. There is deliberately no third value. */
export const READING_TOOL_PLACEMENTS = ['docked', 'sheet'] as const;
export type ReadingToolPlacement = (typeof READING_TOOL_PLACEMENTS)[number];

/**
 * Which edge a DOCKED tool takes. Only observable at `placement: 'docked'` — a
 * sheet spans the canvas and has no edge, so its `side` is carried through
 * unchanged rather than being rewritten to a value the geometry never used.
 *
 * It exists because not every reading surface puts its tools on the right. A
 * visual-novel library, a chapter index and a table of contents are navigation
 * INTO the document and belong on the leading edge; bookmarks, translation and
 * settings act ON the document and belong on the trailing one. Expressing that
 * as a side rather than as two components keeps one resolver and one violation
 * list, which is the same argument `READING_CANVAS_FILL_POLICY` makes.
 */
export const READING_TOOL_SIDES = ['leading', 'trailing'] as const;
export type ReadingToolSide = (typeof READING_TOOL_SIDES)[number];

export interface ReadingToolSpec {
  id: string;
  /**
   * Narrowest width at which the tool is still usable docked. Below this it is
   * a sheet rather than a squeezed column — a 140 px settings panel with
   * wrapped labels is a worse outcome than an honest full-canvas one.
   */
  minWidth: number;
  /** Width the tool takes when the canvas has room for it. */
  preferredWidth: number;
  /**
   * Edge to dock against. Defaults to `trailing`, which is what every surface
   * migrated before this field existed uses, so omitting it is unchanged
   * behaviour rather than an implicit new one.
   *
   * The side deliberately does NOT affect docking order. Room is still taken
   * first-come in the caller's open order, because re-ranking by side would
   * move a panel the user is mid-way through using the moment they open a
   * second one — §2.4 names exactly that.
   */
  side?: ReadingToolSide;
}

export interface ReadingCanvasPolicy {
  /** Narrowest document column that still reads as prose. */
  minContentWidth: number;
  /** Widest column before line length stops being legible. */
  maxContentWidth: number;
  /** Space between the document and a docked tool. */
  gutter: number;
}

/**
 * The default policy.
 *
 * `minContentWidth` 384 is the app's own compact floor rather than an invented
 * one: `LIQUID_BREAKPOINTS.medium` is 720 and a 264 px tool plus a gutter leaves
 * 444, so a tool of the size readers actually ship docks at every width the
 * scaffold calls `medium` or wider and turns into a sheet below it. 720 is also
 * where `railInSpine` already stops giving the rail a place, so the two
 * reflows happen at one width instead of two.
 *
 * `maxContentWidth` 760 is ~85 characters at the reader's default 16 px body
 * type, the upper end of the legible range rather than the middle, because a
 * reader that clamps aggressively wastes the width the user gave it.
 */
export const READING_CANVAS_POLICY: ReadingCanvasPolicy = {
  minContentWidth: 384,
  maxContentWidth: 760,
  gutter: 12,
};

/**
 * The same policy for a canvas whose content is not prose.
 *
 * Manga pages, PDF spreads and video frames have their own intrinsic aspect and
 * a 760 px clamp would letterbox them for no reason. Expressed as an unbounded
 * `maxContentWidth` rather than as a `measure: 'prose' | 'fill'` flag so there
 * is still exactly one resolver and one violation list — `measureWidth` simply
 * follows `contentWidth`, and `measure-above-maximum` cannot fire.
 */
export const READING_CANVAS_FILL_POLICY: ReadingCanvasPolicy = {
  minContentWidth: 384,
  maxContentWidth: Number.POSITIVE_INFINITY,
  gutter: 12,
};

export interface ResolvedReadingTool {
  id: string;
  placement: ReadingToolPlacement;
  /** Px the tool occupies. For a sheet this is the full canvas width. */
  width: number;
  /** The spec's `side`, normalised. Meaningless at `placement: 'sheet'`. */
  side: ReadingToolSide;
}

export interface ReadingCanvasLayout {
  /** Px the document region occupies after docking. Unchanged by sheets. */
  contentWidth: number;
  /**
   * Px the text column is rendered at inside that region — the measure clamp.
   * This, not `contentWidth`, is what reflows the user's lines.
   */
  measureWidth: number;
  tools: ResolvedReadingTool[];
  /** The sheet a caller should actually render. Sheets stack; the last one wins. */
  activeSheetId: string | null;
  /** Whether the document is currently covered. True exactly when a sheet is open. */
  documentCovered: boolean;
}

function floorAtZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Resolve the canvas for a viewport and the tools currently open in it.
 *
 * `openTools` is in the caller's own open order, oldest first: docking is
 * first-come, so the tool the user opened first keeps its place when a second
 * one arrives and cannot fit. The alternative — re-ranking on every open — moves
 * a panel the user is mid-way through using, which §2.4 calls out directly.
 *
 * A viewport too narrow for the document itself is not silently rounded away.
 * `contentWidth` reports what is actually there and `readingCanvasViolations`
 * names it, so a probe measuring a 320 px pop-out gets a finding rather than a
 * comfortable number.
 */
export function resolveReadingCanvas(
  viewportWidth: number,
  openTools: readonly ReadingToolSpec[],
  policy: ReadingCanvasPolicy = READING_CANVAS_POLICY,
): ReadingCanvasLayout {
  const viewport = floorAtZero(viewportWidth);
  const tools: ResolvedReadingTool[] = [];
  let contentWidth = viewport;
  let activeSheetId: string | null = null;

  for (const tool of openTools) {
    const minWidth = floorAtZero(tool.minWidth);
    const preferred = Math.max(minWidth, floorAtZero(tool.preferredWidth));
    const side: ReadingToolSide = tool.side === 'leading' ? 'leading' : 'trailing';
    const room = contentWidth - policy.gutter - policy.minContentWidth;
    if (minWidth > 0 && room >= minWidth) {
      const width = Math.min(preferred, room);
      tools.push({ id: tool.id, placement: 'docked', width, side });
      contentWidth -= width + policy.gutter;
      continue;
    }
    // No room to dock: cover the canvas outright rather than squeeze either side.
    // Width is filled in below — a narrower tool opened afterwards can still
    // dock and shrink the canvas, and a sheet always spans whatever is left.
    tools.push({ id: tool.id, placement: 'sheet', width: 0, side });
    activeSheetId = tool.id;
  }

  for (const tool of tools) {
    if (tool.placement === 'sheet') tool.width = contentWidth;
  }

  return {
    contentWidth,
    measureWidth: Math.min(contentWidth, policy.maxContentWidth),
    tools,
    activeSheetId,
    documentCovered: activeSheetId !== null,
  };
}

/**
 * Whether opening a tool moved the reader's lines.
 *
 * The Gate's "stable" half. A docked tool on a wide canvas must not reflow the
 * text — it takes slack the measure clamp was not using. Compare the layout
 * before and after the open; `false` is the passing answer.
 */
export function readingCanvasReflows(
  before: ReadingCanvasLayout,
  after: ReadingCanvasLayout,
): boolean {
  return before.measureWidth !== after.measureWidth;
}

/**
 * Every way this layout breaks the contract, as stable machine-readable ids.
 *
 * Returns `[]` for a legal layout. Written as a list rather than a boolean so a
 * probe reports *which* rule failed at *which* width; a single `valid: false`
 * across eight viewport sizes tells the next worker nothing.
 */
export function readingCanvasViolations(
  layout: ReadingCanvasLayout,
  viewportWidth: number,
  policy: ReadingCanvasPolicy = READING_CANVAS_POLICY,
): string[] {
  const viewport = floorAtZero(viewportWidth);
  const violations: string[] = [];

  const docked = layout.tools.filter((tool) => tool.placement === 'docked');
  const dockedWidth = docked.reduce((sum, tool) => sum + tool.width + policy.gutter, 0);

  if (layout.contentWidth + dockedWidth !== viewport) violations.push('canvas-width-mismatch');
  if (layout.contentWidth < policy.minContentWidth) {
    // Only a finding when the viewport itself could have afforded it.
    violations.push(
      viewport >= policy.minContentWidth ? 'content-below-minimum' : 'viewport-below-minimum',
    );
  }
  if (layout.measureWidth > policy.maxContentWidth) violations.push('measure-above-maximum');
  if (layout.measureWidth > layout.contentWidth) violations.push('measure-exceeds-content');
  for (const tool of docked) {
    if (tool.width <= 0) violations.push(`docked-tool-zero-width:${tool.id}`);
  }
  const sheets = layout.tools.filter((tool) => tool.placement === 'sheet');
  if (sheets.length > 0 && layout.activeSheetId !== sheets[sheets.length - 1].id) {
    violations.push('active-sheet-mismatch');
  }
  if (sheets.length === 0 && layout.documentCovered) violations.push('covered-without-sheet');
  for (const tool of sheets) {
    if (tool.width !== layout.contentWidth) violations.push(`sheet-not-full-canvas:${tool.id}`);
  }
  return violations;
}
