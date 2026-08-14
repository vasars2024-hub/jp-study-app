// Which language a dictionary's definitions are actually written in.
//
// This lived twice: `yomitan.ts` knew the bundled dictionaries' languages and how
// to read a language out of a title, and `migrate.ts` — which writes the database
// rows every lookup then filters on — knew neither, so it fell straight through to
// `'en'`. A JMdict RU store whose legacy `index.json` carries no `glossLangs`
// migrated as English: 161k Cyrillic glosses tagged `lang='en'`, served inside
// English-scoped results, and unreachable by asking for Russian.
//
// So the knowledge lives here, in a module with no Electron import, and both the
// registry (main process) and the migration (utility process) resolve through it.
//
// Resolution order, strongest evidence first:
//   1. the user's manual override — always wins, it is an explicit correction;
//   2. what the store itself declares in `glossLangs`;
//   3. the bundled spec, keyed by the app-owned stable id — we provisioned it, we
//      know what it is;
//   4. the title, which names the language in practice ("JMdict (Japanese–Russian)");
//   5. nothing, and the caller decides what an unknown language defaults to.
//
// Deliberately *not* here: script sampling. It needs the parsed entries, so it
// belongs to the caller that already holds them (`yomitan.ts`), and it is the
// weakest signal of the five.

/**
 * Gloss languages of the dictionaries this application provisions itself, keyed by
 * the app-owned stable id. Keyed by id rather than title because titles are
 * user-editable and format-dependent, and guessing for an arbitrary user-imported
 * archive would be unsafe — the same reasoning as BUNDLED_LEGACY_PROVENANCE.
 */
export const BUNDLED_GLOSS_LANGS: Readonly<Record<string, readonly string[]>> = {
  'bundled-jmdict-en': ['en'],
  'bundled-jmdict-ru': ['ru'],
  'bundled-moedict-zh': ['zh'],
};

export const TITLE_LANG_HINTS: ReadonlyArray<{ re: RegExp; lang: string }> = [
  { re: /russian|русск|ロシア/i, lang: 'ru' },
  { re: /german|deutsch|ドイツ/i, lang: 'de' },
  { re: /french|français|francais|フランス/i, lang: 'fr' },
  { re: /spanish|español|espanol|スペイン/i, lang: 'es' },
  { re: /italian|italiano/i, lang: 'it' },
  { re: /portuguese|português/i, lang: 'pt' },
  { re: /dutch|nederlands/i, lang: 'nl' },
  { re: /korean|한국|韓国/i, lang: 'ko' },
  { re: /chinese|中文|汉语|漢語|中国語/i, lang: 'zh' },
  { re: /english|英語/i, lang: 'en' },
  { re: /国語|monolingual|大辞|辞林|jmdict.*japanese.*japanese/i, lang: 'ja' },
];

export function detectLangFromTitle(title: string): string | undefined {
  for (const hint of TITLE_LANG_HINTS) {
    if (hint.re.test(title)) return hint.lang;
  }
  return undefined;
}

/** The fields of a dictionary record this resolution actually reads. */
export interface GlossLangCandidate {
  id?: string;
  title?: string;
  glossLangs?: string[];
  glossLangOverride?: string;
}

/**
 * Every gloss language known for a dictionary, best evidence first. Empty when
 * nothing at all is known — an honest "unknown" the caller can default however
 * its own storage requires.
 */
export function resolveGlossLangs(info: GlossLangCandidate): string[] {
  const override = info.glossLangOverride?.trim();
  if (override) return [override];

  const declared = (info.glossLangs ?? [])
    .filter((lang): lang is string => typeof lang === 'string' && Boolean(lang.trim()))
    .map((lang) => lang.trim());
  if (declared.length) return declared;

  const bundled = info.id ? BUNDLED_GLOSS_LANGS[info.id] : undefined;
  if (bundled?.length) return [...bundled];

  const fromTitle = info.title ? detectLangFromTitle(info.title) : undefined;
  if (fromTitle) return [fromTitle];

  return [];
}
