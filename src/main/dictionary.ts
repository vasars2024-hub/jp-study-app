import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { mt } from './i18n';
import type {
  DictEntry,
  DictResult,
  ExampleResult,
  ExampleSentence,
  YomitanDictInfo,
} from '../shared/types';
import type { CandidateGlosses, CandidateGlossLang } from '../shared/mining';
import {
  fetchJapaneseAudio,
  getAvailableGlossLangs,
  getDictRegistryHash,
  getFrequencyDetail,
  getPitch,
  importYomitanZip,
  initYomitan,
  listYomitanDicts,
  lookupGlossary,
  getPitchData,
  lookupOfflineDeinflected,
  lookupTermMerged,
  moveYomitanDict,
  removeYomitanDict,
  setYomitanEnabled,
  setYomitanLang,
} from './dictionary/yomitan';
import { candidateLookupKey, glossFromEntry } from '../shared/epubEnrichment';
import { hasKana, textMatchesLang } from '../shared/langs';
import {
  cacheExamples,
  importOfflineExamples,
  offlineStatus,
  searchOffline,
} from './dictionary/tatoebaOffline';
import { enrichLexiconResultMetadata, lookupResultToDictResult } from './dictionary/lexiconAdapter';
import { legacyBatchToLookupResult } from './dictionary/legacyInterlinear';
import {
  lookupChineseInDictionary,
  lookupInDictionaryDb,
  lookupOfflineInterlinearFromStore,
  resetChineseDictionaryCache,
  findSemanticNeighborsInDb,
  findLexiconCompoundsInDb,
  findExampleSentencesInDb,
  findLexiconEtymologyInDb,
  listDictionarySources,
  listDictionaryPairs,
  dictionaryPairHasOverride,
  moveDictionarySourceInPair,
  resetDictionaryPairPriority,
  setDictionarySourceEnabled,
  moveDictionarySource,
  removeDictionarySource,
  listUserNotesFromDb,
  readUserNoteFromDb,
  writeUserNoteToDb,
} from './dictionary/service';
import {
  notesToCsv,
  readNoteExportQuery,
  readNoteIdentity,
  readNoteInput,
  readNoteListQuery,
  NOTE_EXPORT_MAX_ROWS,
  type LexiconNote,
  type LexiconNoteExportResult,
  type LexiconNoteListResult,
} from '../shared/lexiconNotes';
import {
  GLOBAL_PAIR,
  isGlobalPair,
  type DictionaryLanguagePair,
} from '../shared/dictionarySources';
import {
  MAX_NEIGHBOR_RESULTS,
  type LexiconNeighborResult,
} from '../shared/lexiconNeighbors';
import {
  MAX_COMPOUND_QUERY_CHARS,
  MAX_COMPOUND_RESULTS,
  type LexiconCompoundResult,
} from '../shared/lexiconCompounds';
import {
  MAX_EXAMPLE_QUERY_CHARS,
  MAX_EXAMPLE_RESULTS,
  type LexiconExampleResult,
} from '../shared/lexiconExamples';
import {
  MAX_ETYMOLOGY_QUERY_CHARS,
  MAX_ETYMOLOGY_RESULTS,
  type LexiconEtymologyResult,
} from '../shared/lexiconEtymology';
import {
  registerDictionaryImportIpc,
  startPendingLegacyDictionaryMigration,
  startSourceLangRelabel,
} from './dictionary/importIpc';
import { resolveCustomFrequencyRanks } from './mining';
import { getMainJapaneseTokenizer } from './japaneseTokenizer';
import {
  analyzeConjugationTokens,
  type ConjugationAnalysis,
} from '../shared/conjugationClass';
import { attachLexiconFrequency } from '../shared/lexiconDifficulty';
import {
  alignLexiconMorphemes,
  attachLexiconPartOfSpeech,
} from '../shared/lexiconPartOfSpeech';
import { normalizeLexiconText } from '../shared/lexiconWorkbench';
import {
  MAX_OFFLINE_INTERLINEAR_CHARS,
  MAX_OFFLINE_INTERLINEAR_MERGE_SEGMENTS,
  type LexiconInterlinearOptions,
  type LexiconInterlinearResult,
} from '../shared/lexiconInterlinear';

// Dictionary lookups go through Jisho.org (the same JMdict data Yomitan's main
// dictionary is built on). We fetch here in the main process so the renderer
// never hits a CORS wall. Offline Yomitan dictionaries (Phase D) merge in
// glossary, pitch, and frequency when imported.

const JISHO_URL = 'https://jisho.org/api/v1/search/words';

async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ----- Jisho dictionary --------------------------------------------------

function mapJlpt(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t).replace(/^jlpt-/i, '').toUpperCase())
    .filter(Boolean);
}

