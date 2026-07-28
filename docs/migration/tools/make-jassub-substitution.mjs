// Regenerate the JASSUB integration used by the adopted video-core.
//
// Seanime builds with Rsbuild and disables worker parsing for jassub/dist/*.js, then
// separately bundles the worker and copies its WASM files into public/jassub. Study OS
// builds with Vite, whose default worker transform sees JASSUB's unused fallback worker
// and tries to emit it as an IIFE code-split build. Rollup rejects that combination.
//
// This tool keeps the integration mechanical:
//   1. bundle the pinned JASSUB runtime and make its unused asset fallbacks fail loudly;
//   2. bundle the worker exactly as upstream's rsbuild.config.ts does;
//   3. copy the pinned WASM files and upstream default font into src/media;
//   4. generate a whole-file video-core-subtitles.ts substitution that imports those
//      assets through Vite's ?url contract.
//
// It refuses to write if any guarded upstream line moves.
//
// usage: node docs/migration/tools/make-jassub-substitution.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'C:/Users/Arseniy/Projects/jp-study-app';
const UPSTREAM = 'C:/Users/Arseniy/Projects/seanime-upstream/seanime-web';
const REL = 'app/(main)/_features/video-core/video-core-subtitles.ts';
const DEST_REL = `vendor/seanime-web/${REL}`;
const DEST = path.join(REPO, DEST_REL);
const RUNTIME_DIR = path.join(REPO, 'src/media/jassub');
const ASSET_DIR = path.join(RUNTIME_DIR, 'assets');

const runtimeEntry = path.join(REPO, 'node_modules/jassub/dist/jassub.js');
const workerEntry = path.join(REPO, 'node_modules/jassub/dist/worker/worker.js');
const wasmDir = path.join(REPO, 'node_modules/jassub/dist/wasm');

const runtimeBuild = await build({
  entryPoints: [runtimeEntry],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  legalComments: 'inline',
  minify: false,
  write: false,
});

let runtime = runtimeBuild.outputFiles[0].text;
const runtimeReplacements = [
  [
    'new Worker(new URL("./worker/worker.js", import.meta.url), { name: "jassub-worker", type: "module" })',
    'requiredJassubOption("workerUrl")',
  ],
  [
    'new URL("./wasm/jassub-worker-modern.wasm", import.meta.url).href',
    'requiredJassubOption("modernWasmUrl")',
  ],
  [
    'new URL("./wasm/jassub-worker.wasm", import.meta.url).href',
    'requiredJassubOption("wasmUrl")',
  ],
  [
    'new URL("./default.woff2", import.meta.url).href',
    'requiredJassubOption("defaultFont")',
  ],
];

for (const [needle, replacement] of runtimeReplacements) {
  if (!runtime.includes(needle)) {
    throw new Error(`JASSUB runtime guard moved; missing: ${needle}`);
  }
  runtime = runtime.replace(needle, replacement);
}

const runtimeHeader = `/**
 * Generated JASSUB 2.5.6 runtime adapter for Study OS.
 *
 * Source: node_modules/jassub/dist/jassub.js, bundled with its JavaScript dependencies.
 * License: LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND
 * MIT-Modern-Variant AND ISC AND NTP AND Zlib AND BSL-1.0.
 *
 * Regenerate with docs/migration/tools/make-jassub-substitution.mjs. Do not edit.
 */
function requiredJassubOption(name) {
  throw new Error(\`Study OS video-core must provide JASSUB \${name}\`);
}

`;

fs.mkdirSync(ASSET_DIR, { recursive: true });
fs.writeFileSync(path.join(RUNTIME_DIR, 'runtime.js'), runtimeHeader + runtime);

await build({
  entryPoints: [workerEntry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  define: {
    'import.meta.url': 'self.location.href',
  },
  legalComments: 'inline',
  minify: false,
  outfile: path.join(ASSET_DIR, 'jassub-worker.js'),
});

fs.copyFileSync(
  path.join(wasmDir, 'jassub-worker.wasm'),
  path.join(ASSET_DIR, 'jassub-worker.wasm'),
);
fs.copyFileSync(
  path.join(wasmDir, 'jassub-worker-modern.wasm'),
  path.join(ASSET_DIR, 'jassub-worker-modern.wasm'),
);
fs.copyFileSync(
  path.join(UPSTREAM, 'public/fonts/Roboto-Medium.ttf'),
  path.join(ASSET_DIR, 'Roboto-Medium.ttf'),
);

let subtitles = fs.readFileSync(path.join(UPSTREAM, 'src', REL), 'utf8');
const sourceReplacements = [
  [
    'import JASSUB from "jassub"\r\n',
    [
      'import JASSUB from "../../../../../../src/media/jassub/runtime.js"',
      'import workerUrl from "../../../../../../src/media/jassub/assets/jassub-worker.js?url"',
      'import wasmUrl from "../../../../../../src/media/jassub/assets/jassub-worker.wasm?url"',
      'import modernWasmUrl from "../../../../../../src/media/jassub/assets/jassub-worker-modern.wasm?url"',
      'import defaultFontUrl from "../../../../../../src/media/jassub/assets/Roboto-Medium.ttf?url"',
      '',
    ].join('\r\n'),
  ],
  ['const modernWasmUrl = "/jassub/jassub-worker-modern.wasm"\r\n', ''],
  ['const wasmUrl = "/jassub/jassub-worker.wasm"\r\n', ''],
  ['const workerUrl = "/jassub/jassub-worker.js"\r\n', ''],
  ['                    const defaultFontUrl = "/fonts/Roboto-Medium.ttf"\r\n\r\n', ''],
];

for (const [needle, replacement] of sourceReplacements) {
  if (!subtitles.includes(needle)) {
    throw new Error(`upstream video-core subtitle guard moved; missing: ${needle.trim()}`);
  }
  subtitles = subtitles.replace(needle, replacement);
}

const substitutionHeader = `/**
 * STUDY OS SUBSTITUTION — replaces Seanime's ${REL}.
 *
 * Upstream relies on Rsbuild-specific JASSUB worker handling and public asset paths.
 * Study OS uses a generated runtime adapter plus Vite-managed asset URLs so the restored
 * video-core builds and its worker/WASM/font files ship with the renderer.
 *
 * Apart from the JASSUB import and five asset URL lines, this file is byte-identical to
 * pinned upstream 9bdd052. Regenerate it with:
 *   node docs/migration/tools/make-jassub-substitution.mjs
 *
 * Whole-file replacement, never an inline vendor edit. See vendor/seanime-web/ADOPTION.md.
 */

`.replace(/\n/g, '\r\n');

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, substitutionHeader + subtitles);

console.log(`written ${path.relative(REPO, DEST)}`);
console.log(`written ${path.relative(REPO, RUNTIME_DIR)} (runtime + 4 assets)`);
