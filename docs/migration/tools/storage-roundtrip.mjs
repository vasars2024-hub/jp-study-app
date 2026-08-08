#!/usr/bin/env node
/**
 * storage-roundtrip.mjs — audit item 6.3: does a value survive a cycle byte-for-byte?
 *
 * ## Why this is a boot cycle and not a UI cycle
 *
 * 6.3 as written says: change one field through the real control, change it back through the
 * same control, diff the blob. That is the right shape for *one* key and it is what items 4.1,
 * 2.2 and 4.2 each did for the key they touched. It does not scale to 63 live keys — most have
 * no single control that round-trips, several are only reachable behind a feature that needs
 * models or media installed, and driving that many controls through the bridge is where false
 * findings come from (see the `jp-bridge` notes on click arbitration).
 *
 * The **boot cycle** covers every live key at once and uses the app's real load path:
 *
 *   snapshot → reload → snapshot → reload → snapshot
 *
 * Any key whose bytes change with no user interaction is, by definition, not surviving a cycle.
 * Two reloads rather than one is the load-bearing part, because it splits the finding in half:
 *
 *   - **canonicalised** — changed on the first boot, stable after. A normaliser rewrote the
 *     value into its preferred form once. Usually benign, but it is also what a *lossy*
 *     normaliser looks like, so the field-level diff is reported.
 *   - **per-boot** — changes on every boot. This is the 6.A class: `jp-flashcard-deck` grew one
 *     JSON escaping layer per boot until it was 37 MB and read as an empty deck. **This tool
 *     would have caught 6.A on its second reload**, which is the reason it exists in this shape.
 *
 * ## Read-only
 *
 * The probe itself only ever calls `getItem` and `localStorage.key(i)`. It never writes, and it
 * takes no backup — per the standing instruction there is no restore point (audit § Phase 0), so
 * the tool must not be the thing that changes state. A reload is not a write.
 *
 * Usage:
 *   node docs/migration/tools/storage-roundtrip.mjs [--cycles 2] [--md <path>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const cycles = Number(argValue('--cycles', '2'));
const mdPath = path.resolve(REPO, argValue('--md', 'docs/audit/STORAGE_ROUNDTRIP.md'));
const jsonPath = mdPath.replace(/\.md$/, '.json');

const bridgePath = path.join(REPO, 'debug', 'bridge.json');
if (!fs.existsSync(bridgePath)) {
  console.error('No debug/bridge.json — the dev app is not running. 6.3 needs the live store.');
  process.exit(2);
}
const bridge = JSON.parse(fs.readFileSync(bridgePath, 'utf8'));
const BASE = `http://127.0.0.1:${bridge.port}`;
const HEAD = { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(route, body) {
  const res = await fetch(`${BASE}${route}`, { method: 'POST', headers: HEAD, body: JSON.stringify(body ?? {}) });
  if (!res.ok) throw new Error(`${route} → HTTP ${res.status}`);
  return res.json();
}

async function evaluate(js, window = 'main') {
  const out = await post('/eval', { js, window });
  if (!out.ok) throw new Error(`eval failed: ${JSON.stringify(out).slice(0, 400)}`);
  return out.result;
}

/**
 * The snapshot expression. Runs entirely inside the renderer and returns one row per key.
 *
 * A hash rather than the value: the store is ~1.4 M chars and the point is *whether* bytes
 * moved, not what they are. `head`/`tail` are carried so a diff can be described without a
 * second round-trip, and `fields` so a changed object can be reported at field level — a byte
 * change with an identical field set is a value edit, a changed field set is structural.
 */
const SNAPSHOT_JS = `(() => {
  const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  };
  const rows = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    let type = 'scalar';
    let fields = null;
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) { type = 'array'; fields = ['length:' + v.length]; }
      else if (v && typeof v === 'object') { type = 'object'; fields = Object.keys(v).sort(); }
      else type = 'scalar-json';
    } catch { type = 'non-json'; }
    rows.push({
      key,
      chars: raw.length,
      hash: hash(raw),
      type,
      fields,
      head: raw.slice(0, 60),
      tail: raw.slice(-40),
    });
  }
  return { total: rows.length, totalChars: rows.reduce((n, r) => n + r.chars, 0), rows };
})()`;

const READY_JS = `(() => document.readyState === 'complete' && !!document.querySelector('.os-taskbar'))()`;

async function waitReady(timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(READY_JS)) return true;
    } catch {
      /* renderer mid-navigation — keep polling */
    }
    await sleep(1000);
  }
  throw new Error('renderer did not become ready within 60s — refusing to snapshot a half-built page');
}

// ---------------------------------------------------------------------------

const snapshots = [];

console.log('6.3 boot round-trip — read-only probe, no writes, no backup taken.');
await waitReady();
snapshots.push({ label: 'baseline', ...(await evaluate(SNAPSHOT_JS)) });
console.log(`  baseline: ${snapshots[0].total} keys, ${snapshots[0].totalChars.toLocaleString()} chars`);

