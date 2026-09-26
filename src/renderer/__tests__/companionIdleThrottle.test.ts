// @vitest-environment jsdom
/**
 * The companion wander loop ran every animation frame for as long as the
 * desktop was open — with no companion moving, and even with none placed —
 * reading the layer's size each time. It now drops to a slow poll once nothing
 * has moved for a while (and polls rarely when there is nothing to move), and
 * returns to full rate the moment something moves or the user grabs one.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPANION_EMPTY_POLL_MS,
  COMPANION_IDLE_FRAMES,
  COMPANION_IDLE_POLL_MS,
  companionFrameDelay,
} from '../environment/companionSchedule';

describe('companion wander scheduling', () => {
  it('animates at frame rate while companions move', () => {
    expect(companionFrameDelay(0, 3)).toBe(0);
    expect(companionFrameDelay(COMPANION_IDLE_FRAMES - 1, 3)).toBe(0);
  });

  it('polls slowly once nothing has moved for a while', () => {
    expect(companionFrameDelay(COMPANION_IDLE_FRAMES, 3)).toBe(COMPANION_IDLE_POLL_MS);
    expect(COMPANION_IDLE_POLL_MS).toBeGreaterThanOrEqual(200);
  });

  it('barely wakes when there is nothing to move', () => {
    expect(companionFrameDelay(0, 0)).toBe(COMPANION_EMPTY_POLL_MS);
  });
});
