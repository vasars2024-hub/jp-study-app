// .apkg card import: off the main loop, and what it keeps (round-2 audit F,
// Anki item 13).
//
// Before: `importApkgCards` parsed on Electron's main loop with no size limit,
// and the cards it produced carried word/reading/meaning/sentence only — tags
// were read and dropped in the renderer, media and review history were never
// read at all, and nothing said so.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import type { SqlJsStatic } from 'sql.js';

const fork = vi.hoisted(() => ({ impl: null as null | (() => unknown) }));
vi.mock('electron', () => ({
  utilityProcess: {
    fork: () => {
      if (!fork.impl) throw new Error('fork refused');
      return fork.impl();
    },
  },
}));

import { readApkgCardsFile, APKG_IMPORT_MAX_BYTES } from '../anki/apkgNoteRead';
import { runApkgJobOffMainLoop } from '../anki/apkgReadHost';

const nodeRequire = createRequire(import.meta.url);
const SEP = '\u001f';
let SQL: SqlJsStatic;
let workDir: string;

beforeAll(async () => {
  const initSqlJs = nodeRequire('sql.js') as (config?: { wasmBinary?: Uint8Array }) => Promise<SqlJsStatic>;
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(nodeRequire.resolve('sql.js/dist/sql-wasm.wasm')) });
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-apkg-fidelity-'));
}, 30_000);

afterAll(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

const CRT = 1_600_000_000; // collection creation, seconds

function writePackage(name: string): string {
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
      flds: [
        { name: 'Expression', ord: 0 },
        { name: 'Reading', ord: 1 },
        { name: 'Meaning', ord: 2 },
        { name: 'Notes', ord: 3 },
      ],
    },
  };
  db.run('INSERT INTO col (id, crt, mod, ver, models, decks) VALUES (1, ?, ?, 11, ?, ?)', [
    CRT,
    1_600_000_000_000,
    JSON.stringify(models),
    JSON.stringify({ '1': { id: 1, name: 'Core::N5', dyn: 0 } }),
  ]);
  const notes: Array<[number, string, string[]]> = [
    [1, 'n5 animals', ['猫[sound:neko.mp3][sound:neko2.mp3]', 'ねこ', 'cat <img src="cat.jpg">', 'a pet']],
    [2, '', ['犬', 'いぬ', 'dog [sound:gone.mp3]', '']],
    [3, '', ['', '', 'orphan meaning', '']],
  ];
  for (const [id, tags, flds] of notes) {
    db.run('INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
      id, `g${id}`, 100, 0, 0, ` ${tags} `, flds.join(SEP), flds[0], 0, 0, '',
    ]);
  }
  // Note 1: a review card, 12-day interval, ease 2.3, due day 100. Note 2: new.
  db.run('INSERT INTO cards VALUES (11, 1, 1, 0, 0, 0, 2, 2, 100, 12, 2300, 7, 1, 0, 0, 0, 0, "")');
  db.run('INSERT INTO cards VALUES (12, 2, 1, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, "")');
  const bytes = db.export();
  db.close();

  const zip = new AdmZip();
  zip.addFile('collection.anki2', Buffer.from(bytes));
  zip.addFile('media', Buffer.from(JSON.stringify({ '0': 'neko.mp3', '1': 'cat.jpg', '2': 'neko2.mp3' }), 'utf8'));
  zip.addFile('0', Buffer.from('ID3-fake-audio'));
  zip.addFile('1', Buffer.from('fake-jpeg'));
  zip.addFile('2', Buffer.from('ID3-second-clip'));
  const filePath = path.join(workDir, name);
  zip.writeZip(filePath);
  return filePath;
}

describe('readApkgCardsFile', () => {
  it('keeps tags, the first audio and image, and the Anki schedule, and counts what it could not keep', async () => {
    const mediaDir = path.join(workDir, 'media-out');
    const res = await readApkgCardsFile(writePackage('fidelity.apkg'), { mediaDir, nowMs: (CRT + 200 * 86_400) * 1000 });
    expect(res.ok).toBe(true);
    const cat = res.cards!.find((c) => c.word === '猫')!;
    expect(cat.tags).toEqual(['n5', 'animals']);
    expect(cat.audioPath && fs.readFileSync(cat.audioPath, 'utf8')).toBe('ID3-fake-audio');
    expect(cat.imagePath && fs.readFileSync(cat.imagePath, 'utf8')).toBe('fake-jpeg');
    expect(path.dirname(cat.audioPath!)).toBe(mediaDir);
    expect(cat.srs).toMatchObject({ intervalDays: 12, ease: 2.3, repetitions: 7, lapses: 1, dueAt: (CRT + 100 * 86_400) * 1000 });

    const dog = res.cards!.find((c) => c.word === '犬')!;
    expect(dog.srs).toBeUndefined();
    expect(dog.audioPath).toBeUndefined();

    expect(res.report).toMatchObject({
      emptyNotes: 1,
      extraFieldNotes: 1,
      scheduledCards: 1,
      mediaKept: 2,
      mediaMissing: 1, // gone.mp3
      mediaSkipped: 1, // neko2.mp3: one audio per card
      mediaUnreadable: false,
    });
  });

  it('refuses a package over the size ceiling by name', async () => {
    const big = path.join(workDir, 'big.apkg');
    fs.writeFileSync(big, '');
    fs.truncateSync(big, APKG_IMPORT_MAX_BYTES + 1);
    const res = await readApkgCardsFile(big);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/^file-too-large:/);
    fs.rmSync(big);
  });
});

describe('runApkgJobOffMainLoop', () => {
  it('runs in the utility process and forwards its progress', async () => {
    const listeners = new Map<string, (arg: unknown) => void>();
    const posted: unknown[] = [];
    fork.impl = () => ({
      on: (event: string, cb: (arg: unknown) => void) => listeners.set(event, cb),
      postMessage: (m: unknown) => {
        posted.push(m);
        queueMicrotask(() => {
          listeners.get('message')?.({ phase: 'accepted' });
          listeners.get('message')?.({ phase: 'progress', stage: 'media', done: 5, total: 10 });
          listeners.get('message')?.({ ok: true, result: { ok: true, cards: [], noteCount: 0 } });
        });
      },
      kill: () => undefined,
    });
    const progress: unknown[] = [];
    const inProcess = vi.fn(async () => ({ ok: false }));
    const result = await runApkgJobOffMainLoop(
      { op: 'cards', filePath: 'x.apkg' },
      inProcess,
      { onProgress: (p) => progress.push(p) },
    );
    expect(result).toEqual({ ok: true, cards: [], noteCount: 0 });
    expect(inProcess).not.toHaveBeenCalled();
    expect(posted).toEqual([{ op: 'cards', filePath: 'x.apkg' }]);
    expect(progress).toEqual([{ phase: 'progress', stage: 'media', done: 5, total: 10 }]);
  });

  it('falls back to running in-process when no worker can be forked', async () => {
    fork.impl = null;
    const inProcess = vi.fn(async () => 'here');
    await expect(runApkgJobOffMainLoop({ op: 'words', filePath: 'x.apkg' }, inProcess)).resolves.toBe('here');
    expect(inProcess).toHaveBeenCalledTimes(1);
  });
});
