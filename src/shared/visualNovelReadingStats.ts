/**
 * One visual novel's reading, in numbers: lines and characters read, speakers
 * met, time played, reading speed and cards mined.
 *
 * Every input already exists — the capture log, the entry's playtime, the deck
 * — and the panel showed only the playtime. Speed counts only lines the game
 * actually put on screen while it ran (hook, clipboard, OCR, typed): an
 * imported script is text the player has not necessarily read yet, and
 * dividing it by playtime would report a speed nobody reads at.
 */
import { spanCharsPerMinute } from './readingTime';
import type { VisualNovelEntry, VisualNovelTextCapture } from './visualNovel';

export interface VisualNovelReadingStats {
  /** Captured lines the player read (imports excluded). */
  lines: number;
  /** Characters across those lines, whitespace excluded. */
  chars: number;
  /** Distinct named speakers in those lines. */
  speakers: number;
  playtimeSec: number;
  /** Characters per minute of play; null under a minute of play or with no lines. */
  charsPerMinute: number | null;
  /** Deck cards mined from this novel. */
  mined: number;
}

export function visualNovelReadingStats(
  entry: Pick<VisualNovelEntry, 'totalPlaytimeSec'>,
  captures: readonly Pick<VisualNovelTextCapture, 'japanese' | 'speaker' | 'source'>[],
  mined = 0,
): VisualNovelReadingStats {
  let lines = 0;
  let chars = 0;
  const speakers = new Set<string>();
  for (const capture of captures) {
    if (capture.source === 'import') continue;
    const text = capture.japanese.replace(/\s+/g, '');
    if (!text) continue;
    lines += 1;
    chars += [...text].length;
    const speaker = capture.speaker.trim();
    if (speaker) speakers.add(speaker);
  }
  const playtimeSec = Math.max(0, Number.isFinite(entry.totalPlaytimeSec) ? entry.totalPlaytimeSec : 0);
  return {
    lines,
    chars,
    speakers: speakers.size,
    playtimeSec,
    charsPerMinute: spanCharsPerMinute(playtimeSec, chars),
    mined: Math.max(0, Math.floor(mined)),
  };
}
