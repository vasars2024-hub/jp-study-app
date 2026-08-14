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
import {
  MAX_NEIGHBOR_RESULTS,
  neighborWordKey,
  normalizeNeighborText,
  rankLexiconNeighbors,
  selectNeighborProbeSenses,
  type LexiconNeighborCandidate,
  type LexiconNeighborResult,
} from '../../shared/lexiconNeighbors';
import {
  COMPOUND_SCAN_ROWS,
  MAX_COMPOUND_RESULTS,
  selectLexiconCompounds,
  type LexiconCompound,
  type LexiconCompoundCandidate,
  type LexiconCompoundResult,
} from '../../shared/lexiconCompounds';
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
  /** Licence and attribution travel with each contributing source when supplied. */
  licence?: string;
  attribution?: string;
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

export interface CharacterSource {
  dictId: string;
  dictTitle: string;
  licence?: string;
  attribution?: string;
}

/** Grounded metadata for a single-character query, when an enabled source supplies it. */
export interface CharacterLookup {
  lang: string;
  char: string;
  strokes?: number;
  radical?: string;
  components: string[];
  readings: string[];
  meanings: string[];
  jlpt?: string;
  hsk?: string;
  grade?: number;
  frequency?: number;
  sources: CharacterSource[];
}

export interface LookupResult {
  query: string;
  detectedLangs: DictLangCode[];
  entries: LookupEntry[];
  /** Present only for an exact one-character query backed by an enabled source. */
  character?: CharacterLookup;
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
  licence: string | null;
  attribution: string | null;
}

// `coalesce(pp.priority, d.priority)` is the whole per-language-pair feature.
// The join key is `h.lang` on one side and the caller's single requested gloss
// language on the other, which is exactly the pair the schema comment calls the
// two halves of "any-to-any". Because the override is resolved in SQL rather
// than after the fact, it also decides which rows survive the `limit` on the
// prefix and gloss probes — reordering results that were already truncated by
// the global order would demote a source the user had just promoted.
//
// Every statement below is prefixed by this text, so the pair parameter is
// always bound first. `pairTarget()` returns '' when there is no unambiguous
// pair, which matches no row and leaves `d.priority` in charge.
const HEADWORD_SELECT = `
  select h.id, h.dict_id, d.title as dict_title, h.lang, h.text, h.norm, h.reading, h.reading_norm,
         h.variant_of, h.score, h.freq_rank,
         coalesce(pp.priority, d.priority) as priority, d.licence, d.attribution
  from headwords h
  join dictionaries d on d.id = h.dict_id
  left join dict_pair_priority pp
    on pp.dict_id = d.id and pp.source_lang = h.lang and pp.target_lang = ?
  where d.enabled = 1
`;

/**
 * The target language of the pair this query is about, or '' when there isn't one.
 *
 * A pair needs both halves named. `glossLangs` is the only place the caller
 * states the target, so exactly one entry is the only unambiguous case: with
 * none, the caller asked for every language at once, and with several there is
 * no single pair whose override should apply. Both fall back to global order.
 */
