// Recover the per-row negative controls that the 2026-09-02 b2 wave RAN but never wrote down.
//
// Run from the repo root: `node src/.coordination/liquid-workplace/probes/l6-control-transcribe.cjs [--apply] [--skip a,b]`
//
// RELOCATED 2026-09-03 from `debug/_p2i-transcribe.cjs`, which is GITIGNORED. This file and
// `l6-ledger-coverage.cjs` are the only two things that write `parity-ledger.json` besides
// `l6-parity-rows.cjs`, and the ledger's own `controlCoverage.reason` cites one of them by
// path — so an auditor was being pointed at a file that is not in the repository. The debug
// copies are deleted rather than kept in sync; two copies of a tool that mutates a tracked
// artifact will drift, and the drift is invisible until it has already written.
//
// WHY THIS EXISTS. The two concurrent b2 waves used two different row writers.
// `probes/l6-parity-rows.cjs` (this tree) copies BOTH `rowEvidence` and `control.mutations`
// into a row's `observed`. The main tree's `debug/_pr4-rows.cjs` copies only `rowEvidence`.
// Same harness, same per-row mutations, same PASS verdicts -- one of the two just does not
// transcribe the control. After the merge the ledger's own `controlCoverage` block went
// 45 silent / 120 -> 93 / 168 and falsified its own note that silent "can only shrink".
// The mutations are not lost: cat6 banked them in `debug/_pr4-<app>*.json`. This transcribes
// them, and REFUSES rather than guesses on every step of the identity chain.
//
// PROVENANCE IS PART OF THE CLAUSE. Every clause written here says it was transcribed from a
// banked receipt and names the file and that receipt's own mtime, because a control this
// process did not run must never read like one it did.
//
// Refuses on: no meta file; not exactly one qualifying PASS receipt; a mutation that is not a
// declared row id; a meta feature that is not in the ledger exactly once; a mutation whose
// `exactlyOwnRow` or `returned` is not true; or a row that already carries a control clause.
const fs = require('node:fs');

const LEDGER = 'src/.coordination/liquid-workplace/parity-ledger.json';
// Overridable ONLY so this script can be pointed at a planted copy of the receipts for its own
// negative control (debug/_p2i-ctrl/). Never set in a real run.
const MAIN = process.env.PR4_DIR || 'C:/Users/Arseniy/Projects/jp-study-app/debug/';
const APPLY = process.argv.includes('--apply');

const SPEC = 'src/.coordination/liquid-workplace/probes/l6-parity.js';

const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(2); };

/**
 * The CURRENT `cascades` declaration for one app, read out of the spec file with comments
 * removed first. Returns `{}` for a spec that declares none, and `null` when the app's spec
 * block cannot be located at all -- which the caller turns into a refusal, because silently
 * treating "I could not find it" as "it declares nothing" would let every stale receipt back
 * in through the filter this exists to be.
 */
