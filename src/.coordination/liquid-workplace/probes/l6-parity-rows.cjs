/**
 * L12 BULLET 2 — write feature-ledger rows FROM the category-6 run artifact, for any app.
 *
 * Why this exists, stated as the defect it removes. `l6-parity-write-rows.cjs` is a
 * hand-written file: every `observed` string in it was copied out of a console log by a
 * human, one row at a time, and its own header admits it ("a literal copy of a `check()`
 * row's `evidence`"). That is fine for the five apps it covers and it does not scale to the
 * nineteen it does not — `l6-parity.js` declares 24 SPECS and `parity-ledger.json` holds
 * rows for 7 apps, so 19 root components have a driven, controlled harness and no ledger
 * row. Transcription is also the one step of the chain with no control on it: nothing in the
 * repo could tell a mistyped `rows=2410` from the real one.
 *
 * So the measured half is DERIVED and the authored half is DECLARED, and they are kept apart:
 *
 *   measured  ->  `observed`, copied verbatim out of `out.rowEvidence` (added to
 *                 cat6-feature-parity.cjs in the same commit as this file) and
 *                 `out.control.mutations`. This file never composes a number.
 *   authored  ->  `feature`, `currentRoute`, `keyboardRoute`, `dataStateOwner` and the two
 *                 destinations, which are prose about product structure and cannot be
 *                 measured. They live in `parity-row-metadata.json`, one entry per spec row
 *                 id, and a run whose spec has an id the metadata does not name is REFUSED
 *                 rather than written with an invented route.
 *
 * Refusals, each of which has a matching false-row it prevents:
 *   - a run that is not `PASS` (FAIL or VOID) writes NOTHING. A ledger row means "verified
 *     by side effect"; a VOID run's control did not falsify, so its evidence is unproven.
 *   - a run with no `rowEvidence` is from before that field existed — refuse rather than
 *     silently write rows with an empty `observed`.
 *   - an app with no metadata block, or a row id with no metadata entry, refuses BY NAME.
 *   - `--dry` prints exactly what would be added and writes nothing.
 *
 * Status is derived, never assumed: `both` when the row is reachable in both presentations,
 * `REGRESSION` when it is reachable in one and not the other (the vocabulary's own words),
 * and `pending` when the run recorded no Liquid half at all (a chromeless host — the
 * `noLiquid` branch of the harness).
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/l6-parity-rows.cjs \
 *     --run debug/_x-cat6-settings.json [--run ...] [--milestone L12-parity-ledger] [--dry]
 *   node src/.coordination/liquid-workplace/probes/l6-parity-rows.cjs --self-control
 *
 * `--self-control` is this writer's own negative control and it does not touch the ledger:
 * it takes each named run, mutates a COPY of it in memory, and requires the writer to
 * change its answer. Three plants, each aimed at a way this file could be decorative —
 * a row that is reachable in only one presentation must come out `REGRESSION` and not
 * `both`; a row id the metadata does not name must REFUSE; and a `VOID` verdict must write
 * nothing. A writer that produces the same ledger from a broken run is not a writer.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const HERE = __dirname;
const LEDGER = path.join(HERE, '..', 'parity-ledger.json');
const META = path.join(HERE, '..', 'parity-row-metadata.json');

const args = process.argv.slice(2);
const has = (name) => args.indexOf(`--${name}`) >= 0;
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const many = (name) => args.reduce((a, v, i) => (v === `--${name}` && args[i + 1] ? a.concat(args[i + 1]) : a), []);

const DRY = has('dry');
const SELF_CONTROL = has('self-control');
const MILESTONE = arg('milestone', '');

const PROOF = 'probes/cat6-feature-parity.cjs --app <app> (the surface-parameterised category-6 harness) driving probes/l6-parity.js; `observed` is copied mechanically from that run\'s `rowEvidence` and `control.mutations` by probes/l6-parity-rows.cjs — not transcribed';

/** Read a run artifact and reduce it to the rows a ledger can carry, or a refusal. */
function rowsFromRun(run, meta, sourceName) {
  const app = run.app;
  if (!app) return { refused: `${sourceName}: artifact has no \`app\`` };
  if (!String(run.verdict || '').startsWith('PASS')) {
    return { refused: `${sourceName}: verdict is "${run.verdict}" — only a PASS run may write ledger rows` };
  }
  if (!Array.isArray(run.rowEvidence) || run.rowEvidence.length === 0) {
    return { refused: `${sourceName}: no \`rowEvidence\` — re-run with the current cat6 harness` };
  }
  const m = meta[app];
  if (!m) return { refused: `${sourceName}: parity-row-metadata.json has no block for app "${app}"` };

  // The control's per-row half, keyed by the row each mutation is declared to own.
  const controlBy = new Map();
  for (const c of (run.control && run.control.mutations) || []) {
    controlBy.set(c.mutation, c);
  }

  const out = [];
  for (const ev of run.rowEvidence) {
    const fm = m.features && m.features[ev.id];
    if (!fm) {
      return { refused: `${sourceName}: no metadata entry for row "${ev.id}" of app "${app}" — add it to parity-row-metadata.json rather than writing an invented route` };
    }
    const std = ev.standard;
    const lq = ev.liquid;
    const status = !lq ? 'pending'
      : (std.reachable === true && lq.reachable === true) ? 'both'
        : (std.reachable !== lq.reachable) ? 'REGRESSION' : 'pending';

    const parts = [`standard: ${std.evidence}`];
    parts.push(lq ? `liquid: ${lq.evidence}` : `liquid: n/a — ${run.parity && run.parity.liquid ? run.parity.liquid : 'section is not Liquid-presentable'}`);
    const c = controlBy.get(ev.id);
    if (c) {
      parts.push(`negative control \`${c.mutation}\` -> ${c.reachable} (baseline ${c.preBaseline}), fell=[${(c.fellRows || []).join(', ')}], restored ${c.afterRestore}`);
    }
    out.push({
      app,
      feature: fm.feature,
      currentRoute: fm.currentRoute,
      standardDestination: m.standardDestination,
      liquidDestination: lq ? m.liquidDestination : (m.noLiquidReason || 'none — this host mounts outside `.fwin`, so there is no window chrome to carry a presentation'),
      keyboardRoute: fm.keyboardRoute,
      dataStateOwner: fm.dataStateOwner,
      automatedProof: PROOF.replace('<app>', app),
      visualProof: run.visualProof || `live bridge drive, ${(run.when || '').slice(0, 10) || 'see run artifact'} (label ${run.label || 'n/a'})`,
      observed: parts.join(' || '),
      status,
    });
  }
  return { rows: out, app, roundTrip: run.roundTrip, verdict: run.verdict };
}

