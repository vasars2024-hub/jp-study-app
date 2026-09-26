/**
 * Authored content for the supplement dumps.
 *
 * The four supplement modules (n4/n3/n2/n1-supplement) arrived as a pattern and
 * a gloss and nothing else: the dump copied the title into `structure` and the
 * gloss into `explanation`, and carried no examples. 1,820 records looked like
 * study material and said nothing a learner could use.
 *
 * Content is written here, keyed by the supplement record's id, rather than
 * edited into the 650 KB dump files. That keeps three things separable that the
 * dump had fused: what the source claimed (the record), what was written for
 * this app (this overlay), and what is still missing (the queue below). A
 * record the overlay covers stops being hollow; one it does not cover is still
 * hollow and is still in the queue, so the next authoring pass continues from
 * `grammarAuthoringQueue()` instead of from memory.
 *
 * Every entry is original writing for this app (no copied textbook or site
 * text). Example sentences are hand-written unless they carry `source`.
 */
import type { GrammarFunctionId } from './functions';
import type { GrammarExample, GrammarLevel, GrammarPoint } from './types';
import { isHollowGrammarPoint } from './hollow';
import { AUTHORED_N4 } from './authored/n4';
import { AUTHORED_N3 } from './authored/n3';
import { AUTHORED_N2 } from './authored/n2';
import { AUTHORED_N1 } from './authored/n1';

export interface AuthoredGrammarContent {
  /** How the pattern is formed, e.g. `V-て形 + もらえると ありがたい`. */
  structure: string;
  /** Two to four sentences: nuance, register, a common confusion. */
  explanation: string;
  /** At least two, each with a translation. */
  examples: GrammarExample[];
  /** A corrected gloss, when the dump's gloss was wrong or unreadable. */
  meaning?: string;
  /** Corrected legacy function tags (the dump's were gloss-regex guesses). */
  functions?: GrammarFunctionId[];
}

export const AUTHORED_CONTENT: Readonly<Record<string, AuthoredGrammarContent>> = {
  ...AUTHORED_N4,
  ...AUTHORED_N3,
  ...AUTHORED_N2,
  ...AUTHORED_N1,
};

/** Provenance label for a supplement record the overlay filled in. */
export const AUTHORED_CONTENT_SOURCE = 'authored:content-pass';

/**
 * Function tags the gloss-regex tagger got plainly wrong.
 *
 * The tagger matched substrings of the *pattern*, so 反対(はんたい)に, たいへん,
 * だいたい, たいてい and みたい were all tagged `desire` for containing たい;
 * every 〜そうだ became hearsay whether it was hearsay or appearance; every
 * られる became potential whether it was passive or honorific. These are the
 * ones checked by hand. Authored entries carry their own tags and win over this.
 */
export const TAG_CORRECTIONS: Readonly<Record<string, GrammarFunctionId[]>> = {
  'n3m-g-9f301c': ['contrast'],
  'n4m-g-e69e0e': ['request', 'benefit'],
  'n4m-g-e1039f': ['evaluate'],
  'n3m-g-4122b5': ['similarity-degree'],
  'n3m-g-91f44b': ['request'],
  'n3m-g-8721b5': ['request', 'reverent-humble'],
  'n3m-g-9ba215': ['amount'],
  'n2m-g-6eb651': ['frequency'],
  'n2m-g-77ff92': ['ability'],
  'n2m-g-332c13': ['level', 'evaluate'],
  'n4m-g-1c7b93': ['passive', 'means-methods'],
  'n3m-g-510ada': ['passive'],
  'n3m-g-4cc658': ['reverent-humble'],
  'n3m-g-278b0d': ['passive'],
  'n1m-g-c3517e': ['speculation', 'passive'],
  'n4m-g-468c6e': ['allow'],
  'n4m-g-cf4ee1': ['allow', 'negative'],
  'n2m-g-7ac0a5': ['judge'],
  'n4m-g-feb367': ['direction'],
  'n4m-g-b893c8': ['benefit'],
  'n2m-g-0422c2': ['amount'],
  'n4m-g-8aac33': ['heard', 'judge'],
  'n4m-g-de9413': ['similarity-degree', 'speculation'],
  'n4m-g-4ba01b': ['explain', 'definition'],
  'n4m-g-708a56': ['definition'],
  'n3m-g-12772f': ['definition'],
  'n3m-g-3acec8': ['definition', 'explain'],
  'n3m-g-8e6bfe': ['judge', 'passive'],
  'n3m-g-b7ca07': ['similarity-degree'],
  'n3m-g-eacdf8': ['speculation'],
  'n3m-g-fee938': ['speculation', 'immediately-after'],
  'n2m-g-e0684f': ['speculation'],
  'n4m-g-083f8c': ['reverent-humble'],
  'n3m-g-53a835': ['condition-contrary', 'regret'],
  'n2m-g-912f4b': ['negative', 'result'],
  'n2m-g-2a83fa': ['negative', 'result'],
  'n1m-g-b34a68': ['speculation'],
  'n1m-g-947909': ['similarity-degree'],
  'n4m-g-a5401f': ['condition'],
};

