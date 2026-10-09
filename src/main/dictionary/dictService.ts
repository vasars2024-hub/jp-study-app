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
import { foldRussianYo, russianLemmaCandidates, stripRussianStress } from '../../shared/russianMorphology';
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
  HEADWORD_SCAN_MIN_CHUNK_ROWS,
  MAX_COMPOUND_RESULTS,
  nextHeadwordScanChunk,
  selectLexiconCompounds,
  type LexiconCompound,
  type LexiconCompoundCandidate,
  type LexiconCompoundResult,
} from '../../shared/lexiconCompounds';
import {
  COLLOCATION_SCAN_ROWS,
  MAX_COLLOCATION_RESULTS,
  collocationPattern,
  draftLexiconCollocations,
  renderCollocationPattern,
  selectLexiconCollocations,
  type CollocationDraft,
  type LexiconCollocation,
  type LexiconCollocationResult,
} from '../../shared/lexiconCollocations';
import {
  MAX_ETYMOLOGY_RESULTS,
  selectLexiconEtymologies,
  type LexiconEtymology,
  type LexiconEtymologyResult,
} from '../../shared/lexiconEtymology';
import {
  MAX_FREQUENCY_BATCH,
  MAX_FREQUENCY_QUERY_CHARS,
  MAX_FREQUENCY_RESULTS,
  buildLexiconFrequencyResult,
  type LexiconFrequencyEntry,
  type LexiconFrequencyResult,
} from '../../shared/lexiconFrequency';
import {
  EXAMPLE_SCAN_CHUNK_ROWS,
  EXAMPLE_SCAN_ROWS,
  MAX_EXAMPLE_QUERY_CHARS,
  MAX_EXAMPLE_RESULTS,
  selectLexiconExamples,
  type LexiconExampleResult,
  type LexiconExampleTranslation,
} from '../../shared/lexiconExamples';
import {
  LEXICON_XREF_KINDS,
  MAX_XREF_RESULTS,
  selectLexiconXrefs,
  type LexiconXref,
  type LexiconXrefKind,
  type LexiconXrefResult,
} from '../../shared/lexiconXrefs';
import { EXAMPLE_DICTIONARY_KIND } from '../../shared/dictionarySources';
import { pinyinSearchKey } from '../../shared/pinyin';
import type { SqliteDb } from './db';
import { prepareCached } from './db';

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
  /** The dictionary this sense came from; set only once an entry merges several. */
  dictTitle?: string;
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
  /** IPA transcriptions from enabled IPA sources; absent when none covers the word. */
  ipa?: string[];
  /** JMdict priority codes the contributing rows carried; absent when none did. */
  prio?: string[];
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
  /**
   * At least one further match exists that `limit` cut off.
   *
   * Deliberately a flag and not a total. `lookup()` gathers one row past the
   * limit precisely so this can be answered without a second count query, which
   * means the honest claim it supports is "there are more", not "there are N" —
   * the probes below are themselves capped, so any number produced here would be
   * a floor presented as a total. It is also why the flag cannot be inferred
   * from `entries.length === limit`: that is equally true of a result which is
   * exactly complete.
   */
  truncated?: true;
  /**
   * The pinned `sourceLangs` that no enabled word dictionary is installed for.
   *
   * Set only on an empty result, so a surface can say "no Russian dictionary —
   * install one" instead of a bare "no match" (or, as before the pin, a Japanese
   * dictionary answering a Russian word through its Russian glosses).
   */
  missingSourceLangs?: DictLangCode[];
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
    case 'ru': {
      // Stress marks are notation (a pasted `кни́ги` is `книги`), and a form is
      // probed as its likely dictionary forms too: `книги` → `книга`,
      // `видела` → `видеть`. Only an index hit makes a candidate an answer.
      const plain = stripRussianStress(norm);
      return [...new Set([...russianLemmaCandidates(plain), ...stripSuffixes(plain, RU_SUFFIXES, 3)])]
        .map((form) => ({ form, reasons: [] }));
    }
    case 'en':
      return stripSuffixes(norm, EN_SUFFIXES, 3).map((form) => ({ form, reasons: [] }));
    default:
      return [{ form: norm, reasons: [] }];
  }
}

/**
 * The keys a surface is looked up by in `inflections`. Russian forms are stored
 * without stress marks (`inflectionKey` in the importer), and the ё-folded
 * spelling is a key of its own, so `книги`, `кни́ги` and `ежики` all reach
 * their paradigm rows.
 */
