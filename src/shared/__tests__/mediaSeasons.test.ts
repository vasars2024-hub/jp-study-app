// D266, at the seam that does the arithmetic.
//
// The subject is the user's own library: `The Big O` is one folder of 26 files,
// all stamped `anilistId: 567` — season 1, `episodes: 13`. Measured live:
// `subtitleHarvestList({ anilistId: 567 })` returns jimaku entry 1178 with
// exactly 13 files, E01–E13, and episodes 14–26 all carry zero records and a
// fresh evidential `no-match`. The boundary matches `episodeCount` exactly.

import { describe, expect, it } from 'vitest';
import { resolveSeasonForEpisode, type RelatedWork } from '../mediaSeasons';

/** What AniList 567's relations look like once the ids are kept. */
const BIG_O_II: RelatedWork = {
  anilistId: 568,
  relationType: 'SEQUEL',
  title: 'The Big O II',
  format: 'TV',
  episodeCount: 13,
};

const BIG_O = { anilistId: 567, episodeCount: 13, relatedWorks: [BIG_O_II] };

describe('resolveSeasonForEpisode', () => {
  it('leaves an episode inside the matched entry alone', () => {
    expect(resolveSeasonForEpisode({ ...BIG_O, episode: 7 })).toEqual({ kind: 'in-range' });
  });

  it('leaves the last episode of the entry alone', () => {
    // The off-by-one that would send episode 13 to the sequel as episode 0.
    expect(resolveSeasonForEpisode({ ...BIG_O, episode: 13 })).toEqual({ kind: 'in-range' });
  });

  it('sends the first episode past the boundary to the sequel as its episode 1', () => {
    expect(resolveSeasonForEpisode({ ...BIG_O, episode: 14 })).toEqual({
      kind: 'resolved',
      hop: { anilistId: 568, episode: 1, title: 'The Big O II' },
    });
  });

  it('sends the live subject — episode 26 — to the sequel as episode 13', () => {
    expect(resolveSeasonForEpisode({ ...BIG_O, episode: 26 })).toEqual({
      kind: 'resolved',
      hop: { anilistId: 568, episode: 13, title: 'The Big O II' },
    });
  });

  it('refuses when the episode is past the sequel too, and says how far it got', () => {
    // A three-season folder. One hop is all the stored relations can support,
    // and asking season 1 about episode 40 is the defect, not the fallback.
    expect(resolveSeasonForEpisode({ ...BIG_O, episode: 40 })).toEqual({
      kind: 'unresolved',
      reason: 'beyond-sequel',
      coveredThrough: 26,
    });
  });

  it('refuses when two direct sequels make the hop a coin flip', () => {
    const forked = {
      anilistId: 567,
      episodeCount: 13,
      episode: 14,
      relatedWorks: [BIG_O_II, { ...BIG_O_II, anilistId: 999, title: 'The Big O: Reboot' }],
    };
    expect(resolveSeasonForEpisode(forked)).toEqual({
      kind: 'unresolved', reason: 'ambiguous', coveredThrough: 13,
    });
  });

  it('refuses when there is no sequel at all', () => {
    expect(resolveSeasonForEpisode({ anilistId: 567, episodeCount: 13, episode: 14, relatedWorks: [] })).toEqual({
      kind: 'unresolved', reason: 'no-sequel', coveredThrough: 13,
    });
  });

  it('does not hop into a movie or a special that happens to be a SEQUEL edge', () => {
    // Both are real `SEQUEL` relations on real entries. Hopping into a
    // one-episode movie would ask it for episode 1 and get a confident file
    // that is not this episode at all.
    for (const format of ['MOVIE', 'SPECIAL', 'OVA', 'MUSIC']) {
      expect(resolveSeasonForEpisode({
        anilistId: 567, episodeCount: 13, episode: 14,
        relatedWorks: [{ ...BIG_O_II, format }],
      })).toEqual({ kind: 'unresolved', reason: 'no-sequel', coveredThrough: 13 });
    }
  });

  it('ignores relations that are not sequels', () => {
    for (const relationType of ['PREQUEL', 'SIDE_STORY', 'SUMMARY', 'ALTERNATIVE', 'SPIN_OFF', 'CHARACTER']) {
      expect(resolveSeasonForEpisode({
        anilistId: 567, episodeCount: 13, episode: 14,
        relatedWorks: [{ ...BIG_O_II, relationType }],
      })).toEqual({ kind: 'unresolved', reason: 'no-sequel', coveredThrough: 13 });
    }
  });

  it('still hops when the sequel is airing and has no published count', () => {
    // The discriminating positive for the `beyond-sequel` arm: an unknown run
    // length is not a claim that the episode is outside it, and refusing here
    // would leave every currently-airing second season unmatched.
    expect(resolveSeasonForEpisode({
      anilistId: 567, episodeCount: 13, episode: 20,
      relatedWorks: [{ ...BIG_O_II, episodeCount: undefined }],
    })).toEqual({ kind: 'resolved', hop: { anilistId: 568, episode: 7, title: 'The Big O II' } });
  });

  it('says nothing when the entry publishes no episode count', () => {
    // Without a boundary there is no "outside" it. Treating a missing count as
    // 0 would send every episode of every unfinished series to a sequel hop.
    expect(resolveSeasonForEpisode({ anilistId: 567, episode: 26, relatedWorks: [BIG_O_II] }))
      .toEqual({ kind: 'in-range' });
    expect(resolveSeasonForEpisode({ anilistId: 567, episodeCount: 0, episode: 26, relatedWorks: [BIG_O_II] }))
      .toEqual({ kind: 'in-range' });
  });

  it('says nothing for an item the library cannot number', () => {
    // A creditless opening, an OVA, a movie. `null` is not "episode 0".
    expect(resolveSeasonForEpisode({ ...BIG_O, episode: null })).toEqual({ kind: 'in-range' });
    expect(resolveSeasonForEpisode({ ...BIG_O, episode: undefined })).toEqual({ kind: 'in-range' });
  });

  it('never hops onto the entry it came from', () => {
    // A self-referential relation would produce the exact query that is already
    // known to answer nothing, dressed up as a fix.
    expect(resolveSeasonForEpisode({
      anilistId: 567, episodeCount: 13, episode: 14,
      relatedWorks: [{ ...BIG_O_II, anilistId: 567 }],
    })).toEqual({ kind: 'unresolved', reason: 'no-sequel', coveredThrough: 13 });
  });
});
