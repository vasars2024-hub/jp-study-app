import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupertonicSynthesisRequest } from '../../shared/flashcardTtsProtocol';

interface FakeChild {
  postMessage: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  emit(event: 'message' | 'exit', value?: unknown): void;
}

const mocks = vi.hoisted(() => ({ fork: vi.fn() }));

vi.mock('electron', () => ({ utilityProcess: { fork: mocks.fork } }));

import {
  cancelSupertonicSynthesis,
  resetSupertonicHostForTests,
  shutdownSupertonicHost,
  synthesizeWithSupertonic,
} from '../flashcardTtsHost';

function fakeChild(): FakeChild {
  const listeners = new Map<string, Array<(value?: unknown) => void>>();
  return {
    postMessage: vi.fn(),
    kill: vi.fn(),
    emit(event, value) { for (const listener of listeners.get(event) ?? []) listener(value); },
    on(event: string, listener: (value?: unknown) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return this;
    },
  } as FakeChild;
}

function request(id: string): SupertonicSynthesisRequest {
  return {
    kind: 'synthesize',
    id,
    text: '日本語です。',
    language: 'ja',
    voice: 'F1',
    outputPath: `C:/managed/${id}.wav`,
    steps: 5,
    speed: 1.05,
    paths: {
      durationPredictor: 'duration.onnx',
      textEncoder: 'text.onnx',
      vectorEstimator: 'vector.onnx',
      vocoder: 'vocoder.onnx',
      config: 'tts.json',
      unicodeIndexer: 'unicode.json',
      voiceStyle: 'F1.json',
    },
  };
}

beforeEach(() => {
  mocks.fork.mockReset();
  resetSupertonicHostForTests();
});

afterEach(() => shutdownSupertonicHost());

describe('the reusable neural voice worker', () => {
  it('serializes a deck and reuses one loaded worker', async () => {
    const child = fakeChild();
    mocks.fork.mockReturnValue(child);
    const first = synthesizeWithSupertonic(request('first'));
    const second = synthesizeWithSupertonic(request('second'));
    expect(child.postMessage).toHaveBeenCalledTimes(1);
    child.emit('message', {
      kind: 'complete', id: 'first', outputPath: 'C:/managed/first.wav', durationSec: 1, sampleRate: 44_100,
    });
    await expect(first).resolves.toMatchObject({ kind: 'complete', id: 'first' });
    expect(child.postMessage).toHaveBeenCalledTimes(2);
    child.emit('message', {
      kind: 'complete', id: 'second', outputPath: 'C:/managed/second.wav', durationSec: 1, sampleRate: 44_100,
    });
    await expect(second).resolves.toMatchObject({ kind: 'complete', id: 'second' });
    expect(mocks.fork).toHaveBeenCalledTimes(1);
  });

  it('kills only the active request and continues the queued deck in a fresh worker', async () => {
    const firstChild = fakeChild();
    const secondChild = fakeChild();
    mocks.fork.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    const first = synthesizeWithSupertonic(request('cancel-me'));
    const second = synthesizeWithSupertonic(request('keep-me'));
    expect(cancelSupertonicSynthesis('cancel-me')).toBe(true);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((resolve) => queueMicrotask(resolve));
    expect(firstChild.kill).toHaveBeenCalledOnce();
    expect(secondChild.postMessage).toHaveBeenCalledWith(request('keep-me'));
    secondChild.emit('message', {
      kind: 'complete', id: 'keep-me', outputPath: 'C:/managed/keep-me.wav', durationSec: 1, sampleRate: 44_100,
    });
    await expect(second).resolves.toMatchObject({ id: 'keep-me' });
    expect(cancelSupertonicSynthesis('missing')).toBe(false);
  });

  it('reopens after model removal so reinstall does not require an app restart', async () => {
    const beforeRemoval = fakeChild();
    const afterReinstall = fakeChild();
    mocks.fork.mockReturnValueOnce(beforeRemoval).mockReturnValueOnce(afterReinstall);

    const interrupted = synthesizeWithSupertonic(request('before-removal'));
    shutdownSupertonicHost();
    await expect(interrupted).rejects.toThrow('stopped');
    expect(beforeRemoval.kill).toHaveBeenCalledOnce();

    const retried = synthesizeWithSupertonic(request('after-reinstall'));
    afterReinstall.emit('message', {
      kind: 'complete', id: 'after-reinstall', outputPath: 'C:/managed/after-reinstall.wav', durationSec: 1, sampleRate: 44_100,
    });
    await expect(retried).resolves.toMatchObject({ id: 'after-reinstall' });
    expect(mocks.fork).toHaveBeenCalledTimes(2);
  });
});
