// @vitest-environment node
/**
 * Gate 23 — "Point it at a folder holding a mixed set — subtitles, an epub, a
 * dictionary zip, a video — and it reports a count per destination. Report the
 * number found, the number placed and the number left ambiguous; 'scanned
 * successfully' with no numbers is not a pass."
 *
 * The gate names four kinds, so the fixture is those four kinds as REAL files
 * on disk, and the dictionary zip is a real zip carrying a real Yomitan
 * `index.json` — the classifier settles `.zip` by reading the archive, so a
 * hand-named empty file would exercise the extension table and not the sniffer,
 * and the gate's hardest row would be the one nothing tested.
 *
 * The classifier is the production `planForPath`, not a stub. What is mocked is
 * only `electron`, because `fileRouter.ts` registers IPC at import.
 *
 * Gate 24's scan half is measured here too — every fixture file's bytes and
 * mtime are captured before the scan and compared after — because the cheapest
 * moment to prove "read-only" is the run that already has the fixture.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import AdmZip from 'adm-zip';

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
}));

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-scan-test-'));

const { scanRoots } = await import('../filesApp/scan');
const {
  SCAN_SKIP_INCOMPLETE,
  SCAN_SKIP_LIMIT,
  SCAN_SKIP_UNREADABLE,
  scanReportBalances,
} = await import('../../shared/filesApp/scan');

/* ----------------------------- the fixture ----------------------------- */

const mixed = path.join(tmpRoot, 'mixed');
const nested = path.join(mixed, 'season 1');

/** A real Yomitan v3 archive: `index.json` with `format: 3`, which is what the sniffer reads. */
function writeYomitanZip(target: string): void {
  const zip = new AdmZip();
  zip.addFile(
    'index.json',
    Buffer.from(JSON.stringify({ title: 'Test dict', format: 3, revision: '1' }), 'utf8'),
  );
  zip.addFile('term_bank_1.json', Buffer.from('[]', 'utf8'));
  zip.writeZip(target);
}

/** Path -> {bytes, mtimeMs} for gate 24's read-only comparison. */
function fingerprint(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const stack = [root];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      const stat = fs.statSync(full);
      const hash = fs.readFileSync(full).toString('base64');
      out.set(full, `${stat.size}:${stat.mtimeMs}:${hash}`);
    }
  }
  return out;
}

let before: Map<string, string>;

