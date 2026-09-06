// @vitest-environment node
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings -> Monitors and Settings -> File drops.
 *
 * A settings page that renders is not the same as a settings page that is
 * *reachable and wired*: this repo has shipped pages whose controls were real
 * but whose keys were never in a catalog, and whose nav entry pointed at an id
 * `SettingsApp` did not render. So these assertions check the wiring, not just
 * the markup — every rendered i18n key must exist in the English catalog, and
 * both page ids must be routed.
 */

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

// Key-echoing `t`, so the markup contains the raw keys and they can be checked
// against the catalog. Interpolation is preserved so a missing var is visible.
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}(${Object.keys(vars).sort().join(',')})` : key,
    lang: 'en',
  }),
}));

vi.mock('../components/settings/SettingsCard', () => ({
  default: ({ id, title, children }: { id?: string; title?: string; children?: ReactNode }) =>
    createElement('section', { 'data-setting-id': id, 'data-title': title }, children),
}));

vi.mock('../components/settings/SettingsContext', () => ({
  useSettings: () => ({
    seg: (active: boolean) => (active ? 'os-seg active' : 'os-seg'),
    focusSettingId: null,
  }),
}));

vi.mock('../components/Icons', () => ({
  default: ({ name }: { name: string }) => createElement('i', { 'data-icon': name }),
}));

const DISPLAYS = [
  {
    id: 1,
    key: 'primary-panel|1920x1080|1',
    label: 'Primary Panel',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    primary: true,
    scaleFactor: 1,
    virtual: false,
  },
  {
    id: 2,
    key: 'second-panel|1280x720|2',
    label: 'Second Panel',
    bounds: { x: 1920, y: 0, width: 1280, height: 720 },
    workArea: { x: 1920, y: 0, width: 1280, height: 690 },
    primary: false,
    scaleFactor: 2,
    virtual: false,
  },
  {
    id: -1,
    key: 'simulated-1|960x1040|1',
    label: 'Simulated 1',
    bounds: { x: 960, y: 0, width: 960, height: 1040 },
    workArea: { x: 960, y: 0, width: 960, height: 1040 },
    primary: false,
    scaleFactor: 1,
    virtual: true,
  },
];

function stubApi(over: Record<string, unknown> = {}): void {
  vi.stubGlobal('window', {
    api: {
      displayList: async () => DISPLAYS,
      displayGetVirtualCount: async () => 1,
      displaySetVirtualCount: async () => DISPLAYS,
      onDisplaysChanged: () => () => undefined,
      deskwinSetOptions: async () => ({ ok: true }),
      deskwinAssign: async () => ({ ok: true }),
      deskwinSync: async () => [],
      desktopResetAssignments: async () => ({}),
      ...over,
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  });
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('MonitorsPage', () => {
  it('renders its four cards', async () => {
    const { default: MonitorsPage } = await import('../components/settings/pages/MonitorsPage');
    const html = renderToStaticMarkup(createElement(MonitorsPage));
    for (const id of ['monitors-list', 'monitors-layout-remap', 'monitors-simulated', 'monitors-reset']) {
      expect(html).toContain(`data-setting-id="${id}"`);
    }
  });

  it('renders no raw English — every label is an i18n key', async () => {
    const { default: MonitorsPage } = await import('../components/settings/pages/MonitorsPage');
    const html = renderToStaticMarkup(createElement(MonitorsPage));
    // With a key-echoing `t`, any literal sentence in the markup is a string
    // that skipped the catalog.
    expect(html).toContain('settings.monitors.displays');
    expect(html).not.toMatch(/>Connected displays</);
    expect(html).not.toMatch(/>Simulated displays</);
  });

  it('every key it renders exists in the English catalog', async () => {
    const { default: MonitorsPage } = await import('../components/settings/pages/MonitorsPage');
    const html = renderToStaticMarkup(createElement(MonitorsPage));
    const { en } = await import('../../shared/i18n/catalogs/en');
    const keys = [...html.matchAll(/\b(settings\.monitors\.[a-zA-Z.]+?)(?:\(|["<\s])/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(8);
    const missing = [...new Set(keys)].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  /**
   * The per-display rows are NOT asserted here, deliberately.
   *
   * `renderToStaticMarkup` runs no effects, so `window.api.displayList()` never
   * resolves and the display array is empty at render time. A test written
   * against those rows would pass on empty markup and prove nothing — the
   * fixture cannot fail, so the pass would carry no information. Row behaviour
   * is covered where it can actually fail: `desktopWindows.test.ts` for the
   * reconcile logic, and a live run through `jp-bridge` for the markup.
   */
  it('shows the empty state when no displays have resolved yet', async () => {
    const { default: MonitorsPage } = await import('../components/settings/pages/MonitorsPage');
    const html = renderToStaticMarkup(createElement(MonitorsPage));
    expect(html).toContain('settings.monitors.none');
  });

  it('uses no <input type="range">, so it adds no unnamed sliders', async () => {
    const { default: MonitorsPage } = await import('../components/settings/pages/MonitorsPage');
    const html = renderToStaticMarkup(createElement(MonitorsPage));
    expect(html).not.toContain('type="range"');
  });
});

describe('FileDropsPage', () => {
  it('renders its four cards', async () => {
    const { default: FileDropsPage } = await import('../components/settings/pages/FileDropsPage');
    const html = renderToStaticMarkup(createElement(FileDropsPage));
    for (const id of ['filedrop-auto', 'filedrop-overrides', 'filedrop-undo', 'filedrop-reset']) {
      expect(html).toContain(`data-setting-id="${id}"`);
    }
  });

  it('offers an override only for extensions that are genuinely ambiguous', async () => {
    const { default: FileDropsPage } = await import('../components/settings/pages/FileDropsPage');
    const html = renderToStaticMarkup(createElement(FileDropsPage));
    for (const ext of ['.zip', '.apkg', '.json']) {
      expect(html).toContain(ext);
    }
    // .epub and .mkv have exactly one home; listing them would imply a choice
    // the app does not actually have.
    expect(html).not.toContain('.epub');
    expect(html).not.toContain('.mkv');
  });

  it('every key it renders exists in the English catalog', async () => {
    const { default: FileDropsPage } = await import('../components/settings/pages/FileDropsPage');
    const html = renderToStaticMarkup(createElement(FileDropsPage));
    const { en } = await import('../../shared/i18n/catalogs/en');
    const keys = [...html.matchAll(/\b((?:settings\.fileDrops|fileDrop\.target)\.[a-zA-Z-]+?)(?:\(|["<\s])/g)].map(
      (m) => m[1],
    );
    expect(keys.length).toBeGreaterThan(8);
    const missing = [...new Set(keys)].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });
});

describe('settings wiring', () => {
  it('both pages are in the nav registry under System', async () => {
    const { SETTINGS_NAV } = await import('../components/settings/settingsRegistry');
    // v1.0 audit 5.2 merged Monitors INTO Display, so `display` is the row that
    // now answers for the monitor cards. `monitors` is asserted ABSENT below
    // rather than simply dropped from this loop: a reappearing row would mean
    // the two near-identical System entries are back.
    for (const id of ['display', 'file-drops']) {
      const entry = SETTINGS_NAV.find((p) => p.id === id);
      expect(entry, `${id} missing from SETTINGS_NAV`).toBeDefined();
      expect(entry?.group).toBe('System');
      expect(entry?.labelKey).toBeTruthy();
    }
    expect(
      SETTINGS_NAV.find((p) => p.id === 'monitors'),
      'monitors is back in SETTINGS_NAV — audit 5.2 merged it into display',
    ).toBeUndefined();
  });

  it('their nav labels resolve in the catalog', async () => {
    const { SETTINGS_NAV } = await import('../components/settings/settingsRegistry');
    const { en } = await import('../../shared/i18n/catalogs/en');
    for (const id of ['display', 'file-drops']) {
      const entry = SETTINGS_NAV.find((p) => p.id === id);
      expect(entry?.labelKey && entry.labelKey in en).toBe(true);
      expect(entry?.descKey && entry.descKey in en).toBe(true);
    }
    // The merged page has to SAY it holds monitors, or the only way to find them
    // is to already know they moved. This is also what lets the agent index keep
    // matching 'monitors'/'screens'/'desktops' on this destination — its mirror
    // test allows only words the destination's own label and description use.
    const label = `${en['settings.nav.display']} ${en['settings.nav.display.desc']}`.toLowerCase();
    for (const word of ['monitors', 'screens', 'desktops']) {
      expect(label, `"${word}" is not a word of the merged Display page`).toContain(word);
    }
  });

  it('a nav entry without a render branch is a dead page — both are routed', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/renderer/components/settings/SettingsApp.tsx', 'utf8');
    expect(src).toContain("page === 'file-drops'");
    // `monitors` must NOT have a branch — but it must still resolve, or every
    // stored recent page, deep link and agent route carrying it dead-ends.
    expect(src).not.toContain("page === 'monitors'");
    expect(src).toContain("next === 'monitors' ? 'display'");
    // ...and the cards themselves have to actually be on that page. DisplayPage
    // composing MonitorsPage is what makes the redirect land on something.
    const display = fs.readFileSync(
      'src/renderer/components/settings/pages/DisplayPage.tsx',
      'utf8',
    );
    expect(display).toContain("from './MonitorsPage'");
    expect(display).toContain('<MonitorsPage />');
  });

  it('the new prefs key is registered for backup', async () => {
    // An unregistered localStorage key cannot be exported or cleared from
    // Memory & storage, which is how a setting silently escapes backups.
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/renderer/storage/settingsCatalog.ts', 'utf8');
    expect(src).toContain('jp-os-filedrop-prefs-v1');
  });
});
