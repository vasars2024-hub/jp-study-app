/**
 * Gate 28 — "archives are expanded far enough to classify their contents".
 *
 * The gate's own words are the whole specification, and two of them decide the
 * design. **"Far enough"** is the archive INDEX — entry names and sizes — and
 * never an extraction: a `.zip` index is a directory at the tail of the file, so
 * listing it is cheap and, more importantly, writes nothing. Gate 24 says a scan
 * leaves every original byte-identical, and extracting to a temp directory would
 * make that a promise about somewhere else rather than a property of the code.
 * **"Classify"** is the other half: the members are *classified and reported*,
 * they are not importable rows. `C:\dl\pack.zip!/ep01.srt` is not a path any
 * importer can open, so a member must never reach `planIngest`. It does not: the
 * report hangs off the archive's own scan entry, and `planIngest` walks the
 * top-level entries only.
 *
 * **An archive the router already settled is a UNIT and is not expanded.**
 * A Yomitan dictionary is one dictionary and a `.cbz` is one manga volume;
 * expanding either would replace one true row with two hundred `.jpg` rows and
 * a report that had lost the answer it already had. The test for "already
 * settled" is gate 27's own `isHighConfidence`, reused rather than restated, so
 * the two gates cannot drift into disagreeing about what certainty means.
 *
 * **Nested archives are named, not opened.** One level is what "far enough"
 * buys; recursing is how a zip bomb turns a scan into an outage. A `.zip` inside
 * a `.zip` becomes a skip with its own reason, which is an honest statement of
 * the limit rather than a silent stop.
 */
import { classifyByExtension, preferredTarget, type DropTargetId } from '../fileRouting';
import { isHighConfidence } from './ingest';
import {
  buildScanReport,
  isIncompleteName,
  scanEntryFor,
  SCAN_SKIP_INCOMPLETE,
  SCAN_SKIP_LIMIT,
  type FilesScanDestination,
  type FilesScanEntry,
  type FilesScanReport,
  type FilesScanSkip,
} from './scan';
import { extOf, ARCHIVE_EXT } from '../mediaKind';

/** The JAR/zip convention, so a member path is never mistaken for a real one. */
export const ARCHIVE_MEMBER_SEP = '!/';

/**
 * How many members one archive contributes to a report.
 *
 * The walk's own ceiling (`SCAN_FILE_LIMIT`) counts archives as one file each,
 * so without a second ceiling a single 40,000-entry archive could outweigh the
 * entire scan around it. `truncated` is the honest form of "there is more".
 */
export const ARCHIVE_MEMBER_LIMIT = 500;

export const SCAN_SKIP_NESTED_ARCHIVE = 'filesApp.scan.skip.nestedArchive';
export const SCAN_SKIP_ARCHIVE_UNREADABLE = 'filesApp.scan.skip.archiveUnreadable';

/** One row of an archive's index. Names and sizes only — never bytes. */
export interface ArchiveMember {
  /** Entry name as the index stores it, forward-slashed, may contain folders. */
  entryName: string;
  sizeBytes: number;
  isDirectory: boolean;
}

/**
 * What one archive turned out to hold.
 *
 * Deliberately the same vocabulary as `FilesScanReport` — placed / ambiguous /
 * unplaced / skipped, grouped `byDestination`, every skip carrying a reason —
 * because gate 28 asks for the same three words gate 23 already answers. A
 * fifth report shape would mean a second place for the arithmetic to be wrong.
 */
export interface FilesArchiveReport {
  /** Files the index listed, before the member limit. Directories excluded. */
  memberCount: number;
  /** Members actually classified. `found + skipped === memberCount` holds. */
  found: number;
  placed: number;
  ambiguous: number;
  unplaced: number;
  skipped: number;
  truncated: boolean;
  byDestination: FilesScanDestination[];
  members: FilesScanEntry[];
  skips: FilesScanSkip[];
  /**
   * The destination holding a strict majority of the classified members, if
   * there is one. This is a REPORT field and never a routing decision — it lets
   * the surface say "12 of 14 are subtitles" without this module quietly
   * overruling the router, which owns where the archive itself goes.
   */
  dominantTarget?: DropTargetId;
  /** Set when the archive could not be opened at all. Then every count is 0. */
  unreadable?: boolean;
}

/**
 * One expanded archive, paired with the scan entry it belongs to.
 *
 * This hangs off the REPORT rather than off `FilesScanEntry`, and the reason is
 * structural rather than stylistic: `archive.ts` reuses `scan.ts`'s
 * `scanEntryFor`/`buildScanReport`, so a field on `FilesScanEntry` would make
 * `scan.ts` name a type from here and close an import cycle inside `src/shared`
 * — which `tools/architecture-audit.cjs` reports as `shared-cycle`, correctly.
 * The pairing is by `path`, which is the archive entry's own `path`.
 */
export interface FilesArchiveFinding {
  path: string;
  report: FilesArchiveReport;
}

/**
 * A scan report that also carries what it found inside archives.
 *
 * Extends rather than replaces, so every existing consumer of `FilesScanReport`
 * — `planIngest`, the review sheet, the import ledger — keeps working untouched
 * and simply ignores a field it does not read.
 */
export interface FilesScanReportWithArchives extends FilesScanReport {
  archives: FilesArchiveFinding[];
}

/** Find one archive's contents in a report, by the archive entry's own path. */
export function archiveFindingFor(
  report: Pick<FilesScanReportWithArchives, 'archives'>,
  archivePath: string,
): FilesArchiveReport | undefined {
  return report.archives?.find((finding) => finding.path === archivePath)?.report;
}

/** The synthetic path a member is reported under. Never a real filesystem path. */
export function archiveMemberPath(archivePath: string, entryName: string): string {
  return `${archivePath}${ARCHIVE_MEMBER_SEP}${entryName}`;
}

