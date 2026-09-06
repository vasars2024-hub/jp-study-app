// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DisplayPage from '../components/settings/pages/DisplayPage';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import { loadDisplayPrefs, saveDisplayPrefs } from '../displayPrefs';
import { getRecentPages, pushRecentPage } from '../components/settings/settingsRecent';

vi.mock('../components/ui', () => ({ confirmDialog: vi.fn(async () => true) }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  Object.defineProperty(window, 'api', { configurable: true, value: {
    displayList: async () => [],
    displayGetVirtualCount: async () => 0,
    onDisplaysChanged: () => () => undefined,
  } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function remapCheckbox(): HTMLInputElement {
  const checkbox = host.querySelector<HTMLInputElement>('[data-setting-id="monitors-layout-remap"] input');
  if (!checkbox) throw new Error('Missing monitor layout control');
  return checkbox;
}

describe('merged Display and Monitors preferences', () => {
  async function mount() {
    const ctrl = { zoom: 1, setZoomValue: vi.fn(), bumpZoomBy: vi.fn(), seg: () => 'btn',
      focusSettingId: null, advancedMode: true } as unknown as SettingsController;
    await act(async () => root.render(
      <SettingsProvider value={ctrl}><DisplayPage /></SettingsProvider>,
    ));
  }

  it('reflects a confirmed Display reset in the still-mounted monitor checkbox', async () => {
    await mount();
    expect(remapCheckbox().checked).toBe(true);
    await act(async () => remapCheckbox().click());
    expect(remapCheckbox().checked).toBe(false);
    expect(loadDisplayPrefs().remapLayoutProportionally).toBe(false);
    const reset = host.querySelector<HTMLButtonElement>('[data-setting-id="display-reset"] button');
    if (!reset) throw new Error('Missing Display reset');
    await act(async () => reset.click());
    expect(loadDisplayPrefs().remapLayoutProportionally).toBe(true);
    expect(remapCheckbox().checked).toBe(true);
    // Reverse again through the same control: the UI must remain connected.
    await act(async () => remapCheckbox().click());
    expect(loadDisplayPrefs().remapLayoutProportionally).toBe(false);
    expect(remapCheckbox().checked).toBe(false);
  });

  it('reflects changes from another preference owner in both directions', async () => {
    await mount();
    await act(async () => { saveDisplayPrefs({ remapLayoutProportionally: false }); });
    expect(remapCheckbox().checked).toBe(false);
    await act(async () => { saveDisplayPrefs({ remapLayoutProportionally: true }); });
    expect(remapCheckbox().checked).toBe(true);
  });
});

describe('legacy monitor history', () => {
  it('resolves and deduplicates old entries without writing on read', () => {
    const raw = JSON.stringify({ pages: ['monitors', 'study', 'display'], queries: ['screens'] });
    localStorage.setItem('jp-os-settings-recent-v1', raw);
    expect(getRecentPages()).toEqual(['display', 'study']);
    expect(localStorage.getItem('jp-os-settings-recent-v1')).toBe(raw);
    pushRecentPage('monitors');
    expect(JSON.parse(localStorage.getItem('jp-os-settings-recent-v1') ?? '{}'))
      .toEqual({ pages: ['display', 'study'], queries: ['screens'] });
  });
});
