// @vitest-environment node
/**
 * Scorecard bug 30 / the Whisper row: the queue's 30 s slices were cut back to back, so a
 * line spoken across a slice mark was heard as two halves. Each slice now carries a few
 * seconds past its mark; a line that starts before the mark is kept whole, its re-heard
 * tail in the next slice is dropped, and nothing is written twice. Whisper is faked: the
 * test plays the renderer and answers each slice.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userData: '',
  sent: [] as Array<{ channel: string; payload: Record<string, unknown> }>,
  reply: null as null | ((payload: Record<string, unknown>) => void),
  // 65 s of 16 kHz float PCM: three slices (30 + 30 + 5).
  pcmBytes: 16_000 * 4 * 65,
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: () => false,
      isAlwaysOnTop: () => false,
      webContents: {
        id: 1,
        isDestroyed: () => false,
        send: (channel: string, payload: Record<string, unknown>) => {
          h.sent.push({ channel, payload });
          if (channel === 'transcription:chunk-request') h.reply?.(payload);
        },
      },
    }],
  },
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
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => 'ja' }));

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-overlap-'));

import {
  enqueueTranscription,
  onMainTranscriptionProgress,
  registerTranscriptionIpc,
  resolveTranscriptionChunk,
} from '../transcriptionJobs';

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

describe('overlapping transcription slices', () => {
  it('hears a line across the 30 s mark whole, once, and sends each slice with its tail', async () => {
    const patches: Array<Record<string, unknown>> = [];
    registerTranscriptionIpc({
      listItems: () => [{
        id: 'ov-1',
        title: 'Overlap',
        fileName: 'ov.mkv',
        path: path.join(h.userData, 'ov.mkv'),
        subtitles: [],
      }] as never,
      patchItems: (_ids, patch) => patches.push(patch as Record<string, unknown>),
    });
    // What Whisper says for each slice, in seconds relative to the slice.
    const answers = [
      [
        { start: 10, end: 12, text: 'いち' },
        { start: 28.5, end: 33, text: 'またがるセリフ' },
        { start: 33.2, end: 34.9, text: 'つぎ' },
      ],
      [
        { start: 0, end: 3, text: 'リフ' }, // the tail of the line above, heard again
        { start: 3.2, end: 4.9, text: 'つぎ' }, // the line slice 1 left to this one
        { start: 10, end: 12, text: 'に' },
      ],
      [{ start: 1, end: 2, text: 'さん' }],
    ];
    let call = 0;
    h.reply = (payload) => {
      const cues = answers[call] ?? [];
      call += 1;
      queueMicrotask(() => resolveTranscriptionChunk(String(payload.id), {
        ok: true,
        text: cues.map((cue) => cue.text).join(' '),
        cues,
      } as never));
    };
    const done = new Promise<string>((resolve) => {
      const off = onMainTranscriptionProgress((p) => {
        if (p.mediaId === 'ov-1' && (p.phase === 'done' || p.phase === 'error')) {
          off();
          resolve(p.phase);
        }
      });
    });
    expect(enqueueTranscription({
      mediaId: 'ov-1',
      lang: 'ja',
      cardOptions: { createCards: false, translateToEnglish: false, includeAudio: false },
    }, 1).ok).toBe(true);
    expect(await done).toBe('done');

    const seconds = h.sent
      .filter((s) => s.channel === 'transcription:chunk-request')
      .map((s) => Buffer.from(String(s.payload.pcmBase64), 'base64').length / 4 / 16_000);
    expect(seconds).toEqual([35, 35, 5]);

    const record = (patches.at(-1)?.subtitles as Array<{ path: string }>)[0];
    const srt = fs.readFileSync(path.join(h.userData, record.path), 'utf-8');
    const lines = srt.split(/\r?\n/).filter((line) => line && !/^\d+$/.test(line) && !line.includes('-->'));
    expect(lines).toEqual(['いち', 'またがるセリフ', 'つぎ', 'に', 'さん']);
    expect(srt).toContain('00:00:28,500 --> 00:00:33,000\nまたがるセリフ');
    expect(srt).toContain('00:00:33,200 --> 00:00:34,900\nつぎ');
  });
});
