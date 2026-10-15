'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS dev tool, run by node directly */
/* global globalThis */
/**
 * The manga reader's auto-OCR path in main, with the REAL models, outside the app.
 *
 *   node tools/ocr-eval/manga-flow-smoke.cjs --pages <pagesDir> --models <modelsDir>
 *
 * Runs what the reader asks of main when the user pages through a book with
 * "Read each page automatically" on — through the shipped `mangaOcr.ts` (page
 * queue, cache files, corrections) bundled with esbuild, Electron replaced by a
 * stub that decodes pages with @napi-rs/canvas and records the progress events
 * the reader would get. The library item is a temp folder; nothing touches a
 * Gum profile. Each step prints PASS/FAIL; the exit code is the failure count.
 *
 *  1. Open page 1: a `page` scan, then the read-ahead of page 2. Progress goes
 *     detect → ocr 0/N … → done; the page's cache file is written.
 *  2. Turn to page 2 while its read-ahead runs: the reader joins that scan.
 *  3. Jump to page 4 while page 3 is being read ahead: page 3 is cancelled
 *     (no cache written), page 4 is read.
 *  4. Back to page 1: answered from the cache, without the models.
 *  5. A correction on page 1, filed under a box an older detector drew, then a
 *     forced rescan: the correction follows its bubble.
 *  6. The OCR router's entry point: one line crop with per-step top-3 candidates.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadMangaOcr } = require('./manga-eval.cjs');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--pages') out.pages = argv[++i];
    else if (argv[i] === '--models') out.models = argv[++i];
  }
  if (!out.pages || !out.models) {
    console.error('usage: node tools/ocr-eval/manga-flow-smoke.cjs --pages <dir> --models <dir>');
    process.exit(2);
  }
  return out;
}

const ELECTRON_STUB = `
const path = require('node:path');
// nativeImage decodes synchronously; @napi-rs/canvas only asynchronously, so the
// smoke decodes every page up front into this map (see decodeAll below).
function decode(file) {
  const hit = globalThis.__gumMangaSmoke.decoded.get(path.resolve(file));
  if (!hit) throw new Error('Could not decode page image.');
  return hit;
}
function native({ rgba, width, height }) {
  return {
    isEmpty: () => width === 0,
    getSize: () => ({ width, height }),
    toBitmap() {
      const out = Buffer.alloc(width * height * 4);
      for (let o = 0; o < out.length; o += 4) {
        out[o] = rgba[o + 2]; out[o + 1] = rgba[o + 1]; out[o + 2] = rgba[o]; out[o + 3] = rgba[o + 3];
      }
      return out;
    },
  };
}
module.exports = {
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (ch, p) => globalThis.__gumMangaSmoke.events.push({ ch, p, at: Date.now() }) } }] },
  ipcMain: { handle() {} },
  nativeImage: {
    createFromPath: (p) => native(decode(p)),
  },
};`;

const LIBRARY_STUB = `
const path = require('node:path');
exports.itemDir = (id) => path.join(globalThis.__gumMangaSmoke.root, id);
exports.listMangaPageUrls = () => globalThis.__gumMangaSmoke.pages;
exports.updateLibraryOcrMeta = () => {};`;

async function main() {
  const args = parseArgs(process.argv);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-manga-smoke-'));
  const itemId = 'smoke-item';
  const itemDir = path.join(root, itemId);
  fs.mkdirSync(itemDir, { recursive: true });
  const files = fs.readdirSync(args.pages).filter((f) => /\.png$/i.test(f)).sort().slice(0, 4);
  if (files.length < 4) throw new Error('need 4 pages');
  for (const f of files) fs.copyFileSync(path.join(args.pages, f), path.join(itemDir, f));
  const urls = files.map((f) => `media://${itemId}/${f}`);
  const { decodePng } = require('./manga-eval.cjs');
  const decoded = new Map();
  for (const f of files) decoded.set(path.resolve(itemDir, f), await decodePng(path.join(itemDir, f)));
  const smoke = { root, pages: urls, events: [], decoded };
  globalThis.__gumMangaSmoke = smoke;
  const ocr = await loadMangaOcr(args.models, undefined, {
    real: ['atomicJson'],
    stubs: { electron: ELECTRON_STUB, library: LIBRARY_STUB },
  });

  let failures = 0;
  const check = (name, ok, detail) => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
  };
  const cacheFile = (i) => path.join(itemDir, '_ocr', files[i].replace(/\.png$/i, '.json'));
  const cancelled = (p) => p.then(() => false, (e) => ocr.isMangaOcrCancelled?.(e) ?? /MANGA_OCR_CANCELLED/.test(String(e?.message)));
  const text = (page) => page.blocks.map((b) => b.lines.join('')).join(' / ');
  const scan = (i, priority, extra = {}) => ocr.requestMangaPageScan({ itemId, mediaUrl: urls[i], ...extra }, priority);

  // 1. open page 1, read ahead page 2
  let t = Date.now();
  const p1 = scan(0, 'page');
  const ahead2 = scan(1, 'prefetch');
  const page1 = await p1;
  const ms1 = Date.now() - t;
  const phases = smoke.events.filter((e) => e.ch === 'mangaOcr:progress' && e.p.mediaUrl === urls[0]).map((e) => e.p.phase);
  check('page 1 is read (first page includes model load)', page1.blocks.length > 0, { ms: ms1, blocks: page1.blocks.length, text: text(page1).slice(0, 80) });
  check('progress runs detect → ocr … → done', phases[0] === 'detect' && phases.includes('ocr') && phases[phases.length - 1] === 'done', phases.join(','));
  check('page 1 is cached on disk', fs.existsSync(cacheFile(0)));

  // 2. turn to page 2 while its read-ahead runs: join it
  t = Date.now();
  const page2 = await scan(1, 'page');
  check('turning to page 2 joins its read-ahead', page2 === (await ahead2), { msAfterTurn: Date.now() - t });

  // 3. read ahead page 3, jump to page 4 before it finishes
  const ahead3 = scan(2, 'prefetch');
  await new Promise((r) => setTimeout(r, 150));
  t = Date.now();
  const p4 = scan(3, 'page');
  const wasCancelled = await cancelled(ahead3);
  const page4 = await p4;
  check('jumping to page 4 cancels page 3\'s read-ahead', wasCancelled === true);
  check('…and writes nothing for page 3', !fs.existsSync(cacheFile(2)));
  check('page 4 is read', page4.blocks.length > 0, { ms: Date.now() - t, blocks: page4.blocks.length });

  // 4. back to page 1: from the cache
  t = Date.now();
  const again = await scan(0, 'page');
  const cachedMs = Date.now() - t;
  check('page 1 again comes from the cache', cachedMs < 200 && again.blocks.length === page1.blocks.length, { ms: cachedMs });

  // 5. a correction filed under an older detector's box, then a forced rescan
  const target = page1.blocks[0];
  const [x0, y0, x1, y1] = target.box;
  const stem = files[0].replace(/\.png$/i, '');
  const oldId = `${stem}:${x0 - 6},${y0 + 5},${x1 + 4},${y1 - 7}`;
  await ocr.writeCorrections(itemId, stem, { [oldId]: { lines: ['なおした'] } });
  const rescanned = await scan(0, 'page', { force: true });
  const carried = rescanned.blocks.find((b) => b.regionId === target.regionId);
  const onDisk = JSON.parse(fs.readFileSync(path.join(itemDir, '_ocr', `${stem}.corrections.json`), 'utf8'));
  check('a forced rescan keeps the correction on its bubble', carried?.lines.join('') === 'なおした', carried?.lines);
  check('…and re-files it under the new region id', Boolean(onDisk[target.regionId]) && !onDisk[oldId], Object.keys(onDisk));
  check('…while keeping the raw read beside it', Array.isArray(carried?.rawLines) && carried.rawLines.join('') !== 'なおした', carried?.rawLines);

  // 6. the router's entry: one line crop with top-3 candidates per step
  const { rgba, width, height } = decoded.get(path.resolve(itemDir, files[0]));
  const regions = await ocr.detectMangaTextBlocks(rgba, width, height);
  const line = regions[0].lines[0];
  const read = await ocr.recognizeMangaCrop(rgba, width, height, line.box, { topK: 3 });
  check('recognizeMangaCrop returns per-step top-3 candidates', read.steps?.length === [...read.rawText].length && read.steps.every((s) => s.candidates.length === 3 && s.candidates[0].token === s.token), {
    text: read.text,
    confidence: +read.confidence.toFixed(3),
    steps: read.steps?.slice(0, 3).map((s) => s.candidates.map((c) => `${c.token}:${c.prob.toFixed(3)}`).join(' ')),
  });

  fs.rmSync(root, { recursive: true, force: true });
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures);
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
