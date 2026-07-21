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

const CACHE_KEY = 'jp-book-level-cache-v1';
const MAX_SAMPLE_CHARS = 40_000;
/** Cap concurrent EPUB text samples so Library idle enrich stays light. */
const SAMPLE_CONCURRENCY = 1;

export interface CachedBookLevel {
  lang: StudyLang;
  fingerprint: string;
  estimate: BookLevelEstimate;
  at: number;
}

type CacheMap = Record<string, CachedBookLevel>;

function loadCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CacheMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
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
  const cache = loadCache();
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

async function sampleBookPlainText(item: LibraryItem): Promise<string> {
  const inbox = item.inboxMeta?.textSample?.trim();
  if (inbox) return inbox;

  if (item.kind !== 'book') return '';
  // PDFs have no cheap plain-text path here.
  if (item.epubFile?.toLowerCase().endsWith('.pdf')) return '';

  try {
    const sample = await window.api.sampleBookText(item.id, MAX_SAMPLE_CHARS);
    return (sample ?? '').trim();
  } catch {
    return '';
  }
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
 */
export async function estimateLibraryBookLevel(
  item: LibraryItem,
  studyLang: StudyLang = getStudyLang(),
): Promise<BookLevelEstimate | null> {
  const text = await sampleBookPlainText(item);
  if (!text) return null;

  const lang = resolveBookEstimateLang(text, studyLang);
  const cached = getCachedBookLevel(item.id, lang);
  if (cached) return cached;

  const bands = bandsFromSettings(lang);
  if (bands.length === 0) return null;

  const lemmas = await lemmasFromText(text, lang);
  const estimate = estimateBookLevel(lemmas, bands, lang);
  if (estimate) setCachedBookLevel(item.id, estimate, lang);
  return estimate;
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
  // Need at least one exam list configured (JA or ZH) or every sample is wasted.
  if (bandsFromSettings('ja').length === 0 && bandsFromSettings('zh').length === 0) {
    return out;
  }

  const pending = items.filter((it) => {
    if (it.kind !== 'book') return false;
    if (it.epubFile?.toLowerCase().endsWith('.pdf')) return false;
    return true;
  });

  let i = 0;
  while (i < pending.length) {
    if (signal?.cancelled) break;
    const batch = pending.slice(i, i + SAMPLE_CONCURRENCY);
    i += SAMPLE_CONCURRENCY;
    await Promise.all(
      batch.map(async (it) => {
        if (signal?.cancelled) return;
        // Fast path: cached under study lang (common for monolingual libraries).
        const quick = getCachedBookLevel(it.id, studyLang);
        if (quick) {
          out.set(it.id, quick);
          onUpdate?.(it.id, quick);
          return;
        }
        const est = await estimateLibraryBookLevel(it, studyLang);
        if (est) {
          out.set(it.id, est);
          onUpdate?.(it.id, est);
        }
      }),
    );
    // Let the event loop breathe between books.
    await new Promise((r) => setTimeout(r, 0));
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
