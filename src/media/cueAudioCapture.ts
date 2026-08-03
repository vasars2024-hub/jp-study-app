/**
 * Record the audio of one cue, from a video OR an audio element.
 *
 * This lived inside `VideoCoreMiningPanel` and was typed to `HTMLVideoElement`. Nothing
 * about the algorithm is video-specific — `captureStream`, `play`, `pause` and
 * `currentTime` are all `HTMLMediaElement` — and slice 18 needed exactly the same thing for
 * a song, so it moved here typed on the base element rather than being copied. A second
 * copy would be a second set of restore-the-player semantics to get subtly wrong, and this
 * function's `finally` block is the delicate part: it hands the user's playback back
 * exactly as it found it, including whether it was paused.
 *
 * **This is destructive while it runs.** It pauses, seeks, sets rate 1, plays through the
 * cue in real time, then restores. There is no faster way to do it with `MediaRecorder`
 * against an element the user is also listening to, and the caller is expected to say so in
 * its UI rather than let a click appear to freeze the player.
 */
import { t as translateUi } from '../renderer/i18n';

export interface CapturedAsset {
  base64: string;
  filename: string;
  mimeType: string;
  bytes: number;
}

/** `captureStream` is still prefixed on some engines and absent on others. */
type CapturableMedia = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      resolve(value.split(',', 2)[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

export function waitForSeek(media: HTMLMediaElement, target: number): Promise<void> {
  if (Math.abs(media.currentTime - target) < 0.02) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(translateUi('mediaWorkspace.capture.seekTimeout')));
    }, 5000);
    const onSeeked = (): void => {
      cleanup();
      resolve();
    };
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      media.removeEventListener('seeked', onSeeked);
    };
    media.addEventListener('seeked', onSeeked);
    media.currentTime = target;
  });
}

function chooseAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

export interface CueAudioRange {
  startSec: number;
  endSec: number;
  /** Goes into the filename, so a card's audio is traceable to the cue it came from. */
  filenameStem: string;
}

/**
 * The 100 ms floor and 30 s ceiling are not arbitrary: below 100 ms `MediaRecorder` usually
 * yields an empty blob, and above 30 s this would hold the user's player hostage for longer
 * than anyone expects from pressing a button.
 */
export async function recordCueAudio(
  media: HTMLMediaElement,
  range: CueAudioRange,
): Promise<CapturedAsset> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error(translateUi('mediaWorkspace.capture.audioUnavailable'));
  }
  const capturable = media as CapturableMedia;
  const capture = capturable.captureStream?.bind(media)
    ?? capturable.mozCaptureStream?.bind(media);
  if (!capture) {
    throw new Error(translateUi('mediaWorkspace.capture.streamUnavailable'));
  }

  const durationMs = Math.round((range.endSec - range.startSec) * 1000);
  if (durationMs < 100 || durationMs > 30_000) {
    throw new Error(translateUi('mediaWorkspace.capture.durationUnsupported'));
  }

  const wasPaused = media.paused;
  const restoreTime = media.currentTime;
  const restoreRate = media.playbackRate;
  let recorder: MediaRecorder | null = null;
  let capturedStream: MediaStream | null = null;
  let timer = 0;
  try {
    media.pause();
    media.playbackRate = 1;
    await waitForSeek(media, range.startSec);
    const stream = capture();
    capturedStream = stream;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      throw new Error(translateUi('mediaWorkspace.capture.noAudioTrack'));
    }
    const audioStream = new MediaStream(audioTracks);
    const mimeType = chooseAudioMimeType();
    recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    const stopped = new Promise<void>((resolve) => {
      recorder?.addEventListener('stop', () => resolve(), { once: true });
    });
    recorder.start(100);
    await media.play();
    await new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, durationMs);
    });
    media.pause();
    media.currentTime = range.endSec;
    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
    if (!blob.size) throw new Error(translateUi('mediaWorkspace.capture.emptyAudio'));
    const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
    return {
      base64: await blobToBase64(blob),
      filename: `${range.filenameStem}.${extension}`,
      mimeType: blob.type || `audio/${extension}`,
      bytes: blob.size,
    };
  } finally {
    // Hand the player back exactly as it was found, on every path including a throw.
    window.clearTimeout(timer);
    if (recorder?.state === 'recording') recorder.stop();
    capturedStream?.getTracks().forEach((track) => track.stop());
    media.pause();
    media.playbackRate = restoreRate;
    media.currentTime = restoreTime;
    if (!wasPaused) void media.play().catch(() => undefined);
  }
}
