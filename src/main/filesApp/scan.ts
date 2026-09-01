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
  type FilesScanSkip,
} from '../../shared/filesApp/scan';
import {
  DEFAULT_STABILITY_MS,
  StabilityLedger,
  observeSize,
  stabilityVerdict,
  type StabilityVerdict,
} from '../../shared/filesApp/stability';
import {
  shouldExpandArchive,
  type FilesArchiveFinding,
  type FilesScanReportWithArchives,
} from '../../shared/filesApp/archive';
import { expandArchive } from './archive';

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
  /**
   * Gate 26's second half. Supply a ledger carried across passes and a file
   * whose size is still moving is skipped, not classified — a one-shot scan has
   * no previous reading to compare against, so it cannot make this judgement and
   * deliberately does not pretend to.
   */
  stability?: StabilityLedger;
  stabilityMs?: number;
  /**
   * Gate 31's production half. With no ledger a one-shot scan has no earlier
   * reading of its own — but the filesystem has one, so `mtimeMs` seeds the
   * moment the size last changed and the window is measured against that. Off
   * by default: a caller that supplies its own ledger across passes is already
   * making the judgement, and the tests that measure the ledger's own clause
   * order must not have a second source of "earlier" folded into them.
   */
  stabilityFromMtime?: boolean;
  /**
   * Gate 28. Open an archive the router could not settle and classify what the
   * index lists. On by default — "paste a folder sorts all of it" is the gate,
   * and an unopened `.zip` is a hole in the sort. Off is for the walk's own
   * tests, which measure skip rules and limits and must not also pay for a
   * `.zip` read per fixture.
   */
  expandArchives?: boolean;
  /** How many members ONE archive may contribute. See `ARCHIVE_MEMBER_LIMIT`. */
  archiveMemberLimit?: number;
  /** Test seam, threaded to `expandArchive`. Never writes. */
  readArchiveIndex?: (archivePath: string) => import('../../shared/filesApp/archive').ArchiveMember[];
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
): FilesScanReportWithArchives {
  const classify = options.classify ?? planForPath;
  const limit = options.fileLimit ?? SCAN_FILE_LIMIT;
  const recursive = options.recursive ?? true;
  const now = options.now ?? Date.now;
  const stability = options.stability;
  const stabilityMs = options.stabilityMs ?? DEFAULT_STABILITY_MS;
  const fromMtime = options.stabilityFromMtime ?? false;
  const expandArchives = options.expandArchives ?? true;
  const startedAt = now();

  const entries: FilesScanEntry[] = [];
  const skips: FilesScanSkip[] = [];
  const archives: FilesArchiveFinding[] = [];
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

      // Gate 26's other half, and the one a name cannot answer: a torrent
      // client writing `ep01.mkv` in place produces an ordinary name for a file
      // that is only partly there. This runs BEFORE the classifier, so a
      // half-written archive is never opened and sniffed.
      if (stability || fromMtime) {
        let stat: fs.Stats;
        try {
          stat = fs.statSync(full);
        } catch {
          skips.push({ path: full, reasonKey: SCAN_SKIP_UNREADABLE });
          continue;
        }
        const at = now();
        const hint = fromMtime ? stat.mtimeMs : undefined;
        // With a ledger, its own record wins on the second and later passes and
        // the hint only ever seeds a first sighting — `observeSize` ignores it
        // once there is a previous reading for this path.
        const observation = stability
          ? stability.observe(full, stat.size, at, hint)
          : observeSize(undefined, { path: full, sizeBytes: stat.size, at, changedAtHint: hint });
        const verdict: StabilityVerdict = stabilityVerdict(observation, at, stabilityMs);
        if (!verdict.stable) {
          skips.push({ path: full, reasonKey: verdict.reasonKey ?? SCAN_SKIP_INCOMPLETE });
          continue;
        }
      }

      let plan: DropPlan;
      try {
        plan = classify(full);
      } catch {
        skips.push({ path: full, reasonKey: SCAN_SKIP_UNREADABLE });
        continue;
      }
      const scanned = scanEntryFor(
        { path: full, name: entry.name, sizeBytes: plan.sizeBytes, sniffed: plan.sniffed },
        plan.candidates,
      );
      entries.push(scanned);

      // Gate 28. AFTER the entry is pushed, so an archive whose index cannot be
      // read still counts as one classified file — the archive itself was
      // classified perfectly well, it is only its contents that are unknown.
      if (expandArchives && shouldExpandArchive(scanned)) {
        archives.push({
          path: full,
          report: expandArchive(full, {
            memberLimit: options.archiveMemberLimit,
            readIndex: options.readArchiveIndex,
          }),
        });
      }
    }
  }

  return {
    ...buildScanReport({
      roots: usableRoots,
      entries,
      skips,
      truncated,
      elapsedMs: Math.max(0, now() - startedAt),
    }),
    archives,
  };
}
