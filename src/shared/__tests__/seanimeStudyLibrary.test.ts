/**
 * Phase 6 slice 1 — the Seanime↔Study OS library join and its readiness projection.
 *
 * The join is by absolute path because that is the only fact both libraries record
 * independently. The single real Seanime path on record is native Windows with
 * backslashes, so the tests below pin *both* separator forms and mixed case against each
 * other: one sample from one fixture library is not a guarantee about what a Go server
 * will emit next, and a silently-failed join looks exactly like an empty library.
 */
import { describe, expect, it } from 'vitest';
import {
  STUDY_ANALYZER_VERSION,
  type StudyOrchestratorDocument,
  type StudyReadinessSnapshot,
} from '../mediaStudyOrchestrator';
import {
  filterSeanimeStudyDifficulty,
  hasDifficulty,
  joinSeanimeStudyLibrary,
  seanimeStudyAnkiHealth,
  seanimeStudyDifficultyLevels,
  seanimeStudyLibraryHealth,
  seanimeStudyPreparationQueue,
  studyLibraryPathIndex,
  studyLibraryPathKey,
  type SeanimeLibraryFile,
} from '../seanimeStudyLibrary';
import type { StudyReadinessFingerprints } from '../studyEpisodeReadiness';
import type { SubtitleRecord } from '../subtitleRecord';
import type { MediaItem } from '../types';

const FINGERPRINTS: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'k1',
  levelListsFingerprint: 'l1',
  frequencyListsFingerprint: 'f1',
};

const WINDOWS_PATH = 'C:\\Users\\Arseniy\\Videos\\Frieren\\Sousou no Frieren - 01.mkv';

function subtitle(patch: Partial<SubtitleRecord> = {}): SubtitleRecord {
  return {
    id: 'sub-ja',
    lang: 'ja',
    source: 'embedded',
    format: 'srt',
    path: 'subs/ja.srt',
    ...patch,
  } as SubtitleRecord;
}

function mediaItem(patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'study-1',
    title: 'Frieren 01',
    path: WINDOWS_PATH,
    fileName: 'Sousou no Frieren - 01.mkv',
    addedAt: 1,
    subtitles: [subtitle()],
    ...patch,
  } as MediaItem;
}

function seanimeFile(patch: Partial<SeanimeLibraryFile> = {}): SeanimeLibraryFile {
  return { path: WINDOWS_PATH, mediaId: 154587, episode: 1, ...patch };
}

function snapshot(patch: Partial<StudyReadinessSnapshot> = {}): StudyReadinessSnapshot {
  return {
    id: 'readiness-1',
    mediaId: 'study-1',
    analyzerVersion: STUDY_ANALYZER_VERSION,
    generatedAt: 1000,
    sourceFingerprint: 's1',
    knowledgeFingerprint: 'k1',
    levelListsFingerprint: 'l1',
    frequencyListsFingerprint: 'f1',
    subtitleRecordId: 'sub-ja',
    subtitleReady: true,
    contentLevel: 'N3',
    confidence: 0.9,
    knownCoverage: 0.82,
    uniqueKnownCoverage: 0.7,
    totalWordOccurrences: 100,
    knownWordOccurrences: 82,
    unknownUniqueWords: 12,
    recurringUnknownWords: 3,
    category: 'comfortable',
    truncated: false,
    ...patch,
  } as StudyReadinessSnapshot;
}

function doc(snapshots: StudyReadinessSnapshot[] = []): StudyOrchestratorDocument {
  return {
    version: 2,
    readiness: Object.fromEntries(snapshots.map((s) => [s.id, s])),
    opportunities: {},
    workspaces: {},
    jobs: {},
    actions: [],
  } as unknown as StudyOrchestratorDocument;
}

const join = (
  files: SeanimeLibraryFile[],
  items: MediaItem[],
  document = doc(),
) => joinSeanimeStudyLibrary(files, items, document, FINGERPRINTS);

