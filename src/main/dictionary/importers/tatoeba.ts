import fs from 'node:fs';
import type { SqliteDb } from '../db';
import { normalizeForLookup } from '../dictService';

export interface TatoebaImportOptions {
  dictId?: string;
  title?: string;
  priority?: number;
  onProgress?: (lines: number) => void;
  progressEvery?: number;
  shouldCancel?: () => boolean;
}

export interface TatoebaImportCounts {
  entries: number; skipped: number; headwords: number; senses: number; glosses: number; cancelled: boolean;
}

const CANCELLED = Symbol('tatoeba-cancelled');

/** Import Tatoeba's sentences.tsv and links.tsv as an atomic example dictionary. */
export function importTatoeba(db: SqliteDb, sentencesPath: string, linksPath: string, options: TatoebaImportOptions = {}): TatoebaImportCounts {
  const dictId = options.dictId ?? 'tatoeba';
  const counts: TatoebaImportCounts = { entries: 0, skipped: 0, headwords: 0, senses: 0, glosses: 0, cancelled: false };
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
    db.prepare('delete from dictionaries where id = ?').run(dictId);
    db.prepare(`insert into dictionaries
      (id,title,revision,source_lang,target_langs,priority,enabled,kind,licence,attribution,entry_count,bytes,imported_at)
      values (?,?,'','*','*',?,1,'examples','CC BY 2.0 FR','Tatoeba — https://tatoeba.org/',0,?,0)`)
      .run(dictId, options.title ?? 'Tatoeba', options.priority ?? 0, fs.statSync(sentencesPath).size + fs.statSync(linksPath).size);
    const headword = db.prepare(`insert into headwords (dict_id,lang,text,norm,reading,reading_norm,variant_of,score) values (?,?,?,?, '', '', null,0)`);
    const sense = db.prepare(`insert into senses (headword_id,ord,pos,tags) values (?,0,'example','')`);
    const gloss = db.prepare('insert into glosses (sense_id,lang,text,ord) values (?,?,?,?)');
    let index = 0;
    for (const [id, targets] of links) {
      if (options.progressEvery && index % options.progressEvery === 0) { options.onProgress?.(index); if (options.shouldCancel?.()) throw CANCELLED; }
      index += 1; const source = sentences.get(id); if (!source) continue;
      const translations = targets.map((target) => sentences.get(target)).filter((item): item is { lang: string; text: string } => Boolean(item));
      if (!translations.length) continue;
      const headwordId = Number(headword.run(dictId, source.lang, source.text, normalizeForLookup(source.text)).lastInsertRowid);
      const senseId = Number(sense.run(headwordId).lastInsertRowid);
      translations.forEach((translation, ord) => gloss.run(senseId, translation.lang, translation.text, ord));
      counts.entries += 1; counts.headwords += 1; counts.senses += 1; counts.glosses += translations.length;
    }
    db.prepare('update dictionaries set entry_count=? where id=?').run(counts.entries, dictId);
  });
  try { run(); } catch (error) {
    if (error !== CANCELLED) throw error;
    Object.assign(counts, { entries: 0, headwords: 0, senses: 0, glosses: 0, cancelled: true });
  }
  return counts;
}
