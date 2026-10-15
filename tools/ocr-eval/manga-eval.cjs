'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS dev tool, run by node directly */
/**
 * Real-model eval of the manga reader's OCR: comic-text-detector → line grouping
 * → manga-ocr, exactly as `src/main/mangaOcr.ts` runs it, on pages with known
 * text (`manga-pages.cjs` makes synthetic ones).
 *
 *   node tools/ocr-eval/manga-pages.cjs <pagesDir>
 *   node tools/ocr-eval/manga-eval.cjs --pages <pagesDir> --models <modelsDir>
 *        [--sensitivity low|normal|high] [--json <out.json>] [--verbose]
 *
 * <modelsDir> holds the four files the asset registry downloads, under their
 * registry file names: encoder_model.onnx, decoder_model.onnx, vocab.txt and
 * comictextdetector.onnx. Keep it in a temp folder — never the Gum profile.
 *
 * mangaOcr.ts is bundled with esbuild on the fly. Electron and the main-process
 * modules it imports (downloads, library, translate…) are replaced by small
 * stubs, so this runs in plain node; the detection and recognition code is the
 * shipped code, unmodified. Pages are decoded with @napi-rs/canvas.
 *
 * Reports, per page and in total: bubbles found (recall), boxes that are not
 * text (false positives), bubbles split or merged, reading order (pairs in the
 * right order), character accuracy (1 − CER, NFKC-normalised) and time.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const REPO = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const out = { sensitivity: 'normal', verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pages') out.pages = argv[++i];
    else if (a === '--models') out.models = argv[++i];
    else if (a === '--sensitivity') out.sensitivity = argv[++i];
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--verbose') out.verbose = true;
    // Write page-NN.overlay.png: truth (green), blocks (red), line crops (blue).
    else if (a === '--overlays') out.overlays = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    // Another checkout's sources (e.g. a copy of an older mangaOcr.ts), to compare.
    else if (a === '--src') out.src = argv[++i];
  }
  if (!out.pages || !out.models) {
    console.error('usage: node tools/ocr-eval/manga-eval.cjs --pages <dir> --models <dir> [--sensitivity normal] [--json out.json]');
    process.exit(2);
  }
  return out;
}

const ASSET_FILES = {
  'manga-ocr': 'encoder_model.onnx',
  'manga-ocr-decoder': 'decoder_model.onnx',
  'manga-ocr-vocab': 'vocab.txt',
  'comic-text-detector': 'comictextdetector.onnx',
};

/** src/main modules the scan pipeline runs as shipped (everything else is stubbed). */
const REAL_MAIN_MODULES = new Set(['mangaScanQueue']);

/** Stub sources for everything mangaOcr.ts imports from Electron and src/main. */
function stubSource(name, modelsDir) {
  switch (name) {
    case 'electron':
      return `module.exports = {
        BrowserWindow: { getAllWindows: () => [] },
        ipcMain: { handle() {} },
        nativeImage: { createFromPath() { throw new Error('nativeImage is not available in the eval'); } },
      };`;
    case 'downloads':
      return `const path = require('node:path'); const fs = require('node:fs');
        const FILES = ${JSON.stringify(ASSET_FILES)};
        const DIR = ${JSON.stringify(path.resolve(modelsDir))};
        exports.assetPath = (id) => (FILES[id] ? path.join(DIR, FILES[id]) : null);
        exports.isInstalled = (id) => !!FILES[id] && fs.existsSync(path.join(DIR, FILES[id]));
        exports.registerAssetUnloadHandler = () => () => {};`;
    case 'studyLanguage':
      return `exports.getMainStudyLang = () => 'ja';`;
    default:
      // library, paddleOcr, translate, atomicJson: not reached by the eval path.
      return `module.exports = new Proxy({}, { get: (_t, key) => key === '__esModule' ? false : () => { throw new Error('stub: ${name}.' + String(key)); } });`;
  }
}

/**
 * Bundle and load mangaOcr.ts. `extra.real` names more src/main modules to bundle
 * as shipped; `extra.stubs` replaces a stub's source (`electron`, `library`…).
 */
async function loadMangaOcr(modelsDir, srcRoot = REPO, extra = {}) {
  const real = new Set([...REAL_MAIN_MODULES, ...(extra.real ?? [])]);
  const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
  const mainDir = path.join(path.resolve(srcRoot), 'src', 'main');
  const result = await esbuild.build({
    entryPoints: [path.join(mainDir, 'mangaOcr.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    write: false,
    external: ['onnxruntime-node', '@napi-rs/canvas'],
    logLevel: 'error',
    plugins: [
      {
        name: 'gum-eval-stubs',
        setup(build) {
          build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
          build.onResolve({ filter: /^\.\/[A-Za-z]+$/ }, (args) => {
            if (path.resolve(args.resolveDir) !== mainDir) return undefined;
            // Pure modules of the pipeline are bundled for real.
            if (real.has(args.path.slice(2))) return undefined;
            return { path: args.path.slice(2), namespace: 'stub' };
          });
          build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
            contents: extra.stubs?.[args.path] ?? stubSource(args.path, modelsDir),
            loader: 'js',
          }));
        },
      },
    ],
  });
  const code = result.outputFiles[0].text;
  // Compiled as if it sat next to the source, so `onnxruntime-node` resolves
  // from the repo's node_modules. Nothing is written into the repo.
  const filename = path.join(REPO, 'src', 'main', '__mangaOcrEval.cjs');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(code, filename);
  return mod.exports;
}