export function inflectionProbeKeys(lang: DictLangCode, text: string): string[] {
  const norm = normalizeForLookup(text);
  if (lang !== 'ru') return [norm];
  const plain = stripRussianStress(norm);
  return [...new Set([plain, foldRussianYo(plain)])];
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
  /** Comma-separated JMdict priority codes (schema step 14), null when the row has none. */
  prio?: string | null;
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
/**
 * A store of whole sentences is not a store of words, and nothing used to say so.
 *
 * Tatoeba's importer wrote one sentence per headword, so an imported example
 * dictionary answered `猫` with every sentence beginning `猫…` and offered them as
 * definitions. Storage moved to `examples` in schema step 10, and this predicate is
 * what keeps the guarantee independent of the storage: a store that declares itself
 * `examples` never contributes to a word lookup, whatever rows it holds.
 */
const WORD_SOURCE_WHERE = `d.enabled = 1 and d.kind <> '${EXAMPLE_DICTIONARY_KIND}'`;

/** The `HeadwordRow` column list — one source of truth for both shapes below. */
const HEADWORD_COLUMNS = `
  h.id, h.dict_id, d.title as dict_title, h.lang, h.text, h.norm, h.reading, h.reading_norm,
  h.variant_of, h.score, h.freq_rank, h.prio,
  coalesce(pp.priority, d.priority) as priority, d.licence, d.attribution
`;

/** The dictionary and pair-priority joins every headword probe needs. */
const HEADWORD_JOINS = `
  join dictionaries d on d.id = h.dict_id
  left join dict_pair_priority pp
    on pp.dict_id = d.id and pp.source_lang = h.lang and pp.target_lang = ?
`;

/**
 * `h.prio` arrived in schema step 14. A handle that cannot be migrated (a
 * read-only open of an older file) still answers lookups — without priority
 * codes — so every headword statement goes through this once per handle.
 */
const prioColumnByDb = new WeakMap<SqliteDb, boolean>();
function headwordSql(db: SqliteDb, sql: string): string {
  let has = prioColumnByDb.get(db);
  if (has === undefined) {
    try {
      has = (db.prepare('PRAGMA table_info(headwords)').all() as Array<{ name: string }>).some((c) => c.name === 'prio');
    } catch {
      has = false;
    }
    prioColumnByDb.set(db, has);
  }
  return has ? sql : sql.replace(/\bh\.prio\b/g, 'null as prio');
}

const HEADWORD_SELECT = `
  select ${HEADWORD_COLUMNS}
  from headwords h
  ${HEADWORD_JOINS}
  where ${WORD_SOURCE_WHERE}
`;

/**
 * The inflection probe, driven from `inflections` rather than from `headwords`.
 *
 * This is the same question the obvious `${'${HEADWORD_SELECT}'} and h.id in (select
 * headword_id from inflections where form = ?)` asks, and it must stay that way —
 * but SQLite will not plan that form usefully. Measured on the shipped 842,500-row
 * database: the `in (...)` shape plans as `SEARCH h USING INDEX idx_hw_reading
 * (lang=?)`, i.e. it walks *every headword in the language* and bloom-filters each
 * against the subquery, taking **64,000-84,000 us per probe — even for a word with
 * zero inflection rows**, while the subquery alone answers in 8.6 us. `in (...)` is
 * a filter to the planner, never a driver, so neither `json_each` nor an explicit
 * id list moves it; only putting `inflections` in the FROM clause does. Joined this
 * way the plan becomes `SEARCH i USING INDEX idx_infl_form (form=?)` then `SEARCH h
 * USING INTEGER PRIMARY KEY (rowid=?)`, and the same ten probes went 696,159 us ->
 * 643.6 us, **1,082x**, returning byte-identical id sets.
 *
 * `distinct` is what preserves the old row count: one surface can carry several
 * inflection analyses of the same headword, which the subquery collapsed for free
 * and a join does not.
 *
 * Why it mattered enough to restructure a query: this probe runs once per language
 * per token, so the Workbench interlinear paid it for every token of a passage. A
 * 47-character paragraph blocked the main process for 2,960 ms because of it.
 */
/**
 * Exported whole, tail included, so the plan guard in `dictionaryLookup.test.ts`
 * can EXPLAIN the exact statement `lookup()` prepares. Exporting only the FROM
 * half made a revert to the `in (...)` shape fail that test with `no such column:
 * i.form` — the regression was caught, but by a syntax error rather than by the
 * plan assertion that is the point of the guard.
 */
export const INFLECTION_PROBE_SQL = `
  select distinct ${HEADWORD_COLUMNS}
  from inflections i
  join headwords h on h.id = i.headword_id
  ${HEADWORD_JOINS}
  where ${WORD_SOURCE_WHERE}
  and h.lang = ?
  and i.form = ?
  order by priority, h.id
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
  const senses = prepareCached(db, 'select id, pos, tags from senses where headword_id = ? order by ord, id')
    .all(headwordId) as { id: number; pos: string | null; tags: string | null }[];

  const langFilter = glossLangs?.length
    ? ` and lang in (${glossLangs.map(() => '?').join(',')})`
    : '';

  return senses
    .map((sense) => {
      const glosses = prepareCached(
        db,
        `select lang, text, html from glosses where sense_id = ?${langFilter} order by ord, id`,
      )
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
  const prio = row.prio ? row.prio.split(',').map((code) => code.trim()).filter(Boolean) : [];
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
    ...(prio.length ? { prio } : {}),
  };
}

function sameSemanticEntry(a: LookupEntry, b: LookupEntry): boolean {
  return a.lang === b.lang && a.text === b.text && a.readingNorm === b.readingNorm &&
    a.via === b.via && a.fuzzyDistance === b.fuzzyDistance;
}

/** A sense's content, without the dictionary it is credited to — two dictionaries saying the same thing say it once. */
function senseKey(sense: LookupSense): string {
  return JSON.stringify({ pos: sense.pos, tags: sense.tags, glosses: sense.glosses });
}

function mergeSenses(a: LookupSense[], b: LookupSense[]): LookupSense[] {
  const out = [...a];
  for (const sense of b) {
    const key = senseKey(sense);
    if (!out.some((candidate) => senseKey(candidate) === key)) out.push(sense);
  }
  return out;
}

/** Senses credited to `title` unless a previous merge already credited them. */
function creditSenses(senses: LookupSense[], title: string): LookupSense[] {
  return senses.map((sense) => (sense.dictTitle ? sense : { ...sense, dictTitle: title }));
}

/**
 * Merge duplicate semantic rows without losing the dictionaries that supplied them.
 *
 * Once two dictionaries share an entry, each sense is credited to the one it came
 * from (`dictTitle`), so a surface can still group or label the senses by
 * dictionary. A single-source entry is left exactly as it was read.
 */
export function mergeLookupEntry(existing: LookupEntry, incoming: LookupEntry): LookupEntry {
  if (!sameSemanticEntry(existing, incoming)) return existing;
  const sources = [...existing.sources];
  for (const source of incoming.sources) {
    if (!sources.some((candidate) => candidate.dictId === source.dictId)) sources.push(source);
  }
  const crossDictionary = incoming.dictId !== existing.dictId || sources.length > 1;
  const senses = crossDictionary
    ? mergeSenses(creditSenses(existing.senses, existing.dictTitle), creditSenses(incoming.senses, incoming.dictTitle))
    : mergeSenses(existing.senses, incoming.senses);
  const prio = [...new Set([...(existing.prio ?? []), ...(incoming.prio ?? [])])];
  return { ...existing, senses, sources, ...(prio.length ? { prio } : {}) };
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

/**
 * Prefix of the inflection tag that carries a form's written spelling (the
 * Russian stressed form, `form:кни́ги`). Data for the reading aid, not a reason.
 */
export const INFLECTION_WRITTEN_TAG = 'form:';

export function collectInflectionReasons(
  rows: { headword_id: number; name: string | null; tags: string | null }[],
): Map<number, string[]> {
  const byHeadword = new Map<number, string[]>();
  for (const row of rows) {
    const existing = byHeadword.get(row.headword_id) ?? [];
    const reasons = [row.name, ...(row.tags?.split(',') ?? [])]
      .filter((value): value is string => Boolean(value) && !value.startsWith(INFLECTION_WRITTEN_TAG));
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
  // Gather one row past what will be shown. That extra row is never rendered;
  // it is the whole evidence for `truncated`, and it is why a caller asking for
  // eight can distinguish "eight, and that is all there is" from "eight of more".
  const gather = limit + 1;
  /**
   * A capped probe came back full, so the index still holds rows nobody read.
   *
   * Needed because the surviving entry count is NOT a proof of exhaustion: rows
   * are dropped after they are fetched — deduplicated into a sibling entry, or
   * discarded for having no sense in the requested language pair. Measured live
   * on the shipped 650k-row database, 鬱 at `limit: 71` returned 52 entries while
   * `limit: 200` returned 71, so "fewer than you asked for" was quietly untrue.
   */
  let saturated = false;
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
    // One headword, one entry. A Russian row's reading is its stressed spelling,
    // which normalises back to the headword, so the reading probe found the row
    // the exact probe already had and the pop-up listed every word twice.
    if (seen.has(row.id)) return;
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
  const byNorm = prepareCached(db, headwordSql(db, `${HEADWORD_SELECT} and h.lang = ? and h.norm = ? order by priority, h.id`));
  const byReading = prepareCached(
    db,
    headwordSql(db, `${HEADWORD_SELECT} and h.lang = ? and h.reading_norm = ? order by priority, h.id`),
  );
  const byInflection = prepareCached(db, headwordSql(db, INFLECTION_PROBE_SQL));
  const byPrefix = prepareCached(
    db,
    headwordSql(db, `${HEADWORD_SELECT} and h.lang = ? and h.norm > ? and h.norm < ? order by length(h.norm), priority, h.id limit ?`),
  );

  for (const lang of searchLangs) {
    const forms = candidateForms(lang, text);
    // Russian candidates past the first are guesses (`книги` → `книга`); they
    // are probed only when the dictionary's own paradigm rows name no lemma.
    const guesses = lang === 'ru' ? forms.slice(1) : [];
    for (const { form, reasons } of lang === 'ru' ? forms.slice(0, 1) : forms) {
      const via = reasons.length ? 'deinflected' : 'exact';
      for (const row of byNorm.all(pair, lang, form) as HeadwordRow[]) push(row, via, reasons);
    }
    let inflectionHits = 0;

    // Importers can supply forms that a generic suffix heuristic or Japanese
    // de-inflector cannot derive (irregular paradigms are the important case).
    // The schema has always indexed these rows; consult that index before the
    // looser reading and prefix probes so imported morphology is not dead data.
    for (const inflectionKey of inflectionProbeKeys(lang, text)) {
      const inflectionRows = prepareCached(
        db,
        // One surface may have several analyses for the same headword. `headword_id`
        // alone leaves their order undefined, which makes the displayed reason chain
        // depend on SQLite's query plan. `rowid` preserves importer order within a
        // headword while keeping headwords grouped for the accumulator.
        'select headword_id, name, tags from inflections where form = ? order by headword_id, rowid',
      ).all(inflectionKey) as { headword_id: number; name: string | null; tags: string | null }[];
      const inflectionReasons = collectInflectionReasons(inflectionRows);
      for (const row of byInflection.all(pair, lang, inflectionKey) as HeadwordRow[]) {
        push(row, 'deinflected', inflectionReasons.get(row.id) ?? []);
        inflectionHits += 1;
      }
    }
    if (!inflectionHits) {
      for (const { form } of guesses) {
        for (const row of byNorm.all(pair, lang, form) as HeadwordRow[]) push(row, 'deinflected', []);
      }
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

    if (result.entries.length < gather) {
      const base = normalizeForLookup(text);
      // Prefix range scan: norm > 'base' and norm < 'base' + U+FFFF. Cheaper and
      // index-friendly compared with LIKE, which cannot use the index for a
      // non-ASCII pattern.
      const rows = byPrefix.all(pair, lang, base, `${base}￿`, gather) as HeadwordRow[];
      if (rows.length >= gather) saturated = true;
      for (const row of rows) push(row, 'prefix', []);
    }
  }

  // The reverse direction: the query is a gloss, not a headword. This is what the
  // old term→entries Map could not answer at all.
  if (!query.headwordsOnly && result.entries.length < gather) {
    // `sourceLangs` is a real language-pair boundary, not merely a hint for the
    // headword probes above. Without this predicate an explicit EN→ZH request can
    // leak Japanese (or any other language) entries whose gloss happens to match.
    // Keep `und` in the boundary for imported dictionaries that honestly cannot
    // declare a source language, just as the forward path does.
    const reverseSourceLangs = query.sourceLangs?.length ? searchLangs : [];
    const reverseLangFilter = reverseSourceLangs.length
      ? ` and h.lang in (${reverseSourceLangs.map(() => '?').join(',')})`
      : '';
    const glossRows = prepareCached(
      db,
      `
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
        where glosses_fts match ? and ${WORD_SOURCE_WHERE}${reverseLangFilter}
        order by priority, h.id
        limit ?
      `,
    ).all(pair, ftsQuery(text), ...reverseSourceLangs, gather) as HeadwordRow[];
    if (glossRows.length >= gather) saturated = true;
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
      const byFuzzyPrefix = prepareCached(db, headwordSql(db, `
        ${HEADWORD_SELECT}
        and h.lang = ?
        and ((h.norm >= ? and h.norm < ?) or (h.reading_norm >= ? and h.reading_norm < ?))
        order by h.score desc, h.id
        limit ?
      `));

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
  // Either kind of evidence is enough: more entries survived than will be shown,
  // or a probe that was capped came back full. Neither is `entries.length ===
  // limit`, which is equally true of a result that is exactly complete.
  if (result.entries.length > limit || saturated) result.truncated = true;
  result.entries = result.entries.slice(0, limit);
  // Only the entries that will be shown pay for the probe.
  for (const entry of result.entries) {
    const ipa = readEntryIpa(db, entry);
    if (ipa.length) entry.ipa = ipa;
  }
  if (result.entries.length === 0 && query.sourceLangs?.length) {
    const missing = missingSourceDictionaries(db, query.sourceLangs);
    if (missing.length) result.missingSourceLangs = missing;
  }
  return result;
}

