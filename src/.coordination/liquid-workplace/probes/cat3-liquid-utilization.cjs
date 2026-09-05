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
 *     --surface "Library" [--win main] [--label l6-library] [--depth 12] [--control] [--out file] \
 *     [--presentation liquid|standard|as-is]
 *
 * `--surface` follows the shared category-harness contract: a leading `@` is a CSS selector;
 * anything else is a floating-window title. `--win` pins bridge calls to one Electron window.
 *
 * `--presentation` closes a hole that produced a false FAIL on 2026-08-26: this harness used to
 * score whatever presentation the window happened to be sitting in. Library's banked 10/10 was
 * measured in Liquid; re-run against the same tree with the window left in Standard it returned
 * `contextualTreated: false` — 63 regions, same roles, `liquidTreatedEligible 1 -> 0` — because
 * Standard windows are SUPPOSED to be opaque. That is not a surface defect, it is the harness
 * scoring the wrong thing. So: `liquid`/`standard` drive the title-bar toggle and restore it on
 * the way out, and the `as-is` default REFUSES rather than scoring a presentable window that is
 * currently Standard.
 *
 * The two rubric numbers are computed here rather than left for a caller to interpret:
 *   denseWorkOnTranslucent     must be 0;
 *   liquidTreatedEligible / eligibleTotal must be N/N, and the same N/N must be backed by a
 *                              shared Liquid primitive rather than a local translucent copy.
 *
 * `--control` runs three falsifications in the same process and restores them before returning:
 *   A. blur the first runtime Work region (0 must increase);
 *   B. make the whole runtime surface deliberately all-glass (every Work region must fail);
 *   E. strip the opaque paint off the surface's own body chain, injecting NO blur (every Work
 *      region must fail again, this time purely for want of ground).
 * The all-glass and unground controls are a temporary attribute plus stylesheet, not a
 * surface-specific node. E exists because A and B both work through `backdrop-filter` and so
 * neither one exercises the grounding branch that `l1-surface-roles.js` CORRECTION 35 relaxed.
 *
 * A surface with NO runtime Work region cannot be perturbed by either, and used to return
 * `VOID - no runtime Work region exists to falsify` — the instrument declining to score a
 * legitimate shape (a frameless canvas surface). It now falls back to controls C and D, which
 * PLANT the two scored terms instead of perturbing them; see `plantControls`. When that leg
 * passes and the surface's contextual denominator is genuinely 0, the two contextual bars are
 * satisfied vacuously and the run reports `vacuousContextual: true` alongside the score.
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
const PRESENTATION = arg('presentation', 'as-is');
const DETAIL = has('detail');
if (!['liquid', 'standard', 'as-is'].includes(PRESENTATION)) {
  console.error(`REFUSE - --presentation must be liquid, standard or as-is; got ${PRESENTATION}`);
  process.exit(2);
}
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
  // `ok:true` WITH `{__error}` IS A THROW, not an answer: main caught the exception, so
  // the REQUEST succeeded and `.ok` is true. Readers that JSON.parse the result then report
  // `"[object Object]" is not valid JSON`, which names neither the throw nor the expression.
  // Measured 2026-09-03: a null deref inside one cat6 mutation surfaced only as that message.
  if (t.result && typeof t.result === 'object' && t.result.__error) {
    throw new Error(`eval THREW in the renderer: ${t.result.__error} :: ${js.trim().slice(0, 200)}`);
  }
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

/**
 * Read the surface's presentation without naming a surface: `data-presentation` is the
 * contract every Liquid host writes (`.fwin`, `.popout-root`, the reader root), and
 * `.fwin-b-liquid` is the only control that changes it. A root that carries neither is
 * simply not presentable and is scored as it stands.
 *
 * CORRECTION 32 (2026-08-31, backup): `toggle` used to be a bare
 * `root.querySelector('.fwin-b-liquid')`, a DESCENDANT search. That is right for a `.fwin`
 * root, whose own toggle sits in its own title bar, and wrong for every `@selector` SHELL
 * root, which CONTAINS floating windows and therefore contains their toggles. Measured on
 * `@.os-desktop-wired`: the shell root has `data-presentation` null and is not a `.fwin`,
 * but two toggles matched inside it — owned by 'SIG-VID / Signal Archive' and
 * 'SYS / Service Panel'. The harness read that as "presentable, currently standard" and
 * REFUSED, so category 3 could not be scored on any shell surface at all. Worse, the
 * `--presentation liquid` escape hatch would have "fixed" it by clicking a nested WINDOW's
 * toggle and scoring the shell in a presentation nobody set.
 *
 * The rule is ownership, not containment: a toggle belongs to this root only when the
 * nearest presentable host above it IS this root. `PRESENTABLE_HOST` is the selector set
 * every Liquid host writes, so this stays surface-agnostic.
 */
const PRESENTABLE_HOST = '.fwin, .popout-root, [data-presentation]';

