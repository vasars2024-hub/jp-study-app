/**
 * Renderer glue for book JLPT/HSK level estimates on library covers.
 * Pure math lives in shared/bookLevelEstimate.ts; this file loads the user's
 * Settings slot lists, tokenizes a text sample, caches per book id, and
 * schedules idle enrichment so opening Library stays snappy.
 */

import {
  estimateBookLevel,
  examSlotsForLang,
  schemeForLang,
  type BookLevelEstimate,
  type BookLevelBand,
} from '../shared/bookLevelEstimate';
import type { LevelSlotId } from '../shared/levelScale';
import type { LibraryItem } from '../shared/types';
import { detectInboxLang } from '../shared/inboxMeta';
import { pageHasChinese, pageHasJapanese } from '../shared/pageLevelDetect';
import { getSlotList, onLevelListsChanged } from './levelLists';
import { getStudyLang, onStudyLangChanged, type StudyLang } from './studyEnvironment';
import { getTokenizer, tokenizeSync, tokenizerReady } from './tokenizer';
import { bookProfileEntry, prefetchBookFileKeys } from './bookProfiles';
import { knownKeyFor } from './studyTokens';
import { profileLemmas } from '../shared/studyWordProfile';

const CACHE_KEY = 'jp-book-level-cache-v1';
const MAX_SAMPLE_CHARS = 40_000;

export interface CachedBookLevel {
  lang: StudyLang;
  fingerprint: string;
  estimate: BookLevelEstimate;
  at: number;
}

type CacheMap = Record<string, CachedBookLevel>;

/** The last parse, by the text it came from: the Library reads a badge per book per render. */
let parsedCache: { raw: string; map: CacheMap } | null = null;

function loadCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    if (parsedCache?.raw === raw) return parsedCache.map;
    const parsed = JSON.parse(raw) as CacheMap;
    const map = parsed && typeof parsed === 'object' ? parsed : {};
    parsedCache = { raw, map };
    return map;
  } catch {
    return {};
  }
}

function saveCache(cache: CacheMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full */
  }
}

/** Fingerprint of configured exam lists so cache invalidates on paste/import. */
export function levelListsFingerprint(lang: StudyLang = getStudyLang()): string {
  return examSlotsForLang(lang)
    .map((s) => {
      const list = getSlotList(s.id);
      if (!list || list.words.length === 0) return `${s.id}:0`;
      const w = list.words;
      return `${s.id}:${w.length}:${w[0]}:${w[w.length - 1]}`;
    })
    .join('|');
}

function bandsFromSettings(lang: StudyLang): BookLevelBand[] {
  const out: BookLevelBand[] = [];
  for (const slot of examSlotsForLang(lang)) {
    const list = getSlotList(slot.id);
    if (!list || list.words.length === 0) continue;
    out.push({
      id: slot.id as LevelSlotId,
      short: slot.short,
      words: new Set(list.words.map((w) => w.trim()).filter(Boolean)),
    });
  }
  return out;
}

/** Chinese word segmentation via Intl.Segmenter when available; else CJK runs. */
function tokenizeChinese(text: string): string[] {
  const lemmas: string[] = [];
  try {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seg = new (Intl as any).Segmenter('zh', { granularity: 'word' });
      for (const { segment, isWordLike } of seg.segment(text)) {
        const s = String(segment).trim();
        if (!s) continue;
        if (isWordLike === false) continue;
        if (!/[\u3400-\u9fff\uf900-\ufaff]/.test(s)) continue;
        lemmas.push(s);
      }
      if (lemmas.length > 0) return lemmas;
    }
  } catch {
    /* fall through */
  }
  // Fallback: treat contiguous CJK as one token each character (coarse).
  for (const ch of text) {
    if (/[\u3400-\u9fff\uf900-\ufaff]/.test(ch)) lemmas.push(ch);
  }
  return lemmas;
}

async function lemmasFromText(text: string, lang: StudyLang): Promise<string[]> {
  const sample = text.slice(0, MAX_SAMPLE_CHARS);
  if (!sample.trim()) return [];

  if (lang === 'zh') {
    return tokenizeChinese(sample);
  }

  try {
    if (!tokenizerReady()) await getTokenizer();
  } catch {
    return [];
  }
  try {
    return tokenizeSync(sample)
      .filter((t) => t.content && !t.proper && t.lemma)
      .map((t) => t.lemma);
  } catch {
    return [];
  }
}

export function getCachedBookLevel(
  bookId: string,
  lang: StudyLang = getStudyLang(),
): BookLevelEstimate | null {
  const entry = loadCache()[bookId];
  if (!entry) return null;
  if (entry.lang !== lang) return null;
  if (entry.fingerprint !== levelListsFingerprint(lang)) return null;
  return entry.estimate;
}

export function setCachedBookLevel(
  bookId: string,
  estimate: BookLevelEstimate,
  lang: StudyLang = getStudyLang(),
): void {
  const cache = { ...loadCache() };
  cache[bookId] = {
    lang,
    fingerprint: levelListsFingerprint(lang),
    estimate,
    at: Date.now(),
  };
  saveCache(cache);
}

