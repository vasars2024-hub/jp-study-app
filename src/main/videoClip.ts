/**
 * IPC binding for clip extraction.
 *
 * Nothing but the binding: the extractor itself is in `videoClipExtract.ts` so
 * the suite can run it against a real ffmpeg without importing `electron`.
 */
import { ipcMain } from 'electron';
import { extractVideoClip, type VideoClipResult } from './videoClipExtract';
import type { VideoClipRequest } from '../shared/videoClip';

export type { VideoClipResult };

export function registerVideoClipIpc(): void {
  ipcMain.handle(
    'video:extractClip',
    (_event, request: VideoClipRequest): Promise<VideoClipResult> =>
      extractVideoClip(request),
  );
}
