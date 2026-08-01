/**
 * Phase 5 — run the SHIPPED manga OCR pipeline outside Electron.
 *
 * Why this exists: the Phase 5 reading gate that remained open was "manga OCR ->
 * mine a card", and the only fixture available was a 1x1 GIF, which cannot be
 * read. `make-manga-fixture-pages.mjs` now renders a readable page, but every
 * calibration attempt on it would otherwise cost a full Electron run — start the
 * app, start a sidecar, download a chapter, open the reader, press Scan. That is
 * far too slow a loop for "is my fixture legible to comic-text-detector at this
 * font size", and repeated live app starts are exactly what this project's
 * constraints discourage.
 *
 * So the same technique as `reading-boundary-harness.mjs` is applied to
 * `src/main/mangaOcr.ts`: bundle the real module and stub only what genuinely
 * cannot exist here.
 *
 *   - `electron` -> `nativeImage` backed by `sharp`. This is a faithful stand-in
 *     rather than a shortcut: `loadPageImage` only needs `isEmpty/getSize/
 *     toBitmap`, and it converts BGRA -> RGBA itself, so the stub hands back
 *     BGRA exactly as Electron does on Windows. Every pixel the model sees comes
 *     from the same code path the app uses.
 *   - `./downloads` -> the REAL installed ONNX models, read from the real
 *     userData `models/` directory. The models are not stubbed; only the
 *     download manager's bookkeeping is.
 *   - `./library` -> a temp item directory. Nothing is written under Study OS
 *     userData: `itemDir` is the single place mangaOcr resolves paths through,
 *     and the OCR cache it writes lands in the temp dir with it.
 *   - `./translate` -> unavailable, so the translate branch is inert.
 *
 * What this proves and what it does not: it proves detection and recognition on
 * a real page through the shipped code. It does NOT exercise `registerMangaOcrIpc`,
 * the preload bridge, or the reader UI — the live app run owns those.
 *
 * Usage:
 *   node docs/migration/tools/manga-ocr-harness.mjs [--pages <dir>] [--sensitivity normal|low|high]
 *
 * Set `HARNESS_OUT` to write the result JSON to a file instead of stdout.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(import.meta.dirname, '../../..');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const PAGES_DIR = path.resolve(
  arg('--pages', path.join(os.tmpdir(), 'phase5-manga-fixture-pages')),
);
const SENSITIVITY = arg('--sensitivity', 'normal');

/** The real, installed model directory. Read-only here. */
const USER_DATA = path.join(os.homedir(), 'AppData', 'Roaming', 'jp-study-app');
const MODELS_DIR = path.join(USER_DATA, 'models');

const MODEL_FILES = {
  'manga-ocr': path.join(MODELS_DIR, 'manga-ocr', 'encoder_model.onnx'),
  'manga-ocr-decoder': path.join(MODELS_DIR, 'manga-ocr-decoder', 'decoder_model.onnx'),
  'manga-ocr-vocab': path.join(MODELS_DIR, 'manga-ocr-vocab', 'vocab.txt'),
  'comic-text-detector': path.join(MODELS_DIR, 'comic-text-detector', 'comictextdetector.onnx'),
};

function log(...parts) {
  console.log('[manga-ocr-harness]', ...parts);
}

// ----------------------------------------------------------------- stubs

