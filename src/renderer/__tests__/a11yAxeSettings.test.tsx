// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over Settings: the whole app
 * on Home, then every page in the rail, reached through `settings:navigate`
 * the way deep links reach them. Advanced Mode is on so every card renders.
 */
import { act, createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SETTINGS_NAV } from '../components/settings/settingsRegistry';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge, type Mounted } from './helpers/axeHarness';

vi.mock('../components/AnkiSetup', () => ({ default: () => <div className="anki-setup-stub" /> }));

let app: Mounted;

beforeAll(async () => {
  installJsdomShims();
  stubBridge({
    displayList: [],
    displayGetVirtualCount: 0,
    listLibrary: [],
    ankiStatus: { connected: false, decks: [], models: [] },
    ankiLinkState: { state: 'idle' },
    jitenGetStore: { plan: [] },
    dictListInstalled: [],
    secretsList: [],
    listDictionaries: [],
    assetsList: { assets: [], statuses: [] },
  });
}, 120_000);

/** A fresh Settings per test, so one page that throws cannot blank the next. */
async function mountSettings(): Promise<void> {
  await cleanup();
  const { setSettingsAdvanced } = await import('../settingsAdvanced');
  setSettingsAdvanced(true);
  const { WALL_PRESETS } = await import('../environment/wallCatalog');
  const { default: SettingsApp } = await import('../components/settings/SettingsApp');
  const noop = (): undefined => undefined;
  app = await mount(createElement(SettingsApp, {
    wall: { kind: 'preset', id: WALL_PRESETS[0]?.id ?? 'void' },
    wallPreset: WALL_PRESETS[0]?.id ?? '',
    presets: WALL_PRESETS.map((p) => ({ id: p.id, label: p.label, css: p.css, animated: p.animated })),
    onWallPreset: noop, onWallImage: noop, onWallVideo: noop, onWallClear: noop,
    onReset: noop, onOpenVisualizer: noop, onOpenMusicWidget: noop,
  } as never), 80);
}

afterAll(async () => {
  await cleanup();
});

describe('Settings — axe-core', () => {
  it('home, with the rail and search', async () => {
    await mountSettings();
    expect(app.host.textContent?.length).toBeGreaterThan(20);
    expect(await a11yViolations(app.host)).toEqual([]);
  });

  for (const page of SETTINGS_NAV.map((p) => p.id)) {
    it(`page: ${page}`, async () => {
      await mountSettings();
      await act(async () => {
        window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page } }));
      });
      // Appearance defers to the next animation frame; the rest paint at once.
      await settle(page === 'appearance' ? 80 : 30);
      // An uncaught render error unmounts the tree, and an empty host audits clean.
      expect(app.host.querySelector('.os-set-search-input'), `${page}: Settings still mounted`).not.toBeNull();
      expect(await a11yViolations(app.host)).toEqual([]);
    }, 60_000);
  }
});
