// @vitest-environment node
//
// The claim under test: a stored explanation comes back for the word it was
// written for and for no other word, survives nothing else changing, and cannot
// grow without a ceiling. Against the real SQLite engine on a temp file — the
// primary key this migration replaces is enforced by the engine, so a mock would
// have proved nothing about the thing that made the rebuild necessary.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { DICT_SCHEMA_VERSION } from '../dictionary/schema';
import { normalizeForLookup } from '../dictionary/dictService';
import {
  clearStoredExplanations,
  countStoredExplanations,
  readStoredExplanation,
  writeStoredExplanation,
} from '../dictionary/explanations';
import { normalizeNoteKey } from '../../shared/lexiconNotes';
import {
  EXPLANATION_MAX_ROWS,
  EXPLANATION_PROMPT_VERSION,
  EXPLANATION_SECTION_MAX_CHARS,
  normalizeExplanationKey,
  readExplanationKey,
  readExplanationInput,
  serializeExplanation,
  type LexiconExplanationKey,
} from '../../shared/lexiconExplanations';

let db: SqliteDb;

const KEY = (over: Partial<LexiconExplanationKey> = {}): LexiconExplanationKey => ({
  lang: 'ja',
  text: '猫',
  reading: 'ねこ',
  glossLang: 'en',
  model: 'gemini-2.5-flash',
  promptVersion: EXPLANATION_PROMPT_VERSION,
  ...over,
});

const INPUT = (summary = 'A cat.') => ({
  summary,
  sections: [{ kind: 'nuance' as const, body: 'Everyday word, no register marking.' }],
});

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-expl-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('the explanations table after migration 12', () => {
  it('is keyed on the word, not on a headword row id', () => {
    const columns = (db.pragma('table_info(explanations)') as Array<{ name: string; pk: number }>);
    const names = columns.map((column) => column.name);
    expect(names).toContain('norm');
    expect(names).toContain('reading_norm');
    expect(names).toContain('gloss_lang');
    // The old primary key is what forced the rebuild: `headword_id` in the key
    // means either every word collides at id 0, or ids are reused across a
    // re-import and one word's explanation renders under another's.
    expect(names).not.toContain('headword_id');
    expect(columns.some((column) => column.pk > 0)).toBe(false);
    expect(Number(db.pragma('user_version', { simple: true }))).toBe(DICT_SCHEMA_VERSION);
  });

  it('re-applies without dropping rows written since', () => {
    writeStoredExplanation(db, KEY(), INPUT());
    // A caller that rewinds `user_version` re-runs every step. The sentinel is
    // `norm`, so the rebuild must be skipped and the row must survive.
    db.pragma('user_version = 11');
    const reopened = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
    expect(readStoredExplanation(reopened, KEY())?.summary).toBe('A cat.');
    reopened.close();
  });
});

