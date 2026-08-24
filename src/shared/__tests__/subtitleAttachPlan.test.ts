import { describe, expect, it } from 'vitest';

import { countAttachSkips, planSubtitleAttach } from '../subtitleAttachPlan';
import type { AttachSourceFile, AttachTargetItem } from '../subtitleAttachPlan';

/** Real names from the library census of 2026-08-24, not invented shapes. */
const BIG_O: AttachTargetItem[] = Array.from({ length: 4 }, (_, index) => ({
  id: `bigo-${index + 1}`,
  title: `The Big O - 0${index + 1}`,
  fileName: `The Big O - 0${index + 1} [BDRip 1440x1080 x265 FLAC].mkv`,
}));

function file(key: string, episode: number | null, label = `${episode} · ${key}.ass`): AttachSourceFile {
  return { key, episode, label };
}

describe('planSubtitleAttach', () => {
  it('pairs a harvested range with the library items that are those episodes', () => {
    const plan = planSubtitleAttach(
      [file('a', 1), file('b', 2), file('c', 3)],
      BIG_O,
      'The Big O',
    );
    expect(plan.pairs.map((pair) => [pair.episode, pair.mediaId])).toEqual([
      [1, 'bigo-1'],
      [2, 'bigo-2'],
      [3, 'bigo-3'],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  /**
   * The negative control this whole module exists for. Two shows, both with an
   * episode 1: an episode-number lookup alone would write JoJo's cues onto The
   * Big O and report a success.
   */
  it('never lands a file on another series that happens to have that episode', () => {
    const plan = planSubtitleAttach(
      [file('jojo01', 1)],
      BIG_O,
      'JoJo no Kimyou na Bouken Part 5: Ougon no Kaze',
    );
    expect(plan.pairs).toEqual([]);
    expect(plan.skipped).toEqual([{ key: 'jojo01', episode: 1, reason: 'no-match' }]);
  });

  it('refuses when the library has no title to compare against', () => {
    const plan = planSubtitleAttach([file('a', 1)], BIG_O, '   ');
    expect(plan.pairs).toEqual([]);
    expect(plan.skipped[0].reason).toBe('no-match');
  });

  it('reports a file the provider numbered nothing rather than guessing an episode', () => {
    const plan = planSubtitleAttach(
      [file('movie', null, 'Ougon no Kaze OVA.ass'), file('a', 1)],
      BIG_O,
      'The Big O',
    );
    expect(plan.skipped).toEqual([{ key: 'movie', episode: null, reason: 'no-episode' }]);
    expect(plan.pairs).toHaveLength(1);
  });

  it('refuses a tie instead of picking one of two items claiming the same episode', () => {
    const duplicated: AttachTargetItem[] = [
      ...BIG_O,
      { id: 'bigo-1-dup', title: 'The Big O - 01', fileName: 'The Big O - 01 [WEB 720p].mkv' },
    ];
    const plan = planSubtitleAttach([file('a', 1), file('b', 2)], duplicated, 'The Big O');
    expect(plan.skipped).toEqual([{ key: 'a', episode: 1, reason: 'ambiguous' }]);
    expect(plan.pairs.map((pair) => pair.mediaId)).toEqual(['bigo-2']);
  });

  it('gives one library item to at most one file per plan', () => {
    const plan = planSubtitleAttach([file('a', 1), file('b', 1)], BIG_O, 'The Big O');
    expect(plan.pairs.map((pair) => pair.key)).toEqual(['a']);
    expect(plan.skipped).toEqual([{ key: 'b', episode: 1, reason: 'ambiguous' }]);
  });

  it('skips a file whose exact label is already a track on the matched item', () => {
    const withTrack: AttachTargetItem[] = BIG_O.map((item, index) =>
      index === 0 ? { ...item, existingLabels: ['1 · a.ass'] } : item,
    );
    const plan = planSubtitleAttach([file('a', 1), file('b', 2)], withTrack, 'The Big O');
    expect(plan.skipped).toEqual([{ key: 'a', episode: 1, reason: 'already-attached' }]);
    expect(plan.pairs.map((pair) => pair.key)).toEqual(['b']);
  });

  it('reads the episode off the file name when the title was renamed', () => {
    const renamed: AttachTargetItem[] = [
      { id: 'x', title: 'Big O rewatch', fileName: 'The Big O - 05 [BDRip].mkv' },
    ];
    const plan = planSubtitleAttach([file('a', 5)], renamed, 'The Big O');
    expect(plan.pairs).toEqual([{ key: 'a', episode: 5, mediaId: 'x', mediaTitle: 'Big O rewatch' }]);
  });

  it('counts skips by reason', () => {
    expect(
      countAttachSkips([
        { key: 'a', episode: null, reason: 'no-episode' },
        { key: 'b', episode: 2, reason: 'no-match' },
        { key: 'c', episode: 3, reason: 'no-match' },
      ]),
    ).toEqual({ 'no-episode': 1, 'no-match': 2, ambiguous: 0, 'already-attached': 0 });
  });
});
