// @vitest-environment node
//
// Register — "colloquial", "honorific", "archaic" — is the one item left on the
// Lexicon plan's line 42 whose data exists on a default install and was being
// thrown away rather than being genuinely absent. A Yomitan term row is
// `[term, reading, definitionTags, rules, score, glossary, sequence, termTags]`
// and the importer read only 0/1/4/5, which is also why every legacy sense
// carries `partsOfSpeech: []`.
//
// These tests go through the real `importYomitanZip` against a real zip on disk
// rather than calling the parser directly, because the two things most likely to
// break are archive-order dependence (a tag bank that appears after the term
// banks) and the resolution pass never running at all.

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

import { ensureYomitanTerms, importYomitanZip, lookupGlossary } from '../dictionary/yomitan';
import {
  parseTagBankRows,
  splitSenseTags,
  splitTagField,
  type DictTagBank,
} from '../../shared/dictTagBank';

/** `[name, category, order, notes, score]`, as a v3 tag bank writes them. */
const TAG_BANK = [
  ['n', 'partOfSpeech', 0, 'noun (common) (futsuumeishi)', 0],
  ['adj-i', 'partOfSpeech', 0, 'adjective (keiyoushi)', 0],
  ['col', 'misc', 0, 'colloquialism', 0],
  ['derog', 'misc', 0, 'derogatory', 0],
  ['ksb', 'dialect', 0, 'Kansai-ben', 0],
  // A described tag with no note at all: the code itself is all the dictionary
  // gave us, so the code is what a reader gets.
  ['bareTag', 'misc', 0, '', 0],
];

/** `[term, reading, definitionTags, rules, score, glossary, sequence, termTags]`. */
const TERM_BANK = [
  ['貴様', 'きさま', 'n col derog', '', -200, ['you', 'you bastard'], 1, 'P'],
  ['あほ', 'あほ', 'n ksb', '', -100, ['idiot'], 2, ''],
  // `uk` is never described by the bank above. An undescribed code must not
  // reach the reader as if it meant something.
  ['ねこ', 'ねこ', 'n uk', '', -50, ['cat'], 3, ''],
  ['たべる', 'たべる', '', '', 0, ['to eat'], 4, ''],
  ['ばれる', 'ばれる', 'bareTag', '', 0, ['to leak out'], 5, ''],
];

function writeZip(file: string, opts: { tagBank?: unknown[]; tagBankFirst?: boolean }): void {
  const zip = new AdmZip();
  zip.addFile(
    'index.json',
    Buffer.from(JSON.stringify({ title: 'Fixture Tagged', revision: 'r1', format: 3 })),
  );
  const addTerms = (): void =>
    zip.addFile('term_bank_1.json', Buffer.from(JSON.stringify(TERM_BANK)));
  const addTags = (): void => {
    if (opts.tagBank) zip.addFile('tag_bank_1.json', Buffer.from(JSON.stringify(opts.tagBank)));
  };
  if (opts.tagBankFirst) {
    addTags();
    addTerms();
  } else {
    addTerms();
    addTags();
  }
  zip.writeZip(file);
}

async function importFixture(opts: { tagBank?: unknown[]; tagBankFirst?: boolean }): Promise<void> {
  const zipPath = path.join(tempRoot, `fixture-${opts.tagBankFirst ? 'first' : 'last'}.zip`);
  writeZip(zipPath, opts);
  // The glossaries load on first use rather than at boot; this file reads them.
  ensureYomitanTerms();
  const res = await importYomitanZip(zipPath);
  expect(res.ok).toBe(true);
}

function sensesOf(term: string): { partsOfSpeech: string[]; tags: string[] }[] {
  const entries = lookupGlossary(term);
  expect(entries.length).toBeGreaterThan(0);
  return entries[0].senses.map((s) => ({ partsOfSpeech: s.partsOfSpeech, tags: s.tags }));
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jsa-tagbank-'));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('splitTagField', () => {
  it('accepts the space-separated string Yomitan writes', () => {
    expect(splitTagField('n col  derog')).toEqual(['n', 'col', 'derog']);
  });

  it('accepts an array, which some generators emit instead', () => {
    expect(splitTagField([' n ', 'col', ''])).toEqual(['n', 'col']);
  });

  it('treats anything else as no tags rather than throwing', () => {
    expect(splitTagField(undefined)).toEqual([]);
    expect(splitTagField(7)).toEqual([]);
    expect(splitTagField(null)).toEqual([]);
  });
});

