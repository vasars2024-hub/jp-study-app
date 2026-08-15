/**
 * How common a word is, according to the frequency corpora the user installed.
 *
 * `freq_corpora` has existed since schema v1 with an index built for a lookup
 * (`idx_freq_norm` on `(lang, norm)`), a writer in the legacy Yomitan migration,
 * a relabeller in `sourceLang.ts` — and **no reader anywhere**. The comment at
 * the top of `sourceLang.ts` even claimed the rows "are read by the lookup path";
 * they were not. The professional-dictionary plan lists corpus frequency among
 * the facts the Lexicon Workbench must show, so this module is that reader's
 * contract.
 *
 * Nothing here is generated or estimated. A rank is a number a corpus published
 * about a word; when no installed corpus knows the word, the surface says nothing
 * rather than guessing that the word must therefore be rare — an empty database
 * and a genuinely rare word are not the same claim.
 */

/** Distinct corpora shown for one word. Beyond this it is a table, not a fact. */
export const MAX_FREQUENCY_RESULTS = 6;

/**
 * A pasted sentence is not a headword, and the probe is an indexed equality on
 * `freq_corpora.norm`, so a long query can only ever miss. Same bound as the
 * etymology probe, for the same reason.
 */
export const MAX_FREQUENCY_QUERY_CHARS = 16;

/**
 * How many distinct words one batched rank lookup may ask about.
 *
 * A page of a deck, not a corpus. The Deck Workbench needs a rank per note
 * before it can filter on one, and the batched reader answers that in a handful
 * of statements — but a caller that hands it a whole 100k-note collection is
 * asking for a table scan on the main thread, so the bound is enforced rather
 * than documented.
 */
export const MAX_FREQUENCY_BATCH = 4_000;

/**
 * The learner-facing summary of a rank.
 *
 * Bands rather than a bare number because "#4,312" answers nothing on its own —
 * a rank is only meaningful against the size of the list it came from, which the
 * reader does not know. The rank is still shown; the band is what it means.
 */
export type LexiconFrequencyBand = 'veryCommon' | 'common' | 'uncommon' | 'rare';

/**
 * The rank at which each band ends.
 *
 * Decided here rather than per corpus: 1.5k / 5k / 15k is the split the usual
 * learner frequency lists already bucket at — roughly core vocabulary, general
 * fluency, then wide reading — and a per-corpus table would have to be curated
 * for every source a user might import, which is not a promise this can keep.
 * A corpus that ranks differently shifts the words, not the meaning of the band.
 */
export const FREQUENCY_BAND_LIMITS: ReadonlyArray<readonly [LexiconFrequencyBand, number]> = [
  ['veryCommon', 1_500],
  ['common', 5_000],
  ['uncommon', 15_000],
];

/** One corpus's opinion about one word. */
export interface LexiconFrequencyEntry {
  /** The dictionary/corpus id the rows are filed under (`freq_corpora.corpus`). */
  corpusId: string;
  /** Its display title, so the reader sees a source and not an id. */
  corpusTitle: string;
  /** 1 is the most common word in that corpus. Always present; the column is NOT NULL. */
  rank: number;
  /**
   * Occurrences per million tokens, when the corpus published it.
   *
   * Nullable in the schema and genuinely absent for most sources, so it is
   * optional here rather than defaulted to 0 — which would claim the word never
   * occurs.
   */
  perMillion?: number;
}

export interface LexiconFrequencyResult {
  query: string;
  entries: LexiconFrequencyEntry[];
  /** The band the best rank falls in. Absent exactly when `entries` is empty. */
  band?: LexiconFrequencyBand;
}

/** The band a rank falls in. Ranks are 1-based, so anything below 1 is not a rank. */
export function frequencyBand(rank: number): LexiconFrequencyBand | undefined {
  if (!Number.isFinite(rank) || rank < 1) return undefined;
  for (const [band, limit] of FREQUENCY_BAND_LIMITS) {
    if (rank <= limit) return band;
  }
  return 'rare';
}

/**
 * The corpora worth showing, best rank first.
 *
 * Deduplicated on the corpus, keeping its lowest rank: one source can file the
 * same word under two spellings that normalise together (全て / すべて), and
 * showing the same corpus twice would read as two independent measurements.
 *
 * Sorted by rank rather than by dictionary priority, unlike every other lookup
 * surface here. Priority answers "whose definition do I trust"; this list answers
 * "how common is it", and the most confident answer is the one that ranks the
 * word highest, whichever source it came from. Ties fall back to the incoming
 * order, which is the priority order, so the ordering is still deterministic.
 */
export function selectLexiconFrequencies(
  rows: readonly LexiconFrequencyEntry[],
  limit = MAX_FREQUENCY_RESULTS,
): LexiconFrequencyEntry[] {
  const best = new Map<string, LexiconFrequencyEntry>();
  const order: string[] = [];
  for (const row of rows) {
    if (!Number.isFinite(row.rank) || row.rank < 1) continue;
    const current = best.get(row.corpusId);
    if (!current) {
      best.set(row.corpusId, row);
      order.push(row.corpusId);
    } else if (row.rank < current.rank) {
      best.set(row.corpusId, row);
    }
  }
  return order
    .map((id) => best.get(id) as LexiconFrequencyEntry)
    .sort((a, b) => (a.rank === b.rank ? order.indexOf(a.corpusId) - order.indexOf(b.corpusId) : a.rank - b.rank))
    .slice(0, limit);
}

/** The whole result for a word, from raw rows. The band always matches `entries[0]`. */
export function buildLexiconFrequencyResult(
  query: string,
  rows: readonly LexiconFrequencyEntry[],
  limit = MAX_FREQUENCY_RESULTS,
): LexiconFrequencyResult {
  const entries = selectLexiconFrequencies(rows, limit);
  if (!entries.length) return { query, entries: [] };
  const band = frequencyBand(entries[0].rank);
  return band ? { query, entries, band } : { query, entries };
}
