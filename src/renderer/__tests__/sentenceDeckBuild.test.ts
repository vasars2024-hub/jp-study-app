// @vitest-environment jsdom
/**
 * "Sentence deck from a video", renderer half: the audio job's results become
 * ONE deck write of audio sentence cards in a folder named after the episode,
 * a failed clip still leaves its card (without audio, reported), a cancel or
 * refusal writes nothing, Undo takes the batch and its folder back, and the
 * Anki pass lands on the same cards instead of adding a second copy.
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

import type { MineNoteRequest } from '../../shared/anki';
import type { SentenceAudioBatchResult } from '../../main/sentenceAudioBatch';
import type { SentenceSegment } from '../../shared/sentenceDeck';
import { sentenceDeckBookId } from '../../shared/sentenceDeck';
import { addDeckCardsTracked, createDeckFolder, loadDeck, loadDeckFolders } from '../flashcardDeck';
import { markAnkiSeen } from '../studyMining';
import { buildSentenceDeck, undoSentenceDeck, type SentenceDeckDone } from '../sentenceDeckBuild';

const VIDEO = 'E:/anime/Yuru Camp - 01.mkv';
const segments: SentenceSegment[] = [
  { index: 1, startMs: 1000, endMs: 4000, text: 'おはようございます。', translation: 'Good morning.' },
  { index: 2, startMs: 4500, endMs: 8000, text: '散歩に行きませんか？' },
  { index: 3, startMs: 8500, endMs: 12000, text: '駅の近くの公園に行きましょう。' },
];

let batch: SentenceAudioBatchResult;
let progressListener: ((p: { jobId: string; done: number; total: number; failed: number }) => void) | null;
let extractRequests: unknown[];
let mined: MineNoteRequest[];
let linkState: 'connected' | 'disconnected';
let released: string[];

function okBatch(): SentenceAudioBatchResult {
  return {
    ok: true,
    cancelled: false,
    results: [
      { id: '1', ok: true, audioPath: 'C:/ud/flashcard-audio/mined/aaa.mp3', durationSec: 3.4 },
      { id: '2', ok: false, error: 'nothing to hear in this range', failure: 'silent' },
      { id: '3', ok: true, audioPath: 'C:/ud/flashcard-audio/mined/ccc.mp3', imagePath: 'C:/ud/flashcard-audio/mined/ccc.jpg', durationSec: 3.9 },
    ],
  };
}

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  batch = okBatch();
  progressListener = null;
  extractRequests = [];
  mined = [];
  linkState = 'disconnected';
  released = [];
  (window as unknown as { api: unknown }).api = {
    flashcardReleaseAudio: async (paths: string[]) => {
      released.push(...paths);
      return { removed: paths.length, skipped: 0 };
    },
    onSentenceDeckProgress: (cb: typeof progressListener) => {
      progressListener = cb;
      return () => { progressListener = null; };
    },
    sentenceDeckExtractAudio: async (request: { jobId: string; clips: unknown[] }) => {
      extractRequests.push(request);
      progressListener?.({ jobId: request.jobId, done: 1, total: request.clips.length, failed: 0 });
      progressListener?.({ jobId: 'someone-else', done: 99, total: 99, failed: 99 });
      return batch;
    },
    flashcardReadAudio: async (path: string) => ({ ok: true, dataUrl: `data:audio/mpeg;base64,${btoa(path)}` }),
    ankiLinkState: async () => ({ state: linkState, consecutiveFailures: 0 }),
    ankiMineNote: async (request: MineNoteRequest) => {
      mined.push(request);
      return { ok: true, noteId: 7000 + mined.length, deckName: 'Mining' };
    },
  };
});

const input = (extra: Partial<Parameters<typeof buildSentenceDeck>[0]> = {}) => ({
  videoPath: VIDEO,
  deckName: 'Yuru Camp - 01',
  studyLang: 'ja' as const,
  segments,
  textProvenance: 'human-subs' as const,
  mediaId: 'media-1',
  withStill: false,
  sendToAnki: false,
  ...extra,
});

describe('buildSentenceDeck', () => {
  it('writes one audio sentence card per line into a folder named after the episode', async () => {
    const phases: string[] = [];
    const result = await buildSentenceDeck(input(), { jobId: 'j1', onProgress: (p) => phases.push(`${p.phase}:${p.done}/${p.total}`) });
    expect(result.status).toBe('done');
    const done = result as SentenceDeckDone;
    expect(done.added).toBe(3);
    expect(done.folderCreated).toBe(true);
    expect(loadDeckFolders()).toContain('Yuru Camp - 01');
    // Progress from this job only, then the write.
    expect(phases).toContain('audio:1/3');
    expect(phases.some((p) => p.includes('99'))).toBe(false);
    expect(phases.at(-1)).toBe('cards:3/3');

    const cards = loadDeck().filter((card) => done.addedIds.includes(card.id))
      .sort((a, b) => (a.sourceRef?.cueStartSec ?? 0) - (b.sourceRef?.cueStartSec ?? 0));
    expect(cards.map((c) => c.sentence)).toEqual(segments.map((s) => s.text));
    expect(cards[0]).toMatchObject({
      word: 'おはようございます。',
      meaning: 'Good morning.',
      source: 'subtitle',
      studyKind: 'sentence',
      folder: 'Yuru Camp - 01',
      bookTitle: 'Yuru Camp - 01',
      bookId: sentenceDeckBookId(VIDEO),
      sourceUrl: VIDEO,
      sceneReference: '00:01',
      textProvenance: 'human-subs',
      audioPath: 'C:/ud/flashcard-audio/mined/aaa.mp3',
      sourceRef: { mediaId: 'media-1', cueStartSec: 1, cueEndSec: 4 },
    });
    // Japanese is the stored default and is not written out.
    expect(cards[0].studyLang).toBeUndefined();
    expect(cards[0].mineKey).toBeTruthy();
    // The clip that failed: the card is kept, without audio, and the reason is reported.
    expect(cards[1].audioPath).toBeUndefined();
    // The reason is an i18n key for the dialog; ffmpeg's English stays a technical detail.
    expect(done.failedClips).toEqual([{ index: 2, text: '散歩に行きませんか？', error: 'nothing to hear in this range', reasonKey: 'sentenceDeck.clip.silent' }]);
    expect(cards[2].imagePath).toBe('C:/ud/flashcard-audio/mined/ccc.jpg');
  });

  it('sends the lines, the study language and the still option to the audio job', async () => {
    await buildSentenceDeck(input({ studyLang: 'ru', withStill: true }), { jobId: 'j2' });
    expect(extractRequests[0]).toMatchObject({
      jobId: 'j2',
      filePath: VIDEO,
      studyLang: 'ru',
      withStill: true,
      clips: [
        { id: '1', startMs: 1000, endMs: 4000 },
        { id: '2', startMs: 4500, endMs: 8000 },
        { id: '3', startMs: 8500, endMs: 12000 },
      ],
    });
    expect(loadDeck().every((card) => card.studyLang === 'ru')).toBe(true);
  });

  it('writes nothing when the audio job is cancelled or refused', async () => {
    batch = { ok: true, cancelled: true, results: [] };
    expect(await buildSentenceDeck(input(), { jobId: 'j3' })).toEqual({ status: 'cancelled' });
    batch = { ok: false, cancelled: false, results: [], reasonKey: 'sentenceDeck.error.noAudioStream' };
    expect(await buildSentenceDeck(input(), { jobId: 'j4' })).toMatchObject({
      status: 'refused', reasonKey: 'sentenceDeck.error.noAudioStream',
    });
    expect(loadDeck()).toHaveLength(0);
    expect(loadDeckFolders()).toHaveLength(0);
  });

  it('gives back the clips a cancelled batch had already cut, except one an older card uses', async () => {
    addDeckCardsTracked([{
      word: '前のカード', reading: '', meaning: '', source: 'subtitle',
      audioPath: 'C:/ud/flashcard-audio/mined/SHARED.mp3',
    }]);
    batch = {
      ok: true,
      cancelled: true,
      results: [
        { id: '1', ok: true, audioPath: 'C:/ud/flashcard-audio/mined/new1.mp3', imagePath: 'C:/ud/flashcard-audio/mined/new1.jpg' },
        // The same line cut before: content-addressed, so the very same file.
        { id: '2', ok: true, audioPath: ['c:', 'ud', 'flashcard-audio', 'mined', 'shared.mp3'].join(String.fromCharCode(92)) },
      ],
    };
    expect(await buildSentenceDeck(input(), { jobId: 'c1' })).toEqual({ status: 'cancelled' });
    expect(released.sort()).toEqual(['C:/ud/flashcard-audio/mined/new1.jpg', 'C:/ud/flashcard-audio/mined/new1.mp3']);
    expect(loadDeck()).toHaveLength(1);
  });

  it('gives back the clips when the audio job is refused after cutting some', async () => {
    batch = { ok: false, cancelled: false, results: [{ id: '1', ok: true, audioPath: 'C:/ud/flashcard-audio/mined/x.mp3' }], reasonKey: 'sentenceDeck.error.audioFailed' };
    await buildSentenceDeck(input(), { jobId: 'c2' });
    expect(released).toEqual(['C:/ud/flashcard-audio/mined/x.mp3']);
  });

  it('refuses an unnamed deck and an empty plan before cutting anything', async () => {
    expect(await buildSentenceDeck(input({ deckName: '  ' }), { jobId: 'j5' })).toMatchObject({ reasonKey: 'sentenceDeck.error.noName' });
    expect(await buildSentenceDeck(input({ segments: [] }), { jobId: 'j6' })).toMatchObject({ reasonKey: 'sentenceDeck.error.nothingToAdd' });
    expect(extractRequests).toHaveLength(0);
  });
});

describe('undoSentenceDeck', () => {
  it('removes the batch and the folder it created', async () => {
    const done = await buildSentenceDeck(input(), { jobId: 'u1' }) as SentenceDeckDone;
    expect(undoSentenceDeck(done)).toBe(3);
    expect(loadDeck()).toHaveLength(0);
    expect(loadDeckFolders()).not.toContain('Yuru Camp - 01');
  });

  it('deletes the clips and stills it cut, but not a file an older card still uses', async () => {
    addDeckCardsTracked([{
      word: '前のカード', reading: '', meaning: '', source: 'subtitle',
      audioPath: 'C:/ud/flashcard-audio/mined/aaa.mp3',
    }]);
    const done = await buildSentenceDeck(input({ withStill: true }), { jobId: 'u3' }) as SentenceDeckDone;
    expect(released).toEqual([]);
    undoSentenceDeck(done);
    // aaa.mp3 is also the older card's clip; ccc's audio and still were this batch's alone.
    expect(released.sort()).toEqual(['C:/ud/flashcard-audio/mined/ccc.jpg', 'C:/ud/flashcard-audio/mined/ccc.mp3']);
    expect(loadDeck().map((card) => card.word)).toEqual(['前のカード']);
  });

  it('keeps a folder that existed before the batch', async () => {
    createDeckFolder('Yuru Camp - 01');
    const done = await buildSentenceDeck(input(), { jobId: 'u2' }) as SentenceDeckDone;
    expect(done.folderCreated).toBe(false);
    undoSentenceDeck(done);
    expect(loadDeckFolders()).toContain('Yuru Camp - 01');
  });
});

describe('also sending to Anki', () => {
  it('pushes each card with its clip and lands on the same cards', async () => {
    linkState = 'connected';
    markAnkiSeen();
    const done = await buildSentenceDeck(input({ sendToAnki: true }), { jobId: 'a1' }) as SentenceDeckDone;
    expect(done.anki).toEqual({ added: 3, queued: 0, duplicate: 0, failed: 0, local: 0 });
    expect(loadDeck()).toHaveLength(3);
    expect(loadDeck().every((card) => card.ankiExported && typeof card.ankiNoteId === 'number')).toBe(true);
    const first = mined.find((request) => request.term === 'おはようございます。');
    expect(first).toMatchObject({
      route: { source: 'subtitle', cardKind: 'sentence', language: 'ja' },
      sentence: 'おはようございます。',
      sentenceTranslation: 'Good morning.',
      audioFilename: 'gum-sentence-aaa.mp3',
    });
    expect(first?.audioBase64).toBe(btoa('C:/ud/flashcard-audio/mined/aaa.mp3'));
  });

  it('queues the notes while Anki is closed even on a profile that has never reached Anki', async () => {
    // No markAnkiSeen(): the switch itself says Anki is part of this setup.
    const done = await buildSentenceDeck(input({ sendToAnki: true }), { jobId: 'a3' }) as SentenceDeckDone;
    expect(done.anki).toEqual({ added: 0, queued: 3, duplicate: 0, failed: 0, local: 0 });
    expect(loadDeck().every((card) => card.ankiPending)).toBe(true);
  });

  it('a cancel during the Anki pass still accounts for every card', async () => {
    linkState = 'connected';
    markAnkiSeen();
    let sends = 0;
    const done = await buildSentenceDeck(input({ sendToAnki: true }), {
      jobId: 'a4',
      onProgress: (p) => { if (p.phase === 'anki' && p.done >= 1) sends = p.done; },
      isCancelled: () => sends >= 1,
    }) as SentenceDeckDone;
    expect(done.anki?.added).toBe(1);
    const t = done.anki!;
    expect(t.added + t.queued + t.duplicate + t.failed + t.local).toBe(3);
    expect(t.local).toBe(2);
  });

  it('queues the notes while Anki is closed, keeping the local cards', async () => {
    markAnkiSeen();
    const done = await buildSentenceDeck(input({ sendToAnki: true }), { jobId: 'a2' }) as SentenceDeckDone;
    expect(done.anki?.queued).toBe(3);
    expect(loadDeck()).toHaveLength(3);
    expect(loadDeck().every((card) => card.ankiPending)).toBe(true);
  });
});
