/**
 * The Files app — cleanup on the privileged side.
 *
 * Same boundary shape as `deletionIpc.ts` and for the same reason: the renderer
 * sends ids and nothing else, and every path, kind, size and risk is resolved
 * here from the live stores immediately before anything is removed. A stale or
 * compromised renderer therefore cannot point cleanup at an arbitrary file or
 * downgrade a video's risk with a request field.
 *
 * **The incomplete-artifact sweep lives here, not in the enumerators.** The
 * catalogue is the user's browsable tree, and a half-written `.part` fragment
 * is not something to browse; the downloads enumerator's extension filter drops
 * it deliberately. Cleanup still needs to see it, so this module sweeps for it
 * separately and stamps `kind: 'other'` — `extOf('x.mp4.part')` is `.part`,
 * which is in no media set, and calling a fragment a video would put the whole
 * `partial-downloads` class permanently behind the media guard.
 *
 * **Removal is planned twice.** The renderer confirms ids from report A; this
 * module rebuilds report B from the live stores and runs only the intersection.
 * That is what makes gate 32's "item for item" true under a filesystem that can
 * move underneath a confirmation dialog.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DOWNLOAD_DIRECTORY, MEDIA_LIBRARY_STORE_FILE } from '../../shared/mediaLibraryEntries';
import {
  FILES_CLEANUP_PLAN_CHANNEL,
  FILES_CLEANUP_RELOCATE_CHANNEL,
  FILES_CLEANUP_RUN_CHANNEL,
  isRelocatable,
  normalizeCleanupSettings,
  planFilesCleanup,
  resolveCleanupExecution,
  type FilesCleanupCandidate,
  type FilesCleanupInput,
  type FilesCleanupLogEntry,
  type FilesCleanupReport,
  type FilesCleanupRunRequest,
  type FilesCleanupRunResult,
  type FilesCleanupSettings,
} from '../../shared/filesApp/cleanup';
import { isIncompleteName } from '../../shared/filesApp/scan';
import { isAbsoluteFilePath, type FilesIpcHandleRegistrar } from './deletionIpc';

export {
  FILES_CLEANUP_PLAN_CHANNEL,
  FILES_CLEANUP_RELOCATE_CHANNEL,
  FILES_CLEANUP_RUN_CHANNEL,
};

/** The structural subset of a catalogue row cleanup reads. */
export interface FilesCleanupIndexItem {
  id: string;
  name: string;
  kind: string;
  location: FilesCleanupInput['location'];
  sizeBytes: number | null;
  source: string;
  flags?: { brokenLink?: boolean; orphan?: boolean; referenced?: boolean };
}

export interface FilesCleanupMainDependencies {
  /** The live catalogue rows, re-read for every plan and every run. */
  getItems(): readonly FilesCleanupIndexItem[];
  userDataPath(): string;
  /** Production supplies Electron `shell.trashItem`. Never `unlink`. */
  trashItem(path: string): Promise<void>;
  /**
   * Owner-issued reversible removal for an index row. Takes the re-derived
   * candidate, not a renderer row: `itemId` is the only identity main trusts.
   */
  softDeleteRow(candidate: FilesCleanupCandidate): Promise<{ undoToken: string }>;
  /** Persisted cleanup settings; the scheduled run reads the same ones. */
  readSettings(): unknown;
  /** Drop the index cache once a store actually changed. */
  invalidate(): void;
  appendLog(entries: readonly FilesCleanupLogEntry[]): void;
  now(): number;
}

/**
 * Fragments left by an interrupted download, walked the same depth as the
 * downloads enumerator so the two agree about what "in downloads/" means.
 */
export function sweepIncompleteArtifacts(userDataPath: string): FilesCleanupInput[] {
  const root = path.join(userDataPath, MEDIA_DOWNLOAD_DIRECTORY);
  const out: FilesCleanupInput[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || !isIncompleteName(entry.name)) continue;
      let size: number | null = null;
      try {
        size = fs.statSync(full).size;
      } catch {
        // A fragment that vanished between readdir and stat is simply gone;
        // reporting an unknown size is honest, inventing 0 is not.
      }
      out.push({
        id: `cleanup-partial:${path.relative(root, full).replaceAll('\\', '/')}`,
        name: entry.name,
        // A fragment is not a video. See the module note.
        kind: 'other',
        location: { store: 'file', path: full },
        sizeBytes: size,
        source: 'cleanup-sweep',
        flags: { orphan: true },
      });
    }
  };
  walk(root, 0);
  return out;
}

