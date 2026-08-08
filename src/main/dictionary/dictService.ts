// One lookup path for every language pair.
//
// This is Phase 3. The claim it has to earn is narrow and checkable: **one code
// path serves ja / zh / en / ru**, in both directions, and `lookupChinese`'s
// separate engine becomes unnecessary rather than merely unused.
//
// The design follows from `lang` living on both sides of the schema. A query is
// either a *headword* in some source language or a *gloss* in some target language,
// and those are the same query against two different indexes:
//
//     headword direction   headwords.norm / reading_norm  →  senses → glosses
//     gloss direction      glosses_fts MATCH              →  senses → headwords
//
// JA→RU and RU→JA are therefore not two features. They are the same function with
// `sourceLangs` and `glossLangs` swapped, which is exactly what §3 of the plan says
// and the reason the schema was worth rebuilding.
//
// ## What each analyzer actually does
//
// Nothing here re-implements morphology. The Japanese analyzer wraps `deinflect()`
// (shared/deinflect.ts, already unit-tested and shared with the reader pop-up); the
// Chinese analyzer does forward-maximum-match against the indexed headword table,
// which replaces `chineseDict.ts`'s chop-a-character-and-retry loop with an index
// probe; Russian and English strip a small set of suffixes. Suffix stripping is a
// deliberate floor, not a lemmatizer: it is honest about being a heuristic, and
// Phase 3's own text calls for a lemma table that no importer supplies yet.

import { hasCyrillic, hasHan, hasHangul, hasKana, hasLatin } from '../../shared/langs';
import { deinflect } from '../../shared/deinflect';
import { pinyinSearchKey } from '../../shared/pinyin';
import type { SqliteDb } from './db';

export type DictLangCode = string;

export interface LookupQuery {
  text: string;
  /** Source languages to search headwords in. Detected when omitted. */
  sourceLangs?: DictLangCode[];
  /** Gloss languages to return. All of them when omitted. */
  glossLangs?: DictLangCode[];
  limit?: number;
  /** Skip the reverse (gloss → headword) direction. */
  headwordsOnly?: boolean;
}

export interface LookupSense {
  pos: string[];
  tags: string[];
  glosses: { lang: string; text: string; html?: string }[];
}

export interface LookupEntry {
  headwordId: number;
  dictId: string;
  dictTitle: string;
  lang: string;
  text: string;
  reading: string;
  readingNorm: string;
  senses: LookupSense[];
  /** How this entry was reached — shown to the user and used for ranking. */
  via: 'exact' | 'reading' | 'deinflected' | 'variant' | 'prefix' | 'gloss';
  /** Conjugation chain, when `via` is 'deinflected'. */
  reasons?: string[];
  score: number;
}

export interface LookupResult {
  query: string;
  detectedLangs: DictLangCode[];
  entries: LookupEntry[];
}

// ----- language detection ----------------------------------------------------

/**
 * Which source languages a query could plausibly be written in.
 *
 * Order matters: it becomes the search order, and the first hit usually wins the
 * ranking. Kana is decisive for Japanese; bare Han is ambiguous between Japanese
 * and Chinese, so **both** are searched rather than guessing — a Chinese-only guess
 * on 食 would silently lose every JMdict entry.
 */
export function detectQueryLangs(text: string): DictLangCode[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (hasKana(trimmed)) return ['ja'];
  if (hasHan(trimmed)) return ['ja', 'zh'];
  if (hasHangul(trimmed)) return ['ko'];
  if (hasCyrillic(trimmed)) return ['ru'];
  if (hasLatin(trimmed)) return ['en', 'zh'];  // 'zh' for toneless pinyin
  return [];
}

// ----- normalisation ---------------------------------------------------------

const RU_SUFFIXES = [
  'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ой', 'ая', 'ое', 'ые', 'ый', 'ий',
  'ам', 'ям', 'ах', 'ях', 'ов', 'ев', 'ей', 'ом', 'ем', 'ax', 'ть', 'ла', 'ло', 'ли',
  'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о', 'ь',
];
const EN_SUFFIXES = ['ing', 'ies', 'ied', 'ed', 'es', 's'];

