// @vitest-environment node
/**
 * Snip to cards in every studied language: which language a snip's text is in,
 * which languages a snip may be in, what the accurate-reader setup installs,
 * what a snip offers when it could not be read well, which read wins, and the
 * new IPC actions (read again; install, then read again).
 */
import { describe, expect, it } from 'vitest';
import {
  detectStudyLangOfText,
  JAPANESE_ONLY_HAN,
  SIMPLIFIED_ONLY_HAN,
} from '../textLangDetect';
import {
  isSnipReaderAsset,
  normalizeSnipAction,
  normalizeSnipReaders,
  pickSnipRead,
  snipAccurateReader,
  snipAnyReader,
  snipCandidateLangs,
  snipErrorKey,
  snipReaderOffer,
  snipReaderSetupIds,
  SNIP_NO_READERS,
  type SnipEntry,
  type SnipReaders,
} from '../snipToCards';

const readers = (over: Partial<SnipReaders> = {}): SnipReaders => ({ ...SNIP_NO_READERS, ...over });

describe('the language of a snip\'s text', () => {
  it('kana is Japanese, Cyrillic is Russian', () => {
    expect(detectStudyLangOfText('恐竜の魅力を語る', 'zh')).toEqual({ lang: 'ja', evidence: 'kana' });
    expect(detectStudyLangOfText('Привет, мир', 'ja')).toEqual({ lang: 'ru', evidence: 'cyrillic' });
  });

  it('Han only: Simplified-only characters say Chinese (the owner\'s snip)', () => {
    expect(detectStudyLangOfText('…过度的崇拜。', 'ja')).toEqual({ lang: 'zh', evidence: 'simplified' });
    expect(detectStudyLangOfText('这是我们的书', 'ja').lang).toBe('zh');
  });

  it('Han only: kokuji and Japanese-only forms say Japanese', () => {
    expect(detectStudyLangOfText('込働', 'zh')).toEqual({ lang: 'ja', evidence: 'japanese' });
    expect(detectStudyLangOfText('駅図', 'zh').lang).toBe('ja');
    expect(detectStudyLangOfText('恐竜', 'zh').lang).toBe('ja');
  });

  it('Han only with nothing telling: the learner\'s own language, or the first that reads Han', () => {
    expect(detectStudyLangOfText('学校', 'ja')).toEqual({ lang: 'ja', evidence: 'han' });
    expect(detectStudyLangOfText('学校', 'zh')).toEqual({ lang: 'zh', evidence: 'han' });
    expect(detectStudyLangOfText('学校', 'ru', ['ru', 'zh']).lang).toBe('zh');
    expect(detectStudyLangOfText('学校', 'ru', ['ru']).lang).toBe('ja');
  });

  it('Han only, no telling forms: Chinese grammar words and punctuation say Chinese (the owner\'s second snip)', () => {
    // 这种等待，本质上是一种拖延。 as the Japanese recogniser read it: no Simplified-only
    // form survived, but 是 and 把 did.
    expect(detectStudyLangOfText('滋神等待·本上是一釉把延', 'ja')).toEqual({ lang: 'zh', evidence: 'chinese-grammar' });
    // Traditional Chinese has no Simplified-only forms at all; its comma and 是 still tell.
    expect(detectStudyLangOfText('這種等待，本質上是一種拖延。', 'ja').lang).toBe('zh');
    expect(detectStudyLangOfText('你好吗？我很好。', 'ja').lang).toBe('zh');
  });

  it('a sentence-length run with no kana is Chinese; short kanji words still follow the learner', () => {
    expect(detectStudyLangOfText('本質上一種拖延等待時間長久', 'ja')).toEqual({ lang: 'zh', evidence: 'no-kana' });
    expect(detectStudyLangOfText('東京大学', 'ja')).toEqual({ lang: 'ja', evidence: 'han' });
    expect(detectStudyLangOfText('一石二鳥', 'ja').lang).toBe('ja');
  });

  it('Japanese corner brackets and compounds Japanese writes stay Japanese', () => {
    expect(detectStudyLangOfText('「東京」', 'zh')).toEqual({ lang: 'ja', evidence: 'japanese' });
    expect(detectStudyLangOfText('完了', 'ja').lang).toBe('ja');
    expect(detectStudyLangOfText('就職活動', 'ja').lang).toBe('ja');
    expect(detectStudyLangOfText('彼は学生です。', 'zh').lang).toBe('ja');
  });

  it('one stray kana in Chinese is an OCR slip, not Japanese', () => {
    expect(detectStudyLangOfText('这是我们的书の过去', 'ja').lang).toBe('zh');
  });

  it('Latin noise and nothing at all follow the learner\'s language', () => {
    expect(detectStudyLangOfText('J4 ll', 'ru')).toEqual({ lang: 'ru', evidence: 'latin' });
    expect(detectStudyLangOfText('', 'zh')).toEqual({ lang: 'zh', evidence: 'none' });
  });

  it('the two telling sets never overlap, and leave out what both write', () => {
    expect([...SIMPLIFIED_ONLY_HAN].filter((c) => JAPANESE_ONLY_HAN.has(c))).toEqual([]);
    for (const shared of ['学', '国', '会', '的', '写', '数', '静']) {
      expect(SIMPLIFIED_ONLY_HAN.has(shared) || JAPANESE_ONLY_HAN.has(shared)).toBe(false);
    }
  });
});

