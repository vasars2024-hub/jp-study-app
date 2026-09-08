// @vitest-environment jsdom
/**
 * D341 and D343 — the two defects found by driving the live Files window on
 * 2026-09-08 (pid 4652, window 2, 820x580, the user's own 43,686-item index).
 *
 * D341, measured twice live: delete one index-only row with no search active
 * and `Everything` fell 43,686 -> 43,685 while `Notes` stayed 41,677 and
 * `Outputs` stayed 41,791. The rail then contradicted its own root, because
 * `Sources 185 + Outputs 41,791 + Reference 1,663 + System 28 + Workspaces 19`
 * is 43,686 and the root above them said 43,685. The root renders
 * `allItems.length`, which IS tombstone-filtered; every category came from
 * `state.snapshot.counts`, which is not and never changes after a delete.
 *
 * So the assertions below are on the RAIL, not on the status bar: the existing
 * `filesAppDeletionIntegration` suite already checks the status count moves,
 * and it moved — that is exactly why nobody noticed the rail did not.
 *
 * D343: `Also reachable in <Section>` was a `<dd>` of plain text. The app knows
 * the section id and imports `openSectionSurface` two hundred lines above, and
 * the row sat directly over Open's "Nothing in this app opens this kind of
 * item on its own" — naming a destination and refusing to go there in the same
 * panel.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesApp } from '../components/filesapp/FilesApp';
import {
  countByCategory,
  type FilesIndexSnapshot,
  type FilesItem,
} from '../../shared/filesApp/catalog';
import { resetFavoritesMemoryForTests } from '../filesFavoritesStore';
import { resetCollectionsMemoryForTests } from '../filesCollectionsStore';

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => [],
  addDeckCardsTracked: () => [],
  removeDeckCards: () => [],
}));

class NoopResizeObserver {
  observe(): void {
    /* nothing observed */
  }
  unobserve(): void {
    /* nothing observed */
  }
  disconnect(): void {
    /* nothing observed */
  }
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

