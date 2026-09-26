/**
 * Renderer enrich pass for Library levels.
 * - Inbox articles: knownRatio / levelEstimate from their textSample (Phase 9).
 * - File-imported EPUBs: the same L1–L7 path from a book text sample → levelMeta.
 *
 * Progressive and off the UI thread. The Library used to await this whole pass
 * before showing its list — tokenizing a 40k-character sample of every book with
 * kuromoji on the UI thread, one after another, which left the shelf blank for
 * 30–50 s. Now the list renders at once and scores arrive in batches: each book's
 * word profile is built in a worker and cached per file (`bookProfiles.ts`), so
 * it is computed once, and scoring it is cheap.
 */

import type { LibraryItem } from '../shared/types';
import { levelFromKnownRatio } from '../shared/inboxMeta';
import { getStudyLang } from './studyEnvironment';
import { bookProfileEntry, flushBookProfiles, prefetchBookFileKeys, scoreProfile } from './bookProfiles';

/** Whether `item` still needs a Library level. */
export function needsLevelEnrich(item: LibraryItem): boolean {
  if (item.inboxMeta) return item.inboxMeta.levelEstimate == null && Boolean(item.inboxMeta.textSample?.trim() || item.title);
  if (item.kind !== 'book') return false;
  if (item.levelMeta?.levelEstimate != null) return false;
  return !item.epubFile?.toLowerCase().endsWith('.pdf');
}

/** The level patch for one item, or null when its sample has no scorable words. */
export async function enrichLibraryItem(item: LibraryItem): Promise<LibraryItem | null> {
  if (!needsLevelEnrich(item)) return null;
  const entry = await bookProfileEntry(item, getStudyLang());
  if (!entry) return null;
  const score = scoreProfile(entry.profile);
  if (score.totalWords <= 0) return null;
  const knownRatio = score.knownRatio;
  const levelEstimate = levelFromKnownRatio(knownRatio);
  if (item.inboxMeta) return { ...item, inboxMeta: { ...item.inboxMeta, knownRatio, levelEstimate } };
  return { ...item, levelMeta: { lang: entry.detected, knownRatio, levelEstimate } };
}

export interface LibraryEnrichOptions {
  /** Set `cancelled` to stop between books (the Library closed or reloaded its list). */
  signal?: { cancelled: boolean };
  /** Deliver scored items this often (ms) rather than one render per book. */
  batchMs?: number;
}

/**
 * Score every item that needs it, in the background, and hand the scored items
 * to `onScored` in batches. Persists them too: Inbox articles through
 * `updateInboxMeta`, books through one `updateLevelMetaMany` per batch (without
 * a library broadcast — the Library applies the batch itself).
 */
export async function enrichLibraryInBackground(
  items: readonly LibraryItem[],
  onScored: (scored: LibraryItem[]) => void,
  options: LibraryEnrichOptions = {},
): Promise<void> {
  const signal = options.signal ?? { cancelled: false };
  const batchMs = options.batchMs ?? 400;
  const todo = items.filter(needsLevelEnrich);
  if (!todo.length) return;
  await prefetchBookFileKeys(todo);

  let batch: LibraryItem[] = [];
  let batchStarted = Date.now();
  const deliver = async (): Promise<void> => {
    if (!batch.length) return;
    const out = batch;
    batch = [];
    batchStarted = Date.now();
    if (signal.cancelled) return;
    onScored(out);
    const books = out.filter((it) => !it.inboxMeta && it.levelMeta);
    if (books.length) {
      try {
        await window.api.updateLevelMetaMany(
          books.map((it) => ({ id: it.id, levelMeta: it.levelMeta as NonNullable<LibraryItem['levelMeta']> })),
          { broadcast: false },
        );
      } catch {
        /* shown for this session; scored again (from the cached profile) next time */
      }
    }
    for (const it of out) {
      if (!it.inboxMeta) continue;
      try {
        await window.api.updateInboxMeta(it.id, {
          knownRatio: it.inboxMeta.knownRatio,
          levelEstimate: it.inboxMeta.levelEstimate,
        });
      } catch {
        /* as above */
      }
    }
  };

  for (const item of todo) {
    if (signal.cancelled) break;
    let scored: LibraryItem | null = null;
    try {
      scored = await enrichLibraryItem(item);
    } catch {
      scored = null;
    }
    if (scored) batch.push(scored);
    if (Date.now() - batchStarted >= batchMs) await deliver();
  }
  await deliver();
  void flushBookProfiles();
}

/** Replace the items `scored` names in `list`, keeping everything else (and its identity). */
export function mergeScoredItems(list: LibraryItem[], scored: readonly LibraryItem[]): LibraryItem[] {
  if (!scored.length) return list;
  const byId = new Map(scored.map((it) => [it.id, it]));
  let changed = false;
  const next = list.map((it) => {
    const s = byId.get(it.id);
    if (!s) return it;
    changed = true;
    return it.inboxMeta ? { ...it, inboxMeta: s.inboxMeta } : { ...it, levelMeta: s.levelMeta };
  });
  return changed ? next : list;
}
