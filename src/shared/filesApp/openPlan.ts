/**
 * Gate 10 — what happens when you open an item in the Files app.
 *
 * The gate's words: "Clicking an item of each handled type opens the app that
 * owns it, and a type with more than one candidate offers the ranked list
 * rather than silently choosing."
 *
 * **Opening is not importing, and that distinction is the whole module.**
 * `DropRouter.tsx` already owns a `DropTargetId` switch, but every branch of it
 * performs a side effect — `importPaths`, `addMediaPaths`, `dictImportYomitan`,
 * `importApkg`. An item in the Files index is *already imported*; running that
 * switch again would create a second library row for a book the user is looking
 * at. So this module reuses only the half of `DropRouter` that is a fact about
 * the app — which section each target lands in, taken from that file's own
 * `onOpenSection` calls — and performs no import.
 *
 * **Why route through `planForPath` at all**, when an index row already carries
 * a `kind`. Two reasons, and the gate names the second one:
 *
 * 1. The enumerator's `kind` says what the row IS to the index; the router says
 *    what the FILE is on disk. They disagree exactly where it matters — the
 *    `.zip` that an enumerator files under `package` is either a manga volume
 *    or a Yomitan dictionary, and only `sniffZip` knows which.
 * 2. The router is the surface that already ranks ambiguity honestly. Rebuilding
 *    that ranking here would be a second table to drift.
 *
 * Non-file-backed rows have no path to route, so they fall back to
 * `sectionForKind`. That is a smaller table, and where it has no answer the
 * result is a named refusal rather than a section picked to look busy.
 */
import type { DesktopWinSection } from '../desktop';
import type { DropCandidate, DropTargetId } from '../fileRouting';
import type { FilesItem, FilesItemKind, FilesLocation } from './catalog';

/**
 * The subset of `main/fileRouter.ts`'s `DropPlan` that opening needs.
 *
 * Declared structurally rather than imported, because `DropPlan` lives in a
 * main-process module that reaches for `electron` and `node:fs` at import time;
 * this file is shared and is imported by the renderer.
 */
export interface FilesOpenRoutedPlan {
  path: string;
  candidates: readonly DropCandidate[];
  /** True when `sniffZip`/`sniffJson` settled the extension's ambiguity. */
  sniffed?: boolean;
}

export type FilesOpenDecision =
  | {
      mode: 'open';
      target: DropTargetId;
      section: DesktopWinSection;
      /** i18n key explaining the routing, shown after the app opens. */
      reasonKey: string;
      /** True when content sniffing, not the extension, chose this target. */
      sniffed: boolean;
    }
  | {
      /** More than one honest home. The user picks; nothing opens yet. */
      mode: 'choose';
      candidates: readonly DropCandidate[];
    }
  | { mode: 'refuse'; reasonKey: string };

/**
 * Which application owns a routed target.
 *
 * Every non-null entry is the section `DropRouter.tsx` itself opens for that
 * target, so the two surfaces cannot disagree about where a `.epub` belongs.
 * A `null` is a considered answer, not a gap: the target names a destination
 * that is not an application you can look at.
 */
const SECTION_FOR_TARGET: Record<DropTargetId, DesktopWinSection | null> = {
  // DropRouter: `onOpenSection?.(target === 'library-manga' ? 'library' : 'library')`.
  'library-book': 'library',
  'library-manga': 'library',
  // DropRouter opens `player`, not `video` — `player` is the media session that
  // owns playback, and `media` is a DEAD section id (see shared/desktop.ts).
  media: 'player',
  // DropRouter hands the path to the open media session and opens `player`.
  subtitle: 'player',
  'anki-level': 'anki',
  'anki-cards': 'flashcards',
  // No path-in importer in DropRouter, but the OWNER is not in doubt: CSV/TSV
  // rows become deck cards, and the deck is what you would open to see them.
  'deck-csv': 'flashcards',
  'dictionary-yomitan': 'dictionary',
  // A frequency list is dictionary data — it ranks the dictionary's own entries.
  'frequency-dict': 'dictionary',
  'vn-script': 'novels',
  // The wallpaper's home is Appearance, which is a Settings page.
  wallpaper: 'settings',
  // Gate 8 moved the Backup card out of Settings; the Files app is now its only
  // home, so a backup file opens the app that holds it.
  backup: 'files',
  /*
   * The three that own no application, each for its own reason:
   *
   * - `shortcut`  — a .lnk is a pointer at something OUTSIDE this app. Opening
   *   it would mean launching a foreign program, which the Files app has no
   *   business doing on a click meant to say "show me this".
   * - `folder`    — a container, not a document. The Files app is already the
   *   thing that shows containers.
   * - `unknown`   — the router could not place it. Saying so is the outcome.
   */
  shortcut: null,
  folder: null,
  unknown: null,
};

