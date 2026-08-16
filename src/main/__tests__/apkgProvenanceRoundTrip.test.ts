// Gate 11's round trip: field-level provenance after export AND reimport.
//
// The claim is not "the wrapper is a string" — `ankiEnrich.test.ts` covers
// that. It is that what enrichment wrote into a field is still readable after
// the value has been through `applyExportChanges` (which recomputes `sfld` and
// `csum` off an HTML-STRIPPED copy of the same field), a real zip write, a real
// zip read, and the draft builder. Every one of those steps is a place the
// markup could be normalized away, so the test drives the actual exporter and
// re-reads the file it left on disk rather than any in-memory shortcut.
//
// Electron is mocked because `exportApkg` reaches for dialogs; the request
// carries `sourcePath` and `outPath` precisely so it never gets that far.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import type { Database, SqlJsStatic } from 'sql.js';

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined })),
  },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: () => os.tmpdir(), getName: () => 'test' },
}));

import { exportApkg } from '../anki/apkgExport';
import { readRawCollection } from '../anki/apkgDraftRead';
import { buildAnkiDraft, ANKI_FIELD_SEP as SEP } from '../../shared/ankiDraft';
import { stripFieldHtml } from '../../shared/apkgParse';
import {
  wrapEnrichProvenance,
  readEnrichProvenance,
  ENRICH_PROVENANCE_ATTR,
} from '../../shared/ankiEnrich';

const nodeRequire = createRequire(import.meta.url);
let SQL: SqlJsStatic;
let workDir: string;

beforeAll(async () => {
  const initSqlJs = nodeRequire('sql.js') as (config?: {
    wasmBinary?: Uint8Array;
  }) => Promise<SqlJsStatic>;
  SQL = await initSqlJs({
    wasmBinary: fs.readFileSync(nodeRequire.resolve('sql.js/dist/sql-wasm.wasm')),
  });
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-prov-roundtrip-'));
}, 30_000);

