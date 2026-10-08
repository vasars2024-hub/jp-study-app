import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { isFinished, isStarted, orderUpNext, watchProgress } from '../components/media/upNext';

function video(partial: Partial<MediaItem> & { id: string }): MediaItem {
  return {
    title: partial.seriesTitle ? `${partial.seriesTitle} - ${partial.episode ?? 1}` : partial.id,
    path: `C:/media/${partial.id}.mkv`,
    fileName: `${partial.id}.mkv`,
    addedAt: 0,
    durationSec: 1400,
    ...partial,
  } as MediaItem;
}

describe('orderUpNext', () => {
  it('puts a part-watched episode first, ahead of everything untouched', () => {
    const ordered = orderUpNext([
      video({ id: 'fresh', addedAt: 500 }),
      video({ id: 'resume', positionSec: 700, lastPlayedAt: 900 }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['resume', 'fresh']);
  });

  it('ranks the next unwatched episode of a begun series above unrelated imports', () => {
    const ordered = orderUpNext([
      video({ id: 'other', addedAt: 9_000 }),
      video({ id: 'big-o-03', seriesKey: 'big-o', seriesTitle: 'The Big O', episode: 3, addedAt: 3 }),
      video({ id: 'big-o-02', seriesKey: 'big-o', seriesTitle: 'The Big O', episode: 2, addedAt: 2 }),
      video({ id: 'big-o-01', seriesKey: 'big-o', seriesTitle: 'The Big O', episode: 1, positionSec: 1390, lastPlayedAt: 5_000 }),
    ]);
    // Episode 1 is finished (>=92%), so it is not a resume candidate; episode 2
    // is the next one up and must lead, then the rest of the series, then the
    // unrelated file.
    expect(ordered.map((item) => item.id)).toEqual(['big-o-02', 'big-o-03', 'other', 'big-o-01']);
  });

  it('orders several begun series by how recently each was watched', () => {
    const ordered = orderUpNext([
      video({ id: 'a-02', seriesKey: 'a', episode: 2 }),
      video({ id: 'a-01', seriesKey: 'a', episode: 1, positionSec: 1390, lastPlayedAt: 100 }),
      video({ id: 'b-02', seriesKey: 'b', episode: 2 }),
      video({ id: 'b-01', seriesKey: 'b', episode: 1, positionSec: 1390, lastPlayedAt: 900 }),
    ]);
    expect(ordered.slice(0, 2).map((item) => item.id)).toEqual(['b-02', 'a-02']);
  });

  it('sorts by season then episode, not by title', () => {
    const ordered = orderUpNext([
      video({ id: 's2e1', seriesKey: 'x', season: 2, episode: 1, addedAt: 5 }),
      video({ id: 's1e10', seriesKey: 'x', season: 1, episode: 10, addedAt: 5 }),
      video({ id: 's1e2', seriesKey: 'x', season: 1, episode: 2, addedAt: 5 }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['s1e2', 's1e10', 's2e1']);
  });

  it('excludes audio so the video shelf never offers a track', () => {
    const ordered = orderUpNext([
      video({ id: 'song', kind: 'audio' }),
      video({ id: 'book', kind: 'audiobook' }),
      video({ id: 'clip' }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['clip']);
  });

  it('returns every video exactly once', () => {
    const items = [
      video({ id: 'p', positionSec: 300, lastPlayedAt: 4 }),
      video({ id: 'q', seriesKey: 's', episode: 1, positionSec: 1390, lastPlayedAt: 3 }),
      video({ id: 'r', seriesKey: 's', episode: 2 }),
      video({ id: 't', seriesKey: 's', episode: 3 }),
      video({ id: 'u', addedAt: 1 }),
    ];
    const ordered = orderUpNext(items);
    expect(ordered).toHaveLength(items.length);
    expect(new Set(ordered.map((item) => item.id)).size).toBe(items.length);
  });
});

describe('watch state helpers', () => {
  it('treats 90% or more as finished, not as something to resume', () => {
    // The shared rule in `shared/watchFinished.ts`; 1260 / 1400 is exactly 0.9.
    const nearlyDone = video({ id: 'x', positionSec: 1260, durationSec: 1400 });
    expect(watchProgress(nearlyDone)).toBeCloseTo(0.9);
    expect(isFinished(nearlyDone)).toBe(true);
    expect(isStarted(nearlyDone)).toBe(false);
    const notQuite = video({ id: 'x2', positionSec: 1259, durationSec: 1400 });
    expect(isFinished(notQuite)).toBe(false);
    expect(isStarted(notQuite)).toBe(true);
  });

  it('reports nothing for an item with no duration probe', () => {
    const unprobed = video({ id: 'y', durationSec: undefined, positionSec: 400 });
    expect(watchProgress(unprobed)).toBe(0);
    expect(isStarted(unprobed)).toBe(false);
  });
});
