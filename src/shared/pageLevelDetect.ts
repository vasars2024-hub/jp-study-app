// Page-script heuristics for the Chrome extension level badge.
// Pure string tests only — shared by the renderer bridge handler and tests.
//
// Rules:
//   JA text  = hiragana/katakana present (kanji-only CJK is treated as Chinese).
//   ZH text  = Han characters with no kana.
//   Study lang (when known) gates which script counts; otherwise infer from page.

import { hasHan, hasKana } from './langs';
import type { StudyLang } from './levelScale';

/** True when the sample looks Japanese (kana present). */
export function pageHasJapanese(text: string): boolean {
  return hasKana(text);
}

/** True when the sample looks Chinese (Han, no kana). */
export function pageHasChinese(text: string): boolean {
  return hasHan(text) && !hasKana(text);
}

/**
 * Which exam scheme to estimate for this page, or null → badge `X`.
 * Prefer `studyLang` when the app bridge supplies it; otherwise infer from script.
 */
export function resolvePageLevelLang(
  text: string,
  studyLang?: StudyLang | null,
): StudyLang | null {
  const hasJa = pageHasJapanese(text);
  const hasZh = pageHasChinese(text);

  if (studyLang === 'ja') return hasJa ? 'ja' : null;
  if (studyLang === 'zh') return hasZh ? 'zh' : null;

  if (hasJa) return 'ja';
  if (hasZh) return 'zh';
  return null;
}

/** Compact badge label: `N3`, `HSK4` (no space). */
export function compactLevelBadge(label: string): string {
  return String(label || '')
    .replace(/\s+/g, '')
    .trim();
}