/** NFKC + lower case. The stored `norm` uses the same rule. */
export function normalizeForLookup(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase();
}

function stripSuffixes(word: string, suffixes: string[], minStem: number): string[] {
  const out = [word];
  for (const suffix of suffixes) {
    if (word.length - suffix.length >= minStem && word.endsWith(suffix)) {
      out.push(word.slice(0, -suffix.length));
    }
  }
  return [...new Set(out)];
}

/**
 * Every surface form of a query worth probing the index with, per language.
 *
 * The Japanese branch is the only one that returns a *reason chain*, because it is
 * the only one backed by a real morphology table rather than a suffix list.
 */
export function candidateForms(lang: DictLangCode, text: string): { form: string; reasons: string[] }[] {
  const norm = normalizeForLookup(text);
  if (!norm) return [];
  switch (lang) {
    case 'ja':
      return deinflect(norm).map((d) => ({ form: d.term, reasons: d.reasons }));
    case 'ru':
      return stripSuffixes(norm, RU_SUFFIXES, 3).map((form) => ({ form, reasons: [] }));
    case 'en':
      return stripSuffixes(norm, EN_SUFFIXES, 3).map((form) => ({ form, reasons: [] }));
    default:
      return [{ form: norm, reasons: [] }];
  }
}

// ----- the service -----------------------------------------------------------

interface HeadwordRow {
  id: number;
  dict_id: string;
  dict_title: string;
  lang: string;
  text: string;
  reading: string | null;
  reading_norm: string | null;
  variant_of: number | null;
  score: number;
  freq_rank: number | null;
  priority: number;
}

const HEADWORD_SELECT = `
  select h.id, h.dict_id, d.title as dict_title, h.lang, h.text, h.reading, h.reading_norm,
         h.variant_of, h.score, h.freq_rank, d.priority
  from headwords h
  join dictionaries d on d.id = h.dict_id
  where d.enabled = 1
`;

function readSenses(db: SqliteDb, headwordId: number, glossLangs?: string[]): LookupSense[] {
  const senses = db
    .prepare('select id, pos, tags from senses where headword_id = ? order by ord, id')
    .all(headwordId) as { id: number; pos: string | null; tags: string | null }[];

  const langFilter = glossLangs?.length
    ? ` and lang in (${glossLangs.map(() => '?').join(',')})`
    : '';

  return senses
    .map((sense) => {
      const glosses = db
        .prepare(`select lang, text, html from glosses where sense_id = ?${langFilter} order by ord, id`)
        .all(sense.id, ...(glossLangs?.length ? glossLangs : [])) as
        { lang: string; text: string; html: string | null }[];
      return {
        pos: sense.pos ? sense.pos.split(',').filter(Boolean) : [],
        tags: sense.tags ? sense.tags.split(',').filter(Boolean) : [],
        glosses: glosses.map((g) => ({ lang: g.lang, text: g.text, ...(g.html ? { html: g.html } : {}) })),
      };
    })
    // A sense whose every gloss was filtered out by language is not a sense the
    // caller asked for. Keeping it would render as an empty numbered bullet.
    .filter((sense) => sense.glosses.length > 0);
}

function toEntry(
  db: SqliteDb,
  row: HeadwordRow,
  via: LookupEntry['via'],
  reasons: string[],
  glossLangs?: string[],
): LookupEntry {
  // A traditional-Chinese headword carries no senses of its own; it points at the
  // simplified row that does. Every reader has to follow that or half of Chinese
  // returns empty entries.
  const senseOwner = row.variant_of ?? row.id;
  return {
    headwordId: row.id,
    dictId: row.dict_id,
    dictTitle: row.dict_title,
    lang: row.lang,
    text: row.text,
    reading: row.reading ?? '',
    readingNorm: row.reading_norm ?? '',
    senses: readSenses(db, senseOwner, glossLangs),
    via: row.variant_of ? 'variant' : via,
    ...(reasons.length ? { reasons } : {}),
    score: row.score,
  };
}

const VIA_RANK: Record<LookupEntry['via'], number> = {
  exact: 0, variant: 1, reading: 2, deinflected: 3, prefix: 4, gloss: 5,
};

