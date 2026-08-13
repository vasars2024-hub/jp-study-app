import type { SqliteDb } from '../db';
import { normalizeForLookup } from '../dictService';

export interface JmnedictImportOptions {
  dictId?: string;
  title?: string;
  priority?: number;
  onProgress?: (entries: number) => void;
  progressEvery?: number;
  shouldCancel?: () => boolean;
}

export interface JmnedictImportCounts {
  entries: number;
  skipped: number;
  headwords: number;
  variants: number;
  senses: number;
  glosses: number;
  cancelled: boolean;
}

interface ParsedName {
  spellings: string[];
  readings: string[];
  translations: Array<{ lang: string; text: string }>;
  types: string[];
}

const CANCELLED = Symbol('jmnedict-cancelled');
const ENTITY: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };

function decodeXml(value: string): string {
  return value.replace(/&#x([0-9a-f]+);|&#(\d+);|&([a-z_][\w.-]*);/gi, (whole, hex, decimal, named) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return ENTITY[String(named).toLowerCase()] ?? String(named).replaceAll('_', ' ');
  }).trim();
}

function values(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g'))]
    .map((match) => decodeXml(match[1].replace(/<[^>]+>/g, '')))
    .filter(Boolean);
}

export function parseJmnedictEntry(xml: string): ParsedName | null {
  const spellings = [...new Set(values(xml, 'keb'))];
  const readings = [...new Set(values(xml, 'reb'))];
  const translations = [...xml.matchAll(/<trans_det(?:\s+xml:lang="([^"]+)")?>([\s\S]*?)<\/trans_det>/g)]
    .map((match) => ({ lang: match[1] || 'en', text: decodeXml(match[2].replace(/<[^>]+>/g, '')) }))
    .filter((entry) => entry.text);
  const types = [...new Set(values(xml, 'name_type'))];
  if ((!spellings.length && !readings.length) || !translations.length) return null;
  return { spellings, readings, translations, types };
}

export function importJmnedict(db: SqliteDb, xml: string, options: JmnedictImportOptions = {}): JmnedictImportCounts {
  const dictId = options.dictId ?? 'jmnedict';
  const counts: JmnedictImportCounts = { entries: 0, skipped: 0, headwords: 0, variants: 0, senses: 0, glosses: 0, cancelled: false };
  const blocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const progressEvery = options.progressEvery ?? 5_000;
  const run = db.transaction(() => {
    if (options.shouldCancel?.()) throw CANCELLED;
    db.prepare('delete from dictionaries where id = ?').run(dictId);
    db.prepare(`insert into dictionaries
      (id, title, revision, source_lang, target_langs, priority, enabled, kind, licence, attribution, entry_count, bytes, imported_at)
      values (?, ?, '', 'ja', '*', ?, 1, 'name', 'CC BY-SA 4.0', 'JMnedict — EDRDG', 0, ?, 0)`)
      .run(dictId, options.title ?? 'JMnedict', options.priority ?? 0, xml.length);
    const insertHeadword = db.prepare(`insert into headwords
      (dict_id, lang, text, norm, reading, reading_norm, variant_of, score) values (?, 'ja', ?, ?, ?, ?, ?, 0)`);
    const insertSense = db.prepare('insert into senses (headword_id, ord, pos, tags) values (?, 0, ?, ?)');
    const insertGloss = db.prepare('insert into glosses (sense_id, lang, text, ord) values (?, ?, ?, ?)');
    blocks.forEach((block, index) => {
      if (progressEvery > 0 && index % progressEvery === 0) {
        options.onProgress?.(index);
        if (options.shouldCancel?.()) throw CANCELLED;
      }
      const entry = parseJmnedictEntry(block);
      if (!entry) { counts.skipped += 1; return; }
      const primaryText = entry.spellings[0] ?? entry.readings[0];
      const reading = entry.readings[0] ?? '';
      const primaryId = Number(insertHeadword.run(dictId, primaryText, normalizeForLookup(primaryText), reading, normalizeForLookup(reading), null).lastInsertRowid);
      counts.headwords += 1;
      for (const variant of [...entry.spellings.slice(1), ...entry.readings].filter((value) => value !== primaryText)) {
        insertHeadword.run(dictId, variant, normalizeForLookup(variant), reading, normalizeForLookup(reading), primaryId);
        counts.headwords += 1; counts.variants += 1;
      }
      const senseId = Number(insertSense.run(primaryId, entry.types.join(', '), '').lastInsertRowid);
      entry.translations.forEach((translation, ord) => insertGloss.run(senseId, translation.lang, translation.text, ord));
      counts.entries += 1; counts.senses += 1; counts.glosses += entry.translations.length;
    });
    db.prepare('update dictionaries set entry_count = ? where id = ?').run(counts.entries, dictId);
  });
  try { run(); } catch (error) {
    if (error !== CANCELLED) throw error;
    Object.assign(counts, { entries: 0, skipped: 0, headwords: 0, variants: 0, senses: 0, glosses: 0, cancelled: true });
  }
  return counts;
}
