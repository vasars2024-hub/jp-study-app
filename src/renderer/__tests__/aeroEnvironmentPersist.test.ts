// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../environment/buddyRoutines', () => ({
  mergeBuddyRoutines: (routines: unknown) => (Array.isArray(routines) ? routines : []),
}));

const THEME_KEY = 'jp-os-theme';
const AERO_RESTORE_THEME_KEY = 'jp-aero-restore-theme-v1';
const STUDY_ENV_BACKUP_KEY = 'jp-study-environment-backup-v1';
const ENV_KEY = 'jp-os-environment-v1';
const AERO_ENV_KEY = 'jp-aero-environment-v1';

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

function stubDom(storage: Storage): void {
  const attrs = new Map<string, string>();
  const root = {
    style: { setProperty: () => undefined, removeProperty: () => undefined },
    dataset: {} as Record<string, string>,
    getAttribute: (k: string) => attrs.get(k) ?? null,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  };
  const target = new EventTarget();
  vi.stubGlobal('document', {
    documentElement: root,
    getElementById: () => null,
    createElement: () => ({
      crossOrigin: '',
      volume: 1,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      play: async () => undefined,
      pause: () => undefined,
    }),
  });
  vi.stubGlobal(
    'window',
    Object.assign(target, {
      localStorage: storage,
      api: {
        onPlayerSync: () => () => undefined,
        onPlayerCommand: () => () => undefined,
        playerWindowId: async () => 1,
        playerGetSnapshot: async () => null,
      },
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    }),
  );
}

beforeEach(() => {
  const storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  stubDom(storage);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('aero environment / theme persistence', () => {
  it('persists the pre-Aero theme across remember/load', async () => {
    const { rememberAeroRestoreTheme, loadAeroRestoreTheme } = await import('../aeroEnvironment');
    rememberAeroRestoreTheme('dark-nebula');
    expect(localStorage.getItem(AERO_RESTORE_THEME_KEY)).toBe('dark-nebula');
    expect(loadAeroRestoreTheme('study-os')).toBe('dark-nebula');
  });

  it('ignores Aero itself as a restore theme', async () => {
    const { rememberAeroRestoreTheme, loadAeroRestoreTheme } = await import('../aeroEnvironment');
    rememberAeroRestoreTheme('frutiger-aero');
    expect(localStorage.getItem(AERO_RESTORE_THEME_KEY)).toBeNull();
    expect(loadAeroRestoreTheme('study-os')).toBe('study-os');
  });

  it('backs up Study env on Aero enter and restores it on leave', async () => {
    const { registerFrutigerAero } = await import('../theme/frutiger-aero');
    const { applyTheme, DEFAULT_THEME_ID } = await import('../theme/engine');
    const { saveEnvironment, loadEnvironment } = await import('../environment/environmentStore');
    const {
      applyAeroEnvironment,
      installAeroEnvironmentBridge,
      restoreStudyEnvironmentAfterAero,
    } = await import('../aeroEnvironment');

    registerFrutigerAero();
    applyTheme(DEFAULT_THEME_ID);
    saveEnvironment({
      enabled: true,
      particlesEnabled: true,
      companionsEnabled: true,
      rotationEnabled: true,
      particlePresets: ['sakura'],
    });

    installAeroEnvironmentBridge();
    applyAeroEnvironment(true);
    applyTheme('frutiger-aero');

    expect(localStorage.getItem(STUDY_ENV_BACKUP_KEY)).toBeTruthy();
    expect(loadEnvironment().particlePresets).not.toEqual(['sakura']);

    applyTheme(DEFAULT_THEME_ID);
    expect(loadEnvironment().particlePresets).toEqual(['sakura']);
    expect(loadEnvironment().enabled).toBe(true);

    const before = localStorage.getItem(ENV_KEY);
    restoreStudyEnvironmentAfterAero();
    expect(localStorage.getItem(ENV_KEY)).toBe(before);
    expect(localStorage.getItem(AERO_ENV_KEY)).toBeTruthy();
    expect(localStorage.getItem(THEME_KEY)).toBe(DEFAULT_THEME_ID);
  });
});

describe('applyTheme persist option', () => {
  it('does not overwrite saved theme when persist is false', async () => {
    const { applyTheme, loadThemeId, DEFAULT_THEME_ID } = await import('../theme/engine');
    applyTheme('dark-nebula');
    expect(loadThemeId()).toBe('dark-nebula');

    applyTheme(DEFAULT_THEME_ID, { persist: false });
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(loadThemeId()).toBe('dark-nebula');
  });
});
