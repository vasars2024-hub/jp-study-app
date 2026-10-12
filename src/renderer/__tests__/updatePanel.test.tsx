// @vitest-environment jsdom
/**
 * Settings -> Help -> Updates (upd2), the real panel against a stubbed bridge:
 * the facts (version, copy, channel, last check), each updater state as main
 * pushes it, "Restart to update", release notes fetched only on the click and
 * shown as plain text, the privacy line, and the ARIA contract.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdatePanel from '../components/settings/pages/UpdatePanel';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import type { AppReleaseNotes, AppUpdateDetails } from '../../shared/appUpdate';
import { auditAria } from './helpers/ariaAudit';

const settings = { advancedMode: false, focusSettingId: null } as unknown as SettingsController;

let root: Root | null = null;
let host: HTMLDivElement;
let push: ((d: AppUpdateDetails) => void) | null = null;
const api = {
  appUpdateDetails: vi.fn<() => Promise<AppUpdateDetails>>(),
  appUpdateCheckNow: vi.fn<() => Promise<AppUpdateDetails>>(),
  appUpdateReleaseNotes: vi.fn<() => Promise<AppReleaseNotes>>(),
  appUpdateRestart: vi.fn(async () => true),
  onAppUpdateDetails: vi.fn((cb: (d: AppUpdateDetails) => void) => {
    push = cb;
    return () => {
      push = null;
    };
  }),
  releaseStatus: vi.fn(),
  openExternal: vi.fn(),
};

const base: AppUpdateDetails = {
  install: 'installed',
  state: 'idle',
  current: '1.0.2',
  channel: 'stable',
  feedUrl: 'https://github.com/vasars2024-hub/jp-study-app/releases/latest/download',
  lastCheckedAt: null,
};

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockClear();
  api.appUpdateDetails.mockResolvedValue(base);
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

describe('update panel', () => {
  it('shows the facts and touches no network on open', async () => {
    await mount();
    expect(text()).toContain('1.0.2');
    expect(text()).toContain('Installed (updates itself)');
    expect(text()).toContain('Stable (GitHub releases)');
    expect(text()).toContain('Not yet');
    expect(text()).toContain('Gum checks for updates a minute after it starts');
    expect(text()).toContain('Privacy:');
    expect(api.appUpdateReleaseNotes).not.toHaveBeenCalled();
    expect(api.releaseStatus).not.toHaveBeenCalled();
    expect(auditAria(host)).toEqual([]);
  });

  it('follows the states main pushes: downloading (indeterminate) -> ready -> restart', async () => {
    await mount();
    await act(async () => push?.({ ...base, state: 'downloading', downloadStartedAt: Date.now() - 3 * 60_000 }));
    const bar = host.querySelector('progress');
    expect(bar).not.toBeNull();
    expect(bar?.hasAttribute('value')).toBe(false);
    expect(text()).toContain('Downloading for 3 minutes');
    expect(button('Check now')?.disabled).toBe(true);
    expect(auditAria(host)).toEqual([]);

    await act(async () => push?.({ ...base, state: 'downloaded', version: '1.0.3' }));
    expect(text()).toContain('Gum 1.0.3 has downloaded');
    expect(host.querySelector('progress')).toBeNull();
    await act(async () => button('Restart to update')?.click());
    expect(api.appUpdateRestart).toHaveBeenCalledTimes(1);
  });

  it('an error is shown translated, and Check now asks main', async () => {
    api.appUpdateCheckNow.mockResolvedValue({ ...base, state: 'checking', lastCheckedAt: Date.now() });
    await mount();
    await act(async () => push?.({ ...base, state: 'error', error: 'no-feed' }));
    expect(text()).toContain('The latest release has no installer update files yet');
    await act(async () => button('Check now')?.click());
    expect(api.appUpdateCheckNow).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Checking for updates');
  });

  it('release notes are fetched on the click only, and rendered as text', async () => {
    api.appUpdateReleaseNotes.mockResolvedValue({
      ok: true,
      version: '1.0.3',
      title: 'v1.0.3',
      body: '- faster <b>sync</b>\n- fixes',
      url: 'https://github.com/vasars2024-hub/jp-study-app/releases/tag/v1.0.3',
      truncated: false,
    });
    await mount();
    const show = button('Show release notes');
    expect(show?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => show?.click());
    expect(api.appUpdateReleaseNotes).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Release notes: v1.0.3');
    // Markdown/HTML in the body is text, never markup.
    expect(host.querySelector('.upd2-notes-body b')).toBeNull();
    expect(host.querySelector('.upd2-notes-body')?.textContent).toContain('<b>sync</b>');
    expect(button('Hide release notes')?.getAttribute('aria-expanded')).toBe('true');
    expect(auditAria(host)).toEqual([]);
  });

  it('says it is checking until main answers — never "Development build" or "Unknown" first (risk4)', async () => {
    let answer: ((d: AppUpdateDetails) => void) | null = null;
    api.appUpdateDetails.mockImplementation(() => new Promise<AppUpdateDetails>((resolve) => (answer = resolve)));
    await mount();
    expect(text()).toContain('Checking version');
    expect(text()).not.toContain('Development build');
    expect(text()).not.toContain('Unknown');
    expect(host.querySelector('.upd2-facts')?.getAttribute('aria-busy')).toBe('true');
    expect(button('Check now')?.disabled).toBe(true);
    expect(auditAria(host)).toEqual([]);
    await act(async () => answer?.({ ...base, install: 'dev' }));
    expect(text()).not.toContain('Checking version');
    expect(text()).toContain('Development build');
    expect(host.querySelector('.upd2-facts')?.getAttribute('aria-busy')).toBe('false');
  });

  it('a failed details call shows an error with a retry that asks again (risk4)', async () => {
    api.appUpdateDetails.mockRejectedValueOnce(new Error('ipc gone'));
    await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not read this copy');
    expect(text()).not.toContain('Development build');
    expect(text()).not.toContain('Checking version');
    expect(auditAria(host)).toEqual([]);
    await act(async () => button('Try again')?.click());
    expect(api.appUpdateDetails).toHaveBeenCalledTimes(2);
    expect(text()).toContain('1.0.2');
    expect(text()).toContain('Installed (updates itself)');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('a details call that never answers turns into the error state (risk4)', async () => {
    vi.useFakeTimers();
    try {
      api.appUpdateDetails.mockImplementation(() => new Promise<AppUpdateDetails>(() => undefined));
      await mount();
      expect(text()).toContain('Checking version');
      await act(async () => {
        vi.advanceTimersByTime(16_000);
      });
      expect(button('Try again')).toBeDefined();
      expect(text()).not.toContain('Development build');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a portable copy checks GitHub only when asked', async () => {
    api.appUpdateDetails.mockResolvedValue({ ...base, install: 'portable' });
    api.releaseStatus.mockResolvedValue({ kind: 'update', current: '1.0.1', latest: '1.0.3', url: 'https://x', checkedAt: Date.now() });
    await mount();
    expect(text()).toContain('This copy cannot update itself');
    expect(api.releaseStatus).not.toHaveBeenCalled();
    await act(async () => button('Check now')?.click());
    expect(api.releaseStatus).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Version 1.0.3 is available (you have 1.0.1).');
    expect(button('Open release page')).toBeDefined();
  });
});
