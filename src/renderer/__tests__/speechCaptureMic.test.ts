// @vitest-environment jsdom
/**
 * `startMicRecording` against a FAKE `getUserMedia` and `MediaRecorder` (never the
 * real microphone): when the recorder cannot be created or started, the stream
 * the browser already opened is stopped, so the microphone (and the OS mic
 * indicator) is never left on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startMicRecording } from '../speechCapture';

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

function installMic(stream: unknown): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(async () => stream) },
    configurable: true,
  });
}

describe('startMicRecording: the microphone is never left open', () => {
  it('a recorder that cannot be created stops the opened stream', async () => {
    const { track, stream } = fakeStream();
    installMic(stream);
    const Recorder = vi.fn(function Recorder() {
      throw new Error('NotSupportedError');
    }) as unknown as typeof MediaRecorder;
    (Recorder as unknown as { isTypeSupported: () => boolean }).isTypeSupported = () => false;
    vi.stubGlobal('MediaRecorder', Recorder);
    await expect(startMicRecording()).rejects.toThrow('NotSupportedError');
    expect(track.stop).toHaveBeenCalled();
  });

  it('a recorder that cannot start stops the opened stream', async () => {
    const { track, stream } = fakeStream();
    installMic(stream);
    class Recorder {
      static isTypeSupported(): boolean {
        return true;
      }
      mimeType = 'audio/webm';
      state = 'inactive';
      ondataavailable: unknown = null;
      onstop: unknown = null;
      start(): void {
        throw new Error('InvalidStateError');
      }
      stop(): void {}
    }
    vi.stubGlobal('MediaRecorder', Recorder);
    await expect(startMicRecording()).rejects.toThrow('InvalidStateError');
    expect(track.stop).toHaveBeenCalled();
  });

  it('no MediaRecorder at all: refused before the microphone is asked for', async () => {
    const { stream } = fakeStream();
    installMic(stream);
    vi.stubGlobal('MediaRecorder', undefined);
    await expect(startMicRecording()).rejects.toThrow('mic-unsupported');
    expect((navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
