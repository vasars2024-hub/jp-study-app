// @vitest-environment jsdom
/**
 * Slice 68 — the `alt` decision on library artwork.
 *
 * **Why this file is `.ts` and builds its elements with `createElement`.**
 * `vitest.config.ts` collects `src/renderer/__tests__/**\/*.test.ts` — `.ts`, not `.tsx`. The two
 * `.tsx` files in this directory are matched by nothing and need
 * `docs/migration/tools/vitest.tsx.config.mjs` to run at all (slice 40, and they had both drifted
 * out of agreement with their components by the time anyone executed them). A `.tsx` test here
 * would not appear in the coordinator's `npx vitest run` count, which is the only count anyone
 * reads. So: no JSX, and the root config collects it with no config change.
 *
 * **What it is guarding.** The packaged gate reported thirteen images marked `alt=""` "inside a
 * card carrying no text". Twelve of those are poster cards whose card element carries the title
 * as `aria-label` AND as visible text — the gate's `img.closest(…, [class*="card"], …)` resolves
 * to the image's OWN class, `medialib-card__img`, so `cardTextLength` is 0 for structural reasons
 * and says nothing about the card. `docs/migration/SLICE_68_ARTWORK_ALT.md` §1 has the proof.
 *
 * So the regression this file exists to prevent is the "obvious fix": setting `alt={title}` on the
 * poster grid, which would announce every item's title twice. Case 4 fails if anyone does that.
 *
 * These assertions read the DOM primitives an accessible name is computed FROM (`alt`,
 * `aria-label`, `role`, `aria-hidden`) rather than a computed name — jsdom does not implement
 * accname. The computed names for these same cards were measured separately, in the packaged
 * run's keyboard walk: twelve `div.medialib-card` stops named "Fixture Title 1..12".
 */
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import MediaArtwork from '../components/media/library/MediaArtwork';
import MediaPosterCard from '../components/media/library/MediaPosterCard';
import { invalidateMediaArtwork } from '../components/media/library/useMediaArtwork';

/**
 * `useMediaArtwork` memoises per id in module scope, so ids must not be reused across cases —
 * and the memo must be dropped between them, or case 2 reads case 1's answer.
 */
const ART = 'playfile://11111111-2222-3333-4444-555555555555/';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  invalidateMediaArtwork();
  (window as unknown as { api: { mediaArtwork: (id: string) => Promise<string | null> } }).api = {
    // `artless-*` is how a case asks for the fallback branch without going through `id: null`,
    // which short-circuits before the IPC call and would not prove the same thing.
    mediaArtwork: async (id: string) => (id.startsWith('artless') ? null : ART),
  };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

/** Renders and lets the artwork promise settle — the URL arrives in an effect, not on mount. */
async function render(node: Parameters<Root['render']>[0]): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
  // A second empty act flushes the `.then` that sets the resolved URL. Without it every case
  // below measures the loading state and case 1 passes for the wrong reason.
  await act(async () => undefined);
  return host;
}

const img = (el: HTMLElement): HTMLImageElement | null => el.querySelector('img');
const fallback = (el: HTMLElement): HTMLElement | null => el.querySelector('.medialib-card__fallback');

describe('MediaArtwork alt decision', () => {
  it('1. a decorative image is marked decorative — alt present and empty', async () => {
    const el = await render(createElement(MediaArtwork, {
      id: 'deco-1', title: 'Fixture Title 1', decorative: true,
    }));
    const image = img(el);
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe(ART);
    // Present-and-empty, not absent: an absent alt makes a screen reader fall back to reading
    // the file name, which for `playfile://<uuid>/` is a uuid.
    expect(image?.hasAttribute('alt')).toBe(true);
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('2. a labelled image carries its label as the accessible name', async () => {
    const el = await render(createElement(MediaArtwork, {
      id: 'named-2', title: 'Fixture Title 1', alt: 'Fixture Title 1',
    }));
    // FAILED BEFORE SLICE 68: `MediaArtwork.tsx:88` hardcoded `alt=""`, and the `alt` prop did
    // not exist at all — this line was a type error as well as a wrong value.
    expect(img(el)?.getAttribute('alt')).toBe('Fixture Title 1');
  });

  it('3a. the ARTLESS fallback stays hidden when the caller says decorative', async () => {
    const el = await render(createElement(MediaArtwork, {
      id: 'artless-3a', title: 'Fixture Title 1', decorative: true,
    }));
    expect(img(el)).toBeNull();
    const block = fallback(el);
    expect(block).not.toBeNull();
    expect(block?.getAttribute('aria-hidden')).toBe('true');
    expect(block?.getAttribute('role')).toBeNull();
  });

  it('3b. the ARTLESS fallback carries the label when the caller gives one', async () => {
    const el = await render(createElement(MediaArtwork, {
      id: 'artless-3b', title: 'Fixture Title 1', alt: 'Fixture Title 1',
    }));
    const block = fallback(el);
    expect(block).not.toBeNull();
    // FAILED BEFORE SLICE 68: the fallback was unconditionally `aria-hidden="true"`, so a
    // labelled caller was announced only for items that HAPPEN to have art — silent for exactly
    // the artless ones, which are the case a label is most needed for. Fixing only the `<img>`
    // branch leaves this failing, which is why it is a separate assertion.
    expect(block?.getAttribute('role')).toBe('img');
    expect(block?.getAttribute('aria-label')).toBe('Fixture Title 1');
    expect(block?.getAttribute('aria-hidden')).toBeNull();
  });

  it('4. a poster card names the CARD, not the image — the shipped, correct pattern', async () => {
    const el = await render(createElement(MediaPosterCard, {
      artworkId: 'card-4', title: 'Fixture Title 1', onOpen: () => undefined,
    }));
    const card = el.querySelector('.medialib-card');
    expect(card?.getAttribute('role')).toBe('button');
    expect(card?.getAttribute('aria-label')).toBe('Fixture Title 1');
    expect(card?.querySelector('.medialib-card__title')?.textContent).toBe('Fixture Title 1');
    // The regression guard. `alt={title}` here would announce "Fixture Title 1" as the image and
    // again as the card. The packaged gate flags this image as a candidate defect and is wrong
    // to — see the file header.
    expect(img(el)?.getAttribute('alt')).toBe('');
  });

  it('5. no render produces an <img> with the alt attribute missing', async () => {
    for (const props of [
      { id: 'sweep-a', title: 'A', decorative: true } as const,
      { id: 'sweep-b', title: 'B', alt: 'B' } as const,
      { id: 'sweep-c', title: 'C', variant: 'banner', decorative: true } as const,
    ]) {
      const el = await render(createElement(MediaArtwork, props));
      const image = img(el);
      expect(image?.hasAttribute('alt')).toBe(true);
      if (root) await act(async () => root?.unmount());
      root = null;
      host?.remove();
      host = null;
    }
  });
});
