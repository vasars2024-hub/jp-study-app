/**
 * extract-zip (yauzl) hangs at 0% CPU on Node 24 during electron-packager's
 * "Extracting electron-v*-win32-x64.zip" step. Use native PowerShell on Windows.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@electron',
  'packager',
  'dist',
  'unzip.js',
);

const patchedMarker = '[jp-study-app patch]';

if (!fs.existsSync(target)) {
  console.error('[patch-packager-unzip] unzip.js not found — run npm install');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

if (src.includes(patchedMarker)) {
  console.log('[patch-packager-unzip] Already patched');
  process.exit(0);
}

const replacement = `"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractElectronZip = void 0;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const extract_zip_1 = __importDefault(require("extract-zip"));
async function extractElectronZip(zipPath, targetDir) {
    // ${patchedMarker} PowerShell Expand-Archive on Windows (extract-zip hangs on Node 24)
    await node_fs_1.promises.mkdir(targetDir, { recursive: true });
    if (process.platform === 'win32') {
        const ps = [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            \`Expand-Archive -LiteralPath '\${zipPath.replace(/'/g, "''")}' -DestinationPath '\${targetDir.replace(/'/g, "''")}' -Force\`,
        ];
        (0, node_child_process_1.execFileSync)('powershell.exe', ps, { stdio: 'inherit' });
        return;
    }
    await (0, extract_zip_1.default)(zipPath, { dir: targetDir });
}
exports.extractElectronZip = extractElectronZip;
`;

fs.writeFileSync(target, replacement);
console.log('[patch-packager-unzip] Patched @electron/packager unzip (PowerShell on Windows)');
