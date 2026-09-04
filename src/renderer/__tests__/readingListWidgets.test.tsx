// @vitest-environment jsdom
/**
 * Reading Lists §11.2 — the four widgets, on the real registry.
 *
 * The section's three widget rules are what this file checks, because they are
 * the ones a widget silently breaks: it appears in the gallery like any other
 * widget, it renders a real empty state rather than a blank box, and it
 * survives its chosen list being deleted instead of taking the desktop's whole
 * widget layer down with it.
 *
 * Navigation is asserted through `os:open`, which is the bus `DesktopShell`
 * already listens on — a widget that opened books its own way would disagree
 * with the library about which window the reader is in (§11.1).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { resetReadingListsClientForTesting } from '../readingListsClient';
import {
  addReadingListEntry,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
  setReadingEntryState,
} from '../../shared/readingListMutations';
import { emptyReadingListsDocument, type ReadingListsDocument } from '../../shared/readingLists';
import type { WidgetProps } from '../widgets/types';

const TYPES = [
  'reading-list-progress',
  'reading-next-up',
  'reading-challenge-pace',
  'reading-list-finished',
] as const;

let host: HTMLDivElement;
let root: Root;
let openings: unknown[];
type Registry = typeof import('../widgets/registry');
let registry: Registry;

/**
 * The registry is imported dynamically, AFTER a `window.api` exists.
 *
 * `widgets/registry` pulls in `music.tsx`, which pulls in `playerBus`, which
 * calls `window.api.onPlayerSync` at module scope. A static import therefore
 * throws before a single test runs — and it throws inside the module graph, so
 * the failure reads as "no tests" rather than as a missing stub.
 */
beforeAll(async () => {
  installBridge(sealReadingListsDocument(emptyReadingListsDocument()));
  registry = await import('../widgets/registry');
});

function installBridge(document: ReadingListsDocument | null) {
  (window as unknown as { api?: unknown }).api = {
    listLibrary: async () => [],
    onLibraryChanged: () => () => undefined,
    onPlayerSync: () => () => undefined,
    onPlayerCommand: () => () => undefined,
    playerWindowId: async () => 1,
    playerGetSnapshot: async () => null,
    readingListsLoad: async () =>
      document
        ? { ok: true, snapshot: { document, health: { state: 'ok', lostRevisions: 0 } } }
        : { ok: false, code: 'read-failed' },
    readingListsWrite: async () => ({ ok: false, code: 'write-failed' }),
    readingListsEvents: async () => ({ ok: true, events: [] }),
    onReadingListsChanged: () => () => undefined,
  };
}

/** One list, three entries, none of them finished. */
function unfinished(): ReadingListsDocument {
  let context = createReadingListsMutationContext(1_700_000_000_000);
  const created = createReadingList(emptyReadingListsDocument(), { name: 'Autumn' }, context);
  let document = created.document;
  ['雪国', '砂の女', '人間失格'].forEach((title, index) => {
    context = createReadingListsMutationContext(1_700_000_000_001 + index);
    document = addReadingListEntry(document, created.listId, { title, state: 'owned' }, context)
      .document;
  });
  return sealReadingListsDocument(document);
}

/** One list, three entries, the middle one finished. */
function seeded(): ReadingListsDocument {
  let context = createReadingListsMutationContext(1_700_000_000_000);
  const created = createReadingList(emptyReadingListsDocument(), { name: 'Summer' }, context);
  let document = created.document;
  const entryIds: string[] = [];
  ['Kino no Tabi', 'コンビニ人間', 'ノルウェイの森'].forEach((title, index) => {
    context = createReadingListsMutationContext(1_700_000_000_001 + index);
    const added = addReadingListEntry(document, created.listId, { title, state: 'owned' }, context);
    document = added.document;
    if (added.entryId) entryIds.push(added.entryId);
  });
  const finished = setReadingEntryState(
    document,
    created.listId,
    entryIds[0],
    'finished',
    createReadingListsMutationContext(1_700_000_000_100),
  );
  return sealReadingListsDocument(finished.document);
}

const PROPS: WidgetProps = {
  settings: {},
  setSettings: () => undefined,
  size: { w: 300, h: 260 },
};

