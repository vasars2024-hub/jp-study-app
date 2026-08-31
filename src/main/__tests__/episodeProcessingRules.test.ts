/*
 * The four `episodeProcessing` settings that read nothing at all until
 * 2026-08-04 — audit F5.
 *
 * `detectMissingNumbers`, `mergeDuplicateSources`, `keepHighestQuality` and
 * `renameEpisodes` were implemented only inside `shared/episodeProcessing.ts`,
 * whose sole importer is its own test. A user could change all four and no
 * output anywhere differed. The other six in the group were live throughout,
 * read directly by the engine — so each test below asserts the *change* the
 * setting makes, and the off-case, which is what a dead setting cannot fail.
 */
import { describe, expect, it } from 'vitest';
import type { EpisodeRow, SubtitleAvailability } from '../../shared/scraperResults';
import type { ScraperEpisodeProcessingSettings } from '../../shared/scraperSettings';
import {
  applyEpisodeProcessing,
  missingEpisodeNumbers,
  missingEpisodesNote,
} from '../scraper/episodeProcessingRules';

const OFF: ScraperEpisodeProcessingSettings = {
  naturalSort: false,
  detectMissingNumbers: false,
  mergeDuplicateSources: false,
  keepHighestQuality: false,
  audioPreference: 'none',
  languagePriority: [],
  resolutionPriority: [],
  ignoreFiller: false,
  ignoreRecaps: false,
  renameEpisodes: false,
};

function subtitle(language: string): SubtitleAvailability {
  return { language, format: 'ass', embedded: true, quality: 0.5, source: 'test' };
}

function row(partial: Partial<EpisodeRow> & { number: number }): EpisodeRow {
  return {
    id: `e${partial.number}`,
    seriesId: 's',
    numberLabel: `第${partial.number}話`,
    season: 1,
    titleEn: `Episode ${partial.number}`,
    titleJa: '',
    kind: 'episode',
    audio: '',
    resolution: '',
    sourceId: 'src',
    sourceLabel: 'host',
    sizeBytes: 0,
    durationSec: 0,
    airDate: null,
    url: '',
    thumbnailUrl: '',
    subtitles: [],
    status: 'ok',
    statusNote: '',
    ...partial,
  };
}

describe('every toggle off leaves rows untouched', () => {
  it('returns the same rows and no gap report', () => {
    const rows = [row({ number: 1 }), row({ number: 3 })];
    const out = applyEpisodeProcessing(rows, OFF);
    expect(out.rows).toBe(rows);
    expect(out.missingEpisodeNumbers).toEqual([]);
  });
});

