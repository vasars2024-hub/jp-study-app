// @vitest-environment node
//
// The read role of the dictionary utility process, against a real SQLite file:
// its own handle, answers by id, errors as answers, and deafness to the import
// role's messages. A wrong answer here would look, in the live app, like a word
// that quietly has no frequency, no origin and no references.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { attachDictionaryReadWorker } from '../dictionary/importWorker';
import { runDictionaryRead, type DictionaryReadReply } from '../dictionary/readProtocol';

let dbDir = '';
let open: SqliteDb[] = [];

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-read-worker-'));
  dbDir = path.join(tempRoot, 'dictionary');
  open = [];
});

afterEach(() => {
  open.forEach((db) => {
    if (db.open) db.close();
  });
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function seedFrequency(): void {
  const db = openDictionaryDb({ dir: dbDir });
  db.prepare('insert into dictionaries (id, title, source_lang, target_langs, priority) values (?, ?, ?, ?, ?)')
    .run('corpus-ja', 'A frequency corpus', 'ja', 'en', 0);
  db.prepare('insert into freq_corpora (lang, norm, corpus, rank) values (?, ?, ?, ?)')
    .run('ja', '猫', 'corpus-ja', 12);
  db.close();
}

function fakePort() {
  const out: DictionaryReadReply[] = [];
  let listener: ((event: { data: unknown }) => void) | null = null;
  return {
    out,
    port: {
      postMessage: (message: unknown) => out.push(message as DictionaryReadReply),
      on: (_event: 'message', cb: (event: { data: unknown }) => void) => {
        listener = cb;
      },
    },
    send: (data: unknown) => listener?.({ data }),
  };
}

/** Replies are asynchronous; wait for `count` of them, briefly. */
async function replies(out: unknown[], count: number): Promise<void> {
  for (let i = 0; i < 200 && out.length < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function openTracked(dir: string): SqliteDb {
  const db = openDictionaryDb({ dir, readonly: true });
  open.push(db);
  return db;
}

describe('attachDictionaryReadWorker', () => {
  it('answers a read on its own handle, by id, with the same rows the service returns', async () => {
    seedFrequency();
    const openDb = vi.fn(openTracked);
    const harness = fakePort();
    attachDictionaryReadWorker(harness.port, { openDb });

    harness.send({ type: 'read', id: 7, dbDir, kind: 'frequency', query: { text: '猫' } });
    await replies(harness.out, 1);

    expect(harness.out).toHaveLength(1);
    expect(harness.out[0]).toMatchObject({ type: 'readResult', id: 7, ok: true });
    const value = harness.out[0].ok ? harness.out[0].value : null;
    expect(value).toMatchObject({ query: '猫', entries: [{ corpusId: 'corpus-ja', rank: 12 }] });
    expect(openDb).toHaveBeenCalledTimes(1);
    expect(openDb).toHaveBeenCalledWith(dbDir);
  });

  it('answers reads in arrival order on one handle', async () => {
    seedFrequency();
    const openDb = vi.fn(openTracked);
    const harness = fakePort();
    attachDictionaryReadWorker(harness.port, { openDb });

    harness.send({ type: 'read', id: 1, dbDir, kind: 'frequency', query: { text: '猫' } });
    harness.send({ type: 'read', id: 2, dbDir, kind: 'xrefs', query: { text: '猫' } });
    harness.send({ type: 'read', id: 3, dbDir, kind: 'etymology', query: { text: '猫' } });
    await replies(harness.out, 3);

    expect(harness.out.map((reply) => reply.id)).toEqual([1, 2, 3]);
    expect(harness.out.every((reply) => reply.ok)).toBe(true);
    expect(openDb).toHaveBeenCalledTimes(1);
  });

  it('reports a read that throws as an error reply, and keeps answering afterwards', async () => {
    seedFrequency();
    const harness = fakePort();
    attachDictionaryReadWorker(harness.port, { openDb: openTracked });

    harness.send({ type: 'read', id: 1, dbDir, kind: 'nope', query: { text: '猫' } });
    harness.send({ type: 'read', id: 2, dbDir, kind: 'frequency', query: { text: '猫' } });
    await replies(harness.out, 2);

    expect(harness.out[0]).toMatchObject({ type: 'readResult', id: 1, ok: false });
    expect(harness.out[0].ok === false && harness.out[0].error).toMatch(/unknown dictionary read kind: nope/);
    expect(harness.out[1]).toMatchObject({ type: 'readResult', id: 2, ok: true });
  });

  it('ignores the import role\'s messages, which are not its to answer', async () => {
    const openDb = vi.fn(openTracked);
    const harness = fakePort();
    attachDictionaryReadWorker(harness.port, { openDb });

    harness.send({
      type: 'start',
      jobId: 'job-1',
      request: { kind: 'legacy' },
      dbDir,
      legacyRoot: tempRoot,
      cancelPath: path.join(tempRoot, 'cancel'),
    });
    harness.send({ type: 'cancel' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(harness.out).toHaveLength(0);
    expect(openDb).not.toHaveBeenCalled();
  });
});

describe('runDictionaryRead', () => {
  it('rejects a kind it does not know rather than answering with an empty result', async () => {
    const db = openDictionaryDb({ dir: dbDir });
    open.push(db);
    await expect(runDictionaryRead(db, 'nope' as never, { text: '猫' })).rejects.toThrow(/unknown dictionary read kind/);
  });
});
