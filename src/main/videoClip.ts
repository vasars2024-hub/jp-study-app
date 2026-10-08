/**
 * IPC binding for clip, cue-audio and still extraction.
 *
 * Nothing but the binding: the extractors themselves are in `videoClipExtract.ts`
 * so the suite can run them against a real ffmpeg without importing `electron`.
 */
import { ipcMain } from 'electron';
import {
  extractAudioClip,
  extractVideoClip,
  extractVideoFrame,
  type VideoClipResult,
} from './videoClipExtract';
import type { AudioClipRequest, VideoClipRequest, VideoFrameRequest } from '../shared/videoClip';

export type { VideoClipResult };

export function registerVideoClipIpc(): void {
  ipcMain.handle(
    'video:extractClip',
    (_event, request: VideoClipRequest): Promise<VideoClipResult> =>
      extractVideoClip(request),
  );
  ipcMain.handle(
    'video:extractAudioClip',
    (_event, request: AudioClipRequest): Promise<VideoClipResult> =>
      extractAudioClip(request),
  );
  ipcMain.handle(
    'video:extractFrame',
    (_event, request: VideoFrameRequest): Promise<VideoClipResult> =>
      extractVideoFrame(request),
  );
}