describe('studyLibraryPathKey', () => {
  it('makes backslash and forward-slash forms of one path the same key', () => {
    expect(studyLibraryPathKey(WINDOWS_PATH))
      .toBe(studyLibraryPathKey(WINDOWS_PATH.replace(/\\/g, '/')));
  });

  it('is case-insensitive, because the two producers are a Go server and Node on Windows', () => {
    expect(studyLibraryPathKey('C:\\A\\B.mkv')).toBe(studyLibraryPathKey('c:\\a\\b.mkv'));
  });

  it('collapses repeated separators and a trailing one', () => {
    expect(studyLibraryPathKey('C:\\\\A\\\\B.mkv\\')).toBe(studyLibraryPathKey('C:/A/B.mkv'));
  });

  it('returns empty for anything unusable rather than a key that could collide', () => {
    expect(studyLibraryPathKey('')).toBe('');
    expect(studyLibraryPathKey('   ')).toBe('');
    expect(studyLibraryPathKey(undefined)).toBe('');
    expect(studyLibraryPathKey(null)).toBe('');
    expect(studyLibraryPathKey(42 as unknown as string)).toBe('');
  });

  it('does not treat two different files as one', () => {
    expect(studyLibraryPathKey('C:/A/01.mkv')).not.toBe(studyLibraryPathKey('C:/A/02.mkv'));
  });
});

describe('studyLibraryPathIndex', () => {
  it('keeps the first entry when two media items claim one path', () => {
    const index = studyLibraryPathIndex([
      mediaItem({ id: 'first' }),
      mediaItem({ id: 'second' }),
    ]);
    expect(index.size).toBe(1);
    expect(index.get(studyLibraryPathKey(WINDOWS_PATH))?.id).toBe('first');
  });

  it('skips items with no usable path instead of indexing them under one empty key', () => {
    const index = studyLibraryPathIndex([
      mediaItem({ id: 'a', path: '' }),
      mediaItem({ id: 'b', path: '   ' }),
    ]);
    expect(index.size).toBe(0);
  });
});

