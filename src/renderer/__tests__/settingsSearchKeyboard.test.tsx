// @vitest-environment jsdom
/**
 * L11 bullet 1 — full keyboard pass. The Settings search suggestion panel was reachable
 * with a mouse and unreachable with a keyboard, and the two paths diverged for one reason:
 * every item carries `onMouseDown={e => e.preventDefault()}`, so a CLICK never blurs the
 * input, while a TAB does — and `onBlur` on the input scheduled `setOpen(false)`
 * unconditionally. The panel then unmounted under the option the browser had just focused
 * and focus fell to `document.body`.
 *
 * Measured live on 2026-09-01 through the debug bridge, pressing a real Tab key
 * (`sendInputEvent`, not a dispatched KeyboardEvent — a synthetic keydown does not move
 * focus in Chromium): the Settings window's walk read
 *   5 input.os-set-search-input  ->  6 button.os-set-search-item "theme"  ->  7 BODY
 * with 16 items rendered in the panel at that moment. One of sixteen was reachable.
 *
 * These cases pin the discrimination that fixed it: closing belongs to focus leaving the
 * WIDGET, which only `relatedTarget` can tell from the input alone losing focus.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsSearch from '../components/settings/SettingsSearch';

let host: HTMLDivElement;
let root: Root | null = null;

const CLOSE_DELAY_MS = 140;

const panel = () => document.querySelector('.os-set-search-panel');
const input = () => document.querySelector<HTMLInputElement>('.os-set-search-input');
const items = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.os-set-search-item'));

/** React's `onBlur` is `focusout`; jsdom's own focus() does not carry a relatedTarget. */
function focusOut(from: Element, to: Element | null) {
  from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }));
}
function focusIn(on: Element) {
  on.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mount() {
  const navigated: string[] = [];
  await act(async () => {
    root?.render(<SettingsSearch onNavigate={(page) => navigated.push(page)} />);
  });
  // Opening is what the input's focus does; the panel only exists once open.
  await act(async () => {
    focusIn(input() as Element);
  });
}

describe('Settings search — keyboard reachability of the suggestion panel', () => {
  // Two cases, deliberately, because they pin different halves and one of them alone does
  // not discriminate. A browser fires focusout THEN focusin, and the focusin cancels the
  // pending close on its own — so a run that dispatches both passes even with the
  // `relatedTarget` guard stubbed out to `false` (verified by mutation, 2026-09-01). The
  // guard is what holds when only the focusout is seen, so it gets a case of its own.
  it('does not schedule a close when focusout names a target inside the widget', async () => {
    await mount();
    expect(panel()).not.toBeNull();
    const first = items()[0];
    expect(first).toBeDefined();

    await act(async () => {
      focusOut(input() as Element, first);
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 4);
    });

    // The regression: the panel unmounted here and took the focused option with it.
    expect(panel()).not.toBeNull();
    expect(document.contains(first)).toBe(true);
  });

  it('keeps the panel mounted across a real Tab (focusout then focusin)', async () => {
    await mount();
    const first = items()[0];

    await act(async () => {
      focusOut(input() as Element, first);
      focusIn(first);
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 4);
    });

    expect(panel()).not.toBeNull();
    expect(items().length).toBeGreaterThan(1);
    expect(document.contains(first)).toBe(true);
  });

  it('still closes when focus leaves the widget entirely', async () => {
    await mount();
    expect(panel()).not.toBeNull();
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    await act(async () => {
      focusOut(input() as Element, outside);
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
    });

    expect(panel()).toBeNull();
    outside.remove();
  });

  it('closes when focus is lost with no relatedTarget at all', async () => {
    await mount();
    await act(async () => {
      focusOut(input() as Element, null);
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
    });
    expect(panel()).toBeNull();
  });

  it('Escape from an item dismisses the panel and returns focus to the input', async () => {
    await mount();
    const first = items()[0];
    await act(async () => {
      focusOut(input() as Element, first);
      focusIn(first);
      first.focus();
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
    });
    expect(panel()).not.toBeNull();

    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it('describes the empty-query panel as a group of labelled sections, not a listbox', async () => {
    await mount();
    const p = panel();
    expect(p?.getAttribute('role')).toBe('group');
    const groups = Array.from(document.querySelectorAll('.os-set-search-section'));
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.getAttribute('role')).toBe('group');
      const labelId = g.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      const label = labelId ? document.getElementById(labelId) : null;
      expect(label?.textContent?.trim()).toBeTruthy();
    }
    // The shortcut buttons are not options, so they must not claim to be.
    expect(document.querySelectorAll('.os-set-search-item[role="option"]').length).toBe(0);
  });

  it('becomes a real listbox of options once a query matches', async () => {
    await mount();
    const el = input() as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, 'theme');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const options = document.querySelectorAll('.os-set-search-item[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    expect(panel()?.getAttribute('role')).toBe('listbox');
    // aria-selected must name exactly one option, so a reader is not told about two.
    const selected = Array.from(options).filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected.length).toBe(1);
  });

  it('keeps aria-selected on the option that actually holds focus', async () => {
    await mount();
    const el = input() as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, 'theme');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const options = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.os-set-search-item[role="option"]'),
    );
    if (options.length < 2) return; // the registry decides the count; one match proves nothing here
    await act(async () => {
      options[1].focus();
      options[1].dispatchEvent(new FocusEvent('focus', { bubbles: false }));
      focusIn(options[1]);
    });
    const nowSelected = Array.from(
      document.querySelectorAll('.os-set-search-item[role="option"]'),
    ).findIndex((o) => o.getAttribute('aria-selected') === 'true');
    expect(nowSelected).toBe(1);
  });
});
