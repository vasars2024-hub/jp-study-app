// @vitest-environment node
//
// Phase 1's done-criterion, measured against the REAL dictionaries in userData
// rather than against a fixture: "the bundled dicts are queryable from the DB and
// p95 exact lookup < 5 ms."
//
// Skipped by default — it reads ~140 MB of JSON and takes tens of seconds, which
// does not belong in a 5,600-test suite. Run it deliberately:
//
//   $env:JP_DICT_REAL = '1'; npx vitest run src/main/__tests__/dictionaryRealData.test.ts
//
// It is **read-only with respect to userData**: the JSON stores are read, and the
// database is built in a temp directory that is deleted afterwards. Nothing in the
// app's own `userData/dictionary` is touched, so running this cannot damage a
// profile that has no restore point (see the jp-bridge skill, §2).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REAL_USER_DATA = path.join(process.env.APPDATA ?? '', 'jp-study-app');
let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import {
  legacyYomitanRoot,
  migrateLegacyYomitanStores,
  readMigratedEntries,
  type LegacyDictIndex,
  type MigrationResult,
} from '../dictionary/migrate';

const enabled = process.env.JP_DICT_REAL === '1' && fs.existsSync(legacyYomitanRoot(REAL_USER_DATA));

let db: SqliteDb;
let result: MigrationResult;
let elapsedMs = 0;

beforeAll(() => {
  if (!enabled) return;
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dictreal-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
  const started = Date.now();
  result = migrateLegacyYomitanStores(db, legacyYomitanRoot(REAL_USER_DATA), (progress) => {
    process.stdout.write(`  [${progress.current}/${progress.total}] ${progress.title}\n`);
  });
  elapsedMs = Date.now() - started;
}, 600_000);

afterAll(() => {
  if (!enabled) return;
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe.skipIf(!enabled)('the real bundled dictionaries', () => {
  it('migrates every store with nothing skipped', () => {
    process.stdout.write(`  migrated in ${(elapsedMs / 1000).toFixed(1)}s\n`);
    for (const row of result.imported) {
      process.stdout.write(
        `  ${row.dictId}: ${row.headwords} headwords, ${row.senses} senses, ` +
        `${row.glosses} glosses, ${row.pitch} pitch, ${row.freq} freq\n`,
      );
    }
    expect(result.skipped).toEqual([]);
    expect(result.imported.length).toBeGreaterThanOrEqual(3);
  }, 600_000);

  it('is entry-for-entry identical to the JSON for a 5,000-term sample', () => {
    // The parity assertion the plan asks for, at the scale it asks for. Sampled
    // by stride rather than at random so a failure is reproducible.
    let compared = 0;
    for (const imported of result.imported) {
      const file = path.join(legacyYomitanRoot(REAL_USER_DATA), imported.dictId, 'index.json');
      if (!fs.existsSync(file)) continue;
      const index = JSON.parse(fs.readFileSync(file, 'utf8')) as LegacyDictIndex;
      const keys = Object.keys(index.terms ?? {});
      if (!keys.length) continue;
      const want = Math.min(5_000, keys.length);
      const stride = Math.max(1, Math.floor(keys.length / want));
      for (let i = 0; i < keys.length && compared < 5_000; i += stride) {
        const norm = keys[i];
        expect(readMigratedEntries(db, imported.dictId, norm)).toEqual(index.terms?.[norm]);
        compared += 1;
      }
    }
    process.stdout.write(`  compared ${compared} terms entry-for-entry\n`);
    expect(compared).toBeGreaterThan(1_000);
  }, 600_000);

  it('answers an exact lookup under the 5 ms p95 gate', () => {
    const terms = (db.prepare('select norm from headwords order by id limit 5000').all() as { norm: string }[])
      .map((row) => row.norm);
    expect(terms.length).toBeGreaterThan(0);

    const select = db.prepare('select id from headwords where lang = ? and norm = ?');
    const times: number[] = [];
    for (let i = 0; i < 2_000; i += 1) {
      const term = terms[(i * 7) % terms.length];
      const started = process.hrtime.bigint();
      select.get('ja', term);
      times.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const rows = db.prepare('select count(*) c from headwords').get() as { c: number };
    process.stdout.write(`  ${rows.c} headwords · p50 ${p50.toFixed(4)} ms · p95 ${p95.toFixed(4)} ms\n`);
    expect(p95).toBeLessThan(5);
  }, 120_000);

  it('answers the reverse direction the JSON store could not', () => {
    // "Which Japanese word means 'tradition'" — a full-text query over glosses.
    // The old store was a term→entries Map, so this question had no answer at all.
    const rows = db
      .prepare(`
        select h.text as text from glosses_fts
        join glosses g on g.id = glosses_fts.rowid
        join senses s on s.id = g.sense_id
        join headwords h on h.id = s.headword_id
        where glosses_fts match ? limit 20
      `)
      .all('tradition') as { text: string }[];
    process.stdout.write(`  reverse lookup 'tradition' → ${rows.length} headwords\n`);
    expect(rows.length).toBeGreaterThan(0);
  }, 120_000);

  it('carries the pitch data that §3.1 had nowhere to put', () => {
    const count = db.prepare('select count(*) c from pitch').get() as { c: number };
    process.stdout.write(`  pitch rows: ${count.c}\n`);
    expect(count.c).toBeGreaterThan(0);
  });

  it('leaves every source index.json where it was', () => {
    for (const imported of result.imported) {
      expect(fs.existsSync(path.join(legacyYomitanRoot(REAL_USER_DATA), imported.dictId, 'index.json'))).toBe(true);
    }
  });
});
