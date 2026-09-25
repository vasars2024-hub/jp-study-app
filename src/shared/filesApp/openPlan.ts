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
      /**
       * The exact record to open inside `section`, when the row's owner is
       * known. Absent means the app opens at its front page, which is the
       * honest answer only for a loose file no store claims.
       */
      route?: FilesItemOpenRoute;
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
  // The Visual Novels app. This pointed at `novels` (the reading workspace's
  // planner), which knows nothing about visual novels.
  'visual-novel': 'visualnovels',
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

/**
 * Where a row opens INSIDE the app that owns it.
 *
 * Opening used to stop at the section: "Open" on a book brought the Library's
 * front page forward and left the user to find the book again, which is the
 * dead end the Files app exists to remove. Every row whose id names a store
 * record (`<enumerator>:<local id>`, see `FilesItem.id`) carries enough to
 * address that record directly, so the route is derived from the id rather
 * than guessed from the name.
 */
export type FilesItemOpenRoute =
  | { kind: 'library'; itemId: string }
  | { kind: 'media'; mediaId: string }
  | { kind: 'visual-novel'; visualNovelId: string }
  | { kind: 'deck'; folder: string | null; cardId: string | null }
  | { kind: 'lookup'; query: string }
  | { kind: 'note'; entryId: string };

/** The sections each route lands in, so a routed open and its receipt agree. */
function sectionsForRoute(route: FilesItemOpenRoute): readonly DesktopWinSection[] {
  switch (route.kind) {
    case 'library':
      return ['library'];
    case 'media':
      // Audio refines to Music (gate 15); both are the same media library.
      return ['player', 'music'];
    case 'visual-novel':
      return ['visualnovels'];
    case 'deck':
      return ['flashcards'];
    case 'lookup':
      return ['dictionary'];
    case 'note':
      return ['files'];
  }
}

/** Split `<prefix>:<rest>` once; the rest may itself contain colons. */
function idParts(id: string): { prefix: string; rest: string } | null {
  const at = id.indexOf(':');
  if (at <= 0 || at === id.length - 1) return null;
  return { prefix: id.slice(0, at), rest: id.slice(at + 1) };
}

/**
 * The owner route for a row, or `null` for a row no store claims (a loose
 * download, an export, a model file) — those still open at the app the file
 * router names, because there is no record inside it to address.
 */
export function ownedOpenRoute(item: Pick<FilesItem, 'id'>): FilesItemOpenRoute | null {
  const parts = idParts(item.id);
  if (!parts) return null;
  switch (parts.prefix) {
    case 'library':
      return { kind: 'library', itemId: parts.rest };
    case 'media':
      return { kind: 'media', mediaId: parts.rest };
    case 'visual-novel':
      return { kind: 'visual-novel', visualNovelId: parts.rest };
    case 'deck-folder':
      return { kind: 'deck', folder: parts.rest, cardId: null };
    case 'deck-card':
      return { kind: 'deck', folder: null, cardId: parts.rest };
    case 'saved-word':
    case 'lookup':
    case 'known-word':
      return { kind: 'lookup', query: parts.rest };
    case 'notebook':
      return { kind: 'note', entryId: parts.rest };
    default:
      return null;
  }
}

/**
 * Attach the owner route to an `open` decision when both point at the same
 * app. A user who picked a DIFFERENT home from the ranked list asked for that
 * app, not for this row's owner, so the route is dropped rather than forced.
 */
export function withOwnedRoute(
  decision: FilesOpenDecision,
  item: Pick<FilesItem, 'id'>,
): FilesOpenDecision {
  if (decision.mode !== 'open') return decision;
  const route = ownedOpenRoute(item);
  if (!route || !sectionsForRoute(route).includes(decision.section)) return decision;
  return { ...decision, route };
}

