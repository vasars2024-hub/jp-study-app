/**
 * The visual-novel panel's one-line reading summary:
 * "1,204 lines · 38,912 chars · 9 speakers · 14 cards mined · 212 chars/min".
 */
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';
import type { VisualNovelReadingStats } from '../../../shared/visualNovelReadingStats';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function visualNovelStatsLine(stats: VisualNovelReadingStats, t: Translate, lang: UiLang): string {
  const nf = new Intl.NumberFormat(LANG_TAGS[lang]);
  const parts = [
    t('read2.vn.stats.lines', { count: stats.lines, n: nf.format(stats.lines) }),
    t('read2.vn.stats.chars', { chars: nf.format(stats.chars) }),
  ];
  if (stats.speakers > 0) parts.push(t('read2.vn.stats.speakers', { count: stats.speakers }));
  if (stats.mined > 0) parts.push(t('read2.vn.stats.mined', { count: stats.mined }));
  if (stats.charsPerMinute !== null) parts.push(t('read2.vn.stats.speed', { cpm: nf.format(stats.charsPerMinute) }));
  return parts.join(' · ');
}
