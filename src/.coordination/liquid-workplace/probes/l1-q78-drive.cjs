/**
 * L1 instrument — rubric category 5, questions Q7 and Q8, which `l1-ui-clarity.js` returns
 * as `MEASURE` because they need a ROUND TRIP and a single `/eval` cannot drive one.
 *
 *   Q7 "standard mode remains fully normal"
 *   Q8 "Liquid can be turned off without losing state"
 *
 * Both were `NO-SUBJECT` on every surface when L1 first ran: there were 0 Liquid-presentation
 * toggles anywhere, so there was no second term. L3 landed `button.fwin-b-liquid` (the ◆/◇ in
 * the window bar, `aria-pressed`), so the subject now exists and the honest thing is to measure
 * it rather than keep recording an absence.
 *
 * WHY A DRIVER AND NOT A PROBE FILE. The debug bridge never awaits a promise, and React needs a
 * paint between the click and the read. So each leg is its own `/eval` with a real sleep between
 * them, and every snapshot is parked on `window.__q78` so nothing depends on a return value
 * surviving a re-render.
 *
 * WHAT EACH QUESTION IS TURNED INTO, stated so the bar can be argued with:
 *   Q7 standard is "fully normal" = 0 painted regions carrying a `backdrop-filter`, the same
 *      control-label set as liquid, the same result count, and geometry inside 1 px. A window
 *      that keeps glass while claiming to be standard is the exact §2 failure.
 *   Q8 "without losing state" = the liquid → standard → liquid round trip returns the same
 *      result count, the same body text length, the same scroll offset, the same focused element
 *      and the same control-label set. Text length is included because a count can survive while
 *      the rows themselves are re-fetched empty.
 *
node src/.coordination/liquid-workplace/probes/l1-q78-drive.cjs [--control q7|q8] [--title Dictionary]
 *
 * WINDOW RESOLUTION IS BY TITLE, AND THAT IS A REPAIR, NOT A PREFERENCE (2026-08-24). Every
 * selector below used to take the first VISIBLE `.fwin` in DOM order. That was written when
 * `l7d-setup.cjs` hid the other windows, and it silently drove the wrong surface the moment it
 * did not: on a desktop carrying Media (820x580) and Video (1080x700) alongside the Liquid
 * Dictionary window, DOM order puts Media first, and this driver refused with "window is not
 * liquid at the start" — a refusal that reads like a product finding and is an instrument bug.
 * The two L8 probes were fixed the same way in `23cc333f` for the same reason.
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const titleIdx = process.argv.indexOf('--title');
const TITLE =
  (process.argv.find((a) => a.startsWith('--title=')) || '').split('=')[1] ||
  (titleIdx >= 0 ? process.argv[titleIdx + 1] : '') ||
  'Dictionary';
/**
 * One expression, inlined into every leg, so the snapshot, the toggle click and both controls
 * cannot disagree about which window they are acting on — the way they did when each carried
 * its own copy of the "first visible .fwin" walk.
 */
const WIN = `([].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
  var r = w.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  var t = w.querySelector('.fwin-title-text, .fwin-title');
  return !!t && (t.textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0;
})[0])`;
/**
 * WHAT A "RESULT ROW" IS ON THIS SURFACE. Q8's whole question is whether the round trip loses
 * state, and the row count is the load-bearing half of that; the empty-harness refusal below is
 * what stops a clean score being read off a window with nothing in it. Both were hardcoded to
 * `.dict-entry`, which is the Dictionary's row and nothing else — so pointing the driver at Video
 * refused with *"0 dict-entry rows"*, a refusal that reads like a finding about the Media Center
 * and is an instrument bug, the same shape as the "first visible .fwin" walk this file already
 * repaired. The selector is now a list tried in order, the first non-empty one wins, and the
 * winner is reported as `rowSelector` so no reader has to guess which population was counted.
 * `--rows <css>` overrides it for a surface not listed here.
 */
const rowsIdx = process.argv.indexOf('--rows');
const ROWS = (process.argv.find((a) => a.startsWith('--rows=')) || '').split('=')[1]
  || (rowsIdx >= 0 ? process.argv[rowsIdx + 1] : '')
  || '.dict-entry,.medialib-card,.medialib-ep';
