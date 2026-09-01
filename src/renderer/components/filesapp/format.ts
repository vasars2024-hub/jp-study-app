/**
 * The Files app's shared value formatting.
 *
 * Extracted from `FilesApp.tsx` when the cleanup sheet needed the same byte
 * rendering: a second copy had already reintroduced `toFixed` on the visible
 * number, which opts out of locale digit formatting entirely (`t()` formats
 * numbers, strings pass through untouched), so a Japanese UI on a German
 * machine would have shown `1.234,5` in one panel and `1234.5` in the other.
 * One definition is the only way those two stay in agreement.
 */
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';

export type Translate = (k: string, v?: Record<string, string | number>) => string;

/**
 * Bytes, rendered with the unit the number actually deserves.
 *
 * `lang` is threaded in rather than read from the OS: a bare `toLocaleString()`
 * formats digits and separators in the SYSTEM locale, which is independent of
 * the UI-language setting. `LANG_TAGS[lang]` is the same mapping `core.ts` uses
 * for plural rules and number formatting, so all three agree.
 *
 * `null` is an em dash, not `0 B`: a store with no size and a genuinely empty
 * file are different facts and must not print the same.
 */
export function formatSize(bytes: number | null, t: Translate, lang: UiLang): string {
  if (bytes === null) return '—';
  const units = ['filesApp.unit.b', 'filesApp.unit.kb', 'filesApp.unit.mb', 'filesApp.unit.gb'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // toFixed opts out of locale digit formatting; toLocaleString does not.
  const shown = unit === 0 ? value : Number(value.toFixed(1));
  return t(units[unit], { n: shown.toLocaleString(LANG_TAGS[lang]) });
}

export function formatDate(ms: number | null, lang: UiLang): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleString(LANG_TAGS[lang]);
}
