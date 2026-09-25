// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MonitorsPage from '../components/settings/pages/MonitorsPage';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import { ensureCatalog } from '../../shared/i18n/catalogs';
import { getUiLang, setUiLang } from '../i18n';

/**
 * Settings ▸ Display & monitors named a monitor "display-193337900" — the
 * fingerprint fallback for a monitor the OS reports no name for. Main now sends
 * '' for such a monitor; the page shows the OS name when there is one and a
 * translated, numbered "Display N" otherwise.
 */

vi.mock('../components/ui', () => ({ confirmDialog: vi.fn(async () => true) }));

const DISPLAYS = [
  {
    id: 193337900,
    key: 'display-193337900|1280x720|1.5',
    label: '',
    bounds: { x: 0, y: 0, width: 1280, height: 720 },
    workArea: { x: 0, y: 0, width: 1280, height: 672 },
    primary: true,
    scaleFactor: 1.5,
    virtual: false,
  },
  {
    id: 2,
    key: 'dell-u2419h|1920x1080|1',
    label: 'DELL U2419H',
    bounds: { x: 853, y: 0, width: 1920, height: 1080 },
    workArea: { x: 853, y: 0, width: 1920, height: 1040 },
    primary: false,
    scaleFactor: 1,
    virtual: false,
  },
  {
    id: 7,
    key: 'display-7|1920x1080|1',
    label: '',
    bounds: { x: 2773, y: 0, width: 1920, height: 1080 },
    workArea: { x: 2773, y: 0, width: 1920, height: 1040 },
    primary: false,
    scaleFactor: 1,
    virtual: false,
  },
];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      displayList: async () => DISPLAYS,
      displayGetVirtualCount: async () => 0,
      onDisplaysChanged: () => () => undefined,
    },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  await switchLang('en');
});

async function switchLang(lang: 'en' | 'ru'): Promise<void> {
  // Load the chunk first: `setUiLang` only switches once it has resolved.
  await ensureCatalog(lang);
  await act(async () => {
    setUiLang(lang);
    await vi.waitFor(() => expect(getUiLang()).toBe(lang));
  });
}

async function mount(): Promise<string[]> {
  const ctrl = { seg: () => ({ className: 'os-seg' }), focusSettingId: null } as unknown as SettingsController;
  await act(async () =>
    root.render(
      <SettingsProvider value={ctrl}>
        <MonitorsPage />
      </SettingsProvider>,
    ),
  );
  return titles();
}

function titles(): string[] {
  // The title's own text, without the Primary / Simulated tags inside it.
  return [...host.querySelectorAll('.os-monitor-title')].map((el) => el.childNodes[0]?.textContent ?? '');
}

describe('Settings ▸ Display & monitors display names', () => {
  it('shows the OS name, and numbers unnamed monitors by position', async () => {
    expect(await mount()).toEqual(['Display 1', 'DELL U2419H', 'Display 3']);
    expect(host.textContent).not.toMatch(/display-\d+/);
  });

  it('translates the numbered name', async () => {
    await mount();
    await switchLang('ru');
    expect(titles()).toEqual(['Дисплей 1', 'DELL U2419H', 'Дисплей 3']);
  });
});
