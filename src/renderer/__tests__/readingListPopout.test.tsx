// @vitest-environment jsdom
/**
 * §11.1's last row: *"Middle-click / Ctrl-click opens in a pop-out wherever the
 * app already supports it (`AppSection popout`)"*.
 *
 * Two halves, and they fail independently, so they are asserted independently:
 *
 *   · the GESTURE — a card discriminates Ctrl/Cmd-click and middle-click from a
 *     plain click, stages the route, and asks main for the window;
 *   · the HAND-OFF — a pop-out claims that route on mount and a desktop window
 *     does not, because the desktop is normally the window that staged it.
 *
 * The hand-off travels through `localStorage` because a pop-out is a separate
 * renderer process and `readingWorkspaceNavigation`'s pending-route Map does
 * not cross a window boundary. `isPopoutWindow` reads `location.search` at call
 * time, which is why these tests move the URL with `history.replaceState`
 * rather than stubbing the module.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReadingListsView, { resetReadingListReturnForTesting } from '../views/ReadingListsView';
import { resetReadingListsClientForTesting } from '../readingListsClient';
import {
  __resetStagedPopoutReadingWorkspaceRoute,
  consumeStagedPopoutReadingWorkspaceRoute,
  stageReadingWorkspaceRouteForPopout,
  subscribeStagedPopoutReadingWorkspaceRoutes,
} from '../readingWorkspaceNavigation';
import {
  READING_WORKSPACE_SCHEMA_VERSION,
  type ReadingWorkspaceRoute,
} from '../../shared/readingWorkspace';
import {
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
} from '../../shared/readingListMutations';
import {
  emptyReadingListsDocument,
  type ReadingListsDocument,
} from '../../shared/readingLists';
import type { LibraryItem } from '../../shared/types';

const ITEM: LibraryItem = {
  id: 'item-1',
  title: 'Kino no Tabi',
  type: 'book',
  addedAt: 1,
} as unknown as LibraryItem;

function listRoute(listId: string): ReadingWorkspaceRoute {
  return {
    version: READING_WORKSPACE_SCHEMA_VERSION,
    section: 'lists',
    intent: 'browse',
    listId,
  };
}

function asPopout(): void {
  window.history.replaceState({}, '', '/?popout=reading');
}

function asDesktop(): void {
  window.history.replaceState({}, '', '/');
}

beforeEach(() => {
  asDesktop();
  __resetStagedPopoutReadingWorkspaceRoute();
  resetReadingListsClientForTesting();
  resetReadingListReturnForTesting();
});

afterEach(() => {
  asDesktop();
  __resetStagedPopoutReadingWorkspaceRoute();
  vi.restoreAllMocks();
});

describe('the Ctrl-click hand-off between windows', () => {
  it('is claimed by a pop-out and only once', () => {
    expect(stageReadingWorkspaceRouteForPopout(listRoute('list-a'))).toBe(true);
    asPopout();
    expect(consumeStagedPopoutReadingWorkspaceRoute('reading')).toMatchObject({
      section: 'lists',
      listId: 'list-a',
    });
    expect(consumeStagedPopoutReadingWorkspaceRoute('reading')).toBeNull();
  });

  /*
   * The control that matters most. Without the `isPopoutWindow` gate this
   * returns the route, and the window the user is LEAVING navigates too — so
   * one Ctrl-click moves two windows.
   */
  it('is not claimed by the desktop window that staged it', () => {
    stageReadingWorkspaceRouteForPopout(listRoute('list-a'));
    expect(consumeStagedPopoutReadingWorkspaceRoute('reading')).toBeNull();
    // Still there for the window it was meant for.
    asPopout();
    expect(consumeStagedPopoutReadingWorkspaceRoute('reading')).toMatchObject({ listId: 'list-a' });
  });

  it('expires rather than hijacking a pop-out opened later for another reason', () => {
    const staged = Date.now();
    stageReadingWorkspaceRouteForPopout(listRoute('list-a'));
    asPopout();
    vi.spyOn(Date, 'now').mockReturnValue(staged + 61_000);
    expect(consumeStagedPopoutReadingWorkspaceRoute('reading')).toBeNull();
  });

  it('refuses to deliver a route belonging to the other host', () => {
    stageReadingWorkspaceRouteForPopout({
      version: READING_WORKSPACE_SCHEMA_VERSION,
      section: 'plan',
      intent: 'plan',
    });
    asPopout();
    expect(consumeStagedPopoutReadingWorkspaceRoute('reading')).toBeNull();
  });

  /*
   * `popOut` focuses an existing window instead of remounting it, so a
   * mount-only claim would make every gesture after the first do nothing. The
   * `storage` event is the delivery route; jsdom does not raise it between
   * documents, so it is dispatched by hand with the shape the browser sends.
   */
  it('delivers to a pop-out that is already open', () => {
    asPopout();
    const listener = vi.fn();
    const unsubscribe = subscribeStagedPopoutReadingWorkspaceRoutes('reading', listener);
    asDesktop();
    stageReadingWorkspaceRouteForPopout(listRoute('list-b'));
    const raw = window.localStorage.getItem('jp-reading-workspace-popout-route-v1');
    asPopout();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'jp-reading-workspace-popout-route-v1',
        newValue: raw,
      }),
    );
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ section: 'lists', listId: 'list-b' });
  });

  it('installs no listener in a desktop window', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStagedPopoutReadingWorkspaceRoutes('reading', listener);
    stageReadingWorkspaceRouteForPopout(listRoute('list-c'));
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'jp-reading-workspace-popout-route-v1',
        newValue: window.localStorage.getItem('jp-reading-workspace-popout-route-v1'),
      }),
    );
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('the gesture on a list card', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;
  let popOut: ReturnType<typeof vi.fn>;

  function seeded(): { document: ReadingListsDocument; a: string } {
    const ctx = (n: number) => createReadingListsMutationContext(1_700_000_000_000 + n);
    let doc = emptyReadingListsDocument();
    const first = createReadingList(doc, { name: 'From Aya', kind: 'pool' }, ctx(0));
    doc = first.document;
    doc = createReadingList(doc, { name: 'From Ken', kind: 'pool' }, ctx(1)).document;
    return { document: sealReadingListsDocument(doc), a: first.listId };
  }

  function installBridge(document: ReadingListsDocument, withPopOut = true): void {
    (window as unknown as { api?: unknown }).api = {
      listLibrary: async () => [ITEM],
      readingListsLoad: async () => ({
        ok: true,
        snapshot: { document, health: { state: 'ok', lostRevisions: 0 } },
      }),
      readingListsWrite: async () => ({ ok: true, revision: document.revision + 1 }),
      readingListsEvents: async () => ({ ok: true, events: [] }),
      onReadingListsChanged: () => () => undefined,
      ...(withPopOut ? { popOut } : {}),
    };
  }

  async function mount(): Promise<void> {
    host = window.document.createElement('div');
    window.document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <ReadingListsView
          initialListId={null}
          initialEntryId={null}
          onOpenBook={() => undefined}
          onFindWork={() => undefined}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  function cardFor(name: string): HTMLButtonElement {
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.rlv__card-open')];
    const found = buttons.find((button) => button.textContent?.includes(name));
    if (!found) throw new Error(`no card for ${name} among ${buttons.length}`);
    return found;
  }

  /** The grid is on screen exactly when the detail is not — one navigation. */
  function onGrid(): boolean {
    return host.querySelector('.rlv__grid') !== null;
  }

  beforeEach(() => {
    popOut = vi.fn(async () => undefined);
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    host?.remove();
  });

  it('pops out on Ctrl-click and leaves this window on the grid', async () => {
    const { document: doc, a } = seeded();
    installBridge(doc);
    await mount();
    await act(async () => {
      cardFor('From Aya').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
      );
      await Promise.resolve();
    });
    expect(popOut).toHaveBeenCalledWith('reading');
    expect(onGrid()).toBe(true);
    asPopout();
    expect(consumeStagedPopoutReadingWorkspaceRoute('reading')).toMatchObject({ listId: a });
  });

  it('pops out on middle-click, which raises auxclick and never click', async () => {
    const { document: doc, a } = seeded();
    installBridge(doc);
    await mount();
    await act(async () => {
      cardFor('From Aya').dispatchEvent(
        new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }),
      );
      await Promise.resolve();
    });
    expect(popOut).toHaveBeenCalledWith('reading');
    asPopout();
    expect(consumeStagedPopoutReadingWorkspaceRoute('reading')).toMatchObject({ listId: a });
  });

  /*
   * The discrimination control. If the handler fired on every click the two
   * assertions above would pass while the ordinary open was broken for
   * everyone — the gesture has to be the thing being detected.
   */
  it('leaves a plain click opening the list in this window', async () => {
    installBridge(seeded().document);
    await mount();
    await act(async () => {
      cardFor('From Aya').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(popOut).not.toHaveBeenCalled();
    expect(onGrid()).toBe(false);
  });

  /*
   * §11.1's "no dead ends", applied to the gesture itself: a window main will
   * not open must not swallow the click. Right-click (button 2) is left alone
   * for the same reason — it belongs to the context menu, not to this row.
   */
  it('falls back to opening in this window when there is no pop-out route', async () => {
    installBridge(seeded().document, false);
    await mount();
    await act(async () => {
      cardFor('From Aya').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }),
      );
      await Promise.resolve();
    });
    expect(onGrid()).toBe(false);
  });

  /*
   * The other half of the same rule, and it needs its own test because jsdom's
   * `localStorage` never fails: a renderer denied storage stages nothing, and
   * without this arm the Ctrl-click would suppress the in-window open and then
   * open no window at all.
   */
  it('falls back to opening in this window when the route cannot be staged', async () => {
    installBridge(seeded().document);
    await mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    await act(async () => {
      cardFor('From Aya').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
      );
      await Promise.resolve();
    });
    expect(popOut).not.toHaveBeenCalled();
    expect(onGrid()).toBe(false);
  });

  it('ignores a right-click, which the context menu owns', async () => {
    installBridge(seeded().document);
    await mount();
    await act(async () => {
      cardFor('From Aya').dispatchEvent(
        new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 }),
      );
      await Promise.resolve();
    });
    expect(popOut).not.toHaveBeenCalled();
    expect(onGrid()).toBe(true);
  });
});
