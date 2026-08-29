/**
 * The registry of deck-agnostic practice modes.
 *
 * One list, so a mode cannot exist as a component nobody can reach, and so the
 * launcher never drifts from what is actually implemented. Every entry carries
 * only translation keys — a mode's label is never a literal at the call site.
 *
 * A mode joins this list in the same commit that makes it playable, never
 * ahead of it: a launcher offering a button that opens nothing is the dead
 * control this repo keeps finding.
 */

export type PracticeMode = 'none' | 'match' | 'write' | 'learn';

/** Everything except `none`, which is the launcher's own state. */
export type PracticeModeId = Exclude<PracticeMode, 'none'>;

export interface PracticeModeEntry {
  id: PracticeModeId;
  /** i18n key for the button that opens it. */
  startKey: string;
  /** i18n key for the one-line description of what it drills. */
  aboutKey: string;
}

/**
 * Order is pedagogical, not alphabetical: Learn introduces material and carries
 * it to mastery, Write and Match drill what is already half-known. A user
 * reading down the list gets the sequence.
 */
export const PRACTICE_MODES: readonly PracticeModeEntry[] = [
  { id: 'learn', startKey: 'flash.learn.start', aboutKey: 'flash.learn.about' },
  { id: 'write', startKey: 'flash.write.start', aboutKey: 'flash.write.about' },
  { id: 'match', startKey: 'flash.match.start', aboutKey: 'flash.match.about' },
];

export function isPracticeMode(value: string): value is PracticeModeId {
  return PRACTICE_MODES.some((entry) => entry.id === value);
}
