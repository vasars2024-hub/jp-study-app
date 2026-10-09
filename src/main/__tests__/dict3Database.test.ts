// @vitest-environment node
//
// dict3 — the database half of Yomitan parity: schema step 14 gives JMdict
// priority codes a column, the import writes them and per-sense structured HTML,
// a lookup credits each sense of a cross-dictionary entry to its dictionary, and
// the extension's entry list follows the user's grouped/merged choice. Plus the
// audio fallback chain over a real local folder.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';
vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
  dialog: {},
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
}));

import { closeDictionaryDb, dictionaryDb } from '../dictionary/db';
import { importLegacyIndex, type LegacyDictIndex } from '../dictionary/migrate';
import { lookup } from '../dictionary/dictService';
import { lookupResultToDictResult } from '../dictionary/lexiconAdapter';
import { DICT_SCHEMA_VERSION } from '../dictionary/schema';
import { arrangeEntriesForExtension } from '../dictionary/wireArrange';
import { resetDictDisplayPrefsCache, writeDictDisplayPrefs } from '../dictionary/displayPrefs';
import {
  findLocalAudioFile,
  readAudioSourcesPrefs,
  resetAudioSourcesForTests,
  resolveAudioChain,
  writeAudioSourcesPrefs,
} from '../dictionary/audioSources';
import type { LexiconAudioResult } from '../../shared/lexiconAudio';
import type { DictEntry } from '../../shared/types';

function store(id: string, priority: number, terms: LegacyDictIndex['terms']): LegacyDictIndex {
  return {
    version: 1,
    info: {
      id, title: id.toUpperCase(), revision: '1', priority, hasTerms: true, hasPitch: false, hasFreq: false,
      importedAt: 1, glossLangs: ['en'], enabled: true,
    },
    terms,
  };
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dict3-db-'));
  resetDictDisplayPrefsCache();
  resetAudioSourcesForTests();
});

