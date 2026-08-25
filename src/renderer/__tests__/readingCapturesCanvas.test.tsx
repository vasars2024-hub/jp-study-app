// @vitest-environment jsdom
/**
 * L6's Gate on its first real surface.
 *
 * The defect this migration fixes is not "the panel looked wrong". Captures was
 * a CSS grid with a `minmax(180px, 260px)` list column and a
 * `@media (max-width: 720px)` stack, and a media query reads the WINDOW. The
 * Reading workspace is regularly a pop-out or a docked pane, so at a 500px pane
 * inside a 1400px window the query never fired: the list kept its column and the
 * passage was left ~290px, about 17 characters a line at the 17px reading type.
 *
 * So the assertions are about the CANVAS's own width, at two widths, with the
 * narrow one being the case the old stylesheet got wrong. The stylesheet check
 * at the end is the regression latch — a future worker re-adding a window media
 * query to this surface reintroduces exactly this bug.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReadingCapturesView from '../views/ReadingCapturesView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HISTORY = [
  {
    captureId: 'cap-1',
    text: '彼は図書館で本を読んでいた。',
    source: 'screen',
    sourceLabel: 'Screen',
    capturedAt: 1_700_000_000_000,
  },
  {
    captureId: 'cap-2',
    text: '窓の外では雨が降り続いていた。',
    source: 'screen',
    sourceLabel: 'Window',
    capturedAt: 1_700_000_001_000,
  },
];

/**
 * jsdom lays nothing out, so `ReadingCanvas` would measure 0 and — correctly —
 * place no tool at all. Give it a width the way the real renderer does, through
 * the element's own box, so the measurement path under test is the shipped one
 * rather than a prop that only tests use.
 */
let canvasWidth = 1200;
const realRect = HTMLElement.prototype.getBoundingClientRect;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (window as unknown as { api: unknown }).api = {
    lensHistoryList: async () => HISTORY,
  };
  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
    if (this.classList.contains('lq-reading')) {
      return { ...realRect.call(this), width: canvasWidth, height: 800 } as DOMRect;
    }
    return realRect.call(this);
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  HTMLElement.prototype.getBoundingClientRect = realRect;
  vi.restoreAllMocks();
});

async function mountAt(width: number): Promise<void> {
  canvasWidth = width;
  await act(async () => {
    root.render(<ReadingCapturesView passage={null} />);
  });
  for (let index = 0; index < 20; index += 1) {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 5));
    });
    if (container.querySelector('.reading-captures-row')) break;
  }
}

function tool(): HTMLElement | null {
  return container.querySelector('[data-reading-tool="captures"]');
}

describe('Captures through the L6 reading canvas', () => {
  it('docks the capture list beside the passage on a wide canvas', async () => {
    await mountAt(1200);
    expect(tool()!.dataset.placement).toBe('docked');
    expect(tool()!.style.width).toBe('260px');
    const doc = container.querySelector('[data-reading-role="document"]') as HTMLElement;
    expect(doc.hasAttribute('inert')).toBe(false);
    // 1200 - 260 - 12 gutter. The passage keeps far more than its 384 floor.
    expect(doc.dataset.contentWidth).toBe('928');
    expect(container.querySelectorAll('.reading-captures-row').length).toBe(2);
  });

  it('gives the passage the whole pane at the width the old media query missed', async () => {
    await mountAt(500);
    // The case the `@media (max-width: 720px)` stack never saw: a 500px pane
    // inside a wider window. The list is now a sheet, not a 260px column.
    expect(tool()!.dataset.placement).toBe('sheet');
    expect(tool()!.getAttribute('role')).toBe('dialog');
    const doc = container.querySelector('[data-reading-role="document"]') as HTMLElement;
    expect(doc.dataset.contentWidth).toBe('500');
    // Covered, so inert — and dismissible, which is the difference from being
    // squeezed: one click returns the reader at the same 500px.
    expect(doc.hasAttribute('inert')).toBe(true);
    const close = tool()!.querySelector('.lq-reading-tool-close') as HTMLButtonElement;
    await act(async () => close.click());
    expect(tool()).toBe(null);
    expect(
      (container.querySelector('[data-reading-role="document"]') as HTMLElement).dataset
        .contentWidth,
    ).toBe('500');
  });

  it('keeps a route back to the list after it is dismissed', async () => {
    await mountAt(1200);
    const toggle = container.querySelector('.reading-captures-list-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await act(async () => toggle.click());
    expect(tool()).toBe(null);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await act(async () => toggle.click());
    expect(tool()!.dataset.placement).toBe('docked');
    expect(container.querySelectorAll('.reading-captures-row').length).toBe(2);
  });

  it('has no window-width media query left to reintroduce the bug', () => {
    const css = readFileSync(
      resolve(__dirname, '..', 'views', 'readingCaptures.css'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/@media/);
    expect(css).not.toMatch(/grid-template-columns/);
  });
});
