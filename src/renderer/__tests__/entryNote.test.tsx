// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LexiconNote } from '../../shared/lexiconNotes';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));

import EntryNote from '../components/lexicon/EntryNote';

function note(overrides: Partial<LexiconNote> = {}): LexiconNote {
  return {
    lang: 'ja',
    text: '食べる',
    reading: 'たべる',
    note: 'transitive pair',
    tags: ['verbs'],
    updatedAt: 5,
    ...overrides,
  };
}

let dictNoteGet: ReturnType<typeof vi.fn>;
let dictNoteSet: ReturnType<typeof vi.fn>;

function stubApi(
  get: (identity: { lang: string; text: string; reading: string }) => Promise<LexiconNote | null>,
  set?: (
    identity: { lang: string; text: string; reading: string },
    input: { note: string; tags: string[] },
  ) => Promise<{ ok: boolean; note: LexiconNote | null }>,
): void {
  dictNoteGet = vi.fn(get);
  dictNoteSet = vi.fn(set ?? (async (_i, input) => ({
    ok: true,
    note: input.note || input.tags.length ? note({ note: input.note, tags: input.tags }) : null,
  })));
  (window as unknown as { api: Record<string, unknown> }).api = { dictNoteGet, dictNoteSet };
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
  vi.clearAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

/** Same root, new props — the "reader looked up a different word" transition. */
async function rerender(node: ReactNode): Promise<void> {
  await act(async () => {
    root?.render(node);
  });
}

/** Asserting rather than `!`, so a missing control fails as itself and not as a null deref. */
function need<T>(node: T | null, what: string): T {
  if (!node) throw new Error(`expected ${what} to be rendered`);
  return node;
}

const box = () => host.querySelector<HTMLDetailsElement>('.lexicon-note');
const textarea = () =>
  need(host.querySelector<HTMLTextAreaElement>('.lexicon-note-text'), 'the note textarea');
const tagInput = () =>
  need(host.querySelector<HTMLInputElement>('.lexicon-note-tags input'), 'the tags field');
const saveButton = () =>
  need(host.querySelector<HTMLButtonElement>('.lexicon-note-save'), 'the save button');

async function type(field: HTMLTextAreaElement | HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const TABERU = { word: '食べる', reading: 'たべる', lang: 'ja' };

describe('EntryNote', () => {
  it('shows an existing note already open, with its text and tags', async () => {
    stubApi(async () => note());
    await render(<EntryNote {...TABERU} />);
    expect(box()?.open).toBe(true);
    expect(textarea().value).toBe('transitive pair');
    expect(tagInput().value).toBe('verbs');
  });

  it('stays collapsed for a word with no note, rather than taking the space', async () => {
    stubApi(async () => null);
    await render(<EntryNote {...TABERU} />);
    expect(box()).not.toBeNull();
    expect(box()?.open).toBe(false);
    expect(textarea().value).toBe('');
  });

  it('asks for the matched headword and its reading, not the raw query', async () => {
    stubApi(async () => null);
    await render(<EntryNote {...TABERU} />);
    expect(dictNoteGet).toHaveBeenCalledWith({ lang: 'ja', text: '食べる', reading: 'たべる' });
  });

  it('cannot save until something changed', async () => {
    stubApi(async () => note());
    await render(<EntryNote {...TABERU} />);
    expect(saveButton().disabled).toBe(true);
    await type(textarea(), 'edited');
    expect(saveButton().disabled).toBe(false);
  });

  it('sends the typed note and the comma-separated tags', async () => {
    stubApi(async () => null);
    await render(<EntryNote {...TABERU} />);
    await type(textarea(), 'ichidan, not godan');
    await type(tagInput(), 'verbs, JLPT N5 ,, verbs');
    await click(saveButton());
    expect(dictNoteSet).toHaveBeenCalledWith(
      { lang: 'ja', text: '食べる', reading: 'たべる' },
      { note: 'ichidan, not godan', tags: ['verbs', 'JLPT N5'] },
    );
  });

  it('shows what the database stored, not what was typed', async () => {
    stubApi(
      async () => null,
      async () => ({ ok: true, note: note({ note: 'trimmed by main', tags: ['kept'] }) }),
    );
    await render(<EntryNote {...TABERU} />);
    await type(textarea(), '   trimmed by main   ');
    await click(saveButton());
    expect(textarea().value).toBe('trimmed by main');
    expect(tagInput().value).toBe('kept');
    expect(host.querySelector('.lexicon-note-status')?.textContent).toBe('lexicon.note.saved');
  });

  it('never reports a refused write as saved', async () => {
    stubApi(async () => null, async () => ({ ok: false, note: null }));
    await render(<EntryNote {...TABERU} />);
    await type(textarea(), 'please keep this');
    await click(saveButton());
    expect(host.querySelector('.lexicon-note-status')).toBeNull();
    expect(host.querySelector('.lexicon-note-error')?.textContent).toBe('lexicon.note.failed');
    // The text the user typed is still in the box, so it can be saved again.
    expect(textarea().value).toBe('please keep this');
    expect(saveButton().disabled).toBe(false);
  });

  it('never reports a rejected write as saved', async () => {
    stubApi(async () => null, async () => { throw new Error('no handler'); });
    await render(<EntryNote {...TABERU} />);
    await type(textarea(), 'please keep this');
    await click(saveButton());
    expect(host.querySelector('.lexicon-note-error')).not.toBeNull();
    expect(textarea().value).toBe('please keep this');
  });

  it('empties the box when clearing both fields deleted the note', async () => {
    stubApi(async () => note());
    await render(<EntryNote {...TABERU} />);
    await type(textarea(), '');
    await type(tagInput(), '');
    await click(saveButton());
    expect(dictNoteSet).toHaveBeenCalledWith(expect.anything(), { note: '', tags: [] });
    expect(textarea().value).toBe('');
    expect(tagInput().value).toBe('');
  });

  it('swaps to the next word\'s note and never leaves the previous one behind', async () => {
    const notes: Record<string, LexiconNote | null> = {
      食べる: note(),
      猫: null,
    };
    stubApi(async (identity) => notes[identity.text] ?? null);
    await render(<EntryNote {...TABERU} />);
    expect(textarea().value).toBe('transitive pair');
    await rerender(<EntryNote word="猫" reading="ねこ" lang="ja" />);
    expect(textarea().value).toBe('');
    expect(box()?.open).toBe(false);
  });

  it('discards a slow read that lands after the reader moved on', async () => {
    let releaseFirst: (value: LexiconNote | null) => void = () => undefined;
    stubApi(async (identity) => {
      if (identity.text === '食べる') return new Promise((resolve) => { releaseFirst = resolve; });
      return null;
    });
    await render(<EntryNote {...TABERU} />);
    await rerender(<EntryNote word="猫" reading="ねこ" lang="ja" />);
    await act(async () => {
      releaseFirst(note());
    });
    expect(textarea().value).toBe('');
  });

  it('renders nothing when the bridge cannot serve notes at all', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {};
    await render(<EntryNote {...TABERU} />);
    expect(box()).toBeNull();
  });

  it('renders nothing at all until the first read has answered', async () => {
    stubApi(() => new Promise<LexiconNote | null>(() => undefined));
    await render(<EntryNote {...TABERU} />);
    expect(box()).toBeNull();
  });
});
