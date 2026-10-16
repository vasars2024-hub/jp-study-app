// @vitest-environment node
/**
 * The language of a picture from several recognisers' reads of it. The reads
 * are real: PaddleOCR's Japanese and Chinese heads on the owner's snips and the
 * synthetic set (`tools/ocr-eval/snip-eval.cjs`). A recogniser writes its own
 * language's character forms for everything it reads, so those forms alone
 * never decide; kana and Cyrillic do, then sentence length, then which head
 * read the picture better.
 */
import { describe, expect, it } from 'vitest';
import { detectStudyLangOfReads, type StudyLangRead } from '../textLangDetect';

const ja = (text: string, confidence: number): StudyLangRead => ({ lang: 'ja', text, confidence });
const zh = (text: string, confidence: number): StudyLangRead => ({ lang: 'zh', text, confidence });
const both = ['ja', 'zh'] as const;

describe('kana and Cyrillic decide, and end the search', () => {
  it('a Japanese sentence read by the Japanese head is decisive', () => {
    expect(detectStudyLangOfReads([ja('窓辺の猫は静かに眠っていた', 0.999)], 'ja', both)).toEqual({ lang: 'ja', evidence: 'kana', decisive: true });
  });

  it('the Chinese head keeping a の of a Japanese sentence decides nothing for Chinese', () => {
    const guess = detectStudyLangOfReads([zh('の猫静眠', 0.992)], 'zh', both);
    expect(guess.decisive).toBe(false);
  });

  it('a Japanese-head read of a Chinese snip, in Japanese forms, is not decisive (the owner\'s 摔了几次 snip)', () => {
    expect(detectStudyLangOfReads([ja('揉几次就放卉学走路\n対!', 0.863)], 'ja', both).decisive).toBe(false);
  });

  it('one kana slip in Han text is not decisive', () => {
    expect(detectStudyLangOfReads([ja('学而肘コ之', 0.728)], 'ja', both).decisive).toBe(false);
  });
});

describe('both heads read kana-less Han text', () => {
  it('a Chinese sentence: Chinese, though the Japanese head wrote 毎 and 歩', () => {
    expect(detectStudyLangOfReads([ja('他毎天早上六点起床跪歩', 0.97), zh('他每天早上六点起床跑步', 0.999)], 'ja', both).lang).toBe('zh');
  });

  it('Traditional Chinese the Japanese head read a little better, in Japanese forms (複雑): still Chinese', () => {
    expect(detectStudyLangOfReads([ja('這個問題比我想像的複雑得多。', 0.951), zh('這個問題比我想像的複雜得多。', 0.949)], 'ja', both).lang).toBe('zh');
    expect(detectStudyLangOfReads([ja('學習中文的時候要多聴多説', 0.955), zh('學習中文的時候要多多。', 0.965)], 'ja', both).lang).toBe('zh');
    expect(detectStudyLangOfReads([ja('謝謝竹門的熱情招待', 0.985), zh('謝謝你們的熱情招待', 0.966)], 'ja', both).lang).toBe('zh');
  });

  it('a kana-less Japanese headline the Japanese head reads clearly better, in Japanese forms: Japanese', () => {
    expect(detectStudyLangOfReads([ja('東京都知事選挙投票率上昇', 0.99), zh('东京都知事选举投票率上升', 0.86)], 'ja', both).lang).toBe('ja');
  });

  it('…but not when either read carries Chinese grammar', () => {
    expect(detectStudyLangOfReads([ja('東京都知事選挙是投票率上昇', 0.99), zh('东京都知事选举是投票率上升', 0.86)], 'ja', both).lang).toBe('zh');
  });

  it('kanji-only Japanese words: the Japanese head reads them far better', () => {
    expect(detectStudyLangOfReads([ja('駅前広場', 1), zh('职前店場', 0.767)], 'ja', both)).toMatchObject({ lang: 'ja', evidence: 'japanese' });
    expect(detectStudyLangOfReads([ja('経済政策', 0.998), zh('释济政策', 0.901)], 'ja', both).lang).toBe('ja');
    // Nothing telling in either read: the better read's text, then the learner's language.
    expect(detectStudyLangOfReads([ja('新幹線', 1), zh('新韩線', 0.84)], 'ja', both).lang).toBe('ja');
    expect(detectStudyLangOfReads([ja('東京大学', 1), zh('東京大学', 0.938)], 'ja', both).lang).toBe('ja');
  });

  it('a kanji-only Japanese word stays Japanese for a learner of Chinese too', () => {
    expect(detectStudyLangOfReads([zh('区書館', 0.788), ja('図書館', 1)], 'zh', ['zh', 'ja']).lang).toBe('ja');
  });

  it('short Chinese: the Chinese head reads it better, in Simplified forms', () => {
    expect(detectStudyLangOfReads([ja('学而肘コ之', 0.728), zh('学而时习之', 0.999)], 'ja', both)).toMatchObject({ lang: 'zh', evidence: 'simplified' });
  });
});

describe('only the Japanese head is installed', () => {
  it('sentence-length text with no hiragana is Chinese, whatever forms the Japanese head wrote', () => {
    expect(detectStudyLangOfReads([ja('揉几次就放卉学走路\n対!', 0.863)], 'ja', ['ja']).lang).toBe('zh');
    expect(detectStudyLangOfReads([ja('清向去火年站想ム走?', 0.847)], 'ja', ['ja']).lang).toBe('zh');
  });

  it('的 or 了 with no hiragana at all is Chinese grammar (办一张昂贵的健身卡 read as カー弘昂的健身ト)', () => {
    expect(detectStudyLangOfReads([ja('カー弘昂的健身ト', 0.753)], 'ja', ['ja']).lang).toBe('zh');
  });

  it('Japanese stays Japanese: kanji words, and kanji with any hiragana', () => {
    expect(detectStudyLangOfReads([ja('図書館', 1)], 'ja', ['ja']).lang).toBe('ja');
    expect(detectStudyLangOfReads([ja('自動販売機', 1)], 'ja', ['ja']).lang).toBe('ja');
    expect(detectStudyLangOfReads([ja('経済的な支援策を発表', 0.97)], 'ja', ['ja']).lang).toBe('ja');
  });

  it('no read at all: the learner\'s language, undecided', () => {
    expect(detectStudyLangOfReads([ja('  ', 0.9)], 'ja', ['ja'])).toEqual({ lang: 'ja', evidence: 'none', decisive: false });
  });
});
