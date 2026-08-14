// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEXICON_NOTES_CHANGED_EVENT,
  type LexiconNote,
  type LexiconNoteListQuery,
  type LexiconNoteListResult,
} from '../../shared/lexiconNotes';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));

import NotesBrowser from '../components/lexicon/NotesBrowser';

function note(overrides: Partial<LexiconNote> = {}): LexiconNote {
  return {
    lang: 'ja',
    text: '食べる',
    reading: 'たべる',
    note: 'ichidan verb',
    tags: ['verbs'],
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

const NEKO = note({ text: '猫', reading: 'ねこ', note: 'everyday word', tags: ['animals'] });
const SHENGWU = note({ lang: 'zh', text: '生物', reading: '', note: 'shēngwù', tags: [] });

let dictNoteList: ReturnType<typeof vi.fn>;

/** Most cases assert what was *read*, not what was opened; this is that "nobody is listening". */
const ignoreOpen = (): void => undefined;

function stubApi(list: (query: LexiconNoteListQuery) => Promise<LexiconNoteListResult>): void {
  dictNoteList = vi.fn(list);
  (window as unknown as { api: Record<string, unknown> }).api = { dictNoteList };
}

/** The ordinary case: everything seeded, paged by whatever the surface asked for. */
function stubWith(all: LexiconNote[]): void {
  stubApi(async (query) => ({
    notes: all.filter((n) => !query.lang || n.lang === query.lang).slice(0, query.limit),
    total: all.filter((n) => !query.lang || n.lang === query.lang).length,
  }));
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  delete (window as unknown as { api?: unknown }).api;
  vi.clearAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

function need<T>(node: T | null, what: string): T {
  if (!node) throw new Error(`expected ${what} to be rendered`);
  return node;
}

const panel = () => host.querySelector<HTMLDetailsElement>('.lexicon-notes-browser');
const rows = () => [...host.querySelectorAll<HTMLElement>('.lexicon-notes-row')];
const words = () => [...host.querySelectorAll<HTMLElement>('.lexicon-notes-word')].map((n) => n.textContent);
const filterField = () =>
  need(host.querySelector<HTMLInputElement>('.lexicon-notes-filter'), 'the filter field');
const scopeToggle = () =>
  need(host.querySelector<HTMLInputElement>('.lexicon-notes-scope input'), 'the language scope toggle');

/** `<details>` does not fire `toggle` in jsdom on its own; the component reads `open` off the event. */
async function openPanel(): Promise<void> {
  const details = need(panel(), 'the notes panel');
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event('toggle', { bubbles: false }));
  });
}

async function type(field: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(node: HTMLElement): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('the notes browser', () => {
  it('costs nothing until it is opened', async () => {
    stubWith([note(), NEKO]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    expect(panel()).not.toBeNull();
    expect(dictNoteList).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it('lists the words a note was written against once opened', async () => {
    stubWith([note(), SHENGWU, NEKO]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    expect(words()).toEqual(['食べる', '生物', '猫']);
    expect(host.textContent).toContain('ichidan verb');
    expect(host.textContent).toContain('lexicon.notes.count:3,3');
  });

  it('says the archive is empty rather than showing nothing at all', async () => {
    stubWith([]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    expect(host.querySelector('.lexicon-notes-empty')?.textContent).toBe('lexicon.notes.empty');
  });

  it('distinguishes "you have written none" from "none match your filter"', async () => {
    stubApi(async (query) => (query.filter ? { notes: [], total: 0 } : { notes: [note()], total: 1 }));
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await type(filterField(), 'zzz');
    expect(host.querySelector('.lexicon-notes-empty')?.textContent).toBe('lexicon.notes.noMatches');
  });

  it('passes the filter to the database rather than sieving the page it already has', async () => {
    stubWith([note(), NEKO]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await type(filterField(), 'ねこ');
    expect(dictNoteList).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: 'ねこ', offset: 0 }),
    );
  });

  it('opens on every language and narrows to one only when asked', async () => {
    stubWith([note(), SHENGWU]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    expect(dictNoteList).toHaveBeenLastCalledWith(expect.objectContaining({ lang: '' }));
    expect(words()).toEqual(['食べる', '生物']);

    await act(async () => {
      scopeToggle().click();
    });
    expect(dictNoteList).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'ja' }));
    expect(words()).toEqual(['食べる']);
  });

  it('looks a noted word up in its own language, not the one the toggle happens to show', async () => {
    const opened: [string, string][] = [];
    stubWith([SHENGWU]);
    await render(<NotesBrowser lang="ja" onOpen={(word, lang) => opened.push([word, lang])} />);
    await openPanel();
    await click(need(host.querySelector<HTMLElement>('.lexicon-notes-open'), 'the open button'));
    expect(opened).toEqual([['生物', 'zh']]);
  });

  it('re-reads when a note is saved elsewhere, so the two surfaces cannot disagree', async () => {
    stubWith([note()]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    expect(dictNoteList).toHaveBeenCalledTimes(1);
    stubWith([note(), NEKO]);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(LEXICON_NOTES_CHANGED_EVENT));
    });
    expect(words()).toEqual(['食べる', '猫']);
  });

  it('ignores that announcement while closed, rather than reading for a list nobody sees', async () => {
    stubWith([note()]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(LEXICON_NOTES_CHANGED_EVENT));
    });
    expect(dictNoteList).not.toHaveBeenCalled();
  });

  it('offers the rest only while there is a rest, and asks for a bigger page', async () => {
    // Every note fits on the first page: nothing more to fetch, so no control.
    stubWith([note(), SHENGWU, NEKO]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    expect(host.querySelector('.lexicon-notes-more')).toBeNull();

    // Now the page is a window onto nine, and the control has to appear.
    stubApi(async (query) => ({ notes: [note(), SHENGWU].slice(0, query.limit), total: 9 }));
    await type(filterField(), 'a');
    const more = need(host.querySelector<HTMLButtonElement>('.lexicon-notes-more'), 'the show-more button');
    await click(more);
    expect(dictNoteList).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('never lands a slow reply for a filter the reader has already retyped', async () => {
    const replies: ((result: LexiconNoteListResult) => void)[] = [];
    stubApi(() => new Promise<LexiconNoteListResult>((resolve) => replies.push(resolve)));
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await type(filterField(), 'ね');
    await act(async () => {
      replies[1]?.({ notes: [NEKO], total: 1 });
      replies[0]?.({ notes: [note(), SHENGWU], total: 2 });
    });
    expect(words()).toEqual(['猫']);
  });

  it('reports a failed read as a failure instead of as an empty archive', async () => {
    stubApi(async () => {
      throw new Error('database is gone');
    });
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    expect(host.querySelector('.lexicon-notes-error')?.textContent).toBe('lexicon.notes.failed');
    expect(host.querySelector('.lexicon-notes-empty')).toBeNull();
  });

  it('stays absent when the preload cannot list notes, rather than claiming there are none', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {};
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    expect(panel()).toBeNull();
    expect(host.textContent).toBe('');
  });
});
