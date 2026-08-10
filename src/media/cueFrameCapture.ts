/**
 * The current video frame, bounded so it can become an Agent image attachment.
 *
 * `VideoCoreMiningPanel`'s own `captureFrame` is deliberately not reused. That one
 * exists to build an Anki card: it is a full-resolution PNG with the subtitle burned
 * into it, because a card is looked at by a person later. Neither property is right
 * for a question asked of a model now —
 *
 * - **full-resolution PNG is unbounded.** `AGENT_EXECUTION_IMAGE_BYTES_LIMIT` is
 *   4 MiB decoded, and a lossless 4K frame goes past it. An oversize capture is
 *   refused by the staging normalizer, so it would reach the user as
 *   `image-failed` — announced, not silent, but still a question asked without the
 *   picture it was about;
 * - **the burned-in cue is the line twice.** The line already travels as the
 *   context item's own label and preview, in text the prompt builder renders. A
 *   second copy painted over the scene adds nothing the model can use and covers
 *   the part of the frame it would otherwise be looking at.
 *
 * So this is a separate, clean, bounded JPEG, and the policy below is
 * `screenOcr.ts`'s `boundedScreenshotDataUrl` — 1280 longest side at q72, falling
 * back to 800 at q52 then q35, targeting 900 KiB. Deliberately the same ladder: the
 * lens and the player now hand the Agent pictures of the same kind of thing, and
 * two different answers to "how big may a capture be" would be two policies to keep
 * in step.
 */

import {
  AGENT_EXECUTION_IMAGE_BYTES_LIMIT,
  decodedBase64Bytes,
} from '../shared/agentExecutionBridge';
import { splitImageDataUrl } from '../shared/agentImageStaging';

/**
 * What the ladder aims for, well under the lane's hard 4 MiB bound.
 *
 * The bound is what the transport refuses; this is what the transport should not
 * have to think about. A capture that lands here leaves room for a second image and
 * a long prompt in the same request, which is exactly what the two-image limit is
 * for.
 */
export const AGENT_FRAME_TARGET_BYTES = 900 * 1024;

/** Tried in order; the first rung whose result fits the target wins. */
export const AGENT_FRAME_ENCODE_LADDER = [
  { longestSide: 1280, quality: 0.72 },
  { longestSide: 800, quality: 0.52 },
  { longestSide: 800, quality: 0.35 },
] as const;

export type FrameAttemptVerdict = 'accept' | 'retry' | 'refuse';

/**
 * The scaled size for a frame, never larger than the source.
 *
 * A 640×360 stream stays 640×360: upscaling to the ceiling would spend bytes on
 * pixels that carry no more of the scene. Returns `null` for a frame with no
 * dimensions at all, which is what a `<video>` reports before its first decoded
 * frame — the caller must not encode a blank canvas and call it a capture.
 */
export function frameScaleTo(
  width: number,
  height: number,
  longestSide: number,
): { width: number; height: number } | null {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return null;
  if (longest <= longestSide) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const factor = longestSide / longest;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

/**
 * What to do with one rung's result.
 *
 * `refuse` is a real outcome and not a theoretical one worth hiding: an empty or
 * unmeasurable encode means the browser gave back something that is not a picture,
 * and handing that on would stage bytes the lane rejects. The caller turns a
 * refusal into "no image", and the hand-off then says so rather than pretending a
 * screenshot travelled.
 *
 * On the **last** rung the target stops being binding — there is nothing further to
 * try — so anything still inside the lane's own bound is taken. Only something over
 * 4 MiB at 800px and q35, which no JPEG of a video frame is, is refused there.
 */
export function acceptFrameAttempt(sizeBytes: number, attemptIndex: number): FrameAttemptVerdict {
  const last = attemptIndex >= AGENT_FRAME_ENCODE_LADDER.length - 1;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return last ? 'refuse' : 'retry';
  if (sizeBytes <= AGENT_FRAME_TARGET_BYTES) return 'accept';
  if (!last) return 'retry';
  return sizeBytes <= AGENT_EXECUTION_IMAGE_BYTES_LIMIT ? 'accept' : 'refuse';
}

/**
 * One rung: draw the frame at `size` and encode it as JPEG.
 *
 * The `data:image/jpeg` prefix is asserted rather than assumed. `toDataURL` falls
 * back to PNG for a type it cannot encode and returns the empty `data:,` when there
 * is nothing to encode at all, and both would otherwise reach `splitImageDataUrl`
 * as a mime type this ladder never sized for.
 */
function encodeFrame(
  video: HTMLVideoElement,
  size: { width: number; height: number },
  quality: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return '';
  }
  context.drawImage(video, 0, 0, size.width, size.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  canvas.remove();
  return dataUrl.startsWith('data:image/jpeg;base64,') ? dataUrl : '';
}

/**
 * The current frame as a bounded JPEG `data:` URL, or `''` when there is none.
 *
 * `''` rather than a throw, because a missing picture is not a failed gesture: the
 * line is still worth asking about, and `handOffToAgent` treats an absent image and
 * a broken one differently — absent is silent by design, broken is announced.
 *
 * Synchronous, unlike the mining panel's `captureFrame`: that one goes through
 * `canvas.toBlob`, which is callback-based, while `toDataURL` returns the encoded
 * string directly. There is nothing to await, so nothing here pretends there is.
 */
export function captureAgentFrameDataUrl(video: HTMLVideoElement | null): string {
  if (!video || !video.videoWidth || !video.videoHeight) return '';
  for (let attempt = 0; attempt < AGENT_FRAME_ENCODE_LADDER.length; attempt += 1) {
    const rung = AGENT_FRAME_ENCODE_LADDER[attempt];
    const size = frameScaleTo(video.videoWidth, video.videoHeight, rung.longestSide);
    if (!size) return '';
    const dataUrl = encodeFrame(video, size, rung.quality);
    const split = dataUrl ? splitImageDataUrl(dataUrl) : null;
    const bytes = split ? decodedBase64Bytes(split.imageBase64) : null;
    const verdict = acceptFrameAttempt(bytes ?? 0, attempt);
    if (verdict === 'accept') return dataUrl;
    if (verdict === 'refuse') return '';
  }
  // Unreachable: the last rung answers `accept` or `refuse`, never `retry`.
  return '';
}
