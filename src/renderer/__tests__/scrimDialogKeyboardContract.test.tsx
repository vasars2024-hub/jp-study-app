// @vitest-environment jsdom
/**
 * The two shell overlays that dim the whole window and were not modal to the
 * keyboard: the command palette and the clipboard history panel (row D412).
 *
 * Measured live 2026-09-08 on the user's own desk, window 1, pid 4652:
 *
 *   - both backdrops compute `position: fixed`, `inset: 0`,
 *     `rgba(0, 0, 0, 0.4)`, `z-index: 20000`, `pointer-events: auto`, at
 *     1264x821 — the whole window;
 *   - **one Shift+Tab left each of them.** The palette's landed on the
 *     taskbar's `Show desktop (minimize all)`, the clipboard panel's on
 *     `Restore all windows` — two controls that rearrange the user's entire
 *     desk, under a scrim they cannot see through;
 *   - **and from outside, Escape stopped working.** Both put Escape on their
 *     search input's own `onKeyDown`, so once focus had leaked there was no
 *     keyboard way back. Verified for both: Escape pressed with focus on the
 *     taskbar left the panel open.
 *
 * That second half is why the trap matters more here than the label does: the
 * escape hatch and the leak were the same defect.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));

// `keyboardShortcuts` pulls in `playerBus`, which calls `window.api` at MODULE
// scope — so the stub has to exist before the imports are evaluated, which is
// what `vi.hoisted` is for. A plain statement here runs far too late and the
// unhandled rejection kills the whole file before a single case runs.
vi.hoisted(() => {
  Object.defineProperty(globalThis, 'api', {
    configurable: true,
    value: new Proxy({}, { get: () => () => Promise.resolve(undefined) }),
  });
});

import ClipboardHistoryPanel from '../components/ClipboardHistoryPanel';
import CommandPalette from '../components/CommandPalette';

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let outside: HTMLButtonElement | null = null;

function press(key: string, shiftKey = false): void {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });
}

function focusables(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  );
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  // Stands in for the taskbar control the live Shift+Tab landed on.
  outside = document.createElement('button');
  outside.textContent = 'Restore all windows';
  document.body.appendChild(outside);
  outside.focus();
  root = createRoot(host);
  act(() => { root?.render(<ClipboardHistoryPanel />); });
  // The panel mounts closed and opens on its own event, exactly as the shell
  // drives it — so this is the real open path, not a forced prop.
  act(() => { window.dispatchEvent(new CustomEvent('clipboard:open')); });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  outside?.remove();
  root = null;
  host = null;
  outside = null;
});

function panel(): HTMLElement {
  const el = host?.querySelector<HTMLElement>('[role="dialog"]');
  expect(el, 'the clipboard panel did not open').toBeTruthy();
  return el as HTMLElement;
}

describe('the clipboard history panel honours the contract its scrim implies', () => {
  it('declares aria-modal and keeps its name', () => {
    expect(panel().getAttribute('aria-modal')).toBe('true');
    expect(panel().getAttribute('aria-label')).toBeTruthy();
  });

  it('opens with the search box focused', () => {
    const el = panel();
    expect(el.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).className).toContain('cbh-search');
  });

  it('does not let Shift+Tab out onto the taskbar', () => {
    const el = panel();
    const inside = focusables(el);
    expect(inside.length, 'nothing to trap').toBeGreaterThan(1);
    expect(document.activeElement).toBe(inside[0]);
    press('Tab', true);
    expect(document.activeElement).toBe(inside[inside.length - 1]);
    expect(document.activeElement).not.toBe(outside);
  });

  it('closes on Escape even when focus is not in the search box', () => {
    // The live failure exactly: Escape lived on the input, so leaking focus once
    // meant there was no keyboard way out at all.
    const el = panel();
    const inside = focusables(el);
    act(() => inside[inside.length - 1].focus());
    press('Escape');
    expect(host?.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does not hand Escape to the window listener underneath', () => {
    // MediaWorkspaceHost listens on `window` in the bubble phase and closes the
    // full-screen workspace; the old code relied on `preventDefault` for this,
    // the hook stops propagation at document capture instead.
    const beneath = vi.fn();
    window.addEventListener('keydown', beneath);
    try {
      panel();
      press('Escape');
      expect(beneath).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', beneath);
    }
  });

  it('gives focus back to whatever was focused before it opened', () => {
    panel();
    expect(document.activeElement).not.toBe(outside);
    press('Escape');
    expect(document.activeElement).toBe(outside);
  });
});

describe('the command palette honours the same contract', () => {
  let pHost: HTMLDivElement;
  let pRoot: Root;
  let pOutside: HTMLButtonElement;

  function openPalette(): HTMLElement {
    pHost = document.createElement('div');
    document.body.appendChild(pHost);
    pOutside = document.createElement('button');
    pOutside.textContent = 'Show desktop (minimize all)';
    document.body.appendChild(pOutside);
    pOutside.focus();
    pRoot = createRoot(pHost);
    act(() => { pRoot.render(<CommandPalette />); });
    act(() => { window.dispatchEvent(new CustomEvent('palette:open', { detail: 'commands' })); });
    const el = pHost.querySelector<HTMLElement>('[role="dialog"]');
    expect(el, 'the palette did not open').toBeTruthy();
    return el as HTMLElement;
  }

  afterEach(() => {
    act(() => pRoot?.unmount());
    pHost?.remove();
    pOutside?.remove();
  });

  it('declares aria-modal and opens with its input focused', () => {
    const el = openPalette();
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).className).toContain('palette-input');
  });

  it('does not let Shift+Tab out onto "Show desktop (minimize all)"', () => {
    const el = openPalette();
    const inside = focusables(el);
    // The palette is a combobox (K10): the input is its one Tab stop and the rows are
    // options reached with the arrow keys, so one focusable is the pattern, not a gap.
    expect(inside.length, 'nothing to trap').toBeGreaterThanOrEqual(1);
    press('Tab', true);
    expect(el.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(pOutside);
  });

  it('closes on Escape from anywhere inside, not just the input', () => {
    const el = openPalette();
    const inside = focusables(el);
    act(() => inside[inside.length - 1].focus());
    press('Escape');
    expect(pHost.querySelector('[role="dialog"]')).toBeNull();
  });
});
