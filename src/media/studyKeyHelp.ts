/**
 * Which shortcut rows the player's keyboard help lists, and in what order (pure).
 *
 * Every `video.*` and `workspace.*` command — the ones the study overlay registers while
 * a video is open — bound or not: an unbound row is shown as "not set", because knowing a
 * command exists is half of binding it. Bound rows first, so the keys a learner can press
 * right now are at the top; within each half the catalog's own order is kept, which groups
 * the line keys, the delay keys and the display toggles the way the Settings page does.
 *
 * `video.resumeLast` is left out: it works from anywhere BUT the player, which is the one
 * place this list is shown.
 */
export interface StudyKeyHelpSource {
  id: string;
  label: string;
  keys: string;
  custom?: boolean;
}

const STUDY_PREFIXES = ['video.', 'workspace.'] as const;
const NOT_IN_PLAYER = new Set(['video.resumeLast']);

export function studyKeyHelpRows<T extends StudyKeyHelpSource>(rows: readonly T[]): T[] {
  const study = rows.filter((row) => (
    !row.custom
    && STUDY_PREFIXES.some((prefix) => row.id.startsWith(prefix))
    && !NOT_IN_PLAYER.has(row.id)
  ));
  return [...study.filter((row) => row.keys), ...study.filter((row) => !row.keys)];
}

/**
 * Whether a keypress is the "?" that toggles the help: the character itself, with no
 * Ctrl / Alt / Meta (Shift is how most layouts type it), and not a key repeat.
 */
export function isKeyHelpPress(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'>): boolean {
  return event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.repeat;
}
