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
 *   - a row whose own mutation could not be ARMED is SKIPPED by name (added 2026-09-02).
 *     cat6 reports `armed: false` when a mutation refused because its subject is absent on
 *     this profile — `resources` > `collectedSections` targets `.mytool-card
 *     .mytool-remove` and nothing is collected. Nothing falsified that row, so the ledger
 *     must not claim it; the run's other rows are unaffected and still write.
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
/*
 * `--refresh` — RE-PROVE a row that is already in the ledger. Added 2026-09-02 (primary2).
 *
 * The gap it closes, measured rather than supposed: this writer is APPEND-ONLY (it filters
 * `add` by `!have.has(app|feature)`), so a row written by an instrument that no longer
 * exists can never be upgraded. `mediaCenter`'s 8 rows are exactly that — driven 2026-08-25
 * by `window.__L6M`, which `cat6-feature-parity.cjs` superseded, and so 8 of the ledger's
 * silent rows by construction rather than by anyone's neglect. Without this they stay silent
 * forever no matter how well the surface is re-driven.
 *
 * It APPENDS, it never overwrites: the original observation and its provenance stay in
 * `observed`, and the re-drive is added after a ` || RE-DRIVEN ` marker naming the run. A
 * ledger that quietly replaced an older reading with a newer one would be unfalsifiable
 * about its own history.
 *
 * Refusals, each preventing a specific false row:
 *   - a row whose key is NOT already present is not a refresh; it goes through the normal
 *     add path, and asking to refresh it REFUSES rather than silently adding.
 *   - a row whose mutation did not arm is SKIPPED by name, exactly as on the add path: an
 *     unarmed control proves nothing whether the row is new or old.
 *   - a row that already carries a re-drive from this same run artifact is left alone, so
 *     running it twice cannot stack duplicate clauses.
 *   - the run must still be PASS with `control.mutations` present, the same bar as an add.
 */
const REFRESH = has('refresh');

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
  const skipped = [];
  for (const ev of run.rowEvidence) {
    const fm = m.features && m.features[ev.id];
    if (!fm) {
      return { refused: `${sourceName}: no metadata entry for row "${ev.id}" of app "${app}" — add it to parity-row-metadata.json rather than writing an invented route` };
    }
    // A ROW WHOSE CONTROL NEVER ARMED IS NOT VERIFIED BY SIDE EFFECT, which is the only
    // thing a ledger row claims. cat6 now reports `armed: false` when a mutation refused
    // because its subject is genuinely absent on this profile (`resources` >
    // `collectedSections`: nothing is collected, so `.mytool-card .mytool-remove` does not
    // exist). Skipping it BY NAME is the difference between a smaller honest ledger and a
    // larger one carrying a row nothing ever falsified.
    const ctl = controlBy.get(ev.id);
    if (ctl && ctl.armed === false) {
      skipped.push(`${ev.id} (control unarmable: ${ctl.unarmableReason || ctl.applied})`);
      continue;
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
    } else {
      // SAY IT RATHER THAN OMIT IT (added 2026-09-02). A row whose spec declares no mutation
      // used to write an `observed` that simply ended after the two presentations, and the
      // absence of a control read exactly like a row that had one. Two different states — no
      // mutation declared, versus one declared that could not arm (skipped above by name) —
      // both looked like silence. `shell` > `desktopSurface` is the live case: its subject is
      // the shell ROOT, and `restore()` sweeps `qa(win, '*')`, which does not include `win`
      // itself, so a falsification there could not be guaranteed undone. That is a real
      // reason and it belongs in the row, not in a commit message.
      parts.push('negative control: NONE DECLARED for this row — the run\'s other rows were controlled, this one is asserted from its own reading only');
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
  return { rows: out, skipped, app, roundTrip: run.roundTrip, verdict: run.verdict };
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

const byKey = new Map(ledger.rows.map((r) => [`${r.app}|${r.feature}`, r]));
const refreshed = [];

for (const { name, run } of runs) {
  const r = rowsFromRun(run, meta, name);
  if (r.refused) { refusals.push(r.refused); continue; }
  if (REFRESH) {
    // The marker is keyed on the RUN ARTIFACT'S OWN NAME, so re-running this command with
    // the same receipt is a no-op and re-running it with a genuinely newer one appends.
    const marker = `RE-DRIVEN from ${name}`;
    const missing = r.rows.filter((row) => !byKey.has(`${row.app}|${row.feature}`));
    if (missing.length) {
      refusals.push(`${name}: --refresh asked for ${missing.length} row(s) that are NOT in the ledger (${missing.map((x) => x.feature).join(' / ')}) — that is an ADD, run without --refresh`);
      continue;
    }
    const touched = [];
    const already = [];
    for (const row of r.rows) {
      const live = byKey.get(`${row.app}|${row.feature}`);
      if (String(live.observed).includes(marker)) { already.push(row.feature); continue; }
      live.observed = `${live.observed} || ${marker} (${new Date().toISOString().slice(0, 10)}): ${row.observed}`;
      // Status is re-derived from the fresh run, because that is the reading that is
      // re-runnable. A refresh that kept a stale `pending` would be the whole point missed.
      live.status = row.status;
      live.automatedProof = row.automatedProof;
      touched.push(row.feature);
    }
    refreshed.push(...touched);
    summary.push({
      run: name, app: r.app, verdict: r.verdict, mode: 'refresh',
      rows: r.rows.length, refreshed: touched.length, alreadyCarryingThisRun: already,
      skipped: r.skipped,
      statuses: r.rows.reduce((a, row) => ((a[row.status] = (a[row.status] || 0) + 1), a), {}),
    });
    continue;
  }
  const add = r.rows.filter((row) => !have.has(`${row.app}|${row.feature}`));
  add.forEach((row) => have.add(`${row.app}|${row.feature}`));
  fresh.push(...add);
  summary.push({
    run: name,
    app: r.app,
    verdict: r.verdict,
    rows: r.rows.length,
    added: add.length,
    // Named, never silent: a skipped row is a row the ledger deliberately does NOT claim.
    skipped: r.skipped,
    statuses: r.rows.reduce((a, row) => ((a[row.status] = (a[row.status] || 0) + 1), a), {}),
  });
}

if (refusals.length) {
  console.error(`REFUSED (${refusals.length}):`);
  refusals.forEach((x) => console.error(`  - ${x}`));
}
if (REFRESH) {
  if (DRY) {
    console.log(JSON.stringify({ dry: true, mode: 'refresh', wouldRefresh: refreshed.length, rows: refreshed, summary }, null, 2));
    process.exitCode = refusals.length ? 1 : 0;
    return;
  }
  if (refreshed.length) {
    if (MILESTONE) ledger.milestone = MILESTONE;
    fs.writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    mode: 'refresh', refreshed: refreshed.length, rows: refreshed, total: ledger.rows.length, summary,
  }, null, 2));
  process.exitCode = refusals.length ? 1 : 0;
  return;
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
