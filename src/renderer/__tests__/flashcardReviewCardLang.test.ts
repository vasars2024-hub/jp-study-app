/**
 * A review card must carry its deck card's study language. `ReviewCard` was built
 * without it, so `cardContentLang`, the TTS voice and the pitch contour all saw
 * `undefined` and treated a Chinese or Russian card as Japanese.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TSX = readFileSync(
  path.join(__dirname, '..', 'components', 'flashcards', 'FlashcardsContent.tsx'),
  'utf8',
);

describe('flashcards: a review card keeps its study language', () => {
  it('declares studyLang on ReviewCard', () => {
    const decl = TSX.slice(TSX.indexOf('export interface ReviewCard {'));
    expect(decl.slice(0, decl.indexOf('\n}'))).toMatch(/\bstudyLang\?: DeckFlashcard\['studyLang'\];/);
  });

  it('copies it when a deck card becomes a review card', () => {
    const fn = TSX.slice(TSX.indexOf('function deckToReviewCards('));
    expect(fn.slice(0, fn.indexOf('{ mode: reviewMode }'))).toContain('studyLang: c.studyLang,');
  });
});
