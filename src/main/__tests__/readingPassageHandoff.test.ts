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
  READING_PASSAGE_HANDOFF_CHANNELS,
  READING_PASSAGE_HANDOFF_TTL_MS,
  type ReadingPassageHandoffStageResult,
  type ReadingPassageHandoffTakeResult,
} from '../../shared/readingPassageHandoff';
import {
  createReadingPassageHandoffStore,
  registerReadingPassageHandoffIpc,
} from '../readingPassageHandoff';

const PARAGRAPH = [
  '彼は図書館で本を読んでいた。',
  '窓の外では雨が降り続いていて、誰も帰ろうとしなかった。',
  '司書は静かに棚のあいだを歩き、時々こちらを見た。',
  'その日の午後は、ただそれだけのことで過ぎていった。',
].join('');

const OTHER_PARAGRAPH = PARAGRAPH.replace('図書館', '喫茶店');

function request(text = PARAGRAPH, captureId = 'c1') {
  return { text, source: 'screen', sourceLabel: 'Notepad', captureId };
}

describe('createReadingPassageHandoffStore', () => {
  it('hands a staged passage back exactly once', () => {
    const store = createReadingPassageHandoffStore();
    expect(store.stage(request())).toEqual({ ok: true, kind: 'paragraph', captureId: 'c1' });
    expect(store.pending()).toBe(true);

    const first = store.take();
    expect(first.ok && first.handoff?.text).toBe(PARAGRAPH);
    const second = store.take();
    expect(second).toEqual({ ok: true, handoff: null });
    expect(store.pending()).toBe(false);
  });

  it('drops a passage nobody claimed once the TTL has passed', () => {
    const store = createReadingPassageHandoffStore();
    store.stage(request(), 1_000);
    expect(store.pending(1_000 + READING_PASSAGE_HANDOFF_TTL_MS - 1)).toBe(true);
    expect(store.take(1_000 + READING_PASSAGE_HANDOFF_TTL_MS)).toEqual({ ok: true, handoff: null });
  });

  it('lets the newest passage win, so the reader never opens a stale one', () => {
    const store = createReadingPassageHandoffStore();
    store.stage(request(PARAGRAPH, 'first'));
    store.stage(request(OTHER_PARAGRAPH, 'second'));
    const claimed = store.take();
    expect(claimed.ok && claimed.handoff?.captureId).toBe('second');
  });

  it('refuses lookup-scale text without staging anything', () => {
    const store = createReadingPassageHandoffStore();
    expect(store.stage(request('図書館'))).toEqual({ ok: false, code: 'not-passage-scale' });
    expect(store.pending()).toBe(false);
  });
});

describe('registerReadingPassageHandoffIpc', () => {
  beforeEach(() => {
    registry.handlers.clear();
    registry.windows = [];
  });

  it('announces an accepted passage to every live window, and only then', async () => {
    const store = createReadingPassageHandoffStore();
    registerReadingPassageHandoffIpc(() => store);
    const live: FakeWindow = { destroyed: false, sent: [] };
    const gone: FakeWindow = { destroyed: true, sent: [] };
    registry.windows = [live, gone];

    const stage = registry.handlers.get(READING_PASSAGE_HANDOFF_CHANNELS.stage);
    expect(stage).toBeTypeOf('function');

    // The refusal is the negative control: a stage that fails must broadcast
    // nothing, or every window wakes up to claim a passage that is not there.
    const refused = await stage?.(null, request('図書館')) as ReadingPassageHandoffStageResult;
    expect(refused.ok).toBe(false);
    expect(live.sent).toEqual([]);

    const accepted = await stage?.(null, request()) as ReadingPassageHandoffStageResult;
    expect(accepted.ok).toBe(true);
    expect(live.sent).toEqual([READING_PASSAGE_HANDOFF_CHANNELS.staged]);
    expect(gone.sent).toEqual([]);

    const take = registry.handlers.get(READING_PASSAGE_HANDOFF_CHANNELS.take);
    const claimed = await take?.(null) as ReadingPassageHandoffTakeResult;
    expect(claimed.ok && claimed.handoff?.captureId).toBe('c1');
  });
});
