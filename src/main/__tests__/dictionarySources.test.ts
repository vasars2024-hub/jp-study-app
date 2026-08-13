// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';
vi.mock('electron', () => ({ app: { getPath: () => tempRoot } }));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import {
  listDictionarySources,
  moveDictionarySource,
  removeDictionarySource,
  setDictionarySourceEnabled,
} from '../dictionary/service';

describe('dictionary source controls', () => {
  let db: SqliteDb;
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dict-sources-'));
    db = openDictionaryDb({ dir: tempRoot });
    const insert = db.prepare('insert into dictionaries (id, title, source_lang, licence, attribution, priority) values (?, ?, ?, ?, ?, ?)');
    insert.run('a', 'Alpha', 'ja', 'CC BY-SA 4.0', 'Alpha Project', 0);
    insert.run('b', 'Beta', 'zh', '', '', 0);
  });
  afterEach(() => { db.close(); fs.rmSync(tempRoot, { recursive: true, force: true }); });

  it('lists, disables, reorders equal-priority rows, and removes with truthful results', () => {
    expect(listDictionarySources(db).map((source) => source.id)).toEqual(['a', 'b']);
    expect(listDictionarySources(db)[0]).toMatchObject({
      licence: 'CC BY-SA 4.0',
      attribution: 'Alpha Project',
    });
    expect(setDictionarySourceEnabled('a', false, db).sources[0].enabled).toBe(false);
    expect(moveDictionarySource('b', -1, db).sources.map((source) => source.id)).toEqual(['b', 'a']);
    expect(moveDictionarySource('b', -1, db)).toMatchObject({ ok: false, error: 'edge' });
    expect(removeDictionarySource('b', db).sources.map((source) => source.id)).toEqual(['a']);
    expect(removeDictionarySource('missing', db)).toMatchObject({ ok: false, error: 'not-found' });
  });
});
