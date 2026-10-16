'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Local runs only: real OCR models in the run's isolated profile.
 *
 *   GUM_E2E_OCR_MODELS=<dir> npm run e2e -- --flows=snip-real-ocr
 *
 * <dir> is laid out like a Gum profile's `models/` folder (`paddle-ocr-det/model.onnx`,
 * `paddle-ocr-ja/…`, `state.json`), e.g. a COPY of a test profile's. Its asset folders
 * and `state.json` are copied into the fresh profile before the app first starts
 * (`world.seedProfile`), so the app finds them installed exactly as after a download.
 * Nothing is downloaded, the source folder is only read, and without the variable a
 * run is unchanged (model-less: the snip flow uses the harness fake reader).
 */
const fs = require('node:fs');
const path = require('node:path');

/** The models folder to seed from, or null (the normal, model-less run). */
function realModelsDir(env = process.env) {
  const dir = env.GUM_E2E_OCR_MODELS;
  if (!dir) return null;
  const resolved = path.resolve(dir);
  if (!fs.existsSync(path.join(resolved, 'state.json'))) {
    throw new Error(`GUM_E2E_OCR_MODELS=${dir} has no state.json (point it at a copy of a profile's models folder)`);
  }
  return resolved;
}

/**
 * Copy the installed assets `state.json` lists (and only those) into `<profile>/models`.
 * Returns the asset ids copied.
 */
function seedRealModels(profileDir, env = process.env) {
  const src = realModelsDir(env);
  if (!src) return [];
  const state = JSON.parse(fs.readFileSync(path.join(src, 'state.json'), 'utf8'));
  const dest = path.join(profileDir, 'models');
  fs.mkdirSync(dest, { recursive: true });
  const copied = [];
  for (const id of Object.keys(state)) {
    const from = path.join(src, id);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(dest, id), { recursive: true });
    copied.push(id);
  }
  const kept = Object.fromEntries(Object.entries(state).filter(([id]) => copied.includes(id)));
  fs.writeFileSync(path.join(dest, 'state.json'), JSON.stringify(kept, null, 2));
  return copied;
}

module.exports = { realModelsDir, seedRealModels };
