import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAL_SELECTION,
  chapterLabel,
  coveredByBatchRange,
  episodeLabel,
  filterMalReleases,
  namesAnyEpisode,
  parseUnitNumber,
  planMalReleases,
  rankMalReleases,
  releaseCoversEpisode,
  resolveMalSelection,
  seedMalSelection,
  summarizeMalSelection,
  type MalDownloadSelection,
  type MalDownloadUnit,
  type MalRelease,
} from '../malDownload';

function unit(number: number, patch: Partial<MalDownloadUnit> = {}): MalDownloadUnit {
  return {
    key: `e${number}`,
    ordinal: number - 1,
    number,
    label: episodeLabel(number),
    title: `Episode ${number}`,
    nativeTitle: '',
    airDate: null,
    filler: false,
    recap: false,
    source: null,
    ...patch,
  };
}

const twelve = Array.from({ length: 12 }, (_, index) => unit(index + 1));

function selection(patch: Partial<MalDownloadSelection> = {}): MalDownloadSelection {
  return { ...DEFAULT_MAL_SELECTION, ...patch };
}

describe('resolveMalSelection', () => {
  it('takes everything in published order for `all`', () => {
    const shuffled = [twelve[4], twelve[0], twelve[11]];
    expect(resolveMalSelection(shuffled, selection()).map((u) => u.number)).toEqual([1, 5, 12]);
  });

  it('treats range bounds as inclusive', () => {
    const picked = resolveMalSelection(twelve, selection({ mode: 'range', from: 3, to: 6 }));
    expect(picked.map((u) => u.number)).toEqual([3, 4, 5, 6]);
  });

  it('reads a reversed range as the same range', () => {
    const forward = resolveMalSelection(twelve, selection({ mode: 'range', from: 3, to: 6 }));
    const backward = resolveMalSelection(twelve, selection({ mode: 'range', from: 6, to: 3 }));
    expect(backward).toEqual(forward);
  });

  it('takes the newest units for `latest`', () => {
    const picked = resolveMalSelection(twelve, selection({ mode: 'latest', latest: 3 }));
    expect(picked.map((u) => u.number)).toEqual([10, 11, 12]);
  });

  it('caps `latest` at the list length instead of erroring', () => {
    expect(resolveMalSelection(twelve, selection({ mode: 'latest', latest: 40 }))).toHaveLength(12);
  });

  it('selects nothing for a non-positive `latest`', () => {
    expect(resolveMalSelection(twelve, selection({ mode: 'latest', latest: 0 }))).toEqual([]);
  });

  it('keeps only hand-picked keys for `custom`', () => {
    const picked = resolveMalSelection(twelve, selection({ mode: 'custom', keys: ['e2', 'e9'] }));
    expect(picked.map((u) => u.number)).toEqual([2, 9]);
  });

  it('ignores custom keys that are not in the list', () => {
    const picked = resolveMalSelection(twelve, selection({ mode: 'custom', keys: ['e2', 'nope'] }));
    expect(picked.map((u) => u.number)).toEqual([2]);
  });

  // The ordering rule that makes "the latest 3, skipping filler" mean what it
  // says: filtering has to happen before the mode, not after it.
  it('applies the filler filter before taking the latest N', () => {
    const withFiller = [
      ...twelve.slice(0, 9),
      unit(10, { filler: true }),
      unit(11, { filler: true }),
      twelve[11],
    ];
    const picked = resolveMalSelection(
      withFiller,
      selection({ mode: 'latest', latest: 3, skipFillers: true }),
    );
    expect(picked.map((u) => u.number)).toEqual([8, 9, 12]);
  });

  it('drops recaps only when asked to', () => {
    const withRecap = [...twelve.slice(0, 5), unit(6, { recap: true }), ...twelve.slice(6)];
    expect(resolveMalSelection(withRecap, selection())).toHaveLength(12);
    expect(resolveMalSelection(withRecap, selection({ skipRecaps: true }))).toHaveLength(11);
  });

  // What makes "download chapters 1–200" safe to press twice.
  it('leaves out what is already held, without touching the range', () => {
    const withOwned = [
      unit(1, { owned: true }),
      unit(2, { owned: true }),
      ...twelve.slice(2, 5),
    ];
    const picked = resolveMalSelection(withOwned, selection({ mode: 'range', from: 1, to: 5 }));
    expect(picked.map((u) => u.number)).toEqual([3, 4, 5]);
  });

  it('keeps what is already held when the user unticks the filter', () => {
    const withOwned = [unit(1, { owned: true }), ...twelve.slice(1, 3)];
    const picked = resolveMalSelection(withOwned, selection({ skipOwned: false }));
    expect(picked).toHaveLength(3);
  });

  it('treats a unit with no owned flag as not owned', () => {
    // Main cannot know the local library, so its units carry no flag at all.
    expect(resolveMalSelection(twelve, selection({ skipOwned: true }))).toHaveLength(12);
  });

  it('applies the owned filter before taking the latest N', () => {
    const withOwned = [...twelve.slice(0, 10), unit(11, { owned: true }), unit(12, { owned: true })];
    const picked = resolveMalSelection(withOwned, selection({ mode: 'latest', latest: 2 }));
    expect(picked.map((u) => u.number)).toEqual([9, 10]);
  });

  it('handles fractional chapter numbers in a range', () => {
    const chapters = [
      unit(10, { key: 'c10', ordinal: 0 }),
      unit(10.5, { key: 'c10.5', ordinal: 1 }),
      unit(11, { key: 'c11', ordinal: 2 }),
    ];
    const picked = resolveMalSelection(chapters, selection({ mode: 'range', from: 10, to: 10.5 }));
    expect(picked.map((u) => u.number)).toEqual([10, 10.5]);
  });
});