export function clearBookLevelCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Estimate from an already-available plain-text sample (Inbox textSample, etc.).
 */
export async function estimateLevelFromText(
  text: string,
  lang: StudyLang = getStudyLang(),
): Promise<BookLevelEstimate | null> {
  const bands = bandsFromSettings(lang);
  if (bands.length === 0) return null;
  const lemmas = await lemmasFromText(text, lang);
  return estimateBookLevel(lemmas, bands, lang);
}

/**
 * Prefer script detected in the book text so Chinese EPUBs get HSK even when
 * the app study language is Japanese (and vice versa). Falls back to study lang.
 */
export function resolveBookEstimateLang(
  text: string,
  studyLang: StudyLang = getStudyLang(),
): StudyLang {
  if (pageHasJapanese(text)) return 'ja';
  if (pageHasChinese(text)) return 'zh';
  const inboxLang = detectInboxLang(text);
  if (inboxLang === 'ja' || inboxLang === 'zh') return inboxLang;
  return studyLang;
}

/**
 * Compute (and cache) the exam-level badge for one library book.
 * Returns null when lists are empty, text is missing, or scoring fails.
 *
 * Reads the book's cached word profile (`bookProfiles.ts`): sampled and
 * tokenized once per file, in a worker, instead of a 40k-character kuromoji
 * pass on the UI thread every time the Library opened.
 */
export async function estimateLibraryBookLevel(
  item: LibraryItem,
  studyLang: StudyLang = getStudyLang(),
): Promise<BookLevelEstimate | null> {
  const first = await bookProfileEntry(item, studyLang);
  if (!first) return null;

  // Same rule as `resolveBookEstimateLang`, from what the sample showed.
  const lang: StudyLang = first.script
    ?? (first.detected === 'ja' || first.detected === 'zh' ? first.detected : studyLang);
  const cached = getCachedBookLevel(item.id, lang);
  if (cached) return cached;

  const bands = bandsFromSettings(lang);
  if (bands.length === 0) return null;

  const entry = lang === studyLang ? first : await bookProfileEntry(item, lang);
  if (!entry) return null;
  const estimate = estimateBookLevel(profileLemmas(entry.profile, bandKeyFor(lang, bands)), bands, lang);
  if (estimate) setCachedBookLevel(item.id, estimate, lang);
  return estimate;
}

/**
 * Russian profile words are written forms; the band lists hold dictionary
 * forms. Match a form to whichever of its likely lemmas a band lists.
 */
function bandKeyFor(lang: StudyLang, bands: readonly BookLevelBand[]): ((word: string) => string) | undefined {
  if (lang !== 'ru') return undefined;
  return (word) => knownKeyFor(word, 'ru', (key) => (bands.some((band) => band.words.has(key)) ? 1 : 0));
}

/**
 * Idle-enrich EPUB covers: fill a map of bookId → estimate without blocking UI.
 * Yields between items; skips manga/PDF and already-cached entries.
 * Uses per-book script detection so JA/ZH badges track the file, not only study lang.
 */
export async function enrichBookLevelEstimates(
  items: LibraryItem[],
  onUpdate?: (bookId: string, estimate: BookLevelEstimate) => void,
  signal?: { cancelled: boolean },
): Promise<Map<string, BookLevelEstimate>> {
  const studyLang = getStudyLang();
  const out = new Map<string, BookLevelEstimate>();
  // Need at least one exam list configured or every sample is wasted.
  if (
    bandsFromSettings('ja').length === 0
    && bandsFromSettings('zh').length === 0
    && bandsFromSettings(studyLang).length === 0
  ) {
    return out;
  }

  const pending = items.filter((it) => {
    if (it.kind !== 'book') return false;
    if (it.epubFile?.toLowerCase().endsWith('.pdf')) return false;
    return true;
  });
  // One read of the badge cache for the fast path, not one per book.
  const cache = loadCache();
  const fingerprint = levelListsFingerprint(studyLang);
  const uncached: LibraryItem[] = [];
  for (const it of pending) {
    const entry = cache[it.id];
    if (entry && entry.lang === studyLang && entry.fingerprint === fingerprint) {
      out.set(it.id, entry.estimate);
      onUpdate?.(it.id, entry.estimate);
    } else {
      uncached.push(it);
    }
  }
  if (!uncached.length || signal?.cancelled) return out;
  await prefetchBookFileKeys(uncached);

  for (const it of uncached) {
    if (signal?.cancelled) break;
    const est = await estimateLibraryBookLevel(it, studyLang).catch(() => null);
    if (est && !signal?.cancelled) {
      out.set(it.id, est);
      onUpdate?.(it.id, est);
    }
  }
  return out;
}

/** Subscribe so callers can drop stale badge state when lists / lang change. */
export function onBookLevelInputsChanged(cb: () => void): () => void {
  const unsubLists = onLevelListsChanged(cb);
  const unsubLang = onStudyLangChanged(() => cb());
  return () => {
    unsubLists();
    unsubLang();
  };
}

export { schemeForLang };
