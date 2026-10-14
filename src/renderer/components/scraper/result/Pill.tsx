// The small badges in the table's Type / Language / Resolution columns, and
// the subtitle-availability indicator beside them.

import type { SubtitleAvailability } from '../../../../shared/scraperResults';
import { tr } from '../localize';

export function Pill({
  children,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'outline' | 'good' | 'warn' | 'bad';
  title?: string;
}) {
  return (
    <span className={`scr-pill scr-pill--${tone}`} title={title}>
      {children}
    </span>
  );
}

/**
 * Subtitle availability for one row. Not decorative: this is the column the
 * whole study workflow depends on, so it names the language rather than just
 * signalling "yes/no", and says why when the answer is no.
 */
export function SubtitleBadge({
  subtitles,
  languagePriority,
}: {
  subtitles: SubtitleAvailability[];
  languagePriority: string[];
}) {
  if (!subtitles.length) {
    return (
      <Pill tone="bad" title={tr('scraperFix.ui.subs.noneTitle')}>
        {tr('scraperFix.ui.subs.none')}
      </Pill>
    );
  }

  const preferred = languagePriority[0] ?? '';
  const hasPreferred = subtitles.some((s) => s.language === preferred);
  const languages = subtitles.map((s) => s.language.toUpperCase()).join(', ');
  // Language and container codes ("JA ASS") are codes, not words; only the
  // "(embedded)" qualifier and the sentence around them are translated.
  const detail = subtitles
    .map((s) => {
      const track = `${s.language.toUpperCase()} ${s.format.toUpperCase()}`;
      return s.embedded ? tr('scraperFix.ui.subs.embedded', { track }) : track;
    })
    .join(' · ');

  return (
    <Pill
      tone={hasPreferred ? 'good' : 'warn'}
      title={
        hasPreferred
          ? detail
          : tr('scraperFix.ui.subs.notPreferred', { detail, lang: preferred.toUpperCase() })
      }
    >
      {languages}
    </Pill>
  );
}