describe('seedMalSelection', () => {
  it('seeds the range bounds from the list', () => {
    const seeded = seedMalSelection(twelve);
    expect(seeded.from).toBe(1);
    expect(seeded.to).toBe(12);
  });

  it('drops hand-picked keys that belong to a different entry', () => {
    const seeded = seedMalSelection(twelve, selection({ mode: 'custom', keys: ['e3', 'other-e3'] }));
    expect(seeded.keys).toEqual(['e3']);
  });

  it('survives an empty list', () => {
    const seeded = seedMalSelection([]);
    expect(seeded.keys).toEqual([]);
    expect(resolveMalSelection([], seeded)).toEqual([]);
  });
});

describe('summarizeMalSelection', () => {
  it('reports the resolved span', () => {
    const summary = summarizeMalSelection(twelve, selection({ mode: 'range', from: 4, to: 8 }));
    expect(summary).toMatchObject({
      selected: 5,
      total: 12,
      skipped: 0,
      firstNumber: 4,
      lastNumber: 8,
      contiguous: true,
    });
  });

  it('counts units excluded by the filters, not by the mode', () => {
    const withFiller = [...twelve.slice(0, 11), unit(12, { filler: true })];
    const summary = summarizeMalSelection(
      withFiller,
      selection({ mode: 'range', from: 1, to: 4, skipFillers: true }),
    );
    expect(summary.selected).toBe(4);
    expect(summary.skipped).toBe(1);
  });

  it('reports a gapped selection as not contiguous', () => {
    const summary = summarizeMalSelection(twelve, selection({ mode: 'custom', keys: ['e1', 'e5'] }));
    expect(summary.contiguous).toBe(false);
  });
});

function release(name: string, patch: Partial<MalRelease> = {}): MalRelease {
  return {
    id: name,
    name,
    magnet: `magnet:?xt=urn:btih:${name.length}`,
    infoHash: String(name.length),
    sizeBytes: 1_400_000_000,
    seeders: 10,
    leechers: 1,
    resolution: '1080p',
    releaseGroup: 'Group',
    isBatch: false,
    ...patch,
  };
}