async function decodePng(file) {
  const { loadImage, createCanvas } = require(path.join(REPO, 'node_modules', '@napi-rs', 'canvas'));
  const img = await loadImage(fs.readFileSync(file));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  return { rgba: Buffer.from(data.buffer, data.byteOffset, data.byteLength), width: img.width, height: img.height };
}

// ----- metrics -------------------------------------------------------------

function norm(s) {
  return s.normalize('NFKC').replace(/\s+/g, '').replace(/\.{2,}|・{2,}/g, '…');
}

function levenshtein(a, b) {
  const A = [...a];
  const B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[B.length];
}

function area(b) {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}
function inter(a, b) {
  return Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
}
function grow(b, m) {
  return [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
}

/** Pairs (i<j) of a sequence that are in ascending order, as a fraction. */
function pairOrder(seq) {
  let ok = 0;
  let all = 0;
  for (let i = 0; i < seq.length; i++) {
    for (let j = i + 1; j < seq.length; j++) {
      all++;
      if (seq[i] < seq[j]) ok++;
    }
  }
  return { ok, all };
}

function scorePage(truth, blocks) {
  const gts = truth.bubbles.map((b) => ({ ...b, zone: grow(b.box, b.size * 0.6), assigned: [] }));
  const falseBlocks = [];
  const merged = [];
  blocks.forEach((blk, bi) => {
    const hits = gts
      .map((g, gi) => ({ gi, cover: inter(blk.box, g.zone) / Math.max(1, area(blk.box)), gtCover: inter(blk.box, g.box) / Math.max(1, area(g.box)) }))
      .filter((h) => h.cover > 0.15 || h.gtCover > 0.3);
    if (!hits.length) {
      falseBlocks.push(blk);
      return;
    }
    if (hits.filter((h) => h.gtCover > 0.3).length > 1) merged.push(bi);
    const best = hits.sort((a, b) => b.cover - a.cover)[0];
    gts[best.gi].assigned.push(bi);
  });
  const rows = gts.map((g) => {
    const own = g.assigned.map((bi) => blocks[bi]);
    const pred = norm(own.map((b) => b.lines.map((l) => l.text).join('')).join(''));
    const want = norm(g.lines.join(''));
    const dist = levenshtein(pred, want);
    const covered = own.reduce((s, b) => s + inter(b.box, g.box), 0) / Math.max(1, area(g.box));
    return {
      order: g.order,
      vertical: g.vertical,
      want,
      pred,
      found: own.length > 0 && covered >= 0.5,
      split: own.length > 1,
      lineCountOk: own.length === 1 && own[0].lines.length === g.lines.length,
      edits: dist,
      chars: [...want].length,
      confidence: own.length ? own.reduce((s, b) => s + b.confidence, 0) / own.length : 0,
    };
  });
  // Reading order over bubbles that were found, by first detected block.
  const seq = [];
  blocks.forEach((_, bi) => {
    const gi = gts.findIndex((g) => g.assigned.includes(bi));
    if (gi >= 0 && !seq.includes(gi)) seq.push(gi);
  });
  return {
    rows,
    order: pairOrder(seq),
    seq,
    falseBlocks: falseBlocks.map((b) => ({ box: b.box.map(Math.round), text: b.lines.map((l) => l.text).join('/'), confidence: +b.confidence.toFixed(2) })),
    merged: merged.length,
  };
}

async function writeOverlay(src, dest, truth, blocks) {
  const { loadImage, createCanvas } = require(path.join(REPO, 'node_modules', '@napi-rs', 'canvas'));
  const img = await loadImage(fs.readFileSync(src));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const rect = (b, color, w) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
  };
  for (const g of truth.bubbles) rect(g.box, 'rgba(0,170,0,0.8)', 1);
  blocks.forEach((b, i) => {
    rect(b.box, 'rgba(220,0,0,0.9)', 2);
    ctx.fillStyle = 'rgba(220,0,0,0.9)';
    ctx.font = '20px sans-serif';
    ctx.fillText(String(i + 1), b.box[0], b.box[1] - 4);
    for (const l of b.lines) rect(l.box, 'rgba(0,80,255,0.9)', 1);
  });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, await canvas.encode('png'));
}

