// @vitest-environment jsdom
/**
 * Settings -> Help -> Updates, third pass (upd3), the real panel against a stubbed
 * bridge: byte progress with Cancel, the paused / failed states that resume,
 * the restart warning listing every kind of unsaved work, release notes rendered
 * as safe Markdown (HTML stays text, only this project's GitHub links are links
 * and they open through main), "What's new" with its own notes and Dismiss, and
 * the update history. ARIA-audited throughout.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdatePanel from '../components/settings/pages/UpdatePanel';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import type { AppReleaseNotes, AppUpdateDetails, AppUpdateRestartResult } from '../../shared/appUpdate';
import { auditAria } from './helpers/ariaAudit';

const settings = { advancedMode: false, focusSettingId: null } as unknown as SettingsController;

let root: Root | null = null;
let host: HTMLDivElement;
let push: ((d: AppUpdateDetails) => void) | null = null;
const api = {
  appUpdateDetails: vi.fn<() => Promise<AppUpdateDetails>>(),
  appUpdateCheckNow: vi.fn<() => Promise<AppUpdateDetails>>(),
  appUpdateReleaseNotes: vi.fn<(opts?: { version?: string }) => Promise<AppReleaseNotes>>(),
  appUpdateRestart: vi.fn<(opts?: { force?: boolean }) => Promise<AppUpdateRestartResult>>(),
  appUpdateCancelDownload: vi.fn(async () => true),
  appUpdateOpenLink: vi.fn(async () => true),
  appUpdateWhatsNew: vi.fn<(action: 'announced' | 'dismissed') => Promise<AppUpdateDetails>>(),
  appUpdateSetPrefs: vi.fn(),
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
  lastCheckedAt: 1_700_000_000_000,
  history: [],
  whatsNew: null,
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
const MB = 1024 * 1024;

describe('update panel: own download', () => {
  it('shows real byte progress with a determinate bar, and Cancel asks main', async () => {
    await mount();
    await act(async () => push?.({
      ...base,
      state: 'downloading',
      latestVersion: '1.1.0',
      download: { phase: 'package', version: '1.1.0', received: 96 * MB, total: 384 * MB },
    }));
    const bar = host.querySelector('progress')!;
    expect(bar.getAttribute('max')).toBe(String(384 * MB));
    expect(bar.getAttribute('value')).toBe(String(96 * MB));
    expect(bar.getAttribute('aria-valuetext')).toContain('25%');
    expect(text()).toContain('Downloading Gum 1.1.0');
    expect(host.querySelector('.upd3-bytes')?.textContent).toMatch(/25%.*96.*MB.*384.*MB/);
    expect(text()).not.toContain('Downloading for');
    expect(auditAria(host)).toEqual([]);
    await act(async () => button('Cancel download')?.click());
    expect(api.appUpdateCancelDownload).toHaveBeenCalledTimes(1);

    // Verifying and unpacking cannot be cancelled.
    await act(async () => push?.({ ...base, state: 'downloading', download: { phase: 'installing', version: '1.1.0', received: 1, total: 1 } }));
    expect(text()).toContain('Unpacking Gum 1.1.0');
    expect(button('Cancel download')).toBeUndefined();
  });

  it('paused: says what is kept, and the button resumes', async () => {
    await mount();
    await act(async () => push?.({ ...base, state: 'idle', paused: { version: '1.1.0', received: 10 * MB, total: 40 * MB } }));
    expect(text()).toContain('The download of Gum 1.1.0 is paused');
    expect(host.querySelector('.upd3-paused')?.textContent).toMatch(/10.*MB.*40.*MB/);
    api.appUpdateCheckNow.mockResolvedValue({ ...base, state: 'downloading', download: { phase: 'manifest', version: '1.1.0', received: 0, total: null } });
    await act(async () => button('Resume download')?.click());
    expect(api.appUpdateCheckNow).toHaveBeenCalledTimes(1);
  });

  it('a failed download with bytes kept offers "Try again"', async () => {
    await mount();
    await act(async () => push?.({ ...base, state: 'error', error: 'network', partialBytes: 5 * MB }));
    expect(text()).toContain('Could not reach GitHub');
    expect(host.querySelector('.upd3-partial')?.textContent).toMatch(/5.*MB/);
    expect(button('Try again')?.disabled).toBe(false);
    await act(async () => push?.({ ...base, state: 'error', error: 'checksum' }));
    expect(text()).toContain('did not match its published checksum');
    expect(button('Check now')).toBeDefined();
  });

  it('restart lists everything a restart would cut short, then "Restart anyway" forces it', async () => {
    api.appUpdateRestart
      .mockResolvedValueOnce({ ok: false, reason: 'unsaved', unsaved: ['recording', 'note-editor', 'card-editor', 'review-session', 'ai-job'] })
      .mockResolvedValueOnce({ ok: true });
    await mount();
    await act(async () => push?.({ ...base, state: 'downloaded', version: '1.1.0' }));
    await act(async () => button('Restart to update')?.click());
    const alert = host.querySelector('.upd2-restart-warning')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect([...alert.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'the screen recording in progress',
      'a note you are editing that is not saved yet',
      'a card you are editing that is not saved yet',
      'the review session in progress',
      'an AI job that is still running',
    ]);
    expect(auditAria(host)).toEqual([]);
    await act(async () => button('Restart anyway')?.click());
    expect(api.appUpdateRestart).toHaveBeenLastCalledWith({ force: true });
    expect(host.querySelector('.upd2-restart-warning')).toBeNull();
  });
});

describe('update panel: notes, what is new, history', () => {
  const notes: AppReleaseNotes = {
    ok: true,
    version: '1.1.0',
    title: 'Gum 1.1.0',
    body: [
      '## Highlights',
      '- **Bold** and *italic* and `code`',
      '- [Issue 1](https://github.com/vasars2024-hub/jp-study-app/issues/1)',
      '- [Elsewhere](https://evil.example/phish)',
      '<script>alert("x")</script>',
    ].join('\n'),
    url: 'https://github.com/vasars2024-hub/jp-study-app/releases/tag/v1.1.0',
    truncated: false,
  };

  it('renders the safe subset; HTML stays text; only project links are links, opened through main', async () => {
    api.appUpdateReleaseNotes.mockResolvedValue(notes);
    await mount();
    await act(async () => button('Show release notes')?.click());
    const body = host.querySelector('.upd2-notes-body')!;
    expect(body.querySelector('h5')?.textContent).toBe('Highlights');
    expect(body.querySelector('ul li strong')?.textContent).toBe('Bold');
    expect(body.querySelector('em')?.textContent).toBe('italic');
    expect(body.querySelector('code')?.textContent).toBe('code');
    expect(body.querySelector('script')).toBeNull();
    expect(body.textContent).toContain('<script>alert("x")</script>');
    const links = [...body.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://github.com/vasars2024-hub/jp-study-app/issues/1']);
    expect(body.textContent).toContain('Elsewhere (https://evil.example/phish)');
    expect(auditAria(host)).toEqual([]);
    await act(async () => links[0]!.click());
    expect(api.appUpdateOpenLink).toHaveBeenCalledWith('https://github.com/vasars2024-hub/jp-study-app/issues/1');
    expect(api.openExternal).not.toHaveBeenCalled();
  });

  it('"What\'s new" fetches the running version\'s notes on the click and dismisses through main', async () => {
    api.appUpdateDetails.mockResolvedValue({ ...base, whatsNew: { version: '1.0.2', from: '1.0.1' } });
    api.appUpdateReleaseNotes.mockResolvedValue({ ...notes, version: '1.0.2' });
    api.appUpdateWhatsNew.mockResolvedValue({ ...base, whatsNew: null });
    await mount();
    expect(text()).toContain('What’s new in Gum 1.0.2');
    expect(text()).toContain('Gum was updated from 1.0.1 to 1.0.2.');
    expect(api.appUpdateReleaseNotes).not.toHaveBeenCalled();
    await act(async () => button('Show what’s new')?.click());
    expect(api.appUpdateReleaseNotes).toHaveBeenCalledWith({ version: '1.0.2' });
    expect(host.querySelector('.upd3-whats-new .upd2-notes-body h5')?.textContent).toBe('Highlights');
    expect(auditAria(host)).toEqual([]);
    await act(async () => button('Dismiss')?.click());
    expect(api.appUpdateWhatsNew).toHaveBeenCalledWith('dismissed');
    expect(host.querySelector('.upd3-whats-new')).toBeNull();
  });

  it('lists the update history newest first, marks the running version, and folds a long list', async () => {
    const history = Array.from({ length: 7 }, (_, i) => ({
      version: `1.0.${8 - i}`,
      at: Date.UTC(2026, 0, 10 - i),
      ...(i < 6 ? { from: `1.0.${7 - i}` } : {}),
    }));
    api.appUpdateDetails.mockResolvedValue({ ...base, current: '1.0.8', history });
    await mount();
    const items = () => [...host.querySelectorAll('.upd3-history-list li')].map((li) => li.textContent ?? '');
    expect(items()).toHaveLength(5);
    expect(items()[0]).toMatch(/^Gum 1\.0\.8, updated from 1\.0\.7 on .+ · running now$/);
    await act(async () => button('Show all 7 versions')?.click());
    expect(items()).toHaveLength(7);
    expect(items()[6]).toMatch(/^Gum 1\.0\.2, first started /);
    expect(auditAria(host)).toEqual([]);
  });
});
