import { describe, expect, it } from 'vitest';
import { createVisualNovelEntry, type VisualNovelEntry } from '../visualNovel';
import {
  createVisualNovelCommunityBundle,
  mergeVisualNovelCommunityBundle,
  normalizeVisualNovelCommunityBundle,
} from '../visualNovelCommunity';

describe('visual novel community bundles', () => {
  it('creates a privacy-safe bundle without local paths or capture history', () => {
    const entry: VisualNovelEntry = {
      ...createVisualNovelEntry({
        title: 'Community Test',
        installPath: 'C:/Private/Games/Test',
        executablePath: 'C:/Private/Games/Test/game.exe',
      }, 'vn-1', 1000),
      sourceIds: { vndb: 'v1' },
      routes: [{
        id: 'route-1',
        name: 'A Route',
        character: 'A',
        status: 'completed' as const,
        guideNotes: 'Choose A.',
        endings: [{ id: 'ending-1', name: 'Good', achieved: true, notes: 'Requirement' }],
      }],
    };
    const bundle = createVisualNovelCommunityBundle(entry, {
      id: 'report-1',
      author: 'Learner',
      rating: 9,
      difficultyRating: 3,
      jlptLevel: 'N3',
      review: 'Useful review',
      languageNotes: 'Conversational Japanese',
      createdAt: 2000,
      source: 'local',
    }, [{
      word: '選択',
      reading: 'せんたく',
      meaning: 'choice',
      sentence: 'これが選択だ。',
      front: '',
      back: '',
    }], null, 3000);
    const serialized = JSON.stringify(bundle);

    expect(serialized).not.toContain('C:/Private');
    expect(serialized).not.toContain('"achieved":true');
    expect(bundle).toMatchObject({
      visualNovel: { title: 'Community Test', providerIds: { vndb: 'v1' } },
      report: { author: 'Learner', jlptLevel: 'N3' },
      routeGuides: [{ name: 'A Route', endings: [{ name: 'Good' }] }],
      deckCards: [{ word: '選択' }],
    });
  });

  it('normalizes limits and rejects bundles without an identity', () => {
    expect(normalizeVisualNovelCommunityBundle({ version: 1 })).toBeNull();
    const normalized = normalizeVisualNovelCommunityBundle({
      version: 99,
      visualNovel: { title: ' Test ', providerIds: { vndb: ' v1 ' } },
      report: {
        id: 'r1',
        author: '',
        rating: 99,
        difficultyRating: 99,
        createdAt: -1,
      },
      deckCards: [{ word: '語彙', meaning: 'word' }, { word: '' }],
    });
    expect(normalized).toMatchObject({
      version: 1,
      visualNovel: { title: 'Test', providerIds: { vndb: 'v1' } },
      report: {
        author: 'Anonymous learner',
        rating: 10,
        difficultyRating: 5,
        createdAt: 0,
      },
      deckCards: [{ word: '語彙' }],
    });
  });

  it('merges reports and guide notes without changing personal completion', () => {
    const entry: VisualNovelEntry = {
      ...createVisualNovelEntry({ title: 'Merge Test' }, 'vn-1', 1000),
      communityReports: [],
      routes: [{
        id: 'route-1',
        name: 'A Route',
        character: '',
        status: 'completed' as const,
        guideNotes: 'Personal note',
        endings: [{ id: 'ending-1', name: 'Good', achieved: true, notes: '' }],
      }],
    };
    const bundle = normalizeVisualNovelCommunityBundle({
      version: 1,
      visualNovel: { title: 'Merge Test' },
      report: {
        id: 'report-1',
        author: 'Other learner',
        review: 'Recommended',
        createdAt: 2,
      },
      routeGuides: [{
        name: 'A Route',
        character: 'A',
        guideNotes: 'Imported note',
        endings: [
          { name: 'Good', notes: 'Imported requirement' },
          { name: 'Bad', notes: 'Alternative choice' },
        ],
      }],
    });
    let nextId = 0;
    if (!bundle) throw new Error('Expected a valid bundle');
    const merged = mergeVisualNovelCommunityBundle(entry, bundle, () => `new-${++nextId}`);

    expect(merged.communityReports).toEqual([
      expect.objectContaining({ id: 'report-1', source: 'import' }),
    ]);
    expect(merged.routes[0]).toMatchObject({
      status: 'completed',
      guideNotes: 'Personal note\n\nImported guide:\nImported note',
      endings: [
        { id: 'ending-1', name: 'Good', achieved: true, notes: 'Imported requirement' },
        { id: 'new-1', name: 'Bad', achieved: false, notes: 'Alternative choice' },
      ],
    });
  });
});
