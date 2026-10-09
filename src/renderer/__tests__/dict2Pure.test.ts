// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ru } from '../../shared/i18n/catalogs/ru';
import { EXPLAINED_POS_CODES, posTagKey } from '../dictPosTags';
import { checkAnkiPresence, deckPresenceByWord, resetAnkiPresenceCache, withAnkiDuplicates } from '../dictEntryPresence';
import { exampleCoverage, rankByCoverage, type CoverageToken } from '../exampleCoverage';
import { fetchWordFrequency, frequencySourceShortLabel, resetWordFrequencyCache } from '../dictFrequencyCache';
import { hanCharacters } from '../components/lexicon/KanjiBreakdown';

afterEach(() => {
  resetAnkiPresenceCache();
  resetWordFrequencyCache();
  vi.restoreAllMocks();
});

describe('part-of-speech explanations', () => {
  it('maps JMdict codes to catalog keys every locale defines', () => {
    expect(EXPLAINED_POS_CODES.length).toBeGreaterThan(40);
    for (const code of EXPLAINED_POS_CODES) {
      const key = posTagKey(code);
      expect(key, code).toMatch(/^dict2\.pos\./);
      for (const catalog of [en, ja, zh, ru]) expect(catalog[key as string], `${code} in a locale`).toBeTruthy();
    }
  });

  it('has no explanation for a code it does not know, or a full name', () => {
    expect(posTagKey('Ichidan verb')).toBeNull();
    expect(posTagKey('toString')).toBeNull();
    expect(posTagKey(' v5k-s ')).toBe('dict2.pos.v5k_s');
  });
});

describe('deck / Anki presence', () => {
  const card = (word: string, extra: Record<string, unknown> = {}) => ({ word, ...extra });

  it('answers for every asked word, per study language', () => {
    const map = deckPresenceByWord(
      [card('食べる'), card('猫', { ankiNoteId: 12 }), card('猫', { studyLang: 'zh' }), card('犬', { ankiPending: true })],
      ['食べる', '猫', '犬', '鳥'],
      'ja',
    );
    expect(map.get('食べる')).toEqual({ inDeck: true, inAnki: false, ankiPending: false });
    expect(map.get('猫')).toEqual({ inDeck: true, inAnki: true, ankiPending: false });
    expect(map.get('犬')).toEqual({ inDeck: true, inAnki: false, ankiPending: true });
    expect(map.get('鳥')).toEqual({ inDeck: false, inAnki: false, ankiPending: false });
    expect(deckPresenceByWord([card('猫', { studyLang: 'zh' })], ['猫'], 'zh').get('猫')?.inDeck).toBe(true);
  });

  it('folds in only a positive Anki verdict', () => {
    const base = deckPresenceByWord([], ['a', 'b'], 'ja');
    const merged = withAnkiDuplicates(base, { a: true, b: false });
    expect(merged.get('a')?.inAnki).toBe(true);
    expect(merged.get('b')?.inAnki).toBe(false);
  });

  it('asks Anki once per target and word set, and says nothing when it cannot ask', async () => {
    const api = vi.fn(async (terms: string[]) => ({ ok: true, duplicates: { [terms[0]]: true } }));
    (window as unknown as { api: Record<string, unknown> }).api = { ankiCheckDuplicates: api };
    const target = { deckName: 'Mining', modelName: 'Lapis' };
    expect(await checkAnkiPresence(['猫'], target, 1000)).toEqual({ 猫: true });
    expect(await checkAnkiPresence(['猫'], target, 2000)).toEqual({ 猫: true });
    expect(api).toHaveBeenCalledTimes(1);
    expect(await checkAnkiPresence(['猫'], { deckName: '', modelName: 'Lapis' })).toEqual({});
    (window as unknown as { api: Record<string, unknown> }).api = {
      ankiCheckDuplicates: vi.fn(async () => ({ ok: false, duplicates: {}, unreachable: true })),
    };
    expect(await checkAnkiPresence(['犬'], target)).toEqual({});
  });
});

describe('i+1 example ranking', () => {
  const tok = (lemma: string, content = true): CoverageToken => ({ surface: lemma, lemma, content, proper: false });
  const levels: Record<string, number> = { 私: 3, 毎日: 2, 寿司: 1 };
  const levelOf = (key: string) => levels[key] ?? 0;
  const target = new Set(['食べる']);

  it('counts distinct unknown content words other than the target', () => {
    expect(exampleCoverage([tok('私'), tok('は', false), tok('毎日'), tok('食べる')], target, levelOf)).toEqual({ unknown: 0, words: 2 });
    expect(exampleCoverage([tok('寿司'), tok('寿司'), tok('醤油'), tok('食べる')], target, levelOf)).toEqual({ unknown: 2, words: 2 });
  });

  it('puts the most comprehensible sentence first and keeps corpus order on ties', () => {
    const coverage: Record<string, { unknown: number; words: number } | null> = {
      a: { unknown: 2, words: 3 },
      b: { unknown: 0, words: 2 },
      c: null,
      d: { unknown: 0, words: 4 },
    };
    expect(rankByCoverage(['a', 'b', 'c', 'd'], (k) => coverage[k])).toEqual(['b', 'd', 'a', 'c']);
    expect(rankByCoverage(['x', 'y'], () => null)).toEqual(['x', 'y']);
  });
});

describe('frequency chips', () => {
  it('shortens a corpus title for a chip', () => {
    expect(frequencySourceShortLabel('Japanese frequency (JPDB v2.2)')).toBe('JPDB v2.2');
    expect(frequencySourceShortLabel('BCCWJ')).toBe('BCCWJ');
    expect(frequencySourceShortLabel('Japanese starter frequency')).toBe('Japanese star…');
  });

  it('asks once per word and language, and does not cache a failure', async () => {
    const dictFrequency = vi
      .fn()
      .mockRejectedValueOnce(new Error('worker down'))
      .mockResolvedValue({ query: '猫', entries: [{ corpusId: 'c', corpusTitle: 'C', rank: 5 }], band: 'veryCommon' });
    (window as unknown as { api: Record<string, unknown> }).api = { dictFrequency };
    expect(await fetchWordFrequency('猫', 'ja')).toBeNull();
    expect((await fetchWordFrequency('猫', 'ja'))?.entries).toHaveLength(1);
    await fetchWordFrequency('猫', 'ja');
    expect(dictFrequency).toHaveBeenCalledTimes(2);
    expect(dictFrequency).toHaveBeenLastCalledWith('猫', { sourceLangs: ['ja'] });
  });
});

describe('kanji breakdown characters', () => {
  it('takes the distinct Han characters in order, capped', () => {
    expect(hanCharacters('図書館で図書を')).toEqual(['図', '書', '館']);
    expect(hanCharacters('たべる')).toEqual([]);
    expect(hanCharacters('一二三四五六七八', 6)).toHaveLength(6);
  });
});
