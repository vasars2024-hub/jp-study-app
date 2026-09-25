// @vitest-environment jsdom
//
// Counting and colouring words in Chinese and Russian text: ICU words instead
// of kuromoji, and a Russian form recognised by the dictionary form the learner
// graded.
import { beforeEach, describe, expect, it } from 'vitest';
import { knownKeyFor, studyTokens, studyTokensReady } from '../studyTokens';
import { setStudyLang } from '../studyEnvironment';
import { highlightEl } from '../wordHighlight';
import { scoreTextComprehensibility } from '../comprehensibility';
import { setLevel } from '../knownWords';

beforeEach(() => {
  localStorage.clear();
  (window as unknown as { api: unknown }).api = { setStudyLanguage: () => undefined };
});

describe('studyTokens', () => {
  it('Chinese: words, not characters, and punctuation is not vocabulary', () => {
    const tokens = studyTokens('今天天气很好。', 'zh');
    expect(tokens.filter((t) => t.content).map((t) => t.surface)).toEqual(['今天', '天气', '很好']);
    expect(studyTokensReady('zh')).toBe(true);
  });

  it('Russian: a form is keyed by the dictionary form the learner knows', () => {
    const levels: Record<string, number> = { книга: 3 };
    expect(knownKeyFor('Книги', 'ru', (key) => levels[key] ?? 0)).toBe('книга');
    // Nothing graded yet: the stem, shared by every form.
    expect(knownKeyFor('кошку', 'ru', () => 0)).toBe(knownKeyFor('кошкой', 'ru', () => 0));
  });
});

describe('the reader highlight and the comprehensibility score in Russian', () => {
  it('colours Cyrillic words by knowledge (it used to skip every non-Japanese text node)', () => {
    setStudyLang('ru');
    setLevel('книга', 3);
    const root = document.createElement('p');
    root.textContent = 'Это книга, а там книги и кошка.';
    document.body.appendChild(root);
    highlightEl(root, true);
    const spans = [...root.querySelectorAll<HTMLElement>('span.wk')];
    expect(spans.map((span) => span.textContent)).toContain('книги');
    const knigi = spans.find((span) => span.textContent === 'книги');
    expect(knigi?.getAttribute('data-lemma')).toBe('книга');
    expect(knigi?.className).toContain('wk-3');
    expect(spans.find((span) => span.textContent === 'кошка')?.className).toContain('wk-0');
    root.remove();
  });

  it('scores Russian text by its words', async () => {
    setStudyLang('ru');
    setLevel('книга', 3);
    const score = await scoreTextComprehensibility('книга книги кошка', undefined, 'ru');
    expect(score.totalWords).toBe(3);
    expect(score.knownWords).toBe(2);
  });
});

describe('Game Arena content follows the study language', () => {
  it('deals only the study language cards, and finds a Russian form in its sentence', async () => {
    const { addDeckCardsTracked } = await import('../flashcardDeck');
    const { loadArenaContent, surfaceInSentence } = await import('../games/contentStore');
    localStorage.clear();
    addDeckCardsTracked([
      { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub', sentence: '猫が好き。' },
      { word: 'книга', reading: '', meaning: 'book', source: 'epub', sentence: 'Я читаю книгу.', studyLang: 'ru' },
    ]);
    setStudyLang('ru');
    const content = loadArenaContent('beginner' as never);
    expect(content.sentences.map((card) => card.word)).toEqual(['книга']);
    expect(surfaceInSentence('Я читаю книгу.', 'книга')).toBe('книгу');
  });
});
