// @vitest-environment node
/**
 * F5 follow-ups for the Whisper queue:
 *  - A first-run model download inside the first chunk must not trip the 120 s
 *    chunk timeout: the timeout starts at `model-ready`; while the model loads,
 *    only a download that stops reporting progress times out. The job shows the
 *    download's progress meanwhile.
 *  - A chunk that times out, and the chunk of a job the user cancels, are
 *    stopped in the renderer (`transcription:chunk-cancel`), not left running.
 * Whisper is faked: the test plays the renderer.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userData: '',
  sent: [] as Array<{ channel: string; payload: Record<string, unknown> }>,
  requests: [] as string[],
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: () => false,
      isAlwaysOnTop: () => false,
      webContents: {
        id: 7,
        isDestroyed: () => false,
        send: (channel: string, payload: Record<string, unknown>) => {
          h.sent.push({ channel, payload });
          if (channel === 'transcription:chunk-request') h.requests.push(String(payload.id));
        },
      },
    }],
  },
}));
vi.mock('../media', () => ({
  // 2 s of audio: one chunk.
  extractAudioPcm: async () => new ArrayBuffer(16_000 * 4 * 2),
  extractAudioPcmRange: async () => new ArrayBuffer(16_000 * 4 * 2),
}));
vi.mock('../flashcardAudio', () => ({
  extractFlashcardAudioClip: async () => undefined,
  pruneMediaClips: () => undefined,
}));
vi.mock('../translate', () => ({ isTranslateAvailable: () => false, runTranslationBatch: async () => [] }));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => 'ja' }));

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-model-'));

import {
  __transcriptionTestables,
  cancelTranscription,
  enqueueTranscription,
  onMainTranscriptionProgress,
  registerTranscriptionIpc,
  resolveTranscriptionChunk,
} from '../transcriptionJobs';
import type { TranscriptionProgress } from '../../shared/transcriptionIpc';

const items = ['dl-1', 'stall-1', 'cancel-1'].map((id) => ({
  id,
  title: id,
  fileName: `${id}.mkv`,
  path: path.join(h.userData, `${id}.mkv`),
  subtitles: [],
}));

const events: TranscriptionProgress[] = [];
let off: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  h.sent.length = 0;
  h.requests.length = 0;
  events.length = 0;
  registerTranscriptionIpc({ listItems: () => items as never, patchItems: () => undefined });
  off = onMainTranscriptionProgress((p) => events.push(p));
});

afterEach(() => {
  off();
  vi.useRealTimers();
});

afterAll(() => fs.rmSync(h.userData, { recursive: true, force: true }));

const SEC = 1000;
const cancels = () => h.sent.filter((s) => s.channel === 'transcription:chunk-cancel').map((s) => s.payload.id);
const lastPhase = (mediaId: string) => events.filter((e) => e.mediaId === mediaId).at(-1)?.phase;

async function firstRequest(): Promise<string> {
  for (let i = 0; i < 50 && !h.requests.length; i += 1) await vi.advanceTimersByTimeAsync(1);
  expect(h.requests.length).toBeGreaterThan(0);
  return h.requests[0];
}

describe('a first-run model download', () => {
  it('runs past 120 s without timing out while it reports progress, and shows it', async () => {
    enqueueTranscription({ mediaId: 'dl-1', lang: 'ja' }, 7);
    const id = await firstRequest();
    resolveTranscriptionChunk(id, { stage: 'model-loading', progress: 10 });
    await vi.advanceTimersByTimeAsync(100 * SEC);
    resolveTranscriptionChunk(id, { stage: 'model-loading', progress: 55 });
    await vi.advanceTimersByTimeAsync(100 * SEC);
    resolveTranscriptionChunk(id, { stage: 'model-loading', progress: 100 });
    await vi.advanceTimersByTimeAsync(100 * SEC);
    // 300 s in: far past the old 120 s budget, still the same chunk.
    expect(h.requests).toEqual([id]);
    expect(cancels()).toEqual([]);
    resolveTranscriptionChunk(id, { stage: 'model-ready' });
    await vi.advanceTimersByTimeAsync(60 * SEC);
    resolveTranscriptionChunk(id, { ok: true, text: '猫です。', cues: [{ start: 0, end: 1, text: '猫です。' }] });
    await vi.advanceTimersByTimeAsync(10);
    expect(lastPhase('dl-1')).toBe('done');
    const downloads = events.filter((e) => e.mediaId === 'dl-1' && e.modelDownload).map((e) => e.modelDownload?.percent);
    expect(downloads).toEqual([10, 55, 100]);
    // Ready clears it: the next event carries no download.
    const readyIndex = events.findIndex((e, i) => i > 0 && e.mediaId === 'dl-1' && !e.modelDownload && events[i - 1].modelDownload);
    expect(readyIndex).toBeGreaterThan(0);
  });

  it('times out a download that stops reporting, and stops the stalled worker', async () => {
    enqueueTranscription({ mediaId: 'stall-1', lang: 'ja' }, 7);
    const id = await firstRequest();
    resolveTranscriptionChunk(id, { stage: 'model-loading', progress: 5 });
    await vi.advanceTimersByTimeAsync(__transcriptionTestables.MODEL_STALL_TIMEOUT_MS + SEC);
    expect(cancels()).toContain(id);
    // Each retry that also stalls is stopped the same way, not left running.
    for (let i = 0; i < 400 && !events.some((e) => e.mediaId === 'stall-1' && e.phase === 'error'); i += 1) {
      await vi.advanceTimersByTimeAsync(SEC);
    }
    expect(events.some((e) => e.mediaId === 'stall-1' && e.phase === 'error' && e.error === 'chunk-timeout')).toBe(true);
    const askedBeforeError = h.requests.slice(0, 3);
    expect(askedBeforeError).toHaveLength(3);
    expect(cancels().slice(0, 3)).toEqual(askedBeforeError);
    // The queue retries the job later; cancelling it stops that chunk too.
    await vi.advanceTimersByTimeAsync(10);
    cancelTranscription('stall-1');
    await vi.advanceTimersByTimeAsync(10);
    expect(cancels()).toEqual(h.requests);
    expect(__transcriptionTestables.pendingChunkCount()).toBe(0);
  });
});

describe('cancel stops the chunk in flight', () => {
  it('terminates the renderer worker and ends the job at once', async () => {
    enqueueTranscription({ mediaId: 'cancel-1', lang: 'ja' }, 7);
    const id = await firstRequest();
    resolveTranscriptionChunk(id, { stage: 'model-ready' });
    cancelTranscription('cancel-1');
    await vi.advanceTimersByTimeAsync(10);
    expect(cancels()).toEqual([id]);
    expect(lastPhase('cancel-1')).toBe('cancelled');
    expect(__transcriptionTestables.pendingChunkCount()).toBe(0);
    // A late answer from the stopped worker is ignored.
    resolveTranscriptionChunk(id, { ok: true, text: 'late' });
    await vi.advanceTimersByTimeAsync(10);
    expect(lastPhase('cancel-1')).toBe('cancelled');
  });
});
