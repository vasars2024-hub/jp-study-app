// @vitest-environment jsdom
/**
 * R8 and the update switches, against a stubbed bridge:
 *  - Settings -> Help -> Diagnostics: "Keep crash reports on this PC" (off by
 *    default, never uploaded) and "Save problem report…" (main writes a redacted
 *    zip where the user picks; the zip itself is tested in problemReport.test.ts);
 *  - Settings -> Help -> Updates: "Check for updates automatically" and
 *    "Pause updates for 7 days" reach main through `appUpdateSetPrefs`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsCard } from '../components/settings/pages/DiagnosticsCard';
import UpdatePanel from '../components/settings/pages/UpdatePanel';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import type { AppUpdateDetails, AppUpdatePrefs } from '../../shared/appUpdate';
import { ensureUiPack } from '../i18n';

const settings = { advancedMode: false, focusSettingId: null } as unknown as SettingsController;

let root: Root | null = null;
let host: HTMLDivElement;

const base: AppUpdateDetails = {
  install: 'installed',
  state: 'idle',
  current: '1.0.2',
  channel: 'stable',
  feedUrl: 'https://example.invalid/feed',
  lastCheckedAt: null,
  autoCheck: true,
};

let details: AppUpdateDetails = base;
const api = {
  diagnosticsRecent: vi.fn(async () => []),
  diagnosticsSummary: vi.fn(async () => ({})),
  diagnosticsOpenLogFolder: vi.fn(async () => ''),
  diagnosticsCrashReports: vi.fn(async () => ({ enabled: false, active: false, dumps: 0 })),
  diagnosticsSetCrashReports: vi.fn(async (enabled: boolean) => ({ enabled, active: enabled, dumps: 0 })),
  diagnosticsSaveProblemReport: vi.fn(async () => ({ ok: true as const, file: 'D:\\reports\\gum-problem-report-2026-10-15-0412.zip', files: ['report.txt'] })),
  diagnosticsShowProblemReport: vi.fn(async () => true),
  appUpdateDetails: vi.fn(async () => details),
  appUpdateSetPrefs: vi.fn(async (patch: Partial<AppUpdatePrefs>) => {
    details = {
      ...details,
      ...(patch.autoCheck !== undefined ? { autoCheck: patch.autoCheck } : {}),
      ...(patch.pausedUntil !== undefined ? (patch.pausedUntil === null ? { pausedUntil: undefined } : { pausedUntil: patch.pausedUntil }) : {}),
    };
    return details;
  }),
  onAppUpdateDetails: vi.fn(() => () => undefined),
  releaseStatus: vi.fn(),
  openExternal: vi.fn(),
};

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await ensureUiPack('upd3');
});
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockClear();
  details = base;
  (window as unknown as { api: typeof api }).api = api;
});
afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function mount(node: React.ReactNode): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<SettingsProvider value={settings}>{node}</SettingsProvider>);
  });
}

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
};

describe('Diagnostics: local crash reports and the problem report', () => {
  it('crash reports are off by default; the switch turns them on in main', async () => {
    await mount(<DiagnosticsCard />);
    const box = host.querySelector('.diag-crash-reports input[type=checkbox]') as HTMLInputElement;
    expect(box).not.toBeNull();
    expect(box.checked).toBe(false);
    expect(host.textContent).toContain('Keep crash reports on this PC');
    expect(host.textContent).toContain('Nothing is ever sent anywhere');
    await click(box);
    expect(api.diagnosticsSetCrashReports).toHaveBeenCalledWith(true);
    expect((host.querySelector('.diag-crash-reports input[type=checkbox]') as HTMLInputElement).checked).toBe(true);
  });

  it('turning them off while running says it applies from the next start', async () => {
    api.diagnosticsCrashReports.mockResolvedValueOnce({ enabled: true, active: true, dumps: 1 });
    api.diagnosticsSetCrashReports.mockResolvedValueOnce({ enabled: false, active: true, dumps: 1 });
    await mount(<DiagnosticsCard />);
    await click(host.querySelector('.diag-crash-reports input[type=checkbox]'));
    expect(api.diagnosticsSetCrashReports).toHaveBeenCalledWith(false);
    expect(host.querySelector('.diag-crash-restart')?.textContent).toMatch(/next time Gum starts/);
  });

  it('"Save problem report…" asks main with a translated dialog title, then offers "Show in folder"', async () => {
    await mount(<DiagnosticsCard />);
    await click(button('Save problem report…'));
    expect(api.diagnosticsSaveProblemReport).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Save problem report', ui: expect.objectContaining({ lang: 'en' }) }),
    );
    expect(host.querySelector('.diag-report-status')?.textContent).toContain('gum-problem-report-2026-10-15-0412.zip');
    await click(button('Show in folder'));
    expect(api.diagnosticsShowProblemReport).toHaveBeenCalledWith('D:\\reports\\gum-problem-report-2026-10-15-0412.zip');
  });

  it('a cancelled dialog says nothing; a failure says so', async () => {
    api.diagnosticsSaveProblemReport.mockResolvedValueOnce({ ok: false, reason: 'canceled' } as never);
    await mount(<DiagnosticsCard />);
    await click(button('Save problem report…'));
    expect(host.querySelector('.diag-report-status')).toBeNull();
    api.diagnosticsSaveProblemReport.mockResolvedValueOnce({ ok: false, reason: 'failed' } as never);
    await click(button('Save problem report…'));
    expect(host.querySelector('.diag-report-status')?.textContent).toBe('The problem report could not be saved.');
  });
});

describe('Updates: automatic checks and pause', () => {
  it('the switch turns automatic checks off and on; the pause shows its end and resumes', async () => {
    await mount(<UpdatePanel />);
    const box = () => host.querySelector('.upd3-auto input[type=checkbox]') as HTMLInputElement;
    expect(box().checked).toBe(true);
    await click(box());
    expect(api.appUpdateSetPrefs).toHaveBeenLastCalledWith({ autoCheck: false });
    expect(box().checked).toBe(false);
    expect(host.querySelector('.upd3-pause')).toBeNull();
    await click(box());
    expect(api.appUpdateSetPrefs).toHaveBeenLastCalledWith({ autoCheck: true });

    const before = Date.now();
    expect(host.querySelector('.upd3-pause')?.textContent).toBe('Pause updates for 7 days');
    await click(host.querySelector('.upd3-pause'));
    const sent = api.appUpdateSetPrefs.mock.lastCall?.[0] as { pausedUntil: number };
    expect(sent.pausedUntil).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
    expect(host.querySelector('.upd3-paused-until')?.textContent).toMatch(/Updates are paused until/);
    await click(button('Resume updates'));
    expect(api.appUpdateSetPrefs).toHaveBeenLastCalledWith({ pausedUntil: null });
    expect(host.querySelector('.upd3-paused-until')).toBeNull();
  });
});
