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

export type PracticeMode = 'none' | 'match' | 'write' | 'learn' | 'test' | 'listen';

/** Everything except `none`, which is the launcher's own state. */
export type PracticeModeId = Exclude<PracticeMode, 'none'>;

export interface PracticeModeEntry {
  id: PracticeModeId;
  /** i18n key for the action that opens it (the tile's accessible name). */
  startKey: string;
  /** i18n key for the short name printed on the launcher tile. */
  titleKey: string;
  /** i18n key for the one-line description of what it drills. */
  aboutKey: string;
  /** The tile's glyph: a name from the renderer's icon set (`components/Icons.tsx`). */
  icon: 'flashcards' | 'keyboard' | 'shuffle' | 'check' | 'headphones';
}

/**
 * Order is pedagogical, not alphabetical: Learn introduces material and carries
 * it to mastery, Write and Match drill what is already half-known, and Test
 * measures the result — which is why it is last and not first. A user reading
 * down the list gets the sequence.
 */
export const PRACTICE_MODES: readonly PracticeModeEntry[] = [
  { id: 'learn', startKey: 'flash.learn.start', titleKey: 'flash.practice.mode.learn', aboutKey: 'flash.learn.about', icon: 'flashcards' },
  { id: 'write', startKey: 'flash.write.start', titleKey: 'flash.practice.mode.write', aboutKey: 'flash.write.about', icon: 'keyboard' },
  { id: 'match', startKey: 'flash.match.start', titleKey: 'flash.practice.mode.match', aboutKey: 'flash.match.about', icon: 'shuffle' },
  { id: 'test', startKey: 'flash.test.start', titleKey: 'flash.practice.mode.test', aboutKey: 'flash.test.about', icon: 'check' },
  // Not a drill: the deck's clips as a shuffled, hands-free playlist (a sentence
  // deck from an episode, on a walk). Last because it grades nothing.
  { id: 'listen', startKey: 'flash.listen.start', titleKey: 'flash.practice.mode.listen', aboutKey: 'flash.listen.about', icon: 'headphones' },
];

export function isPracticeMode(value: string): value is PracticeModeId {
  return PRACTICE_MODES.some((entry) => entry.id === value);
}