for (let c = 1; c <= cycles; c += 1) {
  await post('/reload', { window: 'main' });
  await sleep(2000);
  await waitReady();
  // One extra settle: boot-time writers (migrations, autosaves) run just after mount, and
  // snapshotting the instant the taskbar exists races them.
  await sleep(3000);
  const snap = { label: `boot-${c}`, ...(await evaluate(SNAPSHOT_JS)) };
  snapshots.push(snap);
  console.log(`  boot ${c}: ${snap.total} keys, ${snap.totalChars.toLocaleString()} chars`);
}

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------

const rowsByKey = (snap) => new Map(snap.rows.map((r) => [r.key, r]));

function diffSnapshots(snaps) {
  const allKeys = new Set(snaps.flatMap((s) => s.rows.map((r) => r.key)));
  const out = [];
  for (const key of [...allKeys].sort()) {
    const seq = snaps.map((s) => rowsByKey(s).get(key) ?? null);
    const base = seq[0];

    const changedAt = [];
    for (let i = 1; i < seq.length; i += 1) {
      const prev = seq[i - 1];
      const cur = seq[i];
      if (!prev && !cur) continue;
      if (!prev || !cur || prev.hash !== cur.hash) changedAt.push(i);
    }
    if (!changedAt.length) continue;

    const last = seq[seq.length - 1];
    const fieldsBefore = base?.fields ?? null;
    const fieldsAfter = last?.fields ?? null;
    const fieldSetChanged = JSON.stringify(fieldsBefore) !== JSON.stringify(fieldsAfter);

    // Changed on the first boot only → a normaliser settled it. Changed on every boot → the
    // 6.A class, and the one that matters.
    const everyBoot = changedAt.length === seq.length - 1;
    out.push({
      key,
      verdict: !base ? 'appeared' : !last ? 'disappeared' : everyBoot ? 'per-boot' : 'canonicalised',
      changedAtCycles: changedAt,
      charsBefore: base?.chars ?? null,
      charsAfter: last?.chars ?? null,
      charsDelta: base && last ? last.chars - base.chars : null,
      type: last?.type ?? base?.type ?? null,
      fieldSetChanged,
      fieldsAdded: fieldsBefore && fieldsAfter ? fieldsAfter.filter((f) => !fieldsBefore.includes(f)) : [],
      fieldsRemoved: fieldsBefore && fieldsAfter ? fieldsBefore.filter((f) => !fieldsAfter.includes(f)) : [],
      headBefore: base?.head ?? null,
      headAfter: last?.head ?? null,
    });
  }
  return out;
}

/**
 * Positive control, run every time against synthetic snapshots before the real ones.
 *
 * "0 keys moved" is this tool's most dangerous output, because a diff that can never fire
 * produces it too — and reads as good news. The 6.2 sweep in this same audit shipped a run
 * reporting a clean store that was really a Windows path bug collecting nothing.
 *
 * It matters especially here: on the run that produced the first report, the one key with a
 * continuously-writing owner (`jp-os-environment-v1`, see 3.3 / 6.F) happened to have its pet
 * parked against a wall — `motion: 'wall'`, stationary — so nothing in the live store had any
 * reason to move. A real all-stable result and a broken diff were observationally identical.
 * This makes them distinguishable.
 */
function selfTest() {
  const row = (key, hash, chars, fields) => ({ key, hash, chars, type: 'object', fields, head: '', tail: '' });
  const a = { rows: [row('stable', 'aaa', 10, ['x']), row('grows', 'b1', 10, ['x']), row('loses', 'c1', 20, ['x', 'y']), row('goes', 'd1', 5, ['x'])] };
  const b = { rows: [row('stable', 'aaa', 10, ['x']), row('grows', 'b2', 20, ['x']), row('loses', 'c2', 10, ['x']), row('appears', 'e1', 5, ['x'])] };
  const c = { rows: [row('stable', 'aaa', 10, ['x']), row('grows', 'b3', 40, ['x']), row('loses', 'c2', 10, ['x']), row('appears', 'e1', 5, ['x'])] };
  const got = new Map(diffSnapshots([a, b, c]).map((f) => [f.key, f]));

  const problems = [];
  if (got.has('stable')) problems.push('a byte-identical key was reported as changed');
  if (got.get('grows')?.verdict !== 'per-boot') problems.push('a key changing every boot was not classed per-boot (this is the 6.A shape)');
  if (got.get('loses')?.verdict !== 'canonicalised') problems.push('a key that settled after one boot was not classed canonicalised');
  if (!got.get('loses')?.fieldsRemoved.includes('y')) problems.push('a dropped field was not reported');
  if (got.get('goes')?.verdict !== 'disappeared') problems.push('a removed key was not reported');
  if (got.get('appears')?.verdict !== 'appeared') problems.push('an added key was not reported');
  return problems;
}

