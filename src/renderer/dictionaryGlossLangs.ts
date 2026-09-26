// Which definition languages the dictionary shows.
//
// Every bundled dictionary is provisioned and enabled on first boot — JMdict
// English, JMdict Russian and the monolingual Chinese Moedict — because mining
// templates such as `{meaning:ru}` need the Russian store whatever the UI
// language is. Enabled is therefore not the same as "wanted on screen", and an
// English-UI learner looking up 公園 got a Russian and a Chinese definition under
// the English one. The stores stay enabled (mining still reads every language);
// only what is *displayed* is scoped here.
//
// The default is the UI language plus English, the language every bundled
// Japanese dictionary has. A stored list is an explicit choice made with the
// language chips in the results and always wins over the default, so changing
// the UI language later never silently rewrites it.

import type { DictEntry } from '../shared/types';
import { writeLocalStorageJson } from './localStorageWrite';

export const DICT_GLOSS_LANGS_KEY = 'jp-study-dict-gloss-langs';

/** The UI language plus English, without duplicates. */
export function defaultGlossLangs(uiLang: string): string[] {
  const ui = (uiLang || 'en').trim().toLowerCase();
  return ui === 'en' ? ['en'] : [ui, 'en'];
}

/** The user's explicit choice, or null when they never made one. */
export function readStoredGlossLangs(): string[] | null {
  try {
    const raw = localStorage.getItem(DICT_GLOSS_LANGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const langs = parsed.filter((x): x is string => typeof x === 'string' && /^[a-z]{2,3}$/.test(x));
    return langs.length ? langs : null;
  } catch {
    return null;
  }
}

/** Languages to show: the stored choice when there is one, else the default. */
export function loadGlossLangs(uiLang: string): string[] {
  return readStoredGlossLangs() ?? defaultGlossLangs(uiLang);
}

export function saveGlossLangs(langs: readonly string[]): void {
  writeLocalStorageJson(DICT_GLOSS_LANGS_KEY, [...new Set(langs)]);
}

/** Every gloss language the entries declare, in first-seen order. */
export function entryGlossLangs(entries: readonly DictEntry[]): string[] {
  const seen: string[] = [];
  for (const entry of entries) {
    for (const lang of entry.sourceLangs ?? []) if (!seen.includes(lang)) seen.push(lang);
  }
  return seen;
}

/**
 * The entries to display for `shown` languages.
 *
 * An entry that declares no language (Jisho, a legacy store) is always kept — there
 * is nothing to filter it on. When the filter would leave nothing at all, every
 * entry is returned instead: a definition in another language beats "no match"
 * for a word the dictionaries do know.
 */
export function filterEntriesByGlossLangs<T extends Pick<DictEntry, 'sourceLangs'>>(
  entries: readonly T[],
  shown: readonly string[],
): { visible: T[]; hiddenCount: number } {
  const visible = entries.filter(
    (entry) => !entry.sourceLangs?.length || entry.sourceLangs.some((lang) => shown.includes(lang)),
  );
  if (!visible.length) return { visible: [...entries], hiddenCount: 0 };
  return { visible, hiddenCount: entries.length - visible.length };
}
