// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const AERO_KEY = 'jp-aero-legacy-features-v1';
const WIRED_KEY = 'jp-wired-archive-settings-v1';

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const storage = makeMemoryStorage();
// `applyWiredArchiveSettings` stamps data-* on <html>; both modules broadcast a
// CustomEvent on save. Node has neither, so stand both up before importing.
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('document', { documentElement: { dataset: {} as Record<string, string> } });
vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage }));

const { AERO_LEGACY_FEATURES, loadAeroLegacySettings, saveAeroLegacySettings } = await import(
  '../aeroFeatureSettings'
);
const { WIRED_FINDING_FEATURES, loadWiredArchiveSettings, saveWiredArchiveSettings } = await import(
  '../terminalModeSettings'
);

beforeEach(() => {
  storage.clear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('wired networkRadar split', () => {
  it('expands a stored v1 networkRadar into both panels', () => {
    localStorage.setItem(
      WIRED_KEY,
      JSON.stringify({ findingOverlayEnabled: true, findingFeatures: ['networkRadar'] }),
    );
    expect(loadWiredArchiveSettings().findingFeatures.sort()).toEqual(['networkMap', 'networkRadar']);
  });

  it('leaves unrelated features untouched', () => {
    localStorage.setItem(
      WIRED_KEY,
      JSON.stringify({ findingFeatures: ['lyricRibbon', 'networkRadar', 'hackerTerminal'] }),
    );
    const got = loadWiredArchiveSettings().findingFeatures;
    expect(got).toContain('lyricRibbon');
    expect(got).toContain('hackerTerminal');
  });

  it('does not re-expand once the user has saved — turning the map off sticks', () => {
    localStorage.setItem(WIRED_KEY, JSON.stringify({ findingFeatures: ['networkRadar'] }));
    expect(loadWiredArchiveSettings().findingFeatures).toContain('networkMap');

    // User turns the map off, keeping only the scope.
    saveWiredArchiveSettings({ findingFeatures: ['networkRadar'] });
    expect(loadWiredArchiveSettings().findingFeatures).toEqual(['networkRadar']);

    // And it must still be off after a reload.
    expect(loadWiredArchiveSettings().findingFeatures).not.toContain('networkMap');
  });

  it('drops ids that are not real features', () => {
    localStorage.setItem(WIRED_KEY, JSON.stringify({ findingFeatures: ['nope', 'lyricRibbon'] }));
    expect(loadWiredArchiveSettings().findingFeatures).toEqual(['lyricRibbon']);
  });

  it('every advertised feature survives a round trip', () => {
    saveWiredArchiveSettings({ findingFeatures: [...WIRED_FINDING_FEATURES] });
    expect(loadWiredArchiveSettings().findingFeatures.sort()).toEqual([...WIRED_FINDING_FEATURES].sort());
  });
});

describe('aero legacy id rename', () => {
  it('migrates every old wired-flavoured id to its 2007 counterpart', () => {
    localStorage.setItem(
      AERO_KEY,
      JSON.stringify({
        overlayEnabled: true,
        features: ['magiVote', 'akiraCapsule', 'bebopBounty', 'wiredShimeji'],
      }),
    );
    expect(loadAeroLegacySettings().features.sort()).toEqual(
      ['desktopBuddy', 'mediaGauge', 'minesweeperBoard', 'updateAdvisor'].sort(),
    );
  });

  it('keeps overlayEnabled through the migration', () => {
    localStorage.setItem(AERO_KEY, JSON.stringify({ overlayEnabled: true, features: ['naviGuide'] }));
    expect(loadAeroLegacySettings().overlayEnabled).toBe(true);
  });

  it('does not resurrect a gadget the user turned off after migrating', () => {
    localStorage.setItem(AERO_KEY, JSON.stringify({ features: ['magiVote', 'naviGuide'] }));
    expect(loadAeroLegacySettings().features).toContain('updateAdvisor');

    saveAeroLegacySettings({ features: ['officeHelper'] });
    expect(loadAeroLegacySettings().features).toEqual(['officeHelper']);
  });

  it('accepts already-migrated ids unchanged', () => {
    localStorage.setItem(
      AERO_KEY,
      JSON.stringify({ features: ['officeHelper', 'setupWizard'], featuresV: 2 }),
    );
    expect(loadAeroLegacySettings().features.sort()).toEqual(['officeHelper', 'setupWizard']);
  });

  it('every advertised feature survives a round trip', () => {
    saveAeroLegacySettings({ features: [...AERO_LEGACY_FEATURES] });
    expect(loadAeroLegacySettings().features.sort()).toEqual([...AERO_LEGACY_FEATURES].sort());
  });

  it('no longer exposes any wired-flavoured id', () => {
    for (const id of ['magiVote', 'voightKampff', 'akiraCapsule', 'ghostProtocol', 'bebopBounty', 'wiredShimeji']) {
      expect(AERO_LEGACY_FEATURES).not.toContain(id);
    }
  });
});