const selfTestProblems = selfTest();
if (selfTestProblems.length) {
  console.error('\nSELF-TEST FAILED — the diff cannot detect change, so any result below is meaningless:');
  for (const p of selfTestProblems) console.error(`  - ${p}`);
  process.exit(3);
}
console.log('  self-test: diff detects per-boot growth, canonicalisation, field loss, add and remove.');

const keys = new Set(snapshots.flatMap((s) => s.rows.map((r) => r.key)));
const findings = diffSnapshots(snapshots);

const stable = keys.size - findings.length;
const perBoot = findings.filter((f) => f.verdict === 'per-boot');
const canonicalised = findings.filter((f) => f.verdict === 'canonicalised');
const membership = findings.filter((f) => f.verdict === 'appeared' || f.verdict === 'disappeared');
const lossy = findings.filter((f) => f.fieldsRemoved.length);

const table = (head, rows) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const md = `# Storage 6.3 — byte-for-byte round-trip across boots

_Generated ${new Date().toISOString()} by \`docs/migration/tools/storage-roundtrip.mjs\`
(${cycles} reload cycles, read-only)._

Every live key, cycled through the app's own load path: **snapshot → reload → snapshot → reload
→ snapshot**. A key whose bytes move with no user interaction is not surviving a cycle. Two
reloads split that into *canonicalised once* and *changes every boot* — the second is the 6.A
class, and this probe would have caught 6.A on its second reload.

${table(
  ['Measure', 'Count'],
  [
    ['Live keys examined', String(keys.size)],
    ['**Byte-identical across every cycle**', `**${stable}**`],
    ['Changed on the first boot only (canonicalised)', String(canonicalised.length)],
    ['**Changed on every boot (6.A class)**', `**${perBoot.length}**`],
    ['Appeared or disappeared', String(membership.length)],
    ['**Lost a field across the cycle**', `**${lossy.length}**`],
  ],
)}

${
  findings.length
    ? `## Every key that moved

${table(
  ['Key', 'Verdict', 'Chars', 'Δ', 'Field set', 'Fields lost'],
  findings.map((f) => [
    `\`${f.key}\``,
    `**${f.verdict}**`,
    `${f.charsBefore ?? '—'} → ${f.charsAfter ?? '—'}`,
    f.charsDelta === null ? '—' : (f.charsDelta > 0 ? `+${f.charsDelta}` : String(f.charsDelta)),
    f.fieldSetChanged ? 'changed' : 'identical',
    f.fieldsRemoved.length ? f.fieldsRemoved.map((x) => `\`${x}\``).join(', ') : '—',
  ]),
)}`
    : '## Every key that moved\n\n_None — every live key is byte-identical across every cycle._'
}

## How to read a row

- **identical field set + a byte delta** — a value edit inside the blob, not a structural change.
  A continuously-writing owner (a pet position autosave serialising a longer float) looks exactly
  like this and is benign; see 3.3 / 6.F.
- **changed field set** — structural. Fields *lost* are the ones that matter: that is a normaliser
  or a second owner dropping data, and it is the direct answer to "byte for byte … to see if it's
  missing".
- **per-boot** — the value never settles. Escalate: this is the shape 6.A had.

## What this probe does and does not cover

**Covers:** every live key, through the app's real load-and-boot path, including every normaliser
that runs on read and every writer that fires during startup. That is the population 6.3 names,
and it is the class 6.A belonged to.

**Does not cover:** a field that only a *user action* can change. 6.3's original wording — drive
one control, drive it back, diff — remains the only way to test those, and it has been done per
item rather than store-wide: \`jp-os-desktop-prefs-v1\` byte-identical after an icon-size change
and restore (4.1), \`jp-os-personalization-v1\` restored (2.2), \`jp-study-shortcuts-v1\` still
\`null\` throughout (4.2), and the known benign absent-vs-\`""\` case (3.3).

**A caveat this run must carry:** an all-stable result is only as strong as the store's appetite
to move during it. The one key with a continuously-writing owner is \`jp-os-environment-v1\`, and
a run taken while its pet is parked (\`motion: 'wall'\`, stationary) exercises nothing. The
self-test above is what separates "nothing moved" from "the diff cannot see movement"; it is not
a substitute for noting that the live store may simply have been quiet.
`;

fs.mkdirSync(path.dirname(mdPath), { recursive: true });
fs.writeFileSync(mdPath, md, 'utf8');
fs.writeFileSync(jsonPath, JSON.stringify({ cycles, snapshots: snapshots.map((s) => ({ label: s.label, total: s.total, totalChars: s.totalChars })), findings }, null, 2), 'utf8');

console.log(`\n  stable: ${stable}/${keys.size}   canonicalised: ${canonicalised.length}   per-boot: ${perBoot.length}   lost-a-field: ${lossy.length}`);
for (const f of perBoot) console.log(`  PER-BOOT ${f.key}  ${f.charsBefore} → ${f.charsAfter}`);
for (const f of lossy) console.log(`  LOST FIELDS ${f.key}  ${f.fieldsRemoved.join(', ')}`);
console.log(`  ${path.relative(REPO, mdPath).replace(/\\/g, '/')}`);
