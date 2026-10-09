/**
 * The novel reader's reading-speed readout: this session's characters per
 * minute in the footer, and this book's totals (time, characters, speed) in
 * its tooltip and accessible name — the ttu-style "how fast am I reading this"
 * figure, from the same idle-aware seconds and credited characters that feed
 * Statistics, so the two can never disagree.
 */
import { useMemo } from 'react';
import { spanCharsPerMinute } from '../../../shared/readingTime';
import { LANG_TAGS, type UiLang } from '../../../shared/i18n/core';
import { formatDuration } from '../../stats';
import './readingEcosystem.css';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface ReadingSpan {
  seconds: number;
  chars: number;
}

/** The book half of the readout as one sentence, or null before a minute of it has been read. */
export function bookSpeedSentence(book: ReadingSpan | null, t: Translate, nf: Intl.NumberFormat): string | null {
  if (!book || book.seconds < 60) return null;
  const cpm = spanCharsPerMinute(book.seconds, book.chars);
  return t('read2.novel.bookStats', {
    time: formatDuration(book.seconds),
    chars: nf.format(Math.round(book.chars)),
    cpm: cpm === null ? '—' : nf.format(cpm),
  });
}

export default function ReaderSpeedReadout({
  session,
  book,
  t,
  lang,
}: {
  session: ReadingSpan;
  book: ReadingSpan | null;
  t: Translate;
  lang: UiLang;
}) {
  const nf = useMemo(() => new Intl.NumberFormat(LANG_TAGS[lang]), [lang]);
  const sessionCpm = spanCharsPerMinute(session.seconds, session.chars);
  const bookCpm = book ? spanCharsPerMinute(book.seconds, book.chars) : null;
  const bookSentence = bookSpeedSentence(book, t, nf);
  if (sessionCpm === null && bookCpm === null) return null;
  const label = sessionCpm !== null
    ? t('read2.novel.sessionSpeed', { cpm: nf.format(sessionCpm) })
    : t('read2.novel.bookSpeedShort', { cpm: nf.format(bookCpm ?? 0) });
  const full = [
    sessionCpm !== null
      ? t('read2.novel.sessionStats', {
        time: formatDuration(session.seconds),
        chars: nf.format(Math.round(session.chars)),
        cpm: nf.format(sessionCpm),
      })
      : null,
    bookSentence,
  ].filter(Boolean).join(' · ');
  return (
    <span className="reader-speed muted" data-reader-speed="" title={full} aria-label={full}>
      {label}
    </span>
  );
}
