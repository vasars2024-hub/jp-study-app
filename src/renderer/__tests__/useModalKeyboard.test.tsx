// @vitest-environment jsdom
/**
 * The keyboard contract every `aria-modal` dialog in this app is supposed to
 * honour, extracted from `GrammarTestModal`'s 2026-09-06 fix and applied to the
 * seven dialogs that had none (register row D9): `DropRouter`'s triage sheet,
 * `filesapp/ScanReviewSheet`, `media/library/MediaMatchDialog`,
 * `media/library/NyaaSubtitleDialog`, and the three nested editors inside
 * `scraper/settings/ScraperSettingsDrawer`.
 *
 * Two of the four cases here are the ones that actually catch regressions:
 *
 *  - **"Escape does too much".** The desktop shell closes the focused window on
 *    Escape, so a handler that does not `stopPropagation` closes the dialog and
 *    takes the whole window with it. Deleting that one line turns that case red
 *    by name and leaves the rest green.
 *  - **Escape refused still stops the key.** `onEscape: null` is how a dialog
 *    with a write in flight refuses to dismiss. If refusing also meant letting
 *    the key through, the shell would close the window mid-write — strictly
 *    worse than dismissing.
 */
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useModalKeyboard } from '../components/ui/useModalKeyboard';

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let trigger: HTMLButtonElement | null = null;

function Panel({ onEscape, enabled }: { onEscape: (() => void) | null; enabled?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalKeyboard({ panelRef, onEscape, enabled });
  return (
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" data-testid="panel">
      <button type="button">first</button>
      <button type="button">middle</button>
      <button type="button">last</button>
    </div>
  );
}

function mount(onEscape: (() => void) | null, enabled = true): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);

  // A real element to focus first, so "focus was restored" is a claim about
  // something rather than about `document.body`.
  trigger = document.createElement('button');
  trigger.textContent = 'Open';
  document.body.appendChild(trigger);
  trigger.focus();

  const r = createRoot(host);
  root = r;
  act(() => r.render(<Panel onEscape={onEscape} enabled={enabled} />));
  const panel = host.querySelector('[data-testid="panel"]');
  if (!(panel instanceof HTMLElement)) throw new Error('panel did not render');
  return panel;
}

function pressEscape(): { reachedDocument: boolean } {
  // The shell listens on `window`, at the end of the chain. If the dialog let
  // the key through, this fires.
  let reachedDocument = false;
  const spy = (): void => {
    reachedDocument = true;
  };
  window.addEventListener('keydown', spy);
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  });
  window.removeEventListener('keydown', spy);
  return { reachedDocument };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  trigger?.remove();
  trigger = null;
});

describe('useModalKeyboard', () => {
  it('moves focus into the panel on open and puts it back on unmount', () => {
    const panel = mount(vi.fn());
    expect(document.activeElement).toBe(panel);

    act(() => root?.unmount());
    root = null;
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape and does NOT let the key reach the shell', () => {
    const onEscape = vi.fn();
    mount(onEscape);

    const { reachedDocument } = pressEscape();

    expect(onEscape).toHaveBeenCalledTimes(1);
    // Remove `e.stopPropagation()` from the hook and this line goes red while
    // the one above stays green — that is the whole point of the case.
    expect(reachedDocument).toBe(false);
  });

  it('with onEscape null, refuses to close but still swallows the key', () => {
    mount(null);

    const { reachedDocument } = pressEscape();

    expect(reachedDocument).toBe(false);
    expect(document.activeElement).toBeTruthy();
  });

  it('wraps Tab at the end of the panel and Shift+Tab at the start', () => {
    const panel = mount(vi.fn());
    const buttons = Array.from(panel.querySelectorAll('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    act(() => last.focus());
    act(() => {
      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(first);

    act(() => {
      first.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(last);
  });

  it('does nothing at all while disabled', () => {
    const onEscape = vi.fn();
    mount(onEscape, false);

    expect(document.activeElement).toBe(trigger);
    const { reachedDocument } = pressEscape();
    expect(onEscape).not.toHaveBeenCalled();
    expect(reachedDocument).toBe(true);
  });
});
