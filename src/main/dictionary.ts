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
  getFrequencyRank,
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
import { textMatchesLang } from '../shared/langs';
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
} from './dictionary/service';
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
          frequency: getFrequencyRank,
        });
      } catch {
        return converted;
      }
    }
  } catch {
    // A database read must never take the established dictionary fallback down.
  }

  await initYomitan();
  return lookupTermMerged(q, lookupWord);
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
  try {
    await initYomitan();
  } catch {
    // A legacy store that will not load must not take the database path down.
    return lookupOfflineInterlinearFromStore(text, options);
  }
  const dicts = listYomitanDicts();
  return lookupOfflineInterlinearFromStore(text, options, (query) =>
    legacyBatchToLookupResult(query, lookupOfflineDeinflected(query, true), dicts));
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

export function registerDictionaryIpc(): void {
  ipcMain.handle('dict:lookup', (_e, query: string) => lookupWord(query));
  ipcMain.handle('dict:lookupTerm', (_e, query: string) => lookupTerm(query));
  // Phase 4: the Chinese surfaces' lookup, moved out of `renderer/chineseDict.ts`.
  ipcMain.handle('dict:lookupChinese', (_e, query: string) => lookupChineseInDictionary(query));
  ipcMain.handle('dict:resetChineseCache', () => resetChineseDictionaryCache());
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
      };
      const boundedText = typeof text === 'string'
        ? text.slice(0, MAX_OFFLINE_INTERLINEAR_CHARS * 2)
        : '';
      return lookupOfflineInterlinearMerged(boundedText, boundedOptions);
    },
  );
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
}

export { fetchJapaneseAudio, initYomitan };
