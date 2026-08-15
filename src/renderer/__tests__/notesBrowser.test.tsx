// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEXICON_NOTES_CHANGED_EVENT,
  type LexiconNote,
  type LexiconNoteExportQuery,
  type LexiconNoteExportResult,
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
    starred: false,
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
  stubApi(async (query) => {
    const matched = all.filter(
      (n) => (!query.lang || n.lang === query.lang) && (!query.starredOnly || n.starred),
    );
    return { notes: matched.slice(0, query.limit), total: matched.length };
  });
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
const starToggle = () =>
  need(
    host.querySelectorAll<HTMLInputElement>('.lexicon-notes-scope input')[1],
    'the starred-only toggle',
  );

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

  it('narrows to starred rows in the database, not in the page it already has', async () => {
    const starredTaberu = note({ starred: true });
    stubWith([starredTaberu, NEKO]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    expect(dictNoteList).toHaveBeenLastCalledWith(expect.objectContaining({ starredOnly: false }));
    expect(words()).toEqual(['食べる', '猫']);

    await act(async () => {
      starToggle().click();
    });
    expect(dictNoteList).toHaveBeenLastCalledWith(
      expect.objectContaining({ starredOnly: true, offset: 0 }),
    );
    expect(words()).toEqual(['食べる']);
  });

  it('marks a starred row so a mixed list is readable, and says so in words', async () => {
    stubWith([note({ starred: true }), NEKO]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    const stars = host.querySelectorAll('.lexicon-notes-star');
    expect(stars).toHaveLength(1);
    // Not the glyph alone: the row is a button, and a screen reader has to hear
    // the difference between the two otherwise identical rows.
    expect(stars[0].textContent).toContain('lexicon.notes.starredRow');
  });

  it('calls an empty starred filter no matches, not an empty archive', async () => {
    stubWith([NEKO]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await act(async () => {
      starToggle().click();
    });
    expect(host.querySelector('.lexicon-notes-empty')?.textContent).toBe('lexicon.notes.noMatches');
  });
});

describe('the notes browser — taking the archive out of the app', () => {
  let dictNoteExport: ReturnType<typeof vi.fn>;

  /** The listing stub every case here shares, plus an export the case supplies. */
  function stubExport(
    result: (query: LexiconNoteExportQuery) => Promise<LexiconNoteExportResult>,
    all: LexiconNote[] = [note(), SHENGWU],
  ): void {
    stubWith(all);
    dictNoteExport = vi.fn(result);
    (window as unknown as { api: Record<string, unknown> }).api = { dictNoteList, dictNoteExport };
  }

  const exportButton = () => host.querySelector<HTMLButtonElement>('.lexicon-notes-export');
  const exportStatus = () => host.querySelector<HTMLElement>('.lexicon-notes-export-status');

  const saved = async (): Promise<LexiconNoteExportResult> =>
    ({ ok: true, path: 'C:\\notes.csv', count: 2, total: 2 });

  it('exports the whole match, not the page on screen', async () => {
    // The surface is showing one page of nine; the file must hold all nine, so
    // the request carries the scope and deliberately carries no paging at all.
    stubExport(async () => ({ ok: true, path: 'C:\\notes.csv', count: 9, total: 9 }));
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await type(filterField(), 'ね');
    await act(async () => {
      scopeToggle().click();
    });
    await click(need(exportButton(), 'the export button'));
    expect(dictNoteExport).toHaveBeenCalledWith({ lang: 'ja', filter: 'ね', starredOnly: false });
    expect(dictNoteExport.mock.calls[0][0]).not.toHaveProperty('limit');
    expect(dictNoteExport.mock.calls[0][0]).not.toHaveProperty('offset');
  });

  it('names the file it wrote and how much of the archive went into it', async () => {
    stubExport(async () => ({ ok: true, path: 'C:\\notes.csv', count: 2, total: 9 }));
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await click(need(exportButton(), 'the export button'));
    expect(exportStatus()?.textContent).toBe('lexicon.notes.exported:2,9,C:\\notes.csv');
  });

  it('treats a dismissed save dialog as a decision, not as a failure', async () => {
    stubExport(async () => ({ ok: false, count: 0, total: 2, error: 'cancelled' }));
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await click(need(exportButton(), 'the export button'));
    expect(exportStatus()).toBeNull();
  });

  it('says a failed write failed instead of leaving the reader to assume it worked', async () => {
    stubExport(async () => ({ ok: false, count: 0, total: 2, error: 'EACCES' }));
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await click(need(exportButton(), 'the export button'));
    expect(exportStatus()?.textContent).toBe('lexicon.notes.exportFailed');
  });

  it('reports a rejected invoke as a failure too, not as a silent no-op', async () => {
    stubExport(async () => {
      throw new Error('no handler registered');
    });
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await click(need(exportButton(), 'the export button'));
    expect(exportStatus()?.textContent).toBe('lexicon.notes.exportFailed');
  });

  it('drops a result that names a path for a scope the reader has since changed', async () => {
    stubExport(saved);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    await click(need(exportButton(), 'the export button'));
    expect(exportStatus()).not.toBeNull();
    await type(filterField(), 'ね');
    expect(exportStatus()).toBeNull();
  });

  it('refuses a second click while the first write is still open', async () => {
    const replies: ((result: LexiconNoteExportResult) => void)[] = [];
    stubExport(() => new Promise<LexiconNoteExportResult>((resolve) => replies.push(resolve)));
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    const button = need(exportButton(), 'the export button');
    await click(button);
    expect(button.disabled).toBe(true);
    await click(button);
    expect(dictNoteExport).toHaveBeenCalledTimes(1);
    await act(async () => {
      replies[0]?.({ ok: true, path: 'C:\\notes.csv', count: 2, total: 2 });
    });
    expect(need(exportButton(), 'the export button').disabled).toBe(false);
  });

  it('offers nothing to export when there is nothing to export', async () => {
    stubExport(saved, []);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    expect(exportButton()).toBeNull();
  });

  it('hides the control on a preload that cannot export, rather than failing on click', async () => {
    // The list binding is present and the export one is not — exactly the shape
    // of a renderer reloaded against a main process that never registered it.
    stubWith([note()]);
    await render(<NotesBrowser lang="ja" onOpen={ignoreOpen} />);
    await openPanel();
    expect(rows()).toHaveLength(1);
    expect(exportButton()).toBeNull();
  });
});
