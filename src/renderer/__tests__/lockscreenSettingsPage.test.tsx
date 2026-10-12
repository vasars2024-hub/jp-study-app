// @vitest-environment jsdom
/**
 * lock3 — Settings -> Lockscreen drives main's PIN calls for real (the page is
 * mounted through SettingsApp, the way deep links reach it):
 *  - the first PIN goes to main with no current PIN and its recovery code is shown once;
 *  - a change needs the current passcode: without it nothing is sent to main;
 *  - with it, main gets (current, new);
 *  - turning "lock at launch" off without the current passcode is refused locally,
 *    and main is not asked.
 * Found by the e2e flow `lockscreen-plus`: a refactor had left every PIN call
 * returning nothing, which no mocked unit test noticed.
 */
import { act, createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, installJsdomShims, mount, settle, stubBridge, type Mounted } from './helpers/axeHarness';

vi.mock('../components/AnkiSetup', () => ({ default: () => <div /> }));

const AUTO = { idleMinutes: 0, onSleep: false, onScreenLock: false };
const state = { hasPin: false, enabled: false };
const status = () => ({ locked: false, enabled: state.enabled, hasPin: state.hasPin, hasRecovery: state.hasPin, autoLock: AUTO, pinHash: state.hasPin ? 'scrypt1:a:b' : '' });
const setPin = vi.fn(async (_current: string | null, _next: string) => {
  const first = !state.hasPin;
  state.hasPin = true;
  return { ok: true, ...(first ? { recoveryCode: 'ABCD-EFGH-JKMN-PQRS' } : {}), status: status() };
});
const setEnabled = vi.fn(async (on: boolean) => {
  state.enabled = on;
  return { ok: true, status: status() };
});

let app: Mounted;

beforeAll(async () => {
  installJsdomShims();
  stubBridge({
    lockscreenSetPin: setPin,
    lockscreenSetEnabled: setEnabled,
    lockscreenStatus: () => Promise.resolve(status()),
    lockscreenSyncConfig: { ok: false, locked: false },
    listLibrary: [],
    displayList: [],
  });
  localStorage.clear();
  const { WALL_PRESETS } = await import('../environment/wallCatalog');
  const { default: SettingsApp } = await import('../components/settings/SettingsApp');
  const noop = (): undefined => undefined;
  app = await mount(createElement(SettingsApp, {
    wall: { kind: 'preset', id: WALL_PRESETS[0]?.id ?? 'void' }, wallPreset: '', presets: [],
    onWallPreset: noop, onWallImage: noop, onWallVideo: noop, onWallClear: noop, onReset: noop, onOpenVisualizer: noop, onOpenMusicWidget: noop,
  } as never), 80);
  await act(async () => {
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'lockscreen', settingId: 'lockscreen-pin' } }));
  });
  await settle(80);
}, 120_000);

afterAll(async () => {
  await cleanup();
});

const fill = (el: Element | null, v: string) => {
  const input = el as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const newFields = () => [...app.host.querySelectorAll('input[autocomplete="new-password"]')];
const saveButton = () => newFields()[0]?.closest('.os-viz-row')?.querySelector('.btn.primary') as HTMLButtonElement;
const statusText = () => [...app.host.querySelectorAll('[role=status]')].map((n) => n.textContent).join(' | ');

describe('Settings -> Lockscreen through main', () => {
  it('the first PIN is set in main and its recovery code shown once', async () => {
    await act(async () => {
      fill(newFields()[0] ?? null, '4826');
      fill(newFields()[1] ?? null, '4826');
    });
    await act(async () => saveButton().click());
    await settle(30);
    expect(setPin).toHaveBeenCalledWith(null, '4826');
    expect(app.host.querySelector('.lock3-recovery-code')?.textContent).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(JSON.parse(localStorage.getItem('jp-study-lockscreen-v1') ?? '{}').pinHash).toBe('scrypt1:a:b');
  });

  it('a change without the current passcode never reaches main', async () => {
    setPin.mockClear();
    await act(async () => {
      fill(newFields()[0] ?? null, '1111');
      fill(newFields()[1] ?? null, '1111');
    });
    await act(async () => saveButton().click());
    await settle(10);
    expect(setPin).not.toHaveBeenCalled();
    expect(statusText()).toContain('Enter your current passcode first.');
  });

  it('with the current passcode main gets (current, new)', async () => {
    await act(async () => fill(app.host.querySelector('input[autocomplete="current-password"]'), '4826'));
    await act(async () => saveButton().click());
    await settle(30);
    expect(setPin).toHaveBeenCalledWith('4826', '1111');
  });

  it('lock at launch turns on through main; off needs the current passcode first', async () => {
    const box = [...app.host.querySelectorAll('.os-check-row input[type=checkbox]')].find((x) =>
      /launch/i.test(x.closest('label')?.textContent ?? ''),
    ) as HTMLInputElement;
    await act(async () => box.click());
    await settle(20);
    expect(setEnabled).toHaveBeenLastCalledWith(true, undefined);
    setEnabled.mockClear();
    await act(async () => box.click());
    await settle(10);
    expect(setEnabled).not.toHaveBeenCalled();
    expect(statusText()).toContain('Enter your current passcode first.');
  });
});
