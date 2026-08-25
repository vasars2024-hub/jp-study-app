/**
 * L1 driver — rubric category 5's **Q9**, *"all pre-migration features reachable and functional"*.
 *
 * WHY THIS FILE EXISTS. `l1-ui-clarity.js` answered Q9 with the string literal `'INHERIT'` and the
 * note *"no migration has occurred"*. Both were true when they were written and are now false:
 * L3.2 shipped `Make Liquid` on this window and L6 closed all seven dictionary rows of
 * `parity-ledger.json` to `both`. The 2026-08-24 clarity run nevertheless reported Q9
 * `NOT EARNABLE` on *"parity-ledger.json still 0 of 7 rows both"* — a number the probe never
 * computed, because the literal cannot compute anything. **A hardcoded verdict does not become
 * wrong when the product changes; it stays exactly as wrong as it was, and reads as a measurement.**
 * That is the same false-pass shape as the selector that matched nothing, pointed the other way.
 *
 * WHAT MAKES THIS A MEASUREMENT AND NOT A DOCUMENT READ. The rubric forbids scoring from source.
 * The ledger is not source — it is the recorded output of the category-6 instrument — but an
 * inherited record is stale by definition the moment the tree moves. So the driver requires BOTH
 * terms and fails if they disagree:
 *
 *   1. the ledger's `dictionary` rows are all `both` **and** each carries a non-empty `observed`
 *      (the ledger's own rule: "a row with no `observed` is explicitly not proven"); and
 *   2. `window.__L6.check()` re-run **live at this tree** still reports every row `reachable`.
 *
 * A row that the ledger claims and the live check denies is a REGRESSION and scores NO, which is
 * the entire point of not trusting the file alone.
 *
 * THE CONTROL. `--control <row>` uses L6's own `mutate()` to remove exactly one feature, so the
 * live term must drop and Q9 must read NO while the ledger still says `both`. That is the
 * disagreement case above, induced on purpose. A control run **never parks a verdict** — a planted
 * failure must not be able to reach a score — and the driver asserts that in its own output.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l1-q9-drive.cjs [--control notesFilter]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const LEDGER = 'src/.coordination/liquid-workplace/parity-ledger.json';
const PROBE = 'src/.coordination/liquid-workplace/probes/l6-parity-dictionary.js';
const RUNNER = 'src/.coordination/liquid-workplace/probes/l6m-parity-run.cjs';

/**
 * WHICH SURFACE (`--app dictionary|mediaCenter`, default `dictionary`).
 *
 * Q9 is a per-surface question and this driver was hardcoded to one surface, so scoring Q9 on
 * Video meant reading the Dictionary's rows — the same class of error as a probe hardcoded to
 * `.dict-entry`, which refused on the Media Center and read like a product finding.
 *
 * THE TWO SURFACES NEED DIFFERENT LIVE TERMS, and that is not a shortcut. `__L6.check()`
 * answers all seven dictionary rows on its own. `__L6M.check()` answers only five of eight —
 * `librarySearch`, `itemActions` and `workspaceRoute` come back `not driven`, because a row
 * whose claim is "the feature still works" cannot be settled by counting a control. So the
 * mediaCenter leg delegates to `l6m-parity-run.cjs`, which drives those three with real sleeps
 * between steps AND reads both presentations. Delegating rather than re-implementing is the
 * `l1-q7-guards.cjs` rule: a guard that reimplements the term certifies its copy, not the term.
 */
const ai = process.argv.indexOf('--app');
const APP = (process.argv.find((a) => a.startsWith('--app=')) || '').split('=')[1]
  || (ai >= 0 ? process.argv[ai + 1] : '')
  || 'dictionary';
if (APP !== 'dictionary' && APP !== 'mediaCenter') {
  throw new Error(`unknown --app ${APP}; expected dictionary or mediaCenter`);
}
const NS = APP === 'mediaCenter' ? '__L6M' : '__L6';

const ci = process.argv.indexOf('--control');
const CONTROL = ci >= 0
  ? process.argv[ci + 1] || (APP === 'mediaCenter' ? 'railNav' : 'notesFilter')
  : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  // The bridge returns `result: null` for an expression that THREW as well as for one that
  // returned null, so a null here is never quietly treated as an answer.
  if (t.result === null) throw new Error('eval returned null — the expression threw or returned nothing');
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