describe('releaseCoversEpisode', () => {
  it('reads the conventions release groups actually use', () => {
    expect(releaseCoversEpisode('[SubsPlease] Frieren - 07 (1080p) [ABC123].mkv', 7)).toBe(true);
    expect(releaseCoversEpisode('[Erai-raws] Frieren - 07v2 [1080p][Multiple Subtitle]', 7)).toBe(true);
    expect(releaseCoversEpisode('Frieren S01E07 1080p WEB-DL', 7)).toBe(true);
    expect(releaseCoversEpisode('Frieren Episode 7 [720p]', 7)).toBe(true);
    expect(releaseCoversEpisode('Frieren [07][1080p]', 7)).toBe(true);
    expect(releaseCoversEpisode('Frieren_07_1080p', 7)).toBe(true);
  });

  // The reason this is stricter than a bare word-boundary match: every one of
  // these numbers is in the name for some other reason.
  it('does not read resolutions, years or season numbers as episode numbers', () => {
    expect(releaseCoversEpisode('[Group] Frieren - 01 (1080p)', 1080)).toBe(false);
    expect(releaseCoversEpisode('[Group] Show (2023) - 01 [1080p]', 2023)).toBe(false);
    expect(releaseCoversEpisode('[Group] Show S02 - 01 [1080p]', 2)).toBe(false);
    expect(releaseCoversEpisode('[Group] Show - 26 [1080p]', 2)).toBe(false);
    expect(releaseCoversEpisode('[Group] Show - 07 [1080p]', 70)).toBe(false);
  });

  it('accepts a zero-padded number for an unpadded episode', () => {
    expect(releaseCoversEpisode('[Group] Show - 007 [1080p]', 7)).toBe(true);
  });

  // Subtitle files put the extension straight against the number, where a
  // torrent name has a space or a bracket. This matcher is shared with the
  // subtitle harvest, so a guard that rejected any following dot rejected
  // every file name it was asked about.
  it('reads an episode number a file extension is attached to', () => {
    expect(releaseCoversEpisode('Frieren - 20.ja.srt', 20)).toBe(true);
    expect(releaseCoversEpisode('[Group] Frieren - 07.ass', 7)).toBe(true);
    expect(releaseCoversEpisode('Frieren S01E07.srt', 7)).toBe(true);
  });

  it('still refuses a fractional episode', () => {
    expect(releaseCoversEpisode('[Group] Show - 2.5 [1080p]', 2)).toBe(false);
    expect(releaseCoversEpisode('Show - 07.5.ja.srt', 7)).toBe(false);
  });
});

describe('coveredByBatchRange', () => {
  it('covers an episode named only by the batch range', () => {
    expect(coveredByBatchRange('[Group] Frieren (01-28) [1080p][Batch]', 7)).toBe(true);
    expect(coveredByBatchRange('[Group] Frieren (01-12) [1080p]', 20)).toBe(false);
  });

  it('does not read a dimension pair as an episode range', () => {
    expect(coveredByBatchRange('[Group] Show 1920-1080 remux', 1_500)).toBe(false);
  });
});

