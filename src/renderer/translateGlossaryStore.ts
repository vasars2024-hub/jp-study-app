/**
 * Where the learner's Translate glossary lives: `localStorage`, through the
 * guarded writer (this store's home IS localStorage, so a refused write is said,
 * not dropped). The rules — matching, sanitizing, applying — are pure and live
 * in `shared/translateGlossary.ts`.
 */
import { useEffect, useState } from 'react';
import {
  normalizeTranslateGlossary,
  removeGlossaryEntry,
  upsertGlossaryEntry,
  type TranslateGlossaryEntry,
  type TranslateGlossaryTerm,
} from '../shared/translateGlossary';
import { writeLocalStorageJson } from './localStorageWrite';

export const TRANSLATE_GLOSSARY_STORAGE_KEY = 'jp-translate-glossary-v1';
export const TRANSLATE_GLOSSARY_EVENT = 'translate-glossary-changed';

export function loadTranslateGlossary(): TranslateGlossaryEntry[] {
  try {
    const raw = localStorage.getItem(TRANSLATE_GLOSSARY_STORAGE_KEY);
    return raw ? normalizeTranslateGlossary(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function persist(list: TranslateGlossaryEntry[]): boolean {
  const ok = writeLocalStorageJson(TRANSLATE_GLOSSARY_STORAGE_KEY, list);
  try {
    window.dispatchEvent(new CustomEvent(TRANSLATE_GLOSSARY_EVENT));
  } catch {
    /* no window (tests) */
  }
  return ok;
}

function newGlossaryId(): string {
  return `gl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Adds a term (or re-renders one already there). Returns whether it was stored. */
export function saveTranslateGlossaryTerm(
  input: TranslateGlossaryTerm & { sourceLang?: string; targetLang?: string; origin?: 'user' | 'deck' },
): boolean {
  const before = loadTranslateGlossary();
  const after = upsertGlossaryEntry(before, input, Date.now(), newGlossaryId);
  if (after.length === before.length && after.every((entry, index) => entry === before[index])) return false;
  return persist(after);
}

export function deleteTranslateGlossaryTerm(id: string): void {
  persist(removeGlossaryEntry(loadTranslateGlossary(), id));
}

export function useTranslateGlossary(): TranslateGlossaryEntry[] {
  const [entries, setEntries] = useState<TranslateGlossaryEntry[]>(loadTranslateGlossary);
  useEffect(() => {
    const onChange = (): void => setEntries(loadTranslateGlossary());
    window.addEventListener(TRANSLATE_GLOSSARY_EVENT, onChange);
    return () => window.removeEventListener(TRANSLATE_GLOSSARY_EVENT, onChange);
  }, []);
  return entries;
}
