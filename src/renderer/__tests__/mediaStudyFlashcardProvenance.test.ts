// @vitest-environment jsdom
/**
 * P5 gates 20 and 21 of `MAL_ANIME_PIPELINE_PLAN.md`, at the unit level.
 *
 * The live gates measure a real harvest; these pin the two properties that were
 * actually missing or unproven in the deck write itself — that a card mined
 * from a season records *which episode* it came from, and that mining the same
 * episodes a second time adds no duplicate.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { combineSeasonCues } from '../../shared/subtitleHarvest';
import type { MediaStudyAnalysis } from '../mediaStudyWorkflow';

const deck: Array<Record<string, unknown>> = [];

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => deck,
  addDeckCards: (entries: Array<Record<string, unknown>>) => {
    deck.push(...entries);
    return entries;
  },
}));

const { addMediaStudyFlashcards } = await import('../mediaStudyWorkflow');

/** Only the fields the deck write reads; the rest of the analysis is inert here. */
function analysisWith(
  vocabulary: Array<{ word: string; firstSeenAt: number }>,
): MediaStudyAnalysis {
  return {
    text: '',
    sentences: [],
    kanji: [],
    truncated: false,
    level: null,
    comprehensibility: { score: 0 } as MediaStudyAnalysis['comprehensibility'],
    grammar: [],
    vocabulary: vocabulary.map((entry) => ({
      word: entry.word,
      reading: `${entry.word}よみ`,
      occurrences: 1,
      sentence: `${entry.word}のぶん。`,
      firstSeenAt: entry.firstSeenAt,
      proper: false,
    })),
  } as MediaStudyAnalysis;
}

/** Two episodes of two cues each, laid out by the real combiner. */
const { segments } = combineSeasonCues([
  { episode: 104, cues: [{ start: 0, end: 5, text: 'a' }, { start: 10, end: 15, text: 'b' }] },
  { episode: 105, cues: [{ start: 0, end: 5, text: 'c' }, { start: 10, end: 15, text: 'd' }] },
]);

describe('addMediaStudyFlashcards provenance', () => {
  beforeEach(() => {
    deck.length = 0;
  });

  it('records the episode and the episode-relative moment on each card', () => {
    const secondEpisodeStart = segments[1].start;
    const added = addMediaStudyFlashcards(
      { id: 'mal:21', title: 'One Piece' },
      analysisWith([
        { word: '海賊', firstSeenAt: 10 },
        { word: '航海', firstSeenAt: secondEpisodeStart + 10 },
      ]),
      { segments },
    );
    expect(added).toBe(2);
    expect(deck.map((card) => card.sourceRef)).toEqual([
      {
        mediaId: 'mal:21',
        sourceKind: 'media',
        episode: 104,
        cueStartSec: 10,
        sentence: '海賊のぶん。',
      },
      {
        mediaId: 'mal:21',
        sourceKind: 'media',
        episode: 105,
        // The offset is undone: 10 s into episode 105, not into the corpus.
        cueStartSec: 10,
        sentence: '航海のぶん。',
      },
    ]);
    expect(deck.map((card) => card.bookTitle)).toEqual(['One Piece', 'One Piece']);
  });

  it('leaves sourceRef off when there is no season index to place the card in', () => {
    // A single-episode Study Mode mining has no segments, and inventing an
    // episode number there would be a worse answer than none.
    addMediaStudyFlashcards({ id: 'm1', title: 'Frieren' }, analysisWith([
      { word: '魔法', firstSeenAt: 3 },
    ]));
    expect(deck[0].sourceRef).toBeUndefined();
    expect(deck[0].sentence).toBe('魔法のぶん。');
  });

  it('adds nothing on a second mining of the same words', () => {
    const analysis = analysisWith([
      { word: '海賊', firstSeenAt: 10 },
      { word: '航海', firstSeenAt: 20 },
    ]);
    expect(addMediaStudyFlashcards({ id: 'mal:21', title: 'One Piece' }, analysis, { segments }))
      .toBe(2);
    expect(addMediaStudyFlashcards({ id: 'mal:21', title: 'One Piece' }, analysis, { segments }))
      .toBe(0);
    expect(deck).toHaveLength(2);
  });

  it('scopes the duplicate check to the title, so two shows can share a word', () => {
    const analysis = analysisWith([{ word: '海賊', firstSeenAt: 10 }]);
    addMediaStudyFlashcards({ id: 'mal:21', title: 'One Piece' }, analysis, { segments });
    addMediaStudyFlashcards({ id: 'mal:20', title: 'Naruto' }, analysis, { segments });
    expect(deck.map((card) => card.bookId)).toEqual(['mal:21', 'mal:20']);
  });
});
