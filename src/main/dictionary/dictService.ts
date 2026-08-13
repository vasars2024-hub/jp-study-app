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
  /**
   * Allow approximate (mistyped) matches when nothing matched exactly.
   *
   * Off by default and never mixed into an exact result — see the fuzzy block in
   * `lookup()` for why both of those are load-bearing.
   */
  fuzzy?: boolean;
}

export interface LookupSense {
  pos: string[];
  tags: string[];
  glosses: { lang: string; text: string; html?: string }[];
}

export interface LookupSource {
  dictId: string;
  dictTitle: string;
  priority: number;
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
  via: 'exact' | 'reading' | 'deinflected' | 'variant' | 'prefix' | 'gloss' | 'fuzzy';
  /** Conjugation chain, when `via` is 'deinflected'. */
  reasons?: string[];
  score: number;
  /** Source order selected by the user; lower values rank first. */
  dictionaryPriority?: number;
  /** All dictionaries contributing this semantic entry, primary source first. */
  sources: LookupSource[];
  /** Edit distance from the query, when `via` is 'fuzzy'. Closer ranks first. */
  fuzzyDistance?: number;
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
  norm: string;
  reading: string | null;
  reading_norm: string | null;
  variant_of: number | null;
  score: number;
  freq_rank: number | null;
  priority: number;
}

