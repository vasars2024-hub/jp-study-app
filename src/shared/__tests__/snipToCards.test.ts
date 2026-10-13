import { describe, expect, it } from 'vitest';
import {
  classifySnipTokens,
  clipboardHasImageFormat,
  groupJapaneseTokens,
  migrateSnipSettings,
  normalizeSnipSettings,
  normalizeSnipWord,
  pruneSnipHistory,
  snipImageRejection,
  snipMatchesQuery,
  snipSendsToAnki,
  snipTextProblem,
  snipTokenSkipReason,
  snipWordList,
  SNIP_SETTINGS_DEFAULTS,
  type SnipToken,
} from '../snipToCards';

const none = { isKnown: () => false, inDeck: () => false };

/** kuromoji's reading of 窓辺の猫は静かに眠っていた。 (IPADIC). */
const SENTENCE: SnipToken[] = [
  { surface: '窓辺', lemma: '窓辺', reading: 'マドベ', pos: '名詞', posDetail: '一般', content: true },
  { surface: 'の', lemma: 'の', reading: 'ノ', pos: '助詞', posDetail: '連体化', content: false },
  { surface: '猫', lemma: '猫', reading: 'ネコ', pos: '名詞', posDetail: '一般', content: true },
  { surface: 'は', lemma: 'は', reading: 'ハ', pos: '助詞', posDetail: '係助詞', content: false },
  { surface: '静か', lemma: '静か', reading: 'シズカ', pos: '名詞', posDetail: '形容動詞語幹', content: true },
  { surface: 'に', lemma: 'に', reading: 'ニ', pos: '助詞', posDetail: '副詞化', content: false },
  { surface: '眠っ', lemma: '眠る', reading: 'ネムッ', pos: '動詞', posDetail: '自立', content: true },
  { surface: 'て', lemma: 'て', reading: 'テ', pos: '助詞', posDetail: '接続助詞', content: false },
  { surface: 'い', lemma: 'いる', reading: 'イ', pos: '動詞', posDetail: '非自立', content: false },
  { surface: 'た', lemma: 'た', reading: 'タ', pos: '助動詞', posDetail: '*', content: false },
  { surface: '。', lemma: '。', reading: '。', pos: '記号', posDetail: '句点', content: false },
];

describe('settings', () => {
  it('defaults: off (v1), auto-add once on, Anki when set up, Snips deck, 12 words', () => {
    expect(normalizeSnipSettings(undefined)).toEqual(SNIP_SETTINGS_DEFAULTS);
    expect(SNIP_SETTINGS_DEFAULTS).toMatchObject({ enabled: false, autoAdd: true, sendToAnki: 'auto', deck: 'Snips', maxWords: 12 });
  });

  it('repairs each field on its own and clamps the word limit', () => {
    const s = normalizeSnipSettings({ enabled: false, sendToAnki: 'sometimes', deck: '  ', maxWords: 999, ankiDeck: 'Mine::Snips\u0007' });
    expect(s).toMatchObject({ enabled: false, sendToAnki: 'auto', deck: 'Snips', maxWords: 50, ankiDeck: 'Mine::Snips' });
    expect(normalizeSnipSettings({ maxWords: 0 }).maxWords).toBe(1);
    expect(normalizeSnipSettings({ maxWords: 'x' }).maxWords).toBe(12);
  });

  it('migration: an old profile keeps watching only if it was used, and a turned-off choice is kept', () => {
    const none0 = { historyCount: 0 };
    const used = { historyCount: 3 };
    // Never written (new profile, or old profile that never touched it).
    expect(migrateSnipSettings(undefined, none0)).toEqual({ settings: SNIP_SETTINGS_DEFAULTS, migrated: true });
    expect(migrateSnipSettings({}, used).settings.enabled).toBe(true);
    // Old file, on (the old default) but never used → off; other fields kept.
    expect(migrateSnipSettings({ enabled: true, deck: 'Mine', maxWords: 5 }, none0)).toEqual({
      settings: { ...SNIP_SETTINGS_DEFAULTS, enabled: false, deck: 'Mine', maxWords: 5 },
      migrated: true,
    });
    expect(migrateSnipSettings({ enabled: true }, used).settings.enabled).toBe(true);
    expect(migrateSnipSettings({ enabled: true, notice: 'answered' }, none0).settings.enabled).toBe(true);
    expect(migrateSnipSettings({ enabled: true, notice: 'shown' }, none0).settings.enabled).toBe(true);
    // Turned off stays off whatever the history says.
    expect(migrateSnipSettings({ enabled: false, notice: 'answered' }, used).settings.enabled).toBe(false);
    // Already on the new schema: only repaired, never re-decided.
    expect(migrateSnipSettings({ schema: 2, enabled: true }, none0)).toEqual({ settings: { ...SNIP_SETTINGS_DEFAULTS, enabled: true }, migrated: false });
    expect(migrateSnipSettings({ schema: 2, enabled: false }, used)).toMatchObject({ settings: { enabled: false }, migrated: false });
  });

  it('off keeps cards in Gum only', () => {
    expect(snipSendsToAnki('off')).toBe(false);
    expect(snipSendsToAnki('auto')).toBe(true);
    expect(snipSendsToAnki('on')).toBe(true);
  });
});

