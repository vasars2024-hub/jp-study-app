// @vitest-environment jsdom
//
// The renderer half of the scraper pipeline E2E: a finished download's sidecar
// cue and the sentence clip cut from it become a card in the study deck.
//
// The main half (fixture site -> scrape -> fake qBittorrent -> ingest -> cues ->
// clip) is src/main/__tests__/scraperPipelineE2E.test.ts. This suite rebuilds the
// download it ends with — the generated test video and its Japanese sidecar —
// so it runs on its own, then drives the real `mineToStudy` into the real deck.
// Only the IndexedDB wrapper and the auto-enrich (network) are stubbed; the
// mined-media IPC is answered by main's own `writeMinedMediaBytes`.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseStudySubtitles } from '../../shared/subtitleCues';
import { writeMinedMediaBytes } from '../../main/minedMediaStore';
import { extractSentenceClip } from '../../main/sentenceAudioBatch';
import { pickSidecarSubtitleForLanguage } from '../../main/subtitleSidecar';
import { HAVE_FFMPEG, ensureTestMedia, placeMedia } from '../../main/__tests__/e2eFixtures/media';
import { CUE_LINES, SHOW, SRT_JA } from '../../main/__tests__/e2eFixtures/texts';
import { mineToStudy } from '../studyMining';
import { loadDeck } from '../flashcardDeck';

const h = vi.hoisted(() => {
  const tmp = (process.env.TEMP ?? process.env.TMPDIR ?? '/tmp').replace(/\\/g, '/');
  return { work: `${tmp}/gum-e2e/mining-${process.pid}-${Date.now().toString(36)}`, idb: new Map<string, unknown>() };
});

vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => h.idb.get(key),
  kvSet: async (key: string, value: unknown) => { h.idb.set(key, JSON.parse(JSON.stringify(value))); },
}));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: async () => ({ audio: null, reading: null }) }));

const LIBRARY = path.join(h.work, 'library');
const MINED = path.join(h.work, 'mined');
const VIDEO = path.join(LIBRARY, `${SHOW} - 01.mkv`);

beforeAll(async () => {
  if (!HAVE_FFMPEG) return;
  const media = await ensureTestMedia();
  placeMedia(media!, VIDEO);
  fs.writeFileSync(path.join(LIBRARY, `${SHOW} - 01.ja.srt`), SRT_JA, 'utf8');
  (window as unknown as { api: Record<string, unknown> }).api = {
    ankiLinkState: async () => ({ state: 'disconnected', consecutiveFailures: 0 }),
    ankiMineNote: async () => ({ ok: false, error: 'offline' }),
    flashcardStoreMinedMedia: async (base64: string, filename: string) =>
      writeMinedMediaBytes(MINED, Buffer.from(base64, 'base64'), filename.slice(filename.lastIndexOf('.'))),
  };
}, 30_000);

afterAll(() => {
  fs.rmSync(h.work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe.skipIf(!HAVE_FFMPEG)('scraper pipeline E2E (renderer): cue + clip -> mineToStudy -> deck', () => {
  it('mines a sentence from the downloaded episode into the study deck, with its audio', async () => {
    const pick = pickSidecarSubtitleForLanguage(VIDEO, 'ja');
    const cues = parseStudySubtitles(pick!.text).cues;
    expect(cues.map((cue) => cue.text)).toEqual([...CUE_LINES]);
    const cue = cues[1];

    const clip = await extractSentenceClip(
      { filePath: VIDEO },
      { id: 'e2e-mining', startMs: cue.start * 1000, endMs: cue.end * 1000 },
      path.join(h.work, 'clips'),
    );
    expect(clip.ok).toBe(true);
    const audio = fs.readFileSync(clip.audioPath!);

    const input = {
      word: '天気',
      reading: 'てんき',
      meaning: 'weather',
      sentence: cue.text,
      source: 'media' as const,
      sourceTitle: SHOW,
      sourceId: 'e2e-media-ep01',
      studyLang: 'ja' as const,
      audio: { base64: audio.toString('base64'), filename: 'sentence.mp3' },
      notify: false,
    };
    const first = await mineToStudy(input);
    expect(first.created).toBe(true);
    expect(first.anki).toBe('local');

    const card = loadDeck().find((row) => row.id === first.card.id)!;
    expect(card).toMatchObject({ word: '天気', sentence: CUE_LINES[1], bookTitle: SHOW, bookId: 'e2e-media-ep01' });
    expect(card.audioPath && fs.existsSync(card.audioPath)).toBe(true);
    expect(path.dirname(card.audioPath!)).toBe(MINED);

    // The same mine again (a double click) finds the card instead of adding one.
    const again = await mineToStudy(input);
    expect(again.created).toBe(false);
    expect(loadDeck().filter((row) => row.sentence === CUE_LINES[1])).toHaveLength(1);
  });
});
