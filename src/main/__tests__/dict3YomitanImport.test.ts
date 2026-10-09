// @vitest-environment node
//
// dict3 — what a real Yomitan zip import keeps for Yomitan parity: the JMdict
// priority codes in a term row's termTags column (and only those), and the
// per-sense parts of speech and usage tags a structured glossary marks inside
// itself, each sense with its own HTML. Driven through `importYomitanZip`, like
// dictionaryTagBank.test.ts, so the tag-bank resolution pass runs for real.

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

import { definitionsToSenses, ensureYomitanTerms, importYomitanZip, lookupGlossary } from '../dictionary/yomitan';

const TAG_BANK = [
  ['n', 'partOfSpeech', 0, 'noun (common) (futsuumeishi)', 0],
  ['v1', 'partOfSpeech', 0, 'Ichidan verb', 0],
  ['col', 'misc', 0, 'colloquialism', 0],
  ['news1', 'frequent', 0, 'appears in the wordfreq file', 0],
];

const STRUCTURED = {
  type: 'structured-content',
  content: [
    {
      tag: 'li',
      data: { content: 'sense-group' },
      content: [
        { tag: 'span', data: { content: 'part-of-speech-info', code: 'v1' }, content: 'ichidan' },
        { tag: 'div', data: { content: 'sense' }, content: [{ tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: 'to eat' }] }] },
        {
          tag: 'div',
          data: { content: 'sense' },
          content: [
            { tag: 'span', title: 'colloquialism', data: { content: 'misc-info', code: 'col' }, content: 'col' },
            { tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: 'to live on' }] },
          ],
        },
      ],
    },
  ],
};

/** `[term, reading, definitionTags, rules, score, glossary, sequence, termTags]`. */
const TERM_BANK = [
  // `news1` in the definition tags too, as some generators write it: still a code, never a label.
  ['猫', 'ねこ', 'n news1', '', 0, ['cat'], 1, 'P news1 ichi1 nf02'],
  ['食べる', 'たべる', '', 'v1', 0, [STRUCTURED], 2, ''],
  ['犬', 'いぬ', 'n', '', 0, ['dog'], 3, 'P'],
];

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jsa-dict3-'));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

async function importFixture(): Promise<void> {
  const zipPath = path.join(tempRoot, 'fixture.zip');
  const zip = new AdmZip();
  zip.addFile('index.json', Buffer.from(JSON.stringify({ title: 'Fixture dict3', revision: 'r1', format: 3 })));
  zip.addFile('term_bank_1.json', Buffer.from(JSON.stringify(TERM_BANK)));
  zip.addFile('tag_bank_1.json', Buffer.from(JSON.stringify(TAG_BANK)));
  zip.writeZip(zipPath);
  ensureYomitanTerms();
  const res = await importYomitanZip(zipPath);
  expect(res.ok).toBe(true);
}

describe('JMdict priority codes at import', () => {
  it('keeps the termTags codes, makes the word common, and keeps them out of the usage labels', async () => {
    await importFixture();
    const [neko] = lookupGlossary('猫');
    expect(neko.priorityTags).toEqual(['news1', 'ichi1', 'nf02']);
    expect(neko.isCommon).toBe(true);
    expect(neko.senses[0].tags).not.toContain('appears in the wordfreq file');
  });

  it('records nothing for a row with no codes — `P` alone is not a JMdict list', async () => {
    await importFixture();
    const [inu] = lookupGlossary('犬');
    expect(inu.priorityTags).toBeUndefined();
  });
});

describe('structured senses at import', () => {
  it('splits a marked structured glossary into senses, each with its part of speech, tags and HTML', async () => {
    await importFixture();
    const [taberu] = lookupGlossary('食べる');
    expect(taberu.senses.map(({ partsOfSpeech, tags, definitions }) => ({ partsOfSpeech, tags, definitions }))).toEqual([
      { partsOfSpeech: ['v1'], tags: [], definitions: ['to eat'] },
      { partsOfSpeech: ['v1'], tags: ['colloquialism'], definitions: ['to live on'] },
    ]);
    // Two senses carry their own HTML, so the entry renders sense by sense and the
    // whole-entry block is not repeated.
    expect(taberu.senses.every((sense) => typeof sense.html === 'string' && sense.html.includes('<li>'))).toBe(true);
    expect(taberu.glossaryHtml).toBeUndefined();
    expect(taberu.senses[1].html).not.toContain('col');
  });

  it('leaves an unmarked structured glossary as one block, as before', () => {
    const out = definitionsToSenses([{ type: 'structured-content', content: { tag: 'ul', content: [{ tag: 'li', content: 'cat' }] } }]);
    expect(out.senses).toEqual([{ partsOfSpeech: [], definitions: ['cat'], tags: [] }]);
    expect(out.glossaryHtml).toBe('<ul><li>cat</li></ul>');
  });

  it('escapes dictionary text inside a marked sense', () => {
    const out = definitionsToSenses([{
      tag: 'div',
      data: { content: 'sense' },
      content: [
        { tag: 'span', data: { content: 'part-of-speech-info', code: 'n' }, content: 'noun' },
        { tag: 'ul', data: { content: 'glossary' }, content: [{ tag: 'li', content: '<img src=x onerror=alert(1)>' }] },
      ],
    }]);
    expect(out.senses[0].html).not.toContain('<img');
    expect(out.senses[0].definitions).toEqual(['<img src=x onerror=alert(1)>']);
  });
});
