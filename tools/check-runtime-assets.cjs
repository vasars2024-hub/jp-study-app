#!/usr/bin/env node
'use strict';
/**
 * Packaging preflight: refuse to build an installer whose runtime blobs are absent.
 *
 * L12_REMAINING_RISK.md R1, HIGH/OPEN: "A production build from a clean clone
 * lacks them and fails at runtime with no useful diagnostic. This is how 12
 * anonymous ERR_FILE_NOT_FOUND stacks got into a production boot." Its stated
 * remedy is either tracking the blobs (they are ~945 MB) or making the packaging
 * step stage them and fail loudly when they are absent. This is the second half;
 * `sync-kuromoji-assets.cjs` and `sync-ort-assets.cjs` are the staging half.
 *
 * Runs FIRST in `npm run package` / `npm run make`, before the extension mirror
 * and the two Forge patches, so the refusal costs seconds rather than arriving
 * after a multi-minute Vite build.
 *
 * The manifest, the witness-file rule and the deliberate exclusions live in
 * `runtime-assets.manifest.cjs`; this file is only the disk half.
 */

const fs = require('fs');
const path = require('path');
const {
  REQUIRED_RUNTIME_ASSETS,
  SKIP_ENV,
  missingRuntimeAssets,
  formatMissingRuntimeAssets,
} = require('./runtime-assets.manifest.cjs');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const missing = missingRuntimeAssets((rel) => fs.existsSync(path.join(PUBLIC_DIR, rel)));

if (missing.length === 0) {
  console.log(
    `check-runtime-assets: ${REQUIRED_RUNTIME_ASSETS.length} required runtime asset(s) present in public/.`,
  );
  process.exit(0);
}

const report = formatMissingRuntimeAssets(missing);

if (process.env[SKIP_ENV] && process.env[SKIP_ENV].trim()) {
  // Loud, and it still names every dead feature — the opt-out exists so a slim
  // build is possible on purpose, not so the condition can go unnoticed.
  console.warn(`check-runtime-assets: ${SKIP_ENV} is set — packaging anyway.\n\n${report}`);
  process.exit(0);
}

console.error(`check-runtime-assets: REFUSING to package.\n\n${report}`);
process.exit(1);
