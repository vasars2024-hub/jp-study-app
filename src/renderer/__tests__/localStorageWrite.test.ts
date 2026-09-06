// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v === '__THROW__') throw new Error('quota');
      if (v === '__FULL__') {
        const err = new Error('exceeded the quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
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

  it('records nothing while writes are landing', async () => {
    const { writeLocalStorage, getLastStorageWriteFailure } = await import('../localStorageWrite');
    writeLocalStorage('k', 'v');
    expect(getLastStorageWriteFailure()).toBeNull();
  });
});

// Audit 5.7: a refused write used to leave no trace at all, which is why a full
// store read as unrelated features "not remembering".
describe('failure diagnostics', () => {
  it('names quota as the cause and measures the store at that moment', async () => {
    const { writeLocalStorage, getLastStorageWriteFailure } = await import('../localStorageWrite');
    localStorage.setItem('jp-existing-v1', 'x'.repeat(50));

    expect(writeLocalStorage('jp-scraper-settings-v1', '__FULL__')).toBe(false);

    const failure = getLastStorageWriteFailure();
    expect(failure?.key).toBe('jp-scraper-settings-v1');
    expect(failure?.kind).toBe('quota');
    expect(failure?.bytes).toBe(('jp-scraper-settings-v1'.length + '__FULL__'.length) * 2);
    expect(failure?.footprint?.keyCount).toBe(1);
    expect(failure?.footprint?.largest[0].key).toBe('jp-existing-v1');
  });

  it('does not call an unrelated throw a full store', async () => {
    const { writeLocalStorage, getLastStorageWriteFailure } = await import('../localStorageWrite');
    expect(writeLocalStorage('k', '__THROW__')).toBe(false);
    expect(getLastStorageWriteFailure()?.kind).toBe('other');
  });

  it('reports a value that would not serialize as serialization, with no footprint', async () => {
    const { writeLocalStorageJson, getLastStorageWriteFailure } = await import(
      '../localStorageWrite'
    );
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(writeLocalStorageJson('k', circular)).toBe(false);

    const failure = getLastStorageWriteFailure();
    expect(failure?.kind).toBe('serialize');
    expect(failure?.bytes).toBe(0);
    // The store is fine; attaching its size here would send the reader to the
    // wrong place entirely.
    expect(failure?.footprint).toBeNull();
  });

  it('writes the failure to the console log with the footprint attached', async () => {
    const { writeLocalStorage } = await import('../localStorageWrite');
    const { getBlancConsole } = await import('../blancConsole');
    localStorage.setItem('jp-existing-v1', 'x'.repeat(50));

    writeLocalStorage('jp-scraper-settings-v1', '__FULL__');

    const entry = getBlancConsole().find((e) => e.message.includes('jp-scraper-settings-v1'));
    expect(entry?.level).toBe('error');
    expect((entry?.detail as { kind: string }).kind).toBe('quota');
    expect((entry?.detail as { totalBytes: number }).totalBytes).toBeGreaterThan(0);
  });

  it('keeps the newest failure but diagnoses a storm only once', async () => {
    const { writeLocalStorage, getLastStorageWriteFailure } = await import('../localStorageWrite');
    const { getBlancConsole } = await import('../blancConsole');

    writeLocalStorage('first', '__FULL__');
    writeLocalStorage('second', '__FULL__');
    writeLocalStorage('third', '__FULL__');

    const failure = getLastStorageWriteFailure();
    expect(failure?.key).toBe('third');
    // Throttled: the later two cost neither a measurement nor a toast.
    expect(failure?.footprint).toBeNull();
    expect(getBlancConsole().filter((e) => e.message.includes('was refused'))).toHaveLength(1);
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('clears on request, so a surface can dismiss a stale warning', async () => {
    const { writeLocalStorage, getLastStorageWriteFailure, clearLastStorageWriteFailure } =
      await import('../localStorageWrite');
    writeLocalStorage('k', '__FULL__');
    expect(getLastStorageWriteFailure()).not.toBeNull();
    clearLastStorageWriteFailure();
    expect(getLastStorageWriteFailure()).toBeNull();
  });
});
