/**
 * The rule that decides whether a downloaded track reaches the workspace player.
 *
 * Two defects are pinned here, and they pull in opposite directions — which is why the
 * naive version of either guard breaks the other.
 *
 * 1. A muxed release must keep its own tracks. `566c6d97` guarded that with
 *    `manager.getTracks().length > 0`, which is right exactly once: after this player
 *    mounts its own track, the same check refuses every subsequent change forever.
 * 2. The library's chosen track must win. Picking a different record reopens the same
 *    file path, so a player keyed on the path alone keeps showing the previous choice —
 *    the same defect `3bc796d1` fixed on the retired player, and the reason the effect
 *    re-runs on `onMediaChanged` rather than once per file.
 */
import { describe, expect, it } from 'vitest';
import {
  decideExternalSubtitleMount,
  type ExternalSubtitleMountState,
} from '../externalSubtitleMount';

const state = (patch: Partial<ExternalSubtitleMountState> = {}): ExternalSubtitleMountState => ({
  trackNumbers: [],
  mountedTrackNumber: null,
  mountedName: null,
  resolvedName: 'The Big O - 01 [BDRip 1440x1080 x265 FLAC].ja.srt',
  ...patch,
});

describe('decideExternalSubtitleMount', () => {
  it('mounts when the container found nothing and the library has a track', () => {
    expect(decideExternalSubtitleMount(state())).toBe('mount');
  });

  it('leaves a muxed release alone', () => {
    expect(decideExternalSubtitleMount(state({ trackNumbers: [1, 2] }))).toBe('container');
  });

  it('does nothing when the library resolves no track at all', () => {
    expect(decideExternalSubtitleMount(state({ resolvedName: null }))).toBe('unchanged');
  });

  it('does not remount the track it already mounted', () => {
    expect(decideExternalSubtitleMount(state({
      trackNumbers: [1],
      mountedTrackNumber: 1,
      mountedName: 'The Big O - 01 [BDRip 1440x1080 x265 FLAC].ja.srt',
    }))).toBe('unchanged');
  });

  it('mounts the new choice when the library answer changed under a mounted track', () => {
    expect(decideExternalSubtitleMount(state({
      trackNumbers: [1],
      mountedTrackNumber: 1,
      mountedName: 'The Big O - 01 [BDRip 1440x1080 x265 FLAC].ja.srt',
      resolvedName: 'jimaku · The Big O 01.ja.srt',
    }))).toBe('mount');
  });

  it('still refuses when the container track arrives after ours', () => {
    // The negative control for the loosened guard: our track number is 1, and a track
    // the file itself brought has appeared alongside it. `length > 0` and
    // `some(n => n !== ours)` agree here, and only the second one agrees above.
    expect(decideExternalSubtitleMount(state({
      trackNumbers: [1, 3],
      mountedTrackNumber: 1,
      mountedName: 'a.srt',
      resolvedName: 'b.srt',
    }))).toBe('container');
  });
});
