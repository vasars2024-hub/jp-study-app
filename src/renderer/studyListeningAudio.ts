import {
  studyListeningAvailability,
  type StudyListeningAvailability,
} from '../shared/studyListeningFirstRecipe';

type CapturableMediaElement = HTMLMediaElement & {
  audioTracks?: { length: number };
  webkitAudioDecodedByteCount?: number;
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

/**
 * Reads capability from the mounted player without starting playback,
 * requesting hardware permission, or retaining a parallel stream.
 */
export function inspectStudyListeningAudio(
  mediaId: string,
  element: HTMLMediaElement | null,
): StudyListeningAvailability | null {
  if (!element) return null;
  const capturable = element as CapturableMediaElement;
  const browserAudioTrackCount = capturable.audioTracks?.length ?? 0;
  let capturedAudioTrackCount = 0;
  let stream: MediaStream | null = null;
  if (element.readyState >= 2 && browserAudioTrackCount === 0) {
    try {
      const capture = capturable.captureStream?.bind(capturable)
        ?? capturable.mozCaptureStream?.bind(capturable);
      stream = capture?.() ?? null;
      capturedAudioTrackCount = stream?.getAudioTracks().length ?? 0;
    } catch {
      capturedAudioTrackCount = 0;
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }
  return studyListeningAvailability({
    mediaId,
    readyState: element.readyState,
    browserAudioTrackCount,
    capturedAudioTrackCount,
    decodedAudioBytes: capturable.webkitAudioDecodedByteCount,
  });
}
