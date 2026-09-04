// @vitest-environment jsdom
/**
 * §11.1's *"an entry's cover → the library item detail"*, receiving end.
 *
 * The Reading Lists half is asserted in `readingListsView.test.tsx`: the cover
 * is a button, it calls `onShowInLibrary`, and it does NOT open the reader.
 * What only a mounted `LibraryView` can prove is the part that makes the link
 * real rather than merely wired — that the drawer actually opens on the named
 * book **even when the user's own filters would have hidden it**.
 *
 * That is not a hypothetical. `resolveSelection` returns `null` for an id that
 * is not in `visible`, deliberately and correctly (`libraryShelf.ts`: a
 * recorded id outlives its item in three ordinary ways). So setting
 * `selectedId` alone yields a closed drawer and a click that looks broken.
 *
 * Reuses `installReadingSurfaceApi` (RULE 1) — its Proxy answers every unstubbed
 * `window.api` channel inertly, which is what makes mounting this 1,900-line
 * view in jsdom possible at all.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LibraryView from '../views/LibraryView';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';
import type { LibraryItem } from '../../shared/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: LibraryItem[] = [
  { id: 'li_ja', title: 'コンビニ人間', type: 'book', createdAt: 2, folder: 'Japanese' },
  { id: 'li_en', title: 'Kafka on the Shore', type: 'book', createdAt: 1, folder: 'English' },
] as unknown as LibraryItem[];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({
    syncLibrary: async () => ITEMS,
    getWatchFolder: async () => '',
    getLibraryFolders: async () => ['Japanese', 'English'],
  });
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(revealItemId: string | null) {
  await act(async () => {
    root.render(<LibraryView onOpen={() => undefined} revealItemId={revealItemId} />);
    await Promise.resolve();
  });
  // The library load, the folder load and the level enrichment are separate
  // effects; each resolves after the previous has re-rendered.
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
}

/** Whichever shell is live, the drawer publishes its state on a data attribute. */
function drawerIsOpen(): boolean {
  if (host.querySelector('[data-drawer="open"]')) return true;
  // The Aero workbench mounts the same body without that attribute, so fall
  // back to the fact both shells share: the selected title is on screen.
  return host.textContent?.includes('コンビニ人間') ?? false;
}

describe('LibraryView — reveal (§11.1)', () => {
  it('opens the detail drawer on the revealed item', async () => {
    await render('li_ja');
    expect(drawerIsOpen()).toBe(true);
  });

  it('opens no drawer at all when nothing was revealed', async () => {
    // The vacuity check. Without it, "the drawer is open" would be true of a
    // view that simply always shows the first item — and `libraryShelf.ts` says
    // in as many words that it deliberately does NOT backfill the selection.
    await render(null);
    expect(host.querySelector('[data-drawer="open"]')).toBeNull();
  });

  it('clears the folder filter, which is what makes the link land', async () => {
    // The rule under test. `li_ja` is in the folder "Japanese"; the view boots
    // on 'all', so to make the failure reachable the reveal must survive a
    // filter that EXCLUDES it. Switching to "English" first reproduces exactly
    // the state a user leaves behind, and `resolveSelection` then returns null
    // for `li_ja` unless the reveal resets `active`.
    await render(null);
    // The shelf's folder rail (`LibraryView.tsx:1393`), not the View menu —
    // menu items render as bare children on the default theme, so a menu-only
    // control is not reachable from a jsdom mount at all.
    const english = [...host.querySelectorAll<HTMLElement>('.lib-folder-chip')].find((node) =>
      node.textContent?.includes('English'),
    );
    expect(english, 'no folder button for English').toBeTruthy();
    await act(async () => {
      english!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    // The Japanese book is now filtered out — the precondition, asserted rather
    // than assumed, or this test could pass without ever reaching the rule.
    expect(host.textContent).not.toContain('コンビニ人間');

    await act(async () => {
      root.render(<LibraryView onOpen={() => undefined} revealItemId="li_ja" />);
      await Promise.resolve();
    });
    await act(async () => {
      for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
    });

    expect(drawerIsOpen()).toBe(true);
  });
});
