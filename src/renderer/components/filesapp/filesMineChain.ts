/**
 * The one-click mine chain, in ONE place.
 *
 * MINING gate 10 puts the catalogue on the Flashcards Mining surface as well as
 * in the Files app. Two call sites, one chain: main reads the file into
 * passages, `shared/filesApp/mining` turns passages into drafts, and the
 * renderer — the only owner of the deck — writes them. A second copy of this
 * walk is exactly how the two surfaces would drift into mining the same file to
 * different results, so the second surface imports this rather than repeating
 * it.
 *
 * No card is invented here that the source did not carry.
 */
import type { FilesItem } from '../../../shared/filesApp/catalog';
import { isMachineDerived } from '../../../shared/filesApp/catalog';
import {
  buildFilesMineDrafts,
  existingDeckKeys,
  mineabilityOf,
} from '../../../shared/filesApp/mining';
import { addDeckCardsTracked, loadDeck, removeDeckCards } from '../../flashcardDeck';

/**
 * The one-click mine's outcome, as a state rather than a string.
 *
 * A refusal and a zero-card success are DIFFERENT states and the plan calls
 * conflating them a finding, so `refused` carries a reason key while `done`
 * carries the four counts. Both render; neither is silent.
 */
export type MineState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'refused'; reasonKey: string; detail?: string; values?: Record<string, number> }
  | {
      status: 'done';
      added: number;
      passagesRead: number;
      skippedNotJapanese: number;
      skippedDuplicate: number;
      skippedOverCap: number;
      machineDerived: boolean;
      addedIds: string[];
    }
  | { status: 'undone'; count: number };

export type SettledMineState = Extract<MineState, { status: 'done' | 'refused' }>;

/** Gate 3, the whole round trip. */
export async function mineFilesItem(item: FilesItem): Promise<SettledMineState> {
  const mineable = mineabilityOf(item);
  if (!mineable.mineable) {
    return { status: 'refused', reasonKey: mineable.reasonKey };
  }
  const kind = item.kind as 'transcript' | 'subtitle' | 'book';
  let read;
  try {
    read = await window.api?.filesMineSource?.(item.location, kind);
  } catch (error) {
    return {
      status: 'refused',
      reasonKey: 'filesApp.mine.refuse.unreadable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  if (!read) {
    return { status: 'refused', reasonKey: 'filesApp.mine.refuse.unreadable' };
  }
  if (!read.ok) {
    return { status: 'refused', reasonKey: read.reasonKey, detail: read.detail };
  }
  const plan = buildFilesMineDrafts(item, read.passages, {
    existingWords: existingDeckKeys(loadDeck().map((card) => card.sentence || card.word)),
  });
  if (plan.drafts.length === 0) {
    // Two different empty results, told apart rather than merged: nothing was
    // Japanese, or everything was already mined. They need opposite actions.
    return {
      status: 'refused',
      reasonKey:
        plan.skippedDuplicate > 0
          ? 'filesApp.mine.refuse.allDuplicates'
          : 'filesApp.mine.refuse.noJapanese',
      values: { read: plan.passagesRead },
    };
  }
  let created;
  try {
    created = addDeckCardsTracked(plan.drafts);
  } catch (error) {
    return {
      status: 'refused',
      reasonKey: 'filesApp.mine.refuse.writeFailed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    status: 'done',
    added: created.length,
    passagesRead: plan.passagesRead,
    skippedNotJapanese: plan.skippedNotJapanese,
    skippedDuplicate: plan.skippedDuplicate,
    skippedOverCap: plan.skippedOverCap,
    machineDerived: isMachineDerived(item.provenance),
    addedIds: created.map((card) => card.id),
  };
}

/**
 * Undo is part of the chain, not of one surface: a mine that cannot be reversed
 * from the surface that ran it is the plan's own "reversible UI actions" rule
 * broken, and both surfaces must undo the same way.
 */
export function undoMinedCards(ids: readonly string[]): number {
  removeDeckCards([...ids]);
  return ids.length;
}
