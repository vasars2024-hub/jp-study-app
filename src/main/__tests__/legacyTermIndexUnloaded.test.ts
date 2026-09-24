// @vitest-environment node
/**
 * The legacy term index stays unloaded while its consumers are used.
 *
 * Measured on the packaged build: the in-memory Yomitan glossaries (bundled
 * JMdict en/ru and Moedict) are ~260 MB of main-process heap. Boot stopped
 * loading them in 91eec62a, but the extension lookup, the VN/mining gloss batch,
 * mining's lemma readings, the Deck Workbench enrichment and `lookupTermOffline`
 * still read them directly, so using any of those loaded them back for the rest
 * of the session. They now read the dictionary database; the legacy index loads
 * only as the migration fallback, for a term store SQLite does not own yet.
 *
 * The real modules run against a real SQLite database. The legacy readers are
 * wrapped in spies, and `yomitanTermsLoaded()` reports the loader's own state,
 * which also catches a load from inside `yomitan.ts` that no spy can see.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const h = vi.hoisted(() => ({ root: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => h.root, isPackaged: false, getAppPath: () => h.root, on: () => undefined },
  ipcMain: { handle: () => undefined, on: () => undefined },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => undefined, getAllWindows: () => [] },
}));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));

vi.mock('../dictionary/yomitan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dictionary/yomitan')>();
  return {
    ...actual,
    ensureYomitanTerms: vi.fn(actual.ensureYomitanTerms),
    lookupGlossary: vi.fn(actual.lookupGlossary),
    lookupOfflineDeinflected: vi.fn(actual.lookupOfflineDeinflected),
    lookupTermMerged: vi.fn(actual.lookupTermMerged),
  };
});

import { dictionaryDb, closeDictionaryDb } from '../dictionary/db';
import { importLegacyIndex, type LegacyDictIndex } from '../dictionary/migrate';
import * as yomitan from '../dictionary/yomitan';
import { enrichTermsBatch } from '../dictionary/enrichService';
import {
  lookupHeadwordReadings,
  lookupOfflineInterlinearMerged,
  lookupTerm,
  lookupTermOffline,
  lookupTermsBatch,
} from '../dictionary';
import { candidateLookupKey } from '../../shared/epubEnrichment';
import type { YomitanDictInfo } from '../../shared/types';

function info(id: string, title: string, priority: number, glossLangs: string[]): YomitanDictInfo {
  return {
    id, title, revision: 'r', priority, hasTerms: true, hasPitch: false, hasFreq: false,
    importedAt: 0, enabled: true, glossLangs,
  };
}

function sense(definition: string) {
  return { partsOfSpeech: ['n'], definitions: [definition], tags: [] };
}

const EN: LegacyDictIndex = {
  version: 1,
  info: info('fixture-jmdict-en', 'JMdict EN', 0, ['en']),
  terms: {
    猫: [{ word: '猫', reading: 'ねこ', score: 5, senses: [sense('cat')] }],
    食べる: [{ word: '食べる', reading: 'たべる', score: 5, senses: [sense('to eat')] }],
    行く: [
      { word: '行く', reading: 'いく', score: 9, senses: [sense('to go')] },
      { word: '行く', reading: 'ゆく', score: 1, senses: [sense('to go (literary)')] },
    ],
  },
};

const RU: LegacyDictIndex = {
  version: 1,
  info: info('fixture-jmdict-ru', 'JMdict RU', 1, ['ru']),
  terms: { 猫: [{ word: '猫', reading: 'ねこ', score: 5, senses: [sense('кошка')] }] },
};

/** On disk only: the store a queued import has not reached yet. */
const PENDING: LegacyDictIndex = {
  version: 1,
  info: info('fixture-pending', 'Pending', 2, ['en']),
  terms: { 麒麟: [{ word: '麒麟', reading: 'きりん', score: 1, senses: [sense('giraffe')] }] },
};

