// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlancFilesPanel } from '../components/blanc/BlancFilesPanel';
import type { FilesItem } from '../../shared/filesApp/catalog';

/**
 * Blanc's Files tool, measured on the real component.
 *
 * The three behaviours `FILES_APP_PLAN.md` pins are the reason this port is
 * coverage rather than a folder-shaped panel, so they are what this file
 * asserts — plus the routing regression that driving the surface caught.
 *
 * A note on the fixture: the items are the real shapes taken from the running
 * app's own index this turn (a library EPUB, a SQLite dictionary row, a
 * derived deck), trimmed. Nothing here invents a store the app does not have.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function item(over: Partial<FilesItem> & Pick<FilesItem, 'id' | 'name' | 'kind' | 'categoryId' | 'location'>): FilesItem {
  return {
    provenance: 'app-generated',
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    lastUsedAt: null,
    flags: {},
    source: 'test',
    ...over,
  } as FilesItem;
}

const BOOK = item({
  id: 'library:1',
  name: '悪の教典 02',
  kind: 'book',
  categoryId: 'sources/books',
  provenance: 'book-text',
  sizeBytes: 457183,
  location: { store: 'file', path: 'C:\\jp\\library\\1\\original.epub' },
});

const DICTIONARY = item({
  id: 'dictionary:jmdict',
  name: 'JMdict (Japanese–English)',
  kind: 'dictionary',
  categoryId: 'reference/dictionaries',
  provenance: 'installed',
  location: { store: 'sqlite', database: 'dict.db', table: 'dictionaries', rowId: 'jmdict' },
});

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  // Let the index promise settle and React commit the result.
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

function stubIndex(items: FilesItem[], failed: string[] = []): void {
  (window as unknown as { api: unknown }).api = {
    filesIndex: () =>
      Promise.resolve({
        items,
        counts: [],
        enumerators: [
          { source: 'test' },
          ...failed.map((source) => ({ source, error: 'could not be read' })),
        ],
        builtAt: 1,
      }),
  };
}

function nodes(): HTMLElement[] {
  return Array.from(host?.querySelectorAll<HTMLElement>('.blanc-files-node') ?? []);
}

function rows(): HTMLElement[] {
  return Array.from(host?.querySelectorAll<HTMLElement>('.blanc-files-row') ?? []);
}

function inspectorButtons(): string[] {
  return Array.from(host?.querySelectorAll('.blanc-files-inspector button') ?? []).map(
    (b) => b.textContent ?? '',
  );
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  stubIndex([BOOK, DICTIONARY]);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('the tree keeps the categories that are empty', () => {
  it('shows every node, including the ones reading 0', async () => {
    await mount(<BlancFilesPanel />);
    const labels = nodes().map((n) => n.textContent ?? '');
    // Gate 1's instrument: a category reading 0 while items exist is a
    // FINDING, and a tree that drops its empty nodes cannot be checked for it.
    expect(labels.some((l) => l.includes('Visual novels') && l.endsWith('0'))).toBe(true);
    expect(labels.some((l) => l.includes('Books') && l.endsWith('1'))).toBe(true);
    // A group's count is the sum of its leaves, so the rail cannot drift from
    // the list beside it.
    expect(labels.some((l) => l.startsWith('Sources') && l.endsWith('1'))).toBe(true);
  });

  it('scopes the list to the category, and the root clears it', async () => {
    await mount(<BlancFilesPanel />);
    expect(rows()).toHaveLength(2);
    await click(nodes().find((n) => (n.textContent ?? '').startsWith('Dictionaries')));
    expect(rows().map((r) => r.textContent)).toHaveLength(1);
    await click(nodes().find((n) => (n.textContent ?? '').startsWith('Everything')));
    expect(rows()).toHaveLength(2);
  });
});

describe('reveal is offered only where it can work', () => {
  it('offers it for a file-backed row', async () => {
    await mount(<BlancFilesPanel />);
    await click(rows().find((r) => (r.textContent ?? '').includes('悪の教典')));
    expect(inspectorButtons()).toContain('Reveal in Explorer');
  });

  it('withholds it for a SQLite row and says why', async () => {
    await mount(<BlancFilesPanel />);
    await click(rows().find((r) => (r.textContent ?? '').includes('JMdict')));
    // Absent rather than present-and-failing (gate 12): a dictionary is a row,
    // not a file, and revealing "somewhere near it" is the wrong folder shown
    // as a success.
    expect(inspectorButtons()).not.toContain('Reveal in Explorer');
    expect(host?.querySelector('.blanc-files-inspector')?.textContent).toContain(
      'not a file, so there is no folder to open',
    );
    // The store is still named, so the row is not simply mute about where it
    // lives.
    expect(host?.querySelector('.blanc-files-inspector')?.textContent).toContain(
      'Row in dictionaries (dict.db)',
    );
  });
});

describe('a store that could not be read is named', () => {
  it('names the failed enumerator instead of showing an honest-looking 0', async () => {
    stubIndex([BOOK], ['artwork']);
    await mount(<BlancFilesPanel />);
    const warning = host?.querySelector('.blanc-files-warning')?.textContent ?? '';
    expect(warning).toContain('artwork');
    // The empty node is still rendered, so the two zeroes can be told apart:
    // this one is explained, the rest are real.
    expect(nodes().some((n) => (n.textContent ?? '').includes('Artwork'))).toBe(true);
  });

  it('offers a retry rather than an empty list when the index throws', async () => {
    (window as unknown as { api: unknown }).api = {
      filesIndex: () => Promise.reject(new Error('index unavailable')),
    };
    await mount(<BlancFilesPanel />);
    const text = host?.querySelector('.blanc-files-error')?.textContent ?? '';
    expect(text).toContain('The index could not be read.');
    expect(text).toContain('index unavailable');
    expect(text).toContain('Try again');
  });
});

describe('opening acts on the decision it just printed', () => {
  it('routes a row that has no file to open, through Blanc first', async () => {
    // The regression this pins: the non-routable branch computed a decision,
    // rendered its reason, and opened nothing. A row with no file is exactly
    // the row whose only route is the kind table, so that branch was the one
    // that most needed to act.
    const seen: { detail: unknown; cancelable: boolean }[] = [];
    const onOpenTool = (ev: Event): void => {
      seen.push({ detail: (ev as CustomEvent).detail, cancelable: ev.cancelable });
    };
    window.addEventListener('toolbox:open-tool', onOpenTool);
    try {
      await mount(<BlancFilesPanel />);
      await click(rows().find((r) => (r.textContent ?? '').includes('JMdict')));
      await click(
        Array.from(host?.querySelectorAll('.blanc-files-inspector button') ?? []).find(
          (b) => b.textContent === 'Open',
        ),
      );
      expect(seen).toEqual([{ detail: 'dictionary', cancelable: true }]);
    } finally {
      window.removeEventListener('toolbox:open-tool', onOpenTool);
    }
  });

  it('is cancelable, so a host that claims it suppresses the pop-out fallback', async () => {
    // Without `cancelable`, `preventDefault` is a no-op and the caller can
    // never tell "Blanc took it" from "nobody did" — which would pop a second
    // window open beside the tool that already answered.
    const claim = (ev: Event): void => ev.preventDefault();
    window.addEventListener('toolbox:open-tool', claim);
    const popOut = vi.fn(() => Promise.resolve());
    (window as unknown as { api: Record<string, unknown> }).api.popOut = popOut;
    try {
      await mount(<BlancFilesPanel />);
      await click(rows().find((r) => (r.textContent ?? '').includes('JMdict')));
      await click(
        Array.from(host?.querySelectorAll('.blanc-files-inspector button') ?? []).find(
          (b) => b.textContent === 'Open',
        ),
      );
      expect(popOut).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('toolbox:open-tool', claim);
    }
  });

  it('falls back to the pop-out when nothing claims the section', async () => {
    // The other half, and the reason the fallback exists: a Blanc window that
    // has no tool for the section must still open it somewhere real.
    const popOut = vi.fn(() => Promise.resolve());
    (window as unknown as { api: Record<string, unknown> }).api.popOut = popOut;
    await mount(<BlancFilesPanel />);
    await click(rows().find((r) => (r.textContent ?? '').includes('JMdict')));
    await click(
      Array.from(host?.querySelectorAll('.blanc-files-inspector button') ?? []).find(
        (b) => b.textContent === 'Open',
      ),
    );
    expect(popOut).toHaveBeenCalledWith('dictionary');
  });
});
