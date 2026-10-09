// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the update panel in each
 * of its states, pushed the way main pushes them. The state line must be a
 * live region so "Checking", "Downloading" and "Ready" are announced.
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppUpdateDetails } from '../../shared/appUpdate';
import type { SettingsController } from '../components/settings/types';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

const base: AppUpdateDetails = {
  install: 'installed',
  state: 'idle',
  current: '1.0.2',
  channel: 'stable',
  feedUrl: 'https://example.invalid/releases/latest/download',
  lastCheckedAt: null,
};

let push: ((d: AppUpdateDetails) => void) | null = null;

beforeAll(() => {
  installJsdomShims();
  stubBridge({
    appUpdateDetails: base,
    appUpdateCheckNow: base,
    appUpdateReleaseNotes: { version: '1.0.3', notes: 'Fixes.' },
    onAppUpdateDetails: (cb: (d: AppUpdateDetails) => void) => {
      push = cb;
      return () => {
        push = null;
      };
    },
    releaseStatus: null,
    openExternal: vi.fn(),
  });
});

afterEach(async () => {
  await cleanup();
});

describe('update panel — axe-core', () => {
  it('every state, and the state line is announced', async () => {
    const { SettingsProvider } = await import('../components/settings/SettingsContext');
    const { default: UpdatePanel } = await import('../components/settings/pages/UpdatePanel');
    const settings = { advancedMode: false, focusSettingId: null } as unknown as SettingsController;
    const { host } = await mount(
      createElement(SettingsProvider, { value: settings }, createElement(UpdatePanel)),
      30,
    );
    const states: Partial<AppUpdateDetails>[] = [
      {},
      { state: 'checking' },
      { state: 'downloading', version: '1.0.3', progress: 0.42 } as unknown as Partial<AppUpdateDetails>,
      { state: 'downloaded', version: '1.0.3' },
      { state: 'error', error: 'net::ERR_INTERNET_DISCONNECTED' } as unknown as Partial<AppUpdateDetails>,
    ];
    const failures: string[] = [];
    for (const patch of states) {
      await act(async () => push?.({ ...base, ...patch }));
      await settle(10);
      for (const line of await a11yViolations(host)) failures.push(`${patch.state ?? 'idle'}: ${line}`);
    }
    expect(failures).toEqual([]);
    expect(
      host.querySelector('[role="status"], [aria-live="polite"], [aria-live="assertive"], [role="alert"]'),
      'a live region carries the update state',
    ).not.toBeNull();
  });
});