afterAll(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

/** sortf = 0 on purpose: the sort field IS the field under test in one case, so
 *  the stripped-copy write path is exercised rather than sidestepped. */
function sourceBytes(): Uint8Array {
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
  db.run(
    'INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [2001, 'guid-neko', 100, 1_500_000_100, 0, '', ['猫', ''].join(SEP), '猫', 0, 0, ''],
  );
  db.run(
    'INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [2002, 'guid-inu', 100, 1_500_000_100, 0, '', ['犬', 'hand-typed'].join(SEP), '犬', 0, 0, ''],
  );
  const bytes = db.export();
  db.close();
  return bytes;
}

/** Write a legacy .apkg the exporter will accept, and return its path + the
 *  fingerprint `readApkgDraft` would have computed for it. */
function writeSourcePackage(name: string): { filePath: string; fingerprint: string } {
  const bytes = sourceBytes();
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

/** Reimport a package exactly as the app would, and hand back the draft. */
function reimport(filePath: string) {
  const zip = new AdmZip(filePath);
  const entry = zip.getEntry('collection.anki2');
  if (!entry) throw new Error('no collection.anki2 in the written package');
  const db: Database = new SQL.Database(entry.getData());
  try {
    return buildAnkiDraft(readRawCollection(db), {
      source: { kind: 'apkg', label: path.basename(filePath), fingerprint: 'reimport' },
      normalize: stripFieldHtml,
    });
  } finally {
    db.close();
  }
}

const SOURCES = ['JMdict (EN)', 'Jitendex'];

describe('field-level provenance survives export and reimport', () => {
  it('reads back the same sources and the same value from the written package', async () => {
    const src = writeSourcePackage('prov-basic.apkg');
    const outPath = path.join(workDir, 'prov-basic (edited).apkg');
    const written = wrapEnrichProvenance('cat; feline', SOURCES, 'inline');

    const result = await exportApkg({
      fingerprint: src.fingerprint,
      changes: { notes: [{ noteId: '2001', fields: ['猫', written] }], cardMoves: [] },
      sourcePath: src.filePath,
      outPath,
    });

    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(fs.existsSync(outPath)).toBe(true);

    const draft = reimport(outPath);
    const note = draft.notes.find((n) => n.id === '2001');
    expect(note).toBeDefined();
    expect(readEnrichProvenance(note!.fields[1].raw)).toEqual({
      sources: SOURCES,
      value: 'cat; feline',
    });

    // The negative half of the same read: the note nobody enriched must come
    // back unattributed, so a passing round trip is not "everything looks
    // enriched".
    const untouched = draft.notes.find((n) => n.id === '2002');
    expect(readEnrichProvenance(untouched!.fields[1].raw)).toBeNull();
    expect(untouched!.fields[1].raw).toBe('hand-typed');
  });

  it('keeps the wrapper in the SORT field while sfld and csum stay stripped', async () => {
    const src = writeSourcePackage('prov-sortf.apkg');
    const outPath = path.join(workDir, 'prov-sortf (edited).apkg');
    // Field 0 is both the first field (csum) and the sort field (sfld).
    const written = wrapEnrichProvenance('猫', SOURCES, 'inline');

    const result = await exportApkg({
      fingerprint: src.fingerprint,
      changes: { notes: [{ noteId: '2001', fields: [written, 'cat'] }], cardMoves: [] },
      sourcePath: src.filePath,
      outPath,
    });
    expect(result.ok).toBe(true);

    const draft = reimport(outPath);
    const note = draft.notes.find((n) => n.id === '2001')!;
    expect(readEnrichProvenance(note.fields[0].raw)?.sources).toEqual(SOURCES);
    // The draft's normalized view is what search and duplicate detection use;
    // it must be the bare word, not the wrapper.
    expect(note.fields[0].normalized).toBe('猫');

    // And Anki's own columns, read straight out of the written file.
    const zip = new AdmZip(outPath);
    const db: Database = new SQL.Database(zip.getEntry('collection.anki2')!.getData());
    try {
      const row = db.exec('SELECT sfld, flds FROM notes WHERE id = 2001')[0].values[0];
      expect(String(row[0])).toBe('猫');
      expect(String(row[1])).toContain(`${ENRICH_PROVENANCE_ATTR}="JMdict (EN)|Jitendex"`);
    } finally {
      db.close();
    }
  });

  it('survives a second round trip, so provenance is not consumed by re-export', async () => {
    const src = writeSourcePackage('prov-twice.apkg');
    const firstOut = path.join(workDir, 'prov-twice (1).apkg');
    const written = wrapEnrichProvenance('cat', ['JMdict (EN)'], 'inline');

    const first = await exportApkg({
      fingerprint: src.fingerprint,
      changes: { notes: [{ noteId: '2001', fields: ['猫', written] }], cardMoves: [] },
      sourcePath: src.filePath,
      outPath: firstOut,
    });
    expect(first.ok).toBe(true);

    // Re-export the exported package, editing a DIFFERENT note, so note 2001's
    // provenance rides through as untouched source data.
    const firstBytes = new AdmZip(firstOut).getEntry('collection.anki2')!.getData();
    const secondOut = path.join(workDir, 'prov-twice (2).apkg');
    const second = await exportApkg({
      fingerprint: `sha1:${crypto.createHash('sha1').update(firstBytes).digest('hex')}`,
      changes: { notes: [{ noteId: '2002', fields: ['犬', 'dog'] }], cardMoves: [] },
      sourcePath: firstOut,
      outPath: secondOut,
    });
    expect(second.ok).toBe(true);

    const draft = reimport(secondOut);
    expect(readEnrichProvenance(draft.notes.find((n) => n.id === '2001')!.fields[1].raw)).toEqual({
      sources: ['JMdict (EN)'],
      value: 'cat',
    });
  });

  it('round-trips a source name carrying the characters the attribute escapes', async () => {
    const src = writeSourcePackage('prov-escape.apkg');
    const outPath = path.join(workDir, 'prov-escape (edited).apkg');
    // A quote would close the attribute and an ampersand is what escaping is
    // for; both have to come back byte-identical.
    const tricky = ['JMdict "EN" & co', '新和英 <大辞典>'];
    const written = wrapEnrichProvenance('cat', tricky, 'inline');

    const result = await exportApkg({
      fingerprint: src.fingerprint,
      changes: { notes: [{ noteId: '2001', fields: ['猫', written] }], cardMoves: [] },
      sourcePath: src.filePath,
      outPath,
    });
    expect(result.ok).toBe(true);

    const draft = reimport(outPath);
    const note = draft.notes.find((n) => n.id === '2001')!;
    expect(readEnrichProvenance(note.fields[1].raw)?.sources).toEqual(tricky);
  });
});