describe('joinSeanimeStudyLibrary', () => {
  it('reports a Seanime-only file as unlinked, not as unanalyzed', () => {
    const [entry] = join([seanimeFile()], []);
    // The distinction is the whole point: unlinked needs an import, unanalyzed needs
    // an analysis run. Collapsing them would send the user to the wrong action.
    expect(entry.state).toBe('unlinked');
    expect(entry.studyMediaId).toBeUndefined();
    expect(entry.readiness).toBeUndefined();
  });

  it('joins across separator and case differences between the two libraries', () => {
    const [entry] = join(
      [seanimeFile({ path: 'c:/users/arseniy/videos/frieren/Sousou no Frieren - 01.mkv' })],
      [mediaItem()],
    );
    expect(entry.state).not.toBe('unlinked');
    expect(entry.studyMediaId).toBe('study-1');
  });

  it('reports missing-subtitles when Study OS has the file but no Japanese track', () => {
    const [entry] = join(
      [seanimeFile()],
      [mediaItem({ subtitles: [subtitle({ id: 'sub-en', lang: 'en' })] })],
    );
    expect(entry.state).toBe('missing-subtitles');
    expect(entry.studyMediaId).toBe('study-1');
    expect(entry.subtitleRecordId).toBeUndefined();
  });

  it('accepts a regional Japanese tag as a Japanese track', () => {
    const [entry] = join(
      [seanimeFile()],
      [mediaItem({ subtitles: [subtitle({ id: 'sub-jajp', lang: 'ja-JP' })] })],
    );
    expect(entry.state).toBe('unanalyzed');
    expect(entry.subtitleRecordId).toBe('sub-jajp');
  });

  it('reports unanalyzed when a Japanese track is attached but nothing has been analysed', () => {
    const [entry] = join([seanimeFile()], [mediaItem()]);
    expect(entry.state).toBe('unanalyzed');
    expect(entry.subtitleRecordId).toBe('sub-ja');
  });

  it('reports ready only when every cache-invalidation signal still matches', () => {
    const [entry] = join([seanimeFile()], [mediaItem()], doc([snapshot()]));
    expect(entry.state).toBe('ready');
    expect(entry.readiness?.knownCoverage).toBe(0.82);
  });

  it.each([
    ['analyzer version moved', { analyzerVersion: STUDY_ANALYZER_VERSION + 1 }],
    ['knowledge fingerprint moved', { knowledgeFingerprint: 'k2' }],
    ['level lists fingerprint moved', { levelListsFingerprint: 'l2' }],
    ['frequency lists fingerprint moved', { frequencyListsFingerprint: 'f2' }],
    ['frequency fingerprint absent (record predates it)', { frequencyListsFingerprint: undefined }],
    ['the snapshot was built without a ready subtitle', { subtitleReady: false }],
    ['the attached subtitle record is a different one', { subtitleRecordId: 'sub-other' }],
  ])('reports stale, never ready, when %s', (_label, patch) => {
    const [entry] = join(
      [seanimeFile()],
      [mediaItem()],
      doc([snapshot(patch as Partial<StudyReadinessSnapshot>)]),
    );
    expect(entry.state).toBe('stale');
    // Stale still carries the snapshot — the caller may want to show it as "last known",
    // it just must not be presented as current.
    expect(entry.readiness).toBeDefined();
  });

  it('uses the newest snapshot for the media, not an arbitrary one', () => {
    const document = doc([
      snapshot({ id: 'old', generatedAt: 10, knowledgeFingerprint: 'stale-key' }),
      snapshot({ id: 'new', generatedAt: 20 }),
    ]);
    const [entry] = join([seanimeFile()], [mediaItem()], document);
    expect(entry.readiness?.id).toBe('new');
    expect(entry.state).toBe('ready');
  });

  it('ignores snapshots belonging to a different media item', () => {
    const document = doc([snapshot({ id: 'other', mediaId: 'study-999' })]);
    const [entry] = join([seanimeFile()], [mediaItem()], document);
    expect(entry.state).toBe('unanalyzed');
    expect(entry.readiness).toBeUndefined();
  });

  it('drops files with an unusable path rather than emitting them under one empty key', () => {
    const entries = join(
      [seanimeFile({ path: '' }), seanimeFile({ path: '   ' }), seanimeFile()],
      [],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe(WINDOWS_PATH);
  });

  it('de-duplicates the same file appearing twice in the collection', () => {
    const entries = join(
      [seanimeFile(), seanimeFile({ path: WINDOWS_PATH.replace(/\\/g, '/') })],
      [],
    );
    expect(entries).toHaveLength(1);
  });

  it('preserves the caller ordering so the sidecar grouping survives', () => {
    const entries = join(
      [
        seanimeFile({ path: 'C:/A/03.mkv', episode: 3 }),
        seanimeFile({ path: 'C:/A/01.mkv', episode: 1 }),
        seanimeFile({ path: 'C:/A/02.mkv', episode: 2 }),
      ],
      [],
    );
    expect(entries.map((e) => e.episode)).toEqual([3, 1, 2]);
  });

  it('prefers the Seanime title, falls back to Study OS, then to the file name', () => {
    const [fromSeanime] = join([seanimeFile({ title: 'Frieren' })], [mediaItem()]);
    expect(fromSeanime.title).toBe('Frieren');

    const [fromStudyOs] = join([seanimeFile()], [mediaItem({ title: 'Study title' })]);
    expect(fromStudyOs.title).toBe('Study title');

    const [fromFileName] = join([seanimeFile({ title: '   ' })], []);
    expect(fromFileName.title).toBe('Sousou no Frieren - 01.mkv');
  });

  it('omits episode when the sidecar did not match one', () => {
    const [entry] = join([seanimeFile({ episode: undefined })], []);
    expect(entry.episode).toBeUndefined();
    expect('episode' in entry).toBe(false);
  });

  it('is deterministic — the same inputs give a deeply equal result', () => {
    const files = [seanimeFile(), seanimeFile({ path: 'C:/A/02.mkv', episode: 2 })];
    const items = [mediaItem()];
    const document = doc([snapshot()]);
    expect(join(files, items, document)).toEqual(join(files, items, document));
  });
});

describe('seanimeStudyLibraryHealth', () => {
  it('counts each state and totals only what it was given', () => {
    const entries = join(
      [
        seanimeFile({ path: 'C:/A/01.mkv' }),
        seanimeFile({ path: 'C:/A/02.mkv' }),
        seanimeFile({ path: 'C:/A/03.mkv' }),
      ],
      [
        mediaItem({ id: 'ready', path: 'C:/A/01.mkv' }),
        mediaItem({ id: 'nosubs', path: 'C:/A/02.mkv', subtitles: [] }),
      ],
      doc([snapshot({ mediaId: 'ready' })]),
    );
    expect(seanimeStudyLibraryHealth(entries)).toEqual({
      total: 3,
      ready: 1,
      stale: 0,
      unanalyzed: 0,
      missingSubtitles: 1,
      unlinked: 1,
    });
  });

  it('reports zeroes for an empty set rather than throwing', () => {
    expect(seanimeStudyLibraryHealth([])).toEqual({
      total: 0, ready: 0, stale: 0, unanalyzed: 0, missingSubtitles: 0, unlinked: 0,
    });
  });
});

describe('difficulty filtering', () => {
  /** One scored entry plus one unscored one — the mix the real library produces. */
  function mixed(patch: Partial<StudyReadinessSnapshot> = {}) {
    return join(
      [
        seanimeFile({ path: 'C:/A/scored.mkv' }),
        seanimeFile({ path: 'C:/A/unscored.mkv' }),
      ],
      [
        mediaItem({ id: 'scored', path: 'C:/A/scored.mkv' }),
        mediaItem({ id: 'unscored', path: 'C:/A/unscored.mkv' }),
      ],
      doc([snapshot({ mediaId: 'scored', ...patch })]),
    );
  }

  it('keeps an unscored entry — unknown difficulty is not a failed difficulty', () => {
    // This is the whole rule: on the real library 30 of 30 entries are unscored, so
    // treating "no snapshot" as "does not match" would empty the surface.
    const entries = mixed();
    const kept = filterSeanimeStudyDifficulty(entries, { levels: ['N1'] });
    expect(kept.map((e) => e.studyMediaId)).toEqual(['unscored']);
    expect(kept.every((e) => !hasDifficulty(e))).toBe(true);
  });

  it('reports which entries a difficulty can actually be read from', () => {
    const entries = mixed();
    expect(entries.filter(hasDifficulty).map((e) => e.studyMediaId)).toEqual(['scored']);
  });

  it('filters by content level', () => {
    expect(filterSeanimeStudyDifficulty(mixed({ contentLevel: 'N3' }), { levels: ['N3'] }))
      .toHaveLength(2);
    expect(filterSeanimeStudyDifficulty(mixed({ contentLevel: 'N3' }), { levels: ['N1'] })
      .filter(hasDifficulty)).toHaveLength(0);
  });

  it('drops a scored entry whose level is null when a level filter is set', () => {
    const kept = filterSeanimeStudyDifficulty(
      mixed({ contentLevel: null }),
      { levels: ['N3'] },
    );
    expect(kept.filter(hasDifficulty)).toHaveLength(0);
  });

  it('filters by readiness category', () => {
    const entries = mixed({ category: 'productive-challenge' });
    expect(filterSeanimeStudyDifficulty(entries, { categories: ['productive-challenge'] })
      .filter(hasDifficulty)).toHaveLength(1);
    expect(filterSeanimeStudyDifficulty(entries, { categories: ['ready-now'] })
      .filter(hasDifficulty)).toHaveLength(0);
  });

  it('filters by a coverage range, inclusive at both bounds', () => {
    const entries = mixed({ knownCoverage: 0.8 });
    const inRange = (min: number, max: number) =>
      filterSeanimeStudyDifficulty(entries, { minCoverage: min, maxCoverage: max })
        .filter(hasDifficulty).length;
    expect(inRange(0.8, 0.8)).toBe(1);
    expect(inRange(0.5, 0.9)).toBe(1);
    expect(inRange(0.81, 1)).toBe(0);
    expect(inRange(0, 0.79)).toBe(0);
  });

  it('treats a null coverage as unknown, not as out of range', () => {
    const kept = filterSeanimeStudyDifficulty(
      mixed({ knownCoverage: null }),
      { minCoverage: 0.5 },
    );
    expect(kept.filter(hasDifficulty)).toHaveLength(1);
  });

  it('an empty filter changes nothing', () => {
    const entries = mixed();
    expect(filterSeanimeStudyDifficulty(entries, {})).toHaveLength(entries.length);
    expect(filterSeanimeStudyDifficulty(entries, { levels: [], categories: [] }))
      .toHaveLength(entries.length);
  });

  it('applies every constraint together', () => {
    const entries = mixed({ contentLevel: 'N3', category: 'ready-now', knownCoverage: 0.9 });
    expect(filterSeanimeStudyDifficulty(entries, {
      levels: ['N3'], categories: ['ready-now'], minCoverage: 0.8,
    }).filter(hasDifficulty)).toHaveLength(1);
    // One failing constraint is enough.
    expect(filterSeanimeStudyDifficulty(entries, {
      levels: ['N3'], categories: ['ready-now'], minCoverage: 0.95,
    }).filter(hasDifficulty)).toHaveLength(0);
  });

  it('does not mutate its input', () => {
    const entries = mixed();
    const before = [...entries];
    filterSeanimeStudyDifficulty(entries, { levels: ['N3'] });
    expect(entries).toEqual(before);
  });

  it('offers only the levels the library actually contains, in first-seen order', () => {
    const entries = join(
      [
        seanimeFile({ path: 'C:/A/a.mkv' }),
        seanimeFile({ path: 'C:/A/b.mkv' }),
        seanimeFile({ path: 'C:/A/c.mkv' }),
      ],
      [
        mediaItem({ id: 'a', path: 'C:/A/a.mkv' }),
        mediaItem({ id: 'b', path: 'C:/A/b.mkv' }),
        mediaItem({ id: 'c', path: 'C:/A/c.mkv' }),
      ],
      doc([
        snapshot({ id: 's-a', mediaId: 'a', contentLevel: 'N2' }),
        snapshot({ id: 's-b', mediaId: 'b', contentLevel: 'N4' }),
        snapshot({ id: 's-c', mediaId: 'c', contentLevel: 'N2' }),
      ]),
    );
    expect(seanimeStudyDifficultyLevels(entries)).toEqual(['N2', 'N4']);
  });

  it('offers no levels when nothing is scored', () => {
    expect(seanimeStudyDifficultyLevels(join([seanimeFile()], []))).toEqual([]);
  });
});

describe('seanimeStudyAnkiHealth', () => {
  const base = { connected: true, decks: ['JP Study::Immersion'], defaultProfileId: 'seed-ja' };

  it('is healthy only when a mined card would actually be created', () => {
    const health = seanimeStudyAnkiHealth(base);
    expect(health.ok).toBe(true);
    expect(health.problem).toBeUndefined();
    expect(health.profileId).toBe('seed-ja');
    expect(health.deckCount).toBe(1);
  });

  it('reports a disconnected collection with the reason Anki gave', () => {
    const health = seanimeStudyAnkiHealth({
      ...base, connected: false, error: 'AnkiConnect refused the connection.',
    });
    expect(health.ok).toBe(false);
    expect(health.problem).toBe('disconnected');
    expect(health.reason).toBe('AnkiConnect refused the connection.');
  });

  it('omits the reason when Anki gave none, rather than inventing one', () => {
    const health = seanimeStudyAnkiHealth({ ...base, connected: false });
    expect(health.problem).toBe('disconnected');
    expect('reason' in health).toBe(false);
  });

  it('separates "no decks" from "disconnected" — they have different fixes', () => {
    const health = seanimeStudyAnkiHealth({ ...base, decks: [] });
    expect(health.problem).toBe('no-decks');
    expect(health.deckCount).toBe(0);
  });

  it('reports disconnected ahead of no-decks: an unreachable Anki has no decks to report', () => {
    const health = seanimeStudyAnkiHealth({ ...base, connected: false, decks: [] });
    expect(health.problem).toBe('disconnected');
  });

  it('reports no-profile when nothing resolves a destination', () => {
    const health = seanimeStudyAnkiHealth({ ...base, defaultProfileId: '   ' });
    expect(health.ok).toBe(false);
    expect(health.problem).toBe('no-profile');
  });

  it('surfaces the mining rule that owns the routing instead of swallowing it', () => {
    // A matched rule silently overrides a per-panel deck choice — that was a real
    // G-PLAY finding, so which rule matched has to be visible.
    const health = seanimeStudyAnkiHealth({
      ...base,
      rules: [{
        id: 'r1',
        enabled: true,
        label: 'Immersion subtitles',
        match: { source: 'subtitle' },
        profileId: 'ja-immersion',
      }],
    });
    expect(health.ok).toBe(true);
    expect(health.profileId).toBe('ja-immersion');
    expect(health.matchedRuleLabel).toBe('Immersion subtitles');
  });

  it('falls back to the default profile and names no rule when none matches', () => {
    const health = seanimeStudyAnkiHealth({
      ...base,
      rules: [{
        id: 'r1',
        enabled: true,
        label: 'EPUB only',
        match: { source: 'epub' },
        profileId: 'novels',
      }],
    });
    expect(health.profileId).toBe('seed-ja');
    expect('matchedRuleLabel' in health).toBe(false);
  });

  it('routes as a subtitle card, matching what videoCoreMining actually builds', () => {
    // If this drifts from videoCoreMining.ts's `source: 'subtitle'`, the panel would
    // report a destination the mining panel never uses.
    const health = seanimeStudyAnkiHealth({
      ...base,
      rules: [{
        id: 'r1', enabled: true, label: 'Subtitles',
        match: { source: 'subtitle', cardKind: 'sentence' },
        profileId: 'from-subs',
      }],
    });
    expect(health.profileId).toBe('from-subs');
  });

  it('ignores a disabled rule', () => {
    const health = seanimeStudyAnkiHealth({
      ...base,
      rules: [{
        id: 'r1', enabled: false, label: 'Off',
        match: { source: 'subtitle' }, profileId: 'never',
      }],
    });
    expect(health.profileId).toBe('seed-ja');
  });
});

describe('seanimeStudyPreparationQueue', () => {
  it('excludes ready entries — a queue listing finished work is not a queue', () => {
    const entries = join(
      [seanimeFile({ path: 'C:/A/01.mkv' })],
      [mediaItem({ id: 'ready', path: 'C:/A/01.mkv' })],
      doc([snapshot({ mediaId: 'ready' })]),
    );
    expect(seanimeStudyPreparationQueue(entries)).toEqual([]);
  });

  it('orders by how little work each state needs, cheapest first', () => {
    const entries = join(
      [
        seanimeFile({ path: 'C:/A/unlinked.mkv' }),
        seanimeFile({ path: 'C:/A/nosubs.mkv' }),
        seanimeFile({ path: 'C:/A/stale.mkv' }),
        seanimeFile({ path: 'C:/A/unanalyzed.mkv' }),
      ],
      [
        mediaItem({ id: 'nosubs', path: 'C:/A/nosubs.mkv', subtitles: [] }),
        mediaItem({ id: 'stale', path: 'C:/A/stale.mkv' }),
        mediaItem({ id: 'unanalyzed', path: 'C:/A/unanalyzed.mkv' }),
      ],
      doc([snapshot({ mediaId: 'stale', knowledgeFingerprint: 'moved' })]),
    );
    expect(seanimeStudyPreparationQueue(entries).map((e) => e.state)).toEqual([
      'unanalyzed', 'stale', 'missing-subtitles', 'unlinked',
    ]);
  });

  it('keeps incoming order within one state, so the queue is stable', () => {
    const entries = join(
      [
        seanimeFile({ path: 'C:/A/03.mkv', episode: 3 }),
        seanimeFile({ path: 'C:/A/01.mkv', episode: 1 }),
      ],
      [],
    );
    expect(seanimeStudyPreparationQueue(entries).map((e) => e.episode)).toEqual([3, 1]);
  });

  it('does not mutate its input', () => {
    const entries = join(
      [seanimeFile({ path: 'C:/A/01.mkv' }), seanimeFile({ path: 'C:/A/02.mkv' })],
      [],
    );
    const before = [...entries];
    seanimeStudyPreparationQueue(entries);
    expect(entries).toEqual(before);
  });
});