/**
 * Lay authored content over a module's records. Records without an entry pass
 * through untouched (and stay hollow); a tag correction applies either way.
 */
export function applyAuthoredContent(list: readonly GrammarPoint[]): GrammarPoint[] {
  return list.map((p) => {
    const content = AUTHORED_CONTENT[p.id];
    const corrected = TAG_CORRECTIONS[p.id];
    if (!content && !corrected) return p;
    /*
     * Corrected functions replace the regex ones, and categories are resolved
     * from them by normalization as before. They are deliberately NOT written as
     * explicit `categories`: that would mark the record's tags `authored`, and a
     * supplement record's register is still the dump's guess — the corpus holds
     * every supplement record to heuristic tag provenance, and so does this.
     */
    if (!content) return { ...p, functions: [...corrected] };
    const functions = content.functions ?? corrected;
    return {
      ...p,
      meaning: content.meaning ?? p.meaning,
      structure: content.structure,
      explanation: content.explanation,
      examples: content.examples.map((ex) => ({ ...ex })),
      ...(functions ? { functions: [...functions] } : {}),
      provenance: {
        ...p.provenance,
        source: AUTHORED_CONTENT_SOURCE,
        // Authored against the pattern, not reviewed by a second person.
        verification: 'partial',
      },
    };
  });
}

const LEVEL_RANK: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

export interface AuthoringQueueEntry {
  id: string;
  level: GrammarLevel;
  title: string;
  meaning: string;
}

/**
 * What the next authoring pass should write, in order.
 *
 * Easiest level first (N5 → N1), because a beginner meets those patterns
 * first. Within a level, a record whose pattern already has a fuller twin in
 * the corpus goes last — dedupe hides the hollow copy, so writing it helps no
 * one — and records with corpus example hits go first: a pattern that turns up
 * in Tatoeba is one learners actually meet.
 */
export function grammarAuthoringQueue(
  records: readonly GrammarPoint[],
  options: { shadowed?: ReadonlySet<string>; corpusHits?: Readonly<Record<string, number>> } = {},
): AuthoringQueueEntry[] {
  const shadowed = options.shadowed ?? new Set<string>();
  const hits = options.corpusHits ?? {};
  return records
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => isHollowGrammarPoint(p) && !AUTHORED_CONTENT[p.id])
    .sort(
      (a, b) =>
        (LEVEL_RANK[a.p.level] ?? 9) - (LEVEL_RANK[b.p.level] ?? 9) ||
        Number(shadowed.has(a.p.id)) - Number(shadowed.has(b.p.id)) ||
        (hits[b.p.id] ?? 0) - (hits[a.p.id] ?? 0) ||
        a.index - b.index,
    )
    .map(({ p }) => ({ id: p.id, level: p.level, title: p.title, meaning: p.meaning }));
}

/** Authored vs still-hollow counts per level, for the audit and the tests' ratchet. */
export function authoringProgress(
  records: readonly GrammarPoint[],
): Record<string, { authored: number; hollow: number }> {
  const out: Record<string, { authored: number; hollow: number }> = {};
  for (const p of records) {
    const row = (out[p.level] ??= { authored: 0, hollow: 0 });
    if (AUTHORED_CONTENT[p.id]) row.authored += 1;
    else if (isHollowGrammarPoint(p)) row.hollow += 1;
  }
  return out;
}
