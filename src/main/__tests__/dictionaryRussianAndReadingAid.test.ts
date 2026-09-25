// @vitest-environment node
//
// Russian dictionary behaviour and the reading aid, over a real (temporary)
// database: an inflected or ё-less word reaches its lemma, the entry carries its
// stressed form, the reading aid finds the stress of a form in running text, and
// Chinese words get one pinyin syllable per character from CC-CEDICT.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { collectInflectionReasons, lookup } from '../dictionary/dictService';
import { classifyForms, importWiktextract } from '../dictionary/importers/wiktextract';
import { chineseReadings, chineseSyllables, russianReadings } from '../dictionary/readingAid';
import { buildCedictIndex } from '../dictionary/chineseLookup';

// Stress marks written as escapes: a combining accent is invisible in an editor.
const A = '́';

const KNIGA = {
  word: 'книга',
  lang_code: 'ru',
  pos: 'noun',
  senses: [{ glosses: ['book'] }],
  forms: [
    { form: `кни${A}га`, tags: ['canonical'] },
    { form: `кни${A}ги`, tags: ['genitive', 'singular'] },
    { form: `кни${A}гу`, tags: ['accusative', 'singular'] },
  ],
};

const YOLKA = {
  word: 'ёлка',
  lang_code: 'ru',
  pos: 'noun',
  senses: [{ glosses: ['fir tree'] }],
  forms: [{ form: `ё${A}лка`, tags: ['canonical'] }, { form: `ё${A}лки`, tags: ['genitive', 'singular'] }],
};

const VIDET = {
  word: 'видеть',
  lang_code: 'ru',
  pos: 'verb',
  senses: [{ glosses: ['to see'] }],
  forms: [{ form: `ви${A}деть`, tags: ['canonical'] }],
};

let db: SqliteDb;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-ru-dict-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
  importWiktextract(db, [KNIGA, YOLKA, VIDET].map((record) => JSON.stringify(record)));
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('Russian entries carry their stress', () => {
  it('the canonical stressed form is the reading, not an inflection of itself', () => {
    const classified = classifyForms(KNIGA);
    expect(classified.reading).toBe(`кни${A}га`.normalize('NFC'));
    expect(classified.inflections.map((entry) => entry.form)).toEqual(['книги', 'книгу']);
    expect(classified.inflections[0].written).toBe(`кни${A}ги`.normalize('NFC'));
  });

  it('the stressed spelling never shows up as a reason in the lookup', () => {
    const reasons = collectInflectionReasons([{ headword_id: 1, name: null, tags: `genitive,singular,form:кни${A}ги` }]);
    expect(reasons.get(1)).toEqual(['genitive', 'singular']);
  });
});

describe('Russian lookup reaches the lemma', () => {
  const lemmaOf = (text: string): string | undefined =>
    lookup(db, { text, sourceLangs: ['ru'], headwordsOnly: true }).entries[0]?.text;

  it('an inflected form finds its dictionary word through the paradigm', () => {
    expect(lemmaOf('книги')).toBe('книга');
    expect(lookup(db, { text: 'книги', sourceLangs: ['ru'], headwordsOnly: true }).entries[0])
      .toMatchObject({ via: 'deinflected', reasons: ['genitive', 'singular'] });
  });

  it('a stressed query and an е-for-ё spelling find the same word', () => {
    expect(lemmaOf(`кни${A}ги`)).toBe('книга');
    expect(lemmaOf('елка')).toBe('ёлка');
    expect(lemmaOf('елки')).toBe('ёлка');
  });

  it('a form the paradigm does not list is still reduced to a dictionary word', () => {
    expect(lemmaOf('видела')).toBe('видеть');
  });

  it('the entry shows the stressed form', () => {
    expect(lookup(db, { text: 'книга', sourceLangs: ['ru'] }).entries[0]?.reading).toBe(`кни${A}га`.normalize('NFC'));
  });
});

describe('the reading aid', () => {
  it('finds the stress of words in running text, and marks no monosyllable', () => {
    const readings = russianReadings(db, ['книги', 'Книгу', 'елки', 'в', 'неизвестно']);
    expect(readings['книги']).toEqual([`кни${A}ги`.normalize('NFC')]);
    expect(readings['Книгу']).toEqual([`кни${A}гу`.normalize('NFC')]);
    expect(readings['елки']).toEqual([`ё${A}лки`.normalize('NFC')]);
    expect(readings['в']).toBeUndefined();
    expect(readings['неизвестно']).toBeUndefined();
  });

  it('gives Chinese words one tone-marked syllable per character', () => {
    const index = buildCedictIndex([
      '今天 今天 [jin1 tian1] /today/',
      '天氣 天气 [tian1 qi4] /weather/',
      '我 我 [wo3] /I/',
      '在 在 [zai4] /at/',
      '曾 曾 [Zeng1] /surname Zeng/',
      '曾 曾 [ceng2] /once/',
    ].join('\n'));
    expect(chineseSyllables(index, '今天')).toEqual(['jīn', 'tiān']);
    expect(chineseSyllables(index, '天氣')).toEqual(['tiān', 'qì']);
    // ICU groups 我在; CC-CEDICT has the parts.
    expect(chineseSyllables(index, '我在')).toEqual(['wǒ', 'zài']);
    // A surname reading is not the reading of the character in running text.
    expect(chineseSyllables(index, '曾')).toEqual(['céng']);
    expect(chineseReadings(index, ['今天', 'OK'])).toEqual({ 今天: ['jīn', 'tiān'] });
  });
});
