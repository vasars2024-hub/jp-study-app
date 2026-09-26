// @vitest-environment jsdom
/**
 * V12 layout jumps on open (Files): the scaffold's first width reading used
 * `getBoundingClientRect()`, which includes the app zoom on `#root` (80% by default) and
 * the window's open-scale transform, while `ResizeObserver` reports the layout width. A
 * scaffold 1300px wide read 1040 first, painted `medium` (8px gaps), then flipped to
 * `wide` (16px gaps) when the observer answered — every region moved on open.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LiquidAppScaffold, contentWidthOf } from '../components/liquid/LiquidAppScaffold';

let root: Root | null = null;
let host: HTMLDivElement;
const rect = Element.prototype.getBoundingClientRect;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  root?.unmount();
  root = null;
  host?.remove();
  Element.prototype.getBoundingClientRect = rect;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

/** A 1300px layout box painted at 80% zoom: the rect says 1040. */
function zoomedLayout(layoutWidth: number, zoom: number): void {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => layoutWidth });
  Element.prototype.getBoundingClientRect = function stub(this: Element) {
    return { ...rect.call(this), width: layoutWidth * zoom } as DOMRect;
  };
}

async function mount(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <LiquidAppScaffold rail={<p>rail</p>} toolbar={<p>tools</p>} dock={<p>dock</p>}>
        <p>canvas</p>
      </LiquidAppScaffold>,
    );
  });
  const el = host.querySelector<HTMLElement>('.lq-scaffold');
  if (!el) throw new Error('no scaffold');
  return el;
}

describe('scaffold first measurement', () => {
  it('reads the layout width, not the zoomed rect, so the first class is the settled one', async () => {
    zoomedLayout(1300, 0.8);
    const el = await mount();
    expect(el.getAttribute('data-width')).toBe('wide');
  });

  it('still reports a genuinely medium scaffold as medium', async () => {
    zoomedLayout(900, 0.8);
    const el = await mount();
    expect(el.getAttribute('data-width')).toBe('medium');
  });

  it('measures the content box (padding excluded), like ResizeObserver contentRect', () => {
    const el = document.createElement('div');
    el.style.paddingLeft = '10px';
    el.style.paddingRight = '6px';
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 1136 });
    expect(contentWidthOf(el)).toBe(1120);
  });
});