function specCascades(app) {
  const src = fs.readFileSync(SPEC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
  const open = new RegExp(`^ {4}${app}: \\{$`, 'm').exec(src);
  if (!open) return null;
  const rest = src.slice(open.index + open[0].length);
  const end = /^ {4}[a-zA-Z]+: \{$/m.exec(rest);
  const block = end ? rest.slice(0, end.index) : rest;
  // BRACE-BALANCED, not line-anchored. The first draft matched only the multi-line form and
  // silently returned `{}` for `translate` (`cascades: { input: ['agentHandoff'] },`) and
  // `video` (`cascades: { stageHonesty: ['topbarActions'] },`), both written on one line —
  // i.e. it would have called a correctly-declared cascade "none declared" and excluded the
  // only good receipt those apps have. A filter that fails open is worse than no filter.
  const at = /^ {6}cascades: \{/m.exec(block);
  if (!at) return {};
  let i = at.index + at[0].length - 1;
  let depth = 0;
  let close = -1;
  for (; i < block.length; i += 1) {
    if (block[i] === '{') depth += 1;
    else if (block[i] === '}') { depth -= 1; if (depth === 0) { close = i; break; } }
  }
  if (close < 0) return null;
  const body = block.slice(at.index + at[0].length, close);
  const out = {};
  for (const m of body.matchAll(/([a-zA-Z]+): \[([^\]]*)\]/g)) {
    out[m[1]] = (m[2].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  }
  return out;
}

const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const report = [];
const skipped = [];
let written = 0;
let noneDeclared = 0;

// DERIVED, not hardcoded (2026-09-02): the apps to work on are the ones that currently have a
// row carrying no control clause AND a `_pr4-meta-*` block in the main tree -- i.e. exactly the
// rows the non-transcribing writer produced. Hardcoding the list made this a one-shot; the gap
// reproduces on every wave until that writer copies `control.mutations` itself, so the tool has
// to survive the next one. An app whose receipt is not banked yet is SKIPPED with a reason,
// because "primary has not finished that run" is not a defect. Identity-chain violations stay
// hard refusals -- those are the ones that would attach a control to the wrong row.
// `--skip a,b` leaves named apps silent ON PURPOSE and says so, instead of letting one app's
// hard refusal (manga: THREE qualifying PASS receipts, 2026-09-02) block every other app's
// transcription. A skipped app is reported, never quietly dropped.
const SKIP = new Set(((process.argv[process.argv.indexOf('--skip') + 1] || '').split(',')).filter(Boolean));
if (process.argv.includes('--skip') && SKIP.size === 0) refuse('--skip given without an app list');
const APPS = [...new Set(ledger.rows
  .filter((r) => !/negative control/.test(String(r.observed)))
  .map((r) => r.app))]
  .filter((a) => fs.existsSync(`${MAIN}_pr4-meta-${a}.json`))
  .filter((a) => { if (SKIP.has(a)) { skipped.push(`${a}: SKIPPED BY --skip (left silent deliberately; see report)`); return false; } return true; })
  .sort();

for (const app of APPS) {
  const metaPath = `${MAIN}_pr4-meta-${app}.json`;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')).rows;
  const ids = Object.keys(meta);

  // The receipt is CHOSEN BY ITS OWN CONTENT, never by filename convention: it must be the
  // unique file for this app whose run passed, whose control falsified as required, and every
  // one of whose mutations flipped exactly its own row and was returned. The pre-fix VOID/FAIL
  // receipts sitting beside it are the discriminating controls and must not be picked up.
  const cands = fs.readdirSync(MAIN)
    // THE PREFIX IS A LABEL, NOT EVIDENCE, and pinning to one has now cost two waves.
    // It read `_pr4-` only, and the 06:32-07:00 wave banked `_pr5-` (novels/manga/immersion/
    // calendar) — 21 rows sat recoverable and unseen. Widening it to `_pr[0-9]+` then missed
    // `_pb1-games` and `_pb2-settings*`, and this script reported "no qualifying PASS receipt
    // banked yet — run cat6 for it first" for two apps whose receipts were sitting beside the
    // ones it did read. Same writer, same receipt shape, different label. So the glob is now
    // any `_p<tag>-<app>[n].json` and the QUALIFICATION IS DONE BY CONTENT below — PASS
    // verdict, control fired, every mutation exact and returned, cascades matching the spec
    // as it stands, and survivors agreeing field-for-field. Those filters are the safety net;
    // a filename never was one.
    .filter((f) => new RegExp(`^_p[a-z0-9]+-${app}[0-9]?\\.json$`).test(f))
    .map((f) => ({ f, j: JSON.parse(fs.readFileSync(MAIN + f, 'utf8')), mtime: fs.statSync(MAIN + f).mtime }))
    .filter((o) => o.j.verdict === 'PASS 10/10'
      && /CONTROL FAILED AS REQUIRED/.test(String(o.j.control && o.j.control.verdict))
      && (o.j.control.mutations || []).every((m) => m.exactlyOwnRow === true && m.returned === true));
  if (cands.length === 0) { skipped.push(`${app}: no qualifying PASS receipt banked yet -- run cat6 for it first`); continue; }

  // FILTER 2 (2026-09-02, primary2): THE RECEIPT MUST DESCRIBE THE SPEC THAT EXISTS NOW.
  // manga banked THREE qualifying PASS receipts and this script correctly refused rather than
  // pick by mtime -- but "three PASSes" was never the real situation. `_pr5-manga` (06:34) ran
  // BEFORE `pageTransport: ['pageRender']` was declared, and it measured a different surface:
  // its pageTransport mutation took ONLY its own row (7/7 -> 6/7, fell=[pageTransport]), while
  // manga3/manga4 measure the repaired drive where clamping the seek to max=1 clamps its VALUE
  // and pageRender's cross-check correctly falls with it (7/7 -> 5/7, fell=[pageRender,
  // pageTransport]). A clause built from the old receipt would describe an instrument that no
  // longer exists. So a candidate qualifies only if its `declaredCascade` for every mutation
  // equals the CURRENT declaration in l6-parity.js. Comments are stripped before parsing --
  // this file's own history has a comment scored as code (the L12 b3 `canPresentLiquid`
  // ratchet), and a `cascades:` written in prose would otherwise silently widen the filter.
  const cascadesNow = specCascades(app);
  if (cascadesNow === null) refuse(`${app}: could not locate a spec block in ${SPEC} -- refusing rather than skipping the cascade check`);
  const sameCascade = (o) => (o.j.control.mutations || []).every((m) => {
    const declared = (cascadesNow[m.mutation] || []).slice().sort().join(',');
    return (m.declaredCascade || []).slice().sort().join(',') === declared;
  });
  const stale = cands.filter((o) => !sameCascade(o));
  const current = cands.filter(sameCascade);
  if (current.length === 0) {
    refuse(`${app}: all ${cands.length} qualifying receipts declare cascades that differ from the spec's current ones -- re-run cat6 for this app`);
  }

  // FILTER 3: two runs of the SAME instrument are not a tie to break, they are agreement to
  // record. Everything a clause is built from must be identical across the survivors; if it is,
  // the clause names them ALL, which is a stronger claim than picking one. If they disagree the
  // script still refuses, because then they really did measure different things.
  const clauseKey = (o) => (o.j.control.mutations || [])
    .map((m) => [m.mutation, m.preBaseline, m.reachable, (m.fellRows || []).join('+'), m.afterRestore].join('|'))
    .sort().join(';');
  const keys = new Set(current.map(clauseKey));
  if (keys.size !== 1) {
    refuse(`${app}: ${current.length} current-spec receipts disagree on the very fields the clause is built from (${current.map((c) => c.f).join(',')}) -- they measured different things`);
  }
  const chosen = current.slice().sort((a, b) => a.f.localeCompare(b.f));
  const { j: receipt, mtime } = chosen[0];
  const receiptName = chosen.map((c) => c.f).join(' == ');
  const stamp = mtime.toISOString().slice(0, 16).replace('T', ' ');
  if (stale.length) {
    report.push(`${app}: ${stale.length} qualifying receipt(s) EXCLUDED as pre-cascade-declaration (${stale.map((c) => c.f).join(',')})`);
  }
  if (chosen.length > 1) {
    report.push(`${app}: ${chosen.length} receipts agree field-for-field; the clause names all of them (${receiptName})`);
  }

  const mutBy = new Map();
  for (const m of receipt.control.mutations) {
    if (!ids.includes(m.mutation)) refuse(`${app}: mutation "${m.mutation}" is not a declared row id`);
    if (mutBy.has(m.mutation)) refuse(`${app}: two mutations named "${m.mutation}"`);
    mutBy.set(m.mutation, m);
  }

  for (const id of ids) {
    const feature = meta[id].feature;
    const matches = ledger.rows.filter((r) => r.app === app && r.feature === feature);
    if (matches.length !== 1) refuse(`${app}/${id}: feature matched ${matches.length} ledger rows, expected exactly 1`);
    const row = matches[0];
    if (/negative control/.test(String(row.observed))) refuse(`${app}/${id}: row already carries a control clause -- refusing to overwrite`);

    const c = mutBy.get(id);
    let clause;
    if (c) {
      clause = `negative control \`${c.mutation}\` -> ${c.reachable} (baseline ${c.preBaseline}), fell=[${(c.fellRows || []).join(', ')}], restored ${c.afterRestore}`
        + ` -- TRANSCRIBED 2026-09-02 (primary2) from the banked cat6 receipt \`debug/${receiptName}\` (${stamp}), not re-run here`;
      written += 1;
    } else {
      clause = `negative control: NONE DECLARED for this row -- the run's other ${mutBy.size} rows were controlled`
        + ` (cat6 receipt \`debug/${receiptName}\`, ${stamp}), this one is asserted from its own reading only`;
      noneDeclared += 1;
    }
    if (APPLY) row.observed = `${row.observed} || ${clause}`;
    report.push(`${app}/${id}: ${c ? 'CONTROL' : 'none-declared'}`);
  }
}

if (APPLY) {
  const k = (r) => `${r.app}|${r.feature}`;
  const dup = ledger.rows.length - new Set(ledger.rows.map(k)).size;
  if (dup !== 0) refuse(`ledger grew ${dup} duplicate app|feature keys -- not writing`);
  fs.writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}
console.log(report.join('\n'));
if (skipped.length) console.log(`\nSKIPPED (not a defect):\n  ${skipped.join('\n  ')}`);
console.log(`\n${APPLY ? 'WROTE' : 'DRY RUN'}: ${written} rows given a transcribed control, ${noneDeclared} explicitly none-declared, ${written + noneDeclared} touched. Considered apps: ${APPS.join(', ') || 'none'}.`);
