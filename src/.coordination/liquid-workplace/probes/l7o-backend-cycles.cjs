/**
 * L7-O — does the shared backend stop the per-cycle handle stack? (defect D2)
 *
 * Adaptation note, per the relay's reuse rule. The probe closest to this is
 * `l7l-llama-attribution.cjs` — the only one that drives a real model load and samples main. It
 * cannot be adapted: it drives ONE load through `localAgent:plan` and stops at the plateau, and
 * the number D2 needs is a DIFFERENCE BETWEEN TWO CYCLES, each separated by the 5-minute idle
 * unload. `l7g-membisect*.cjs` own the private-bytes+handles sampler used verbatim below, but they
 * bisect a control cadence and never wait for an unload. So this is a new driver over a reused
 * sampler and a reused IPC entry point (`translateEnsureReady`, l7n's positive control).
 *
 * The claim under test, from `L7_PERF_DICTIONARY.md`: before the fix, handles went
 * 1,052 boot -> 4,378 cycle 1 -> 6,811 cycle 2, i.e. ~+2,425 PER CYCLE, with `llama.dispose()`
 * called every cycle. If one process-lifetime backend is the right answer, cycle 2 must cost
 * roughly nothing on top of cycle 1.
 *
 * CONTROLS, both required:
 *  - NEGATIVE: an idle window before anything is driven. Private and handles must be flat, or a
 *    later delta cannot be attributed to a load.
 *  - POSITIVE per cycle: the load must actually happen — `translate:status` reports `ready: true`
 *    at the plateau, and the unload must actually fire — `ready: false` at the settle point. A
 *    cycle whose load never became ready, or whose unload never fired, is VOID rather than 0.
 *
 * Requires a cold boot on a build that contains the fix. Main does not hot-reload.
 *
 *   node src/.coordination/liquid-workplace/probes/l7o-backend-cycles.cjs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const OUT = path.join(__dirname, 'l7o-backend-cycles.json');
const CYCLES = Number(process.env.L7O_CYCLES || 2);
/** IDLE_UNLOAD_MS is 5 min in `translate.ts`; this is that plus slack for the dispose itself. */
const UNLOAD_WAIT_MS = Number(process.env.L7O_UNLOAD_WAIT_MS || 6.5 * 60_000);
/**
 * The ADVERSE control for the context pool, added 2026-08-24 and the reason this probe did not
 * need to become a new file. `cd01ffbd` keeps the KV cache resident for 60 s after the 300 s idle
 * unload, so a gap under 360 s is free and a gap over it is not. One gap per run can only ever
 * measure one of those, and a fix that "works" at whatever gap the probe happens to use is exactly
 * the false pass this file's own trap 1 warns about. So the SECOND-TO-LAST cycle waits this
 * instead, which makes the last cycle a cold load that must cost what cycle 1 cost — in the same
 * session, on the same boot, with everything else identical.
 */
