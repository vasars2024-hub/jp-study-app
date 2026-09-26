// @vitest-environment node
/**
 * A Russian lookup is answered by a Russian dictionary, never by a Japanese one.
 *
 * Found at runtime (audit 4): with the study language set to Russian, clicking
 * «погода» in the live-captions bar showed 天気 from JMdict (Japanese–Russian).
 * The pop-up asked `dict:lookupTerm` with no language, so the database searched
 * every dictionary's glosses and JMdict's Russian gloss «погода» answered as if
 * it were a Russian headword. A gloss-language dictionary must never answer a
 * study-language lookup; with no Russian dictionary installed the result says so,
 * so the pop-up can point at Models & dictionaries instead of showing Japanese.
 *
 * Real modules, real (temporary) SQLite database.
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

import { dictionaryDb, closeDictionaryDb } from '../dictionary/db';
import { importLegacyIndex, type LegacyDictIndex } from '../dictionary/migrate';
import { importWiktextract } from '../dictionary/importers/wiktextract';
import { lookupTerm, lookupTermOffline } from '../dictionary';
import type { YomitanDictInfo } from '../../shared/types';

function info(id: string, title: string, glossLangs: string[]): YomitanDictInfo {
  return {
    id, title, revision: 'r', priority: 0, hasTerms: true, hasPitch: false, hasFreq: false,
    importedAt: 0, enabled: true, glossLangs,
  };
}

/** Japanese headwords with Russian glosses: a gloss-language dictionary for Russian. */
const JMDICT_RU: LegacyDictIndex = {
  version: 1,
  info: info('fixture-jmdict-ru', 'JMdict RU', ['ru']),
  terms: {
    天気: [{ word: '天気', reading: 'てんき', score: 5, senses: [{ partsOfSpeech: ['n'], definitions: ['погода'], tags: [] }] }],
  },
};

const POGODA = {
  word: 'погода',
  lang_code: 'ru',
  pos: 'noun',
  senses: [{ glosses: ['weather'] }],
  forms: [{ form: 'пого́да', tags: ['canonical'] }, { form: 'пого́ды', tags: ['genitive', 'singular'] }],
};

const realFetch = globalThis.fetch;

beforeAll(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-studylang-lookup-'));
  // Jisho is the Japanese online fallback; a Russian lookup must never reach it.
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as typeof fetch;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  importLegacyIndex(dictionaryDb(), JMDICT_RU);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  closeDictionaryDb();
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe('a Russian lookup with only a Japanese–Russian dictionary installed', () => {
  it('the pop-up lookup shows no Japanese entry and says no Russian dictionary is installed', async () => {
    const out = await lookupTerm('погода', undefined, 'ru');
    expect(out.entries.map((entry) => entry.word)).toEqual([]);
    expect(out.missingSourceLangs).toEqual(['ru']);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an inflected form does not reach Japanese entries either', async () => {
    const out = await lookupTerm('погоды', undefined, 'ru');
    expect(out.entries).toEqual([]);
  });

  it('the offline lookup (extension, mining) says so too', async () => {
    const out = await lookupTermOffline('погода', 'ru');
    expect(out.entries).toEqual([]);
    expect(out.missingSourceLangs).toEqual(['ru']);
  });

  it('a Japanese lookup still reaches JMdict', async () => {
    const out = await lookupTerm('天気', undefined, 'ja');
    expect(out.entries[0]?.word).toBe('天気');
    expect(out.missingSourceLangs).toBeUndefined();
  });
});

describe('once a Russian dictionary is installed', () => {
  beforeAll(() => {
    importWiktextract(dictionaryDb(), [JSON.stringify(POGODA)], { dictId: 'wiktionary-ru' });
  });

  it('the Russian headword answers, and the Japanese gloss hit stays out', async () => {
    const out = await lookupTerm('погода', undefined, 'ru');
    expect(out.entries.map((entry) => entry.word)).toEqual(['погода']);
    expect(out.missingSourceLangs).toBeUndefined();
  });

  it('an inflected form reaches the lemma', async () => {
    const out = await lookupTerm('погоды', undefined, 'ru');
    expect(out.entries.map((entry) => entry.word)).toEqual(['погода']);
  });

  it('a word the Russian dictionary lacks is a plain miss, not a Japanese reverse hit', async () => {
    const out = await lookupTerm('кошка', undefined, 'ru');
    expect(out.entries).toEqual([]);
    expect(out.missingSourceLangs).toBeUndefined();
  });
});
