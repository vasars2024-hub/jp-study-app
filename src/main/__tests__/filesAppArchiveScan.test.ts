// @vitest-environment node
/**
 * Gate 28 — "**Paste a folder sorts all of it.** A pasted folder is walked
 * recursively, archives are expanded far enough to classify their contents, and
 * the report names placed / skipped / ambiguous with reasons."
 *
 * Live, on real bytes. Every `.zip` here is written to a real temp directory by
 * `adm-zip` and then read back through the PRODUCTION `scanRoots` with the
 * PRODUCTION `planForPath` — no classifier seam, no fake index — because the
 * gate's own currency in this plan is a real file per claim. `expandArchive`'s
 * `readIndex` seam exists and is exercised in exactly one place, the corrupt
 * case, and even there the corrupt file is real.
 *
 * The three clauses are asserted separately, so a failure names which one broke:
 *   1. recursion  — a file three folders down is in the report;
 *   2. expansion  — a `.zip` the router cannot settle has its contents counted;
 *   3. reasons    — every placed, ambiguous and skipped row carries an i18n key.
 *
 * And the read-only property is re-measured here rather than inherited from
 * gate 24: this slice is the first thing in the scan path that OPENS a file the
 * user owns, so "the scan changed nothing" had to be re-earned. Every fixture
 * is SHA-256'd before and after.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { scanRoots } from '../filesApp/scan';
import { expandArchive, readArchiveIndex } from '../filesApp/archive';
import {
  archiveFindingFor,
  archiveReportBalances,
  ARCHIVE_MEMBER_SEP,
  SCAN_SKIP_ARCHIVE_UNREADABLE,
  SCAN_SKIP_NESTED_ARCHIVE,
} from '../../shared/filesApp/archive';
import { SCAN_SKIP_LIMIT, scanReportBalances } from '../../shared/filesApp/scan';

let root = '';

/** path -> sha256, for the gate-24 re-measurement. */
const fingerprint = new Map<string, string>();

function sha(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fingerprintTree(dir: string, into: Map<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) fingerprintTree(full, into);
    else into.set(full, sha(full));
  }
}