describe('reading back what was written', () => {
  it('round-trips summary, sections and timestamp', () => {
    const written = writeStoredExplanation(db, KEY(), INPUT(), 1_700_000_000_000);
    expect(written?.createdAt).toBe(1_700_000_000_000);
    const read = readStoredExplanation(db, KEY());
    expect(read).toEqual(written);
    expect(read?.sections).toEqual([{ kind: 'nuance', body: 'Everyday word, no register marking.' }]);
  });

  it('keeps two prose languages, two models and two prompt versions apart', () => {
    writeStoredExplanation(db, KEY(), INPUT('english'));
    writeStoredExplanation(db, KEY({ glossLang: 'ru' }), INPUT('russian'));
    writeStoredExplanation(db, KEY({ model: 'other-model' }), INPUT('other model'));
    writeStoredExplanation(db, KEY({ promptVersion: EXPLANATION_PROMPT_VERSION + 1 }), INPUT('next prompt'));
    expect(countStoredExplanations(db)).toBe(4);
    expect(readStoredExplanation(db, KEY())?.summary).toBe('english');
    expect(readStoredExplanation(db, KEY({ glossLang: 'ru' }))?.summary).toBe('russian');
    expect(readStoredExplanation(db, KEY({ model: 'other-model' }))?.summary).toBe('other model');
  });

  it('keeps two words apart, which the old primary key could not', () => {
    writeStoredExplanation(db, KEY(), INPUT('cat'));
    writeStoredExplanation(db, KEY({ text: '犬', reading: 'いぬ' }), INPUT('dog'));
    expect(readStoredExplanation(db, KEY())?.summary).toBe('cat');
    expect(readStoredExplanation(db, KEY({ text: '犬', reading: 'いぬ' }))?.summary).toBe('dog');
  });

  it('separates two readings of one spelling', () => {
    writeStoredExplanation(db, KEY({ text: '生物', reading: 'せいぶつ' }), INPUT('organism'));
    writeStoredExplanation(db, KEY({ text: '生物', reading: 'なまもの' }), INPUT('raw food'));
    expect(readStoredExplanation(db, KEY({ text: '生物', reading: 'せいぶつ' }))?.summary).toBe('organism');
    expect(readStoredExplanation(db, KEY({ text: '生物', reading: 'なまもの' }))?.summary).toBe('raw food');
  });

  it('re-explaining replaces the answer rather than leaving two rows', () => {
    writeStoredExplanation(db, KEY(), INPUT('first'));
    writeStoredExplanation(db, KEY(), INPUT('second'));
    expect(countStoredExplanations(db)).toBe(1);
    expect(readStoredExplanation(db, KEY())?.summary).toBe('second');
  });

  it('misses for a word never explained', () => {
    expect(readStoredExplanation(db, KEY({ text: '犬' }))).toBeNull();
  });

  it('an empty answer clears rather than caching a failure', () => {
    writeStoredExplanation(db, KEY(), INPUT());
    expect(writeStoredExplanation(db, KEY(), { summary: '', sections: [] })).toBeNull();
    expect(readStoredExplanation(db, KEY())).toBeNull();
    expect(countStoredExplanations(db)).toBe(0);
  });
});

describe('the cache heals rather than mis-attributing', () => {
  it('deletes and misses a row whose payload names a different word', () => {
    writeStoredExplanation(db, KEY(), INPUT());
    // Exactly what a database carried across a schema rewind or edited by hand
    // looks like: the key columns say 猫, the payload says 犬. Rendering it would
    // put a dog's explanation under a cat's heading.
    db.prepare('update explanations set json = ?')
      .run(serializeExplanation({ lang: 'ja', text: '犬', reading: 'いぬ' }, INPUT()));
    expect(readStoredExplanation(db, KEY())).toBeNull();
    expect(countStoredExplanations(db)).toBe(0);
  });

  it('deletes and misses a row whose payload no longer parses', () => {
    writeStoredExplanation(db, KEY(), INPUT());
    db.prepare('update explanations set json = ?').run('{not json');
    expect(readStoredExplanation(db, KEY())).toBeNull();
    expect(countStoredExplanations(db)).toBe(0);
  });
});

