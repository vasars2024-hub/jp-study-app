// @vitest-environment jsdom
/**
 * Bug 37: both lock screens scheduled the 4-digit auto-submit from INSIDE a
 * `setDigits` updater. StrictMode (dev builds) runs every updater twice, so the
 * submit was scheduled twice and one wrong PIN spent two of main's attempts
 * (main backs off after five). These mount the real components under
 * <StrictMode> and count what reaches main.
 */
import { act, createElement, StrictMode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, installJsdomShims, mount, stubBridge } from './helpers/axeHarness';

const { verify } = vi.hoisted(() => ({
  verify: vi.fn<(pin: string) => Promise<{ ok: boolean; retryAfterMs?: number }>>(),
}));
vi.mock('../lockscreenSettings', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lockscreenSettings')>(),
  verifyLockscreenPinDetailed: (pin: string) => verify(pin),
}));

beforeAll(() => {
  installJsdomShims();
  stubBridge({ lockscreenSetSize: undefined });
});

afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  verify.mockReset();
});

const key = async (k: string): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
};

describe('one PIN, one attempt (StrictMode)', () => {
  it('Study OS lock: a wrong 4-digit PIN reaches main once', async () => {
    const { default: Lockscreen } = await import('../components/Lockscreen');
    await mount(createElement(StrictMode, null, createElement(Lockscreen, { onUnlocked: () => undefined })), 20);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    verify.mockResolvedValue({ ok: false });
    for (const k of '9999') await key(k);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith('9999');
  });

  it('Study OS lock: the right PIN unlocks once', async () => {
    const onUnlocked = vi.fn();
    const { default: Lockscreen } = await import('../components/Lockscreen');
    await mount(createElement(StrictMode, null, createElement(Lockscreen, { onUnlocked })), 20);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    verify.mockResolvedValue({ ok: true });
    for (const k of '1234') await key(k);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('Blanc lock: a wrong 4-digit PIN typed outside the field reaches main once', async () => {
    const { BlancLockscreen } = await import('../components/blanc/BlancLockscreen');
    await mount(createElement(StrictMode, null, createElement(BlancLockscreen, { onUnlocked: () => undefined })), 20);
    (document.activeElement as HTMLElement | null)?.blur();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    verify.mockResolvedValue({ ok: false });
    for (const k of '9999') await key(k);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith('9999');
  });

  it('Blanc lock: a submit while the last one is still with main is not sent again', async () => {
    const { BlancLockscreen } = await import('../components/blanc/BlancLockscreen');
    const { host } = await mount(createElement(StrictMode, null, createElement(BlancLockscreen, { onUnlocked: () => undefined })), 20);
    let answer!: (r: { ok: boolean }) => void;
    verify.mockImplementation(() => new Promise((r) => (answer = r)));
    const input = host.querySelector('input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '9999');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // The form's own submit (Enter in the field) while main is still checking.
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(verify).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer({ ok: false });
    });
    expect(host.querySelector('.blanc-error')).not.toBeNull();
  });
});
