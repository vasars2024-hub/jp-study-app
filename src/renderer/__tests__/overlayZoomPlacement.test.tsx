// @vitest-environment jsdom
/**
 * J1: overlays inside #root land ON their anchor at the 80% default zoom.
 *
 * #root carries CSS `zoom`. `getBoundingClientRect()` reports viewport pixels (already
 * scaled), while a `left/top` written on an element inside #root is scaled again. The
 * tour's spotlight ring / bubble and the Gum filter popovers used the raw client rect,
 * so at 0.8 they sat a fifth of the way short of their trigger (towards the top-left).
 * Both now convert through `zoomCoords.toLayoutRect`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import TourOverlay from '../components/onboarding/TourOverlay';
import GumPopover from '../components/media/gum/GumPopover';
import { layoutViewport, toLayoutRect } from '../zoomCoords';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';

const ZOOM = 0.8;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TELEMETRY_CONSENT_KEY, 'no');
  document.documentElement.style.setProperty('--app-zoom', String(ZOOM));
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  document.documentElement.style.removeProperty('--app-zoom');
});

function clientRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('zoomCoords', () => {
  it('converts a client rect and the viewport into layout pixels', () => {
    const r = toLayoutRect(clientRect(80, 400, 40, 20));
    expect(r).toEqual({ left: 100, top: 500, width: 50, height: 25, right: 150, bottom: 525 });
    const vp = layoutViewport();
    expect(vp.width).toBeCloseTo(window.innerWidth / ZOOM);
    expect(vp.height).toBeCloseTo(window.innerHeight / ZOOM);
  });
});

describe('the tour spotlight sits on its anchor at 80% zoom', () => {
  it('the ring for the Start step is at the Start button, in layout pixels', async () => {
    const start = document.createElement('button');
    start.className = 'os-start-btn';
    start.getBoundingClientRect = () => clientRect(80, 560, 40, 40);
    document.body.append(start);
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<TourOverlay />);
    });
    const next = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next');
    await act(async () => {
      next?.click();
    });
    const ring = host.querySelector<HTMLElement>('.tour-ring');
    expect(ring, 'the Start step draws a spotlight').toBeTruthy();
    // 80 / 0.8 = 100 and 560 / 0.8 = 700, minus the 6px spotlight padding.
    expect(ring?.style.left).toBe('94px');
    expect(ring?.style.top).toBe('694px');
    expect(ring?.style.width).toBe('62px');
  });
});

describe('the tour bubble stays on screen at 80% zoom', () => {
  it('beside an anchor that fills the window, the bubble is placed inside it — never off screen', async () => {
    const { rememberStep } = await import('../onboardingStore');
    rememberStep('flash-review');
    const win = document.createElement('section');
    win.className = 'fwin';
    win.dataset.section = 'flashcards';
    const card = document.createElement('div');
    card.className = 'flash-review-setup';
    // Nearly the whole window, in viewport pixels.
    card.getBoundingClientRect = () => clientRect(10, 10, window.innerWidth - 20, window.innerHeight - 20);
    win.append(card);
    document.body.append(win);
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<TourOverlay />);
    });
    const bubble = host.querySelector<HTMLElement>('.tour-bubble');
    expect(host.querySelector('.tour-ring'), 'the card is spotlit').toBeTruthy();
    const vp = layoutViewport();
    const left = parseFloat(bubble?.style.left ?? 'NaN');
    const top = parseFloat(bubble?.style.top ?? 'NaN');
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    // The bubble's fallback size (jsdom lays nothing out) must fit inside the layout viewport.
    expect(left + 340).toBeLessThanOrEqual(vp.width);
    expect(top + 220).toBeLessThanOrEqual(vp.height);
  });
});

describe('a Gum popover opens under its trigger at 80% zoom', () => {
  it('places the panel at the summary, not a fifth short of it', async () => {
    const gumRoot = document.createElement('div');
    gumRoot.className = 'gum-root';
    gumRoot.getBoundingClientRect = () => clientRect(0, 0, 800, 600);
    document.body.append(gumRoot);
    root = createRoot(gumRoot);
    await act(async () => {
      root?.render(
        <GumPopover label="Sort" ariaLabel="Sort">
          {() => <button type="button">Title</button>}
        </GumPopover>,
      );
    });
    const details = gumRoot.querySelector('details') as HTMLDetailsElement;
    const summary = details.querySelector('summary') as HTMLElement;
    summary.getBoundingClientRect = () => clientRect(400, 100, 80, 20);
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const panel = gumRoot.querySelector<HTMLElement>('.gum-pop__panel');
    expect(panel, 'the panel opened').toBeTruthy();
    // Trigger at 400/0.8 = 500 layout px; its bottom at 120/0.8 = 150, plus the 8px gap.
    expect(panel?.style.left).toBe('500px');
    expect(panel?.style.top).toBe('158px');
  });
});
