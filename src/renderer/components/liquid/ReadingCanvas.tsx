/**
 * Liquid Workplace — L6's reading canvas.
 *
 * The renderer half of `shared/liquidReadingCanvas.ts`. The contract decides
 * geometry; this decides nothing, it only renders what the contract returned.
 * That split is deliberate: the Gate ("no tool obscures the document") is then
 * provable from a pure function and a set of `data-*` attributes, instead of
 * from an opinion about a stylesheet.
 *
 * What a caller gets, and what it must give up:
 *
 * - IT NO LONGER CHOOSES WHERE A TOOL GOES. It hands over the open tools, in
 *   open order, and the canvas docks them or turns them into a sheet. A reader
 *   that keeps its own `position: absolute` popover is not using this.
 * - THE DOCUMENT IS NEVER UNMOUNTED. A sheet covers it; it does not replace it.
 *   Scroll offset, an epub's rendition, a media element's playback position and
 *   every capture in flight survive a tool being opened and closed, which is
 *   L6's second bullet and is unachievable if the tree is torn down.
 * - A SHEET IS INERT, NOT JUST HIDDEN. `inert` plus `aria-hidden` on the
 *   document while a sheet is up, so Tab cannot walk into text the user cannot
 *   see. `aria-hidden` alone leaves the whole document in the tab ring.
 *
 * The width it measures is its own content box, not the window's — a reader in
 * a 520 px pop-out and a reader docked at 520 px inside a 3440 px monitor are
 * the same layout problem, exactly as `LiquidAppScaffold` argues.
 */
import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  READING_CANVAS_POLICY,
  resolveReadingCanvas,
  type ReadingCanvasPolicy,
  type ReadingToolSpec,
} from '../../../shared/liquidReadingCanvas';
import './readingCanvas.css';

export interface ReadingCanvasTool extends ReadingToolSpec {
  /** Heading for the sheet and accessible name for the docked panel. Required. */
  label: string;
  /** The tool itself. */
  content: ReactNode;
  /**
   * Controls that belong beside the tool's own title — a refresh, a count, a
   * filter. Here rather than at the top of `content` so a migrating surface can
   * drop its own panel header instead of ending up with two stacked headings,
   * which is the commonest way a migration adds chrome while claiming to remove it.
   */
  actions?: ReactNode;
  /**
   * Required, for the same reason `LiquidInspector` requires it: a reading tool
   * that covers the document and cannot be dismissed has eaten the app.
   */
  onClose: () => void;
}

type ReadingCanvasProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Open tools, oldest first. Closed tools are simply absent. */
  tools?: readonly ReadingCanvasTool[];
  /** The document. Always rendered, covered by a sheet at most. */
  children?: ReactNode;
  /** Accessible name for every tool's close control. */
  closeLabel: string;
  policy?: ReadingCanvasPolicy;
  /** Force a width instead of measuring — tests, and callers that already observe. */
  widthOverride?: number;
  /**
   * Who owns the scroll.
   *
   * `contained` (default) — the canvas has a definite height and the document
   * scrolls inside it. Novels and Captures: a reader in a bounded stage.
   *
   * `page` — the canvas is as tall as its content and an ancestor scrolls.
   * Catalogues work this way, and the difference is not cosmetic: under
   * `contained` a docked tool is stretched to the full height of a list that may
   * be thousands of pixels long, so its own contents scroll off the top and the
   * inspector you selected a row to read is no longer on screen. Under `page`
   * the tool is `position: sticky` — still IN FLOW, so it reserves its track and
   * the placement invariant is untouched; a partial cover remains inexpressible.
   */
  scroll?: 'contained' | 'page';
  /**
   * Fired when the document goes under a sheet, and again when it comes back.
   *
   * L6 bullet 2, and additive because every one of the six surfaces has the same
   * hole: things anchored to the DOCUMENT that are not rendered INSIDE it. The
   * reader's word/sentence popup is `position: fixed; z-index: 160` and a sibling
   * of the canvas, so a sheet cannot cover it — measured 2026-08-25 with the
   * Bookmarks sheet open at a 380 px canvas: 28x97 px of overlap, hit-testing in
   * that region returning the popup and not the sheet, `aria-modal="true"` on the
   * sheet, `inert` on the document, and two focusable controls in the popup
   * outside any inert subtree. A visible, clickable, tabbable panel outside an
   * `aria-modal` region describing a word in a document that has been set aside.
   *
   * The canvas reports rather than reaches: it does not own those overlays and
   * guessing at their selectors would be worse than the defect. The caller
   * dismisses what belongs to the document it just handed over.
   */
  onDocumentCoveredChange?: (covered: boolean) => void;
};

