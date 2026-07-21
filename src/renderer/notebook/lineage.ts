import type { Annotation } from '../annotations';
import type { DeckFlashcard } from '../flashcardDeck';
import type { NotebookTimelineEntry } from '../notebookTimeline';
import type { LibraryItem } from '../../shared/types';
import type { JitenPlanEntry } from '../../shared/jiten';

/**
 * Artifact lineage — where a notebook entry came from and what it became.
 *
 * Nothing here invents a link. Every stage is read from a relationship the app
 * already persists:
 *
 *   plan (JitenPlanEntry.importedLibraryItemId)
 *     -> library item (LibraryItem.id)
 *          -> ocr        (LibraryItem.ocrMeta)
 *          -> highlights (Annotation.bookId)
 *          -> cards      (DeckFlashcard.bookId)
 *               -> anki  (DeckFlashcard.ankiExported)
 *
 * An entry with no resolvable book keeps an empty chain rather than a
 * plausible-looking one; a chain that is inferred is worse than no chain.
 */

export type LineageStage = 'plan' | 'library' | 'ocr' | 'highlights' | 'cards' | 'anki';

export interface LineageNode {
  stage: LineageStage;
  /** Title for `plan`/`library`; otherwise undefined and the UI labels by stage. */
  label?: string;
  /** Item count for the aggregate stages (`ocr`, `highlights`, `cards`, `anki`). */
  count?: number;
  href?: string;
}

export interface LineageIndexInput {
  library?: LibraryItem[];
  plan?: JitenPlanEntry[];
  deck?: DeckFlashcard[];
  annotations?: Record<string, Annotation[]>;
}

export interface LineageIndex {
  byBookId: Map<string, LineageNode[]>;
  /** Plan entries that were never imported still get a one-node chain. */
  byPlanId: Map<string, LineageNode[]>;
}

/**
 * Precompute every chain once. Doing this per row would re-scan the deck for
 * each of up to 400 rendered entries.
 */
export function buildLineageIndex(input: LineageIndexInput = {}): LineageIndex {
  const library = input.library ?? [];
  const plan = input.plan ?? [];
  const deck = input.deck ?? [];
  const annotations = input.annotations ?? {};

  const cardsByBook = new Map<string, { total: number; anki: number }>();
  for (const c of deck) {
    if (!c.bookId) continue;
    const cur = cardsByBook.get(c.bookId) ?? { total: 0, anki: 0 };
    cur.total += 1;
    if (c.ankiExported) cur.anki += 1;
    cardsByBook.set(c.bookId, cur);
  }

  // Reverse the plan -> library link so a library item can name its origin.
  const planByImportedId = new Map<string, JitenPlanEntry>();
  for (const p of plan) {
    if (p.importedLibraryItemId) planByImportedId.set(p.importedLibraryItemId, p);
  }

  const byBookId = new Map<string, LineageNode[]>();
  for (const item of library) {
    const chain: LineageNode[] = [];

    const origin = planByImportedId.get(item.id);
    if (origin) {
      chain.push({ stage: 'plan', label: origin.titleJp, href: 'novels' });
    }

    chain.push({ stage: 'library', label: item.title, href: 'library' });

    if (item.ocrMeta && item.ocrMeta.ocrPages > 0) {
      chain.push({ stage: 'ocr', count: item.ocrMeta.ocrPages, href: 'library' });
    }

    const hl = annotations[item.id]?.length ?? 0;
    if (hl > 0) chain.push({ stage: 'highlights', count: hl, href: 'library' });

    const cards = cardsByBook.get(item.id);
    if (cards && cards.total > 0) {
      chain.push({ stage: 'cards', count: cards.total, href: 'flashcards' });
      if (cards.anki > 0) chain.push({ stage: 'anki', count: cards.anki, href: 'flashcards' });
    }

    byBookId.set(item.id, chain);
  }

  const byPlanId = new Map<string, LineageNode[]>();
  for (const p of plan) {
    const imported = p.importedLibraryItemId ? byBookId.get(p.importedLibraryItemId) : undefined;
    // An imported plan entry shares the book's chain (which already opens with
    // the plan node); an un-imported one is a chain of exactly one real stage.
    byPlanId.set(p.id, imported ?? [{ stage: 'plan', label: p.titleJp, href: 'novels' }]);
  }

  return { byBookId, byPlanId };
}

/**
 * The chain for one entry, or `[]` when the entry has no resolvable origin.
 * A single-node chain is also returned as `[]` — a lone "Library: X" node
 * restates the row it is attached to and is not lineage.
 */
export function lineageForEntry(
  entry: NotebookTimelineEntry,
  index: LineageIndex,
): LineageNode[] {
  let chain: LineageNode[] | undefined;

  if (entry.stream === 'plan') {
    const planId = typeof entry.id === 'string' ? entry.id.replace(/^plan-/, '') : '';
    chain = index.byPlanId.get(planId);
  } else {
    const bookId = entry.meta?.bookId;
    if (typeof bookId === 'string') chain = index.byBookId.get(bookId);
  }

  return chain && chain.length > 1 ? chain : [];
}