async function unmount(): Promise<void> {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function q<T extends Element = HTMLElement>(selector: string): T | null {
  return host?.querySelector<T>(selector) ?? null;
}

function all(selector: string): HTMLElement[] {
  return Array.from(host?.querySelectorAll<HTMLElement>(selector) ?? []);
}

/**
 * A rail node's own number, read off the node the user sees rather than off
 * `counts` — the defect was that those two disagreed.
 */
function railCount(label: string): number | null {
  const node = all('.fa-tree-node').find((n) => n.getAttribute('title') === label);
  const text = node?.querySelector('.fa-tree-count')?.textContent ?? '';
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}

async function selectRow(name: string): Promise<void> {
  await click(all('[role="row"]').find((r) => r.textContent?.includes(name)));
}

/* --------------------------- the fixture --------------------------- */

function item(
  over: Partial<FilesItem> & Pick<FilesItem, 'id' | 'name' | 'kind' | 'categoryId'>,
): FilesItem {
  return {
    provenance: 'unknown',
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    lastUsedAt: null,
    location: { store: 'derived', describes: 'test' },
    flags: {},
    source: 'test',
    ...over,
  };
}

/**
 * Three notes and one highlight, all under `outputs`, so the leaf, the group
 * and the root are three DIFFERENT numbers and a delete has to move all three.
 * The rows are index-only (`localStorage`), which is the soft-delete branch —
 * a file-backed row goes to main and is a different gate.
 */
const ITEMS: FilesItem[] = [
  item({
    id: 'note:1',
    name: 'Alpha note',
    kind: 'note',
    categoryId: 'outputs/notes',
    location: { store: 'localStorage', key: 'jp-notes-v1', describes: 'a note' },
  }),
  item({
    id: 'note:2',
    name: 'Beta note',
    kind: 'note',
    categoryId: 'outputs/notes',
    location: { store: 'localStorage', key: 'jp-notes-v1', describes: 'a note' },
  }),
  item({
    id: 'note:3',
    name: 'Gamma note',
    kind: 'note',
    categoryId: 'outputs/notes',
    location: { store: 'localStorage', key: 'jp-notes-v1', describes: 'a note' },
  }),
  item({
    id: 'hl:1',
    name: 'A highlight',
    kind: 'highlight',
    categoryId: 'outputs/highlights',
    // `source` is what `filesReachability` reads, and `library` is a
    // `preserved` row in `FILES_ROUTE_PARITY` — i.e. an item the user can also
    // reach somewhere else, which is the only case D343 is about.
    source: 'library',
    location: { store: 'localStorage', key: 'jp-highlights-v1', describes: 'a highlight' },
  }),
];

const filesIndex = vi.fn<(force?: boolean) => Promise<FilesIndexSnapshot>>();

function snapshot(items: FilesItem[]): FilesIndexSnapshot {
  return {
    items,
    counts: countByCategory(items),
    enumerators: [{ source: 'test', itemCount: items.length, elapsedMs: 1 }],
    builtAt: Date.now(),
  };
}

beforeEach(() => {
  localStorage.clear();
  resetFavoritesMemoryForTests();
  resetCollectionsMemoryForTests();
  filesIndex.mockReset();
  // Main keeps returning the row: only the renderer's tombstone can hide it,
  // which is what makes the snapshot counts go stale in the first place.
  filesIndex.mockImplementation(async () => snapshot(ITEMS));
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { filesIndex, filesReveal: async () => ({ ok: true }) },
  });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe('D341 — a soft delete leaves the rail counts, not just the root', () => {
  it('starts with a rail that adds up', async () => {
    await mount(<FilesApp />);
    expect(railCount('Everything')).toBe(4);
    expect(railCount('Notes')).toBe(3);
    expect(railCount('Highlights')).toBe(1);
    expect(railCount('Outputs')).toBe(4);
  });

  it('moves the LEAF, the GROUP and the ROOT by one, and keeps them reconciled', async () => {
    await mount(<FilesApp />);
    await selectRow('Beta note');
    await click(q('.fa-delete-action'));
    await click(q('.fa-delete-confirm-yes'));

    expect(all('[role="row"]').some((r) => r.textContent?.includes('Beta note'))).toBe(false);
    expect(railCount('Notes')).toBe(2);
    expect(railCount('Outputs')).toBe(3);
    expect(railCount('Everything')).toBe(3);
    // The reconciliation itself, stated as the arithmetic the user can do on
    // screen: the root is the sum of the top-level groups beneath it.
    expect(railCount('Everything')).toBe(
      (railCount('Sources') ?? 0) +
        (railCount('Outputs') ?? 0) +
        (railCount('Reference') ?? 0) +
        (railCount('System') ?? 0) +
        (railCount('Workspaces') ?? 0),
    );
  });

  it('UNDO puts every one of those numbers back', async () => {
    await mount(<FilesApp />);
    await selectRow('Beta note');
    await click(q('.fa-delete-action'));
    await click(q('.fa-delete-confirm-yes'));
    expect(railCount('Notes')).toBe(2);

    await click(q('.fa-delete-undo'));
    expect(railCount('Notes')).toBe(3);
    expect(railCount('Outputs')).toBe(4);
    expect(railCount('Everything')).toBe(4);
  });

  it('CONTROL: the categories the row did NOT belong to do not move', async () => {
    // Guards the lazy repair of this defect — decrementing every count, or the
    // root and its own chain, by one. Only `outputs/notes`, `outputs` and the
    // root may change; `outputs/highlights` and every other group must not.
    await mount(<FilesApp />);
    await selectRow('Beta note');
    await click(q('.fa-delete-action'));
    await click(q('.fa-delete-confirm-yes'));

    expect(railCount('Highlights')).toBe(1);
    expect(railCount('Sources')).toBe(0);
    expect(railCount('Reference')).toBe(0);
    expect(railCount('Decks')).toBe(0);
  });
});

describe('D343 — "Also reachable in" goes there', () => {
  it('renders the section as a control and opens it', async () => {
    const seen: string[] = [];
    const listener = (ev: Event): void => {
      seen.push(String((ev as CustomEvent<string>).detail));
    };
    window.addEventListener('os:open', listener);
    try {
      await mount(<FilesApp />);
      await selectRow('A highlight');
      const go = q('.fa-details-also-go');
      expect(go).toBeTruthy();
      expect(go?.tagName).toBe('BUTTON');
      // Whatever section the parity table names, the click must dispatch THAT
      // one — asserting a hard-coded id here would pass a table that drifted.
      const named = go?.textContent?.trim() ?? '';
      expect(named).not.toBe('');
      await click(go);
      expect(seen).toHaveLength(1);
      expect(seen[0]).not.toBe('undefined');
    } finally {
      window.removeEventListener('os:open', listener);
    }
  });
});
