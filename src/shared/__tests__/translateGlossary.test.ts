// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_GLOSSARY_TERMS_PER_REQUEST,
  applyGlossaryPostEdit,
  glossaryCoverage,
  glossaryTermsForText,
  mergeGlossaryHints,
  normalizeTranslateGlossary,
  protectGlossaryForDeepl,
  removeGlossaryEntry,
  sanitizeGlossaryTerms,
  suggestGlossaryFromDeck,
  unprotectDeeplOutput,
  upsertGlossaryEntry,
  type TranslateGlossaryEntry,
} from '../translateGlossary';

const entry = (id: string, source: string, target: string, extra: Partial<TranslateGlossaryEntry> = {}): TranslateGlossaryEntry => ({
  id, source, target, addedAt: 1, ...extra,
});

describe('sanitizing', () => {
  it('bounds and cleans terms that crossed IPC', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ source: `語${i}`, target: `w${i}` }));
    expect(sanitizeGlossaryTerms(many)).toHaveLength(MAX_GLOSSARY_TERMS_PER_REQUEST);
    expect(sanitizeGlossaryTerms([
      { source: ' 先輩 ', target: 'senpai\n' },
      { source: '先輩', target: 'again' },
      { source: 'x', target: 'x' },
      { source: 'a'.repeat(81), target: 'long' },
      null,
      'str',
    ])).toEqual([{ source: '先輩', target: 'senpai' }]);
    expect(sanitizeGlossaryTerms('nope')).toEqual([]);
  });

  it('normalizes the stored list, dropping rows it cannot trust', () => {
    expect(normalizeTranslateGlossary([
      { id: 'a', source: '猫', target: 'cat', sourceLang: 'ja', targetLang: 'EN', addedAt: 3, origin: 'deck' },
      { id: 'a', source: '犬', target: 'dog' },
      { source: '鳥', target: 'bird' },
    ])).toEqual([{ id: 'a', source: '猫', target: 'cat', sourceLang: 'ja', addedAt: 3, origin: 'deck' }]);
  });
});

describe('matching a passage', () => {
  const entries = [
    entry('1', '東京', 'Tokyo'),
    entry('2', '東京大学', 'the University of Tokyo'),
    entry('3', '先輩', 'senpai', { sourceLang: 'ja', targetLang: 'en' }),
    entry('4', '先生', 'sensei', { sourceLang: 'ja', targetLang: 'ru' }),
  ];

  it('matches longest first, so a compound does not also match its part', () => {
    expect(glossaryTermsForText(entries, '東京大学に行った。', 'ja', 'en')).toEqual([
      { source: '東京大学', target: 'the University of Tokyo' },
    ]);
    expect(glossaryTermsForText(entries, '東京大学と東京。', 'ja', 'en').map((t) => t.source)).toEqual(['東京大学', '東京']);
  });

  it('honours an entry\'s language pair', () => {
    expect(glossaryTermsForText(entries, '先輩と先生。', 'ja', 'en').map((t) => t.source)).toEqual(['先輩']);
    expect(glossaryTermsForText(entries, '先輩と先生。', 'ja', 'ru').map((t) => t.source)).toEqual(['先生']);
  });

  it('puts glossary constraints ahead of pinned senses, without duplicates, within the cap', () => {
    const hints = mergeGlossaryHints(
      [{ source: '先輩', target: 'senpai' }],
      [{ text: '先輩', gloss: 'senior' }, { text: '見る', gloss: 'to look after' }],
      2,
    );
    expect(hints).toEqual([{ text: '先輩', gloss: 'senpai' }, { text: '見る', gloss: 'to look after' }]);
  });
});

