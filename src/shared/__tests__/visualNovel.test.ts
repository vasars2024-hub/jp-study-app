import { describe, expect, it } from 'vitest';
import {
  appendVisualNovelCapture,
  appendVisualNovelCaptures,
  capturesForVisualNovel,
  createEmptyVisualNovelDatabase,
  createVisualNovelEntry,
  detectVisualNovelEngine,
  mergeVisualNovelDatabases,
  normalizeVisualNovelDatabase,
  normalizeVisualNovelRelease,
  removeVisualNovelCapture,
  updateVisualNovelMetadata,
  updateVisualNovelCapture,
  updateVisualNovelProgress,
  updateVisualNovelRoutes,
  upsertVisualNovelEntry,
  visualNovelEngineCompatibility,
} from '../visualNovel';

describe('visual novel engine detection', () => {
  it('detects common engines from relative files', () => {
    expect(detectVisualNovelEngine(['game/script.rpyc', 'renpy/common.rpy'])).toBe('renpy');
    expect(detectVisualNovelEngine(['data.xp3', 'Game.exe'])).toBe('kirikiri');
    expect(detectVisualNovelEngine(['UnityPlayer.dll', 'Title_Data/globalgamemanagers'])).toBe('unity');
    expect(detectVisualNovelEngine(['www/data/System.json', 'Game.exe'])).toBe('rpg-maker');
    expect(detectVisualNovelEngine(['assets/custom.dat'])).toBe('unknown');
  });

  it('maps extraction compatibility', () => {
    expect(visualNovelEngineCompatibility('renpy')).toBe('supported');
    expect(visualNovelEngineCompatibility('unity')).toBe('partial');
    expect(visualNovelEngineCompatibility('custom')).toBe('manual');
  });
});

describe('visual novel release catalog', () => {
  it('normalizes source releases and bounded language metadata', () => {
    expect(normalizeVisualNovelRelease({
      id: ' r1 ',
      title: ' Japanese release ',
      releaseDate: '2024-01-02',
      languages: [
        { code: 'ja', title: '日本語版', main: true },
        { code: '', title: 'invalid' },
      ],
      platforms: ['win', 'win'],
      publishers: [' Studio '],
      engine: 'KiriKiri',
      voiceCoverage: 'full',
      releaseType: 'complete',
      official: true,
    })).toEqual({
      id: 'r1',
      title: 'Japanese release',
      releaseDate: '2024-01-02',
      languages: [{
        code: 'ja',
        title: '日本語版',
        machineTranslated: false,
        main: true,
      }],
      platforms: ['win'],
      publishers: ['Studio'],
      engine: 'KiriKiri',
      voiceCoverage: 'full',
      releaseType: 'complete',
      official: true,
      patch: false,
      freeware: false,
    });
  });
});

