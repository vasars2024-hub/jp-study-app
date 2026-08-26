/**
 * RUBRIC CATEGORY 3 HARNESS — "Liquid utilization", parameterised by surface.
 *
 * This is the reusable driver for the two earlier browser-only instruments:
 *   - `l1-surface-roles.js` measured the four roles but required globals and `.fwin` titles;
 *   - `l1-surface-roles-control.js` hardcoded a dense region and backing selector per surface.
 * The driver keeps the measured classifier in the first file, supplies either a title or an
 * `@selector` root, and derives both negative controls from its runtime Work-region paths. No
 * surface selector, window size, entry count or pid lives here.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/cat3-liquid-utilization.cjs \
 *     --surface "Library" [--win main] [--label l6-library] [--depth 12] [--control] [--out file]
 *
 * `--surface` follows the shared category-harness contract: a leading `@` is a CSS selector;
 * anything else is a floating-window title. `--win` pins bridge calls to one Electron window.
 *
 * The two rubric numbers are computed here rather than left for a caller to interpret:
 *   denseWorkOnTranslucent     must be 0;
 *   liquidTreatedEligible / eligibleTotal must be N/N, and the same N/N must be backed by a
 *                              shared Liquid primitive rather than a local translucent copy.
 *
 * `--control` runs both falsifications in the same process and restores them before returning:
 *   A. blur the first runtime Work region (0 must increase);
 *   B. make the whole runtime surface deliberately all-glass (every Work region must fail).
 * The all-glass control is a temporary attribute plus stylesheet, not a surface-specific node.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.indexOf(`--${name}`) >= 0;

const SURFACE = arg('surface', '');
const WIN = arg('win', '');
const OUT = arg('out', '');
const CONTROL = has('control');
const DEPTH = Number(arg('depth', '12'));
if (!SURFACE) {
  console.error('REFUSE - --surface is required; this harness names no surface of its own');
  process.exit(2);
}
if (!Number.isFinite(DEPTH) || DEPTH < 1) {
  console.error(`REFUSE - --depth must be a positive number, got ${arg('depth', '')}`);
  process.exit(2);
}
const IS_SELECTOR = SURFACE.startsWith('@');
const SELECTOR = IS_SELECTOR ? SURFACE.slice(1) : null;
const LABEL = arg('label', (SELECTOR || SURFACE).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''));

const cfg = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'debug', 'bridge.json'),
  'utf8',
));
const instrument = fs.readFileSync(path.join(__dirname, 'l1-surface-roles.js'), 'utf8').trim();
const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };

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
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 500)}`);
  return t.result;
}

const ROOT_EXPR = IS_SELECTOR
  ? `document.querySelector(${JSON.stringify(SELECTOR)})`
  : `[].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
       var r = w.getBoundingClientRect();
       if (!(r.width > 0 && r.height > 0)) return false;
       var t = w.querySelector('.fwin-title-text, .fwin-title');
       return !!t && (t.textContent || '').indexOf(${JSON.stringify(SURFACE)}) >= 0;
     })[0]`;

async function raise() {
  if (IS_SELECTOR) {
    await post('/focus', {});
    return 'root surface - focused OS window';
  }
  const r = await ev(`(function(){
    var w = ${ROOT_EXPR};
    if (!w) return 'no window';
    var b = [].slice.call(document.querySelectorAll('.os-task-win')).filter(function(x){
      return (x.getAttribute('title') || '').indexOf(${JSON.stringify(SURFACE)}) >= 0; })[0];
    if (!b) return 'no-taskbar-button';
    var hidden = getComputedStyle(w).display === 'none';
    var zs = [].slice.call(document.querySelectorAll('.fwin')).map(function(x){
      return Number(getComputedStyle(x).zIndex) || 0; });
    var onTop = (Number(getComputedStyle(w).zIndex) || 0) >= Math.max.apply(null, zs);
    if (hidden || !onTop) { b.click(); return hidden ? 'restored' : 'raised'; }
    return 'already-on-top';
  })()`);
  await post('/focus', {});
  await new Promise((resolve) => { setTimeout(resolve, 250); });
  return r;
}

async function configure() {
  return ev(`(function(){
    window.__lqScoreSurfaces = [${JSON.stringify(SURFACE)}];
    window.__lqRoleDepth = ${DEPTH};
    return true;
  })()`);
}

async function cleanupGlobals() {
  return ev(`(function(){
    delete window.__lqScoreSurfaces;
    delete window.__lqRoleDepth;
    return true;
  })()`);
}

async function read() {
  const payload = JSON.parse(await ev(instrument));
  const row = payload.windows && payload.windows[0];
  if (!row) return { refuse: 'instrument returned no surface row' };
  return { ...row, theme: payload.theme, materials: payload.materials, viewport: payload.viewport };
}

const RESOLVE_PATH = `(function(root, parts){
  var node = root.querySelector('.fwin-body') || root;
  for (var i = 0; node && i < parts.length; i += 1) node = node.children[parts[i]];
  return node;
})`;

async function injectOne(pathParts) {
  return JSON.parse(await ev(`(function(){
    var root = ${ROOT_EXPR};
    if (!root) return JSON.stringify({ refuse: 'surface disappeared before control A' });
    var node = (${RESOLVE_PATH})(root, ${JSON.stringify(pathParts)});
    if (!node) return JSON.stringify({ refuse: 'runtime Work path no longer resolves' });
    var cs = getComputedStyle(node);
    var before = {
      style: node.getAttribute('style'),
      material: cs.backdropFilter + '|' + cs.backgroundColor
    };
    node.setAttribute('data-lq-cat3-control-one', '');
    node.style.setProperty('backdrop-filter', 'blur(12px)', 'important');
    node.style.setProperty('background-color', 'rgba(30, 30, 40, 0.55)', 'important');
    return JSON.stringify({ before: before });
  })()`));
}

/**
 * Undo control A and read the node back.
 *
 * The read-back is SETTLED, not immediate. Measured 2026-08-26 on the reader
 * surface: the runtime Work region there computes `transition: all`, so removing
 * the injected inline material starts an animation and `getComputedStyle` on the
 * next statement can return a value part-way between the injected material and
 * the real one. That reads as "the control did not restore" on a surface that
 * restored perfectly — `returned` (the metric tuple, re-read later) was true in
 * the same run that `oneMaterialReturned` was false, which is the signature.
 *
 * Both readings are reported. A control that only settles on the second one is
 * still a pass, but the pair is what lets the next worker tell a transition from
 * a genuinely stuck material instead of re-deriving this.
 */
