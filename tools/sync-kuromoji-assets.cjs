#!/usr/bin/env node
// Keeps public/kuromoji/dict/ populated with @sglkc/kuromoji's IPADIC, which the
// renderer's tokenizer loads at runtime from `/kuromoji/dict/`.
//
// Why this exists (measured 2026-09-03). `public/kuromoji/` is in .gitignore
// (.gitignore:106) and was hand-populated, so a clean clone — and every git
// worktree — has no dictionary at all. `96a7b579` found the consequence by
// booting the production bundle: twelve identical bare `net::ERR_FILE_NOT_FOUND`
// stacks in main.log, one per `.dat.bin`, naming neither URL nor path. That
// commit made the failure legible; it did not make the files present. This does,
// and it is the same fix `sync-ort-assets.cjs` already applies to public/ort/ —
// L12_REMAINING_RISK.md R1 is explicit that "make the packaging step fetch/stage
// them" is one of the two ways to close it.
//
// THE RENAME IS LOAD-BEARING, not a tidy-up. Upstream ships `*.dat.gz`; the app
// serves `*.dat.bin` — the same gzip bytes under a neutral extension. A `.gz`
// name makes dev and production servers add `Content-Encoding: gzip`, and the
// browser's transparent decompression then truncates the body at the compressed
// Content-Length, giving kuromoji misaligned Int32Array buffers. `SniffingLoader`
// (src/renderer/tokenizer.ts:47) rewrites the URL to `.dat.bin` and inflates the
// gzip itself, so the bytes must arrive undecoded. Copying under the upstream
// name would reintroduce exactly the bug the extension exists to avoid.
//
// The 12 files were verified byte-identical (sha256) to the ones already in
// public/kuromoji/dict/, so this copies rather than invents.
// Same shape as sync-ort-assets.cjs: idempotent, content-compared, silent when
// there is nothing to do.

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'node_modules', '@sglkc', 'kuromoji', 'dict');
const DEST_DIR = path.join(__dirname, '..', 'public', 'kuromoji', 'dict');

if (!fs.existsSync(SRC_DIR)) {
  // Not an error, for the same reason ort's is not: `npm ci` ordering means
  // postinstall can run before every dependency is on disk, and check-runtime-assets
  // is the gate that refuses to PACKAGE without a dictionary.
  console.log('sync-kuromoji-assets: @sglkc/kuromoji not installed — nothing to do.');
  process.exit(0);
}

const names = fs.readdirSync(SRC_DIR).filter((n) => n.endsWith('.dat.gz'));
if (names.length === 0) {
  console.error(`sync-kuromoji-assets: no *.dat.gz files in ${SRC_DIR}.`);
  process.exit(1);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

let copied = 0;
for (const name of names) {
  const srcPath = path.join(SRC_DIR, name);
  const destPath = path.join(DEST_DIR, name.replace(/\.dat\.gz$/, '.dat.bin'));
  const src = fs.readFileSync(srcPath);
  // Compare contents, not mtimes: a needless rewrite of 12 multi-MB files makes
  // the dev server's watcher churn, the same reason sync-ort-assets.cjs does it.
  if (fs.existsSync(destPath) && fs.readFileSync(destPath).equals(src)) continue;
  fs.writeFileSync(destPath, src);
  copied += 1;
}

console.log(
  copied === 0
    ? `sync-kuromoji-assets: ${names.length} file(s) already current.`
    : `sync-kuromoji-assets: copied ${copied} of ${names.length} file(s) into public/kuromoji/dict/.`,
);
