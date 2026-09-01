/**
 * Gate 28, model half — "archives are expanded far enough to classify their
 * contents, and the report names placed / skipped / ambiguous with reasons".
 *
 * These are on the pure classifier, so every assertion is on an index the test
 * writes by hand and the arithmetic is checkable by eye. The main-process half
 * (`filesAppArchiveScan.test.ts`) proves the same thing against real `.zip`
 * bytes on real disk, which is what the gate's "with a real file each" habit
 * asks for; this file is where the edge shapes live.
 */
import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_MEMBER_LIMIT,
  ARCHIVE_MEMBER_SEP,
  archiveFindingFor,
  archiveMemberPath,
  archivePathOf,
  archiveReportBalances,
  archiveSummary,
  classifyArchiveMembers,
  isArchiveMemberPath,
  isArchiveName,
  SCAN_SKIP_ARCHIVE_UNREADABLE,
  SCAN_SKIP_NESTED_ARCHIVE,
  shouldExpandArchive,
  unreadableArchiveReport,
  type ArchiveMember,
} from '../filesApp/archive';
import { SCAN_SKIP_INCOMPLETE, SCAN_SKIP_LIMIT } from '../filesApp/scan';

const ZIP = 'C:\\dl\\pack.zip';

function member(entryName: string, sizeBytes = 1024, isDirectory = false): ArchiveMember {
  return { entryName, sizeBytes, isDirectory };
}

describe('gate 28 — which archives are opened at all', () => {
  it('opens a .zip the router could not settle', () => {
    // Two ambiguous candidates is exactly what `classifyByExtension` returns
    // for an unsniffable .zip.
    expect(
      shouldExpandArchive({
        name: 'pack.zip',
        target: 'dictionary-yomitan',
        confidence: 'ambiguous',
        candidateCount: 2,
      }),
    ).toBe(true);
  });

  it('leaves a sniffed Yomitan dictionary alone — it is one dictionary', () => {
    expect(
      shouldExpandArchive({
        name: 'jmdict.zip',
        target: 'dictionary-yomitan',
        confidence: 'exact',
        candidateCount: 1,
      }),
    ).toBe(false);
  });

  it('leaves a .cbz alone — it is one manga volume, not 200 pages', () => {
    expect(
      shouldExpandArchive({
        name: 'vol01.cbz',
        target: 'library-manga',
        confidence: 'exact',
        candidateCount: 1,
      }),
    ).toBe(false);
  });

  it('never opens something that is not an archive', () => {
    expect(
      shouldExpandArchive({
        name: 'ep01.mkv',
        target: 'media',
        confidence: 'exact',
        candidateCount: 1,
      }),
    ).toBe(false);
    expect(
      // Even when the router is unsure about it.
      shouldExpandArchive({
        name: 'notes.json',
        target: 'backup',
        confidence: 'ambiguous',
        candidateCount: 3,
      }),
    ).toBe(false);
  });

  it('agrees with isArchiveName on both members of ARCHIVE_EXT', () => {
    expect(isArchiveName('a.zip')).toBe(true);
    expect(isArchiveName('a.cbz')).toBe(true);
    expect(isArchiveName('a.rar')).toBe(false);
    expect(isArchiveName('a.mkv')).toBe(false);
  });
});

describe('gate 28 — the contents report', () => {
  it('classifies a subtitle pack and names its destination', () => {
    const report = classifyArchiveMembers(ZIP, [
      member('ep01.srt'),
      member('ep02.srt'),
      member('ep03.srt'),
    ]);
    expect(report.memberCount).toBe(3);
    expect(report.found).toBe(3);
    expect(report.placed).toBe(3);
    expect(report.ambiguous).toBe(0);
    expect(report.unplaced).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.byDestination).toHaveLength(1);
    expect(report.byDestination[0].target).toBe('subtitle');
    expect(report.byDestination[0].total).toBe(3);
    expect(report.dominantTarget).toBe('subtitle');
    expect(archiveReportBalances(report)).toBe(true);
  });

  it('every member carries a reason key — the gate says "with reasons"', () => {
    const report = classifyArchiveMembers(ZIP, [
      member('ep01.srt'),
      member('cover.png'),
      member('readme.xyz'),
    ]);
    expect(report.members).toHaveLength(3);
    for (const row of report.members) {
      expect(typeof row.reasonKey).toBe('string');
      expect(row.reasonKey.length).toBeGreaterThan(0);
      // A key, never English text: every one is a dotted i18n key.
      expect(row.reasonKey).toMatch(/^[a-zA-Z]+(\.[a-zA-Z0-9]+)+$/);
    }
  });

  it('separates ambiguous from unplaced, exactly as the top-level report does', () => {
    const report = classifyArchiveMembers(ZIP, [
      member('ep01.srt'), // exact -> placed
      member('cover.png'), // wallpaper vs manga page -> ambiguous
      member('readme.xyz'), // no handler -> unplaced
    ]);
    expect(report.placed).toBe(1);
    expect(report.ambiguous).toBe(1);
    expect(report.unplaced).toBe(1);
    expect(report.found).toBe(3);
    expect(archiveReportBalances(report)).toBe(true);
  });

  it('drops directory rows without losing them from the count', () => {
    const report = classifyArchiveMembers(ZIP, [
      member('subs/', 0, true),
      member('subs/ep01.srt'),
      member('subs/ep02.srt'),
    ]);
    // memberCount is FILES. A directory is structure, not a file the report lost.
    expect(report.memberCount).toBe(2);
    expect(report.found).toBe(2);
    expect(archiveReportBalances(report)).toBe(true);
  });

  it('classifies a nested member by its leaf, not by its whole entry name', () => {
    const report = classifyArchiveMembers(ZIP, [member('season 1/subs/ep01.srt')]);
    expect(report.placed).toBe(1);
    expect(report.members[0].name).toBe('ep01.srt');
    expect(report.members[0].target).toBe('subtitle');
  });

  it('member paths are synthetic and say so', () => {
    const report = classifyArchiveMembers(ZIP, [member('ep01.srt')]);
    const path = report.members[0].path;
    expect(path).toBe(`${ZIP}${ARCHIVE_MEMBER_SEP}ep01.srt`);
    expect(isArchiveMemberPath(path)).toBe(true);
    expect(archivePathOf(path)).toBe(ZIP);
    expect(archivePathOf('C:\\dl\\ep01.srt')).toBeNull();
    expect(archiveMemberPath(ZIP, 'a/b.srt')).toBe(`${ZIP}!/a/b.srt`);
  });

  it('carries UNCOMPRESSED sizes through to the report', () => {
    const report = classifyArchiveMembers(ZIP, [member('ep01.mkv', 3_221_225_472)]);
    expect(report.members[0].sizeBytes).toBe(3_221_225_472);
  });
});

