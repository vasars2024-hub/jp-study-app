// @vitest-environment jsdom
/**
 * `virtualListSemantics.test.ts` reads the call sites' TEXT; this reads the DOM
 * the primitive actually emits. A prop existing is not a prop working, and the
 * whole defect being fixed here is invisible in source: four generic `div`s
 * between a `role="table"` and its `role="row"` look like nothing at all.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import VirtualList from '../components/VirtualList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom has none, and `useElementSize` constructs one on mount. */
beforeEach(() => {
  // Inert on purpose: nothing here resizes, and a real one would only add a
  // frame of noise between mount and assertion.
  const noop = (): void => undefined;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };
});

const ROWS = Array.from({ length: 400 }, (_, i) => ({ id: `r${i}`, label: `row ${i}` }));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/**
 * jsdom lays nothing out, so `useElementSize` reports height 0 and the window is
 * the overscan alone — which is exactly the interesting case: a handful of rows
 * in the DOM standing in for four hundred.
 */
function mount(node: ReturnType<typeof createElement>): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('VirtualList grid semantics', () => {
  it('makes the container a rowgroup and every box under it presentational', () => {
    const container = mount(
      createElement(
        'div',
        { role: 'table', 'aria-rowcount': ROWS.length + 1 },
        createElement(VirtualList<(typeof ROWS)[number]>, {
          items: ROWS,
          itemHeight: 40,
          gridRole: 'rowgroup',
          getKey: (row) => row.id,
          renderItem: (row, index) =>
            createElement('div', { role: 'row', 'aria-rowindex': index + 2 }, row.label),
        }),
      ),
    );

    const group = container.querySelector('[role="rowgroup"]');
    expect(group, 'no rowgroup — the container did not take the role').not.toBe(null);

    // The ownership chain, walked for real: from a rendered row up to the table,
    // every element in between must be `presentation` or the row is orphaned.
    const table = container.querySelector('[role="table"]')!;
    const row = container.querySelector('[role="row"]')!;
    const chain: string[] = [];
    for (let node = row.parentElement; node && node !== table; node = node.parentElement) {
      chain.push(node.getAttribute('role') ?? 'NONE');
    }
    // slot, offset box, spacer, then the scroll container that IS the rowgroup.
    // Before this change all four read `NONE` and the table exposed no rows.
    expect(chain).toEqual(['presentation', 'presentation', 'presentation', 'rowgroup']);
  });

  it('windows the rows, so the count can only come from aria-rowcount', () => {
    const container = mount(
      createElement(
        'div',
        { role: 'table', 'aria-rowcount': ROWS.length + 1 },
        createElement(VirtualList<(typeof ROWS)[number]>, {
          items: ROWS,
          itemHeight: 40,
          gridRole: 'rowgroup',
          getKey: (row) => row.id,
          renderItem: (row, index) =>
            createElement('div', { role: 'row', 'aria-rowindex': index + 2 }, row.label),
        }),
      ),
    );
    const rendered = container.querySelectorAll('[role="row"]').length;
    expect(rendered).toBeGreaterThan(0);
    // The number, not an adjective: a fraction of 400 is in the DOM.
    expect(rendered).toBeLessThan(ROWS.length);
    expect(container.querySelector('[role="table"]')!.getAttribute('aria-rowcount')).toBe(String(ROWS.length + 1));
    // Indices are absolute, not window-relative — the first rendered row is row 2.
    expect(container.querySelector('[role="row"]')!.getAttribute('aria-rowindex')).toBe('2');
  });

  it('leaves the wrappers alone when no role is declared — the negative control', () => {
    // Without `gridRole` the boxes must NOT be presentational: a caller that
    // renders plain content has no collection semantics to protect, and marking
    // its wrappers presentation would be a claim nobody made. This is also the
    // state every one of the six grids was in before this change.
    const container = mount(
      createElement(VirtualList<(typeof ROWS)[number]>, {
        items: ROWS,
        itemHeight: 40,
        getKey: (row) => row.id,
        renderItem: (row) => createElement('div', { className: 'plain' }, row.label),
      }),
    );
    expect(container.querySelector('[role="rowgroup"]')).toBe(null);
    expect(container.querySelectorAll('[role="presentation"]').length).toBe(0);
  });

  it('still puts the role on the SLOT for a list, which a grid must not do', () => {
    // The two paths are different on purpose and the difference is asserted, so
    // a later "simplification" that collapses them fails here rather than
    // nesting a row inside a row.
    const container = mount(
      createElement(VirtualList<(typeof ROWS)[number]>, {
        items: ROWS,
        itemHeight: 40,
        listRole: 'list',
        itemRole: 'listitem',
        getKey: (row) => row.id,
        renderItem: (row) => createElement('span', null, row.label),
      }),
    );
    const item = container.querySelector('[role="listitem"]')!;
    expect(item.getAttribute('aria-setsize')).toBe(String(ROWS.length));
    expect(item.getAttribute('aria-posinset')).toBe('1');
    expect(container.querySelector('[role="list"]')).not.toBe(null);
  });
});
