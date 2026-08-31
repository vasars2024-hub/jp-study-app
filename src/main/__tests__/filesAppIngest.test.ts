// @vitest-environment node
/**
 * Gate 27 — "Ambiguity goes to review, not into the library. A file the router
 * settles only by guessing lands in the review queue; a high-confidence match
 * may auto-import. **Both paths demonstrated with a real file each.**"
 *
 * So this file is the demonstration, not the table: real files on real disk,
 * scanned by the production `scanRoots` through the production `planForPath`,
 * and partitioned by the production `planIngest`. Nothing is stubbed except
 * `electron`, which `fileRouter.ts` imports to register IPC.
 *
 * Gate 36's single-scan claim is measured on the same walk: one `scanRoots`
 * call, one settings object, a subtitle auto and a video reviewed.
 *
 * Gate 24's read-only half is re-measured here rather than assumed from gate
 * 23's run, because this walk additionally opens the archive to sniff it, and
 * "the scan did not write" has to hold for the run that reads the most.
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

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-ingest-test-'));

const { scanRoots } = await import('../filesApp/scan');
const { planForPath } = await import('../fileRouter');
const {
  DEFAULT_INGEST_SETTINGS,
  INGEST_AUTO_CATEGORY,
  INGEST_AUTO_HIGH_CONFIDENCE,
  INGEST_REFUSED_NO_DESTINATION,
  INGEST_REVIEW_AMBIGUOUS,
  INGEST_REVIEW_CATEGORY,
  INGEST_REVIEW_GUESSED,
  ingestPlanBalances,
  planIngest,
} = await import('../../shared/filesApp/ingest');

const inbox = path.join(tmpRoot, 'inbox');

function writeYomitanZip(target: string): void {
  const zip = new AdmZip();
  zip.addFile(
    'index.json',
    Buffer.from(JSON.stringify({ title: 'Ingest dict', format: 3, revision: '1' }), 'utf8'),
  );
  zip.addFile('term_bank_1.json', Buffer.from('[]', 'utf8'));
  zip.writeZip(target);
}

function fingerprint(root: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    const stat = fs.statSync(full);
    out.set(full, `${stat.size}:${stat.mtimeMs}:${fs.readFileSync(full).toString('base64')}`);
  }
  return out;
}

let before: Map<string, string>;

beforeAll(() => {
  fs.mkdirSync(inbox, { recursive: true });
  // One real file per path the gate names, and the two neighbours a real
  // Downloads folder always also has.
  fs.writeFileSync(path.join(inbox, 'ep01.srt'), '1\n00:00:01,000 --> 00:00:02,000\nあ\n');
  fs.writeFileSync(path.join(inbox, 'ep01.mkv'), Buffer.alloc(4096, 7));
  fs.writeFileSync(path.join(inbox, 'vocab.csv'), 'front,back\n猫,cat\n');
  fs.writeFileSync(path.join(inbox, 'page001.png'), Buffer.alloc(256, 9));
  fs.writeFileSync(path.join(inbox, 'notes.xyz'), 'nothing owns this');
  writeYomitanZip(path.join(inbox, 'jmdict.zip'));
  before = fingerprint(inbox);
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function candidatesFor(paths: readonly string[]): Map<string, ReturnType<typeof planForPath>['candidates']> {
  return new Map(paths.map((p) => [p, planForPath(p).candidates]));
}

function planFor(settings = DEFAULT_INGEST_SETTINGS) {
  const report = scanRoots([inbox]);
  const plan = planIngest(report, settings, candidatesFor(report.entries.map((e) => e.path)));
  return { report, plan };
}

const named = (items: { entry: { name: string } }[]): string[] =>
  items.map((i) => i.entry.name).sort();

describe('gate 27 — both paths, with a real file each', () => {
  it('the high-confidence path: a real .srt is auto-imported without asking', () => {
    const { plan } = planFor();
    const srt = plan.auto.find((i) => i.entry.name === 'ep01.srt');
    expect(srt).toBeDefined();
    expect(srt?.entry.target).toBe('subtitle');
    expect(srt?.entry.confidence).toBe('exact');
    expect(srt?.entry.candidateCount).toBe(1);
    expect(srt?.decision.reasonKey).toBe(INGEST_AUTO_HIGH_CONFIDENCE);
    expect(srt?.decision.warned).toBe(false);
    // The file it is talking about is on disk and has the bytes we wrote.
    expect(fs.readFileSync(srt!.entry.path, 'utf8')).toContain('00:00:01,000');
  });

  it('the guessing path: a real .csv the router only guesses at goes to review', () => {
    const { plan } = planFor();
    const csv = plan.review.find((i) => i.entry.name === 'vocab.csv');
    expect(csv).toBeDefined();
    expect(csv?.entry.target).toBe('deck-csv');
    expect(csv?.entry.confidence).toBe('likely');
    // The trap this gate exists to close: the SCAN called it placed.
    expect(csv?.entry.settlement).toBe('placed');
    expect(csv?.decision.disposition).toBe('review');
    expect(csv?.decision.reasonKey).toBe(INGEST_REVIEW_GUESSED);
    // A single guessed candidate is confirmed or skipped, never re-chosen.
    expect(csv?.choices).toBeUndefined();
    expect(fs.readFileSync(csv!.entry.path, 'utf8')).toContain('猫');
  });

  it('the ambiguous path: a real .png carries its two real choices into review', () => {
    const { plan } = planFor();
    const png = plan.review.find((i) => i.entry.name === 'page001.png');
    expect(png?.decision.reasonKey).toBe(INGEST_REVIEW_AMBIGUOUS);
    expect(png?.choices?.map((c) => c.target)).toEqual(['wallpaper', 'library-manga']);
  });

  it('a sniffed archive reaches the auto pile, because sniffing made it exact', () => {
    // The hardest auto row: `.zip` is ambiguous by extension and only the
    // archive's own `index.json` settles it. If the sniffer were bypassed this
    // would sit in review, so this asserts the sniffed path end to end.
    const { plan } = planFor();
    const zip = plan.auto.find((i) => i.entry.name === 'jmdict.zip');
    expect(zip?.entry.target).toBe('dictionary-yomitan');
    expect(zip?.entry.sniffed).toBe(true);
    expect(zip?.decision.disposition).toBe('auto');
  });

  it('a file with no home is refused, not queued for a decision nobody can make', () => {
    const { plan } = planFor();
    const xyz = plan.refused.find((i) => i.entry.name === 'notes.xyz');
    expect(xyz?.decision.reasonKey).toBe(INGEST_REFUSED_NO_DESTINATION);
    expect(plan.review.some((i) => i.entry.name === 'notes.xyz')).toBe(false);
  });

  it('the six real files land in three piles that sum to the scan', () => {
    const { report, plan } = planFor();
    expect(report.found).toBe(6);
    expect(named(plan.auto)).toEqual(['ep01.mkv', 'ep01.srt', 'jmdict.zip']);
    expect(named(plan.review)).toEqual(['page001.png', 'vocab.csv']);
    expect(named(plan.refused)).toEqual(['notes.xyz']);
    expect(ingestPlanBalances(report, plan)).toBe(true);
    expect(plan.warnedCount).toBe(0);
  });
});

describe('gate 36 — one scan, two categories, two outcomes', () => {
  it('subtitles auto and video review, on the same walk', () => {
    const { report, plan } = planFor({
      ...DEFAULT_INGEST_SETTINGS,
      byTarget: { subtitle: 'auto', media: 'review' },
    });
    // One scan produced both answers: same report object, same entry list.
    expect(report.found).toBe(6);

    const srt = plan.auto.find((i) => i.entry.name === 'ep01.srt');
    const mkv = plan.review.find((i) => i.entry.name === 'ep01.mkv');
    expect(srt?.decision.reasonKey).toBe(INGEST_AUTO_CATEGORY);
    expect(mkv?.decision.reasonKey).toBe(INGEST_REVIEW_CATEGORY);

    // The control: with the overrides removed, the same walk puts the video in
    // the OTHER pile. Without this, "video reviewed" could just be the default.
    const baseline = planFor();
    expect(baseline.plan.auto.some((i) => i.entry.name === 'ep01.mkv')).toBe(true);
    expect(baseline.plan.review.some((i) => i.entry.name === 'ep01.mkv')).toBe(false);
  });
});

describe('gate 24 — the sniffing walk still writes nothing', () => {
  it('every fixture file is byte-identical after three planning passes', () => {
    planFor();
    planFor({ ...DEFAULT_INGEST_SETTINGS, confidence: 'everything' });
    planFor({ ...DEFAULT_INGEST_SETTINGS, byTarget: { media: 'review' } });
    const after = fingerprint(inbox);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [file, sig] of before) expect(after.get(file)).toBe(sig);
  });
});
