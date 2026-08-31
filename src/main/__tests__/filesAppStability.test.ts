// @vitest-environment node
/**
 * Gate 26 — "A partial download is never ingested. A `.crdownload`/`.part`/`.!qB`
 * file, and a file still growing, are both ignored until complete — proven by
 * watching one arrive mid-write, not by asserting the extension list exists."
 *
 * The gate's own sentence forbids the cheap version of this test, so the file is
 * written in real chunks to real disk and the scan runs BETWEEN the chunks. Each
 * pass reads the size the filesystem actually reports at that instant; nothing
 * is simulated except the clock, which is injected so the test does not sleep
 * for the stability window.
 *
 * The extension half is here too, but as the smaller claim: every name in
 * `INCOMPLETE_EXT` skipped by name, before anything reads it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
}));

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-stability-test-'));

const { scanRoots } = await import('../filesApp/scan');
const { INCOMPLETE_EXT, isIncompleteName, SCAN_SKIP_INCOMPLETE } = await import(
  '../../shared/filesApp/scan'
);
const {
  DEFAULT_STABILITY_MS,
  STABILITY_REASON_EMPTY,
  STABILITY_REASON_FIRST_SIGHTING,
  STABILITY_REASON_STILL_GROWING,
  STABILITY_REASON_TOO_SOON,
  StabilityLedger,
  observeSize,
  stabilityVerdict,
} = await import('../../shared/filesApp/stability');

let dir: string;
let clock = 1_000_000;
const now = () => clock;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpRoot, 'watch-'));
  clock = 1_000_000;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Append real bytes to a real file, the way a download does. */
function append(name: string, bytes: number): void {
  fs.appendFileSync(path.join(dir, name), Buffer.alloc(bytes, 7));
}

function pass(ledger: StabilityLedger, stabilityMs = DEFAULT_STABILITY_MS) {
  return scanRoots([dir], { stability: ledger, stabilityMs, now });
}

function skipReasonFor(report: ReturnType<typeof pass>, name: string): string | undefined {
  return report.skips.find((s) => path.basename(s.path) === name)?.reasonKey;
}

describe('gate 26 — a file still growing is never classified', () => {
  it('watched mid-write: refused while arriving, accepted once it stops', () => {
    const ledger = new StabilityLedger();

    // 0 ms — the file appears with its first chunk on disk.
    append('ep01.mkv', 1024);
    let report = pass(ledger);
    expect(report.found).toBe(0);
    expect(skipReasonFor(report, 'ep01.mkv')).toBe(STABILITY_REASON_FIRST_SIGHTING);

    // +1 s — a second chunk landed between the two passes. The size the
    // filesystem reports has moved, so the clock restarts.
    clock += 1_000;
    append('ep01.mkv', 2048);
    report = pass(ledger);
    expect(report.found).toBe(0);
    expect(skipReasonFor(report, 'ep01.mkv')).toBe(STABILITY_REASON_STILL_GROWING);

    // +1 s — still arriving. Note this is already 2 s in: a naive "seen twice"
    // rule would have imported a half-written video here.
    clock += 1_000;
    append('ep01.mkv', 4096);
    report = pass(ledger);
    expect(report.found).toBe(0);

    // +1 s — the write stopped. Unchanged size, but not yet long enough.
    clock += 1_000;
    report = pass(ledger);
    expect(report.found).toBe(0);
    expect(skipReasonFor(report, 'ep01.mkv')).toBe(STABILITY_REASON_TOO_SOON);

    // +3 s — the window has passed with the size unchanged.
    clock += DEFAULT_STABILITY_MS;
    report = pass(ledger);
    expect(report.found).toBe(1);
    expect(report.entries[0].name).toBe('ep01.mkv');
    expect(report.entries[0].target).toBe('media');
    // And the bytes it reports are all 7 KiB that were written, not the first chunk.
    expect(report.entries[0].sizeBytes).toBe(1024 + 2048 + 4096);
  });

  it('a file that shrinks restarts the clock too — preallocation is not completion', () => {
    const ledger = new StabilityLedger();
    fs.writeFileSync(path.join(dir, 'ep02.mkv'), Buffer.alloc(8192, 1));
    pass(ledger);
    clock += 10_000;
    // Rewritten smaller, the way a client that preallocated then trimmed does.
    fs.writeFileSync(path.join(dir, 'ep02.mkv'), Buffer.alloc(512, 1));
    const report = pass(ledger);
    expect(report.found).toBe(0);
    expect(skipReasonFor(report, 'ep02.mkv')).toBe(STABILITY_REASON_STILL_GROWING);
  });

  it('an empty file is never complete, at any window', () => {
    const ledger = new StabilityLedger();
    fs.writeFileSync(path.join(dir, 'ep03.mkv'), '');
    for (const window of [0, 1, DEFAULT_STABILITY_MS]) {
      clock += 100_000;
      const report = pass(ledger, window);
      expect(report.found).toBe(0);
      expect(skipReasonFor(report, 'ep03.mkv')).toBe(STABILITY_REASON_EMPTY);
    }
  });

  it('a lower window does not bypass the check — one reading is never enough', () => {
    const ledger = new StabilityLedger();
    append('ep04.mkv', 4096);
    // Window zero. The file is still refused, because it has been seen once.
    expect(pass(ledger, 0).found).toBe(0);
    // Second pass at the same instant: the size held, so zero milliseconds of
    // holding satisfies a zero window. This is the floor, and it is control
    // flow, not a clamp.
    expect(pass(ledger, 0).found).toBe(1);
  });

  it('a higher window delays it by exactly that much', () => {
    const ledger = new StabilityLedger();
    append('ep05.mkv', 4096);
    pass(ledger, 30_000);
    clock += 29_999;
    expect(pass(ledger, 30_000).found).toBe(0);
    clock += 1;
    expect(pass(ledger, 30_000).found).toBe(1);
  });

  it('without a ledger a scan does not pretend to judge completeness', () => {
    // A one-shot scan has no previous reading, so it classifies what it finds
    // and says so by omission rather than guessing. Stated as a test so the
    // limitation cannot be mistaken for the feature working.
    append('ep06.mkv', 4096);
    expect(scanRoots([dir], { now }).found).toBe(1);
  });
});