function loadRuns() {
  const files = many('run');
  if (!files.length) {
    console.error('no --run given; nothing to do');
    process.exit(2);
  }
  return files.map((f) => {
    const p = path.isAbsolute(f) ? f : path.join(process.cwd(), f);
    return { name: path.basename(p), run: JSON.parse(fs.readFileSync(p, 'utf8')) };
  });
}

const metaDoc = JSON.parse(fs.readFileSync(META, 'utf8'));
// The file carries its own schema/provenance prose alongside the blocks; only `apps` is data.
const meta = metaDoc.apps || {};

if (SELF_CONTROL) {
  const runs = loadRuns();
  const results = [];
  for (const { name, run } of runs) {
    const base = rowsFromRun(run, meta, name);
    if (base.refused) { results.push({ run: name, plant: 'baseline', outcome: `REFUSED: ${base.refused}` }); continue; }
    results.push({ run: name, plant: 'baseline', outcome: `${base.rows.length} rows, statuses ${JSON.stringify(base.rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}))}` });

    // Plant 1 — a row reachable in standard and not in Liquid must come out REGRESSION.
    const p1 = JSON.parse(JSON.stringify(run));
    const target = p1.rowEvidence.find((e) => e.liquid && e.liquid.reachable === true && e.standard.reachable === true);
    let p1out = 'NOT ARMABLE — no row is reachable in both presentations';
    if (target) {
      target.liquid.reachable = false;
      const r1 = rowsFromRun(p1, meta, name);
      const row = r1.rows && r1.rows.find((r) => r.feature === (meta[run.app].features[target.id] || {}).feature);
      p1out = r1.refused ? `REFUSED: ${r1.refused}` : `row "${target.id}" -> ${row && row.status}`;
      results.push({ run: name, plant: `liquid-unreachable(${target.id})`, outcome: p1out, fires: !!row && row.status === 'REGRESSION' });
    } else {
      results.push({ run: name, plant: 'liquid-unreachable', outcome: p1out, fires: null });
    }

    // Plant 2 — an unknown row id must refuse by name, never be written with a guessed route.
    const p2 = JSON.parse(JSON.stringify(run));
    p2.rowEvidence.push({ id: '__planted_unknown_row__', standard: { reachable: true, evidence: 'planted' }, liquid: { reachable: true, evidence: 'planted' } });
    const r2 = rowsFromRun(p2, meta, name);
    results.push({ run: name, plant: 'unknown-row-id', outcome: r2.refused || `WROTE ${r2.rows.length} rows`, fires: !!r2.refused && r2.refused.includes('__planted_unknown_row__') });

    // Plant 3 — a VOID verdict must write nothing at all.
    const p3 = JSON.parse(JSON.stringify(run));
    p3.verdict = 'VOID - negative control did not falsify';
    const r3 = rowsFromRun(p3, meta, name);
    results.push({ run: name, plant: 'void-verdict', outcome: r3.refused || `WROTE ${r3.rows.length} rows`, fires: !!r3.refused });
  }
  const armed = results.filter((r) => r.fires !== undefined && r.fires !== null);
  const fired = armed.filter((r) => r.fires);
  console.log(JSON.stringify({
    mode: 'self-control',
    plants: results,
    armed: armed.length,
    fired: fired.length,
    verdict: armed.length > 0 && fired.length === armed.length
      ? 'CONTROL FIRED AS REQUIRED — the writer changes its answer when the run changes'
      : 'VOID - a plant did not change the writer\'s answer',
  }, null, 2));
  process.exitCode = armed.length > 0 && fired.length === armed.length ? 0 : 1;
  return;
}

