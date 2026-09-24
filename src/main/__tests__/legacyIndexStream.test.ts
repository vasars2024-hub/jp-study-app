// @vitest-environment node
/**
 * The first-boot migration reads each legacy store a member at a time.
 *
 * It used to parse every `index.json` whole; for the bundled JMdict that is
 * ~65 MB of JSON and put the migration's utility process at ~530 MB. The
 * streamed reader has to hand over exactly what `JSON.parse` would have — across
 * chunk boundaries, escapes and multi-byte characters — and the migration must
 * produce the same rows while never reading a store into one string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import {
  LegacyIndexReadError,
  readLegacyIndexInfo,
  scanLegacyIndexFile,
} from '../dictionary/legacyIndexStream';
import {
  importLegacyIndex,
  migrateLegacyYomitanStores,
  type LegacyDictIndex,
} from '../dictionary/migrate';

const SEP = '\u0001';

function bigIndex(id: string, count: number): LegacyDictIndex {
  const terms: NonNullable<LegacyDictIndex['terms']> = {};
  const pitch: NonNullable<LegacyDictIndex['pitch']> = {};
  const freq: NonNullable<LegacyDictIndex['freq']> = {};
  const index: LegacyDictIndex = {
    version: 1,
    info: {
      id, title: `Store ${id}`, revision: 'r', priority: 0, hasTerms: true, hasPitch: true,
      hasFreq: true, importedAt: 0, glossLangs: ['en'],
    },
    terms,
    pitch,
    freq,
  };
  for (let i = 0; i < count; i += 1) {
    const word = `語${i}`;
    terms[word] = [{
      word,
      reading: `ご${i}`,
      score: i % 7,
      senses: [
        // Escapes, quotes, braces and brackets inside strings must not move the scanner.
        { partsOfSpeech: ['n'], definitions: [`meaning "${i}" {x} [y] \\ back\\slash`, 'see: 猫 cat'], tags: [] },
        { partsOfSpeech: ['v1', 'vt'], definitions: [`второе значение ${i}`], tags: ['arch'] },
      ],
    }];
    pitch[`${word}${SEP}ご${i}`] = { reading: `ご${i}`, positions: [i % 3] };
    freq[`${word}${SEP}ご${i}`] = i + 1;
  }
  return index;
}

function writeStore(root: string, index: LegacyDictIndex, space?: number): string {
  const dir = path.join(root, index.info.id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.json');
  // A section the migration does not read, placed first, must be stepped over.
  const { version, info, ...rest } = index;
  fs.writeFileSync(file, JSON.stringify({ version, info, tags: { n: ['noun', 1, null, true] }, ...rest }, null, space));
  return file;
}

let db: SqliteDb;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-legacy-stream-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('scanLegacyIndexFile', () => {
  it('hands over exactly what JSON.parse reads, one member at a time, across chunk boundaries', () => {
    const index = bigIndex('big', 12_000);
    for (const space of [undefined, 2]) {
      const file = writeStore(path.join(tempRoot, `yomitan-${space ?? 0}`), index, space);
      // Several 1 MiB chunks, so members and keys straddle the boundaries.
      expect(fs.statSync(file).size).toBeGreaterThan(3 << 20);
      const seen: Record<string, Record<string, unknown>> = {};
      let members = 0;
      scanLegacyIndexFile(file, {
        sections: new Set(['terms', 'pitch', 'freq']),
        onMember: (section, key, value) => {
          members += 1;
          (seen[section] ??= {})[key] = value;
        },
      });
      expect(members).toBe(36_000);
      expect(seen).toEqual({ terms: index.terms, pitch: index.pitch, freq: index.freq });
    }
  });

  it('reads the info alone and stops there', () => {
    const file = writeStore(path.join(tempRoot, 'yomitan'), bigIndex('big', 12_000));
    const reads = vi.spyOn(fs, 'readSync');
    expect(readLegacyIndexInfo(file)).toEqual(bigIndex('big', 0).info);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('refuses a file that is not a JSON object, or is cut short', () => {
    const file = path.join(tempRoot, 'bad.json');
    for (const text of ['{ not json', '[1,2]', '{"info": {"id": "x"}, "terms": {"a": [1', '{"a": 1} trailing', '']) {
      fs.writeFileSync(file, text);
      expect(() => scanLegacyIndexFile(file, { sections: new Set(['terms']) }), text)
        .toThrow(LegacyIndexReadError);
    }
  });
});

describe('the streamed migration', () => {
  it('writes the same rows as the in-memory import, without reading any store whole', () => {
    const index = bigIndex('streamed', 3_000);
    const root = path.join(tempRoot, 'yomitan');
    const file = writeStore(root, index);

    const reference = openDictionaryDb({ dir: path.join(tempRoot, 'reference') });
    const expected = importLegacyIndex(reference, index);

    const readFile = vi.spyOn(fs, 'readFileSync');
    const result = migrateLegacyYomitanStores(db, root);
    expect(readFile.mock.calls.some(([target]) => String(target) === file)).toBe(false);

    expect(result.skipped).toEqual([]);
    expect(result.imported).toEqual([expected]);
    const dump = (target: SqliteDb) => ({
      headwords: target.prepare('select text, norm, reading, score from headwords order by id').all(),
      glosses: target.prepare('select lang, text, ord from glosses order by id').all(),
      xrefs: target.prepare('select to_text, kind from xrefs order by from_sense').all(),
      pitch: target.prepare('select norm, reading, positions from pitch order by norm, reading').all(),
      freq: target.prepare('select norm, rank from freq_corpora order by norm').all(),
    });
    expect(dump(db)).toEqual(dump(reference));
    reference.close();
  });

  it('keeps a store that is malformed past its info out, and names it unreadable', () => {
    const root = path.join(tempRoot, 'yomitan');
    const file = writeStore(root, bigIndex('cut', 50));
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, text.slice(0, Math.floor(text.length / 2)));

    const result = migrateLegacyYomitanStores(db, root);
    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual([{ dictId: 'cut', reason: expect.stringMatching(/^unreadable index\.json/) }]);
    // The transaction rolled back: no half-written dictionary.
    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 0 });
    expect(db.prepare('select count(*) c from dictionaries').get()).toEqual({ c: 0 });
  });

  it('rolls a streamed store back when cancelled between its rows', () => {
    const root = path.join(tempRoot, 'yomitan');
    writeStore(root, bigIndex('cancel', 2_000));
    let polls = 0;
    const result = migrateLegacyYomitanStores(db, root, undefined, () => (polls += 1) >= 1_500);
    expect(result).toEqual({ imported: [], skipped: [], cancelled: true });
    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 0 });
  });
});
