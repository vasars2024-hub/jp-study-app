// @vitest-environment jsdom
/**
 * While a restore replaces the renderer data, nothing may write over it.
 *
 * Before: after `applyRendererSnapshot` the renderer kept mirroring — a pending
 * `mirrorToIdb` from before the restore (or any store saving itself) landed on
 * top of the restored values before the relaunch, and other windows never knew
 * a restore was happening. The `before` snapshot was also taken with mirrors
 * still pending, so the copy kept aside missed the last edits, and it never
 * left the renderer's memory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb, type FakeIndexedDb } from './helpers/fakeIndexedDb';
import { DB_NAME, KV_STORE, __resetDbForTests } from '../storage/db';
import { flushPendingMirrors, mirrorToIdb, rendererWritesBlocked, setRendererWriteBlock } from '../storage/storage';
import { applyRestore } from '../storage/backupClient';
import { collectRendererSnapshot, type RendererSnapshot } from '../storage/backupSnapshot';

let fake: FakeIndexedDb;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function backupSnapshot(): Promise<RendererSnapshot> {
  localStorage.clear();
  localStorage.setItem('jp-os-theme', 'restored-theme');
  fake.seed(DB_NAME, KV_STORE, { 'flashcard-deck': { cards: ['restored'] } });
  const snap = JSON.parse(JSON.stringify(await collectRendererSnapshot({ mirrorReading: false }))) as RendererSnapshot;
  return snap;
}

function stubApi(commitReply: unknown) {
  const calls: string[] = [];
  const commitArgs: unknown[] = [];
  (window as unknown as { api: unknown }).api = {
    backupRestoreBegin: async () => {
      calls.push('begin');
    },
    backupRestoreEnd: async () => {
      calls.push('end');
    },
    backupRestoreCommit: async (_token: string, args: unknown) => {
      calls.push('commit');
      commitArgs.push(args);
      return commitReply;
    },
    backupRestoreDiscard: async () => undefined,
  };
  return { calls, commitArgs };
}

beforeEach(async () => {
  fake = installFakeIndexedDb();
  __resetDbForTests();
  const snap = await backupSnapshot();
  // The present: different data, with one mirror still pending.
  localStorage.clear();
  localStorage.setItem('jp-os-theme', 'current-theme');
  fake.seed(DB_NAME, KV_STORE, { 'flashcard-deck': { cards: ['current'] } });
  (globalThis as { __snap?: RendererSnapshot }).__snap = snap;
});

afterEach(() => {
  setRendererWriteBlock(null);
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

const snapshot = (): RendererSnapshot => (globalThis as { __snap?: RendererSnapshot }).__snap as RendererSnapshot;

describe('restore write block', () => {
  it('keeps the data it replaced — pending mirrors included — and hands it to main', async () => {
    const { calls, commitArgs } = stubApi({ ok: true, restored: 1, previousDir: 'x' });
    mirrorToIdb('flashcard-deck', { cards: ['current', 'mined a second ago'] });

    const result = await applyRestore({ kind: 'archive', token: 't', manifest: {} as never, files: 1, renderer: snapshot() });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(['begin', 'commit']);
    const before = (commitArgs[0] as { previousRenderer: RendererSnapshot }).previousRenderer;
    expect(before.localStorage['jp-os-theme']).toBe('current-theme');
    expect(JSON.stringify(before.indexedDb)).toContain('mined a second ago');
  });

  it('after the snapshot is applied, nothing in the window writes over it', async () => {
    stubApi({ ok: true, restored: 1, previousDir: 'x' });
    await applyRestore({ kind: 'archive', token: 't', manifest: {} as never, files: 1, renderer: snapshot() });
    expect(rendererWritesBlocked()).toBe('all');

    localStorage.setItem('jp-os-theme', 'written by a stale component');
    mirrorToIdb('flashcard-deck', { cards: ['stale in-memory deck'] });
    await wait(450);

    expect(localStorage.getItem('jp-os-theme')).toBe('restored-theme');
    expect(fake.rows(DB_NAME, KV_STORE)['flashcard-deck']).toEqual({ cards: ['restored'] });
  });

  it('a failed commit rolls back and lets writes resume, in this window and the others', async () => {
    const { calls } = stubApi({ ok: false, failures: [{ path: 'x.json', error: 'EBUSY' }], rollbackFailures: [] });
    const result = await applyRestore({ kind: 'archive', token: 't', manifest: {} as never, files: 1, renderer: snapshot() });
    expect(result.ok).toBe(false);
    expect(calls).toEqual(['begin', 'commit', 'end']);
    expect(rendererWritesBlocked()).toBeNull();
    expect(localStorage.getItem('jp-os-theme')).toBe('current-theme');
    localStorage.setItem('jp-os-theme', 'edited after');
    expect(localStorage.getItem('jp-os-theme')).toBe('edited after');
  });

  it('flushPendingMirrors lands a pending mirror at once', async () => {
    mirrorToIdb('calendar-events', [{ id: 1 }]);
    await flushPendingMirrors();
    expect(fake.rows(DB_NAME, KV_STORE)['calendar-events']).toEqual([{ id: 1 }]);
  });
});
