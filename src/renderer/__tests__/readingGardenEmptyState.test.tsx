// @vitest-environment jsdom
/**
 * Liquid Workplace L9 · City (the Reading Garden) — rubric category 8, honest states.
 *
 * The garden's dossier was LIVING its empty state without ever NAMING it: with no page
 * ever read it said "0 / 50 pages banked", which reads as stalled progress rather than
 * "you have not started". Category 8 scored the surface `0 of 0 observable` for exactly
 * that, and the repair is one conditional line.
 *
 * The whole value of that line is that it is CONDITIONAL. An empty-state message that
 * renders unconditionally is a worse defect than the one it replaced — it would tell a
 * reader with 400 pages banked that they have read nothing — and it would still satisfy
 * the probe. So both directions are asserted here, with the same mount and the same
 * assertion, differing only in `pagesRead`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import ReadingGarden from '../components/reading-garden/ReadingGarden';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    // `(): void => undefined` rather than `{}`: `no-empty-function` is an ERROR in this
    // config and comments do not satisfy it, so the sibling garden test carries three of
    // them. Not fixed there — that file belongs to another slice.
    const noop = (): void => undefined;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
    };
  }
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function mountWith(pagesRead: number): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ReadingGarden previewProgress={{ pagesRead, lastEvolvedOn: null }} />);
  });
  // The message lives inside the dossier, which is a disclosure and is closed at rest.
  await act(async () => {
    (host.querySelector('.reading-garden-mushroom-hitbox') as HTMLButtonElement).click();
  });
}

const emptyLine = (): HTMLElement | null =>
  host.querySelector('.reading-garden-info-empty');

describe('Reading Garden — the empty state is named, and only when it is true', () => {
  it('names it at zero pages read, in words rather than a zero', async () => {
    await mountWith(0);
    const line = emptyLine();
    expect(line, 'a garden with nothing read must say so').toBeTruthy();
    // Category 8 requires a MESSAGE, not just a host: a painted host with no text scores
    // `hosts 1 / messages 0` and fails the bar it appears to satisfy.
    expect((line!.textContent || '').trim().length).toBeGreaterThan(11);
    expect(line!.textContent).not.toMatch(/^mooncap\./);
  });

  it('says nothing of the kind once a single page has been read', async () => {
    await mountWith(1);
    expect(
      emptyLine(),
      'one page read is not an empty garden; an unconditional message would be a new lie',
    ).toBeNull();
  });

  it('is still absent deep into the garden', async () => {
    await mountWith(400);
    expect(emptyLine()).toBeNull();
  });
});
