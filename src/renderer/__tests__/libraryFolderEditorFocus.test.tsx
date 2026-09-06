// @vitest-environment jsdom
/**
 * Naming the Library "new folder" editor, and giving focus back when it closes.
 *
 * Measured live on 2026-09-06 against the user's own Library (Study OS): the
 * inline folder editor's `<input class="lib-folder-input">` reported
 * `aria-label` null, `labels.length` 0 and no `id`, so its only accessible name
 * was a placeholder that disappears the moment you type. Pressing Escape closed
 * the editor and left `document.activeElement` on `BODY` — the keyboard was
 * dumped onto the desktop behind the window.
 *
 * Same defect and same fix as D44 in Flashcards (a01f444a); Library is a third
 * and fourth host of the identical idiom, which that commit did not reach.
 *
 * Mounted through the same `installReadingSurfaceApi` harness
 * `libraryCardKeyboard` uses (RULE 1).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LibraryView from '../views/LibraryView';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';
import type { LibraryItem } from '../../shared/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: LibraryItem[] = [
  { id: 'li_ja', title: 'コンビニ人間', type: 'book', createdAt: 2 },
] as unknown as LibraryItem[];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({
    syncLibrary: async () => ITEMS,
    getWatchFolder: async () => '',
    getLibraryFolders: async () => [],
  });
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(): Promise<void> {
  await act(async () => {
    root.render(<LibraryView onOpen={() => {}} />);
    await Promise.resolve();
  });
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
}

function trigger(): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>('button.lib-folder-new');
  if (!el) throw new Error('No "new folder" trigger rendered');
  return el;
}

function editor(): HTMLInputElement | null {
  return host.querySelector<HTMLInputElement>('input.lib-folder-input');
}

async function openEditor(): Promise<void> {
  await act(async () => {
    trigger().focus();
    trigger().click();
    await Promise.resolve();
  });
}

async function pressEscape(): Promise<void> {
  const input = editor();
  if (!input) throw new Error('Editor is not open');
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
  });
}

describe('Library folder editor', () => {
  it('names the folder input for assistive tech', async () => {
    await render();
    await openEditor();
    const input = editor();
    expect(input).not.toBeNull();
    expect(input?.getAttribute('aria-label')).toBe('Folder name');
  });

  it('returns focus to the trigger when Escape dismisses the editor', async () => {
    await render();
    await openEditor();
    expect(editor()).not.toBeNull();

    await pressEscape();

    expect(editor()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(document.activeElement).not.toBe(document.body);
  });

  it('leaves focus alone while the editor is still open', async () => {
    await render();
    await openEditor();
    // The control: the restore effect must fire on close, not on every render,
    // or it would steal focus out of the input the user is typing into. While
    // the editor is open the trigger is unmounted, so "focus is in the input"
    // is the observable form of that.
    expect(document.activeElement).toBe(editor());
    expect(host.querySelector('button.lib-folder-new')).toBeNull();
  });
});
