/**
 * Pinning the sense a passage actually used.
 *
 * A polysemous headword arrives from the dictionary with every sense it has ever
 * had: 見る is "to see; to look at; to watch; to examine; to look after; to try"
 * long before the reader gets to decide which one this sentence meant. The flat
 * gloss line is honest but unreadable at passage scale, and it is also what the
 * harvest row shows and what a mined card would write onto the back.
 *
 * Pinning is the reader supplying the one fact the database cannot: which sense
 * is in play here. It selects among glosses the dictionary already supplied and
 * never rewrites, merges or invents one, so a pinned result stays exactly as
 * grounded as an unpinned one — which is why this layer is pure, offline, and
 * needs no model.
 *
 * A pin is keyed by headword rather than by offset, so pinning 見る once applies
 * to every occurrence in the passage. That matches how a reader thinks about a
 * passage ("here, this word means X") and keeps the harvest row — which reads
 * the first occurrence — consistent with the flow the reader is looking at.
 */

import {
  uniqueGlosses,
  type LexiconInterlinearMatch,
  type LexiconInterlinearResult,
} from './lexiconInterlinear';

/** Pinned sense index by `sensePinKey`. Session state: nothing is persisted. */
export type LexiconSensePins = Readonly<Record<string, number>>;

/**
 * The identity a pin is recorded against.
 *
 * Sense indices belong to one dictionary's entry, so the dictionary is part of
 * the key: sense 2 of JMdict's 見る is not sense 2 of another dictionary's. The
 * three fields are joined through JSON rather than a separator character, so no
 * headword containing the separator can collide with a different headword.
 */
export function sensePinKey(match: LexiconInterlinearMatch): string {
  return JSON.stringify([match.dictId, match.text, match.reading]);
}

/** One sense is not a choice; the flat gloss line already says the same thing. */
export function canPinSense(match: LexiconInterlinearMatch): boolean {
  return (match.senses?.length ?? 0) > 1;
}

/**
 * Narrow one match to a single sense.
 *
 * Parallel targets complicate this: the gloss lines of a token can come from
 * several dictionaries, but only the chosen entry has senses. So a parallel
 * group is narrowed exactly when it is the chosen entry's own dictionary *and*
 * the pinned sense actually speaks that language. A sibling dictionary's line
 * is left alone rather than dropped — it is still a sourced gloss for this
 * headword, and discarding it would lose data the pin says nothing about.
 *
 * An index that names no sense returns the match unchanged, so a stale pin from
 * a previous lookup degrades to "not pinned" instead of blanking a token.
 */
export function applySensePin(
  match: LexiconInterlinearMatch,
  senseIndex: number,
): LexiconInterlinearMatch {
  const sense = match.senses?.find((candidate) => candidate.index === senseIndex);
  if (!sense) return match;

  const pinnedLangs = new Set(sense.glosses.map((gloss) => gloss.lang));
  const parallel = match.parallel?.map((group) => (
    group.dictId === match.dictId && pinnedLangs.has(group.lang)
      ? { ...group, glosses: sense.glosses.filter((gloss) => gloss.lang === group.lang) }
      : group
  ));
  const glosses = parallel?.length
    ? uniqueGlosses(parallel.flatMap((group) => group.glosses))
    : [...sense.glosses];

  return {
    ...match,
    glosses,
    ...(parallel ? { parallel } : {}),
    pinnedSense: senseIndex,
    hasTargetGloss: glosses.length > 0,
  };
}

/**
 * Apply a passage's pins to every token they name.
 *
 * The result is returned by identity when no pin changed anything, so the common
 * unpinned case costs one map and no downstream recomputation.
 */
export function applySensePins(
  result: LexiconInterlinearResult,
  pins: LexiconSensePins,
): LexiconInterlinearResult {
  if (!Object.keys(pins).length) return result;

  let changed = false;
  const parts = result.parts.map((part) => {
    if (part.kind !== 'token' || !part.match) return part;
    const pinned = pins[sensePinKey(part.match)];
    if (pinned === undefined) return part;
    const match = applySensePin(part.match, pinned);
    if (match === part.match) return part;
    changed = true;
    return { ...part, match };
  });

  return changed ? { ...result, parts } : result;
}