// ----- run -----------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const truth = JSON.parse(fs.readFileSync(path.join(args.pages, 'truth.json'), 'utf8'));
  const pages = args.limit ? truth.pages.slice(0, args.limit) : truth.pages;
  const t0 = Date.now();
  const ocr = await loadMangaOcr(args.models, args.src);
  const bundleMs = Date.now() - t0;

  const out = [];
  let loadMs = 0;
  let peakRss = 0;
  for (const [pi, page] of pages.entries()) {
    const { rgba, width, height } = await decodePng(path.join(args.pages, page.file));
    const tDetect = Date.now();
    const regions = await ocr.detectMangaTextBlocks(rgba, width, height, args.sensitivity);
    let detectMs = Date.now() - tDetect;
    if (pi === 0) {
      // The first call also loads the three sessions; time that apart.
      const again = Date.now();
      await ocr.detectMangaTextBlocks(rgba, width, height, args.sensitivity);
      const warm = Date.now() - again;
      loadMs = detectMs - warm;
      detectMs = warm;
    }
    const tRead = Date.now();
    const blocks = [];
    let lineCount = 0;
    let emptyLines = 0;
    for (const region of regions) {
      const read = await ocr.readMangaTextBlock(rgba, width, height, region);
      lineCount += region.lines?.length ?? 1;
      emptyLines += (region.lines?.length ?? 1) - read.lines.length;
      blocks.push({ box: region.box, vertical: region.vertical, lines: read.lines, confidence: read.confidence });
    }
    const readMs = Date.now() - tRead;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    const score = scorePage(page, blocks);
    out.push({ file: page.file, detectMs, readMs, blocks: blocks.length, lines: lineCount, emptyLines, ...score });
    const found = score.rows.filter((r) => r.found).length;
    const chars = score.rows.reduce((s, r) => s + r.chars, 0);
    const edits = score.rows.reduce((s, r) => s + Math.min(r.edits, r.chars), 0);
    console.log(
      `${page.file}: bubbles ${found}/${score.rows.length}, false boxes ${score.falseBlocks.length}, ` +
        `order ${score.order.ok}/${score.order.all}, char acc ${((1 - edits / Math.max(1, chars)) * 100).toFixed(1)}%, ` +
        `detect ${detectMs} ms, read ${readMs} ms (${blocks.length} blocks, ${lineCount} lines)`,
    );
    if (args.overlays) await writeOverlay(path.join(args.pages, page.file), path.join(args.overlays, page.file.replace(/\.png$/, '.overlay.png')), page, blocks);
    if (args.verbose) {
      for (const r of score.rows) {
        console.log(`   #${r.order} ${r.found ? 'ok ' : 'MISS'}${r.split ? ' split' : ''} want=${r.want} got=${r.pred} (edits ${r.edits}, conf ${r.confidence.toFixed(2)})`);
      }
      for (const f of score.falseBlocks) console.log(`   false box ${JSON.stringify(f.box)} "${f.text}" conf ${f.confidence}`);
      console.log(`   order seq ${score.seq.join(',')}`);
    }
  }

  const rows = out.flatMap((p) => p.rows);
  const chars = rows.reduce((s, r) => s + r.chars, 0);
  const edits = rows.reduce((s, r) => s + Math.min(r.edits, r.chars), 0);
  const foundRows = rows.filter((r) => r.found);
  const foundChars = foundRows.reduce((s, r) => s + r.chars, 0);
  const foundEdits = foundRows.reduce((s, r) => s + Math.min(r.edits, r.chars), 0);
  const order = out.reduce((s, p) => ({ ok: s.ok + p.order.ok, all: s.all + p.order.all }), { ok: 0, all: 0 });
  const summary = {
    pages: out.length,
    sensitivity: args.sensitivity,
    bubbles: rows.length,
    found: foundRows.length,
    split: rows.filter((r) => r.split).length,
    merged: out.reduce((s, p) => s + p.merged, 0),
    linesReadEmpty: out.reduce((s, p) => s + p.emptyLines, 0),
    falseBoxes: out.reduce((s, p) => s + p.falseBlocks.length, 0),
    falseBoxesWithText: out.reduce((s, p) => s + p.falseBlocks.filter((f) => f.text).length, 0),
    exactBubbles: rows.filter((r) => r.edits === 0).length,
    lineCountOk: rows.filter((r) => r.lineCountOk).length,
    orderPairs: `${order.ok}/${order.all}`,
    pagesInOrder: out.filter((p) => p.order.ok === p.order.all).length,
    charAccuracy: +(1 - edits / Math.max(1, chars)).toFixed(4),
    charAccuracyFound: +(1 - foundEdits / Math.max(1, foundChars)).toFixed(4),
    modelLoadMs: loadMs,
    bundleMs,
    detectMsAvg: Math.round(out.reduce((s, p) => s + p.detectMs, 0) / out.length),
    readMsAvg: Math.round(out.reduce((s, p) => s + p.readMs, 0) / out.length),
    readMsPerLine: Math.round(out.reduce((s, p) => s + p.readMs, 0) / Math.max(1, out.reduce((s, p) => s + p.lines, 0))),
    peakRssMb: Math.round(peakRss / 1048576),
  };
  console.log('\nsummary', JSON.stringify(summary, null, 1));
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ summary, pages: out }, null, 1));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { loadMangaOcr, decodePng };
