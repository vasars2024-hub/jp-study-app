export interface DictionarySourceInfo {
  id: string;
  title: string;
  kind: string;
  sourceLang: string;
  licence: string;
  attribution: string;
  entryCount: number;
  enabled: boolean;
  priority: number;
}

export interface DictionarySourceMutationResult {
  ok: boolean;
  error?: 'not-found' | 'edge';
  sources: DictionarySourceInfo[];
}

/**
 * One direction of lookup: headwords in `sourceLang`, glosses in `targetLang`.
 *
 * The two halves are the schema's two `lang` columns, so this is the same unit
 * the lookup engine orders sources by — not a display-only grouping.
 */
export interface DictionaryLanguagePair {
  sourceLang: string;
  targetLang: string;
}

/** `''`/`''` means "no pair": the global `dictionaries.priority` order. */
export const GLOBAL_PAIR: DictionaryLanguagePair = { sourceLang: '', targetLang: '' };

export function isGlobalPair(pair: DictionaryLanguagePair | undefined): boolean {
  return !pair || !pair.sourceLang || !pair.targetLang;
}

export function pairKey(pair: DictionaryLanguagePair): string {
  return `${pair.sourceLang}>${pair.targetLang}`;
}
