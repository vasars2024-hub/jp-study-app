// @vitest-environment jsdom
/**
 * Blanc's lockscreen counted every digit typed into its PIN field twice: the
 * field's own `onChange` appended it, and a window-level keydown listener with
 * no target check appended it again. "1234" typed normally became "1122" and
 * the correct PIN could never unlock. These drive the real component.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// `vi.mock` is hoisted above this import, so the component sees the mock.
import { BlancLockscreen } from '../components/blanc/BlancLockscreen';

const { verify } = vi.hoisted(() => ({ verify: vi.fn((pin: string) => pin === '1234') }));
vi.mock('../lockscreenSettings', () => ({
  verifyLockscreenPin: (pin: string) => verify(pin),
  // BlancLockscreen reads the detailed answer (it carries main's backoff).
  verifyLockscreenPinDetailed: (pin: string) => ({ ok: verify(pin) }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  verify.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function filledDots(): number {
  return container.querySelectorAll('.blanc-lock-dots .filled').length;
}

/**
 * What a real keypress in the field does, in the browser's order: keydown on the
 * field (React flushes any state it set before the default action), THEN the
 * character is inserted into whatever value the field holds by then.
 */
function typeIntoField(input: HTMLInputElement, digit: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: digit, bubbles: true }));
  });
  act(() => {
    // React tracks the value through the prototype setter; assigning `.value`
    // directly would be swallowed as "no change".
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, input.value + digit);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Blanc lockscreen PIN entry', () => {
  it('counts a digit typed into the PIN field once', () => {
    act(() => root.render(createElement(BlancLockscreen, { onUnlocked: () => undefined })));
    const input = container.querySelector('input') as HTMLInputElement;
    typeIntoField(input, '1');
    expect(input.value).toBe('1');
    expect(filledDots()).toBe(1);
  });

  it('unlocks with the right PIN typed into the field', async () => {
    const onUnlocked = vi.fn();
    act(() => root.render(createElement(BlancLockscreen, { onUnlocked })));
    const input = container.querySelector('input') as HTMLInputElement;
    for (const digit of '1234') typeIntoField(input, digit);
    expect(verify).toHaveBeenCalledWith('1234');
    // Verification is async now (main checks the scrypt hash).
    await act(async () => {
      await Promise.resolve();
    });
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab and Shift+Tab inside the lock (shared focus trap)', () => {
    const outside = document.createElement('button');
    outside.textContent = 'behind the lock';
    document.body.append(outside);
    try {
      act(() => root.render(createElement(BlancLockscreen, { onUnlocked: () => undefined })));
      const input = container.querySelector('input') as HTMLInputElement;
      input.focus();
      for (const shiftKey of [false, true]) {
        const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
        act(() => {
          input.dispatchEvent(event);
        });
        expect(event.defaultPrevented, `shift=${shiftKey}`).toBe(true);
        expect(document.activeElement).toBe(input);
      }
    } finally {
      outside.remove();
    }
  });

  it('pulls focus that lands behind the lock back to the PIN field', () => {
    const outside = document.createElement('button');
    outside.textContent = 'toast action';
    document.body.append(outside);
    try {
      act(() => root.render(createElement(BlancLockscreen, { onUnlocked: () => undefined })));
      const input = container.querySelector('input') as HTMLInputElement;
      act(() => outside.focus());
      expect(document.activeElement).toBe(input);
    } finally {
      outside.remove();
    }
  });

  it('a Tab press is not taken as PIN input', () => {
    act(() => root.render(createElement(BlancLockscreen, { onUnlocked: () => undefined })));
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    });
    expect(filledDots()).toBe(0);
    // Focus that had left the lock is brought into it.
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it('still takes digits from the keyboard when focus is not in the field', async () => {
    vi.useFakeTimers();
    try {
      const onUnlocked = vi.fn();
      act(() => root.render(createElement(BlancLockscreen, { onUnlocked })));
      (document.activeElement as HTMLElement | null)?.blur();
      for (const digit of '1234') {
        act(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: digit }));
        });
      }
      expect(filledDots()).toBe(4);
      act(() => vi.advanceTimersByTime(100));
      await act(async () => {
        await Promise.resolve();
      });
      expect(onUnlocked).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