async function restoreOne(pathParts, before) {
  const restored = JSON.parse(await ev(`(function(){
    var root = ${ROOT_EXPR};
    var node = root && (${RESOLVE_PATH})(root, ${JSON.stringify(pathParts)});
    if (!node) return JSON.stringify({ refuse: 'runtime Work path disappeared during control A' });
    node.removeAttribute('data-lq-cat3-control-one');
    if (${JSON.stringify(before.style)} === null) node.removeAttribute('style');
    else node.setAttribute('style', ${JSON.stringify(before.style)});
    var cs = getComputedStyle(node);
    return JSON.stringify({
      style: node.getAttribute('style'),
      immediateMaterial: cs.backdropFilter + '|' + cs.backgroundColor
    });
  })()`));
  if (restored.refuse) return restored;
  await new Promise((resolve) => { setTimeout(resolve, 450); });
  const settled = JSON.parse(await ev(`(function(){
    var root = ${ROOT_EXPR};
    var node = root && (${RESOLVE_PATH})(root, ${JSON.stringify(pathParts)});
    if (!node) return JSON.stringify({ refuse: 'runtime Work path disappeared while settling control A' });
    var cs = getComputedStyle(node);
    return JSON.stringify({ material: cs.backdropFilter + '|' + cs.backgroundColor });
  })()`));
  if (settled.refuse) return settled;
  return { ...restored, material: settled.material };
}

async function injectAllGlass() {
  return JSON.parse(await ev(`(function(){
    var root = ${ROOT_EXPR};
    if (!root) return JSON.stringify({ refuse: 'surface disappeared before control B' });
    if (document.querySelector('style[data-lq-cat3-control-style]')) {
      return JSON.stringify({ refuse: 'a prior category-3 control style is still mounted' });
    }
    var before = root.getAttribute('data-lq-cat3-control-all-glass');
    root.setAttribute('data-lq-cat3-control-all-glass', '');
    var style = document.createElement('style');
    style.setAttribute('data-lq-cat3-control-style', '');
    style.textContent = '[data-lq-cat3-control-all-glass], [data-lq-cat3-control-all-glass] * {'
      + 'background-color: rgba(30, 30, 40, 0.45) !important;'
      + 'backdrop-filter: blur(12px) !important; }';
    document.head.appendChild(style);
    return JSON.stringify({ before: before });
  })()`));
}