/**
 * The root's OWN body, by the same ownership rule and for the same reason as
 * CORRECTION 33 in `l1-surface-roles.js`: on a shell root, `.fwin-body` matches a nested
 * WINDOW's body. Both of this harness's uses were hitting it — the control-A path resolver
 * and the plant host. Measured on `@.os-desktop-wired`: the plant mounted its 145px nodes
 * inside a 0x0 minimised window body, so `planted` came back identical to `base`
 * ([0,1,1,1,0] three times) and the run scored `VOID - the planted control did not falsify`
 * while the product bars were in fact all passing.
 */
const OWN_BODY_EXPR = `(function(root){
  var bodies = [].slice.call(root.querySelectorAll('.fwin-body'));
  for (var i = 0; i < bodies.length; i += 1) {
    if (bodies[i].closest('.fwin') === root) return bodies[i];
  }
  return root;
})`;

const OWN_TOGGLE_EXPR = `(function(root){
  var candidates = [].slice.call(root.querySelectorAll('.fwin-b-liquid'));
  for (var i = 0; i < candidates.length; i += 1) {
    var host = candidates[i].closest(${JSON.stringify(PRESENTABLE_HOST)});
    if (host === root) return candidates[i];
  }
  return null;
})`;

async function readPresentation() {
  return JSON.parse(await ev(`(function(){
    var root = ${ROOT_EXPR};
    if (!root) return JSON.stringify({ refuse: 'surface not found while reading presentation' });
    var own = (${OWN_TOGGLE_EXPR})(root);
    var nested = root.querySelectorAll('.fwin-b-liquid').length;
    return JSON.stringify({
      attr: root.getAttribute('data-presentation'),
      liquid: root.classList.contains('fwin-liquid') || root.classList.contains('popout-liquid')
        || root.getAttribute('data-presentation') === 'liquid',
      toggle: !!own,
      // Kept in the receipt so a shell root reads as "not presentable, N nested toggles
      // ignored" rather than looking like the toggle search simply found nothing.
      nestedToggles: own ? nested - 1 : nested
    });
  })()`));
}

/**
 * Click the surface's own presentation toggle and wait for `want` ('liquid' | 'standard') to
 * land. `want` is the CALLER's target, not the run's `--presentation`: the restore leg at the
 * end drives back to whatever mode the surface was found in, and polling for the run's target
 * there would wait out the whole deadline and then warn about a restore that had worked.
 *
 * RETRY, because the toggle is INTERMITTENT under a programmatic click. This was one click and
 * a fixed `setTimeout(500)` read, and it produced two REFUSE runs that named the surface rather
 * than the instrument: "the presentation toggle did not reach liquid".
 *
 * What was actually measured, 2026-09-04, on the sticky note and on `files`, over about a dozen
 * drives: a click lands roughly every other time, in BOTH directions, on the same button within
 * the same minute. A listener attached to the button counted exactly one click on a drive that
 * did not move `data-presentation` at +900ms or at +3s, so the event fires and the window does
 * not change — consistent with the click being toggled twice somewhere, though that was NOT
 * established and no reader should treat it as known. A retry loop of six alternating
 * click/read attempts moved it on the second every time it was used.
 *
 * TWO EARLIER EXPLANATIONS WERE WRONG, recorded so nobody re-derives them. (1) "It only fails
 * on an unfocused window" — `files` was focused and flipped first try, the note was not and did
 * not, which fit until the note failed again while focused. (2) "`btn.focus()` before the click
 * is what makes it land" — it worked once in the standard->liquid direction and then failed
 * twice liquid->standard with focus confirmed via `document.activeElement`. The focus call is
 * KEPT because it costs nothing and matches how the keyboard reaches this control, but it is
 * not the fix and must not be cited as one.
 *
 * This matters beyond scoring: the RESTORE leg drives the same toggle, so a single-shot click
 * could score correctly and then silently hand back a window in a presentation it did not find
 * it in — persisted state, left changed, under an exit code of 0.
 *
 * Keep prose like this OUT of the evaluated template below. A backtick inside a comment inside a
 * template literal closes the template, and the file then fails to parse at all — which is
 * exactly how the first draft of this fix died.
 */
const PRESENTATION_ATTEMPTS = 6;
const PRESENTATION_SETTLE_MS = 1500;

