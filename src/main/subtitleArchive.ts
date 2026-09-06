/**
 * Reading subtitle files out of a compressed release.
 *
 * WHY THIS EXISTS. `MAIN_V1_COMPLETION_PLAN.md` gate 11 asks that "a
 * subtitle-only release under the 50 MB ceiling is taken whole, lands as a
 * `SubtitleRecord`, and its cues render in the player". Driven live on
 * 2026-09-06 the gate failed at *selection*, not at the index: the two ja Route
 * A subjects the product's own listing nominates are both `.7z`, and
 * `selectSubtitleFiles` has no branch for a compressed carrier — so a release
 * that is exactly what its name claims was reported as "contains no subtitle
 * files". `08160b62` made that refusal honest; this makes it unnecessary.
 *
 * WHY `7z-wasm` AND NOT `7zip-bin` + `node-7z`. There is no 7z binary on this
 * machine, so a dependency had to bring its own decoder. `7zip-bin` ships a
 * per-platform NATIVE executable (~11 MB each) that has to be marked executable
 * and located at runtime, which means packaging wiring on three platforms.
 * `7z-wasm` is one 1.8 MB `.wasm` plus a loader, identical everywhere, and the
 * repo already has the exact precedent: `sql.js` is kept external in
 * `vite.main.config.ts` for the same reason ("ships a .wasm loaded at runtime
 * from its own folder"), and `forge.config.ts` sets `asar: false`, so
 * `require.resolve` finds the payload in a packaged build too. The build wiring
 * is therefore one word in the externals list.
 *
 * WHY A WORKER THREAD. Measured here on a 520-file / 20,271,680-byte fixture:
 * module init 7 ms, `l -slt` 37 ms, extract-all **702 ms**. `callMain` is
 * synchronous WASM, so that 702 ms would be 702 ms of frozen main process —
 * exactly what the repo's performance invariant forbids. The worker is created
 * with `eval: true` and its source inlined below, which is what keeps this from
 * costing a fourth `forge.config.ts` build entry: there is no separate file to
 * build, name and resolve. Total wall cost measured through the worker: 883 ms,
 * with the main loop free throughout.
 */
import { Worker } from 'node:worker_threads';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * Archive containers this module can open.
 *
 * A strict subset of `ARCHIVE_EXT` in `subtitleNyaa.ts`, which lists every
 * container a release is *observed* to ship in. The difference is load-bearing:
 * `noSubtitlesReason` tells the user to extract it themselves, and that sentence
 * must stay true for the formats still not handled. 7-Zip reads all of these,
 * but only these three are worth offering — `.rar` needs the unRAR licence
 * carve-out and nothing in the measured index ships subtitles as one.
 */
export const EXTRACTABLE_ARCHIVE_EXT = new Set(['.7z', '.zip', '.tar']);

/** Whether a file name is a container this module can open. */
export function isExtractableArchive(fileName: string): boolean {
  return EXTRACTABLE_ARCHIVE_EXT.has(path.extname(String(fileName ?? '')).toLowerCase());
}

export interface ExtractedArchiveEntry {
  /** Path inside the archive, e.g. `Subs/Show - 07.ja.ass`. */
  name: string;
  /** Uncompressed size the archive header declares. */
  sizeBytes: number;
  /** Decoded text. */
  text: string;
}

export type ArchiveExtractOutcome =
  | {
    ok: true;
    files: ExtractedArchiveEntry[];
    /** Sum of the declared unpacked sizes of the entries that were extracted. */
    unpackedBytes: number;
    /** Entries whose extension is not a text cue format, left in the archive. */
    skippedNonSubtitle: number;
    /** Wanted entries the decoder produced nothing for. */
    unreadable: number;
  }
  | { ok: false; reason: string };

