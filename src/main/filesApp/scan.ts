/**
 * Gate 23 — the walk that supplies the volume.
 *
 * `planForPath` already classifies one path. Bulk scan is that, applied to a
 * tree, plus the two things a single drop never has to decide: what to skip, and
 * when to stop.
 *
 * **Strictly read-only, and structurally so.** The plan's rule is "never modify
 * what it did not create", and gate 24 checks it. This module imports `fs` and
 * uses exactly four of its members — `readdirSync`, `statSync`, `lstatSync` and
 * `Dirent` — none of which can write. There is deliberately no `fs` handle
 * passed in that a caller could swap for a writing one, and no path in here
 * copies, renames or deletes; import is a separate, later, confirmed step.
 *
 * **Symlinks are not followed.** `lstatSync` on a directory entry is what stops
 * a junction pointing at `C:\` from turning a Downloads scan into a whole-drive
 * walk, and what stops a symlink cycle from never terminating. The walk limit is
 * the second, cruder guard behind it.
 *
 * **The classifier is injected but defaults to the real one.** The default is
 * `planForPath`, so production has one classifier and the plan's "the drop
 * router already solves this" stays true. The seam exists so a test can measure
 * the walk itself — skip rules, limits, ordering — without the classifier's
 * content sniffing in the way; the gate's own run uses the real one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { planForPath, type DropPlan } from '../fileRouter';
import {
  SCAN_SKIP_INCOMPLETE,
  SCAN_SKIP_LIMIT,
  SCAN_SKIP_UNREADABLE,
  buildScanReport,
  isIncompleteName,
  scanEntryFor,
  type FilesScanEntry,
  type FilesScanReport,
  type FilesScanSkip,
} from '../../shared/filesApp/scan';

/**
 * How many files one scan will classify.
 *
 * Each one costs a `stat` and, for `.zip`/`.json`, a read — so an unbounded walk
 * over a media drive is minutes of disk with no way to interrupt it. The report
 * carries `truncated`, so a scan that hits this says so rather than reporting a
 * count that silently means "the first 5,000".
 */
export const SCAN_FILE_LIMIT = 5_000;

/** Directory names never worth walking. Not a classification — a walk rule. */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '$RECYCLE.BIN',
  'System Volume Information',
]);

export interface FilesScanOptions {
  /** Defaults to `planForPath`; see the header for why the seam exists. */
  classify?: (filePath: string) => DropPlan;
  fileLimit?: number;
  /** Walk sub-directories. A false here scans one folder's own files only. */
  recursive?: boolean;
  now?: () => number;
}

/**
 * Classify everything under `roots` and report it grouped by destination.
 *
 * Never throws: an unreadable root or entry becomes a named skip, because a scan
 * that dies on one permission error has thrown away the other 4,999 answers.
 */
export function scanRoots(
  roots: readonly string[],
  options: FilesScanOptions = {},
): FilesScanReport {
  const classify = options.classify ?? planForPath;
  const limit = options.fileLimit ?? SCAN_FILE_LIMIT;
  const recursive = options.recursive ?? true;
  const now = options.now ?? Date.now;
  const startedAt = now();

  const entries: FilesScanEntry[] = [];
  const skips: FilesScanSkip[] = [];
  let truncated = false;

  const usableRoots: string[] = [];
  for (const root of roots) {
    if (typeof root !== 'string' || !root) continue;
    try {
      if (!fs.statSync(root).isDirectory()) {
        skips.push({ path: root, reasonKey: SCAN_SKIP_UNREADABLE });
        continue;
      }
      usableRoots.push(root);
    } catch {
      skips.push({ path: root, reasonKey: SCAN_SKIP_UNREADABLE });
    }
  }

  // Breadth-ish, but ordered: `readdirSync` is already sorted on NTFS and the
  // queue preserves it, so two scans of an unchanged tree produce the same
  // report in the same order. Gate 29 compares two runs; an unstable order
  // would make that comparison meaningless.
  const queue: string[] = [...usableRoots];
  walk: while (queue.length > 0) {
    const current = queue.shift() as string;
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      skips.push({ path: current, reasonKey: SCAN_SKIP_UNREADABLE });
      continue;
    }

    for (const entry of dirEntries) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!recursive || SKIP_DIRS.has(entry.name)) continue;
        // A junction or symlink is not descended: see the header.
        try {
          if (fs.lstatSync(full).isSymbolicLink()) continue;
        } catch {
          skips.push({ path: full, reasonKey: SCAN_SKIP_UNREADABLE });
          continue;
        }
        queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;

      // Gate 26 starts here: an unfinished download is skipped by NAME before
      // anything reads it, so a half-written video is never classified at all.
      if (isIncompleteName(entry.name)) {
        skips.push({ path: full, reasonKey: SCAN_SKIP_INCOMPLETE });
        continue;
      }

      // The ceiling stops the WALK, and records itself once. Skipping each
      // remaining file individually would put a skip row in memory for every
      // file on a media drive — the report would cost more than the scan it
      // refused to do. `truncated` is the honest form of "there is more".
      if (entries.length >= limit) {
        truncated = true;
        skips.push({ path: full, reasonKey: SCAN_SKIP_LIMIT });
        break walk;
      }

      let plan: DropPlan;
      try {
        plan = classify(full);
      } catch {
        skips.push({ path: full, reasonKey: SCAN_SKIP_UNREADABLE });
        continue;
      }
      entries.push(
        scanEntryFor(
          { path: full, name: entry.name, sizeBytes: plan.sizeBytes, sniffed: plan.sniffed },
          plan.candidates,
        ),
      );
    }
  }

  return buildScanReport({
    roots: usableRoots,
    entries,
    skips,
    truncated,
    elapsedMs: Math.max(0, now() - startedAt),
  });
}
