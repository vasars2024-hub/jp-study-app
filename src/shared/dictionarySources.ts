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

/**
 * The i18n key that names each `dictionaries.kind`, for chrome that shows a
 * source's kind beside its localized language and count.
 *
 * The keys on the left are the literals the writers actually store — the legacy
 * migration writes `term`/`pitch`/`freq`, and the importers write `name`
 * (JMnedict), `character` (KANJIDIC2) and `examples` (Tatoeba). The schema
 * comment on the column lists a couple more that nothing writes yet, so they are
 * deliberately absent: an entry here that no row can carry is an untranslatable
 * string a locale reviewer cannot check against anything.
 *
 * A kind with no entry must fall back to the raw column value rather than to a
 * neighbouring label — printing "terms" for a kind this map has not learned yet
 * would be a wrong answer where the untranslated literal is merely an ugly one.
 */
/**
 * The `dictionaries.kind` of a store whose rows are whole sentences, not words.
 *
 * Word lookups exclude it and the example reader is the only thing that reads it.
 * A single constant because those two facts have to agree: a store excluded from
 * lookups by one spelling and read by another is a store nothing can reach.
 */
export const EXAMPLE_DICTIONARY_KIND = 'examples';

/**
 * Tatoeba publishes ISO 639-3; every other importer and every language filter in
 * this app speaks the two-letter codes. Stored uncanonicalized, a Japanese
 * sentence lands as `jpn` and no `ja` lookup can ever reach it.
 *
 * Only the languages this app actually filters by are listed. An unmapped code is
 * kept verbatim, which leaves it honest and merely unreachable by the language
 * filter — a guessed mapping would instead be wrong data.
 */
const CORPUS_LANG_ALIASES: Readonly<Record<string, string>> = {
  jpn: 'ja',
  eng: 'en',
  rus: 'ru',
  cmn: 'zh',
  zho: 'zh',
};

export function canonicalCorpusLang(code: string): string {
  const key = code.trim().toLowerCase();
  return CORPUS_LANG_ALIASES[key] ?? key;
}

/** The alias pairs, for the migration that has to repair rows already written. */
export const CORPUS_LANG_ALIAS_PAIRS: readonly (readonly [string, string])[] =
  Object.entries(CORPUS_LANG_ALIASES);

export const DICTIONARY_KIND_LABEL_KEYS: Readonly<Record<string, string>> = {
  term: 'settings.study.dict.kind.terms',
  pitch: 'settings.study.dict.kind.pitch',
  freq: 'settings.study.dict.kind.frequency',
  name: 'settings.study.dict.kind.names',
  character: 'settings.study.dict.kind.characters',
  examples: 'settings.study.dict.kind.examples',
};

export interface DictionarySourceMutationResult {
  ok: boolean;
  error?: 'not-found' | 'edge' | 'invalid-lang';
  sources: DictionarySourceInfo[];
}

/**
 * What a source-language change answers with, which is *not* the new state.
 *
 * Relabelling every row a dictionary owns takes seconds to tens of seconds, so
 * it runs as a job on the import utility process rather than on the main thread.
 * The reply therefore says only that the work was accepted; `sources` is the
 * list as it stands *now*, unchanged, and the caller re-reads it when the job's
 * terminal snapshot arrives. Returning an optimistically-updated list here would
 * show a language the database has not moved to yet.
 */
export interface DictionarySourceLangResult {
  ok: boolean;
  error?: 'not-found' | 'invalid-lang' | 'busy' | 'unsupported';
  /** The queued job, when one was started. Match it against import snapshots. */
  jobId?: string;
  /** The source already had that language: success with nothing to run. */
  unchanged?: boolean;
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