function pathKeyOf(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * A loose video or audio file (a download, a file in an export folder) that
 * the media library ALSO lists opens as that library entry — its title page,
 * its resume point — instead of at the Media Center's front page. Matched by
 * path, the only identity the two rows share.
 */
export function withLibraryTwin(
  decision: FilesOpenDecision,
  item: Pick<FilesItem, 'location'>,
  items: readonly Pick<FilesItem, 'id' | 'location'>[],
): FilesOpenDecision {
  if (decision.mode !== 'open' || decision.route || decision.target !== 'media') return decision;
  if (item.location.store !== 'file') return decision;
  const key = pathKeyOf(item.location.path);
  const twin = items.find(
    (candidate) =>
      candidate.id.startsWith('media:') &&
      candidate.location.store === 'file' &&
      pathKeyOf(candidate.location.path) === key,
  );
  return twin ? { ...decision, route: { kind: 'media', mediaId: twin.id.slice('media:'.length) } } : decision;
}

function openOwned(route: FilesItemOpenRoute, kind: FilesItemKind): FilesOpenDecision {
  const section: DesktopWinSection =
    route.kind === 'media' && kind === 'audio' ? 'music' : sectionsForRoute(route)[0];
  return {
    mode: 'open',
    target: 'unknown',
    section,
    reasonKey: 'filesApp.open.reason.byOwner',
    sniffed: false,
    route,
  };
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
export function decisionForRoutedPlan(
  plan: FilesOpenRoutedPlan,
  kind?: FilesItemKind,
): FilesOpenDecision {
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
  return openFor(candidates[0], plan.sniffed === true, kind);
}

/**
 * Where the row's own kind knows more than the router does — gate 15.
 *
 * The router's buckets are IMPORT destinations, and `media` is deliberately one
 * bucket for audio and video because both land in the same media library
 * (`DropRouter` calls `addMediaPaths` for either). Ownership is not one bucket:
 * a track's app is Music (`MediaCenterView initialTab="music"`), and gate 15 is
 * explicit that "a track opens the existing music app". The index already knows
 * which it is — `enumerators.ts` sets `kind: 'audio'` from the media row's own
 * `kind`/extension — so the refinement is a fact the caller already holds, not
 * a second guess at the file.
 *
 * Kept as an explicit pair list rather than "kind always wins": letting the kind
 * override generally would defeat the sniffers, which exist precisely because
 * the index's kind for a `.zip` (`package`) is the coarser answer.
 */
const KIND_REFINEMENTS: readonly {
  target: DropTargetId;
  kind: FilesItemKind;
  section: DesktopWinSection;
}[] = [{ target: 'media', kind: 'audio', section: 'music' }];

export function refineSectionByKind(
  target: DropTargetId,
  kind: FilesItemKind,
  section: DesktopWinSection,
): DesktopWinSection {
  const hit = KIND_REFINEMENTS.find((r) => r.target === target && r.kind === kind);
  return hit ? hit.section : section;
}

/** The decision once a single candidate is settled — by ranking or by the user. */
export function openFor(
  candidate: DropCandidate,
  sniffed: boolean,
  kind?: FilesItemKind,
): FilesOpenDecision {
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
    section: kind ? refineSectionByKind(candidate.target, kind, section) : section,
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
  item: Pick<FilesItem, 'kind' | 'location'> & Partial<Pick<FilesItem, 'id'>>,
  plan: FilesOpenRoutedPlan | null,
): FilesOpenDecision {
  const owned = item.id ? ownedOpenRoute({ id: item.id }) : null;
  if (isRoutableLocation(item.location)) {
    if (!plan) return { mode: 'refuse', reasonKey: 'filesApp.open.refuse.unrouted' };
    const routed = decisionForRoutedPlan(plan, item.kind);
    // A manga volume is a page FOLDER, which the router rightly refuses as a
    // container — but the library owns it and its reader opens it. The owner
    // is the authority for its own record.
    if (routed.mode === 'refuse' && owned) return openOwned(owned, item.kind);
    return item.id ? withOwnedRoute(routed, { id: item.id }) : routed;
  }
  if (owned) return openOwned(owned, item.kind);
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