describe('gate 28 — the stated limits, each with its own reason', () => {
  it('names a nested archive rather than opening it', () => {
    const report = classifyArchiveMembers(ZIP, [member('ep01.srt'), member('inner.zip')]);
    expect(report.found).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.skips[0].reasonKey).toBe(SCAN_SKIP_NESTED_ARCHIVE);
    expect(report.skips[0].path).toBe(`${ZIP}${ARCHIVE_MEMBER_SEP}inner.zip`);
    expect(archiveReportBalances(report)).toBe(true);
  });

  it('names a .cbz member as nested too — it is an archive by the same set', () => {
    const report = classifyArchiveMembers(ZIP, [member('vol01.cbz')]);
    expect(report.skips[0].reasonKey).toBe(SCAN_SKIP_NESTED_ARCHIVE);
  });

  it('skips a half-written member by name, as the walk does', () => {
    const report = classifyArchiveMembers(ZIP, [member('ep01.mkv.part')]);
    expect(report.found).toBe(0);
    expect(report.skips[0].reasonKey).toBe(SCAN_SKIP_INCOMPLETE);
  });

  it('stops at the member limit, says truncated, and gives the reason', () => {
    const many = Array.from({ length: 12 }, (_, i) => member(`ep${i}.srt`));
    const report = classifyArchiveMembers(ZIP, many, { memberLimit: 5 });
    expect(report.truncated).toBe(true);
    expect(report.found).toBe(5);
    expect(report.skips.at(-1)?.reasonKey).toBe(SCAN_SKIP_LIMIT);
    // memberCount is still the truth about the archive, not about the report.
    expect(report.memberCount).toBe(12);
    expect(archiveReportBalances(report)).toBe(true);
  });

  it('the default limit is a real number, not Infinity', () => {
    expect(ARCHIVE_MEMBER_LIMIT).toBeGreaterThan(0);
    expect(Number.isFinite(ARCHIVE_MEMBER_LIMIT)).toBe(true);
  });

  it('an unopenable archive reports unreadable with a named skip, not zeros alone', () => {
    const report = unreadableArchiveReport(ZIP);
    expect(report.unreadable).toBe(true);
    expect(report.found).toBe(0);
    expect(report.skips).toEqual([{ path: ZIP, reasonKey: SCAN_SKIP_ARCHIVE_UNREADABLE }]);
    expect(archiveReportBalances(report)).toBe(true);
  });
});

describe('gate 28 — dominantTarget is a summary, never a routing decision', () => {
  it('needs a STRICT majority', () => {
    // 6 subtitles / 5 videos: a plurality, and the leader is under half.
    const mixed = [
      ...Array.from({ length: 6 }, (_, i) => member(`ep${i}.srt`)),
      ...Array.from({ length: 7 }, (_, i) => member(`ep${i}.mkv`)),
    ];
    // 7 of 13 IS a strict majority.
    expect(classifyArchiveMembers(ZIP, mixed).dominantTarget).toBe('media');

    const even = [member('a.srt'), member('b.mkv')];
    expect(classifyArchiveMembers(ZIP, even).dominantTarget).toBeUndefined();
  });

  it('never names `unknown` as a dominant destination', () => {
    const report = classifyArchiveMembers(ZIP, [
      member('a.xyz'),
      member('b.xyz'),
      member('c.xyz'),
    ]);
    expect(report.unplaced).toBe(3);
    expect(report.dominantTarget).toBeUndefined();
  });

  it('is undefined for an empty archive rather than a fabricated answer', () => {
    const report = classifyArchiveMembers(ZIP, []);
    expect(report.found).toBe(0);
    expect(report.dominantTarget).toBeUndefined();
    expect(archiveSummary(report)).toEqual({
      found: 0,
      placed: 0,
      ambiguous: 0,
      skipped: 0,
      dominantTarget: undefined,
    });
  });
});

describe('gate 28 — the report pairing', () => {
  it('finds an archive by the scan entry it belongs to', () => {
    const report = classifyArchiveMembers(ZIP, [member('ep01.srt')]);
    const withArchives = { archives: [{ path: ZIP, report }] };
    expect(archiveFindingFor(withArchives, ZIP)).toBe(report);
    expect(archiveFindingFor(withArchives, 'C:\\dl\\other.zip')).toBeUndefined();
    expect(archiveFindingFor({ archives: [] }, ZIP)).toBeUndefined();
  });
});
