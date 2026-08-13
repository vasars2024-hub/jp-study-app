import fs from 'node:fs';
import path from 'node:path';
import type { SqliteDb } from '../db';
import { normalizeForLookup } from '../dictService';

export interface StarDictImportOptions {
  dictId?: string;
  onProgress?: (entries: number) => void;
  progressEvery?: number;
  shouldCancel?: () => boolean;
}

export interface StarDictImportCounts {
  entries: number;
  skipped: number;
  headwords: number;
  senses: number;
  glosses: number;
  cancelled: boolean;
}

interface StarDictMetadata {
  bookname: string;
  wordcount: number;
  idxoffsetbits: 32 | 64;
  sametypesequence: string;
}

const CANCELLED = Symbol('stardict-cancelled');

export function parseStarDictIfo(text: string): StarDictMetadata {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== "StarDict's dict ifo file") throw new Error('Not a StarDict .ifo file.');
  const fields = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const split = line.indexOf('=');
    if (split > 0) fields.set(line.slice(0, split).trim().toLowerCase(), line.slice(split + 1).trim());
  }
  if (fields.get('version') !== '3.0.0') throw new Error('Only StarDict 3.0.0 dictionaries are supported.');
  const wordcount = Number(fields.get('wordcount'));
  if (!Number.isSafeInteger(wordcount) || wordcount < 0) throw new Error('StarDict wordcount is invalid.');
  const bits = fields.get('idxoffsetbits') ?? '32';
  if (bits !== '32' && bits !== '64') throw new Error('StarDict idxoffsetbits must be 32 or 64.');
  const sequence = fields.get('sametypesequence') ?? '';
  if (sequence !== 'm') throw new Error('Only plain-text StarDict entries (sametypesequence=m) are supported.');
  return { bookname: fields.get('bookname') || 'StarDict', wordcount, idxoffsetbits: Number(bits) as 32 | 64, sametypesequence: sequence };
}

function readUInt(buffer: Buffer, offset: number, bits: 32 | 64): number {
  if (bits === 32) return buffer.readUInt32BE(offset);
  const value = buffer.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('StarDict offset exceeds the supported file size.');
  return Number(value);
}

export function importStarDict(db: SqliteDb, ifoPath: string, options: StarDictImportOptions = {}): StarDictImportCounts {
  const metadata = parseStarDictIfo(fs.readFileSync(ifoPath, 'utf8'));
  const base = ifoPath.replace(/\.ifo$/i, '');
  const idx = fs.readFileSync(`${base}.idx`);
  const dictPath = `${base}.dict`;
  if (!fs.existsSync(dictPath) && fs.existsSync(`${dictPath}.dz`)) {
    throw new Error('Compressed StarDict .dict.dz files are not supported; extract the .dict file first.');
  }
  const dict = fs.readFileSync(dictPath);
  const dictId = options.dictId ?? `stardict-${path.basename(base).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;
  const counts: StarDictImportCounts = { entries: 0, skipped: 0, headwords: 0, senses: 0, glosses: 0, cancelled: false };
  const progressEvery = options.progressEvery ?? 5_000;
  const offsetBytes = metadata.idxoffsetbits / 8;

  const run = db.transaction(() => {
    db.prepare('delete from dictionaries where id = ?').run(dictId);
    db.prepare(`insert into dictionaries
      (id, title, revision, source_lang, target_langs, priority, enabled, kind, licence, attribution, entry_count, bytes, imported_at)
      values (?, ?, '3.0.0', 'und', '*', 0, 1, 'term', '', 'Imported StarDict dictionary', 0, ?, 0)`)
      .run(dictId, metadata.bookname, idx.length + dict.length);
    const insertHeadword = db.prepare(`insert into headwords
      (dict_id, lang, text, norm, reading, reading_norm, variant_of, score) values (?, 'und', ?, ?, '', '', null, 0)`);
    const insertSense = db.prepare('insert into senses (headword_id, ord) values (?, 0)');
    const insertGloss = db.prepare("insert into glosses (sense_id, lang, text, ord) values (?, 'und', ?, 0)");
    let cursor = 0;
    while (cursor < idx.length) {
      if (progressEvery > 0 && counts.entries % progressEvery === 0) {
        options.onProgress?.(counts.entries);
        if (options.shouldCancel?.()) throw CANCELLED;
      }
      const nul = idx.indexOf(0, cursor);
      if (nul < 0 || nul + 1 + offsetBytes + 4 > idx.length) throw new Error('StarDict .idx entry is truncated.');
      const word = idx.subarray(cursor, nul).toString('utf8').trim();
      const offset = readUInt(idx, nul + 1, metadata.idxoffsetbits);
      const size = idx.readUInt32BE(nul + 1 + offsetBytes);
      cursor = nul + 1 + offsetBytes + 4;
      if (!word || offset + size > dict.length) { counts.skipped += 1; continue; }
      const definition = dict.subarray(offset, offset + size).toString('utf8').replace(/\0+$/g, '').trim();
      if (!definition) { counts.skipped += 1; continue; }
      const headwordId = Number(insertHeadword.run(dictId, word, normalizeForLookup(word)).lastInsertRowid);
      const senseId = Number(insertSense.run(headwordId).lastInsertRowid);
      insertGloss.run(senseId, definition);
      counts.entries += 1; counts.headwords += 1; counts.senses += 1; counts.glosses += 1;
    }
    if (counts.entries !== metadata.wordcount) throw new Error(`StarDict wordcount mismatch: expected ${metadata.wordcount}, read ${counts.entries}.`);
    db.prepare('update dictionaries set entry_count = ? where id = ?').run(counts.entries, dictId);
  });
  try { run(); } catch (error) {
    if (error !== CANCELLED) throw error;
    Object.assign(counts, { entries: 0, skipped: 0, headwords: 0, senses: 0, glosses: 0, cancelled: true });
  }
  return counts;
}
