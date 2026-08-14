import { kataToHira } from './langs';

export const MAX_NEIGHBOR_PROBE_SENSES = 6;
export const MAX_NEIGHBOR_RESULTS = 12;
/** A gloss shorter than this links words by accident ("a", "of") rather than by sense. */
export const MIN_NEIGHBOR_SENSE_CHARS = 2;
/** A gloss longer than this is a definition, not a sense label, and matches nothing else. */
export const MAX_NEIGHBOR_SENSE_CHARS = 80;

export interface LexiconNeighbor {
  lang: string;
  text: string;
  reading: string;
  dictId: string;
  dictTitle: string;
  /** The gloss strings this word and the query word literally both carry. */
  sharedSenses: string[];
}

export interface LexiconNeighborResult {
  query: string;
  /** The query's own gloss strings that were probed, in the order they were probed. */
  probedSenses: string[];
  neighbors: LexiconNeighbor[];
}

export interface LexiconNeighborCandidate {
  lang: string;
  text: string;
  reading: string;
  dictId: string;
  dictTitle: string;
  /** The one gloss string that produced this candidate row. */
  sense: string;
  /** The contributing dictionary's effective priority; lower ranks first. */
  priority: number;
}

/** NFKC + case fold, matching the `norm` rule the headword index is built on. */
export function normalizeNeighborText(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase();
}

/**
 * Identity of a *word*, as opposed to identity of a gloss.
 *
 * Katakana folds to hiragana here and nowhere else. Live probing found the first
 * "neighbour" of 猫 to be ネコ — JMdict lists the katakana spelling as its own
 * headword, so a plain string compare against 猫 / ねこ let the query word back
 * in as its own top result. A surface titled "words that share a sense" must not
 * open with the word itself in another script.
 */
export function neighborWordKey(text: string): string {
  return kataToHira(normalizeNeighborText(text));
}

/**
 * Which of a word's glosses are worth probing the index with.
 *
 * Deduplicated case-insensitively but returned in their original casing, because
 * the caller shows them back to the reader as the sense that links two words.
 */
export function selectNeighborProbeSenses(
  glosses: readonly string[],
  limit = MAX_NEIGHBOR_PROBE_SENSES,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const gloss of glosses) {
    const trimmed = gloss.trim();
    if (trimmed.length < MIN_NEIGHBOR_SENSE_CHARS) continue;
    if (trimmed.length > MAX_NEIGHBOR_SENSE_CHARS) continue;
    const key = normalizeNeighborText(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= Math.max(1, Math.floor(limit))) break;
  }
  return out;
}

/**
 * Fold per-gloss index hits into one ranked list of words that share a sense.
 *
 * This is deliberately *shared glosses*, not similarity: every neighbour is
 * justified by gloss strings the reader can see on both words, so nothing here
 * asserts a relationship the database does not literally contain. A word is
 * identified by language + written form + reading rather than by headword id,
 * so the same word supplied by two dictionaries collapses into one row instead
 * of appearing to be two different neighbours.
 *
 * Rank: more shared senses first, then the contributing dictionary's priority,
 * then the order the rows arrived in — so the result is stable for one database
 * and never depends on SQLite's query plan.
 */
export function rankLexiconNeighbors(
  query: string,
  candidates: readonly LexiconNeighborCandidate[],
  limit = MAX_NEIGHBOR_RESULTS,
): LexiconNeighbor[] {
  const queryKey = neighborWordKey(query);
  const grouped = new Map<string, {
    neighbor: LexiconNeighbor;
    senses: Set<string>;
    priority: number;
    order: number;
  }>();

  for (const candidate of candidates) {
    const text = candidate.text.trim();
    const sense = candidate.sense.trim();
    if (!text || !sense) continue;
    // A word is never its own neighbour, in any of its scripts: the reading is
    // checked too so 猫 does not come back as a neighbour of ねこ, and the key
    // folds kana so ネコ does not come back as a neighbour of either.
    if (neighborWordKey(text) === queryKey) continue;
    if (candidate.reading && neighborWordKey(candidate.reading) === queryKey) continue;

    const key = [candidate.lang, neighborWordKey(text), neighborWordKey(candidate.reading)].join('\t');
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.senses.has(normalizeNeighborText(sense))) {
        existing.senses.add(normalizeNeighborText(sense));
        existing.neighbor.sharedSenses.push(sense);
      }
      existing.priority = Math.min(existing.priority, candidate.priority);
      continue;
    }
    grouped.set(key, {
      neighbor: {
        lang: candidate.lang,
        text,
        reading: candidate.reading.trim(),
        dictId: candidate.dictId,
        dictTitle: candidate.dictTitle,
        sharedSenses: [sense],
      },
      senses: new Set([normalizeNeighborText(sense)]),
      priority: candidate.priority,
      order: grouped.size,
    });
  }

  return [...grouped.values()]
    .sort((a, b) =>
      b.neighbor.sharedSenses.length - a.neighbor.sharedSenses.length ||
      a.priority - b.priority ||
      a.order - b.order)
    .slice(0, Math.max(1, Math.min(MAX_NEIGHBOR_RESULTS, Math.floor(limit))))
    .map((entry) => entry.neighbor);
}
