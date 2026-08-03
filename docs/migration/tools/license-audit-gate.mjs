#!/usr/bin/env node
// The transitive production license audit — Phase 9 / slice 47i.
//
// `LICENSING_PLAN.md` has carried "`npx license-checker --production` over the transitive
// tree" as an unchecked box since 2026-07-27, and its dependency table covers **17** declared
// runtime dependencies. `package.json` now declares **81**, and the lockfile resolves **623**
// non-dev packages. So the audit of record describes a tree that has roughly doubled and then
// tripled underneath it.
//
// This reads the installed tree rather than a registry, because what ships is what is on disk:
// every non-dev entry in `package-lock.json`, resolved to its own `node_modules/<name>/
// package.json`, and classified. No network, no new dependency — `license-checker` would
// itself have to be installed to answer a question about what is installed.
//
// ## What it asserts
//
//   * No **AGPL** anywhere. AGPL's network clause reaches further than this project's posture
//     accounts for, and it is the one family that would change the answer rather than the
//     paperwork.
//   * Every **strong-copyleft** package is on the acknowledged list below. GPL is fine — the
//     combined work is already `GPL-3.0-or-later` — but a NEW one appearing silently is a
//     licensing change nobody decided, which is exactly what an unchecked box hides.
//   * **Unknown/missing** licenses stay under a recorded ceiling and are listed by name, so
//     the number cannot drift upward unremarked.
//
// It does not judge compatibility beyond that; ADR-001 already settled the direction
// (Apache-2.0 -> GPLv3 is permitted, not the reverse) and this is engineering analysis, not
// legal advice.
//
// usage:
//   node docs/migration/tools/license-audit-gate.mjs
//   node docs/migration/tools/license-audit-gate.mjs --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/**
 * Strong copyleft that is KNOWN and accepted. Each entry is a decision already recorded in
 * LICENSING_PLAN.md, not a suppression — a package that lands here without a line in that
 * document is the thing this gate exists to catch.
 */
const ACKNOWLEDGED_STRONG_COPYLEFT = new Set([
  // Bundles GPL-3.0 FFmpeg binaries. LICENSING_PLAN.md calls this "the decisive row": it is
  // why the combined work is GPL at all, and ADR-001 fixed the declaration to match.
  'ffmpeg-static',
  // Added 2026-08-02 by slice 47i's first run — it was in the shipped tree and in no record.
  // A GPL-3.0 polyfill for requestVideoFrameCallback, pulled in by the video stack. Fine for a
  // GPL-3.0-or-later combined work; the point is that it arrived without a decision.
  'rvfc-polyfill',
]);

const STRONG_COPYLEFT = /\b(GPL-2\.0|GPL-3\.0|GPL-2|GPL-3|GPLv2|GPLv3)\b/i;
const NETWORK_COPYLEFT = /\bAGPL\b/i;
const WEAK_COPYLEFT = /\b(LGPL|MPL-2\.0|EPL-2\.0|CDDL)\b/i;

/** A ceiling, not a target. Raising it is a decision; drifting past it is a finding. */
const UNKNOWN_LICENSE_CEILING = 12;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** The license as the package itself declares it, in any of the shapes npm has allowed. */
function declaredLicense(pkg) {
  if (!pkg) return null;
  if (typeof pkg.license === 'string' && pkg.license.trim()) return pkg.license.trim();
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return String(pkg.license.type);
  if (Array.isArray(pkg.licenses) && pkg.licenses.length) {
    return pkg.licenses.map((entry) => entry?.type ?? entry).filter(Boolean).join(' OR ');
  }
  return null;
}

const PERMISSIVE = /\b(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD|Unlicense|CC0-1\.0|WTFPL|Python-2\.0|BlueOak-1\.0\.0)\b/i;

/**
 * A dual license joined by `OR` is a CHOICE, and the choice is the licensee's. `jszip` ships
 * `(MIT OR GPL-3.0-or-later)`; taking MIT is permitted, so calling it strong copyleft is
 * wrong — the gate's first run did exactly that and reported an unrecorded GPL dependency that
 * is not one. Only an expression whose every branch is copyleft actually constrains anything.
 *
 * `AND` is the opposite: every term binds, so the strongest wins. It is rare in practice and
 * falls through to the sequential tests below.
 */
function splitOrOperands(license) {
  const inner = license.trim().replace(/^\((.*)\)$/s, '$1');
  if (!/\sOR\s/i.test(inner)) return null;
  return inner.split(/\sOR\s/i).map((part) => part.trim()).filter(Boolean);
}

