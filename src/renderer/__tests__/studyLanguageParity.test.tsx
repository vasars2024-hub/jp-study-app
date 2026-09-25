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