describe('DeepL protection', () => {
  it('wraps each term\'s rendering in the ignored tag and escapes everything else', () => {
    const xml = protectGlossaryForDeepl('先輩は<b>猫</b>&犬が好き。', [{ source: '先輩', target: 'Sen & pai' }]);
    expect(xml).toBe('<x>Sen &amp; pai</x>は&lt;b&gt;猫&lt;/b&gt;&amp;犬が好き。');
  });

  it('round-trips DeepL\'s XML answer to plain text', () => {
    expect(unprotectDeeplOutput('My <x>Sen &amp; pai</x> likes &lt;b&gt;cats&lt;/b&gt; &amp; dogs.'))
      .toBe('My Sen & pai likes <b>cats</b> & dogs.');
  });
});

describe('post-edit and coverage', () => {
  const terms = [{ source: '先輩', target: 'senpai' }, { source: 'Haruka', target: 'Haruka' }];

  it('replaces a CJK term left untranslated in a Latin/Cyrillic result, and never touches CJK targets', () => {
    expect(applyGlossaryPostEdit('My 先輩 is kind.', terms, 'en')).toBe('My senpai is kind.');
    expect(applyGlossaryPostEdit('Мой 先輩 добрый.', [{ source: '先輩', target: 'сэмпай' }], 'ru')).toBe('Мой сэмпай добрый.');
    expect(applyGlossaryPostEdit('我的先輩很好。', terms, 'zh')).toBe('我的先輩很好。');
  });

  it('reports which terms the result follows, case-insensitively', () => {
    expect(glossaryCoverage('My Senpai met haruka.', terms)).toEqual({ applied: ['先輩', 'Haruka'], missing: [] });
    expect(glossaryCoverage('My senior is kind.', terms)).toEqual({ applied: [], missing: ['先輩', 'Haruka'] });
  });
});

describe('editing', () => {
  let n = 0;
  const makeId = () => `id${++n}`;

  it('adds newest first and updates the same source and pair in place', () => {
    let list = upsertGlossaryEntry([], { source: '先輩', target: 'senior', sourceLang: 'ja', targetLang: 'en' }, 1, makeId);
    list = upsertGlossaryEntry(list, { source: '猫', target: 'cat' }, 2, makeId);
    list = upsertGlossaryEntry(list, { source: '先輩', target: 'senpai', sourceLang: 'ja', targetLang: 'en' }, 3, makeId);
    expect(list.map((e) => [e.source, e.target])).toEqual([['先輩', 'senpai'], ['猫', 'cat']]);
    expect(list[0].id).toBe('id1');
    expect(removeGlossaryEntry(list, 'id1').map((e) => e.source)).toEqual(['猫']);
  });

  it('refuses an empty or identity rendering', () => {
    expect(upsertGlossaryEntry([], { source: '猫', target: '猫' }, 1, makeId)).toEqual([]);
    expect(upsertGlossaryEntry([], { source: ' ', target: 'cat' }, 1, makeId)).toEqual([]);
  });
});

describe('suggestions from the deck', () => {
  const cards = [
    { word: '先輩', meaning: 'senior (at school or work); elder', studyKind: undefined },
    { word: '猫', meaning: 'cat' },
    { word: '図書館', meaning: '<b>library</b>' },
    { word: '今日は良い天気ですね。', meaning: 'Nice weather today.', studyKind: 'sentence' },
    { word: '学校', meaning: 'школа' },
    { word: '東京', meaning: 'Tokyo' },
  ];

  it('offers words in the passage with their first gloss, longest first, skipping sentences, singles and known terms', () => {
    const out = suggestGlossaryFromDeck(cards, '先輩と図書館で猫を見た。今日は良い天気ですね。学校。', 'en', [{ source: '東京', target: 'Tokyo' }]);
    expect(out).toEqual([
      { source: '図書館', target: 'library' },
      { source: '先輩', target: 'senior' },
    ]);
  });

  it('matches the meaning\'s script to the target language', () => {
    expect(suggestGlossaryFromDeck(cards, '学校と先輩。', 'ru', [])).toEqual([{ source: '学校', target: 'школа' }]);
    expect(suggestGlossaryFromDeck(cards, '学校と先輩。', 'zh', [])).toEqual([]);
  });
});
