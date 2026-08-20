/**
 * The video producer's own derivation, separate from the contract's tests.
 *
 * The contract already proves what `buildVideoCaptureTarget` does with a set of
 * fields. What is only true here is which fields this producer *chooses* — the
 * namespaced id and the fallback chain that names a loose file — and that is
 * where a wrong choice writes false provenance into a stored record.
 */

import { describe, expect, it } from 'vitest';
import { buildVideoCaptureTarget } from '../../shared/lensCaptureTarget';
import type { VideoCoreMiningSource } from '../../shared/videoCoreMining';
import { videoCaptureTitleOf } from '../MediaLensCaptureButton';

const base: VideoCoreMiningSource = {
  playbackId: 'pb-1',
  playbackType: 'local',
  streamType: 'file',
};

/** The same expression the button uses, kept here so the ref shape is pinned. */
const idOf = (source: VideoCoreMiningSource): string => (
  source.mediaId == null ? '' : `anilist:${source.mediaId}`
);

describe('the video producer names what it is playing', () => {
  it('prefers the matched title', () => {
    expect(videoCaptureTitleOf({ ...base, mediaTitle: '君の名は。' })).toBe('君の名は。');
  });

  it('falls back to the basename of a loose file, not its whole path', () => {
    expect(videoCaptureTitleOf({
      ...base,
      localFilePath: 'D:\\anime\\Season 1\\[Group] Show - 03 [1080p].mkv',
    })).toBe('[Group] Show - 03 [1080p].mkv');
    expect(videoCaptureTitleOf({ ...base, localFilePath: '/mnt/media/show/ep03.mkv' }))
      .toBe('ep03.mkv');
  });

  it('falls back to the playback id last, and is empty only when nothing names it', () => {
    expect(videoCaptureTitleOf(base)).toBe('pb-1');
    // The contract drops a target with no title, so the button disables itself
    // on this rather than parking a record that addresses nothing.
    expect(videoCaptureTitleOf({ ...base, playbackId: '' })).toBe('');
  });

  it('namespaces the AniList id so a library id can never be mistaken for it', () => {
    const source: VideoCoreMiningSource = {
      ...base,
      mediaId: 21519,
      mediaTitle: '君の名は。',
      episodeNumber: 3,
    };
    const target = buildVideoCaptureTarget({
      mediaId: idOf(source),
      title: videoCaptureTitleOf(source),
      episode: String(source.episodeNumber),
      positionSec: 3725,
    }, 50_000);
    expect(target.sourceRef).toBe('video:anilist%3A21519?episode=3&t=3725');
    expect(target.sourceLabel).toBe('君の名は。 · Ep. 3 · 1:02:05');
  });

  it('leaves the id empty for a loose file the library never matched', () => {
    const source: VideoCoreMiningSource = {
      ...base,
      localFilePath: 'D:\\raw\\ep01.mkv',
    };
    expect(idOf(source)).toBe('');
    const target = buildVideoCaptureTarget({
      mediaId: idOf(source),
      title: videoCaptureTitleOf(source),
      episode: '',
      positionSec: 90.4,
    }, 1);
    expect(target.sourceRef).toBe('video:?t=90');
    expect(target.sourceLabel).toBe('ep01.mkv · 1:30');
  });
});
