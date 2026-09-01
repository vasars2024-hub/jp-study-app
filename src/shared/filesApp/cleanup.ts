/**
 * The Files app — cleanup: classification, the dry run, and the guard.
 *
 * Plan gates 32, 33, 34 and 35 all describe one operation seen from four
 * angles, so they share one model rather than three: a *class* decides what a
 * row is, the *plan* decides what would happen to it, the *guard* decides what
 * may never happen, and the *log* records what did. Nothing here touches the
 * filesystem — `main/filesApp/cleanupIpc.ts` supplies the Recycle Bin and the
 * store adapters, exactly as the delete path does.
 *
 * **The guard is the point of this module, and it is not decorative.** The
 * downloads enumerator marks every file it finds that `media.json` does not
 * claim as `orphan` — measured at 96 files / 5.14 GB on this profile, of which
 * 4 are claimed. So the naive reading of "clean up orphan files" is *delete
 * five gigabytes of the user's downloaded video*. Gate 33 exists because that
 * is the reachable mistake; `protectionFor` is what makes it unreachable, and
 * the protection reuses `planFilesDeletion`'s risk rather than re-deriving it,
 * so cleanup and Delete cannot disagree about what is irreplaceable.
 *
 * **Why classes are ordered and exclusive.** A `.part` file that is also zero
 * bytes and also unclaimed matches three classes. Counting it three times
 * would make the per-class counts sum to more than the item count, and gate 32
 * requires the report to match what is removed *item for item*. One row lands
 * in exactly one class, chosen by `CLEANUP_CLASS_PRECEDENCE`.
 */

import {
  deletionModeForTarget,
  deletionRiskForKind,
  type FilesDeletionLocation,
  type FilesDeletionMode,
  type FilesDeletionTarget,
} from './deletion';
import { isIncompleteName } from './scan';

/* ------------------------------------------------------------------ *
 * Classes.
 * ------------------------------------------------------------------ */

/**
 * Every class is a condition this app can actually produce today. A class
 * nothing can populate is a fabricated column in the cleanup report, which is
 * the same defect the catalogue's flag list refuses.
 */
export const FILES_CLEANUP_CLASS_IDS = [
  /** A record whose backing file is gone. `flags.brokenLink`, gate 34. */
  'broken-links',
  /** yt-dlp / browser / torrent leftovers: `.part`, `.crdownload`, `.tmp`. */
  'partial-downloads',
  /** A file-backed row of exactly 0 bytes — a download that produced nothing. */
  'empty-files',
  /** A file this app wrote that no persisted record claims. `flags.orphan`. */
  'orphan-files',
] as const;
export type FilesCleanupClassId = (typeof FILES_CLEANUP_CLASS_IDS)[number];

/**
 * First match wins. `broken-links` leads because it is the only class whose
 * rows have no bytes at all — deciding it first keeps a missing video's record
 * out of `empty-files`, where a zero size would otherwise read as junk on disk.
 */
export const CLEANUP_CLASS_PRECEDENCE: readonly FilesCleanupClassId[] = FILES_CLEANUP_CLASS_IDS;

/** Gate 34's three policies for a record whose file has gone missing. */
export const FILES_BROKEN_LINK_POLICIES = ['mark', 'prompt', 'relocate'] as const;
export type FilesBrokenLinkPolicy = (typeof FILES_BROKEN_LINK_POLICIES)[number];

export interface FilesCleanupSettings {
  /** Classes the user has switched on. An empty set plans nothing. */
  enabledClasses: readonly FilesCleanupClassId[];
  brokenLinkPolicy: FilesBrokenLinkPolicy;
}

export const DEFAULT_CLEANUP_SETTINGS: FilesCleanupSettings = {
  // Deliberately NOT `orphan-files`. That class is the 5 GB one; the user opts
  // into it after reading a report, never by installing the app.
  enabledClasses: ['broken-links', 'partial-downloads', 'empty-files'],
  brokenLinkPolicy: 'mark',
};

export function normalizeCleanupSettings(value: unknown): FilesCleanupSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_CLEANUP_SETTINGS;
  }
  const raw = value as { enabledClasses?: unknown; brokenLinkPolicy?: unknown };
  const classes = Array.isArray(raw.enabledClasses)
    ? FILES_CLEANUP_CLASS_IDS.filter((id) => (raw.enabledClasses as unknown[]).includes(id))
    : DEFAULT_CLEANUP_SETTINGS.enabledClasses;
  const policy = FILES_BROKEN_LINK_POLICIES.includes(raw.brokenLinkPolicy as FilesBrokenLinkPolicy)
    ? (raw.brokenLinkPolicy as FilesBrokenLinkPolicy)
    : DEFAULT_CLEANUP_SETTINGS.brokenLinkPolicy;
  return { enabledClasses: classes, brokenLinkPolicy: policy };
}

