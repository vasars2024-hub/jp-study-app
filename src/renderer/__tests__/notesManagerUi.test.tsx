// @vitest-environment jsdom
/**
 * The Notes app UI: search, autosave with a save indicator, the unsaved-work
 * registry, delete with confirmation into a trash, undo, restore and "Delete
 * forever" — the same component in every shell (dialog) and in Blanc (Quick
 * Notes).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const kv = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => kv.map.get(key),
  kvSet: async (key: string, value: unknown) => void kv.map.set(key, JSON.parse(JSON.stringify(value))),
  kvUpdate: async () => undefined,
  kvDelete: async (key: string) => void kv.map.delete(key),
  kvBatch: async (ops: Array<{ type: 'put' | 'delete'; key: string; value?: unknown }>) => {
    for (const op of ops) {
      if (op.type === 'put') kv.map.set(op.key, JSON.parse(JSON.stringify(op.value)));
      else kv.map.delete(op.key);
    }
  },
  kvScanPrefix: async (prefix: string) => [...kv.map.entries()].filter(([k]) => k.startsWith(prefix)),
  idbWritesBlocked: () => false,
}));

import { en } from '../../shared/i18n/catalogs/en';
import NotesManager from '../components/notes/NotesManager';
import BlancQuickNotesPanel from '../components/blanc/BlancQuickNotesPanel';
import {
  createUserNote,
  flushUserNotes,
  getUserNote,
  resetUserNotesForTests,
  updateUserNote,
  whenUserNotesReady,
} from '../userNotesStore';
import { heldUnsavedWork } from '../unsavedWork';

let host: HTMLDivElement;
let root: Root;

function buttons(label: string): HTMLButtonElement[] {
  return [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label);
}

function rows(): string[] {
  return [...host.querySelectorAll('.notes-row-title')].map((el) => el.textContent ?? '');
}

async function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function pause(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  kv.map.clear();
  document.body.innerHTML = '';
  resetUserNotesForTests();
  await whenUserNotesReady();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  act(() => root.unmount());
  await flushUserNotes();
  vi.unstubAllGlobals();
});

describe('Notes app', () => {
  it('lists, searches (kana-insensitive) and filters by tag', async () => {
    createUserNote({ title: 'ねこ vocabulary', detail: 'cats', tags: 'animals' });
    createUserNote({ title: 'Grammar', detail: '～ばかり', tags: 'n3' });
    createUserNote({ title: 'Shopping', detail: 'eggs' });
    await act(async () => root.render(<NotesManager />));
    expect(rows()).toHaveLength(3);

    await setValue(host.querySelector<HTMLInputElement>('.notes-search')!, 'ネコ');
    expect(rows()).toEqual(['ねこ vocabulary']);

    await setValue(host.querySelector<HTMLInputElement>('.notes-search')!, '#n3');
    expect(rows()).toEqual(['Grammar']);
  });

  it('autosaves, shows the save state, and reports unsaved work until saved', async () => {
    const note = createUserNote({ title: 'Draft', detail: 'one' });
    await flushUserNotes();
    await act(async () => root.render(<NotesManager />));
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-row')!.click());

    const body = host.querySelector<HTMLTextAreaElement>('.notes-editor-body')!;
    await setValue(body, 'one two');
    expect(host.querySelector('.notes-save')?.textContent).toBe(en['notes.save.unsaved']);
    await act(async () => {
      await Promise.resolve();
    });
    expect(heldUnsavedWork()).toContain('note-editor');

    await pause(900);
    await act(async () => {
      await flushUserNotes();
    });
    await pause(10);
    expect(getUserNote(note.id)?.detail).toBe('one two');
    expect(host.querySelector('.notes-save')?.textContent).toBe(en['notes.save.saved']);
    expect(heldUnsavedWork()).not.toContain('note-editor');
  });

  it('another window\'s edit shows up, and never silently loses either side', async () => {
    const note = createUserNote({ title: 'Shared', detail: 'v1' });
    await act(async () => root.render(<NotesManager />));
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-row')!.click());
    const body = (): HTMLTextAreaElement => host.querySelector<HTMLTextAreaElement>('.notes-editor-body')!;

    // Nothing typed here: the other edit is simply shown, and not written back.
    await act(async () => {
      updateUserNote(note.id, { detail: 'v2 from elsewhere' });
    });
    expect(body().value).toBe('v2 from elsewhere');
    await pause(900);
    expect(getUserNote(note.id)?.detail).toBe('v2 from elsewhere');

    // Both sides changed: the typing wins and the other text is kept as a version.
    await setValue(body(), 'typed here');
    await act(async () => {
      updateUserNote(note.id, { detail: 'v3 from elsewhere' });
    });
    expect(body().value).toBe('typed here');
    await pause(900);
    expect(getUserNote(note.id)?.detail).toBe('typed here');
    expect(getUserNote(note.id)?.history?.some((h) => h.detail === 'v3 from elsewhere')).toBe(true);
  });

  it('saves the draft when the editor closes before the autosave fires', async () => {
    const note = createUserNote({ title: 'Quick', detail: '' });
    await act(async () => root.render(<NotesManager />));
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-row')!.click());
    await setValue(host.querySelector<HTMLTextAreaElement>('.notes-editor-body')!, 'typed then closed');
    act(() => root.unmount());
    root = createRoot(host);
    expect(getUserNote(note.id)?.detail).toBe('typed then closed');
  });

  it('Delete asks first, moves to the trash, and Undo / Restore / Delete forever work', async () => {
    const note = createUserNote({ title: 'Precious', detail: 'keep' });
    await act(async () => root.render(<NotesManager />));
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-row')!.click());

    // Cancel: nothing happens.
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-btn--danger')!.click());
    expect(document.body.textContent).toContain(en['notes.delete.title']);
    await act(async () => buttons(en['common.cancel'] as string)[0].click());
    expect(getUserNote(note.id)?.deletedAt).toBeUndefined();

    // Confirm: to the trash, with Undo.
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-btn--danger')!.click());
    const confirm = buttons(en['notes.delete.action'] as string).find((b) => !host.contains(b))!;
    await act(async () => confirm.click());
    expect(getUserNote(note.id)?.deletedAt).toEqual(expect.any(Number));
    expect(rows()).toEqual([]);
    await act(async () => buttons(en['notes.delete.undo'] as string)[0].click());
    expect(getUserNote(note.id)?.deletedAt).toBeUndefined();
    expect(rows()).toEqual(['Precious']);

    // Trash again, then restore from the trash view.
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-row')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-btn--danger')!.click());
    await act(async () => buttons(en['notes.delete.action'] as string).find((b) => !host.contains(b))!.click());
    await act(async () => buttons('Trash (1)')[0].click());
    expect(rows()).toEqual(['Precious']);
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-row')!.click());
    await act(async () => buttons(en['notes.trash.restore'] as string)[0].click());
    expect(getUserNote(note.id)?.deletedAt).toBeUndefined();

    // Delete forever needs the trash and a second confirmation.
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-row')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-btn--danger')!.click());
    await act(async () => buttons(en['notes.delete.action'] as string).find((b) => !host.contains(b))!.click());
    await act(async () => buttons('Trash (1)')[0].click());
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-row')!.click());
    await act(async () => buttons(en['notes.trash.purge'] as string)[0].click());
    expect(document.body.textContent).toContain(en['notes.trash.purgeTitle']);
    await act(async () => buttons(en['notes.trash.purge'] as string).find((b) => !host.contains(b))!.click());
    expect(getUserNote(note.id)).toBeNull();
  });

  it('a note body renders Markdown safely in the preview', async () => {
    createUserNote({ title: 'md', detail: '# Title\n\n- [x] done\n- **bold** [site](https://example.com)\n\n<img src=x onerror=alert(1)>' });
    await act(async () => root.render(<NotesManager />));
    await act(async () => host.querySelector<HTMLButtonElement>('.notes-row')!.click());
    await act(async () => buttons(en['notes.editor.preview'] as string)[0].click());
    const preview = host.querySelector('.notes-preview')!;
    expect(preview.querySelector('h3')?.textContent).toBe('Title');
    expect(preview.querySelector('strong')?.textContent).toBe('bold');
    expect(preview.querySelector('a')?.getAttribute('href')).toBe('https://example.com/');
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('Blanc Quick Notes', () => {
  it('is the Notes app, and moves the old text box into a note', async () => {
    localStorage.setItem('jp-study.blanc.quickNotes', 'old quick text');
    const blanc = document.createElement('div');
    blanc.className = 'blanc-root';
    document.body.append(blanc);
    const blancRoot = createRoot(blanc);
    await act(async () => blancRoot.render(<BlancQuickNotesPanel />));
    await pause(20);
    await act(async () => {
      await flushUserNotes();
    });
    await pause(20);
    expect(blanc.querySelector('legend')?.textContent).toBe(en['blanc.tb.quickNotes']);
    expect(blanc.querySelector('.notes-app--blanc')).not.toBeNull();
    expect([...blanc.querySelectorAll('.notes-row-title')].map((e) => e.textContent)).toEqual(['old quick text']);
    expect(localStorage.getItem('jp-study.blanc.quickNotes')).toBeNull();
    act(() => blancRoot.unmount());
  });
});
