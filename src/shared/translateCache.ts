/**
 * The interactive translation cache: the same passage, through the same engine,
 * with the same style, glossary terms and pinned senses, answered once.
 *
 * Why it exists: a learner re-runs the same line constantly — toggling natural
 * and literal and back, reopening a history row, the clipboard watcher seeing
 * a line copied twice, a swap and a swap back. Each of those used to cost a
 * full model pass offline, and with DeepL or an LLM a billed request and a
 * round trip. A hit costs nothing and never touches the network or the ledger.
 *
 * Bounded twice, because either bound alone fails on its own input: by entries
 * (many one-word lookups) and by characters (a few 6,000-character passages).
 * Least-recently-used goes first. In memory only: translations already persist
 * through the learner's own history, and a second, silent copy of everything
 * they ever translated has no business on disk.
 *
 * Pure: the router owns the instance (`main/translateRouter.ts`).
 */
import type { TranslateSegment, TranslateSenseHint, TranslateStyle } from './translateCore';
import type { TranslateGlossaryTerm } from './translateGlossary';
import type { TranslateProviderId, TranslateResultMeta } from './translateProviders';

export interface TranslateCacheKeyInput {
  provider: TranslateProviderId;
  /** The model file for the local tiers: a different model is a different translation. */
  modelFileName?: string;
  source: string;
  target: string;
  style: TranslateStyle;
  text: string;
  terms?: readonly TranslateGlossaryTerm[];
  hints?: readonly TranslateSenseHint[];
}

export interface TranslateCacheEntry {
  text: string;
  segments: TranslateSegment[];
  meta: TranslateResultMeta;
}

export const TRANSLATE_CACHE_MAX_ENTRIES = 300;
export const TRANSLATE_CACHE_MAX_CHARS = 400_000;

export function translateCacheKey(input: TranslateCacheKeyInput): string {
  return JSON.stringify([
    input.provider,
    input.modelFileName ?? '',
    input.source.toLowerCase(),
    input.target.toLowerCase(),
    input.style,
    input.text,
    (input.terms ?? []).map((term) => [term.source, term.target]),
    (input.hints ?? []).map((hint) => [hint.text, hint.reading ?? '', hint.gloss]),
  ]);
}

function sizeOf(key: string, entry: TranslateCacheEntry): number {
  return key.length + entry.text.length + entry.segments.reduce((sum, s) => sum + s.source.length + s.target.length, 0);
}

export class TranslateResultCache {
  private readonly entries = new Map<string, { entry: TranslateCacheEntry; size: number }>();
  private chars = 0;

  constructor(
    private readonly maxEntries = TRANSLATE_CACHE_MAX_ENTRIES,
    private readonly maxChars = TRANSLATE_CACHE_MAX_CHARS,
  ) {}

  get(key: string): TranslateCacheEntry | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    this.entries.delete(key);
    this.entries.set(key, hit);
    return {
      text: hit.entry.text,
      segments: hit.entry.segments.map((segment) => ({ ...segment })),
      meta: { ...hit.entry.meta },
    };
  }

  set(key: string, entry: TranslateCacheEntry): void {
    const size = sizeOf(key, entry);
    // One passage bigger than the whole budget would evict everything and
    // still not fit: it is simply not kept.
    if (size > this.maxChars) return;
    const previous = this.entries.get(key);
    if (previous) {
      this.chars -= previous.size;
      this.entries.delete(key);
    }
    const stored: TranslateCacheEntry = {
      text: entry.text,
      segments: entry.segments.map((segment) => ({ ...segment })),
      meta: { ...entry.meta },
    };
    this.entries.set(key, { entry: stored, size });
    this.chars += size;
    for (const [oldest, value] of this.entries) {
      if (this.entries.size <= this.maxEntries && this.chars <= this.maxChars) break;
      this.entries.delete(oldest);
      this.chars -= value.size;
    }
  }

  clear(): void {
    this.entries.clear();
    this.chars = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  get totalChars(): number {
    return this.chars;
  }
}