describe('detectMissingNumbers', () => {
  const rows = [row({ number: 1 }), row({ number: 2 }), row({ number: 5 })];

  it('reports the gaps when on', () => {
    const out = applyEpisodeProcessing(rows, { ...OFF, detectMissingNumbers: true });
    expect(out.missingEpisodeNumbers).toEqual([3, 4]);
  });

  it('reports nothing when off — the control is what decides', () => {
    expect(applyEpisodeProcessing(rows, OFF).missingEpisodeNumbers).toEqual([]);
  });

  it('ignores non-episode kinds, which have their own numbering', () => {
    const mixed = [row({ number: 1 }), row({ number: 9, kind: 'ova' }), row({ number: 2 })];
    expect(missingEpisodeNumbers(mixed)).toEqual([]);
  });

  it('renders a note a user can read, and nothing at all when complete', () => {
    expect(missingEpisodesNote([3, 4])).toBe('Missing episode numbers: 3, 4.');
    expect(missingEpisodesNote([3])).toBe('Missing episode number: 3.');
    expect(missingEpisodesNote([])).toBe('');
    expect(missingEpisodesNote([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toContain('+2 more');
  });
});

describe('mergeDuplicateSources', () => {
  const mirrors = [
    row({ number: 1, id: 'a', sourceLabel: 'mirror-a', resolution: '720p' }),
    row({ number: 1, id: 'b', sourceLabel: 'mirror-b', resolution: '1080p' }),
    row({ number: 2, id: 'c' }),
  ];

  it('collapses two mirrors of one episode into one row', () => {
    const out = applyEpisodeProcessing(mirrors, { ...OFF, mergeDuplicateSources: true });
    expect(out.rows).toHaveLength(2);
    expect(out.rows.map((r) => r.number)).toEqual([1, 2]);
  });

  it('leaves both rows standing when off', () => {
    expect(applyEpisodeProcessing(mirrors, OFF).rows).toHaveLength(3);
  });

  it('does not merge across seasons or kinds', () => {
    const distinct = [
      row({ number: 1, id: 'a', season: 1 }),
      row({ number: 1, id: 'b', season: 2 }),
      row({ number: 1, id: 'c', kind: 'ova' }),
    ];
    const out = applyEpisodeProcessing(distinct, { ...OFF, mergeDuplicateSources: true });
    expect(out.rows).toHaveLength(3);
  });

  it('keeps a subtitle track only the discarded mirror had', () => {
    const withSubs = [
      row({ number: 1, id: 'a', subtitles: [subtitle('en')] }),
      row({ number: 1, id: 'b', subtitles: [subtitle('ja')] }),
    ];
    const out = applyEpisodeProcessing(withSubs, { ...OFF, mergeDuplicateSources: true });
    expect(out.rows[0].subtitles.map((s) => s.language).sort()).toEqual(['en', 'ja']);
  });
});

describe('keepHighestQuality', () => {
  const mirrors = [
    row({ number: 1, id: 'low', resolution: '720p' }),
    row({ number: 1, id: 'high', resolution: '1080p' }),
  ];

  it('picks the preferred resolution rather than the first row seen', () => {
    const out = applyEpisodeProcessing(mirrors, {
      ...OFF,
      mergeDuplicateSources: true,
      keepHighestQuality: true,
      resolutionPriority: [1080, 720],
    });
    expect(out.rows[0].id).toBe('high');
  });

  it('honours the user order, not the bigger number', () => {
    const out = applyEpisodeProcessing(mirrors, {
      ...OFF,
      mergeDuplicateSources: true,
      keepHighestQuality: true,
      resolutionPriority: [720, 1080],
    });
    expect(out.rows[0].id).toBe('low');
  });

  it('leaves the first mirror standing when off — this is the whole defect', () => {
    const out = applyEpisodeProcessing(mirrors, {
      ...OFF,
      mergeDuplicateSources: true,
      resolutionPriority: [1080, 720],
    });
    expect(out.rows[0].id).toBe('low');
  });
});

describe('renameEpisodes', () => {
  it('rewrites titles to SxxExx', () => {
    const out = applyEpisodeProcessing([row({ number: 3, season: 2 })], {
      ...OFF,
      renameEpisodes: true,
    });
    expect(out.rows[0].titleEn).toBe('S02E03');
  });

  it('leaves the provider title alone when off', () => {
    expect(applyEpisodeProcessing([row({ number: 3 })], OFF).rows[0].titleEn).toBe('Episode 3');
  });

  it('leaves an unnumbered row alone rather than minting SxxENaN', () => {
    const out = applyEpisodeProcessing([row({ number: Number.NaN, titleEn: 'Bonus' })], {
      ...OFF,
      renameEpisodes: true,
    });
    expect(out.rows[0].titleEn).toBe('Bonus');
  });
});

describe('the kind filter and its opt-out', () => {
  const rows = [row({ number: 1 }), row({ number: 2, kind: 'recap' }), row({ number: 3, kind: 'opening' })];

  it('drops recaps and openings when asked', () => {
    const out = applyEpisodeProcessing(rows, { ...OFF, ignoreRecaps: true, ignoreFiller: true });
    expect(out.rows.map((r) => r.number)).toEqual([1]);
  });

  it('keeps canon extras — a filler toggle must not delete OVAs and movies', () => {
    const canon = [row({ number: 1, kind: 'ova' }), row({ number: 2, kind: 'movie' })];
    const out = applyEpisodeProcessing(canon, { ...OFF, ignoreFiller: true });
    expect(out.rows).toHaveLength(2);
  });

  it('skips the filter entirely when the caller already filtered', () => {
    const out = applyEpisodeProcessing(rows, { ...OFF, ignoreRecaps: true }, { skipKindFilter: true });
    expect(out.rows).toHaveLength(3);
  });
});
