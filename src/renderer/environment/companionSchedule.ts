// Wander-loop pacing for the desktop companions (`CompanionLayer.tsx`), kept
// apart from the component so it is testable without the desktop around it.

/** Frames without any movement before the wander loop drops to a slow poll. */
export const COMPANION_IDLE_FRAMES = 60;
/** Poll interval while idle (nothing moved for a while, or nothing to move). */
export const COMPANION_IDLE_POLL_MS = 250;
export const COMPANION_EMPTY_POLL_MS = 1_000;

/**
 * How long to wait before the next wander frame: 0 means the next animation
 * frame. The loop ran every frame for as long as the desktop was open, even
 * with no companion moving or none placed at all (forced size reads included);
 * once still, it now checks four times a second until something moves again.
 */
export function companionFrameDelay(idleFrames: number, companions: number): number {
  if (companions === 0) return COMPANION_EMPTY_POLL_MS;
  return idleFrames >= COMPANION_IDLE_FRAMES ? COMPANION_IDLE_POLL_MS : 0;
}
