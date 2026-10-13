/**
 * IPC binding for clip, cue-audio and still extraction.
 *
 * Nothing but the binding: the extractors themselves are in `videoClipExtract.ts`
 * so the suite can run them against a real ffmpeg without importing `electron`.
 */
import path from 'node:path';
import { ipcMain } from 'electron';
import { noteE2eWitness } from './e2eHeadless';
import {
  extractAudioClip,
  extractVideoClip,
  extractVideoFrame,
  type VideoClipResult,
} from './videoClipExtract';
import type { AudioClipRequest, VideoClipRequest, VideoFrameRequest } from '../shared/videoClip';

export type { VideoClipResult };

/**
 * What the e2e harness sees of a clip request: the range and padding asked for, and the
 * file by name only. The video flow checks that a mined card's cut honours the learner's
 * padding (`clipPadBeforeMs`), which is otherwise invisible from the page.
 */
export function clipRequestWitness(
  kind: 'audio' | 'video',
  request: AudioClipRequest | VideoClipRequest,
): Record<string, unknown> {
  const r = (request ?? {}) as Partial<AudioClipRequest & VideoClipRequest>;
  return {
    kind,
    file: typeof r.filePath === 'string' ? path.basename(r.filePath) : '',
    startSec: r.startSec,
    endSec: r.endSec,
    padBeforeSec: kind === 'audio' ? r.padBeforeSec : r.padSec,
    padAfterSec: r.padAfterSec,
  };
}

export function registerVideoClipIpc(): void {
  ipcMain.handle(
    'video:extractClip',
    (_event, request: VideoClipRequest): Promise<VideoClipResult> => {
      noteE2eWitness('clip request', clipRequestWitness('video', request));
      return extractVideoClip(request);
    },
  );
  ipcMain.handle(
    'video:extractAudioClip',
    (_event, request: AudioClipRequest): Promise<VideoClipResult> => {
      noteE2eWitness('clip request', clipRequestWitness('audio', request));
      return extractAudioClip(request);
    },
  );
  ipcMain.handle(
    'video:extractFrame',
    (_event, request: VideoFrameRequest): Promise<VideoClipResult> =>
      extractVideoFrame(request),
  );
}
