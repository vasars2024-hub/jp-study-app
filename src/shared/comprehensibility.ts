// Comprehensibility scoring — the Reading Finder's "killer feature": an honest,
// per-user "% of words you already know" for a candidate text, computed against
// the user's knowledge store instead of a static difficulty tag.
//
// Pure and framework-free (like deinflect.ts / sentenceBounds.ts): the actual
// tokenization (kuromoji) and knowledge lookup live in the renderer wrapper
// (renderer/comprehensibility.ts); this module is just the scoring math, so it
// is fully testable without the tokenizer.
//
// Two coverage numbers are produced. `knownRatio` is over word *occurrences*
// (running-text coverage — the standard reading-comfort metric, since common
// words repeat and pull the number up), and `uniqueKnownRatio` is over distinct
// lemmas (harsher — one rare unknown word counts once). Proper nouns are
// excluded from both: names inflate difficulty downward and are not vocabulary
// the reader needs to "know" (the plan's explicit pitfall).

/** Knowledge levels, mirroring renderer/knownWords.ts (0 New … 3 Known). */
export type KnowledgeLevel = 0 | 1 | 2 | 3;

/** One tokenized word, reduced to just what scoring needs. */
export interface ScoredToken {
  /** Dictionary form used as the knowledge key. */
  lemma: string;
  /** True for trackable vocabulary (nouns/verbs/adjectives/adverbs). */
  content: boolean;
  /** True for proper nouns (名詞,固有名詞) — always excluded from scoring. */
  proper?: boolean;
}

export interface ComprehensibilityScore {
  /** 0..1 fraction of scored word *occurrences* the user knows (headline number). */
  knownRatio: number;
  /** 0..1 over distinct lemmas (harsher than knownRatio). */
  uniqueKnownRatio: number;
  /** Scored content-word occurrences (proper nouns + non-content excluded). */
  totalWords: number;
  /** Of `totalWords`, how many are known (level ≥ threshold). */
  knownWords: number;
  /** Distinct scored lemmas. */
  uniqueTotal: number;
  /** Of `uniqueTotal`, how many are known. */
  uniqueKnown: number;
  /** Occurrence counts bucketed by knowledge level. */
  byLevel: Record<KnowledgeLevel, number>;
  /** Proper-noun occurrences skipped — surfaced so the UI can note the exclusion. */
  properSkipped: number;
}

export interface ScoreOptions {
  /** A word counts as "known" at this level or above. Default 2 (Familiar+). */
  knownThreshold?: KnowledgeLevel;
}

const EMPTY: ComprehensibilityScore = {
  knownRatio: 0,
  uniqueKnownRatio: 0,
  totalWords: 0,
  knownWords: 0,
  uniqueTotal: 0,
  uniqueKnown: 0,
  byLevel: { 0: 0, 1: 0, 2: 0, 3: 0 },
  properSkipped: 0,
};

/**
 * Score how comprehensible a tokenized text is for a user whose per-word
 * knowledge is given by `knownLevel`. Non-content tokens (particles, auxiliaries,
 * punctuation) and proper nouns are excluded; everything else is scored by
 * occurrence and by distinct lemma.
 */
export function scoreComprehensibility(
  tokens: Iterable<ScoredToken>,
  knownLevel: (lemma: string) => KnowledgeLevel,
  opts: ScoreOptions = {},
): ComprehensibilityScore {
  const threshold = opts.knownThreshold ?? 2;
  const byLevel: Record<KnowledgeLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  // Cache lemma → level so a word repeated 40 times is one lookup, and so the
  // unique pass and the occurrence pass agree on the same value.
  const levelCache = new Map<string, KnowledgeLevel>();

  let totalWords = 0;
  let knownWords = 0;
  let properSkipped = 0;

  for (const tk of tokens) {
    if (!tk.content) continue;
    if (tk.proper) {
      properSkipped += 1;
      continue;
    }
    const lemma = tk.lemma;
    if (!lemma) continue;
    let level = levelCache.get(lemma);
    if (level === undefined) {
      level = knownLevel(lemma);
      levelCache.set(lemma, level);
    }
    totalWords += 1;
    byLevel[level] += 1;
    if (level >= threshold) knownWords += 1;
  }

  if (totalWords === 0) return { ...EMPTY, properSkipped };

  let uniqueKnown = 0;
  for (const level of levelCache.values()) if (level >= threshold) uniqueKnown += 1;
  const uniqueTotal = levelCache.size;

  return {
    knownRatio: knownWords / totalWords,
    uniqueKnownRatio: uniqueTotal ? uniqueKnown / uniqueTotal : 0,
    totalWords,
    knownWords,
    uniqueTotal,
    uniqueKnown,
    byLevel,
    properSkipped,
  };
}

/** Headline percentage (0–100, rounded) for display. */
export function knownPercent(score: ComprehensibilityScore): number {
  return Math.round(score.knownRatio * 100);
}
