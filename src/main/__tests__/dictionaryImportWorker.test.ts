// @vitest-environment node
//
// The utility process's decision table, run against a real SQLite file.
//
// `runDictionaryImport` is the half of `importWorker.ts` that decides which
// importer to call and what the outcome was; the message plumbing around it is
// covered by `attachDictionaryImportWorker` below with a fake port. Together
// they mean the worker can be wrong here rather than only in a live app, where
// a wrong answer looks like a dictionary that quietly imported nothing.

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
  attachDictionaryImportWorker,
  runDictionaryImport,
  type RunImportDeps,
} from '../dictionary/importWorker';
import type { DictionaryImportWorkerOut } from '../../shared/dictionaryImportJob';

const CEDICT = [
  '# CC-CEDICT',
  '傳統 传统 [chuan2 tong3] /tradition/traditional/',
  '狗 狗 [gou3] /dog/',
  '',
].join('\n');

let dbDir = '';
let open: SqliteDb[] = [];

function deps(overrides: Partial<RunImportDeps> = {}): RunImportDeps {
  return {
    onProgress: () => undefined,
    shouldCancel: () => false,
    openDb: (dir) => {
      const db = openDictionaryDb({ dir });
      open.push(db);
      return db;
    },
    ...overrides,
  };
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-import-worker-'));
  dbDir = path.join(tempRoot, 'dictionary');
  open = [];
});

afterEach(() => {
  open.forEach((db) => {
    if (db.open) db.close();
  });
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('runDictionaryImport', () => {
  it('imports a CC-CEDICT file and reports numeric counts only', () => {
    const file = path.join(tempRoot, 'cedict.u8');
    fs.writeFileSync(file, CEDICT, 'utf8');

    const terminal = runDictionaryImport({ kind: 'cedict', filePath: file }, dbDir, tempRoot, deps());

    expect(terminal.state).toBe('committed');
    const counts = terminal.state === 'committed' ? terminal.counts : {};
    expect(counts.entries).toBe(2);
    // `dictId` is a string and must not survive into a counts map the contract
    // validates as numbers — a stray string there rejects the whole snapshot.
    expect(counts.dictId).toBeUndefined();
    expect(Object.values(counts).every((value) => typeof value === 'number')).toBe(true);
  });

  it('routes a DSL file through the worker and preserves its language directives', () => {
    const file = path.join(tempRoot, 'learner.dsl');
    fs.writeFileSync(file, '#INDEX_LANGUAGE "ru"\n#CONTENTS_LANGUAGE "en"\nсобака\n dog\n', 'utf8');

    const terminal = runDictionaryImport({ kind: 'dsl', filePath: file }, dbDir, tempRoot, deps());

    expect(terminal).toEqual({
      state: 'committed',
      counts: { entries: 1, skipped: 0, headwords: 1, senses: 1, glosses: 1 },
    });
    const check = openDictionaryDb({ dir: dbDir });
    open.push(check);
    expect(check.prepare('select source_lang, target_langs from dictionaries where id = ?').get('dsl-user'))
      .toEqual({ source_lang: 'ru', target_langs: 'en' });
  });

  it('reports a cancel as cancelled with no counts, and leaves nothing behind', () => {
    const file = path.join(tempRoot, 'cedict.u8');
    fs.writeFileSync(file, CEDICT, 'utf8');

    const terminal = runDictionaryImport(
      { kind: 'cedict', filePath: file },
      dbDir,
      tempRoot,
      deps({ shouldCancel: () => true }),
    );

    expect(terminal).toEqual({ state: 'cancelled', counts: {} });
    // The transaction rolled back: a cancelled import must not leave a partial
    // dictionary that reads as "this word does not exist".
    const check = openDictionaryDb({ dir: dbDir });
    open.push(check);
    expect((check.prepare('select count(*) c from dictionaries').get() as { c: number }).c).toBe(0);
  });

  it('turns a missing source file into a thrown error the caller reports as failed', () => {
    expect(() =>
      runDictionaryImport({ kind: 'cedict', filePath: path.join(tempRoot, 'nope.u8') }, dbDir, tempRoot, deps()),
    ).toThrow();
  });

  it('reports an empty legacy tree as committed with zero stores', () => {
    const terminal = runDictionaryImport({ kind: 'legacy' }, dbDir, path.join(tempRoot, 'yomitan'), deps());
    expect(terminal).toEqual({ state: 'committed', counts: { stores: 0, skipped: 0, headwords: 0, senses: 0, glosses: 0 } });
  });

  it('closes the database even when the import throws', () => {
    expect(() =>
      runDictionaryImport({ kind: 'cedict', filePath: path.join(tempRoot, 'nope.u8') }, dbDir, tempRoot, deps()),
    ).toThrow();
    expect(open).toHaveLength(1);
    expect(open[0].open).toBe(false);
  });
});

describe('attachDictionaryImportWorker', () => {
  function fakePort() {
    const out: DictionaryImportWorkerOut[] = [];
    let listener: ((event: { data: unknown }) => void) | null = null;
    return {
      out,
      port: {
        postMessage: (message: unknown) => out.push(message as DictionaryImportWorkerOut),
        on: (_event: 'message', cb: (event: { data: unknown }) => void) => {
          listener = cb;
        },
      },
      send: (data: unknown) => listener?.({ data }),
    };
  }

  it('answers a start with progress and exactly one terminal message', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.useFakeTimers();
    const file = path.join(tempRoot, 'cedict.u8');
    fs.writeFileSync(file, CEDICT, 'utf8');
    const harness = fakePort();

    attachDictionaryImportWorker(harness.port);
    harness.send({
      type: 'start',
      jobId: 'job-1',
      request: { kind: 'cedict', filePath: file },
      dbDir,
      legacyRoot: tempRoot,
    });

    const terminals = harness.out.filter((message) => message.type === 'terminal');
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({ type: 'terminal', jobId: 'job-1', kind: 'cedict' });
    // Every progress message carries the job it belongs to, so main can drop a
    // stale one instead of attributing it to whatever is running now.
    harness.out
      .filter((message) => message.type === 'progress')
      .forEach((message) => {
        expect(message.type === 'progress' && message.progress.jobId).toBe('job-1');
      });
    vi.useRealTimers();
    exit.mockRestore();
  });

  it('ignores a second start, so one process is always exactly one job', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.useFakeTimers();
    const harness = fakePort();
    attachDictionaryImportWorker(harness.port);

    const start = {
      type: 'start' as const,
      jobId: 'job-1',
      request: { kind: 'legacy' as const },
      dbDir,
      legacyRoot: path.join(tempRoot, 'yomitan'),
    };
    harness.send(start);
    harness.send({ ...start, jobId: 'job-2' });

    expect(harness.out.filter((message) => message.type === 'terminal')).toHaveLength(1);
    vi.useRealTimers();
    exit.mockRestore();
  });

  it('reports a thrown import as failed rather than staying silent', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.useFakeTimers();
    const harness = fakePort();
    attachDictionaryImportWorker(harness.port);

    harness.send({
      type: 'start',
      jobId: 'job-1',
      request: { kind: 'cedict', filePath: path.join(tempRoot, 'nope.u8') },
      dbDir,
      legacyRoot: tempRoot,
    });

    const terminal = harness.out.find((message) => message.type === 'terminal');
    expect(terminal?.type === 'terminal' && terminal.terminal.state).toBe('failed');
    vi.useRealTimers();
    exit.mockRestore();
  });
});
