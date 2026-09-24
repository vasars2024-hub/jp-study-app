// @vitest-environment jsdom
//
// The Deck Workbench keeps its edits across unmount (the Anki window's
// collapsible section unmounts it) and writes a local-deck session back into the
// deck. Before: edits lived only in React state, and a local deck's Apply step
// told the user to "export the deck from Anki".
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
  t: (key: string) => key,
}));
vi.mock('../components/anki/deckWorkbench.css', () => ({}));
vi.mock('../components/ui/dialogService', () => ({ confirmDialog: async () => true }));
const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
  kvDelete: async (key: string) => {
    idb.delete(key);
  },
}));

import DeckWorkbench, { WORKBENCH_AUTOSAVE_KEY } from '../components/anki/DeckWorkbench';
import { addDeckCardsTracked, loadDeck, loadDeckAsAnkiDraft } from '../flashcardDeck';
import { createEditJournal, setNoteField } from '../../shared/ankiDraftEdit';
import { stripFieldHtml } from '../../shared/apkgParse';
import { createWorkbenchFlow } from '../../shared/ankiWorkbenchFlow';
import { WORKBENCH_AUTOSAVE_VERSION } from '../../shared/ankiWorkbenchPersistence';
import type { AnkiDraft, AnkiDraftNote } from '../../shared/ankiDraft';

function note(id: string): AnkiDraftNote {
  return {
    id, guid: `g-${id}`, noteTypeId: 'nt1', tags: [], marked: false,
    fields: [{ ord: 0, name: 'Front', raw: id, normalized: id }],
    modifiedAtSec: 0, flags: 0, data: '', cardIds: [`c-${id}`], media: [],
  };
}

function csvPage(ids: string[], fingerprint = 'sha1:abc'): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'csv', label: 'deck.tsv', fingerprint },
    decks: [{ id: 'd1', name: 'Default', path: ['Default'], filtered: false }],
    noteTypes: [{
      id: 'nt1', name: 'Basic', kind: 'standard', css: '',
      fields: [{ ord: 0, name: 'Front', sticky: false, rtl: false }], templates: [], sortFieldOrd: 0,
    }],
    notes: ids.map(note),
    cards: [],
    diagnostics: [],
    counts: { notes: 4, cards: 0, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
  } as AnkiDraft;
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  (window as unknown as { api: Record<string, unknown> }).api = {
    ankiDraftSessionList: vi.fn(async () => []),
  };
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(<DeckWorkbench />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function unmount(): Promise<void> {
  await act(async () => root?.unmount());
  root = null;
}

function button(label: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').startsWith(label));
}

/** A session that edited the local deck: 猫's meaning "cat" -> "a small cat". */
function seedEditedLocalSession(): void {
  addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }]);
  const draft = loadDeckAsAnkiDraft().draft;
  const cardId = loadDeck()[0].id;
  const edited = setNoteField(draft, createEditJournal(), cardId, 2, 'a small cat', stripFieldHtml);
  idb.set(WORKBENCH_AUTOSAVE_KEY, {
    version: WORKBENCH_AUTOSAVE_VERSION,
    savedAt: Date.now(),
    draft: edited.draft,
    totalNotes: 1,
    journal: edited.journal,
    extra: { flow: { ...createWorkbenchFlow(), current: 'apply' }, trayActions: [], masteryHistory: { undo: [], redo: [] } },
  });
}

describe('Deck Workbench persistence', () => {
  it('brings unsaved edits back after an unmount, and says so', async () => {
    seedEditedLocalSession();
    await mount();
    expect(host.textContent).toContain('ankiWorkbench.autosave.restored:1');
    await unmount();

    host = document.createElement('div');
    document.body.append(host);
    await mount();
    expect(host.textContent).toContain('ankiWorkbench.autosave.restored:1');
  });

  it('writes a local-deck session back into the deck', async () => {
    seedEditedLocalSession();
    await mount();
    // The local deck now has a destination instead of "export it from Anki".
    expect(host.textContent).not.toContain('ankiWorkbench.apply.noFile');
    const save = button('ankiWorkbench.apply.local.button');
    expect(save).toBeDefined();
    await act(async () => save?.click());
    expect(loadDeck()[0].meaning).toBe('a small cat');
    expect(host.textContent).toContain('ankiWorkbench.apply.local.ok:1');

    // And the write can be put back in the same session.
    await act(async () => button('ankiWorkbench.apply.local.putBack')?.click());
    expect(loadDeck()[0].meaning).toBe('cat');
  });

  it('refuses to write over a deck that changed since it was loaded', async () => {
    seedEditedLocalSession();
    addDeckCardsTracked([{ word: '犬', reading: 'いぬ', meaning: 'dog', source: 'epub' }]);
    await mount();
    await act(async () => button('ankiWorkbench.apply.local.button')?.click());
    expect(host.textContent).toContain('ankiWorkbench.apply.local.stale');
    expect(loadDeck().find((c) => c.word === '猫')?.meaning).toBe('cat');
  });

  it('discards the saved session on request', async () => {
    seedEditedLocalSession();
    await mount();
    await act(async () => button('ankiWorkbench.autosave.discard')?.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(idb.has(WORKBENCH_AUTOSAVE_KEY)).toBe(false);
    expect(host.textContent).toContain('ankiWorkbench.autosave.discarded');
  });

  it('reads a CSV source past its first page, by the file it came from', async () => {
    const readAnkiCsvDraft = vi.fn()
      .mockResolvedValueOnce({ ok: true, draft: csvPage(['n1', 'n2']), totalNotes: 4 })
      .mockResolvedValueOnce({ ok: true, draft: csvPage(['n3', 'n4']), totalNotes: 4 });
    (window as unknown as { api: Record<string, unknown> }).api = {
      ankiDraftSessionList: vi.fn(async () => []),
      readAnkiCsvDraft,
    };
    await mount();
    await act(async () => button('ankiWorkbench.source.text')?.click());
    expect(host.textContent).toContain('ankiWorkbench.source.loadMore:2');

    await act(async () => button('ankiWorkbench.source.loadMore')?.click());

    expect(readAnkiCsvDraft).toHaveBeenLastCalledWith({ fingerprint: 'sha1:abc', noteOffset: 2, noteLimit: 500 });
    // Everything is loaded now, so the way past the page is gone.
    expect(button('ankiWorkbench.source.loadMore')).toBeUndefined();
  });

  it('refuses a page from a file that is no longer the one opened', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {
      ankiDraftSessionList: vi.fn(async () => []),
      readAnkiCsvDraft: vi.fn()
        .mockResolvedValueOnce({ ok: true, draft: csvPage(['n1', 'n2']), totalNotes: 4 })
        .mockResolvedValueOnce({ ok: false, error: 'source-changed' }),
    };
    await mount();
    await act(async () => button('ankiWorkbench.source.text')?.click());
    await act(async () => button('ankiWorkbench.source.loadMore')?.click());
    expect(host.textContent).toContain('ankiWorkbench.source.pageChanged');
  });
});
