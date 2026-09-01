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
 *
 * ------------------------------------------------------------------ --mode duplication
 *
 * L10 bullet 4 asks to "confirm no feature is duplicated into competing control systems".
 * No instrument answered that: `--mode parity` measures whether a feature is REACHABLE in
 * both presentations, which is the opposite question — it cannot tell one route from three.
 * So this is a MODE on the category-6 harness rather than an eightieth single-use probe.
 *
 * What it measures, and why each choice is the way it is:
 *
 *  - A CONTROL SYSTEM is a region of the window that persists across content: window
 *    chrome, the navigation rail, the app toolbar, a tab strip, an inspector, the content
 *    body. Assigned from ancestry, live, and reported per control so the reader can check.
 *  - A PRIMARY LABEL is the control's FIRST text segment, then `aria-label`, then `title`
 *    — in that order. Title-first is what produced the one false positive found during
 *    reconnaissance: Video's Subtitles and Generate buttons share ONE disabled-reason
 *    tooltip, and naming them by `title` collapsed two different actions into a duplicate.
 *    First-segment (not whole `textContent`) is what separates a rail entry's name from
 *    its own sub-caption: `<strong>Media workspace</strong><small>Library</small>`.
 *  - ONLY PRODUCT-AUTHORED LABELS ARE COMPARED. A label counts only if it appears verbatim
 *    as a value in the EN i18n catalogs. This is what keeps a shelf of media tiles — user
 *    filenames, episode numbers — out of a duplication count they have no business in,
 *    without inventing a DOM heuristic for "is this a list". Interpolated strings
 *    ({count} …) never match, so the scope is conservative and says so.
 *  - A DUPLICATE is two visible, enabled controls sharing a primary label. Same system is
 *    `withinSystem`; different systems is `crossSystem` — the bullet's actual subject.
 *  - CONTAINMENT is advisory, never scored: "Open in the media workspace" contains
 *    "Media workspace". A near-miss for a human to adjudicate, not a FAIL.
 *  - THE CONTROL PLANTS A DUPLICATE. One visible control's label is overwritten with
 *    another system's label, the identical sweep re-runs, and the count must rise by
 *    exactly one AND name that pair; then it is restored and must return to baseline.
 *    A sweep that cannot see a planted duplicate cannot certify their absence.
 *
 *   node src/.coordination/liquid-workplace/probes/cat6-feature-parity.cjs \
 *     --mode duplication --app video [--out file] [--no-control]
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
const MODE = arg('mode', 'parity');
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

/* ======================================================================= --mode duplication
 *
 * Everything below serves the duplication mode only. It shares the bridge, the window
 * resolution and the raise/restore discipline above; it adds no second transport.
 */

/**
 * The product's own label vocabulary, read from the EN catalogs.
 *
 * This is the scope rule, and it is deliberately a PRODUCT fact rather than a DOM guess:
 * a control counts as chrome when the words on it were written by this repository. A shelf
 * of media tiles carries the user's filenames, so it drops out on its own — no "is this a
 * list" heuristic, which is the kind of rule that later mis-classifies a nav rail.
 *
 * Values are extracted textually rather than by importing the module: these are `.ts`
 * sources with imports, and a regex over quoted values needs no build step. Interpolated
 * strings never match a rendered label anyway, so they cost nothing by being included.
 */
function productLabels() {
  const roots = [path.join(__dirname, '..', '..', '..', 'shared', 'i18n')];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/^(en|core)\.ts$/.test(entry.name)) files.push(p);
    }
  };
  roots.forEach(walk);
  const set = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/:\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
      const value = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
      if (value.length >= 2 && value.length <= 60) set.add(value.toLowerCase());
    }
  }
  return { files: files.length, labels: set };
}

/**
 * One expression, no backticks, no regex whitespace class — the three traps that have each
 * already corrupted an /eval payload in this repo. Whitespace is normalised from character
 * CODES, because a template literal turns a lone backslash-n into a real newline and a real
 * newline inside the emitted string literal is a syntax error.
 */
