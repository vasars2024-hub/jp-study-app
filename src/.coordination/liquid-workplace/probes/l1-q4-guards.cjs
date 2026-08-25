/**
 * L1 guards for rubric category 5's **Q4** clutter term.
 *
 * Q4 was scored NO on `chromeControls = 22` against a bar of 12. The term has been redefined to
 * *controls scanned in the default state* — `chromeControls` minus the contents of any `details`
 * and minus the `summary` headers — which reads **11** and turns the NO into a YES. **A
 * redefinition that flips a score is exactly the move that needs its own controls**, or it is
 * indistinguishable from moving the bar until the surface passes.
 *
 * So two guards, and the score is void without both.
 *
 * GUARD 1 — `invariance`. The whole complaint against the old term was that it counted the
 * contents of an OPEN disclosure, making the number depend on whether an earlier probe clicked a
 * drawer. So the new term is re-counted with every disclosure forced **closed** and again forced
 * **open**. If it moves, the definition is still measuring drawer state and is still wrong. The
 * drawers are restored to exactly the open/closed set they were found in.
 *
 * GUARD 2 — `control`. Real top-level controls are planted OUTSIDE any `details` and outside the
 * result rows — the shape the term is supposed to catch — and the count must cross 12 and flip Q4
 * to NO. A term that cannot be pushed over its own bar is not measuring anything. The plants are
 * removed and the count must return.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l1-q4-guards.cjs
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const CLARITY = 'src/.coordination/liquid-workplace/probes/l1-ui-clarity.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  if (t.result === null) throw new Error('eval returned null — the expression threw');
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

/**
 * WHICH WINDOW, AND WHY IT IS AN ARGUMENT (2026-08-25 repair). Every selector below took
 * `document.querySelector('.fwin')` or "the first scored window" — DOM order, not the surface
 * under test, and not even necessarily a VISIBLE one. On a desktop carrying Media, Video and
 * Dictionary it read and planted into **Media** while reporting a Video score, which is the
 * `probe-picks-first-visible-fwin` failure `l1-q78-drive.cjs` and `l1-q6-guards.cjs` were both
 * already repaired for. It went unnoticed because Media and Video render the same surface, so
 * the numbers agreed; they would not on any other pair.
 */
const TITLE = process.argv[2] || 'Video';

const WIN = `([].slice.call(document.querySelectorAll('.fwin')).filter(function (w) {
  var r = w.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  var t = w.querySelector('.fwin-title-text, .fwin-title');
  return !!t && (t.textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0;
})[0])`;

/** Q4's numbers only, read through the real clarity probe so the guard scores what the score does. */
async function readQ4() {
  const src = fs.readFileSync(CLARITY, 'utf8').trim().replace(/;$/, '');
  const out = await ev(src);
  const scored = (out.windows || []).filter((w) => (w.questions || []).length);
  const win = scored.find((w) => String(w.label).includes(TITLE));
  if (!win) throw new Error(`no scored .fwin titled ${TITLE}; saw ${scored.map((w) => w.label).join(', ') || 'none'}`);
  const q4 = win.questions.find((q) => q.id === 4);
  return { label: win.label, verdict: q4.verdict, ...q4.numbers };
}

const SET_DRAWERS = (open) => `(() => {
  const win = ${WIN};
  const ds = [...win.querySelectorAll('details')];
  if (!window.__q4drawers) window.__q4drawers = ds.map((d) => d.open);
  ds.forEach((d) => { d.open = ${open}; });
  return JSON.stringify({ n: ds.length, open: ds.filter((d) => d.open).length });
})()`;

const RESTORE_DRAWERS = `(() => {
  const win = ${WIN};
  const ds = [...win.querySelectorAll('details')];
  const was = window.__q4drawers;
  if (!was) return JSON.stringify({ restored: false, why: 'nothing captured' });
  ds.forEach((d, i) => { if (i < was.length) d.open = was[i]; });
  window.__q4drawers = null;
  return JSON.stringify({ restored: true, open: ds.filter((d) => d.open).length, of: ds.length });
})()`;

