/**
 * RUBRIC CATEGORY 6 HARNESS — "feature parity and reversibility", parameterised by surface.
 *
 * The browser half already existed: `l6-parity.js` installs `window.__LQP` with one SPEC per
 * app and is itself a consolidation of `l6-parity-dictionary.js`. What did NOT exist was the
 * node half — the protocol that actually earns the category's three numbers. It was spread
 * across three single-use runners, each hardcoding one app:
 *
 *   l6f-roundtrip.cjs   Liquid -> Standard -> Liquid, notes filter dirtied, `__L6` only
 *   l6f-controls.cjs    the three `__L6` mutations, "7 -> 6" written as a literal
 *   l6m-parity-run.cjs  the Media Center's eight rows, `__L6M`, both presentations
 *
 * This file is those three with every app-specific name removed. `--app` is the only thing
 * that changes between surfaces, and the counts are derived from the spec rather than typed in.
 *
 * WHAT THE RUBRIC ASKS FOR, and where each number comes from:
 *   "features reachable in Standard vs. reachable in Liquid (must be equal)"
 *       -> `parity`, from `__LQP.check()` run in BOTH presentations on the same window.
 *   "ledger rows closed vs. total"
 *       -> `rows`, counted from the spec's own feature list; `na` rows (a chromeless host has
 *          no window chrome) are excluded from the denominator rather than scored false.
 *   "the round-trip diff of app data across Standard -> Liquid -> Standard"
 *       -> `roundTrip`, a byte-for-byte JSON compare of `__LQP.snapshot()` before and after,
 *          with a field deliberately dirtied first so the trip has real state to lose.
 *   negative control
 *       -> every mutation the spec declares, each of which must flip EXACTLY its own row.
 *
 * Traps this encodes, all previously paid for:
 *  - `/eval` IS SYNCHRONOUS and takes one expression. Every React re-render is read by a
 *    LATER call, so each leg is its own POST with a real sleep between.
 *  - A TOGGLE IS NOT A SET. `toggleLiquid` flips; the driver reads the presentation back and
 *    refuses if it did not land, rather than scoring the wrong presentation.
 *  - PRESENTATION IS PERSISTED STATE. Whatever this drives, it restores in `finally`.
 *  - THE ROUND TRIP MUST START AND END IN THE SAME PRESENTATION or A === C is meaningless.
 *  - A CONTROL THAT FAILS AN UNDECLARED SECOND ROW PROVES NEITHER. The mutation's own row
 *    must fall, and nothing beyond the cascade its spec declares — never "some row moved".
 *  - THE DIRTY GOES BEFORE THE DRIVE. Typing fires React `onChange`, and a handler that
 *    clears selection state erases what the drive just established (Translate does exactly
 *    this); dirtying after the drive scored a live row dead.
 *  - `document.hasFocus()` gates React's select synthesis, so `/focus` is POSTed before any
 *    step runs (`l6-parity.js` trap 6 refuses instead of lying, and this is how it is fed).
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/cat6-feature-parity.cjs \
 *     --app dictionary [--win main] [--label l6-dictionary] [--out file] [--no-control]
 *   node src/.coordination/liquid-workplace/probes/cat6-feature-parity.cjs --list
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.indexOf(`--${name}`) >= 0;

const APP = arg('app', '');
const WIN = arg('win', '');
const OUT = arg('out', '');
const LIST = has('list');
const CONTROL = !has('no-control');
const LABEL = arg('label', APP ? `l6-${APP}` : 'list');
const STEP_MS = Number(arg('step-ms', '700'));

const cfg = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'debug', 'bridge.json'),
  'utf8',
));
const engine = fs.readFileSync(path.join(__dirname, 'l6-parity.js'), 'utf8')
  .replace(/\s*;\s*$/, '')
  .trimEnd();
const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function post(route, body) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ ...(WIN ? { window: WIN } : {}), ...(body || {}) }),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { raw: t, status: r.status }; }
}

async function ev(js) {
  const t = await post('/eval', { js: js.replace(/\s*;\s*$/, '').trimEnd() });
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 400)}`);
  return t.result;
}

/** Every `__LQP` entry point returns an object; the bridge only carries strings. */
const call = async (expr) => JSON.parse(await ev(`JSON.stringify(${expr})`));

