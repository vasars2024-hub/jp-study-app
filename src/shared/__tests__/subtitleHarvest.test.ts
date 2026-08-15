import { describe, expect, it } from 'vitest';
import {
  SEASON_EPISODE_GAP_SECONDS,
  chooseJimakuEntry,
  combineSeasonCues,
  episodeAt,
  locateInSeason,
  planSubtitleHarvest,
  toPlainText,
  toSrt,
  type HarvestFileCandidate,
} from '../subtitleHarvest';

function file(name: string, format = 'srt'): HarvestFileCandidate {
  return { id: `jimaku:1:${name}`, name, format };
}

describe('planSubtitleHarvest', () => {
  const season = [
    file('[SubsPlease] Frieren - 20 [1080p].ja.srt'),
    file('[SubsPlease] Frieren - 21 [1080p].ja.srt'),
    file('[SubsPlease] Frieren - 22 [1080p].ja.srt'),
    file('[SubsPlease] Frieren - 23 [1080p].ja.srt'),
    file('[SubsPlease] Frieren - 24 [1080p].ja.srt'),
  ];

  it('picks exactly the wanted episodes, in order', () => {
    const plan = planSubtitleHarvest(season, [22, 20, 21]);
    expect(plan.picks.map((p) => p.episode)).toEqual([20, 21, 22]);
    expect(plan.missing).toEqual([]);
  });

  it('reports wanted episodes it could not cover instead of dropping them', () => {
    // The silent-drop failure is the one that matters: a 20-24 request that
    // quietly returns three files reads as success.
    const plan = planSubtitleHarvest(season.slice(0, 3), [20, 21, 22, 23, 24]);
    expect(plan.picks.map((p) => p.episode)).toEqual([20, 21, 22]);
    expect(plan.missing).toEqual([23, 24]);
  });

  it('never confuses episode 2 with episode 20 or 24', () => {
    // `releaseCoversEpisode` guards this; the assertion is here because a
    // harvest that mines the wrong episode is invisible in the output.
    expect(planSubtitleHarvest(season, [2]).missing).toEqual([2]);
  });

  it('prefers a dialogue track over a signs-and-songs track for the same episode', () => {
    const plan = planSubtitleHarvest([
      file('[Group] Show - 20 (Signs & Songs).ass', 'ass'),
      file('[Group] Show - 20 [Dialogue].ass', 'ass'),
    ], [20]);
    expect(plan.picks[0].file.name).toContain('Dialogue');
  });

  it('prefers a signs track over nothing when it is the only file', () => {
    // Ranking must not become filtering — a bad track still beats a missing one.
    const plan = planSubtitleHarvest([file('[Group] Show - 20 (Songs).ass', 'ass')], [20]);
    expect(plan.picks).toHaveLength(1);
    expect(plan.missing).toEqual([]);
  });

  it('prefers srt over ass for the same episode', () => {
    const plan = planSubtitleHarvest([
      file('Show - 20.ass', 'ass'),
      file('Show - 20.srt', 'srt'),
    ], [20]);
    expect(plan.picks[0].file.format).toBe('srt');
  });

  it('is deterministic across equally ranked files', () => {
    const files = [file('Show - 20 b.srt'), file('Show - 20 a.srt')];
    const first = planSubtitleHarvest(files, [20]).picks[0].file.name;
    const second = planSubtitleHarvest([...files].reverse(), [20]).picks[0].file.name;
    expect(first).toBe(second);
  });

  it('deduplicates a repeated episode request', () => {
    expect(planSubtitleHarvest(season, [20, 20, 20]).picks).toHaveLength(1);
  });
});

