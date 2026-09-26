// @vitest-environment node
/**
 * The main process never parses the legacy term glossaries.
 *
 * While a term store waited for its first SQLite import, `initYomitan()` used to
 * load every legacy glossary as the fallback — ~151 MB of JSON parsed on
 * Electron's main thread by the first lookup of each boot, freezing the whole
 * app for 7.5–10.4 s on every launch of the ~13-minute first import. Lookups in
 * that window now use what SQLite already has plus the online fallback, and say
 * the dictionary is being prepared.
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
  initYomitan,
  legacyTermsPending,
  lookupGlossary,
  onYomitanStoresReady,
  yomitanTermsLoaded,
} from '../dictionary/yomitan';

const TERMS = 'fixture-terms';

beforeAll(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-yomitan-nomain-'));
  const yomitan = path.join(h.root, 'yomitan');
  fs.mkdirSync(path.join(yomitan, TERMS), { recursive: true });
  fs.writeFileSync(path.join(yomitan, 'registry.json'), JSON.stringify({
    dicts: [{ id: TERMS, title: TERMS, revision: 'r', priority: 0, hasTerms: true, hasPitch: false, hasFreq: false, importedAt: 0, enabled: true, glossLangs: ['en'] }],
  }));
  fs.writeFileSync(path.join(yomitan, TERMS, 'index.json'), JSON.stringify({
    version: 1,
    terms: { 食べる: [{ word: '食べる', reading: 'たべる', score: 5, senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: [] }] }] },
  }));
  // No network in tests: provisioning the bundled stores fails fast and is skipped.
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
});

afterAll(() => {
  vi.unstubAllGlobals();
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe('legacy term glossaries on the main process', () => {
  it('are not loaded while a term store waits for its database import', async () => {
    h.pending = [TERMS];
    const ready: Array<string | null> = [];
    const off = onYomitanStoresReady((id) => ready.push(id));
    expect(await initYomitan()).toBe(false);
    off();
    expect(legacyTermsPending()).toBe(true);
    expect(yomitanTermsLoaded()).toBe(false);
    expect(lookupGlossary('食べる')).toEqual([]);
    // The import is started from the stores already on disk, before any download.
    expect(ready[0]).toBeNull();
  });
});
