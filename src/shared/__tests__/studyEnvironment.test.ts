import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

beforeEach(() => {
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
      listeners.get(type)!.add(cb);
    },
    removeEventListener: (type: string, cb: EventListener) => {
      listeners.get(type)?.delete(cb);
    },
    dispatchEvent: (e: Event) => {
      listeners.get(e.type)?.forEach((cb) => cb(e));
      return true;
    },
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('studyEnvironment', () => {
  it('persists study lang and syncs whisper defaults', async () => {
    const env = await import('../../renderer/studyEnvironment');
    const whisper = await import('../../renderer/whisperSettings');

    expect(env.getStudyLang()).toBe('ja');
    env.setStudyLang('zh');
    expect(env.getStudyLang()).toBe('zh');
    // The whisper-lang mirror was retired (audit 6.1): a language switch no longer writes it.
    expect(localStorage.getItem(env.RETIRED_WHISPER_LANG_KEY)).toBeNull();
    expect(whisper.loadWhisperModelTier()).toBe('whisper-small');

    env.setStudyLang('ja');
    expect(whisper.loadWhisperModelTier()).toBe('kotoba-whisper');
  });

  it('required assets are ZH starter only', async () => {
    const env = await import('../../renderer/studyEnvironment');
    expect(env.requiredAssetIds('ja')).toEqual([]);
    expect(env.requiredAssetIds('zh')).toEqual(['cc-cedict']);
  });
});

describe('knownWords per-lang', () => {
  it('migrates legacy knowledge to JA and isolates ZH', async () => {
    localStorage.setItem('jp-word-knowledge', JSON.stringify({ 食べる: { l: 3, m: 1 } }));
    const env = await import('../../renderer/studyEnvironment');
    const kw = await import('../../renderer/knownWords');

    expect(kw.getLevel('食べる')).toBe(3);
    expect(localStorage.getItem(kw.knowledgeKey('ja'))).toBeTruthy();

    env.setStudyLang('zh');
    expect(kw.getLevel('食べる')).toBe(0);
    kw.setLevel('学习', 2);
    expect(kw.getLevel('学习')).toBe(2);

    env.setStudyLang('ja');
    expect(kw.getLevel('食べる')).toBe(3);
    expect(kw.getLevel('学习')).toBe(0);
  });
});