/**
 * Observe the canvas's own width. `null` until something is measured, so the
 * first paint never claims a width it has not seen; a caller that renders at
 * `null` gets the document alone, which is the safe direction to be wrong in.
 */
function useMeasuredWidth(ref: RefObject<HTMLElement | null>, enabled: boolean): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const apply = (value: number) => {
      if (value > 0) setWidth(Math.floor(value));
    };
    apply(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
  return width;
}

export function ReadingCanvas({
  tools,
  children,
  closeLabel,
  policy = READING_CANVAS_POLICY,
  widthOverride,
  scroll = 'contained',
  className,
  onDocumentCoveredChange,
  ...rest
}: ReadingCanvasProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const measured = useMeasuredWidth(ref, widthOverride === undefined);
  const width = widthOverride ?? measured;
  const open = tools ?? [];

  // Before the first measurement there is no honest placement to choose, so no
  // tool is placed. Not a guessed `wide`: guessing wide docks a 264 px panel
  // into a 400 px pop-out for one frame and shoves the text sideways.
  const layout = resolveReadingCanvas(width ?? 0, width === null ? [] : open, policy);
  const byId = new Map(layout.tools.map((tool) => [tool.id, tool]));
  const sheetId = layout.activeSheetId;
  const covered = layout.documentCovered;

  /**
   * A sheet is `aria-modal` over an `inert` document, so it must take focus and
   * give it back. Without this, opening one leaves focus on the trigger — which
   * is now inside the inert region — and the next Tab restarts the window from
   * the top. A docked tool is NOT focused on open: it does not take the document
   * away, and stealing focus from someone mid-sentence is its own defect.
   */
  const sheetRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const lastSheetRef = useRef<string | null>(null);
  useEffect(() => {
    if (sheetId && lastSheetRef.current !== sheetId) {
      if (!lastSheetRef.current) returnFocusRef.current = document.activeElement as HTMLElement | null;
      sheetRef.current?.focus();
    } else if (!sheetId && lastSheetRef.current) {
      returnFocusRef.current?.focus?.();
      returnFocusRef.current = null;
    }
    lastSheetRef.current = sheetId;
  }, [sheetId]);

  /**
   * Reported on the transition, not on every render: a caller that dismisses a
   * popup here would otherwise be unable to open one while a sheet is up, and
   * "you may not look a word up in the tool you just opened" is a worse product
   * than the leak. The ref is what makes it a transition — `covered` is derived
   * from the resolver and recomputed on every resize frame.
   */
  const lastCoveredRef = useRef(covered);
  useEffect(() => {
    if (lastCoveredRef.current === covered) return;
    lastCoveredRef.current = covered;
    onDocumentCoveredChange?.(covered);
  }, [covered, onDocumentCoveredChange]);

  /**
   * Escape closes the tool the user is actually in.
   *
   * Scoped rather than global: a reader has its own Escape bindings (leave the
   * link view, dismiss a popup), and a canvas that swallowed every Escape would
   * break them. So this fires only for the modal sheet, or when focus is inside
   * a docked tool, and calls `stopPropagation` only in those cases.
   */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || open.length === 0) return;
    const node = event.target instanceof Element ? event.target.closest('[data-reading-role="tool"]') : null;
    const id = sheetId ?? (node instanceof HTMLElement ? node.dataset.readingTool : undefined);
    const target = open.find((tool) => tool.id === id);
    if (!target) return;
    event.stopPropagation();
    target.onClose();
  };

  const renderTool = (tool: ReadingCanvasTool) => {
    const resolved = byId.get(tool.id);
    if (!resolved) return null;
    const isSheet = resolved.placement === 'sheet';
    /**
     * Sheets stack, and only the newest is SHOWN. The older ones are `hidden`
     * rather than `return null`, and that is bullet 2 rather than a detail: a
     * returned null is an unmount, so opening a second sheet over the first
     * destroyed the first one's subtree and closing the second built a fresh
     * one — the scroll offset, the lookup in flight and the half-filled mining
     * draft all went with it. This comment used to say the covered sheets
     * "stay open in the caller's state and reappear", which was true of the
     * STATE and never of the tree.
     *
     * `hidden` and not a class: it removes the tool from the tab ring and from
     * the accessibility tree in one attribute, which is exactly right under a
     * newer `aria-modal` sibling.
     */
    const stacked = isSheet && tool.id !== sheetId;
    return (
      <aside
        key={tool.id}
        ref={isSheet && !stacked ? sheetRef : undefined}
        hidden={stacked || undefined}
        tabIndex={isSheet ? -1 : undefined}
        className={isSheet ? 'lq-reading-sheet lq-liquid' : 'lq-reading-tool lq-liquid'}
        data-lq-role="liquid"
        data-reading-role="tool"
        data-reading-tool={tool.id}
        data-placement={resolved.placement}
        data-side={isSheet ? undefined : resolved.side}
        aria-label={tool.label}
        {...(isSheet ? { role: 'dialog' as const, 'aria-modal': true } : {})}
        style={isSheet ? undefined : { width: `${resolved.width}px`, flex: `0 0 ${resolved.width}px` }}
      >
        <div className="lq-reading-tool-head">
          <span className="lq-reading-tool-title">{tool.label}</span>
          {tool.actions ? <span className="lq-reading-tool-actions">{tool.actions}</span> : null}
          <button
            type="button"
            className="lq-reading-tool-close"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={tool.onClose}
          >
            ×
          </button>
        </div>
        <div className="lq-reading-tool-body">{tool.content}</div>
      </aside>
    );
  };

  /**
   * A leading tool is emitted BEFORE the document, not moved there with CSS
   * `order`. The distinction is the whole reason the field exists: `order` moves
   * the painted box and leaves the DOM alone, so Tab and a screen reader would
   * walk the document first and reach the index that navigates INTO it
   * afterwards — reading order and visual order pointing opposite ways, which is
   * WCAG 1.3.2 and the one failure a "it looks right" check cannot see.
   *
   * THE GROUP IS THE TOOL'S DECLARED SIDE, NOT ITS RESOLVED PLACEMENT, and that
   * is L6 bullet 2 rather than a tidiness preference. These are two separate
   * children arrays either side of the document, so React reconciles by key
   * WITHIN one of them and a tool that moves between them is unmounted and
   * rebuilt. Grouping by placement made exactly that crossing happen every time
   * a leading tool narrowed into a sheet: measured in `vnCanvas.test.tsx`, the
   * library's `.visual-novel-library` was a different node afterwards with
   * identical markup — "serializes to the same string", which is why no width,
   * class or attribute assertion on any of the six surfaces could see it. Every
   * piece of state bullet 2 names that lives inside a tool — a scrolled capture
   * list, a lookup in flight, a half-filled mining draft, the row a deep link
   * selected — went with it.
   *
   * Nothing is lost by keeping a leading sheet in the leading group: a sheet is
   * `position: absolute; inset: 0; z-index: 2`, so its flex position is not
   * observable, and the document it covers is `inert` + `aria-hidden`, so it is
   * not in the reading order to come before or after in the first place.
   */
  const isLeading = (tool: ReadingCanvasTool) => tool.side === 'leading';

  return (
    <div
      ref={ref}
      className={['lq-reading', className].filter(Boolean).join(' ')}
      data-covered={covered ? 'true' : undefined}
      data-scroll={scroll}
      data-measured={width === null ? undefined : 'true'}
      data-open-tools={open.length || undefined}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {open.filter(isLeading).map(renderTool)}

      <div
        className="lq-reading-doc lq-anchor"
        data-lq-role="anchor"
        data-reading-role="document"
        data-content-width={layout.contentWidth || undefined}
        inert={covered || undefined}
        aria-hidden={covered || undefined}
        style={{
          // The measure clamp, as a token the stylesheet centres on. Read off
          // the POLICY, not off `measureWidth`: under a fill policy the resolver
          // returns the content width itself, and emitting that as a max-width
          // would re-clamp the canvas to a stale integer on every resize frame.
          ['--lq-reading-measure' as string]: Number.isFinite(policy.maxContentWidth)
            ? `${layout.measureWidth}px`
            : 'none',
        }}
      >
        {children}
      </div>

      {open.filter((tool) => !isLeading(tool)).map(renderTool)}
    </div>
  );
}

export default ReadingCanvas;
