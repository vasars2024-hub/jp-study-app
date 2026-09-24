// @vitest-environment node
/**
 * The term glossaries are loaded on first use, not at boot.
 *
 * Measured on the packaged build: the bundled JMdict (en, ru) and Moedict were
 * ~260 MB of main-process heap, parsed at boot and held for the life of the
 * process, while every lookup on an installation whose stores are in SQLite is
 * answered by the database. Boot now loads the registry and the metadata (pitch,
 * IPA, frequency) only; a caller that reads the glossaries directly awaits
 * `initYomitan()`, which loads them then.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const h = vi.hoisted(() => ({ root: '', pending: [] as string[] }));

vi.mock('electron', () => ({
  app: { getPath: () => h.root },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => undefined, getAllWindows: () => [] },
}));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));
vi.mock('../dictionary/service', () => ({
  initDictionaryService: () => undefined,
  pendingLegacyStores: () => h.pending,
}));

import {
  ensureYomitanTerms,
  getPitchData,
  legacyTermsPending,
  listYomitanDicts,
  lookupGlossary,
  setYomitanLang,
} from '../dictionary/yomitan';

const TERMS = 'fixture-terms';
const PITCH = 'fixture-pitch';

function info(id: string, over: Record<string, unknown>) {
  return { id, title: id, revision: 'r', priority: 0, hasTerms: false, hasPitch: false, hasFreq: false, importedAt: 0, enabled: true, ...over };
}

beforeAll(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-yomitan-lazy-'));
  const yomitan = path.join(h.root, 'yomitan');
  for (const id of [TERMS, PITCH]) fs.mkdirSync(path.join(yomitan, id), { recursive: true });
  fs.writeFileSync(path.join(yomitan, 'registry.json'), JSON.stringify({
    dicts: [info(TERMS, { hasTerms: true, glossLangs: ['en'] }), info(PITCH, { hasPitch: true })],
  }));
  fs.writeFileSync(path.join(yomitan, TERMS, 'index.json'), JSON.stringify({
    version: 1,
    terms: { 食べる: [{ word: '食べる', reading: 'たべる', score: 5, senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: [] }] }] },
  }));
  fs.writeFileSync(path.join(yomitan, PITCH, 'index.json'), JSON.stringify({
    version: 1,
    pitch: { '食べる\u0001たべる': { reading: 'たべる', positions: [2] } },
  }));
  // Reloads the registry and the indices without provisioning (no network).
  setYomitanLang(TERMS, '');
});

afterAll(() => {
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe('yomitan lazy term glossaries', () => {
  it('loads the registry and the metadata without the glossaries', () => {
    expect(listYomitanDicts().map((d) => d.id)).toEqual([TERMS, PITCH]);
    expect(getPitchData('食べる', 'たべる')).toEqual({ available: true, entries: [{ reading: 'たべる', positions: [2] }] });
    expect(lookupGlossary('食べる')).toEqual([]);
  });

  it('loads the glossaries on first use, and keeps them through a registry reload', () => {
    ensureYomitanTerms();
    expect(lookupGlossary('食べる').map((e) => e.word)).toEqual(['食べる']);
    setYomitanLang(TERMS, '');
    expect(lookupGlossary('食べる').map((e) => e.word)).toEqual(['食べる']);
    expect(getPitchData('食べる', 'たべる').available).toBe(true);
  });

  it('says the glossaries are needed only while a term store waits for its database import', () => {
    h.pending = [];
    expect(legacyTermsPending()).toBe(false);
    h.pending = [PITCH]; // a metadata-only store does not need the glossaries
    expect(legacyTermsPending()).toBe(false);
    h.pending = [TERMS];
    expect(legacyTermsPending()).toBe(true);
  });
});