/** Plant N real top-level controls: outside every `details`, outside the result rows. */
const PLANT = (n) => `(() => {
  const win = ${WIN};
  const head = win.querySelector('.view-head') || win.querySelector('.fwin-body');
  document.querySelectorAll('.l1-q4-plant').forEach((x) => x.remove());
  for (let i = 0; i < ${n}; i += 1) {
    const b = document.createElement('button');
    b.className = 'l1-q4-plant btn';
    b.textContent = 'Planted tool ' + (i + 1);
    head.append(b);
  }
  return JSON.stringify({
    planted: document.querySelectorAll('.l1-q4-plant').length,
    insideDetails: [...document.querySelectorAll('.l1-q4-plant')].filter((b) => b.closest('details')).length,
    insideRow: [...document.querySelectorAll('.l1-q4-plant')].filter((b) => b.closest('.dict-entry')).length,
  });
})()`;

const UNPLANT = `(() => {
  const before = document.querySelectorAll('.l1-q4-plant').length;
  document.querySelectorAll('.l1-q4-plant').forEach((x) => x.remove());
  return JSON.stringify({ before, remaining: document.querySelectorAll('.l1-q4-plant').length });
})()`;

(async () => {
  const out = { at: new Date().toISOString() };

  out.asFound = await readQ4();

  // --- Guard 1: the term must not move with drawer state --------------------------------------
  out.drawersClosed = await ev(SET_DRAWERS(false));
  await sleep(250);
  out.closed = await readQ4();
  out.drawersOpen = await ev(SET_DRAWERS(true));
  await sleep(250);
  out.open = await readQ4();
  out.drawersRestored = await ev(RESTORE_DRAWERS);
  await sleep(250);

  out.invariance = {
    scannedClosed: out.closed.scannedControls,
    scannedOpen: out.open.scannedControls,
    invariant: out.closed.scannedControls === out.open.scannedControls,
    // The OLD term, reported next to it, is what the invariance is being contrasted against.
    oldTermClosed: out.closed.chromeControlsRaw,
    oldTermOpen: out.open.chromeControlsRaw,
    oldTermInvariant: out.closed.chromeControlsRaw === out.open.chromeControlsRaw,
  };

  // --- Guard 2: the term must be pushable over its own bar ------------------------------------
  const need = Math.max(1, 13 - out.asFound.scannedControls);
  out.planted = await ev(PLANT(need));
  await sleep(250);
  out.withPlants = await readQ4();
  out.unplanted = await ev(UNPLANT);
  await sleep(250);
  out.afterUnplant = await readQ4();

  out.control = {
    plantedTopLevel: need,
    scannedBefore: out.asFound.scannedControls,
    scannedWithPlants: out.withPlants.scannedControls,
    verdictWithPlants: out.withPlants.verdict,
    held: out.withPlants.verdict === 'NO' && out.withPlants.scannedControls > 12,
    countReturned: out.afterUnplant.scannedControls === out.asFound.scannedControls,
    verdictReturned: out.afterUnplant.verdict === out.asFound.verdict,
  };

  out.q4 = {
    verdict: out.afterUnplant.verdict,
    valid: out.invariance.invariant && out.control.held && out.control.countReturned,
    why: !out.invariance.invariant
      ? 'VOID — the term still moves with drawer state, so it is still measuring drawer state'
      : !out.control.held
        ? 'VOID — the control did not push the term over its own bar; per the rubric this voids the score rather than earning it'
        : !out.control.countReturned
          ? 'VOID — the count did not return after the plants were removed; the surface was damaged'
          : `scanned ${out.afterUnplant.scannedControls} <= 12 with ${out.afterUnplant.collapsedDisclosures} collapsed disclosures, invariant to drawer state, and the control flipped it to NO at ${out.withPlants.scannedControls}`,
  };

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync('src/.coordination/liquid-workplace/baselines/l1-q4-guards.json', JSON.stringify(out, null, 1));
})().catch(async (e) => {
  console.error('GUARD FAILED', e.message);
  try {
    console.error('CLEANUP', JSON.stringify(await ev(UNPLANT)), JSON.stringify(await ev(RESTORE_DRAWERS)));
  } catch {
    /* the window may be gone; every mutation here is DOM-only */
  }
  process.exit(1);
});
