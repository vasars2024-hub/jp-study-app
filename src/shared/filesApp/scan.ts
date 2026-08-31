/**
 * Gate 23 — bulk scan, as a pure model.
 *
 * The gate: "Point it at a folder holding a mixed set — subtitles, an epub, a
 * dictionary zip, a video — and it reports a count per destination. Report the
 * number found, the number placed and the number left ambiguous; 'scanned
 * successfully' with no numbers is not a pass."
 *
 * So the report IS the feature. Everything here exists to make a scan's answer
 * arithmetic rather than an adjective: every candidate the walk considered lands
 * in exactly one of four buckets, and the four sum to `found`. A file that is
 * neither placed nor ambiguous nor refused would be a file the report lost.
 *
 * **Placement is decided by the router, never re-decided here.**
 * `preferredTarget` and `needsTriage` are the drop router's own answers and are
 * reused verbatim. A second opinion in this module would mean a file could scan
 * into a destination the drop router would refuse, and the two paths the plan
 * insists are one classifier would quietly become two.
 *
 * **An incomplete file is skipped, not classified.** A `.crdownload` is not an
 * unrecognised file — it is a file that is not finished, and calling it
 * "ambiguous" would put a half-written video in a review queue where a user
 * would confirm it. That distinction is gate 26's, and it starts here.
 */
import {
  needsTriage,
  preferredTarget,
  targetLabelKey,
  type DropCandidate,
  type DropConfidence,
  type DropTargetId,
} from '../fileRouting';
import { extOf } from '../mediaKind';

/**
 * Extensions a download is still being written to.
 *
 * Browsers, torrent clients and the app's own downloader each have their own,
 * and none of them is an app format — so the list is a skip list and never a
 * classification. `.tmp` is deliberately included: it is the generic form and
 * nothing the app can import ever carries it.
 */
export const INCOMPLETE_EXT: ReadonlySet<string> = new Set([
  '.crdownload',
  '.part',
  '.partial',
  '.!qb',
  '.!ut',
  '.tmp',
  '.download',
  '.opdownload',
]);

export function isIncompleteName(name: string): boolean {
  return INCOMPLETE_EXT.has(extOf(name));
}

/** Where one considered file ended up. The four buckets sum to `found`. */
export type FilesScanSettlement = 'placed' | 'ambiguous' | 'unplaced';

export interface FilesScanEntry {
  path: string;
  name: string;
  sizeBytes: number;
  target: DropTargetId;
  confidence: DropConfidence;
  /** i18n key: why the router chose this. Never English text. */
  reasonKey: string;
  /** More than one means the router offered a choice rather than an answer. */
  candidateCount: number;
  settlement: FilesScanSettlement;
  /** Set when content sniffing settled an extension-level ambiguity. */
  sniffed?: boolean;
}

/** Why a file was not even classified. Always a key, never a bare count. */
export interface FilesScanSkip {
  path: string;
  reasonKey: string;
}

export const SCAN_SKIP_INCOMPLETE = 'filesApp.scan.skip.incomplete';
export const SCAN_SKIP_UNREADABLE = 'filesApp.scan.skip.unreadable';
export const SCAN_SKIP_LIMIT = 'filesApp.scan.skip.limit';

export interface FilesScanDestination {
  target: DropTargetId;
  /** The name the report prints, resolved by the caller through `t()`. */
  labelKey: string;
  placed: number;
  ambiguous: number;
  total: number;
}

export interface FilesScanReport {
  roots: string[];
  /** Files considered — classified, whether or not they were placed. */
  found: number;
  placed: number;
  ambiguous: number;
  /** Classified and refused: the router has no home for this at all. */
  unplaced: number;
  /** Never classified: incomplete, unreadable, or past the walk limit. */
  skipped: number;
  /** The walk stopped early. A scan that hit its ceiling must say so. */
  truncated: boolean;
  elapsedMs: number;
  byDestination: FilesScanDestination[];
  entries: FilesScanEntry[];
  skips: FilesScanSkip[];
}

/**
 * Which bucket a classified file falls in.
 *
 * `unplaced` is separated from `ambiguous` because they ask the user for
 * different things: an ambiguous file has two valid homes and needs a choice, an
 * unplaced one has none and needs either a new handler or nothing at all.
 * Folding them together would make a report that says "12 to review" when 11 of
 * them cannot be reviewed into anywhere.
 */
export function settlementOf(candidates: readonly DropCandidate[]): FilesScanSettlement {
  const first = preferredTarget(candidates);
  if (first.target === 'unknown') return 'unplaced';
  if (needsTriage(candidates)) return 'ambiguous';
  // Two exact candidates is still a choice the user has to make.
  return candidates.length > 1 ? 'ambiguous' : 'placed';
}

export function scanEntryFor(
  file: { path: string; name: string; sizeBytes: number; sniffed?: boolean },
  candidates: readonly DropCandidate[],
): FilesScanEntry {
  const first = preferredTarget(candidates);
  return {
    path: file.path,
    name: file.name,
    sizeBytes: file.sizeBytes,
    target: first.target,
    confidence: first.confidence,
    reasonKey: first.reasonKey,
    candidateCount: candidates.length,
    settlement: settlementOf(candidates),
    sniffed: file.sniffed || undefined,
  };
}

/**
 * The grouped report. Destinations are ordered by size and then by name, so two
 * runs over the same folder print the same table — a report whose row order
 * moves cannot be diffed against the previous run, which is what gate 29's
 * "imports nothing the second time and says so" is checked against.
 */
export function buildScanReport(args: {
  roots: readonly string[];
  entries: readonly FilesScanEntry[];
  skips: readonly FilesScanSkip[];
  truncated: boolean;
  elapsedMs: number;
}): FilesScanReport {
  const byTarget = new Map<DropTargetId, FilesScanDestination>();
  let placed = 0;
  let ambiguous = 0;
  let unplaced = 0;

  for (const entry of args.entries) {
    let row = byTarget.get(entry.target);
    if (!row) {
      row = {
        target: entry.target,
        labelKey: targetLabelKey(entry.target),
        placed: 0,
        ambiguous: 0,
        total: 0,
      };
      byTarget.set(entry.target, row);
    }
    row.total += 1;
    if (entry.settlement === 'placed') {
      row.placed += 1;
      placed += 1;
    } else if (entry.settlement === 'ambiguous') {
      row.ambiguous += 1;
      ambiguous += 1;
    } else {
      unplaced += 1;
    }
  }

  const byDestination = [...byTarget.values()].sort(
    (a, b) => b.total - a.total || a.target.localeCompare(b.target),
  );

  return {
    roots: [...args.roots],
    found: args.entries.length,
    placed,
    ambiguous,
    unplaced,
    skipped: args.skips.length,
    truncated: args.truncated,
    elapsedMs: args.elapsedMs,
    byDestination,
    entries: [...args.entries],
    skips: [...args.skips],
  };
}

/** The report's own invariant, so a caller can assert it rather than trust it. */
export function scanReportBalances(report: FilesScanReport): boolean {
  return report.placed + report.ambiguous + report.unplaced === report.found;
}
