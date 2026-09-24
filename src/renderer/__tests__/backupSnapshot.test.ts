// @vitest-environment node
/**
 * The renderer half of backup/restore (audit robust #1): round trip, a failed
 * write rolls everything back, and the OLD single-JSON export still restores.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeLocalStorage, installFakeIndexedDb, type FakeIndexedDb } from './helpers/fakeIndexedDb';
import {
  SnapshotApplyError,
  applyRendererSnapshot,
  collectRendererSnapshot,
  isLegacyBackup,
  legacyToSnapshot,
  type RendererSnapshot,
} from '../storage/backupSnapshot';
import { DB_NAME, KV_STORE } from '../storage/db';

let fake: FakeIndexedDb;
let ls: FakeLocalStorage;

beforeEach(() => {
  fake = installFakeIndexedDb();
  ls = new FakeLocalStorage();
  vi.stubGlobal('localStorage', ls);
});

function seedOriginal(): void {
  ls.setItem('jp-os-theme', 'dark');
  ls.setItem('jp-flashcard-deck', '{"cards":[1,2]}');
  fake.seed(DB_NAME, KV_STORE, {
    'flashcard-deck': { cards: [1, 2], at: new Date('2026-01-02T03:04:05.000Z') },
    'level-lists': { n5: ['食べる'] },
  });
}

describe('renderer snapshot', () => {
  it('round-trips localStorage and IndexedDB, including non-JSON values, through JSON', async () => {
    seedOriginal();
    const snap = JSON.parse(JSON.stringify(await collectRendererSnapshot({ mirrorReading: false }))) as RendererSnapshot;
    // A different profile (think: the packaged build restoring a dev backup).
    fake = installFakeIndexedDb();
    ls = new FakeLocalStorage();
    vi.stubGlobal('localStorage', ls);
    ls.setItem('stale', 'x');
    await applyRendererSnapshot(snap);
    expect(ls.snapshot()).toEqual({ 'jp-os-theme': 'dark', 'jp-flashcard-deck': '{"cards":[1,2]}' });
    const rows = fake.rows(DB_NAME, KV_STORE);
    expect(rows['level-lists']).toEqual({ n5: ['食べる'] });
    const deck = rows['flashcard-deck'] as { at: Date };
    expect(deck.at).toBeInstanceOf(Date);
    expect(deck.at.toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });

  it('a failed IndexedDB write leaves both stores exactly as they were', async () => {
    seedOriginal();
    const before = { ls: ls.snapshot(), idb: fake.rows(DB_NAME, KV_STORE) };
    const incoming: RendererSnapshot = legacyToSnapshot({
      app: 'jp-study-app',
      localStorage: { 'jp-os-theme': 'light' },
      indexedDb: { 'flashcard-deck': { cards: [] }, 'csv-editor': 'x' },
    });
    fake.failNext('put', 'QuotaExceededError', 'quota', 1, 'csv-editor');
    const err = await applyRendererSnapshot(incoming).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SnapshotApplyError);
    expect((err as SnapshotApplyError).failures[0]).toMatchObject({ area: 'indexedDb', target: DB_NAME });
    expect((err as SnapshotApplyError).rollbackFailures).toEqual([]);
    expect(ls.snapshot()).toEqual(before.ls);
    expect(fake.rows(DB_NAME, KV_STORE)).toEqual(before.idb);
  });

  it('a failed localStorage write is reported by key and rolled back', async () => {
    seedOriginal();
    const before = ls.snapshot();
    ls.failKey = 'jp-huge';
    const err = await applyRendererSnapshot(legacyToSnapshot({
      app: 'jp-study-app',
      localStorage: { a: '1', 'jp-huge': 'x' },
      indexedDb: {},
    })).catch((e: unknown) => e);
    ls.failKey = null;
    expect((err as SnapshotApplyError).failures).toEqual([
      expect.objectContaining({ area: 'localStorage', target: 'jp-huge' }),
    ]);
    expect(ls.snapshot()).toEqual(before);
  });

  it('rollback() puts back the pre-restore state (main-side swap failed)', async () => {
    seedOriginal();
    const before = { ls: ls.snapshot(), idb: fake.rows(DB_NAME, KV_STORE) };
    const { rollback } = await applyRendererSnapshot(legacyToSnapshot({
      app: 'jp-study-app', localStorage: { only: '1' }, indexedDb: { only: 1 },
    }));
    expect(ls.snapshot()).toEqual({ only: '1' });
    await rollback();
    expect(ls.snapshot()).toEqual(before.ls);
    expect(fake.rows(DB_NAME, KV_STORE)).toEqual(before.idb);
  });
});

describe('old-format import', () => {
  it('restores a format-2 export produced by the previous "Export all settings"', async () => {
    const old = {
      app: 'jp-study-app',
      format: 2,
      exportedAt: 1_750_000_000_000,
      localStorage: { 'jp-os-theme': 'sakura', 'jp-flashcard-deck': '{"cards":[9]}' },
      indexedDb: { 'flashcard-deck': { cards: [9] }, 'grammar-familiarity': { v: 1, points: { a: 2 } } },
      host: { mining: {} },
      domains: [],
    };
    expect(isLegacyBackup(old)).toBe(true);
    await applyRendererSnapshot(legacyToSnapshot(old));
    expect(ls.snapshot()).toEqual(old.localStorage);
    expect(fake.rows(DB_NAME, KV_STORE)).toEqual(old.indexedDb);
    expect(isLegacyBackup({ app: 'other', localStorage: {}, indexedDb: {} })).toBe(false);
  });
});