describe('readers', () => {
  it('candidate languages: the learner\'s own, then every language an installed reader reads', () => {
    expect(snipCandidateLangs('ja', readers())).toEqual(['ja']);
    expect(snipCandidateLangs('ja', readers({ det: true, paddle: ['zh'] }))).toEqual(['ja', 'zh']);
    expect(snipCandidateLangs('ru', readers({ manga: true }))).toEqual(['ru', 'ja']);
    expect(snipCandidateLangs('ja', readers({ tess: ['chi_sim'] }))).toEqual(['ja', 'zh']);
    // A future study set adds its languages.
    expect(snipCandidateLangs('ja', readers(), ['ru'])).toEqual(['ja', 'ru']);
  });

  it('an accurate reader needs the detector and the language; the bundled one reads Japanese', () => {
    expect(snipAccurateReader('zh', readers({ paddle: ['zh'] }))).toBe(false);
    expect(snipAccurateReader('zh', readers({ det: true, paddle: ['zh'] }))).toBe(true);
    expect(snipAccurateReader('ja', readers({ manga: true }))).toBe(true);
    expect(snipAnyReader('ja', readers())).toBe(true);
    expect(snipAnyReader('zh', readers())).toBe(false);
    expect(snipAnyReader('zh', readers({ tess: ['chi_tra'] }))).toBe(true);
  });

  it('the setup installs each language\'s recogniser (it pulls the detector in), manga-ocr only when asked', () => {
    expect(snipReaderSetupIds(['ja'], readers())).toEqual(['paddle-ocr-ja']);
    expect(snipReaderSetupIds(['ja', 'zh'], readers({ det: true, paddle: ['ja'] }))).toEqual(['paddle-ocr-zh']);
    expect(snipReaderSetupIds(['ja'], readers(), { manga: true })).toEqual(['paddle-ocr-ja', 'manga-ocr', 'comic-text-detector']);
    expect(snipReaderSetupIds(['zh'], readers(), { manga: true })).toEqual(['paddle-ocr-zh']);
  });

  it('only OCR readers may be installed from a Snips button', () => {
    expect(isSnipReaderAsset('paddle-ocr-zh')).toBe(true);
    expect(isSnipReaderAsset('tessdata-chi_sim')).toBe(true);
    expect(isSnipReaderAsset('qwen3-1.7b')).toBe(false);
    expect(normalizeSnipReaders({ det: true, paddle: ['zh', 'xx', 'zh'], tess: ['chi_sim', 'eng'], manga: 'yes' }))
      .toEqual({ det: true, paddle: ['zh'], manga: false, tess: ['chi_sim'] });
  });
});

