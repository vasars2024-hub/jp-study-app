/**
 * Gate 28 — reading an archive's index, and nothing else.
 *
 * **Read-only, and structurally so**, exactly as `filesApp/scan.ts` argues for
 * the walk. This module imports `adm-zip` and uses precisely one of its members,
 * `getEntries()`, which reads the central directory at the tail of the file.
 * `extractAllTo`, `extractEntryTo` and `writeZip` are never called and there is
 * no seam a caller could pass a writing handle through. Gate 24's "every
 * original file is byte-identical after a scan" therefore stays a property of
 * the code rather than a claim about a temp directory somewhere.
 *
 * **`getData()` is deliberately not called either**, even though it would let a
 * `.json` or nested `.zip` member be sniffed the way `fileRouterPlanning.ts`
 * sniffs one on disk. Decompressing member bodies is the expensive half and the
 * one a hostile archive can weaponise; the index alone is a name and a size, and
 * a member the name cannot settle is reported ambiguous, which is the truth.
 *
 * The one thing the index does give away for free is the UNCOMPRESSED size,
 * which `header.size` carries — so member sizes in the report are real bytes,
 * not compressed bytes, and a "3.2 GB of video inside" reading is honest.
 */
import AdmZip from 'adm-zip';
import {
  classifyArchiveMembers,
  unreadableArchiveReport,
  type ArchiveMember,
  type FilesArchiveReport,
} from '../../shared/filesApp/archive';

export interface ReadArchiveOptions {
  memberLimit?: number;
  /** Test seam. Defaults to the real `adm-zip` index read; never writes. */
  readIndex?: (archivePath: string) => ArchiveMember[];
}

/**
 * List an archive's members. Throws only what the caller turns into a skip.
 *
 * `entryName` is normalised to forward slashes because zip stores them that way
 * by spec but some writers emit backslashes; a member reported as
 * `sub\ep01.srt` would have its leaf read as the whole string and classify as
 * unknown.
 */
export function readArchiveIndex(archivePath: string): ArchiveMember[] {
  const zip = new AdmZip(archivePath);
  return zip.getEntries().map((entry) => ({
    entryName: entry.entryName.replace(/\\/g, '/'),
    // `header.size` is the uncompressed size. `entry.header.compressedSize` is
    // the other one and would understate a text-heavy archive several-fold.
    sizeBytes: typeof entry.header?.size === 'number' ? entry.header.size : 0,
    isDirectory: entry.isDirectory,
  }));
}

/**
 * The whole of gate 28's archive half for one file: open, classify, report.
 *
 * Never throws. An archive that is corrupt, truncated, password-protected or
 * simply not a zip becomes a report that says `unreadable` with a named skip —
 * because a scan that dies on one bad archive has thrown away every other
 * answer in the folder, which is the same argument `scanRoots` makes about a
 * permission error on one directory.
 */
export function expandArchive(
  archivePath: string,
  options: ReadArchiveOptions = {},
): FilesArchiveReport {
  const read = options.readIndex ?? readArchiveIndex;
  let members: ArchiveMember[];
  try {
    members = read(archivePath);
  } catch {
    return unreadableArchiveReport(archivePath);
  }
  return classifyArchiveMembers(archivePath, members, { memberLimit: options.memberLimit });
}
