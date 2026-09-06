// @vitest-environment jsdom
/**
 * `GrammarTestModal` declared `role="dialog" aria-modal="true"` and, until
 * 2026-09-06, did nothing whatever with the keyboard.
 *
 * Measured live through the debug bridge, Grammar ▸ Practice ▸ Grammar Test:
 *   - Escape left the dialog open
 *   - `document.activeElement` after opening was still the "Grammar Test" button
 *     BEHIND the overlay, so `aria-modal` hid the rest of the window from a
 *     screen-reader user and then left them standing outside the dialog
 * After the fix, same route: Escape closes it, the Grammar WINDOW survives
 * (8 floating windows before and after — the shell also closes on Escape, hence
 * `stopPropagation`), and focus returns to the trigger.
 *
 * Counted at the time: **7 of this app's 19 `aria-modal` surfaces had no Escape
 * handler**, this one among them. With it fixed the split is 13 / 6, and of those
 * six `Lockscreen` is correct to have none — a lock screen must not dismiss on
 * Escape. The remaining five are filed with their paths in row D9 of
 * docs/ACTIVE/LIVE_DEFECTS_PRESWEEP.md.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GrammarTestModal from '../components/grammar/GrammarTestModal';
import { DEFAULT_PRACTICE_FILTERS } from '../data/grammar/practiceFilters';
import type { NormalizedGrammarPoint } from '../data/grammar';

const point = (id: string): NormalizedGrammarPoint =>
  ({
    id,
    lang: 'ja',
    level: 'N5',
    title: `〜${id}`,
    meaning: `meaning ${id}`,
    structure: '',
    explanation: '',
    categories: [],
    functions: [],
    examples: [],
    provenance: { verification: 'verified', tagSource: 'authored' },
  }) as unknown as NormalizedGrammarPoint;

const POOL = [point('a'), point('b'), point('c')];

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let trigger: HTMLButtonElement | null = null;

function open(onClose: () => void): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);

  // A real element to focus first, so "focus was restored" is a claim about
  // something rather than about `document.body`.
  trigger = document.createElement('button');
  trigger.textContent = 'Grammar Test';
  document.body.appendChild(trigger);
  trigger.focus();

  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      <GrammarTestModal pool={POOL} initialFilters={DEFAULT_PRACTICE_FILTERS} onClose={onClose} />,
    );
  });
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog, 'the modal did not render').toBeTruthy();
  return dialog as HTMLElement;
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  trigger?.remove();
  root = null;
  host = null;
  trigger = null;
});

const escape = (): void => {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  });
};

describe('the grammar test dialog honours the dialog contract it declares', () => {
  it('moves focus into itself when it opens', () => {
    const dialog = open(vi.fn());
    // Not merely "something is focused" — it must be inside the overlay that
    // `aria-modal` just hid the rest of the window behind.
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(trigger);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    open(onClose);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not let Escape through to the shell, which closes the window', () => {
    // The regression this guards is not "Escape does nothing" but "Escape does
    // TOO MUCH": an unstopped Escape reaches DesktopShell and closes the whole
    // Grammar window out from under the dialog. Measured live before the fix.
    const shell = vi.fn();
    document.addEventListener('keydown', shell);
    try {
      open(vi.fn());
      escape();
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
});