/**
 * Which of `langs` no enabled word dictionary declares as its source language.
 * `source_lang` may be a list (a multilingual Wiktionary import writes
 * `ja,zh,ru`). The dictionaries table is a few dozen rows; asked only on a miss.
 */
export function missingSourceDictionaries(db: SqliteDb, langs: readonly DictLangCode[]): DictLangCode[] {
  const wanted = [...new Set(langs.filter((lang) => lang && lang !== 'und'))];
  if (!wanted.length) return [];
  const has = prepareCached(
    db,
    `select 1 as present from dictionaries d where ${WORD_SOURCE_WHERE} and d.kind not in ('freq', 'pitch') and (',' || replace(d.source_lang, ' ', '') || ',') like ('%,' || ? || ',%') limit 1`,
  );
  return wanted.filter((lang) => !has.get(lang));
}

/** The most one `lookupBatch` call answers; a longer list is the caller's to chunk. */
export const LOOKUP_BATCH_MAX = 256;

/** How long `lookupBatch` runs before it hands the event loop back. */
const LOOKUP_BATCH_YIELD_MS = 50;

/**
 * Several `lookup`s in one call, answered in order, one result per query.
 *
 * The callers that used to read the legacy in-memory index a word at a time —
 * the VN gloss batch, mining's lemma readings — ask for tens to hundreds of
 * words at once. One message per batch keeps that a single round trip to the
 * read worker instead of one per word, and the time-budgeted yield keeps the
 * in-process fallback from holding the main loop for the whole list.
 */
export async function lookupBatch(db: SqliteDb, queries: readonly LookupQuery[]): Promise<LookupResult[]> {
  const out: LookupResult[] = [];
  let sliceStart = Date.now();
  for (const query of queries.slice(0, LOOKUP_BATCH_MAX)) {
    out.push(lookup(db, query));
    if (Date.now() - sliceStart >= LOOKUP_BATCH_YIELD_MS) {
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      sliceStart = Date.now();
    }
  }
  return out;
}

/**
 * IPA transcriptions for one entry, from every enabled IPA source, highest
 * priority first and deduplicated.
 *
 * Keyed like pitch (`yomitan.ts` `getPitch`): the written form with this
 * reading first, then a row the dictionary stored without a distinct reading,
 * then the reading as a kana headword. A database that predates migration 13
 * has no `ipa` table — a readonly handle never migrates — and answers empty
 * rather than failing the lookup.
 */
export function readEntryIpa(db: SqliteDb, entry: Pick<LookupEntry, 'lang' | 'text' | 'reading'>): string[] {
  let rows: { transcriptions: string }[];
  try {
    rows = prepareCached(db, `
      select i.transcriptions
      from ipa i join dictionaries d on d.id = i.dict_id
      where d.enabled = 1 and i.lang = @lang and (
        (i.norm = @text and (i.reading = @reading or i.reading = i.norm or i.reading = ''))
        or (@reading <> '' and i.norm = @reading and (i.reading = @reading or i.reading = ''))
      )
      order by (i.norm = @text and i.reading = @reading) desc, d.priority, d.id
    `).all({ lang: entry.lang, text: entry.text, reading: entry.reading ?? '' }) as { transcriptions: string }[];
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const row of rows) {
    for (const ipa of jsonStringArray(row.transcriptions)) {
      if (!out.includes(ipa)) out.push(ipa);
    }
  }
  return out;
}

const KANA = /[ぁ-ゟ゠-ヿ]/;

/**
 * A Japanese character row's readings, with the other languages' readings
 * dropped.
 *
 * KANJIDIC2 gives every character its pinyin, Korean and Vietnamese readings
 * alongside on-yomi and kun-yomi, and the importer used to store all of them:
 * measured on this machine's own database, **49,450 of 86,498 stored `ja`
 * readings (57%) are not Japanese**, across 12,634 of 13,108 characters.
 * `importers/kanjidic.ts` now selects by `r_type`, but that only helps a
 * database imported after the fix — this filter repairs the one the user
 * already has, and is a no-op once the import is clean. Every `ja_on`/`ja_kun`
 * reading carries kana and no other `r_type` does, so kana is the whole test.
 *
 * Deliberately scoped to `ja`: a `zh` row's readings are pinyin and correct.
 *
 * 403 rows are left with nothing — CJK-extension characters KANJIDIC2 carries
 * with only Chinese readings, exactly one of which has a JLPT level, grade or
 * frequency. They return empty, which is what a clean re-import stores (349 rows
 * already do) and what the panel hides the Readings line for. Falling back to
 * the whole list would put `yin3` under a `lang="ja"` heading, which is the
 * defect this exists to stop.
 */
