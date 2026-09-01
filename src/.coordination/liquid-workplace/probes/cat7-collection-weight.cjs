/**
 * RUBRIC CATEGORY 7 HARNESS — "performance under real load", collection weight.
 *
 * ONE harness for every scrolling collection in the app, parameterised by surface.
 * It replaces the ad-hoc `document.querySelectorAll(...).length` evals that L6 and
 * L7 have each written from scratch (l7v-load.cjs's `nodes`, the L6 Immersion rail
 * measurement, the Dictionary result-list counts). Nothing here names a surface: the
 * window title, the scroll container and the row are all arguments.
 *
 * What it reports, all numbers, never an adjective:
 *   rows            how many rows the collection HAS (the data size)
 *   domRows         how many of them exist in the DOM right now
 *   nodes           element count inside the container (the real cost)
 *   scrollHeight    the laid-out height
 *   clientHeight    the viewport actually showing it
 *   overdraw        scrollHeight / clientHeight, to 1 decimal
 *   heights         distinct row heights with their counts — a FIXED-height
 *                   windowed list is wrong if this has more than one entry
 *   spacerHeight    height of the virtualiser's total-height spacer, if any
 *
 * VERDICT is computed, not asserted:
 *   EMPTY       rows === 0. The rubric caps a category measured on an empty
 *               harness at 0, so this REFUSES rather than reporting a pass.
 *   UNWINDOWED  domRows === rows and overdraw > 2 — every row is in the DOM.
 *   WINDOWED    domRows < rows.
 *   INERT       a virtualiser is present (spacer found) but domRows === rows.
 *               This repo has shipped exactly that before (4e2c46e1), which is
 *               why it is a distinct verdict and not folded into WINDOWED.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/cat7-collection-weight.cjs \
 *     --title Immersion --container .immersion-rail --row ".immersion-site-list li" \
 *     [--label immersion-sites] [--scroller .immersion-site-list] [--out <file>]
 *
 * --container is the subtree whose nodes are counted. --scroller is the element
 * that actually scrolls, when it is not the container itself.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const TITLE = arg('title', '');
const CONTAINER = arg('container', '');
const ROW = arg('row', '');
const SCROLLER = arg('scroller', '');
const LABEL = arg('label', CONTAINER.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'collection');
const OUT = arg('out', '');
if (!CONTAINER || !ROW) {
  console.error('REFUSE - --container and --row are required; this harness names no surface of its own');
  process.exit(2);
}

const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
const post = async (route, body) => (await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
  method: 'POST', headers: H, body: JSON.stringify(body || {}),
})).json();
async function ev(js) {
  const t = await post('/eval', { js: js.replace(/\s*;\s*$/, '').trimEnd() });
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  return t.result;
}

// Scope to a floating window BY TITLE when one is asked for, never by index —
// `probe-picks-first-visible-fwin` is a recorded false-scoring in this repo.
// With no --title the whole document is the scope, which is what a full-window
// surface (Settings, a pop-out) needs.
// Correction 29, 2026-08-31: `--title @<selector>` names the window STRUCTURALLY, for the
// frameless windows that carry no title element. Same form as cat4/cat8's `--surface
// @.fwin-frameless` and the interaction probe's `-Title`, so one convention names a
// titleless window in every category. Substring-matching a titleless window would fall
// through to "no window", and this probe would then refuse on a surface that is on screen.
const TITLE_SELECTOR = TITLE.charAt(0) === '@' ? TITLE.slice(1) : '';
const SCOPE = TITLE
  ? `([].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
      var r = w.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      ${TITLE_SELECTOR
    ? `return w.matches(${JSON.stringify(TITLE_SELECTOR)}) || !!w.querySelector(${JSON.stringify(TITLE_SELECTOR)});`
    : `var t = w.querySelector('.fwin-title-text, .fwin-title');
      return !!t && (t.textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0;`}
    })[0])`
  : '(document)';

const measure = `(function(){
  var scope = ${SCOPE};
  if (!scope) return JSON.stringify({ refuse: 'no window titled ' + ${JSON.stringify(TITLE)} });
  var c = scope.querySelector(${JSON.stringify(CONTAINER)});
  if (!c) return JSON.stringify({ refuse: 'container not found: ' + ${JSON.stringify(CONTAINER)} });
  var rows = [].slice.call(c.querySelectorAll(${JSON.stringify(ROW)}));
  var scroller = ${SCROLLER ? `(function(){
    // --scroller USED to be c.querySelector(sel) || c, which searches DOWN from the container
    // only. A list that is not virtualised scrolls in an ANCESTOR - Dictionary's results live in
    // .fwin-body - so the lookup missed, fell back to the container, and the run reported
    // scroller "dict-entries" / overdraw 1 for a viewport that is really 2633 over 545. A silent
    // fallback that prints a clean number is the failure mode this file exists to avoid, so an
    // ancestor is now searched too and a --scroller that resolves to nothing REFUSES.
    var s = c.querySelector(${JSON.stringify(SCROLLER)});
    if (s) return s;
    for (var p = c.parentElement; p; p = p.parentElement) {
      if (p.matches && p.matches(${JSON.stringify(SCROLLER)})) return p;
      if (p === scope) break;
    }
    var inScope = scope.querySelector(${JSON.stringify(SCROLLER)});
    if (inScope && inScope.contains(c)) return inScope;
    return null;
  })()` : `(function(){
    // Rank by overflow, but a collection's viewport cannot be 20px tall. Without
    // the floor this picked a \`dict-star\` button overflowing by 6px over the
    // real results region, and reported clientHeight 20 for a 545px surface.
    var best = c, bestOver = -1, all = [c].concat([].slice.call(c.querySelectorAll('*')));
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (e.clientHeight < 40) continue;
      var o = e.scrollHeight - e.clientHeight;
      if (o > bestOver) { bestOver = o; best = e; }
    }
    return best;
  })()`};
  if (!scroller) return JSON.stringify({ refuse: 'scroller not found or does not contain the container: ' + ${JSON.stringify(SCROLLER || '')} });
  var hs = {};
  for (var i = 0; i < rows.length; i++) {
    var h = Math.round(rows[i].getBoundingClientRect().height * 100) / 100;
    hs[h] = (hs[h] || 0) + 1;
  }
  // A virtualiser's total-height spacer: a child taller than the scroller's own
  // client box that contains no rows of its own directly.
  //
  // The second half of that sentence was DESCRIBED here and never implemented, and while the
  // scroller was always the container the subtree was too small for it to matter. Once an
  // ancestor scroller became reachable it did: Dictionary's plain content wrapper (.dict-view,
  // 2601px inside a 545px .fwin-body) matched on height alone, so a PAGINATED list of 8 entries
  // was reported INERT - the harness's most serious verdict, meaning shipped virtualisation
  // that does nothing. A real spacer is an empty sizing element; one that holds the rows is
  // just the content. Both halves are now checked.
  var spacer = null;
  var kids = [].slice.call(scroller.querySelectorAll('div'));
  for (var k = 0; k < kids.length; k++) {
    var kh = kids[k].getBoundingClientRect().height;
    if (kh <= scroller.clientHeight * 1.5 || kh <= 200) continue;
    if (kids[k].querySelector(${JSON.stringify(ROW)})) continue;
    spacer = Math.round(kh); break;
  }
  return JSON.stringify({
    domRows: rows.length,
    nodes: c.querySelectorAll('*').length,
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
    scrollerClass: scroller.className || scroller.tagName,
    heights: hs,
    spacerHeight: spacer,
  });
})()`;

(async () => {
  const raw = await ev(measure);
  const m = JSON.parse(raw);
  if (m.refuse) throw new Error(`REFUSE - ${m.refuse}`);

  // The DATA size, which for a windowed list is NOT domRows. Supplied by the
  // caller when the store is reachable; otherwise inferred from the spacer.
  const totalExpr = arg('total', '');
  let rows = m.domRows;
  let rowsSource = 'domRows';
  if (totalExpr) {
    rows = Number(JSON.parse(await ev(`JSON.stringify({ n: (${totalExpr}) })`)).n);
    rowsSource = '--total';
  }

  const overdraw = m.clientHeight > 0 ? Math.round((m.scrollHeight / m.clientHeight) * 10) / 10 : null;
  const distinct = Object.keys(m.heights).length;
  let verdict;
  if (rows === 0) verdict = 'EMPTY';
  else if (m.domRows < rows) verdict = 'WINDOWED';
  else if (m.spacerHeight != null) verdict = 'INERT';
  else if (overdraw != null && overdraw > 2) verdict = 'UNWINDOWED';
  else verdict = 'FITS';

  const out = {
    label: LABEL, title: TITLE || null, container: CONTAINER, row: ROW,
    rows, rowsSource, domRows: m.domRows, nodes: m.nodes,
    scrollHeight: m.scrollHeight, clientHeight: m.clientHeight, overdraw,
    scroller: m.scrollerClass, distinctRowHeights: distinct, heights: m.heights,
    spacerHeight: m.spacerHeight, verdict, at: new Date().toISOString(),
  };
  console.log(JSON.stringify(out, null, 2));

  const file = OUT || path.join('src/.coordination/liquid-workplace/baselines', `cat7-${LABEL}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log('wrote', file);

  if (verdict === 'EMPTY') {
    throw new Error('REFUSE - 0 rows; the rubric caps a category measured on an empty harness at 0');
  }
})().catch((e) => { console.error(String(e && e.stack ? e.stack : e)); process.exit(1); });
