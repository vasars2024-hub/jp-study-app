/**
 * The round trip: reading a translation back into the language it came from.
 *
 * A translation is the one rung of the ladder the reader cannot check. The
 * interlinear is grounded token by token and can be audited against the
 * dictionary entry it came from; the prose above it is a model's single
 * unsourced sentence, and a learner who could tell whether it was faithful
 * would not have needed it. Pinning gave the reader a way to *state* what a word
 * meant, and the previous slice handed those pins to the translator — but the
 * model obeys them only sometimes, and nothing on the surface said which time
 * this was.
 *
 * A round trip answers that with evidence instead of trust: translate the
 * translation back, segment it with the same offline pipeline, and ask which of
 * the passage's own words came back. A word the reader pinned that does not
 * survive the return leg is the concrete, visible form of "the model did not
 * carry your sense" — the thing the previous slice could only record as a
 * caveat in a ledger.
 *
 * What this layer refuses to claim: it is a *lexical* diff, not a semantic one
 * in the strong sense. It compares dictionary headwords, so a faithful
 * paraphrase that reaches for a synonym reads as one word lost and one word
 * added. That is why the UI names the buckets by what they are — words that came
 * back, words that did not — and never scores the translation. This module is
 * pure, offline and derived entirely from two grounded results, so it invents
 * nothing and costs nothing until a round trip is actually asked for.
 */

import {
  groundedVocabularyKey,
  harvestLexiconVocabulary,
  type LexiconVocabularyItem,
} from './lexiconHarvest';
import type { LexiconInterlinearResult } from './lexiconInterlinear';

/**
 * Enough rows to read at a glance. A diff bucket is a prompt to look again at
 * a handful of words, not a table; past this the reader stops reading and the
 * `total` on the bucket carries the real number.
 */
export const MAX_ROUND_TRIP_WORDS = 24;

/** One row's worth of gloss — the full sense stays a click away in the flow. */
const MAX_ROUND_TRIP_GLOSSES = 3;

export interface LexiconRoundTripWord {
  /** The harvest's own grouping identity, so a row here is a row there. */
  key: string;
  text: string;
  reading: string;
  /** Gloss texts from the side this word was found on, capped for one line. */
  glosses: string[];
  count: number;
  /** Whether the reader had pinned a sense of this word in the original. */
  pinned: boolean;
}

/**
 * A capped list plus the count it was capped from.
 *
 * Rendering is bounded but the summary is not: "3 of 41 words came back" has to
 * stay true even when only 24 of the 38 missing ones are shown.
 */
export interface LexiconRoundTripBucket {
  words: LexiconRoundTripWord[];
  total: number;
}

export interface LexiconRoundTripDiff {
  /** In the passage and in the round trip. */
  kept: LexiconRoundTripBucket;
  /** In the passage, absent from the round trip. Pinned words sort first. */
  lost: LexiconRoundTripBucket;
  /** In the round trip only — words the return leg introduced. */
  added: LexiconRoundTripBucket;
  /** Distinct grounded words on each side, i.e. what was actually comparable. */
  originalCount: number;
  roundTripCount: number;
  /** Pinned words that did not survive. The honest signal about the pins. */
  pinnedLost: number;
  /** kept / originalCount, or 0 when there was nothing to compare. */
  retention: number;
  /** Tokens excluded because no installed dictionary knows them. */
  ungrounded: { original: number; roundTrip: number };
  /** False when either side grounded nothing — then the diff says nothing. */
  comparable: boolean;
}

function glossTexts(item: LexiconVocabularyItem): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const gloss of item.glosses) {
    const text = gloss.text.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= MAX_ROUND_TRIP_GLOSSES) break;
  }
  return out;
}

function toWord(item: LexiconVocabularyItem, pinnedKeys: ReadonlySet<string>): LexiconRoundTripWord {
  return {
    key: item.key,
    text: item.text,
    reading: item.reading,
    glosses: glossTexts(item),
    count: item.count,
    pinned: pinnedKeys.has(item.key),
  };
}

function bucket(words: LexiconRoundTripWord[]): LexiconRoundTripBucket {
  return { words: words.slice(0, MAX_ROUND_TRIP_WORDS), total: words.length };
}

/**
 * The headwords whose sense the reader pinned, by harvest identity.
 *
 * Exported because the caller may want to know a passage has pins without
 * running a round trip, and because deriving it here keeps the one place that
 * knows a pin is `pinnedSense !== undefined`.
 */
export function pinnedVocabularyKeys(result: LexiconInterlinearResult): Set<string> {
  const keys = new Set<string>();
  for (const part of result.parts) {
    if (part.kind !== 'token' || !part.match) continue;
    if (part.match.pinnedSense === undefined) continue;
    keys.add(groundedVocabularyKey(part.match));
  }
  return keys;
}

/**
 * Compare a passage with its own round trip, word by grounded word.
 *
 * Ungrounded tokens are excluded rather than compared as strings, on both
 * sides. The return leg rewrites surface forms by construction, so a string
 * comparison of words no dictionary knows would report noise as meaning: two
 * different unknown words reading as one preserved one, or the same name
 * inflected differently reading as a loss. Their counts are reported instead,
 * so the reader can see how much of the passage the comparison could not speak
 * for — silence about them would overstate every ratio here.
 */
export function diffLexiconRoundTrip(
  original: LexiconInterlinearResult,
  roundTrip: LexiconInterlinearResult,
): LexiconRoundTripDiff {
  const pinnedKeys = pinnedVocabularyKeys(original);
  const originalHarvest = harvestLexiconVocabulary(original);
  const roundTripHarvest = harvestLexiconVocabulary(roundTrip);

  const originalWords = originalHarvest.items.filter((item) => item.grounded);
  const roundTripWords = roundTripHarvest.items.filter((item) => item.grounded);
  const roundTripKeys = new Set(roundTripWords.map((item) => item.key));
  const originalKeys = new Set(originalWords.map((item) => item.key));

  const kept: LexiconRoundTripWord[] = [];
  const lost: LexiconRoundTripWord[] = [];
  for (const item of originalWords) {
    (roundTripKeys.has(item.key) ? kept : lost).push(toWord(item, pinnedKeys));
  }
  const added = roundTripWords
    .filter((item) => !originalKeys.has(item.key))
    .map((item) => toWord(item, pinnedKeys));

  // A pinned word that did not come back is what the reader asked this question
  // for, so it leads its bucket however rare it was in the passage.
  lost.sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return {
    kept: bucket(kept),
    lost: bucket(lost),
    added: bucket(added),
    originalCount: originalWords.length,
    roundTripCount: roundTripWords.length,
    pinnedLost: lost.filter((word) => word.pinned).length,
    retention: originalWords.length ? kept.length / originalWords.length : 0,
    ungrounded: {
      original: originalHarvest.items.length - originalWords.length,
      roundTrip: roundTripHarvest.items.length - roundTripWords.length,
    },
    comparable: originalWords.length > 0 && roundTripWords.length > 0,
  };
}
