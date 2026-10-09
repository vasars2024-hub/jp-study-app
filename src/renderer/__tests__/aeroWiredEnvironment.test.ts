// @vitest-environment node
/**
 * Aero → Wired → Aero and the living environment (2026-10 hardware run: going from Aero
 * straight into Wired kept Aero's bubbles, particles and assistant on screen; the Study
 * OS environment only came back once Wired was left).
 *
 * Wired runs on the Study OS living layer. Its entry now restores that environment
 * itself, idempotently with the theme bridge; leaving Wired back into Aero re-applies
 * Aero's; and a whole-environment swap bumps an epoch so the companion layer cannot
 * write the previous mode's companions back over the restored ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../environment/buddyRoutines', () => ({
  mergeBuddyRoutines: (routines: unknown) => (Array.isArray(routines) ? routines : []),
}));

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
    classList: { add: () => undefined, remove: () => undefined, toggle: () => undefined, contains: () => false },
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
  vi.stubGlobal('sessionStorage', makeMemoryStorage());
  vi.stubGlobal(
    'window',
    Object.assign(target, {
      localStorage: storage,
      sessionStorage: makeMemoryStorage(),
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
      api: {
        onPlayerSync: () => () => undefined,
        onPlayerCommand: () => () => undefined,
        playerWindowId: async () => 1,
        playerGetSnapshot: async () => null,
      },
      matchMedia: () => ({
        matches: true, // reduced motion: the shortest Wired exit
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
  // The Wired entry sequence and its ambient loop are timers; none may outlive a test.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function setup() {
  const engine = await import('../theme/engine');
  const { registerFrutigerAero, AERO_THEME_ID } = await import('../theme/frutiger-aero');
  const { registerWiredArchive } = await import('../theme/wired-archive');
  const store = await import('../environment/environmentStore');
  const aero = await import('../aeroEnvironment');
  const wired = await import('../wiredArchiveLifecycle');
  registerFrutigerAero();
  registerWiredArchive();
  engine.applyTheme(engine.DEFAULT_THEME_ID);
  // The Study OS living layer the owner set up.
  store.saveEnvironment({
    enabled: true,
    particlesEnabled: true,
    particlePresets: ['fireflies'],
    companionsEnabled: true,
    companionTypes: ['study-buddy'],
  });
  wired.installWiredArchiveLifecycle();
  // Into Aero the way the typed egg does it.
  aero.applyAeroEnvironment(true);
  engine.setTheme(AERO_THEME_ID);
  return { engine, store, aero, wired, AERO_THEME_ID };
}

describe('Aero → Wired restores the Study OS environment on entry', () => {
  it('without depending on the theme bridge', async () => {
    const { store, wired } = await setup();
    expect(store.loadEnvironment().particlePresets).toContain('bubbles');
    expect(store.loadEnvironment().companionTypes).toEqual(['aero-assistant']);

    wired.requestWiredArchiveEntry();

    const env = store.loadEnvironment();
    expect(env.particlePresets).toEqual(['fireflies']);
    expect(env.companionTypes).toEqual(['study-buddy']);
    expect(env.particlePresets).not.toContain('bubbles');
  });

  it('once: the bridge seeing Aero → Wired too does not snapshot Study values as Aero’s', async () => {
    const { store, aero, wired } = await setup();
    aero.installAeroEnvironmentBridge();
    wired.requestWiredArchiveEntry();
    const snapshot = JSON.parse(localStorage.getItem(AERO_ENV_KEY) ?? '{}');
    expect(snapshot.particlePresets).toContain('bubbles');
    expect(snapshot.companionTypes).toEqual(['aero-assistant']);
    expect(store.loadEnvironment().companionTypes).toEqual(['study-buddy']);
  });

  it('bumps the swap epoch, so a companion list read in Aero is never written back', async () => {
    const { store, wired } = await setup();
    const inAero = store.environmentSwapEpoch();
    wired.requestWiredArchiveEntry();
    expect(store.environmentSwapEpoch()).toBeGreaterThan(inAero);
  });
});

describe('Wired → Aero brings Aero’s environment back', () => {
  it('re-applies Aero’s living layer when the operator chooses Aero at the breach', async () => {
    const { store, wired, engine, AERO_THEME_ID } = await setup();
    wired.requestWiredArchiveEntry();
    expect(store.loadEnvironment().particlePresets).toEqual(['fireflies']);
    // Settle the entry sequence (its ambient loop re-arms forever, so by time), then leave.
    await vi.advanceTimersByTimeAsync(20_000);
    wired.requestWiredArchiveShutdown();
    expect(wired.getWiredArchiveLifecycleState().phase).toBe('breach');
    wired.resolveWiredExit('aero');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(engine.loadThemeId()).toBe(AERO_THEME_ID);
    expect(store.loadEnvironment().particlePresets).toContain('bubbles');
    expect(store.loadEnvironment().companionTypes).toEqual(['aero-assistant']);
  });
});