export function sectionForDropTarget(target: DropTargetId): DesktopWinSection | null {
  return SECTION_FOR_TARGET[target] ?? null;
}

/**
 * Why each ownerless target refuses. Spelled out per target rather than
 * interpolated into `filesApp.open.refuse.${target}`: a built key is invisible
 * to `tools/i18n-check.cjs` and to grep, so the day a new `DropTargetId`
 * appears the button would render the key itself as its own label.
 */
const REFUSAL_KEY_FOR_TARGET: Record<DropTargetId, string | null> = {
  'library-book': null,
  'library-manga': null,
  media: null,
  subtitle: null,
  'anki-level': null,
  'anki-cards': null,
  'deck-csv': null,
  'dictionary-yomitan': null,
  'frequency-dict': null,
  'vn-script': null,
  wallpaper: null,
  backup: null,
  shortcut: 'filesApp.open.refuse.shortcut',
  folder: 'filesApp.open.refuse.folder',
  unknown: 'filesApp.open.refuse.unrouted',
};

/**
 * Which application owns an index row that has no file to route.
 *
 * Deliberately smaller than `CATEGORY_FOR_KIND`: a kind is placed in the tree
 * whether or not an app can open it, and conflating "has a shelf" with "has a
 * reader" is how a dead Open button gets shipped.
 */
const SECTION_FOR_KIND: Partial<Record<FilesItemKind, DesktopWinSection>> = {
  book: 'library',
  manga: 'library',
  'visual-novel': 'novels',
  video: 'player',
  audio: 'music',
  deck: 'flashcards',
  'mined-card': 'flashcards',
  dictionary: 'dictionary',
  statistic: 'stats',
  'memory-stat': 'files',
  profile: 'settings',
  workspace: 'reading',
  job: 'files',
  acquisition: 'scraper',
};

export function sectionForKind(kind: FilesItemKind): DesktopWinSection | null {
  return SECTION_FOR_KIND[kind] ?? null;
}

/** True for the rows whose `location` carries a real path to hand the router. */
export function isRoutableLocation(location: FilesLocation): location is {
  store: 'file';
  path: string;
} {
  return location.store === 'file' && location.path.length > 0;
}

/**
 * The decision for a routed file. Exported separately from
 * `filesOpenDecision` so the ranked-list branch can be re-run after the user
 * picks, without re-classifying the path.
 */
export function decisionForRoutedPlan(plan: FilesOpenRoutedPlan): FilesOpenDecision {
  const candidates = plan.candidates.filter((c) => c.target !== 'unknown');
  if (candidates.length === 0) {
    const first = plan.candidates[0];
    return { mode: 'refuse', reasonKey: first?.reasonKey ?? 'filesApp.open.refuse.unrouted' };
  }
  // The gate's own rule, and it is a COUNT, not a confidence: "a type with more
  // than one candidate offers the ranked list rather than silently choosing".
  // Reading `confidence === 'ambiguous'` instead would silently open the first
  // of the two `.apkg` homes, which are ranked `likely` then `ambiguous`.
  if (candidates.length > 1) return { mode: 'choose', candidates };
  return openFor(candidates[0], plan.sniffed === true);
}

/** The decision once a single candidate is settled — by ranking or by the user. */
export function openFor(candidate: DropCandidate, sniffed: boolean): FilesOpenDecision {
  const section = sectionForDropTarget(candidate.target);
  if (!section) {
    return {
      mode: 'refuse',
      reasonKey: REFUSAL_KEY_FOR_TARGET[candidate.target] ?? 'filesApp.open.refuse.unrouted',
    };
  }
  return {
    mode: 'open',
    target: candidate.target,
    section,
    reasonKey: candidate.reasonKey,
    sniffed,
  };
}

/**
 * The whole decision for one row.
 *
 * `plan` is what `window.api.fileDropClassify` returned for the row's path, or
 * `null` when the row is not file-backed (in which case the caller must not
 * have called it) or when the call failed. A failed call is NOT quietly
 * downgraded to the kind table: the router is the authority for a file, and
 * pretending otherwise would route a sniffed `.zip` by its extension.
 */
export function filesOpenDecision(
  item: Pick<FilesItem, 'kind' | 'location'>,
  plan: FilesOpenRoutedPlan | null,
): FilesOpenDecision {
  if (isRoutableLocation(item.location)) {
    if (!plan) return { mode: 'refuse', reasonKey: 'filesApp.open.refuse.unrouted' };
    return decisionForRoutedPlan(plan);
  }
  const section = sectionForKind(item.kind);
  if (!section) return { mode: 'refuse', reasonKey: 'filesApp.open.refuse.noOwner' };
  return {
    mode: 'open',
    target: 'unknown',
    section,
    reasonKey: 'filesApp.open.reason.byKind',
    sniffed: false,
  };
}
