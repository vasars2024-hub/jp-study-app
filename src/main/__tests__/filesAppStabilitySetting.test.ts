// @vitest-environment node
/**
 * Gate 31 — "The stability window is honoured **and adjustable**. Setting it
 * higher delays ingest of a file still growing by that amount; setting it lower
 * does not bypass the completeness check entirely. Proven against a file
 * arriving mid-write at two different settings."
 *
 * The model half was measured in `filesAppStability.test.ts` against an
 * injected clock and a ledger carried across passes. This file measures the
 * half that was missing, and the one that decides whether the setting means
 * anything: the **production `filesapp:scan` handler**, captured off a mocked
 * `ipcMain` exactly as the app registers it, called with the settings document
 * the renderer sends.
 *
 * What it found on the way in, recorded because it is the reason this file
 * exists: the handler was `scanRoots(list)` with no ledger and no window at
 * all. Every stability clause was dead on the one path a user can reach, so a
 * settings control shipped against it would have adjusted nothing.
 *
 * **Nothing here is simulated.** Real files on real disk, the real clock, and
 * ages set with `utimesSync` — which writes a genuine mtime rather than
 * pretending time passed. That matters for this gate specifically: the whole
 * mechanism now rests on mtime being the moment the size last changed, so a
 * test that faked mtime would be testing itself.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-stability-ud-'));
const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-stability-src-'));

/** Captured rather than dispatched, so the assertions hit the real closure. */
const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir, getName: () => 'test' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    on: () => undefined,
    removeHandler: () => undefined,
  },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
}));

const { registerFilesAppIpc } = await import('../filesApp/ipc');
const {
  MIN_CHANGE_EVIDENCE_MS,
  STABILITY_REASON_EMPTY,
  STABILITY_REASON_FIRST_SIGHTING,
  STABILITY_REASON_TOO_SOON,
} = await import('../../shared/filesApp/stability');
const { DEFAULT_INGEST_SETTINGS } = await import('../../shared/filesApp/ingest');
import type { FilesScanReport } from '../../shared/filesApp/scan';

registerFilesAppIpc();

const scan = handlers.get('filesapp:scan') as (
  e: unknown,
  roots: unknown,
  options?: unknown,
) => FilesScanReport;

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(sourceDir, 'watch-'));
});

afterAll(() => {
  fs.rmSync(sourceDir, { recursive: true, force: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

/** A real file, with a real mtime set to `ageMs` in the past. */
function file(name: string, bytes: number, ageMs: number): string {
  const full = path.join(dir, name);
  fs.writeFileSync(full, Buffer.alloc(bytes, 7));
  if (ageMs > 0) {
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(full, when, when);
  }
  return full;
}

function run(stabilityMs?: number): FilesScanReport {
  return scan({}, [dir], stabilityMs === undefined ? undefined : { stabilityMs });
}

function skipReasonFor(report: FilesScanReport, name: string): string | undefined {
  return report.skips.find((s) => path.basename(s.path) === name)?.reasonKey;
}

describe('gate 31 — the window is honoured on the handler a user actually reaches', () => {
  it('the same real file is refused at 30 s and taken at 3 s — two settings, one file', () => {
    // Written and then aged by exactly ten seconds. Nothing about the file
    // changes between the two calls; only the setting does.
    file('ep01.mkv', 4096, 10_000);

    const strict = run(30_000);
    expect(strict.found).toBe(0);
    expect(skipReasonFor(strict, 'ep01.mkv')).toBe(STABILITY_REASON_TOO_SOON);

    const relaxed = run(3_000);
    expect(relaxed.found).toBe(1);
    expect(relaxed.entries[0].name).toBe('ep01.mkv');
    expect(relaxed.entries[0].target).toBe('media');
    expect(relaxed.entries[0].sizeBytes).toBe(4096);
  });

  it('higher delays by that amount, to the millisecond either side of the boundary', () => {
    file('ep02.mkv', 4096, 20_000);
    // 20 s old. A 20,001 ms window has one millisecond left to wait; a 19,999 ms
    // one has already elapsed. The scan itself costs a few ms, so the pair is
    // asserted with that headroom rather than at exactly 20,000.
    expect(run(20_001 + 500).found).toBe(0);
    expect(run(19_999 - 500).found).toBe(1);
  });

  it('a file being written right now is refused at EVERY setting, zero included', () => {
    // No age: its mtime is this instant, which is exactly what a torrent client
    // writing in place produces. This is gate 31's lower bound.
    file('ep03.mkv', 4096, 0);
    for (const window of [0, 1, 3_000, 30_000]) {
      const report = run(window);
      expect(report.found).toBe(0);
      expect(skipReasonFor(report, 'ep03.mkv')).toBe(STABILITY_REASON_FIRST_SIGHTING);
    }
  });

  it('a negative window clamps to zero and still cannot admit a mid-write file', () => {
    // The renderer document is not trusted: the handler re-normalises. -5000
    // becomes 0, and 0 is a legal window — what protects the library at 0 is the
    // clause order, not the number.
    file('ep04.mkv', 4096, 0);
    const report = scan({}, [dir], { stabilityMs: -5_000 });
    expect(report.found).toBe(0);
    expect(skipReasonFor(report, 'ep04.mkv')).toBe(STABILITY_REASON_FIRST_SIGHTING);
  });

  it('the evidence floor is a second, and it is not the window', () => {
    // Aged by half the floor: too recent for its own timestamp to count as an
    // earlier reading, so it is refused even though the window is zero.
    file('ep05.mkv', 4096, MIN_CHANGE_EVIDENCE_MS / 2);
    expect(run(0).found).toBe(0);
    // Aged past the floor, same file size, same zero window: now it is taken.
    file('ep06.mkv', 4096, MIN_CHANGE_EVIDENCE_MS * 3);
    const report = run(0);
    expect(report.entries.map((e) => e.name)).toContain('ep06.mkv');
    expect(report.entries.map((e) => e.name)).not.toContain('ep05.mkv');
  });

  it('an empty file is refused before the window is consulted', () => {
    const full = path.join(dir, 'ep07.mkv');
    fs.writeFileSync(full, '');
    const when = new Date(Date.now() - 60_000);
    fs.utimesSync(full, when, when);
    // A minute old with a zero window is the most permissive case there is.
    expect(skipReasonFor(run(0), 'ep07.mkv')).toBe(STABILITY_REASON_EMPTY);
  });

  it('no settings at all means the default window, not "off"', () => {
    // The one that would make this whole feature decorative: a caller that sends
    // nothing must get the default, not an unguarded scan.
    file('ep08.mkv', 4096, 500);
    expect(run().found).toBe(0);
    file('ep09.mkv', 4096, DEFAULT_INGEST_SETTINGS.stabilityMs + 2_000);
    expect(run().entries.map((e) => e.name)).toEqual(['ep09.mkv']);
  });

  it('a settled folder still scans normally — the guard is not a wall', () => {
    // The negative control for every refusal above: ordinary files, ordinary
    // ages, all classified. A guard that refused everything would pass every
    // test in this file and ship a scan that finds nothing.
    file('ep10.mkv', 4096, 60_000);
    file('ep10.srt', 512, 60_000);
    file('notes.xyz', 128, 60_000);
    const report = run(3_000);
    expect(report.found).toBe(3);
    expect(report.skips).toHaveLength(0);
    expect(report.byDestination.map((d) => d.target).sort()).toContain('subtitle');
  });
});
