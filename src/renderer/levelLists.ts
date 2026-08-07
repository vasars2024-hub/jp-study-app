// User-defined "level lists" for JLPT / HSK / custom vocabulary progress.
//
// Instead of shipping word lists, the user pastes an Anki deck's words (e.g. an
// "N1 deck") and labels it. Each pasted word is reduced to its lemma the same
// way ankiSync folds Anki expressions, so it lines up with the knowledge store
// (knownWords). "Progress" for a list = words at level Familiar-or-better (>=2),
// which is exactly what the Anki sync maintains. IndexedDB is authoritative,
// while localStorage provides the synchronous startup cache.

import { getLevel } from './knownWords';
import type { LevelSlotId } from '../shared/levelScale';
import { tokenizeSync, tokenizerReady } from './tokenizer';
import { kvGet, kvSet } from './storage/db';
import { IDB_KEYS } from './storage/storage';

export type LevelKind = 'jlpt' | 'hsk' | 'custom';

export interface LevelList {
  id: string;
  label: string;
  kind: LevelKind;
  /**
   * Which fixed Level-page slot this list fills (e.g. 'jlpt-n5'). Absent for
   * free-form custom lists. At most one list per slot.
   */
  slot?: LevelSlotId;
  /** Raw expressions as pasted (trimmed + de-duplicated). */
  words: string[];
}

export interface LevelProgress {
  total: number;
  learned: number;
  pct: number;
}

const KEY = 'jp-level-lists';
const STORE_VERSION = 1;
export const LEVEL_LISTS_EVENT = 'level-lists-changed';
interface LevelListStore {
  version: typeof STORE_VERSION;
  updatedAt: number;
  lists: LevelList[];
}

let cache: LevelListStore | null = null;
let pendingPersistence: Promise<void> = Promise.resolve();
let persistenceError: unknown = null;

/** Reduce a pasted expression to its lemma so it matches knownWords keys. */
/**
 * v1.0 audit 5.1 — memoised because this is the hot path of the whole level
 * system. `listProgress` calls it once per word, `slotCoverage` runs it for
 * every slot list, and `getLevelReport` used to do all of that twice; the
 * tokenizer is not cheap and the total measured **3.7 s of blocked main thread**
 * on every visit to Settings > Profile & dictionary.
 *
 * Lemmatisation of a given string is deterministic *once the tokenizer is
 * loaded*, so the fallback path is deliberately NOT cached — caching `expr`
 * while `tokenizerReady()` is false would pin the un-lemmatised answer forever.
 */
const lemmaCache = new Map<string, string>();

function toLemma(expr: string): string {
  if (!tokenizerReady()) return expr;
  const hit = lemmaCache.get(expr);
  if (hit !== undefined) return hit;
  let out: string;
  try {
    const toks = tokenizeSync(expr);
    const content = toks.find((t) => t.content) ?? toks[0];
    out = content?.lemma || expr;
  } catch {
    out = expr;
  }
  lemmaCache.set(expr, out);
  return out;
}

/**
 * Parse a pasted blob into a word list. One entry per line; the word is the
 * first tab/comma-separated cell (so "食べる\tたべる\tto eat" or CSV rows work),
 * then its first whitespace token. De-duplicates, preserves order.
 */
export function parseWords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cell = line.split(/[\t,;]/)[0].trim();
    const w = cell.split(/\s+/)[0];
    if (w && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

function normalizeLists(value: unknown): LevelList[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Partial<LevelList>;
    if (typeof raw.id !== 'string' || !raw.id.trim() || !Array.isArray(raw.words)) return [];
    const kind: LevelKind = raw.kind === 'hsk' || raw.kind === 'custom' ? raw.kind : 'jlpt';
    const words = raw.words
      .filter((word): word is string => typeof word === 'string')
      .map((word) => word.trim())
      .filter(Boolean);
    return [{
      id: raw.id.trim(),
      label: typeof raw.label === 'string' ? raw.label.trim() : raw.id.trim(),
      kind,
      ...(typeof raw.slot === 'string' ? { slot: raw.slot as LevelSlotId } : {}),
      words: [...new Set(words)],
    }];
  });
}

function readLocalStore(): LevelListStore | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { version: STORE_VERSION, updatedAt: 0, lists: normalizeLists(parsed) };
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const stored = parsed as Partial<LevelListStore>;
    return {
      version: STORE_VERSION,
      updatedAt: typeof stored.updatedAt === 'number' && Number.isFinite(stored.updatedAt)
        ? stored.updatedAt
        : 0,
      lists: normalizeLists(stored.lists),
    };
  } catch {
    return null;
  }
}

export function loadLevelLists(): LevelList[] {
  if (!cache) cache = readLocalStore() ?? { version: STORE_VERSION, updatedAt: 0, lists: [] };
  return cache.lists;
}

function writeLocal(store: LevelListStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Large imported decks may exceed the synchronous cache quota. IndexedDB
    // below remains authoritative and the module cache keeps this window live.
  }
}

