/**
 * Where a subtitle track chosen in the library is actually delivered.
 *
 * The defect this pins, measured on the real 33-item library through the running app:
 * clicking a Japanese track row in the library detail panel ran
 * `readSubtitleRecord` → `applySubtitleFile` → navigate to the Video tab, and on a machine
 * with the media workspace present that tab renders `mc-video-empty` — "Video plays in the
 * media workspace" — with no `<video>` anywhere in it. The shell's own status line read
 * **"Loaded 267 subtitle lines."** underneath that card. 267 cues parsed into a surface
 * nothing draws is exactly the false-success shape this plan exists to remove.
 *
 * Two halves, because the fix can regress through either:
 *   1. the destination mapping, here;
 *   2. `pickPlaybackSubtitle` honouring the stored choice, in
 *      `main/__tests__/subtitleDiscovery.test.ts` — without that the workspace opens the
 *      file and re-picks a track by its own ranking, so the click still does nothing
 *      visible even though the right player got opened.
 */
import { describe, expect, it } from 'vitest';
import {
  subtitleChoiceDestination,
  videoStageFor,
  type MediaWorkspaceAvailability,
} from '../mediaWorkspaceAvailability';

const ALL: readonly MediaWorkspaceAvailability[] = ['available', 'pending', 'unavailable'];

describe('subtitleChoiceDestination', () => {
  it('sends the choice to the workspace whenever the Video tab holds no player', () => {
    expect(subtitleChoiceDestination('available')).toBe('workspace');
    // Still resolving. The inline player is the surface already known not to be the
    // destination once it resolves, so guessing it is the one guess that cannot be right.
    expect(subtitleChoiceDestination('pending')).toBe('workspace');
  });

  it('keeps the inline player when that is the only surface there is', () => {
    expect(subtitleChoiceDestination('unavailable')).toBe('inline');
  });

  /*
    The negative control for the whole rule: `inline` must be reachable from exactly the
    stage that renders a `<video>`, and from no other. If this ever passes for two stages
    the mapping has stopped being derived from the stage and has become a second opinion
    about it.
  */
  it('agrees with the stage it is derived from, on every availability', () => {
    const inline = ALL.filter((a) => subtitleChoiceDestination(a) === 'inline');
    expect(inline).toEqual(['unavailable']);
    for (const availability of ALL) {
      expect(subtitleChoiceDestination(availability) === 'inline')
        .toBe(videoStageFor(availability) === 'needs-server');
    }
  });
});
