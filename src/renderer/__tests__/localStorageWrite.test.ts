// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v === '__THROW__') throw new Error('quota');
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  const storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn(() => true),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    localStorage: storage,
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('writeLocalStorage', () => {
  it('writes successfully', async () => {
    const { writeLocalStorage, writeLocalStorageJson } = await import('../localStorageWrite');
    expect(writeLocalStorage('k', 'v')).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
    expect(writeLocalStorageJson('j', { a: 1 })).toBe(true);
    expect(localStorage.getItem('j')).toBe('{"a":1}');
  });

  it('returns false and toasts when setItem throws', async () => {
    const { writeLocalStorage } = await import('../localStorageWrite');
    expect(writeLocalStorage('k', '__THROW__')).toBe(false);
    expect(window.dispatchEvent).toHaveBeenCalled();
  });
});
