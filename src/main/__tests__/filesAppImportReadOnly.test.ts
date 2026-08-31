// @vitest-environment node
/**
 * Gate 24's second half — "Scan is read-only. After a scan **and an import**,
 * every original file is byte-identical and still in its original path —
 * verified, not assumed."
 *
 * The scan half is measured in `filesAppScan.test.ts` and again in
 * `filesAppIngest.test.ts`. This is the import: the real `media:addPaths` and
 * `library:importPaths` handlers, captured off a mocked `ipcMain` exactly as
 * the packaged app registers them, run over real fixture files that live
 * OUTSIDE userData — which is the whole point, because the plan's decision (c)
 * is reference in place, and a copying importer would satisfy "byte-identical"
 * while quietly duplicating 5 GB.
 *
 * So two things are asserted, not one:
 *   1. every source file is byte-identical and still at its own path, and
 *   2. the row the import created POINTS at that path.
 *
 * (1) alone would pass an importer that copied and then referenced the copy.
 *
 * The manga archive is deliberately the library fixture rather than an epub: it
 * is the importer that reads the source hardest — it opens the archive and
 * extracts every page — so if any importer were going to disturb a source it
 * would be that one. The pages it writes go under userData and are a
 * derivative, not a change to the original; the fingerprint covers the source
 * tree only, and the userData tree is checked separately for having grown.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import AdmZip from 'adm-zip';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-import-ro-ud-'));
const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-import-ro-src-'));

/** Captured rather than dispatched, so the assertions hit the real closures. */
const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir, getName: () => 'test' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    on: () => undefined,
  },
  dialog: {},
  shell: {},
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  net: { fetch: () => undefined },
}));

vi.mock('../mediaArtwork', () => ({
  ensureMediaArtwork: () => Promise.resolve(null),
  clearMediaArtwork: () => undefined,
  probeDurationSec: () => Promise.resolve(null),
}));
vi.mock('../mediaMetadata', () => ({
  registerMediaMetadataIpc: () => undefined,
  runMediaMetadata: () => Promise.resolve(undefined),
}));
vi.mock('../mediaDiscovery', () => ({ registerMediaDiscoveryIpc: () => undefined }));
vi.mock('../transcriptionJobs', () => ({ registerTranscriptionIpc: () => undefined }));
vi.mock('../subtitleDiscovery', () => ({
  clearSubtitleCache: () => undefined,
  loadDiscoverySettings: () => ({}),
  pickPlaybackSubtitle: () => null,
  readSubtitleRecord: () => null,
  registerSubtitleDiscoveryIpc: () => undefined,
  runSubtitleDiscovery: () => Promise.resolve(null),
}));
vi.mock('../readabilityExtract', () => ({ extractReadableFromUrl: () => Promise.resolve(null) }));
vi.mock('../readingFetch', () => ({ fetchReadingContent: () => Promise.resolve(null) }));
vi.mock('../epubMeta', () => ({ extractEpubTitleFromOpf: () => undefined }));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));

const { registerMediaIpc } = await import('../media');
const { registerLibraryIpc } = await import('../library');
const { scanRoots } = await import('../filesApp/scan');
const { DEFAULT_INGEST_SETTINGS, planIngest } = await import('../../shared/filesApp/ingest');

const VIDEO = path.join(sourceDir, 'ep01.mkv');
const MANGA = path.join(sourceDir, 'volume 1.cbz');

/** path -> size:mtime:bytes, for every file in the SOURCE tree. */
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

function countFiles(root: string): number {
  let n = 0;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name));
      else n += 1;
    }
  }
  return n;
}

let before: Map<string, string>;

beforeAll(() => {
  // A real 4 KB video file and a real manga archive holding real (tiny) PNGs.
  fs.writeFileSync(VIDEO, Buffer.alloc(4096, 3));
  const zip = new AdmZip();
  for (let i = 1; i <= 3; i += 1) {
    zip.addFile(`page${String(i).padStart(3, '0')}.png`, Buffer.alloc(128, i));
  }
  zip.writeZip(MANGA);
  before = fingerprint(sourceDir);

  registerMediaIpc();
  registerLibraryIpc();
});

afterAll(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(sourceDir, { recursive: true, force: true });
});

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`handler ${channel} was never registered`);
  return fn({} as unknown, ...args);
}

describe('gate 24 — after a scan AND an import, the originals are untouched', () => {
  it('the scan agrees these two files are the ones to import', () => {
    // Stated before the import so the paths being asserted afterwards are the
    // paths the product itself chose, not a hand-written list.
    const report = scanRoots([sourceDir]);
    const plan = planIngest(report, DEFAULT_INGEST_SETTINGS);
    expect(report.found).toBe(2);
    expect(plan.auto.map((i) => i.entry.path).sort()).toEqual([VIDEO, MANGA].sort());
  });

  it('every source file is byte-identical and still at its own path', async () => {
    const userDataBefore = countFiles(userDataDir);

    const media = (await call('media:addPaths', [VIDEO])) as { path?: string }[];
    const library = (await call('library:importPaths', [MANGA])) as {
      sourcePath?: string;
      pageCount?: number;
    }[];

    const after = fingerprint(sourceDir);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [file, sig] of before) expect(after.get(file)).toBe(sig);

    // And the rows reference the originals rather than a copy of them.
    expect(media.some((row) => row.path === VIDEO)).toBe(true);
    const imported = library.find((row) => row.sourcePath === MANGA);
    expect(imported).toBeDefined();
    // The archive really was opened and read — three pages came out of it — so
    // "unchanged" is a statement about an importer that did work, not about one
    // that skipped the file.
    expect(imported?.pageCount).toBe(3);

    // The derivative pages landed under userData, which is where they belong.
    expect(countFiles(userDataDir)).toBeGreaterThan(userDataBefore);
  });

  it('the instrument would have caught a change, a move, or a deletion', () => {
    /*
     * The control this gate needs. "Byte-identical" is only evidence if the
     * comparison can fail, and a fingerprint that silently ignored mtime, or
     * compared only the key set, would report a rewritten file as untouched.
     * Run in its own directory so it cannot disturb the real fixture.
     */
    const controlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-import-ro-ctl-'));
    try {
      const file = path.join(controlDir, 'victim.bin');
      fs.writeFileSync(file, Buffer.alloc(16, 1));
      const baseline = fingerprint(controlDir);

      // A rewrite of the same LENGTH: caught by bytes, not by size.
      fs.writeFileSync(file, Buffer.alloc(16, 2));
      expect(fingerprint(controlDir).get(file)).not.toBe(baseline.get(file));

      // A move out of its own path.
      const moved = path.join(controlDir, 'moved.bin');
      fs.renameSync(file, moved);
      expect([...fingerprint(controlDir).keys()]).toEqual([moved]);

      // A deletion.
      fs.rmSync(moved);
      expect([...fingerprint(controlDir).keys()]).toEqual([]);
    } finally {
      fs.rmSync(controlDir, { recursive: true, force: true });
    }
  });

  it('re-importing the same paths does not touch them either', async () => {
    // The second run is the one that would rewrite or re-extract if the
    // importers were not idempotent about their sources.
    await call('media:addPaths', [VIDEO]);
    await call('library:importPaths', [MANGA]);
    const after = fingerprint(sourceDir);
    for (const [file, sig] of before) expect(after.get(file)).toBe(sig);
  });
});
