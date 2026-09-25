import { describe, expect, it } from 'vitest';
import type { SubtitleRecord } from '../subtitleRecord';
import {
  pickHelperSubtitle,
  pickStudySubtitle,
  pickSubtitlePair,
  studyFirstDownloadLanguages,
  subtitleBaseLang,
  subtitleChineseScript,
  subtitleLangMatches,
} from '../subtitleDiscoveryPick';

const rec = (over: Partial<SubtitleRecord>): SubtitleRecord => ({
  id: 'r', lang: 'ja', source: 'provider', format: 'srt', path: 'p', addedAt: 1, ...over,
});

describe('subtitleLangMatches', () => {
  it('compares base languages', () => {
    expect(subtitleLangMatches('ja-JP', 'ja')).toBe(true);
    expect(subtitleLangMatches('en', 'ja')).toBe(false);
    expect(subtitleLangMatches(undefined, 'ja')).toBe(false);
  });
});

describe('subtitle language tags across the three study languages', () => {
  it('reads ISO 639-2 and file-name tags as their language', () => {
    expect(subtitleBaseLang('jpn')).toBe('ja');
    expect(subtitleBaseLang('rus')).toBe('ru');
    expect(subtitleBaseLang('chs')).toBe('zh');
    expect(subtitleBaseLang('cht')).toBe('zh');
    expect(subtitleBaseLang('zh-Hant')).toBe('zh');
    expect(subtitleLangMatches('jpn', 'ja')).toBe(true);
    expect(subtitleLangMatches('chs', 'zh-Hans')).toBe(true);
    expect(subtitleLangMatches('ru-RU', 'ja')).toBe(false);
  });

  it('knows the Chinese script of a tag, and only of a Chinese one', () => {
    expect(subtitleChineseScript('zh-Hans')).toBe('hans');
    expect(subtitleChineseScript('zh-CN')).toBe('hans');
    expect(subtitleChineseScript('chs')).toBe('hans');
    expect(subtitleChineseScript('zh-TW')).toBe('hant');
    expect(subtitleChineseScript('cht')).toBe('hant');
    expect(subtitleChineseScript('zh')).toBeNull();
    expect(subtitleChineseScript('ja')).toBeNull();
  });

  it("picks the study language's track for ja, zh and ru", () => {
    const records = [
      rec({ id: 'ja', lang: 'jpn' }),
      rec({ id: 'zh', lang: 'zh' }),
      rec({ id: 'ru', lang: 'rus' }),
      rec({ id: 'en', lang: 'en', source: 'embedded' }),
    ];
    expect(pickStudySubtitle(records, 'ja')?.id).toBe('ja');
    expect(pickStudySubtitle(records, 'zh-Hans')?.id).toBe('zh');
    expect(pickStudySubtitle(records, 'ru')?.id).toBe('ru');
  });

  it("orders Chinese tracks by the learner's script before provenance", () => {
    const records = [
      rec({ id: 'sc', lang: 'zh-hans', source: 'embedded' }),
      rec({ id: 'tc', lang: 'cht', source: 'provider' }),
      rec({ id: 'bare', lang: 'zh', source: 'sidecar' }),
    ];
    expect(pickStudySubtitle(records, 'zh-Hant')?.id).toBe('tc');
    expect(pickStudySubtitle(records, 'zh-Hans')?.id).toBe('sc');
    // No script preference: provenance decides, as before.
    expect(pickStudySubtitle(records, 'zh')?.id).toBe('sc');
  });
});

describe('studyFirstDownloadLanguages', () => {
  it('puts the study language first and drops the previous study language', () => {
    expect(studyFirstDownloadLanguages(['ja', 'en'], 'zh', { previousStudy: 'ja', helperLanguage: 'en' })).toEqual(['zh', 'en']);
    expect(studyFirstDownloadLanguages(['en', 'ru'], 'ru', {})).toEqual(['ru', 'en']);
    expect(studyFirstDownloadLanguages(['ja'], 'ru', { previousStudy: 'ja' })).toEqual(['ru']);
  });

  it('keeps the previous study language when it is also the helper language', () => {
    expect(studyFirstDownloadLanguages(['ja', 'en'], 'zh', { previousStudy: 'ja', helperLanguage: 'ja' })).toEqual(['zh', 'ja', 'en']);
  });
});

