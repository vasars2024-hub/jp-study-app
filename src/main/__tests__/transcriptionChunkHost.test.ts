// @vitest-environment node
/**
 * F5: the Whisper queue.
 *  - Each chunk goes to ONE window — the one that asked — not to every open
 *    window (which made N windows transcribe the same slice).
 *  - Chinese "cards from transcript" makes cards (it used to gate on `^ja`).
 *  - A Japanese-only model refusing Chinese audio stops the job with a clear
 *    code instead of writing an empty transcript, and the job is not retried.
 * Whisper itself is faked: the test plays the renderer and answers the chunk.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Sent = { channel: string; payload: Record<string, unknown> };

const h = vi.hoisted(() => ({
  userData: '',
  windows: [] as Array<{
    id: number;
    sent: Array<{ channel: string; payload: Record<string, unknown> }>;
    reply?: (payload: Record<string, unknown>) => void;
  }>,
  pcmBytes: 16_000 * 4 * 2,
}));

function fakeWindow(id: number) {
  return {
    isDestroyed: () => false,
    isAlwaysOnTop: () => false,
    webContents: {
      id,
      isDestroyed: () => false,
      send: (channel: string, payload: Record<string, unknown>) => {
        const win = h.windows.find((w) => w.id === id)!;
        win.sent.push({ channel, payload });
        if (channel === 'transcription:chunk-request') win.reply?.(payload);
      },
    },
  };
}

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => h.windows.map((w) => fakeWindow(w.id)) },
}));
vi.mock('../media', () => ({
  extractAudioPcm: async () => new ArrayBuffer(h.pcmBytes),
  extractAudioPcmRange: async () => new ArrayBuffer(h.pcmBytes),
}));
vi.mock('../flashcardAudio', () => ({
  extractFlashcardAudioClip: async () => undefined,
  pruneMediaClips: () => undefined,
}));
vi.mock('../translate', () => ({
  isTranslateAvailable: () => false,
  runTranslationBatch: async () => [],
}));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => 'zh' }));

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-host-'));

import {
  enqueueTranscription,
  onMainTranscriptionProgress,
  registerTranscriptionIpc,
  resolveTranscriptionChunk,
  transcriptionQueue,
} from '../transcriptionJobs';

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

const patches: Array<{ ids: readonly string[]; patch: Record<string, unknown> }> = [];
const items = ['zh-1', 'zh-2', 'ja-1', 'zh-3'].map((id) => ({
  id,
  title: `Episode ${id}`,
  fileName: `${id}.mkv`,
  path: path.join(h.userData, `${id}.mkv`),
  subtitles: [],
}));

beforeEach(() => {
  patches.length = 0;
  h.windows = [{ id: 1, sent: [] }, { id: 2, sent: [] }];
  registerTranscriptionIpc({
    listItems: () => items as never,
    patchItems: (ids, patch) => patches.push({ ids, patch: patch as Record<string, unknown> }),
  });
});

function answerWith(result: Record<string, unknown>) {
  return (payload: Record<string, unknown>) => {
    queueMicrotask(() => resolveTranscriptionChunk(String(payload.id), result as never));
  };
}

const ofChannel = (sent: Sent[], channel: string) => sent.filter((s) => s.channel === channel);

async function waitForPhase(mediaId: string, phases: string[]): Promise<{ phase: string; error?: string }> {
  return new Promise((resolve) => {
    const off = onMainTranscriptionProgress((p) => {
      if (p.mediaId === mediaId && phases.includes(p.phase)) {
        off();
        resolve({ phase: p.phase, error: p.error });
      }
    });
  });
}

describe('one window per chunk', () => {
  it('sends every chunk and the cards batch to the requesting window only', async () => {
    h.windows[1].reply = answerWith({
      ok: true,
      text: '我很好。你呢？',
      cues: [{ start: 0, end: 1.5, text: '我很好。你呢？' }],
    });
    h.windows[0].reply = () => {
      throw new Error('window 1 must not be asked');
    };
    const done = waitForPhase('zh-1', ['done', 'error']);
    expect(enqueueTranscription({
      mediaId: 'zh-1',
      lang: 'zh',
      cardOptions: { createCards: true, translateToEnglish: false, includeAudio: false },
    }, 2).ok).toBe(true);
    expect(await done).toEqual({ phase: 'done', error: undefined });

    expect(ofChannel(h.windows[1].sent, 'transcription:chunk-request')).toHaveLength(1);
    expect(ofChannel(h.windows[0].sent, 'transcription:chunk-request')).toHaveLength(0);

    // Chinese transcripts make cards now, delivered once, to the same window.
    const cards = ofChannel(h.windows[1].sent, 'transcription:cards-ready');
    expect(cards).toHaveLength(1);
    expect(ofChannel(h.windows[0].sent, 'transcription:cards-ready')).toHaveLength(0);
    const batch = cards[0].payload as { batchId: string; cards: Array<{ sentence: string }> };
    expect(batch.batchId).toBe('transcription:zh-1:zh');
    expect(batch.cards.map((c) => c.sentence)).toEqual(['我很好。', '你呢？']);
  });

  it('a job with no requester (restored at boot) still goes to exactly one window', async () => {
    for (const w of h.windows) {
      w.reply = answerWith({ ok: true, text: '你好。', cues: [{ start: 0, end: 1, text: '你好。' }] });
    }
    const done = waitForPhase('zh-2', ['done', 'error']);
    enqueueTranscription({ mediaId: 'zh-2', lang: 'zh', cardOptions: { createCards: false, translateToEnglish: false, includeAudio: false } });
    await done;
    const asked = h.windows.map((w) => ofChannel(w.sent, 'transcription:chunk-request').length);
    expect(asked.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('Japanese keeps its batch id, so a re-run still replaces the old batch', async () => {
    h.windows[0].reply = answerWith({ ok: true, text: '猫です。', cues: [{ start: 0, end: 1, text: '猫です。' }] });
    const done = waitForPhase('ja-1', ['done', 'error']);
    enqueueTranscription({ mediaId: 'ja-1', lang: 'ja', cardOptions: { createCards: true, translateToEnglish: false, includeAudio: false } }, 1);
    await done;
    const cards = ofChannel(h.windows[0].sent, 'transcription:cards-ready');
    expect((cards[0].payload as { batchId: string }).batchId).toBe('transcription:ja-1:ja');
  });
});

describe('a Japanese-only model and Chinese audio', () => {
  it('stops the job with the multilingual-model code and does not retry it', async () => {
    h.windows[1].reply = answerWith({ ok: false, error: 'multilingual-model-required' });
    const ended = waitForPhase('zh-3', ['done', 'error']);
    enqueueTranscription({ mediaId: 'zh-3', lang: 'zh' }, 2);
    expect(await ended).toEqual({ phase: 'error', error: 'multilingual-model-required' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transcriptionQueue().some((job) => job.mediaId === 'zh-3')).toBe(false);
    // No empty transcript was written for it.
    expect(patches.some((p) => p.ids.includes('zh-3'))).toBe(false);
  });
});
