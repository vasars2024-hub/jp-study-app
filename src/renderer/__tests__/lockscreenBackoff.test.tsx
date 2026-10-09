// @vitest-environment jsdom
/**
 * The lock screen must say when main's backoff is holding entry.
 *
 * Found by the headless e2e harness (tools/e2e, flow `lockscreen`): after five wrong PINs
 * main refuses every attempt for 30 s (`lockscreenPin.ts`), answering `retryAfterMs`
 * without even checking the PIN. The screen read only the boolean, so it showed
 * "Incorrect passcode" — and the RIGHT PIN, typed inside the window, looked wrong too.
 * Now the wait is stated, entry pauses until it is over, and then the PIN works.
 */
import { act, createElement } from 'react';
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

const typePin = async (pin: string): Promise<void> => {
  for (const key of pin) {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  }
  // The pad submits 80 ms after the fourth digit; the failure flash clears after 420 ms.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
};

describe('lock screen backoff', () => {
  it('states the wait, pauses entry, then accepts the PIN once it is over', async () => {
    const onUnlocked = vi.fn();
    const { default: Lockscreen } = await import('../components/Lockscreen');
    const { host } = await mount(createElement(Lockscreen, { onUnlocked }), 20);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const prompt = () => host.querySelector('.lockscreen-win11-prompt')?.textContent ?? '';

    verify.mockResolvedValueOnce({ ok: false, retryAfterMs: 30_000 });
    await typePin('1234');
    expect(verify).toHaveBeenCalledTimes(1);
    expect(prompt()).toMatch(/Try again in (29|30) seconds/);
    expect([...host.querySelectorAll('button.lockscreen-win11-key')].every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(onUnlocked).not.toHaveBeenCalled();

    // Typing during the wait does not even reach main.
    await typePin('1234');
    expect(verify).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_500);
    });
    expect(prompt()).toBe('Enter your passcode');

    verify.mockResolvedValueOnce({ ok: true });
    await typePin('1234');
    expect(verify).toHaveBeenCalledTimes(2);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it("Blanc's lock says the wait too", async () => {
    const { BlancLockscreen } = await import('../components/blanc/BlancLockscreen');
    const { host } = await mount(createElement(BlancLockscreen, { onUnlocked: () => undefined }), 20);
    verify.mockResolvedValueOnce({ ok: false, retryAfterMs: 120_000 });
    const input = host.querySelector('input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '1234');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.querySelector('.blanc-error')?.textContent).toBe('Too many attempts. Try again in 120 seconds.');
  });

  it('a plain wrong PIN still reads as wrong, with no wait', async () => {
    const { default: Lockscreen } = await import('../components/Lockscreen');
    const { host } = await mount(createElement(Lockscreen, { onUnlocked: () => undefined }), 20);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    verify.mockResolvedValueOnce({ ok: false });
    for (const key of '9999') {
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(host.querySelector('.lockscreen-win11-prompt')?.textContent).toBe('Incorrect passcode. Try again.');
    expect(host.querySelector('.lockscreen-win11-prompt')?.textContent).not.toMatch(/Try again in/);
  });
});