const SWEEP = `(function(){
  var win = window.__LQP.__win(${A(APP)});
  if (win && !win.classList.contains('fwin') && win.closest) {
    var f = win.closest('.fwin');
    if (f) win = f;
  }
  if (!win) return JSON.stringify({ refused: 'surface not found' });
  var WS = String.fromCharCode(32, 9, 10, 13, 160, 8203);
  var norm = function (s) {
    var out = ''; var gap = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (WS.indexOf(ch) >= 0) { gap = out.length > 0; continue; }
      if (gap) { out += ' '; gap = false; }
      out += ch;
    }
    return out;
  };
  var segments = function (el) {
    var out = [];
    var walk = function (node) {
      if (node.nodeType === 3) { var t = norm(node.nodeValue || ''); if (t) out.push(t); return; }
      if (node.nodeType !== 1) return;
      var st = getComputedStyle(node);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    };
    walk(el);
    return out;
  };
  var SYSTEMS = [
    ['window-chrome', '.fwin-bar'],
    ['taskbar', '[class*="os-task"]'],
    ['tab-bar', '[role="tablist"]'],
    ['nav-rail', 'nav,[role="navigation"],.mc-nav,[class*="-nav"],[class*="rail"],[class*="sidebar"]'],
    ['app-toolbar', '[role="toolbar"],[class*="topbar"],[class*="toolbar"],header,[class*="-head"],[class*="action"],[class*="-buttons"]'],
    ['inspector', 'aside,[role="complementary"],[class*="inspector"]']
  ];
  var systemOf = function (el) {
    for (var i = 0; i < SYSTEMS.length; i++) {
      if (el.closest(SYSTEMS[i][1])) return SYSTEMS[i][0];
    }
    return 'content-body';
  };
  var sel = 'button,a[href],[role="button"],[role="menuitem"],[role="tab"],[role="option"],'
    + 'select,summary,input[type="button"],input[type="submit"]';
  var all = [].slice.call(win.querySelectorAll(sel));
  var rows = [];
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var box = el.getBoundingClientRect();
    var painted = box.width > 0 && box.height > 0
      && (!el.checkVisibility || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
    if (!painted) continue;
    var segs = segments(el);
    var label = segs.length ? segs[0] : '';
    var source = label ? 'text' : '';
    if (!label) { label = norm(el.getAttribute('aria-label') || ''); source = label ? 'aria-label' : ''; }
    if (!label) { label = norm(el.getAttribute('title') || ''); source = label ? 'title' : ''; }
    if (!label) continue;
    rows.push({
      i: i,
      label: label,
      source: source,
      segments: segs.length,
      system: systemOf(el),
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      hasText: segs.length > 0,
      at: Math.round(box.left) + ',' + Math.round(box.top)
    });
  }
  return JSON.stringify({ total: all.length, rows: rows, selector: sel });
})()`;

/**
 * Plant a duplicate by overwriting one control's FIRST text node with another system's
 * label. A text-node value is the least invasive thing that changes what the sweep reads:
 * nothing is added to or removed from the tree React reconciles, and the original is held
 * on `window.__LQDUP` so the restore is exact rather than re-derived.
 */
const plantJs = (index, label) => `(function(){
  var win = window.__LQP.__win(${A(APP)});
  if (win && !win.classList.contains('fwin') && win.closest) {
    var f = win.closest('.fwin');
    if (f) win = f;
  }
  var sel = 'button,a[href],[role="button"],[role="menuitem"],[role="tab"],[role="option"],'
    + 'select,summary,input[type="button"],input[type="submit"]';
  var el = [].slice.call(win.querySelectorAll(sel))[${index}];
  if (!el) return JSON.stringify({ refused: 'plant index no longer resolves' });
  var node = null;
  var walk = function (n) {
    if (node) return;
    if (n.nodeType === 3 && (n.nodeValue || '').trim()) { node = n; return; }
    if (n.nodeType !== 1) return;
    for (var i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
  };
  walk(el);
  if (!node) return JSON.stringify({ refused: 'plant candidate has no text node to overwrite' });
  window.__LQDUP = { node: node, was: node.nodeValue };
  node.nodeValue = ${A(label)};
  return JSON.stringify({ planted: ${A(label)}, was: window.__LQDUP.was });
})()`;

const unplantJs = `(function(){
  var g = window.__LQDUP;
  if (!g || !g.node) return JSON.stringify({ refused: 'nothing planted' });
  g.node.nodeValue = g.was;
  window.__LQDUP = null;
  return JSON.stringify({ restored: g.was });
})()`;

/** Group the swept rows into the two scored buckets plus the advisory one. */
function analyse(sweep, known) {
  const kept = sweep.rows.filter((r) => known.has(r.label.toLowerCase()));
  const enabled = kept.filter((r) => !r.disabled);
  const group = (list) => {
    const by = new Map();
    for (const r of list) {
      const k = r.label.toLowerCase();
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    }
    return [...by.entries()].filter(([, v]) => v.length > 1);
  };
  const dup = (list) => group(list).map(([k, v]) => ({
    label: v[0].label,
    key: k,
    count: v.length,
    systems: [...new Set(v.map((r) => r.system))],
    at: v.map((r) => `${r.system}@${r.at}`),
  }));
  const all = dup(enabled);
  const labels = [...new Set(enabled.map((r) => r.label))];
  const containment = [];
  for (const a of labels) {
    for (const b of labels) {
      if (a === b || b.length < 8) continue;
      if (a.toLowerCase().includes(b.toLowerCase())) containment.push(`${A(a)} contains ${A(b)}`);
    }
  }
  return {
    controlsVisible: sweep.rows.length,
    controlsProductLabelled: kept.length,
    controlsEnabled: enabled.length,
    bySystem: [...enabled.reduce((m, r) => m.set(r.system, (m.get(r.system) || 0) + 1), new Map())]
      .map(([s, n]) => `${s}=${n}`).sort(),
    withinSystem: all.filter((d) => d.systems.length === 1),
    crossSystem: all.filter((d) => d.systems.length > 1),
    containmentAdvisory: containment,
    duplicatesIncludingDisabled: dup(kept).map((d) => `${d.label} x${d.count}`),
    droppedAsUserData: sweep.rows.filter((r) => !known.has(r.label.toLowerCase())).length,
  };
}

