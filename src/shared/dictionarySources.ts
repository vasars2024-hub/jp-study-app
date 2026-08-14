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
  error?: 'not-found' | 'edge' | 'invalid-lang';
  sources: DictionarySourceInfo[];
}

/**
 * The language code a source's headwords may be relabelled to, or `undefined`
 * when the caller sent something that is not one.
 *
 * Two to three letters, because both lengths are already in the database: the
 * importers write `ja`/`zh`/`en` and StarDict writes the honest `und` when its
 * archive declares nothing. Blank is *not* accepted — unlike the gloss-language
 * override there is no "auto" on this side. `dictionaries.source_lang` is one of
 * the two halves of every language pair, and `listDictionaryPairs` skips a blank
 * one, so clearing it would delete the source from every pair it can answer
 * rather than restoring a detection that never existed.
 */
export function normalizeSourceLang(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(normalized) ? normalized : undefined;
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
