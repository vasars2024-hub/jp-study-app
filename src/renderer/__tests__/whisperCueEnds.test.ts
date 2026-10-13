// @vitest-environment jsdom
/**
 * Scorecard bug 30, renderer half: a Whisper segment with a start and no end used to reach
 * the transcript's plain text but never its timed cues, so the SRT lost the line. It is now
 * closed at the next segment's start (or given a short default length) and kept.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transcribePcm } from '../whisperTranscribePcm';

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(): void {
    // The test answers through `emit`; nothing is sent to a real worker.
  }
  terminate(): void {
    // Nothing to stop.
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
  for (let i = 0; i < 200 && !FakeWorker.last; i += 1) await new Promise((r) => setTimeout(r, 10));
  expect(FakeWorker.last).toBeTruthy();
  return FakeWorker.last!;
}

describe('transcribePcm keeps a segment that has no end time', () => {
  it('ends it at the next segment, or after a short default when it is the last', async () => {
    const run = transcribePcm(new Float32Array(16_000), 'ja');
    const worker = await started();
    worker.emit({ type: 'status', status: 'transcribing', device: 'wasm', model: 'm' });
    worker.emit({ type: 'partial', cues: [{ start: 1, text: 'いち' }, { start: 3, end: 4, text: 'に' }] });
    worker.emit({ type: 'partial', cues: [{ start: 24, end: Number.NaN, text: 'さん' }] });
    worker.emit({ type: 'done' });
    const result = await run;
    expect(result.ok).toBe(true);
    expect(result.cues).toEqual([
      { start: 1, end: 3, text: 'いち' },
      { start: 3, end: 4, text: 'に' },
      { start: 24, end: 26, text: 'さん' },
    ]);
    expect(result.text).toBe('いち に さん');
  });
});
