// @vitest-environment jsdom
/**
 * The VN "Mine this line" button goes through `mineToStudy`, the one mining
 * path, so it saves a local sentence card with its screenshot, voice clip and
 * speaker context, and a second press on the same line adds nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
}));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: async () => ({ audio: null, reading: null }) }));

import type { VisualNovelTextCapture } from '../../shared/visualNovel';
import { loadDeck } from '../flashcardDeck';
import { mineVisualNovelLine } from '../visualNovelMining';

const entry = { id: 'sg', title: 'Steins;Gate', executablePath: 'C:\\Games\\SG\\sg.exe', language: 'ja', createdAt: 1 };

function capture(japanese: string): VisualNovelTextCapture {
  return {
    id: `c-${japanese}`,
    japanese,
    speaker: '紅莉栖',
    screenshotPath: 'C:\\shots\\1.png',
    audioPath: 'C:\\voice\\1.ogg',
  } as unknown as VisualNovelTextCapture;
}

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  (window as unknown as { api: unknown }).api = {};
});

describe('mineVisualNovelLine', () => {
  it('saves one local sentence card with media and speaker context', async () => {
    await expect(mineVisualNovelLine(entry, capture('助手って言うな'))).resolves.toBe(true);
    const cards = loadDeck();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      sentence: '助手って言うな',
      studyKind: 'sentence',
      bookId: 'vn:sg',
      bookTitle: 'Steins;Gate',
      imagePath: 'C:\\shots\\1.png',
      audioPath: 'C:\\voice\\1.ogg',
    });
    // The speaker is context, not the meaning: with no translation the meaning
    // stays empty rather than reading "紅莉栖" on the back of the card.
    expect(cards[0].meaning).toBe('');
    expect(cards[0].characterName).toBe('紅莉栖');
  });

  it('uses the translation as the meaning, and keeps the scene as context', async () => {
    const line = {
      ...capture('俺は狂気のマッドサイエンティスト'),
      translation: 'I am a mad scientist',
      chapter: 'Chapter 1',
      scene: 'Lab',
    } as VisualNovelTextCapture;
    await mineVisualNovelLine(entry, line);
    const [card] = loadDeck();
    expect(card.meaning).toBe('I am a mad scientist');
    expect(card.characterName).toBe('紅莉栖');
    expect(card.sceneReference).toBe('Chapter 1 · Lab');
  });

  it('does not duplicate a line mined twice', async () => {
    await mineVisualNovelLine(entry, capture('エル・プサイ・コングルゥ'));
    await expect(mineVisualNovelLine(entry, capture('エル・プサイ・コングルゥ'))).resolves.toBe(false);
    expect(loadDeck()).toHaveLength(1);
  });

  it('ignores an empty line', async () => {
    await expect(mineVisualNovelLine(entry, capture('   '))).resolves.toBe(false);
    expect(loadDeck()).toHaveLength(0);
  });
});
