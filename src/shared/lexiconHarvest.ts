import type {
  LexiconFrequency,
  LexiconInterlinearMatch,
  LexiconInterlinearResult,
  LexiconInterlinearToken,
  LexiconLookupGloss,
} from './lexiconInterlinear';

/**
 * A harvest is a study list, not a concordance: past this many rows it stops
 * being something a learner reads and starts being a table. Frequency order
 * means the cap drops the words the passage leans on least.
 */
export const MAX_HARVEST_ITEMS = 200;

/**
 * Enough surface forms to show that a headword was inflected, without turning a
 * row into a citation list. The personal concordance is its own plan item.
 */
export const MAX_HARVEST_SURFACES = 6;

export interface LexiconVocabularyItem {
  /** Stable grouping identity: headword when grounded, folded surface otherwise. */
  key: string;
  /** The dictionary headword when the token was grounded, else the surface. */
  text: string;
  reading: string;
  /** Surface forms as they appeared in the passage, in first-seen order. */
  surfaces: string[];
  count: number;
  /** Offset of the first occurrence, so a tie in frequency keeps reading order. */
  firstStart: number;
  grounded: boolean;
  /** Only glosses in the requested target languages, from the first occurrence. */
  glosses: LexiconLookupGloss[];
  /**
   * The headword's frequency rank, when the lookup was asked for one and a list
   * ranked it. Carried here so difficulty scoring counts a word once however
   * often the passage repeats it.
   */
  frequency?: LexiconFrequency;
  dictId?: string;
  dictTitle?: string;
  headwordId?: number;
}

export interface LexiconVocabularyHarvest {
  items: LexiconVocabularyItem[];
  /** Word-like token occurrences that were harvested, before grouping. */
  occurrences: number;
  /** Distinct entries found, counted before the row cap is applied. */
  uniqueCount: number;
  groundedCount: number;
  /** True when `items` was cut to `MAX_HARVEST_ITEMS`. Input truncation is separate. */
  capped: boolean;
}

/**
 * A bare number, a percent sign, or a stray symbol is a token but not
 * vocabulary. Requiring one letter is deterministic and language-neutral —
 * anything finer would be a per-language stopword table, which this layer has
 * no grounded source for. Note the iteration mark 々 is a Unicode letter and is
 * therefore kept; it only ever appears attached to a word in real text.
 */
function isVocabularyToken(text: string): boolean {
  return /\p{L}/u.test(text);
}

/**
 * Fold only for grouping. Case folding merges `The`/`the` in Latin scripts and
 * is a no-op for CJK; the displayed form stays exactly as the passage wrote it.
 */
function surfaceKey(text: string): string {
  return text.toLocaleLowerCase();
}

/**
 * The grouping identity of a grounded token.
 *
 * Exported because a comparison *between* two passages — the round-trip diff —
 * has to ask "is this the same word?" with exactly the rule the harvest rows
 * already group by. A second copy of the format elsewhere would drift, and the
 * first symptom would be a word silently reported as lost because two callers
 * disagreed about its key.
 *
 * Grouping deliberately excludes the dictionary: the same headword found in an
 * English and a Russian dictionary is one vocabulary row, not two. It
 * deliberately *includes* the reading, so 生 (なま) and 生 (せい) stay distinct —
 * they are different words that happen to share a spelling.
 */
export function groundedVocabularyKey(
  match: Pick<LexiconInterlinearMatch, 'text' | 'reading'>,
): string {
  return `g\u0000${match.text}\u0000${match.reading}`;
}

function itemKey(part: LexiconInterlinearToken): string {
  const match = part.match;
  return match ? groundedVocabularyKey(match) : `s\u0000${surfaceKey(part.text)}`;
}

/**
 * Collapse an interlinear passage into the distinct words it actually used.
 *
 * Every field is read off the grounded interlinear result — no inferred reading,
 * no invented gloss, no frequency table. An ungrounded token is kept and marked
 * rather than dropped, because "this passage uses a word your dictionaries do
 * not have" is exactly the thing a learner needs to see.
 */
export function harvestLexiconVocabulary(
  result: LexiconInterlinearResult,
  max: number = MAX_HARVEST_ITEMS,
): LexiconVocabularyHarvest {
  const limit = Math.max(1, Math.floor(max));
  const byKey = new Map<string, LexiconVocabularyItem>();
  let occurrences = 0;

  for (const part of result.parts) {
    if (part.kind !== 'token' || !isVocabularyToken(part.text)) continue;
    occurrences += 1;

    const key = itemKey(part);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (
        existing.surfaces.length < MAX_HARVEST_SURFACES &&
        !existing.surfaces.includes(part.text)
      ) {
        existing.surfaces.push(part.text);
      }
      continue;
    }

    const match = part.match;
    byKey.set(key, {
      key,
      text: match?.text || part.text,
      reading: match?.reading ?? '',
      surfaces: [part.text],
      count: 1,
      firstStart: part.start,
      grounded: Boolean(match),
      glosses: match ? [...match.glosses] : [],
      ...(match?.frequency ? { frequency: match.frequency } : {}),
      ...(match ? { dictId: match.dictId, dictTitle: match.dictTitle, headwordId: match.headwordId } : {}),
    });
  }

  const all = [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.firstStart - b.firstStart,
  );

  return {
    items: all.slice(0, limit),
    occurrences,
    uniqueCount: all.length,
    groundedCount: all.filter((item) => item.grounded).length,
    capped: all.length > limit,
  };
}
