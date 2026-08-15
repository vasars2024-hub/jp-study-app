import fs from 'node:fs';
import type { SqliteDb } from '../db';
import { canonicalCorpusLang, EXAMPLE_DICTIONARY_KIND } from '../../../shared/dictionarySources';

export interface TatoebaImportOptions {
  dictId?: string;
  title?: string;
  priority?: number;
  onProgress?: (lines: number) => void;
  progressEvery?: number;
  shouldCancel?: () => boolean;
}

export interface TatoebaImportCounts {
  entries: number; skipped: number; translations: number; cancelled: boolean;
}

const CANCELLED = Symbol('tatoeba-cancelled');
const LICENCE = 'CC BY 2.0 FR';

/**
 * Import Tatoeba's sentences.tsv and links.tsv as an atomic example dictionary.
 *
 * Sentences go into `examples`/`example_translations`, which is what those tables
 * are for. They used to go into `headwords`/`senses`/`glosses` — one whole
 * sentence per headword — so an imported Tatoeba store answered ordinary word
 * lookups with sentences and fed them to the compound and neighbour probes, while
 * `examples_fts` stayed empty. Schema step 10 moves the rows an old import already
 * wrote and gives `examples` the `dict_id` that lets this store be disabled and
 * deleted like any other.
 */
export function importTatoeba(db: SqliteDb, sentencesPath: string, linksPath: string, options: TatoebaImportOptions = {}): TatoebaImportCounts {
  const dictId = options.dictId ?? 'tatoeba';
  const counts: TatoebaImportCounts = { entries: 0, skipped: 0, translations: 0, cancelled: false };
  const sentences = new Map<number, { lang: string; text: string }>();
  for (const [index, line] of fs.readFileSync(sentencesPath, 'utf8').split(/\r?\n/).entries()) {
    if (options.progressEvery && index % options.progressEvery === 0) { options.onProgress?.(index); if (options.shouldCancel?.()) return { ...counts, cancelled: true }; }
    const first = line.indexOf('\t'); const second = line.indexOf('\t', first + 1);
    const id = Number(line.slice(0, first)); const lang = line.slice(first + 1, second); const text = line.slice(second + 1).trim();
    if (Number.isSafeInteger(id) && id > 0 && lang && text) sentences.set(id, { lang, text });
    else if (line) counts.skipped += 1;
  }
  const links = new Map<number, number[]>();
  for (const line of fs.readFileSync(linksPath, 'utf8').split(/\r?\n/)) {
    const [leftRaw, rightRaw] = line.split('\t'); const left = Number(leftRaw); const right = Number(rightRaw);
    if (!sentences.has(left) || !sentences.has(right) || left === right) continue;
    const list = links.get(left) ?? []; if (!list.includes(right)) list.push(right); links.set(left, list);
  }
  const run = db.transaction(() => {
    if (options.shouldCancel?.()) throw CANCELLED;
    // Deleting the dictionary row is the whole cleanup of a re-import: `examples`
    // cascades off it since step 10, and `example_translations` cascades off
    // `examples`. Before that column existed a re-import would have orphaned every
    // sentence of the previous one.
    db.prepare('delete from dictionaries where id = ?').run(dictId);
    db.prepare(`insert into dictionaries
      (id,title,revision,source_lang,target_langs,priority,enabled,kind,licence,attribution,entry_count,bytes,imported_at)
      values (?,?,'','*','*',?,1,?,?,'Tatoeba — https://tatoeba.org/',0,?,0)`)
      .run(dictId, options.title ?? 'Tatoeba', options.priority ?? 0, EXAMPLE_DICTIONARY_KIND, LICENCE,
        fs.statSync(sentencesPath).size + fs.statSync(linksPath).size);
    const example = db.prepare('insert into examples (lang,text,source,licence,dict_id) values (?,?,?,?,?)');
    const translation = db.prepare('insert into example_translations (example_id,lang,text) values (?,?,?)');
    let index = 0;
    for (const [id, targets] of links) {
      if (options.progressEvery && index % options.progressEvery === 0) { options.onProgress?.(index); if (options.shouldCancel?.()) throw CANCELLED; }
      index += 1; const source = sentences.get(id); if (!source) continue;
      const translations = targets.map((target) => sentences.get(target)).filter((item): item is { lang: string; text: string } => Boolean(item));
      if (!translations.length) continue;
      // `source` keeps Tatoeba's own sentence id, which is the only durable name
      // this row has: `examples.id` is reassigned by every re-import.
      const exampleId = Number(
        example.run(canonicalCorpusLang(source.lang), source.text, String(id), LICENCE, dictId).lastInsertRowid,
      );
      for (const item of translations) translation.run(exampleId, canonicalCorpusLang(item.lang), item.text);
      counts.entries += 1; counts.translations += translations.length;
    }
    db.prepare('update dictionaries set entry_count=? where id=?').run(counts.entries, dictId);
  });
  try { run(); } catch (error) {
    if (error !== CANCELLED) throw error;
    Object.assign(counts, { entries: 0, translations: 0, cancelled: true });
  }
  return counts;
}
