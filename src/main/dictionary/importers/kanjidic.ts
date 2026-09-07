import type { SqliteDb } from '../db';

export interface KanjidicImportOptions {
  dictId?: string;
  title?: string;
  priority?: number;
  onProgress?: (entries: number) => void;
  progressEvery?: number;
  shouldCancel?: () => boolean;
}

export interface KanjidicImportCounts {
  entries: number;
  skipped: number;
  characters: number;
  cancelled: boolean;
}

const CANCELLED = Symbol('kanjidic-cancelled');
const ENTITIES: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };

function decodeXml(value: string): string {
  return value.replace(/&#x([0-9a-f]+);|&#(\d+);|&([a-z_][\w.-]*);/gi, (_whole, hex, decimal, named) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return ENTITIES[String(named).toLowerCase()] ?? String(named).replaceAll('_', ' ');
  }).trim();
}

function values(xml: string, tag: string, attrs = ''): string[] {
  const pattern = attrs
    ? `<${tag}(?=[^>]*${attrs})[^>]*>([\\s\\S]*?)<\\/${tag}>`
    : `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`;
  return [...xml.matchAll(new RegExp(pattern, 'g'))].map((match) => decodeXml(match[1].replace(/<[^>]+>/g, ''))).filter(Boolean);
}

/**
 * The English meanings only.
 *
 * KANJIDIC2 writes English as a bare `<meaning>` and every other language as
 * `<meaning m_lang="fr">`, so `values(block, 'meaning')` — which matches the tag
 * with or without attributes — collected all of them. 犬 arrived as
 * `dog · chien · perro · Cão`, four glosses of one word presented as four
 * senses. `values`' positive attribute filter cannot express "and no
 * attributes", hence the dedicated pattern.
 */
function englishMeanings(xml: string): string[] {
  return [...xml.matchAll(/<meaning>([\s\S]*?)<\/meaning>/g)]
    .map((match) => decodeXml(match[1].replace(/<[^>]+>/g, '')))
    .filter(Boolean);
}

function firstNumber(xml: string, tag: string): number | null {
  const value = Number(values(xml, tag)[0]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function json(valuesToStore: string[]): string { return JSON.stringify([...new Set(valuesToStore)]); }

export function rebuildCharacterProjection(db: SqliteDb, characters: Iterable<string>): void {
  const sourcesFor = db.prepare(`select cs.* from char_sources cs join dictionaries d on d.id = cs.dict_id
    where cs.lang = 'ja' and cs.char = ? and d.enabled = 1 order by d.priority asc, cs.dict_id asc`);
  const remove = db.prepare(`delete from chars where lang = 'ja' and char = ?`);
  const upsert = db.prepare(`insert into chars
    (lang, char, strokes, radical, components, readings, meanings, jlpt, hsk, grade, freq, primary_source_id, source_ids)
    values ('ja', ?, ?, ?, ?, ?, ?, ?, null, ?, ?, ?, ?)
    on conflict(lang, char) do update set strokes=excluded.strokes, radical=excluded.radical,
    components=excluded.components, readings=excluded.readings, meanings=excluded.meanings, jlpt=excluded.jlpt,
    grade=excluded.grade, freq=excluded.freq, primary_source_id=excluded.primary_source_id, source_ids=excluded.source_ids`);
  for (const char of characters) {
    const rows = sourcesFor.all(char) as Array<Record<string, unknown>>;
    const primary = rows[0];
    if (!primary) { remove.run(char); continue; }
    upsert.run(char, primary.strokes ?? null, primary.radical ?? null, primary.components ?? '[]', primary.readings ?? '[]', primary.meanings ?? '[]',
      primary.jlpt ?? null, primary.grade ?? null, primary.freq ?? null, primary.dict_id, JSON.stringify(rows.map((row) => row.dict_id)));
  }
}

export function importKanjidic(db: SqliteDb, xml: string, options: KanjidicImportOptions = {}): KanjidicImportCounts {
  const dictId = options.dictId ?? 'kanjidic2';
  const counts: KanjidicImportCounts = { entries: 0, skipped: 0, characters: 0, cancelled: false };
  const blocks = xml.match(/<character>[\s\S]*?<\/character>/g) ?? [];
  const touched = new Set<string>();
  const run = db.transaction(() => {
    if (options.shouldCancel?.()) throw CANCELLED;
    db.prepare('delete from dictionaries where id = ?').run(dictId);
    db.prepare(`insert into dictionaries
      (id, title, revision, source_lang, target_langs, priority, enabled, kind, licence, attribution, entry_count, bytes, imported_at)
      values (?, ?, '', 'ja', '*', ?, 1, 'character', 'CC BY-SA 4.0', 'KANJIDIC2 — EDRDG', 0, ?, 0)`)
      .run(dictId, options.title ?? 'KANJIDIC2', options.priority ?? 0, xml.length);
    const insert = db.prepare(`insert into char_sources
      (dict_id, lang, char, strokes, radical, components, readings, meanings, jlpt, grade, freq)
      values (?, 'ja', ?, ?, ?, '[]', ?, ?, ?, ?, ?)`);
    blocks.forEach((block, index) => {
      if (index % (options.progressEvery ?? 5_000) === 0) {
        options.onProgress?.(index);
        if (options.shouldCancel?.()) throw CANCELLED;
      }
      const char = values(block, 'literal')[0];
      if (!char) { counts.skipped += 1; return; }
      // `<reading>` also carries this character's pinyin, Korean and Vietnamese
      // readings. Taking them all put `quan3 · gyeon · 견 · Khuyển` in front of a
      // Japanese learner, inside a `lang="ja"` span; on-yomi and kun-yomi are
      // what a Japanese character row means by "readings".
      const readings = [
        ...values(block, 'reading', 'r_type="ja_on"'),
        ...values(block, 'reading', 'r_type="ja_kun"'),
      ];
      const meanings = englishMeanings(block);
      insert.run(dictId, char, firstNumber(block, 'stroke_count'), values(block, 'rad_value')[0] ?? null,
        json(readings), json(meanings), values(block, 'jlpt')[0] ?? null, firstNumber(block, 'grade'), firstNumber(block, 'freq'));
      touched.add(char); counts.entries += 1; counts.characters += 1;
    });
    rebuildCharacterProjection(db, touched);
    db.prepare('update dictionaries set entry_count = ? where id = ?').run(counts.entries, dictId);
  });
  try { run(); } catch (error) {
    if (error !== CANCELLED) throw error;
    Object.assign(counts, { entries: 0, skipped: 0, characters: 0, cancelled: true });
  }
  return counts;
}
