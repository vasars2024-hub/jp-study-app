// @vitest-environment jsdom
/**
 * Settings -> Help -> Updates: the channel select, "Skip this version", why a
 * check failed (offline / GitHub's rate limit / test run), and the restart that
 * asks first when it would cut a recording short. The real panel, stubbed bridge.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdatePanel from '../components/settings/pages/UpdatePanel';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import type { AppUpdateDetails, AppUpdatePrefs, AppUpdateRestartResult } from '../../shared/appUpdate';
import type { ReleaseStatus } from '../../shared/release';
import { auditAria } from './helpers/ariaAudit';

const settings = { advancedMode: false, focusSettingId: null } as unknown as SettingsController;

const base: AppUpdateDetails = {
  install: 'portable',
  state: 'idle',
  current: '1.0.1',
  channel: 'stable',
  feedUrl: 'https://github.com/vasars2024-hub/jp-study-app/releases/latest/download',
  lastCheckedAt: null,
  skippedVersion: null,
};

let details: AppUpdateDetails = base;
const api = {
  appUpdateDetails: vi.fn(async () => details),
  appUpdateCheckNow: vi.fn(async () => details),
  appUpdateReleaseNotes: vi.fn(),
  appUpdateRestart: vi.fn<(opts?: { force?: boolean }) => Promise<AppUpdateRestartResult>>(),
  appUpdateSetPrefs: vi.fn(async (patch: Partial<AppUpdatePrefs>) => {
    details = { ...details, ...patch } as AppUpdateDetails;
    return details;
  }),
  onAppUpdateDetails: vi.fn(() => () => undefined),
  releaseStatus: vi.fn<() => Promise<ReleaseStatus>>(),
  openExternal: vi.fn(),
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  details = base;
  for (const fn of Object.values(api)) fn.mockClear();
  (window as unknown as { api: typeof api }).api = api;
});
afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <SettingsProvider value={settings}>
        <UpdatePanel />
      </SettingsProvider>,
    );
  });
}

const text = () => host.textContent ?? '';
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;

describe('update panel: channel, skip, failures, restart warning', () => {
  it('switches the channel through main and forgets the other channel\'s answer', async () => {
    api.releaseStatus.mockResolvedValue({ kind: 'current', current: '1.0.1', latest: '1.0.1', checkedAt: Date.now() });
    await mount();
    await act(async () => button('Check now')?.click());
    expect(text()).toContain('1.0.1');
    const select = host.querySelector('select.upd2-channel') as HTMLSelectElement;
    expect(select.value).toBe('stable');
    await act(async () => {
      select.value = 'beta';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(api.appUpdateSetPrefs).toHaveBeenCalledWith({ channel: 'beta' });
    expect((host.querySelector('select.upd2-channel') as HTMLSelectElement).value).toBe('beta');
    expect(text()).toContain('Beta gets pre-releases');
    expect(auditAria(host)).toEqual([]);
  });

  it('"Skip" records the version, hides the download link, and can be undone', async () => {
    api.releaseStatus.mockResolvedValue({
      kind: 'update', current: '1.0.1', latest: '1.1.0', url: 'https://github.com/vasars2024-hub/jp-study-app/releases/tag/v1.1.0', checkedAt: Date.now(),
    });
    await mount();
    await act(async () => button('Check now')?.click());
    expect(button('Open release page')).toBeDefined();
    await act(async () => button('Skip 1.1.0')?.click());
    expect(api.appUpdateSetPrefs).toHaveBeenCalledWith({ skippedVersion: '1.1.0' });
    expect(text()).toContain('You chose to skip this version');
    expect(button('Open release page')).toBeUndefined();
    expect(button('Skip 1.1.0')).toBeUndefined();
    await act(async () => button('Stop skipping')?.click());
    expect(api.appUpdateSetPrefs).toHaveBeenLastCalledWith({ skippedVersion: null });
    expect(button('Skip 1.1.0')).toBeDefined();
  });

  it.each([
    [{ reason: 'offline' }, 'Could not reach GitHub'],
    [{ reason: 'rate-limited', retryAt: Date.now() + 30 * 60_000 }, 'GitHub is limiting requests from your network right now. Try again after'],
    [{ reason: 'rate-limited' }, 'Try again in an hour'],
    [{ reason: 'invalid' }, 'did not describe a release'],
    [{ reason: 'disabled' }, 'switched off in this test run'],
  ] as const)('says why a check failed: %o', async (extra, expected) => {
    api.releaseStatus.mockResolvedValue({ kind: 'unavailable', current: '1.0.1', checkedAt: Date.now(), ...extra });
    await mount();
    await act(async () => button('Check now')?.click());
    expect(text()).toContain(expected);
  });

  it('restart asks first when it would cut a recording short, then restarts on "Restart anyway"', async () => {
    details = { ...base, install: 'installed', state: 'downloaded', version: '1.1.0' };
    api.appUpdateRestart.mockImplementation(async (opts) =>
      opts?.force ? { ok: true } : { ok: false, reason: 'unsaved', unsaved: ['recording'] });
    await mount();
    await act(async () => button('Restart to update')?.click());
    expect(api.appUpdateRestart).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('the screen recording in progress');
    expect(auditAria(host)).toEqual([]);
    await act(async () => button('Restart anyway')?.click());
    expect(api.appUpdateRestart).toHaveBeenLastCalledWith({ force: true });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