function writeStubs(dir, itemRoot) {
  const electronStub = path.join(dir, 'electron-stub.mjs');
  fs.writeFileSync(
    electronStub,
    `
/**
 * mangaOcr only needs isEmpty/getSize/toBitmap, and it expects toBitmap to be
 * BGRA (what Electron returns on Windows), converting to RGBA itself. sharp
 * decodes to RGBA, so this swaps the channels to hand back what Electron would.
 */
function bitmapFrom(raw, info) {
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * 4;
    out[o] = raw[o + 2];
    out[o + 1] = raw[o + 1];
    out[o + 2] = raw[o];
    out[o + 3] = info.channels === 4 ? raw[o + 3] : 255;
  }
  return out;
}

function makeImage(buffer) {
  if (!buffer) return { isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }), toBitmap: () => Buffer.alloc(0) };
  const { data, info } = buffer;
  const bitmap = bitmapFrom(data, info);
  return {
    isEmpty: () => false,
    getSize: () => ({ width: info.width, height: info.height }),
    toBitmap: () => bitmap,
  };
}

// Synchronous decode, because nativeImage's API is synchronous. sharp exposes no
// sync decode, so a worker would be needed for true parity; instead the harness
// pre-decodes through globalThis.__harnessDecode, which the runner fills in.
export const nativeImage = {
  createFromPath: (file) => makeImage(globalThis.__harnessDecode?.(file) ?? null),
  createFromDataURL: (url) => makeImage(globalThis.__harnessDecodeDataUrl?.(url) ?? null),
};
export const BrowserWindow = { getAllWindows: () => [] };
export const ipcMain = { handle: () => {}, on: () => {}, removeHandler: () => {} };
export const app = { getPath: () => ${JSON.stringify(itemRoot.replace(/\\\\/g, '/'))} };
`,
  );

  const downloadsStub = path.join(dir, 'downloads-stub.mjs');
  fs.writeFileSync(
    downloadsStub,
    `
const PATHS = ${JSON.stringify(MODEL_FILES, null, 2)};
export const assetPath = (id) => PATHS[id] ?? null;
export const isInstalled = (id) => Boolean(PATHS[id]);
export const registerAssetUnloadHandler = () => () => {};
`,
  );

  const libraryStub = path.join(dir, 'library-stub.mjs');
  fs.writeFileSync(
    libraryStub,
    `
import path from 'node:path';
const ROOT = ${JSON.stringify(itemRoot.replace(/\\\\/g, '/'))};
export const itemDir = (id) => path.join(ROOT, id);
export const listMangaPageUrls = () => [];
export const updateLibraryOcrMeta = () => {};
export const importProviderMangaChapter = () => { throw new Error('not used in this harness'); };
export const getMangaPages = () => [];
`,
  );

  const translateStub = path.join(dir, 'translate-stub.mjs');
  fs.writeFileSync(
    translateStub,
    `
export const isTranslateAvailable = () => false;
export const runTranslationBatch = async () => [];
`,
  );

  return { electronStub, downloadsStub, libraryStub, translateStub };
}

async function buildShippedModule(itemRoot) {
  const esbuild = await import(pathToFileURL(path.join(REPO, 'node_modules/esbuild/lib/main.js')));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-ocr-harness-'));
  const stubs = writeStubs(outDir, itemRoot);

  const entry = path.join(outDir, 'entry.ts');
  fs.writeFileSync(
    entry,
    [
      `export { scanMangaPage, mangaOcrAvailable, detectTuning } from ${JSON.stringify(
        path.join(REPO, 'src/main/mangaOcr.ts').replace(/\\/g, '/'),
      )};`,
    ].join('\n'),
  );

  const outFile = path.join(outDir, 'bundle.mjs');
  await esbuild.build({
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    plugins: [
      {
        name: 'harness-stubs',
        setup(build) {
          // onnxruntime-node loads a native .node binary, so it must stay
          // external — and because the bundle is written to a temp directory
          // outside the repo, a bare specifier would not resolve from there.
          // Point it at the real installed entry by absolute path.
          build.onResolve({ filter: /^onnxruntime-node$/ }, () => ({
            path: pathToFileURL(
              path.join(REPO, 'node_modules/onnxruntime-node/dist/index.js'),
            ).href,
            external: true,
          }));
          build.onResolve({ filter: /^electron$/ }, () => ({ path: stubs.electronStub }));
          build.onResolve({ filter: /[\\/]downloads$/ }, () => ({ path: stubs.downloadsStub }));
          build.onResolve({ filter: /[\\/]library$/ }, () => ({ path: stubs.libraryStub }));
          build.onResolve({ filter: /[\\/]translate$/ }, () => ({ path: stubs.translateStub }));
        },
      },
    ],
  });

  return { module: await import(pathToFileURL(outFile)), outDir };
}

// ----------------------------------------------------------------- decode

/**
 * `nativeImage.createFromPath` is synchronous and sharp is not, so every page is
 * decoded up front and served from this map. The decoded pixels are still the
 * ones the shipped code consumes.
 */
/* global globalThis -- the repo's lint env predates it; this is the handoff to the electron stub. */
async function predecode(files) {
  const sharp = (await import(pathToFileURL(path.join(REPO, 'node_modules/sharp/lib/index.js')))).default;
  const decoded = new Map();
  for (const file of files) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    decoded.set(path.resolve(file), { data, info });
  }
  globalThis.__harnessDecode = (file) => decoded.get(path.resolve(file)) ?? null;
  return decoded;
}

// -------------------------------------------------------------------- run

const results = {
  proof: 'Phase 5 — shipped manga OCR pipeline run on a readable fixture page, outside Electron',
  date: new Date().toISOString().slice(0, 10),
  tool: 'docs/migration/tools/manga-ocr-harness.mjs',
  method:
    'src/main/mangaOcr.ts bundled with only electron (nativeImage -> sharp), ./downloads (-> the real installed ONNX models), ./library (-> a temp item dir) and ./translate stubbed. Detection and recognition are the shipped code and the real models.',
  sensitivity: SENSITIVITY,
  pagesDir: PAGES_DIR,
};

