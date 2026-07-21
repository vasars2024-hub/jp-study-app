/**
 * JLPT/HSK level badges for flashcard decks (book groups).
 * Reuses the same scoring math as EPUB covers: shared/bookLevelEstimate.ts
 * via estimateLevelFromText / estimateBookLevel (cumulative band coverage).
 */

import type { BookLevelEstimate } from '../shared/bookLevelEstimate';
import type { BookGroup, DeckFlashcard } from './flashcardDeck';
import {
  estimateLevelFromText,
  levelListsFingerprint,
  onBookLevelInputsChanged,
} from './bookLevelEstimate';
import { getStudyLang, type StudyLang } from './studyEnvironment';

const CACHE_KEY = 'jp-deck-level-cache-v1';
const MAX_SAMPLE_CHARS = 40_000;
/** Cap concurrent deck estimates so the flashcards list stays scroll-friendly. */
const ENRICH_CONCURRENCY = 1;

export interface CachedDeckLevel {
  lang: StudyLang;
  listsFp: string;
  contentFp: string;
  estimate: BookLevelEstimate;
  at: number;
}

type CacheMap = Record<string, CachedDeckLevel>;

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

/** Stable id for a flashcard book-group (matches FlashcardsView groupKey). */
export function deckGroupKey(bookId: string, bookTitle: string): string {
  return `${bookId}::${bookTitle}`;
}

/**
 * Cheap fingerprint of deck vocab so cache invalidates when cards change.
 * Not cryptographic — just length + edge words + char budget.
 */
export function deckContentFingerprint(cards: readonly DeckFlashcard[]): string {
  let chars = 0;
  for (const c of cards) {
    chars += (c.word?.length ?? 0) + (c.sentence?.length ?? 0) + (c.front?.length ?? 0);
  }
  const first = cards[0]?.word ?? '';
  const mid = cards[Math.floor(cards.length / 2)]?.word ?? '';
  const last = cards[cards.length - 1]?.word ?? '';
  return `${cards.length}:${chars}:${first}:${mid}:${last}`;
}

/**
 * Plain-text sample from a deck: headwords + example sentences (+ front when
 * it is not the English gloss). Same tokenizer path as books via
 * estimateLevelFromText.
 */
export function sampleDeckPlainText(
  cards: readonly DeckFlashcard[],
  maxChars = MAX_SAMPLE_CHARS,
): string {
  const parts: string[] = [];
  let n = 0;
  for (const c of cards) {
    const word = c.word?.trim();
    if (word) {
      parts.push(word);
      n += word.length;
    }
    const sentence = c.sentence?.trim();
    if (sentence) {
      parts.push(sentence);
      n += sentence.length;
    }
    const front = c.front?.trim();
    if (front && front !== c.meaning && front !== word) {
      parts.push(front);
      n += front.length;
    }
    if (n >= maxChars) break;
  }
  return parts.join('\n');
}

export function getCachedDeckLevel(
  deckId: string,
  contentFp: string,
  lang: StudyLang = getStudyLang(),
): BookLevelEstimate | null {
  const entry = loadCache()[deckId];
  if (!entry) return null;
  if (entry.lang !== lang) return null;
  if (entry.listsFp !== levelListsFingerprint(lang)) return null;
  if (entry.contentFp !== contentFp) return null;
  return entry.estimate;
}

export function setCachedDeckLevel(
  deckId: string,
  contentFp: string,
  estimate: BookLevelEstimate,
  lang: StudyLang = getStudyLang(),
): void {
  const cache = loadCache();
  cache[deckId] = {
    lang,
    listsFp: levelListsFingerprint(lang),
    contentFp,
    estimate,
    at: Date.now(),
  };
  saveCache(cache);
}

export function clearDeckLevelCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Compute (and cache) the exam-level badge for one flashcard book-group.
 * Returns null when level lists are empty, the deck has no sample text, or scoring fails.
 */
export async function estimateDeckLevel(
  group: BookGroup,
  lang: StudyLang = getStudyLang(),
): Promise<BookLevelEstimate | null> {
  const id = deckGroupKey(group.bookId, group.bookTitle);
  const contentFp = deckContentFingerprint(group.cards);
  const cached = getCachedDeckLevel(id, contentFp, lang);
  if (cached) return cached;

  const text = sampleDeckPlainText(group.cards);
  if (!text.trim()) return null;

  const estimate = await estimateLevelFromText(text, lang);
  if (estimate) setCachedDeckLevel(id, contentFp, estimate, lang);
  return estimate;
}

/**
 * Idle-enrich deck badges: fill a map of deckId → estimate without blocking scroll.
 * Yields between groups; skips already-cached entries.
 */
export async function enrichDeckLevelEstimates(
  groups: BookGroup[],
  onUpdate?: (deckId: string, estimate: BookLevelEstimate) => void,
  signal?: { cancelled: boolean },
): Promise<Map<string, BookLevelEstimate>> {
  const lang = getStudyLang();
  const out = new Map<string, BookLevelEstimate>();

  const pending: BookGroup[] = [];
  for (const g of groups) {
    const id = deckGroupKey(g.bookId, g.bookTitle);
    const fp = deckContentFingerprint(g.cards);
    const cached = getCachedDeckLevel(id, fp, lang);
    if (cached) {
      out.set(id, cached);
      continue;
    }
    pending.push(g);
  }

  let i = 0;
  while (i < pending.length) {
    if (signal?.cancelled) break;
    const batch = pending.slice(i, i + ENRICH_CONCURRENCY);
    i += ENRICH_CONCURRENCY;
    await Promise.all(
      batch.map(async (g) => {
        if (signal?.cancelled) return;
        const id = deckGroupKey(g.bookId, g.bookTitle);
        const est = await estimateDeckLevel(g, lang);
        if (est) {
          out.set(id, est);
          onUpdate?.(id, est);
        }
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

/** Drop stale badge state when Settings lists or study language change. */
export function onDeckLevelInputsChanged(cb: () => void): () => void {
  return onBookLevelInputsChanged(cb);
}
