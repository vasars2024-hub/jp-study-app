// The study-language matrix: every key language decision, asked once for each
// of Japanese, Chinese (Simplified and Traditional) and Russian. A new feature
// that answers one of these for Japanese only fails here, in one place, rather
// than in a screenshot of a Chinese learner's app.
import { describe, expect, it } from 'vitest';
import { pickStudySubtitle, studyFirstDownloadLanguages, subtitleLangMatches } from '../subtitleDiscoveryPick';
import { segmentStudyText, studyWordKey } from '../studySegmentation';
import { pinyinRubyPairs, stressedRussian } from '../readingAid';
import { studyLangFromTag, studyLangOfText, studyLangTag, STUDY_LANGS, type StudyLang } from '../studyLang';
import { buildVideoCoreMineRequest, createVideoCoreMiningDraft } from '../videoCoreMining';
import { bookOcrEngine, bookOcrWebAssets } from '../bookOcrIpc';
import { subtitleFontStackFor } from '../videoCoreStudy';
import { decideAudioIsLanguage } from '../subtitleDiscoveryStatus';
import { profileForLanguage } from '../profileRules';
import { passageInStudyLang } from '../filesApp/mining';
import type { SubtitleRecord } from '../subtitleRecord';
import type { VideoCoreStudyCue } from '../videoCoreStudy';

const SAMPLE: Record<StudyLang, { line: string; word: string; track: string }> = {
  ja: { line: '猫が窓の外を見ている。', word: '猫', track: 'jpn' },
  zh: { line: '今天天气很好。', word: '天气', track: 'chi' },
  ru: { line: 'Я вижу кошку.', word: 'кошку', track: 'rus' },
};

const rec = (id: string, lang: string): SubtitleRecord => ({
  id, lang, source: 'provider', format: 'srt', path: id, addedAt: 1,
} as SubtitleRecord);

describe.each(STUDY_LANGS)('study language %s', (lang) => {
  const sample = SAMPLE[lang];

  it('tags: its content tag and its subtitle tags map back to it', () => {
    expect(studyLangFromTag(studyLangTag(lang))).toBe(lang);
    expect(studyLangFromTag(sample.track)).toBe(lang);
    expect(subtitleLangMatches(sample.track, studyLangTag(lang))).toBe(true);
  });

  it('track pick: its own track is the study line, and the download list starts with it', () => {
    const records = STUDY_LANGS.map((code) => rec(code, SAMPLE[code].track));
    expect(pickStudySubtitle(records, studyLangTag(lang))?.id).toBe(lang);
    expect(studyFirstDownloadLanguages(['ja', 'en'], lang, { previousStudy: 'ja', helperLanguage: 'en' })[0]).toBe(lang);
  });

  it('text: its sample line is recognised as it, and splits into words', () => {
    expect(studyLangOfText(sample.line, lang)).toBe(lang);
    const words = segmentStudyText(sample.line, studyLangTag(lang)).filter((part) => part.wordLike).map((part) => part.text);
    expect(words).toContain(sample.word);
    expect(studyWordKey(sample.word, lang)).toBeTruthy();
  });

  it('mining: a line mined from its track is routed as it', () => {
    const cue = { index: 1, trackNumber: 1, text: sample.line, startMs: 0, endMs: 1 } as VideoCoreStudyCue;
    const draft = createVideoCoreMiningDraft(cue, sample.line, { playbackId: 'p', playbackType: 'l', streamType: 'f' }, 1, '', lang);
    expect(buildVideoCoreMineRequest(draft).route?.language).toBe(lang);
    expect(passageInStudyLang(sample.line, lang)).toBe(true);
    expect(profileForLanguage([{ id: 'a', targetLang: 'ja' }, { id: 'b', targetLang: 'zh' }, { id: 'c', targetLang: 'ru' }], lang, 'a'))
      .toBe({ ja: 'a', zh: 'b', ru: 'c' }[lang]);
  });

  it('OCR: a book in it needs its own recognizer; manga-ocr only ever serves Japanese', () => {
    expect(bookOcrWebAssets(lang)).toContain(`paddle-ocr-${lang}`);
    const everything = (id: string): boolean => id.length > 0;
    expect(bookOcrEngine(everything, lang)).toBe('auto');
    const mangaOnly = (id: string): boolean => id.startsWith('manga') || id === 'comic-text-detector';
    expect(bookOcrEngine(mangaOnly, lang)).toBe(lang === 'ja' ? 'manga' : null);
  });

  it('audio: its own stream tag says the audio is in it', () => {
    expect(decideAudioIsLanguage({ streamLanguages: [sample.track] }, lang)).toBe('match');
  });

  it('fonts: the user typeface choice has faces for it', () => {
    expect(subtitleFontStackFor('mincho', studyLangTag(lang))).toBeTruthy();
  });
});

describe('reading aids', () => {
  it('Chinese pinyin pairs per character; Russian stress on the written word; both scripts of Chinese tagged', () => {
    expect(pinyinRubyPairs('天气', ['tiān', 'qì']).map((pair) => pair.rt)).toEqual(['tiān', 'qì']);
    expect(stressedRussian('Кошку', ['ко\u0301шку'])).toBe('Ко\u0301шку');
    expect(studyLangTag('zh', 'simplified')).toBe('zh-Hans');
    expect(studyLangTag('zh', 'traditional')).toBe('zh-Hant');
  });
});
