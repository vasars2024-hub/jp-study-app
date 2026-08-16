// Reading / furigana filling for the Deck Workbench — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 4, smart recipe 7 ("fill missing readings or furigana, with confidence
// and manual-review thresholds").
//
// This is the pure half: given the entries a lookup returned for one word, what
// reading should the note get, in what form, and how sure is that. Nothing here
// performs a lookup, reads a draft, or writes anything — `ankiChangeTray.ts`
// owns all three, exactly as it does for `ankiEnrich.ts`.
//
// The rule the recipe exists for: **several distinct readings is not a value to
// pick from, it is a question.** 上手 is じょうず or うわて, 生 is せい or なま or
// き, and a batch that silently took the first entry writes the wrong reading
// into a deck the user will then drill for months. So an ambiguous term is
// never auto-written at any threshold — `readingMeetsThreshold` returns false
// for it unconditionally — and its candidates are carried out so a review step
// can show what the choice actually is.
//
// Confidence is derived from the dictionaries, not asserted:
//
// - `certain`  — one distinct reading, and at least two credited sources agreed
//                on it (or the alignment is exact and unambiguous, below).
// - `likely`   — one distinct reading, from a single source.
// - `ambiguous`— several distinct readings. Review only, never written.
//
// For the furigana form there is a second downgrade. `alignFurigana` falls back
// to annotating the whole token when the reading cannot be split against the
// surface's kana anchors (熟字訓 like 今日 → きょう, irregular readings). That
// fallback is deliberately coarse rather than wrong, but it is still a ruby the
// user may not want written unattended, so a coarse alignment caps confidence
// at `likely` even when the sources agreed.

import {
  alignFurigana,
  hasKanji,
  isAllKanji,
  segmentsToBrackets,
  segmentsToKana,
  toHiragana,
} from './furigana';
import type { EnrichEntry } from './ankiEnrich';

/** What shape the filled value takes. */
export type ReadingFillForm =
  /** The whole word rewritten in hiragana: 食べる → たべる. */
  | 'kana'
  /** Anki bracket ruby over the kanji runs only: 食べる → 食[た]べる. */
  | 'furigana';

/** How sure the proposal is. See the header for how each is derived. */
export type ReadingConfidence = 'certain' | 'likely' | 'ambiguous';

/**
 * The lowest confidence that may be written without a human looking at it.
 *
 * `ambiguous` is deliberately not a member: it is not a stricter or looser
 * setting, it is the case the recipe refuses to automate, and offering it as a
 * threshold would make "write whichever reading came first" one click away.
 */
export type ReadingFillThreshold = 'certain' | 'likely';

export type ReadingFillRefusal =
  /** No installed dictionary answered for this term. */
  | 'no-entry'
  /** The entries carry no reading at all. */
  | 'no-reading'
  /** Furigana form on a term with no kanji: there is nothing to annotate. */
  | 'no-kanji';

export interface ReadingCandidate {
  /** Hiragana. Katakana entries are normalised so ネコ and ねこ are one reading. */
  reading: string;
  /** Every dictionary that gave this reading, in source order, deduplicated. */
  sources: string[];
}

export interface ReadingProposal {
  term: string;
  /**
   * Every distinct reading found, in source order. The first is the one `value`
   * was built from. Length > 1 is exactly what makes the proposal ambiguous, and
   * it is carried out whole so a review step can offer the real alternatives
   * rather than re-deriving them from a lookup it no longer has.
   */
  candidates: ReadingCandidate[];
  /** The chosen reading, in hiragana. */
  reading: string;
  /** The text to write, in the requested form. Never empty. */
  value: string;
  confidence: ReadingConfidence;
  /**
   * The ruby annotates the whole token instead of each kanji run, because the
   * reading could not be aligned against the surface. Always false for `kana`.
   */
  coarse: boolean;
}

/** Sources that agree on one reading before it counts as `certain`. */
export const READING_CERTAIN_SOURCES = 2;

/** Every dictionary behind one entry, primary first, with no empty names. */
function entrySources(entry: EnrichEntry): string[] {
  const names = entry.sources ?? (entry.source ? [entry.source] : []);
  const out: string[] = [];
  for (const name of names) {
    const clean = name.trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/**
 * Collapse the entries to one candidate per distinct reading, in source order.
 *
 * Normalising to hiragana first is what stops ネコ and ねこ counting as two
 * readings and turning an unambiguous word into a review item.
 */
export function readingCandidates(entries: readonly EnrichEntry[]): ReadingCandidate[] {
  const out: ReadingCandidate[] = [];
  for (const entry of entries) {
    const reading = toHiragana(entry.reading.trim());
    if (!reading) continue;
    const existing = out.find((c) => c.reading === reading);
    const sources = entrySources(entry);
    if (existing) {
      for (const name of sources) if (!existing.sources.includes(name)) existing.sources.push(name);
    } else {
      out.push({ reading, sources });
    }
  }
  return out;
}

/**
 * The reading one note should receive, or why it should receive nothing.
 *
 * Callers must still test the result against their threshold —
 * `proposeReading` describes what the dictionaries said, `readingMeetsThreshold`
 * decides whether that is enough to write unattended.
 */
export function proposeReading(
  term: string,
  entries: readonly EnrichEntry[] | undefined,
  form: ReadingFillForm,
): ReadingProposal | { refused: ReadingFillRefusal } {
  const surface = term.trim();
  if (!surface) return { refused: 'no-entry' };
  if (form === 'furigana' && !hasKanji(surface)) return { refused: 'no-kanji' };
  if (!entries || entries.length === 0) return { refused: 'no-entry' };
  const candidates = readingCandidates(entries);
  if (candidates.length === 0) return { refused: 'no-reading' };

  const chosen = candidates[0];
  const segments = alignFurigana(surface, chosen.reading);
  // One annotated segment is the correct answer for an all-kanji word (猫[ねこ])
  // and also the shape of the fallback for a word whose kana runs could not be
  // matched (食べる with a reading that disagrees). Only the second is coarse,
  // so test the surface for kana rather than counting segments alone.
  const coarse =
    form === 'furigana'
    && segments.length === 1
    && segments[0].reading !== undefined
    && !isAllKanji(surface);

  let confidence: ReadingConfidence;
  if (candidates.length > 1) confidence = 'ambiguous';
  else if (coarse) confidence = 'likely';
  else confidence = chosen.sources.length >= READING_CERTAIN_SOURCES ? 'certain' : 'likely';

  const value = form === 'kana' ? segmentsToKana(segments) : segmentsToBrackets(segments);
  // A kana-only term in `kana` form restates itself, which is information-free
  // but not wrong; an empty write would be. `segmentsToKana` never returns ''
  // for a non-empty surface, so this only guards a future change to it.
  if (!value) return { refused: 'no-reading' };
  return { term: surface, candidates, reading: chosen.reading, value, confidence, coarse };
}

/**
 * Whether a proposal may be written without review.
 *
 * `ambiguous` fails every threshold. That is the whole safety property of the
 * recipe and it is enforced here rather than at each call site, so a new caller
 * cannot forget it.
 */
export function readingMeetsThreshold(
  confidence: ReadingConfidence,
  threshold: ReadingFillThreshold,
): boolean {
  if (confidence === 'ambiguous') return false;
  if (threshold === 'certain') return confidence === 'certain';
  return true;
}
