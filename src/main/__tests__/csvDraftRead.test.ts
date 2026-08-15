import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decodeTextBuffer, readCsvDraft } from '../anki/csvDraftRead';
import { ANKI_CSV_MAX_BYTES } from '../../shared/ankiCsv';

/** The header block of a real Anki export (`HSK4_deck.txt`), with two of its rows. */
const HSK4 = [
  '#separator:tab',
  '#html:true',
  '#columns:Hanzi\tPinyin\tEnglish\tExample_ZH\tExample_PY\tExample_EN\tPOS\tTags',
  '#tags column:8',
  '遍\tbiàn\ttime (occurrence)\t请再说一遍。\tQǐng zài shuō yī biàn.\tPlease say it again.\tm.w.\tHSK4',
  '标准\tbiāozhǔn\tstandard\t你的发音很标准。\tNǐ de fāyīn hěn biāozhǔn.\tYour pronunciation is very standard.\tn./adj.\tHSK4',
  '',
].join('\n');

let dir = '';
const write = async (name: string, bytes: Buffer | string): Promise<string> => {
  const file = path.join(dir, name);
  await fs.writeFile(file, bytes);
  return file;
};

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jp-csv-draft-'));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('decodeTextBuffer', () => {
  it('reads plain UTF-8, which is what Anki itself writes', () => {
    const out = decodeTextBuffer(Buffer.from('#separator:tab\n食べる\tto eat\n', 'utf8'));
    expect(out.encoding).toBe('utf-8');
    expect(out.text.startsWith('#separator:tab')).toBe(true);
  });

  it('keeps a UTF-8 BOM on the string for the meta parser to account for', () => {
    // Stripping it here as well would consume a byte the offset arithmetic in
    // `parseAnkiCsvMeta` has already accounted for.
    const out = decodeTextBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\tb', 'utf8')]));
    expect(out.encoding).toBe('utf-8');
    expect(out.text).toBe('﻿a\tb');
  });

  it("decodes Excel's UTF-16LE Unicode text export", () => {
    const body = '#separator:tab\n食べる\tto eat\n';
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]);
    const out = decodeTextBuffer(bytes);
    expect(out.encoding).toBe('utf-16le');
    expect(out.text).toBe(body);
  });

  it('decodes big-endian UTF-16 by swapping the pairs', () => {
    const body = '食べる\tto eat';
    const le = Buffer.from(body, 'utf16le');
    const be = Buffer.from(le);
    be.swap16();
    const out = decodeTextBuffer(Buffer.concat([Buffer.from([0xfe, 0xff]), be]));
    expect(out.encoding).toBe('utf-16be');
    expect(out.text).toBe(body);
  });
});

describe('readCsvDraft', () => {
  it('reads a real export shape into a paged, blocked draft', async () => {
    const file = await write('HSK4_deck.txt', HSK4);
    const result = await readCsvDraft({ filePath: file });

    expect(result.ok).toBe(true);
    expect(result.fileName).toBe('HSK4_deck.txt');
    expect(result.totalNotes).toBe(2);
    expect(result.draft?.counts).toMatchObject({ notes: 2, cards: 0, noteTypes: 1 });
    expect(result.draft?.notes[0].fields[0].raw).toBe('遍');
    expect(result.draft?.notes[0].tags).toEqual(['HSK4']);
    expect(result.draft?.diagnostics.map((d) => d.code)).toContain('note-type-unassigned');
    expect(result.draft?.source.kind).toBe('csv');
    expect(result.draft?.source.fingerprint).toMatch(/^sha1:[0-9a-f]{40}$/);
  });

  it('reports every guess it made, so nothing is presented as certain', async () => {
    const file = await write('guessy.tsv', 'a\tb\tc\nd\te\tf\n');
    const result = await readCsvDraft({ filePath: file });

    expect(result.csv).toMatchObject({
      separatorSource: 'sniffed',
      separator: '\t',
      encoding: 'utf-8',
      rowCount: 2,
      blankRows: 0,
      unknownDirectives: [],
    });
    expect(result.csv?.byteLength).toBe(12);
  });

  it('carries the column directives through to the summary', async () => {
    const file = await write('cols.txt', HSK4);
    const result = await readCsvDraft({ filePath: file });
    expect(result.csv).toMatchObject({ tagsColumn: 8, html: true, separatorSource: 'header' });
    expect(result.csv?.columnNames).toHaveLength(8);
  });

  it('pages the notes and keeps counts describing the whole file', async () => {
    const rows = Array.from({ length: 30 }, (_v, i) => `word${i}\tgloss${i}`).join('\n');
    const file = await write('paged.txt', `#separator:tab\n${rows}\n`);

    const first = await readCsvDraft({ filePath: file, noteLimit: 10 });
    expect(first.draft?.notes).toHaveLength(10);
    expect(first.draft?.counts.notes).toBe(30);
    expect(first.totalNotes).toBe(30);

    const second = await readCsvDraft({ filePath: file, noteOffset: 25, noteLimit: 10 });
    expect(second.draft?.notes).toHaveLength(5);
    expect(second.noteOffset).toBe(25);
    expect(second.draft?.notes[0].fields[0].raw).toBe('word25');
  });

  it('does not HTML-strip a file that declares it is not HTML', async () => {
    const file = await write('plain.txt', '#separator:tab\n#html:false\n1 < 2 is true\tmath\n');
    const result = await readCsvDraft({ filePath: file });
    // The stripper would eat `< 2 is true` as an unclosed tag.
    expect(result.draft?.notes[0].fields[0].normalized).toBe('1 < 2 is true');
  });

  it('refuses a file over the ceiling with both numbers, rather than truncating', async () => {
    const file = await write('huge.txt', '#separator:tab\n');
    // Written sparse so the test does not spend 16 MB of disk writes.
    const handle = await fs.open(file, 'r+');
    await handle.truncate(ANKI_CSV_MAX_BYTES + 1);
    await handle.close();

    const result = await readCsvDraft({ filePath: file });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(`file-too-large:${ANKI_CSV_MAX_BYTES + 1}:${ANKI_CSV_MAX_BYTES}`);
  });

  it('refuses with a named error rather than opening a dialog', async () => {
    expect(await readCsvDraft({})).toEqual({ ok: false, error: 'no-file' });
  });

  it('returns the failure instead of throwing when the file is not there', async () => {
    const result = await readCsvDraft({ filePath: path.join(dir, 'absent.txt') });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ENOENT/);
  });
});
