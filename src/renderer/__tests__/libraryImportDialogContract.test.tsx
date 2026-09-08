// @vitest-environment jsdom
/**
 * The two Library import overlays, and the create-profile modal, are modal to
 * the MOUSE and were modal to nothing else.
 *
 * Measured live 2026-09-08 on the running desktop (window 1, pid 22788, Library
 * window 1280x860, the user's own 24-item library — register row D423). With
 * `Web / paste` open:
 *
 *   - `.lib-import` reported `role` null, `aria-modal` null, `aria-labelledby`
 *     null and `tabindex` null. A screen reader is told nothing.
 *   - `document.activeElement` was `BODY` — focus never entered the panel.
 *   - **Three real Tabs through the bridge walked straight out of it**, onto the
 *     window's own `Pop out into its own window`, `Make Liquid` and `Minimize`
 *     buttons, with `activeElement.closest('.lib-import')` null at every step.
 *   - **Escape did nothing**, from the URL field, from the Cancel button, and
 *     from the body. The overlay and its backdrop were still up after each.
 *
 * Same class as D9 (seven dialogs, 2026-09-06), D410 and D411; these three were
 * simply not in any of those lists. `useModalKeyboard` is the existing fix.
 *
 * The backdrop cases are the non-vacuity control: the mouse route already
 * worked, and a fix that traps the keyboard by breaking the click would be a
 * regression, not a repair.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryView from '../views/LibraryView';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';
import type { LibraryItem } from '../../shared/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: LibraryItem[] = [
  { id: 'li_ja', title: 'コンビニ人間', type: 'book', createdAt: 2 },
] as unknown as LibraryItem[];

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let host: HTMLDivElement;
let root: Root;
/** Stands in for the window-chrome buttons the live Tab escaped onto. */
let outside: HTMLButtonElement;

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({
    syncLibrary: async () => ITEMS,
    getWatchFolder: async () => '',
    getLibraryFolders: async () => [],
  });
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  outside = window.document.createElement('button');
  outside.textContent = 'Minimize';
  window.document.body.appendChild(outside);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  outside.remove();
});

async function renderLibrary(): Promise<void> {
  await act(async () => {
    root.render(<LibraryView onOpen={vi.fn()} />);
    await Promise.resolve();
  });
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
}

function press(key: string, shiftKey = false): void {
  act(() => {
    window.document.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });
}

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/** Opens one of the two `.lib-import` overlays by clicking its header button. */
async function openImport(label: string): Promise<HTMLElement> {
  const btn = Array.from(host.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === label,
  );
  if (!btn) throw new Error(`no "${label}" button rendered`);
  await act(async () => {
    (btn as HTMLButtonElement).focus();
    (btn as HTMLButtonElement).click();
    await Promise.resolve();
  });
  const panel = host.querySelector<HTMLElement>('.lib-import');
  if (!panel) throw new Error(`"${label}" opened no overlay`);
  return panel;
}

describe.each([
  ['Web / paste', 'lib-import-title'],
  ['Random Wikipedia', 'lib-wiki-title'],
])('the Library import overlay behind "%s"', (label, headingId) => {
  it('declares itself a dialog and points at its own heading', async () => {
    await renderLibrary();
    const panel = await openImport(label);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-labelledby')).toBe(headingId);
    expect(host.querySelector(`#${headingId}`), 'the label target does not exist').toBeTruthy();
  });

  it('takes focus into the panel instead of leaving it on BODY', async () => {
    await renderLibrary();
    const panel = await openImport(label);
    expect(window.document.activeElement).not.toBe(window.document.body);
    expect(panel.contains(window.document.activeElement)).toBe(true);
  });

  it('does not let Tab walk out onto the window chrome', async () => {
    await renderLibrary();
    const panel = await openImport(label);
    const inside = focusables(panel);
    expect(inside.length, 'nothing to trap').toBeGreaterThan(1);
    act(() => inside[inside.length - 1].focus());
    press('Tab');
    expect(window.document.activeElement).toBe(inside[0]);
    expect(window.document.activeElement).not.toBe(outside);
  });

  it('closes on Escape, and swallows the key so the shell never sees it', async () => {
    await renderLibrary();
    await openImport(label);
    const shell = vi.fn();
    window.document.addEventListener('keydown', shell);
    try {
      press('Escape');
    } finally {
      window.document.removeEventListener('keydown', shell);
    }
    expect(host.querySelector('.lib-import')).toBeNull();
    expect(shell).not.toHaveBeenCalled();
  });

  it('still closes when the backdrop is clicked', async () => {
    await renderLibrary();
    await openImport(label);
    const backdrop = host.querySelector<HTMLElement>('.lib-import-backdrop');
    expect(backdrop, 'no backdrop rendered').toBeTruthy();
    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(host.querySelector('.lib-import')).toBeNull();
  });
});

describe('the create-profile modal honours the same contract', () => {
  async function openCreate(): Promise<HTMLElement> {
    await act(async () => {
      root.render(<ProfileSwitcher />);
      await Promise.resolve();
    });
    const btn = Array.from(host.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Create New Profile',
    );
    if (!btn) throw new Error('no create-profile trigger rendered');
    await act(async () => {
      (btn as HTMLButtonElement).click();
      await Promise.resolve();
    });
    const panel = host.querySelector<HTMLElement>('.set-modal');
    if (!panel) throw new Error('the create-profile modal did not open');
    return panel;
  }

  it('declares itself a dialog', async () => {
    const panel = await openCreate();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-labelledby')).toBe('profile-create-title');
    expect(host.querySelector('#profile-create-title')).toBeTruthy();
  });

  it('keeps the caret in the NAME field, not on the panel', async () => {
    // `autoFocus` alone loses the race with the hook's own focus move, which is
    // what `initialFocusRef` exists for. Typing a name is the whole task here.
    const panel = await openCreate();
    expect(panel.contains(window.document.activeElement)).toBe(true);
    expect((window.document.activeElement as HTMLElement).id).toBe('profile-name');
  });

  it('closes on Escape', async () => {
    await openCreate();
    press('Escape');
    expect(host.querySelector('.set-modal')).toBeNull();
  });

  it('does not let Tab out of the panel', async () => {
    const panel = await openCreate();
    const inside = focusables(panel);
    expect(inside.length).toBeGreaterThan(1);
    act(() => inside[inside.length - 1].focus());
    press('Tab');
    expect(window.document.activeElement).toBe(inside[0]);
    expect(window.document.activeElement).not.toBe(outside);
  });
});