async function renderWidget(type: string, props: Partial<WidgetProps> = {}) {
  const def = registry.getWidgetDef(type);
  if (!def) throw new Error(`${type} is not registered`);
  const Component = def.component;
  await act(async () => {
    root.render(<Component {...PROPS} {...props} />);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// Removed in `afterEach`: a listener added per test and never taken off records
// every later test's dispatches too, so "one click, one route" reads as four.
const recordOpen = (event: Event) => {
  openings.push((event as CustomEvent).detail);
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  openings = [];
  window.addEventListener('os:open', recordOpen);
  resetReadingListsClientForTesting();
});

afterEach(() => {
  window.removeEventListener('os:open', recordOpen);
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('Reading Lists widgets', () => {
  it('registers all four in the gallery with translated titles and descriptions', () => {
    for (const type of TYPES) {
      const def = registry.getWidgetDef(type);
      if (!def) throw new Error(`${type} is missing from WIDGETS`);
      expect(registry.WIDGETS.filter((entry) => entry.type === type)).toHaveLength(1);
      for (const [language, catalog] of Object.entries(CATALOGS)) {
        expect(catalog[def.titleKey], `${language} missing ${def.titleKey}`).toBeTruthy();
        expect(catalog[def.descKey], `${language} missing ${def.descKey}`).toBeTruthy();
      }
    }
  });

  it('shows an invitation, not a blank box, when there are no lists at all', async () => {
    installBridge(sealReadingListsDocument(emptyReadingListsDocument()));
    for (const type of ['reading-list-progress', 'reading-next-up'] as const) {
      await renderWidget(type);
      expect(host.querySelector('.wgt-rl-empty'), type).not.toBeNull();
      expect(host.textContent, type).toContain('No reading lists yet');
    }
  });

  it('draws the counts the view model computed and offers the next book', async () => {
    installBridge(seeded());
    await renderWidget('reading-list-progress');

    // Three entries, one finished, none excluded from the denominator.
    expect(host.textContent).toContain('1 of 3 finished');
    // The finished one is never next up; the list's own order picks among the rest.
    expect(host.querySelector('.wgt-rl-next-title')?.textContent).toBe('コンビニ人間');
  });

  it('routes an unbound next-up row to the list rather than a button that does nothing', async () => {
    installBridge(seeded());
    await renderWidget('reading-next-up', { size: { w: 220, h: 240 } });

    const button = host.querySelector<HTMLButtonElement>('.wgt-rl-oneshot');
    expect(button).not.toBeNull();
    await act(async () => button?.click());
    expect(openings).toHaveLength(1);
    expect(openings[0]).toMatchObject({ section: 'lists', intent: 'browse' });
  });

  it('survives the chosen list having been deleted', async () => {
    installBridge(seeded());
    // A settings bag pointing at a list that is not in the document: exactly the
    // state a delete leaves behind. It must fall back, not throw.
    await renderWidget('reading-list-progress', { settings: { listId: 'rl_gone' } });
    expect(host.textContent).toContain('Summer');
    expect(host.textContent).toContain('1 of 3 finished');
  });

  it('says a challenge needs a target date instead of inventing a pace', async () => {
    installBridge(seeded());
    await renderWidget('reading-challenge-pace');
    expect(host.textContent).toContain('No list has a target date');
  });

  it('lists the recent finishes with their dates and opens the list for an unbound one', async () => {
    installBridge(seeded());
    await renderWidget('reading-list-finished', { size: { w: 300, h: 200 } });

    const rows = host.querySelectorAll('.wgt-rl-finish');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Kino no Tabi');

    await act(async () => (rows[0] as HTMLButtonElement).click());
    expect(openings[0]).toMatchObject({ section: 'lists', intent: 'browse' });
  });

  it('says nothing is finished yet rather than rendering a blank list', async () => {
    installBridge(unfinished());
    await renderWidget('reading-list-finished', { size: { w: 300, h: 200 } });

    expect(host.querySelectorAll('.wgt-rl-finish')).toHaveLength(0);
    expect(host.querySelector('.wgt-rl-empty')).not.toBeNull();
    expect(host.textContent).toContain('No books finished yet');
  });

  /**
   * The guard the missing key got past.
   *
   * `tools/i18n-check.cjs` compares the four catalogs against each other, so a
   * key used at a call site but present in NONE of them is green on every gate
   * and only shows up as a raw dotted string in the rendered widget. Four of
   * these widgets' states are reached rarely, so "someone will notice" is not a
   * check. Read the call sites out of the source and demand all four languages.
   */
  it('has every key its call sites use, in all four catalogs', () => {
    const source = readFileSync(
      resolve(__dirname, '..', 'widgets', 'readingLists.tsx'),
      'utf8',
    );
    const used = [...source.matchAll(/\bt\('([\w.-]+)'/g)].map((match) => match[1]);
    // A mis-scoped regex that finds nothing would pass every assertion below.
    expect(used.length).toBeGreaterThanOrEqual(14);
    for (const key of new Set(used)) {
      for (const [language, catalog] of Object.entries(CATALOGS)) {
        expect(catalog[key], `${language} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it('says the lists could not be read rather than claiming there are none', async () => {
    installBridge(null);
    await renderWidget('reading-list-progress');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain('could not be read');
    expect(host.textContent).not.toContain('No reading lists yet');
  });
});
