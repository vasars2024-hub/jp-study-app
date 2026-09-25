/**
 * Re-importing a deck file as an UPDATE of the cards it made last time.
 *
 * The old path (`replaceImportedDeck`) deleted the matched group and inserted
 * fresh rows: new ids, no `srs`, no `known`, no Anki link. So opening the same
 * CSV again, or re-dropping the same .apkg, silently reset every review in it.
 *
 * Cards are matched inside one deck id by their front — the word field, which
 * is what the user sees on the card and what a spreadsheet row is "about".
 * A matched card keeps its id and everything the app learned about it, and
 * takes the file's text fields. Unmatched rows become new cards. Cards the file
 * no longer has are removed only when the caller asks (`removeMissing`), which
 * the UI puts behind an explicit, confirmed option.
 */

/** The fields a deck file owns. Everything else on a card belongs to the app. */
export const IMPORTED_TEXT_FIELDS = [
  'word',
  'reading',
  'meaning',
  'sentence',
  'front',
  'back',
  'bookTitle',
] as const;

export interface UpsertableCard {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
  front?: string;
  back?: string;
  bookId?: string;
  bookTitle?: string;
}

export interface DeckUpsertPlan<C extends UpsertableCard, E> {
  /** Existing cards with the file's new text merged in (same id, same review state). */
  updated: C[];
  /** Matched cards whose text is already identical. */
  unchanged: C[];
  /** Entries with no existing card. */
  added: E[];
  /** Group cards the file no longer has. Removed only with `removeMissing`. */
  missing: C[];
  /** Ids of every card in the group before the import. */
  groupIds: Set<string>;
}

/** The match key: the card's front, whitespace-normalised. */
export function deckUpsertKey(card: Pick<UpsertableCard, 'word' | 'front'>): string {
  return (card.word || card.front || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

export interface DeckUpsertGroup {
  bookId: string;
  /**
   * Cards imported under an older id for the same deck — the ASCII-only slug
   * that turned every Japanese title into `import-deck` — matched on the
   * `(legacyBookId, bookTitle)` pair so they are carried over, not duplicated.
   */
  legacy?: { bookId: string; bookTitle: string };
}

export function inDeckGroup(card: UpsertableCard, group: DeckUpsertGroup): boolean {
  if (card.bookId === group.bookId) return true;
  const legacy = group.legacy;
  return (
    !!legacy &&
    legacy.bookId !== group.bookId &&
    card.bookId === legacy.bookId &&
    (card.bookTitle ?? '') === legacy.bookTitle
  );
}

export function planDeckUpsert<C extends UpsertableCard, E extends Omit<UpsertableCard, 'id'>>(
  cards: readonly C[],
  group: DeckUpsertGroup,
  entries: readonly E[],
): DeckUpsertPlan<C, E> {
  const existing = cards.filter((c) => inDeckGroup(c, group));
  // One queue per key, so a file with the same word twice matches two cards
  // in order instead of folding both rows onto the first.
  const byKey = new Map<string, C[]>();
  for (const card of existing) {
    const key = deckUpsertKey(card);
    const list = byKey.get(key);
    if (list) list.push(card);
    else byKey.set(key, [card]);
  }
  const plan: DeckUpsertPlan<C, E> = {
    updated: [],
    unchanged: [],
    added: [],
    missing: [],
    groupIds: new Set(existing.map((c) => c.id)),
  };
  const matched = new Set<string>();
  for (const entry of entries) {
    const queue = byKey.get(deckUpsertKey(entry as UpsertableCard));
    const card = queue?.shift();
    if (!card) {
      plan.added.push(entry);
      continue;
    }
    matched.add(card.id);
    const next = { ...card, bookId: group.bookId } as C;
    let changed = card.bookId !== group.bookId;
    for (const field of IMPORTED_TEXT_FIELDS) {
      const value = (entry as Record<string, unknown>)[field];
      if ((card as Record<string, unknown>)[field] === value) continue;
      if (value === undefined) delete (next as Record<string, unknown>)[field];
      else (next as Record<string, unknown>)[field] = value;
      changed = true;
    }
    if (changed) plan.updated.push(next);
    else plan.unchanged.push(card);
  }
  plan.missing = existing.filter((c) => !matched.has(c.id));
  return plan;
}
