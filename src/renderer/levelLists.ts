// User-defined "level lists" for JLPT / HSK / custom vocabulary progress.
//
// Instead of shipping word lists, the user pastes an Anki deck's words (e.g. an
// "N1 deck") and labels it. Each pasted word is reduced to its lemma the same
// way ankiSync folds Anki expressions, so it lines up with the knowledge store
// (knownWords). "Progress" for a list = words at level Familiar-or-better (>=2),
// which is exactly what the Anki sync maintains. Persisted to localStorage.

import { getLevel } from './knownWords';
import { tokenizeSync, tokenizerReady } from './tokenizer';

export type LevelKind = 'jlpt' | 'hsk' | 'custom';

export interface LevelList {
  id: string;
  label: string;
  kind: LevelKind;
  /** Raw expressions as pasted (trimmed + de-duplicated). */
  words: string[];
}

export interface LevelProgress {
  total: number;
  learned: number;
  pct: number;
}

const KEY = 'jp-level-lists';
export const LEVEL_LISTS_EVENT = 'level-lists-changed';

/** Reduce a pasted expression to its lemma so it matches knownWords keys. */
function toLemma(expr: string): string {
  if (!tokenizerReady()) return expr;
  try {
    const toks = tokenizeSync(expr);
    const content = toks.find((t) => t.content) ?? toks[0];
    return content?.lemma || expr;
  } catch {
    return expr;
  }
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

export function loadLevelLists(): LevelList[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LevelList[]) : [];
    return Array.isArray(list) ? list.filter((l) => l && Array.isArray(l.words)) : [];
  } catch {
    return [];
  }
}

function persist(lists: LevelList[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lists));
  } catch {
    /* storage full — nothing we can do */
  }
  window.dispatchEvent(new CustomEvent(LEVEL_LISTS_EVENT));
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
