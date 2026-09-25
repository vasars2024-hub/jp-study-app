// @vitest-environment jsdom
//
// Study-language parity in the renderer: surfaces that name or tag the study
// line follow the language being studied (Japanese, Chinese, Russian), never a
// hard-coded Japanese. Pure functions are exercised for each of ja / zh / ru.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { langNames } from '../components/media/gum/GumTitlePage';
import { setChineseScript, setStudyLang } from '../studyEnvironment';
import { useStudyLanguage, type StudyLanguageInfo } from '../useStudyLanguage';
import SubtitleCueLine from '../components/SubtitleCueLine';
import { lookupLangForText, resolveWordSpanInText } from '../wordLookup';
import { __clearReadingAidCacheForTests } from '../readingAid';
import { studyReadingLine } from '../../media/VideoCoreTranscriptPanel';
import { segmentStudyText } from '../../shared/studySegmentation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = (key: string, vars?: Record<string, string | number>): string =>
  (key === 'gum.subs.en' ? 'English' : key === 'gum.subs.translated' ? `${vars?.lang} (translated)` : key);

const item = (langs: string[]): MediaItem => ({
  id: 'e1',
  title: 'Show',
  fileName: 'e1.mkv',
  path: 'C:/e1.mkv',
  addedAt: 1,
  subtitles: langs.map((lang, i) => ({
    id: `s${i}`, lang, source: 'provider', format: 'srt', path: `p${i}`, addedAt: 1,
  })),
}) as MediaItem;

beforeEach(() => {
  localStorage.clear();
});

describe('Gum title page names the study line in the study language', () => {
  it('ja / zh / ru each name their own autonym from the records', () => {
    const episode = item(['jpn', 'zh-Hant', 'rus', 'en']);
    expect(langNames(t, episode, undefined, 'ja')).toBe('日本語 + English');
    expect(langNames(t, episode, undefined, 'zh')).toBe('中文 + English');
    expect(langNames(t, episode, undefined, 'ru')).toBe('Русский + English');
  });

  it('a Chinese learner with only a Japanese track is not told it has a study line', () => {
    expect(langNames(t, item(['ja', 'en']), undefined, 'zh')).toBe('English');
  });

  it('the automation status (whose `ja` field is the study line) is labelled by the study language', () => {
    const status = {
      ja: 'generated', en: 'found', helperLang: 'en', notice: null,
      source: { ja: 'machine-translation', en: 'opensubtitles' },
      machineTranslated: { ja: true, en: false },
    } as unknown as Parameters<typeof langNames>[2];
    expect(langNames(t, item([]), status, 'ru')).toBe('Русский (translated) + English');
  });
});

describe('useStudyLanguage', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
  });

  it('follows a switch and carries the zh-Hans / zh-Hant tag', () => {
    const seen: StudyLanguageInfo[] = [];
    function Probe(): null {
      seen.push(useStudyLanguage());
      return null;
    }
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(createElement(Probe)));
    expect(seen.at(-1)).toMatchObject({ lang: 'ja', tag: 'ja' });
    act(() => setStudyLang('zh'));
    expect(seen.at(-1)).toMatchObject({ lang: 'zh', tag: 'zh-Hans' });
    act(() => setChineseScript('traditional'));
    expect(seen.at(-1)).toMatchObject({ lang: 'zh', script: 'traditional', tag: 'zh-Hant' });
    act(() => setStudyLang('ru'));
    expect(seen.at(-1)).toMatchObject({ lang: 'ru', tag: 'ru' });
  });
});

describe('click lookup resolves a word in every study language', () => {
  it('a Russian word resolves to the whole word (it used to resolve to nothing)', () => {
    const line = 'Я видела кошку в парке.';
    expect(resolveWordSpanInText(line, line.indexOf('шк'))?.query).toBe('кошку');
    expect(resolveWordSpanInText(line, line.indexOf('парке') + 4)?.query).toBe('парке');
    expect(lookupLangForText(line)).toBe('ru');
  });

  it('a Chinese line is split by Chinese words when Chinese is studied', () => {
    setStudyLang('zh');
    const line = '我在公园里看到了一只猫';
    expect(lookupLangForText(line)).toBe('zh-Hans');
    expect(resolveWordSpanInText(line, line.indexOf('园'))?.query).toBe('公园');
    setChineseScript('traditional');
    expect(lookupLangForText('公園')).toBe('zh-Hant');
  });

  it('Han text stays Japanese for a Japanese learner, and kana always is', () => {
    setStudyLang('ja');
    expect(lookupLangForText('公園')).toBe('ja');
    setStudyLang('zh');
    expect(lookupLangForText('公園に行く')).toBe('ja');
  });
});

