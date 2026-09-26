// @vitest-environment jsdom
/**
 * Round 3 "no ugly boxes" — Settings.
 *
 * Settings pages used native checkboxes for on/off preferences, `unified-search-controls`
 * fieldsets (no stylesheet: a UA groove box inside the setting card), rows whose class
 * `os-set-toggle-row` had no stylesheet (title, caption and checkbox run together inline),
 * and bare grey buttons and native selects. These render the pages and check the shared
 * primitives are what the user now gets, and that they still drive the same preference.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import { segButton } from '../components/ui/segButton';

vi.mock('../externalPlayerStore', () => ({
  loadExternalPlayerPreferences: () => ({ profiles: [], defaultProfileId: null, contentTypeProfileIds: {}, lastUsedProfileId: null }),
  saveExternalPlayerPreferences: (value: unknown) => value,
  commitExternalPlayerPreferences: async (value: unknown) => ({ preferences: value, rejected: [] }),
  hydrateExternalPlayerPreferences: async () => ({ profiles: [], defaultProfileId: null, contentTypeProfileIds: {}, lastUsedProfileId: null }),
  onExternalPlayerPreferencesChanged: () => () => undefined,
}));

const settings = { advancedMode: false, seg: segButton } as unknown as SettingsController;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const api = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop.startsWith('on')) return () => () => undefined;
        return () => Promise.resolve(null);
      },
    },
  );
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

async function mount(node: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<SettingsProvider value={settings}>{node}</SettingsProvider>);
  });
}

describe('Settings on/off preferences', () => {
  it('File drops uses the design-system switch and it still writes the preference', async () => {
    const { default: FileDropsPage } = await import('../components/settings/pages/FileDropsPage');
    await mount(<FileDropsPage />);
    const switches = [...host.querySelectorAll<HTMLInputElement>('label.ui-toggle input[role="switch"]')];
    expect(switches.length).toBeGreaterThanOrEqual(2);
    expect(host.querySelector('input[type="checkbox"]:not([role="switch"])'), 'no bare OS checkbox').toBeNull();
    // Every button on the page is a styled one (the reset button's class had no CSS).
    for (const button of host.querySelectorAll('button')) {
      expect(button.className, button.textContent ?? '').not.toBe('');
      expect(button.classList.contains('os-btn')).toBe(false);
    }
    const before = switches[0].checked;
    await act(async () => switches[0].click());
    expect(switches[0].checked).toBe(!before);
  });
});

describe('External player profile form', () => {
  it('groups without a frame and shows the capability rows as switch rows', async () => {
    const { default: ExternalPlayerPanel } = await import('../components/settings/pages/ExternalPlayerPanel');
    await mount(<ExternalPlayerPanel />);
    const add = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Add player');
    await act(async () => add?.click());
    const group = host.querySelector('fieldset.ui-group');
    expect(group, 'the form is a Group').toBeTruthy();
    expect(group?.querySelector('legend.ui-group__title')?.textContent).toBe('Add player');
    expect(host.querySelector('.unified-search-controls')).toBeNull();
    const rows = [...host.querySelectorAll('label.ui-switch-row')];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const input = row.querySelector<HTMLInputElement>('input.ui-switch[role="switch"]');
      expect(input).toBeTruthy();
      const desc = document.getElementById(input?.getAttribute('aria-describedby') ?? '');
      expect(desc?.classList.contains('ui-switch-row__desc')).toBe(true);
    }
    // No bare native select or button left in the form.
    for (const select of host.querySelectorAll('select')) expect(select.className).not.toBe('');
    expect(host.querySelector('#external-type')?.classList.contains('ui-select'), 'the type picker is the ui Select').toBe(true);
    for (const button of host.querySelectorAll('button')) expect(button.className).not.toBe('');
  });
});