describe('bounds', () => {
  it('evicts the oldest rows past the ceiling', () => {
    // One over the cap, written oldest-first, so the row that goes is knowable.
    for (let index = 0; index <= EXPLANATION_MAX_ROWS; index += 1) {
      writeStoredExplanation(db, KEY({ text: `word${index}`, reading: '' }), INPUT(`n${index}`), 1_000 + index);
    }
    expect(countStoredExplanations(db)).toBe(EXPLANATION_MAX_ROWS);
    expect(readStoredExplanation(db, KEY({ text: 'word0', reading: '' }))).toBeNull();
    expect(readStoredExplanation(db, KEY({ text: 'word1', reading: '' }))?.summary).toBe('n1');
    expect(
      readStoredExplanation(db, KEY({ text: `word${EXPLANATION_MAX_ROWS}`, reading: '' }))?.summary,
    ).toBe(`n${EXPLANATION_MAX_ROWS}`);
  });

  it('truncates an oversized section body instead of storing it', () => {
    const stored = writeStoredExplanation(
      db,
      KEY(),
      readExplanationInput({
        summary: 'ok',
        sections: [{ kind: 'grammar', body: 'x'.repeat(EXPLANATION_SECTION_MAX_CHARS + 500) }],
      }),
    );
    expect(stored?.sections[0].body.length).toBe(EXPLANATION_SECTION_MAX_CHARS);
  });

  it('drops a heading the surface has no label for', () => {
    const input = readExplanationInput({
      summary: 'ok',
      sections: [{ kind: 'vibes', body: 'invented heading' }, { kind: 'nuance', body: 'real one' }],
    });
    expect(input.sections).toEqual([{ kind: 'nuance', body: 'real one' }]);
  });

  it('refuses a key missing its model or prose language', () => {
    expect(readExplanationKey({ lang: 'ja', text: '猫', reading: 'ねこ', glossLang: 'en' })).toBeNull();
    expect(readExplanationKey({ lang: 'ja', text: '猫', reading: 'ねこ', model: 'm' })).toBeNull();
    expect(readExplanationKey({ text: '猫', glossLang: 'en', model: 'm' })).toBeNull();
    expect(writeStoredExplanation(db, KEY({ model: '   ' }), INPUT())).toBeNull();
  });
});

describe('clearing', () => {
  it('takes every prose language and model for the word, and nothing else', () => {
    writeStoredExplanation(db, KEY(), INPUT());
    writeStoredExplanation(db, KEY({ glossLang: 'ru' }), INPUT());
    writeStoredExplanation(db, KEY({ model: 'other' }), INPUT());
    writeStoredExplanation(db, KEY({ text: '犬', reading: 'いぬ' }), INPUT());
    expect(clearStoredExplanations(db, 'ja', '猫', 'ねこ')).toBe(3);
    expect(readStoredExplanation(db, KEY())).toBeNull();
    expect(readStoredExplanation(db, KEY({ text: '犬', reading: 'いぬ' }))?.summary).toBe('A cat.');
  });

  it('reports zero rather than claiming a deletion that did nothing', () => {
    expect(clearStoredExplanations(db, 'ja', '猫', 'ねこ')).toBe(0);
  });
});

describe('the normalisation rule', () => {
  // `normalizeExplanationKey` is restated in `lexiconExplanations.ts` rather than
  // imported from the notes contract. Pinning the two here is what keeps the
  // duplication from drifting into two different ideas of what a word is.
  it('matches the notes key rule character for character', () => {
    for (const sample of ['ネコ', 'Ｃａｆｅ', '  Neko  ', 'ﾈｺ', 'CAFÉ']) {
      expect(normalizeExplanationKey(sample)).toBe(normalizeNoteKey(sample));
    }
  });

  it('folds width and case in the written form the way the lookup index does', () => {
    writeStoredExplanation(db, KEY({ text: 'ｃａｔ', reading: '' }), INPUT('folded'));
    expect(readStoredExplanation(db, KEY({ text: 'CAT', reading: '' }))?.summary).toBe('folded');
    expect(normalizeForLookup('ｃａｔ')).toBe(normalizeForLookup('CAT'));
  });

  it('does not fold katakana into hiragana, so two spellings stay two entries', () => {
    writeStoredExplanation(db, KEY({ text: 'ネコ', reading: 'ネコ' }), INPUT('katakana'));
    writeStoredExplanation(db, KEY({ text: 'ねこ', reading: 'ねこ' }), INPUT('hiragana'));
    expect(readStoredExplanation(db, KEY({ text: 'ネコ', reading: 'ネコ' }))?.summary).toBe('katakana');
    expect(readStoredExplanation(db, KEY({ text: 'ねこ', reading: 'ねこ' }))?.summary).toBe('hiragana');
  });
});