describe('planMalReleases', () => {
  const three = [unit(1), unit(2), unit(3)];

  it('matches each unit to its own release', () => {
    const plan = planMalReleases(three, [
      release('[G] Show - 01 [1080p]'),
      release('[G] Show - 02 [1080p]'),
      release('[G] Show - 03 [1080p]'),
    ]);
    expect(plan.covered).toBe(3);
    expect(plan.missing).toEqual([]);
    expect(plan.releases).toHaveLength(3);
    expect(plan.matches.every((match) => !match.viaBatch)).toBe(true);
  });

  it('prefers the requested resolution over a higher-seeded mismatch', () => {
    const plan = planMalReleases([unit(1)], [
      release('[G] Show - 01 [720p]', { resolution: '720p', seeders: 900 }),
      release('[G] Show - 01 [1080p]', { resolution: '1080p', seeders: 12 }),
    ], { preferredResolution: '1080p' });
    expect(plan.matches[0].release?.resolution).toBe('1080p');
  });

  it('falls back to seeders when no resolution is requested', () => {
    const plan = planMalReleases([unit(1)], [
      release('[A] Show - 01', { seeders: 4 }),
      release('[B] Show - 01', { seeders: 400 }),
    ]);
    expect(plan.matches[0].release?.name).toBe('[B] Show - 01');
  });

  // A batch brings episodes the user did not ask for, so it is the fallback
  // rather than the default — and when it is used, the plan says so.
  it('uses a batch only where nothing else covers the unit', () => {
    const plan = planMalReleases(three, [
      release('[G] Show - 01 [1080p]'),
      release('[G] Show (01-12) [1080p][Batch]', { isBatch: true }),
    ]);
    expect(plan.matches[0].viaBatch).toBe(false);
    expect(plan.matches[1].viaBatch).toBe(true);
    expect(plan.covered).toBe(3);
  });

  it('sends one torrent, not one per unit, when a batch covers several', () => {
    const plan = planMalReleases(three, [
      release('[G] Show (01-12) [1080p][Batch]', { isBatch: true }),
    ]);
    expect(plan.releases).toHaveLength(1);
    expect(plan.covered).toBe(3);
  });

  it('takes the whole-run batch over per-episode releases when asked', () => {
    const plan = planMalReleases(three, [
      release('[G] Show - 01 [1080p]'),
      release('[G] Show - 02 [1080p]'),
      release('[G] Show - 03 [1080p]'),
      release('[G] Show (01-12) [1080p][Batch]', { isBatch: true }),
    ], { preferBatches: true });
    expect(plan.releases).toHaveLength(1);
    expect(plan.batch?.isBatch).toBe(true);
    expect(plan.matches.every((match) => match.viaBatch)).toBe(true);
  });

  it('reports the units no release covers instead of quietly dropping them', () => {
    const plan = planMalReleases(three, [release('[G] Show - 01 [1080p]')]);
    expect(plan.covered).toBe(1);
    expect(plan.missing.map((u) => u.number)).toEqual([2, 3]);
    expect(plan.matches[2].release).toBeNull();
  });

  // The regression this guards: asking `every(byName) || every(byRange)` per
  // batch rejects the very common release that names some episodes outright and
  // leaves the rest to its declared range.
  it('accepts a batch that covers some units by name and the rest by its range', () => {
    const plan = planMalReleases([unit(1), unit(2), unit(9)], [
      release('[G] Show - 01 - 02 (03-12) [1080p][Batch]', { isBatch: true }),
    ], { preferBatches: true });
    expect(plan.batch).not.toBeNull();
    expect(plan.covered).toBe(3);
    expect(plan.missing).toEqual([]);
  });

  it('finds no whole-run batch when the selection has a gap the batch misses', () => {
    const plan = planMalReleases([unit(1), unit(20)], [
      release('[G] Show (01-12) [1080p][Batch]', { isBatch: true }),
    ], { preferBatches: true });
    expect(plan.batch).toBeNull();
    expect(plan.missing.map((u) => u.number)).toEqual([20]);
  });
});

describe('rankMalReleases', () => {
  it('puts the preferred resolution first, then the best-seeded', () => {
    const ranked = rankMalReleases([
      release('a', { resolution: '720p', seeders: 900 }),
      release('b', { resolution: '1080p', seeders: 3 }),
      release('c', { resolution: '1080p', seeders: 80 }),
    ], { preferredResolution: '1080p' });
    expect(ranked.map((r) => r.name)).toEqual(['c', 'b', 'a']);
  });

  it('falls back to seeders when nothing is preferred', () => {
    const ranked = rankMalReleases([
      release('a', { seeders: 5 }),
      release('b', { seeders: 50 }),
    ]);
    expect(ranked[0].name).toBe('b');
  });

  it('does not mutate the input', () => {
    const input = [release('a', { seeders: 1 }), release('b', { seeders: 9 })];
    rankMalReleases(input);
    expect(input.map((r) => r.name)).toEqual(['a', 'b']);
  });
});

describe('filterMalReleases', () => {
  const list = [
    release('[Group] Naruto v01-v72 (Raw) [Japanese]'),
    release('[Other] Naruto Digital Colored Comics'),
    release('[Group] Bleach v01-v74 (Raw)'),
  ];

  it('returns everything for an empty query', () => {
    expect(filterMalReleases(list, '   ')).toHaveLength(3);
  });

  it('requires every term to appear, in any order', () => {
    expect(filterMalReleases(list, 'naruto raw').map((r) => r.name))
      .toEqual(['[Group] Naruto v01-v72 (Raw) [Japanese]']);
    expect(filterMalReleases(list, 'raw naruto')).toHaveLength(1);
  });

  it('ignores case', () => {
    expect(filterMalReleases(list, 'BLEACH')).toHaveLength(1);
  });

  it('matches the release group as well as the name', () => {
    expect(filterMalReleases(list, 'Group')).toHaveLength(3);
  });
});

