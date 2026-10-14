// @vitest-environment jsdom
/**
 * The Anki manual-card form's placeholders follow the profile's study language
 * (and the Chinese script) and the UI language: they used to be a Japanese
 * word, its kana, an English gloss and a Russian translation for everyone.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';

const env = vi.hoisted(() => ({ script: 'simplified' as 'simplified' | 'traditional' }));
vi.mock('../useStudyLanguage', () => ({
  useStudyLanguage: () => ({ lang: 'ja', script: env.script, tag: 'ja' }),
}));

import { AnkiManualCardForm, type AnkiConfigState } from '../components/anki/AnkiContent';

let host: HTMLDivElement;
let root: Root;

function state(targetLang: 'ja' | 'zh' | 'ru'): AnkiConfigState {
  const noop = () => undefined;
  return {
    deck: 'Mining', model: 'Gum', usingTemplates: false, preview: [], addMsg: null, adding: false,
    active: { id: 'p', label: 'P', targetLang }, term: '', reading: '', translation: '', meaning: '', sentence: '',
    attachImage: false, fetchAudio: false,
    setTerm: noop, setReading: noop, setTranslation: noop, setMeaning: noop, setSentence: noop,
    setAttachImage: noop, setFetchAudio: noop, addCard: noop,
  } as unknown as AnkiConfigState;
}

function placeholders(): string[] {
  return Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[placeholder], textarea[placeholder]'))
    .map((el) => `${el.getAttribute('lang') ?? '-'}:${el.placeholder}`);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  env.script = 'simplified';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('manual-card placeholders', () => {
  it('Japanese: a Japanese example, glossed in the UI language', async () => {
    await act(async () => root.render(<AnkiManualCardForm state={state('ja')} />));
    expect(placeholders()).toEqual([
      'ja:e.g. 勉強',
      'ja:べんきょう',
      `-:${en['srs5.ankiForm.translation.ja']}`,
      `-:${en['srs5.ankiForm.meaning.ja']}`,
      'ja:毎日日本語を勉強します。',
    ]);
  });

  it('Chinese: a Chinese example with pinyin, in the script the learner reads', async () => {
    await act(async () => root.render(<AnkiManualCardForm state={state('zh')} />));
    expect(placeholders()).toEqual([
      'zh-Hans:e.g. 学习',
      'zh-Hans:xuéxí',
      `-:${en['srs5.ankiForm.translation.zh']}`,
      `-:${en['srs5.ankiForm.meaning.zh']}`,
      'zh-Hans:我每天学习中文。',
    ]);
    env.script = 'traditional';
    await act(async () => root.render(<AnkiManualCardForm state={state('zh')} />));
    expect(placeholders()[0]).toBe('zh-Hant:e.g. 學習');
  });

  it('Russian: a Russian example with its stress marked', async () => {
    await act(async () => root.render(<AnkiManualCardForm state={state('ru')} />));
    expect(placeholders()).toEqual([
      'ru:e.g. учиться',
      'ru:учи́ться',
      `-:${en['srs5.ankiForm.translation.ru']}`,
      `-:${en['srs5.ankiForm.meaning.ru']}`,
      'ru:Я каждый день учусь в библиотеке.',
    ]);
  });
});
