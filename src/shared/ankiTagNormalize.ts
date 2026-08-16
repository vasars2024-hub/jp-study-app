// Normalising inconsistent tags — ANKI_DECK_WORKBENCH_PLAN.md Phase 7, recipe 12
// ("normalize inconsistent tags and deck paths"), tag half.
//
// A deck that has been mined into over months accumulates tags that *mean* the
// same thing and do not *sort* the same way: `JLPT::N5` beside `jlpt::n5`,
// `Anime::` with a trailing separator, `Source::::Netflix` with a doubled one.
// Anki treats every one of those as a distinct tag, so the sidebar shows four
// entries where the user has one concept, and a `tag:JLPT::N5` filter silently
// misses half the deck.
//
// Three rules the whole module is built on:
//
//  1. **Casing is decided by the deck, not by this module.** There is no
//     `toLowerCase()` here. Lowercasing `JLPT` to `jlpt` is a taste, and a
//     recipe that imposes one would rewrite a deck the user had already made
//     consistent. The canonical spelling of each path segment is the spelling
//     that segment *already has most often*, counted over the whole draft.
//  2. **The census is draft-wide; the write is selection-scoped.** Counting only
//     the selection would let the same tag normalise to `N5` in one run and
//     `n5` in the next, depending on which notes happened to be filtered.
//  3. **A tag is a path.** Anki nests tags on `::` exactly as it nests decks,
//     so every op works on segments, and unifying `JLPT` fixes `JLPT::N4` and
//     `JLPT::N5` together instead of one at a time.
//
// Not done here, on purpose: renaming or merging *decks*. Deck paths are the
// other half of recipe 12 and are collection-level, not selection-level — a
// tray action that silently moved cards between decks because two deck names
// differed in case would be a far larger blast radius than its name suggests.

/** One normalisation. Each is the smallest thing a user could mean by its name. */
export type TagNormalizeOp =
  /**
   * Structural repair of the `::` path: empty segments dropped (`a::::b` → `a::b`),
   * leading and trailing separators removed (`::a::` → `a`), and each segment's
   * own surrounding whitespace trimmed. Nothing here can change which concept a
   * tag names, which is why it is the one op that is safe to run blind.
   */
  | 'trim-separators'
  /**
   * Fold fullwidth ASCII to halfwidth per segment, so `ＪＬＰＴ` and `JLPT` are
   * the same tag. Kana and kanji are untouched — halfwidth katakana is a
   * different normalisation and is not folded here.
   */
  | 'ascii-width'
  /**
   * Unify case-variant spellings of a segment to the draft's most common one.
   * Ties break toward the spelling seen first, so the result is deterministic
   * for a given draft rather than dependent on Map iteration luck.
   */
  | 'unify-case'
  /**
   * Drop a tag that is a strict ancestor of another tag on the same note:
   * `JLPT` beside `JLPT::N5` adds nothing, because Anki's sidebar already shows
   * the parent. Removes the tag from the note; it never touches the child.
   */
  | 'drop-redundant-parents';

/**
 * The order the ops run in regardless of the order they were listed — same rule
 * `TEXT_NORMALIZE_ORDER` states, and forced by the same kind of dependency:
 * the case census cannot see that `ＪＬＰＴ` and `jlpt` are the same segment
 * until widths are folded, and neither can see past a `::a::`'s empty segments.
 */
export const TAG_NORMALIZE_ORDER: readonly TagNormalizeOp[] = [
  'trim-separators',
  'ascii-width',
  'unify-case',
  'drop-redundant-parents',
];

export const TAG_PATH_SEPARATOR = '::';