async function restoreAllGlass(before) {
  return JSON.parse(await ev(`(function(){
    var root = ${ROOT_EXPR};
    var style = document.querySelector('style[data-lq-cat3-control-style]');
    if (style) style.remove();
    if (!root) return JSON.stringify({ refuse: 'surface disappeared during control B restore' });
    if (${JSON.stringify(before)} === null) root.removeAttribute('data-lq-cat3-control-all-glass');
    else root.setAttribute('data-lq-cat3-control-all-glass', ${JSON.stringify(before)});
    return JSON.stringify({
      attribute: root.getAttribute('data-lq-cat3-control-all-glass'),
      styleStillMounted: !!document.querySelector('style[data-lq-cat3-control-style]')
    });
  })()`));
}

const metricTuple = (row) => [
  row.denseWorkOnTranslucent,
  row.liquidTreatedEligible,
  row.sharedPrimitiveEligible,
  row.eligibleTotal,
  row.byRole && row.byRole.Work,
];

(async () => {
  const raised = await raise();
  await configure();
  let out;
  try {
    const base = await read();
    if (base.refuse) {
      console.error(`REFUSE - ${base.refuse}`);
      process.exitCode = 2;
      return;
    }
    const bars = {
      denseWorkAnchored: base.denseWorkOnTranslucent === 0,
      contextualTreated: base.eligibleTotal > 0 && base.liquidTreatedEligible === base.eligibleTotal,
      sharedPrimitives: base.eligibleTotal > 0 && base.sharedPrimitiveEligible === base.eligibleTotal,
    };
    const { detail: _runtimePaths, ...baseReport } = base;
    out = {
      label: LABEL,
      surface: SURFACE,
      win: WIN || '(focused)',
      depth: DEPTH,
      raised,
      ...baseReport,
      bars,
      verdict: Object.values(bars).every(Boolean) ? 'PASS 10/10' : 'FAIL',
      failedBars: Object.entries(bars).filter(([, value]) => !value).map(([name]) => name),
    };

    if (CONTROL) {
      const work = base.detail.find((row) => row.role === 'Work' && Array.isArray(row.path));
      if (!work) {
        out.control = { verdict: 'VOID - no runtime Work region exists to falsify' };
        out.verdict = 'VOID - negative control could not run';
      } else {
        const one = await injectOne(work.path);
        if (one.refuse) throw new Error(one.refuse);
        const dirtyOne = await read();
        const oneRestored = await restoreOne(work.path, one.before);

        const all = await injectAllGlass();
        if (all.refuse) throw new Error(all.refuse);
        const dirtyAll = await read();
        const allRestored = await restoreAllGlass(all.before);
        const restored = await read();

        const movedOne = dirtyOne.denseWorkOnTranslucent > base.denseWorkOnTranslucent;
        const allWorkFailed = dirtyAll.denseWorkOnTranslucent === dirtyAll.byRole.Work
          && dirtyAll.byRole.Work === base.byRole.Work;
        const returned = JSON.stringify(metricTuple(restored)) === JSON.stringify(metricTuple(base));
        const oneMaterialReturned = oneRestored.material === one.before.material
          && oneRestored.style === one.before.style;
        const allGlassReturned = !allRestored.styleStillMounted
          && allRestored.attribute === all.before;
        out.control = {
          target: { sel: work.sel, path: work.path },
          counts: {
            base: metricTuple(base),
            oneRegionGlass: metricTuple(dirtyOne),
            allGlass: metricTuple(dirtyAll),
            restored: metricTuple(restored),
          },
          movedOne,
          allWorkFailed,
          returned,
          oneMaterialReturned,
          oneMaterial: {
            before: one.before.material,
            immediate: oneRestored.immediateMaterial,
            settled: oneRestored.material,
          },
          allGlassReturned,
          verdict: movedOne && allWorkFailed && returned && oneMaterialReturned && allGlassReturned
            ? 'CONTROL FAILED AS REQUIRED - category 3 instrument is proven'
            : 'VOID - negative control did not falsify and restore',
        };
        if (!out.control.verdict.startsWith('CONTROL FAILED')) {
          out.verdict = 'VOID - negative control did not falsify';
        }
      }
    }

    const text = JSON.stringify(out, null, 2);
    if (OUT) fs.writeFileSync(OUT, text);
    console.log(text);
    process.exitCode = out.verdict.startsWith('PASS') ? 0 : 1;
  } finally {
    // A thrown bridge failure must not strand either control. These calls are idempotent and
    // intentionally use no remembered surface-specific selector.
    try {
      await ev(`(function(){
        var style = document.querySelector('style[data-lq-cat3-control-style]');
        if (style) style.remove();
        var root = ${ROOT_EXPR};
        if (root) root.removeAttribute('data-lq-cat3-control-all-glass');
        return true;
      })()`);
    } catch { /* the renderer may have exited; the style exits with it */ }
    try { await cleanupGlobals(); } catch { /* same */ }
  }
})().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(4);
});
