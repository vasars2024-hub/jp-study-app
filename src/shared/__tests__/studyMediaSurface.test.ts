import { describe, expect, it } from 'vitest';
import {
  STUDY_POSITION_WRITE_THRESHOLD_SEC,
  studyPlaybackPosition,
  studyPositionChanged,
  type StudyMediaSurface,
} from '../studyMediaSurface';
import type { MediaItem } from '../types';

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-1',
    title: 'The Big O - 01',
    path: 'C:/media/the-big-o-01.mkv',
    fileName: 'the-big-o-01.mkv',
    addedAt: 1,
    ...overrides,
  };
}

function surface(overrides: Partial<StudyMediaSurface> = {}): StudyMediaSurface {
  return {
    items: [item()],
    current: item(),
    livePositionSec: () => null,
    listeningAvailability: null,
    playbackRate: 1,
    setPlaybackRate: () => undefined,
    openFile: () => undefined,
    ...overrides,
  };
}

describe('studyPlaybackPosition', () => {
  it('prefers a live player position over the stored resume point', () => {
    expect(
      studyPlaybackPosition(
        surface({
          current: item({ positionSec: 53.267 }),
          livePositionSec: () => 240.5,
        }),
      ),
    ).toBe(240.5);
  });

  it('accepts a live position of exactly zero', () => {
    // Guards the `??`-shaped bug: a player rewound to the start is a real
    // position, not a missing one, and must not fall back to the stored value.
    expect(
      studyPlaybackPosition(
        surface({ current: item({ positionSec: 53.267 }), livePositionSec: () => 0 }),
      ),
    ).toBe(0);
  });

  it('falls back to the stored resume point when no player is mounted', () => {
    expect(
      studyPlaybackPosition(
        surface({ current: item({ positionSec: 53.267 }), livePositionSec: () => null }),
      ),
    ).toBe(53.267);
  });

  it('rejects a non-finite live position rather than persisting it', () => {
    // A freshly created video element reports NaN before metadata loads.
    for (const live of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(
        studyPlaybackPosition(
          surface({ current: item({ positionSec: 53.267 }), livePositionSec: () => live }),
        ),
      ).toBe(53.267);
    }
  });

  it('returns zero when neither a player nor a stored position exists', () => {
    expect(studyPlaybackPosition(surface({ current: null, livePositionSec: () => null }))).toBe(0);
    expect(
      studyPlaybackPosition(surface({ current: item(), livePositionSec: () => null })),
    ).toBe(0);
  });

  it('rejects a non-finite stored position too', () => {
    expect(
      studyPlaybackPosition(
        surface({
          current: item({ positionSec: Number.NaN }),
          livePositionSec: () => undefined as unknown as number,
        }),
      ),
    ).toBe(0);
  });
});

describe('studyPositionChanged', () => {
  it('ignores drift below the write threshold', () => {
    expect(studyPositionChanged(100, 101.9)).toBe(false);
    expect(studyPositionChanged(100, 98.1)).toBe(false);
  });

  it('writes once the threshold is reached, in either direction', () => {
    expect(studyPositionChanged(100, 100 + STUDY_POSITION_WRITE_THRESHOLD_SEC)).toBe(true);
    expect(studyPositionChanged(100, 100 - STUDY_POSITION_WRITE_THRESHOLD_SEC)).toBe(true);
    expect(studyPositionChanged(0, 42)).toBe(true);
  });
});