describe('gate 26 — the extension half, before anything reads the file', () => {
  it('every incomplete extension is skipped by name', () => {
    for (const ext of INCOMPLETE_EXT) {
      fs.writeFileSync(path.join(dir, `ep01.mkv${ext}`), Buffer.alloc(64, 1));
    }
    // Plus one finished file, so a report of zero cannot pass as "it skips
    // everything".
    fs.writeFileSync(path.join(dir, 'done.srt'), '1\n');
    const report = scanRoots([dir], { now });
    expect(report.found).toBe(1);
    expect(report.entries[0].name).toBe('done.srt');
    expect(report.skips).toHaveLength(INCOMPLETE_EXT.size);
    for (const skip of report.skips) {
      expect(skip.reasonKey).toBe(SCAN_SKIP_INCOMPLETE);
    }
  });

  it('the list is case-insensitive — `.!QB` is the same file as `.!qb`', () => {
    expect(isIncompleteName('ep01.mkv.!QB')).toBe(true);
    expect(isIncompleteName('ep01.mkv.CRDOWNLOAD')).toBe(true);
    // And an ordinary name is not caught by it.
    expect(isIncompleteName('ep01.mkv')).toBe(false);
    expect(isIncompleteName('partial-notes.srt')).toBe(false);
  });
});

describe('the stability model on its own', () => {
  it('a first sighting records the size as having just changed', () => {
    const first = observeSize(undefined, { path: 'a', sizeBytes: 10, at: 100 });
    expect(first).toMatchObject({ sizeBytes: 10, changedAt: 100, readings: 1 });
    expect(stabilityVerdict(first, 1_000_000, 0).stable).toBe(false);
  });

  it('an unchanged size advances the clock; a changed one restarts it', () => {
    const a = observeSize(undefined, { path: 'a', sizeBytes: 10, at: 100 });
    const b = observeSize(a, { path: 'a', sizeBytes: 10, at: 200 });
    expect(b.changedAt).toBe(100);
    const c = observeSize(b, { path: 'a', sizeBytes: 11, at: 300 });
    expect(c.changedAt).toBe(300);
    expect(c.readings).toBe(3);
  });

  it('a different path is a different file, not a continuation', () => {
    const a = observeSize(undefined, { path: 'a', sizeBytes: 10, at: 100 });
    const b = observeSize(a, { path: 'b', sizeBytes: 10, at: 200 });
    expect(b.readings).toBe(1);
    expect(b.changedAt).toBe(200);
  });

  it('an unseen path is refused rather than defaulting to stable', () => {
    expect(stabilityVerdict(undefined, 1_000, 0)).toEqual({
      stable: false,
      reasonKey: STABILITY_REASON_FIRST_SIGHTING,
    });
  });

  it('waitMs counts down and never goes negative', () => {
    const ledger = new StabilityLedger();
    ledger.observe('a', 10, 0);
    ledger.observe('a', 10, 100);
    expect(ledger.verdict('a', 100, 1_000).waitMs).toBe(900);
    expect(ledger.verdict('a', 900, 1_000).waitMs).toBe(100);
    expect(ledger.verdict('a', 5_000, 1_000).waitMs).toBeUndefined();
  });

  it('forget drops a file and the next sighting starts over', () => {
    const ledger = new StabilityLedger();
    ledger.observe('a', 10, 0);
    ledger.observe('a', 10, 10);
    expect(ledger.verdict('a', 10, 0).stable).toBe(true);
    ledger.forget('a');
    expect(ledger.size).toBe(0);
    ledger.observe('a', 10, 20);
    expect(ledger.verdict('a', 20, 0).stable).toBe(false);
  });
});