describe('combineSeasonCues', () => {
  const ep = (episode: number, texts: string[]) => ({
    episode,
    cues: texts.map((text, i) => ({ start: i * 10, end: i * 10 + 5, text })),
  });

  it('offsets each episode so the combined timeline never goes backwards', () => {
    // The whole point: three episodes that each start at 0 must not produce a
    // corpus where a third of the vocabulary "first appears" at t=0.
    const { cues } = combineSeasonCues([ep(1, ['a', 'b']), ep(2, ['c', 'd'])]);
    const starts = cues.map((c) => c.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('lays episodes down in episode order regardless of fetch order', () => {
    const { cues } = combineSeasonCues([ep(3, ['third']), ep(1, ['first']), ep(2, ['second'])]);
    expect(cues.map((c) => c.text)).toEqual(['first', 'second', 'third']);
  });

  it('separates episodes by the gap', () => {
    const { segments } = combineSeasonCues([ep(1, ['a', 'b']), ep(2, ['c'])]);
    expect(segments[0].end).toBe(15);
    expect(segments[1].start).toBe(15 + SEASON_EPISODE_GAP_SECONDS);
  });

  it('keeps an empty episode visible as a segment rather than losing it', () => {
    const { segments } = combineSeasonCues([ep(1, ['a']), { episode: 2, cues: [] }, ep(3, ['c'])]);
    expect(segments.map((s) => s.episode)).toEqual([1, 2, 3]);
    expect(segments[1].cues).toBe(0);
  });

  it('maps a moment in the combined timeline back to its episode', () => {
    const { segments } = combineSeasonCues([ep(20, ['a', 'b']), ep(21, ['c'])]);
    expect(episodeAt(segments, 0)).toBe(20);
    expect(episodeAt(segments, segments[1].start)).toBe(21);
    // The gap belongs to no episode, and saying so beats guessing.
    expect(episodeAt(segments, segments[0].end + 1)).toBeNull();
  });

  it('preserves every cue', () => {
    const { cues } = combineSeasonCues([ep(1, ['a', 'b', 'c']), ep(2, ['d', 'e'])]);
    expect(cues.map((c) => c.text)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('undoes the offset so a located moment is episode-relative', () => {
    // Deck provenance reads this. `t=15s of episode 21` corresponds to a real
    // moment in a real file; the combined `t=45s` corresponds to nothing.
    const { segments } = combineSeasonCues([ep(20, ['a', 'b']), ep(21, ['c', 'd'])]);
    expect(locateInSeason(segments, 0)).toEqual({ episode: 20, withinSec: 0 });
    expect(locateInSeason(segments, 10)).toEqual({ episode: 20, withinSec: 10 });
    expect(locateInSeason(segments, segments[1].start + 10))
      .toEqual({ episode: 21, withinSec: 10 });
  });

  it('refuses to place a moment that belongs to no episode', () => {
    const { segments } = combineSeasonCues([ep(20, ['a', 'b']), ep(21, ['c'])]);
    expect(locateInSeason(segments, segments[0].end + 1)).toBeNull();
    expect(locateInSeason(segments, segments[1].end + 10_000)).toBeNull();
  });
});

describe('exports', () => {
  const cues = [
    { start: 0, end: 1.5, text: 'おはよう' },
    { start: 3661.5, end: 3663, text: 'こんばんは' },
  ];

  it('writes SubRip with comma milliseconds and 1-based indices', () => {
    const srt = toSrt(cues);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,500\nおはよう');
    expect(srt).toContain('2\n01:01:01,500 --> 01:01:03,000\nこんばんは');
  });

  it('writes plain text as one line per cue, with no timings', () => {
    expect(toPlainText(cues)).toBe('おはよう\nこんばんは');
    expect(toPlainText(cues)).not.toContain('-->');
  });

  it('flattens a multi-line cue into one plain-text line', () => {
    expect(toPlainText([{ start: 0, end: 1, text: 'first\nsecond' }])).toBe('first second');
  });
});

describe('chooseJimakuEntry', () => {
  // Names as Jimaku actually files them. The three wrong answers below are not
  // hypothetical: on 2026-08-16 the live listing returned each of them for the
  // plain title, because the code took `entries[0]`.
  const naruto = { id: 983, name: 'Naruto', japanese_name: 'NARUTO -ナルト-' };
  const boruto = { id: 1959, name: 'Boruto: Naruto Next Generations' };
  const shippuuden = { id: 1000, name: 'Naruto: Shippuuden' };
  const onePiece = { id: 1563, name: 'One Piece' };
  const onePieceSpecial = {
    id: 3425,
    name: 'One Piece 3D2Y: Ace no Shi wo Koete! Luffy Nakama Tono Chikai',
  };
  const conan = { id: 743, name: 'Detective Conan', english_name: 'Case Closed' };
  const lupinConan = { id: 900, name: 'Lupin III vs. Detective Conan' };

  it('prefers the exact title over a sequel that contains it', () => {
    // Provider order deliberately puts the wrong answer first — that ordering
    // is exactly what produced 293 files of BORUTO for a Naruto harvest.
    expect(chooseJimakuEntry([boruto, naruto, shippuuden], 'Naruto')?.id).toBe(983);
  });

  it('prefers the series over a special whose name starts with it', () => {
    expect(chooseJimakuEntry([onePieceSpecial, onePiece], 'One Piece')?.id).toBe(1563);
  });

  it('prefers the series over a crossover film that contains it', () => {
    expect(chooseJimakuEntry([lupinConan, conan], 'Detective Conan')?.id).toBe(743);
  });

  it('matches on the English name when the primary name is not the queried one', () => {
    expect(chooseJimakuEntry([lupinConan, conan], 'Case Closed')?.id).toBe(743);
  });

  it('ignores punctuation and case differences between the two spellings', () => {
    expect(chooseJimakuEntry([boruto, naruto], 'BORUTO - Naruto Next Generations')?.id).toBe(1959);
  });

  it('keeps the provider ordering when there is no title to rank on', () => {
    // The id path: the caller asked by anilist_id, where the provider's order
    // is the only signal and second-guessing it would be invention.
    expect(chooseJimakuEntry([onePieceSpecial, onePiece], '')?.id).toBe(3425);
  });

  it('falls back to the first entry when nothing matches by name at all', () => {
    // Still a guess, but the provider returned these *for this query*, so it is
    // no worse than refusing — and the caller reports it as a title match.
    expect(chooseJimakuEntry([boruto, shippuuden], 'Frieren')?.id).toBe(1959);
  });

  it('returns null for an empty listing rather than inventing an entry', () => {
    expect(chooseJimakuEntry([], 'Naruto')).toBeNull();
  });

  it('does not depend on the order equal-scoring entries were returned in', () => {
    const forward = chooseJimakuEntry([naruto, shippuuden, boruto], 'Naruto')?.id;
    const reversed = chooseJimakuEntry([boruto, shippuuden, naruto], 'Naruto')?.id;
    expect(forward).toBe(reversed);
  });
});
