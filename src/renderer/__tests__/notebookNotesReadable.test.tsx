// @vitest-environment jsdom
/**
 * Saved notes can be read again (round-2 audit F, Notebook items 16–17).
 *
 * Before: "Save to Notebook" wrote a timeline entry that Files listed by title
 * only and refused to Open (no section owns the `note` kind); media-assistant
 * notes were missing from the Notebook's stream list; and Translate's "Send to
 * Notebook" appended a new copy per click on top of the row every completed
 * translation already wrote, then opened Files at its root.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/db', () => ({
  kvGet: async () => undefined,
  kvSet: async () => undefined,
  kvUpdate: async () => undefined,
}));

import { en } from '../../shared/i18n/catalogs/en';
import {
  appendNotebookEvent,
  findNotebookEntry,
  loadNotebookTimeline,
  NOTEBOOK_TIMELINE_STORAGE_KEY,
  saveTranslationNote,
} from '../notebookTimeline';
import { aggregateNotebook } from '../notebook/aggregate';
import { appendTranslationHistory, loadTranslationHistory } from '../translationHistory';
import FilesNoteDetails from '../components/notes/FilesNoteDetails';
import { openNoteViewer } from '../components/notes/NoteViewer';
import type { FilesItem } from '../../shared/filesApp/catalog';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

function noteRow(id: string): FilesItem {
  return {
    id: `notebook:${id}`,
    name: 'n',
    kind: 'note',
    categoryId: 'outputs/notes',
    provenance: 'app-generated',
    sizeBytes: null,
    createdAt: 1,
    modifiedAt: null,
    lastUsedAt: null,
    location: { store: 'localStorage', key: NOTEBOOK_TIMELINE_STORAGE_KEY, pointer: id },
    flags: {},
    source: 'notebook',
  };
}

describe('Files shows a saved note', () => {
  it('renders the body as text, never as HTML', async () => {
    const entry = appendNotebookEvent({
      stream: 'media',
      title: 'Episode 3: explain',
      detail: 'First paragraph.\n\n<img src=x onerror="window.pwned=1">second',
    });
    await act(async () => root.render(<FilesNoteDetails item={noteRow(entry.id)} />));
    const body = host.querySelector('.note-body')!;
    expect(body.querySelectorAll('p')).toHaveLength(2);
    expect(body.textContent).toContain('<img src=x onerror="window.pwned=1">second');
    expect(body.querySelector('img')).toBeNull();
  });

  it('Open shows the note in a viewer that can edit it', async () => {
    const entry = appendNotebookEvent({ stream: 'media', title: 'Old title', detail: 'Body text' });
    await act(async () => {
      expect(openNoteViewer(entry.id)).toBe(true);
    });
    expect(document.body.textContent).toContain('Body text');
    const edit = [...document.querySelectorAll('button')].find((b) => b.textContent === en['notes.viewer.edit'])!;
    await act(async () => edit.click());
    const area = document.querySelector<HTMLTextAreaElement>('.note-viewer-edit textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'New body');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...document.querySelectorAll('button')].find((b) => b.textContent === en['notes.viewer.save'])!;
    await act(async () => save.click());
    expect(findNotebookEntry(entry.id)?.detail).toBe('New body');
    expect(openNoteViewer('missing')).toBe(false);
  });
});

describe('Translate "Save as note"', () => {
  it('saves one note per translation, in full, and the notebook lists the translation once', () => {
    appendTranslationHistory({
      sourceLang: 'ja',
      targetLang: 'en',
      sourceText: '猫が好きです',
      resultText: 'I like cats',
      origin: 'app',
    });
    // What TranslateContent appends on every completed translation.
    appendNotebookEvent({ stream: 'translations', title: '猫が好きです', detail: 'I like cats', folder: 'Translations' });
    const [history] = loadTranslationHistory();

    const first = saveTranslationNote(history);
    const second = saveTranslationNote(history);
    expect(second.id).toBe(first.id);
    expect(first.detail).toBe('猫が好きです\n\nI like cats');
    expect(loadNotebookTimeline().filter((e) => e.meta?.translationId === history.id)).toHaveLength(1);

    const rows = aggregateNotebook().entries.filter((e) => e.stream === 'translations');
    expect(rows.map((e) => e.id)).toEqual([first.id]);
  });
});
