/**
 * Player-agnostic contract between the Study surface and whatever media player
 * happens to be mounted.
 *
 * `StudyOrchestratorWorkspace` used to take the legacy `MediaState` object
 * wholesale — 100+ members — in order to read exactly four of them. That single
 * import is what tied Study to `MediaContent`, and it is the reason the legacy
 * player could not be retired: the handoff contract, not the rendering, was the
 * coupling.
 *
 * What Study actually needs is small and belongs to neither player:
 *
 *   - the media library (which comes from `listMedia`, not from a player),
 *   - which item is loaded right now,
 *   - a live playback position, so a workspace's return target follows the user,
 *   - one live, player-proven audio capability for listening-first practice,
 *   - the user's explicit playback-speed preference and its setter,
 *   - one "add media" affordance for the empty state.
 *
 * Both players can supply them. The legacy player reads its own `videoRef`; the
 * adopted VideoCore reads `vc_videoElement`, the single clock the migration
 * contract already names as authoritative. Neither is referenced here.
 */
import type { MediaItem } from './types';
import type { StudyListeningAvailability } from './studyListeningFirstRecipe';

export interface StudyMediaSurface {
  /** Every item in the Study OS media library. Library state, not player state. */
  items: MediaItem[];
  /** The item the mounted player currently holds, or null when nothing is loaded. */
  current: MediaItem | null;
  /**
   * Live playback position in seconds, or `null` when no player element is
   * mounted. Polled on a timer, so it must stay cheap and must not throw.
   */
  livePositionSec: () => number | null;
  /**
   * Capability proven by the surface's real mounted media element. It remains
   * available while that exact item stays loaded, even if the Study tab has
   * temporarily unmounted the element that produced the proof.
   */
  listeningAvailability: StudyListeningAvailability | null;
  /** Existing player preference; Study never derives or stores a second one. */
  playbackRate: number;
  /** Changes that existing preference only after an explicit Study action. */
  setPlaybackRate: (rate: number) => void;
  /** The surface's own "add media" action, used by the empty state. */
  openFile: () => void | Promise<void>;
}

/**
 * The position Study should persist as a workspace return target.
 *
 * A mounted player wins, but only when it reports a finite number. A detached
 * element yields `undefined` and a freshly created one yields `NaN`; persisting
 * either would silently reset the user's resume point to zero, which is exactly
 * the kind of quiet data loss the durable workspace exists to prevent.
 */
export function studyPlaybackPosition(surface: StudyMediaSurface): number {
  const live = surface.livePositionSec();
  if (typeof live === 'number' && Number.isFinite(live)) return live;
  const fallback = surface.current?.positionSec;
  return typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : 0;
}

/**
 * Whether a workspace's stored return target has moved far enough to be worth
 * rewriting. The threshold keeps the five-second poll from writing the document
 * on every tick while playback is effectively parked.
 */
export const STUDY_POSITION_WRITE_THRESHOLD_SEC = 2;

export function studyPositionChanged(previous: number, next: number): boolean {
  return Math.abs(previous - next) >= STUDY_POSITION_WRITE_THRESHOLD_SEC;
}
