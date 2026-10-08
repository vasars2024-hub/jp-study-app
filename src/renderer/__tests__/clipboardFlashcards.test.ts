import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/storage', () => ({
  LS_KEYS: { clipboardHistory: 'jp-clipboard-history' },
  IDB_KEYS: { clipboardHistory: 'clipboard-history' },
  mirrorToIdb: vi.fn(),
}));
vi.mock('../studyMining', () => ({
  mineToStudy: vi.fn(() => Promise.resolve({ card: { id: 'c' }, created: true, anki: 'local' })),
}));
vi.mock('../studyEnvironment', () => ({ getStudyLang: () => 'ja' }));

import { sendEntriesToFlashcards, type ClipboardEntryType } from '../clipboardHistory';
import { mineToStudy } from '../studyMining';

beforeEach(() => vi.clearAllMocks());

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('sending clipboard passages to flashcards', () => {
  it.each<ClipboardEntryType>(['manual', 'text', 'reader', 'word', 'sentence', 'paragraph'])(
    'preserves the ending of a long %s copy in the sentence field',
    async (type) => {
      const passage = '日本語の文章を読みます。'.repeat(15) + '最後の文です。';
      sendEntriesToFlashcards([{
        id: 'copy', type, text: passage, createdAt: 1,
        readerMeta: { book: 'My book' },
      }]);
      await flush();

      expect(mineToStudy).toHaveBeenCalledWith(
        expect.objectContaining({
          word: passage.slice(0, 120), sentence: passage, sourceTitle: 'My book',
          source: 'import', studyLang: 'ja', notify: false,
        }),
      );
    },
  );

  it('keeps short words and structured dictionary definitions out of the sentence field', async () => {
    const meaning = 'A dictionary definition. '.repeat(10);
    sendEntriesToFlashcards([
      { id: 'word', type: 'manual', text: '猫', createdAt: 1 },
      { id: 'dict', type: 'dictionary', text: `猫 — ねこ — ${meaning}`, createdAt: 2,
        dictMeta: { expression: '猫', reading: 'ねこ', meaning } },
    ]);
    await flush();

    expect(mineToStudy).toHaveBeenNthCalledWith(1, expect.objectContaining({ word: '猫', sentence: undefined }));
    expect(mineToStudy).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ word: '猫', reading: 'ねこ', meaning, sentence: undefined }));
  });
});
