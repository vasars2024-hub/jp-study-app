// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importLegacyIndex } from '../dictionary/migrate';
import { lookupOfflineInterlinear } from '../dictionary/service';
import type { LexiconInterlinearToken } from '../../shared/lexiconInterlinear';
import type { YomitanDictInfo } from '../../shared/types';

let db: SqliteDb;

const INFO: YomitanDictInfo = {
  id: 'jmdict-en',
  title: 'JMdict (English)',
  revision: 'fixture',
  priority: 0,
  hasTerms: true,
  hasPitch: false,
  hasFreq: false,
  importedAt: 0,
  glossLangs: ['en'],
};

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-interlinear-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
  importLegacyIndex(db, {
    version: 1,
    info: INFO,
    terms: {
      食べる: [{
        word: '食べる',
        reading: 'たべる',
        score: 5,
        senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: [] }],
      }],
      猫: [{
        word: '猫',
        reading: 'ねこ',
        score: 4,
        senses: [{ partsOfSpeech: ['n'], definitions: ['cat'], tags: [] }],
      }],
    },
  });
});

afterEach(() => {
  if (db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('lookupOfflineInterlinear', () => {
  it('uses canonical SQLite results for a morphology-aware Japanese passage', () => {
    const result = lookupOfflineInterlinear(db, '食べた。猫', {
      sourceLangs: ['ja'],
      glossLangs: ['en'],
    });

    expect(result.parts.map((part) => part.text).join('')).toBe('食べた。猫');
    expect(result.parts.filter((part) => part.kind === 'token').map((part) => part.text)).toEqual(['食べた', '猫']);
    expect(result.parts[0]).toMatchObject({
      kind: 'token',
      match: {
        text: '食べる',
        via: 'deinflected',
        glosses: [{ lang: 'en', text: 'to eat' }],
        hasTargetGloss: true,
      },
    });
    expect(result.parts[2]).toMatchObject({
      kind: 'token',
      match: { text: '猫', reading: 'ねこ', glosses: [{ lang: 'en', text: 'cat' }] },
    });
  });

  it('is read-only and reports unmatched tokens instead of inventing a gloss', () => {
    const before = db.prepare('select count(*) as count from headwords').get() as { count: number };
    const result = lookupOfflineInterlinear(db, '未知', { sourceLangs: ['ja'], glossLangs: ['en'] });
    const after = db.prepare('select count(*) as count from headwords').get() as { count: number };
    const tokens = result.parts.filter((part): part is LexiconInterlinearToken => part.kind === 'token');

    expect(result.matchedCount).toBe(0);
    expect(tokens.every((part) => !part.match)).toBe(true);
    expect(after.count).toBe(before.count);
  });
});
