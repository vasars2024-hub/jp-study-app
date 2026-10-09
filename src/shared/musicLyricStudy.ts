/**
 * Lyric lines count toward Statistics' "lines studied", the way subtitle lines do.
 *
 * The video overlay counts a line once per session when the learner works on it —
 * replays it, looks a word up in it, mines it (`noteLineStudied` in
 * `media/VideoCoreStudyOverlay.tsx`). The lyrics pane has the same three gestures, so it
 * counts the same way: one line, once, however many times it is replayed or looked into.
 *
 * Pure: the recorder is injected, so the stats store stays out of this module.
 */

/** One lyric line of one track. The text is part of it: a corrected sheet is a new line. */
export function lyricStudyLineKey(trackId: string, index: number, text: string): string {
  return `${trackId}\u0000${index}\u0000${text.trim()}`;
}

export interface LyricStudyLog {
  /** Count the line if it has not been counted this session; true when it was counted now. */
  note: (trackId: string, index: number, text: string) => boolean;
}

export function createLyricStudyLog(record: (count: number) => void): LyricStudyLog {
  const seen = new Set<string>();
  return {
    note(trackId, index, text) {
      // A blank line (an instrumental gap) is not something to study.
      if (!trackId || index < 0 || !text.trim()) return false;
      const key = lyricStudyLineKey(trackId, index, text);
      if (seen.has(key)) return false;
      seen.add(key);
      try {
        record(1);
      } catch {
        // Statistics are a by-product; a store that refuses the write never blocks study.
      }
      return true;
    },
  };
}
