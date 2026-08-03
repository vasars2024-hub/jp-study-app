// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../environment/buddyRoutines', () => ({
  mergeBuddyRoutines: () => [],
}));

const ENVIRONMENT_KEY = 'jp-os-environment-v1';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  const target = new EventTarget();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', Object.assign(target, { localStorage: storage }));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('retired Noctis beta state', () => {
  it('removes old companion types and instances while loading a saved profile', async () => {
    localStorage.setItem(
      ENVIRONMENT_KEY,
      JSON.stringify({
        companionTypes: ['study-buddy', 'noctis'],
        companions: [
          {
            id: 'c-buddy',
            typeId: 'study-buddy',
            x: 10,
            y: 20,
            facing: 1,
            mood: 'calm',
          },
          {
            id: 'c-noctis',
            typeId: 'noctis',
            x: 30,
            y: 40,
            facing: 1,
            mood: 'calm',
          },
        ],
      }),
    );

    const { loadEnvironment } = await import('../environment/environmentStore');
    const loaded = loadEnvironment();

    expect(loaded.companionTypes).toEqual(['study-buddy']);
    expect(loaded.companions.map((companion) => companion.id)).toEqual(['c-buddy']);
  });
});