function foldAsciiWidth(s: string): string {
  return s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** Split on `::`, dropping empty segments and trimming each one. */
function splitPath(tag: string): string[] {
  const out: string[] = [];
  for (const raw of tag.split(TAG_PATH_SEPARATOR)) {
    const seg = raw.trim();
    if (seg !== '') out.push(seg);
  }
  return out;
}

/**
 * The canonical spelling of every path prefix present in the draft, keyed by the
 * prefix lowercased. Built once per plan and reused for every note, which is
 * what makes rule 2 above true.
 *
 * Keyed by *prefix*, not by segment: `Anime::Core` and `Grammar::core` are two
 * different `core`s and unifying them would be this module deciding that two
 * unrelated subtrees share a name.
 */
export function buildTagCaseCensus(allTags: Iterable<readonly string[]>): Map<string, string> {
  // key -> spelling -> count, plus the order spellings were first seen.
  const counts = new Map<string, Map<string, number>>();
  for (const tags of allTags) {
    for (const tag of tags) {
      const segs = splitPath(foldAsciiWidth(tag));
      const prefix: string[] = [];
      for (const seg of segs) {
        prefix.push(seg);
        const key = prefix.join(TAG_PATH_SEPARATOR).toLowerCase();
        let bySpelling = counts.get(key);
        if (!bySpelling) {
          bySpelling = new Map();
          counts.set(key, bySpelling);
        }
        bySpelling.set(seg, (bySpelling.get(seg) ?? 0) + 1);
      }
    }
  }
  const canonical = new Map<string, string>();
  for (const [key, bySpelling] of counts) {
    let best = '';
    let bestCount = -1;
    // Map preserves insertion order, so the first-seen spelling wins a tie.
    for (const [spelling, count] of bySpelling) {
      if (count > bestCount) {
        best = spelling;
        bestCount = count;
      }
    }
    canonical.set(key, best);
  }
  return canonical;
}

function applyOpsToTag(
  tag: string,
  ops: ReadonlySet<TagNormalizeOp>,
  census: Map<string, string>,
): string {
  let segs = tag.split(TAG_PATH_SEPARATOR);
  if (ops.has('trim-separators')) segs = splitPath(tag);
  if (ops.has('ascii-width')) segs = segs.map(foldAsciiWidth);
  if (ops.has('unify-case')) {
    const prefix: string[] = [];
    segs = segs.map((seg) => {
      prefix.push(seg);
      const key = prefix.join(TAG_PATH_SEPARATOR).toLowerCase();
      const canon = census.get(key);
      if (canon === undefined) return seg;
      // Keep the prefix on the canonical spelling, or a deeper segment would be
      // looked up under a key the census never recorded.
      prefix[prefix.length - 1] = canon;
      return canon;
    });
  }
  return segs.join(TAG_PATH_SEPARATOR);
}

/** What happened to one note's tag list. */
export interface TagNormalizeChange {
  noteId: string;
  before: string[];
  after: string[];
  /** Tags that changed spelling, as `before -> after` pairs. */
  renamed: Array<{ from: string; to: string }>;
  /**
   * Tags the note lost outright: a redundant parent, or a variant that
   * normalised onto a spelling the note already carried. The note keeps the
   * concept in both cases — nothing here removes a tag the note is the only
   * holder of.
   */
  removed: string[];
}

export interface TagNormalizePlan {
  changes: TagNormalizeChange[];
  /** Notes whose tag list is byte-identical afterwards. */
  unchanged: number;
  /** Distinct tag strings across the *selection*, before and after. */
  distinctBefore: number;
  distinctAfter: number;
  /** Sum over notes; a tag renamed on 40 notes counts 40. */
  renamedTags: number;
  removedTags: number;
}

export interface PlanTagNormalizeInput {
  /** The notes to write, in selection order. */
  notes: ReadonlyArray<{ id: string; tags: readonly string[] }>;
  /** Every note in the draft, for the case census. Pass `notes` to scope it. */
  censusTags: Iterable<readonly string[]>;
  ops: readonly TagNormalizeOp[];
}

export function planTagNormalize(input: PlanTagNormalizeInput): TagNormalizePlan {
  const ops = new Set(TAG_NORMALIZE_ORDER.filter((op) => input.ops.includes(op)));
  const census = ops.has('unify-case') ? buildTagCaseCensus(input.censusTags) : new Map<string, string>();
  const changes: TagNormalizeChange[] = [];
  const distinctBefore = new Set<string>();
  const distinctAfter = new Set<string>();
  let unchanged = 0;
  let renamedTags = 0;
  let removedTags = 0;

  for (const note of input.notes) {
    const before = [...note.tags];
    for (const tag of before) distinctBefore.add(tag);
    const renamed: TagNormalizeChange['renamed'] = [];
    const removed: string[] = [];
    const after: string[] = [];
    const mapped: string[] = [];

    for (const tag of before) {
      const next = applyOpsToTag(tag, ops, census);
      mapped.push(next);
      if (next === '') {
        // A tag that was nothing but separators. It named no concept, so this is
        // a removal and not a rename onto the empty string.
        removed.push(tag);
        continue;
      }
      if (next !== tag) renamed.push({ from: tag, to: next });
      if (after.includes(next)) {
        // Two spellings collapsed onto one. The note keeps the concept; the
        // duplicate is what goes, and it is counted as a removal so the surface
        // can say "12 merged" rather than pretend nothing was lost.
        removed.push(tag);
        continue;
      }
      after.push(next);
    }

    if (ops.has('drop-redundant-parents')) {
      const kept: string[] = [];
      for (const tag of after) {
        const isAncestor = after.some((other) => other !== tag && other.startsWith(`${tag}${TAG_PATH_SEPARATOR}`));
        if (isAncestor) removed.push(tag);
        else kept.push(tag);
      }
      after.length = 0;
      after.push(...kept);
    }

    for (const tag of after) distinctAfter.add(tag);
    const same = after.length === before.length && after.every((tag, i) => tag === before[i]);
    if (same) {
      unchanged += 1;
      continue;
    }
    renamedTags += renamed.length;
    removedTags += removed.length;
    changes.push({ noteId: note.id, before, after, renamed, removed });
  }

  return {
    changes,
    unchanged,
    distinctBefore: distinctBefore.size,
    distinctAfter: distinctAfter.size,
    renamedTags,
    removedTags,
  };
}