describe('unit labelling', () => {
  it('pads short episode numbers only', () => {
    expect(episodeLabel(7)).toBe('EP 07');
    expect(episodeLabel(112)).toBe('EP 112');
    expect(episodeLabel(10.5)).toBe('EP 10.5');
  });

  it('leaves a chapter number that already names itself alone', () => {
    expect(chapterLabel('Chapter 12', 12)).toBe('Chapter 12');
    expect(chapterLabel('10.5', 10.5)).toBe('Ch. 10.5');
    expect(chapterLabel('', 4)).toBe('Ch. 4');
  });

  it('reads the leading number out of a published chapter number', () => {
    expect(parseUnitNumber('10.5', 0)).toBe(10.5);
    expect(parseUnitNumber('Chapter 12', 0)).toBe(12);
    expect(parseUnitNumber('10-11', 0)).toBe(10);
    expect(parseUnitNumber('Extra', 7)).toBe(7);
  });
});

// A one-episode title — OVA, movie, special — is 321 of the 1,426 entries on
// the measured MAL list, and every one of them planned to nothing before this:
// the release has no episode number because there is no episode to number.
describe('single-unit titles', () => {
  const sole = [unit(1)];
  const KURUMI = '[project-gxs] Date a Live II - Kurumi Star Festival OVA [10bit BD 720p] [5ACBBFF2].mkv';

  it('leaves the title uncovered when the flag is not set', () => {
    const plan = planMalReleases(sole, [release(KURUMI)]);
    expect(plan.covered).toBe(0);
    expect(plan.releases).toEqual([]);
  });

  it('covers it from a release that numbers no episode', () => {
    const plan = planMalReleases(sole, [release(KURUMI)], { singleUnitTitle: true });
    expect(plan.covered).toBe(1);
    expect(plan.matches[0].release?.name).toBe(KURUMI);
    expect(plan.matches[0].viaBatch).toBe(false);
  });

  // The control that keeps this from being "match anything". A release that
  // names a different episode is still the wrong thing for the sole unit.
  it('still refuses a release that names another episode', () => {
    const plan = planMalReleases(sole, [release('[G] Show - 05 [1080p]')], { singleUnitTitle: true });
    expect(plan.covered).toBe(0);
    expect(plan.missing.map((u) => u.number)).toEqual([1]);
  });

  it('prefers the release that names episode 1 over an unnumbered one', () => {
    const plan = planMalReleases(sole, [
      release('[G] Show OVA [1080p]', { seeders: 900 }),
      release('[G] Show - 01 [1080p]', { seeders: 1 }),
    ], { singleUnitTitle: true });
    expect(plan.matches[0].release?.name).toBe('[G] Show - 01 [1080p]');
  });

  // Hand-picking episode 7 of a 26-episode show also selects one unit. The
  // caller does not set the flag there, so an unnumbered season pack cannot be
  // offered as episode 7.
  it('does not widen a one-unit selection out of a many-unit title', () => {
    const plan = planMalReleases([unit(7)], [release('[G] Show Complete [1080p]')]);
    expect(plan.covered).toBe(0);
  });

  it('ignores the flag when more than one unit is selected', () => {
    const plan = planMalReleases([unit(1), unit(2)], [release('[G] Show OVA [1080p]')], { singleUnitTitle: true });
    expect(plan.covered).toBe(0);
  });
});

describe('namesAnyEpisode', () => {
  it('reads the shapes a release actually numbers an episode with', () => {
    expect(namesAnyEpisode('[G] Show - 05 [1080p]')).toBe(true);
    expect(namesAnyEpisode('[G] Show S01E07')).toBe(true);
    expect(namesAnyEpisode('[G] Show ep12 [720p]')).toBe(true);
    expect(namesAnyEpisode('[G] Show [03]')).toBe(true);
  });

  // Every real release is full of digits that are not episode numbers. If any
  // of these read as one, the single-unit path would stop covering anything.
  it('does not read a resolution, bit depth, year or CRC as an episode', () => {
    expect(namesAnyEpisode('[project-gxs] Date a Live II - Kurumi Star Festival OVA [10bit BD 720p] [5ACBBFF2].mkv')).toBe(false);
    expect(namesAnyEpisode('[Commie] Dareka no Manazashi [1080p] [E9ED99BE].mkv')).toBe(false);
    expect(namesAnyEpisode('[G] Akira (2019) [BD 1920x1080 FLAC]')).toBe(false);
  });
});