/**
 * Look a query up across every enabled dictionary, in any direction.
 *
 * Ranking, in order: how the entry was reached (exact before a de-inflected match
 * before a gloss hit), then dictionary priority, then the entry's own score. Ties
 * are broken by headword id so the order is stable between runs — an unstable
 * order makes the UI reshuffle on every keystroke.
 */
export function lookup(db: SqliteDb, query: LookupQuery): LookupResult {
  const text = query.text.trim();
  const limit = query.limit ?? 40;
  const detected = query.sourceLangs?.length ? query.sourceLangs : detectQueryLangs(text);
  const result: LookupResult = { query: text, detectedLangs: detected, entries: [] };
  if (!text) return result;

  const seen = new Set<number>();
  const push = (row: HeadwordRow, via: LookupEntry['via'], reasons: string[]) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    result.entries.push(toEntry(db, row, via, reasons, query.glossLangs));
  };

  const byNorm = db.prepare(`${HEADWORD_SELECT} and h.lang = ? and h.norm = ? order by d.priority, h.id`);
  const byReading = db.prepare(`${HEADWORD_SELECT} and h.lang = ? and h.reading_norm = ? order by d.priority, h.id`);
  const byPrefix = db.prepare(
    `${HEADWORD_SELECT} and h.lang = ? and h.norm > ? and h.norm < ? order by length(h.norm), d.priority, h.id limit ?`,
  );

  for (const lang of detected) {
    const forms = candidateForms(lang, text);
    for (const { form, reasons } of forms) {
      const via = reasons.length ? 'deinflected' : 'exact';
      for (const row of byNorm.all(lang, form) as HeadwordRow[]) push(row, via, reasons);
    }

    // Reading-side probes. Kana for Japanese, toneless pinyin for Chinese — the
    // two ways a learner types a word they cannot write.
    const readingKeys = lang === 'zh'
      ? [...new Set([pinyinSearchKey(text), normalizeForLookup(text)])]
      : [normalizeForLookup(text)];
    for (const key of readingKeys) {
      if (!key) continue;
      for (const row of byReading.all(lang, key) as HeadwordRow[]) push(row, 'reading', []);
    }

    if (result.entries.length < limit) {
      const base = normalizeForLookup(text);
      // Prefix range scan: norm > 'base' and norm < 'base' + U+FFFF. Cheaper and
      // index-friendly compared with LIKE, which cannot use the index for a
      // non-ASCII pattern.
      for (const row of byPrefix.all(lang, base, `${base}￿`, limit) as HeadwordRow[]) {
        push(row, 'prefix', []);
      }
    }
  }

  // The reverse direction: the query is a gloss, not a headword. This is what the
  // old term→entries Map could not answer at all.
  if (!query.headwordsOnly && result.entries.length < limit) {
    const glossRows = db
      .prepare(`
        select h.id, h.dict_id, d.title as dict_title, h.lang, h.text, h.reading, h.reading_norm,
               h.variant_of, h.score, h.freq_rank, d.priority
        from glosses_fts
        join glosses g on g.id = glosses_fts.rowid
        join senses  s on s.id = g.sense_id
        join headwords h on h.id = s.headword_id
        join dictionaries d on d.id = h.dict_id
        where glosses_fts match ? and d.enabled = 1
        order by d.priority, h.id
        limit ?
      `)
      .all(ftsQuery(text), limit) as HeadwordRow[];
    for (const row of glossRows) push(row, 'gloss', []);
  }

  result.entries.sort((a, b) =>
    VIA_RANK[a.via] - VIA_RANK[b.via] ||
    b.score - a.score ||
    a.headwordId - b.headwordId,
  );
  result.entries = result.entries.slice(0, limit);
  return result;
}

/**
 * Quotes a user query for FTS5.
 *
 * FTS5's query syntax treats `"`, `*`, `:`, `^`, `-`, `(`, `)` and the bare words
 * AND/OR/NOT as operators, so an unescaped query throws `fts5: syntax error` on
 * input as ordinary as `to run (away)`. Wrapping in double quotes makes the whole
 * thing a phrase; doubling embedded quotes escapes them.
 */
export function ftsQuery(text: string): string {
  return `"${text.trim().replace(/"/g, '""')}"`;
}
