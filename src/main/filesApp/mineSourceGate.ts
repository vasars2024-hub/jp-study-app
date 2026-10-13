/**
 * The Files app's mine path, privileged half: which file may be read.
 *
 * `filesapp:mine-source` used to take the renderer's `location` at its word —
 * any `{ store: 'file', path }` reached `readFilesMineSource`, so a
 * compromised renderer could read any subtitle/JSON/EPUB on disk through it,
 * while the handler's comment said the catalogue stopped that (scorecard
 * bug 15). Delete already worked the safe way: the renderer names a row and
 * main re-reads the row from its own index. This is the same rule for reads:
 * the path must be a file-backed row of main's index, and the reader is
 * chosen from that row's kind, not from what the request claims.
 */
import path from 'node:path';
import type { FilesItem, FilesLocation } from '../../shared/filesApp/catalog';

export type FilesMineKind = 'transcript' | 'subtitle' | 'book';

export type FilesMineGateResult =
  | { ok: true; path: string; kind: FilesMineKind }
  | { ok: false; reasonKey: string };

const MINE_KINDS: ReadonlySet<string> = new Set<FilesMineKind>(['transcript', 'subtitle', 'book']);

/** Same file, as the OS compares paths (case-insensitive on Windows). */
export function sameFilePath(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const lib = platform === 'win32' ? path.win32 : path.posix;
  const ra = lib.resolve(a);
  const rb = lib.resolve(b);
  return platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

/**
 * Resolve a mine request against main's index. `null` from `items` lookup
 * means "not in this snapshot" — the caller may rebuild the index once and
 * ask again before refusing.
 */
export function resolveFilesMineRequest(
  items: readonly Pick<FilesItem, 'kind' | 'location'>[],
  location: unknown,
  kind: unknown,
  platform: NodeJS.Platform = process.platform,
): FilesMineGateResult {
  if (!location || typeof location !== 'object') {
    return { ok: false, reasonKey: 'filesApp.mine.refuse.notFileBacked' };
  }
  const requested = location as Partial<FilesLocation> & { path?: unknown };
  if (requested.store !== 'file' || typeof requested.path !== 'string' || !requested.path.trim()) {
    return { ok: false, reasonKey: 'filesApp.mine.refuse.notFileBacked' };
  }
  if (typeof kind !== 'string' || !MINE_KINDS.has(kind)) {
    return { ok: false, reasonKey: 'filesApp.mine.refuse.kindHasNoText' };
  }
  const requestedPath = requested.path;
  const row = items.find(
    (item) => item.location.store === 'file' && sameFilePath(item.location.path, requestedPath, platform),
  );
  // Not a row of the catalogue, or a row of another kind: either way the
  // request is not one the catalogue would make.
  if (!row || row.kind !== kind || row.location.store !== 'file') {
    return { ok: false, reasonKey: 'filesApp.mine.refuse.notIndexed' };
  }
  // The index's own path, not the request's spelling of it.
  return { ok: true, path: row.location.path, kind: row.kind as FilesMineKind };
}