/* ------------------------------------------------------------------ *
 * Input.
 * ------------------------------------------------------------------ */

/**
 * The structural subset of a catalogue row cleanup is allowed to see.
 *
 * Same reasoning as `FilesDeletionIndexItem`: display metadata added later
 * must not silently become part of a destructive decision. `source` is here
 * because gate 34's relocate needs to know which store owns the record.
 */
export interface FilesCleanupInput {
  id: string;
  name: string;
  kind: string;
  location: FilesDeletionLocation;
  sizeBytes: number | null;
  source: string;
  flags?: { brokenLink?: boolean; orphan?: boolean; referenced?: boolean };
}

function targetOf(item: FilesCleanupInput): FilesDeletionTarget {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    location: item.location,
    sizeBytes: item.sizeBytes,
    referenced: item.flags?.referenced === true,
  };
}

/** `null` for a row no enabled class claims. Never a default bucket. */
export function classifyForCleanup(
  item: FilesCleanupInput,
  enabled: readonly FilesCleanupClassId[],
): FilesCleanupClassId | null {
  const on = new Set(enabled);
  for (const classId of CLEANUP_CLASS_PRECEDENCE) {
    if (!on.has(classId)) continue;
    if (classId === 'broken-links' && item.flags?.brokenLink === true) return classId;
    if (item.location.store !== 'file') continue;
    if (classId === 'partial-downloads' && isIncompleteName(item.name)) return classId;
    if (classId === 'empty-files' && item.sizeBytes === 0) return classId;
    if (classId === 'orphan-files' && item.flags?.orphan === true) return classId;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The guard — gate 33.
 * ------------------------------------------------------------------ */

export type FilesCleanupProtectionReason =
  | 'filesApp.cleanup.protect.irreplaceableMedia'
  | 'filesApp.cleanup.protect.nothingToRemove'
  | 'filesApp.cleanup.protect.brokenLinkMarked';

/**
 * The one function a scheduled run and a manual run both pass through.
 *
 * Returns the reason this row may not be removed, or `null` if it may. Written
 * as a positive list of refusals rather than a permission check so that a new
 * class added later is protected by default only where a rule names it — and
 * so the adverse control (delete a branch, watch the video become removable)
 * has exactly one line to attack.
 */
export function protectionFor(
  item: FilesCleanupInput,
  classId: FilesCleanupClassId,
  policy: FilesBrokenLinkPolicy,
): FilesCleanupProtectionReason | null {
  const mode = deletionModeForTarget(targetOf(item));
  if (mode === 'none') return 'filesApp.cleanup.protect.nothingToRemove';

  // Irreplaceable material is protected from every class EXCEPT broken-links,
  // where the bytes are already gone and only the record remains. A downloaded
  // video sitting in `downloads/` is `orphan` by construction, so without this
  // line the orphan class reaches 5 GB of the user's own video.
  if (deletionRiskForKind(item.kind) === 'irreplaceable-media' && classId !== 'broken-links') {
    return 'filesApp.cleanup.protect.irreplaceableMedia';
  }

  // `mark` and `relocate` both mean "do not remove this record". Only `prompt`
  // makes a broken link removable, and then only with its own confirmation.
  if (classId === 'broken-links' && policy !== 'prompt') {
    return 'filesApp.cleanup.protect.brokenLinkMarked';
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * The dry run — gate 32.
 * ------------------------------------------------------------------ */

export interface FilesCleanupCandidate {
  itemId: string;
  name: string;
  classId: FilesCleanupClassId;
  /** What would actually happen: the Recycle Bin, or an undoable index row. */
  mode: Exclude<FilesDeletionMode, 'none'>;
  /** `null` where the store has no size. Never counted as 0. */
  sizeBytes: number | null;
  location: FilesDeletionLocation;
  source: string;
  /** Gate 34's `prompt`: this row needs its own confirmed id to be removed. */
  requiresConfirmation: boolean;
}

export interface FilesCleanupProtectedItem {
  itemId: string;
  name: string;
  classId: FilesCleanupClassId;
  reasonKey: FilesCleanupProtectionReason;
  sizeBytes: number | null;
  /** Gate 34: a marked broken link the user may point at a new file instead. */
  relocatable: boolean;
}

export interface FilesCleanupClassSummary {
  classId: FilesCleanupClassId;
  count: number;
  /** Sum of known sizes only. */
  reclaimableBytes: number;
  /** How many of `count` contributed nothing to the sum, so it reads honestly. */
  unknownSizeCount: number;
  protectedCount: number;
}

export interface FilesCleanupReport {
  builtAt: number;
  policy: FilesBrokenLinkPolicy;
  enabledClasses: readonly FilesCleanupClassId[];
  classes: FilesCleanupClassSummary[];
  candidates: FilesCleanupCandidate[];
  protectedItems: FilesCleanupProtectedItem[];
}

/**
 * Which enumerators own a store whose row carries a rewritable path.
 *
 * `media` is the one adapter that exists (`relocateMediaRow` rewrites the
 * `path` field of a `media.json` row). A scraper job's broken link points at
 * derived output the app can regenerate, a dictionary row is SQLite with no
 * path column this side may rewrite, and a derived reading has no target at
 * all. Keeping the list here rather than in main means the surface offers
 * Relocate on exactly the rows an adapter can satisfy — gate 34 asks that the
 * chosen policy *does what it says*, and an offer that always refuses does not.
 */
export const RELOCATABLE_SOURCES: ReadonlySet<string> = new Set(['media']);

export function isRelocatable(item: FilesCleanupInput): boolean {
  return (
    item.flags?.brokenLink === true &&
    item.location.store === 'file' &&
    RELOCATABLE_SOURCES.has(item.source)
  );
}

export function planFilesCleanup(
  items: readonly FilesCleanupInput[],
  settings: FilesCleanupSettings,
  now: number,
): FilesCleanupReport {
  const candidates: FilesCleanupCandidate[] = [];
  const protectedItems: FilesCleanupProtectedItem[] = [];

  for (const item of items) {
    const classId = classifyForCleanup(item, settings.enabledClasses);
    if (!classId) continue;

    const reasonKey = protectionFor(item, classId, settings.brokenLinkPolicy);
    if (reasonKey) {
      protectedItems.push({
        itemId: item.id,
        name: item.name,
        classId,
        reasonKey,
        sizeBytes: item.sizeBytes,
        relocatable: settings.brokenLinkPolicy === 'relocate' && isRelocatable(item),
      });
      continue;
    }

    const mode = deletionModeForTarget(targetOf(item));
    candidates.push({
      itemId: item.id,
      name: item.name,
      classId,
      // `none` was refused by the guard above; narrowing here rather than
      // casting means a future mode has to be handled, not silently trashed.
      mode: mode === 'trash' ? 'trash' : 'soft',
      sizeBytes: item.sizeBytes,
      location: item.location,
      source: item.source,
      requiresConfirmation: classId === 'broken-links',
    });
  }

  const classes = settings.enabledClasses.map<FilesCleanupClassSummary>((classId) => {
    const rows = candidates.filter((candidate) => candidate.classId === classId);
    return {
      classId,
      count: rows.length,
      reclaimableBytes: rows.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0),
      unknownSizeCount: rows.filter((row) => row.sizeBytes === null).length,
      protectedCount: protectedItems.filter((row) => row.classId === classId).length,
    };
  });

  return {
    builtAt: now,
    policy: settings.brokenLinkPolicy,
    enabledClasses: settings.enabledClasses,
    classes,
    candidates,
    protectedItems,
  };
}

/** Gate 32's arithmetic, as an assertion the tests and the UI can both call. */
export function cleanupReportBalances(report: FilesCleanupReport): boolean {
  const counted = report.classes.reduce((sum, row) => sum + row.count, 0);
  if (counted !== report.candidates.length) return false;
  const protectedCounted = report.classes.reduce((sum, row) => sum + row.protectedCount, 0);
  if (protectedCounted !== report.protectedItems.length) return false;
  return report.classes.every((row) => {
    const rows = report.candidates.filter((candidate) => candidate.classId === row.classId);
    const known = rows.filter((candidate) => candidate.sizeBytes !== null);
    return (
      row.reclaimableBytes === known.reduce((sum, candidate) => sum + (candidate.sizeBytes ?? 0), 0) &&
      row.unknownSizeCount === rows.length - known.length
    );
  });
}

/* ------------------------------------------------------------------ *
 * The confirmed set — gate 32's "item for item".
 * ------------------------------------------------------------------ */

export const FILES_CLEANUP_PLAN_CHANNEL = 'filesapp:cleanup-plan';
export const FILES_CLEANUP_RUN_CHANNEL = 'filesapp:cleanup-run';
export const FILES_CLEANUP_RELOCATE_CHANNEL = 'filesapp:cleanup-relocate';

export interface FilesCleanupRunRequest {
  /** Exactly the ids the user saw and confirmed. Order is irrelevant. */
  confirmedItemIds: readonly string[];
  /** `builtAt` of the report those ids came from; drift is reported, not run. */
  reportBuiltAt: number;
  /**
   * The settings the dry run used, re-normalized in main exactly like gate
   * 31's stability window. Carrying them means the re-derived report is the
   * same report the user read; omitting them would let a policy change between
   * the two plans silently widen what a stale confirmation reaches.
   */
  settings?: unknown;
}

export type FilesCleanupSkipReason =
  | 'filesApp.cleanup.skip.notInReport'
  | 'filesApp.cleanup.skip.notConfirmed'
  | 'filesApp.cleanup.skip.protectedNow'
  | 'filesApp.cleanup.skip.gone';

export interface FilesCleanupExecutionPlan {
  /** Re-derived candidates whose id the user confirmed. This is what runs. */
  toRemove: FilesCleanupCandidate[];
  /** Every id the user asked for that will NOT run, with the reason why. */
  skipped: { itemId: string; reasonKey: FilesCleanupSkipReason }[];
}

/**
 * Bind a confirmation to a freshly re-derived report.
 *
 * Gate 32 asks that the report match what is removed item for item. The way to
 * guarantee that under a moving filesystem is to plan twice and intersect: the
 * user confirms ids from report A, the executor rebuilds report B from the live
 * stores, and only the intersection runs. Anything that drifted between them is
 * *named* in `skipped` rather than removed on the strength of a stale row —
 * which is also what keeps a row that became protected in between from being
 * cleaned by an old confirmation.
 */
export function resolveCleanupExecution(
  fresh: FilesCleanupReport,
  request: FilesCleanupRunRequest,
): FilesCleanupExecutionPlan {
  const confirmed = new Set(request.confirmedItemIds);
  const byId = new Map(fresh.candidates.map((candidate) => [candidate.itemId, candidate]));
  const protectedIds = new Set(fresh.protectedItems.map((row) => row.itemId));

  const toRemove: FilesCleanupCandidate[] = [];
  const skipped: FilesCleanupExecutionPlan['skipped'] = [];

  for (const itemId of confirmed) {
    const candidate = byId.get(itemId);
    if (candidate) {
      toRemove.push(candidate);
      continue;
    }
    skipped.push({
      itemId,
      reasonKey: protectedIds.has(itemId)
        ? 'filesApp.cleanup.skip.protectedNow'
        : 'filesApp.cleanup.skip.gone',
    });
  }

  // A candidate the user did NOT confirm is never removed, including one that
  // needs no confirmation of its own: the confirmed set is the whole authority.
  for (const candidate of fresh.candidates) {
    if (!confirmed.has(candidate.itemId)) {
      skipped.push({ itemId: candidate.itemId, reasonKey: 'filesApp.cleanup.skip.notConfirmed' });
    }
  }

  return { toRemove, skipped };
}

/* ------------------------------------------------------------------ *
 * The log — gate 35.
 * ------------------------------------------------------------------ */

export type FilesCleanupDestination = 'recycle-bin' | 'index-undo' | 'failed';

export interface FilesCleanupLogEntry {
  at: number;
  itemId: string;
  name: string;
  classId: FilesCleanupClassId;
  destination: FilesCleanupDestination;
  /** Present for `recycle-bin` only: the path the OS was asked to trash. */
  path?: string;
  sizeBytes: number | null;
  /** Present for `index-undo`: the token that puts the row back. */
  undoToken?: string;
  /** Present for `failed`: why. */
  reasonKey?: string;
}

export interface FilesCleanupRunResult {
  ranAt: number;
  /** `scheduled` runs are the same code path; gate 33 turns on that being true. */
  trigger: 'manual' | 'scheduled';
  log: FilesCleanupLogEntry[];
  skipped: FilesCleanupExecutionPlan['skipped'];
  removedBytes: number;
}

/** What the log proves, as an assertion: removed set === confirmed-and-planned set. */
export function logMatchesPlan(
  plan: FilesCleanupExecutionPlan,
  result: FilesCleanupRunResult,
): boolean {
  const planned = plan.toRemove.map((candidate) => candidate.itemId).sort();
  const logged = result.log
    .filter((entry) => entry.destination !== 'failed')
    .map((entry) => entry.itemId)
    .sort();
  return planned.length === logged.length && planned.every((id, index) => id === logged[index]);
}
