'use strict';
/**
 * The runtime blobs a packaged build must carry, and what dies without each one.
 *
 * `public/` holds ~945 MB of third-party engine and dictionary data that ships
 * once via `extraResource` (forge.config.ts). Five of its entries are gitignored
 * (.gitignore:103-107), so a clean clone has none of them and a package built
 * from one installs fine and fails at runtime — measured 2026-09-01 as twelve
 * anonymous `net::ERR_FILE_NOT_FOUND` stacks that named neither URL nor path.
 * `96a7b579` made that failure legible. This manifest is the other half:
 * `check-runtime-assets.cjs` refuses to package without them.
 *
 * A DIRECTORY IS NOT THE UNIT. Each entry names one WITNESS FILE that product
 * code actually requests by that path, because the failure being prevented is a
 * half-populated directory, which an `existsSync` on the directory reads as fine.
 * `loadedBy` is checked against the tree by
 * `src/shared/__tests__/runtimeAssets.test.ts`, so an entry cannot outlive the
 * code that justified it, and a path cannot silently drift from the one the app
 * requests.
 *
 * `stagedBy` is the tool that can regenerate the entry from `node_modules`.
 * `null` means it can only be obtained out of band — those are the entries where
 * failing the build loudly is the whole remedy.
 *
 * DELIBERATELY ABSENT: `public/models/Xenova/opus-mt-{ja-en,zh-en,en-ru}`.
 * Measured 2026-09-03 — `grep -rn 'opus-mt' src/` matches nothing under `src/`,
 * so no shipped code loads them. Requiring them would fail builds over data the
 * app never reads. They are still packaged (extraResource takes all of `public/`);
 * that is a separate question from this gate and is recorded, not acted on here.
 */

/**
 * @typedef {Object} RuntimeAsset
 * @property {string} rel        Path under `public/`, exactly as product code requests it.
 * @property {string} feature    The user-visible capability that is dead without it.
 * @property {string} loadedBy   `path:line` in `src/` that names this path.
 * @property {string|null} stagedBy  Tool under `tools/` that can regenerate it, or null.
 */

/** @type {RuntimeAsset[]} */
const REQUIRED_RUNTIME_ASSETS = [
  {
    rel: 'kuromoji/dict/base.dat.bin',
    feature: 'Japanese tokenization — furigana, word splitting, reader lookups, mining',
    loadedBy: 'src/renderer/tokenizer.ts',
    stagedBy: 'tools/sync-kuromoji-assets.cjs',
  },
  {
    rel: 'ort/ort-wasm-simd-threaded.wasm',
    feature: 'Whisper transcription (the ONNX runtime backend)',
    loadedBy: 'src/renderer/whisperWorker.ts',
    stagedBy: 'tools/sync-ort-assets.cjs',
  },
  {
    rel: 'tesseract/worker.min.js',
    feature: 'Manga OCR (the tesseract.js worker script)',
    loadedBy: 'src/renderer/ocr.ts',
    stagedBy: null,
  },
  {
    rel: 'tesseract/core/tesseract-core-simd-lstm.wasm.js',
    feature: 'Manga OCR (the recognition core)',
    loadedBy: 'src/renderer/ocr.ts',
    stagedBy: null,
  },
  {
    rel: 'tesseract/lang/jpn.traineddata.gz',
    feature: 'Manga OCR of Japanese (the trained language data)',
    loadedBy: 'src/renderer/ocr.ts',
    stagedBy: null,
  },
  {
    rel: 'cedict/cedict.u8',
    feature: 'the CC-CEDICT Chinese dictionary import',
    loadedBy: 'src/main/dictionary/service.ts',
    stagedBy: null,
  },
];

/** The env var that turns the refusal into a loud warning. */
const SKIP_ENV = 'JP_ALLOW_MISSING_RUNTIME_ASSETS';

/**
 * Which required assets are absent, as data. `exists` is injected so the decision
 * is testable without a fixture tree, the same shape `resolveAppAsset` uses.
 *
 * @param {(rel: string) => boolean} exists
 * @returns {RuntimeAsset[]}
 */
function missingRuntimeAssets(exists) {
  return REQUIRED_RUNTIME_ASSETS.filter((asset) => !exists(asset.rel));
}

/**
 * The message a failed preflight prints. One line per missing asset naming the
 * feature that dies and how to obtain it — the diagnostic the twelve anonymous
 * stacks did not have.
 *
 * @param {RuntimeAsset[]} missing
 * @returns {string}
 */
function formatMissingRuntimeAssets(missing) {
  const lines = missing.map((asset) => {
    const remedy = asset.stagedBy
      ? `run \`node ${asset.stagedBy}\``
      : 'obtain it out of band — it is gitignored and not in node_modules';
    return `  public/${asset.rel}\n      kills: ${asset.feature}\n      loaded by: ${asset.loadedBy}\n      fix: ${remedy}`;
  });
  return (
    `${missing.length} required runtime asset(s) are missing from public/.\n` +
    `A package built now installs fine and fails at runtime with no useful diagnostic.\n\n` +
    `${lines.join('\n')}\n\n` +
    `Set ${SKIP_ENV}=1 to package anyway, accepting that those features are dead in the build.`
  );
}

module.exports = {
  REQUIRED_RUNTIME_ASSETS,
  SKIP_ENV,
  missingRuntimeAssets,
  formatMissingRuntimeAssets,
};
