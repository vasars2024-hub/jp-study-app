// @vitest-environment node
/**
 * extensionRecordingFinalizer.ts: an uploaded extension recording becomes a
 * library item. ffmpeg, ingest and the Whisper queue are stubbed; the test
 * pins the decisions the module makes around them.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  probe: { ok: true, hasVideo: true, hasAudio: true } as { ok: boolean; hasVideo: boolean; hasAudio: boolean },
  finalizeOk: true,
  finalizeCalls: [] as Array<Record<string, unknown>>,
  ingestCalls: [] as Array<{ paths: string[]; meta: unknown; kind: string }>,
  ingestResult: [{ id: 'media-1' }] as Array<{ id: string }>,
  ingestThrows: false,
  transcriptions: [] as Array<{ mediaId: string; lang: string }>,
  finalizer: null as unknown,
}));

vi.mock('../recordingFinalize', () => ({
  probeRecording: async () => h.probe,
  finalizeRecording: (opts: Record<string, unknown>) => {
    h.finalizeCalls.push(opts);
    return {
      done: Promise.resolve(
        h.finalizeOk ? { ok: true, output: String(opts.output) } : { ok: false, error: 'ffmpeg failed' },
      ),
    };
  },
}));
vi.mock('../mediaIngest', () => ({
  ingestMediaPaths: async (paths: string[], meta: unknown, kind: string) => {
    h.ingestCalls.push({ paths, meta, kind });
    if (h.ingestThrows) throw new Error('db locked');
    return h.ingestResult;
  },
}));
vi.mock('../transcriptionJobs', () => ({
  enqueueTranscription: (job: { mediaId: string; lang: string }) => h.transcriptions.push(job),
}));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => 'ja' }));
vi.mock('../extensionRecordings', () => ({
  setRecordingFinalizer: (fn: unknown) => {
    h.finalizer = fn;
  },
}));

import { finalizeExtensionRecording, installExtensionRecordingFinalizer } from '../extensionRecordingFinalizer';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extfin-'));
let n = 0;
function webm(): string {
  n += 1;
  const file = path.join(dir, `rec-${n}.webm`);
  fs.writeFileSync(file, 'webm');
  return file;
}
const OPTS = { source: 'extension-tab' as const, title: 'A page', durationMs: 6000, transcribe: true, recordingId: 'rec-1' };

beforeEach(() => {
  h.probe = { ok: true, hasVideo: true, hasAudio: true };
  h.finalizeOk = true;
  h.finalizeCalls.length = 0;
  h.ingestCalls.length = 0;
  h.ingestResult = [{ id: 'media-1' }];
  h.ingestThrows = false;
  h.transcriptions.length = 0;
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('finalizeExtensionRecording', () => {
  it('converts a video recording to MP4 (no second crop), removes the WebM, ingests and queues Whisper', async () => {
    const file = webm();
    const res = await finalizeExtensionRecording(file, OPTS);
    expect(h.finalizeCalls[0]).toMatchObject({ input: file, crop: null, quality: 'standard', durationHintSec: 6 });
    expect(String(h.finalizeCalls[0].output)).toMatch(/rec-\d+\.mp4$/);
    expect(fs.existsSync(file)).toBe(false);
    expect(h.ingestCalls[0]).toMatchObject({ kind: 'recording', meta: { title: 'A page' } });
    expect(h.ingestCalls[0].paths[0]).toMatch(/\.mp4$/);
    expect(h.transcriptions).toEqual([{ mediaId: 'media-1', lang: 'ja' }]);
    expect(res).toMatchObject({ ok: true, mediaId: 'media-1' });
  });

  it('never overwrites an existing MP4 next to the recording', async () => {
    const file = webm();
    fs.writeFileSync(file.replace(/\.webm$/, '.mp4'), 'older');
    await finalizeExtensionRecording(file, OPTS);
    expect(String(h.finalizeCalls[0].output)).toMatch(/rec-\d+ \(2\)\.mp4$/);
  });

  it('ingests a tab-audio (no video) recording as WebM, without ffmpeg', async () => {
    h.probe = { ok: true, hasVideo: false, hasAudio: true };
    const file = webm();
    const res = await finalizeExtensionRecording(file, OPTS);
    expect(h.finalizeCalls).toHaveLength(0);
    expect(h.ingestCalls[0].paths).toEqual([file]);
    expect(fs.existsSync(file)).toBe(true);
    expect(res).toMatchObject({ ok: true, mediaId: 'media-1', path: file });
  });

  it('keeps the WebM and reports the error when ffmpeg fails', async () => {
    h.finalizeOk = false;
    const file = webm();
    const res = await finalizeExtensionRecording(file, OPTS);
    expect(res).toEqual({ ok: false, path: file, error: 'ffmpeg failed' });
    expect(fs.existsSync(file)).toBe(true);
    expect(h.ingestCalls).toHaveLength(0);
  });

  it('skips transcription when it was turned off, or when the file has no audio', async () => {
    await finalizeExtensionRecording(webm(), { ...OPTS, transcribe: false });
    h.probe = { ok: true, hasVideo: true, hasAudio: false };
    await finalizeExtensionRecording(webm(), OPTS);
    expect(h.transcriptions).toHaveLength(0);
  });

  it('still succeeds (file kept) when the library import fails, and says so', async () => {
    h.ingestThrows = true;
    const res = await finalizeExtensionRecording(webm(), OPTS);
    expect(res).toMatchObject({ ok: true, error: 'import' });
    expect(res.mediaId).toBeUndefined();
    expect(h.transcriptions).toHaveLength(0);
  });

  it('is what installExtensionRecordingFinalizer registers', () => {
    installExtensionRecordingFinalizer();
    expect(h.finalizer).toBe(finalizeExtensionRecording);
  });
});