async function clickPresentationToggle(want) {
  let last = await readPresentation();
  if (last.refuse) return last;
  for (let attempt = 0; attempt < PRESENTATION_ATTEMPTS; attempt += 1) {
    if ((last.liquid ? 'liquid' : 'standard') === want) {
      return { ...last, attempts: attempt };
    }
    const clicked = JSON.parse(await ev(`(function(){
      var root = ${ROOT_EXPR};
      if (!root) return JSON.stringify({ refuse: 'surface disappeared before the presentation toggle' });
      // Same ownership rule as readPresentation (correction 32): clicking a nested window's
      // toggle would change a window this run does not own and leave it changed.
      var btn = (${OWN_TOGGLE_EXPR})(root);
      if (!btn) return JSON.stringify({ refuse: 'surface offers no presentation toggle of its own' });
      btn.focus();
      btn.click();
      return JSON.stringify({ ok: true, focused: document.activeElement === btn });
    })()`));
    if (clicked.refuse) return clicked;
    // Poll for the value we ASKED FOR rather than for "any change": a stale reading cannot
    // satisfy it, and the loop still gives up — reporting the last state it actually saw —
    // when the toggle genuinely does nothing.
    const deadline = Date.now() + PRESENTATION_SETTLE_MS;
    for (;;) {
      await new Promise((resolve) => { setTimeout(resolve, 150); });
      last = await readPresentation();
      if (last.refuse) return last;
      if ((last.liquid ? 'liquid' : 'standard') === want) break;
      if (Date.now() > deadline) break;
    }
  }
  return { ...last, attempts: PRESENTATION_ATTEMPTS };
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
  var node = (${OWN_BODY_EXPR})(root);
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

/**
 * Controls C and D — the EMPTY-DENOMINATOR falsification.
 *
 * Controls A and B both need a runtime Work region to attack: A blurs one, B makes the whole
 * surface glass and requires every Work region to fail. A surface that HAS no dense work and no
 * contextual chrome — a frameless full-bleed canvas, which is what City / Mooncap Garden is, and
 * what the Visualizer and the widget surfaces are — gives them nothing to move, so the leg
 * returned `VOID - no runtime Work region exists to falsify` and the whole score with it. That
 * VOID is not a defect in the surface; it is the instrument declining to score a legitimate
 * shape. Measured 2026-08-31 on City: 43 regions, `Work 0`, `Liquid-eligible 0`, `Ambient 39`.
 *
 * The fix is to falsify by PLANTING rather than by perturbing, which needs no existing
 * population and attacks the two scored terms directly:
 *
 *   C. append a `<nav>` — contextual by landmark, carrying NO `lq-` class. `eligibleTotal` must
 *      rise by exactly 1 and `sharedPrimitiveEligible` must NOT, so the `sharedPrimitives` bar
 *      goes false. That is the low score the rubric requires this category to be able to produce.
 *   D. append a translucent `<div>` holding an `<input>` — dense by form content, on glass by its
 *      own alpha. `denseWorkOnTranslucent` must rise by exactly 1, so `denseWorkAnchored` goes
 *      false too.
 *
 * Both plants are surface-agnostic: no selector, no class of the surface's own, sized off the
 * measured root so they clear the instrument's 1% area floor wherever they land. They are
 * `pointer-events: none` and removed by attribute, and the `finally` block removes them again on
 * any throw. A surface with a real Work region keeps controls A and B unchanged, so every
 * baseline banked before this addition re-derives identically.
 */
async function plantControls() {
  return JSON.parse(await ev(`(function(){
    var root = ${ROOT_EXPR};
    if (!root) return JSON.stringify({ refuse: 'surface disappeared before the plant controls' });
    if (root.querySelector('[data-lq-cat3-plant]')) {
      return JSON.stringify({ refuse: 'a prior category-3 plant is still mounted' });
    }
    var host = (${OWN_BODY_EXPR})(root);
    var r = root.getBoundingClientRect();
    // The instrument ignores anything under 1% of the window area and under 8px a side.
    var side = Math.max(96, Math.ceil(Math.sqrt(r.width * r.height * 0.02)));
    var box = 'position:absolute;left:0;top:0;z-index:-2147483640;pointer-events:none;'
      + 'width:' + side + 'px;height:' + side + 'px;overflow:hidden;';

    var nav = document.createElement('nav');
    nav.setAttribute('data-lq-cat3-plant', 'contextual');
    nav.setAttribute('style', box);
    nav.textContent = 'cat3 control C';
    host.appendChild(nav);

    // CORRECTION 48 -- plant D was written against the OLD meaning of its own bar, and so it
    // could not falsify on any windowed surface. It self-tinted (alpha 0.5) because the bar
    // used to ask "is this region on a translucent material". CORRECTION 35 changed the bar to
    // !r.grounded -- does the region reach an opaque GROUND -- and nothing updated the plant.
    //
    // Under Liquid, .fwin-body is pinned OPAQUE by rule 1 of liquid-window.css. So the
    // plant's own alpha is irrelevant: backingOf walks up, hits alpha 1 one level above it,
    // and settles grounded: true. Measured on novels before the fix, from the instrument's
    // own row: ownAlpha 0.5, grounded true, "opaque ground at div.fwin-body=1", and
    // denseWorkOnTranslucent stayed 0 while byRole.Work correctly went 3 -> 4. The plant was
    // SEEN and simply could not move the scored term -- which VOIDed the whole cell, on this
    // surface and on every other window, while the bar itself was passing honestly.
    //
    // backingOf settles ungrounded on exactly three triggers: a backdrop-filter, opacity < 1,
    // or an unparseable paint. A backdrop-filter is the truthful one here -- it is what "dense
    // work sitting on glass" physically IS, and it is what the surfaces this bar polices would
    // actually be doing wrong. The alpha stays because it is still true of the plant.
    //
    // Verified live before landing, plant applied by hand and the instrument re-run against the
    // same window: denseWorkOnTranslucent 0 -> 1 (exactly one), the plant's row flipping to
    // grounded false, "backdrop-filter on div.=0.5+blur", and all three REAL Work regions
    // unchanged at grounded true, "opaque ground at div.reading-workspace=1".
    //
    // It cannot leak into the other two bars: liquidTreatedEligible and
    // sharedPrimitiveEligible both filter role === 'Liquid-eligible', and this plant is
    // role Work by its form content.
    var dense = document.createElement('div');
    dense.setAttribute('data-lq-cat3-plant', 'dense');
    dense.setAttribute('style', box + 'background-color:rgba(30,30,40,0.5);'
      + '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);');
    dense.appendChild(document.createElement('input'));
    host.appendChild(dense);

    return JSON.stringify({ side: side, host: host.className || host.tagName });
  })()`));
}

async function removePlants() {
  return JSON.parse(await ev(`(function(){
    var planted = [].slice.call(document.querySelectorAll('[data-lq-cat3-plant]'));
    for (var i = 0; i < planted.length; i += 1) planted[i].remove();
    return JSON.stringify({
      removed: planted.length,
      stillMounted: document.querySelectorAll('[data-lq-cat3-plant]').length
    });
  })()`));
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

/**
 * Undo control B, then let product transitions settle before the caller re-reads the metric.
 * Settings exposed the missing wait in L10: removing the all-glass stylesheet restored the
 * attribute and stylesheet immediately, but its Work regions transition `background-color`.
 * The next synchronous read therefore still saw both regions as translucent (2 instead of 0)
 * and VOIDed a control that had already restored. Control A has always carried the same 450ms
 * settle for this reason; control B now observes the same contract.
 */
async function restoreAllGlass(before) {
  const restored = JSON.parse(await ev(`(function(){
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
  if (restored.refuse) return restored;
  await new Promise((resolve) => { setTimeout(resolve, 450); });
  return restored;
}

/**
 * CONTROL E — "unground the surface", added 2026-09-04 (primary) in the same commit as
 * CORRECTION 35 in `l1-surface-roles.js`.
 *
 * Why it had to exist before that correction could be trusted. Controls A and B both inject
 * `backdrop-filter: blur(12px)`, so both are caught by the walk's FIRST branch and neither one
 * ever reaches the partial-alpha branch that correction 35 relaxes. A relaxation whose only
 * negative controls fire for a different reason is unfalsified, and this category has produced
 * three false passes already. E attacks the changed term directly: it strips the opaque paint
 * off the surface's own body WITHOUT touching blur and WITHOUT touching any region's own
 * background, so every Work region keeps whatever partial tint it had and simply loses the
 * ground beneath it. Every Work region must then be counted again.
 *
 * The style is scoped to the own body by ATTRIBUTE rather than by selector, for the reason
 * CORRECTION 33 records: `.fwin-body` on a shell root matches a nested window's body.
 *
 * CORRECTION 36, 2026-09-04 (primary), measured on `scraper`: the own-body chain is NOT the
 * only ground. Marking it alone left `marked: 1` and moved the count by ZERO, because the
 * Scraper grounds its own interior — `div.scr-shell`, `section.scr-card` and `div.lq-anchor`
 * each paint opaque, so two Work regions with `ownAlpha: 0` survived on BORROWED ground the
 * control had never touched, and the leg VOIDed a surface with no defect. E now marks every
 * ancestor of every Work region up to the window, the window and the regions themselves still
 * excluded. That is strictly MORE falsifying, which is the only safe direction for a control
 * to be corrected in: it can no longer pass by failing to reach the ground it is attacking.
 */
async function injectUnground(workPaths) {
  return JSON.parse(await ev(`(function(){
    var root = ${ROOT_EXPR};
    if (!root) return JSON.stringify({ refuse: 'surface disappeared before control E' });
    if (document.querySelector('style[data-lq-cat3-control-unground-style]')) {
      return JSON.stringify({ refuse: 'a prior category-3 unground control is still mounted' });
    }
    var body = (${OWN_BODY_EXPR})(root);
    if (!body) return JSON.stringify({ refuse: 'surface exposes no own body to unground' });
    var marked = [];
    var seen = [];
    var add = function(n){ if (n && seen.indexOf(n) < 0) { seen.push(n); marked.push(n); } };
    var node = body;
    // Every painting ancestor BETWEEN the regions and the window, the window excluded: the
    // window's own material is the product's and is what a real ungrounded region falls
    // through to.
    while (node && node !== root) { add(node); node = node.parentElement; }
    // And every ancestor of every Work region, for the same reason and with the same two
    // exclusions. A region's OWN background is never touched, so a region that survives here
    // survives on its own paint — which is exactly what the runner then asserts.
    var resolve = (${RESOLVE_PATH});
    var paths = ${JSON.stringify(workPaths || [])};
    var unresolved = 0;
    for (var i = 0; i < paths.length; i += 1) {
      var region = resolve(root, paths[i]);
      if (!region) { unresolved += 1; continue; }
      var up = region.parentElement;
      while (up && up !== root) { add(up); up = up.parentElement; }
    }
    if (unresolved > 0) return JSON.stringify({ refuse: unresolved + ' Work path(s) no longer resolve before control E' });
    if (marked.length === 0) return JSON.stringify({ refuse: 'own body is the surface root; nothing to unground' });
    var before = document.querySelectorAll('[data-lq-cat3-control-unground]').length;
    if (before > 0) return JSON.stringify({ refuse: 'a prior unground attribute is still on the tree' });
    marked.forEach(function(n){ n.setAttribute('data-lq-cat3-control-unground', ''); });
    var style = document.createElement('style');
    style.setAttribute('data-lq-cat3-control-unground-style', '');
    style.textContent = '[data-lq-cat3-control-unground] { background-color: transparent !important;'
      + ' background-image: none !important; }';
    document.head.appendChild(style);
    return JSON.stringify({ marked: marked.length, before: before });
  })()`));
}

async function restoreUnground() {
  const restored = JSON.parse(await ev(`(function(){
    var style = document.querySelector('style[data-lq-cat3-control-unground-style]');
    if (style) style.remove();
    var marked = [].slice.call(document.querySelectorAll('[data-lq-cat3-control-unground]'));
    marked.forEach(function(n){ n.removeAttribute('data-lq-cat3-control-unground'); });
    return JSON.stringify({
      cleared: marked.length,
      styleStillMounted: !!document.querySelector('style[data-lq-cat3-control-unground-style]'),
      attributesLeft: document.querySelectorAll('[data-lq-cat3-control-unground]').length
    });
  })()`));
  await new Promise((resolve) => { setTimeout(resolve, 450); });
  return restored;
}

const metricTuple = (row) => [
  row.denseWorkOnTranslucent,
  row.liquidTreatedEligible,
  row.sharedPrimitiveEligible,
  row.eligibleTotal,
  row.byRole && row.byRole.Work,
];

// React may reconcile `style={}` as an empty style attribute while a control is settling.
// That is byte-different at the attribute layer (`null` versus `""`) but materially identical:
// both carry zero inline declarations. Keep meaningful inline styles strict while treating those
// two empty representations as the same restored state.
const normalizedInlineStyle = (style) => (style == null || style.trim() === '' ? null : style);

(async () => {
  const raised = await raise();

  const found = await readPresentation();
  if (found.refuse) {
    console.error(`REFUSE - ${found.refuse}`);
    process.exitCode = 2;
    return;
  }
  const foundMode = found.liquid ? 'liquid' : 'standard';
  let restorePresentationTo = null;
  if (PRESENTATION === 'as-is') {
    if (foundMode === 'standard' && found.toggle) {
      console.error('REFUSE - the surface offers a Liquid presentation and is currently standard.'
        + ' Category 3 measures Liquid utilization, and a standard window is correctly opaque, so'
        + ' scoring it here reports FAIL for a surface that has no defect.'
        + ' Re-run with --presentation liquid.');
      process.exitCode = 2;
      return;
    }
  } else if (foundMode !== PRESENTATION) {
    if (!found.toggle) {
      console.error(`REFUSE - --presentation ${PRESENTATION} was asked for, the surface is`
        + ` ${foundMode}, and it exposes no presentation toggle to change it.`);
      process.exitCode = 2;
      return;
    }
    const moved = await clickPresentationToggle(PRESENTATION);
    if (moved.refuse) {
      console.error(`REFUSE - ${moved.refuse}`);
      process.exitCode = 2;
      return;
    }
    const nowMode = moved.liquid ? 'liquid' : 'standard';
    if (nowMode !== PRESENTATION) {
      console.error(`REFUSE - the presentation toggle did not reach ${PRESENTATION};`
        + ` the surface is still ${nowMode}. Nothing was scored and nothing is left changed.`);
      process.exitCode = 2;
      return;
    }
    restorePresentationTo = foundMode;
  }

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
    // A FAIL that says "12 of 26" and nothing else cannot be acted on: the next worker has to
    // re-derive the same walk by hand to learn WHICH regions. `--detail` names them, and only
    // the ones the failed bars are about, so the flag stays a diagnostic rather than a second
    // report. `path` is the runtime index path the control leg already uses to re-find a region,
    // so a row here is enough to go straight to the element.
    const untreated = DETAIL
      ? base.detail
        .filter((row) => row.role === 'Liquid-eligible' && !(row.translucentBacking || row.ownBackdrop || row.sharedPrimitive))
        .map((row) => ({
          sel: row.sel, box: row.box, areaPct: row.areaPct, path: row.path,
          ownAlpha: row.ownAlpha, ownBackdrop: row.ownBackdrop,
          translucentBacking: row.translucentBacking, backingReason: row.backingReason,
          sharedPrimitive: row.sharedPrimitive, evidence: row.evidence,
        }))
      : null;
    out = {
      label: LABEL,
      surface: SURFACE,
      win: WIN || '(focused)',
      depth: DEPTH,
      raised,
      presentationAsFound: foundMode,
      presentationDriven: restorePresentationTo !== null,
      ...baseReport,
      ...(untreated ? { untreatedEligible: untreated } : {}),
      bars,
      verdict: Object.values(bars).every(Boolean) ? 'PASS 10/10' : 'FAIL',
      failedBars: Object.entries(bars).filter(([, value]) => !value).map(([name]) => name),
    };

    if (CONTROL) {
      const workRows = base.detail.filter((row) => row.role === 'Work' && Array.isArray(row.path));
      // CORRECTION 2026-09-04 — control A must attack a RIVAL, not the victim.
      //
      // This used to be `.find(row => row.role === 'Work')`, i.e. the first Work region in
      // walk order, whatever its backing. Control A blurs that region and requires
      // `denseWorkOnTranslucent` to INCREASE. Measured on `files`: the first Work region is
      // `div.fa-toolbar`, which is ALREADY one of the two regions that term counts, so making
      // it glass changed nothing — 2 -> 2, `movedOne: false` — and a product FAIL that the
      // walk had measured correctly was reported as `VOID - negative control did not falsify`.
      // The instrument was scoring its own control's target. So: pick the first Work region
      // the scored term does NOT already contain (`translucentBacking` falsy). On `files` that
      // is 24 of the 26 Work regions; on a clean surface it is all of them, so every baseline
      // banked before this correction re-derives identically.
      const work = workRows.find((row) => !row.translucentBacking) || null;
      if (!work) {
        // No ANCHORED runtime Work region: either the surface has no Work at all, or every
        // Work region it has is already on glass and so is already inside the failing term.
        // Both leave controls A and B nothing to move, so falsify by planting instead of by
        // perturbing. See `plantControls` for why the old VOID here was the instrument's
        // limit, not the surface's defect.
        const planted = await plantControls();
        if (planted.refuse) throw new Error(planted.refuse);
        const dirty = await read();
        const removed = await removePlants();
        const restored = await read();

        const movedEligible = dirty.eligibleTotal === base.eligibleTotal + 1;
        const sharedHeld = dirty.sharedPrimitiveEligible === base.sharedPrimitiveEligible;
        const movedDense = dirty.denseWorkOnTranslucent === base.denseWorkOnTranslucent + 1;
        const returned = JSON.stringify(metricTuple(restored)) === JSON.stringify(metricTuple(base));
        const cleaned = removed.stillMounted === 0;
        const proven = movedEligible && sharedHeld && movedDense && returned && cleaned;
        out.control = {
          kind: 'plant',
          why: workRows.length === 0
            ? 'the surface has no runtime Work region; controls A and B have nothing to perturb'
            : `all ${workRows.length} runtime Work regions are already on translucent backing, so`
              + ' control A has no anchored rival to make glass; planting instead',
          plantSidePx: planted.side,
          counts: {
            base: metricTuple(base),
            planted: metricTuple(dirty),
            restored: metricTuple(restored),
          },
          movedEligible,
          sharedHeld,
          movedDense,
          returned,
          cleaned,
          // What the bars WOULD have read while the plants were mounted — the low score the
          // rubric requires this category to be able to produce, on this surface.
          barsWhilePlanted: {
            denseWorkAnchored: dirty.denseWorkOnTranslucent === 0,
            sharedPrimitives: dirty.eligibleTotal > 0
              && dirty.sharedPrimitiveEligible === dirty.eligibleTotal,
          },
          verdict: proven
            ? 'CONTROL FAILED AS REQUIRED - category 3 instrument is proven by plant'
            : 'VOID - the planted control did not falsify and restore',
        };
        if (!proven) {
          out.verdict = 'VOID - negative control did not falsify';
        } else if (base.eligibleTotal === 0) {
          // A denominator of zero is now a MEASURED zero: control C proved the walk would have
          // counted a contextual region had one existed, and control D that it would have caught
          // dense work on glass. §2.3 asks that Liquid be used where the plan says to and nowhere
          // else — a surface with no navigation, transport or inspector chrome satisfies both
          // halves vacuously, and that is a pass, not a FAIL for an absent denominator.
          out.bars.contextualTreated = true;
          out.bars.sharedPrimitives = true;
          out.vacuousContextual = true;
          out.verdict = Object.values(out.bars).every(Boolean)
            ? 'PASS 10/10'
            : 'FAIL';
          out.failedBars = Object.entries(out.bars)
            .filter(([, value]) => !value).map(([name]) => name);
        }
      } else {
        const one = await injectOne(work.path);
        if (one.refuse) throw new Error(one.refuse);
        const dirtyOne = await read();
        const oneRestored = await restoreOne(work.path, one.before);

        const all = await injectAllGlass();
        if (all.refuse) throw new Error(all.refuse);
        const dirtyAll = await read();
        const allRestored = await restoreAllGlass(all.before);

        const workPaths = base.detail
          .filter((row) => row.role === 'Work' && Array.isArray(row.path))
          .map((row) => row.path);
        const ung = await injectUnground(workPaths);
        if (ung.refuse) throw new Error(ung.refuse);
        const dirtyUnground = await read();
        const ungRestored = await restoreUnground();
        const restored = await read();

        const movedOne = dirtyOne.denseWorkOnTranslucent > base.denseWorkOnTranslucent;
        const allWorkFailed = dirtyAll.denseWorkOnTranslucent === dirtyAll.byRole.Work
          && dirtyAll.byRole.Work === base.byRole.Work;
        // Control E asserts a different CAUSE from B: no blur is injected anywhere, so the only
        // thing that can move this number is the loss of the opaque ground. But "every Work
        // region must fail" is the WRONG assertion here and measured 19 of 20 on `grammar` on
        // its first run — a region that paints its OWN opaque background is still grounded
        // when its ancestors lose theirs, and correctly so. The exact assertion is: the count
        // must move, and every Work region that SURVIVES must survive on its own paint rather
        // than on borrowed ground. That keeps the leg strict without failing a surface for a
        // region the control cannot reach by construction.
        const ungroundSurvivors = (dirtyUnground.detail || [])
          .filter((r) => r.role === 'Work' && r.grounded)
          .map((r) => ({ sel: r.sel, ownAlpha: r.ownAlpha, groundedReason: r.groundedReason }));
        // CORRECTION 37, 2026-09-04 (primary), measured on `city`. The survivor exemption above
        // has a limit case the previous correction did not reach: when EVERY baseline Work
        // region already paints its own opaque ground, control E has no borrowed ground left to
        // remove and the count CANNOT move — so `> base` is unsatisfiable and the leg VOIDs a
        // surface that has no defect. City is the extreme: one Work region,
        // `div.reading-garden-info-music`, anchored on its own `ownAlpha 1` paint, marked 4
        // ancestors, count 0 -> 0, and `ungroundSurvivors` said exactly why
        // ("opaque ground at div.reading-garden-info-music=1"). That is the fix E exists to
        // reward, and it read as the instrument failing.
        //
        // So the vacuous branch is admitted, but only when it is PROVEN from the measured
        // baseline rather than inferred from a zero: every Work region self-painted at
        // baseline, at least one Work region to speak of, ground actually reached
        // (`ung.marked > 0`), and the count genuinely unmoved. Nothing is relaxed for a surface
        // with any borrowed-ground region — one such region and the `>` bar applies as before.
        // Control B is unaffected and still requires every Work region to fail when the whole
        // surface is made glass, so the walk's ability to see THIS region fail is still proven
        // this run; only E's own claim, about borrowed ground, has an empty subject.
        const baseWorkOwnAlphas = (base.detail || [])
          .filter((r) => r.role === 'Work')
          .map((r) => ({ sel: r.sel, ownAlpha: r.ownAlpha }));
        const ungroundVacuous = base.byRole.Work > 0
          && ung.marked > 0
          && baseWorkOwnAlphas.every((r) => typeof r.ownAlpha === 'number' && r.ownAlpha >= 0.95)
          && dirtyUnground.denseWorkOnTranslucent === base.denseWorkOnTranslucent;
        const ungroundedAllFailed = dirtyUnground.byRole.Work === base.byRole.Work
          && (ungroundVacuous || dirtyUnground.denseWorkOnTranslucent > base.denseWorkOnTranslucent)
          && ungroundSurvivors.every((r) => typeof r.ownAlpha === 'number' && r.ownAlpha >= 0.95);
        const ungroundReturned = !ungRestored.styleStillMounted && ungRestored.attributesLeft === 0;
        const returned = JSON.stringify(metricTuple(restored)) === JSON.stringify(metricTuple(base));
        const oneMaterialReturned = oneRestored.material === one.before.material
          && normalizedInlineStyle(oneRestored.style) === normalizedInlineStyle(one.before.style);
        const allGlassReturned = !allRestored.styleStillMounted
          && allRestored.attribute === all.before;
        out.control = {
          target: { sel: work.sel, path: work.path },
          counts: {
            base: metricTuple(base),
            oneRegionGlass: metricTuple(dirtyOne),
            allGlass: metricTuple(dirtyAll),
            ungrounded: metricTuple(dirtyUnground),
            restored: metricTuple(restored),
          },
          movedOne,
          allWorkFailed,
          ungroundedAllFailed,
          ungroundVacuous,
          baseWorkOwnAlphas,
          ungroundReturned,
          ungroundMarked: ung.marked,
          ungroundSurvivors,
          returned,
          oneMaterialReturned,
          oneMaterial: {
            before: one.before.material,
            immediate: oneRestored.immediateMaterial,
            settled: oneRestored.material,
          },
          allGlassReturned,
          verdict: movedOne && allWorkFailed && ungroundedAllFailed && returned
            && oneMaterialReturned && allGlassReturned && ungroundReturned
            ? 'CONTROL FAILED AS REQUIRED - category 3 instrument is proven'
            : 'VOID - negative control did not falsify and restore',
        };
        if (!out.control.verdict.startsWith('CONTROL FAILED')) {
          out.verdict = 'VOID - negative control did not falsify';
        } else if (base.eligibleTotal === 0) {
          /*
           * CORRECTION — this branch was a false-FAIL generator, and it fired on the first
           * surface that reached it. A surface can legitimately hold a Work region AND no
           * contextual chrome at all: the Flashcards review is exactly that shape, and §2.3's
           * own words ("context, preview, scheduling detail, session summaries") are what make
           * its zero the CORRECT answer. Both eligibility bars are computed
           * `eligibleTotal > 0 && ...`, so that zero printed `verdict: FAIL` on
           * `contextualTreated` and `sharedPrimitives` beside a `denseWorkAnchored` pass — the
           * bar the bullet is actually about. Measured 2026-09-03 on the live review:
           * Work 1 / Anchor 29 / Liquid-eligible 0, two bars false for an absent denominator.
           *
           * The `if (!work)` branch above already forgives this, but ONLY there, and only
           * because control C proves the walk would have counted a contextual region had one
           * existed. Controls A and B never ask that question — they perturb material on
           * regions that already exist — so `work` being truthy made the forgiving branch
           * unreachable. The answer is to run the same plant here, never to widen the bars: a
           * zero is forgiven when it has been MEASURED, and not otherwise.
           */
          const planted = await plantControls();
          if (planted.refuse) throw new Error(planted.refuse);
          const dirtyPlant = await read();
          const removedPlant = await removePlants();
          const afterPlant = await read();

          const eligibilityFired = dirtyPlant.eligibleTotal === base.eligibleTotal + 1;
          const sharedHeldUnderPlant = dirtyPlant.sharedPrimitiveEligible === base.sharedPrimitiveEligible;
          const plantReturned = JSON.stringify(metricTuple(afterPlant)) === JSON.stringify(metricTuple(base));
          const plantCleaned = removedPlant.stillMounted === 0;
          const measuredZero = eligibilityFired && sharedHeldUnderPlant && plantReturned && plantCleaned;

          out.control.eligibilityPlant = {
            why: 'both eligibility bars read `eligibleTotal > 0 && ...`; controls A and B never'
              + ' test whether the walk can COUNT a contextual region, so a correct zero read FAIL',
            plantSidePx: planted.side,
            counts: {
              base: metricTuple(base),
              planted: metricTuple(dirtyPlant),
              restored: metricTuple(afterPlant),
            },
            eligibilityFired,
            sharedHeldUnderPlant,
            plantReturned,
            plantCleaned,
            // The low score this category must still be able to produce on THIS surface: with
            // the nav mounted the denominator is 1 and untreated, so `sharedPrimitives` is false.
            barsWhilePlanted: {
              contextualTreated: dirtyPlant.eligibleTotal > 0
                && dirtyPlant.liquidTreatedEligible === dirtyPlant.eligibleTotal,
              sharedPrimitives: dirtyPlant.eligibleTotal > 0
                && dirtyPlant.sharedPrimitiveEligible === dirtyPlant.eligibleTotal,
            },
            verdict: measuredZero
              ? 'CONTROL FIRED AS REQUIRED - the zero denominator is a MEASURED zero'
              : 'VOID - the eligibility plant did not fire and restore',
          };

          if (measuredZero) {
            out.bars.contextualTreated = true;
            out.bars.sharedPrimitives = true;
            out.vacuousContextual = true;
            out.verdict = Object.values(out.bars).every(Boolean) ? 'PASS 10/10' : 'FAIL';
            out.failedBars = Object.entries(out.bars)
              .filter(([, value]) => !value).map(([name]) => name);
          } else {
            // An unproven zero is worse than a failing one: it means the walk itself is silent.
            out.verdict = 'VOID - the eligibility plant did not fire, so the zero is unmeasured';
          }
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
        var planted = [].slice.call(document.querySelectorAll('[data-lq-cat3-plant]'));
        for (var i = 0; i < planted.length; i += 1) planted[i].remove();
        var root = ${ROOT_EXPR};
        if (root) root.removeAttribute('data-lq-cat3-control-all-glass');
        return true;
      })()`);
    } catch { /* the renderer may have exited; the style exits with it */ }
    try { await cleanupGlobals(); } catch { /* same */ }
    if (restorePresentationTo) {
      // The window's presentation is persisted state. A harness that drives it and exits owes
      // the next worker the state it found, whether or not the score passed.
      try {
        const back = await clickPresentationToggle(restorePresentationTo);
        const backMode = back.liquid ? 'liquid' : 'standard';
        if (backMode !== restorePresentationTo) {
          console.error(`WARNING - presentation left as ${backMode}, expected`
            + ` ${restorePresentationTo}; toggle it back by hand.`);
        }
      } catch {
        console.error(`WARNING - could not restore presentation to ${restorePresentationTo}.`);
      }
    }
  }
})().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(4);
});
