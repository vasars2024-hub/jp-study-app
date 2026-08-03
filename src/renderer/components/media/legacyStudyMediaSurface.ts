import { useMemo } from 'react';
import type { StudyMediaSurface } from '../../../shared/studyMediaSurface';
import type { MediaState } from './MediaContent';

/**
 * Adapts the legacy `MediaState` to the player-agnostic Study contract.
 *
 * This is the only file that knows both shapes. `MediaCenterView` keeps handing
 * Study its existing state while the adapter also projects the player-proven
 * listening capability, and
 * `StudyOrchestratorWorkspace` no longer imports `MediaContent` at all — so the
 * adopted workspace can supply the same player-agnostic members without Study being aware
 * of which player produced them.
 */
export function useLegacyStudyMediaSurface(state: MediaState): StudyMediaSurface {
  const {
    items,
    current,
    videoRef,
    listeningAvailability,
    playbackRate,
    setPlaybackRate,
    openFile,
  } = state;
  return useMemo<StudyMediaSurface>(
    () => ({
      items,
      current,
      // `?? null` rather than `?.currentTime` alone: an unmounted ref yields
      // `undefined`, and the contract promises `number | null`.
      livePositionSec: () => videoRef.current?.currentTime ?? null,
      listeningAvailability,
      playbackRate,
      setPlaybackRate,
      openFile,
    }),
    [current, items, listeningAvailability, openFile, playbackRate, setPlaybackRate, videoRef],
  );
}
