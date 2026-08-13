import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDictionaryDb } from '../dictionary/db';
import { importDsl, parseDsl } from '../dictionary/importers/dsl';

describe('Lingvo DSL dictionary importer', () => {
  let tempRoot: string;
  beforeEach(() => { tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dsl-')); });
  afterEach(() => { fs.rmSync(tempRoot, { recursive: true, force: true }); });

  it('parses directives, escaped separators, aliases, and multiline definitions', () => {
    const parsed = parseDsl(`#NAME "Learner words"\n#INDEX_LANGUAGE "ja"\n#CONTENTS_LANGUAGE "en"\n猫|ねこ\n cat\n domestic feline\na\\|b\n literal pipe\n`);
    expect(parsed.directives).toMatchObject({ NAME: 'Learner words', INDEX_LANGUAGE: 'ja', CONTENTS_LANGUAGE: 'en' });
    expect(parsed.entries).toEqual([
      { headwords: ['猫', 'ねこ'], definition: 'cat\ndomestic feline' },
      { headwords: ['a|b'], definition: 'literal pipe' },
    ]);
  });

  it('commits searchable primary headwords and alias provenance atomically', () => {
    const db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
    const result = importDsl(db, '#INDEX_LANGUAGE "ja"\n#CONTENTS_LANGUAGE "en"\n猫|ねこ\n cat\n', { dictId: 'fixture' });
    expect(result).toMatchObject({ entries: 1, headwords: 2, senses: 1, glosses: 1, cancelled: false });
    expect(db.prepare('select title, source_lang, target_langs, entry_count from dictionaries where id = ?').get('fixture'))
      .toMatchObject({ source_lang: 'ja', target_langs: 'en', entry_count: 1 });
    expect(db.prepare('select text, variant_of from headwords order by id').all()).toEqual([
      { text: '猫', variant_of: null },
      { text: 'ねこ', variant_of: 1 },
    ]);
    db.close();
  });

  it('rolls back replacement when cancellation is requested', () => {
    const db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
    importDsl(db, 'old\n definition\n', { dictId: 'fixture' });
    const result = importDsl(db, 'new\n definition\n', { dictId: 'fixture', shouldCancel: () => true });
    expect(result.cancelled).toBe(true);
    expect(db.prepare('select text from headwords where dict_id = ?').all('fixture')).toEqual([{ text: 'old' }]);
    db.close();
  });
});
