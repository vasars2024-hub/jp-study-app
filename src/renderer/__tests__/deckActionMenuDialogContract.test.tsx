// @vitest-environment jsdom
/**
 * `DeckActionMenu` is the popup behind a deck card's "Options" button.
 *
 * It is modal to the mouse and was not modal to the keyboard. Measured live on
 * 2026-09-08 (register row D410), Flashcards ▸ Deck explorer ▸ Options, window
 * 2, pid 4652:
 *
 *   - the backdrop is `position: fixed`, `z-index: 200`,
 *     `rgba(0, 0, 0, 0.55)`, 818x578 over the whole window, and
 *     `document.elementFromPoint` at the centre of "Delete deck", "File" and
 *     "Remove" returned `DIV.deck-action-backdrop` — every control underneath
 *     is dimmed and unclickable;
 *   - `document.activeElement` right after opening was still the "Options"
 *     trigger, and the menu's own first control was **ten** tab stops away;
 *   - six real Tab presses through the bridge went
 *     Options -> **Delete deck** -> File -> Remove -> File -> Remove -> File,
 *     never once entering the dialog. One Tab from the trigger put a
 *     destructive control the user cannot see under Enter.
 *
 * This is the same defect the 2026-09-06 sweep fixed on seven other dialogs
 * (row D9); `DeckActionMenu` was missed. The guard below is deliberately about
 * ESCAPE FROM THE PANEL rather than about tab-order arithmetic: a trap that
 * wraps is the property that makes "Delete deck is one Tab away" impossible,
 * whatever the surrounding DOM later becomes.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeckActionMenu from '../components/DeckActionMenu';
import type { BookGroup } from '../flashcardDeck';

const GROUP: BookGroup = {
  bookId: 'import-zzprobe-headerless',
  bookTitle: 'zzprobe-headerless',
  cards: [
    { id: 'a', word: '猫', reading: 'ねこ', meaning: 'cat', addedAt: 1 },
    { id: 'b', word: '犬', reading: 'いぬ', meaning: 'dog', addedAt: 2 },
  ] as unknown as BookGroup['cards'],
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let trigger: HTMLButtonElement | null = null;
/** Stands in for the "Delete deck" button the live walk landed on. */
let outside: HTMLButtonElement | null = null;

function open(onClose: () => void): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);

  trigger = document.createElement('button');
  trigger.textContent = 'Options';
  document.body.appendChild(trigger);

  outside = document.createElement('button');
  outside.textContent = 'Delete deck';
  document.body.appendChild(outside);

  trigger.focus();

  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      <DeckActionMenu
        group={GROUP}
        folders={['zzwalk-folder']}
        onClose={onClose}
        onReview={vi.fn()}
        onSaveCsv={vi.fn()}
        onMoveFolder={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
  });
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog, 'the menu did not render').toBeTruthy();
  return dialog as HTMLElement;
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  trigger?.remove();
  outside?.remove();
  root = null;
  host = null;
  trigger = null;
  outside = null;
});

const press = (key: string, shiftKey = false): void => {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });
};

function focusables(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  );
}

describe('the deck action menu honours the dialog contract its scrim implies', () => {
  it('declares aria-modal, which is what the scrim already tells sighted users', () => {
    const dialog = open(vi.fn());
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Without a name the announcement is "dialog", which is no announcement.
    expect(dialog.getAttribute('aria-label')).toBeTruthy();
  });

  it('moves focus into itself when it opens', () => {
    const dialog = open(vi.fn());
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(trigger);
  });

  it('does not let Tab reach the destructive controls under the scrim', () => {
    // The live failure, stated as a property: from the LAST control in the menu,
    // Tab must come back to the FIRST rather than walk out onto "Delete deck".
    const dialog = open(vi.fn());
    const inside = focusables(dialog);
    expect(inside.length, 'the menu has no controls to trap').toBeGreaterThan(1);
    act(() => inside[inside.length - 1].focus());
    press('Tab');
    expect(document.activeElement).toBe(inside[0]);
    expect(document.activeElement).not.toBe(outside);

    // And backwards, which is the other way out of an untrapped panel.
    act(() => inside[0].focus());
    press('Tab', true);
    expect(document.activeElement).toBe(inside[inside.length - 1]);
  });

  it('closes on Escape without handing the key to the shell', () => {
    // An unstopped Escape reaches DesktopShell and closes the whole Flashcards
    // window out from under the menu.
    const onClose = vi.fn();
    const shell = vi.fn();
    document.addEventListener('keydown', shell);
    try {
      open(onClose);
      press('Escape');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(shell).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', shell);
    }
  });

  it('gives focus back to whatever opened it', () => {
    open(vi.fn());
    expect(document.activeElement).not.toBe(trigger);
    act(() => root?.unmount());
    root = null;
    expect(document.activeElement).toBe(trigger);
  });

  it('still closes when the click lands outside the panel', () => {
    // The mouse path predates the fix and must survive it.
    const onClose = vi.fn();
    open(onClose);
    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