const A = (v) => JSON.stringify(v);

/**
 * Dirty one real field so the round trip has something to lose, then put it back.
 *
 * Generic on purpose. `l6f-roundtrip.cjs` hunted for a "notes" placeholder, which is one
 * app's field; this takes the first visible text field the surface actually has. A surface
 * with none is recorded as `null` and the round trip is reported as carrying no user-entered
 * state — which is a weaker result, and says so, rather than a silent pass.
 */
const DIRTY_MARK = 'lqp-roundtrip-食';
async function dirtyField(pres) {
  return call(`(function(){
    var w = window.__LQP.__win(${A(APP)}, ${A(pres)});
    if (!w) return { refused: 'surface gone before dirtying' };
    // The shell CONTAINS the windows it hosts, so an unscoped query dirties a hosted app's
    // search box and then compares it across a trip that legitimately re-renders it. The
    // shell's own fields are the ones outside every .fwin -- and NO BACKTICK may appear in
    // this comment, because it sits inside a template literal (harness trap 2).
    var all = [].slice.call(w.querySelectorAll('input,textarea')).filter(function(x){
      return !w.classList.contains('os-desktop') || !x.closest('.fwin');
    });
    var el = all.filter(function(x){
      var b = x.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && !x.disabled && !x.readOnly
        && (x.tagName === 'TEXTAREA' || !x.type || /^(text|search)$/i.test(x.type));
    })[0];
    if (!el) return { field: null, note: 'surface has no editable text field' };
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    var was = el.value;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${A(DIRTY_MARK)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { field: (el.className || el.tagName).split(' ')[0], was: was, now: el.value };
  })()`);
}

async function undirtyField(pres, was) {
  if (was === undefined || was === null) return { skipped: true };
  return call(`(function(){
    var w = window.__LQP.__win(${A(APP)}, ${A(pres)});
    if (!w) return { refused: 'surface gone before cleaning' };
    var el = [].slice.call(w.querySelectorAll('input,textarea')).filter(function(x){
      return x.value === ${A(DIRTY_MARK)};
    })[0];
    if (!el) return { refused: 'dirtied field not found — value may have been consumed' };
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${A(was)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { now: el.value };
  })()`);
}

/**
 * Raise by taskbar button, never by pointerdown on the frame (that fires edge-snap).
 *
 * The window is resolved through the SPEC (`__win`), not by re-querying the title.
 * Corrected 2026-08-31: the title query returned nothing for a frameless window — City
 * renders no `.fwin-title-text` at all — so the open, on-top window read as "not open" and
 * this clicked the taskbar button to "open" it. The taskbar button is a TOGGLE, so that
 * click MINIMISED the surface and every subsequent measurement would have run against a
 * `display: none` window.
 */
async function raise(titleRe) {
  const r = await ev(`(function(){
    var re = new RegExp(${A(titleRe)}, 'i');
    var b = [].slice.call(document.querySelectorAll('.os-task-win')).filter(function(x){
      return re.test(x.getAttribute('title') || ''); })[0];
    if (!b) return 'no-taskbar-button';
    var w = window.__LQP.__win(${A(APP)});
    if (w && !w.classList.contains('fwin')) w = w.closest('.fwin');
    if (!w) { b.click(); return 'opened'; }
    var hidden = getComputedStyle(w).display === 'none';
    var zs = [].slice.call(document.querySelectorAll('.fwin')).map(function(x){
      return Number(getComputedStyle(x).zIndex) || 0; });
    var onTop = (Number(getComputedStyle(w).zIndex) || 0) >= Math.max.apply(null, zs);
    if (hidden || !onTop) { b.click(); return hidden ? 'restored' : 'raised'; }
    return 'already-on-top';
  })()`);
  await post('/focus', {});
  await sleep(300);
  return r;
}

