// @vitest-environment jsdom
/**
 * The toast is the app's only report of what just happened, and three of its
 * states were dishonest. Each case below is one of them, measured from source
 * before the fix:
 *
 *  1. `styles.css` styled `.os-toast.ok` and `.os-toast.muted` and nothing else,
 *     while `DropRouter.tsx:130`, `:139` and `:169` dispatch `err` and `warn`
 *     for real. A failed file drop drew the neutral border and was announced
 *     through the same `aria-live="polite"` region as a success — queued behind
 *     whatever the screen reader was already saying, then gone in 2,800 ms.
 *  2. No toast had a close. The only exit was the timeout.
 *  3. The actioned toast — the drop router's nine-second Undo — kept counting
 *     down while the pointer travelled to the button and while a keyboard user
 *     tabbed into it. A recovery path that expires mid-reach is not one.
 *
 * Timing is driven with fake timers against WALL-CLOCK deadlines rather than a
 * countdown, which is also what the component does: `Date.now()` is advanced by
 * the same fake clock, so a sweep tick that does not fire cannot make a toast
 * expire early or late here for a reason the real app would not share.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToastHost, { showOsToast } from '../components/ToastHost';

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(<ToastHost />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
});

function toast(): HTMLElement | null {
  return host.querySelector('.os-toast');
}

/** Advance both the timer queue and the clock the deadlines are read from. */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('a failure does not read like a success', () => {
  it('announces err and warn assertively, and keeps ok polite', () => {
    act(() => showOsToast('drop failed', 'err'));
    expect(toast()?.getAttribute('role')).toBe('alert');
    expect(toast()?.getAttribute('aria-live')).toBe('assertive');

    act(() => showOsToast('no destination', 'warn'));
    const warn = [...host.querySelectorAll('.os-toast')].at(-1);
    expect(warn?.getAttribute('aria-live')).toBe('assertive');

    act(() => showOsToast('saved', 'ok'));
    const ok = [...host.querySelectorAll('.os-toast')].at(-1);
    // The control for the two above: an ordinary toast must NOT interrupt, or
    // "assertive" means nothing and every toast talks over the reader.
    expect(ok?.getAttribute('role')).toBeNull();
    expect(ok?.getAttribute('aria-live')).toBeNull();
    // The polite ancestor region is still the one carrying it.
    expect(host.querySelector('.os-toast-host')?.getAttribute('aria-live')).toBe('polite');
  });

  it('carries the kind as a class the stylesheet can reach', () => {
    act(() => showOsToast('drop failed', 'err'));
    expect(toast()?.className).toContain('err');
  });
});

describe('every toast has an exit that is not a timeout', () => {
  it('dismisses on click, before its own deadline', () => {
    act(() => showOsToast('saved', 'ok'));
    expect(toast()).not.toBeNull();
    const close = toast()?.querySelector<HTMLButtonElement>('.os-toast-close');
    expect(close).not.toBeNull();
    expect(close?.getAttribute('aria-label')?.length).toBeGreaterThan(0);
    act(() => close?.click());
    expect(host.querySelector('.os-toast-host .os-toast')).toBeNull();
  });

  it('still expires on its own when nobody dismisses it', () => {
    // The control for the case above: if the sweep were broken, "dismiss works"
    // would pass on a component that simply never removes anything on time.
    act(() => showOsToast('saved', 'ok'));
    advance(2000);
    expect(toast()).not.toBeNull();
    advance(1200);
    expect(host.querySelector('.os-toast-host .os-toast')).toBeNull();
  });
});

describe('the undo window waits for the user', () => {
  function actioned(): void {
    act(() =>
      showOsToast('moved 3 files', 'ok', { label: 'Undo', run: () => undefined }),
    );
  }

  it('holds the countdown while the pointer rests on an actioned toast', () => {
    actioned();
    advance(8000);
    expect(toast()).not.toBeNull();

    act(() => toast()?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    // Well past the 9,000 ms deadline it would have hit unheld.
    advance(20000);
    expect(toast(), 'a held toast must not expire while the pointer is on it').not.toBeNull();
    expect(toast()?.querySelector('.os-toast-action')).not.toBeNull();
  });

  it('resumes with the time it had left, not with a fresh window', () => {
    actioned();
    advance(8000);
    act(() => toast()?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    advance(20000);
    act(() => toast()?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));

    // ~1,000 ms was owed. This is the half that a naive "restart the timer on
    // leave" implementation gets wrong, and it is the difference between a
    // toast the user can park forever and one that honours its own budget.
    advance(400);
    expect(toast(), 'still owed roughly 600 ms').not.toBeNull();
    advance(900);
    expect(host.querySelector('.os-toast-host .os-toast')).toBeNull();
  });

  it('holds while focus is inside the host, for the keyboard path', () => {
    actioned();
    const action = toast()?.querySelector<HTMLButtonElement>('.os-toast-action');
    act(() => action?.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    advance(20000);
    expect(toast(), 'tabbing to Undo must not run its own clock out').not.toBeNull();
  });
});
