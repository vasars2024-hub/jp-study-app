/**
 * Persistence for the immersion browser's study layer (7.5): the per-site,
 * per-day stats, today's "new words met", the reading list and its offline
 * snapshots. All in the IndexedDB kv store (not localStorage, which this app has
 * filled before): snapshots are article-sized, and every write here is a
 * read-modify-write in one transaction, so two windows never drop each other's
 * minutes.
 */
import { kvDelete, kvGet, kvSet, kvUpdate } from './storage/db';
import { immersionDayKey, immersionHostOf } from '../shared/immersion';
import {
  imm5AddReadingItem,
  imm5ApplySiteDay,
  imm5ExportReadingList,
  imm5ForgetSnapshot,
  imm5MarkReadingItem,
  imm5MergeReadingLists,
  imm5ParseReadingListImport,
  imm5VerifySnapshot,
  imm5NewWordsMet,
  imm5PruneSiteDays,
  imm5RemoveReadingItem,
  imm5SanitizeReadingList,
  imm5SanitizeSiteDayLog,
  type Imm5MetWords,
  type Imm5ReadingItem,
  type Imm5SiteDayDelta,
  type Imm5SiteDayLog,
} from '../shared/immersionStudy5';

const SITE_DAY_KEY = 'imm5:siteDays';
const MET_KEY = 'imm5:metWords';
const READING_LIST_KEY = 'imm5:readingList';
const SNAPSHOT_PREFIX = 'imm5:snapshot:';

type Listener = () => void;
const listeners = new Set<Listener>();

let siteDays: Imm5SiteDayLog = {};
let readingList: Imm5ReadingItem[] = [];
let loaded: Promise<void> | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

export function onImm5Changed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Load once per window; later calls share the same promise. */
export function loadImm5Store(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const [days, list] = await Promise.all([kvGet<unknown>(SITE_DAY_KEY), kvGet<unknown>(READING_LIST_KEY)]);
        siteDays = imm5SanitizeSiteDayLog(days);
        readingList = imm5SanitizeReadingList(list);
      } catch {
        /* no IndexedDB (tests, a broken profile): start empty, writes will retry */
      }
      emit();
    })();
  }
  return loaded;
}

export function imm5SiteDays(): Imm5SiteDayLog {
  return siteDays;
}

export function imm5ReadingList(): Imm5ReadingItem[] {
  return readingList;
}

/** Bank a delta onto the page's host for today. */
export async function imm5RecordSiteDay(url: string, delta: Imm5SiteDayDelta, now = Date.now()): Promise<void> {
  const host = immersionHostOf(url);
  if (!host) return;
  const day = immersionDayKey(new Date(now));
  // Optimistic in memory, so the stats card moves at once.
  siteDays = imm5ApplySiteDay(siteDays, day, host, delta);
  emit();
  try {
    const stored = await kvUpdate(SITE_DAY_KEY, (current) =>
      imm5PruneSiteDays(imm5ApplySiteDay(imm5SanitizeSiteDayLog(current), day, host, delta), now));
    siteDays = imm5SanitizeSiteDayLog(stored);
    emit();
  } catch {
    /* kept in memory for this session */
  }
}

/**
 * Count the level-0 words on a page that were not met yet today, and bank them
 * as "new words met" on its host. Returns how many were new.
 */
export async function imm5NoteWordsMet(
  url: string,
  lemmas: Iterable<string>,
  levelOf: (lemma: string) => number,
  now = Date.now(),
): Promise<number> {
  const today = immersionDayKey(new Date(now));
  const list = [...lemmas];
  let fresh = 0;
  try {
    await kvUpdate(MET_KEY, (current) => {
      const met = current && typeof current === 'object' ? current as Imm5MetWords : null;
      const result = imm5NewWordsMet(list, levelOf, met, today);
      fresh = result.fresh.length;
      return result.met;
    });
  } catch {
    const result = imm5NewWordsMet(list, levelOf, null, today);
    fresh = result.fresh.length;
  }
  if (fresh > 0) await imm5RecordSiteDay(url, { newWords: fresh }, now);
  return fresh;
}

