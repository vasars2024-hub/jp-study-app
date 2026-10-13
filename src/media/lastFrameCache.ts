/**
 * The last frame a video showed, kept as a small JPEG so the next open of that file starts
 * on the picture the viewer left — before the media has loaded a single byte.
 *
 * In memory only, for the session: a few dozen ~10 KB thumbnails. Across restarts the
 * library's own artwork (an episode still, a generated thumbnail) is the opening frame
 * instead; persisting these would spend the renderer's localStorage quota, which the deck
 * shares.
 */
import { playbackPathKey } from './playbackPlanClient';

const MAX_ENTRIES = 32;
const HEIGHT = 180;
const frames = new Map<string, string>();

/** Remember what `video` shows now, for `filePath`. Silent on any failure (a tainted canvas, no frame yet). */
export function rememberLastFrame(filePath: string | null | undefined, video: HTMLVideoElement | null | undefined): void {
  if (!filePath || !video) return;
  try {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const height = Math.min(HEIGHT, video.videoHeight);
    const width = Math.round((video.videoWidth / video.videoHeight) * height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.drawImage(video, 0, 0, width, height);
    const url = canvas.toDataURL('image/jpeg', 0.72);
    if (!url.startsWith('data:image/jpeg')) return;
    const key = playbackPathKey(filePath);
    frames.delete(key);
    frames.set(key, url);
    while (frames.size > MAX_ENTRIES) {
      const oldest = frames.keys().next().value;
      if (oldest === undefined) break;
      frames.delete(oldest);
    }
  } catch {
    /* cross-origin frame or a GPU hiccup: the poster will do */
  }
}

export function lastFrameFor(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  return frames.get(playbackPathKey(filePath)) ?? null;
}
