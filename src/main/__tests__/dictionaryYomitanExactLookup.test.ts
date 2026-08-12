// @vitest-environment node
//
// The prefix scan is the whole point of this file. `lookupOffline` falls back to
// "any headword starting with the query, capped at 8" when the exact term is
// missing, which is right for a pop-up over a partial selection and wrong for a
// per-token interlinear gloss — and `DictEntry` does not record which of the two
// happened, so a caller cannot filter it out afterwards. `exactOnly` is the seam
// that lets the Workbench opt out, and these tests are what keep it honest.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => undefined, getAllWindows: () => [] },
}));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));
// The real one opens a SQLite database in userData; nothing here reads it.
vi.mock('../dictionary/service', () => ({ initDictionaryService: () => undefined }));

import { lookupGlossary, lookupOfflineDeinflected, setYomitanLang } from '../dictionary/yomitan';

const DICT_ID = 'fixture-jmdict-en';

function seedStore(): void {
  const dir = path.join(tempRoot, 'yomitan', DICT_ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, 'yomitan', 'registry.json'),
    JSON.stringify({
      dicts: [{
        id: DICT_ID,
        title: 'Fixture JMdict',
        revision: 'fixture',
        priority: 0,
        hasTerms: true,
        hasPitch: false,
        hasFreq: false,
        importedAt: 0,
        enabled: true,
        glossLangs: ['en'],
      }],
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({
      version: 1,
      info: {
        id: DICT_ID,
        title: 'Fixture JMdict',
        revision: 'fixture',
        priority: 0,
        hasTerms: true,
        hasPitch: false,
        hasFreq: false,
        importedAt: 0,
        glossLangs: ['en'],
      },
      terms: {
        猫舌: [{
          word: '猫舌',
          reading: 'ねこじた',
          score: 1,
          senses: [{ partsOfSpeech: ['n'], definitions: ['dislike of hot food'], tags: [] }],
        }],
        食べる: [{
          word: '食べる',
          reading: 'たべる',
          score: 5,
          senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: [] }],
        }],
      },
    }),
  );
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-yomitan-exact-'));
  seedStore();
  // The only exported call that reloads the merged indices without touching the
  // network; clearing an override that was never set leaves the registry's
  // meaning unchanged.
  setYomitanLang(DICT_ID, '');
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('lookupOfflineDeinflected exactOnly', () => {
  it('returns the prefix hit by default, which is what the pop-up wants', () => {
    expect(lookupOfflineDeinflected('猫').entries.map((e) => e.word)).toEqual(['猫舌']);
    expect(lookupGlossary('猫').map((e) => e.word)).toEqual(['猫舌']);
  });

  it('refuses the prefix hit when the caller asked for exact only', () => {
    expect(lookupOfflineDeinflected('猫', true).entries).toEqual([]);
  });

  it('still resolves an exact term and a conjugated form under exact only', () => {
    expect(lookupOfflineDeinflected('猫舌', true).entries.map((e) => e.word)).toEqual(['猫舌']);

    const past = lookupOfflineDeinflected('食べた', true);
    expect(past.entries.map((e) => e.word)).toEqual(['食べる']);
    expect(past.deinflection).toMatchObject({ source: '食べた', term: '食べる' });
  });
});
