#!/usr/bin/env node
// Keeps public/ort/ populated with onnxruntime-web's WASM engine files, which
// every Whisper transcription loads at runtime from `/ort/…`.
//
// Why this exists (measured 2026-09-01). `public/ort/` is in .gitignore and was
// hand-populated, so it existed in the main checkout and in NO git worktree. A
// worktree therefore had no ONNX backend at all and Whisper could not run —
// which is what actually blocked MINING gates 3 and 11 for days, under the
// label "needs an exclusive Electron".
//
// It does not fail like a missing file, which is why it cost so long to find:
// Vite's SPA fallback answers `/ort/ort-wasm-simd-threaded.asyncify.mjs` with
// HTTP 200 and `Content-Type: text/html`, so a status-code probe reads healthy.
// Only the body differs, and the renderer's own message blames webgpu:
// `no available backend found. ERR: [webgpu] Failed to fetch dynamically
// imported module`.
//
// The 8 files were verified byte-identical (sha256) to the ones already shipped
// in node_modules/onnxruntime-web/dist, so this copies rather than invents.
// Same shape as sync-extension-mirror.cjs: idempotent, content-compared, and
// silent when there is nothing to do.

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
const DEST_DIR = path.join(__dirname, '..', 'public', 'ort');

// Only the threaded WASM engine set. `dist/` also carries ~30 bundle variants
// that are resolved through the module graph and must NOT be served statically —
// copying the whole directory would put 200+ MB in public/ for no benefit.
const PREFIX = 'ort-wasm-simd-threaded.';

if (!fs.existsSync(SRC_DIR)) {
  // Not an error: `npm ci` order means postinstall can run before every optional
  // dependency is on disk, and a missing ORT only disables transcription.
  console.log('sync-ort-assets: onnxruntime-web not installed — nothing to do.');
  process.exit(0);
}

const names = fs.readdirSync(SRC_DIR).filter((n) => n.startsWith(PREFIX));
if (names.length === 0) {
  console.error(`sync-ort-assets: no ${PREFIX}* files in ${SRC_DIR}.`);
  process.exit(1);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

let copied = 0;
for (const name of names) {
  const srcPath = path.join(SRC_DIR, name);
  const destPath = path.join(DEST_DIR, name);
  const src = fs.readFileSync(srcPath);
  // Compare contents, not mtimes: these are large and a needless rewrite makes
  // the dev server's watcher churn on files it is explicitly told to ignore
  // (vite.renderer.config.ts pins **/public/ort/** as unwatched for EBUSY).
  if (fs.existsSync(destPath) && fs.readFileSync(destPath).equals(src)) continue;
  fs.writeFileSync(destPath, src);
  copied += 1;
}

console.log(
  copied === 0
    ? `sync-ort-assets: ${names.length} file(s) already current.`
    : `sync-ort-assets: copied ${copied} of ${names.length} file(s) into public/ort/.`,
);