/**
 * ---------------------------------------------------------------- the no-Liquid host
 *
 * Correction 24, 2026-08-31. `canPresentLiquid` refuses sections `city` and `visualizer`
 * outright, so those windows render no Make Liquid control and there is no
 * Standard -> Liquid -> Standard trip to take. Left alone this file threw on the first
 * `flip()` and category 6 was simply unreachable on L9's second RULE C surface.
 *
 * Scoring such a surface 10/10 because nothing could be measured is the empty-harness
 * false pass the rubric caps at 0, so the parity bar is REPLACED rather than waived, by
 * two things that are both real:
 *
 *   1. `liquidAbsenceProved` — a DISCRIMINATING control, not an assertion. The identical
 *      `.fwin-b-liquid` query is run over every open window at the same moment: at least
 *      one other window must render the control and this one must not. With no such
 *      neighbour the run REFUSES, because then the absence is equally explained by an app
 *      that renders the affordance nowhere — which is a defect, and is exactly the shape
 *      of the 2026-08-17 visualizer finding.
 *   2. `roundTripHeld` — measured over the reversible transition this window ACTUALLY has,
 *      minimize -> restore, driven from its taskbar button. The rubric names geometry,
 *      focus, z-order and taskbar identity as part of the trip, and all of them survive
 *      that transition or they do not.
 *
 * Z-ORDER IS COMPARED AS RANK, not as the raw inline value. Restoring a minimised window
 * legitimately raises it (195 -> 196 measured), and calling that a lost round trip would be
 * scoring the shell's correct behaviour as a defect. What must hold is the window's PLACE
 * among the others; the raw values are reported beside it so a reader can disagree.
 */
async function liquidAbsence() {
  return call(`(function(){
    var wins = [].slice.call(document.querySelectorAll('.fwin'));
    var target = window.__LQP.__win(${A(APP)});
    if (target && !target.classList.contains('fwin')) target = target.closest('.fwin');
    var name = function(w){
      var t = w.querySelector('.fwin-title-text');
      return t && t.textContent.trim() ? t.textContent.trim() : '(frameless)';
    };
    var others = wins.filter(function(w){ return w !== target && w.querySelector('.fwin-b-liquid'); });
    return {
      windowsOpen: wins.length,
      targetHasLiquidControl: !!(target && target.querySelector('.fwin-b-liquid')),
      targetPresentation: target ? target.getAttribute('data-presentation') : null,
      targetChromeButtons: target ? target.querySelectorAll('.fwin-b').length : 0,
      othersWithLiquidControl: others.map(name)
    };
  })()`);
}

async function zRank() {
  return call(`(function(){
    var target = window.__LQP.__win(${A(APP)});
    if (target && !target.classList.contains('fwin')) target = target.closest('.fwin');
    var wins = [].slice.call(document.querySelectorAll('.fwin')).map(function(w){
      return { w: w, z: Number(getComputedStyle(w).zIndex) || 0 };
    }).sort(function(a, b){ return b.z - a.z; });
    var i = wins.map(function(e){ return e.w; }).indexOf(target);
    return { rank: i + 1, of: wins.length, z: target ? String(target.style.zIndex || '') : null };
  })()`);
}

async function taskbarToggle(titleRe) {
  return ev(`(function(){
    var re = new RegExp(${A(titleRe)}, 'i');
    var b = [].slice.call(document.querySelectorAll('.os-task-win')).filter(function(x){
      return re.test(x.getAttribute('title') || ''); })[0];
    if (!b) return 'no-taskbar-button';
    b.click();
    return 'clicked';
  })()`);
}

async function windowHidden() {
  return call(`(function(){
    var w = window.__LQP.__win(${A(APP)});
    if (w && !w.classList.contains('fwin')) w = w.closest('.fwin');
    if (!w) return { present: false };
    return { present: true, display: getComputedStyle(w).display };
  })()`);
}

