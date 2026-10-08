// @vitest-environment node
/**
 * The renderer half of a durable extension mine: each `mineId` is saved once
 * per session and acked to main, and a replay of one already saved is acked
 * again without adding a second card.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  mines: [] as Array<Record<string, unknown>>,
  mineFails: false,
  known: [] as Array<{ word: string; level: number }>,
}));

vi.mock('../i18n', () => ({ t: (key: string) => key }));
vi.mock('../flashcardDeck', () => ({ addDeckCards: vi.fn(), loadDeck: () => [], removeDeckCards: vi.fn() }));
vi.mock('../clipboardHistory', () => ({ recordClipboardEntry: vi.fn(), loadClipboardHistory: () => [] }));
vi.mock('../knownWords', () => ({
  getLevel: () => 0,
  setLevel: vi.fn(),
  listKnownEntries: () => h.known,
}));
vi.mock('../bookLevelEstimate', () => ({ estimateLevelFromText: async () => null }));
vi.mock('../studyEnvironment', () => ({ getStudyLang: () => 'ja' }));
vi.mock('../notebookTimeline', () => ({ appendNotebookEvent: vi.fn() }));
vi.mock('../translationHistory', () => ({ appendTranslationHistory: vi.fn() }));
vi.mock('../comprehensibility', () => ({ scoreTextComprehensibility: vi.fn(), knownPercent: vi.fn() }));
vi.mock('../studyMining', () => ({
  mineToStudy: async (input: Record<string, unknown>) => {
    if (h.mineFails) throw new Error('quota exceeded');
    h.mines.push(input);
    return { created: true };
  },
}));

type Listener = (payload: Record<string, unknown>) => void;

let listeners: Record<string, Listener>;
let api: Record<string, unknown> & {
  ackExtensionMined: ReturnType<typeof vi.fn>;
  extensionBridgeReady: ReturnType<typeof vi.fn>;
  replyKnownSnapshot: ReturnType<typeof vi.fn>;
};

function on(name: string) {
  return (cb: Listener) => {
    listeners[name] = cb;
    return () => {
      delete listeners[name];
    };
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

let uninstall: (() => void) | undefined;
let mod: typeof import('../studyBackgroundJobs');

beforeEach(async () => {
  listeners = {};
  h.mines.length = 0;
  h.mineFails = false;
  h.known = [];
  api = {
    ackExtensionMined: vi.fn(),
    extensionBridgeReady: vi.fn(),
    replyKnownSnapshot: vi.fn(),
    onExtensionMined: on('mined'),
    onKnownSnapshotRequest: on('snapshot'),
  };
  // Every other bridge: a no-op subscription.
  const proxy = new Proxy(api, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop.startsWith('on')) return () => () => undefined;
      return undefined;
    },
  });
  (globalThis as unknown as { window: unknown }).window = { api: proxy };
  mod = await import('../studyBackgroundJobs');
  mod.__resetHandledExtensionMinesForTests();
  uninstall = mod.installStudyRendererBridges();
});

afterEach(() => {
  uninstall?.();
  delete (globalThis as { window?: unknown }).window;
});

const payload = (mineId?: string) => ({
  mode: 'word',
  term: '猫',
  text: '猫',
  reading: 'ねこ',
  meaning: 'cat',
  anki: { ok: false, error: 'skipped' },
  ...(mineId ? { mineId } : {}),
});

describe('extension mines in the renderer', () => {
  it('signals main that the bridges are ready once installed', () => {
    expect(api.extensionBridgeReady).toHaveBeenCalledTimes(1);
  });

  it('saves a mine once and acks it; a repeated mineId is acked without a second card', async () => {
    listeners.mined(payload('m-1'));
    listeners.mined(payload('m-1')); // while the first is still saving
    await settle();
    expect(h.mines).toHaveLength(1);
    expect(api.ackExtensionMined).toHaveBeenCalledTimes(1);
    expect(api.ackExtensionMined).toHaveBeenLastCalledWith('m-1', { ok: true });

    listeners.mined(payload('m-1')); // a replay after it was saved
    await settle();
    expect(h.mines).toHaveLength(1);
    expect(api.ackExtensionMined).toHaveBeenCalledTimes(2);
    expect(api.ackExtensionMined).toHaveBeenLastCalledWith('m-1', { ok: true });
  });

  it('remembers a handled mineId across a re-install', async () => {
    listeners.mined(payload('m-2'));
    await settle();
    uninstall?.();
    uninstall = mod.installStudyRendererBridges();
    listeners.mined(payload('m-2'));
    await settle();
    expect(h.mines).toHaveLength(1);
  });

  it('a failed save is acked ok:false and may be retried', async () => {
    h.mineFails = true;
    listeners.mined(payload('m-3'));
    await settle();
    expect(api.ackExtensionMined).toHaveBeenLastCalledWith('m-3', { ok: false, error: 'quota exceeded' });
    h.mineFails = false;
    listeners.mined(payload('m-3'));
    await settle();
    expect(h.mines).toHaveLength(1);
    expect(api.ackExtensionMined).toHaveBeenLastCalledWith('m-3', { ok: true });
  });

  it('a mine without a mineId (older main) is saved and not acked', async () => {
    listeners.mined(payload());
    await settle();
    expect(h.mines).toHaveLength(1);
    expect(api.ackExtensionMined).not.toHaveBeenCalled();
  });

  it('answers a known-word snapshot request with every known word and the study language', () => {
    h.known = [{ word: '猫', level: 3 }, { word: '犬', level: 1 }];
    listeners.snapshot({ id: 's-1' });
    expect(api.replyKnownSnapshot).toHaveBeenCalledWith('s-1', { words: { 猫: 3, 犬: 1 }, lang: 'ja' });
  });
});