describe('which clipboard pictures are snips', () => {
  it('ignores empty, icon-sized and absurdly large pictures', () => {
    expect(snipImageRejection({ width: 0, height: 0 })).toBe('empty');
    expect(snipImageRejection({ width: 16, height: 16 })).toBe('too-small');
    expect(snipImageRejection({ width: 300, height: 10 })).toBe('too-small');
    expect(snipImageRejection({ width: 9000, height: 400 })).toBe('too-large');
    expect(snipImageRejection({ width: 7000, height: 7000 })).toBe('too-large');
    expect(snipImageRejection({ width: 600, height: 120 })).toBeNull();
    expect(snipImageRejection({ width: 3840, height: 2160 })).toBeNull();
  });

  it('recognises a picture in the format list', () => {
    expect(clipboardHasImageFormat(['text/plain'])).toBe(false);
    expect(clipboardHasImageFormat(['image/png'])).toBe(true);
    expect(clipboardHasImageFormat(['PNG', 'DIB'])).toBe(true);
    expect(clipboardHasImageFormat(undefined)).toBe(false);
  });
});

describe('OCR quality gate', () => {
  it('passes a clean Japanese read', () => {
    expect(snipTextProblem('窓辺の猫は静かに眠っていた。', 'ja', 0.91)).toBeNull();
  });

  it('never makes cards from empty, garbled or unsure reads', () => {
    expect(snipTextProblem('   ', 'ja')).toBe('no-text');
    expect(snipTextProblem('|||-- 1 1', 'ja')).toBe('no-text');
    expect(snipTextProblem('IIl1 lI| 猫 rn', 'ja')).toBe('garbage');
    expect(snipTextProblem('猫が寝る', 'ja', 0.3)).toBe('low-confidence');
    expect(snipTextProblem('猫が寝る', 'ja')).toBeNull();
  });

  it('judges each language by its own script', () => {
    expect(snipTextProblem('今天天气很好', 'zh', 0.9)).toBeNull();
    expect(snipTextProblem('hello world', 'zh')).toBe('no-text');
    expect(snipTextProblem('Привет, мир', 'ru')).toBeNull();
  });
});

describe('Japanese conjugation grouping', () => {
  it('folds a verb with its te-form, helper verb and past auxiliary', () => {
    const grouped = groupJapaneseTokens(SENTENCE);
    const verb = grouped.find((t) => t.lemma === '眠る');
    expect(verb).toMatchObject({ surface: '眠っていた', reading: 'ネムッテイタ', pos: '動詞', content: true });
    expect(grouped.map((t) => t.surface)).toEqual(['窓辺', 'の', '猫', 'は', '静か', 'に', '眠っていた', '。']);
  });

  it('does not fold particles after nouns', () => {
    const grouped = groupJapaneseTokens(SENTENCE.slice(0, 4));
    expect(grouped).toHaveLength(4);
  });
});

