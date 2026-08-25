/**
 * L6 runner — the **Media Center**'s eight `parity-ledger.json` rows, driven in BOTH
 * presentations at this tree.
 *
 * `window.__L6M.check()` alone answers only five of the eight: `librarySearch`, `itemActions`
 * and `workspaceRoute` come back `not driven`, because a row whose whole claim is "the feature
 * still works" cannot be answered by counting a control. Those three need `__L6M.step()`
 * sequences with a real sleep between each, which a single `/eval` cannot do — hence a runner.
 *
 * WHY IT EXISTS NOW. `feat(media)` moved three of these rows' routes: the section rail's
 * secondary destinations and the workspace launcher now sit behind `details.mc-nav-group`, and
 * sort/view behind `details.medialib-view`. **A parity ledger whose `currentRoute` points at a
 * path the product no longer has is worse than no ledger** — it reads as proof while describing
 * a surface that is gone. So the routes are re-derived here rather than edited from memory.
 *
 * BOTH PRESENTATIONS WITHOUT TOGGLING ANYTHING. `findMediaWin(pres)` selects by
 * `data-presentation`, and this desktop happens to carry Media in standard and Video in liquid,
 * so each leg reads a real window in that presentation. Nothing is toggled and nothing is left
 * changed — the run asserts its own restore.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l6m-parity-run.cjs
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const PROBE = 'src/.coordination/liquid-workplace/probes/l6-parity-dictionary.js';
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

const step = (name, pres, arg) =>
  ev(`JSON.stringify(window.__L6M.step(${JSON.stringify(name)}, ${JSON.stringify(pres)}, ${arg === undefined ? 'undefined' : JSON.stringify(arg)}))`);
const check = (pres) => ev(`JSON.stringify(window.__L6M.check(${JSON.stringify(pres)}))`);

async function leg(pres) {
  const out = { presentation: pres, driven: {} };

  // --- librarySearch: the grid must NARROW on a term that matches nothing, and come back. ----
  out.driven.searchTyped = await step('search:type', pres, 'zzqqxx-no-such-title');
  await sleep(900);
  out.driven.searchRead = await step('search:read', pres);
  out.driven.searchCleared = await step('search:clear', pres);
  await sleep(900);
  out.driven.searchRestored = await step('search:restored', pres);

  // --- itemActions: the card menu opens and closes. `mousedown` on window, capture. ---------
  out.driven.menuOpen = await step('menu:open', pres);
  await sleep(500);
  out.driven.menuRead = await step('menu:read', pres);
  out.driven.menuClose = await step('menu:close', pres);
  await sleep(500);
  out.driven.menuClosed = await step('menu:closed', pres);

  // --- workspaceRoute: the enable has its disable — the invariant this row exists for. ------
  out.driven.wsOpen = await step('ws:open', pres);
  await sleep(1400);
  out.driven.wsRead = await step('ws:read', pres);
  out.driven.wsClose = await step('ws:close', pres);
  await sleep(1400);
  out.driven.wsClosed = await step('ws:closed', pres);

  out.check = await check(pres);
  return out;
}

(async () => {
  const out = { at: new Date().toISOString() };
  const src = fs.readFileSync(PROBE, 'utf8').trim().replace(/;$/, '');
  const install = await ev(src);
  out.installed = install.installedMedia;

  out.standard = await leg('standard');
  await sleep(600);
  out.liquid = await leg('liquid');

  out.restore = await ev(`JSON.stringify(window.__L6M.restore())`);
  await sleep(400);
  out.afterRestore = { standard: await check('standard'), liquid: await check('liquid') };

  const rowsOf = (c) => Object.fromEntries((c.rows || []).map((r) => [r.id, r]));
  const S = rowsOf(out.standard.check);
  const L = rowsOf(out.liquid.check);
  const ids = Object.keys(S);

  out.parity = ids.map((id) => ({
    id,
    standard: S[id] && S[id].reachable,
    liquid: L[id] && L[id].reachable,
    equal: !!(S[id] && L[id]) && S[id].reachable === L[id].reachable,
    evidence: { standard: S[id] && S[id].evidence, liquid: L[id] && L[id].evidence },
  }));

  const reachableBoth = out.parity.filter((r) => r.standard && r.liquid).length;
  const unequal = out.parity.filter((r) => !r.equal).map((r) => r.id);

  out.verdict = unequal.length === 0 && reachableBoth === ids.length
    ? `Media Center parity: ${reachableBoth} of ${ids.length} rows reachable in BOTH presentations, 0 unequal`
    : `NOT PARITY: ${reachableBoth} of ${ids.length} reachable in both; unequal rows: ${unequal.join(', ') || 'none'}`;

  console.log(JSON.stringify(out, null, 1));
  if (unequal.length || reachableBoth !== ids.length) process.exitCode = 1;
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
