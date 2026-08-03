import { expect, it, vi } from 'vitest';
import { inspectStudyListeningAudio } from '../studyListeningAudio';

it('proves usable audio from the mounted media capture stream and closes the projection', () => {
  const stop = vi.fn();
  const element = {
    readyState: 3,
    captureStream: () => ({
      getAudioTracks: () => [{ stop }],
      getTracks: () => [{ stop }],
    }),
  } as unknown as HTMLMediaElement;

  expect(inspectStudyListeningAudio('media-1', element)).toMatchObject({
    mediaId: 'media-1',
    usable: true,
    readyState: 3,
    audioTrackCount: 1,
    evidence: 'captured-audio-track',
  });
  expect(stop).toHaveBeenCalledOnce();
});

it('uses exposed browser audio tracks without opening a capture stream', () => {
  const captureStream = vi.fn();
  const element = {
    readyState: 2,
    audioTracks: { length: 2 },
    captureStream,
  } as unknown as HTMLMediaElement;

  expect(inspectStudyListeningAudio('media-1', element)).toMatchObject({
    usable: true,
    audioTrackCount: 2,
    evidence: 'browser-audio-track',
  });
  expect(captureStream).not.toHaveBeenCalled();
});

it('uses Chromium decoded-audio evidence when playfile capture is blocked', () => {
  const element = {
    readyState: 4,
    webkitAudioDecodedByteCount: 1_204_401,
    captureStream: () => {
      throw new DOMException('Cannot capture cross-origin media', 'SecurityError');
    },
  } as unknown as HTMLMediaElement;

  expect(inspectStudyListeningAudio('media-1', element)).toMatchObject({
    usable: true,
    audioTrackCount: 1,
    evidence: 'decoded-audio-bytes',
  });
});
