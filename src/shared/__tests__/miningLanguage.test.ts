// A mined card keeps the language it was mined in — Japanese, Chinese or
// Russian — from the surface that mined it to the Anki profile it is routed to.
import { describe, expect, it } from 'vitest';
import { studyLangOfText } from '../studyLang';
import { buildVideoCoreMineRequest, createVideoCoreMiningDraft } from '../videoCoreMining';
import { buildFilesMineDrafts, buildFilesMineNoteRequest, passageInStudyLang } from '../filesApp/mining';
import type { FilesItem } from '../filesApp/catalog';
import { buildRouteContext, profileForLanguage } from '../profileRules';
import type { VideoCoreStudyCue } from '../videoCoreStudy';

const cue = (text: string): VideoCoreStudyCue => ({
  index: 1, trackNumber: 1, text, startMs: 0, endMs: 1000,
} as VideoCoreStudyCue);
const source = { playbackId: 'p', playbackType: 'local', streamType: 'file' };

describe('studyLangOfText', () => {
  it('reads the script, and leaves bare Han to the study language', () => {
    expect(studyLangOfText('猫が寝ている', 'zh')).toBe('ja');
    expect(studyLangOfText('Я видела кошку', 'ja')).toBe('ru');
    expect(studyLangOfText('今天天气很好', 'zh')).toBe('zh');
    expect(studyLangOfText('猫', 'ja')).toBe('ja');
    expect(studyLangOfText('hello', 'ru')).toBe('ru');
  });
});

describe('player mining', () => {
  it('routes the note by the line\'s language, not a hard-coded Japanese', () => {
    const zh = createVideoCoreMiningDraft(cue('今天天气很好'), '今天天气很好', source, 1, '', 'zh');
    expect(buildVideoCoreMineRequest(zh).route?.language).toBe('zh');
    const ru = createVideoCoreMiningDraft(cue('Две книги'), 'Две книги', source, 1, '', 'ru');
    expect(buildVideoCoreMineRequest(ru).route?.language).toBe('ru');
    // A draft kept from before the field existed was Japanese.
    const legacy = createVideoCoreMiningDraft(cue('猫'), '猫', source, 1);
    expect(buildVideoCoreMineRequest(legacy).route?.language).toBe('ja');
  });
});

describe('Files mining', () => {
  const book = {
    id: 'book:1', name: 'Book', kind: 'book', categoryId: 'books', provenance: 'epub', source: 'library',
    sizeBytes: 1, createdAt: null, modifiedAt: null, location: { store: 'file', path: 'C:/b.epub' }, flags: {},
  } as unknown as FilesItem;
  const passages = [
    { index: 0, text: 'Глава первая' },
    { index: 1, text: '今天天气很好' },
    { index: 2, text: 'Chapter 1' },
  ];

  it('mines the study language\'s passages: a Russian book is not "without Japanese"', () => {
    const plan = buildFilesMineDrafts(book, passages, { lang: 'ru' });
    expect(plan.drafts.map((draft) => draft.sentence)).toEqual(['Глава первая']);
    expect(plan.drafts[0].studyLang).toBe('ru');
    expect(buildFilesMineNoteRequest(plan.drafts[0]).route?.language).toBe('ru');
    expect(buildFilesMineDrafts(book, passages, { lang: 'zh' }).drafts.map((draft) => draft.sentence)).toEqual(['今天天气很好']);
  });

  it('knows each language\'s text', () => {
    expect(passageInStudyLang('こんにちは', 'ja')).toBe(true);
    expect(passageInStudyLang('Привет', 'ja')).toBe(false);
    expect(passageInStudyLang('Привет', 'ru')).toBe(true);
    expect(passageInStudyLang('你好', 'zh')).toBe(true);
  });
});

describe('Anki routing by language', () => {
  const profiles = [
    { id: 'jp', targetLang: 'ja' },
    { id: 'cn', targetLang: 'zh' },
    { id: 'ru', targetLang: 'ru' },
  ];

  it('with no matching rule, a card goes to a profile that studies its language', () => {
    expect(profileForLanguage(profiles, 'zh', 'jp')).toBe('cn');
    expect(profileForLanguage(profiles, 'ru', 'jp')).toBe('ru');
    expect(profileForLanguage(profiles, 'ja', 'jp')).toBe('jp');
    expect(profileForLanguage(profiles, 'unknown', 'jp')).toBe('jp');
    expect(profileForLanguage([{ id: 'jp', targetLang: 'ja' }], 'ru', 'jp')).toBe('jp');
  });

  it('an explicit route language beats the character guess (猫 is not Chinese for a Japanese card)', () => {
    expect(buildRouteContext({ language: 'ja' }, { text: '猫' }).language).toBe('ja');
    expect(buildRouteContext(undefined, { text: '猫' }).language).toBe('zh');
  });
});
