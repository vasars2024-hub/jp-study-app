// @vitest-environment jsdom
/**
 * CSV editor panel behaviour (round-2 audit F, CSV items 1–4, 6, 7).
 *
 * Before: opening a file forced the grid's comma and header flag into the
 * parse, then imported into the deck; every mapping change imported again;
 * the fresh blank grid asked Append/Overwrite; a Ctrl+Z anywhere in the window
 * undid a grid edit; cancelling a prompt still added the column; and a grid
 * saved only to IndexedDB (past the localStorage quota) loaded the stale cache
 * and autosaved it over the newer copy.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deck = vi.hoisted(() => ({
  importDeckFromEntries: vi.fn(() => ({ added: [], updated: 0, unchanged: 0, removed: 0, missing: 0 })),
  previewDeckUpsert: vi.fn(() => ({ added: 0, updated: 0, unchanged: 0, missing: 2 })),
}));
vi.mock('../flashcardDeck', () => deck);
vi.mock('../profileState', () => ({ getActiveProfile: () => ({ targetLang: 'ja' }) }));
vi.mock('../csvParseAsync', async () => {
  const { parseCsvText } = await import('../../shared/csvEditor');
  return { parseCsvTextAsync: async (raw: string, opts?: object) => parseCsvText(raw, opts) };
});
const dialogs = vi.hoisted(() => ({
  promptDialog: vi.fn(async (): Promise<string | null> => null),
  confirmDialog: vi.fn(async () => false),
}));
vi.mock('../components/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...dialogs,
}));
const idb = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
  kvDelete: async (key: string) => idb.delete(key),
  kvEntries: async () => [...idb.entries()],
  setIdbWritesBlocked: () => undefined,
}));

import CsvEditorPanel from '../components/CsvEditorPanel';

let host: HTMLDivElement;
let root: Root;

class NoopResizeObserver {
  observe(): void {
    /* layout is not measured in jsdom */
  }
  disconnect(): void {
    /* nothing observed */
  }
}

async function mount(): Promise<void> {
  await act(async () => root.render(<CsvEditorPanel />));
  // Let the IndexedDB read settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function openFile(name: string, text: string): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [{ name, text: async () => text }], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function headers(): string[] {
  return [...host.querySelectorAll<HTMLInputElement>('.csv-editor-header-input')].map((i) => i.value);
}

function delimiterSelect(): HTMLSelectElement {
  return host.querySelector<HTMLSelectElement>('.csv-editor-toolbar select')!;
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`no button ${label}`);
  return found as HTMLButtonElement;
}