export async function imm5SaveForLater(input: { url: string; title: string; snapshotHtml?: string }): Promise<Imm5ReadingItem> {
  await loadImm5Store();
  const next = imm5AddReadingItem(readingList, input, Date.now());
  readingList = next.list;
  emit();
  let item = next.item;
  if (next.snapshotHtml) {
    try {
      await kvSet(`${SNAPSHOT_PREFIX}${item.id}`, next.snapshotHtml);
    } catch {
      // The copy did not land: the item must not claim one. (It used to keep
      // saying "Offline copy" and then open nothing.)
      readingList = imm5ForgetSnapshot(readingList, item.id);
      item = readingList.find((entry) => entry.id === item.id) ?? item;
      emit();
    }
  }
  try {
    await kvSet(READING_LIST_KEY, readingList);
  } catch {
    /* in memory for this session */
  }
  return item;
}

export type Imm5OfflineOpen = { status: 'ok'; html: string } | { status: 'missing' | 'damaged' };

/**
 * The offline copy, checked against the checksum it was saved with. A missing
 * copy is forgotten (the item stops offering one); a damaged one is reported
 * and left for the user to re-save.
 */
export async function imm5OpenSnapshot(item: Imm5ReadingItem): Promise<Imm5OfflineOpen> {
  const html = await imm5Snapshot(item.id);
  const status = imm5VerifySnapshot(item, html);
  if (status === 'ok' && html) return { status, html };
  if (status === 'missing' && item.snapshotChars > 0) {
    readingList = imm5ForgetSnapshot(readingList, item.id);
    emit();
    try {
      await kvSet(READING_LIST_KEY, readingList);
    } catch {
      /* in memory for this session */
    }
  }
  return { status: status === 'ok' ? 'missing' : status };
}

/** The list and every offline copy that still verifies, as one JSON document. */
export async function imm5ExportReadingListJson(now = Date.now()): Promise<string> {
  await loadImm5Store();
  const snapshots: Record<string, string> = {};
  for (const item of readingList) {
    if (item.snapshotChars <= 0) continue;
    const html = await imm5Snapshot(item.id);
    if (html) snapshots[item.id] = html;
  }
  return imm5ExportReadingList(readingList, snapshots, now);
}

/** Merge a reading list file into this one. Null when the file held nothing usable. */
export async function imm5ImportReadingList(text: string, now = Date.now()): Promise<{ added: number; updated: number } | null> {
  await loadImm5Store();
  const parsed = imm5ParseReadingListImport(text, now);
  if (!parsed) return null;
  const merged = imm5MergeReadingLists(readingList, parsed.items, parsed.snapshots);
  let list = merged.list;
  for (const id of merged.snapshotIds) {
    try {
      await kvSet(`${SNAPSHOT_PREFIX}${id}`, parsed.snapshots[id]);
    } catch {
      list = imm5ForgetSnapshot(list, id);
    }
  }
  readingList = list;
  emit();
  try {
    await kvSet(READING_LIST_KEY, readingList);
  } catch {
    /* in memory for this session */
  }
  return { added: merged.added, updated: merged.updated };
}

export async function imm5RemoveFromReadingList(id: string): Promise<void> {
  readingList = imm5RemoveReadingItem(readingList, id);
  emit();
  try {
    await kvDelete(`${SNAPSHOT_PREFIX}${id}`);
    await kvSet(READING_LIST_KEY, readingList);
  } catch {
    /* in memory for this session */
  }
}

export async function imm5MarkRead(id: string, read: boolean): Promise<void> {
  readingList = imm5MarkReadingItem(readingList, id, read, Date.now());
  emit();
  try {
    await kvSet(READING_LIST_KEY, readingList);
  } catch {
    /* in memory for this session */
  }
}

export async function imm5Snapshot(id: string): Promise<string | null> {
  try {
    const html = await kvGet<unknown>(`${SNAPSHOT_PREFIX}${id}`);
    return typeof html === 'string' ? html : null;
  } catch {
    return null;
  }
}

/** Test seam. */
export function __resetImm5StoreForTests(): void {
  siteDays = {};
  readingList = [];
  loaded = null;
  listeners.clear();
}
