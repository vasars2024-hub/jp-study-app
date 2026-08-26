/**
 * Why each button in the Novels inspector's action row is greyed out.
 *
 * The category-8 sweep scored two mute pairs on `@.jiten-novels`: `Download/import
 * EPUB` and `Jiten vocab mine`, both disabled, both with `aria-label: null` and
 * `title: null`. The captions are fine — the user can read exactly what each one
 * does — and still had nothing telling them why it was grey, or what to change.
 *
 * All six are covered rather than the two the sweep caught, because four of them
 * are `disabled={busy}` and `busy` is a state the surface reaches whenever an
 * import or an analysis is running. Scoring the row while nothing is running and
 * calling it clean would be measuring the easy moment.
 *
 * Rules here rather than inline, beside `mediaVideoActionReason.ts` and
 * `agentComposerReason.ts`: three of the six have more than one condition, so
 * there is a PRIORITY, and a priority that is not in a module is a priority
 * nothing can test. Returning i18n keys keeps this file free of English.
 */

/** Everything the six rules read. `busy` is the shared run-in-progress flag. */
export interface NovelsActionState {
  busy: boolean;
  hasSelectedLink: boolean;
  hasDirectEpubUrl: boolean;
  hasJitenDeck: boolean;
  isPlanned: boolean;
}

/**
 * `undefined` means ENABLED. Every call site derives `disabled` from this rather
 * than repeating the condition list, so the two cannot disagree and a button
 * that is grey with no reason is not expressible.
 */
export type NovelsActionReason = string | undefined;

/** Add to plan, or remove from it — the same slot, and the same single condition. */
export function novelsPlanReason(s: NovelsActionState): NovelsActionReason {
  if (s.busy) return 'novels.reason.busy';
  return undefined;
}

export function novelsOpenSourceReason(s: NovelsActionState): NovelsActionReason {
  if (!s.hasSelectedLink) return 'novels.reason.noSourceLink';
  return undefined;
}

export function novelsImportFileReason(s: NovelsActionState): NovelsActionReason {
  if (s.busy) return 'novels.reason.busy';
  return undefined;
}

/**
 * Here the order is load-bearing and it is the whole reason this is a function.
 *
 * `busy` is transient: wait, and it clears. "No source here offers a direct EPUB"
 * is a property of what the user has SELECTED, and waiting will not change it.
 * Leading with `busy` would send someone to wait out a run and come back to a
 * button that is still dead, which is the same class of unfollowable advice the
 * reader-extraction banner gave. The condition the user can act on wins.
 */
export function novelsDownloadEpubReason(s: NovelsActionState): NovelsActionReason {
  if (!s.hasDirectEpubUrl) return 'novels.reason.noDirectEpub';
  if (s.busy) return 'novels.reason.busy';
  return undefined;
}

export function novelsAnalyzeEpubReason(s: NovelsActionState): NovelsActionReason {
  if (s.busy) return 'novels.reason.busy';
  return undefined;
}

/** Same priority as the EPUB download, and for the same reason. */
export function novelsJitenMineReason(s: NovelsActionState): NovelsActionReason {
  if (!s.hasJitenDeck) return 'novels.reason.noJitenDeck';
  if (s.busy) return 'novels.reason.busy';
  return undefined;
}

/** Every key the six rules can return, so a catalog test can assert all of them. */
export const NOVELS_ACTION_REASON_KEYS = [
  'novels.reason.busy',
  'novels.reason.noSourceLink',
  'novels.reason.noDirectEpub',
  'novels.reason.noJitenDeck',
] as const;