const ROW_SEL = `(function(w){
  var list = ${JSON.stringify(ROWS)}.split(',');
  for (var i = 0; i < list.length; i += 1) { if (w.querySelectorAll(list[i]).length) return list[i]; }
  return list[0];
})`;
const ctlIdx = process.argv.indexOf('--control');
const ctlEq = (process.argv.find((a) => a.startsWith('--control=')) || '').split('=')[1];
// `indexOf` returns -1 when the flag is absent, and `argv[-1 + 1]` is argv[0] — the node
// binary's own path, which is truthy. The first version of this line therefore ran EVERY
// unflagged invocation as a control run and refused to park its verdicts.
const control = ctlEq || (ctlIdx >= 0 ? (process.argv[ctlIdx + 1] || '') : '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 400)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

/** Snapshot source, inlined into each leg so the reads are byte-identical across legs. */
const SNAP = `
(function snap(tag){
  // Resolved BY TITLE — see the header. Neither "the first .fwin" nor "the first VISIBLE .fwin"
  // is the one under test: the first is hidden when l7d-setup.cjs isolates the surface, and the
  // first visible one is whichever app happens to sit earliest in DOM order.
  var win = ${WIN};
  if (!win) return { tag: tag, refuse: 'no visible .fwin titled ' + ${JSON.stringify(TITLE)} };
  var painted = function (e) {
    return typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
      : true;
  };
  var CTRL = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],summary';
  var controls = [].slice.call(win.querySelectorAll(CTRL)).filter(painted);
  // The presentation toggle is EXCLUDED from the parity set on purpose. Its own label and
  // aria-label are supposed to change across the round trip ("Make liquid" <-> "Return to
  // standard"); counting that as a lost feature is how the first run of this probe scored Q7
  // NO for the control working correctly.
  var parityControls = controls.filter(function (c) { return !c.classList.contains('fwin-b-liquid'); });
  var labels = parityControls.map(function (c) {
    return (c.getAttribute('aria-label') || c.title || (c.textContent || '').trim() || c.tagName.toLowerCase())
      .replace(/\\s+/g, ' ').slice(0, 40);
  }).sort();
  var toggleLabel = (function () {
    var b = win.querySelector('.fwin-b-liquid');
    return b ? (b.getAttribute('aria-label') || '').replace(/\\s+/g, ' ') : null;
  })();
  var liquidRegions = [].slice.call(win.querySelectorAll('*')).filter(function (e) {
    if (!painted(e)) return false;
    var cs = getComputedStyle(e);
    var bf = cs.backdropFilter || cs.webkitBackdropFilter;
    return bf && bf !== 'none';
  });
  /**
   * THE TREATMENT THAT ACTUALLY DISCRIMINATES ON THIS SURFACE. Counting backdrop-filter
   * regions returns 0 in BOTH presentations here and so measures nothing: \`liquid-window.css\`
   * documents that the blur is deliberately absent because \`.fwin\` carries
   * \`transform: translateZ(0)\` and is therefore a backdrop root, so a backdrop-filter inside it
   * would sample the window's own opaque body. This surface expresses Liquid as translucency +
   * border + radius + shadow + padding on \`.lq-contextual\`, painted only under \`.fwin-liquid\`.
   * So read THAT, per region, and let Q7 assert it is fully absent in standard.
   */
  var contextual = [].slice.call(win.querySelectorAll('.lq-contextual')).map(function (e) {
    var cs = getComputedStyle(e);
    var r = e.getBoundingClientRect();
    return {
      cls: String(e.className || '').replace('lq-contextual', '').trim(),
      bg: cs.backgroundColor,
      borderTop: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
      shadow: cs.boxShadow === 'none' ? 'none' : 'set',
      padTop: cs.paddingTop,
      box: Math.round(r.width) + 'x' + Math.round(r.height)
    };
  });
  var alphaOf = function (s) {
    var m = String(s).match(/-?[\\d.]+/g);
    return m && m.length >= 4 ? Number(m[3]) : (/transparent/.test(String(s)) ? 0 : 1);
  };
  var painting = contextual.filter(function (c) {
    return alphaOf(c.bg) > 0.02 || parseFloat(c.borderTop) > 0 || c.shadow === 'set';
  });
  var scroller = null, best = 0;
  [].slice.call(win.querySelectorAll('*')).forEach(function (e) {
    if (e.scrollHeight - e.clientHeight > best) { best = e.scrollHeight - e.clientHeight; scroller = e; }
  });
  var r = win.getBoundingClientRect();
  var ae = document.activeElement;
  var input = win.querySelector('input[type="text"], input:not([type]), input[type="search"]');
  return {
    tag: tag,
    presentation: win.getAttribute('data-presentation'),
    hasLiquidClass: win.classList.contains('fwin-liquid'),
    ariaPressed: (win.querySelector('.fwin-b-liquid') || {}).getAttribute
      ? win.querySelector('.fwin-b-liquid').getAttribute('aria-pressed') : null,
    rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    zIndex: getComputedStyle(win).zIndex,
    focusedClass: win.classList.contains('focused'),
    rowSelector: ${ROW_SEL}(win),
    entries: win.querySelectorAll(${ROW_SEL}(win)).length,
    chars: (win.textContent || '').length,
    nodes: win.querySelectorAll('*').length,
    controls: controls.length,
    parityControls: parityControls.length,
    controlLabels: labels,
    toggleLabel: toggleLabel,
    liquidRegions: liquidRegions.length,
    contextualRegions: contextual.length,
    contextualPainting: painting.length,
    contextual: contextual,
    scrollTop: scroller ? Math.round(scroller.scrollTop) : 0,
    scrollHost: scroller ? scroller.tagName.toLowerCase() + '.' + String(scroller.className || '').split(' ')[0] : null,
    focused: ae ? ae.tagName.toLowerCase() + '.' + String(ae.className || '').split(' ')[0] : null,
    searchValue: input ? input.value : null
  };
})`;

const clickToggle = `(() => {
  const w = ${WIN};
  const b = w && w.querySelector('.fwin-b-liquid');
  if (!b) return JSON.stringify({ clicked: false, why: 'no .fwin-b-liquid on the window titled ' + ${JSON.stringify(TITLE)} });
  const before = b.getAttribute('aria-pressed');
  b.click();
  return JSON.stringify({ clicked: true, ariaPressedBefore: before });
})()`;

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const out = { control: control || null, legs: {} };

  out.legs.liquidBefore = await ev(`JSON.stringify(${SNAP}('liquidBefore'))`);
  if (out.legs.liquidBefore.refuse) throw new Error(out.legs.liquidBefore.refuse);
  if (!out.legs.liquidBefore.hasLiquidClass) {
    throw new Error('window is not liquid at the start — arm it first, this probe measures the round trip out of liquid');
  }
  if (out.legs.liquidBefore.entries === 0) {
    throw new Error(`0 ${out.legs.liquidBefore.rowSelector} rows — the rubric caps an empty harness at 0; load the surface first`);
  }

  // --- CONTROL Q7: paint a backdrop-filter that will SURVIVE into standard mode. -------------
  // A standard window carrying glass is exactly what Q7 must be able to answer NO about.
  if (control === 'q7') {
    await ev(`(() => {
      // Same window-resolution trap as SNAP above: planting the glass anywhere other than the
      // window SNAP reads means the control silently does not fire — it reported
      // zeroBackdropRegions true and left Q7 at YES, i.e. certified nothing.
      const w = ${WIN};
      const t = (w && w.querySelector('.fwin-body')) || w;
      const d = document.createElement('div');
      d.id = '__q78ctl';
      d.className = 'lq-contextual';
      // Painted INLINE, so the cascade cannot take it away when the window leaves liquid. This
      // is a region that keeps its Liquid treatment in standard mode — precisely the §2 failure
      // Q7 exists to catch — and it must also flip the backdrop check.
      d.setAttribute('style', 'position:absolute;left:8px;top:8px;width:120px;height:60px;backdrop-filter:blur(6px);background:rgba(255,255,255,.2);border-top:1px solid rgba(255,255,255,.3);z-index:9');
      t.appendChild(d);
      return JSON.stringify({ planted: !!document.getElementById('__q78ctl') });
    })()`);
  }

  await ev(clickToggle);
  await sleep(900);
  out.legs.standard = await ev(`JSON.stringify(${SNAP}('standard'))`);

  // --- CONTROL Q8: destroy real state while standard, so the round trip cannot restore it. ---
  if (control === 'q8') {
    await ev(`(() => {
      const w = ${WIN};
      if (!w) return JSON.stringify({ removed: 0, why: 'window not found' });
      const sel = ${ROW_SEL}(w);
      const rows = w.querySelectorAll(sel);
      const n = rows.length;
      if (n) rows[n - 1].remove();
      return JSON.stringify({ sel: sel, removed: n - w.querySelectorAll(sel).length });
    })()`);
  }

  await ev(clickToggle);
  await sleep(900);
  out.legs.liquidAfter = await ev(`JSON.stringify(${SNAP}('liquidAfter'))`);

  if (control === 'q7') {
    await ev(`(() => { const e = document.getElementById('__q78ctl'); if (e) e.remove(); return JSON.stringify({ remaining: document.querySelectorAll('#__q78ctl').length }); })()`);
  }

  const L0 = out.legs.liquidBefore;
  const S = out.legs.standard;
  const L1 = out.legs.liquidAfter;

  const rectClose = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 1);

  const q7checks = {
    presentationIsStandard: S.presentation === 'standard' && S.hasLiquidClass === false,
    // The discriminating half: every contextual region must go back to painting NOTHING, and
    // liquid must have been painting them in the first place — otherwise "0 in standard" is
    // just a surface with no Liquid treatment at all, which would pass for the wrong reason.
    liquidWasPainting: L0.contextualPainting > 0,
    zeroLiquidTreatmentInStandard: S.contextualPainting === 0,
    zeroBackdropRegions: S.liquidRegions === 0,
    sameControlSet: eq(S.controlLabels, L0.controlLabels),
    sameResults: S.entries === L0.entries,
    geometryWithin1px: rectClose(S.rect, L0.rect),
  };
  const q8checks = {
    returnedToLiquid: L1.presentation === 'liquid' && L1.hasLiquidClass === true,
    sameResults: L1.entries === L0.entries,
    sameTextLength: L1.chars === L0.chars,
    sameScrollTop: L1.scrollTop === L0.scrollTop,
    sameFocus: L1.focused === L0.focused,
    sameControlSet: eq(L1.controlLabels, L0.controlLabels),
    sameSearchValue: L1.searchValue === L0.searchValue,
    geometryWithin1px: rectClose(L1.rect, L0.rect),
  };

  out.q7 = { verdict: Object.values(q7checks).every(Boolean) ? 'YES' : 'NO', checks: q7checks };
  out.q8 = { verdict: Object.values(q8checks).every(Boolean) ? 'YES' : 'NO', checks: q8checks };
  out.liquidRegions = { liquidBefore: L0.liquidRegions, standard: S.liquidRegions, liquidAfter: L1.liquidRegions };
  out.contextualPainting = { liquidBefore: L0.contextualPainting, standard: S.contextualPainting, liquidAfter: L1.contextualPainting, regions: L0.contextualRegions };
  out.toggleLabel = { liquidBefore: L0.toggleLabel, standard: S.toggleLabel, liquidAfter: L1.toggleLabel };
  out.contextualDetail = { liquidBefore: L0.contextual, standard: S.contextual };
  out.entries = { liquidBefore: L0.entries, standard: S.entries, liquidAfter: L1.entries };
  out.chars = { liquidBefore: L0.chars, standard: S.chars, liquidAfter: L1.chars };
  out.controls = { liquidBefore: L0.controls, standard: S.controls, liquidAfter: L1.controls };
  out.rects = { liquidBefore: L0.rect, standard: S.rect, liquidAfter: L1.rect };

  /**
   * Park the verdicts where `probes/l1-ui-clarity.js` reads them, so one clarity run can report
   * all ten questions with Q7/Q8 marked `drivenBy` this file. A CONTROL run is deliberately NOT
   * parked — a planted failure must never be able to leak into a score.
   */
  if (!control) {
    await ev(`(() => { window.__q78verdict = ${JSON.stringify({ q7: out.q7, q8: out.q8, at: new Date().toISOString() })}; return JSON.stringify({ parked: !!window.__q78verdict, q7: window.__q78verdict.q7.verdict, q8: window.__q78verdict.q8.verdict }); })()`);
    out.parkedOnWindow = '__q78verdict';
  } else {
    out.parkedOnWindow = null;
    out.note = 'control run — verdicts deliberately NOT parked, so a planted failure cannot reach a score';
  }

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
