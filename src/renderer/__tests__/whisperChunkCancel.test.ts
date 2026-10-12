// @vitest-environment jsdom
/**
 * The renderer half of the Whisper queue fixes:
 *  - `transcribePcm` reports model download/load progress (aggregated across
 *    the model's files) and the moment the model is ready, so main can hold the
 *    chunk timeout until then;
 *  - aborting really stops the work: the worker is terminated at once;
 *  - the player's status line shows the download instead of "0 of N".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelProgressTracker, transcribePcm } from '../whisperTranscribePcm';
import { playerWhisperView } from '../../media/playerTranscription';

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

beforeEach(() => {
  localStorage.clear();
  FakeWorker.last = null;
  vi.stubGlobal('Worker', FakeWorker);
});

async function started(): Promise<FakeWorker> {
  // The model-tier modules are imported lazily inside transcribePcm.
  for (let i = 0; i < 200 && !FakeWorker.last; i += 1) await new Promise((r) => setTimeout(r, 10));
  expect(FakeWorker.last).toBeTruthy();
  return FakeWorker.last!;
}

describe('createModelProgressTracker', () => {
  it('aggregates bytes across files, and is null until a size is known', () => {
    const track = createModelProgressTracker();
    expect(track({ status: 'initiate', file: 'a.onnx' })).toBeNull();
    expect(track({ status: 'progress', file: 'a.onnx', loaded: 50, total: 100 })).toBe(50);
    expect(track({ status: 'progress', file: 'b.onnx', loaded: 0, total: 300 })).toBe(13);
    expect(track({ status: 'done', file: 'a.onnx' })).toBe(25);
    expect(track({ status: 'progress', file: 'b.onnx', loaded: 300, total: 300 })).toBe(100);
  });
});

describe('transcribePcm', () => {
  it('reports the model download and readiness, then the transcript', async () => {
    const loading: Array<number | null> = [];
    const ready = vi.fn();
    const run = transcribePcm(new Float32Array(16_000), 'ja', { onModelLoading: (p) => loading.push(p), onModelReady: ready });
    const worker = await started();
    worker.emit({ type: 'progress', status: 'progress', file: 'encoder.onnx', loaded: 25, total: 100 });
    worker.emit({ type: 'progress', status: 'progress', file: 'encoder.onnx', loaded: 100, total: 100 });
    worker.emit({ type: 'status', status: 'transcribing', device: 'wasm', model: 'm' });
    worker.emit({ type: 'progress', status: 'progress', file: 'late.onnx', loaded: 1, total: 2 });
    worker.emit({ type: 'partial', cues: [{ start: 0, end: 1, text: '猫' }] });
    worker.emit({ type: 'done' });
    await expect(run).resolves.toMatchObject({ ok: true, text: '猫' });
    expect(loading).toEqual([25, 100]);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(worker.terminated).toBe(true);
  });

  it('an abort terminates the worker at once and resolves cancelled', async () => {
    const controller = new AbortController();
    const run = transcribePcm(new Float32Array(16_000), 'ja', { signal: controller.signal });
    const worker = await started();
    controller.abort();
    await expect(run).resolves.toEqual({ ok: false, error: 'cancelled' });
    expect(worker.terminated).toBe(true);
    // A late message from it changes nothing.
    worker.emit({ type: 'done' });
  });

  it('an already-aborted signal starts no worker', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(transcribePcm(new Float32Array(16_000), 'ja', { signal: controller.signal })).resolves.toEqual({ ok: false, error: 'cancelled' });
    expect(FakeWorker.last).toBeNull();
  });
});

describe('playerWhisperView during a model download', () => {
  const base = { mediaId: 'm', title: 't', phase: 'transcribing' as const, done: 0, total: 40, startedAt: 0 };
  it('shows the download with its percent, then the chunks', () => {
    expect(playerWhisperView({ ...base, modelDownload: { percent: 42 } })).toEqual({
      state: 'loading',
      progress: 0.42,
      messageKey: 'media.jobs.modelDownloading',
      messageParams: { percent: 42 },
    });
    expect(playerWhisperView({ ...base, modelDownload: { percent: null } })).toMatchObject({ messageKey: 'media.jobs.modelLoading' });
    expect(playerWhisperView(base)).toMatchObject({ state: 'transcribing', messageKey: 'studyLoop2.whisper.chunks' });
  });
});