describe('pickStudySubtitle', () => {
  it('orders generated tracks: fusion, then Whisper, then machine translation', () => {
    const records = [
      rec({ id: 'mt', source: 'generated', derivation: 'machine-translation', machineGenerated: true }),
      rec({ id: 'whisper', source: 'generated', derivation: 'whisper', machineGenerated: true }),
      rec({ id: 'fused', source: 'generated', derivation: 'en-ja-fusion', machineGenerated: true }),
    ];
    expect(pickStudySubtitle(records)?.id).toBe('fused');
    expect(pickStudySubtitle(records.filter((r) => r.id !== 'fused'))?.id).toBe('whisper');
  });

  it('puts any human track ahead of every generated one', () => {
    expect(pickStudySubtitle([
      rec({ id: 'fused', source: 'generated', derivation: 'en-ja-fusion', confidence: 99 }),
      rec({ id: 'dl', source: 'provider', confidence: 71 }),
    ])?.id).toBe('dl');
  });

  it('honours the user\'s choice over everything', () => {
    const records = [rec({ id: 'emb', source: 'embedded' }), rec({ id: 'mt', source: 'generated', derivation: 'machine-translation' })];
    expect(pickStudySubtitle(records, 'ja', 'mt')?.id).toBe('mt');
  });
});

describe('pickHelperSubtitle', () => {
  it('takes a human track over a machine translation', () => {
    expect(pickHelperSubtitle([
      rec({ id: 'mt', lang: 'en', source: 'generated', derivation: 'machine-translation', machineGenerated: true }),
      rec({ id: 'os', lang: 'en', source: 'provider', confidence: 72 }),
    ], 'en')?.id).toBe('os');
  });

  it('takes a clean track over a hearing-impaired or signs-only one', () => {
    expect(pickHelperSubtitle([
      rec({ id: 'hi', lang: 'en', source: 'embedded', hearingImpaired: true }),
      rec({ id: 'clean', lang: 'en', source: 'provider' }),
    ], 'en')?.id).toBe('clean');
    expect(pickHelperSubtitle([
      rec({ id: 'signs', lang: 'en', source: 'embedded', label: 'English (Signs & Songs)' }),
      rec({ id: 'full', lang: 'en', source: 'provider' }),
    ], 'en')?.id).toBe('full');
  });

  it('is null without a helper language or a matching track', () => {
    expect(pickHelperSubtitle([rec({ lang: 'en' })], null)).toBeNull();
    expect(pickHelperSubtitle([rec({ lang: 'ja' })], 'en')).toBeNull();
  });
});

describe('pickSubtitlePair', () => {
  it('gives the study line Japanese and the helper line English', () => {
    const pair = pickSubtitlePair([
      rec({ id: 'en', lang: 'en', source: 'embedded' }),
      rec({ id: 'ja', lang: 'ja', source: 'provider', providerId: 'jimaku' }),
    ], 'ja', 'en');
    expect(pair.primary?.id).toBe('ja');
    expect(pair.secondary?.id).toBe('en');
  });

  it('never returns the same track for both lines', () => {
    // No Japanese: English is the primary, and there is no second English track.
    const pair = pickSubtitlePair([rec({ id: 'en', lang: 'en' })], 'ja', 'en');
    expect(pair.primary?.id).toBe('en');
    expect(pair.secondary).toBeNull();
  });

  it('respects a chosen English primary by not repeating English underneath', () => {
    const pair = pickSubtitlePair([
      rec({ id: 'ja', lang: 'ja' }),
      rec({ id: 'en1', lang: 'en' }),
      rec({ id: 'en2', lang: 'en', source: 'embedded' }),
    ], 'ja', 'en', 'en1');
    expect(pair.primary?.id).toBe('en1');
    expect(pair.secondary).toBeNull();
  });
});
