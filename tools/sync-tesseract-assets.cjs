#!/usr/bin/env node
// Keeps public/tesseract/ populated with the tesseract.js worker and recognition
// core, which manga OCR loads at runtime from `/tesseract/…`.
//
// Why this exists (measured 2026-09-03): same class as sync-ort-assets.cjs and
// sync-kuromoji-assets.cjs — `public/tesseract/` is gitignored (.gitignore:107),
// so a clean clone and every git worktree have no OCR engine, and `ocr.ts` points
// tesseract.js at these local paths precisely so a scan works offline. Without
// them the requests fall through to Vite's SPA fallback, which answers HTTP 200
// with `text/html`; only the body differs, so a status-code probe reads healthy
// and OCR "just doesn't work". L12_REMAINING_RISK.md R1.
//
// All three files were verified byte-identical (sha256) to the ones already in
// public/tesseract/, at tesseract.js 7.0.0 / tesseract.js-core 7.0.0, so this
// copies rather than invents.
//
// NOT COVERED, and check-runtime-assets.cjs is the gate that says so out loud:
// `public/tesseract/lang/*.traineddata.gz`. Those are upstream downloads, are not
// in node_modules, and have to be obtained out of band.
//
// The `.wasm` is copied alongside the `.wasm.js` even though ocr.ts names only the
// latter (it is self-contained — the WASM is embedded as base64). Mirroring what
// public/ already holds is safer than deciding at a distance that a sibling the
// engine may probe for is dead weight.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST_DIR = path.join(ROOT, 'public', 'tesseract');

/** @type {Array<{ from: string, to: string }>} */
const FILES = [
  { from: 'node_modules/tesseract.js/dist/worker.min.js', to: 'worker.min.js' },
  {
    from: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    to: 'core/tesseract-core-simd-lstm.wasm.js',
  },
  {
    from: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm',
    to: 'core/tesseract-core-simd-lstm.wasm',
  },
];

const available = FILES.filter((f) => fs.existsSync(path.join(ROOT, f.from)));
if (available.length === 0) {
  // Not an error, for the same reason ort's is not: `npm ci` ordering means
  // postinstall can run before every dependency is on disk, and
  // check-runtime-assets.cjs is the gate that refuses to PACKAGE without them.
  console.log('sync-tesseract-assets: tesseract.js not installed — nothing to do.');
  process.exit(0);
}

let copied = 0;
for (const file of available) {
  const srcPath = path.join(ROOT, file.from);
  const destPath = path.join(DEST_DIR, file.to);
  const src = fs.readFileSync(srcPath);
  // Compare contents, not mtimes — the core is multi-megabyte and a needless
  // rewrite makes the dev server's watcher churn.
  if (fs.existsSync(destPath) && fs.readFileSync(destPath).equals(src)) continue;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, src);
  copied += 1;
}

const skipped = FILES.length - available.length;
console.log(
  (copied === 0
    ? `sync-tesseract-assets: ${available.length} file(s) already current.`
    : `sync-tesseract-assets: copied ${copied} of ${available.length} file(s) into public/tesseract/.`) +
    (skipped > 0 ? ` ${skipped} not installed.` : ''),
);