/** Everything cleanup may consider: the catalogue, plus the fragment sweep. */
export function collectCleanupInputs(
  dependencies: Pick<FilesCleanupMainDependencies, 'getItems' | 'userDataPath'>,
): FilesCleanupInput[] {
  const rows = dependencies.getItems().map<FilesCleanupInput>((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    location: item.location,
    sizeBytes: item.sizeBytes,
    source: item.source,
    flags: item.flags,
  }));
  // The sweep runs second and is deduplicated against catalogue paths, so a
  // fragment some future enumerator starts indexing is never counted twice.
  const claimed = new Set(
    rows
      .filter((row) => row.location.store === 'file')
      .map((row) => path.resolve((row.location as { path: string }).path).toLowerCase()),
  );
  const fragments = sweepIncompleteArtifacts(dependencies.userDataPath()).filter(
    (row) => !claimed.has(path.resolve((row.location as { path: string }).path).toLowerCase()),
  );
  return [...rows, ...fragments];
}

export function currentCleanupSettings(
  dependencies: Pick<FilesCleanupMainDependencies, 'readSettings'>,
): FilesCleanupSettings {
  return normalizeCleanupSettings(dependencies.readSettings());
}

/** The dry run. Identical to what a run re-derives — that is the whole point. */
export function planCleanupInMain(
  dependencies: Pick<
    FilesCleanupMainDependencies,
    'getItems' | 'userDataPath' | 'readSettings' | 'now'
  >,
  overrides?: Partial<FilesCleanupSettings>,
): FilesCleanupReport {
  const settings = { ...currentCleanupSettings(dependencies), ...overrides };
  return planFilesCleanup(collectCleanupInputs(dependencies), settings, dependencies.now());
}

function sanitizeRunRequest(value: unknown): FilesCleanupRunRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as { confirmedItemIds?: unknown; reportBuiltAt?: unknown };
  if (!Array.isArray(raw.confirmedItemIds) || raw.confirmedItemIds.length > 100_000) return null;
  const ids: string[] = [];
  for (const id of raw.confirmedItemIds) {
    if (typeof id !== 'string' || !id.trim() || id.length > 1_024) return null;
    ids.push(id);
  }
  if (typeof raw.reportBuiltAt !== 'number' || !Number.isFinite(raw.reportBuiltAt)) return null;
  return { confirmedItemIds: ids, reportBuiltAt: raw.reportBuiltAt };
}

/**
 * Run one cleanup. `trigger` is the ONLY difference between a manual run and a
 * scheduled one — gate 33 asks that a scheduled run cannot reach the video, and
 * the way to guarantee that is for there to be no second function to audit.
 */
export async function runCleanupInMain(
  requestValue: unknown,
  dependencies: FilesCleanupMainDependencies,
  trigger: 'manual' | 'scheduled' = 'manual',
): Promise<FilesCleanupRunResult> {
  const now = dependencies.now();
  const request = sanitizeRunRequest(requestValue);
  if (!request) {
    return { ranAt: now, trigger, log: [], skipped: [], removedBytes: 0 };
  }

  const fresh = planCleanupInMain(dependencies);
  const plan = resolveCleanupExecution(fresh, request);

  const log: FilesCleanupLogEntry[] = [];
  let removedBytes = 0;
  let changed = false;

  for (const candidate of plan.toRemove) {
    const base = {
      at: dependencies.now(),
      itemId: candidate.itemId,
      name: candidate.name,
      classId: candidate.classId,
      sizeBytes: candidate.sizeBytes,
    };

    if (candidate.mode === 'trash') {
      const filePath = candidate.location.store === 'file' ? candidate.location.path : '';
      if (!isAbsoluteFilePath(filePath)) {
        log.push({ ...base, destination: 'failed', reasonKey: 'filesApp.cleanup.failed.badPath' });
        continue;
      }
      try {
        await dependencies.trashItem(filePath);
      } catch (error) {
        log.push({
          ...base,
          destination: 'failed',
          reasonKey: 'filesApp.cleanup.failed.trash',
          path: filePath,
        });
        void error;
        continue;
      }
      changed = true;
      removedBytes += candidate.sizeBytes ?? 0;
      log.push({ ...base, destination: 'recycle-bin', path: filePath });
      continue;
    }

    try {
      const receipt = await dependencies.softDeleteRow(candidate);
      changed = true;
      log.push({ ...base, destination: 'index-undo', undoToken: receipt.undoToken });
    } catch {
      log.push({ ...base, destination: 'failed', reasonKey: 'filesApp.cleanup.failed.softDelete' });
    }
  }

  if (log.length) dependencies.appendLog(log);
  if (changed) {
    try {
      dependencies.invalidate();
    } catch {
      // The stores already changed. Cache maintenance failing must not turn a
      // real removal into a reported failure; the index TTL is the fallback.
    }
  }

  return { ranAt: now, trigger, log, skipped: plan.skipped, removedBytes };
}

/* ------------------------------------------------------------------ *
 * Relocate — gate 34's third policy.
 * ------------------------------------------------------------------ */