export interface ArchiveExtractOptions {
  /**
   * Extensions to extract, lower-case and dotted. Everything else stays inside
   * the archive: this is what keeps a subtitle acquisition from unpacking an
   * executable a release happened to bundle.
   */
  extensions: readonly string[];
  /** Refuse rather than extract when the declared unpacked total exceeds this. */
  maxUnpackedBytes: number;
  /** How long the whole list+extract may take. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * The worker body.
 *
 * Inlined as a string, so it needs no build entry — see the header. It contains
 * no backticks and no template literals on purpose: it is itself the body of a
 * template literal in the compiled output, and a stray backtick here would
 * close it.
 *
 * The archive is read through a NODEFS mount of its own directory and unpacked
 * into MEMFS, so nothing is ever written to the user's disk. That is not just
 * tidiness: `userData` has no restore point, and a partial extraction left
 * behind in a temp directory is exactly the kind of orphan the acquisition
 * sweep cannot see.
 */
const WORKER_SOURCE = [
  "const { parentPort, workerData } = require('worker_threads');",
  "const fs = require('fs');",
  'const fail = (reason) => { parentPort.postMessage({ ok: false, reason: reason }); };',
  'let listing = [];',
  'const onLine = (line) => { listing.push(String(line)); };',
  // 7-Zip -slt prints one blank-line-separated block per entry. The FIRST block
  // is the archive itself ("Path = pack.7z", no Attributes line), so it would
  // otherwise read as a zero-byte file; it is dropped by name.
  'const parseListing = (lines) => {',
  '  const out = [];',
  '  let current = null;',
  '  for (const line of lines) {',
  '    const pathMatch = /^Path = (.*)$/.exec(line);',
  '    if (pathMatch) { current = { name: pathMatch[1], size: 0, isDir: false }; out.push(current); continue; }',
  '    if (!current) continue;',
  "    const sizeMatch = /^Size = (\\d+)$/.exec(line);",
  '    if (sizeMatch) { current.size = Number(sizeMatch[1]); continue; }',
  '    const attrMatch = /^Attributes = (.*)$/.exec(line);',
  "    if (attrMatch) { current.isDir = /(^|\\s)D/.test(attrMatch[1]); }",
  '  }',
  '  return out.filter((entry) => entry.name !== workerData.file);',
  '};',
  '(async () => {',
  '  let sz;',
  '  try {',
  '    const factory = require(workerData.modulePath);',
  '    const wasmBinary = fs.readFileSync(workerData.wasmPath);',
  '    sz = await factory({ wasmBinary: wasmBinary, print: onLine, printErr: () => {} });',
  '  } catch (error) {',
  "    fail('The archive reader could not start: ' + String((error && error.message) || error));",
  '    return;',
  '  }',
  '  try {',
  "    sz.FS.mkdir('/mnt');",
  "    sz.FS.mount(sz.NODEFS, { root: workerData.dir }, '/mnt');",
  "    sz.FS.chdir('/mnt');",
  '    listing = [];',
  "    sz.callMain(['l', '-slt', workerData.file]);",
  '    const wanted = [];',
  '    let unpacked = 0;',
  '    let skipped = 0;',
  '    for (const entry of parseListing(listing)) {',
  '      if (entry.isDir) continue;',
  '      const dot = entry.name.lastIndexOf(String.fromCharCode(46));',
  "      const ext = dot < 0 ? '' : entry.name.slice(dot).toLowerCase();",
  '      if (workerData.extensions.indexOf(ext) < 0) { skipped += 1; continue; }',
  '      wanted.push(entry);',
  '      unpacked += entry.size;',
  '    }',
  '    if (!wanted.length) {',
  '      parentPort.postMessage({ ok: true, files: [], unpackedBytes: 0, skippedNonSubtitle: skipped });',
  '      return;',
  '    }',
  '    if (unpacked > workerData.maxUnpackedBytes) {',
  "      fail('unpacked-too-large:' + unpacked);",
  '      return;',
  '    }',
  "    sz.FS.mkdir('/out');",
  // -y answers "overwrite?" without prompting; a prompt in a worker is a hang.
  // Named members only, so nothing outside `extensions` is ever decompressed.
  "    const args = ['x', '-y', '-o/out', workerData.file];",
  '    for (const entry of wanted) args.push(entry.name);',
  '    sz.callMain(args);',
  '    const files = [];',
  '    let unreadable = 0;',
  '    for (const entry of wanted) {',
  '      try {',
  "        const at = '/out/' + entry.name.split(String.fromCharCode(92)).join('/');",
  "        const text = sz.FS.readFile(at, { encoding: 'utf8' });",
  '        files.push({ name: entry.name, sizeBytes: entry.size, text: text });',
  '      } catch (error) {',
  // One unreadable member never fails the release: the same policy the loose
  // path already applies to a truncated file on disk.
  '        unreadable += 1;',
  '      }',
  '    }',
  '    parentPort.postMessage({',
  '      ok: true, files: files, unpackedBytes: unpacked,',
  '      skippedNonSubtitle: skipped, unreadable: unreadable,',
  '    });',
  '  } catch (error) {',
  '    fail(String((error && error.message) || error));',
  '  }',
  '})();',
].join('\n');

/** Where `7z-wasm` lives. A seam only so tests can point at a fixture copy. */
export interface ArchiveReaderPaths {
  modulePath: string;
  wasmPath: string;
}

let cachedPaths: ArchiveReaderPaths | null = null;

/**
 * Resolves `7z-wasm` from its own folder.
 *
 * `createRequire` rather than a bare `require`: this module is compiled to CJS
 * for the packaged main process but loaded as ESM under vitest, and only
 * `createRequire` works in both.
 */
export function archiveReaderPaths(): ArchiveReaderPaths {
  if (cachedPaths) return cachedPaths;
  const req = createRequire(typeof __filename === 'string' ? __filename : import.meta.url);
  cachedPaths = {
    modulePath: req.resolve('7z-wasm/7zz.umd.js'),
    wasmPath: req.resolve('7z-wasm/7zz.wasm'),
  };
  return cachedPaths;
}

/** Test seam: override the resolved reader paths. Pass `null` to restore. */
export function setArchiveReaderPaths(paths: ArchiveReaderPaths | null): void {
  cachedPaths = paths;
}

/**
 * Extracts the wanted members of one archive and returns them as text.
 *
 * Refuses rather than truncates when the declared unpacked total is over the
 * ceiling. The declared size is read from the archive header before a byte is
 * decompressed, so a zip bomb is refused for free rather than after the fact.
 */
export async function extractSubtitlesFromArchive(
  archivePath: string,
  options: ArchiveExtractOptions,
): Promise<ArchiveExtractOutcome> {
  try {
    const stat = await fsp.stat(archivePath);
    if (!stat.isFile()) return { ok: false, reason: 'The downloaded archive is not a file.' };
  } catch {
    return { ok: false, reason: 'The downloaded archive could not be opened.' };
  }

  let paths: ArchiveReaderPaths;
  try {
    paths = archiveReaderPaths();
  } catch (error) {
    return {
      ok: false,
      reason: `The archive reader is not installed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const workerData = {
    modulePath: paths.modulePath,
    wasmPath: paths.wasmPath,
    dir: path.dirname(archivePath),
    file: path.basename(archivePath),
    extensions: options.extensions.map((ext) => ext.toLowerCase()),
    maxUnpackedBytes: options.maxUnpackedBytes,
  };

  const raw = await runArchiveWorker(workerData, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!raw.ok) {
    const overflow = /^unpacked-too-large:(\d+)$/.exec(raw.reason);
    if (overflow) {
      return {
        ok: false,
        reason: 'This release is a compressed archive whose subtitles unpack to '
          + `${Math.round(Number(overflow[1]) / (1024 * 1024))} MB, over the `
          + `${Math.round(options.maxUnpackedBytes / (1024 * 1024))} MB this app will take.`,
      };
    }
    return raw;
  }
  return raw;
}

/** One worker, one archive, one message. Terminated on every exit path. */
function runArchiveWorker(
  workerData: Record<string, unknown>,
  timeoutMs: number,
): Promise<ArchiveExtractOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData });
    const finish = (outcome: ArchiveExtractOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, reason: 'Extracting the archive took too long and was stopped.' });
    }, timeoutMs);
    worker.on('message', (message: ArchiveExtractOutcome) => finish(message));
    worker.on('error', (error: Error) => {
      finish({ ok: false, reason: `The archive could not be extracted: ${error.message}` });
    });
    worker.on('exit', () => {
      // An exit before any message is a crash inside the reader, not a result.
      finish({ ok: false, reason: 'The archive reader stopped before it produced anything.' });
    });
  });
}