beforeAll(() => {
  fs.mkdirSync(nested, { recursive: true });
  // The four kinds the gate names, plus the two things a real Downloads folder
  // always also holds: something unfinished, and something with no home.
  fs.writeFileSync(path.join(nested, 'ep01.srt'), '1\n00:00:01,000 --> 00:00:02,000\nああ\n');
  fs.writeFileSync(path.join(nested, 'ep02.srt'), '1\n00:00:01,000 --> 00:00:02,000\nいい\n');
  fs.writeFileSync(path.join(nested, 'ep03.ass'), '[Script Info]\n');
  fs.writeFileSync(path.join(mixed, 'novel.epub'), 'PKnot-really-a-zip');
  fs.writeFileSync(path.join(mixed, 'ep01.mkv'), Buffer.alloc(64, 1));
  fs.writeFileSync(path.join(nested, 'ep02.mp4'), Buffer.alloc(32, 2));
  writeYomitanZip(path.join(mixed, 'jmdict.zip'));
  fs.writeFileSync(path.join(mixed, 'ep04.mkv.crdownload'), Buffer.alloc(8, 3));
  fs.writeFileSync(path.join(mixed, 'notes.xyz'), 'nothing owns this');
  before = fingerprint(mixed);
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function report() {
  return scanRoots([mixed]);
}

function destination(target: string) {
  return report().byDestination.find((d) => d.target === target);
}

describe('gate 23 — a scan reports numbers, per destination', () => {
  it('the mixed folder produces the counts the gate asks for', () => {
    const result = report();

    // Found: nine files exist; the `.crdownload` is skipped before it is
    // classified, so eight were considered.
    expect(result.found).toBe(8);
    expect(result.skipped).toBe(1);
    expect(result.skips[0].reasonKey).toBe(SCAN_SKIP_INCOMPLETE);
    expect(path.basename(result.skips[0].path)).toBe('ep04.mkv.crdownload');

    // The four buckets account for every considered file — asserted, not assumed.
    expect(scanReportBalances(result)).toBe(true);
    expect(result.placed + result.ambiguous + result.unplaced).toBe(result.found);

    // And the numbers themselves.
    expect(result.placed).toBe(7);
    expect(result.ambiguous).toBe(0);
    expect(result.unplaced).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('each of the four kinds the gate names lands in its own destination', () => {
    expect(destination('subtitle')).toMatchObject({ total: 3, placed: 3, ambiguous: 0 });
    expect(destination('media')).toMatchObject({ total: 2, placed: 2 });
    expect(destination('library-book')).toMatchObject({ total: 1, placed: 1 });
    // The dictionary row is the sniffed one: extension alone cannot tell a
    // Yomitan archive from a manga volume.
    expect(destination('dictionary-yomitan')).toMatchObject({ total: 1, placed: 1 });
    const zip = report().entries.find((e) => e.name === 'jmdict.zip');
    expect(zip?.sniffed).toBe(true);
    expect(zip?.target).toBe('dictionary-yomitan');
  });

  it('a file with no home is reported as unplaced, not silently dropped', () => {
    const unknown = report().entries.find((e) => e.name === 'notes.xyz');
    expect(unknown?.settlement).toBe('unplaced');
    expect(unknown?.target).toBe('unknown');
    // It still has a reason key — "no home" is an answer, not a blank.
    expect(unknown?.reasonKey).toBeTruthy();
    expect(destination('unknown')?.total).toBe(1);
  });

  it('every destination row carries a label key the report can print', () => {
    for (const row of report().byDestination) {
      expect(row.labelKey).toBe(`fileDrop.target.${row.target}`);
      expect(row.placed + row.ambiguous).toBeLessThanOrEqual(row.total);
    }
  });

  it('sub-directories are walked, and a non-recursive scan says a smaller number', () => {
    expect(report().found).toBe(8);
    const shallow = scanRoots([mixed], { recursive: false });
    // Only the five files directly in `mixed`, minus the skipped `.crdownload`.
    expect(shallow.found).toBe(4);
    expect(shallow.entries.map((e) => e.name).sort()).toEqual([
      'ep01.mkv',
      'jmdict.zip',
      'notes.xyz',
      'novel.epub',
    ]);
    // The three subtitles and the second video are exactly what recursion adds.
    expect(report().found - shallow.found).toBe(4);
  });

  it('two runs over an unchanged tree produce the same report, row for row', () => {
    const a = report();
    const b = report();
    expect(b.entries.map((e) => e.path)).toEqual(a.entries.map((e) => e.path));
    expect(b.byDestination.map((d) => `${d.target}:${d.total}`)).toEqual(
      a.byDestination.map((d) => `${d.target}:${d.total}`),
    );
  });
});

describe('gate 23 — the walk stops honestly', () => {
  it('a file limit truncates, records itself once, and says so', () => {
    const limited = scanRoots([mixed], { fileLimit: 3 });
    expect(limited.found).toBe(3);
    expect(limited.truncated).toBe(true);
    // One skip row, not one per remaining file.
    expect(limited.skips.filter((s) => s.reasonKey === SCAN_SKIP_LIMIT)).toHaveLength(1);
    expect(limited.skips.length).toBeLessThan(3);
  });

  it('a root that is not a directory is a named skip, not a throw', () => {
    const bogus = scanRoots([path.join(mixed, 'novel.epub'), path.join(tmpRoot, 'nope')]);
    expect(bogus.found).toBe(0);
    expect(bogus.roots).toEqual([]);
    expect(bogus.skips.map((s) => s.reasonKey)).toEqual([
      SCAN_SKIP_UNREADABLE,
      SCAN_SKIP_UNREADABLE,
    ]);
  });

  it('a classifier that throws costs one file, not the scan', () => {
    let calls = 0;
    const result = scanRoots([mixed], {
      classify: (p) => {
        calls += 1;
        if (p.endsWith('.mkv')) throw new Error('boom');
        return {
          path: p,
          name: path.basename(p),
          isDirectory: false,
          sizeBytes: 0,
          candidates: [{ target: 'subtitle', confidence: 'exact', reasonKey: 'r' }],
        };
      },
    });
    expect(calls).toBe(8);
    expect(result.found).toBe(7);
    expect(result.skips.filter((s) => s.reasonKey === SCAN_SKIP_UNREADABLE)).toHaveLength(1);
  });

  it('an empty root list is an empty report, not an error', () => {
    const empty = scanRoots([]);
    expect(empty.found).toBe(0);
    expect(empty.byDestination).toEqual([]);
    expect(scanReportBalances(empty)).toBe(true);
  });
});

describe('gate 24, the scan half — nothing on disk moved', () => {
  it('every fixture file is byte-identical and still in its original path after a scan', () => {
    // Scan repeatedly, including the paths that READ file contents (the zip
    // sniffer opens the archive; a writing implementation would show up here).
    report();
    scanRoots([mixed], { recursive: false });
    scanRoots([mixed], { fileLimit: 2 });

    const after = fingerprint(mixed);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [file, signature] of before) {
      expect(after.get(file)).toBe(signature);
    }
  });

  it('the scan created nothing of its own anywhere under the root', () => {
    const countBefore = before.size;
    report();
    expect(fingerprint(mixed).size).toBe(countBefore);
  });
});