function classify(license) {
  if (!license) return 'unknown';
  if (NETWORK_COPYLEFT.test(license)) return 'network-copyleft';

  const operands = splitOrOperands(license);
  if (operands && operands.some((operand) => PERMISSIVE.test(operand)
    && !NETWORK_COPYLEFT.test(operand) && !WEAK_COPYLEFT.test(operand)
    && !STRONG_COPYLEFT.test(operand))) {
    // A permissive branch exists and may be taken. Reported separately rather than folded into
    // `permissive`, because which branch was taken is a decision worth being able to see.
    return 'dual-permissive-available';
  }

  // Order matters: "LGPL-3.0" contains "GPL-3.0". Weak must be tested first or every LGPL
  // package reads as strong copyleft and the gate cries wolf on its first run.
  if (WEAK_COPYLEFT.test(license)) return 'weak-copyleft';
  if (STRONG_COPYLEFT.test(license)) return 'strong-copyleft';
  return 'permissive';
}

function main() {
  const lock = readJson(path.join(REPO, 'package-lock.json'));
  const rootPkg = readJson(path.join(REPO, 'package.json'));
  if (!lock?.packages) throw new Error('package-lock.json has no `packages` map (needs lockfileVersion >= 2)');

  const rows = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key.startsWith('node_modules/')) continue;
    // `dev` marks a package reachable ONLY through devDependencies. Those do not ship, which
    // is the whole reason the audit is scoped this way.
    if (entry.dev) continue;
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const onDisk = readJson(path.join(REPO, key, 'package.json'));
    // The lockfile carries a `license` field too, but the installed package is the artifact
    // that ships; prefer it and fall back rather than trusting one source silently.
    const license = declaredLicense(onDisk) ?? (typeof entry.license === 'string' ? entry.license : null);
    rows.push({
      name,
      path: key,
      version: onDisk?.version ?? entry.version ?? null,
      license,
      installed: !!onDisk,
      classification: classify(license),
    });
  }

  const byClass = (kind) => rows.filter((row) => row.classification === kind);
  const network = byClass('network-copyleft');
  const strong = byClass('strong-copyleft');
  const weak = byClass('weak-copyleft');
  const unknown = byClass('unknown');
  const dual = byClass('dual-permissive-available');
  const unacknowledgedStrong = strong.filter((row) => !ACKNOWLEDGED_STRONG_COPYLEFT.has(row.name));

  const reasons = [];
  if (network.length) {
    reasons.push(`AGPL in the shipped tree: ${network.map((r) => `${r.name} (${r.license})`).join(', ')}`);
  }
  if (unacknowledgedStrong.length) {
    reasons.push('strong copyleft not recorded in LICENSING_PLAN.md: '
      + unacknowledgedStrong.map((r) => `${r.name} (${r.license})`).join(', '));
  }
  if (unknown.length > UNKNOWN_LICENSE_CEILING) {
    reasons.push(`${unknown.length} packages declare no license, above the recorded ceiling of `
      + `${UNKNOWN_LICENSE_CEILING}: ${unknown.map((r) => r.name).join(', ')}`);
  }
  // The declaration has to match the tree. ADR-001 flipped it; a silent flip back would make
  // every row above meaningless.
  const rootLicense = rootPkg?.license ?? null;
  if (!rootLicense || !/GPL-3\.0/i.test(rootLicense)) {
    reasons.push(`package.json declares "${rootLicense}", but the tree contains strong copyleft `
      + '(ADR-001 requires GPL-3.0-or-later)');
  }
  // The manifest field and the LICENSE file are two separate claims and they have disagreed
  // before — the manifest said MIT while the tree already bundled GPL FFmpeg. Checking only
  // one leaves the other free to drift.
  const licenseFile = (() => {
    try { return fs.readFileSync(path.join(REPO, 'LICENSE'), 'utf8'); } catch { return null; }
  })();
  const licenseFileIsGpl3 = !!licenseFile && /GNU GENERAL PUBLIC LICENSE/i.test(licenseFile)
    && /Version 3/i.test(licenseFile);
  if (!licenseFileIsGpl3) {
    reasons.push(licenseFile
      ? 'the LICENSE file is not GPL-3.0 while package.json declares GPL-3.0-or-later'
      : 'there is no LICENSE file');
  }

  // The Go sidecar. LICENSING_PLAN.md's "unmodified pinned binary, conventional
  // separate-program posture" stopped being true on 2026-08-02, when slice 46 deployed a
  // PATCHED build — and `SeanimeSidecarStagingPlugin` stages the RESOLVED binary, so a package
  // built from here on carries it. The plan's own rule for that case is "if the Go server is
  // ever modified, your fork's source must be published too", and the patches ARE the source
  // of the modification, so their presence in-repo is the thing to check.
  const patchDir = path.join(REPO, 'patches', 'seanime');
  const patches = fs.existsSync(patchDir)
    ? fs.readdirSync(patchDir).filter((f) => f.endsWith('.patch')).sort()
    : [];
  const deployedExe = path.resolve(REPO, '..', 'seanime-upstream', 'seanime.exe');
  let sidecarPatched = null;
  if (fs.existsSync(deployedExe)) {
    const bytes = fs.readFileSync(deployedExe);
    sidecarPatched = bytes.includes(Buffer.from('flushTerminalSubtitleBatch'))
      || bytes.includes(Buffer.from('stale open request: generation'));
  }
  if (sidecarPatched && patches.length === 0) {
    reasons.push('the sidecar this app stages is PATCHED but patches/seanime/ holds no .patch '
      + 'files — the modification would ship with no source for it');
  }

  const out = {
    gate: 'license-audit-gate.mjs',
    checkedAt: new Date().toISOString(),
    rootLicense,
    rootPrivate: rootPkg?.private === true,
    licenseFileIsGpl3,
    declaredDependencies: Object.keys(rootPkg?.dependencies ?? {}).length,
    shippedPackages: rows.length,
    counts: {
      permissive: byClass('permissive').length,
      dualPermissiveAvailable: byClass('dual-permissive-available').length,
      weakCopyleft: weak.length,
      strongCopyleft: strong.length,
      networkCopyleft: network.length,
      unknown: unknown.length,
      notInstalled: rows.filter((r) => !r.installed).length,
    },
    dualPermissiveAvailable: dual.map((r) => ({ name: r.name, version: r.version, license: r.license })),
    strongCopyleft: strong.map((r) => ({ name: r.name, version: r.version, license: r.license })),
    weakCopyleft: weak.map((r) => ({ name: r.name, version: r.version, license: r.license })),
    unknown: unknown.map((r) => ({ name: r.name, version: r.version })),
    sidecar: {
      deployedExeExists: fs.existsSync(deployedExe),
      patched: sidecarPatched,
      patchesInRepo: patches,
      note: sidecarPatched
        ? 'The staged sidecar is MODIFIED. LICENSING_PLAN.md\'s "unmodified pinned binary, '
          + 'conventional separate-program posture" no longer describes it, and its own rule '
          + 'for this case applies: if the Go server is modified, the fork\'s source must be '
          + 'published on distribution. The patches in patches/seanime/ are that source.'
        : 'The staged sidecar carries no patch markers.',
    },
    verdict: reasons.length === 0 ? 'PASS' : 'FAIL',
    reasons,
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 1));
  } else {
    console.log(`root license      ${out.rootLicense} (private: ${out.rootPrivate})`);
    console.log(`declared deps     ${out.declaredDependencies}`);
    console.log(`shipped packages  ${out.shippedPackages}`);
    console.log(`  permissive      ${out.counts.permissive}`);
    console.log(`  dual (OR perm.) ${out.counts.dualPermissiveAvailable}${dual.length ? ` — ${dual.map((r) => `${r.name} ${r.license}`).join(', ')}` : ''}`);
    console.log(`  weak copyleft   ${out.counts.weakCopyleft}${weak.length ? ` — ${weak.map((r) => r.name).join(', ')}` : ''}`);
    console.log(`  strong copyleft ${out.counts.strongCopyleft}${strong.length ? ` — ${strong.map((r) => `${r.name} (${r.license})`).join(', ')}` : ''}`);
    console.log(`  AGPL            ${out.counts.networkCopyleft}`);
    console.log(`  unknown         ${out.counts.unknown}${unknown.length ? ` — ${unknown.map((r) => r.name).join(', ')}` : ''}`);
    console.log(`sidecar patched   ${out.sidecar.patched} (patches in repo: ${patches.length})`);
    console.log(out.verdict === 'PASS'
      ? '\nPASS — nothing in the shipped tree changes the licensing posture.'
      : `\nFAIL\n${reasons.map((r) => `  - ${r}`).join('\n')}`);
  }
  process.exit(out.verdict === 'PASS' ? 0 : 1);
}

main();
