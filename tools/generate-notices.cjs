#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
'use strict';
/**
 * Third-party notices, regenerated.
 *
 *   node tools/generate-notices.cjs           rewrite the generated parts
 *   node tools/generate-notices.cjs --check   exit 1 when either file is stale
 *
 * Two outputs, both at the repo root and both shipped in the packaged app
 * (forge.config.ts `extraResource`, so they sit in `resources/` next to `app.asar`):
 *
 *  - THIRD_PARTY_NOTICES.md: the hand-written sections (bundled data,
 *    dictionaries, binaries, fonts, icons, attribution statements) are kept
 *    as written; only the block between the GENERATED markers is replaced, with
 *    one line per npm package in the production dependency tree.
 *  - THIRD_PARTY_LICENSES.json: the machine-readable list. The non-npm
 *    components come from `src/shared/thirdPartyBundled.json` (curated: the
 *    same file the About screen's credits read); every npm package carries its
 *    licence (SPDX, from its own package.json) and the full text of its licence
 *    file from `node_modules`.
 *
 * Which npm packages: every entry of package-lock.json that is not dev-only
 * (`dev` / `devOptional`), i.e. what `npm install --omit=dev` installs. That is
 * a superset of what the packaged app carries (the packager prunes further), so
 * nothing shipped can be missing. Platform builds that npm skips on this OS
 * (`optional` and absent from node_modules: sharp's Linux/macOS libvips, …) are
 * listed as "not installed here" with the licence the lockfile records.
 *
 * Output is deterministic (sorted, no timestamps), so `--check` can compare
 * bytes. `src/shared/__tests__/thirdPartyNotices.test.ts` fails when a
 * production dependency is missing from either file.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NOTICES = path.join(ROOT, 'THIRD_PARTY_NOTICES.md');
const LICENSES = path.join(ROOT, 'THIRD_PARTY_LICENSES.json');
const BUNDLED = path.join(ROOT, 'src', 'shared', 'thirdPartyBundled.json');
const BEGIN = '<!-- BEGIN GENERATED: npm packages (tools/generate-notices.cjs) -->';
const END = '<!-- END GENERATED: npm packages -->';

/**
 * Licences a package does not state in a form npm reads (no `license` field,
 * or "SEE LICENSE IN …"), checked by hand against the package's own files.
 */
const LICENSE_OVERRIDES = {
  // "SEE LICENSE IN License.txt": 7-Zip's own terms, GNU LGPL plus the unRAR
  // restriction for 7zz.wasm / 7zz.*.js (both texts are in the package).
  '7z-wasm': 'LGPL-2.1-or-later AND LicenseRef-unRAR-restriction',
  // No `license` field; the LICENSE file is the Unlicense text.
  'fast-shallow-equal': 'Unlicense',
  'react-universal-interface': 'Unlicense',
  // `licenses: [{ type: 'BSD' }]`; the LICENSE file is the 3-clause text.
  'parse-cache-control': 'BSD-3-Clause',
};

/** LICENSE, LICENCE.md, COPYING, NOTICE.md, unRarLicense.txt, ffmpeg.exe.LICENSE … (not .js/.d.ts/.json). */
const LICENSE_FILE_RE = /(licen[sc]e|^copying|^notice)/i;
const NOT_A_LICENSE_FILE_RE = /\.(js|cjs|mjs|ts|json|map|html?)$/i;
const MAX_TEXT = 64 * 1024;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function lf(text) {
  return text.replace(/\r\n?/g, '\n');
}

function nameFromLockPath(key) {
  const at = key.lastIndexOf('node_modules/');
  return key.slice(at + 'node_modules/'.length);
}

function spdxOf(pkgJson, lockEntry, name) {
  if (LICENSE_OVERRIDES[name]) return LICENSE_OVERRIDES[name];
  const raw = pkgJson?.license ?? lockEntry?.license;
  if (typeof raw === 'string' && raw.trim() && !/^SEE LICEN[SC]E IN/i.test(raw)) return raw.trim();
  if (raw && typeof raw === 'object' && typeof raw.type === 'string') return raw.type;
  if (Array.isArray(pkgJson?.licenses) && pkgJson.licenses.length) {
    const types = pkgJson.licenses.map((l) => (typeof l === 'string' ? l : l && l.type)).filter(Boolean);
    if (types.length) return types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
  }
  return 'UNKNOWN';
}