export type FilesRelocateResult =
  | { ok: true; itemId: string; path: string }
  | {
      ok: false;
      itemId: string;
      reasonKey:
        | 'filesApp.cleanup.relocate.invalidRequest'
        | 'filesApp.cleanup.relocate.notFound'
        | 'filesApp.cleanup.relocate.notBroken'
        | 'filesApp.cleanup.relocate.unsupported'
        | 'filesApp.cleanup.relocate.missingTarget'
        | 'filesApp.cleanup.relocate.failed';
    };

/**
 * Repoint one `media.json` row at a file the user found again.
 *
 * Only `media.json` has an adapter today, and the refusal for everything else
 * is explicit: a scraper job's broken link points at derived output the app can
 * regenerate, and a SQLite or localStorage row has no path field this side may
 * rewrite. `RELOCATABLE_SOURCES` is the one list both the offer and this
 * executor consult, so the UI cannot offer a Relocate that must refuse.
 *
 * The row id is `media:<id>`, matching `mediaEnumerator`'s own convention —
 * the catalogue row is file-backed (`fileItem`), so there is no JSON pointer to
 * read the store key out of.
 */
export function relocateMediaRow(userDataPath: string, itemId: string, newPath: string): boolean {
  const rowId = itemId.startsWith('media:') ? itemId.slice('media:'.length) : null;
  if (!rowId) return false;
  const file = path.join(userDataPath, MEDIA_LIBRARY_STORE_FILE);
  let doc: { items?: { id?: unknown; path?: unknown }[] };
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf-8')) as typeof doc;
  } catch {
    return false;
  }
  if (!Array.isArray(doc.items)) return false;
  const row = doc.items.find((candidate) => candidate?.id === rowId);
  if (!row) return false;
  row.path = newPath;
  try {
    fs.writeFileSync(file, JSON.stringify(doc, null, 2), 'utf-8');
  } catch {
    return false;
  }
  return true;
}

export async function relocateBrokenLinkInMain(
  requestValue: unknown,
  dependencies: Pick<
    FilesCleanupMainDependencies,
    'getItems' | 'userDataPath' | 'invalidate'
  >,
): Promise<FilesRelocateResult> {
  if (!requestValue || typeof requestValue !== 'object' || Array.isArray(requestValue)) {
    return { ok: false, itemId: '', reasonKey: 'filesApp.cleanup.relocate.invalidRequest' };
  }
  const raw = requestValue as { itemId?: unknown; path?: unknown };
  if (typeof raw.itemId !== 'string' || !raw.itemId.trim() || raw.itemId.length > 1_024) {
    return { ok: false, itemId: '', reasonKey: 'filesApp.cleanup.relocate.invalidRequest' };
  }
  if (typeof raw.path !== 'string' || !isAbsoluteFilePath(raw.path)) {
    return { ok: false, itemId: raw.itemId, reasonKey: 'filesApp.cleanup.relocate.invalidRequest' };
  }

  const item = dependencies.getItems().find((candidate) => candidate.id === raw.itemId);
  if (!item) {
    return { ok: false, itemId: raw.itemId, reasonKey: 'filesApp.cleanup.relocate.notFound' };
  }
  if (item.flags?.brokenLink !== true) {
    // Relocating a healthy row would silently repoint a working record at
    // something else. The refusal names that rather than doing it.
    return { ok: false, itemId: raw.itemId, reasonKey: 'filesApp.cleanup.relocate.notBroken' };
  }
  if (!isRelocatable(item as FilesCleanupInput)) {
    return { ok: false, itemId: raw.itemId, reasonKey: 'filesApp.cleanup.relocate.unsupported' };
  }
  // "Does what it says" means the new target must exist. Repointing at another
  // missing path would replace one broken link with a differently broken one.
  if (!fs.existsSync(raw.path)) {
    return { ok: false, itemId: raw.itemId, reasonKey: 'filesApp.cleanup.relocate.missingTarget' };
  }

  if (!relocateMediaRow(dependencies.userDataPath(), item.id, raw.path)) {
    return { ok: false, itemId: raw.itemId, reasonKey: 'filesApp.cleanup.relocate.failed' };
  }
  dependencies.invalidate();
  return { ok: true, itemId: raw.itemId, path: raw.path };
}

/** Registration is dependency-injected so the boundary has a unit test. */
export function registerFilesCleanupIpc(
  ipc: FilesIpcHandleRegistrar,
  dependencies: FilesCleanupMainDependencies,
): void {
  ipc.handle(FILES_CLEANUP_PLAN_CHANNEL, (_event, overrides) =>
    planCleanupInMain(
      dependencies,
      overrides && typeof overrides === 'object' && !Array.isArray(overrides)
        ? normalizeCleanupSettings(overrides)
        : undefined,
    ),
  );
  ipc.handle(FILES_CLEANUP_RUN_CHANNEL, (_event, request) =>
    runCleanupInMain(request, dependencies, 'manual'),
  );
  ipc.handle(FILES_CLEANUP_RELOCATE_CHANNEL, (_event, request) =>
    relocateBrokenLinkInMain(request, dependencies),
  );
}
