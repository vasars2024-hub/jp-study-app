// Per-word knowledge tracking (LingQ / Kalba style). Words are keyed by their
// LEMMA (dictionary form) so 食べた・食べません・食べる all count as one word.
// Levels: 0 = new/unknown (not stored), 1 = learning, 2 = familiar, 3 = known.
// Entries remember whether they were set manually — the Anki auto-sync never
// overwrites a manual choice.
//
// Phase 8: storage is per study language (`jp-word-knowledge-ja` / `-zh`) so
// switching environments never mixes JA and ZH lemmas.

import { getStudyLang, onStudyLangChanged, type StudyLang } from './studyEnvironment';

export const WK_LEVELS = ['New', 'Learning', 'Familiar', 'Known'] as const;
export type WkLevel = 0 | 1 | 2 | 3;

interface Entry {
  l: WkLevel;
  /** 1 = set by hand (Anki sync must not touch it). */
  m?: 1;
}

export const LEGACY_KNOWLEDGE_KEY = 'jp-word-knowledge';

export function knowledgeKey(lang: StudyLang = getStudyLang()): string {
  return `${LEGACY_KNOWLEDGE_KEY}-${lang}`;
}

const EVENT = 'word-knowledge-changed';

let cacheLang: StudyLang | null = null;
let cache: Record<string, Entry> | null = null;
let migrated = false;

function migrateLegacyOnce(): void {
  if (migrated) return;
  migrated = true;
  try {
    const jaKey = knowledgeKey('ja');
    if (localStorage.getItem(jaKey)) return;
    const legacy = localStorage.getItem(LEGACY_KNOWLEDGE_KEY);
    if (!legacy) return;
    localStorage.setItem(jaKey, legacy);
  } catch {
    /* ignore */
  }
}

function db(): Record<string, Entry> {
  migrateLegacyOnce();
  const lang = getStudyLang();
  if (!cache || cacheLang !== lang) {
    cacheLang = lang;
    try {
      cache = JSON.parse(localStorage.getItem(knowledgeKey(lang)) ?? '{}') as Record<string, Entry>;
    } catch {
      cache = {};
    }
  }
  return cache;
}

function persist(): void {
  try {
    localStorage.setItem(knowledgeKey(), JSON.stringify(db()));
  } catch {
    /* storage unavailable */
  }
}

function emit(words: string[]): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: words }));
}

function isKnowledgeStorageKey(key: string | null): boolean {
  if (key === null) return true;
  if (key === LEGACY_KNOWLEDGE_KEY) return true;
  return key === knowledgeKey('ja') || key === knowledgeKey('zh');
}

// Both of these register a listener at IMPORT time, and both reach `window`.
// The Files app's renderer enumerators read this store, and their suite runs in
// vitest's node environment — an unguarded listener there is not a failing
// assertion, it is a module that cannot be imported at all. In a real renderer
// `window` always exists, so the guarded and unguarded behaviour are identical.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (isKnowledgeStorageKey(e.key)) {
      cache = null;
      cacheLang = null;
    }
  });

  onStudyLangChanged(() => {
    cache = null;
    cacheLang = null;
  });
}

export function getLevel(word: string): WkLevel {
  return db()[word]?.l ?? 0;
}

export function setLevel(word: string, level: WkLevel, manual = true): void {
  if (!word) return;
  const d = db();
  if (level === 0 && manual) delete d[word];
  else d[word] = { l: level, ...(manual ? { m: 1 as const } : {}) };
  persist();
  emit([word]);
}

export function cycleLevel(word: string): WkLevel {
  const next = ((getLevel(word) + 1) % 4) as WkLevel;
  setLevel(word, next, true);
  return next;
}

/**
 * Bulk update from an Anki sync: `levels` maps word → inferred level. Words the
 * user set manually are skipped. Returns how many entries changed.
 */
export function bulkSetFromAnki(levels: Record<string, WkLevel>): number {
  const d = db();
  let changed = 0;
  const touched: string[] = [];
  for (const [word, level] of Object.entries(levels)) {
    if (!word || d[word]?.m) continue;
    if (d[word]?.l === level) continue;
    if (level === 0) delete d[word];
    else d[word] = { l: level };
    changed += 1;
    touched.push(word);
  }
  if (changed) {
    persist();
    emit(touched);
  }
  return changed;
}

export function knowledgeCounts(): Record<WkLevel, number> {
  const out: Record<WkLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const e of Object.values(db())) out[e.l] += 1;
  return out;
}

/** Snapshot of lemma → level for Notebook / export (excludes level 0). */
export function listKnownEntries(): Array<{ word: string; level: WkLevel }> {
  return Object.entries(db())
    .filter(([, e]) => e.l > 0)
    .map(([word, e]) => ({ word, level: e.l }));
}

/** Subscribe to knowledge changes, including from other windows (returns unsubscribe). */
export function onKnowledgeChanged(cb: (words: string[]) => void): () => void {
  const h = (e: Event): void => cb((e as CustomEvent<string[]>).detail ?? []);
  const storageHandler = (e: Event): void => {
    const se = e as StorageEvent;
    if (!isKnowledgeStorageKey(se.key)) return;
    cb([]);
  };
  const langHandler = (): void => cb([]);
  window.addEventListener(EVENT, h);
  window.addEventListener('storage', storageHandler);
  const unsubLang = onStudyLangChanged(langHandler);
  return () => {
    window.removeEventListener(EVENT, h);
    window.removeEventListener('storage', storageHandler);
    unsubLang();
  };
}
