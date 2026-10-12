// @vitest-environment jsdom
/**
 * VN 7.5: a mined line carries the one or two lines before it as context and a
 * screenshot from the capture just before it, both per the study preferences.
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
import { loadVn5StudyPrefs, saveVn5StudyPrefs } from '../visualNovelStudy5Prefs';

const entry = { id: 'sg', title: 'Steins;Gate', executablePath: 'C:\\Games\\SG\\sg.exe', language: 'ja', createdAt: 1 };

function line(id: string, japanese: string, at: number, over: Partial<VisualNovelTextCapture> = {}): VisualNovelTextCapture {
  return {
    id,
    visualNovelId: 'sg',
    kind: 'dialogue',
    japanese,
    translation: '',
    speaker: '',
    routeId: '',
    chapter: '',
    scene: '',
    screenshotPath: '',
    audioPath: '',
    source: 'hook',
    capturedAt: at,
    ...over,
  };
}

const script = [
  line('a', 'ここはどこだ。', 1_000, { speaker: '岡部', screenshotPath: 'C:\\shots\\a.png' }),
  line('b', 'ラボだよ。', 2_000, { speaker: 'まゆり' }),
  line('c', 'そうか。', 3_000),
];

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  (window as unknown as { api: unknown }).api = {};
});

describe('VN mining context', () => {
  it('saves the previous line by default, and borrows the recent screenshot', async () => {
    await expect(mineVisualNovelLine(entry, script[2], { captures: script })).resolves.toBe(true);
    const [card] = loadDeck();
    expect(card.sentence).toBe('そうか。');
    expect(card.contextBefore).toBe('【まゆり】ラボだよ。');
    expect(card.imagePath).toBe('C:\\shots\\a.png');
  });

  it('honours two context lines and screenshot off', async () => {
    saveVn5StudyPrefs({ contextLines: 2, attachScreenshot: false });
    expect(loadVn5StudyPrefs()).toMatchObject({ contextLines: 2, attachScreenshot: false });
    await mineVisualNovelLine(entry, script[2], { captures: script });
    const [card] = loadDeck();
    expect(card.contextBefore).toBe('【岡部】ここはどこだ。\n【まゆり】ラボだよ。');
    expect(card.imagePath).toBeUndefined();
  });

  it('adds no context without the script, as before', async () => {
    await mineVisualNovelLine(entry, script[2]);
    const [card] = loadDeck();
    expect(card.contextBefore).toBeUndefined();
  });
});
