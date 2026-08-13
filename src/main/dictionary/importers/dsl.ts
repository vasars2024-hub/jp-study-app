import fs from 'node:fs';
import type { SqliteDb } from '../db';
import { normalizeForLookup } from '../dictService';

export interface DslEntry { headwords: string[]; definition: string }
export interface DslImportOptions {
  dictId?: string; title?: string; sourceLang?: string; glossLang?: string; priority?: number;
  onProgress?: (lines: number) => void; progressEvery?: number; shouldCancel?: () => boolean;
}
export interface DslImportCounts {
  entries: number; skipped: number; headwords: number; senses: number; glosses: number; cancelled: boolean;
}

const CANCELLED = Symbol('dsl-cancelled');

function splitHeadwords(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let escaped = false;
  for (const char of line) {
    if (escaped) { current += char; escaped = false; }
    else if (char === '\\') escaped = true;
    else if (char === '|') { if (current.trim()) values.push(current.trim()); current = ''; }
    else current += char;
  }
  if (current.trim()) values.push(current.trim());
  return [...new Set(values)];
}

/** Parse Lingvo DSL: a non-indented headword followed by indented definition lines. */
export function parseDsl(text: string): { entries: DslEntry[]; directives: Record<string, string>; skipped: number } {
  const entries: DslEntry[] = [];
  const directives: Record<string, string> = {};
  let headwords: string[] = [];
  let definition: string[] = [];
  let skipped = 0;
  const flush = (): void => {
    const body = definition.join('\n').trim();
    if (headwords.length && body) entries.push({ headwords, definition: body });
    else if (headwords.length || definition.length) skipped += 1;
    headwords = []; definition = [];
  };
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^\s/.test(raw)) {
      if (headwords.length) definition.push(raw.trim());
      else if (raw.trim()) skipped += 1;
      continue;
    }
    flush();
    const line = raw.trim();
    if (!line) continue;
    const directive = /^#([A-Z_]+)\s+"?(.+?)"?$/.exec(line);
    if (directive) { directives[directive[1]] = directive[2].replace(/^"|"$/g, ''); continue; }
    if (!line.startsWith('#')) headwords = splitHeadwords(line);
  }
  flush();
  return { entries, directives, skipped };
}

export function importDsl(db: SqliteDb, text: string, options: DslImportOptions = {}): DslImportCounts {
  const parsed = parseDsl(text);
  const dictId = options.dictId ?? 'dsl-user';
  const sourceLang = options.sourceLang ?? parsed.directives.INDEX_LANGUAGE?.toLowerCase() ?? 'und';
  const glossLang = options.glossLang ?? parsed.directives.CONTENTS_LANGUAGE?.toLowerCase() ?? 'und';
  const counts: DslImportCounts = { entries: 0, skipped: parsed.skipped, headwords: 0, senses: 0, glosses: 0, cancelled: false };
  const progressEvery = options.progressEvery ?? 2_000;
  const run = db.transaction(() => {
    if (options.shouldCancel?.()) throw CANCELLED;
    db.prepare('delete from dictionaries where id = ?').run(dictId);
    db.prepare(`insert into dictionaries
      (id, title, revision, source_lang, target_langs, priority, enabled, kind, licence, attribution, entry_count, bytes, imported_at)
      values (?, ?, '', ?, ?, ?, 1, 'term', '', '', 0, ?, 0)`)
      .run(dictId, options.title ?? parsed.directives.NAME ?? 'DSL dictionary', sourceLang, glossLang, options.priority ?? 0, text.length);
    const insertHeadword = db.prepare(`insert into headwords
      (dict_id, lang, text, norm, reading, reading_norm, variant_of, score) values (?, ?, ?, ?, '', '', ?, 0)`);
    const insertSense = db.prepare('insert into senses (headword_id, ord, pos, tags) values (?, 0, ?, ?)');
    const insertGloss = db.prepare('insert into glosses (sense_id, lang, text, ord) values (?, ?, ?, 0)');
    parsed.entries.forEach((entry, index) => {
      if (progressEvery > 0 && index % progressEvery === 0) {
        options.onProgress?.(index);
        if (options.shouldCancel?.()) throw CANCELLED;
      }
      let primaryId: number | null = null;
      for (const headword of entry.headwords) {
        const id = Number(insertHeadword.run(dictId, sourceLang, headword, normalizeForLookup(headword), primaryId).lastInsertRowid);
        primaryId ??= id;
        counts.headwords += 1;
      }
      if (primaryId === null) return;
      const senseId = Number(insertSense.run(primaryId, '', '').lastInsertRowid);
      insertGloss.run(senseId, glossLang, entry.definition);
      counts.entries += 1; counts.senses += 1; counts.glosses += 1;
    });
    db.prepare('update dictionaries set entry_count = ? where id = ?').run(counts.entries, dictId);
  });
  try { run(); } catch (error) {
    if (error !== CANCELLED) throw error;
    counts.entries = 0; counts.headwords = 0; counts.senses = 0; counts.glosses = 0; counts.cancelled = true;
  }
  return counts;
}

export function readDslFile(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
}