describe('visual novel database', () => {
  it('creates entries, tracks progress, and stores captured dialogue', () => {
    const entry = createVisualNovelEntry({
      title: 'Steins;Gate',
      japaneseTitle: 'シュタインズ・ゲート',
      executablePath: 'C:/Games/SG/sg.exe',
      engine: 'kirikiri',
    }, 'vn-1', 1000);
    const withEntry = upsertVisualNovelEntry(createEmptyVisualNovelDatabase(), entry);
    const progressed = updateVisualNovelProgress(withEntry, entry.id, {
      status: 'reading',
      currentRouteId: 'Kurisu',
      currentChapter: 'Chapter 2',
      completionPct: 25,
      playtimeDeltaSec: 600,
    }, 2000);
    const captured = appendVisualNovelCapture(progressed, {
      visualNovelId: entry.id,
      japanese: 'これが運命石の扉の選択だ。',
      speaker: '岡部',
      routeId: 'Kurisu',
      chapter: 'Chapter 2',
      screenshotPath: 'C:\\managed\\scene.jpg',
      audioPath: 'C:\\managed\\voice.ogg',
      source: 'clipboard',
    }, 'line-1', 3000);

    expect(progressed.entries[0]).toMatchObject({
      status: 'reading',
      currentRouteId: 'Kurisu',
      completionPct: 25,
      totalPlaytimeSec: 600,
    });
    expect(capturesForVisualNovel(captured, entry.id)[0]).toMatchObject({
      id: 'line-1',
      speaker: '岡部',
      japanese: 'これが運命石の扉の選択だ。',
      screenshotPath: 'C:\\managed\\scene.jpg',
      audioPath: 'C:\\managed\\voice.ogg',
    });
  });

  it('drops orphan captures during normalization', () => {
    const database = normalizeVisualNovelDatabase({
      version: 99,
      entries: [{
        id: 'vn-1',
        title: 'Title',
        engine: 'renpy',
        createdAt: 1,
        updatedAt: 1,
      }],
      captures: [
        { id: 'valid', visualNovelId: 'vn-1', japanese: '日本語', capturedAt: 2 },
        { id: 'orphan', visualNovelId: 'missing', japanese: '日本語', capturedAt: 3 },
      ],
    });

    expect(database.version).toBe(1);
    expect(database.captures.map((capture) => capture.id)).toEqual(['valid']);
  });

  it('tracks routes and endings and clears a removed current route', () => {
    const entry = createVisualNovelEntry({ title: 'Route Test' }, 'vn-routes', 1000);
    const initial = updateVisualNovelRoutes(
      upsertVisualNovelEntry(createEmptyVisualNovelDatabase(), entry),
      entry.id,
      [{
        id: 'route-a',
        name: 'Character A',
        character: 'A',
        status: 'completed',
        guideNotes: 'Choose the laboratory option first.',
        endings: [
          { id: 'ending-a', name: 'Good Ending', achieved: true, notes: 'Completed' },
          { id: 'ending-b', name: 'Normal Ending', achieved: false },
        ],
      }],
      2000,
    );
    const selected = updateVisualNovelProgress(initial, entry.id, { currentRouteId: 'route-a' }, 3000);
    const removed = updateVisualNovelRoutes(selected, entry.id, [], 4000);

    expect(initial.entries[0].routes[0]).toMatchObject({
      id: 'route-a',
      status: 'completed',
      guideNotes: 'Choose the laboratory option first.',
      endings: [
        { id: 'ending-a', achieved: true, notes: 'Completed' },
        { id: 'ending-b', achieved: false, notes: '' },
      ],
    });
    expect(removed.entries[0].currentRouteId).toBe('');
  });

  it('updates normalized library metadata without erasing study progress', () => {
    const entry = createVisualNovelEntry({ title: 'Original', engine: 'unknown' }, 'vn-meta', 1000);
    const progressed = updateVisualNovelProgress(
      upsertVisualNovelEntry(createEmptyVisualNovelDatabase(), entry),
      entry.id,
      { status: 'reading', completionPct: 42 },
      2000,
    );
    const updated = updateVisualNovelMetadata(progressed, entry.id, {
      title: 'Updated',
      alternativeTitles: [' Alias ', 'Alias', '別名'],
      developer: 'Studio',
      originalPlatform: 'Windows',
      genres: ['Mystery', ' Mystery '],
      themes: ['Time travel'],
      characters: ['A', 'B'],
      chapters: ['Prologue', 'Chapter 1'],
      estimatedPlaytimeHours: -4,
      engine: 'renpy',
      sourceIds: { vndb: 'v17', empty: ' ' },
      sourceUrl: 'https://vndb.org/v17',
      coverImageUrl: 'https://example.test/cover.jpg',
      backgroundImageUrls: ['https://example.test/background.jpg'],
      screenshotUrls: [' https://example.test/one.jpg ', 'https://example.test/one.jpg'],
      communityRating: 8.7,
      communityVoteCount: 12_345,
    }, 3000);

    expect(updated.entries[0]).toMatchObject({
      title: 'Updated',
      alternativeTitles: ['Alias', '別名'],
      developer: 'Studio',
      originalPlatform: 'Windows',
      genres: ['Mystery'],
      themes: ['Time travel'],
      characters: ['A', 'B'],
      chapters: ['Prologue', 'Chapter 1'],
      estimatedPlaytimeHours: 0,
      engine: 'renpy',
      engineCompatibility: 'supported',
      sourceIds: { vndb: 'v17' },
      backgroundImageUrls: ['https://example.test/background.jpg'],
      screenshotUrls: ['https://example.test/one.jpg'],
      communityRating: 8.7,
      communityVoteCount: 12_345,
      status: 'reading',
      completionPct: 42,
      updatedAt: 3000,
    });
  });

  it('rejects an empty metadata title', () => {
    const entry = createVisualNovelEntry({ title: 'Original' }, 'vn-meta', 1000);
    const database = upsertVisualNovelEntry(createEmptyVisualNovelDatabase(), entry);
    expect(() => updateVisualNovelMetadata(database, entry.id, { title: ' ' })).toThrow(
      'A visual novel title is required.',
    );
  });

  it('merges portable library data without duplicating entries or captured lines', () => {
    const existingEntry = createVisualNovelEntry({
      title: 'Existing',
      installPath: 'C:\\Games\\Existing',
    }, 'same-id', 1000);
    const base = appendVisualNovelCapture(
      upsertVisualNovelEntry(createEmptyVisualNovelDatabase(), existingEntry),
      { visualNovelId: existingEntry.id, japanese: '同じ文章', speaker: 'A' },
      'capture-1',
      2000,
    );
    const duplicateEntry = createVisualNovelEntry({
      title: 'Existing backup',
      installPath: 'c:/games/existing',
    }, 'backup-id', 1000);
    const collidingEntry = createVisualNovelEntry({
      title: 'Different',
      installPath: 'D:/Games/Different',
    }, 'same-id', 1000);
    let imported = upsertVisualNovelEntry(createEmptyVisualNovelDatabase(), duplicateEntry);
    imported = upsertVisualNovelEntry(imported, collidingEntry);
    imported = appendVisualNovelCapture(imported, {
      visualNovelId: duplicateEntry.id,
      japanese: '新しい文章',
      speaker: 'B',
    }, 'capture-1', 3000);
    let nextId = 0;
    const merged = mergeVisualNovelDatabases(base, imported, () => `generated-${++nextId}`);

    expect(merged.entries).toHaveLength(2);
    expect(merged.entries.find((entry) => entry.title === 'Different')?.id).toBe('generated-1');
    expect(merged.captures.map((capture) => capture.japanese).sort()).toEqual(['同じ文章', '新しい文章']);
    expect(merged.captures.find((capture) => capture.japanese === '新しい文章')).toMatchObject({
      id: 'generated-2',
      visualNovelId: 'same-id',
    });
  });

  it('bulk imports captured lines and skips existing scene duplicates', () => {
    const entry = createVisualNovelEntry({ title: 'Script Import' }, 'vn-script', 1000);
    const initial = appendVisualNovelCapture(
      upsertVisualNovelEntry(createEmptyVisualNovelDatabase(), entry),
      { visualNovelId: entry.id, japanese: '既存の行', speaker: 'A', scene: 'scene-1' },
      'existing',
      2000,
    );
    let nextId = 0;
    const imported = appendVisualNovelCaptures(initial, [
      { visualNovelId: entry.id, japanese: '既存の行', speaker: 'A', scene: 'scene-1', source: 'import' },
      { visualNovelId: entry.id, japanese: '新しい行', speaker: 'B', scene: 'scene-2', source: 'import' },
    ], () => `bulk-${++nextId}`, 3000);

    expect(imported.captures).toHaveLength(2);
    expect(imported.captures[0]).toMatchObject({
      id: 'bulk-2',
      japanese: '新しい行',
      source: 'import',
      capturedAt: 3001,
    });
  });

  it('updates translation and context while preserving capture identity, then removes it', () => {
    const entry = createVisualNovelEntry({ title: 'Assist' }, 'vn-assist', 1000);
    const captured = appendVisualNovelCapture(
      upsertVisualNovelEntry(createEmptyVisualNovelDatabase(), entry),
      {
        visualNovelId: entry.id,
        japanese: '元の文章',
        speaker: 'A',
        source: 'clipboard',
      },
      'capture-assist',
      2000,
    );
    const updated = updateVisualNovelCapture(captured, 'capture-assist', {
      japanese: '編集した文章',
      translation: 'Edited sentence',
      speaker: 'B',
      chapter: 'Chapter 2',
      scene: 'Scene 3',
    });

    expect(updated.captures[0]).toMatchObject({
      id: 'capture-assist',
      visualNovelId: 'vn-assist',
      source: 'clipboard',
      capturedAt: 2000,
      japanese: '編集した文章',
      translation: 'Edited sentence',
      speaker: 'B',
      chapter: 'Chapter 2',
      scene: 'Scene 3',
    });
    expect(removeVisualNovelCapture(updated, 'capture-assist').captures).toEqual([]);
  });
});
