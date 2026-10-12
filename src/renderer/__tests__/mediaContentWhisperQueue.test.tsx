// @vitest-environment jsdom
/**
 * The old MediaContent player's "Generate subtitles" (audit S2).
 *
 * It ran its own worker in the window, replaced `workerRef` without stopping
 * the old one (old cues leaked into the next file) and could not be cancelled.
 * A library file now goes through the transcription queue — main routes its
 * chunks to the window that asked (per-window routing), Cancel cancels the
 * job — and the track the queue wrote is mounted when the job reports done.
 */
import { act, createElement, useEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';
import type { TranscriptionProgress } from '../../shared/transcriptionIpc';

const ITEM = {
  id: 'lib-1',
  title: 'Episode 1',
  fileName: 'ep1.mkv',
  path: 'C:\\media\\ep1.mkv',
  subtitles: [{ id: 'rec-1', lang: 'ja', source: 'generated', derivation: 'whisper', format: 'srt', path: 'x.srt', label: 'JA (Whisper)', addedAt: 2 }],
};
const SRT = '1\n00:00:01,000 --> 00:00:02,000\n猫です。\n\n2\n00:00:03,000 --> 00:00:04,000\n犬です。\n';

let progressCb: ((p: TranscriptionProgress) => void) | null = null;
const enqueue = vi.fn();
const cancel = vi.fn();
const workers: unknown[] = [];

type MediaHook = typeof import('../components/media/MediaContent').useMedia;
let state: ReturnType<MediaHook> | null = null;

beforeAll(() => installJsdomShims());
beforeEach(() => {
  localStorage.clear();
  progressCb = null;
  enqueue.mockReset().mockResolvedValue({ ok: true, mediaId: 'lib-1' });
  cancel.mockReset().mockResolvedValue(undefined);
  workers.length = 0;
  vi.stubGlobal('Worker', class {
    posted = 0;
    terminated = false;
    constructor() {
      workers.push(this);
    }
    postMessage(): void {
      this.posted += 1;
    }
    terminate(): void {
      this.terminated = true;
    }
  });
  stubBridge({
    listMedia: [ITEM],
    getMediaWatchFolder: null,
    openMedia: { item: ITEM, url: 'app://media/lib-1' },
    enqueueTranscription: enqueue,
    cancelTranscription: cancel,
    readSubtitleRecord: { text: SRT },
    onTranscriptionProgress: (cb: (p: TranscriptionProgress) => void) => {
      progressCb = cb;
      return () => undefined;
    },
  });
});
afterEach(async () => {
  await cleanup();
  state = null;
});

async function mountHook(): Promise<void> {
  const { useMedia } = await import('../components/media/MediaContent');
  function Probe() {
    const s = useMedia('video');
    useEffect(() => {
      state = s;
    });
    return null;
  }
  await mount(createElement(Probe), 30);
  await act(async () => {
    await state!.openItem('lib-1');
  });
  await settle(20);
}

describe('MediaContent Whisper through the queue', () => {
  it('a library file is queued for this window, not transcribed in a private worker', async () => {
    await mountHook();
    await act(async () => {
      await state!.runGeneration('app://media/lib-1');
    });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ mediaId: 'lib-1', cardOptions: expect.objectContaining({ createCards: false }) }));
    expect(workers).toHaveLength(0);
    expect(state!.generating).toBe(true);

    await act(async () => {
      progressCb?.({ mediaId: 'lib-1', title: 't', phase: 'transcribing', done: 0, total: 3, startedAt: 0, modelDownload: { percent: 30 } });
    });
    expect(state!.genMsg).toContain('30%');

    await act(async () => {
      progressCb?.({ mediaId: 'lib-1', title: 't', phase: 'done', done: 3, total: 3, startedAt: 0 });
    });
    await settle(30);
    expect(state!.genState).toBe('done');
    expect(state!.cues.map((c) => c.text)).toEqual(['猫です。', '犬です。']);
  });

  it('Cancel cancels the queue job, and a late event for it is ignored', async () => {
    await mountHook();
    await act(async () => {
      await state!.runGeneration('app://media/lib-1');
    });
    await act(async () => {
      state!.stopGeneration();
    });
    expect(cancel).toHaveBeenCalledWith('lib-1');
    expect(state!.generating).toBe(false);
    await act(async () => {
      progressCb?.({ mediaId: 'lib-1', title: 't', phase: 'done', done: 3, total: 3, startedAt: 0 });
    });
    await settle(30);
    expect(state!.cues).toEqual([]);
  });

  it('progress for another file is not this player\'s', async () => {
    await mountHook();
    await act(async () => {
      await state!.runGeneration('app://media/lib-1');
    });
    await act(async () => {
      progressCb?.({ mediaId: 'other', title: 't', phase: 'error', done: 0, total: 0, startedAt: 0, error: 'x' });
    });
    expect(state!.genError).toBe('');
    expect(state!.generating).toBe(true);
  });
});
