// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SAFE_MODE_KEY = 'jp-os-aero-safe-mode-v1';
let cleanups: Array<() => void> = [];

function dispatchStorage(key: string, newValue: string | null): void {
  window.dispatchEvent(new StorageEvent('storage', {
    key,
    newValue,
    storageArea: localStorage,
    url: window.location.href,
  }));
}

beforeEach(() => {
  cleanups = [];
  localStorage.clear();
  document.documentElement.removeAttribute('data-materials');
  document.documentElement.removeAttribute('data-aero-safe-mode');
  vi.resetModules();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Secret OS safe-mode recovery', () => {
  it.each(['{broken', 'true', JSON.stringify({ version: 2, enabled: true })])(
    'fails corrupt or unsupported state safely off without rewriting it: %s',
    async (raw) => {
      localStorage.setItem(SAFE_MODE_KEY, raw);
      const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
      const safeMode = await import('../aeroSafeMode');

      safeMode.bootAeroSafeMode();
      cleanups.push(safeMode.startAeroSafeModeSync());

      expect(safeMode.loadAeroSafeMode()).toEqual({ version: 1, enabled: false });
      expect(document.documentElement.dataset.aeroSafeMode).toBe('off');
      expect(storageWrite).not.toHaveBeenCalled();
    },
  );

  it('enables a presentation-only fallback without changing study or sensory preference stores', async () => {
    const preserved = {
      'jp-flashcard-deck': JSON.stringify({ cards: [{ id: 'card-1' }] }),
      'jp-word-knowledge': JSON.stringify({ 日本語: 5 }),
      'jp-os-environment-v1': JSON.stringify({ enabled: true, companionsEnabled: true }),
      'jp-os-display-prefs-v1': JSON.stringify({ animationLevel: 'full' }),
      'jp-os-sound-muted': '0',
    };
    for (const [key, value] of Object.entries(preserved)) localStorage.setItem(key, value);
    const safeMode = await import('../aeroSafeMode');

    expect(safeMode.setAeroSafeMode(true)).toEqual({ version: 1, enabled: true });
    expect(document.documentElement.dataset.aeroSafeMode).toBe('on');
    for (const [key, value] of Object.entries(preserved)) {
      expect(localStorage.getItem(key)).toBe(value);
    }

    expect(safeMode.setAeroSafeMode(false)).toEqual({ version: 1, enabled: false });
    expect(document.documentElement.dataset.aeroSafeMode).toBe('off');
  });

  it('converges sibling enable/delete events exactly once without echo writes', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const safeMode = await import('../aeroSafeMode');
    const changed = vi.fn();
    cleanups.push(safeMode.onAeroSafeModeChanged(changed));
    storageWrite.mockClear();

    dispatchStorage('unrelated-key', JSON.stringify({ version: 1, enabled: true }));
    expect(changed).not.toHaveBeenCalled();

    dispatchStorage(SAFE_MODE_KEY, JSON.stringify({ version: 1, enabled: true }));
    expect(document.documentElement.dataset.aeroSafeMode).toBe('on');
    expect(changed).toHaveBeenLastCalledWith({ version: 1, enabled: true });

    dispatchStorage(SAFE_MODE_KEY, null);
    expect(document.documentElement.dataset.aeroSafeMode).toBe('off');
    expect(changed).toHaveBeenCalledTimes(2);
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('suppresses sensory systems only while Secret OS is the active material set', async () => {
    const safeMode = await import('../aeroSafeMode');
    safeMode.setAeroSafeMode(true);

    document.documentElement.dataset.materials = 'default';
    expect(safeMode.isAeroSafeModeApplied()).toBe(false);
    document.documentElement.dataset.materials = 'aero';
    expect(safeMode.isAeroSafeModeApplied()).toBe(true);
    safeMode.setAeroSafeMode(false);
    expect(safeMode.isAeroSafeModeApplied()).toBe(false);
  });

  it('gates Secret OS sound before creating an audio context', async () => {
    const createAudioContext = vi.fn(function MockAudioContext() {
      throw new Error('Safe mode must gate audio before context creation');
    });
    vi.stubGlobal('AudioContext', createAudioContext);
    const safeMode = await import('../aeroSafeMode');
    document.documentElement.dataset.materials = 'aero';
    safeMode.setAeroSafeMode(true);
    const { soundEngine } = await import('../audio/soundEngine');

    expect(() => soundEngine.playTone('system')).not.toThrow();
    expect(createAudioContext).not.toHaveBeenCalled();
  });

  it('is indexed in Settings search and included in non-study backup inventory', async () => {
    const [{ SETTINGS_REGISTRY }, { SETTINGS_DOMAINS }] = await Promise.all([
      import('../components/settings/settingsRegistry'),
      import('../storage/settingsCatalog'),
    ]);

    expect(SETTINGS_REGISTRY).toContainEqual(expect.objectContaining({
      id: 'aero-safe-mode',
      pageId: 'motion',
    }));
    expect(SETTINGS_DOMAINS.find((domain) => domain.id === 'appearance')?.lsKeys)
      .toContain(SAFE_MODE_KEY);
  });
});
