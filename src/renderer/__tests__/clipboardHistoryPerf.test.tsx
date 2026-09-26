// @vitest-environment jsdom
/**
 * Clipboard history: windowed, bounded, and not retained once closed.
 *
 * - Every entry was mounted (2,000 cards of six buttons each, re-rendered per
 *   keystroke in the search box); the list is a VirtualList now.
 * - The size box declared max=2000 and nothing enforced it.
 * - Closing with the search box focused left that detached input as React's
 *   tracked active element, keeping the whole closed panel alive.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));
vi.hoisted(() => {
  Object.defineProperty(globalThis, 'api', {
    configurable: true,
    value: new Proxy({}, { get: () => () => Promise.resolve(undefined) }),
  });
});

import ClipboardHistoryPanel from '../components/ClipboardHistoryPanel';
import {
  CLIPBOARD_MAX_SIZE_MAX,
  clampClipboardMaxSize,
  loadClipboardSettings,
  saveClipboardSettings,
} from '../clipboardHistory';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function seed(n: number): void {
  const now = Date.now();
  localStorage.setItem('jp-clipboard-history', JSON.stringify(
    Array.from({ length: n }, (_, i) => ({ id: `cb-${i}`, text: `entry ${i} 猫が好き`, type: 'text', createdAt: now - i })),
  ));
}

function open(): void {
  root = createRoot(host as HTMLDivElement);
  act(() => { root?.render(<ClipboardHistoryPanel />); });
  act(() => { window.dispatchEvent(new CustomEvent('clipboard:open')); });
}

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('clipboard history panel', () => {
  it('mounts a window of a 2,000-entry history, not every card', () => {
    seed(2_000);
    open();
    const cards = host?.querySelectorAll('.cbh-card') ?? [];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThan(40);
    const list = host?.querySelector('[role="list"]');
    expect(list?.querySelector('[role="listitem"]')?.getAttribute('aria-setsize')).toBe('2000');
  });

  it('blurs its focused search box before it unmounts', () => {
    seed(3);
    open();
    const search = host?.querySelector<HTMLInputElement>('.cbh-search');
    expect(document.activeElement).toBe(search);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(host?.querySelector('[role="dialog"]')).toBeNull();
    // Not a detached node: focus left the input before React removed it.
    expect(document.activeElement === search).toBe(false);
    expect(document.activeElement?.isConnected ?? true).toBe(true);
  });
});

describe('the history size setting', () => {
  it('is clamped when saved and when read back', () => {
    expect(clampClipboardMaxSize(100_000)).toBe(CLIPBOARD_MAX_SIZE_MAX);
    expect(clampClipboardMaxSize(3)).toBe(10);
    expect(clampClipboardMaxSize('abc', 200)).toBe(200);
    expect(saveClipboardSettings({ maxSize: 100_000 }).maxSize).toBe(CLIPBOARD_MAX_SIZE_MAX);
    localStorage.setItem('jp-clipboard-settings', JSON.stringify({ maxSize: 999_999 }));
    expect(loadClipboardSettings().maxSize).toBe(CLIPBOARD_MAX_SIZE_MAX);
  });

  it('commits a typed size on blur, clamped, and lets the user type multi-digit numbers', () => {
    seed(1);
    open();
    act(() => {
      host?.querySelector<HTMLButtonElement>('.cbh-icon-btn')?.click();
    });
    const box = host?.querySelector<HTMLInputElement>('.cbh-settings input[type="number"]');
    expect(box).toBeTruthy();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      box?.focus();
      setValue?.call(box, '5');
      box?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Still what was typed: "5" on the way to "50000" is not snapped to 10.
    expect(box?.value).toBe('5');
    act(() => {
      setValue?.call(box, '50000');
      box?.dispatchEvent(new Event('input', { bubbles: true }));
      box?.blur();
    });
    expect(loadClipboardSettings().maxSize).toBe(CLIPBOARD_MAX_SIZE_MAX);
    expect(box?.value).toBe(String(CLIPBOARD_MAX_SIZE_MAX));
  });
});
