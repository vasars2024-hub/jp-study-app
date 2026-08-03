#!/usr/bin/env node
// WHY 47e's REFUSAL NEVER ARRIVES ON A BUILT-IN PROFILE — Phase 7 / slice 53.
//
// `phase7-queue-refusal-live-gate.mjs` drove 47e's whole story against a packaged build and every
// precondition passed: the queued task survived the restart, the narrowing was on disk and still
// on disk after the restart, and the per-row Run button ran the step. The step then **completed**
// in the narrowed arm — no refusal — and completed identically in the control arm.
//
// The allow-list is not the problem. `evaluateAgentToolAccess` is wired exactly as 47e left it and
// `runAgentTaskStep` is the single renderer boundary slice 51 made it. The problem is one step
// earlier: **the narrowing never reaches the allow-list**, because `normalizeAgentProfiles()`
// throws away every user edit to a BUILT-IN profile.
//
//   localAgentProfiles.ts:146   for (const p of EMPTY_AGENT_PROFILE_STORE.profiles) byId.set(p.id, p);
//   localAgentProfiles.ts:151   if (!id || byId.has(id)) continue;   // ← every built-in id collides
//
// The map is seeded with the built-in defaults and the persisted copy is then skipped for any id
// already present — which is all four built-ins. `loadLocalAgentProfiles()` normalizes on every
// read, and `getActiveAgentProfile()` normalizes AGAIN, so the panel's `activeProfile` is the
// factory profile no matter what the user saved.
//
// This probe transpiles the REAL module with the repo's own esbuild and measures it, rather than
// reading the code and asserting a conclusion. It carries its own control: the identical edit to a
// CUSTOM profile, whose id does not collide, survives — which is what makes the built-in id the
// attributable cause rather than "editing profiles is broken".
//
// usage:  node docs/migration/tools/agent-profile-narrowing-probe.mjs

import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const OP = 'dictionary.search-knowledge';

const { build } = await import(
  pathToFileURL(path.join(REPO, 'node_modules/esbuild/lib/main.js')).href);

const outFile = path.join(os.tmpdir(), `agent-profiles-probe-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(REPO, 'src/shared/localAgentProfiles.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: outFile,
  logLevel: 'error',
});

const { normalizeAgentProfiles, getActiveAgentProfile, EMPTY_AGENT_PROFILE_STORE } =
  await import(pathToFileURL(outFile).href);

const rows = [];

// ── the built-in case: exactly what the live gate wrote into localStorage ──────
const persisted = JSON.parse(JSON.stringify(EMPTY_AGENT_PROFILE_STORE));
const tutor = persisted.profiles.find((p) => p.id === 'study-tutor');
const before = tutor.enabledOperations.length;
tutor.enabledOperations = tutor.enabledOperations.filter((o) => o !== OP);
rows.push(['persisted store (what lands in localStorage)', tutor.enabledOperations.length,
  tutor.enabledOperations.includes(OP)]);

const loaded = normalizeAgentProfiles(persisted).profiles.find((p) => p.id === 'study-tutor');
rows.push(['after normalizeAgentProfiles()', loaded.enabledOperations.length,
  loaded.enabledOperations.includes(OP)]);

const active = getActiveAgentProfile(persisted);
rows.push(['getActiveAgentProfile() — the panel\'s allowedOperations', active.enabledOperations.length,
  active.enabledOperations.includes(OP)]);

// ── the control: the same edit on an id that does NOT collide with a built-in ──
const withCustom = JSON.parse(JSON.stringify(EMPTY_AGENT_PROFILE_STORE));
withCustom.profiles.push({
  ...tutor, id: 'custom-probe', name: 'Probe', builtIn: false,
  enabledOperations: tutor.enabledOperations.slice(),
});
withCustom.activeProfileId = 'custom-probe';
const customActive = getActiveAgentProfile(withCustom);
rows.push(['CONTROL — identical edit on a CUSTOM profile', customActive.enabledOperations.length,
  customActive.enabledOperations.includes(OP)]);

console.log(`built-in profile study-tutor ships ${before} operations; the edit removes ${OP}\n`);
for (const [label, count, present] of rows) {
  console.log(`  ${String(count).padStart(3)} ops · ${OP} present = ${String(present).padEnd(5)} · ${label}`);
}

const discarded = active.enabledOperations.includes(OP);
const customKept = !customActive.enabledOperations.includes(OP);
const verdict = discarded && customKept ? 'CONFIRMED' : 'NOT-REPRODUCED';
console.log(`\nverdict: ${verdict} — a narrowing of a BUILT-IN profile is ${
  discarded ? 'DISCARDED' : 'kept'} on load, while the same narrowing of a CUSTOM profile is ${
  customKept ? 'KEPT' : 'also discarded'}.`);
if (verdict === 'CONFIRMED') {
  console.log('Consequence: 47e\'s execution-time allow-list re-check is correct and unreachable — '
    + 'the profile it is handed has been rebuilt from the factory defaults, so narrowing a built-in '
    + 'profile can never refuse anything. The four built-ins are the only profiles a fresh user has.');
}

fs.rmSync(outFile, { force: true });
process.exit(verdict === 'CONFIRMED' ? 0 : 1);
