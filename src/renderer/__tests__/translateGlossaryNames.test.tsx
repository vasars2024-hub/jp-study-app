// @vitest-environment jsdom
/**
 * Names in the passage are offered as glossary terms, so a character keeps one
 * spelling across every sentence and engine: from the tokenizer's proper-noun
 * tags, romanized from the dictionary reading, one click to keep, one to edit.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../tokenizer', () => ({
  getTokenizer: async () => undefined,
  tokenizerReady: () => true,
  tokenizeSync: () => [
    { surface: '春香', reading: 'ハルカ', proper: true },
    { surface: 'は', reading: 'ハ', proper: false },
    { surface: '猫', reading: 'ネコ', proper: false },
  ],
}));
vi.mock('../flashcardDeck', () => ({ loadDeck: () => [] }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key) }) }));

import { TranslateGlossaryPanel } from '../components/translate/TranslateGlossaryPanel';
import { loadTranslateGlossary } from '../translateGlossaryStore';

let root: Root;
let host: HTMLDivElement;

async function mount(source = 'ja', target = 'en'): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<TranslateGlossaryPanel source={source} target={target} passage="春香は猫が好き。" />));
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe('name suggestions in the glossary', () => {
  it('offers the passage\'s names, keeps one on a click, and stops offering it', async () => {
    await mount();
    const section = host.querySelector('.xlate2-glossary-names');
    expect(section?.textContent).toContain('春香');
    expect(section?.textContent).toContain('Haruka');
    expect(section?.textContent).not.toContain('猫');

    const add = [...section!.querySelectorAll('button')].find((b) => b.textContent === 'xlate2.glossary.useSuggestion')!;
    await act(async () => add.click());
    for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
    expect(loadTranslateGlossary()).toEqual([
      expect.objectContaining({ source: '春香', target: 'Haruka', sourceLang: 'ja', targetLang: 'en' }),
    ]);
    expect(host.querySelector('.xlate2-glossary-names')).toBeNull();
  });

  it('puts a name into the form to fix its spelling before saving', async () => {
    await mount();
    const edit = [...host.querySelectorAll<HTMLButtonElement>('.xlate2-glossary-names button')]
      .find((b) => b.textContent === 'xlate2.glossary.edit')!;
    await act(async () => edit.click());
    const inputs = host.querySelectorAll<HTMLInputElement>('.xlate2-glossary-form input[type="text"]');
    expect(inputs[0].value).toBe('春香');
    expect(inputs[1].value).toBe('Haruka');
  });

  it('offers nothing for a target the romanization does not fit', async () => {
    await mount('ja', 'ru');
    expect(host.querySelector('.xlate2-glossary-names')).toBeNull();
  });
});