describe('the subtitle line draws the study language, with its reading aid', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const asked: { lang: string; words: string[] }[] = [];

  beforeEach(() => {
    __clearReadingAidCacheForTests();
    asked.length = 0;
    (window as unknown as { api: unknown }).api = {
      setStudyLanguage: () => undefined,
      readingAid: async (lang: string, words: string[]) => {
        asked.push({ lang, words });
        if (lang === 'zh') return { 今天: ['jīn', 'tiān'], 天气: ['tiān', 'qì'] };
        return { книги: ['кни\u0301ги'] };
      },
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
  });

  it('Chinese: lang zh-Hans, pinyin ruby per character, and the word as written to look up', async () => {
    setStudyLang('zh');
    await act(async () => {
      root?.render(createElement(SubtitleCueLine, { text: '今天天气很好', furigana: true, lang: 'zh' }));
    });
    await act(async () => { await Promise.resolve(); });
    const line = host?.firstElementChild as HTMLElement;
    expect(line.getAttribute('lang')).toBe('zh-Hans');
    expect(line.getAttribute('data-lookup-text')).toBe('今天天气很好');
    expect(asked[0]?.lang).toBe('zh');
    const today = line.querySelector('[data-surface="今天"]');
    expect(today?.querySelectorAll('rt')).toHaveLength(2);
    expect(today?.querySelector('rt')?.textContent).toBe('jīn');
    // No kana anywhere: kuromoji never touched the Chinese line.
    expect(line.textContent).not.toMatch(/[ぁ-ゖ]/);
  });

  it('Russian: stress marks on the words, off when the aid is off', async () => {
    setStudyLang('ru');
    await act(async () => {
      root?.render(createElement(SubtitleCueLine, { text: 'Две книги', furigana: true, lang: 'ru' }));
    });
    await act(async () => { await Promise.resolve(); });
    const line = host?.firstElementChild as HTMLElement;
    expect(line.getAttribute('lang')).toBe('ru');
    expect(line.querySelector('[data-surface="книги"]')?.textContent).toBe('кни\u0301ги');
    await act(async () => {
      root?.render(createElement(SubtitleCueLine, { text: 'Две книги', furigana: false, lang: 'ru' }));
    });
    expect(line.querySelector('[data-surface="книги"]')?.textContent).toBe('книги');
  });
});

describe('the transcript rail reading line', () => {
  it('Chinese: pinyin word by word; Russian: the line with its stress', () => {
    const zh = segmentStudyText('今天天气', 'zh-Hans');
    expect(studyReadingLine(zh, 'zh', { 今天: ['jīn', 'tiān'], 天气: ['tiān', 'qì'] })).toBe('jīntiān tiānqì');
    const ru = segmentStudyText('Две книги.', 'ru');
    expect(studyReadingLine(ru, 'ru', { книги: ['кни' + String.fromCharCode(0x301) + 'ги'] }))
      .toBe('Две кни' + String.fromCharCode(0x301) + 'ги.');
  });
});

describe('Grammar opens on the study language', () => {
  it('a learner with no saved filters sees their language first; Russian points exist and filter', async () => {
    const { loadPracticeFilters, filterGrammarPoints, EXPLORER_FILTERS_KEY } = await import('../data/grammar/practiceFilters');
    const { GRAMMAR } = await import('../data/grammar');
    localStorage.clear();
    setStudyLang('ru');
    const filters = loadPracticeFilters();
    expect(filters.lang).toBe('ru');
    expect(loadPracticeFilters(EXPLORER_FILTERS_KEY).lang).toBe('ru');
    const shown = filterGrammarPoints(GRAMMAR, { ...filters, levels: ['A1'] });
    expect(shown.length).toBeGreaterThan(10);
    expect(shown.every((p) => p.lang === 'ru')).toBe(true);
    setStudyLang('zh');
    expect(loadPracticeFilters().lang).toBe('zh');
  });
});

describe('content tags follow the content language', () => {
  it('a grammar point, a card and a clipboard line get their own language tag', async () => {
    const { contentLangOf, cardContentLang, textContentLang } = await import('../studyEnvironment');
    localStorage.clear();
    setStudyLang('ja');
    expect(contentLangOf('zh')).toBe('zh-Hans');
    expect(contentLangOf('ru')).toBe('ru');
    expect(contentLangOf(undefined)).toBe('ja');
    expect(cardContentLang({ studyLang: 'ru' })).toBe('ru');
    expect(cardContentLang({})).toBe('ja');
    expect(textContentLang('Привет')).toBe('ru');
    setChineseScript('traditional');
    expect(contentLangOf('zh')).toBe('zh-Hant');
  });
});