describe('which words become cards', () => {
  it('skips particles, auxiliaries, punctuation, numbers and single-kana noise', () => {
    expect(snipTokenSkipReason({ surface: 'の', lemma: 'の', pos: '助詞', content: false }, 'ja')).toBe('function');
    expect(snipTokenSkipReason({ surface: 'た', lemma: 'た', pos: '助動詞', content: false }, 'ja')).toBe('function');
    expect(snipTokenSkipReason({ surface: '。', lemma: '。', pos: '記号', content: false }, 'ja')).toBe('punct');
    expect(snipTokenSkipReason({ surface: '１２', lemma: '１２', pos: '名詞', posDetail: '数', content: false }, 'ja')).toBe('number');
    expect(snipTokenSkipReason({ surface: 'ね', lemma: 'ね', pos: '名詞', content: true }, 'ja')).toBe('noise');
    expect(snipTokenSkipReason({ surface: '田中', lemma: '田中', pos: '名詞', content: true, proper: true }, 'ja')).toBe('name');
    expect(snipTokenSkipReason({ surface: '猫', lemma: '猫', pos: '名詞', content: true }, 'ja')).toBeNull();
  });

  it('marks the snip word by word and keeps only unknown, uncarded content words', () => {
    const words = classifySnipTokens(groupJapaneseTokens(SENTENCE), 'ja', {
      isKnown: (lemma) => lemma === '猫',
      inDeck: (lemma) => lemma === '静か',
    }, 12);
    expect(words.map((w) => [w.surface, w.status])).toEqual([
      ['窓辺', 'candidate'],
      ['の', 'function'],
      ['猫', 'known'],
      ['は', 'function'],
      ['静か', 'inDeck'],
      ['に', 'function'],
      ['眠っていた', 'candidate'],
      ['。', 'punct'],
    ]);
    // The analyser's reading belongs to the surface; the lemma gets it only when they match.
    expect(words[0]).toMatchObject({ reading: 'マドベ', surfaceReading: 'マドベ' });
    expect(words[6].reading).toBeUndefined();
    expect(words[6].surfaceReading).toBe('ネムッテイタ');
  });

  it('dedupes within the snip and stops at the limit', () => {
    const tokens: SnipToken[] = ['犬', '猫', '犬', '鳥', '魚'].map((s) => ({ surface: s, lemma: s, pos: '名詞', content: true }));
    const words = classifySnipTokens(tokens, 'ja', none, 2);
    expect(words.map((w) => w.status)).toEqual(['candidate', 'candidate', 'duplicate', 'overLimit', 'overLimit']);
  });

  it('Chinese: function words out, real words in', () => {
    const tokens: SnipToken[] = ['我', '喜欢', '的', '猫', '。'].map((s) => ({ surface: s, lemma: s, content: s !== '。' }));
    const words = classifySnipTokens(tokens, 'zh', none, 12);
    expect(words.map((w) => w.status)).toEqual(['function', 'candidate', 'function', 'candidate', 'punct']);
  });
});

describe('history', () => {
  const entry = (id: string, bytes: number) => ({ id, bytes });

  it('drops the oldest first past the entry cap', () => {
    const list = Array.from({ length: 205 }, (_, i) => entry(`snip-${i}`, 10));
    const { kept, dropped } = pruneSnipHistory(list);
    expect(kept).toHaveLength(200);
    expect(dropped.map((e) => e.id)).toEqual(['snip-200', 'snip-201', 'snip-202', 'snip-203', 'snip-204']);
  });

  it('drops the oldest first past the byte cap, but always keeps the newest', () => {
    const { kept, dropped } = pruneSnipHistory([entry('new', 70), entry('mid', 20), entry('old', 20)], { maxBytes: 100 });
    expect(kept.map((e) => e.id)).toEqual(['new', 'mid']);
    expect(dropped.map((e) => e.id)).toEqual(['old']);
    expect(pruneSnipHistory([entry('huge', 500)], { maxBytes: 100 }).kept).toHaveLength(1);
  });

  it('search matches the text, words, readings, meanings and translation', () => {
    const e = {
      text: '窓辺の猫',
      translation: 'The cat by the window',
      words: [{ surface: '窓辺', lemma: '窓辺', reading: 'まどべ', meaning: 'windowside', status: 'added' as const }],
    };
    expect(snipMatchesQuery(e, '')).toBe(true);
    expect(snipMatchesQuery(e, '猫')).toBe(true);
    expect(snipMatchesQuery(e, 'まどべ')).toBe(true);
    expect(snipMatchesQuery(e, 'WINDOWSIDE')).toBe(true);
    expect(snipMatchesQuery(e, 'cat')).toBe(true);
    expect(snipMatchesQuery(e, '犬')).toBe(false);
  });

  it('repairs a stored word and refuses a non-word', () => {
    expect(normalizeSnipWord(null)).toBeNull();
    expect(normalizeSnipWord({ lemma: 'x' })).toBeNull();
    expect(normalizeSnipWord({ surface: '猫', status: 'bogus', ankiNoteId: -1, freq: 'n' })).toEqual({ surface: '猫', lemma: '猫', status: 'candidate' });
    expect(normalizeSnipWord({ surface: '猫', status: 'added', cardId: 'c1', ankiNoteId: 42, deinflection: ['past', 3] }))
      .toMatchObject({ status: 'added', cardId: 'c1', ankiNoteId: 42, deinflection: ['past'] });
  });

  it('the toast lists the first few words', () => {
    expect(snipWordList(['猫'])).toBe('猫');
    expect(snipWordList(['猫', '走る', '静か'])).toBe('猫, 走る, 静か');
    expect(snipWordList(['猫', '走る', '静か', '窓辺'])).toBe('猫, 走る, 静か, …');
  });
});
