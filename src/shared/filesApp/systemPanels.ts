/**
 * Gate 8's routing table: which Files-app panel owns each card that used to
 * live on the Settings "Memory" page.
 *
 * The gate's own words: *"Settings no longer carries them, and every search
 * entry that pointed at `pageId: 'memory'` resolves to the Files app — a search
 * hit landing on a page that no longer holds the row is a FAIL."* Two halves,
 * and this module is the second one. Removing the page is easy; keeping every
 * search hit landing on its own row is the part that silently rots.
 *
 * **The card ids are the OLD settings registry ids, unchanged.** `system-memory`,
 * `storage-usage`, `storage-inventory`, `agent-memory`, `agent-history`,
 * `backup`, `clear-data` and `factory-reset` were already the anchors Settings
 * scrolled to (`data-setting-id`), so reusing them means the redirect needs no
 * translation table and a stale link keeps working. `memory` is the old PAGE id
 * and is mapped too: it was the catch-all entry, and a hit carrying it must land
 * somewhere real rather than nowhere.
 *
 * `filesAppSystemPanels.test.ts` pins this table against the registry snapshot
 * and against the cards the panels actually render, so a card renamed on one
 * side and not the other fails rather than silently misrouting.
 */
import type { FilesPanelCategoryId } from './catalog';

export interface FilesSystemPanelCard {
  /** The anchor. Identical to the old `SettingsRegistryEntry.id`. */
  cardId: string;
  /** The Files-app leaf whose panel renders it. */
  categoryId: FilesPanelCategoryId;
}

/**
 * Every card the Memory page carried, plus the page id itself.
 *
 * Nine rows because the old registry had exactly nine entries at
 * `pageId: 'memory'` — eight cards and the page-level `memory` entry. The count
 * is asserted in the test rather than left as a comment, because "we moved them
 * all" is precisely the claim a migration gets wrong.
 */
export const FILES_SYSTEM_PANEL_CARDS: readonly FilesSystemPanelCard[] = [
  { cardId: 'memory', categoryId: 'system/memory' },
  { cardId: 'system-memory', categoryId: 'system/memory' },
  { cardId: 'storage-usage', categoryId: 'system/memory' },
  { cardId: 'storage-inventory', categoryId: 'system/memory' },
  { cardId: 'agent-memory', categoryId: 'system/memory' },
  { cardId: 'agent-history', categoryId: 'system/memory' },
  { cardId: 'backup', categoryId: 'system/memory' },
  { cardId: 'clear-data', categoryId: 'system/memory' },
  { cardId: 'factory-reset', categoryId: 'system/memory' },
  { cardId: 'statistics-overview', categoryId: 'system/statistics' },
  { cardId: 'statistics-recent', categoryId: 'system/statistics' },
  { cardId: 'statistics-knowledge', categoryId: 'system/statistics' },
  { cardId: 'statistics-books', categoryId: 'system/statistics' },
  { cardId: 'statistics-shows', categoryId: 'system/statistics' },
];

const BY_CARD = new Map(FILES_SYSTEM_PANEL_CARDS.map((row) => [row.cardId, row.categoryId]));

/**
 * The leaf that renders a card, or null when nothing does.
 *
 * Null is a real answer and callers must treat it as one: a settings entry that
 * is NOT one of these still belongs to Settings, and rerouting it into the Files
 * app would be the same misroute in the opposite direction.
 */
export function filesPanelForCard(cardId: string): FilesPanelCategoryId | null {
  return BY_CARD.get(cardId) ?? null;
}

/** The card ids one panel renders, in render order. */
export function cardsForFilesPanel(categoryId: FilesPanelCategoryId): string[] {
  return FILES_SYSTEM_PANEL_CARDS.filter((row) => row.categoryId === categoryId).map(
    (row) => row.cardId,
  );
}