function writeStore(index: LegacyDictIndex): void {
  const dir = path.join(h.root, 'yomitan', index.info.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
}

function writeRegistry(stores: LegacyDictIndex[]): void {
  fs.writeFileSync(
    path.join(h.root, 'yomitan', 'registry.json'),
    JSON.stringify({ dicts: stores.map((store) => store.info) }),
  );
}

const realFetch = globalThis.fetch;

beforeAll(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-legacy-unloaded-'));
  // Provisioning the bundled stores is a download; offline, it gives up at once.
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as typeof fetch;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  for (const store of [EN, RU]) {
    writeStore(store);
    importLegacyIndex(dictionaryDb(), store);
  }
  writeRegistry([EN, RU]);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  closeDictionaryDb();
  fs.rmSync(h.root, { recursive: true, force: true });
});

function expectLegacyUntouched(): void {
  expect(yomitan.yomitanTermsLoaded()).toBe(false);
  expect(yomitan.ensureYomitanTerms).not.toHaveBeenCalled();
  expect(yomitan.lookupGlossary).not.toHaveBeenCalled();
  expect(yomitan.lookupOfflineDeinflected).not.toHaveBeenCalled();
}

describe('legacy term index, every store migrated', () => {
  it('lookupTermOffline (and the extension /v1/lookup that calls it) answers from the database', async () => {
    const eaten = await lookupTermOffline('食べた');
    expect(eaten.entries[0]).toMatchObject({ word: '食べる', reading: 'たべる', source: 'JMdict EN' });
    expect(eaten.entries[0].senses[0].definitions).toEqual(['to eat']);
    expect(eaten.deinflection?.term).toBe('食べる');

    // One entry per gloss language, credited to its own dictionary — the shape
    // the legacy index answered with, not the database's merged entry.
    const cat = await lookupTermOffline('猫');
    expect(cat.entries.map((e) => [e.source, e.sourceLangs, e.senses[0].definitions[0]])).toEqual([
      ['JMdict EN', ['en'], 'cat'],
      ['JMdict RU', ['ru'], 'кошка'],
    ]);
    expectLegacyUntouched();
  });

  it('the VN/mining gloss batch resolves every language from the database', async () => {
    const out = await lookupTermsBatch([{ expression: '猫' }, { expression: '麒麟' }], ['en', 'ru']);
    expect(out[candidateLookupKey('猫')]).toEqual({ en: 'cat', ru: 'кошка' });
    expect(out[candidateLookupKey('麒麟')]).toEqual({ en: '', ru: '' });
    expectLegacyUntouched();
  });

  it("mining's lemma readings come from the database, best first", async () => {
    const readings = await lookupHeadwordReadings(['行く', '猫', '麒麟']);
    expect(readings.get('行く')).toEqual(['いく', 'ゆく']);
    expect(readings.get('猫')).toEqual(['ねこ', 'ねこ']);
    expect(readings.has('麒麟')).toBe(false);
    expectLegacyUntouched();
  });

  it('the Deck Workbench enrichment does not fall back to the legacy index for a miss', async () => {
    const out = await enrichTermsBatch(['猫', '麒麟']);
    expect(Object.keys(out)).toEqual(['猫']);
    expectLegacyUntouched();
  });

  it('the pop-up miss path and the interlinear do not load it either', async () => {
    await lookupTerm('麒麟');
    await lookupOfflineInterlinearMerged('猫を食べた', { sourceLangs: ['ja'] });
    expectLegacyUntouched();
  });
});

describe('legacy term index, a store waiting for its database import', () => {
  it('is the fallback for that store, and is released once the import lands', async () => {
    writeStore(PENDING);
    writeRegistry([EN, RU, PENDING]);
    // Reloads the registry without provisioning.
    yomitan.setYomitanLang(PENDING.info.id, '');

    const kirin = await lookupTermOffline('麒麟');
    expect(kirin.entries.map((e) => e.word)).toEqual(['麒麟']);
    expect(yomitan.yomitanTermsLoaded()).toBe(true);
    expect(yomitan.releaseYomitanTermsIfMigrated()).toBe(false);

    importLegacyIndex(dictionaryDb(), PENDING);
    expect(yomitan.releaseYomitanTermsIfMigrated()).toBe(true);
    expect(yomitan.yomitanTermsLoaded()).toBe(false);
    expect(yomitan.lookupGlossary('麒麟')).toEqual([]);
    // Still answered — by the database now.
    expect((await lookupTermOffline('麒麟')).entries[0].senses[0].definitions).toEqual(['giraffe']);
    expect(yomitan.yomitanTermsLoaded()).toBe(false);
  });
});
