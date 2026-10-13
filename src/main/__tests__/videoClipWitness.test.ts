// @vitest-environment node
/**
 * The clip IPC tells the e2e harness what range and padding each cut asked for, so the
 * video flow can check that a mined card honours the learner's `clipPadBeforeMs`. The
 * renderer's `window.api` is frozen by the context bridge, so a flow cannot observe the
 * request from the page; `noteE2eWitness` is a no-op outside a harness run.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, request: unknown) => unknown>(),
  witnessed: [] as Array<[string, unknown]>,
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, request: unknown) => unknown) => h.handlers.set(channel, fn),
  },
}));
vi.mock('../e2eHeadless', () => ({
  noteE2eWitness: (api: string, detail: unknown) => h.witnessed.push([api, detail]),
}));
vi.mock('../videoClipExtract', () => ({
  extractAudioClip: async () => ({ ok: true }),
  extractVideoClip: async () => ({ ok: true }),
  extractVideoFrame: async () => ({ ok: true }),
}));

import { clipRequestWitness, registerVideoClipIpc } from '../videoClip';

beforeEach(() => {
  h.handlers.clear();
  h.witnessed.length = 0;
  registerVideoClipIpc();
});

describe('clip request witness', () => {
  it('reports an audio cut by file name, range and padding', async () => {
    await h.handlers.get('video:extractAudioClip')?.(null, {
      filePath: 'C:\\media\\episode 01.mp4',
      startSec: 8.5,
      endSec: 12,
      padBeforeSec: 0.4,
      padAfterSec: 0.35,
      audioStreamOrdinal: 0,
    });
    expect(h.witnessed).toEqual([['clip request', {
      kind: 'audio',
      file: 'episode 01.mp4',
      startSec: 8.5,
      endSec: 12,
      padBeforeSec: 0.4,
      padAfterSec: 0.35,
    }]]);
  });

  it('reads a video cut\'s lead-in from padSec', () => {
    expect(clipRequestWitness('video', { filePath: '/x/a.mkv', startSec: 1, endSec: 2, padSec: 0.25, padAfterSec: 0.5 }))
      .toMatchObject({ kind: 'video', file: 'a.mkv', padBeforeSec: 0.25, padAfterSec: 0.5 });
  });

  it('never witnesses a still', async () => {
    await h.handlers.get('video:extractFrame')?.(null, { filePath: '/x/a.mkv', atSec: 1 });
    expect(h.witnessed).toEqual([]);
  });
});