export function japaneseCharacterReadings(lang: string, readings: string[]): string[] {
  if (lang !== 'ja') return readings;
  return readings.filter((reading) => KANA.test(reading));
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
      readings: japaneseCharacterReadings(row.lang, jsonStringArray(row.readings)),
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

/** One matched headword, carrying the columns the shared scan's ordering needs. */
interface HeadwordScanRow {
  id: number;
  lang: string;
  text: string;
  reading: string | null;
  score: number;
  dict_id: string;
  dict_title: string;
  /** Code points, not UTF-16 units — SQLite's `length()` counts characters. */
  len: number;
}

/**
 * Every enabled headword whose written form contains `needle`, best `budget` first.
 *
 * Shared by `findLexiconCompounds` and `findLexiconCollocations`, which asked the
 * same question with the same `INDEXED BY` and differed only in their cap.
 *
 * ## Why the cap they used to pass to SQLite could never fire
 *
 * `limit COMPOUND_SCAN_ROWS` sat under `order by h.score desc, ...`, and SQLite's
 * own plan for that ends `USE TEMP B-TREE FOR ORDER BY` — the sort has to see
 * every match before the limit can discard one, so the visit was always the whole
 * `lang` partition of `idx_hw_norm` no matter how small the cap was. Measured on
 * the shipped database: 猫 **1,244.1 ms** on a cold cache, as one uninterruptible
 * main-process block, to return twelve compounds.
 *
 * ## Why the window is on `norm` and emphatically not on the rowid
 *
 * The example scan next door windows on `id`, and copying that here is the trap.
 * `idx_hw_norm` is `(lang, norm)`: `instr(h.norm, ?)` is evaluated straight off
 * the index and only a match pays a table seek, so the scan reads a 5,386-page
 * index rather than the 17,792-page table. A rowid window forces the table order
 * instead and trades the smaller structure for the larger one. So the cursor is a
 * `norm` value, taken from a covering `limit 1 offset N` probe, and each window is
 * the half-open range `(from, upto]` — which partitions the index exactly, with no
 * row visited twice and none skipped, because the probe's own `norm > from` makes
 * `upto` strictly greater than `from` even when thousands of rows share a `norm`.
 *
 * ## Why the ordering moved into JS rather than being dropped
 *
 * `findLexiconCompounds`' doc explains what the `ORDER BY` buys: without it a
 * common character such as 日 returns 〆切日 and 日おおい instead of 祝日 and 日課.
 * That is preserved exactly — `h.score` is selected, the same three-key order is
 * applied here, and the list is truncated to `budget` after every window, so the
 * result is the global top-`budget` on bounded memory rather than a per-window
 * one. The probe `debug/l8a-compound-scan-shape.cjs` asserts the identity
 * directly: same ids, same order, for 猫 / 日 / 腹 / 食べる.
 */
async function scanHeadwordsContaining(
  db: SqliteDb,
  langs: readonly string[],
  needle: string,
  budget: number,
): Promise<HeadwordScanRow[]> {
  const columns = `
      select h.id, h.lang, h.text, h.reading, h.score, h.dict_id, d.title as dict_title
      from headwords h indexed by idx_hw_norm
      join dictionaries d on d.id = h.dict_id
      where h.lang = ?`;
  const window = db.prepare(`${columns}
        and h.norm > ? and h.norm <= ?
        and d.enabled = 1
        and instr(h.norm, ?) > 0`);
  // The last window has no upper bound rather than a sentinel string: there is no
  // value guaranteed to sort above every `norm`, and a wrong guess would silently
  // drop the tail of the index.
  const tail = db.prepare(`${columns}
        and h.norm > ?
        and d.enabled = 1
        and instr(h.norm, ?) > 0`);
  const cursor = db.prepare(`
    select h.norm as norm
    from headwords h indexed by idx_hw_norm
    where h.lang = ? and h.norm > ?
    order by h.norm
    limit 1 offset ?
  `);

  type RawRow = Omit<HeadwordScanRow, 'len'>;
  const kept: HeadwordScanRow[] = [];
  // Sized by measured wall time, not by rows — see `HEADWORD_SCAN_WINDOW_TARGET_MS`
  // for the three boots that proved a row budget cannot bound a block. Starts at the
  // floor so the FIRST window of a cold scan is cheap too: it is the one that pays
  // for every page the index needs and the one the old fixed size stalled inside.
  let chunk = HEADWORD_SCAN_MIN_CHUNK_ROWS;
  for (const lang of langs) {
    let from = '';
    for (;;) {
      const startedAt = Date.now();
      const next = cursor.get(lang, from, chunk) as { norm: string } | undefined;
      const rows = (next
        ? window.all(lang, from, next.norm, needle)
        : tail.all(lang, from, needle)) as RawRow[];
      if (rows.length) {
        for (const row of rows) kept.push({ ...row, len: [...row.text].length });
        kept.sort((a, b) => (b.score - a.score) || (a.len - b.len) || (a.id - b.id));
        if (kept.length > budget) kept.length = budget;
      }
      chunk = nextHeadwordScanChunk(chunk, Date.now() - startedAt);
      if (!next) break;
      from = next.norm;
      // Yielded between windows, never inside one — the same contract as the
      // example scan: a pending IPC call, a paint or a `/health` probe gets a turn
      // before the next few thousand index entries are faulted in.
      await new Promise<void>((resolve) => { setImmediate(resolve); });
    }
  }
  return kept;
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
 * ## Why the ordering stays, unlike in `findSemanticNeighbors`
 *
 * The neighbour probe drops its ordering because sorting a very common gloss's
 * matches costs seconds. Here the scan already visits every matching row whatever
 * happens — that is what `instr` over an index range means — so the sort adds only
 * ~15 ms and buys a globally correct top of the list. Without it a common
 * character such as 日 would return the first 200 matches in `norm` order, which
 * is 〆切日 and 日おおい rather than 祝日 and 日課. It is applied in JS now rather
 * than by SQLite, for exactly the reason `scanHeadwordsContaining` documents, and
 * the result is identical.
 */
export async function findLexiconCompounds(
  db: SqliteDb,
  query: CompoundQuery,
): Promise<LexiconCompoundResult> {
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
  const rows = await scanHeadwordsContaining(
    db, langs, normalizeForLookup(text), COMPOUND_SCAN_ROWS,
  );

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

export interface CollocationQuery {
  text: string;
  /** Source languages to match headwords in. Every language when omitted. */
  sourceLangs?: DictLangCode[];
  /** Languages the partner's gloss may be written in. Any language when omitted. */
  glossLangs?: DictLangCode[];
  limit?: number;
}

/**
 * The first definition of each chosen partner, keyed by the partner as written.
 *
 * The partner is a substring of a phrase, not a scanned row, so it has no
 * headword id yet — which is why this resolves in two steps rather than one
 * join. Step one turns each partner into **one** headword id (best score wins,
 * ties by id, so the answer does not depend on SQLite's row order); step two is
 * then the compound expansion's own bounded gloss read over at most twelve ids.
 * The single join spelling — `h.norm in (...)` joined straight through to
 * `glosses` — looks simpler and is not bounded: a common partner carried by four
 * installed dictionaries with a dozen senses each drags hundreds of rows through
 * the sort to produce one string.
 *
 * `reading_norm` is probed only for the partners `norm` did not resolve, because
 * that is exactly the set the attestation pass kept on their reading alone
 * (風邪をうつす's うつす). A partner that resolves both ways keeps its written
 * form's entry, which is the one the reader is looking at.
 */
function readCollocationPartnerGlosses(
  db: SqliteDb,
  partners: readonly string[],
  langs: readonly string[],
  glossLangs: readonly string[],
): Map<string, string> {
  const byPartner = new Map<string, string>();
  if (!partners.length || !langs.length) return byPartner;

  const norms = new Map<string, string[]>();
  for (const partner of partners) {
    const norm = normalizeForLookup(partner);
    if (!norm) continue;
    const bucket = norms.get(norm);
    if (bucket) bucket.push(partner);
    else norms.set(norm, [partner]);
  }
  if (!norms.size) return byPartner;

  const langHoles = langs.map(() => '?').join(',');
  const keys = [...norms.keys()];
  const keyHoles = keys.map(() => '?').join(',');
  const bestId = new Map<string, { id: number; score: number }>();
  const takeBest = (rows: Array<{ key: string; id: number; score: number }>) => {
    for (const row of rows) {
      if (!row.key) continue;
      const current = bestId.get(row.key);
      if (current && (current.score > row.score
        || (current.score === row.score && current.id <= row.id))) continue;
      bestId.set(row.key, { id: row.id, score: row.score });
    }
  };
  takeBest(db.prepare(`
    select h.norm as key, h.id as id, h.score as score
    from headwords h indexed by idx_hw_norm
    join dictionaries d on d.id = h.dict_id
    where h.lang in (${langHoles}) and d.enabled = 1 and h.norm in (${keyHoles})
  `).all(...langs, ...keys) as Array<{ key: string; id: number; score: number }>);

  const unresolved = keys.filter((key) => !bestId.has(key));
  if (unresolved.length) {
    takeBest(db.prepare(`
      select h.reading_norm as key, h.id as id, h.score as score
      from headwords h indexed by idx_hw_reading
      join dictionaries d on d.id = h.dict_id
      where h.lang in (${langHoles}) and d.enabled = 1
        and h.reading_norm in (${unresolved.map(() => '?').join(',')})
    `).all(...langs, ...unresolved) as Array<{ key: string; id: number; score: number }>);
  }
  if (!bestId.size) return byPartner;

  const ids = [...bestId.values()].map((entry) => entry.id);
  const glossLangFilter = glossLangs.length
    ? ` and g.lang in (${glossLangs.map(() => '?').join(',')})`
    : '';
  const firstGloss = new Map<number, string>();
  for (const row of db.prepare(`
    select s.headword_id as headword_id, g.text as gloss
    from senses s
    join glosses g on g.sense_id = s.id
    where s.headword_id in (${ids.map(() => '?').join(',')})${glossLangFilter}
    order by s.headword_id, s.ord, g.ord
  `).all(...ids, ...glossLangs) as Array<{ headword_id: number; gloss: string }>) {
    const gloss = row.gloss.trim();
    if (!gloss || firstGloss.has(row.headword_id)) continue;
    firstGloss.set(row.headword_id, gloss);
  }

  for (const [key, entry] of bestId) {
    const gloss = firstGloss.get(entry.id);
    if (!gloss) continue;
    for (const partner of norms.get(key) ?? []) byPartner.set(partner, gloss);
  }
  return byPartner;
}

/**
 * Phrases where this word is joined to another word by a particle.
 *
 * ## Why this writes to `collocations` and then reads back from it
 *
 * `collocations` was the last v1 table with neither a writer nor a reader, and the
 * cheapest way to give it one would have been a cache: derive on a miss, serve
 * stored rows on a hit. That is the version with a bug in it — enabling a
 * dictionary, disabling one or re-importing changes the correct answer, and a row
 * written before that change has no way to know. There is no revision column to
 * compare against, and inventing one to protect a **75 ms** query is the wrong
 * trade.
 *
 * So the derivation is unconditional and the table is written through on every
 * call: the rows for this head are replaced, and the payload the surface renders is
 * then read back out of `collocations` rather than assembled from the local
 * variables. The table therefore has a genuine reader on the hot path — a stored
 * row that failed to write is a row the reader does not return, which is exactly
 * the coupling that keeps a write-only table from quietly rotting — and it
 * self-heals on the next lookup after any dictionary change.
 *
 * ## The two indexed passes, and why neither is the obvious query
 *
 * The scan is `findLexiconCompounds`' scan, literally — both call
 * `scanHeadwordsContaining`, which is where the `INDEXED BY idx_hw_norm` and the
 * event-loop windowing live. The attestation pass is the one worth warning
 * about: the natural spelling of "is this partner a word" is
 * `where h.text = ? or h.reading = ?`, and **`headwords.text` carries no index** —
 * on the real 697,837-row database that is a full scan per partner, measured at
 * **10.5 s for 猫 and 18.1 s for 腹**. Rewritten as one batched `norm in (...)`
 * plus one `reading_norm in (...)`, both covered, the whole call is **71–82 ms**.
 */
export async function findLexiconCollocations(
  db: SqliteDb,
  query: CollocationQuery,
): Promise<LexiconCollocationResult> {
  const text = query.text.trim();
  const empty: LexiconCollocationResult = { query: text, collocations: [] };
  if (!text) return empty;

  // Same guard, and the same reason, as the compound expansion: one indexed probe
  // keeps a typo or a pasted fragment from paying for the scan below. Deliberately
  // not scoped by `glossLangs` — whether 猫 is a headword is not a question about
  // the language its definitions are wanted in.
  const own = lookup(db, {
    text,
    sourceLangs: query.sourceLangs,
    headwordsOnly: true,
    limit: 8,
  });
  const exact = own.entries.filter((entry) => entry.via === 'exact' || entry.via === 'reading');
  if (!exact.length) return empty;

  const langs = [...new Set(exact.map((entry) => entry.lang))];
  const placeholders = langs.map(() => '?').join(',');
  const rows = await scanHeadwordsContaining(
    db, langs, normalizeForLookup(text), COLLOCATION_SCAN_ROWS,
  );

  const drafts = draftLexiconCollocations(text, rows.map((row) => ({
    lang: row.lang,
    text: row.text,
    reading: row.reading ?? '',
    dictId: row.dict_id,
    dictTitle: row.dict_title,
  })));
  if (!drafts.length) return empty;

  const partners = [...new Set(drafts.map((draft) => normalizeForLookup(draft.partner)))];
  const partnerHoles = partners.map(() => '?').join(',');
  const attested = new Set<string>();
  for (const row of db.prepare(`
    select distinct h.norm as key
    from headwords h indexed by idx_hw_norm
    join dictionaries d on d.id = h.dict_id
    where h.lang in (${placeholders}) and d.enabled = 1 and h.norm in (${partnerHoles})
  `).all(...langs, ...partners) as Array<{ key: string }>) attested.add(row.key);
  for (const row of db.prepare(`
    select distinct h.reading_norm as key
    from headwords h indexed by idx_hw_reading
    join dictionaries d on d.id = h.dict_id
    where h.lang in (${placeholders}) and d.enabled = 1 and h.reading_norm in (${partnerHoles})
  `).all(...langs, ...partners) as Array<{ key: string }>) {
    if (row.key) attested.add(row.key);
  }

  const chosen = selectLexiconCollocations(drafts, attested, query.limit ?? MAX_COLLOCATION_RESULTS);

  const partnerGloss = readCollocationPartnerGlosses(
    db,
    chosen.map((draft) => draft.partner),
    langs,
    query.glossLangs?.length ? [...new Set(query.glossLangs)] : [],
  );

  // Each row is stored under the language of the headword it came from, not under
  // one language chosen for the whole call. `langs` genuinely holds more than one
  // entry: a Han query resolves in both partitions of the shipped database (ja
  // 625,949 headwords, zh 71,888), and 猫 is a headword in each. Writing them all
  // under the first would put a Japanese phrase in the Chinese partition of an
  // index whose leading column is `lang` — and the delete below, keyed the same
  // way, would then fail to replace the rows it was supposed to own.
  const scanned = new Set(langs);

  // One transaction, so a reader in another connection never sees this head with
  // half its rows replaced. `count` is deliberately re-derived rather than summed
  // into the existing row: it counts attesting dictionary entries *now*, and
  // accumulating it across calls would turn it into a tally of how often the word
  // was looked up.
  const replace = db.transaction((items: readonly CollocationDraft[]) => {
    const remove = db.prepare('delete from collocations where lang = ? and head = ?');
    // Every language this call scanned is cleared, including ones that ended up
    // contributing no row: a phrase that stops parsing after a dictionary changes
    // has to disappear rather than survive as the only row left for its language.
    for (const lang of scanned) remove.run(lang, text);
    const insert = db.prepare(
      'insert into collocations (lang, head, partner, pattern, count) values (?, ?, ?, ?, ?)',
    );
    for (const item of items) {
      insert.run(
        item.candidate.lang, text, item.partner,
        collocationPattern(item.particle, item.order), item.count,
      );
    }
  });
  try {
    replace(chosen);
  } catch {
    // A read-only or locked database must not turn an expansion the reader asked
    // for into a rejected invoke. The rows below then come back empty, which is
    // the honest answer: nothing was stored, so nothing is reported as stored.
  }

  const stored = db.prepare(`
    select lang, partner, pattern, count from collocations
    where lang in (${placeholders}) and head = ?
  `).all(...langs, text) as Array<{
    lang: string; partner: string; pattern: string; count: number;
  }>;

  // Keyed by language too, so two partitions that happen to carry the same phrase
  // for the same head stay two rows rather than silently collapsing into one.
  const draftKey = (lang: string, partner: string, pattern: string) => `${lang}\t${partner}\t${pattern}`;
  const byRow = new Map(chosen.map((item) => [
    draftKey(item.candidate.lang, item.partner, collocationPattern(item.particle, item.order)),
    item,
  ]));
  const collocations: LexiconCollocation[] = [];
  for (const row of stored) {
    const draft = byRow.get(draftKey(row.lang, row.partner, row.pattern));
    if (!draft) continue;
    const gloss = partnerGloss.get(row.partner);
    collocations.push({
      lang: row.lang,
      head: draft.head,
      partner: row.partner,
      particle: draft.particle,
      order: draft.order,
      phrase: renderCollocationPattern(row.pattern, draft.head, row.partner),
      pattern: row.pattern,
      count: row.count,
      reading: draft.candidate.reading,
      dictId: draft.candidate.dictId,
      dictTitle: draft.candidate.dictTitle,
      // Derived on every call rather than stored beside the row: the gloss
      // belongs to the partner's entry, which a dictionary change can move, and
      // `collocations` has no revision column to notice that with.
      ...(gloss ? { partnerGloss: gloss } : {}),
    });
  }
  // The stored read is unordered; restore the commonness order the scan produced.
  const rank = new Map(chosen.map((item, index) => [
    draftKey(item.candidate.lang, item.partner, collocationPattern(item.particle, item.order)),
    index,
  ]));
  collocations.sort((a, b) =>
    (rank.get(draftKey(a.lang, a.partner, a.pattern)) ?? 0)
    - (rank.get(draftKey(b.lang, b.partner, b.pattern)) ?? 0));

  return { query: text, collocations };
}

export interface EtymologyQuery {
  text: string;
  /** Source languages to match headwords in. Every language when omitted. */
  sourceLangs?: DictLangCode[];
  limit?: number;
}

/**
 * Headword rows probed before their etymologies are read. A word can legitimately
 * exist in several installed dictionaries; past this it is a normalisation
 * collision, not a word.
 */
const ETYMOLOGY_HEADWORD_ROWS = 24;

/**
 * The origin paragraphs the installed dictionaries state for a word.
 *
 * ## Why an equality probe and not `lookup()`
 *
 * The compound expansion runs `lookup()` first because it needs to know whether
 * the query *is* a word before paying for an index scan. This has no scan to
 * guard: it is one equality on `idx_hw_norm` and one indexed read of
 * `idx_etym_head`. Going through `lookup()` would additionally pull in the
 * de-inflection, prefix and reading passes, so a kana query could resolve to a
 * homophone and attach that word's origin to this one — an etymology is the one
 * fact where landing on the wrong headword is indistinguishable from a lie.
 *
 * Matching is therefore on `norm` alone. The caller passes a headword the lookup
 * already resolved, so the written form is what is in hand.
 *
 * ## Ordering
 *
 * Dictionary priority first, the same precedence every other surface uses, so the
 * source a user ranked highest speaks first. `selectLexiconEtymologies` then drops
 * the repeats — Wiktextract emits one record per part of speech and repeats the
 * paragraph on each.
 */
export function findLexiconEtymology(db: SqliteDb, query: EtymologyQuery): LexiconEtymologyResult {
  const text = query.text.trim();
  const empty: LexiconEtymologyResult = { query: text, etymologies: [] };
  if (!text) return empty;

  const langs = query.sourceLangs?.length ? [...new Set(query.sourceLangs)] : [];
  const langFilter = langs.length ? ` and h.lang in (${langs.map(() => '?').join(',')})` : '';
  const headwords = db.prepare(`
    select h.id, h.lang, h.dict_id, d.title as dict_title
    from headwords h indexed by idx_hw_norm
    join dictionaries d on d.id = h.dict_id
    where h.norm = ? and d.enabled = 1${langFilter}
    order by d.priority desc, h.id asc
    limit ?
  `).all(normalizeForLookup(text), ...langs, ETYMOLOGY_HEADWORD_ROWS) as Array<{
    id: number; lang: string; dict_id: string; dict_title: string;
  }>;
  if (!headwords.length) return empty;

  const etymologyRows = db.prepare(`
    select headword_id, text, source
    from etymology
    where headword_id in (${headwords.map(() => '?').join(',')})
  `).all(...headwords.map((row) => row.id)) as Array<{
    headword_id: number; text: string; source: string | null;
  }>;
  if (!etymologyRows.length) return empty;

  // The SQL above deliberately has no ORDER BY: `idx_etym_head` is not ordered by
  // the headword sequence the priority sort produced, so sorting there would ask
  // SQLite for a sort it cannot serve from the index. The rows are few — bounded
  // by 24 headwords — so they are reordered here into the headword order instead.
  const byHeadword = new Map<number, typeof etymologyRows>();
  for (const row of etymologyRows) {
    const bucket = byHeadword.get(row.headword_id);
    if (bucket) bucket.push(row);
    else byHeadword.set(row.headword_id, [row]);
  }

  const ordered: LexiconEtymology[] = [];
  for (const headword of headwords) {
    for (const row of byHeadword.get(headword.id) ?? []) {
      const source = row.source?.trim();
      ordered.push({
        lang: headword.lang,
        text: row.text,
        dictId: headword.dict_id,
        dictTitle: headword.dict_title,
        ...(source ? { pos: source } : {}),
      });
    }
  }

  return {
    query: text,
    etymologies: selectLexiconEtymologies(ordered, query.limit ?? MAX_ETYMOLOGY_RESULTS),
  };
}

export interface FrequencyQuery {
  text: string;
  /** Corpus languages to match. Every language when omitted. */
  sourceLangs?: DictLangCode[];
  limit?: number;
}

/**
 * Frequency rows read before selection.
 *
 * `freq_corpora` has no unique constraint, so one corpus can legitimately hold
 * several rows for the same normalised form. The cap bounds the read without
 * bounding the *answer*: `selectLexiconFrequencies` keeps the best rank per
 * corpus afterwards, so a source with four spellings of one word still gets one
 * row and its lowest rank.
 */
const FREQUENCY_SCAN_ROWS = 64;

/**
 * How common a word is, in the corpora this install actually has.
 *
 * ## Why this does not go through `headwords`
 *
 * Unlike etymology or cross references, a frequency row is not attached to a
 * headword id — it is keyed on `(lang, norm, corpus)` and `idx_freq_norm` exists
 * for exactly this probe. Going via `headwords` would silently drop every corpus
 * that ranks a word no installed dictionary happens to define, which is the case
 * a frequency list is most useful in.
 *
 * The join to `dictionaries` is for the title and the enabled flag only. A corpus
 * the user switched off must not speak here, for the same reason its definitions
 * do not.
 */
export function findLexiconFrequency(db: SqliteDb, query: FrequencyQuery): LexiconFrequencyResult {
  const text = query.text.trim();
  if (!text) return { query: text, entries: [] };

  const langs = query.sourceLangs?.length ? [...new Set(query.sourceLangs)] : [];
  const langFilter = langs.length ? ` and f.lang in (${langs.map(() => '?').join(',')})` : '';
  const rows = db.prepare(`
    select f.corpus, f.rank, f.per_million, d.title as corpus_title
    from freq_corpora f indexed by idx_freq_norm
    join dictionaries d on d.id = f.corpus
    where f.norm = ? and d.enabled = 1${langFilter}
    order by d.priority desc
    limit ?
  `).all(normalizeForLookup(text), ...langs, FREQUENCY_SCAN_ROWS) as Array<{
    corpus: string; rank: number; per_million: number | null; corpus_title: string | null;
  }>;

  const entries: LexiconFrequencyEntry[] = rows.map((row) => {
    const perMillion = row.per_million;
    return {
      corpusId: row.corpus,
      // A corpus with no title is still a corpus; showing its id beats showing
      // an empty attribution for a number.
      corpusTitle: row.corpus_title?.trim() || row.corpus,
      rank: Number(row.rank),
      ...(typeof perMillion === 'number' && Number.isFinite(perMillion) ? { perMillion } : {}),
    };
  });

  return buildLexiconFrequencyResult(text, entries, query.limit ?? MAX_FREQUENCY_RESULTS);
}

/**
 * SQLite's default `SQLITE_MAX_VARIABLE_NUMBER` is 999 on older builds. Chunking
 * at 400 leaves room for the language filter without ever approaching it.
 */
const FREQUENCY_BATCH_TERMS = 400;

/** A character's exam levels from KANJIDIC2 (JLPT) and the Chinese character data (HSK). */
export interface CharacterLevels {
  /** KANJIDIC2's pre-2010 JLPT level, `1`–`4` (4 easiest), as stored. */
  jlpt?: string;
  hsk?: string;
}

/**
 * Exam levels for many characters at once, for a media difficulty estimate
 * when the learner has not uploaded level lists: without this every analysis
 * read "Unrated" although the dictionary already knew the JLPT level of every
 * common kanji. One `IN` query per chunk; characters with no level are absent.
 */
export function findCharacterLevels(db: SqliteDb, chars: readonly string[]): Record<string, CharacterLevels> {
  const unique = [...new Set(chars.filter((c) => [...c].length === 1))];
  const out: Record<string, CharacterLevels> = {};
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const rows = db
      .prepare(`select char, jlpt, hsk from chars where char in (${chunk.map(() => '?').join(',')}) and (jlpt is not null or hsk is not null)`)
      .all(...chunk) as Array<{ char: string; jlpt: string | null; hsk: string | null }>;
    for (const row of rows) {
      const entry = (out[row.char] ??= {});
      if (row.jlpt && !entry.jlpt) entry.jlpt = String(row.jlpt);
      if (row.hsk && !entry.hsk) entry.hsk = String(row.hsk);
    }
  }
  return out;
}

/**
 * The best rank each of many words has, in one pass.
 *
 * The Deck Workbench needs a rank for every note on a page before it can filter
 * on one, and `findLexiconFrequency` per word would be thousands of statements
 * on the main thread. This is the same indexed probe widened to an `IN` over a
 * chunk of normalized forms, with `min(rank)` per form done by SQLite — the
 * per-corpus breakdown the single-word reader returns is not what a filter
 * needs, so none of it crosses the wire.
 *
 * A word no enabled corpus ranks is **absent from the result**, never zero and
 * never a large number: the caller has to be able to tell "nothing ranks this"
 * from "ranked far down the list".
 */
export function findLexiconFrequencyRanks(
  db: SqliteDb,
  terms: readonly string[],
  sourceLangs?: DictLangCode[],
): Map<string, number> {
  const out = new Map<string, number>();
  const langs = sourceLangs?.length ? [...new Set(sourceLangs)] : [];
  const langFilter = langs.length ? ` and f.lang in (${langs.map(() => '?').join(',')})` : '';

  // Normalized form → the terms that share it, so the answer comes back keyed
  // by what the caller asked rather than by an internal normalization.
  const byNorm = new Map<string, string[]>();
  for (const term of terms.slice(0, MAX_FREQUENCY_BATCH)) {
    const trimmed = term.trim().slice(0, MAX_FREQUENCY_QUERY_CHARS);
    if (!trimmed) continue;
    const norm = normalizeForLookup(trimmed);
    if (!norm) continue;
    const list = byNorm.get(norm);
    if (list) list.push(term);
    else byNorm.set(norm, [term]);
  }

  const norms = [...byNorm.keys()];
  for (let at = 0; at < norms.length; at += FREQUENCY_BATCH_TERMS) {
    const chunk = norms.slice(at, at + FREQUENCY_BATCH_TERMS);
    const rows = db.prepare(`
      select f.norm as norm, min(f.rank) as rank
      from freq_corpora f
      join dictionaries d on d.id = f.corpus
      where f.norm in (${chunk.map(() => '?').join(',')}) and d.enabled = 1${langFilter}
      group by f.norm
    `).all(...chunk, ...langs) as Array<{ norm: string; rank: number }>;
    for (const row of rows) {
      const rank = Number(row.rank);
      if (!Number.isFinite(rank) || rank < 1) continue;
      for (const term of byNorm.get(row.norm) ?? []) out.set(term, rank);
    }
  }
  return out;
}

export interface XrefQuery {
  text: string;
  /** Source languages to match headwords in. Every language when omitted. */
  sourceLangs?: DictLangCode[];
  limit?: number;
}

/**
 * Headword rows probed before their cross references are read. Same bound and
 * same reasoning as `ETYMOLOGY_HEADWORD_ROWS`.
 */
const XREF_HEADWORD_ROWS = 24;

/**
 * Cross-reference rows read before selection. A single Wiktionary sense can carry
 * a hundred "related terms", and `selectLexiconXrefs` keeps 24 — so the cap
 * bounds work that would otherwise be discarded, and it is applied after the
 * indexed read rather than instead of it.
 */
const XREF_SCAN_ROWS = 400;

/**
 * The words the installed dictionaries point at from this word's senses.
 *
 * This is the first reader `xrefs` has ever had. Like `examples` before it, the
 * table shipped in v1 with an index and no traffic at all in either direction.
 *
 * ## Why the same equality probe as the etymology reader
 *
 * Not `lookup()`, for the reason recorded there: the de-inflection and reading
 * passes can resolve a kana query to a homophone, and attaching that word's
 * synonym list to this one is indistinguishable from inventing it. Matching is on
 * `norm` alone, and the caller passes a headword the lookup already resolved.
 *
 * ## Resolution is a probe, not a join
 *
 * `xrefs.to_text` is free text — Wiktionary points at words a given install has
 * no dictionary for. Two batched equalities over the handful of targets that
 * survived selection tell the surface which ones are navigable, so a reference is
 * never rendered as a link that would open an empty result: one on `idx_hw_norm`,
 * then one on `idx_hw_reading` for whatever the first did not place, because a
 * bare-kana target is a headword's *reading* rather than its `norm`. Both probes
 * deliberately run *after* selection: resolving all 400 scanned rows to throw
 * away 376 of them is the same mistake the example reader documents.
 */
export function findLexiconXrefs(db: SqliteDb, query: XrefQuery): LexiconXrefResult {
  const text = query.text.trim();
  const empty: LexiconXrefResult = { query: text, xrefs: [] };
  if (!text) return empty;

  const langs = query.sourceLangs?.length ? [...new Set(query.sourceLangs)] : [];
  const langFilter = langs.length ? ` and h.lang in (${langs.map(() => '?').join(',')})` : '';
  const headwords = db.prepare(`
    select h.id, h.lang, h.dict_id, d.title as dict_title
    from headwords h indexed by idx_hw_norm
    join dictionaries d on d.id = h.dict_id
    where h.norm = ? and ${WORD_SOURCE_WHERE}${langFilter}
    order by d.priority desc, h.id asc
    limit ?
  `).all(normalizeForLookup(text), ...langs, XREF_HEADWORD_ROWS) as Array<{
    id: number; lang: string; dict_id: string; dict_title: string;
  }>;
  if (!headwords.length) return empty;

  const rows = db.prepare(`
    select s.headword_id, s.pos, x.to_text, x.kind
    from senses s
    join xrefs x on x.from_sense = s.id
    where s.headword_id in (${headwords.map(() => '?').join(',')})
    order by s.headword_id, s.ord, x.rowid
    limit ?
  `).all(...headwords.map((row) => row.id), XREF_SCAN_ROWS) as Array<{
    headword_id: number; pos: string | null; to_text: string; kind: string;
  }>;
  if (!rows.length) return empty;

  // Reordered into the priority order the headword probe produced, for the same
  // reason the etymology reader does it in JavaScript: the SQL above is ordered
  // by `headword_id` because that is what the index can serve, and that is not
  // the order `d.priority desc` put the headwords in.
  const byHeadword = new Map<number, typeof rows>();
  for (const row of rows) {
    const bucket = byHeadword.get(row.headword_id);
    if (bucket) bucket.push(row);
    else byHeadword.set(row.headword_id, [row]);
  }

  const kinds = new Set<string>(LEXICON_XREF_KINDS);
  const ordered: LexiconXref[] = [];
  for (const headword of headwords) {
    for (const row of byHeadword.get(headword.id) ?? []) {
      // A row whose kind is not one of the four the schema documents is dropped
      // rather than defaulted. The surface groups and labels by kind, so a
      // fallback would file the reference under a relation nobody claimed.
      if (!kinds.has(row.kind)) continue;
      const pos = row.pos?.trim();
      ordered.push({
        kind: row.kind as LexiconXrefKind,
        text: row.to_text,
        lang: headword.lang,
        dictId: headword.dict_id,
        dictTitle: headword.dict_title,
        resolved: false,
        ...(pos ? { pos } : {}),
      });
    }
  }

  const chosen = selectLexiconXrefs(ordered, query.limit ?? MAX_XREF_RESULTS);
  if (!chosen.length) return empty;

  const norms = [...new Set(chosen.map((row) => normalizeForLookup(row.text)))].filter(Boolean);
  const resolved = new Set<string>();
  if (norms.length) {
    const found = db.prepare(`
      select distinct h.norm
      from headwords h indexed by idx_hw_norm
      join dictionaries d on d.id = h.dict_id
      where h.norm in (${norms.map(() => '?').join(',')}) and ${WORD_SOURCE_WHERE}
    `).all(...norms) as Array<{ norm: string }>;
    for (const row of found) resolved.add(row.norm);

    // Second probe, over readings, for the targets `norm` could not place. JMdict
    // writes a quarter of its references in bare kana (`see: みっこくしゃ` for
    // 密告者), and those rows are stored as the *reading* of a kanji headword, not
    // as a `norm` — so a norm-only probe marked 13,204 of 53,540 navigable targets
    // unavailable. `lookup` resolves them through `byReading` with exactly this
    // normalization, so the marker was wrong, not the navigation.
    const unresolved = norms.filter((norm) => !resolved.has(norm));
    const readingLangs = [...new Set(headwords.map((row) => row.lang))];
    if (unresolved.length && readingLangs.length) {
      // Scoped to the languages the headword probe already returned, because
      // `idx_hw_reading` leads on `lang`: without the equality the index cannot
      // serve the probe at all and `INDEXED BY` would fail loudly. Those are also
      // the only languages a reference from this entry could be navigable in.
      const byReading = db.prepare(`
        select distinct h.reading_norm as norm
        from headwords h indexed by idx_hw_reading
        join dictionaries d on d.id = h.dict_id
        where h.lang in (${readingLangs.map(() => '?').join(',')})
          and h.reading_norm in (${unresolved.map(() => '?').join(',')})
          and ${WORD_SOURCE_WHERE}
      `).all(...readingLangs, ...unresolved) as Array<{ norm: string }>;
      for (const row of byReading) resolved.add(row.norm);
    }
  }

  return {
    query: text,
    xrefs: chosen.map((row) => ({ ...row, resolved: resolved.has(normalizeForLookup(row.text)) })),
  };
}

export interface ExampleQuery {
  text: string;
  /** Sentence languages to search. The query's own detected languages when omitted. */
  sourceLangs?: DictLangCode[];
  /** Translation languages worth showing. All of them when omitted. */
  glossLangs?: DictLangCode[];
  limit?: number;
}

/**
 * Sentences from an imported example corpus that contain the queried word.
 *
 * This is the first reader `examples`/`example_translations` have ever had. Both
 * tables shipped in v1 with FTS5 and its triggers and no writer; the Tatoeba
 * importer wrote sentences into `headwords` instead, which is why 200k sentences
 * could be imported and none of them was reachable as an example.
 *
 * ## Why `instr` and not `examples_fts`, which is right there
 *
 * The same reason `findLexiconCompounds` cannot use `headwords_fts`: unicode61
 * treats an unbroken CJK run as one token, so a phrase MATCH on 猫 matches a
 * sentence only if 猫 is delimited in it — which in Japanese it essentially never
 * is. The FTS table is genuinely useful for a Latin or Cyrillic corpus and
 * genuinely useless for the Japanese one this feature exists for, so it is left in
 * step by its triggers and not read here.
 *
 * ## Why the scan is capped, unordered, and walked in chunks
 *
 * `instr` over a text column cannot use an index whatever the SQL says, so the
 * visit is a table scan and the only lever is how it is spent. `limit
 * EXAMPLE_SCAN_ROWS` with no `ORDER BY` bounds the RESULT — it does not bound
 * the visit, and the earlier claim here that it did was wrong. Measured on the
 * shipped Tatoeba corpus (234,982 rows), collecting 400 matches costs 40.9%
 * (海) to 99.8% (痛い) of the table, mean 70.4%: at a match density of 0.1-0.4%
 * the cap essentially never fires early. A global `order by length(e.text)`
 * would be strictly worse — every sentence visited before the first row
 * returns — so shortest-first is still applied to the scanned rows in
 * `selectLexiconExamples`, a bounded sample rather than the corpus optimum.
 *
 * What that visit costs is page residency, not CPU: the same word is 6,590.8 ms
 * on a boot's first lookup and 35.5 ms on its second, and 痛い pays 641.6 ms for
 * the 9.7% of the table 食べる left cold. So the scan is walked in
 * `EXAMPLE_SCAN_CHUNK_ROWS` windows with the event loop yielded between them:
 * the total stays the same, but no single main-process block is over 500 ms,
 * which is what CLAUDE.md forbids and what a user feels. The window is on `id`
 * (the rowid), so the rows visited, their order and the sentences chosen are
 * identical to the single scan this replaced.
 */
export async function findExampleSentences(
  db: SqliteDb,
  query: ExampleQuery,
): Promise<LexiconExampleResult> {
  const text = query.text.trim();
  const empty: LexiconExampleResult = { query: text, examples: [] };
  if (!text || [...text].length > MAX_EXAMPLE_QUERY_CHARS) return empty;

  const langs = query.sourceLangs?.length ? [...new Set(query.sourceLangs)] : detectQueryLangs(text);
  if (!langs.length) return empty;

  // Only stores that declare themselves example corpora, which is the same
  // predicate `WORD_SOURCE_WHERE` uses to keep them out of word lookups. The two
  // halves are complementary on purpose: every enabled store is read by exactly
  // one of them.
  const scan = db.prepare(`
    select e.id, e.lang, e.text, e.source, e.licence, e.dict_id, d.title as dict_title
    from examples e
    join dictionaries d on d.id = e.dict_id
    where d.enabled = 1
      and d.kind = '${EXAMPLE_DICTIONARY_KIND}'
      and e.lang in (${langs.map(() => '?').join(',')})
      and e.id > ? and e.id <= ?
      and instr(e.text, ?) > 0
    limit ?
  `);
  type ExampleScanRow = {
    id: number; lang: string; text: string; source: string | null; licence: string | null;
    dict_id: string; dict_title: string;
  };
  // One rowid probe, not a count: `max(id)` is an index lookup, and a window
  // that runs past the last row simply returns nothing.
  const lastId = (db.prepare('select coalesce(max(id), 0) as top from examples')
    .get() as { top: number }).top;

  const rows: ExampleScanRow[] = [];
  for (let from = 0; from < lastId && rows.length < EXAMPLE_SCAN_ROWS; from += EXAMPLE_SCAN_CHUNK_ROWS) {
    const upto = Math.min(from + EXAMPLE_SCAN_CHUNK_ROWS, lastId);
    rows.push(...scan.all(
      ...langs, from, upto, text, EXAMPLE_SCAN_ROWS - rows.length,
    ) as ExampleScanRow[]);
    // Yielded between windows, never inside one: a `setImmediate` turn is what
    // lets a pending IPC call, a paint or a `/health` probe run before the next
    // few hundred pages are faulted in.
    if (upto < lastId && rows.length < EXAMPLE_SCAN_ROWS) {
      await new Promise<void>((resolve) => { setImmediate(resolve); });
    }
  }

  const chosen = selectLexiconExamples(text, rows.map((row) => ({
    exampleId: row.id,
    lang: row.lang,
    text: row.text,
    dictId: row.dict_id,
    dictTitle: row.dict_title,
    ...(row.source ? { sourceId: row.source } : {}),
    ...(row.licence ? { licence: row.licence } : {}),
  })), query.limit ?? MAX_EXAMPLE_RESULTS);
  if (!chosen.length) return empty;

  // One bounded read for the handful that survived, rather than a join carrying
  // every translation of all 400 scanned rows through the selection.
  const glossLangs = query.glossLangs?.length ? [...new Set(query.glossLangs)] : [];
  const langFilter = glossLangs.length
    ? ` and t.lang in (${glossLangs.map(() => '?').join(',')})`
    : '';
  const translationRows = db.prepare(`
    select t.example_id, t.lang, t.text
    from example_translations t
    where t.example_id in (${chosen.map(() => '?').join(',')})${langFilter}
    order by t.example_id, t.rowid
  `).all(...chosen.map((item) => item.exampleId), ...glossLangs) as Array<{
    example_id: number; lang: string; text: string;
  }>;
  const byExample = new Map<number, LexiconExampleTranslation[]>();
  for (const row of translationRows) {
    const list = byExample.get(row.example_id) ?? [];
    list.push({ lang: row.lang, text: row.text });
    byExample.set(row.example_id, list);
  }

  return {
    query: text,
    examples: chosen.map((item) => ({
      lang: item.lang,
      text: item.text,
      translations: byExample.get(item.exampleId) ?? [],
      dictId: item.dictId,
      dictTitle: item.dictTitle,
      ...(item.sourceId ? { sourceId: item.sourceId } : {}),
      ...(item.licence ? { licence: item.licence } : {}),
    })),
  };
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
