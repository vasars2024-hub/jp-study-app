// @vitest-environment node
//
// A corpus rank is merged across every installed frequency bank and the lowest
// number wins. That merge threw the winner's identity away, so the Lexicon
// printed a bare `#81` with nothing to attribute it to — and the banks are not
// all in the same language, which is exactly how a 390-entry Chinese list came
// to out-rank JPDB on a Japanese word in the mining path (see
// `resolveCustomFrequencyRanks` in main/mining.ts for that measurement).
//
// This goes through the real `importYomitanZip` rather than calling the merge
// directly, because the thing most likely to break is the source never reaching
// the in-memory index at all: `mergeStoredIndex` already had `sourceTitle` in
// hand for the glossary branch and simply did not pass it to the freq branch.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => undefined, getAllWindows: () => [] },
}));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));
vi.mock('../dictionary/service', () => ({ initDictionaryService: () => undefined }));

import { getFrequencyDetail, getFrequencyRank, importYomitanZip } from '../dictionary/yomitan';

/** `[term, mode, data]`, as a v3 term-meta bank writes a frequency row. */
function freqBank(rows: unknown[][]): unknown[][] {
  return rows;
}

async function importFreqDict(title: string, rows: unknown[][]): Promise<void> {
  const zipPath = path.join(tempRoot, `${title.replace(/\W+/g, '-')}.zip`);
  const zip = new AdmZip();
  zip.addFile('index.json', Buffer.from(JSON.stringify({ title, revision: 'r1', format: 3 })));
  zip.addFile('term_meta_bank_1.json', Buffer.from(JSON.stringify(rows)));
  zip.writeZip(zipPath);
  const res = await importYomitanZip(zipPath);
  expect(res.ok).toBe(true);
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jsa-freqsrc-'));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('corpus frequency attribution', () => {
  it('remembers which dictionary supplied a rank', async () => {
    await importFreqDict('JPDB Fixture', freqBank([['本', 'freq', 357]]));

    expect(getFrequencyDetail('本')).toEqual({ rank: 357, source: 'JPDB Fixture' });
  });

  it('attributes the rank to the list that actually won the merge', async () => {
    await importFreqDict('JPDB Fixture', freqBank([['本', 'freq', 357]]));
    await importFreqDict('Chinese Core Fixture', freqBank([['本', 'freq', 81]]));

    // 81 < 357, so the Chinese list wins the lowest-rank merge exactly as it did
    // before. What changed is that the surface can now say so instead of
    // printing the number under no name at all.
    expect(getFrequencyDetail('本')).toEqual({ rank: 81, source: 'Chinese Core Fixture' });
  });

  it('does not let a losing list claim the rank, whatever the import order', async () => {
    await importFreqDict('Chinese Core Fixture', freqBank([['本', 'freq', 81]]));
    await importFreqDict('JPDB Fixture', freqBank([['本', 'freq', 357]]));

    expect(getFrequencyDetail('本')).toEqual({ rank: 81, source: 'Chinese Core Fixture' });
  });

  it('keeps the reading-keyed rank attributed to its own list', async () => {
    await importFreqDict(
      'Reading Keyed Fixture',
      freqBank([['私', 'freq', { reading: 'わたし', frequency: 32 }]]),
    );

    expect(getFrequencyDetail('私', 'わたし')).toEqual({
      rank: 32,
      source: 'Reading Keyed Fixture',
    });
  });

  it('reports nothing for a word no list ranked', async () => {
    await importFreqDict('JPDB Fixture', freqBank([['本', 'freq', 357]]));

    expect(getFrequencyDetail('猫')).toBeUndefined();
    expect(getFrequencyRank('猫')).toBeUndefined();
  });

  it('keeps the bare-rank accessor answering the same number it always did', async () => {
    await importFreqDict('JPDB Fixture', freqBank([['本', 'freq', 357]]));

    expect(getFrequencyRank('本')).toBe(357);
  });

  // `importYomitanZip` derives the title from `index.json` with
  // `String(indexJson.title ?? path.basename(...))`, and `??` does not treat an
  // explicit empty string as absent — so an untitled bank imports fine and lands
  // in the index with `source: ''`. Attribution is a nicety; the rank is not.
  // Dropping the rank here would silently remove a number the user could see
  // before this feature existed, and would take the mining path's
  // `getFrequencyRank` down with it.
  describe('a bank that supplies no title of its own', () => {
    async function importUntitledFreqDict(rows: unknown[][]): Promise<void> {
      const zipPath = path.join(tempRoot, 'untitled.zip');
      const zip = new AdmZip();
      zip.addFile('index.json', Buffer.from(JSON.stringify({ title: '', revision: 'r1', format: 3 })));
      zip.addFile('term_meta_bank_1.json', Buffer.from(JSON.stringify(rows)));
      zip.writeZip(zipPath);
      const res = await importYomitanZip(zipPath);
      expect(res.ok).toBe(true);
    }

    it('still yields the rank, with no source to attribute it to', async () => {
      await importUntitledFreqDict(freqBank([['本', 'freq', 357]]));

      expect(getFrequencyDetail('本')).toEqual({ rank: 357 });
      expect(getFrequencyRank('本')).toBe(357);
    });

    it('keeps the winning rank when an untitled bank outranks a titled one', async () => {
      await importFreqDict('JPDB Fixture', freqBank([['本', 'freq', 357]]));
      await importUntitledFreqDict(freqBank([['本', 'freq', 81]]));

      // 81 wins the merge and replaces JPDB's entry outright, so an
      // attribution-only guard does not degrade to 357 here — it erases the
      // word's rank altogether, which is what this asserts against.
      expect(getFrequencyDetail('本')).toEqual({ rank: 81 });
    });
  });
});
