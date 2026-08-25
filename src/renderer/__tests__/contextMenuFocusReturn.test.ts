// @vitest-environment jsdom
/**
 * `ContextMenu` must give the keyboard back what it borrowed, rubric category 1/2.
 *
 * What it guards. The menu focuses its first item on open and, until 2026-08-25,
 * never moved focus back. Measured live that day on the Liquid Video window:
 * opening a media card's overflow menu (`.medialib-card__more` → `.ui-menu`) and
 * pressing Escape alone closed the menu — `[role=menu]` count 2 → 1, the second
 * being the always-mounted `seanime-host` — and left `document.activeElement` as
 * **`BODY`**. A keyboard user is then at the top of the window with no way to
 * resume from the card they were on.
 *
 * `.ts` and `createElement` rather than `.tsx`: `vitest.config.ts` collects
 * `src/renderer/__tests__/**\/*.test.ts`, so a `.tsx` file here runs nowhere.
 */
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ContextMenu } from '../components/ui/ContextMenu';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLElement | null = null;
let trigger: HTMLButtonElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  trigger?.remove();
  trigger = null;
});

const ITEMS = [
  { id: 'play', label: 'Play' },
  { id: 'details', label: 'Show details' },
  { id: 'remove', label: 'Remove' },
];

/** A real trigger with focus, then the menu it opens — the live sequence. */
async function openFromTrigger(): Promise<HTMLButtonElement> {
  trigger = document.createElement('button');
  trigger.textContent = 'More actions';
  document.body.append(trigger);
  trigger.focus();
  expect(document.activeElement).toBe(trigger);

  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(createElement(ContextMenu, {
      open: true,
      x: 120,
      y: 80,
      items: ITEMS,
      onClose: () => undefined,
    }));
  });
  return trigger;
}

async function setOpen(next: boolean): Promise<void> {
  await act(async () => {
    root?.render(createElement(ContextMenu, {
      open: next,
      x: 120,
      y: 80,
      items: ITEMS,
      onClose: () => undefined,
    }));
  });
}

describe('ContextMenu returns focus to whatever opened it', () => {
  it('moves focus into the menu on open and back to the trigger on close', async () => {
    const opener = await openFromTrigger();
    expect((document.activeElement?.textContent ?? '').trim()).toBe('Play');

    await setOpen(false);
    expect(document.activeElement).toBe(opener);
  });

  it('returns focus when the whole menu unmounts, not only when open flips', async () => {
    const opener = await openFromTrigger();
    expect(document.activeElement).not.toBe(opener);

    await act(async () => root?.unmount());
    root = null;
    expect(document.activeElement).toBe(opener);
  });

  it('leaves focus alone when the selection deliberately moved it elsewhere', async () => {
    const opener = await openFromTrigger();
    const elsewhere = document.createElement('input');
    document.body.append(elsewhere);
    elsewhere.focus();

    await setOpen(false);
    // The menu only reclaims focus it still owns. A rename field or a dialog the
    // item opened keeps it; snatching it back would be the worse bug.
    expect(document.activeElement).toBe(elsewhere);
    expect(document.activeElement).not.toBe(opener);
    elsewhere.remove();
  });

  it('does not reclaim focus for a trigger that left the DOM', async () => {
    const opener = await openFromTrigger();
    opener.remove();
    trigger = null;

    await setOpen(false);
    expect(document.activeElement).toBe(document.body);
  });
});