export function pairTarget(query: LookupQuery): string {
  return query.glossLangs?.length === 1 ? query.glossLangs[0] : '';
}

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
    sources: [{
      dictId: row.dict_id,
      dictTitle: row.dict_title,
      priority: row.priority,
      ...(row.licence ? { licence: row.licence } : {}),
      ...(row.attribution ? { attribution: row.attribution } : {}),
    }],
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
 *
 * "Dictionary priority" is the pair-specific override when the caller named a
 * single gloss language and the user has set one for that pair, and the global
 * `dictionaries.priority` otherwise. See `HEADWORD_SELECT`.
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
  const result: LookupResult = {
    query: text,
    detectedLangs: detected,
    entries: [],
    ...([...text].length === 1 ? { character: lookupCharacter(db, text, detected) } : {}),
  };
  if (!result.character) delete result.character;
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

  const pair = pairTarget(query);
  const byNorm = db.prepare(`${HEADWORD_SELECT} and h.lang = ? and h.norm = ? order by priority, h.id`);
  const byReading = db.prepare(`${HEADWORD_SELECT} and h.lang = ? and h.reading_norm = ? order by priority, h.id`);
  const byInflection = db.prepare(`
    ${HEADWORD_SELECT}
    and h.lang = ?
    and h.id in (select headword_id from inflections where form = ?)
    order by priority, h.id
  `);
  const byPrefix = db.prepare(
    `${HEADWORD_SELECT} and h.lang = ? and h.norm > ? and h.norm < ? order by length(h.norm), priority, h.id limit ?`,
  );

  for (const lang of searchLangs) {
    const forms = candidateForms(lang, text);
    for (const { form, reasons } of forms) {
      const via = reasons.length ? 'deinflected' : 'exact';
      for (const row of byNorm.all(pair, lang, form) as HeadwordRow[]) push(row, via, reasons);
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
    for (const row of byInflection.all(pair, lang, normalizeForLookup(text)) as HeadwordRow[]) {
      push(row, 'deinflected', inflectionReasons.get(row.id) ?? []);
    }

    // Reading-side probes. Kana for Japanese, toneless pinyin for Chinese — the
    // two ways a learner types a word they cannot write.
    const readingKeys = lang === 'zh'
      ? [...new Set([pinyinSearchKey(text), normalizeForLookup(text)])]
      : [normalizeForLookup(text)];
    for (const key of readingKeys) {
      if (!key) continue;
      for (const row of byReading.all(pair, lang, key) as HeadwordRow[]) push(row, 'reading', []);
    }

    if (result.entries.length < limit) {
      const base = normalizeForLookup(text);
      // Prefix range scan: norm > 'base' and norm < 'base' + U+FFFF. Cheaper and
      // index-friendly compared with LIKE, which cannot use the index for a
      // non-ASCII pattern.
      for (const row of byPrefix.all(pair, lang, base, `${base}￿`, limit) as HeadwordRow[]) {
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
               h.variant_of, h.score, h.freq_rank,
               coalesce(pp.priority, d.priority) as priority, d.licence, d.attribution
        from glosses_fts
        join glosses g on g.id = glosses_fts.rowid
        join senses  s on s.id = g.sense_id
        join headwords h on h.id = s.headword_id
        join dictionaries d on d.id = h.dict_id
        left join dict_pair_priority pp
          on pp.dict_id = d.id and pp.source_lang = h.lang and pp.target_lang = ?
        where glosses_fts match ? and d.enabled = 1${reverseLangFilter}
        order by priority, h.id
        limit ?
      `)
      .all(pair, ftsQuery(text), ...reverseSourceLangs, limit) as HeadwordRow[];
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
          pair, lang, prefix, `${prefix}￿`, prefix, `${prefix}￿`, FUZZY_CANDIDATE_LIMIT,
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
          for (const row of byNorm.all(pair, lang, deleted) as HeadwordRow[]) consider(row);
          for (const row of byReading.all(pair, lang, deleted) as HeadwordRow[]) consider(row);
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
 * Read the normalized character projection without trusting disabled sources.
 *
 * `chars` is deliberately a merged projection, so provenance is resolved back
 * through `dictionaries`: a disabled dictionary neither makes the character
 * visible nor remains in the returned attribution list.
 */
export function lookupCharacter(
  db: SqliteDb,
  char: string,
  sourceLangs: readonly string[] = detectQueryLangs(char),
): CharacterLookup | undefined {
  if ([...char].length !== 1 || sourceLangs.length === 0) return undefined;
  const placeholders = sourceLangs.map(() => '?').join(',');
  const rows = db.prepare(`
    select lang, char, strokes, radical, components, readings, meanings, jlpt, hsk, grade, freq, source_ids
    from chars
    where char = ? and lang in (${placeholders})
    order by case lang when 'ja' then 0 when 'zh' then 1 else 2 end
  `).all(char, ...sourceLangs) as Array<{
    lang: string; char: string; strokes: number | null; radical: string | null;
    components: string; readings: string; meanings: string; jlpt: string | null;
    hsk: string | null; grade: number | null; freq: number | null; source_ids: string;
  }>;

  for (const row of rows) {
    const ids = jsonStringArray(row.source_ids);
    if (ids.length === 0) continue;
    const sourceSlots = ids.map(() => '?').join(',');
    const sourceRows = db.prepare(`
      select id, title, licence, attribution
      from dictionaries
      where enabled = 1 and id in (${sourceSlots})
    `).all(...ids) as Array<{
      id: string; title: string; licence: string | null; attribution: string | null;
    }>;
    const byId = new Map(sourceRows.map((source) => [source.id, source]));
    const sources = ids.flatMap((id) => {
      const source = byId.get(id);
      return source ? [{
        dictId: source.id,
        dictTitle: source.title,
        ...(source.licence ? { licence: source.licence } : {}),
        ...(source.attribution ? { attribution: source.attribution } : {}),
      }] : [];
    });
    if (sources.length === 0) continue;
    return {
      lang: row.lang,
      char: row.char,
      ...(row.strokes != null ? { strokes: row.strokes } : {}),
      ...(row.radical ? { radical: row.radical } : {}),
      components: jsonStringArray(row.components),
      readings: jsonStringArray(row.readings),
      meanings: jsonStringArray(row.meanings),
      ...(row.jlpt ? { jlpt: row.jlpt } : {}),
      ...(row.hsk ? { hsk: row.hsk } : {}),
      ...(row.grade != null ? { grade: row.grade } : {}),
      ...(row.freq != null ? { frequency: row.freq } : {}),
      sources,
    };
  }
  return undefined;
}

export interface NeighborQuery {
  text: string;
  /** Source languages to search headwords in. Detected when omitted. */
  sourceLangs?: DictLangCode[];
  /** Gloss languages the shared senses must be written in. All of them when omitted. */
  glossLangs?: DictLangCode[];
  limit?: number;
}

/**
 * Index rows read per gloss. Bounds a very common gloss such as "to do".
 *
 * This is the only thing standing between the main thread and a 700k-headword
 * posting list, so it is deliberately generous rather than tight — the equality
 * filter below discards most rows, and the surface shows twelve.
 */
const NEIGHBOR_ROWS_PER_SENSE = 200;

/**
 * Words that literally share a gloss with the queried word.
 *
 * This is the plan's "semantic neighbors" bullet built the only way this track
 * permits: from data the database already contains. It runs the gloss index in
 * reverse — the query's own glosses become the search terms — so every returned
 * word is justified by a gloss string the reader can see on both entries. It
 * never estimates similarity, because no installed source carries a sense
 * embedding or a synonym set and inventing one is exactly what a grounded
 * Workbench forbids.
 *
 * FTS5 phrase matching is a *prefilter*, not the answer: `"to run"` also matches
 * the gloss "to run away". The normalized equality test below is what makes the
 * claim honest, so a neighbour shares the whole sense rather than part of it.
 *
 * Cost is bounded by construction: at most `MAX_NEIGHBOR_PROBE_SENSES` index
 * probes of `NEIGHBOR_ROWS_PER_SENSE` rows each, all against `glosses_fts`.
 *
 * The probe query has **no `ORDER BY`**, and that is a measured decision rather
 * than an omission. `better-sqlite3` is synchronous, so every millisecond here is
 * a millisecond the main process cannot answer IPC. Ordering by the joined
 * dictionary priority makes SQLite materialise and sort *every* match for a gloss
 * as common as "to see" before applying `LIMIT`, which was measured live at 2.4 s
 * on this machine's 700k-headword database. Without it SQLite stops after
 * `NEIGHBOR_ROWS_PER_SENSE` rows in FTS docid order — deterministic for a given
 * database — and `rankLexiconNeighbors` applies the priority order afterwards, on
 * a list two orders of magnitude smaller.
 */
export function findSemanticNeighbors(db: SqliteDb, query: NeighborQuery): LexiconNeighborResult {
  const text = query.text.trim();
  const empty: LexiconNeighborResult = { query: text, probedSenses: [], neighbors: [] };
  if (!text) return empty;

  // Headwords only: a gloss-direction hit would make the *query* a sense of some
  // other word, and its glosses are then not this word's senses at all.
  const own = lookup(db, {
    text,
    sourceLangs: query.sourceLangs,
    glossLangs: query.glossLangs,
    headwordsOnly: true,
    limit: 8,
  });
  const exact = own.entries.filter((entry) => entry.via === 'exact' || entry.via === 'reading');
  if (!exact.length) return empty;

  const probeLangs = [...new Set(exact.map((entry) => entry.lang))];
  const glossLangs = query.glossLangs?.length ? [...new Set(query.glossLangs)] : [];
  const probes = selectNeighborProbeSenses(
    exact.flatMap((entry) => entry.senses.flatMap((sense) => sense.glosses
      .filter((gloss) => !glossLangs.length || glossLangs.includes(gloss.lang))
      .map((gloss) => gloss.text))),
  );
  if (!probes.length) return { ...empty, query: text };

  const ownKeys = new Set(exact.flatMap((entry) => [
    neighborWordKey(entry.text),
    neighborWordKey(entry.reading),
  ]));
  const pair = pairTarget({ text, glossLangs: query.glossLangs });
  const langSlots = probeLangs.map(() => '?').join(',');
  const glossLangFilter = glossLangs.length
    ? ` and g.lang in (${glossLangs.map(() => '?').join(',')})`
    : '';
  const statement = db.prepare(`
    select h.lang, h.text, h.reading, h.dict_id, d.title as dict_title, g.text as gloss,
           coalesce(pp.priority, d.priority) as priority
    from glosses_fts
    join glosses g on g.id = glosses_fts.rowid
    join senses  s on s.id = g.sense_id
    join headwords h on h.id = s.headword_id
    join dictionaries d on d.id = h.dict_id
    left join dict_pair_priority pp
      on pp.dict_id = d.id and pp.source_lang = h.lang and pp.target_lang = ?
    where glosses_fts match ? and d.enabled = 1 and h.lang in (${langSlots})${glossLangFilter}
    limit ?
  `);

  const candidates: LexiconNeighborCandidate[] = [];
  for (const probe of probes) {
    const probeKey = normalizeNeighborText(probe);
    const rows = statement.all(
      pair, ftsQuery(probe), ...probeLangs, ...glossLangs, NEIGHBOR_ROWS_PER_SENSE,
    ) as Array<{
      lang: string; text: string; reading: string | null; dict_id: string;
      dict_title: string; gloss: string; priority: number;
    }>;
    for (const row of rows) {
      if (normalizeNeighborText(row.gloss) !== probeKey) continue;
      // Kana-folded, so JMdict's separate katakana headword for the same word
      // (ネコ for 猫/ねこ) is recognised as the query rather than a neighbour.
      // Only the *written* form is tested: a homophone such as 紙 for 神 is a
      // different word, and excluding it by shared reading would lose it.
      if (ownKeys.has(neighborWordKey(row.text))) continue;
      candidates.push({
        lang: row.lang,
        text: row.text,
        reading: row.reading ?? '',
        dictId: row.dict_id,
        dictTitle: row.dict_title,
        // The reader is shown the query's own casing of the shared sense, so two
        // dictionaries spelling it "Cat" and "cat" collapse into one label.
        sense: probe,
        priority: row.priority,
      });
    }
  }

  return {
    query: text,
    probedSenses: probes,
    neighbors: rankLexiconNeighbors(text, candidates, query.limit ?? MAX_NEIGHBOR_RESULTS),
  };
}

export interface CompoundQuery {
  text: string;
  /** Source languages to search headwords in. The query's own languages when omitted. */
  sourceLangs?: DictLangCode[];
  /** Gloss languages the shown gloss may be written in. All of them when omitted. */
  glossLangs?: DictLangCode[];
  limit?: number;
}

/**
 * Words whose written form contains the queried one.
 *
 * The plan asks for "words containing a character". Until now the only thing
 * answering that was a filter inside the character panel over entries the lookup
 * had already returned — so it could only ever show compounds that happened to be
 * in the same result set, and only for a character the panel could ground. This
 * asks the headword index directly, for a word of any length.
 *
 * ## Why `instr` and not FTS5
 *
 * `headwords_fts` cannot answer this, which was measured rather than assumed:
 * unicode61 treats an unbroken CJK run as **one token**, so a phrase match on 猫
 * returns 猫 and nothing else — not 子猫, not 猫背. The schema's own note that
 * "CJK falls through as individual codepoints" is true of matching a whole
 * headword and does not extend to matching inside one.
 *
 * ## Why `INDEXED BY`, which is the load-bearing line here
 *
 * Left to itself SQLite plans this through `idx_hw_reading`, whose leading `lang`
 * column satisfies the equality and whose remaining columns do not contain `norm`
 * — so every one of the ja partition's 697k rows needs a table seek to evaluate
 * the filter. Measured on this machine's real database: **316–673 ms**, on the
 * main process, for a single expansion. Pinned to `idx_hw_norm` the scan is
 * covering, the filter runs off the index, and the same queries take **60–87 ms**
 * including the sort. `INDEXED BY` is a hard constraint, so a future schema change
 * that drops that index fails loudly here instead of silently reintroducing the
 * half-second.
 *
 * ## Why the ORDER BY stays, unlike in `findSemanticNeighbors`
 *
 * The neighbour probe drops its ORDER BY because sorting a very common gloss's
 * matches costs seconds. Here the scan already visits every matching row whatever
 * happens — that is what `instr` over an index range means — so the sort adds only
 * ~15 ms and buys a globally correct top of the list. Without it a common
 * character such as 日 would return the first 200 matches in `norm` order, which
 * is 〆切日 and 日おおい rather than 祝日 and 日課.
 */
export function findLexiconCompounds(db: SqliteDb, query: CompoundQuery): LexiconCompoundResult {
  const text = query.text.trim();
  const empty: LexiconCompoundResult = { query: text, compounds: [] };
  if (!text) return empty;

  // The word has to exist before its compounds are searched for. This is not
  // politeness: it costs one indexed probe and it is what keeps a typo or a
  // pasted fragment from paying for the index scan below.
  //
  // Deliberately **not** scoped by `glossLangs`. Whether 猫 is a headword is not a
  // question about Russian, and `lookup` drops an entry whose every sense the
  // gloss filter removed — so passing the filter through here would answer "this
  // word has no compounds" to a reader whose only fault was asking for Russian
  // definitions of a word JMdict happens to define in English.
  const own = lookup(db, {
    text,
    sourceLangs: query.sourceLangs,
    headwordsOnly: true,
    limit: 8,
  });
  const exact = own.entries.filter((entry) => entry.via === 'exact' || entry.via === 'reading');
  if (!exact.length) return empty;

  const langs = [...new Set(exact.map((entry) => entry.lang))];
  const glossLangs = query.glossLangs?.length ? [...new Set(query.glossLangs)] : [];
  const rows = db.prepare(`
    select h.id, h.lang, h.text, h.reading, h.dict_id, d.title as dict_title
    from headwords h indexed by idx_hw_norm
    join dictionaries d on d.id = h.dict_id
    where h.lang in (${langs.map(() => '?').join(',')})
      and d.enabled = 1
      and instr(h.norm, ?) > 0
    order by h.score desc, length(h.text) asc, h.id asc
    limit ?
  `).all(...langs, normalizeForLookup(text), COMPOUND_SCAN_ROWS) as Array<{
    id: number; lang: string; text: string; reading: string | null;
    dict_id: string; dict_title: string;
  }>;

  const candidates: LexiconCompoundCandidate[] = rows.map((row) => ({
    headwordId: row.id,
    lang: row.lang,
    text: row.text,
    reading: row.reading ?? '',
    dictId: row.dict_id,
    dictTitle: row.dict_title,
  }));
  const chosen = selectLexiconCompounds(text, candidates, query.limit ?? MAX_COMPOUND_RESULTS);
  if (!chosen.length) return { query: text, compounds: [] };

  // One bounded read for the twelve rows that survived, rather than a join that
  // would have carried every sense of all 200 scanned rows through the sort.
  const glossLangFilter = glossLangs.length
    ? ` and g.lang in (${glossLangs.map(() => '?').join(',')})`
    : '';
  const glossRows = db.prepare(`
    select s.headword_id as headword_id, g.text as gloss
    from senses s
    join glosses g on g.sense_id = s.id
    where s.headword_id in (${chosen.map(() => '?').join(',')})${glossLangFilter}
    order by s.headword_id, s.ord, g.ord
  `).all(...chosen.map((item) => item.headwordId), ...glossLangs) as Array<{
    headword_id: number; gloss: string;
  }>;
  const firstGloss = new Map<number, string>();
  for (const row of glossRows) {
    const gloss = row.gloss.trim();
    if (!gloss || firstGloss.has(row.headword_id)) continue;
    firstGloss.set(row.headword_id, gloss);
  }

  const compounds: LexiconCompound[] = chosen.map((item) => {
    const gloss = firstGloss.get(item.headwordId);
    return {
      lang: item.lang,
      text: item.text,
      reading: item.reading,
      dictId: item.dictId,
      dictTitle: item.dictTitle,
      ...(gloss ? { gloss } : {}),
    };
  });
  return { query: text, compounds };
}

function jsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
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
