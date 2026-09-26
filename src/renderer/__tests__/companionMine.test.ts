// @vitest-environment jsdom
/**
 * The main window's half of a companion mine: a forwarded draft becomes a
 * `mineToStudy` call with its picture, its source window and the right study
 * language, and the result goes back to main.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CompanionDraft, CompanionMineRequest } from '../../shared/companion';
import type { MineToStudyInput } from '../studyMining';

const h = vi.hoisted(() => ({
  mined: [] as MineToStudyInput[],
  results: [] as Array<{ id: string; outcome: unknown }>,
  onMine: null as null | ((p: { requestId: string; request: CompanionMineRequest }) => void),
  ready: 0,
}));

vi.mock('../studyMining', () => ({
  mineToStudy: async (input: MineToStudyInput) => {
    h.mined.push(input);
    return { card: { id: 'c1' }, created: true, anki: 'queued' };
  },
}));

beforeAll(() => {
  const api: Record<string, unknown> = {
    onCompanionMine: (cb: typeof h.onMine) => {
      h.onMine = cb;
      return () => {
        h.onMine = null;
      };
    },
    companionReady: async () => {
      h.ready += 1;
    },
    companionMineResult: async (id: string, outcome: unknown) => {
      h.results.push({ id, outcome });
    },
    lookupTerm: async () => ({ entries: [{ word: 'дом', reading: '', senses: [{ definitions: ['house'] }] }] }),
    lookupChinese: async () => ({ entries: [] }),
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      return async (): Promise<unknown> => ({});
    },
  });
});

afterEach(() => {
  h.mined.length = 0;
  h.results.length = 0;
});

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const DRAFT: CompanionDraft = {
  id: 'cd-7',
  kind: 'word',
  word: '猫',
  reading: 'ねこ',
  meaning: 'cat',
  sentence: '猫が寝る。',
  sourceTitle: 'Some VN — Chapter 2',
  sourceApp: 'SomeVN',
  imageDataUrl: PNG,
  studyLang: 'ja',
  origin: 'lens',
  createdAt: 1,
};

describe('companionStudyInput', () => {
  it('carries the picture, the source window and the Anki note', async () => {
    const { companionStudyInput } = await import('../companionMine');
    const input = companionStudyInput(DRAFT, { attachImage: true });
    expect(input).toMatchObject({
      word: '猫',
      reading: 'ねこ',
      meaning: 'cat',
      sentence: '猫が寝る。',
      source: 'companion',
      sourceTitle: 'Some VN — Chapter 2',
      sourceId: 'companion:somevn',
      studyLang: 'ja',
      image: { base64: 'iVBORw0KGgo=', filename: 'gum-companion-cd-7.png' },
    });
    expect(input.anki).toMatchObject({
      term: '猫',
      imageBase64: 'iVBORw0KGgo=',
      route: { source: 'extension', cardKind: 'word', language: 'ja' },
    });
  });

  it('leaves the picture off when asked', async () => {
    const { companionStudyInput } = await import('../companionMine');
    const input = companionStudyInput(DRAFT, { attachImage: false });
    expect(input.image).toBeUndefined();
    expect(input.anki?.imageBase64).toBeUndefined();
  });

  it('a Russian sentence card is a Russian sentence card', async () => {
    const { companionStudyInput } = await import('../companionMine');
    const text = 'Я читаю книгу каждый вечер';
    const input = companionStudyInput(
      { ...DRAFT, kind: 'sentence', word: text, sentence: text, studyLang: undefined, reading: undefined, meaning: undefined },
      { attachImage: false, studyLang: 'ja' },
    );
    expect(input).toMatchObject({ studyKind: 'sentence', studyLang: 'ru', sentence: text });
    expect(input.anki?.route).toMatchObject({ cardKind: 'sentence', language: 'ru' });
  });
});

describe('installCompanionMining — the IPC round trip', () => {
  it('says ready, mines a forwarded draft and reports the outcome back to main', async () => {
    const { installCompanionMining } = await import('../companionMine');
    const off = installCompanionMining();
    expect(h.ready).toBe(1);
    h.onMine?.({ requestId: 'm1', request: { draft: DRAFT, attachImage: true } });
    await vi.waitFor(() => expect(h.results).toHaveLength(1));
    expect(h.mined[0]).toMatchObject({ word: '猫', source: 'companion' });
    expect(h.results[0]).toEqual({ id: 'm1', outcome: { status: 'added', anki: 'queued' } });
    off();
  });

  it('fills a missing gloss before mining a word', async () => {
    const { installCompanionMining } = await import('../companionMine');
    const off = installCompanionMining();
    h.onMine?.({
      requestId: 'm2',
      request: {
        draft: { ...DRAFT, word: 'дом', reading: undefined, meaning: undefined, sentence: undefined, studyLang: 'ru', imageDataUrl: undefined },
        attachImage: true,
      },
    });
    await vi.waitFor(() => expect(h.results).toHaveLength(1));
    expect(h.mined[0]).toMatchObject({ word: 'дом', meaning: 'house', studyLang: 'ru' });
    off();
  });
});
