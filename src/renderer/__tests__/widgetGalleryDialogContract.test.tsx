// @vitest-environment jsdom
/**
 * The widget gallery is modal to the mouse and was not modal to the keyboard.
 *
 * Measured live 2026-09-08 on the running desktop (window 2, pid 4652, desk
 * 1904x993 — register row D411):
 *
 *   - `.widget-gallery-backdrop` computes `position: fixed`, `inset: 0`,
 *     `rgba(0, 0, 0, 0.45)`, `z-index: 900`, `pointer-events: auto`. The whole
 *     desk is dimmed and unclickable behind it.
 *   - **Escape did nothing.** After a real Escape through the bridge the panel
 *     was still there, still labelled, focus unchanged. There was no `Escape`
 *     handler in the file at all.
 *   - **One Shift+Tab left the dialog.** From the search box, focus went
 *     straight to a Flashcards card's **Remove** button under the scrim, then
 *     File, Remove, File — `dialog.contains(activeElement)` false at every
 *     step.
 *
 * Same class as D410 (the deck action menu) and as the seven dialogs row D9
 * fixed on 2026-09-06. The initial focus is the SEARCH BOX rather than the
 * panel, because the gallery is a type-to-filter picker; that is what
 * `initialFocusRef` is for, and the case below pins it — `autoFocus` alone
 * loses the race against the hook's own focus move.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));

/*
 * The real registry pulls in every widget component, and `widgets/music.tsx`
 * reaches `playerBus`, which calls `window.api.playerWindowId()` at module
 * scope — an unhandled rejection in jsdom that has nothing to do with the
 * dialog contract. Two cards are enough to have something to trap.
 */
vi.mock('../widgets/registry', () => {
  const WIDGETS = [
    { type: 'clock', category: 'system', titleKey: 'w.clock', descKey: 'w.clock.desc' },
    { type: 'notes', category: 'study', titleKey: 'w.notes', descKey: 'w.notes.desc' },
  ];
  return { WIDGETS, getWidgetDef: (type: string) => WIDGETS.find((w) => w.type === type) };
});

import WidgetGallery from '../components/WidgetGallery';

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let trigger: HTMLButtonElement | null = null;
/** Stands in for the dimmed control the live Shift+Tab landed on. */
let outside: HTMLButtonElement | null = null;

function open(onClose: () => void): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);

  trigger = document.createElement('button');
  trigger.textContent = 'Widgets';
  document.body.appendChild(trigger);

  outside = document.createElement('button');
  outside.textContent = 'Remove';
  document.body.appendChild(outside);

  trigger.focus();

  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      <WidgetGallery
        onAdd={vi.fn()}
        onResetLayout={vi.fn()}
        hiddenWidgets={[]}
        onRestore={vi.fn()}
        onClose={onClose}
        installedTypes={[]}
      />,
    );
  });
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog, 'the gallery did not render').toBeTruthy();
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

describe('the widget gallery honours the dialog contract its scrim implies', () => {
  it('declares aria-modal and keeps its name', () => {
    const dialog = open(vi.fn());
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBeTruthy();
  });

  it('opens with the SEARCH BOX focused, not the panel', () => {
    // Type-to-filter is the point of this picker. Focusing the panel instead
    // would be "accessible" and would break the thing the user came to do.
    const dialog = open(vi.fn());
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).className).toContain('widget-gallery-search');
  });

  it('closes on Escape without handing the key to the shell', () => {
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

  it('does not let Shift+Tab out of the search box onto the dimmed desk', () => {
    // The exact live failure: one Shift+Tab from the search box reached a
    // Flashcards "Remove" button behind the scrim.
    const dialog = open(vi.fn());
    const inside = focusables(dialog);
    expect(inside.length, 'nothing to trap').toBeGreaterThan(1);
    expect(document.activeElement).toBe(inside[0]);
    press('Tab', true);
    expect(document.activeElement).toBe(inside[inside.length - 1]);
    expect(document.activeElement).not.toBe(outside);
  });

  it('gives focus back to whatever opened it', () => {
    open(vi.fn());
    expect(document.activeElement).not.toBe(trigger);
    act(() => root?.unmount());
    root = null;
    expect(document.activeElement).toBe(trigger);
  });

  it('still closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    open(onClose);
    const backdrop = host?.querySelector<HTMLElement>('.widget-gallery-backdrop');
    expect(backdrop, 'no backdrop rendered').toBeTruthy();
    act(() => { backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClose).toHaveBeenCalled();
  });
});
