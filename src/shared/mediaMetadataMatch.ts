/**
 * Deciding whether a provider result actually *is* the thing on disk.
 *
 * A title search always returns something. "The Big O" also matches "The Big O II",
 * and a search for an obscure fansub name can come back with a completely
 * unrelated show that merely shares a word. Attaching that silently is worse than
 * attaching nothing: the user ends up with confident, wrong artwork and a synopsis
 * for another series, and no reason to distrust it.
 *
 * So matching produces a *score*, and the caller decides. Above
 * {@link METADATA_ACCEPT_CONFIDENCE} the match is applied silently; between that
 * and {@link METADATA_REVIEW_CONFIDENCE} it is applied but flagged for review;
 * below, it is not applied at all.
 *
 * Pure and deterministic, like the rest of `src/shared`: no I/O, no clock. The
 * network lives in `src/main/mediaMetadata.ts`.
 */

import { normalizeMediaTitleKey } from './mediaIdentity';

/** At or above this, apply the match without comment. */
export const METADATA_ACCEPT_CONFIDENCE = 0.82;
/** At or above this but below accept: apply, but flag it on the card. */
export const METADATA_REVIEW_CONFIDENCE = 0.5;

export interface MetadataCandidate {
  /** Every name the provider knows this work by: romaji, english, native, synonyms. */
  titles: readonly string[];
  /** Release year, when the provider states one. */
  year?: number | null;
  /** Provider format label (`TV`, `Movie`, `OVA`, `Special`). */
  format?: string | null;
  /** Episode count the provider publishes. */
  episodeCount?: number | null;
  /** Popularity, used only to break otherwise-equal title matches. */
  popularity?: number | null;
}

export interface MetadataTarget {
  /** Parsed series title from the file name. */
  title: string;
  year?: number | null;
  /** How many episode files the library actually holds for this series. */
  episodeCount?: number | null;
  /** Parsed release kind, mapped to a provider-ish format where possible. */
  format?: string | null;
}

export interface MetadataMatch<T> {
  candidate: T;
  /** 0–1. See the accept/review thresholds above. */
  confidence: number;
  /** Which candidate title scored best, for explaining the match to the user. */
  matchedTitle: string;
  reasons: string[];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const cleanTitles = (titles: readonly string[]): string[] =>
  [...new Set(
    titles
      .filter((title): title is string => typeof title === 'string')
      .map((title) => title.trim())
      .filter(Boolean),
  )];

/**
 * Similarity of two titles, 0–1.
 *
 * Exact key equality is 1. Containment scores high but not perfect, because it is
 * exactly how a sequel swallows its predecessor ("the big o ii" contains "the big
 * o") — the length ratio is what keeps a much longer candidate from tying with an
 * exact hit. Otherwise it falls back to token overlap (Dice), which handles word
 * order and punctuation differences without pretending to understand the title.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeMediaTitleKey(a);
  const right = normalizeMediaTitleKey(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    // 0.72 ceiling: a containment match must never outrank an exact one.
    return clamp01(0.55 + 0.17 * (shorter / longer));
  }

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  // The same words in another order. Romanised Japanese names flip between
  // family-first and given-first (`Hanzawa Naoki` on the file, `Naoki Hanzawa`
  // on TVmaze), and plain Dice capped that at 0.7 — below the accept line for
  // the one title the words prove. Still under an exact match.
  if (shared === leftTokens.size && shared === rightTokens.size && shared >= 2) return 0.84;
  return clamp01((2 * shared) / (leftTokens.size + rightTokens.size) * 0.7);
}

/** Maps the local release kind onto the format vocabulary providers use. */
export function formatFromReleaseKind(kind: string | null | undefined): string | null {
  switch (kind) {
    case 'movie': return 'movie';
    case 'ova': return 'ova';
    case 'special': return 'special';
    case 'episode':
    case 'season-pack': return 'tv';
    default: return null;
  }
}

/**
 * Scores one candidate against the target.
 *
 * The title carries the decision; everything else only adjusts. That split is
 * deliberate — year and episode count are frequently missing or disagree
 * legitimately (a remaster, a split-cour count, a BD run that merges episodes),
 * so they must never be able to reject a title that plainly matches, and must
 * never rescue one that plainly does not.
 */
export function scoreMetadataCandidate<T extends MetadataCandidate>(
  target: MetadataTarget,
  candidate: T,
): MetadataMatch<T> {
  const titles = cleanTitles(candidate.titles);
  const reasons: string[] = [];

  let best = 0;
  let matchedTitle = titles[0] ?? '';
  for (const title of titles) {
    const score = titleSimilarity(target.title, title);
    if (score > best) {
      best = score;
      matchedTitle = title;
    }
  }
  if (best >= 1) reasons.push('title-exact');
  else if (best > 0) reasons.push('title-partial');
  else reasons.push('title-mismatch');

  let confidence = best;

  // A matching year is strong corroboration; a clashing one is a mild warning,
  // never a rejection, because release years disagree across providers routinely.
  if (target.year != null && candidate.year != null) {
    if (target.year === candidate.year) {
      confidence += 0.08;
      reasons.push('year-match');
    } else if (Math.abs(target.year - candidate.year) <= 1) {
      reasons.push('year-near');
    } else {
      confidence -= 0.1;
      reasons.push('year-mismatch');
    }
  }

  if (target.format && candidate.format) {
    if (target.format.toLowerCase() === candidate.format.toLowerCase()) {
      confidence += 0.05;
      reasons.push('format-match');
    } else {
      confidence -= 0.06;
      reasons.push('format-mismatch');
    }
  }

  // Only a *wild* disagreement counts. A library part-way through a season is
  // the normal case, so fewer local files than published episodes is expected.
  if (target.episodeCount != null && candidate.episodeCount != null && candidate.episodeCount > 0) {
    if (target.episodeCount > candidate.episodeCount * 2) {
      confidence -= 0.12;
      reasons.push('episode-count-far');
    } else if (target.episodeCount === candidate.episodeCount) {
      confidence += 0.05;
      reasons.push('episode-count-match');
    }
  }

  return { candidate, confidence: clamp01(confidence), matchedTitle, reasons };
}

/**
 * Best candidate for the target, or null when none is even worth reviewing.
 * Ties break on provider popularity, then on the shorter title — a search for
 * "The Big O" should land on it rather than on a spin-off with the same score.
 */
export function pickMetadataMatch<T extends MetadataCandidate>(
  target: MetadataTarget,
  candidates: readonly T[],
): MetadataMatch<T> | null {
  const scored = candidates.map((candidate) => scoreMetadataCandidate(target, candidate));
  let best: MetadataMatch<T> | null = null;
  for (const match of scored) {
    if (match.confidence < METADATA_REVIEW_CONFIDENCE) continue;
    if (!best) {
      best = match;
      continue;
    }
    if (match.confidence > best.confidence + 1e-9) {
      best = match;
      continue;
    }
    if (Math.abs(match.confidence - best.confidence) > 1e-9) continue;
    const byPopularity = (match.candidate.popularity ?? 0) - (best.candidate.popularity ?? 0);
    if (byPopularity > 0) best = match;
    else if (byPopularity === 0 && match.matchedTitle.length < best.matchedTitle.length) best = match;
  }
  return best;
}

/** Whether a scored match may be applied at all, and whether to flag it. */
export function metadataMatchDisposition(confidence: number): 'accept' | 'review' | 'reject' {
  if (confidence >= METADATA_ACCEPT_CONFIDENCE) return 'accept';
  if (confidence >= METADATA_REVIEW_CONFIDENCE) return 'review';
  return 'reject';
}