describe('splitSenseTags', () => {
  const bank: DictTagBank = {};
  parseTagBankRows(TAG_BANK, bank);

  it('sends partOfSpeech tags to the grammar line as their short code', () => {
    expect(splitSenseTags(['n', 'col'], bank).partsOfSpeech).toEqual(['n']);
  });

  it('sends every other described category to usage, using the bank note', () => {
    expect(splitSenseTags(['n', 'col', 'ksb'], bank).usage).toEqual([
      'colloquialism',
      'Kansai-ben',
    ]);
  });

  it('drops a tag the dictionary never described', () => {
    expect(splitSenseTags(['uk'], bank)).toEqual({ partsOfSpeech: [], usage: [] });
  });

  it('falls back to the bare code when the bank described it with no note', () => {
    expect(splitSenseTags(['bareTag'], bank).usage).toEqual(['bareTag']);
  });

  it('keeps sense order and drops duplicates within each list', () => {
    expect(splitSenseTags(['col', 'n', 'col', 'n'], bank)).toEqual({
      partsOfSpeech: ['n'],
      usage: ['colloquialism'],
    });
  });

  it('resolves nothing when the dictionary shipped no tag bank', () => {
    expect(splitSenseTags(['n', 'col'], {})).toEqual({ partsOfSpeech: [], usage: [] });
  });

  it('does not resolve a tag named after an Object prototype member', () => {
    // `bank[tag]` on a plain object would hand back `Object.prototype.toString`
    // for a dictionary that tagged a sense `toString`, and `meta.category` would
    // then throw or classify garbage.
    expect(splitSenseTags(['toString', 'constructor'], bank)).toEqual({
      partsOfSpeech: [],
      usage: [],
    });
  });
});

describe('importYomitanZip tag resolution', () => {
  it('reaches lookup as usage labels and parts of speech', async () => {
    await importFixture({ tagBank: TAG_BANK });
    expect(sensesOf('貴様')).toEqual([
      { partsOfSpeech: ['n'], tags: ['colloquialism', 'derogatory'] },
    ]);
    expect(sensesOf('あほ')).toEqual([{ partsOfSpeech: ['n'], tags: ['Kansai-ben'] }]);
  });

  it('does not depend on where the tag bank sits in the archive', async () => {
    await importFixture({ tagBank: TAG_BANK, tagBankFirst: true });
    expect(sensesOf('貴様')).toEqual([
      { partsOfSpeech: ['n'], tags: ['colloquialism', 'derogatory'] },
    ]);
  });

  it('shows nothing for an undescribed code', async () => {
    await importFixture({ tagBank: TAG_BANK });
    expect(sensesOf('ねこ')).toEqual([{ partsOfSpeech: ['n'], tags: [] }]);
  });

  it('leaves an untagged row exactly as it was', async () => {
    await importFixture({ tagBank: TAG_BANK });
    expect(sensesOf('たべる')).toEqual([{ partsOfSpeech: [], tags: [] }]);
  });

  it('falls back to the bare code for a described tag with no note', async () => {
    await importFixture({ tagBank: TAG_BANK });
    expect(sensesOf('ばれる')).toEqual([{ partsOfSpeech: [], tags: ['bareTag'] }]);
  });

  it('imports a dictionary with no tag bank at all without surfacing raw codes', async () => {
    await importFixture({});
    expect(sensesOf('貴様')).toEqual([{ partsOfSpeech: [], tags: [] }]);
    expect(lookupGlossary('貴様')[0].senses[0].definitions).toEqual(['you', 'you bastard']);
  });

  it('keeps the tag bank on the stored index as the provenance for those labels', async () => {
    await importFixture({ tagBank: TAG_BANK });
    const dir = path.join(tempRoot, 'yomitan');
    const id = fs.readdirSync(dir).find((name) => name !== 'registry.json');
    expect(id).toBeTruthy();
    const stored = JSON.parse(
      fs.readFileSync(path.join(dir, id as string, 'index.json'), 'utf-8'),
    ) as { tags?: Record<string, { category: string; notes: string }> };
    expect(stored.tags?.col).toEqual({ category: 'misc', notes: 'colloquialism' });
  });

  it('leaves the headword-level termTags column out of the usage labels', async () => {
    // 貴様's row carries `P` in column 7. That is a popularity marker, not
    // register, and putting it here would read as "this word is colloquial,
    // derogatory, and common".
    await importFixture({ tagBank: [...TAG_BANK, ['P', 'popular', 0, 'popular term', 0]] });
    expect(sensesOf('貴様')[0].tags).toEqual(['colloquialism', 'derogatory']);
  });
});
