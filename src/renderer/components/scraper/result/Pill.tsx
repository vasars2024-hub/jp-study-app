// The small badges in the table's Type / Language / Resolution columns, and
// the subtitle-availability indicator beside them.

import { bestSubtitle, type SubtitleAvailability } from '../../../../shared/scraperResults';

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
      <Pill tone="bad" title="No subtitles found for this episode.">
        none
      </Pill>
    );
  }

  const best = bestSubtitle(subtitles, languagePriority);
  const preferred = languagePriority[0];
  const hasPreferred = subtitles.some((s) => s.language === preferred);
  const languages = subtitles.map((s) => s.language.toUpperCase()).join(', ');
  const detail = subtitles
    .map((s) => `${s.language.toUpperCase()} ${s.format.toUpperCase()}${s.embedded ? ' (embedded)' : ''}`)
    .join(' · ');

  return (
    <Pill
      tone={hasPreferred ? 'good' : 'warn'}
      title={
        hasPreferred
          ? detail
          : `${detail} — nothing in your preferred language (${preferred.toUpperCase()}).`
      }
    >
      {languages}
      {best && subtitles.length > 1 ? '' : ''}
    </Pill>
  );
}