afterEach(() => {
  closeDictionaryDb();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('schema step 14', () => {
  it('adds the priority column and stamps the version', () => {
    const db = dictionaryDb();
    expect(DICT_SCHEMA_VERSION).toBe(14);
    const columns = (db.prepare('PRAGMA table_info(headwords)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain('prio');
  });
});

describe('priority codes and per-sense HTML through the database', () => {
  beforeEach(() => {
    const db = dictionaryDb();
    importLegacyIndex(db, store('alpha', 0, {
      猫: [{ word: '猫', reading: 'ねこ', score: 0, prio: ['news1', 'P', 'nf02'], senses: [{ partsOfSpeech: ['n'], definitions: ['cat'], tags: [] }] }],
      食べる: [{
        word: '食べる', reading: 'たべる', score: 0, glossaryHtml: '<ul><li>to eat</li></ul><br><ul><li>to live on</li></ul>',
        senses: [
          { partsOfSpeech: ['v1'], definitions: ['to eat'], tags: [], html: '<ul><li>to eat</li></ul>' },
          { partsOfSpeech: ['v1'], definitions: ['to live on'], tags: ['colloquialism'], html: '<ul><li>to live on</li></ul>' },
        ],
      }],
    }));
    importLegacyIndex(db, store('beta', 1, {
      猫: [{ word: '猫', reading: 'ねこ', score: 0, senses: [{ partsOfSpeech: ['n'], definitions: ['feline'], tags: [] }] }],
    }));
  });

  it('carries the codes the row had (only JMdict codes) and marks the word common', () => {
    const result = lookupResultToDictResult(lookup(dictionaryDb(), { text: '猫', sourceLangs: ['ja'] }));
    const neko = result.entries.find((e) => e.word === '猫');
    expect(neko?.priorityTags).toEqual(['news1', 'nf02']);
    expect(neko?.isCommon).toBe(true);
  });

  it('credits each sense of a cross-dictionary entry to the dictionary it came from', () => {
    const result = lookupResultToDictResult(lookup(dictionaryDb(), { text: '猫', sourceLangs: ['ja'] }));
    const neko = result.entries.find((e) => e.word === '猫');
    expect(neko?.senses.map((s) => [s.source, s.definitions[0]])).toEqual([['ALPHA', 'cat'], ['BETA', 'feline']]);
  });

  it('renders marked senses one by one instead of the whole-entry block', () => {
    const result = lookupResultToDictResult(lookup(dictionaryDb(), { text: '食べる', sourceLangs: ['ja'] }));
    const taberu = result.entries[0];
    expect(taberu.glossaryHtml).toBeUndefined();
    expect(taberu.senses.map((s) => s.html)).toEqual(['<ul><li>to eat</li></ul>', '<ul><li>to live on</li></ul>']);
    expect(taberu.senses[1].tags).toEqual(['colloquialism']);
    // A single-source entry gains no per-sense credit.
    expect(taberu.senses.some((s) => s.source)).toBe(false);
  });

  it('reports each entry’s own conjugation chain', () => {
    const result = lookupResultToDictResult(lookup(dictionaryDb(), { text: '食べさせられなかった', sourceLangs: ['ja'] }));
    const taberu = result.entries.find((e) => e.word === '食べる');
    expect(taberu?.inflection).toEqual(['causative', 'passive/potential', 'negative', 'past']);
    expect(result.deinflection?.reasons).toEqual(['causative', 'passive/potential', 'negative', 'past']);
  });
});

describe('the extension follows the display setting', () => {
  const entries: DictEntry[] = [
    { word: '猫', reading: 'ねこ', isCommon: false, jlpt: [], source: 'BETA', senses: [{ partsOfSpeech: [], definitions: ['feline'], tags: [] }] },
    { word: '猫', reading: 'ねこ', isCommon: true, jlpt: [], source: 'ALPHA', senses: [{ partsOfSpeech: [], definitions: ['cat'], tags: [] }] },
  ];

  it('groups by default: the lookup’s first dictionary first, the rest marked collapsed', () => {
    expect(arrangeEntriesForExtension(entries).map((e) => [e.source, e.collapsed === true]))
      .toEqual([['BETA', false], ['ALPHA', true]]);
    // An explicit order, when a caller has one, wins over arrival order.
    expect(arrangeEntriesForExtension(entries, ['ALPHA', 'BETA']).map((e) => e.source)).toEqual(['ALPHA', 'BETA']);
  });

  it('merges into one entry when the user chose merged', () => {
    writeDictDisplayPrefs({ mode: 'merged', collapseSecondary: true });
    const out = arrangeEntriesForExtension(entries);
    expect(out).toHaveLength(1);
    expect(out[0].senses.map((s) => s.source)).toEqual(['BETA', 'ALPHA']);
  });
});

describe('audio sources: local folders and the fallback chain', () => {
  let folder = '';
  const remote = vi.fn(async (): Promise<LexiconAudioResult> => ({ query: '', status: 'offline' }));

  beforeEach(() => {
    folder = path.join(tempRoot, 'audio');
    fs.mkdirSync(path.join(folder, 'jpod_files'), { recursive: true });
    fs.mkdirSync(path.join(folder, 'forvo_files', 'someone'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'jpod_files', 'ねこ - 猫.mp3'), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(folder, 'forvo_files', 'someone', '犬.ogg'), Buffer.from([4, 5]));
    fs.writeFileSync(path.join(folder, 'forvo_files', 'someone', 'notes.txt'), 'not audio');
    remote.mockClear();
  });

  const prefs = () => writeAudioSourcesPrefs({
    sources: [
      { id: 'local-1', kind: 'local', enabled: true, folder },
      { id: 'jpod101', kind: 'jpod101', enabled: true },
    ],
  });

  it('persists the ordered list and reads it back', () => {
    prefs();
    expect(readAudioSourcesPrefs().sources.map((s) => s.id)).toEqual(['local-1', 'jpod101']);
  });

  it('finds both layouts and ignores non-audio files', async () => {
    expect(await findLocalAudioFile(folder, '猫', 'ねこ')).toBe(path.join(folder, 'jpod_files', 'ねこ - 猫.mp3'));
    expect(await findLocalAudioFile(folder, '犬', 'いぬ')).toBe(path.join(folder, 'forvo_files', 'someone', '犬.ogg'));
    expect(await findLocalAudioFile(folder, 'notes')).toBeNull();
  });

  it('plays a local recording first without touching the network', async () => {
    const out = await resolveAudioChain({ lang: 'ja', term: '犬', reading: 'いぬ' }, prefs(), remote);
    expect(out.status).toBe('ready');
    expect(out.sourceId).toBe('local-1');
    expect(out.clip?.mimeType).toBe('audio/ogg');
    expect(out.clip?.dataBase64).toBe(Buffer.from([4, 5]).toString('base64'));
    expect(remote).not.toHaveBeenCalled();
  });

  it('falls through to the CDN, and says "offline" rather than "none" when that failed', async () => {
    const out = await resolveAudioChain({ lang: 'ja', term: '鳥', reading: 'とり' }, prefs(), remote);
    expect(remote).toHaveBeenCalledTimes(1);
    expect(out.status).toBe('offline');
  });

  it('asks only the picked source', async () => {
    const out = await resolveAudioChain({ lang: 'ja', term: '鳥', reading: 'とり', sourceId: 'local-1' }, prefs(), remote);
    expect(out.status).toBe('none');
    expect(remote).not.toHaveBeenCalled();
  });

  it('skips a disabled source', async () => {
    const disabled = writeAudioSourcesPrefs({
      sources: [{ id: 'local-1', kind: 'local', enabled: false, folder }, { id: 'jpod101', kind: 'jpod101', enabled: true }],
    });
    remote.mockResolvedValueOnce({ query: '猫', status: 'none' });
    const out = await resolveAudioChain({ lang: 'ja', term: '猫', reading: 'ねこ' }, disabled, remote);
    expect(out.status).toBe('none');
    expect(remote).toHaveBeenCalledTimes(1);
  });
});