function mapEntry(d: any): DictEntry {
  const jp = Array.isArray(d?.japanese) && d.japanese.length ? d.japanese[0] : {};
  const reading: string = jp.reading ?? '';
  const word: string = jp.word ?? reading;
  const senses = Array.isArray(d?.senses)
    ? d.senses.map((s: any) => ({
        partsOfSpeech: Array.isArray(s?.parts_of_speech) ? s.parts_of_speech : [],
        definitions: Array.isArray(s?.english_definitions) ? s.english_definitions : [],
        tags: [
          ...(Array.isArray(s?.tags) ? s.tags : []),
          ...(Array.isArray(s?.info) ? s.info : []),
        ],
      }))
    : [];
  return {
    word,
    reading,
    isCommon: Boolean(d?.is_common),
    jlpt: mapJlpt(d?.jlpt),
    senses,
  };
}

export async function lookupWord(query: string): Promise<DictResult> {
  const q = (query ?? '').trim();
  if (!q) return { query: q, entries: [] };
  try {
    const res = await fetchWithTimeout(
      `${JISHO_URL}?keyword=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json' } },
      8000,
    );
    if (!res.ok) throw new Error(`Jisho returned ${res.status}`);
    const json: any = await res.json();
    const data = Array.isArray(json?.data) ? json.data : [];
    return { query: q, entries: data.slice(0, 8).map(mapEntry) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const offline = /abort|fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(detail);
    return {
      query: q,
      entries: [],
      error: offline ? 'No internet connection for the dictionary.' : detail,
    };
  }
}

/** Merged offline Yomitan + pitch/freq enrichment, with Jisho fallback. */
export async function lookupTerm(query: string): Promise<DictResult> {
  const q = normalizeLexiconText(query ?? '');
  if (!q) return { query: q, entries: [] };

  // SQLite/FTS is the canonical any-to-any path. It is additive during the
  // migration: installations whose legacy JSON stores have not been imported
  // yet still use the existing Yomitan/Jisho path below, unchanged.
  try {
    const unified = lookupInDictionaryDb({ text: q, limit: 8 });
    if (unified.entries.length) {
      const converted = lookupResultToDictResult(unified);
      // Preserve the legacy popup's pitch/frequency contract while the unified
      // schema grows first-class metadata fields of its own.
      try {
        await initYomitan();
        return enrichLexiconResultMetadata(converted, {
          pitchHtml: getPitch,
          frequency: getFrequencyDetail,
        });
      } catch {
        return converted;
      }
    }
  } catch {
    // A database read must never take the established dictionary fallback down.
  }

  await initYomitan();
  const merged = await lookupTermMerged(q, lookupWord);
  if (merged.entries.length || merged.error) return merged;

  // Nothing matched exactly in either store. Before reporting "no match", ask the
  // database for close spellings — this is the only caller that opts into fuzzy
  // matching, and only once every exact path has already failed, so an
  // approximate answer can never displace a real one.
  try {
    const approximate = lookupResultToDictResult(lookupInDictionaryDb({ text: q, limit: 8, fuzzy: true }));
    if (approximate.approximate) return approximate;
  } catch {
    // A database read must never take the established dictionary fallback down.
  }
  return merged;
}

/** Offline-only Yomitan glossary lookup (de-inflection aware) — no Jisho HTTP. */
export async function lookupTermOffline(query: string): Promise<DictResult> {
  await initYomitan();
  const q = (query ?? '').trim();
  if (!q) return { query: q, entries: [] };
  const local = lookupOfflineDeinflected(q);
  return { query: q, entries: local.entries, deinflection: local.deinflection };
}

/**
 * The Workbench's interlinear, over both dictionary stores.
 *
 * `lookupTerm` above is additive during the migration and never had to say so
 * twice; this is the same concession for the passage-level path, which did not
 * have it. SQLite answers first and a legacy hit is used only when it returned
 * nothing, so importing a dictionary changes the source without changing the
 * result shape.
 *
 * `initYomitan()` is awaited here because the legacy maps are loaded lazily and
 * `buildOfflineInterlinear`'s lookup callback is synchronous — the index has to
 * already be in memory by the time the first token is probed. The lookup itself
 * is exact-only: a prefix hit would ground a token on a word the passage never
 * contained.
 */
export async function lookupOfflineInterlinearMerged(
  text: string,
  options: LexiconInterlinearOptions = {},
): Promise<LexiconInterlinearResult> {
  let result: LexiconInterlinearResult;
  try {
    await initYomitan();
    const dicts = listYomitanDicts();
    result = lookupOfflineInterlinearFromStore(text, options, (query) =>
      legacyBatchToLookupResult(query, lookupOfflineDeinflected(query, true), dicts));
  } catch {
    // A legacy store that will not load must not take the database path down.
    result = lookupOfflineInterlinearFromStore(text, options);
  }
  const ranked = options.withFrequency
    ? attachLexiconFrequency(result, interlinearFrequencyResolver(result))
    : result;
  return options.withPartOfSpeech ? analyzeInterlinearPartOfSpeech(ranked) : ranked;
}

/**
 * Label each token of a Japanese passage with what it was doing there.
 *
 * The gate is kana in the passage itself, not the caller's requested source
 * language. IPADIC is a Japanese dictionary and would happily label a Chinese
 * sentence with Japanese parts of speech, so a wrong `sourceLangs` must not be
 * able to invent an analysis; kana, meanwhile, appears in essentially every real
 * Japanese passage precisely because it carries the particles this exists to
 * identify. A pure-kanji fragment therefore goes unanalysed, which the profile
 * reports as "not analysed" rather than as "no grammar here".
 *
 * The analyser is shared with mining and Study analysis and its dictionary is
 * built once per process, so this is a lookup after the first passage. A failure
 * to load it returns the passage untouched: an unlabelled result is the exact
 * shape every consumer already handles.
 */
async function analyzeInterlinearPartOfSpeech(
  result: LexiconInterlinearResult,
): Promise<LexiconInterlinearResult> {
  if (!hasKana(result.text)) return result;
  try {
    const tokenizer = await getMainJapaneseTokenizer();
    if (!tokenizer) return result;
    const morphemes = tokenizer.tokenize(result.text).map((token) => ({
      surface: token.surface_form,
      pos: token.pos,
      detail: token.pos_detail_1,
    }));
    return attachLexiconPartOfSpeech(result, alignLexiconMorphemes(result.text, morphemes));
  } catch {
    // A passage is fully readable with no analysis attached; it must never be
    // the reason a gloss lookup fails.
    return result;
  }
}

/** The list languages the bundled frequency dictionaries are tagged with. */
const FREQUENCY_LIST_LANGS = ['ja', 'zh', 'ru'] as const;

/**
 * Which language's frequency lists this passage should be ranked against.
 *
 * Taken from the segmenter's own detection rather than the caller's requested
 * `sourceLangs`, because the request is a filter over what to *try* and the
 * result says what the text turned out to be. Ambiguity narrows nothing: a
 * passage detected as several languages, or as none the lists cover, is ranked
 * the old wide way rather than under a guess.
 */
function interlinearListLanguage(
  result: LexiconInterlinearResult,
): (typeof FREQUENCY_LIST_LANGS)[number] | undefined {
  const known = FREQUENCY_LIST_LANGS.filter((lang) => result.detectedLangs.includes(lang));
  return known.length === 1 ? known[0] : undefined;
}

/**
 * One headword's rank, from the frequency lists the user has enabled *in this
 * passage's language*.
 *
 * `resolveCustomFrequencyRanks` ranks across every enabled list and falls back
 * to a Yomitan-imported list, so this only has to name which list produced the
 * winning rank — the lowest one, i.e. the list that considers the word most
 * common. A rank with no list to attribute it to is dropped rather than shown
 * under a made-up source.
 *
 * The language argument is what stops a cross-script list from winning that
 * minimum: Japanese, Chinese and Russian lists are all enabled at once here and
 * the CJK ones share characters. See `resolveCustomFrequencyRanks` for the
 * measurement.
 */
function interlinearFrequencyResolver(result: LexiconInterlinearResult) {
  const language = interlinearListLanguage(result);
  return (text: string, reading: string) => {
    const ranks = resolveCustomFrequencyRanks(text, reading || undefined, language);
    if (ranks.primary == null) return undefined;
    const source = Object.entries(ranks.byDictionary)
      .find(([, rank]) => rank === ranks.primary)?.[0];
    return source ? { rank: ranks.primary, source } : undefined;
  };
}

// ----- Persistent gloss cache ----------------------------------------------

interface GlossCacheFile {
  registryHash: string;
  entries: Record<string, CandidateGlosses>;
}

const GLOSS_BATCH_CONCURRENCY = 32;

function glossCachePath(): string {
  return path.join(app.getPath('userData'), 'mining', 'gloss-cache.json');
}

function readGlossCache(): GlossCacheFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(glossCachePath(), 'utf-8')) as GlossCacheFile;
    if (parsed?.entries && typeof parsed.registryHash === 'string') return parsed;
  } catch {
    /* fresh cache */
  }
  return { registryHash: '', entries: {} };
}

function writeGlossCache(cache: GlossCacheFile): void {
  const dir = path.dirname(glossCachePath());
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${glossCachePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache), 'utf-8');
  fs.renameSync(tmp, glossCachePath());
}

/**
 * Resolve each requested language's gloss across ALL matched dictionary entries
 * (e.g. a JMdict-EN entry and a JMdict-RU entry for the same word). Entries
 * whose source dictionary declares the target language win outright — that is
 * what separates German from English glosses (both Latin script); script
 * matching is the second pass, and en/ja keep a lenient fallback for legacy
 * dictionaries with no language tags.
 */
function resolveGlossesForEntries(
  entries: DictEntry[],
  langs: CandidateGlossLang[],
): CandidateGlosses {
  const out: CandidateGlosses = {};
  for (const lang of langs) {
    let best = '';
    let scriptMatch = '';
    let fallback = '';
    for (const entry of entries) {
      const declared = entry.sourceLangs?.includes(lang) ?? false;
      // Entries declared for a DIFFERENT language never serve this one.
      if (entry.sourceLangs?.length && !declared) continue;
      const text = glossFromEntry(entry, lang);
      if (!text) continue;
      if (declared && textMatchesLang(lang, text)) {
        best = text;
        break;
      }
      if (!scriptMatch && textMatchesLang(lang, text)) scriptMatch = text;
      if (!fallback) fallback = text;
    }
    const lenient = lang === 'en' || lang === 'ja' ? fallback : '';
    out[lang] = best || scriptMatch || lenient || '';
  }
  return out;
}

export interface GlossLookupQuery {
  expression: string;
  reading?: string;
}

export async function lookupTermsBatch(
  queries: GlossLookupQuery[],
  langs: CandidateGlossLang[],
): Promise<Record<string, CandidateGlosses>> {
  await initYomitan();
  const registryHash = getDictRegistryHash();
  const cache = readGlossCache();
  if (cache.registryHash !== registryHash) {
    cache.registryHash = registryHash;
    cache.entries = {};
  }

  const result: Record<string, CandidateGlosses> = {};
  const unique = new Map<string, GlossLookupQuery>();
  for (const q of queries) {
    const key = candidateLookupKey(q.expression, q.reading);
    unique.set(key, q);
  }

  const toFetch: Array<{ key: string; query: GlossLookupQuery }> = [];
  for (const [key, query] of unique) {
    const cached = cache.entries[key];
    if (cached) {
      const hasAll = langs.every((lang) => typeof cached[lang] === 'string');
      if (hasAll) {
        result[key] = { ...cached };
        continue;
      }
      result[key] = { ...cached };
    }
    toFetch.push({ key, query });
  }

  let ptr = 0;
  async function worker(): Promise<void> {
    while (ptr < toFetch.length) {
      const i = ptr++;
      const { key, query } = toFetch[i];
      const lookupQ = query.expression.trim() || (query.reading ?? '').trim();
      const entries = lookupGlossary(lookupQ);
      const glosses = resolveGlossesForEntries(entries, langs);
      const merged = { ...(result[key] ?? {}), ...glosses };
      result[key] = merged;
      cache.entries[key] = { ...(cache.entries[key] ?? {}), ...merged };
    }
  }

  const workers = Math.min(GLOSS_BATCH_CONCURRENCY, Math.max(1, toFetch.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  writeGlossCache(cache);
  return result;
}

// ----- Example sentences (Tatoeba) ---------------------------------------

const TATOEBA_V0_URL = 'https://tatoeba.org/en/api_v0/search';
const TATOEBA_V1_URL = 'https://api.tatoeba.org/v1/sentences';
const DEFAULT_FETCH_LIMIT = 20;
const MAX_FETCH_LIMIT = 30;

async function searchTatoebaV0(query: string, limit: number): Promise<ExampleSentence[]> {
  const url =
    `${TATOEBA_V0_URL}?from=jpn&to=eng&query=${encodeURIComponent(query)}` +
    `&sort=relevance&trans_to=eng`;
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 15000);
  if (!res.ok) throw new Error(`Tatoeba v0 returned ${res.status}`);
  const json: any = await res.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  const examples: ExampleSentence[] = [];
  for (const r of results) {
    const jp: string = typeof r?.text === 'string' ? r.text : '';
    if (!jp) continue;
    const flat: any[] = Array.isArray(r?.translations) ? r.translations.flat() : [];
    const en: string = flat.find((t) => t?.lang === 'eng' && t?.text)?.text ?? '';
    examples.push({ jp, en });
    if (examples.length >= limit) break;
  }
  return examples;
}

async function searchTatoebaV1(query: string, limit: number): Promise<ExampleSentence[]> {
  const url =
    `${TATOEBA_V1_URL}?lang=jpn&q=${encodeURIComponent(query)}` +
    `&trans:lang=eng&showtrans:lang=eng&sort=relevance`;
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 15000);
  if (!res.ok) throw new Error(`Tatoeba v1 returned ${res.status}`);
  const json: any = await res.json();
  const results = Array.isArray(json?.data) ? json.data : [];
  const examples: ExampleSentence[] = [];
  for (const r of results) {
    const jp: string = typeof r?.text === 'string' ? r.text : '';
    if (!jp) continue;
    const flat: any[] = Array.isArray(r?.translations) ? r.translations : [];
    const en: string = flat.find((t) => t?.lang === 'eng' && t?.text)?.text ?? '';
    examples.push({ jp, en });
    if (examples.length >= limit) break;
  }
  return examples;
}

async function searchTatoebaOnline(query: string, limit: number): Promise<ExampleSentence[]> {
  try {
    const v0 = await searchTatoebaV0(query, limit);
    if (v0.length > 0) return v0;
  } catch {
    /* Tatoeba v0 is deprecated; v1 is the resilient fallback. */
  }
  return searchTatoebaV1(query, limit);
}

export async function searchExamples(query: string, limit = DEFAULT_FETCH_LIMIT): Promise<ExampleResult> {
  const q = (query ?? '').trim();
  const cap = Math.min(Math.max(limit, 1), MAX_FETCH_LIMIT);
  if (!q) return { query: q, examples: [] };

  const offline = await searchOffline(q, cap);
  const examples = offline.map((s) => ({ jp: s.jp, en: s.en }));

  try {
    if (examples.length < cap) {
      const online = await searchTatoebaOnline(q, cap);
      const seen = new Set(examples.map((e) => `${e.jp}\0${e.en}`));
      for (const ex of online) {
        const key = `${ex.jp}\0${ex.en}`;
        if (seen.has(key)) continue;
        seen.add(key);
        examples.push(ex);
        if (examples.length >= cap) break;
      }
    }
    if (examples.length > 0) {
      void cacheExamples(examples);
    }
    return { query: q, examples: examples.slice(0, cap) };
  } catch (err) {
    if (examples.length > 0) {
      return { query: q, examples: examples.slice(0, cap) };
    }
    const detail = err instanceof Error ? err.message : String(err);
    const offlineOnly = /abort|fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(detail);
    return {
      query: q,
      examples: [],
      error: offlineOnly
        ? 'No internet and no offline examples for this word yet. Import Tatoeba sentences in Settings → Dictionaries.'
        : detail,
    };
  }
}

// ----- IPC ---------------------------------------------------------------

/**
 * A language pair off the wire, or undefined for "the global order".
 *
 * The two codes reach SQL as bound parameters, but they are also compared
 * against `headwords.lang`, so anything that is not a plain non-empty string is
 * rejected here rather than silently matching nothing three layers down.
 */
function readPair(value: unknown): DictionaryLanguagePair | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { sourceLang, targetLang } = value as Record<string, unknown>;
  if (typeof sourceLang !== 'string' || typeof targetLang !== 'string') return undefined;
  const pair = { sourceLang: sourceLang.trim(), targetLang: targetLang.trim() };
  return isGlobalPair(pair) ? undefined : pair;
}

/** A bounded language-code list off the wire, or undefined for "every language". */
function readLangList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase().slice(0, 16))
    .filter(Boolean)
    .slice(0, 8);
  return normalized.length ? normalized : undefined;
}

/** One word, not a passage: anything longer cannot be a headword worth expanding. */
const MAX_NEIGHBOR_QUERY_CHARS = 64;

/**
 * A conjugable Japanese word is short. The cap is generous enough for the
 * longest realistic サ変 compound and small enough that this can never be handed
 * a passage to analyse.
 */
const MAX_CONJUGATION_QUERY_CHARS = 32;

/**
 * The full conjugation table for a looked-up word, or an honest "no analysis".
 *
 * Runs in main because the IPADIC tokenizer is built once per process here and
 * shared with mining and Study analysis; building a second copy in the renderer
 * to answer a dictionary expansion would cost far more than the lookup it is
 * attached to. Tokenizing one word against an already-built dictionary is a hash
 * lookup and a short Viterbi path, so this stays off the "heavy work on the main
 * loop" list that parsing and importing are on.
 *
 * A missing or failed analyser returns no analysis rather than rejecting: the
 * surface renders "nothing to show", which is the state it already has to
 * handle for every non-verb.
 */
export async function analyzeConjugation(word: string): Promise<ConjugationAnalysis> {
  const target = typeof word === 'string' ? word.trim().slice(0, MAX_CONJUGATION_QUERY_CHARS) : '';
  if (!target) return { word: '', conjugationType: null, wordClass: null, rows: [] };
  try {
    const tokenizer = await getMainJapaneseTokenizer();
    if (!tokenizer) return { word: target, conjugationType: null, wordClass: null, rows: [] };
    const tokens = tokenizer.tokenize(target).map((token) => ({
      surface: token.surface_form,
      basicForm: token.basic_form,
      pos: token.pos,
      conjugationType: token.conjugated_type ?? '',
    }));
    return analyzeConjugationTokens(target, tokens);
  } catch {
    return { word: target, conjugationType: null, wordClass: null, rows: [] };
  }
}

export function registerDictionaryIpc(): void {
  ipcMain.handle('dict:lookup', (_e, query: string) => lookupWord(query));
  ipcMain.handle('dict:lookupTerm', (_e, query: string) => lookupTerm(query));
  // Phase 4: the Chinese surfaces' lookup, moved out of `renderer/chineseDict.ts`.
  ipcMain.handle('dict:lookupChinese', (_e, query: string) => lookupChineseInDictionary(query));
  ipcMain.handle('dict:resetChineseCache', () => resetChineseDictionaryCache());
  ipcMain.handle('dict:listSources', (_e, pair?: unknown) =>
    listDictionarySources(undefined, readPair(pair)));
  ipcMain.handle('dict:listPairs', () => listDictionaryPairs());
  ipcMain.handle('dict:pairHasOverride', (_e, pair: unknown) =>
    dictionaryPairHasOverride(readPair(pair) ?? GLOBAL_PAIR));
  ipcMain.handle('dict:resetPairPriority', (_e, pair: unknown) =>
    resetDictionaryPairPriority(readPair(pair) ?? GLOBAL_PAIR));
  ipcMain.handle('dict:setSourceEnabled', (_e, id: string, enabled: boolean) =>
    setDictionarySourceEnabled(id, enabled));
  // `lang` stays `unknown` all the way into the validator. The renderer sends a
  // code from a fixed list, but this channel is reachable from anything with the
  // preload bridge, and a bad code here would relabel rows.
  //
  // The work itself does *not* happen here: relabelling every row a dictionary
  // owns is 7.2 s for 101,843 headwords and would be ~35 s for JMdict EN, so it
  // is queued on the import utility process and answered with a job id. The
  // synchronous `setDictionarySourceLang` stays in `service.ts` for callers that
  // already hold a database handle and a thread they may block.
  ipcMain.handle('dict:setSourceLang', (_e, id: string, lang: unknown) =>
    startSourceLangRelabel(id, lang));
  ipcMain.handle('dict:moveSource', (_e, id: string, direction: -1 | 1, pair?: unknown) => {
    const dir = direction === -1 ? -1 : 1;
    const scoped = readPair(pair);
    return scoped ? moveDictionarySourceInPair(id, dir, scoped) : moveDictionarySource(id, dir);
  });
  ipcMain.handle('dict:removeSource', (_e, id: string) => removeDictionarySource(id));
  // Read-only structured pitch data for the Blanc pitch panel.
  ipcMain.handle('dict:pitch', (_e, term: string, reading?: string) => getPitchData(term, reading));
  ipcMain.handle('dict:lookupTermOffline', (_e, query: string) => lookupTermOffline(query));
  ipcMain.handle(
    'dict:lookupOfflineInterlinear',
    (_e, text: unknown, options?: unknown): Promise<LexiconInterlinearResult> => {
      const raw = options && typeof options === 'object' && !Array.isArray(options)
        ? options as Record<string, unknown>
        : {};
      const languages = (value: unknown): string[] | undefined => {
        if (!Array.isArray(value)) return undefined;
        const normalized = value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toLowerCase().slice(0, 16))
          .filter(Boolean)
          .slice(0, 8);
        return normalized.length ? normalized : undefined;
      };
      const boundedOptions: LexiconInterlinearOptions = {
        sourceLangs: languages(raw.sourceLangs),
        glossLangs: languages(raw.glossLangs),
        maxChars: Math.min(
          MAX_OFFLINE_INTERLINEAR_CHARS,
          Math.max(1, Number.isFinite(raw.maxChars) ? Math.floor(Number(raw.maxChars)) : MAX_OFFLINE_INTERLINEAR_CHARS),
        ),
        maxMergeSegments: Math.min(
          MAX_OFFLINE_INTERLINEAR_MERGE_SEGMENTS,
          Math.max(1, Number.isFinite(raw.maxMergeSegments)
            ? Math.floor(Number(raw.maxMergeSegments))
            : MAX_OFFLINE_INTERLINEAR_MERGE_SEGMENTS),
        ),
        // Only an explicit `true` opts in: a truthy string from an untrusted
        // caller must not silently enable the list-parsing path.
        withFrequency: raw.withFrequency === true,
        withPartOfSpeech: raw.withPartOfSpeech === true,
      };
      const boundedText = typeof text === 'string'
        ? text.slice(0, MAX_OFFLINE_INTERLINEAR_CHARS * 2)
        : '';
      return lookupOfflineInterlinearMerged(boundedText, boundedOptions);
    },
  );
  ipcMain.handle(
    'dict:semanticNeighbors',
    (_e, text: unknown, options?: unknown): LexiconNeighborResult => {
      const raw = options && typeof options === 'object' && !Array.isArray(options)
        ? options as Record<string, unknown>
        : {};
      const query = typeof text === 'string' ? text.trim().slice(0, MAX_NEIGHBOR_QUERY_CHARS) : '';
      const empty: LexiconNeighborResult = { query, probedSenses: [], neighbors: [] };
      if (!query) return empty;
      try {
        return findSemanticNeighborsInDb({
          text: query,
          sourceLangs: readLangList(raw.sourceLangs),
          glossLangs: readLangList(raw.glossLangs),
          limit: MAX_NEIGHBOR_RESULTS,
        });
      } catch {
        // The unified database is still optional on an un-migrated installation.
        // An expansion the reader asked for must degrade to "nothing to show",
        // never to a rejected invoke the surface has to render as a defect.
        return empty;
      }
    },
  );
  ipcMain.handle(
    'dict:compounds',
    (_e, text: unknown, options?: unknown): LexiconCompoundResult => {
      const raw = options && typeof options === 'object' && !Array.isArray(options)
        ? options as Record<string, unknown>
        : {};
      const query = typeof text === 'string' ? text.trim().slice(0, MAX_COMPOUND_QUERY_CHARS) : '';
      const empty: LexiconCompoundResult = { query, compounds: [] };
      if (!query) return empty;
      try {
        return findLexiconCompoundsInDb({
          text: query,
          sourceLangs: readLangList(raw.sourceLangs),
          glossLangs: readLangList(raw.glossLangs),
          limit: MAX_COMPOUND_RESULTS,
        });
      } catch {
        // Same contract as the neighbour expansion: the unified database is still
        // optional on an un-migrated installation, and an expansion the reader
        // asked for degrades to "nothing to show" rather than to a rejected
        // invoke the surface would have to render as a defect.
        return empty;
      }
    },
  );
  ipcMain.handle(
    'dict:examples',
    (_e, text: unknown, options?: unknown): LexiconExampleResult => {
      const raw = options && typeof options === 'object' && !Array.isArray(options)
        ? options as Record<string, unknown>
        : {};
      const query = typeof text === 'string' ? text.trim().slice(0, MAX_EXAMPLE_QUERY_CHARS) : '';
      const empty: LexiconExampleResult = { query, examples: [] };
      if (!query) return empty;
      try {
        return findExampleSentencesInDb({
          text: query,
          sourceLangs: readLangList(raw.sourceLangs),
          glossLangs: readLangList(raw.glossLangs),
          limit: MAX_EXAMPLE_RESULTS,
        });
      } catch {
        // Same contract as the neighbour and compound expansions. An example
        // corpus is optional on every install — nobody has one until they import
        // one — so "no database yet" and "no corpus installed" have to look the
        // same to the surface: an empty list, never a rejected invoke.
        return empty;
      }
    },
  );
  ipcMain.handle(
    'dict:etymology',
    (_e, text: unknown, options?: unknown): LexiconEtymologyResult => {
      const raw = options && typeof options === 'object' && !Array.isArray(options)
        ? options as Record<string, unknown>
        : {};
      const query = typeof text === 'string' ? text.trim().slice(0, MAX_ETYMOLOGY_QUERY_CHARS) : '';
      const empty: LexiconEtymologyResult = { query, etymologies: [] };
      if (!query) return empty;
      try {
        return findLexiconEtymologyInDb({
          text: query,
          sourceLangs: readLangList(raw.sourceLangs),
          limit: MAX_ETYMOLOGY_RESULTS,
        });
      } catch {
        // Same contract again, and it matters more here: this read fires with the
        // lookup rather than on a click, so a throw on an un-migrated installation
        // would surface as a rejected invoke on every single word.
        return empty;
      }
    },
  );
  ipcMain.handle(
    'dict:conjugation',
    (_e, word: unknown): Promise<ConjugationAnalysis> =>
      analyzeConjugation(typeof word === 'string' ? word : ''),
  );
  // The user's own note on a word. Both handlers answer `null` rather than
  // rejecting when the database is not there yet: a note surface renders "no note"
  // for a word that has none, and an un-migrated installation is that same state.
  ipcMain.handle('dict:noteGet', (_e, identity: unknown): LexiconNote | null => {
    const target = readNoteIdentity(identity);
    if (!target) return null;
    try {
      return readUserNoteFromDb(target);
    } catch {
      return null;
    }
  });
  // Every note the user has written, so one is reachable without already knowing
  // the word it hangs off. An empty page is the honest answer for an un-migrated
  // installation as well as for a user who has never annotated anything.
  ipcMain.handle('dict:noteList', (_e, query: unknown): LexiconNoteListResult => {
    try {
      return listUserNotesFromDb(readNoteListQuery(query));
    } catch {
      return { notes: [], total: 0 };
    }
  });
  // A failed write returns `{ ok: false }` instead of the note, because losing
  // what someone typed must never be reported to them as a save.
  ipcMain.handle(
    'dict:noteSet',
    (_e, identity: unknown, input: unknown): { ok: boolean; note: LexiconNote | null } => {
      const target = readNoteIdentity(identity);
      if (!target) return { ok: false, note: null };
      try {
        return { ok: true, note: writeUserNoteToDb(target, readNoteInput(input)) };
      } catch {
        return { ok: false, note: null };
      }
    },
  );
  // Write the user's notes out as a file they own.
  //
  // Every other row in this database can be rebuilt by re-importing its source;
  // a note cannot, so it is the one thing that needs a way out of the app. The
  // export takes the browse surface's *filter and scope*, not the page it
  // happens to be showing — "export what I am looking at" means the 300 matches,
  // not the 50 rendered.
  ipcMain.handle('dict:noteExport', async (_e, query: unknown): Promise<LexiconNoteExportResult> => {
    const scope = readNoteExportQuery(query);
    let page: LexiconNoteListResult;
    try {
      page = listUserNotesFromDb({ ...scope, limit: NOTE_EXPORT_MAX_ROWS, offset: 0 });
    } catch {
      // Same reasoning as `dict:noteList`: an un-migrated installation is a
      // state to report, not an invoke for the surface to render as a defect.
      return { ok: false, count: 0, total: 0, error: 'read' };
    }
    // Nothing to write is not a file. Prompting for a path and then producing a
    // header-only CSV would look like a successful export of an empty archive.
    if (!page.notes.length) return { ok: false, count: 0, total: page.total, error: 'empty' };
    const { dialog } = await import('electron');
    const picked = await dialog.showSaveDialog({
      title: mt('dialog.saveNotes.title'),
      defaultPath: `lexicon-notes-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: mt('dialog.format.csv'), extensions: ['csv'] }],
    });
    if (picked.canceled || !picked.filePath) {
      return { ok: false, count: 0, total: page.total, error: 'cancelled' };
    }
    try {
      // The BOM is load-bearing, not decoration: without it every mainstream
      // spreadsheet reads a UTF-8 CSV in the system code page, and a file of
      // Japanese and Cyrillic notes opens as mojibake on the machine that wrote it.
      fs.writeFileSync(picked.filePath, `\uFEFF${notesToCsv(page.notes)}`, 'utf-8');
      return { ok: true, path: picked.filePath, count: page.notes.length, total: page.total };
    } catch (error) {
      return {
        ok: false,
        count: 0,
        total: page.total,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  ipcMain.handle(
    'dict:lookupTermsBatch',
    (_e, queries: GlossLookupQuery[], langs: CandidateGlossLang[]) =>
      lookupTermsBatch(queries, langs),
  );
  ipcMain.handle('examples:search', (_e, query: string, limit?: number) => searchExamples(query, limit));
  ipcMain.handle('examples:offlineStatus', () => offlineStatus());
  ipcMain.handle('examples:importOffline', async (_e, payload?: { sentencesPath?: string; linksPath?: string }) => {
    const { dialog } = await import('electron');
    let sentencesPath = payload?.sentencesPath;
    const linksPath = payload?.linksPath;
    if (!sentencesPath) {
      const picked = await dialog.showOpenDialog({
        title: mt('dialog.importTatoebaCsv.title'),
        filters: [{ name: mt('dialog.filter.csvTsv'), extensions: ['csv', 'tsv', 'txt'] }],
        properties: ['openFile'],
      });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, added: 0, error: 'cancelled' };
      sentencesPath = picked.filePaths[0];
    }
    return importOfflineExamples(sentencesPath, linksPath);
  });
  ipcMain.handle('dict:importYomitan', (_e, filePath?: string) => importYomitanZip(filePath));
  ipcMain.handle('dict:listYomitan', (): YomitanDictInfo[] => listYomitanDicts());
  ipcMain.handle('dict:removeYomitan', (_e, id: string) => removeYomitanDict(id));
  ipcMain.handle('dict:setYomitanEnabled', (_e, id: string, enabled: boolean) =>
    setYomitanEnabled(id, enabled),
  );
  ipcMain.handle('dict:moveYomitan', (_e, id: string, dir: number) => moveYomitanDict(id, dir));
  ipcMain.handle('dict:setYomitanLang', (_e, id: string, lang: string) => setYomitanLang(id, lang));
  ipcMain.handle('dict:availableLangs', async (): Promise<string[]> => {
    await initYomitan();
    return getAvailableGlossLangs();
  });
  // The long imports run in a utility process and have their own lifecycle
  // (progress, cancellation, post-reload recovery), so they live next door
  // rather than as four more one-line handlers here.
  registerDictionaryImportIpc();
  // Provisioning is already asynchronous. Once it has named every bundled
  // legacy store, migrate only the stores SQLite does not yet own. The job stays
  // observable/cancellable through the same Settings card as a manual rebuild.
  void initYomitan().then(startPendingLegacyDictionaryMigration).catch((error: unknown) => {
    console.warn('[dictionary] automatic bundled-source migration did not start:', error);
  });
}

export { fetchJapaneseAudio, initYomitan };
