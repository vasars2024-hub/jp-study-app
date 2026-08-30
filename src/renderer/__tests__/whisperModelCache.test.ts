import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The downloaded record is per-backend on purpose: the GPU path caches fp16/q4
// weights and the CPU path caches fp32 ones, so "downloaded" is only meaningful
// relative to the device that will actually load it.

const store = new Map<string, string>();

function stubEnv({ webgpu }: { webgpu: boolean }): void {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });

  class FakeCustomEvent<T = unknown> extends Event {
    detail: T;
    constructor(type: string, init?: { detail?: T }) {
      super(type);
      this.detail = init?.detail as T;
    }
  }
  vi.stubGlobal('CustomEvent', FakeCustomEvent);

  const listeners = new Map<string, Set<EventListener>>();
  vi.stubGlobal('window', {
    addEventListener: (type: string, cb: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(cb);
    },
    removeEventListener: (type: string, cb: EventListener) => {
      listeners.get(type)?.delete(cb);
    },
    dispatchEvent: (e: Event) => {
      listeners.get(e.type)?.forEach((cb) => cb(e));
      return true;
    },
  });

  vi.stubGlobal('navigator', webgpu ? { gpu: {} } : {});
  vi.resetModules();
}

beforeEach(() => stubEnv({ webgpu: true }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('whisperModelCache', () => {
  it('records the model the worker actually loaded after a CPU fallback', async () => {
    const c = await import('../whisperModelCache');

    expect(c.effectiveWhisperTier('kotoba-whisper', 'Xenova/whisper-base')).toBe('whisper-base');
    expect(c.effectiveWhisperTier('kotoba-whisper', undefined)).toBe('kotoba-whisper');
  });

  it('does not tick a GPU download as available for CPU', async () => {
    const c = await import('../whisperModelCache');

    c.markTierDownloaded('whisper-base', 'webgpu', 'auto');
    const map = c.loadDownloaded();

    expect(c.isDownloadedIn(map, 'whisper-base', 'auto')).toBe(true);
    // fp32 CPU weights were never fetched — the tick must not claim otherwise.
    expect(c.isDownloadedIn(map, 'whisper-base', 'cpu')).toBe(false);
  });

  it('learns what auto resolves to when WebGPU falls back to wasm', async () => {
    const c = await import('../whisperModelCache');

    // navigator.gpu exists, so auto would be guessed as webgpu...
    expect(c.variantForDevice('auto')).toBe('webgpu');

    // ...but the worker actually loaded on wasm, which is what auto means here.
    c.markTierDownloaded('whisper-small', 'wasm', 'auto');

    expect(c.variantForDevice('auto')).toBe('wasm');
    const map = c.loadDownloaded();
    expect(c.isDownloadedIn(map, 'whisper-small', 'auto')).toBe(true);
    // Those same fp32 weights serve the CPU path too.
    expect(c.isDownloadedIn(map, 'whisper-small', 'cpu')).toBe(true);
  });

  it('guesses wasm for auto when the machine has no WebGPU', async () => {
    stubEnv({ webgpu: false });
    const c = await import('../whisperModelCache');
    expect(c.variantForDevice('auto')).toBe('wasm');
  });

  it('keeps both variants once each has been downloaded', async () => {
    const c = await import('../whisperModelCache');

    c.markTierDownloaded('kotoba-whisper', 'webgpu', 'auto');
    c.markTierDownloaded('kotoba-whisper', 'wasm', 'cpu');

    const map = c.loadDownloaded();
    expect(map['kotoba-whisper']).toEqual(['webgpu', 'wasm']);
    expect(c.isDownloadedIn(map, 'kotoba-whisper', 'auto')).toBe(true);
    expect(c.isDownloadedIn(map, 'kotoba-whisper', 'cpu')).toBe(true);
  });

  it('forgets every variant when a model is unmarked', async () => {
    const c = await import('../whisperModelCache');

    c.markTierDownloaded('whisper-base', 'webgpu', 'auto');
    c.markTierDownloaded('whisper-base', 'wasm', 'cpu');
    c.unmarkTierDownloaded('whisper-base');

    expect(c.loadDownloaded()['whisper-base']).toBeUndefined();
  });

  it('treats the pre-variant array format as nothing downloaded', async () => {
    // A stale record can't say which backend it meant. Re-downloading is cheap
    // (the files are still cached); a false tick is not.
    store.set('jp-study-whisper-downloaded', JSON.stringify(['whisper-base']));
    const c = await import('../whisperModelCache');

    const map = c.loadDownloaded();
    expect(map['whisper-base']).toBeUndefined();
    expect(c.isDownloadedIn(map, 'whisper-base', 'auto')).toBe(false);
  });

  it('ignores unknown tiers and malformed entries', async () => {
    store.set(
      'jp-study-whisper-downloaded',
      JSON.stringify({ 'not-a-model': ['wasm'], 'whisper-base': 'nope' }),
    );
    const c = await import('../whisperModelCache');

    expect(c.loadDownloaded()).toEqual({});
  });

  it('notifies subscribers when the record changes', async () => {
    const c = await import('../whisperModelCache');
    const seen: unknown[] = [];
    const off = c.onDownloadedChanged((m) => seen.push(m));

    c.markTierDownloaded('whisper-base', 'wasm', 'cpu');
    off();
    c.markTierDownloaded('whisper-small', 'wasm', 'cpu');

    expect(seen).toEqual([{ 'whisper-base': ['wasm'] }]);
  });
});
