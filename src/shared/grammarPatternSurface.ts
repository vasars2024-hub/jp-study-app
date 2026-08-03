/**
 * Conservative literal grammar-pattern matching shared by Grammar practice and
 * Study's prepared-scene projection.
 *
 * This is intentionally under-inclusive. Short all-kana fragments such as
 * 「に」 or 「て」 occur inside unrelated words, so treating them as grammar
 * evidence would be worse than returning no match.
 */

export const MIN_GRAMMAR_SURFACE_CORE = 4;

const KANJI = /[一-龯㐀-䶿]/;

/**
 * Returns the first literal alternative in a grammar title after removing
 * placeholders and annotations, or an empty string when it is unsafe to match.
 */
export function grammarSurfaceCore(title: string): string {
  const first = String(title || '').split(/[/／]/)[0];
  const core = first
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[〜～~.．…・]/g, '')
    .replace(/[A-Za-z0-9]+/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!core) return '';
  return core.length >= MIN_GRAMMAR_SURFACE_CORE || KANJI.test(core) ? core : '';
}

export function sentenceHasGrammarSurface(sentence: string, title: string): boolean {
  const core = grammarSurfaceCore(title);
  return Boolean(core && sentence.includes(core));
}
