// @vitest-environment jsdom
/**
 * The lock screen's toast for something main refused while locked
 * (main/lockGuard.ts -> `lockscreen:blocked`): every PIN pad subscribes, the
 * message is per kind and translated, and the subscription ends with the pad.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { lockBlockedMessage, useLockBlockedToasts } from '../lockBlockedNotice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  useLockBlockedToasts();
  return null;
}

describe('lock blocked notice', () => {
  it('maps each refusal kind to its message', () => {
    expect(lockBlockedMessage('command')).toBe('Gum is locked. Unlock to use that shortcut.');
    expect(lockBlockedMessage('tray')).toBe('Gum is locked. Unlock to use that shortcut.');
    expect(lockBlockedMessage('extension')).toBe('Gum is locked. The browser extension is refused until you unlock.');
    expect(lockBlockedMessage('window')).toBe('Gum is locked. Unlock to open that window.');
    expect(lockBlockedMessage('anything-else')).toBe('Gum is locked. Unlock to open that window.');
  });

  it('a mounted PIN pad turns the notice into a warning toast, and unsubscribes on unmount', () => {
    let listener: ((n: { kind: string; action: string }) => void) | null = null;
    const off = vi.fn();
    (window as unknown as { api: unknown }).api = {
      onLockscreenBlocked: (cb: (n: { kind: string; action: string }) => void) => {
        listener = cb;
        return off;
      },
    };
    const toasts: Array<{ message: string; kind: string }> = [];
    const onToast = (e: Event) => toasts.push((e as CustomEvent<{ message: string; kind: string }>).detail);
    window.addEventListener('os:toast', onToast);
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(createElement(Probe)));
    act(() => listener?.({ kind: 'command', action: 'command:lens.region' }));
    expect(toasts).toEqual([{ message: 'Gum is locked. Unlock to use that shortcut.', kind: 'warn', action: undefined }]);
    act(() => root.unmount());
    expect(off).toHaveBeenCalledTimes(1);
    window.removeEventListener('os:toast', onToast);
  });
});
