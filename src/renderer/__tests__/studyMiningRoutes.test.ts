import { beforeEach, describe, expect, it, vi } from 'vitest';

const mineToStudy = vi.fn();
vi.mock('../studyMining', () => ({ mineToStudy: (...args: unknown[]) => mineToStudy(...args) }));
const updateDeckCard = vi.fn();
vi.mock('../flashcardDeck', () => ({ updateDeckCard: (...args: unknown[]) => updateDeckCard(...args) }));
vi.mock('../studyEnvironment', () => ({ getStudyLang: () => 'ja' }));

import {
  exportGrammarPointsToAnki,
  mineAgentCards,
  mineGrammarPoints,
  mineReaderCollectionCard,
  mirrorAiStudioCard,
} from '../studyMiningRoutes';

function result(id: string, created: boolean, anki = 'local', extra: Record<string, unknown> = {}) {
  return { card: { id }, created, anki, ...extra };
}

const point = {
  title: '〜てしまう',
  meaning: 'to end up doing',
  structure: 'V-て + しまう',
  examples: [{ jp: '食べてしまった。' }],
  lang: 'ja',
};

beforeEach(() => {
  mineToStudy.mockReset();
  updateDeckCard.mockReset();
});

describe('grammar surfaces mine through mineToStudy', () => {
  it('adds a local grammar card and keeps its front/back', async () => {
    mineToStudy.mockResolvedValue(result('g1', true));
    await mineGrammarPoints([point], 'Grammar');
    expect(mineToStudy).toHaveBeenCalledWith(expect.objectContaining({
      word: '〜てしまう',
      meaning: 'to end up doing',
      sentence: '食べてしまった。',
      source: 'import',
      folder: 'Grammar',
      studyKind: 'grammar',
      studyLang: 'ja',
      notify: false,
    }));
    expect(mineToStudy.mock.calls[0][0]).not.toHaveProperty('anki');
    expect(updateDeckCard).toHaveBeenCalledWith('g1', { front: '〜てしまう', back: 'to end up doing\nV-て + しまう' });
  });

  it('does not rewrite a card that was already in the deck', async () => {
    mineToStudy.mockResolvedValue(result('g1', false));
    await mineGrammarPoints([point], 'Grammar');
    expect(updateDeckCard).not.toHaveBeenCalled();
  });

  it('exports to Anki with the same note request and counts outcomes', async () => {
    mineToStudy
      .mockResolvedValueOnce(result('a', true, 'added'))
      .mockResolvedValueOnce(result('b', false, 'duplicate'))
      .mockResolvedValueOnce(result('c', true, 'failed'))
      .mockRejectedValueOnce(new Error('boom'));
    const counts = await exportGrammarPointsToAnki([point, point, point, point], 'Grammar');
    expect(counts).toEqual({ ok: 2, fail: 2 });
    expect(mineToStudy.mock.calls[0][0].anki).toEqual({
      route: { source: 'other', cardKind: 'word', language: 'ja' },
      term: '〜てしまう',
      meaning: 'to end up doing',
      sentence: '食べてしまった。',
      translation: 'V-て + しまう',
    });
  });
});

describe('AI Card Studio mirrors through mineToStudy', () => {
  it('passes the Anki answer and the batch deck label', async () => {
    mineToStudy.mockResolvedValue(result('ai1', true, 'added'));
    const ankiResult = { ok: true, noteId: 42 };
    await mirrorAiStudioCard({
      expression: '猫', reading: 'ねこ', meaning: 'cat', sentence: '猫がいる。',
      front: 'F', back: 'B', deckLabel: 'My batch', ankiResult,
    });
    expect(mineToStudy).toHaveBeenCalledWith(expect.objectContaining({
      word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '猫がいる。',
      source: 'epub-ai', sourceTitle: 'My batch', ankiResult, notify: false, studyLang: 'ja',
    }));
    expect(updateDeckCard).toHaveBeenCalledWith('ai1', { front: 'F', back: 'B' });
  });
});

describe('reader collection mines through mineToStudy', () => {
  const base = {
    front: '猫', back: 'cat', reading: 'ねこ', sentence: '猫がいる。',
    bookId: 'book-1', bookTitle: 'Book', studyLang: 'ja' as const,
  };

  it('is local-only when auto-Anki is off', async () => {
    mineToStudy.mockResolvedValue(result('r1', true));
    await mineReaderCollectionCard({ ...base, sendToAnki: false });
    const input = mineToStudy.mock.calls[0][0];
    expect(input).toMatchObject({
      word: '猫', meaning: 'cat', reading: 'ねこ', sentence: '猫がいる。',
      source: 'epub', sourceId: 'book-1', sourceTitle: 'Book', studyLang: 'ja', notify: false,
    });
    expect(input).not.toHaveProperty('anki');
  });

  it('sends the note to the chosen deck when auto-Anki is on', async () => {
    mineToStudy.mockResolvedValue(result('r1', true, 'added'));
    await mineReaderCollectionCard({ ...base, sendToAnki: true, ankiDeck: 'Novels' });
    expect(mineToStudy.mock.calls[0][0].anki).toEqual({
      route: { source: 'reader', cardKind: 'sentence', language: 'ja' },
      term: '猫', reading: 'ねこ', meaning: 'cat', sentence: '猫がいる。', deckName: 'Novels',
    });
    expect(updateDeckCard).toHaveBeenCalledWith('r1', { ankiDeck: 'Novels' });
  });
});

describe('agent flashcard.add-cards mines through mineToStudy', () => {
  it('mines each card as an import', async () => {
    mineToStudy.mockResolvedValueOnce(result('x', true)).mockResolvedValueOnce(result('y', false));
    const mined = await mineAgentCards([
      { word: '記録', reading: 'きろく', meaning: 'record', folder: 'Agent' },
      { word: '記録', reading: 'きろく', meaning: 'record' },
    ]);
    expect(mineToStudy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      word: '記録', reading: 'きろく', meaning: 'record', source: 'import', folder: 'Agent', notify: false,
    }));
    expect(mined.filter((row) => row.created)).toHaveLength(1);
  });
});