const CONTROL_GAP_MS = Number(process.env.L7O_CONTROL_GAP_MS || 0);
const LOAD_WAIT_MS = Number(process.env.L7O_LOAD_WAIT_MS || 90_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

/**
 * The pool's own answer to "are the weights still in this process right now".
 *
 * Added 2026-08-24 after the first run's headline number was uninterpretable. `translate:status`
 * reports the TRANSLATE MODULE's readiness, which goes false the moment its 5-minute idle timer
 * fires — but the weights outlive that by the pool's grace window, and the grace now doubles per
 * churned reload. So cycle 1 (grace 60 s, disposed at +360 s) and cycle 2 (grace 120 s, disposed
 * at +420 s) are sampled at the same +390 s and are in OPPOSITE residency states. Subtracting them
 * measures the sampling point, not the fix. `/mem` reports `llamaModelPoolStats()` since
 * `b4e4113b`; reading it here is what turns each row into a fact.
 */
async function poolState() {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/mem`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  const t = await r.json();
  // Top level, not nested — and `/mem` only runs a GC when the body says `gc:true`, so a bare GET
  // observes without perturbing the very number being sampled.
  const models = t?.llamaModels ?? null;
  // Two pools since `cd01ffbd`, and the second is the LARGER half of a cycle: the KV cache
  // measured +1,298.5 MB against a 1,223 MB model file. Sampled here because `privMB` alone
  // cannot tell "the cache was rebuilt" from "the weights were reloaded".
  const contexts = Array.isArray(t?.llamaContexts) ? t.llamaContexts : null;
  const ctx = contexts
    ? {
        ctxResident: contexts.length,
        ctxLeased: contexts.filter((c) => c.leased).length,
        ctxGraceMs: contexts.length ? contexts[0].graceMs : null,
        ctxSize: contexts.length ? contexts[0].contextSize : null,
      }
    : { ctxResident: null, ctxLeased: null, ctxGraceMs: null, ctxSize: null };
  if (!Array.isArray(models)) return { poolResident: null, poolLeases: null, poolGraceMs: null, poolAwaiting: null, ...ctx };
  const resident = models.filter((m) => m.resident);
  return {
    poolResident: resident.length,
    poolLeases: models.reduce((n, m) => n + (m.leases || 0), 0),
    poolGraceMs: models.length ? models[0].graceMs : null,
    poolAwaiting: models.filter((m) => m.awaitingRelease).length,
    ...ctx,
  };
}

/** Verbatim from `l7g-membisect2.cjs` — private bytes and handles off the live process. */
function sample() {
  const out = execFileSync('powershell', [
    '-NoProfile', '-Command',
    `$p=Get-Process -Id ${cfg.pid}; $p.Refresh(); '{0}|{1}|{2}' -f [math]::Round($p.PrivateMemorySize64/1MB,1), $p.HandleCount, [math]::Round($p.WorkingSet64/1MB,1)`,
  ], { encoding: 'utf8' }).trim().split('|');
  return { privMB: Number(out[0]), handles: Number(out[1]), rssMB: Number(out[2]) };
}

/**
 * `translate:status` is the product's own readiness answer, so "the model is resident" is read
 * from the module that owns it rather than inferred from a memory delta.
 */
const STATUS = `(window.api.translateStatus().then(s => { window.__l7o = JSON.stringify(s); }), 'sent')`;
const READ_STATUS = `window.__l7o || 'pending'`;
const START_LOAD = `(window.api.translateEnsureReady().then(r => { window.__l7oLoad = JSON.stringify(r); }), 'sent')`;
const READ_LOAD = `window.__l7oLoad || 'pending'`;

async function status() {
  await ev(`(delete window.__l7o, 'cleared')`);
  await ev(STATUS);
  for (let i = 0; i < 20; i += 1) {
    await sleep(250);
    const raw = await ev(READ_STATUS);
    if (raw !== 'pending') return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  throw new Error('translate:status never answered');
}

const rows = [];
async function mark(label, extra) {
  const m = sample();
  const pool = await poolState();
  const prev = rows.length ? rows[rows.length - 1] : null;
  const row = {
    label,
    ...m,
    ...pool,
    dPriv: prev ? Number((m.privMB - prev.privMB).toFixed(1)) : 0,
    dHandles: prev ? m.handles - prev.handles : 0,
    at: new Date().toISOString(),
    ...(extra || {}),
  };
  rows.push(row);
  console.log(
    `${String(label).padEnd(34)} priv ${String(row.privMB).padStart(9)} MB (${row.dPriv >= 0 ? '+' : ''}${row.dPriv})  ` +
    `handles ${String(row.handles).padStart(6)} (${row.dHandles >= 0 ? '+' : ''}${row.dHandles})` +
    `  model=${row.poolResident}/${row.poolGraceMs}  ctx=${row.ctxResident}/${row.ctxGraceMs}` +
    (extra && extra.ready !== undefined ? `  ready=${extra.ready}` : ''),
  );
  return row;
}

async function main() {
  const boot = await status();
  console.log(`pid ${cfg.pid}, modelFound=${boot.modelFound}, ready=${boot.ready}`);
  if (!boot.modelFound) throw new Error('VOID: no GGUF installed, so no cycle can load one');
  if (boot.ready) throw new Error('VOID: the model is already resident — this needs a cold boot');

  await mark('boot baseline', { ready: boot.ready });
  // NEGATIVE CONTROL — 45 s with nothing driven.
  await sleep(45_000);
  const idle = await mark('CONTROL idle 45s (nothing driven)', { ready: (await status()).ready });

  const cycles = [];
  for (let c = 1; c <= CYCLES; c += 1) {
    await ev(`(delete window.__l7oLoad, 'cleared')`);
    await ev(START_LOAD);
    let loadResult = 'pending';
    const loadDeadline = Date.now() + LOAD_WAIT_MS;
    while (Date.now() < loadDeadline) {
      await sleep(2_000);
      loadResult = await ev(READ_LOAD);
      if (loadResult !== 'pending') break;
    }
    const ready = (await status()).ready;
    const plateau = await mark(`cycle ${c} load plateau`, { ready, loadResult });
    if (!ready) throw new Error(`VOID: cycle ${c} never became ready (${loadResult})`);

    const gap = CONTROL_GAP_MS && c === CYCLES - 1 ? CONTROL_GAP_MS : UNLOAD_WAIT_MS;
    console.log(`  waiting ${Math.round(gap / 1000)}s for the idle unload…${gap === CONTROL_GAP_MS ? ' (ADVERSE control gap)' : ''}`);
    await sleep(gap);
    const settledReady = (await status()).ready;
    const settled = await mark(`cycle ${c} settled after unload`, { ready: settledReady });
    if (settledReady) throw new Error(`VOID: cycle ${c}'s idle unload never fired`);

    cycles.push({
      cycle: c,
      plateauPrivMB: plateau.privMB,
      plateauHandles: plateau.handles,
      settledPrivMB: settled.privMB,
      settledHandles: settled.handles,
      // Without these two a settled row cannot be compared with any other settled row.
      settledPoolResident: settled.poolResident,
      settledGraceMs: settled.poolGraceMs,
      // The context pool's own discriminator. `settledCtxResident` at cycle N decides whether
      // cycle N+1 could possibly have been free, and it is read rather than inferred.
      gapMs: gap,
      settledCtxResident: settled.ctxResident,
      settledCtxGraceMs: settled.ctxGraceMs,
      plateauCtxResident: plateau.ctxResident,
      // Did this cycle load at all? A reacquire inside the grace window is a cache hit and costs
      // nothing — which is the fix working, not a cycle that failed to run.
      loadedFromCold: plateau.dHandles > 500,
    });
  }

  const base = rows[0];
  const verdict = {
    pid: cfg.pid,
    bootPrivMB: base.privMB,
    bootHandles: base.handles,
    idleControlFlat: Math.abs(idle.dPriv) < 25 && Math.abs(idle.dHandles) < 100,
    idleDeltaPrivMB: idle.dPriv,
    idleDeltaHandles: idle.dHandles,
    cycles,
    // The headline: what a SECOND cycle costs on top of the first.
    handlesAddedByCycle2: cycles.length > 1 ? cycles[1].settledHandles - cycles[0].settledHandles : null,
    privAddedByCycle2MB: cycles.length > 1
      ? Number((cycles[1].settledPrivMB - cycles[0].settledPrivMB).toFixed(1))
      : null,
    /**
     * The comparison that is actually sound: handles added at each cycle's PLATEAU, which is the
     * same residency state every time (weights in, lease held). `handlesAddedByCycle2` above
     * compares settled rows in different residency states and is retained only because the
     * pre-fix table it is scored against was collected that way.
     */
    plateauDeltas: cycles.slice(1).map((cy, i) => ({
      cycle: cy.cycle,
      vsPrevPlateauHandles: cy.plateauHandles - cycles[i].plateauHandles,
      vsPrevPlateauPrivMB: Number((cy.plateauPrivMB - cycles[i].plateauPrivMB).toFixed(1)),
      loadedFromCold: cy.loadedFromCold,
    })),
    beforeFix: { bootHandles: 1052, cycle1Handles: 4378, cycle2Handles: 6811, perCycle: 2425 },
    rows,
  };
  fs.writeFileSync(OUT, JSON.stringify(verdict, null, 2));
  console.log(`\nidle control flat: ${verdict.idleControlFlat} (Δpriv ${verdict.idleDeltaPrivMB} MB, Δhandles ${verdict.idleDeltaHandles})`);
  console.log(`cycle 2 added: ${verdict.handlesAddedByCycle2} handles, ${verdict.privAddedByCycle2MB} MB (before the fix: +2,433)`);
  for (const d of verdict.plateauDeltas) {
    console.log(`plateau ${d.cycle} vs ${d.cycle - 1}: ${d.vsPrevPlateauHandles >= 0 ? '+' : ''}${d.vsPrevPlateauHandles} handles, ${d.vsPrevPlateauPrivMB} MB, loadedFromCold=${d.loadedFromCold}`);
  }
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err.message);
  fs.writeFileSync(OUT, JSON.stringify({ error: err.message, rows }, null, 2));
  process.exit(1);
});