async function runDuplication() {
  const { files, labels: known } = productLabels();
  const found = await call(`window.__LQP.findWin(${A(APP)})`);
  if (!found.found) {
    console.error(`REFUSE - the ${APP} surface is not open. A window that is not on screen has`
      + ' zero controls and therefore zero duplicates, which is the empty-harness false pass.');
    process.exitCode = 2;
    return;
  }
  if (found.host !== 'shell') {
    const titleRe = await ev(`(function(){ return String(window.__LQP.__titleRe(${A(APP)})).slice(1, -2); })()`);
    await raise(titleRe);
  }
  await post('/focus', {});
  await sleep(300);

  const base = JSON.parse(await ev(SWEEP));
  if (base.refused) {
    console.error(`REFUSE - ${base.refused}`);
    process.exitCode = 2;
    return;
  }
  const out = {
    label: LABEL,
    mode: 'duplication',
    app: APP,
    catalogFiles: files,
    catalogLabels: known.size,
    baseline: analyse(base, known),
  };

  if (CONTROL) {
    // Victim and plant must sit in DIFFERENT systems, or the plant proves the within-system
    // bucket and says nothing about the bullet's actual subject. The plant also has to own a
    // text node; an icon-only control named by `aria-label` cannot be relabelled this way.
    //
    // BOTH MUST BE SINGLETONS, and the first run of this mode is why. It planted onto the
    // app-toolbar control that was ALREADY half of the surface's real duplicate: overwriting
    // its label destroyed one group while creating another, `crossSystemDelta` read 0, and a
    // sweep that had in fact seen the plant scored VOID. A control whose own plant erases the
    // defect it is measuring is not a control.
    const enabled = base.rows.filter((r) => !r.disabled && known.has(r.label.toLowerCase()));
    const times = enabled.reduce((m, r) => m.set(r.label.toLowerCase(), (m.get(r.label.toLowerCase()) || 0) + 1), new Map());
    const solo = enabled.filter((r) => times.get(r.label.toLowerCase()) === 1);
    const victim = solo.find((r) => solo.some((o) => o.system !== r.system));
    const plant = victim && solo.find((r) => r.system !== victim.system && r.hasText
      && r.label.toLowerCase() !== victim.label.toLowerCase());
    if (!victim || !plant) {
      out.control = { verdict: 'VOID - no two product-labelled controls in different systems to plant between' };
    } else {
      const applied = JSON.parse(await ev(plantJs(plant.i, victim.label)));
      await sleep(250);
      const dirty = JSON.parse(await ev(SWEEP));
      const dirtyAnalysis = analyse(dirty, known);
      const restored = JSON.parse(await ev(unplantJs));
      await sleep(250);
      const after = analyse(JSON.parse(await ev(SWEEP)), known);
      const grew = dirtyAnalysis.crossSystem.length - out.baseline.crossSystem.length;
      const named = dirtyAnalysis.crossSystem
        .some((d) => d.key === victim.label.toLowerCase() && d.systems.includes(plant.system));
      const returned = JSON.stringify(after.crossSystem) === JSON.stringify(out.baseline.crossSystem)
        && JSON.stringify(after.withinSystem) === JSON.stringify(out.baseline.withinSystem);
      out.control = {
        plantedLabel: victim.label,
        from: `${victim.system} -> ${plant.system}`,
        applied: applied.refused || applied.planted,
        restored: restored.refused || restored.restored,
        crossSystemDelta: grew,
        namedThePlantedPair: named,
        returnedToBaseline: returned,
        verdict: grew === 1 && named && returned
          ? 'CONTROL FAILED AS REQUIRED - the sweep sees a planted duplicate and loses it again'
          : 'VOID - the planted duplicate was not seen, or the surface did not return',
      };
    }
  }

  const bars = {
    noWithinSystemDuplicates: out.baseline.withinSystem.length === 0,
    noCrossSystemDuplicates: out.baseline.crossSystem.length === 0,
    scopeNonEmpty: out.baseline.controlsEnabled >= 5,
  };
  out.bars = bars;
  out.failedBars = Object.entries(bars).filter(([, v]) => !v).map(([n]) => n);
  out.verdict = Object.values(bars).every(Boolean) ? 'PASS 10/10' : 'FAIL';
  if (CONTROL && !out.control.verdict.startsWith('CONTROL FAILED')) {
    out.verdict = 'VOID - negative control did not falsify';
  }
  const text = JSON.stringify(out, null, 2);
  if (OUT) fs.writeFileSync(OUT, text);
  console.log(text);
  process.exitCode = out.verdict.startsWith('PASS') ? 0 : 1;
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

  if (MODE === 'duplication') {
    await runDuplication();
    return;
  }
  if (MODE !== 'parity') {
    console.error(`REFUSE - unknown --mode "${MODE}". This harness has two: parity (default)`
      + ' and duplication.');
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
