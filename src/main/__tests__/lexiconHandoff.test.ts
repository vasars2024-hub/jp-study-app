// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

interface FakeWindow {
  destroyed: boolean;
  sent: string[];
}

const registry = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  windows: [] as FakeWindow[],
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      registry.handlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    getAllWindows: () => registry.windows.map((window) => ({
      isDestroyed: () => window.destroyed,
      webContents: {
        send: (channel: string) => window.sent.push(channel),
      },
    })),
  },
}));

import {
  LEXICON_HANDOFF_CHANNELS,
  LEXICON_HANDOFF_TTL_MS,
} from '../../shared/lexiconHandoff';
import {
  createLexiconHandoffStore,
  registerLexiconHandoffIpc,
} from '../lexiconHandoff';

describe('lexicon handoff store', () => {
  it('hands the newest lookup to exactly one claimant', () => {
    const store = createLexiconHandoffStore();
    expect(store.stage({ text: '猫', source: 'screen' }, 1_000)).toMatchObject({ ok: true });
    expect(store.stage({ text: '食べる', source: 'clipboard' }, 1_001)).toMatchObject({ ok: true });

    expect(store.take({ lens: 'lookup' }, 1_002)).toMatchObject({
      ok: true,
      handoff: { text: '食べる', source: 'clipboard', stagedAt: 1_001 },
    });
    expect(store.take({ lens: 'lookup' }, 1_003)).toEqual({ ok: true, handoff: null });
    expect(store.pending(1_003)).toBe(false);
  });

  it('expires an unclaimed lookup at the boundary', () => {
    const store = createLexiconHandoffStore();
    store.stage({ text: '猫', source: 'screen' }, 5_000);
    expect(store.pending(5_000 + LEXICON_HANDOFF_TTL_MS - 1)).toBe(true);
    expect(store.take({ lens: 'lookup' }, 5_000 + LEXICON_HANDOFF_TTL_MS)).toEqual({ ok: true, handoff: null });
  });

  it('lets only the matching Workbench lens claim sentence-scale text', () => {
    const store = createLexiconHandoffStore();
    expect(store.stage({ text: '今日は寒いですね。', source: 'screen' }))
      .toEqual({ ok: true, kind: 'sentence', lens: 'translate' });
    expect(store.take({ lens: 'lookup' })).toEqual({ ok: true, handoff: null });
    expect(store.pending()).toBe(true);
    expect(store.take({ lens: 'translate' })).toMatchObject({
      ok: true,
      handoff: { text: '今日は寒いですね。', lens: 'translate' },
    });
  });
});

describe('lexicon handoff IPC', () => {
  beforeEach(() => {
    registry.handlers.clear();
    registry.windows = [
      { destroyed: false, sent: [] },
      { destroyed: true, sent: [] },
    ];
  });

  it('registers both handlers and broadcasts only an accepted stage', () => {
    const store = createLexiconHandoffStore();
    registerLexiconHandoffIpc(() => store);

    const stage = registry.handlers.get(LEXICON_HANDOFF_CHANNELS.stage);
    const take = registry.handlers.get(LEXICON_HANDOFF_CHANNELS.take);
    expect(stage).toBeTypeOf('function');
    expect(take).toBeTypeOf('function');

    expect(stage?.(null, { text: '猫', source: 'screen' })).toMatchObject({ ok: true });
    expect(registry.windows[0].sent).toEqual([LEXICON_HANDOFF_CHANNELS.staged]);
    expect(registry.windows[1].sent).toEqual([]);
    expect(take?.(null, { lens: 'lookup' })).toMatchObject({ ok: true, handoff: { text: '猫' } });

    expect(take?.(null, {})).toEqual({ ok: false, code: 'invalid-request' });
  });
});