export function isArchiveMemberPath(candidate: string): boolean {
  return candidate.includes(ARCHIVE_MEMBER_SEP);
}

/** The archive path a member row came from, or null if it is not a member. */
export function archivePathOf(memberPath: string): string | null {
  const at = memberPath.indexOf(ARCHIVE_MEMBER_SEP);
  return at < 0 ? null : memberPath.slice(0, at);
}

export function isArchiveName(name: string): boolean {
  return ARCHIVE_EXT.has(extOf(name));
}

/**
 * Should this scanned archive be opened?
 *
 * `false` for anything that is not an archive at all, and for an archive the
 * router settled with certainty — see the header for why a settled archive is a
 * unit. Everything else is a `.zip` the sniffer could not place, which is
 * exactly the case the gate exists for.
 */
export function shouldExpandArchive(
  entry: Pick<FilesScanEntry, 'name' | 'target' | 'confidence' | 'candidateCount'>,
): boolean {
  if (!isArchiveName(entry.name)) return false;
  return !isHighConfidence(entry);
}

/**
 * Classify an archive's index.
 *
 * Pure: the caller supplies the members, so the model is testable without a
 * `.zip` on disk and the main-process reader stays the only thing that touches
 * one. Directories are dropped rather than skipped — a folder inside an archive
 * is structure, not a file the report lost.
 */
export function classifyArchiveMembers(
  archivePath: string,
  members: readonly ArchiveMember[],
  options: { memberLimit?: number } = {},
): FilesArchiveReport {
  const limit = options.memberLimit ?? ARCHIVE_MEMBER_LIMIT;
  const files = members.filter((member) => !member.isDirectory);

  const entries: FilesScanEntry[] = [];
  const skips: FilesScanSkip[] = [];
  let truncated = false;

  for (const member of files) {
    const leaf = member.entryName.split('/').filter(Boolean).pop() ?? member.entryName;
    const memberPath = archiveMemberPath(archivePath, member.entryName);

    if (entries.length + skips.length >= limit) {
      truncated = true;
      skips.push({ path: memberPath, reasonKey: SCAN_SKIP_LIMIT });
      break;
    }
    if (isIncompleteName(leaf)) {
      skips.push({ path: memberPath, reasonKey: SCAN_SKIP_INCOMPLETE });
      continue;
    }
    if (isArchiveName(leaf)) {
      skips.push({ path: memberPath, reasonKey: SCAN_SKIP_NESTED_ARCHIVE });
      continue;
    }

    // Name-only, and that is the honest ceiling of reading an index: the bytes
    // that would let `sniffZip`/`sniffJson` settle a `.zip` or `.json` member
    // are not read, so such a member stays ambiguous rather than being given a
    // certainty this module did not earn.
    entries.push(
      scanEntryFor(
        { path: memberPath, name: leaf, sizeBytes: member.sizeBytes },
        classifyByExtension(leaf),
      ),
    );
  }

  const grouped = buildScanReport({
    roots: [archivePath],
    entries,
    skips,
    truncated,
    elapsedMs: 0,
  });

  return {
    memberCount: files.length,
    found: grouped.found,
    placed: grouped.placed,
    ambiguous: grouped.ambiguous,
    unplaced: grouped.unplaced,
    skipped: grouped.skipped,
    truncated: grouped.truncated,
    byDestination: grouped.byDestination,
    members: grouped.entries,
    skips: grouped.skips,
    dominantTarget: dominantTargetOf(grouped.byDestination, grouped.found),
  };
}

/** The report an unopenable archive gets: zeroed, and saying so. */
export function unreadableArchiveReport(archivePath: string): FilesArchiveReport {
  return {
    memberCount: 0,
    found: 0,
    placed: 0,
    ambiguous: 0,
    unplaced: 0,
    skipped: 1,
    truncated: false,
    byDestination: [],
    members: [],
    skips: [{ path: archivePath, reasonKey: SCAN_SKIP_ARCHIVE_UNREADABLE }],
    unreadable: true,
  };
}

/**
 * A STRICT majority, not a plurality.
 *
 * 6 subtitles and 5 videos is a mixed archive and the surface should say so;
 * calling it "mostly subtitles" would be a summary the contents do not support.
 */
function dominantTargetOf(
  byDestination: readonly FilesScanDestination[],
  found: number,
): DropTargetId | undefined {
  if (found <= 0) return undefined;
  const top = byDestination[0];
  if (!top || top.target === 'unknown') return undefined;
  return top.total * 2 > found ? top.target : undefined;
}

/** The report's own invariant, so a caller asserts it rather than trusting it. */
export function archiveReportBalances(report: FilesArchiveReport): boolean {
  return (
    report.placed + report.ambiguous + report.unplaced === report.found
    && (report.truncated || report.unreadable === true
      || report.found + report.skipped === report.memberCount)
  );
}

/**
 * A one-line summary of an archive, as counts the caller prints through `t()`.
 *
 * Returned as numbers plus a target id — never as a formatted string — because
 * every word around them is i18n's job and a sentence assembled here would be
 * English hardcoded into a shared module.
 */
export function archiveSummary(report: FilesArchiveReport): {
  found: number;
  placed: number;
  ambiguous: number;
  skipped: number;
  dominantTarget?: DropTargetId;
} {
  return {
    found: report.found,
    placed: report.placed,
    ambiguous: report.ambiguous,
    skipped: report.skipped,
    dominantTarget: report.dominantTarget,
  };
}

/** Ranked candidates for a member, for a surface that wants to show the choice. */
export function archiveMemberCandidates(member: Pick<FilesScanEntry, 'name'>) {
  const candidates = classifyByExtension(member.name);
  return { candidates, preferred: preferredTarget(candidates) };
}