function setInput(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  localStorage.clear();
  idb.clear();
  deck.importDeckFromEntries.mockClear();
  deck.previewDeckUpsert.mockClear();
  dialogs.promptDialog.mockReset().mockResolvedValue(null);
  dialogs.confirmDialog.mockReset().mockResolvedValue(false);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const TSV = 'Word\tReading\tMeaning\n猫\tねこ\tcat\n犬\tいぬ\tdog\n';

describe('opening a file', () => {
  it('detects the delimiter, sets the control, skips the merge prompt on a blank grid, and imports nothing', async () => {
    await mount();
    expect(delimiterSelect().value).toBe(',');
    await openFile('animals.tsv', TSV);
    expect(host.querySelector('.csv-editor-modal-lead')).toBeNull();
    expect(headers()).toEqual(['Word', 'Reading', 'Meaning']);
    expect(delimiterSelect().value).toBe('\t');
    expect(deck.importDeckFromEntries).not.toHaveBeenCalled();
  });

  it('asks Append/Overwrite only when the grid has content', async () => {
    await mount();
    await openFile('a.tsv', TSV);
    await openFile('b.tsv', TSV);
    expect(host.querySelector('.csv-editor-modal-lead')).not.toBeNull();
  });
});

describe('importing into flashcards', () => {
  it('imports only on the button, never on a mapping change, and keeps the deck id through a rename', async () => {
    await mount();
    await openFile('animals.tsv', TSV);
    const mapSelect = host.querySelector<HTMLSelectElement>('.csv-editor-map-row select')!;
    await act(async () => setInput(mapSelect, 'front'));
    expect(deck.importDeckFromEntries).not.toHaveBeenCalled();

    await act(async () => button('Import to flashcards').click());
    expect(deck.importDeckFromEntries).toHaveBeenCalledTimes(1);
    const first = (deck.importDeckFromEntries.mock.calls[0] as unknown as [Array<{ bookId: string }>, object]);
    const firstId = first[0][0].bookId;
    expect(first[1]).toEqual({ removeMissing: false });

    const titleInput = host.querySelector<HTMLInputElement>('.csv-editor-toolbar input[type=text]')!;
    await act(async () => setInput(titleInput, 'Renamed deck'));
    await act(async () => button('Import to flashcards').click());
    const second = deck.importDeckFromEntries.mock.calls[1] as unknown as [Array<{ bookId: string; bookTitle: string }>];
    expect(second[0][0].bookId).toBe(firstId);
    expect(second[0][0].bookTitle).toBe('Renamed deck');
  });

  it('"Remove cards not in the file" asks first and does nothing when declined', async () => {
    await mount();
    await openFile('animals.tsv', TSV);
    const box = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((b) =>
      b.parentElement?.textContent?.includes('Remove cards not in the file'),
    )!;
    expect(box.checked).toBe(false);
    await act(async () => box.click());
    await act(async () => button('Import to flashcards').click());
    expect(dialogs.confirmDialog).toHaveBeenCalledTimes(1);
    expect(deck.importDeckFromEntries).not.toHaveBeenCalled();

    dialogs.confirmDialog.mockResolvedValue(true);
    await act(async () => button('Import to flashcards').click());
    expect(deck.importDeckFromEntries).toHaveBeenCalledTimes(1);
    expect((deck.importDeckFromEntries.mock.calls[0] as unknown[])[1]).toEqual({ removeMissing: true });
  });
});

describe('prompts', () => {
  it('cancelling the tag, auto-number and merge prompts changes nothing', async () => {
    await mount();
    await openFile('animals.tsv', TSV);
    await act(async () => button('Add tag column').click());
    await act(async () => button('Auto-number').click());
    expect(headers()).toEqual(['Word', 'Reading', 'Meaning']);

    // Merge: separator answered, header prompt cancelled.
    const heads = host.querySelectorAll<HTMLElement>('.csv-editor-col-head');
    await act(async () => heads[0].click());
    await act(async () => heads[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    dialogs.promptDialog.mockResolvedValueOnce(' ').mockResolvedValueOnce(null);
    await act(async () => button('Merge').click());
    expect(headers()).toEqual(['Word', 'Reading', 'Meaning']);
  });

  it('uses translated defaults when the prompts are accepted as offered', async () => {
    await mount();
    await openFile('animals.tsv', TSV);
    dialogs.promptDialog.mockImplementation(async (opts: { defaultValue?: string }) => opts.defaultValue ?? '');
    await act(async () => button('Add tag column').click());
    expect(headers()).toEqual(['Word', 'Reading', 'Meaning', 'Tag']);
    expect(dialogs.promptDialog.mock.calls.map((c) => (c[0] as { defaultValue?: string }).defaultValue)).toEqual([
      'Tag',
      'Vocabulary Set 1',
    ]);
  });
});

describe('undo scope', () => {
  function ctrlZ(target: EventTarget): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  }

  it('leaves Ctrl+Z outside the editor and in its own text fields alone, and undoes from the grid', async () => {
    await mount();
    await openFile('animals.tsv', TSV);
    const outside = document.createElement('input');
    document.body.append(outside);
    await act(async () => ctrlZ(outside));
    const titleInput = host.querySelector<HTMLInputElement>('.csv-editor-toolbar input[type=text]')!;
    await act(async () => ctrlZ(titleInput));
    expect(headers()).toEqual(['Word', 'Reading', 'Meaning']);
    outside.remove();

    const cell = host.querySelector<HTMLTextAreaElement>('textarea.csv-editor-cell')!;
    await act(async () => ctrlZ(cell));
    expect(headers()).not.toEqual(['Word', 'Reading', 'Meaning']);
  });
});

describe('loading the saved grid', () => {
  it('prefers a newer IndexedDB mirror over the stale localStorage cache, and does not autosave the stale one', async () => {
    const stale = {
      table: { delimiter: ',', hasHeader: true, headers: ['Old'], rows: [['stale']] },
      title: 'deck',
      hiddenColumns: [],
      savedAt: 1_000,
    };
    const fresh = {
      table: { delimiter: ',', hasHeader: true, headers: ['New'], rows: [['fresh']] },
      title: 'deck',
      hiddenColumns: [],
      savedAt: 2_000,
    };
    localStorage.setItem('jp-study-csv-editor-v1', JSON.stringify(stale));
    idb.set('csv-editor', fresh);
    await mount();
    expect(headers()).toEqual(['New']);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    const cached = JSON.parse(localStorage.getItem('jp-study-csv-editor-v1') ?? '{}');
    expect(cached.table.headers).toEqual(['New']);
  });
});
