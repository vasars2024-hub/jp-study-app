/**
 * One word per knowledge state, on every surface that names it.
 *
 * The four-rung scale (New / Learning / Familiar / Known — `knownWords.ts`
 * WK_LEVELS, `ankiMastery.ts` MASTERY_LEVEL_KEYS, grammar familiarity) had
 * drifted per surface. Russian showed Known as «известно» in Statistics and the
 * vocabulary widget, «Выучено» on the dictionary popup's grade buttons,
 * «Выученные» in Blanc, «Известное» in the Anki tray, «Известны» in Flashcards
 * and «Усвоено» for grammar, and Learning as «изучается» / «Изучаю» / «Учится» /
 * «Учу». Japanese and Chinese had the same split for Familiar and New
 * (なじみ / なじみあり / 見覚え / 定着中; 眼熟 / 熟悉; 新規 / 未学習; 生词 / 新词 / 未学).
 *
 * The glossary below is the contract; every label key for a state must say it.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../i18n/catalogs/all';
import type { UiLang } from '../i18n/core';

type State = 'new' | 'learning' | 'familiar' | 'known';

const GLOSSARY: Record<UiLang, Record<State, string>> = {
  en: { new: 'new', learning: 'learning', familiar: 'familiar', known: 'known' },
  ru: { new: 'новое', learning: 'изучается', familiar: 'знакомо', known: 'выучено' },
  ja: { new: '未学習', learning: '学習中', familiar: '見覚えあり', known: '習得済み' },
  zh: { new: '未学习', learning: '学习中', familiar: '熟悉', known: '已掌握' },
};

/** Every key that labels one rung of the scale on its own. */
const LABELS: Record<State, string[]> = {
  new: ['lexicon.knowledge.new', 'blanc.native.forecast.level.new', 'anki.mastery.level.new', 'grammar.familiarity.new'],
  learning: [
    'lexicon.knowledge.learning',
    'blanc.native.forecast.level.learning',
    'anki.mastery.level.learning',
    'grammar.familiarity.learning',
    'stats.wk.learning',
    'widgets.vocabProgress.learning',
  ],
  familiar: [
    'lexicon.knowledge.familiar',
    'blanc.native.forecast.level.familiar',
    'anki.mastery.level.familiar',
    'grammar.familiarity.familiar',
    'stats.wk.familiar',
    'widgets.vocabProgress.familiar',
  ],
  known: [
    'lexicon.knowledge.known',
    'blanc.native.forecast.level.known',
    'anki.mastery.level.known',
    'grammar.familiarity.known',
    'stats.wk.known',
    'widgets.vocabProgress.known',
    'flash.aero.table.known',
    'flash.aero.meter.known',
    'notebook.folder.known',
  ],
};

/** Keys whose text lists the whole scale (the reader's colour toggle, its command note). */
const WHOLE_SCALE = ['settings.reader.toggle.wordHighlight', 'cmd.note.reader.toggleWordHighlight', 'cmd.note.reader.highlightWord'];

const LANGS: UiLang[] = ['en', 'ru', 'ja', 'zh'];

function value(lang: UiLang, key: string): string {
  const v = CATALOGS[lang][key];
  if (typeof v !== 'string') throw new Error(`${lang}: ${key} is missing or plural`);
  return v;
}

describe('word-knowledge states use one term each', () => {
  for (const lang of LANGS) {
    for (const state of Object.keys(LABELS) as State[]) {
      it(`${lang}: every "${state}" label says ${GLOSSARY[lang][state]}`, () => {
        // Russian folder name is the plural of the same participle («Выученные»).
        const want = GLOSSARY[lang][state].toLowerCase();
        for (const key of LABELS[state]) {
          const got = value(lang, key).toLowerCase();
          if (lang === 'ru' && key === 'notebook.folder.known') expect(got, key).toBe('выученные');
          else expect(got, key).toBe(want);
        }
      });
    }

    it(`${lang}: the colour toggle and its notes name all four states in the glossary's words`, () => {
      for (const key of WHOLE_SCALE) {
        const text = value(lang, key).toLowerCase();
        for (const state of Object.keys(GLOSSARY[lang]) as State[]) {
          expect(text, `${key} / ${state}`).toContain(GLOSSARY[lang][state].toLowerCase());
        }
      }
    });
  }

  it('no Russian word-knowledge string calls a word «известное» any more', () => {
    const keys = [
      ...Object.values(LABELS).flat(),
      ...WHOLE_SCALE,
      'stats.wk.note',
      'widgets.desc.vocab-progress',
      'filesApp.system.knownWords.desc',
      'filesApp.source.knownWords',
      'readerCollection.removeKnown',
      'studyLibrary.coverage',
      'reading.comprehension',
      'ankiWorkbench.browser.explain.known.local',
      'ankiWorkbench.browser.known.precedence.both',
      'studyLoop.stat.known',
      'stats.grammar.levelCount',
    ];
    for (const key of keys) expect(value('ru', key), key).not.toMatch(/известн/i);
  });

  it('the Statistics hint points at the reader toggle by its real name', () => {
    for (const lang of LANGS) {
      const toggle = value(lang, 'settings.reader.toggle.wordHighlight').replace(/\s*[（(].*$/, '');
      expect(value(lang, 'stats.wk.note'), lang).toContain(toggle);
    }
  });
});