let buildDir = null;
let itemRoot = null;

try {
  const manifestPath = path.join(PAGES_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `No fixture manifest at ${manifestPath}. Run: node docs/migration/tools/make-manga-fixture-pages.mjs`,
    );
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  results.fixture = { font: manifest.font, pageWidth: manifest.pageWidth, pageHeight: manifest.pageHeight };

  for (const [id, file] of Object.entries(MODEL_FILES)) {
    if (!fs.existsSync(file)) throw new Error(`Model "${id}" is not installed at ${file}`);
  }
  results.models = Object.fromEntries(
    Object.entries(MODEL_FILES).map(([id, file]) => [id, fs.statSync(file).size]),
  );

  // A temp library item that mirrors the on-disk shape mangaOcr expects:
  // <itemDir>/pages/<n>.png, addressed as media://<itemId>/pages/<n>.png.
  itemRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-ocr-item-'));
  const itemId = 'phase5-ocr-harness';
  const pagesTarget = path.join(itemRoot, itemId, 'pages');
  fs.mkdirSync(pagesTarget, { recursive: true });
  const staged = [];
  for (const page of manifest.pages) {
    const target = path.join(pagesTarget, `${page.name}.png`);
    fs.copyFileSync(page.file, target);
    staged.push({ page, target, mediaUrl: `media://${itemId}/pages/${page.name}.png` });
  }
  await predecode(staged.map((s) => s.target));

  const built = await buildShippedModule(itemRoot);
  buildDir = built.outDir;
  log(`bundled shipped mangaOcr.ts; models available: ${built.module.mangaOcrAvailable()}`);
  results.mangaOcrAvailable = built.module.mangaOcrAvailable();

  results.pages = [];
  for (const { page, mediaUrl } of staged) {
    const started = Date.now();
    const scanned = await built.module.scanMangaPage({
      itemId,
      mediaUrl,
      force: true,
      detectionSensitivity: SENSITIVITY,
    });
    const elapsedMs = Date.now() - started;

    const read = scanned.blocks.map((b) => ({
      text: b.lines.join(''),
      rawText: (b.rawLines ?? []).join(''),
      box: b.box,
      vertical: b.vertical,
      kind: b.kind,
      confidence: Number(b.confidence?.toFixed(3) ?? 0),
    }));
    const readTexts = read.map((r) => r.text).filter(Boolean);
    const expected = page.bubbles;
    // Exact match per bubble, in reading order. A near miss is reported rather
        // than smoothed over: OCR is only "proven" here if it returns the drawn text.
    const matchedExactly = expected.filter((want) => readTexts.includes(want));

    log(
      `${page.name}: ${scanned.blocks.length} regions in ${elapsedMs}ms; ` +
        `${matchedExactly.length}/${expected.length} bubbles read exactly`,
    );
    for (const r of read) log(`  [${r.kind}] ${r.text || '(empty)'}`);

    results.pages.push({
      name: page.name,
      imgWidth: scanned.img_width,
      imgHeight: scanned.img_height,
      elapsedMs,
      regionCount: scanned.blocks.length,
      expectedBubbles: expected,
      readRegions: read,
      matchedExactly,
      missing: expected.filter((want) => !readTexts.includes(want)),
    });
  }

  const allMatched = results.pages.every((p) => p.missing.length === 0);
  results.verdict = allMatched ? 'PASS' : 'FAIL';
  results.note = allMatched
    ? 'Every drawn bubble was read back exactly by the shipped pipeline, so the fixture is genuinely readable and an OCR miss in the app would be a real defect.'
    : 'At least one drawn bubble was not read back exactly. Either the fixture needs adjusting or the pipeline has a defect — do not treat the app run as blocked on the fixture until this passes.';
} catch (error) {
  results.verdict = 'FAIL';
  results.error = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
  console.error('[manga-ocr-harness] FAILED:', error);
} finally {
  if (buildDir) fs.rmSync(buildDir, { recursive: true, force: true });
  if (itemRoot) fs.rmSync(itemRoot, { recursive: true, force: true });
  log('cleaned up: temp bundle and temp item directory removed; Study OS userData untouched');
}

const outPath = process.env.HARNESS_OUT;
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
  log(`wrote ${outPath}`);
} else {
  console.log(JSON.stringify(results, null, 2));
}

process.exit(results.verdict === 'PASS' ? 0 : 1);
