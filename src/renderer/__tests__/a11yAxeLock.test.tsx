// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over every lock screen skin
 * (default PIN pad, widget, Aero, Wired) and Blanc's; the keyboard contract
 * of a modal lock (Tab never leaves it, focus starts inside it); and the
 * screen-reader status a PIN pad gives (digits entered, wrong PIN).
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

const { verify } = vi.hoisted(() => ({ verify: vi.fn(async (pin: string) => pin === '1234') }));
vi.mock('../lockscreenSettings', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lockscreenSettings')>(),
  verifyLockscreenPin: (pin: string) => verify(pin),
  // Lockscreen.tsx reads the detailed answer (it carries main's backoff).
  verifyLockscreenPinDetailed: async (pin: string) => ({ ok: await verify(pin) }),
}));

beforeAll(() => {
  installJsdomShims();
  stubBridge({ lockscreenSetSize: undefined });
});

afterEach(async () => {
  await cleanup();
  document.documentElement.removeAttribute('data-materials');
  localStorage.clear();
});

const tab = async (shiftKey = false): Promise<void> => {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
    );
  });
};

describe('lock screens — axe-core', () => {
  const skins: [string, string | null, boolean][] = [
    ['default PIN pad', null, false],
    ['widget', null, true],
    ['aero', 'aero', false],
    ['wired', 'wired', false],
  ];
  for (const [name, material, widgetMode] of skins) {
    it(name, async () => {
      if (material) document.documentElement.setAttribute('data-materials', material);
      const outside = document.createElement('button');
      outside.textContent = 'behind the lock';
      document.body.append(outside);
      outside.focus();
      const { default: Lockscreen } = await import('../components/Lockscreen');
      const { host } = await mount(createElement(Lockscreen, { onUnlocked: () => undefined, widgetMode }), 20);
      const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog, 'lock dialog').not.toBeNull();
      expect(dialog.contains(document.activeElement), 'focus starts inside the lock').toBe(true);
      expect(await a11yViolations(host)).toEqual([]);
      // Tab and Shift+Tab from every stop stay inside.
      for (let i = 0; i < 16; i += 1) {
        await tab(i % 3 === 0);
        expect(dialog.contains(document.activeElement), `Tab ${i} stayed inside`).toBe(true);
      }
      outside.remove();
    });
  }

  it('the PIN pad says how many digits are in and when the PIN is wrong', async () => {
    const { default: Lockscreen } = await import('../components/Lockscreen');
    const { host } = await mount(createElement(Lockscreen, { onUnlocked: () => undefined }), 20);
    const statuses = () => [...host.querySelectorAll('[role="status"]')].map((n) => n.textContent ?? '').join(' | ');
    const key = (k: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === k);
    await act(async () => key('1')?.click());
    expect(statuses()).toMatch(/1/);
    for (const k of ['9', '9', '9']) await act(async () => key(k)?.click());
    await settle(150);
    expect(verify).toHaveBeenCalledWith('1999');
    expect(host.querySelector('.lockscreen-win11-prompt')?.getAttribute('role')).toBe('status');
  });

  it("Blanc's lock screen", async () => {
    const { BlancLockscreen } = await import('../components/blanc/BlancLockscreen');
    const { host } = await mount(createElement(BlancLockscreen, { onUnlocked: () => undefined }), 20);
    expect(await a11yViolations(host)).toEqual([]);
  });
});
