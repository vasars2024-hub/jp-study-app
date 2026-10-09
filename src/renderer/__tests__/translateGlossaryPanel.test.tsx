// @vitest-environment jsdom
/**
 * The workbench glossary editor: add, edit, remove, and accept a suggestion
 * mined from the deck — with the store being the real localStorage store.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key), lang: 'en' }) }));
vi.mock('../flashcardDeck', () => ({
  loadDeck: () => [
    { word: '先輩', meaning: 'senior; elder' },
    { word: '図書館', meaning: 'library' },
  ],
}));

import { TranslateGlossaryPanel } from '../components/translate/TranslateGlossaryPanel';
import { loadTranslateGlossary } from '../translateGlossaryStore';

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<TranslateGlossaryPanel source="ja" target="en" passage="先輩と図書館に行った。" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function buttonsNamed(prefix: string): HTMLButtonElement[] {
  return [...host.querySelectorAll('button')].filter((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').startsWith(prefix));
}

describe('glossary panel', () => {
  it('adds a term for this pair from the form, with labelled fields', async () => {
    const [term, rendering] = [...host.querySelectorAll('input[type="text"]')] as HTMLInputElement[];
    expect(host.querySelector(`label[for="${term.id}"]`)).not.toBeNull();
    await act(async () => {
      setValue(term, '東京');
      setValue(rendering, 'Tokyo');
    });
    await act(async () => (host.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(loadTranslateGlossary()).toMatchObject([{ source: '東京', target: 'Tokyo', sourceLang: 'ja', targetLang: 'en' }]);
    expect(host.textContent).toContain('xlate2.glossary.saved');
    expect(host.querySelector('.xlate2-glossary-list')?.textContent).toContain('Tokyo');
  });

  it('suggests deck words found in the passage and adds one on click, marked as from the deck', async () => {
    expect(host.textContent).toContain('xlate2.glossary.suggestTitle{"count":2}');
    const add = buttonsNamed('xlate2.glossary.useSuggestion — 先輩')[0];
    await act(async () => add.click());
    expect(loadTranslateGlossary()).toMatchObject([{ source: '先輩', target: 'senior', origin: 'deck' }]);
    // Accepted suggestions stop being suggested.
    expect(host.textContent).toContain('xlate2.glossary.suggestTitle{"count":1}');
  });

  it('edit loads a term into the form; remove deletes it', async () => {
    const add = buttonsNamed('xlate2.glossary.useSuggestion — 図書館')[0];
    await act(async () => add.click());
    await act(async () => buttonsNamed('xlate2.glossary.edit — 図書館')[0].click());
    const [term, rendering] = [...host.querySelectorAll('input[type="text"]')] as HTMLInputElement[];
    expect(term.value).toBe('図書館');
    expect(rendering.value).toBe('library');
    await act(async () => buttonsNamed('common.remove — 図書館')[0].click());
    expect(loadTranslateGlossary()).toEqual([]);
  });
});
