// @vitest-environment jsdom
/**
 * The review navigator mounted every chip of the session (1,794 on the heavy
 * profile) and re-rendered all of them on every grade. It now mounts the chips
 * near the viewport, plus the active one, with spacers keeping the geometry.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import WindowedStrip, { STRIP_WINDOW_MIN, stripWindow } from '../components/flashcards/WindowedStrip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, word: `w${i}` }));

async function mount(n: number, activeKey: string | null) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <WindowedStrip
        className="flash-strip flash-review-strip"
        items={items(n)}
        itemKey={(c) => c.id}
        activeKey={activeKey}
        renderItem={(c) => <button type="button" role="listitem" data-id={c.id}>{c.word}</button>}
      />,
    );
  });
  return host;
}

describe('stripWindow', () => {
  it('renders short lists whole', () => {
    expect(stripWindow(STRIP_WINDOW_MIN - 1, 5_000, 800, 212, 3)).toEqual([[0, STRIP_WINDOW_MIN - 1]]);
  });

  it('mounts the viewport plus overscan, and the active chip separately when it is elsewhere', () => {
    // 212px steps, viewport 0..848 = items 0..4; overscan 12 → [0, 16).
    expect(stripWindow(2_000, 0, 848, 212, 3)).toEqual([[0, 16]]);
    expect(stripWindow(2_000, 0, 848, 212, 1_500)).toEqual([[0, 16], [1_500, 1_501]]);
    // Scrolled to the middle.
    expect(stripWindow(2_000, 212 * 1_000, 848, 212, 1_002)).toEqual([[988, 1_016]]);
  });
});

describe('WindowedStrip', () => {
  it('mounts a small slice of a 1,794-card session, including the active card', async () => {
    const host = await mount(1_794, 'c1500');
    const chips = host.querySelectorAll('[role="listitem"]');
    expect(chips.length).toBeLessThan(40);
    expect(host.querySelector('[data-id="c1500"]')).not.toBeNull();
    expect(host.querySelector('[data-id="c0"]')).not.toBeNull();
    // Spacers stand in for the rest, hidden from assistive tech.
    const spacers = host.querySelectorAll('.strip-window-spacer[aria-hidden="true"]');
    expect(spacers.length).toBeGreaterThanOrEqual(2);
  });

  it('renders every chip of a short session', async () => {
    const host = await mount(20, 'c3');
    expect(host.querySelectorAll('[role="listitem"]')).toHaveLength(20);
    expect(host.querySelector('.strip-window-spacer')).toBeNull();
  });
});
