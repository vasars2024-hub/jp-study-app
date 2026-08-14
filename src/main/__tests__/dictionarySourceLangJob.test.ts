// @vitest-environment node
//
// The main-thread half of a source-language correction: what it refuses before
// it is willing to spend a utility process, and what it answers when it does.
//
// The refusals are the point. Relabelling every row a dictionary owns takes
// 7.2 s for 101,843 headwords, so the work moved off the main thread — but a
// `<select>` re-sending its own value, or a typo'd language code, must still
// cost nothing. Each of these tests asserts that `utilityProcess.fork` was not
// reached, because "it answered quickly" and "it did not launch a process" are
// different claims and only the second one is the one that matters here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';
const fork = vi.fn(() => ({ postMessage: () => undefined, kill: () => undefined, on: () => undefined }));

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  utilityProcess: { fork: (...args: unknown[]) => fork(...(args as [])) },
}));

import { closeDictionaryDb, openDictionaryDb } from '../dictionary/db';
import { startSourceLangRelabel } from '../dictionary/importIpc';

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-relabel-ipc-'));
  const db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
  db.prepare('insert into dictionaries (id, title, source_lang, target_langs, priority) values (?, ?, ?, ?, ?)')
    .run('user-zh', 'Some Chinese dictionary', 'ja', 'zh', 0);
  db.close();
  fork.mockClear();
});

afterEach(() => {
  // `listDictionarySources()` reads the process-wide handle, which is cached on
  // the *first* userData path it saw. Closing it is what makes each test see its
  // own database instead of the previous test's — and what lets Windows delete
  // the directory at all.
  closeDictionaryDb();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('startSourceLangRelabel', () => {
  it('refuses a language code no source could be labelled with, without spawning anything', () => {
    expect(startSourceLangRelabel('user-zh', '   ')).toMatchObject({ ok: false, error: 'invalid-lang' });
    expect(startSourceLangRelabel('user-zh', 42)).toMatchObject({ ok: false, error: 'invalid-lang' });
    expect(fork).not.toHaveBeenCalled();
  });

  it('refuses a dictionary that is not there as a refused request, not a failed job', () => {
    // Discovering this inside the worker would report it as a *job* that failed,
    // which reads to the user as "the relabel broke" rather than "there is
    // nothing there to relabel".
    expect(startSourceLangRelabel('gone', 'zh')).toMatchObject({ ok: false, error: 'not-found' });
    expect(startSourceLangRelabel(7, 'zh')).toMatchObject({ ok: false, error: 'not-found' });
    expect(fork).not.toHaveBeenCalled();
  });

  it('treats the language the source already has as success with nothing to run', () => {
    const answer = startSourceLangRelabel('user-zh', ' JA ');
    expect(answer).toMatchObject({ ok: true, unchanged: true });
    expect(answer.jobId).toBeUndefined();
    expect(fork).not.toHaveBeenCalled();
  });

  it('queues a real move and answers with a job id, not with the new state', () => {
    const answer = startSourceLangRelabel('user-zh', 'zh');
    expect(answer.ok).toBe(true);
    expect(typeof answer.jobId).toBe('string');
    expect(fork).toHaveBeenCalledTimes(1);
    // `sources` is the list as it stands *now*. Reporting the requested language
    // here would show a state the database has not reached — the job has not
    // even started.
    expect(answer.sources.find((source) => source.id === 'user-zh')?.sourceLang).toBe('ja');
  });
});