(async () => {
  const out = { at: new Date().toISOString(), control: CONTROL };

  // --- Term 1: the recorded ledger, scoped to this surface's app -------------------------------
  const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const rows = ledger.rows.filter((r) => r.app === APP);
  const both = rows.filter((r) => r.status === 'both');
  const observed = rows.filter((r) => typeof r.observed === 'string' && r.observed.trim().length > 0);
  out.ledger = {
    file: path.basename(LEDGER),
    app: APP,
    rowsForApp: rows.length,
    rowsTotal: ledger.rows.length,
    both: both.length,
    withObserved: observed.length,
    notBoth: rows.filter((r) => r.status !== 'both').map((r) => `${r.feature} = ${r.status}`),
    ok: rows.length > 0 && both.length === rows.length && observed.length === rows.length,
  };

  // --- Term 2: the same rows re-driven live at this tree ---------------------------------------
  // The bridge evaluates ONE EXPRESSION. `l6-parity-dictionary.js` ends `})();\n`, and that
  // trailing semicolon makes it a statement — the bridge answers "Script failed to execute",
  // which reads like a broken probe rather than a punctuation problem.
  out.install = await ev(fs.readFileSync(PROBE, 'utf8').trim().replace(/;$/, ''));
  if (CONTROL) {
    out.mutated = await ev(`JSON.stringify(window.${NS}.mutate(${JSON.stringify(CONTROL)}))`);
    await sleep(150);
  }

  if (APP === 'mediaCenter') {
    // The runner computes its `parity` from the two `check()` calls it makes BEFORE its own
    // `restore()`, so a mutation planted above is still in force for the numbers it reports.
    const ran = await new Promise((resolve, reject) => {
      execFile(process.execPath, [RUNNER], { cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 },
        (err, stdout) => {
          // A NOT-PARITY run exits 1 on purpose — that is a result, not a crash, and it is
          // exactly what the control run expects to see.
          try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error(`${RUNNER}: ${String(err || e).slice(0, 300)}`)); }
        });
    });
    const parity = ran.parity || [];
    const broken = parity.filter((r) => !(r.standard && r.liquid && r.equal));
    out.live = {
      refused: null,
      via: 'l6m-parity-run.cjs (driven, both presentations)',
      rows: parity.length,
      reachable: parity.filter((r) => r.standard && r.liquid).length,
      unreachable: broken.map((r) => `${r.id} (standard=${r.standard} liquid=${r.liquid})`),
      evidence: Object.fromEntries(parity.map((r) => [r.id, r.evidence])),
      ok: parity.length > 0 && broken.length === 0,
    };
  } else {
    const live = await ev(`JSON.stringify(window.${NS}.check())`);
    const liveRows = live.rows || [];
    const unreachable = liveRows.filter((r) => !r.reachable);
    out.live = {
      refused: live.refused || null,
      via: `window.${NS}.check()`,
      rows: liveRows.length,
      reachable: liveRows.filter((r) => r.reachable).length,
      unreachable: unreachable.map((r) => `${r.id} (${r.evidence})`),
      ok: !live.refused && liveRows.length > 0 && unreachable.length === 0,
    };
  }
  if (CONTROL) out.restored = await ev(`JSON.stringify(window.${NS}.restore())`);

  // --- The verdict, and it needs both terms ----------------------------------------------------
  const agree = out.ledger.rowsForApp === out.live.rows;
  out.verdict = out.ledger.ok && out.live.ok && agree ? 'YES' : 'NO';
  out.why = !agree
    ? `ledger has ${out.ledger.rowsForApp} rows for ${APP}, the live check reports ${out.live.rows} — the two terms are not measuring the same set`
    : !out.ledger.ok
      ? `ledger: ${out.ledger.both}/${out.ledger.rowsForApp} both, ${out.ledger.withObserved}/${out.ledger.rowsForApp} with observed`
      : !out.live.ok
        ? `live: ${out.live.unreachable.length} row(s) unreachable at this tree — ${out.live.unreachable.join('; ')}`
        : `${out.ledger.both}/${out.ledger.rowsForApp} ledger rows both with observed, and ${out.live.reachable}/${out.live.rows} reachable live`;

  if (CONTROL) {
    // A control run parks nothing. If it did, a planted failure could reach a score.
    out.parked = false;
    out.controlHeld = out.verdict === 'NO';
    out.controlNote = out.controlHeld
      ? `control '${CONTROL}' made Q9 read NO while the ledger still says both — the live term is doing work`
      : `CONTROL DID NOT FAIL: Q9 still ${out.verdict}. Per the rubric this VOIDS the score rather than earning it.`;
  } else {
    // One global per surface. Parking both surfaces on `__q9verdict` would mean whichever ran
    // last decided Q9 for the other one — a cross-surface false pass, and the clarity probe
    // has no way to notice.
    const slot = APP === 'mediaCenter' ? '__q9verdictMedia' : '__q9verdict';
    const body = JSON.stringify({ verdict: out.verdict, why: out.why, app: APP, ledger: out.ledger, live: out.live });
    out.parkedOn = slot;
    out.parked = await ev(
      `(() => { window.${slot} = ${body}; return JSON.stringify({ parked: window.${slot}.verdict }); })()`,
    );
  }

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(
    `src/.coordination/liquid-workplace/baselines/l1-q9-${APP}-${CONTROL ? `control-${CONTROL}` : 'run'}.json`,
    JSON.stringify(out, null, 1),
  );
})().catch(async (e) => {
  console.error('DRIVER FAILED', e.message);
  try {
    console.error('RESTORE', JSON.stringify(await ev('JSON.stringify(window.${NS}.restore())')));
  } catch {
    /* the window may be gone; every mutation this driver makes is DOM-only */
  }
  process.exit(1);
});
