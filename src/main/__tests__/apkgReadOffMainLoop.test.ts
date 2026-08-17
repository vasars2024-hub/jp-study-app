// ANKI_DECK_WORKBENCH_PLAN.md gate 9: the deck read must not run on Electron's
// main event loop.
//
// Measured before this suite existed, on the 100,000-note fixture through the
// debug bridge with a 20 ms IPC heartbeat: the read took 6,217 ms and main
// answered **3** heartbeats in that window, longest unbroken stall **3,293 ms**,
// against an idle control of 141 beats / 14 ms max. After the parse moved to a
// utility process: 5,224 ms, **249** heartbeats, longest stall **215 ms**, zero
// gaps over 250 ms, same page (2,000 notes) and same total (100,000).
//
// Every case here guards a way that could regress SILENTLY -- the deck still
// opens, the numbers are still right, and only the freeze comes back. A
// behaviour test cannot see any of them, which is why they are asserted against
// the source text the way `liquidWindowSnapshotFidelity` does.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import type { SqlJsStatic } from 'sql.js';
import { parseApkgDraftPage } from '../anki/apkgCollection';

const nodeRequire = createRequire(import.meta.url);
const SEP = '';
const ROOT = path.resolve(__dirname, '..', '..', '..');

function source(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('gate 9: the parse ladder can be loaded outside the main process', () => {
  it('keeps apkgCollection free of electron, so a utility process can host it', () => {
    const text = source('src/main/anki/apkgCollection.ts');
    // `app`, `dialog` and `ipcMain` do not exist in a utility process. An import
    // added here does not fail the build -- it fails at fork time, at which
    // point `apkgReadHost` silently falls back to parsing on the main loop and
    // the freeze is back with nothing on screen to say so.
    expect(text).not.toMatch(/from 'electron'/);
    expect(text).not.toMatch(/require\('electron'\)/);
  });

  it('has the worker import the parse ladder and never the ipc shell', () => {
    const text = source('src/main/anki/apkgReadWorker.ts');
    expect(text).toMatch(/from '\.\/apkgCollection'/);
    expect(text).not.toMatch(/from '\.\/apkgImport'/);
  });

  it('builds the worker, without which every read takes the main-loop fallback', () => {
    // The fallback is deliberate and correct, but it is invisible: the deck
    // opens, the counts are right, and only the freeze returns. Nothing else in
    // the suite can catch a missing build entry.
    const forge = source('forge.config.ts');
    expect(forge).toMatch(/entry: 'src\/main\/anki\/apkgReadWorker\.ts'/);
  });

  it('no longer parses inline in the ipc handler', () => {
    const text = source('src/main/anki/apkgImport.ts');
    const handler = text.slice(text.indexOf('async function readApkgDraft'));
    expect(handler).toMatch(/parseApkgDraftPageOffMainLoop/);
    // The three calls that made it expensive, in the handler's own body.
    expect(handler).not.toMatch(/new SQL\.Database/);
    expect(handler).not.toMatch(/buildAnkiDraft\(/);
    expect(handler).not.toMatch(/readRawCollection\(/);
  });

  it('resolves the worker beside the main bundle, as the dictionary worker does', () => {
    const host = source('src/main/anki/apkgReadHost.ts');
    expect(host).toMatch(/path\.join\(__dirname, 'apkgReadWorker\.js'\)/);
    // A fork failure must degrade to a slow read, never to a refused deck.
    expect(host).toMatch(/return parseApkgDraftPage\(request\)/);
  });
});

describe('gate 9: the extracted parse is the same parse', () => {
  let SQL: SqlJsStatic;
  let workDir: string;

  beforeAll(async () => {
    const initSqlJs = nodeRequire('sql.js') as (config?: {
      wasmBinary?: Uint8Array;
    }) => Promise<SqlJsStatic>;
    SQL = await initSqlJs({
      wasmBinary: fs.readFileSync(nodeRequire.resolve('sql.js/dist/sql-wasm.wasm')),
    });
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-gate9-parse-'));
  }, 30_000);

  afterAll(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  /** A legacy package with `count` notes, written the way the round-trip suite writes one. */
  function writePackage(name: string, count: number): { filePath: string; fingerprint: string } {
    const db = new SQL.Database();
    db.run(`
      CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer,
        ver integer, dty integer, usn integer, ls integer, conf text, models text,
        decks text, dconf text, tags text);
      CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer,
        usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
      CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer,
        mod integer, usn integer, type integer, queue integer, due integer, ivl integer,
        factor integer, reps integer, lapses integer, left integer, odue integer,
        odid integer, flags integer, data text);
    `);
    const models = {
      '100': {
        id: 100,
        name: 'Japanese',
        type: 0,
        css: '',
        sortf: 0,
        flds: [
          { name: 'Expression', ord: 0 },
          { name: 'Meaning', ord: 1 },
        ],
        tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Expression}}', afmt: '{{Meaning}}' }],
      },
    };
    db.run('INSERT INTO col (id, crt, mod, ver, models, decks) VALUES (1, ?, ?, 11, ?, ?)', [
      1_500_000_000,
      1_600_000_000_000,
      JSON.stringify(models),
      JSON.stringify({ '1': { id: 1, name: 'Default', dyn: 0, conf: 1 } }),
    ]);
    for (let i = 0; i < count; i += 1) {
      db.run(
        'INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [
          2000 + i,
          `guid-${i}`,
          100,
          1_500_000_100,
          0,
          '',
          [`語${i}`, `word ${i}`].join(SEP),
          `語${i}`,
          0,
          0,
          '',
        ],
      );
      db.run(
        'INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [3000 + i, 2000 + i, 1, 0, 1_500_000_100, 0, 0, 0, i, 0, 0, 0, 0, 0, 0, 0, 0, ''],
      );
    }
    const bytes = db.export();
    db.close();

    const zip = new AdmZip();
    zip.addFile('collection.anki2', Buffer.from(bytes));
    zip.addFile('media', Buffer.from('{}', 'utf8'));
    const filePath = path.join(workDir, name);
    zip.writeZip(filePath);
    return {
      filePath,
      fingerprint: `sha1:${crypto.createHash('sha1').update(Buffer.from(bytes)).digest('hex')}`,
    };
  }

  it('pages a deck and still reports the whole-collection total', async () => {
    const { filePath, fingerprint } = writePackage('gate9-page.apkg', 25);
    const parsed = await parseApkgDraftPage({ filePath, noteOffset: 0, noteLimit: 10 });

    expect(parsed.totalNotes).toBe(25);
    expect(parsed.page.notes).toHaveLength(10);
    expect(parsed.sourceKind).toBe('apkg');
    expect(parsed.label).toBe('gate9-page.apkg');
    // The fingerprint is the exporter's way back to the file. It hashes the
    // COLLECTION bytes, not the zip, so it must match what the round-trip suite
    // computes by hand or a later commit refuses as `source-changed`.
    expect(parsed.fingerprint).toBe(fingerprint);
    expect(parsed.page.notes[0]!.fields[0]!.normalized).toBe('語0');
  });

  it('honours the offset, so a second page is a different window', async () => {
    const { filePath } = writePackage('gate9-offset.apkg', 25);
    const second = await parseApkgDraftPage({ filePath, noteOffset: 10, noteLimit: 10 });

    expect(second.noteOffset).toBe(10);
    expect(second.page.notes).toHaveLength(10);
    expect(second.page.notes[0]!.fields[0]!.normalized).toBe('語10');
    expect(second.totalNotes).toBe(25);
  });

  it('reports a package with no collection in it, rather than an empty deck', async () => {
    const filePath = path.join(workDir, 'gate9-empty.apkg');
    const zip = new AdmZip();
    zip.addFile('media', Buffer.from('{}', 'utf8'));
    zip.writeZip(filePath);

    await expect(parseApkgDraftPage({ filePath })).rejects.toThrow(/not an Anki deck/);
  });
});
