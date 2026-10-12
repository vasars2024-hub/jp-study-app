// @vitest-environment jsdom
/**
 * lock4 — a longer PIN (4-12 digits) or a passphrase, on the lock screens.
 *
 * Main keeps the secret's KIND in its record and every lock screen asks for it on
 * mount (the lock's own status channel answers while locked):
 *  - a passphrase gets a labelled text field and a named submit button instead of the
 *    digit pad, and digits typed on the keyboard are not captured by the pad;
 *  - a longer PIN keeps the pad but gains an Enter key, shows as many dots as typed and
 *    never submits by itself at four digits;
 *  - a secret below its minimum is refused here, without spending one of main's attempts;
 *  - Blanc's minimal lock does the same with its own field and an Unlock button.
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, installJsdomShims, mount, stubBridge } from './helpers/axeHarness';

const { verify, kind } = vi.hoisted(() => ({
  verify: vi.fn<(pin: string) => Promise<{ ok: boolean; retryAfterMs?: number }>>(),
  kind: { value: 'passphrase' as 'pin4' | 'pin' | 'passphrase' },
}));
vi.mock('../lockscreenSettings', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lockscreenSettings')>(),
  verifyLockscreenPinDetailed: (pin: string) => verify(pin),
}));

const status = () => ({
  locked: true,
  enabled: true,
  hasPin: true,
  hasRecovery: true,
  autoLock: { idleMinutes: 0, onSleep: false, onScreenLock: false },
  secretKind: kind.value,
  pinHash: 'scrypt1:a:b',
});

beforeAll(() => {
  installJsdomShims();
  stubBridge({ lockscreenSetSize: undefined, lockscreenStatus: () => Promise.resolve(status()) });
});

beforeEach(() => {
  localStorage.setItem('jp-study-lockscreen-v1', JSON.stringify({ enabled: true, pinHash: 'scrypt1:a:b', tint: 'auto', study: 'off' }));
});

afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  verify.mockReset();
  localStorage.clear();
});

const fill = async (input: HTMLInputElement, value: string): Promise<void> => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const submit = async (input: HTMLInputElement): Promise<void> => {
  await act(async () => {
    input.form?.requestSubmit();
  });
  await act(async () => {
    await Promise.resolve();
  });
};
const keys = async (text: string): Promise<void> => {
  for (const key of text) {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  }
};

describe('Study OS lock screen', () => {
  it('a passphrase: a labelled field and a named submit, no digit pad; short ones never reach main', async () => {
    kind.value = 'passphrase';
    const onUnlocked = vi.fn();
    const { default: Lockscreen } = await import('../components/Lockscreen');
    const { host } = await mount(createElement(Lockscreen, { onUnlocked }), 40);
    const input = host.querySelector('.lockscreen-pass-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute('aria-label')).toBe('Passphrase');
    expect(input.inputMode).toBe('text');
    expect(input.getAttribute('aria-describedby')).toBe('lockscreen-win11-prompt');
    expect(document.activeElement).toBe(input);
    expect(host.querySelector('.lockscreen-win11-pad')).toBeNull();
    const go = host.querySelector('.lockscreen-pass-go') as HTMLButtonElement;
    expect(go.getAttribute('aria-label')).toBe('Sign in');
    expect(host.querySelector('#lockscreen-win11-prompt')?.textContent).toBe('Enter your passphrase');

    // The pad's window-level digit capture is off: nothing is submitted.
    await keys('1234');
    expect(verify).not.toHaveBeenCalled();

    await fill(input, 'abc');
    await submit(input);
    expect(verify).not.toHaveBeenCalled();
    expect(host.querySelector('#lockscreen-win11-prompt')?.textContent).toMatch(/Too short/);
    expect(input.getAttribute('aria-invalid')).toBe('true');

    verify.mockResolvedValueOnce({ ok: true });
    await fill(input, 'river stone 9');
    await submit(input);
    expect(verify).toHaveBeenCalledWith('river stone 9');
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('a longer PIN: an Enter key on the pad, no submit at four digits, dots as typed', async () => {
    kind.value = 'pin';
    const onUnlocked = vi.fn();
    const { default: Lockscreen } = await import('../components/Lockscreen');
    const { host } = await mount(createElement(Lockscreen, { onUnlocked }), 40);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const enter = [...host.querySelectorAll('button.lockscreen-win11-key')].find((b) => b.textContent === 'Enter') as HTMLButtonElement;
    expect(enter).toBeTruthy();
    expect(host.querySelector('#lockscreen-win11-prompt')?.textContent).toBe('Enter your PIN, then press Enter');

    await keys('2468');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(verify).not.toHaveBeenCalled();
    await keys('1357');
    expect(host.querySelectorAll('.lockscreen-win11-dot').length).toBe(8);
    expect(host.querySelectorAll('.lockscreen-win11-dot.is-filled').length).toBe(8);

    verify.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(verify).toHaveBeenCalledWith('24681357');
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('WIRED and Aero draw their own field for a passphrase, labelled and unfiltered', async () => {
    kind.value = 'passphrase';
    const { default: Lockscreen } = await import('../components/Lockscreen');
    for (const [material, selector] of [['wired', '#wired-access-code'], ['aero', '.lockscreen-aero-pass']] as const) {
      document.documentElement.setAttribute('data-materials', material);
      const { host } = await mount(createElement(Lockscreen, { onUnlocked: () => undefined }), 40);
      const input = host.querySelector(selector) as HTMLInputElement;
      expect({ material, label: input.getAttribute('aria-label'), mode: input.inputMode, max: input.maxLength }).toEqual({
        material,
        label: 'Passphrase',
        mode: 'text',
        max: 64,
      });
      await fill(input, 'abc def');
      expect(input.value).toBe('abc def'); // not stripped to digits
      await cleanup();
    }
    document.documentElement.removeAttribute('data-materials');
  });
});

describe("Blanc's lock screen", () => {
  it('a passphrase: labelled field, an Unlock button, no dots, submitted with Enter', async () => {
    kind.value = 'passphrase';
    const onUnlocked = vi.fn();
    const { BlancLockscreen } = await import('../components/blanc/BlancLockscreen');
    const { host } = await mount(createElement(BlancLockscreen, { onUnlocked }), 40);
    const input = host.querySelector('.blanc-lock input') as HTMLInputElement;
    expect(input.closest('label')?.textContent).toContain('Passphrase');
    expect(input.inputMode).toBe('text');
    expect(host.querySelector('.blanc-lock-dots')).toBeNull();
    expect(host.querySelector('.blanc-lock-submit')?.textContent).toBe('Unlock');
    await fill(input, 'short');
    await submit(input);
    expect(verify).not.toHaveBeenCalled();
    expect(host.querySelector('.blanc-error')?.textContent).toMatch(/Too short/);
    verify.mockResolvedValueOnce({ ok: true });
    await fill(input, 'river stone 9');
    await submit(input);
    expect(verify).toHaveBeenCalledWith('river stone 9');
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('a classic 4-digit PIN still submits on the fourth digit', async () => {
    kind.value = 'pin4';
    const { BlancLockscreen } = await import('../components/blanc/BlancLockscreen');
    const { host } = await mount(createElement(BlancLockscreen, { onUnlocked: () => undefined }), 40);
    expect(host.querySelector('.blanc-lock-submit')).toBeNull();
    verify.mockResolvedValueOnce({ ok: false });
    await fill(host.querySelector('.blanc-lock input') as HTMLInputElement, '1234');
    expect(verify).toHaveBeenCalledWith('1234');
  });
});
