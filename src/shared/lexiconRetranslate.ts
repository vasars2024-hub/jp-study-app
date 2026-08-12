/**
 * Feeding the reader's pinned senses back to the translator.
 *
 * Pinning already changes what the *interlinear* shows: the ruby, the harvest
 * row and the mined card all narrow to the sense the reader chose. The free
 * translation above it did not move, because it was produced by a model that
 * resolved 見る on its own and had no way to hear the correction. So the reader
 * could see the passage's own gloss line say "to look after" while the prose
 * underneath still said "saw", with nothing to reconcile them.
 *
 * This module closes that gap in one direction only: it reads a pinned result
 * and states, as translator constraints, the meanings the reader already chose.
 * It invents nothing — every gloss it emits came out of a dictionary entry the
 * user installed, by way of a pin the user set — and it is pure and offline, so
 * collecting hints costs nothing until a retranslation is actually requested.
 */

import { sensePinKey } from './lexiconSensePin';
import type {
  LexiconInterlinearMatch,
  LexiconInterlinearResult,
} from './lexiconInterlinear';
import { MAX_SENSE_HINTS, type TranslateSenseHint } from './translateCore';

/**
 * How much of one sense reaches the prompt.
 *
 * JMdict's own sense 3 of 見る is "to look after; to attend to; to take care of;
 * to keep an eye on; see: 看る to look after (often medically); to take care
 * of" — the definitional core is the first two or three, and the tail is
 * near-synonyms and a cross-reference that spend prompt budget without
 * narrowing anything. The reader still sees the entire sense in the ruby and on
 * the card; only the model's copy is trimmed.
 */
const MAX_HINT_GLOSSES = 3;

/**
 * The glosses that speak the language the passage is being translated into.
 *
 * A hint written in a language the model is not translating into is noise at
 * best: telling it that 見る means «присматривать» while asking for English
 * spends prompt budget on a constraint it cannot apply. The pinned match's own
 * `parallel` grouping already carries one group per gloss target, so the target
 * group is preferred; a single-target match has no grouping and its flat
 * `glosses` are, by construction, already in the requested target.
 */
function glossForTarget(match: LexiconInterlinearMatch, target: string): string {
  const wanted = target.trim().toLowerCase();
  const group = match.parallel?.find((candidate) => candidate.lang.toLowerCase() === wanted);
  const glosses = group ? group.glosses : match.parallel?.length ? [] : match.glosses;
  return glosses
    .map((gloss) => gloss.text.trim())
    .filter(Boolean)
    .slice(0, MAX_HINT_GLOSSES)
    .join('; ');
}

/**
 * Collect one hint per distinct pinned headword, in reading order.
 *
 * Deduplication is by `sensePinKey`, the same identity the pin itself is stored
 * under, so a word pinned once and occurring five times contributes one
 * constraint rather than five copies of it. Reading order is kept because the
 * first pins a reader sets are the ones they cared most about, and the list is
 * capped — `MAX_SENSE_HINTS` decides which end gets dropped when a reader has
 * pinned more words than a prompt can carry.
 */
export function collectSenseHints(
  result: LexiconInterlinearResult | null | undefined,
  targetLang: string,
): TranslateSenseHint[] {
  if (!result) return [];
  const seen = new Set<string>();
  const out: TranslateSenseHint[] = [];
  for (const part of result.parts) {
    if (part.kind !== 'token' || !part.match) continue;
    const match = part.match;
    if (match.pinnedSense === undefined) continue;
    const key = sensePinKey(match);
    if (seen.has(key)) continue;
    seen.add(key);
    const gloss = glossForTarget(match, targetLang);
    // A pinned sense with nothing to say in the target language is skipped
    // rather than emitted empty: a rule with a blank right-hand side reads to
    // the model as "this word means nothing".
    if (!gloss) continue;
    out.push(
      match.reading && match.reading !== match.text
        ? { text: match.text, reading: match.reading, gloss }
        : { text: match.text, gloss },
    );
    if (out.length >= MAX_SENSE_HINTS) break;
  }
  return out;
}
