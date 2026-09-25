// @vitest-environment jsdom
/**
 * The renderer half of the .apkg imports (round-2 audit F, Anki items 11–13).
 *
 * Before: re-importing a deck appended a second copy of every card
 * (`addDeckCardsTracked`, contrary to the comment above it); tags, media paths
 * and the Anki schedule were dropped; nothing said what did not come across;
 * and the "Level check" drop called `importApkg` and threw the words away.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idb = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
  kvUpdate: async (key: string, update: (current: unknown) => unknown) => {
    const next = update(idb.get(key));
    if (next !== undefined) idb.set(key, JSON.parse(JSON.stringify(next)));
    return next ?? idb.get(key);
  },
}));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: async () => undefined }));
// A tokenizer that visibly "lemmatizes", so a test can tell whether it ran.
vi.mock('../tokenizer', () => ({
  getTokenizer: async () => undefined,
  tokenizeSync: (text: string) => [{ content: true, lemma: `lemma:${text}` }],
  tokenizerReady: () => true,
}));
const study = vi.hoisted(() => ({ lang: 'ja' as 'ja' | 'zh' }));
vi.mock('../studyEnvironment', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getStudyLang: () => study.lang,
}));

import { apkgImportNotice, importApkgCards } from '../apkgImport';
import { executeImport } from '../fileImportExecute';
import { loadDeck, resetDeckMemoryForTests, reviewDeckCard } from '../flashcardDeck';
import { getSlotList } from '../levelLists';

const SRS = {
  version: 2 as const,
  algorithm: 'sm2' as const,
  dueAt: 2_000_000_000_000,
  intervalDays: 12,
  ease: 2.3,
  repetitions: 7,
  lapses: 1,
  lastReviewedAt: 1_990_000_000_000,
  lastRating: 'good' as const,
};

function cardsResult(meaning = 'cat') {
  return {
    ok: true,
    fileName: 'core.apkg',
    noteCount: 3,
    cards: [
      { word: '猫', reading: 'ねこ', meaning, deck: 'Core::N5', tags: ['n5'], audioPath: 'C:/m/a.mp3', srs: SRS },
      { word: '犬', reading: 'いぬ', meaning: 'dog', deck: 'Core::N5' },
    ],
    report: {
      emptyNotes: 1,
      duplicateNotes: 0,
      extraFieldNotes: 0,
      scheduledCards: 1,
      mediaKept: 1,
      mediaMissing: 2,
      mediaSkipped: 0,
      mediaUnreadable: false,
    },
  };
}

const api = {
  importApkgCards: vi.fn(async () => cardsResult()),
  onApkgImportProgress: vi.fn(() => () => undefined),
  importApkg: vi.fn(async () => ({ ok: true, expressions: ['猫', '犬'], noteCount: 2, fileName: 'x.apkg' })),
};

beforeEach(() => {
  study.lang = 'ja';
  localStorage.clear();
  idb.clear();
  resetDeckMemoryForTests();
  (window as unknown as { api: typeof api }).api = api;
  api.importApkgCards.mockImplementation(async () => cardsResult());
});

describe('importApkgCards', () => {
  it('keeps tags, media and the Anki schedule on the new cards', async () => {
    const res = await importApkgCards('C:/decks/core.apkg');
    expect(res.ok).toBe(true);
    const cat = loadDeck().find((c) => c.word === '猫')!;
    expect(cat.tags).toEqual(['n5']);
    expect(cat.audioPath).toBe('C:/m/a.mp3');
    expect(cat.srs).toEqual(SRS);
  });

  it('re-importing the same deck updates in place instead of doubling, and keeps local progress', async () => {
    await importApkgCards('C:/decks/core.apkg');
    const dog = loadDeck().find((c) => c.word === '犬')!;
    reviewDeckCard(dog.id, 'good');
    const reviewed = loadDeck().find((c) => c.id === dog.id)!.srs;

    api.importApkgCards.mockImplementation(async () => cardsResult('a cat'));
    const second = await importApkgCards('C:/decks/core.apkg');
    expect(second.added).toEqual([]);
    expect(second.updated).toBe(1);
    const deck = loadDeck();
    expect(deck).toHaveLength(2);
    expect(deck.find((c) => c.word === '猫')!.meaning).toBe('a cat');
    expect(deck.find((c) => c.id === dog.id)!.srs).toEqual(reviewed);
  });

  it('says what did not come across', async () => {
    const res = await importApkgCards('C:/decks/core.apkg');
    const notice = apkgImportNotice(res);
    expect(notice).toContain('1 card kept its Anki interval');
    expect(notice).toContain('1 note had no word');
    expect(notice).toContain('2 media files the notes cite are not in the package');
  });
});

describe('Level check drop', () => {
  it('files the words under the level the name says and opens Stats', async () => {
    const onOpenSection = vi.fn();
    const receipt = await executeImport(
      { path: 'C:/decks/JLPT N4 vocab.apkg', name: 'JLPT N4 vocab.apkg', isDirectory: false },
      'anki-level',
      { onOpenSection },
    );
    expect(receipt?.levelSlot?.slot).toBe('jlpt-n4');
    expect(getSlotList('jlpt-n4')?.words).toEqual(['lemma:猫', 'lemma:犬']);
    expect(onOpenSection).toHaveBeenCalledWith('stats');
  });

  it('files a Chinese deck under HSK and does not run the Japanese analyser on it', async () => {
    study.lang = 'zh';
    api.importApkg.mockImplementationOnce(async () => ({ ok: true, expressions: ['学习', '中国'], noteCount: 2, fileName: 'x.apkg' }));
    const receipt = await executeImport(
      { path: 'C:/decks/HSK 3.apkg', name: 'HSK 3.apkg', isDirectory: false },
      'anki-level',
      {},
    );
    expect(receipt?.levelSlot?.slot).toBe('hsk-3');
    expect(getSlotList('hsk-3')?.words).toEqual(['学习', '中国']);
  });

  it('refuses by name when the file does not say its level', async () => {
    const onRefused = vi.fn();
    const receipt = await executeImport(
      { path: 'C:/decks/mydeck.apkg', name: 'mydeck.apkg', isDirectory: false },
      'anki-level',
      { onRefused },
    );
    expect(receipt).toBeNull();
    expect(onRefused.mock.calls[0]?.[0]).toBe('fileDrop.toast.levelNoSlot');
  });
});