describe('what a snip offers', () => {
  const base: Pick<SnipEntry, 'status' | 'error' | 'engine' | 'review' | 'lang' | 'installIds'> = { status: 'error', lang: 'ja' };

  it('a language with no reader: that reader', () => {
    expect(snipReaderOffer({ ...base, lang: 'zh', error: 'models-missing', installIds: ['paddle-ocr-zh'] }, readers()))
      .toEqual({ kind: 'lang', lang: 'zh', ids: ['paddle-ocr-zh'] });
    // Installed since: nothing to offer, Read again does it.
    expect(snipReaderOffer({ ...base, lang: 'zh', error: 'models-missing' }, readers({ det: true, paddle: ['zh'] }))).toBeNull();
  });

  it('a failed or unsure basic read: the accurate reader for its language', () => {
    expect(snipReaderOffer({ ...base, error: 'garbage', engine: 'basic' }, readers())).toEqual({ kind: 'accurate', lang: 'ja', ids: ['paddle-ocr-ja'] });
    expect(snipReaderOffer({ status: 'done', review: 'uncertain', engine: 'basic', lang: 'ja' }, readers())).toMatchObject({ kind: 'accurate' });
    expect(snipReaderOffer({ status: 'done', engine: 'basic', lang: 'ja' }, readers())).toBeNull();
    expect(snipReaderOffer({ ...base, error: 'cancelled', engine: 'basic' }, readers())).toBeNull();
    expect(snipReaderOffer({ ...base, error: 'garbage', engine: 'web' }, readers())).toBeNull();
  });

  it('a Japanese snip PaddleOCR was unsure of: manga-ocr, better on stylised lettering', () => {
    const paddle = readers({ det: true, paddle: ['ja'] });
    expect(snipReaderOffer({ status: 'done', review: 'uncertain', engine: 'web', lang: 'ja' }, paddle))
      .toEqual({ kind: 'manga', lang: 'ja', ids: ['manga-ocr', 'comic-text-detector'] });
    expect(snipReaderOffer({ status: 'done', review: 'uncertain', engine: 'web', lang: 'ja' }, { ...paddle, manga: true })).toBeNull();
    expect(snipReaderOffer({ status: 'done', engine: 'web', lang: 'ja' }, paddle)).toBeNull();
    expect(snipReaderOffer({ status: 'done', review: 'uncertain', engine: 'web', lang: 'zh' }, readers({ det: true, paddle: ['zh'] }))).toBeNull();
  });

  it('every error names what to do next', () => {
    expect(snipErrorKey('models-missing')).toBe('snip.error.modelsMissing');
    expect(snipErrorKey('no-text')).toBe('snip.error.noText');
    expect(snipErrorKey(undefined)).toBe('snip.error.ocrFailed');
  });
});

describe('the best of several reads', () => {
  it('confidence and script consistency, weighted by how much text came back', () => {
    const jpn = { text: 'し J4', lang: 'ja' as const, confidence: 0.53 };
    const chi = { text: '过度的崇拜', lang: 'zh' as const, confidence: 0.7 };
    expect(pickSnipRead([jpn, chi])).toBe(chi);
    expect(pickSnipRead([{ text: '猫', lang: 'ja' as const, confidence: 0.99 }, { text: '窓辺の猫', lang: 'ja' as const, confidence: 0.8 }])?.text).toBe('窓辺の猫');
    expect(pickSnipRead([{ text: '  ', lang: 'ja' as const }])).toBeNull();
  });
});

describe('actions', () => {
  it('read again, and install-then-read-again (reader assets only)', () => {
    expect(normalizeSnipAction({ id: 'snip-a', action: 'reread' })).toEqual({ id: 'snip-a', action: 'reread' });
    expect(normalizeSnipAction({ id: 'snip-a', action: 'installReread', assets: ['paddle-ocr-zh', 'qwen3-1.7b', 'paddle-ocr-zh', 7] }))
      .toEqual({ id: 'snip-a', action: 'installReread', assets: ['paddle-ocr-zh'] });
    expect(normalizeSnipAction({ id: 'snip-a', action: 'installReread', assets: ['qwen3-1.7b'] })).toBeNull();
    expect(normalizeSnipAction({ id: '../x', action: 'reread' })).toBeNull();
  });
});