function repoOf(pkgJson) {
  const r = pkgJson?.repository;
  let url = typeof r === 'string' ? r : r && typeof r.url === 'string' ? r.url : '';
  if (!url && typeof pkgJson?.homepage === 'string') url = pkgJson.homepage;
  url = url.trim();
  if (!url) return '';
  // npm shorthands: "github:user/repo", "user/repo".
  const short = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(url);
  if (short) return `https://github.com/${short[1]}`;
  return url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git(#.*)?$/, '')
    .replace(/#.*$/, '');
}

function authorOf(pkgJson) {
  const a = pkgJson?.author;
  if (typeof a === 'string') return a.replace(/\s*<[^>]*>/g, '').replace(/\s*\([^)]*\)/g, '').trim();
  if (a && typeof a.name === 'string') return a.name.trim();
  return '';
}

/** Every licence and notice file at the package root, concatenated (NOTICE files are part of Apache-2.0 §4(d)). */
function licenseFileOf(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const rank = (n) => (/^licen[sc]e(\.(md|txt))?$/i.test(n) ? 0 : /^licen[sc]e/i.test(n) ? 1 : /^copying/i.test(n) ? 2 : /^notice/i.test(n) ? 4 : 3);
  const files = names
    .filter((n) => LICENSE_FILE_RE.test(n) && !NOT_A_LICENSE_FILE_RE.test(n))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en'));
  const parts = [];
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      if (!fs.statSync(full).isFile()) continue;
      let text = lf(fs.readFileSync(full, 'utf8')).trim();
      if (!text) continue;
      if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}\n\n[… truncated; the full text is in ${file} of the package]`;
      parts.push({ file, text });
    } catch {
      /* unreadable: try the next */
    }
  }
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return {
    file: parts.map((p) => p.file).join(', '),
    text: parts.map((p) => `==== ${p.file} ====\n\n${p.text}`).join('\n\n'),
  };
}

/**
 * The standard terms, for a package that declares a licence but ships no licence
 * file (its copyright holder is then the package author named beside it).
 */
const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const ISC_TEXT = `Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

function standardText(license, author) {
  const holder = author ? `Copyright (c) ${author}` : 'Copyright (c) the package authors';
  if (license === 'MIT') return `${holder}\n\n${MIT_TEXT}`;
  if (license === 'ISC') return `${holder}\n\n${ISC_TEXT}`;
  if (license === 'Apache-2.0') {
    try {
      return lf(fs.readFileSync(path.join(ROOT, 'node_modules', 'kuromoji', 'LICENSE-2.0.txt'), 'utf8')).trim();
    } catch {
      return 'Licensed under the Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0';
    }
  }
  return '';
}

/** The production dependency tree, from package-lock.json, with what node_modules says. */
function collectNpm() {
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const lock = readJson(path.join(ROOT, 'package-lock.json'));
  const direct = new Set(Object.keys(pkg.dependencies || {}));
  const out = [];
  for (const [key, entry] of Object.entries(lock.packages || {})) {
    if (!key || !key.includes('node_modules/')) continue; // the root, and workspace links
    if (entry.dev || entry.devOptional) continue;
    const name = nameFromLockPath(key);
    const dir = path.join(ROOT, ...key.split('/'));
    let pkgJson = null;
    try {
      pkgJson = readJson(path.join(dir, 'package.json'));
    } catch {
      pkgJson = null;
    }
    const installed = Boolean(pkgJson);
    const license = spdxOf(pkgJson, entry, name);
    const file = installed ? licenseFileOf(dir) : null;
    out.push({
      name,
      version: String(entry.version || pkgJson?.version || ''),
      license,
      direct: direct.has(name) && key === `node_modules/${name}`,
      installed,
      ...(entry.optional ? { optional: true } : {}),
      repository: repoOf(pkgJson) || '',
      author: authorOf(pkgJson),
      licenseFile: file ? file.file : '',
      licenseText: file ? file.text : installed ? standardText(license, authorOf(pkgJson)) : '',
      ...(installed && !file ? { licenseTextIsStandard: true } : {}),
    });
  }
  // One entry per name@version (nested copies of the same version are the same package).
  const seen = new Map();
  for (const p of out) {
    const id = `${p.name}@${p.version}`;
    const prev = seen.get(id);
    if (!prev) seen.set(id, p);
    else prev.direct = prev.direct || p.direct;
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'));
}

function licenseSummary(list) {
  const counts = new Map();
  for (const p of list) counts.set(p.license, (counts.get(p.license) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'));
}

function line(p) {
  const bits = [`**${p.name}** ${p.version}`, p.license];
  if (p.repository) bits.push(p.repository);
  let s = `- ${bits.join(' — ')}`;
  if (p.direct) s += ' (direct dependency)';
  if (p.licenseTextIsStandard) s += ' (no licence file in the package; the standard text applies)';
  return s;
}

function renderGenerated(list) {
  const installed = list.filter((p) => p.installed);
  const absent = list.filter((p) => !p.installed);
  const lines = [];
  lines.push(BEGIN);
  lines.push('');
  lines.push(`${installed.length} npm packages are in the production dependency tree (package-lock.json, dev-only packages excluded). The packaged app carries a subset of them; every one is listed so none can be missing. The full licence text of each is in \`THIRD_PARTY_LICENSES.json\`, shipped next to this file, and in the app (Settings › Help › About › Open source licences).`);
  lines.push('');
  lines.push(`Licences: ${licenseSummary(installed).map(([l, n]) => `${l} (${n})`).join(', ')}.`);
  lines.push('');
  for (const p of installed) lines.push(line(p));
  if (absent.length) {
    lines.push('');
    lines.push(`Platform builds npm installs only on other operating systems (not present in a Windows build; licence as the lockfile records it): ${absent.map((p) => `${p.name} ${p.version} (${p.license})`).join(', ')}.`);
  }
  lines.push('');
  lines.push(END);
  return lines.join('\n');
}

function buildNotices(list) {
  const current = lf(fs.readFileSync(NOTICES, 'utf8'));
  const a = current.indexOf(BEGIN);
  const b = current.indexOf(END);
  if (a < 0 || b < a) throw new Error(`THIRD_PARTY_NOTICES.md has no generated block (${BEGIN} … ${END})`);
  return current.slice(0, a) + renderGenerated(list) + current.slice(b + END.length);
}

function buildLicenses(list) {
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const bundled = readJson(BUNDLED);
  const doc = {
    schema: 1,
    generator: 'tools/generate-notices.cjs',
    app: {
      name: 'Gum',
      package: pkg.name,
      version: pkg.version,
      license: pkg.license,
      source: 'https://github.com/vasars2024-hub/jp-study-app',
    },
    bundled: bundled.components,
    npm: list,
  };
  return `${JSON.stringify(doc, null, 1)}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const list = collectNpm();
  const notices = buildNotices(list);
  const licenses = buildLicenses(list);
  const unknown = list.filter((p) => p.installed && p.license === 'UNKNOWN').map((p) => `${p.name}@${p.version}`);
  if (check) {
    const stale = [];
    if (lf(fs.readFileSync(NOTICES, 'utf8')) !== notices) stale.push('THIRD_PARTY_NOTICES.md');
    if (!fs.existsSync(LICENSES) || lf(fs.readFileSync(LICENSES, 'utf8')) !== licenses) stale.push('THIRD_PARTY_LICENSES.json');
    if (stale.length) {
      console.error(`[notices] stale: ${stale.join(', ')}. Run: node tools/generate-notices.cjs`);
      process.exit(1);
    }
    console.log(`[notices] up to date (${list.length} npm packages)`);
  } else {
    fs.writeFileSync(NOTICES, notices, 'utf8');
    fs.writeFileSync(LICENSES, licenses, 'utf8');
    console.log(`[notices] wrote THIRD_PARTY_NOTICES.md and THIRD_PARTY_LICENSES.json (${list.length} npm packages)`);
  }
  if (unknown.length) {
    console.error(`[notices] no licence could be determined for: ${unknown.join(', ')} — add LICENSE_OVERRIDES after checking by hand`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { collectNpm, renderGenerated, BEGIN, END, LICENSE_OVERRIDES };