function zipTo(file: string, entries: Array<[string, Buffer | string]>): void {
  const zip = new AdmZip();
  for (const [name, body] of entries) {
    zip.addFile(name, Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'));
  }
  zip.writeZip(file);
}

/** A PNG small enough to write inline and real enough for the extension rules. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001'
    + '0d0a2db40000000049454e44ae426082',
  'hex',
);

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-arch-'));

  // Clause 1: recursion. Three levels deep, with a plain file at the bottom.
  const deep = path.join(root, 'season 1', 'subs', 'raw');
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, 'buried.srt'), '1\n00:00:01,000 --> 00:00:02,000\n猫\n');
  fs.writeFileSync(path.join(root, 'season 1', 'ep01.mkv'), Buffer.alloc(2048, 7));

  // Clause 2a: a subtitle pack. `sniffZip` cannot settle it — no index.json and
  // no images — so `classifyByExtension`'s two ambiguous candidates stand and
  // `shouldExpandArchive` opens it. This is the gate's central case.
  zipTo(path.join(root, 'subs-pack.zip'), [
    ['ep01.srt', '1\n00:00:01,000 --> 00:00:02,000\nA\n'],
    ['ep02.srt', '1\n00:00:01,000 --> 00:00:02,000\nB\n'],
    ['ep03.ass', '[Script Info]\n'],
    ['notes.xyz', 'nothing opens this'],
    ['cover.png', PNG],
  ]);

  // Clause 2b: a real Yomitan v3 dictionary. `sniffZip` settles it exactly, so
  // it must stay ONE row — this is the negative side of the expansion rule.
  zipTo(path.join(root, 'jmdict.zip'), [
    ['index.json', JSON.stringify({ format: 3, title: 'fixture', revision: '1' })],
    ['term_bank_1.json', '[]'],
    ['term_bank_2.json', '[]'],
  ]);

  // Clause 2c: a manga archive — 4 of 4 entries are images, over the 0.6 ratio,
  // so `sniffZip` settles it exactly and it also stays one row.
  zipTo(path.join(root, 'vol01.zip'), [
    ['p001.png', PNG],
    ['p002.png', PNG],
    ['p003.png', PNG],
    ['p004.png', PNG],
  ]);

  // The stated limit: an archive inside an archive is named, not opened.
  const inner = new AdmZip();
  inner.addFile('deep.srt', Buffer.from('1\n'));
  zipTo(path.join(root, 'nested.zip'), [
    ['ep01.srt', '1\n'],
    ['inner.zip', inner.toBuffer()],
  ]);

  // A real file that is not a zip at all, wearing a .zip name.
  fs.writeFileSync(path.join(root, 'corrupt.zip'), Buffer.from('not a zip, not even close'));

  fingerprintTree(root, fingerprint);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('gate 28 clause 1 — the folder is walked recursively', () => {
  it('reaches a file three directories down', () => {
    const report = scanRoots([root]);
    const buried = report.entries.find((entry) => entry.name === 'buried.srt');
    expect(buried).toBeDefined();
    expect(buried?.target).toBe('subtitle');
    expect(buried?.path).toContain(path.join('season 1', 'subs', 'raw'));
    expect(scanReportBalances(report)).toBe(true);
  });

  it('sorts ALL of it — every fixture file appears in exactly one bucket', () => {
    const report = scanRoots([root]);
    const seen = new Set([
      ...report.entries.map((entry) => entry.path),
      ...report.skips.map((skip) => skip.path),
    ]);
    for (const file of fingerprint.keys()) {
      expect(seen.has(file), `${file} was lost by the scan`).toBe(true);
    }
    // 7 real files on disk: buried.srt, ep01.mkv, and five archives.
    expect(fingerprint.size).toBe(7);
    expect(report.found + report.skipped).toBe(7);
  });
});

describe('gate 28 clause 2 — archives are expanded far enough to classify', () => {
  it('counts what is inside a real subtitle pack', () => {
    const report = scanRoots([root]);
    const pack = archiveFindingFor(report, path.join(root, 'subs-pack.zip'));
    expect(pack).toBeDefined();
    expect(pack?.memberCount).toBe(5);
    expect(pack?.found).toBe(5);
    // ep01.srt, ep02.srt, ep03.ass exact; cover.png ambiguous; notes.xyz unplaced.
    expect(pack?.placed).toBe(3);
    expect(pack?.ambiguous).toBe(1);
    expect(pack?.unplaced).toBe(1);
    expect(pack?.dominantTarget).toBe('subtitle');
    expect(archiveReportBalances(pack!)).toBe(true);
  });

  it('leaves a real Yomitan dictionary as ONE row and does not expand it', () => {
    const report = scanRoots([root]);
    const dictPath = path.join(root, 'jmdict.zip');
    const entry = report.entries.find((row) => row.path === dictPath);
    // The sniffer settled it, which is what makes it a unit.
    expect(entry?.target).toBe('dictionary-yomitan');
    expect(entry?.confidence).toBe('exact');
    expect(entry?.sniffed).toBe(true);
    expect(archiveFindingFor(report, dictPath)).toBeUndefined();
  });

  it('leaves a real manga archive as ONE row rather than four image rows', () => {
    const report = scanRoots([root]);
    const mangaPath = path.join(root, 'vol01.zip');
    const entry = report.entries.find((row) => row.path === mangaPath);
    expect(entry?.target).toBe('library-manga');
    expect(entry?.confidence).toBe('exact');
    expect(archiveFindingFor(report, mangaPath)).toBeUndefined();
    // And the pages are nowhere in the top-level report either.
    expect(report.entries.some((row) => row.name === 'p001.png')).toBe(false);
  });

  it('member sizes are the UNCOMPRESSED bytes, read from the index', () => {
    const members = readArchiveIndex(path.join(root, 'subs-pack.zip'));
    const cover = members.find((member) => member.entryName === 'cover.png');
    expect(cover?.sizeBytes).toBe(PNG.length);
  });

  it('members never reach the top-level entries, so nothing can import one', () => {
    const report = scanRoots([root]);
    for (const entry of report.entries) {
      expect(entry.path.includes(ARCHIVE_MEMBER_SEP)).toBe(false);
    }
    // And each member path is a synthetic one that no importer could open.
    const pack = archiveFindingFor(report, path.join(root, 'subs-pack.zip'));
    for (const member of pack!.members) {
      expect(member.path).toContain(ARCHIVE_MEMBER_SEP);
      expect(fs.existsSync(member.path)).toBe(false);
    }
  });

  it('names a nested archive instead of opening it', () => {
    const report = scanRoots([root]);
    const nested = archiveFindingFor(report, path.join(root, 'nested.zip'));
    expect(nested?.found).toBe(1);
    expect(nested?.skips).toHaveLength(1);
    expect(nested?.skips[0].reasonKey).toBe(SCAN_SKIP_NESTED_ARCHIVE);
    expect(nested?.skips[0].path.endsWith('inner.zip')).toBe(true);
  });

  it('a corrupt archive is reported unreadable and does not stop the scan', () => {
    const report = scanRoots([root]);
    const corrupt = archiveFindingFor(report, path.join(root, 'corrupt.zip'));
    expect(corrupt?.unreadable).toBe(true);
    expect(corrupt?.skips[0].reasonKey).toBe(SCAN_SKIP_ARCHIVE_UNREADABLE);
    // Three of the five `.zip` fixtures are expanded at all — `jmdict.zip` and
    // `vol01.zip` are settled units — and the other two of those three still
    // got their answers despite this one failing to open.
    expect(report.archives).toHaveLength(3);
    expect(report.archives.filter((f) => f.report.unreadable)).toHaveLength(1);
    expect(archiveFindingFor(report, path.join(root, 'subs-pack.zip'))?.found).toBe(5);
  });

  it('honours the member limit on a real archive and says truncated', () => {
    const report = scanRoots([root], { archiveMemberLimit: 2 });
    const pack = archiveFindingFor(report, path.join(root, 'subs-pack.zip'));
    expect(pack?.truncated).toBe(true);
    expect(pack?.found).toBe(2);
    expect(pack?.memberCount).toBe(5);
    expect(pack?.skips.at(-1)?.reasonKey).toBe(SCAN_SKIP_LIMIT);
  });

  it('expansion can be turned off, and then the report says nothing about insides', () => {
    const report = scanRoots([root], { expandArchives: false });
    expect(report.archives).toEqual([]);
    // The archives themselves are still classified — only their contents are not.
    expect(report.entries.some((row) => row.name === 'subs-pack.zip')).toBe(true);
  });
});

describe('gate 28 clause 3 — the report names its piles with reasons', () => {
  it('every top-level entry and skip carries an i18n key, never English', () => {
    const report = scanRoots([root]);
    const key = /^[a-zA-Z]+(\.[a-zA-Z0-9]+)+$/;
    for (const entry of report.entries) expect(entry.reasonKey).toMatch(key);
    for (const skip of report.skips) expect(skip.reasonKey).toMatch(key);
  });

  it('every archive member and archive skip carries one too', () => {
    const report = scanRoots([root]);
    const key = /^[a-zA-Z]+(\.[a-zA-Z0-9]+)+$/;
    let members = 0;
    for (const finding of report.archives) {
      for (const member of finding.report.members) {
        expect(member.reasonKey).toMatch(key);
        members += 1;
      }
      for (const skip of finding.report.skips) expect(skip.reasonKey).toMatch(key);
    }
    // A count, not an adjective: 5 in the pack + 1 in nested = 6 classified.
    expect(members).toBe(6);
  });

  it('the three words the gate names are all present as numbers', () => {
    const report = scanRoots([root]);
    const pack = archiveFindingFor(report, path.join(root, 'subs-pack.zip'))!;
    expect(typeof pack.placed).toBe('number');
    expect(typeof pack.ambiguous).toBe('number');
    expect(typeof pack.skipped).toBe('number');
    expect(pack.placed + pack.ambiguous + pack.unplaced).toBe(pack.found);
  });
});

describe('gate 28 — opening an archive still changes nothing on disk', () => {
  it('every fixture is byte-identical after three full scans', () => {
    scanRoots([root]);
    scanRoots([root]);
    scanRoots([root]);
    const after = new Map<string, string>();
    fingerprintTree(root, after);
    expect(after.size).toBe(fingerprint.size);
    for (const [file, digest] of fingerprint) {
      expect(after.get(file), `${file} changed`).toBe(digest);
    }
  });

  it('expanding an archive creates no sibling, no temp file, no extraction', () => {
    const before = fs.readdirSync(root).sort();
    expandArchive(path.join(root, 'subs-pack.zip'));
    expect(fs.readdirSync(root).sort()).toEqual(before);
  });
});
