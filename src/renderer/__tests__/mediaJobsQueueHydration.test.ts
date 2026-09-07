// @vitest-environment jsdom

/**
 * D246 — the restored transcription queue was invisible.
 *
 * `useMediaJobs` collapses four main-process channels into one list, and all four
 * were push-only. That is right for work that starts while the window is open, but
 * the transcription queue persists to userData and is restored at boot
 * (`transcriptionJobs.ts` `loadQueue` + `scheduleDrain`), so after a restart there
 * can be real pending work that has broadcast nothing yet. The panel showed
 * nothing. `transcriptionQueue()` — the route that answers this — had no caller
 * anywhere in the renderer, which is how D245's scan surfaced it.
 *
 * The store is module level with a one-shot `wired` flag, so each case re-imports.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Job = { mediaId: string; title: string; lang: string; queuedAt: number; attempts: number };

let queueReply: Job[] | undefined;
let queueCalls = 0;
const progressListeners: Array<(p: unknown) => void> = [];

function installApi(over: Record<string, unknown> = {}): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    transcriptionQueue: () => {
      queueCalls++;
      return Promise.resolve(queueReply);
    },
    onTranscriptionProgress: (fn: (p: unknown) => void) => {
      progressListeners.push(fn);
      return () => undefined;
    },
    onMediaMetadataProgress: () => () => undefined,
    onSubtitleDiscoveryProgress: () => () => undefined,
    onYtDownloadProgress: () => () => undefined,
    ...over,
  };
}

async function loadStore(): Promise<typeof import('../components/media/library/useMediaJobs')> {
  vi.resetModules();
  return import('../components/media/library/useMediaJobs');
}

beforeEach(() => {
  queueReply = undefined;
  queueCalls = 0;
  progressListeners.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { api?: unknown }).api;
});

describe('D246 — useMediaJobs hydrates from the persisted transcription queue', () => {
  it('shows a restored job that has broadcast no progress yet', async () => {
    queueReply = [{ mediaId: 'm1', title: 'ep 1', lang: 'ja', queuedAt: 1_000, attempts: 0 }];
    installApi();
    const mod = await loadStore();

    mod.useMediaJobsStoreForTest.subscribe(() => undefined);
    await vi.waitFor(() => expect(mod.useMediaJobsStoreForTest.read().jobs).toHaveLength(1));

    const { jobs } = mod.useMediaJobsStoreForTest.read();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: 'transcription:m1',
      kind: 'transcription',
      title: 'ep 1',
      phase: 'queued',
      finished: false,
    });
  });

  it('does not overwrite a job the push channel already reported', async () => {
    queueReply = [{ mediaId: 'm1', title: 'stale title', lang: 'ja', queuedAt: 1_000, attempts: 0 }];
    let release = (): void => undefined;
    installApi({
      transcriptionQueue: () =>
        new Promise<Job[]>((resolve) => {
          release = () => resolve(queueReply as Job[]);
        }),
    });
    const mod = await loadStore();
    mod.useMediaJobsStoreForTest.subscribe(() => undefined);

    // Progress arrives before the queue snapshot resolves — the live one must win.
    progressListeners[0]?.({ mediaId: 'm1', title: 'live title', phase: 'transcribing', done: 3, total: 10 });
    release();
    await vi.waitFor(() => expect(mod.useMediaJobsStoreForTest.read().jobs[0].phase).toBe('transcribing'));

    const { jobs } = mod.useMediaJobsStoreForTest.read();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('live title');
  });

  it('survives a missing route and an unusable reply without breaking the panel', async () => {
    installApi({ transcriptionQueue: undefined });
    const noRoute = await loadStore();
    noRoute.useMediaJobsStoreForTest.subscribe(() => undefined);
    expect(noRoute.useMediaJobsStoreForTest.read().jobs).toEqual([]);

    queueReply = undefined;
    installApi();
    const badReply = await loadStore();
    badReply.useMediaJobsStoreForTest.subscribe(() => undefined);
    await vi.waitFor(() => expect(queueCalls).toBe(1));
    expect(badReply.useMediaJobsStoreForTest.read().jobs).toEqual([]);
  });

  it('asks main exactly once, however many components subscribe', async () => {
    queueReply = [{ mediaId: 'm1', title: 'ep 1', lang: 'ja', queuedAt: 1_000, attempts: 0 }];
    installApi();
    const mod = await loadStore();

    mod.useMediaJobsStoreForTest.subscribe(() => undefined);
    mod.useMediaJobsStoreForTest.subscribe(() => undefined);
    mod.useMediaJobsStoreForTest.subscribe(() => undefined);
    await vi.waitFor(() => expect(queueCalls).toBe(1));

    expect(queueCalls).toBe(1);
  });
});
