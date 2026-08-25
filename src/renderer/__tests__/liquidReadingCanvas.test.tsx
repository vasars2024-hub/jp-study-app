// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READING_CANVAS_FILL_POLICY,
  READING_CANVAS_POLICY,
} from '../../shared/liquidReadingCanvas';
import { ReadingCanvas, type ReadingCanvasTool } from '../components/liquid/ReadingCanvas';

/**
 * L6's Gate rendered rather than computed. Three promises, each of which is a
 * way "no tool obscures the document" gets lost quietly:
 *   - a docked tool is a SIBLING of the document with `position: static`, which
 *     is the whole difference from the `.settings-panel` popover it replaces;
 *   - a sheet is inert-and-hidden over the document, not a partial cover;
 *   - the document node SURVIVES both transitions, or scroll offset, an epub
 *     rendition and any capture in flight go with it.
 */

const CSS = readFileSync(
  resolve(__dirname, '..', 'components', 'liquid', 'readingCanvas.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function render(node: ReactNode): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(node);
  });
  return host;
}
function rerender(node: ReactNode) {
  act(() => {
    root!.render(node);
  });
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

function tool(overrides: Partial<ReadingCanvasTool> = {}): ReadingCanvasTool {
  return {
    id: 'settings',
    label: 'Reader settings',
    minWidth: 264,
    preferredWidth: 264,
    content: <button type="button">Font size</button>,
    onClose: () => undefined,
    ...overrides,
  };
}

describe('ReadingCanvas placement', () => {
  it('docks beside the document at a width that affords it', () => {
    const el = render(
      <ReadingCanvas widthOverride={1200} closeLabel="Close" tools={[tool()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    const doc = el.querySelector('[data-reading-role="document"]')!;
    const panel = el.querySelector('[data-reading-tool="settings"]') as HTMLElement;
    expect(panel.dataset.placement).toBe('docked');
    expect(panel.style.width).toBe('264px');
    expect(el.querySelector('.lq-reading')!.hasAttribute('data-covered')).toBe(false);
    expect(doc.hasAttribute('inert')).toBe(false);
    expect(doc.getAttribute('aria-hidden')).toBe(null);
    // Sibling, not a descendant: a tool inside the document region would be
    // over the text however it were positioned.
    expect(panel.parentElement).toBe(el.querySelector('.lq-reading'));
    expect(doc.contains(panel)).toBe(false);
  });

  it('becomes a full-canvas sheet, inert and hidden, when the document cannot keep its floor', () => {
    const el = render(
      <ReadingCanvas widthOverride={640} closeLabel="Close" tools={[tool()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    const doc = el.querySelector('[data-reading-role="document"]') as HTMLElement;
    const panel = el.querySelector('[data-reading-tool="settings"]') as HTMLElement;
    expect(panel.dataset.placement).toBe('sheet');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(el.querySelector('.lq-reading')!.getAttribute('data-covered')).toBe('true');
    // Both, not one. `aria-hidden` alone leaves the document in the tab ring.
    expect(doc.hasAttribute('inert')).toBe(true);
    expect(doc.getAttribute('aria-hidden')).toBe('true');
    // A sheet carries no inline width — the stylesheet gives it the whole box.
    expect(panel.style.width).toBe('');
  });

  it('keeps the document node across dock, sheet and close', () => {
    const el = render(
      <ReadingCanvas widthOverride={1200} closeLabel="Close">
        <p>document</p>
      </ReadingCanvas>,
    );
    const first = el.querySelector('[data-reading-role="document"]')!;
    const paragraph = first.querySelector('p')!;
    (paragraph as HTMLElement).dataset.scrollProbe = 'kept';

    rerender(
      <ReadingCanvas widthOverride={1200} closeLabel="Close" tools={[tool()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    rerender(
      <ReadingCanvas widthOverride={640} closeLabel="Close" tools={[tool()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    rerender(
      <ReadingCanvas widthOverride={640} closeLabel="Close">
        <p>document</p>
      </ReadingCanvas>,
    );

    const last = el.querySelector('[data-reading-role="document"]')!;
    expect(last).toBe(first);
    expect((last.querySelector('p') as HTMLElement).dataset.scrollProbe).toBe('kept');
    expect(last.hasAttribute('inert')).toBe(false);
  });

  it('places nothing before it has measured itself', () => {
    const el = render(
      <ReadingCanvas closeLabel="Close" tools={[tool()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    // jsdom reports 0 width and provides no ResizeObserver, so the canvas never
    // measures — and renders the document alone rather than guessing `wide`.
    expect(el.querySelector('.lq-reading')!.hasAttribute('data-measured')).toBe(false);
    expect(el.querySelector('[data-reading-tool="settings"]')).toBe(null);
    expect(el.querySelector('[data-reading-role="document"]')!.textContent).toBe('document');
  });

  it('gives every tool a working close control', () => {
    const onClose = vi.fn();
    const el = render(
      <ReadingCanvas widthOverride={1200} closeLabel="Close tool" tools={[tool({ onClose })]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    const close = el.querySelector('.lq-reading-tool-close') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Close tool');
    act(() => close.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders only the newest sheet and does not drop the ones beneath it', () => {
    const el = render(
      <ReadingCanvas
        widthOverride={640}
        closeLabel="Close"
        tools={[tool(), tool({ id: 'bookmarks', label: 'Bookmarks' })]}
      >
        <p>document</p>
      </ReadingCanvas>,
    );
    // Covered, not dropped. It used to be `null` here, which is an unmount:
    // bullet 2's state — a scroll offset, a lookup in flight, a half-filled
    // mining draft — lived on that subtree and went with it. `hidden` keeps the
    // tree and still takes it out of the tab ring and the accessibility tree,
    // which is what a sibling of an `aria-modal` sheet has to do.
    const covered = el.querySelector<HTMLElement>('[data-reading-tool="settings"]')!;
    expect(covered.hidden).toBe(true);
    expect(covered.getAttribute('data-placement')).toBe('sheet');
    const bookmarks = el.querySelector<HTMLElement>('[data-reading-tool="bookmarks"]')!;
    expect(bookmarks.getAttribute('data-placement')).toBe('sheet');
    expect(bookmarks.hidden).toBe(false);
    // The node identity is the assertion the old `null` made impossible.
    const coveredBody = covered.querySelector('.lq-reading-tool-body');
    // Closing the top one brings the other back — the same node, not a copy.
    rerender(
      <ReadingCanvas widthOverride={640} closeLabel="Close" tools={[tool()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    const back = el.querySelector<HTMLElement>('[data-reading-tool="settings"]')!;
    expect(back.getAttribute('data-placement')).toBe('sheet');
    expect(back.hidden).toBe(false);
    expect(back.querySelector('.lq-reading-tool-body')).toBe(coveredBody);
  });

  it('makes `hidden` actually hide a sheet, which the UA rule alone does not', () => {
    // `[hidden] { display: none }` is (0,1,0) and `.lq-reading-sheet` sets
    // `display: flex` at (0,1,0) from a stylesheet that loads later, so the UA
    // rule loses and a "hidden" stacked sheet would paint over the live one at
    // full size. Latched the same way as the `.lq-liquid` cascade above: what
    // decides, not what is merely declared.
    const winners = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(
      ([, selector, body]) =>
        selector.includes('[hidden]') && /(^|[;\s])display\s*:\s*none/m.test(body),
    );
    expect(winners.length, 'nothing reclaims display for a hidden reading tool').toBeGreaterThan(0);
    for (const [, selector] of winners) {
      for (const one of selector.split(',').map((s) => s.trim())) {
        expect({ selector: one, classes: (one.match(/\./g) ?? []).length }).toEqual({
          selector: one,
          classes: 2,
        });
      }
    }
  });

  it('publishes the measure clamp, and drops it for a fill policy', () => {
    const el = render(
      <ReadingCanvas widthOverride={1600} closeLabel="Close">
        <p>document</p>
      </ReadingCanvas>,
    );
    const doc = el.querySelector('[data-reading-role="document"]') as HTMLElement;
    expect(doc.style.getPropertyValue('--lq-reading-measure')).toBe(
      `${READING_CANVAS_POLICY.maxContentWidth}px`,
    );
    rerender(
      <ReadingCanvas widthOverride={1600} closeLabel="Close" policy={READING_CANVAS_FILL_POLICY}>
        <p>document</p>
      </ReadingCanvas>,
    );
    expect(doc.style.getPropertyValue('--lq-reading-measure')).toBe('none');
  });
});

describe('ReadingCanvas keyboard and focus', () => {
  function press(el: Element, key: string): void {
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  }

  it('closes the modal sheet on Escape', () => {
    const onClose = vi.fn();
    const el = render(
      <ReadingCanvas widthOverride={640} closeLabel="Close" tools={[tool({ onClose })]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    press(el.querySelector('[data-reading-tool="settings"]')!, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes a docked tool only when focus is inside it', () => {
    const onClose = vi.fn();
    const el = render(
      <ReadingCanvas widthOverride={1200} closeLabel="Close" tools={[tool({ onClose })]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    // From the document: not this canvas's Escape. A reader has its own bindings
    // (leave the link view, dismiss a popup) and swallowing them is a regression.
    press(el.querySelector('[data-reading-role="document"]')!.querySelector('p')!, 'Escape');
    expect(onClose).not.toHaveBeenCalled();
    press(el.querySelector('.lq-reading-tool-body')!.querySelector('button')!, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('takes focus into a sheet and gives it back to the trigger', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const el = render(
      <ReadingCanvas widthOverride={640} closeLabel="Close" tools={[tool()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    // Focus must LEAVE the trigger: it is inside the inert region now, so the
    // next Tab would otherwise restart the window from the top.
    expect(document.activeElement).toBe(el.querySelector('[data-reading-tool="settings"]'));

    rerender(
      <ReadingCanvas widthOverride={640} closeLabel="Close">
        <p>document</p>
      </ReadingCanvas>,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('does not steal focus for a docked tool', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    render(
      <ReadingCanvas widthOverride={1200} closeLabel="Close" tools={[tool()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe('readingCanvas.css', () => {
  it('uses the same gutter the resolver subtracts', () => {
    // The drift this guards: the resolver reserves 12px before deciding a tool
    // fits. A stylesheet gap of anything else silently pushes the document
    // under its own floor while the contract still reports the layout clean.
    expect(READING_CANVAS_POLICY.gutter).toBe(12);
    expect(CSS).toMatch(/\.lq-reading\s*\{[^}]*gap:\s*var\(--lq-space-4\)/);
    const tokens = readFileSync(
      resolve(__dirname, '..', 'theme', 'liquid-tokens.css'),
      'utf8',
    );
    expect(tokens).toMatch(/--lq-space-4:\s*12px/);
  });

  it('keeps a docked tool out of the positioning layer', () => {
    expect(CSS).toMatch(/\.lq-reading-tool\s*\{[^}]*position:\s*static/);
    expect(CSS).toMatch(/\.lq-reading-sheet\s*\{[^}]*position:\s*absolute/);
    // Anchored to the canvas, never the viewport — a reader docked inside a
    // larger window must cover its own document and nothing around it.
    expect(CSS).not.toMatch(/\.lq-reading-sheet\s*\{[^}]*position:\s*fixed/);
    expect(CSS).toMatch(/\.lq-reading\s*\{[^}]*position:\s*relative/);
  });

  it('out-specifies the shared role class it shares an element with', () => {
    /*
     * The defect the three tests around this one could not see, found live on
     * Immersion and fixed in the same commit.
     *
     * Every tool carries `.lq-liquid` as well, and `theme/liquid-surfaces.css`
     * declares `position`, `padding` and `background` on it at the SAME (0,1,0)
     * specificity as a bare `.lq-reading-sheet` — from a stylesheet that loads
     * later, so it won all three. Measured at a 462px canvas: the sheet computed
     * `position: relative` and sat in flow at 338px beside a 112px document.
     * That is a partial cover, which `shared/liquidReadingCanvas.ts` calls
     * inexpressible — and it was, in the resolver, which reported the layout
     * clean the whole time because it does not read stylesheets.
     *
     * Why the assertion is shaped like this: `toMatch(/position:\s*static/)`
     * PASSED throughout. A declaration existing is not a declaration winning, so
     * this reads BOTH files and compares what actually decides the cascade.
     */
    const shared = readFileSync(
      resolve(__dirname, '..', 'theme', 'liquid-surfaces.css'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');

    // The premise, asserted rather than assumed: if a later refactor stops
    // `.lq-liquid` setting these, this test should be re-read, not silently pass.
    const roleBlocks = [...shared.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, selector]) => selector.split(',').some((s) => s.trim() === '.lq-liquid'))
      .map(([, , body]) => body)
      .join('\n');
    for (const property of ['position', 'padding', 'background']) {
      expect(roleBlocks, `.lq-liquid no longer sets ${property}`).toMatch(
        new RegExp(`(^|[;\\s])${property}\\s*:`, 'm'),
      );
    }

    // So every one of those three must be reclaimed by a selector carrying at
    // least two classes, which beats (0,1,0) regardless of import order.
    for (const [role, property] of [
      ['tool', 'position'],
      ['tool', 'padding'],
      ['tool', 'background'],
      ['sheet', 'position'],
      ['sheet', 'padding'],
      ['sheet', 'background'],
    ] as const) {
      const winners = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(
        ([, selector, body]) =>
          selector.split(',').some((s) => s.trim().endsWith(`.lq-reading-${role}`)) &&
          new RegExp(`(^|[;\\s])${property}\\s*:`, 'm').test(body),
      );
      expect(winners.length, `nothing declares ${property} for .lq-reading-${role}`).toBeGreaterThan(
        0,
      );
      for (const [, selector] of winners) {
        const own = selector
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.endsWith(`.lq-reading-${role}`));
        for (const one of own) {
          // Reported as the selector itself, not as a bare number: a failure
          // here has to name which rule lost, or the next worker re-measures.
          expect({
            selector: one,
            property,
            beatsRoleClass: (one.match(/\./g) ?? []).length > 1,
          }).toEqual({ selector: one, property, beatsRoleClass: true });
        }
      }
    }
  });

  it('makes the document region its own containing block', () => {
    /*
     * Found migrating Novels. Every real reader in this app scrolls from an
     * absolutely positioned box — `.novel-scroller` is `position: absolute;
     * inset: 0`, and so are the manga and PDF stages — so without a containing
     * block here such a child resolves `inset: 0` against `.lq-reading`, which
     * spans the docked tools too.
     *
     * What that breaks was MEASURED, and the measurement refuted the first
     * answer: it is not a paint defect. Live, with `position: static` put back,
     * `elementFromPoint` at the docked tool's own centre still returned
     * `.lq-reading-tool-body`, because `overflow: auto` clips the oversized
     * scroller back to the document region. It is a measurement defect, which is
     * worse for being invisible: with two tools docked in a 1264px canvas the
     * document region is 696px and the scroller's `clientWidth` became 1264 —
     * 568px outside the visible region — while `NovelReader.tsx` sizes its whole
     * paged layout from that `clientWidth`. Columns 1264px wide inside a 696px
     * window, the remainder clipped, unreachable, and missing from the page
     * count. `readingCanvasViolations` cannot see any of it: the resolver does
     * not read stylesheets.
     */
    expect(CSS).toMatch(/\.lq-reading-doc\s*\{[^}]*position:\s*relative/);
  });

  it('keeps a page-scrolled tool in flow, sticky and never absolute', () => {
    /*
     * `scroll="page"` exists because a catalogue scrolls the page rather than a
     * bounded stage: measured live on the Library shelf, the docked drawer is
     * 365px of content beside a 1191px list, so the default stretch would have
     * scrolled the inspector the user just selected a row to read off the top.
     *
     * The reason it cannot reintroduce a partial cover is this one word: a
     * STICKY box stays in flow, so it still reserves its flex track and the
     * resolver's arithmetic keeps holding. `absolute` or `fixed` here would take
     * it out of flow and put the tool back over the document, which is the one
     * thing this stylesheet is not allowed to do.
     */
    const page = CSS.match(
      /\.lq-reading\[data-scroll='page'\]\s*>\s*\.lq-reading-tool\s*\{([^}]*)\}/,
    );
    expect(page, 'the page-scrolled docked tool needs its own rule').not.toBeNull();
    expect(page?.[1]).toMatch(/position:\s*sticky/);
    expect(page?.[1]).not.toMatch(/position:\s*(absolute|fixed)/);
    // And the default is untouched: `contained` is still the plain static tool.
    expect(CSS).toMatch(/\.lq-reading-tool\s*\{[^}]*position:\s*static/);
  });

  it('paints nothing outside its own namespace', () => {
    const selectors = CSS.split('}')
      .map((block) => block.split('{')[0].trim())
      .filter(Boolean)
      .flatMap((group) => group.split(',').map((s) => s.trim()))
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(5);
    for (const selector of selectors) {
      expect({ selector, ok: selector.startsWith('.lq-reading') }).toEqual({ selector, ok: true });
    }
  });
});

/**
 * The leading edge. A visual-novel library, a chapter index or a table of
 * contents navigates INTO the document, so it sits before it — and "before" has
 * to mean before in the DOM, not `order: -1` in the stylesheet.
 */
describe('ReadingCanvas leading tools', () => {
  const library = (overrides: Partial<ReadingCanvasTool> = {}): ReadingCanvasTool =>
    tool({ id: 'library', label: 'Library', minWidth: 220, preferredWidth: 290, side: 'leading', ...overrides });

  function positionOfToolRelativeToDocument(el: HTMLElement, id: string): 'before' | 'after' {
    const doc = el.querySelector('[data-reading-role="document"]')!;
    const panel = el.querySelector(`[data-reading-tool="${id}"]`)!;
    // FOLLOWING on the document means the tool comes first.
    return doc.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING
      ? 'before'
      : 'after';
  }

  it('emits a leading docked tool before the document, so reading order matches visual order', () => {
    const el = render(
      <ReadingCanvas widthOverride={1200} closeLabel="Close" tools={[library()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    const panel = el.querySelector('[data-reading-tool="library"]') as HTMLElement;
    expect(panel.dataset.side).toBe('leading');
    expect(panel.style.width).toBe('290px');
    expect(positionOfToolRelativeToDocument(el, 'library')).toBe('before');
    // Still a sibling of the document, not a wrapper around it.
    expect(panel.parentElement).toBe(el.querySelector('.lq-reading'));
  });

  it('NEGATIVE CONTROL — the same tool without a side lands after the document', () => {
    // Without this the assertion above would pass on a canvas that renders every
    // tool before the document, which is a different bug wearing the same result.
    const el = render(
      <ReadingCanvas widthOverride={1200} closeLabel="Close" tools={[library({ side: 'trailing' })]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    expect((el.querySelector('[data-reading-tool="library"]') as HTMLElement).dataset.side).toBe('trailing');
    expect(positionOfToolRelativeToDocument(el, 'library')).toBe('after');
  });

  it('keeps a leading tool in the leading group when it becomes a sheet, with no side to report', () => {
    /*
     * 600 − 12 − 384 = 204 < 220, so the library cannot dock.
     *
     * This test asserted `'after'` until 2026-08-25, on the reasoning that a
     * modal belongs after the content it covers. The reasoning was sound and the
     * consequence was not: leading and trailing tools are two separate children
     * arrays, React reconciles by key WITHIN an array, so a tool that crossed
     * between them was unmounted and rebuilt with identical markup — bullet 2's
     * whole subject, and invisible to every width, class and attribute
     * assertion on all six surfaces. Nothing is given up by keeping it in its
     * declared group: a sheet is `position: absolute; inset: 0`, so its flex
     * position is not observable, and the document it covers is `inert` +
     * `aria-hidden`, so it is not in the reading order to come before or after.
     * `data-side` is still dropped — there is no edge it took.
     */
    const el = render(
      <ReadingCanvas widthOverride={600} closeLabel="Close" tools={[library()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    const panel = el.querySelector('[data-reading-tool="library"]') as HTMLElement;
    expect(panel.dataset.placement).toBe('sheet');
    expect(panel.dataset.side).toBe(undefined);
    expect(positionOfToolRelativeToDocument(el, 'library')).toBe('before');
    // And the document it covers is out of the reading order either way, which
    // is what makes the DOM position unobservable rather than merely tolerable.
    expect(el.querySelector('[data-reading-role="document"]')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('orders a leading and a trailing tool around the document in one canvas', () => {
    const el = render(
      <ReadingCanvas widthOverride={1200} closeLabel="Close" tools={[library(), tool()]}>
        <p>document</p>
      </ReadingCanvas>,
    );
    expect(positionOfToolRelativeToDocument(el, 'library')).toBe('before');
    expect(positionOfToolRelativeToDocument(el, 'settings')).toBe('after');
    // 1200 − 290 − 12 − 264 − 12 = 622 for the document, both tools docked.
    expect(
      (el.querySelector('[data-reading-role="document"]') as HTMLElement).dataset.contentWidth,
    ).toBe('622');
  });

  /**
   * L6 bullet 2, and the hole the 2026-08-25 NovelReader drive measured: a sheet
   * covers the DOCUMENT, and a surface's document-anchored overlays are not
   * inside it. The reader's word/sentence popup is `position: fixed; z-index:
   * 160` and a sibling of the canvas — with the Bookmarks sheet up at a 380 px
   * canvas it overlapped the sheet 28x97 px, `elementFromPoint` in that region
   * returned the popup and not the sheet, and it held two focusable controls
   * outside any `inert` subtree while the sheet was `aria-modal="true"`.
   *
   * The canvas reports the transition; it does not reach for the caller's
   * overlays. So what is asserted here is the transition itself, which is the
   * part a caller cannot get right on its own.
   */
  describe('onDocumentCoveredChange', () => {
    it('fires on the way in and on the way out, and only on the transition', () => {
      const seen: boolean[] = [];
      const cb = (covered: boolean) => seen.push(covered);
      const at = (width: number, tools: ReadingCanvasTool[]) => (
        <ReadingCanvas widthOverride={width} closeLabel="Close" tools={tools} onDocumentCoveredChange={cb}>
          <p>document</p>
        </ReadingCanvas>
      );

      // Docked: 1200 − 12 − 264 = 924 for the document, well over the 384 floor.
      render(at(1200, [tool()]));
      expect(seen).toEqual([]);

      // 600 − 12 − 264 = 324 < 384, so the tool can only be a sheet.
      rerender(at(600, [tool()]));
      expect(seen).toEqual([true]);

      // A re-render at the same width must not fire again, or a caller that
      // dismisses a popup here could never open one while a sheet is up.
      rerender(at(600, [tool()]));
      rerender(at(560, [tool()]));
      expect(seen).toEqual([true]);

      rerender(at(1200, [tool()]));
      expect(seen).toEqual([true, false]);
    });

    it('is optional — a caller that does not pass it renders identically', () => {
      const withCb = render(
        <ReadingCanvas widthOverride={600} closeLabel="Close" tools={[tool()]} onDocumentCoveredChange={() => undefined}>
          <p>document</p>
        </ReadingCanvas>,
      ).innerHTML;
      act(() => root!.unmount());
      host!.remove();
      const without = render(
        <ReadingCanvas widthOverride={600} closeLabel="Close" tools={[tool()]}>
          <p>document</p>
        </ReadingCanvas>,
      ).innerHTML;
      expect(without).toBe(withCb);
    });
  });

  it('does not reach for CSS `order` — the stylesheet declares none at all', () => {
    // The trap this test exists for: `order` moves the painted box and leaves
    // the DOM alone, so it would satisfy a screenshot and fail a screen reader.
    expect(CSS).not.toMatch(/(^|[;{\s])order\s*:/);
  });
});