const runs = loadRuns();
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const have = new Set(ledger.rows.map((r) => `${r.app}|${r.feature}`));
const fresh = [];
const refusals = [];
const summary = [];

for (const { name, run } of runs) {
  const r = rowsFromRun(run, meta, name);
  if (r.refused) { refusals.push(r.refused); continue; }
  const add = r.rows.filter((row) => !have.has(`${row.app}|${row.feature}`));
  add.forEach((row) => have.add(`${row.app}|${row.feature}`));
  fresh.push(...add);
  summary.push({
    run: name,
    app: r.app,
    verdict: r.verdict,
    rows: r.rows.length,
    added: add.length,
    statuses: r.rows.reduce((a, row) => ((a[row.status] = (a[row.status] || 0) + 1), a), {}),
  });
}

if (refusals.length) {
  console.error(`REFUSED (${refusals.length}):`);
  refusals.forEach((x) => console.error(`  - ${x}`));
}
if (!fresh.length) {
  console.log(JSON.stringify({ added: 0, note: 'nothing new — every derived row is already in the ledger', summary }, null, 2));
  process.exitCode = refusals.length ? 1 : 0;
  return;
}
if (DRY) {
  console.log(JSON.stringify({ dry: true, wouldAdd: fresh.length, summary, rows: fresh }, null, 2));
  process.exitCode = refusals.length ? 1 : 0;
  return;
}

ledger.rows.push(...fresh);
if (MILESTONE) ledger.milestone = MILESTONE;
fs.writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
const byApp = ledger.rows.reduce((a, r) => ((a[r.app] = (a[r.app] || 0) + 1), a), {});
const byStatus = ledger.rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
console.log(JSON.stringify({
  added: fresh.length, total: ledger.rows.length, byApp, byStatus, summary,
}, null, 2));
process.exitCode = refusals.length ? 1 : 0;