const HEADWORD_SELECT = `
  select h.id, h.dict_id, d.title as dict_title, h.lang, h.text, h.norm, h.reading, h.reading_norm,
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
  fuzzyDistance?: number,
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
    dictionaryPriority: row.priority,
    sources: [{ dictId: row.dict_id, dictTitle: row.dict_title, priority: row.priority }],
    ...(fuzzyDistance === undefined ? {} : { fuzzyDistance }),
  };
}

function sameSemanticEntry(a: LookupEntry, b: LookupEntry): boolean {
  return a.lang === b.lang && a.text === b.text && a.readingNorm === b.readingNorm &&
    a.via === b.via && a.fuzzyDistance === b.fuzzyDistance;
}

function mergeSenses(a: LookupSense[], b: LookupSense[]): LookupSense[] {
  const out = [...a];
  for (const sense of b) {
    const key = JSON.stringify(sense);
    if (!out.some((candidate) => JSON.stringify(candidate) === key)) out.push(sense);
  }
  return out;
}

/** Merge duplicate semantic rows without losing the dictionaries that supplied them. */
export function mergeLookupEntry(existing: LookupEntry, incoming: LookupEntry): LookupEntry {
  if (!sameSemanticEntry(existing, incoming)) return existing;
  const sources = [...existing.sources];
  for (const source of incoming.sources) {
    if (!sources.some((candidate) => candidate.dictId === source.dictId)) sources.push(source);
  }
  return { ...existing, senses: mergeSenses(existing.senses, incoming.senses), sources };
}

const VIA_RANK: Record<LookupEntry['via'], number> = {
  exact: 0, variant: 1, reading: 2, deinflected: 3, prefix: 4, gloss: 5, fuzzy: 6,
};

export function compareLookupEntries(a: LookupEntry, b: LookupEntry): number {
  return VIA_RANK[a.via] - VIA_RANK[b.via] ||
    // Only fuzzy entries carry a distance, and they never share a result with
    // exact ones, so this term is inert for every other kind of match.
    (a.fuzzyDistance ?? 0) - (b.fuzzyDistance ?? 0) ||
    (a.dictionaryPriority ?? Number.MAX_SAFE_INTEGER) -
      (b.dictionaryPriority ?? Number.MAX_SAFE_INTEGER) ||
    b.score - a.score ||
    a.headwordId - b.headwordId;
}

export function collectInflectionReasons(
  rows: { headword_id: number; name: string | null; tags: string | null }[],
): Map<number, string[]> {
  const byHeadword = new Map<number, string[]>();
  for (const row of rows) {
    const existing = byHeadword.get(row.headword_id) ?? [];
    const reasons = [row.name, ...(row.tags?.split(',') ?? [])]
      .filter((value): value is string => Boolean(value));
    byHeadword.set(row.headword_id, [...new Set([...existing, ...reasons])]);
  }
  return byHeadword;
}

// ----- approximate matching --------------------------------------------------
//
// Every probe above requires the query to be exactly right *somewhere* in the
// index. A learner who mistypes one character gets nothing at all, which is the
// one search behaviour people notice immediately when it is missing.
//
// The constraint that shapes this is CLAUDE.md's: no CPU-heavy work on the main
// event loop. Scoring an edit distance against every headword in a 300 MB
// database is exactly that, so candidates are not scanned — they come from the
// same `norm` / `reading_norm` indexes the strict probes use, from a short
// prefix range, capped. What that buys is cheapness; what it costs is stated in
// `FUZZY_PREFIX_CHARS` below.

/** How much of the query has to be typed correctly for the index probe to find it. */
const FUZZY_PREFIX_CHARS = 2;
/** Upper bound on rows scored per language. Keeps the worst case bounded. */
const FUZZY_CANDIDATE_LIMIT = 400;

/**
 * How wrong a query of this length is allowed to be.
 *
 * Zero below three characters on purpose: at that length a one-character edit is
 * usually a different word rather than a typo, and for CJK it is *always* one —
 * 犬 and 大 are not near-misses for each other.
 */
export function fuzzyDistanceBudget(text: string): number {
  const length = [...text].length;
  if (length < 3) return 0;
  return length <= 4 ? 1 : 2;
}

/**
 * Levenshtein distance, abandoned as soon as it provably exceeds `max`.
 *
 * Returns `max + 1` for "further away than you asked about" rather than the true
 * distance, which is what makes the early exit sound: once every cell in a row is
 * over budget, no later row can come back under it.
 *
 * Iterates code points, not UTF-16 units, so a surrogate pair counts as the one
 * character the user actually typed.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  const source = [...a];
  const target = [...b];
  if (Math.abs(source.length - target.length) > max) return max + 1;

  let previous = Array.from({ length: target.length + 1 }, (_, j) => j);
  for (let i = 1; i <= source.length; i += 1) {
    const current = new Array<number>(target.length + 1);
    current[0] = i;
    let best = i;
    for (let j = 1; j <= target.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (source[i - 1] === target[j - 1] ? 0 : 1),
      );
      if (current[j] < best) best = current[j];
    }
    if (best > max) return max + 1;
    previous = current;
  }
  return previous[target.length];
}

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
  // User-imported formats such as StarDict do not carry a reliable language
  // code. Search their honest `und` rows after detected languages rather than
  // guessing a language at import time and making the dictionary unreachable
  // whenever that guess is wrong.
  const searchLangs = detected.includes('und') ? detected : [...detected, 'und'];
  const result: LookupResult = { query: text, detectedLangs: detected, entries: [] };
  if (!text) return result;

  const seen = new Set<number>();
  const semanticEntries = new Map<string, number>();
  const push = (
    row: HeadwordRow,
    via: LookupEntry['via'],
    reasons: string[],
    fuzzyDistance?: number,
  ) => {
    const entry = toEntry(db, row, via, reasons, query.glossLangs, fuzzyDistance);
    // A target-language filter can remove every sourced sense from an otherwise
    // matching headword. Do not let that empty shell consume the result limit or
    // render as a definition-less card; it is not a result in the requested pair.
    if (entry.senses.length === 0) return;
    const semanticKey = [entry.lang, entry.text, entry.readingNorm, entry.via, entry.fuzzyDistance ?? ''].join('\u0000');
    const existingIndex = semanticEntries.get(semanticKey);
    if (existingIndex !== undefined) {
      result.entries[existingIndex] = mergeLookupEntry(result.entries[existingIndex], entry);
      seen.add(row.id);
      return;
    }
    seen.add(row.id);
    semanticEntries.set(semanticKey, result.entries.length);
    result.entries.push(entry);
  };

  const byNorm = db.prepare(`${HEADWORD_SELECT} and h.lang = ? and h.norm = ? order by d.priority, h.id`);
  const byReading = db.prepare(`${HEADWORD_SELECT} and h.lang = ? and h.reading_norm = ? order by d.priority, h.id`);
  const byInflection = db.prepare(`
    ${HEADWORD_SELECT}
    and h.lang = ?
    and h.id in (select headword_id from inflections where form = ?)
    order by d.priority, h.id
  `);
  const byPrefix = db.prepare(
    `${HEADWORD_SELECT} and h.lang = ? and h.norm > ? and h.norm < ? order by length(h.norm), d.priority, h.id limit ?`,
  );

  for (const lang of searchLangs) {
    const forms = candidateForms(lang, text);
    for (const { form, reasons } of forms) {
      const via = reasons.length ? 'deinflected' : 'exact';
      for (const row of byNorm.all(lang, form) as HeadwordRow[]) push(row, via, reasons);
    }

    // Importers can supply forms that a generic suffix heuristic or Japanese
    // de-inflector cannot derive (irregular paradigms are the important case).
    // The schema has always indexed these rows; consult that index before the
    // looser reading and prefix probes so imported morphology is not dead data.
    const inflectionRows = db.prepare(
      // One surface may have several analyses for the same headword. `headword_id`
      // alone leaves their order undefined, which makes the displayed reason chain
      // depend on SQLite's query plan. `rowid` preserves importer order within a
      // headword while keeping headwords grouped for the accumulator.
      'select headword_id, name, tags from inflections where form = ? order by headword_id, rowid',
    ).all(normalizeForLookup(text)) as { headword_id: number; name: string | null; tags: string | null }[];
    const inflectionReasons = collectInflectionReasons(inflectionRows);
    for (const row of byInflection.all(lang, normalizeForLookup(text)) as HeadwordRow[]) {
      push(row, 'deinflected', inflectionReasons.get(row.id) ?? []);
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
    // `sourceLangs` is a real language-pair boundary, not merely a hint for the
    // headword probes above. Without this predicate an explicit EN→ZH request can
    // leak Japanese (or any other language) entries whose gloss happens to match.
    // Keep `und` in the boundary for imported dictionaries that honestly cannot
    // declare a source language, just as the forward path does.
    const reverseSourceLangs = query.sourceLangs?.length ? searchLangs : [];
    const reverseLangFilter = reverseSourceLangs.length
      ? ` and h.lang in (${reverseSourceLangs.map(() => '?').join(',')})`
      : '';
    const glossRows = db
      .prepare(`
        select h.id, h.dict_id, d.title as dict_title, h.lang, h.text, h.norm, h.reading, h.reading_norm,
               h.variant_of, h.score, h.freq_rank, d.priority
        from glosses_fts
        join glosses g on g.id = glosses_fts.rowid
        join senses  s on s.id = g.sense_id
        join headwords h on h.id = s.headword_id
        join dictionaries d on d.id = h.dict_id
        where glosses_fts match ? and d.enabled = 1${reverseLangFilter}
        order by d.priority, h.id
        limit ?
      `)
      .all(ftsQuery(text), ...reverseSourceLangs, limit) as HeadwordRow[];
    for (const row of glossRows) push(row, 'gloss', []);
  }

  // Approximate matching, opt-in and strictly last. The `length === 0` guard is
  // the honesty rule: a near-miss must never be quietly interleaved with entries
  // that really do match, so a result is either wholly exact or wholly fuzzy and
  // callers can label it as such.
  if (query.fuzzy && result.entries.length === 0) {
    const norm = normalizeForLookup(text);
    const budget = fuzzyDistanceBudget(norm);
    const chars = [...norm];
    if (budget > 0) {
      const prefix = chars.slice(0, Math.min(FUZZY_PREFIX_CHARS, chars.length - 1)).join('');
      const byFuzzyPrefix = db.prepare(`
        ${HEADWORD_SELECT}
        and h.lang = ?
        and ((h.norm >= ? and h.norm < ?) or (h.reading_norm >= ? and h.reading_norm < ?))
        order by h.score desc, h.id
        limit ?
      `);

      const matches: { row: HeadwordRow; distance: number }[] = [];
      const consider = (row: HeadwordRow) => {
        if (seen.has(row.id)) return;
        const distance = Math.min(
          boundedEditDistance(norm, row.norm, budget),
          row.reading_norm ? boundedEditDistance(norm, row.reading_norm, budget) : budget + 1,
        );
        if (distance <= budget) matches.push({ row, distance });
      };

      for (const lang of searchLangs) {
        for (const row of byFuzzyPrefix.all(
          lang, prefix, `${prefix}￿`, prefix, `${prefix}￿`, FUZZY_CANDIDATE_LIMIT,
        ) as HeadwordRow[]) {
          consider(row);
        }
        // A doubled or inserted character in the first two positions puts the real
        // headword outside that prefix range entirely. One exact probe per
        // single-character deletion covers it and is another index hit, not a scan.
        // Both indexes have to be probed: a mistyped Chinese query is a mistyped
        // *reading*, and the headword it belongs to is written in Han.
        for (let i = 0; i < chars.length; i += 1) {
          const deleted = [...chars.slice(0, i), ...chars.slice(i + 1)].join('');
          for (const row of byNorm.all(lang, deleted) as HeadwordRow[]) consider(row);
          for (const row of byReading.all(lang, deleted) as HeadwordRow[]) consider(row);
        }
      }

      matches.sort((a, b) => a.distance - b.distance ||
        a.row.priority - b.row.priority ||
        b.row.score - a.row.score ||
        a.row.id - b.row.id);
      for (const match of matches) push(match.row, 'fuzzy', [], match.distance);
    }
  }

  result.entries.sort(compareLookupEntries);
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