/** Flip presentation and READ IT BACK. A toggle that did not land must not be scored. */
async function flip(pres, want) {
  const before = await call(`window.__LQP.toggleLiquid(${A(APP)}, ${A(pres)})`);
  if (before.refused) return { refused: before.refused };
  await sleep(900);
  const now = await call(`window.__LQP.snapshot(${A(APP)})`);
  if (now.refused) return { refused: now.refused };
  if (want && now.presentation !== want) {
    return { refused: `toggle did not reach ${want}; surface reads ${now.presentation}` };
  }
  return { presentation: now.presentation, snapshot: now };
}

(async () => {
  const installed = JSON.parse(await ev(engine));
  if (LIST) {
    console.log(JSON.stringify(installed, null, 2));
    return;
  }
  if (!APP) {
    console.error('REFUSE - --app is required; this harness names no surface of its own.'
      + ` Specs installed: ${installed.apps.join(', ')}. Use --list for the feature counts.`);
    process.exitCode = 2;
    return;
  }
  if (!installed.apps.includes(APP)) {
    console.error(`REFUSE - no spec named "${APP}". Specs installed: ${installed.apps.join(', ')}.`
      + ' A category-6 cell needs a spec of observable side effects, not a new probe file.');
    process.exitCode = 2;
    return;
  }

  const found = await call(`window.__LQP.findWin(${A(APP)})`);
  if (!found.found) {
    console.error(`REFUSE - the ${APP} surface is not open. Open it and re-run;`
      + ' a surface that is not on screen measures as perfect because every count is zero.');
    process.exitCode = 2;
    return;
  }

  const titleRe = await ev(`(function(){ return String(window.__LQP.__titleRe(${A(APP)})).slice(1, -2); })()`);
  // THE SHELL IS NOT RAISED, and this is a refusal to guess rather than a shortcut. The
  // desktop has no taskbar button of its own, so `raise` would find none, then discover
  // `__win('shell')` is not a `.fwin` — and its `if (!w) { b.click(); return 'opened'; }`
  // branch would click SOME other window's button. The taskbar button is a toggle
  // (correction, 2026-08-31), so that click minimises a window and every measurement below
  // runs against a shell hosting one fewer visible window than it really has.
  const isShell = found.host === 'shell';
  const raised = isShell ? 'n/a — the shell is the host, not a window' : await raise(titleRe);
  if (isShell) await post('/focus', {});

  const start = await call(`window.__LQP.snapshot(${A(APP)})`);
  if (start.refused) {
    console.error(`REFUSE - ${start.refused}`);
    process.exitCode = 2;
    return;
  }
  const startPres = start.presentation === 'liquid' ? 'liquid' : 'standard';
  const other = startPres === 'liquid' ? 'standard' : 'liquid';

  const out = {
    label: LABEL,
    app: APP,
    win: WIN || '(focused)',
    raised,
    matchedBy: start.matchedBy,
    host: start.host,
    presentationAsFound: startPres,
    box: `${start.rect.w}x${start.rect.h}`,
  };
  let flipped = false;

  try {
    // ---- 0. drive the surface ---------------------------------------------------------
    // Rows whose claim is "the feature still works" cannot be answered by counting a
    // control, and `/eval` is synchronous, so each step is its own POST with a real sleep.
    // The sequence is the SPEC's, not this file's.
    const sequence = await call(`window.__LQP.__drive(${A(APP)})`);
    const drive = async () => {
      const log = [];
      for (const entry of sequence) {
        const [name, param] = Array.isArray(entry) ? entry : [entry, undefined];
        // eslint-disable-next-line no-await-in-loop
        const r = await call(`window.__LQP.step(${A(APP)}, ${A(name)}${param === undefined ? '' : `, ${A(param)}`})`);
        log.push({ step: name, result: r.refused ? `REFUSED: ${r.refused}` : A(r).slice(0, 120) });
        // eslint-disable-next-line no-await-in-loop
        await sleep(STEP_MS);
      }
      return log;
    };
    // DIRTY BEFORE THE DRIVE, not after. Measured 2026-08-26: typing into the field fires
    // React `onChange`, Translate's handler does `setSelection('')`, and the scored check
    // then read `agentHandoff` false — the instrument had erased the state its own drive
    // step had just established. The drive may overwrite the dirty value; that is fine,
    // snapshot A records whatever is really there and C has to match it.
    const dirty = await dirtyField();
    await sleep(300);

    const driven = await drive();
    out.driven = driven;
    out.drivenRefusals = driven.filter((d) => String(d.result).startsWith('REFUSED')).length;

    // ---- 1. parity: the same feature list, checked in both presentations -------------
    // ORDER IS LOAD-BEARING, and the first version of this file got it wrong. Dirtying the
    // field BETWEEN the two checks made the `input` row read false in the presentation that
    // was checked first and true in the one checked second, and the driver reported a
    // parity break — `input: standard=false liquid=true` — that the instrument had caused.
    // Everything that changes the surface happens before EITHER check.
    const snapA = await call(`window.__LQP.snapshot(${A(APP)})`);

    const asFound = await call(`window.__LQP.check(${A(APP)})`);
    if (asFound.refused) throw new Error(asFound.refused);

    // Correction 24's branch. Everything below reads `inOther`, `snapB` and `snapC`, so the
    // no-Liquid host fills them from the trip it can actually take rather than from a flip
    // that would throw: `inOther` is the SAME check (there is one presentation, so parity is
    // trivially equal and the bar that carries the weight is `liquidAbsenceProved`), and the
    // round trip is minimize -> restore.
    const noLiquid = start.host === 'fwin-no-liquid';
    let inOther = asFound;
    let snapB = null;
    let snapC = null;
    let rankA = null;
    let rankC = null;
    if (noLiquid) {
      out.liquidAbsence = await liquidAbsence();
      if (out.liquidAbsence.othersWithLiquidControl.length === 0) {
        throw new Error('cannot discriminate: no OTHER window renders `.fwin-b-liquid` right now, so an'
          + ' absent toggle on this one is equally explained by an app that renders it nowhere.'
          + ' Open a presentable window (Video, Dictionary) alongside and re-run.');
      }
      rankA = await zRank();
      await taskbarToggle(titleRe);
      await sleep(700);
      out.minimized = await windowHidden();
      if (out.minimized.display !== 'none') {
        throw new Error(`minimize did not land; window reads display: ${out.minimized.display}`);
      }
      await taskbarToggle(titleRe);
      await sleep(900);
      await post('/focus', {});
      await sleep(300);
      snapC = await call(`window.__LQP.snapshot(${A(APP)})`);
      if (snapC.refused) throw new Error(`restore did not land: ${snapC.refused}`);
      rankC = await zRank();
      out.lifecycleTrip = {
        trip: 'minimize -> restore (taskbar)',
        zBefore: rankA,
        zAfter: rankC,
        rankHeld: rankA.rank === rankC.rank && rankA.of === rankC.of,
      };
    } else {
      const toOther = await flip(undefined, other);
      if (toOther.refused) throw new Error(toOther.refused);
      flipped = true;
      inOther = await call(`window.__LQP.check(${A(APP)})`);
      if (inOther.refused) throw new Error(inOther.refused);
      snapB = toOther.snapshot;

      const back = await flip(undefined, startPres);
      if (back.refused) throw new Error(back.refused);
      flipped = false;
      snapC = back.snapshot;
    }

    // Geometry, focus and z-order are part of what the round trip must preserve, but the
    // FIELDS are the app data the rubric names. Both are compared; they are reported apart
    // so a chrome-only difference is never mistaken for lost user state.
    const fieldsHeld = A(snapA.fields) === A(snapC.fields);
    const stripVolatile = (s) => {
      const {
        chars: _chars, nodes: _nodes, controls: _controls, zIndex, ...rest
      } = s;
      // The raw `zIndex` is dropped ONLY on the minimize/restore trip, where raising the
      // restored window is the shell behaving correctly; `lifecycleTrip.rankHeld` carries
      // the z-order term instead and both raw values are printed there. On the presentation
      // flip it stays compared, because nothing should raise anything.
      return noLiquid ? rest : { ...rest, zIndex };
    };
    const shellHeld = A(stripVolatile(snapA)) === A(stripVolatile(snapC));
    const diffs = Object.keys(snapA)
      .filter((k) => A(snapA[k]) !== A(snapC[k]))
      .map((k) => ({ key: k, before: snapA[k], after: snapC[k] }));

    await undirtyField(undefined, dirty.was);

    const reachableEqual = asFound.reachable === inOther.reachable
      && asFound.total === inOther.total;
    const rowsAgree = A(asFound.rows.map((r) => `${r.id}=${r.reachable}`))
      === A(inOther.rows.map((r) => `${r.id}=${r.reachable}`));

    out.parity = {
      [startPres]: `${asFound.reachable}/${asFound.total}`,
      [other]: noLiquid ? 'n/a — section is not Liquid-presentable' : `${inOther.reachable}/${inOther.total}`,
      na: asFound.na,
      equal: noLiquid ? null : reachableEqual,
      rowsAgree: noLiquid ? null : rowsAgree,
      failing: asFound.rows.filter((r) => r.reachable === false)
        .map((r) => `${r.id} (${r.evidence})`),
      onlyInOne: noLiquid ? [] : asFound.rows
        .filter((r, i) => r.reachable !== inOther.rows[i].reachable)
        .map((r, i) => `${r.id}: ${startPres}=${r.reachable} ${other}=${inOther.rows[i].reachable}`),
    };
    out.roundTrip = {
      trip: noLiquid ? 'minimize -> restore' : `${startPres} -> ${other} -> ${startPres}`,
      dirtiedField: dirty.field === undefined ? null : dirty.field,
      dirtyNote: dirty.note || null,
      fieldsHeld,
      shellHeld,
      diffs,
      otherPresentationBox: snapB ? `${snapB.rect.w}x${snapB.rect.h}` : null,
    };

    // ---- 2. negative control: each declared mutation flips exactly its own row -------
    if (CONTROL) {
      const mutations = await call(`(function(){
        var m = window.__LQP.__mutations(${A(APP)});
        return Object.keys(m || {});
      })()`);
      const cascades = await call(`(function(){
        var s = window.__LQP.__cascades(${A(APP)});
        return s || {};
      })()`);
      const results = [];
      for (const which of mutations) {
        // EACH MUTATION GETS ITS OWN FRESHLY DRIVEN BASELINE, and this is not optional.
        // Rows whose claim is "the feature still works" pass by comparing against a `before`
        // that a step recorded, and `restore()` consumes those globals. Measured 2026-08-26
        // on Translate: with one baseline reused across three mutations, every mutation
        // showed 4-5 rows falling and the control read VOID — the decay of the previous
        // mutation's cleanup, not the mutation. `exactlyOwnRow` is now measured against the
        // check taken immediately before the mutation, on a surface driven the same way.
        // eslint-disable-next-line no-await-in-loop
        await drive();
        // eslint-disable-next-line no-await-in-loop
        const pre = await call(`window.__LQP.check(${A(APP)})`);
        // eslint-disable-next-line no-await-in-loop
        const applied = await call(`window.__LQP.mutate(${A(APP)}, ${A(which)})`);
        // eslint-disable-next-line no-await-in-loop
        await sleep(350);
        // eslint-disable-next-line no-await-in-loop
        const dirtyCheck = await call(`window.__LQP.check(${A(APP)})`);
        // eslint-disable-next-line no-await-in-loop
        const restored = await call(`window.__LQP.restore(${A(APP)})`);
        // eslint-disable-next-line no-await-in-loop
        await sleep(350);
        // eslint-disable-next-line no-await-in-loop
        await drive();
        // eslint-disable-next-line no-await-in-loop
        const after = await call(`window.__LQP.check(${A(APP)})`);
        const was = new Map((pre.rows || []).map((r) => [r.id, r.reachable]));
        const fell = (dirtyCheck.rows || []).filter((r) => r.reachable === false && was.get(r.id) === true);
        // A DECLARED cascade is not a broken control. Clearing Translate's textarea empties
        // the span the ask-agent button would send, so that button correctly disables and its
        // row correctly falls — two rows down, one feature removed. The spec names the rows a
        // mutation is ALLOWED to take with it; anything it does not name still voids the
        // control, so this cannot be used to wave a real over-broad mutation through.
        const allowed = cascades[which] || [];
        const unexpected = fell.filter((r) => r.id !== which && !allowed.includes(r.id));
        results.push({
          mutation: which,
          declaredCascade: allowed,
          preBaseline: pre.refused ? null : `${pre.reachable}/${pre.total}`,
          applied: applied.refused || applied.mutated || A(applied),
          reachable: dirtyCheck.refused ? null : `${dirtyCheck.reachable}/${dirtyCheck.total}`,
          fellRows: fell.map((r) => r.id),
          exactlyOwnRow: fell.some((r) => r.id === which) && unexpected.length === 0,
          unexpectedRows: unexpected.map((r) => r.id),
          restored: A(restored.restored),
          afterRestore: after.refused ? null : `${after.reachable}/${after.total}`,
          returned: !after.refused && !pre.refused && after.reachable === pre.reachable,
        });
      }
      const allProved = results.length > 0
        && results.every((r) => r.exactlyOwnRow && r.returned);
      out.control = {
        mutations: results,
        verdict: allProved
          ? 'CONTROL FAILED AS REQUIRED - category 6 instrument is proven'
          : 'VOID - a mutation did not flip exactly its own row, or did not restore',
      };
    }

    const bars = noLiquid ? {
      allRowsReachable: asFound.total > 0 && asFound.reachable === asFound.total,
      // The parity bar's replacement, and it is a control rather than an assertion: the
      // same query, at the same moment, over every open window.
      liquidAbsenceProved: out.liquidAbsence.targetHasLiquidControl === false
        && out.liquidAbsence.othersWithLiquidControl.length >= 1
        && out.liquidAbsence.targetPresentation === 'standard'
        && out.liquidAbsence.targetChromeButtons >= 3,
      roundTripHeld: fieldsHeld && shellHeld && out.lifecycleTrip.rankHeld,
    } : {
      allRowsReachable: asFound.total > 0 && asFound.reachable === asFound.total,
      parityEqual: reachableEqual && rowsAgree,
      roundTripHeld: fieldsHeld && shellHeld,
    };
    out.bars = bars;
    out.verdict = Object.values(bars).every(Boolean) ? 'PASS 10/10' : 'FAIL';
    out.failedBars = Object.entries(bars).filter(([, v]) => !v).map(([n]) => n);
    if (CONTROL && !out.control.verdict.startsWith('CONTROL FAILED')) {
      out.verdict = 'VOID - negative control did not falsify';
    }
    if (asFound.total === 0) {
      out.verdict = 'VOID - the spec declares no scorable feature rows';
    }

    const text = JSON.stringify(out, null, 2);
    if (OUT) fs.writeFileSync(OUT, text);
    console.log(text);
    process.exitCode = out.verdict.startsWith('PASS') ? 0 : 1;
  } finally {
    // Both the mutations and the presentation are live state. Restore unconditionally; the
    // calls are idempotent and name no surface-specific selector.
    try { await call(`window.__LQP.restore(${A(APP)})`); } catch { /* renderer may be gone */ }
    if (flipped) {
      try {
        const home = await flip(undefined, startPres);
        if (home.refused) {
          console.error(`WARNING - presentation left as ${other}: ${home.refused}`);
        }
      } catch {
        console.error(`WARNING - could not return the surface to ${startPres}.`);
      }
    }
  }
})().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(4);
});