function persist(lists: LevelList[]): void {
  const store: LevelListStore = {
    version: STORE_VERSION,
    updatedAt: Date.now(),
    lists: normalizeLists(lists),
  };
  cache = store;
  writeLocal(store);
  persistenceError = null;
  pendingPersistence = kvSet(IDB_KEYS.levelLists, store).catch((error) => {
    persistenceError = error;
    console.error('[level-lists] durable write failed:', error);
  });
  window.dispatchEvent(new CustomEvent(LEVEL_LISTS_EVENT));
}

/** Await the most recent IndexedDB write before reporting a successful import. */
export async function flushLevelListsPersistence(): Promise<void> {
  await pendingPersistence;
  if (persistenceError) throw persistenceError;
}

/** Reconcile the synchronous cache with the durable store during app boot. */
export async function restoreLevelListsFromIdb(): Promise<LevelList[]> {
  const local = readLocalStore();
  let durable: LevelListStore | null = null;
  try {
    const raw = await kvGet<unknown>(IDB_KEYS.levelLists);
    if (raw && typeof raw === 'object') {
      const stored = raw as Partial<LevelListStore>;
      durable = {
        version: STORE_VERSION,
        updatedAt: typeof stored.updatedAt === 'number' && Number.isFinite(stored.updatedAt)
          ? stored.updatedAt
          : 0,
        lists: normalizeLists(stored.lists ?? (Array.isArray(raw) ? raw : [])),
      };
    } else if (Array.isArray(raw)) {
      durable = { version: STORE_VERSION, updatedAt: 0, lists: normalizeLists(raw) };
    }
  } catch {
    /* IndexedDB unavailable — retain the local cache. */
  }
  const winner = durable && (!local || durable.updatedAt >= local.updatedAt)
    ? durable
    : local ?? durable ?? { version: STORE_VERSION, updatedAt: 0, lists: [] };
  cache = winner;
  writeLocal(winner);
  if (!durable || winner.updatedAt > durable.updatedAt) {
    persistenceError = null;
    pendingPersistence = kvSet(IDB_KEYS.levelLists, winner).catch((error) => {
      persistenceError = error;
      console.error('[level-lists] durable restore write failed:', error);
    });
    await pendingPersistence;
  }
  window.dispatchEvent(new CustomEvent(LEVEL_LISTS_EVENT));
  return winner.lists;
}

export function addLevelList(label: string, kind: LevelKind, rawWords: string): LevelList[] {
  const words = parseWords(rawWords);
  const trimmed = label.trim() || (kind === 'jlpt' ? 'JLPT' : kind === 'hsk' ? 'HSK' : 'List');
  const lists = loadLevelLists();
  const next: LevelList = { id: `ll-${Date.now().toString(36)}`, label: trimmed, kind, words };
  const updated = [...lists, next];
  persist(updated);
  return updated;
}

export function removeLevelList(id: string): LevelList[] {
  const updated = loadLevelLists().filter((l) => l.id !== id);
  persist(updated);
  return updated;
}

/**
 * Create or replace the single list bound to a fixed slot (JLPT/HSK), storing a
 * pre-built, already-lemmatized+deduplicated word array (from an .apkg import or
 * a paste). Any existing list for the same slot is replaced.
 */
export function upsertSlotList(
  slot: LevelSlotId,
  label: string,
  kind: LevelKind,
  words: string[],
): LevelList[] {
  const seen = new Set<string>();
  const cleaned = words.map((w) => w.trim()).filter((w) => w && !seen.has(w) && seen.add(w));
  const existing = loadLevelLists();
  const prev = existing.find((l) => l.slot === slot);
  const next: LevelList = {
    id: prev?.id ?? `ll-${slot}`,
    label: label.trim() || slot,
    kind,
    slot,
    words: cleaned,
  };
  const updated = prev
    ? existing.map((l) => (l.slot === slot ? next : l))
    : [...existing, next];
  persist(updated);
  return updated;
}

/** The list bound to a slot, if any. */
export function getSlotList(slot: LevelSlotId): LevelList | undefined {
  return loadLevelLists().find((l) => l.slot === slot);
}

export function updateLevelListWords(id: string, rawWords: string): LevelList[] {
  const words = parseWords(rawWords);
  const updated = loadLevelLists().map((l) => (l.id === id ? { ...l, words } : l));
  persist(updated);
  return updated;
}

/** Familiar-or-better coverage of a list, using the Anki-synced knowledge. */
export function listProgress(list: LevelList): LevelProgress {
  let learned = 0;
  for (const w of list.words) {
    if (getLevel(toLemma(w)) >= 2) learned += 1;
  }
  const total = list.words.length;
  return { total, learned, pct: total > 0 ? (learned / total) * 100 : 0 };
}

/** Subscribe to list changes (create/delete/edit). Returns an unsubscribe fn. */
export function onLevelListsChanged(cb: () => void): () => void {
  const h = (): void => cb();
  window.addEventListener(LEVEL_LISTS_EVENT, h);
  window.addEventListener('storage', h);
  return () => {
    window.removeEventListener(LEVEL_LISTS_EVENT, h);
    window.removeEventListener('storage', h);
  };
}
