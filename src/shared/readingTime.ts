/** Remaining text through the next TOC entry, including split parts of a chapter. */
export function chapterCharsRemaining(
  chapters: readonly { chars: number }[],
  toc: readonly { chapterIndex: number }[],
  part: number,
  fraction: number,
): number {
  if (!chapters[part] || !Number.isFinite(fraction)) return 0;
  const next = toc.reduce(
    (end, entry) => entry.chapterIndex > part ? Math.min(end, entry.chapterIndex) : end,
    toc.length ? chapters.length : part + 1,
  );
  let chars = chapters[part].chars * (1 - Math.min(1, Math.max(0, fraction)));
  for (let i = part + 1; i < next; i++) chars += chapters[i].chars;
  return Math.max(0, chars);
}

/** Use the ratio of totals, so a short reading day does not outweigh a long one. */
export function estimateReadingMinutes(
  remainingChars: number,
  recent: readonly { seconds: number; chars: number }[],
): number | null {
  const speed = readingCharsPerMinute(recent);
  if (speed === null || !Number.isFinite(remainingChars)) return null;
  return Math.ceil(Math.max(0, remainingChars) / speed);
}

/**
 * One span's speed — this session, or one book's whole tally — in characters
 * per minute, rounded. Null until a minute of reading has been measured: a
 * speed from twenty seconds is noise, and showing it would be a number that
 * jumps around rather than one a reader can track.
 */
export function spanCharsPerMinute(seconds: number, chars: number): number | null {
  if (!Number.isFinite(seconds) || !Number.isFinite(chars) || seconds < 60 || chars <= 0) return null;
  return Math.round((chars * 60) / seconds);
}

/** Measured characters per minute, weighted by reading time. */
export function readingCharsPerMinute(
  recent: readonly { seconds: number; chars: number }[],
): number | null {
  let seconds = 0;
  let chars = 0;
  for (const day of recent) {
    if (!Number.isFinite(day.seconds) || !Number.isFinite(day.chars) || day.seconds <= 0 || day.chars <= 0) continue;
    seconds += day.seconds;
    chars += day.chars;
  }
  // Wait for at least a minute of measured reading before offering an estimate.
  if (seconds < 60 || chars <= 0) return null;
  return chars * 60 / seconds;
}
