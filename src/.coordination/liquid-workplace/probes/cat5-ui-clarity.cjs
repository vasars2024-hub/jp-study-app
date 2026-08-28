/**
 * RUBRIC CATEGORY 5 HARNESS — "UI clarity and user-friendliness", ONE runner for every surface.
 *
 * RULE 1 (pin, 2026-08-25): eight harnesses, not eighty probes. This is the EIGHTH and last.
 * Category 5 had a good instrument and no runner: `probes/l1-ui-clarity.js` (493 lines) carries
 * every predicate and every bar, argued in its own comments and repaired four separate times —
 * but it walks `document.querySelectorAll('.fwin')` and scores whatever windows happen to be
 * open, so pointing it at a surface meant opening exactly one window and reading the right row
 * out of the output by eye. Three of the six L6 surfaces are not `.fwin` at all: Novels, the
 * manga reader and the VN panel replace the desktop shell, so on those the instrument returns
 * `windows: []` and scores nothing. That is the shape RULE 1 exists to stop.
 *
 * WHAT IS CONSOLIDATED HERE, and what is deliberately NOT re-implemented:
 *
 *   Q1 Q2 Q3 Q4 Q6 Q10   `l1-ui-clarity.js`'s predicates, ported to a ROOT that may be a
 *                        `.fwin` or a bare selector. Every bar is unchanged and every raw
 *                        component is still reported, so a reader can disagree with the bar
 *                        rather than only with the verdict.
 *   Q5                   swept live across two themes, here, because "stable contrast" is a
 *                        stability question and no committed per-surface contrast number in
 *                        this repo has a theme axis (`cat1-accessibility.cjs` records one
 *                        theme; `l1-q5-drive.cjs` sweeps two but resolves `.fwin` by title
 *                        only, so it cannot see half of L6).
 *   Q7 Q8 Q9             READ FROM CATEGORY 6's committed baseline for this surface. Q7 is
 *                        "standard mode remains fully normal" and Q8 is "Liquid can be turned
 *                        off without losing state" — those are, word for word, the `parity`
 *                        and `roundTrip` terms `cat6-feature-parity.cjs` already drives on a
 *                        live surface with its own mutation controls. Re-driving them here
 *                        would be a second, incomparable measurement of the same thing.
 *
 * NO CATEGORY-6 BASELINE, NO SCORE. When `baselines/cat6-<label>.json` is absent, Q7/Q8/Q9
 * read `MEASURE` and the run is VOID. This is load-bearing: the VN panel's category-6 cell is
 * PARKED on an empty library, and without this refusal VN would score its seven live questions
 * and read as a near-pass. A surface whose parity is unmeasured has not answered §10.4.
 *
 * THE NEGATIVE CONTROL (`--control`), which the rubric requires by name and which this
 * category needs more than most: "a surface that answered yes ten times on the first pass was
 * not really asked". The rubric phrases it as history; history cannot be re-run, so this is
 * the live equivalent, three plants aimed at three different questions, taken verbatim from
 * `l1-ui-clarity-control.js` and `l1-q5-drive.cjs`:
 *
 *   Q2   blank the surface's own title/heading            -> "location obvious" must go NO
 *   Q3   translate the primary action 4000px down         -> "visible without hunting" NO
 *   Q5   plant one span, #8a8a8a on #808080 = 1.07:1      -> "stable contrast" NO
 *   Q10  inject 6 uniform cards with SIX DIFFERENT control signatures -> "not a generic card
 *        dashboard" NO. This is the important one: the gallery discriminator exempts a
 *        uniform grid that repeats ONE kind of thing (13 theme swatches), and without a
 *        heterogeneous plant that exemption is indistinguishable from a blanket pass.
 *
 * A `--control` run that fails to move all four exits non-zero. An uncontrolled score is VOID,
 * not 10 — the rubric's words, and this repo has produced false passes three separate ways.
 *
 * TRAPS ALREADY PAID FOR, carried so they are not rediscovered:
 *  1. A 0x0 or minimised root measures as perfectly clear. REFUSE rather than record zeros.
 *  2. A theme swap is a 240 ms COLOUR TRANSITION and `getComputedStyle` during one returns the
 *     OLD colour, which reads exactly like a fix that did not land. Every theme cell settles.
 *  3. A closed `<details>`' child still reports its open box; only `checkVisibility` is true.
 *  4. The disclosure axis touches PERSISTED state (`details.mc-nav-group` is controlled and
 *     its `onToggle` writes localStorage). Capture-patch-restore, and the restore is compared
 *     with `===` before any verdict is computed.
 *  5. `.fwin-body` computes to `rgba(0,0,0,0)` — the fill is painted by an ancestor. Comparing
 *     against it compares against BLACK. `effectiveBg` walks up until something paints.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/cat5-ui-clarity.cjs --surface "Library" --label l6-library
 *   node src/.coordination/liquid-workplace/probes/cat5-ui-clarity.cjs --surface "@.reader" --label l6-manga --control
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const arg = (name, dflt) => {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.indexOf(`--${name}`) >= 0;

const SURFACE = arg('surface', '');
const WIN = arg('win', '');
const ALT_THEME = arg('alt', 'classic-light');
const CONTROL = has('control');
if (!SURFACE) {
  console.error('REFUSE - --surface is required; this harness names no surface of its own.');
  console.error('         A window title ("Library") or a root selector ("@.reader").');
  process.exit(2);
}
const IS_SELECTOR = SURFACE.startsWith('@');
const SELECTOR = IS_SELECTOR ? SURFACE.slice(1) : null;
const LABEL = arg('label', (SELECTOR || SURFACE).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase());
const BASE = path.join(__dirname, '..', 'baselines');
const OUT = arg('out', path.join(BASE, `cat5-${LABEL}${CONTROL ? '-control' : ''}.json`));
// A run that dies before it writes leaves the PREVIOUS run's file sitting there looking current.
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

const cfg = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'debug', 'bridge.json'), 'utf8',
));
const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function post(route, body) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ ...(WIN ? { window: WIN } : {}), ...(body || {}) }),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { raw: t, status: r.status }; }
}
/** One expression per /eval; a trailing `;` reads as the generic "Script failed to execute". */
async function ev(js) {
  const t = await post('/eval', { js: js.replace(/\s*;\s*$/, '').trimEnd() });
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 400)}`);
  // The bridge answers `result: null` both for an expression that THREW and for one that
  // returned nothing, so a null is never quietly treated as an answer.
  if (t.result === null) throw new Error('eval returned null — the expression threw or returned nothing');
  return t.result;
}
const evj = async (js) => JSON.parse(await ev(js));
const A = (v) => JSON.stringify(v);

/**
 * THE ROOT IS PINNED ON THE FIRST RESOLVE, and this is not an optimisation. Q2's control plant
 * BLANKS the window title — which is the whole point of it — and title is exactly what a
 * `.fwin` lookup resolves by, so a title-resolving expression refuses to find its own surface
 * the moment the control fires. The first `--control` run died `surface not found: Library`
 * three legs in, with the plants still in the live app. Resolve once, pin the node, and fall
 * back to the lookup only if the pin was lost (a remount). Cleared unconditionally at the end.
 */
const PIN = 'window.__cat5root';
const LOOKUP = IS_SELECTOR
  ? `document.querySelector(${A(SELECTOR)})`
  : `[].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
       var r = w.getBoundingClientRect();
       if (!(r.width > 0 && r.height > 0)) return false;
       var t = w.querySelector('.fwin-title-text, .fwin-title');
       return !!t && (t.textContent || '').indexOf(${A(SURFACE)}) >= 0;
     })[0]`;
const ROOT_EXPR = `((${PIN} && ${PIN}.isConnected) ? ${PIN} : (${LOOKUP}))`;

// ---------------------------------------------------------------------------- the snapshot
/**
 * The eight §10.4 questions answerable from one rendered frame, plus the contrast population
 * Q5's sweep consumes. Ported from `l1-ui-clarity.js`; the BARS ARE UNCHANGED and each one's
 * argument lives in that file's header, which stays the authority on why they sit where they do.
 */
const SNAP = `(function(){
  var root = ${ROOT_EXPR};
  if (!root) return JSON.stringify({ refuse: 'surface not found: ' + ${A(SURFACE)} });
  var R = root.getBoundingClientRect();
  if (!R.width || !R.height) return JSON.stringify({ refuse: 'surface is 0x0 (minimised or unmounted) - refusing to record zeros' });

  var CTRL = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],summary';
  function painted(e){
    return typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity:true, checkVisibilityCSS:true, contentVisibilityAuto:true })
      : true;
  }
  function name(e){ return e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]; }
  function parseRgb(s){
    var m = String(s).match(/-?[\\d.]+/g);
    if (!m) return null;
    var n = m.slice(0,3).map(Number);
    // color()/oklab() forms come back 0..1; a 0..255 form never has three sub-1 values.
    var allSmall = n.every(function(v){ return v <= 1; }) && n.some(function(v){ return v > 0; });
    return allSmall ? n.map(function(v){ return Math.round(v * 255); }) : n;
  }
  function alphaOf(s){
    var m = String(s).match(/-?[\\d.]+/g);
    if (m && m.length >= 4) return Number(m[3]);
    return /transparent|^none$/.test(String(s)) ? 0 : 1;
  }
  /**
   * Trap 5: .fwin-body computes transparent — the fill is an ancestor's. Walk up until it paints.
   *
   * TRAP 6, FOUND BY THIS HARNESS'S OWN FIRST RUN AND FIXED BEFORE ANY SCORE WAS BANKED. A
   * background-color-only walk skips right past a background-IMAGE. Library's fallback covers
   * are seeded gradients painted inline by \`useCoverArt\` (\`linear-gradient(135deg,
   * rgb(118,45,118), rgb(69,23,38))\`) over a .cover whose own background-color is
   * rgba(0,0,0,0) — so the walk landed on the white panel behind and scored white-on-white,
   * reporting TWO \`span.cover-title\` runs at exactly 1.00:1 in classic-light. That is a
   * fabricated product defect of the most convincing kind: an exact 1.00 reads as a real
   * collapse rather than as a miss. Every gradient stop is a candidate background and the run
   * is scored against the WORST of them, which is the conservative reading of "does any part
   * of this text fail". A url() image cannot be sampled from here at all, so it returns
   * UNMEASURABLE rather than a number — an unsampled background must never score as a pass.
   */
  function bgCandidates(el){
    var layers = [], from = [], unmeasurable = null;
    for (var n = el; n; n = n.parentElement) {
      var cs = getComputedStyle(n);
      var img = cs.backgroundImage || 'none';
      if (img !== 'none' && /url\\(/.test(img)) { unmeasurable = 'background-image: url() on ' + name(n); break; }
      if (img !== 'none' && /gradient\\(/.test(img)) {
        // TRAP 7's OTHER HALF, found on Games 2026-08-28. The trap-7 correction below was made
        // for background-COLOR and never reached this branch, which read every gradient stop as
        // if it were opaque and then \`break\`, so nothing under the gradient composited. The
        // Arena's \`.game-arena\` paints
        // \`linear-gradient(color(srgb .847 .922 .878 / 0.04), rgba(0,0,0,0))\` — a 4% sheen — and
        // that stop read as opaque rgb(216,235,224), which is EXACTLY the h2's own colour. The
        // harness reported \`h2 "Game Arena"\` at 1.00:1 in BOTH themes: a fabricated total
        // collapse on a heading that is plainly legible, and one that also pinned \`minRatio\` at
        // 1 in both cells and so VOIDed Q5's theme axis on a surface whose \`failingCount\` had
        // in fact moved 19 -> 5. A stop keeps its own alpha, a fully transparent stop paints
        // nothing at all, and only a gradient that is opaque everywhere may stop the walk.
        var raw = img.match(/(rgba?\\([^)]*\\)|color\\([^)]*\\))/g) || [];
        var stops = [], alphas = [];
        for (var gi = 0; gi < raw.length; gi++) {
          var ga = alphaOf(raw[gi]);
          if (ga <= 0.004) continue;
          var gc = parseRgb(raw[gi]);
          if (gc) { stops.push(gc); alphas.push(ga); }
        }
        if (stops.length) {
          layers.push({ stops: stops, alphas: alphas, a: Math.max.apply(null, alphas) });
          from.push('gradient on ' + name(n));
          // Falls through to this same element's background-color, which a gradient paints OVER.
          if (Math.min.apply(null, alphas) >= 0.996) break;
        }
      }
      var a = alphaOf(cs.backgroundColor);
      if (a > 0.004) {
        var c = parseRgb(cs.backgroundColor);
        if (c) { layers.push({ stops: [c], a: a }); from.push(name(n) + '@' + Math.round(a*100) + '%'); }
        if (a >= 0.996) break;
      }
    }
    if (unmeasurable) return { unmeasurable: unmeasurable };
    if (!layers.length) return { colors: [[0,0,0]], from: 'nothing painted — document root' };
    // Composite bottom-up. TRAP 7, also found by this harness's first surface: \`.btn\` fills with
    // \`color(srgb 0.05 0.58 0.41 / 0.174)\` — a 17% accent TINT — and reading its stop colour as
    // if it were opaque scored the label at 4.38:1 against a 4.5 bar in classic-light. The
    // composited fill over white is nowhere near that, so the harness was one commit away from
    // filing a WCAG defect against a button that passes comfortably. Any term that accepts
    // \`alpha > 0.05\` and then uses the raw colour is measuring a colour nothing ever painted.
    var acc = layers[layers.length - 1].stops.slice(0, 4);
    for (var i = layers.length - 2; i >= 0; i--) {
      var L = layers[i], next = [];
      for (var bi = 0; bi < acc.length; bi++) {
        for (var si = 0; si < L.stops.length; si++) {
          var s = L.stops[si], b = acc[bi];
          // Per-stop alpha when the layer carries one (a gradient); the layer's single alpha
          // otherwise (a background-color). Same compositing, one alpha per thing that painted.
          var sa = (L.alphas && L.alphas[si] != null) ? L.alphas[si] : L.a;
          next.push([0,1,2].map(function(k){ return Math.round(s[k]*sa + b[k]*(1-sa)); }));
        }
      }
      acc = next.slice(0, 8);
    }
    return { colors: acc, from: from.join(' over ') };
  }
  /** Kept for the Q1 accent test, which compares one control's fill against its host's. */
  function effectiveBg(el){
    var b = bgCandidates(el);
    return b.colors ? b.colors[0] : [0,0,0];
  }
  function lum(c){
    var a = c.map(function(v){ v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2];
  }
  function ratio(fg, bg){
    var L1 = lum(fg), L2 = lum(bg);
    return (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
  }

  var isFwin = root.classList && root.classList.contains('fwin');
  var body = root.querySelector('.fwin-body') || root;
  var B = body.getBoundingClientRect();
  var controls = [].slice.call(root.querySelectorAll(CTRL)).filter(painted);
  function inBody(e){
    var b = e.getBoundingClientRect();
    return b.top >= B.top - 1 && b.bottom <= B.bottom + 1 && b.width > 0;
  }
  var NAV = 'nav,[role="tablist"],[class*="rail"],[class*="sidebar"],[class*="-nav"],[class*="tabs"]';

  // ---- Q1: one obvious way in. ------------------------------------------------------------
  function topThird(e){
    var b = e.getBoundingClientRect();
    return b.top < B.top + B.height/3 && b.width > 0;
  }
  /**
   * "FILLED" MUST NOT BE A FUNCTION OF THE PALETTE, and the ported version was. The original
   * term was a raw channel sum (\`|dr|+|dg|+|db| > 60\`) against the host's fill. Sixty units of
   * channel distance is a different amount of visible separation on a dark palette than on a
   * light one, so the SAME four Library buttons counted as 4 accents in forest-night and 3 in
   * classic-light — and the runner's own drift guard caught it on the first surface, reporting
   * "verdicts drift with the theme (q1)". A §10.4 answer that changes when the palette does is
   * not an answer about the product. Contrast RATIO is perceptual and stable across palettes,
   * so that is the term: a control is filled when it paints and separates from its host by at
   * least 1.2:1, which is roughly where a fill stops reading as the surface it sits on.
   */
  function filled(e){
    var cs = getComputedStyle(e);
    if (alphaOf(cs.backgroundColor) <= 0.05) return false;   // a ghost button paints nothing
    // Both sides COMPOSITED, for the reason in trap 7: an accent tint at 17% opacity is a
    // different colour from its own stop, and comparing the stop against the host measures a
    // separation the user never sees.
    var own = bgCandidates(e), host = bgCandidates(e.parentElement || body);
    if (own.unmeasurable || host.unmeasurable) return false;
    return ratio(own.colors[0], host.colors[0]) >= 1.2;
  }
  var primaryInputs = controls.filter(function(e){
    return e.matches('input:not([type=checkbox]):not([type=radio]),textarea,select') && topThird(e); });
  /**
   * AN ENTRY POINT IS DECLARED, NOT INFERRED FROM PIXELS — the third repair this surface
   * forced. \`filled()\` alone found 4 accent buttons in forest-night and 1 in classic-light on
   * an identical 41-control scene, and no threshold fixes that: a 17-38% accent TINT separates
   * further from white than from a dark panel, so the same markup is "accent" in one palette
   * and flat in another. The runner's drift guard is what caught it, and the guard was right.
   *
   * So the term is what the APP says, plus one palette-relative fallback: a button counts when
   * it carries a primary/accent/cta marker, or when it is the ONLY filled button among its
   * siblings — a comparison inside one palette, which cannot drift with the palette.
   */
  var candidates = controls.filter(function(e){
    return e.matches('button,[role="button"]') && topThird(e)
      && !e.closest('.fwin-bar') && !e.closest(NAV); });
  function declaredPrimary(e){
    return /(^|[\\s-])(primary|accent|cta)([\\s-]|$)/.test(String(e.className || ''))
      || e.hasAttribute('data-primary');
  }
  var accentButtons = candidates.filter(function(e){
    if (declaredPrimary(e)) return true;
    if (!filled(e)) return false;
    var sibs = [].slice.call((e.parentElement || body).children).filter(function(c){
      return c !== e && c.nodeType === 1 && c.matches('button,[role="button"]') && painted(c); });
    return sibs.length > 0 && !sibs.some(filled);
  });
  var entryPoints = primaryInputs.length + accentButtons.length;

  // ---- Q2: where am I, and how do I get back. ---------------------------------------------
  /**
   * HOST-CLASS AWARE, and this is the one term the port could not carry over unchanged.
   * A .fwin states its location in .fwin-title-text and its way back is the window's own
   * close/minimise chrome. A root surface has NEITHER — it replaced the desktop shell — so
   * for those the location is the surface's own heading and the way back is a control it
   * owns. Scoring a root surface against .fwin chrome would mark every reader in the app
   * "location not obvious", which is a property of the probe, not the product.
   */
  var titleEl = isFwin
    ? root.querySelector('.fwin-title-text, .fwin-title')
    : ([].slice.call(root.querySelectorAll('h1,h2,[role="heading"],[class*="-title"],[class*="-header"] [class*="name"]')).filter(function(e){
        return painted(e) && (e.textContent || '').trim().length > 0; })[0] || null);
  var titleText = titleEl ? (titleEl.textContent || '').trim() : '';
  var backAffordances = controls.filter(function(e){
    var l = (e.getAttribute('aria-label') || e.title || e.textContent || '').trim();
    return /^(back|home|close|exit|×|✕|返回|назад|戻る|閉じる)$/i.test(l)
      || /back|home|close|exit/i.test(String(e.className || ''));
  });

  // ---- Q3: primary action visible without scrolling. --------------------------------------
  // Prefer a control the app itself marks primary; taking accentButtons[0] answered YES about
  // the wrong element on two surfaces (a JA/ZH grammar toggle, a nav row).
  var explicitPrimary = controls.filter(function(e){
    return /(^|\\s|-)primary(\\s|$|-)/.test(String(e.className || ''))
      && !e.closest('.fwin-bar') && !e.closest(NAV); })[0];
  var primaryAction = explicitPrimary || accentButtons[0] || primaryInputs[0] || null;
  var primaryVisible = primaryAction ? inBody(primaryAction) : false;
  /*
   * PINNED FOR THE CONTROL, and this is a repair, not an optimisation. The Q3 plant used to
   * resolve its own victim — "first painted control in document order outside .fwin-bar and
   * NAV" — which is a DIFFERENT term from the one Q3 is scored on. On Library the two happened
   * to land on the same node (button.btn.primary is also first in document order) and the
   * control passed for eight runs on a coincidence. On Captures they diverge: the plant moved
   * button.reading-captures-refresh while Q3 scores input.reading-captures-search, so the
   * control reported "DID NOT FAIL" on a question that is perfectly falsifiable. A control must
   * attack the term under test, or it measures nothing. A reference on a global, not an
   * attribute — writing to the live DOM during a measurement pass is how this harness damaged
   * the app once already.
   */
  window.__cat5primary = primaryAction;
  /*
   * AND EVERY NODE THE TERM COULD FALL BACK TO, which is the repair after the one above.
   * Pinning the scored node fixed Captures, where the plant had been moving a different
   * element entirely. It was still not enough on Immersion: \`primaryAction\` is
   * \`explicitPrimary || accentButtons[0] || primaryInputs[0]\`, and Immersion's accent set is
   * three interchangeable view-mode buttons, so translating the FIRST one merely promotes
   * the second and Q3 stays YES. The control reported "DID NOT FAIL on Q3" on a surface
   * whose Q3 is perfectly falsifiable.
   *
   * A disjunction is only attacked when every branch of it is. Moving all three terms drives
   * \`primaryAction\` to null, which is what "no primary action is visible" actually means.
   * Safe against re-promotion: the plant translates rather than hides, so \`filled()\` and the
   * sibling comparison are unchanged, and the only term that moves is \`topThird\` — which can
   * remove a candidate and never add one.
   */
  window.__cat5primaries = [].concat(explicitPrimary ? [explicitPrimary] : [], accentButtons, primaryInputs)
    .filter(function(e, i, a){ return e && a.indexOf(e) === i; });

  // ---- Q4: advanced tools tucked away, default view not cluttered. ------------------------
  var collapsed = [].slice.call(root.querySelectorAll('details:not([open]),[aria-expanded="false"]')).filter(painted);
  function repeatingRow(e){
    return e.closest('.dict-entry,[class*="-row"],[class*="-card"],[class*="-item"],[class*="-spotlight"],li'); }
  var chromeControls = controls.filter(function(e){ return !repeatingRow(e) && !e.closest('.fwin-bar'); });
  // The clutter term is controls the user must SCAN in the default state: chrome, minus the
  // contents of any <details> (tucked away by definition) and minus the summary headers
  // (counted once by collapsedDisclosures, not charged twice). The bar stays at 12.
  function inDisclosure(e){ return !!e.closest('details') && e.tagName !== 'SUMMARY'; }
  var summaryHeaders = chromeControls.filter(function(e){ return e.tagName === 'SUMMARY'; });
  var behindDisclosure = chromeControls.filter(inDisclosure);
  var scanned = chromeControls.filter(function(e){ return !inDisclosure(e) && e.tagName !== 'SUMMARY'; });
  var allDetails = [].slice.call(root.querySelectorAll('details'));

  // ---- Q5's population: every painted text run, and its worst ratio. ----------------------
  /**
   * Measured HERE rather than inherited, because Q5 asks whether contrast is STABLE and every
   * committed per-surface contrast number in this repo is a single theme cell. The sweep that
   * makes it a stability answer is the runner's; this is one cell of it.
   */
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  var seen = [], worst = null, minRatio = 99, failing = [], unmeasurable = 0;
  for (var t = walker.nextNode(); t; t = walker.nextNode()) {
    var s = (t.nodeValue || '').trim();
    if (!s) continue;
    var el = t.parentElement;
    if (!el || !painted(el) || seen.indexOf(el) >= 0) continue;
    seen.push(el);
    var cs = getComputedStyle(el);
    var fg = parseRgb(cs.color);
    if (!fg || alphaOf(cs.color) < 0.95) { unmeasurable++; continue; }
    var bgs = bgCandidates(el);
    if (bgs.unmeasurable) { unmeasurable++; continue; }
    // The worst stop, so a gradient is scored where it is hardest to read rather than on average.
    var r = Math.min.apply(null, bgs.colors.map(function(c){ return ratio(fg, c); }));
    var big = parseFloat(cs.fontSize) >= 24
      || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
    var bar = big ? 3.0 : 4.5;
    if (r < bar) failing.push({ el: name(el), ratio: Math.round(r*100)/100, bar: bar, bg: bgs.from, text: s.slice(0,24) });
    if (r < minRatio) { minRatio = r; worst = { el: name(el), ratio: Math.round(r*100)/100, bar: bar, bg: bgs.from, text: s.slice(0,24) }; }
  }

  // ---- Q6: does Liquid motion explain a real relationship. --------------------------------
  var blurRegions = [].slice.call(root.querySelectorAll('*')).filter(function(e){
    if (!painted(e)) return false;
    var cs = getComputedStyle(e);
    return (cs.backdropFilter && cs.backdropFilter !== 'none')
      || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
  });
  // Liquid is not spelled backdrop-filter on every surface: .fwin is a backdrop root, so its
  // interior treatment is translucency + border + radius + shadow on .lq-contextual.
  var contextualPainted = [].slice.call(root.querySelectorAll('.lq-contextual')).filter(function(e){
    if (!painted(e)) return false;
    var cs = getComputedStyle(e);
    return alphaOf(cs.backgroundColor) > 0.02 || parseFloat(cs.borderTopWidth) > 0
      || (cs.boxShadow && cs.boxShadow !== 'none');
  });
  // A REGION IS A CONTAINER. A decorated leaf (a 35x34 episode-count chip) is not one, and
  // counting one cost Q6 a real NO whose only fix would have been decorative motion on a chip.
  function isControl(e){ return e.matches(CTRL); }
  function holdsContent(e){
    return [].slice.call(e.children).some(function(c){ return c.nodeType === 1 && painted(c); }); }
  var liquidMaterial = blurRegions.concat(contextualPainted).filter(function(e, i, a){ return a.indexOf(e) === i; });
  var liquidRegions = liquidMaterial.filter(function(e){ return !isControl(e) && holdsContent(e); });
  var decoratedLeaves = liquidMaterial.filter(function(e){ return isControl(e) || !holdsContent(e); });
  var withTransition = liquidRegions.filter(function(e){
    var d = getComputedStyle(e).transitionDuration;
    return d && d.split(',').some(function(v){ return parseFloat(v) > 0; });
  });
  var infiniteOnLiquid = liquidRegions.filter(function(e){
    var c = getComputedStyle(e).animationIterationCount;
    return c && c.split(',').some(function(v){ return v.trim() === 'infinite'; });
  });

  // ---- Q10: still itself, not a generic card dashboard. -----------------------------------
  /**
   * TWO MARKER SETS, PICKED BY HOST CLASS — repaired 2026-08-26 after manga scored 8/10 on a
   * term it could not answer. Three of the original five markers are OS chrome
   * (\`floatingWindowChrome\`, \`taskbar\`, \`desktopLayer\`) and the bar is 3 of 5. Novels, the
   * manga reader and the VN panel all REPLACE the desktop shell, so all three are absent by
   * construction and identityCount is capped at 2 — half the L6 set could never answer Q10
   * YES no matter what the product did. That is a harness defect wearing a product score.
   *
   * The discriminator is deliberately NOT "is the marker present", which is circular and would
   * make the term vacuous. It is a structural property of the host, measured independently of
   * every marker: a surface that is not a \`.fwin\` AND fills its viewport is chromeless.
   *
   * THE BAR IS NOT LOWERED. The chromed set is byte-identical to the one Library, Captures and
   * Immersion scored against — those three re-derive unchanged. The chromeless set has FOUR
   * markers against the same bar of 3, so it demands 75% where the chromed set demands 60%,
   * and the two replacements are things a chromeless surface has to earn:
   *
   *   bespokeRegionPrefix   its painted structural regions share an app-domain class prefix
   *                         that is not a generic container word. A generic card dashboard is
   *                         built out of .card/.panel/.tile and has no such prefix; the manga
   *                         reader has manga- x8, ocr- x4, reader- x2.
   *   contentDominantRegion the largest painted CONTENT element (media, or a run of >=200 own
   *                         text chars) covers >=25% of the surface. A dashboard's largest
   *                         painted thing is a box of boxes, not a page.
   *
   * STATED RATHER THAN HIDDEN: the identity leg is not independently falsified by the control
   * — the Q10 plant falsifies the DASHBOARD leg, which is what the question is actually about.
   * A control that stripped the app's own class names would be testing the DOM, not the product.
   */
  var GENERIC_PREFIX = ['card','tile','panel','box','item','row','col','grid','container','wrapper',
    'content','main','section','header','footer','sidebar','list','page','view','app','flex',
    'inner','outer','body','block','btn','icon','group','stack','pane','bar','menu','modal',
    'overlay','wrap','text','title','label','field','form','cell','area','frame','shell'];
  var structural = [].slice.call(root.querySelectorAll('*')).filter(function(e){
    if (!painted(e) || isControl(e)) return false;
    var b = e.getBoundingClientRect();
    return (b.width * b.height) / Math.max(1, R.width * R.height) >= 0.01;
  });
  var prefixTally = {};
  structural.forEach(function(e){
    String(e.className || '').trim().split(' ').forEach(function(tok){
      if (!tok) return;
      var p = tok.split('-')[0].toLowerCase();
      if (p.length < 3 || GENERIC_PREFIX.indexOf(p) >= 0) return;
      prefixTally[p] = (prefixTally[p] || 0) + 1;
    });
  });
  var bespokePrefixes = Object.keys(prefixTally).filter(function(p){ return prefixTally[p] >= 3; });
  var contentBest = null, contentBestArea = 0;
  [].slice.call(root.querySelectorAll('*')).filter(painted).forEach(function(e){
    var b = e.getBoundingClientRect();
    var a = b.width * b.height;
    if (a <= contentBestArea) return;
    var isMedia = e.tagName === 'IMG' || e.tagName === 'CANVAS' || e.tagName === 'VIDEO'
      || e.tagName === 'SVG' || e.tagName === 'svg' || e.tagName === 'PICTURE';
    var ownText = [].slice.call(e.childNodes).filter(function(n){ return n.nodeType === 3; })
      .map(function(n){ return n.textContent; }).join('').trim().length;
    if (!isMedia && ownText < 200) return;
    contentBestArea = a;
    contentBest = name(e) + (isMedia ? ' media' : ' text:' + ownText);
  });
  var contentFrac = Math.round(contentBestArea / Math.max(1, R.width * R.height) * 100) / 100;
  var fillsViewport = (R.width / Math.max(1, window.innerWidth)) >= 0.95
    && (R.height / Math.max(1, window.innerHeight)) >= 0.95;
  var chromelessHost = !isFwin && fillsViewport;
  var surfaceChrome = !!root.querySelector('[class*="-toolbar"],[class*="-topbar"],[class*="-header"],[class*="-bar"]');
  var themeToken = !!document.documentElement.getAttribute('data-theme');
  var identityMarkers = chromelessHost
    ? { surfaceChrome: surfaceChrome,
        themeToken: themeToken,
        bespokeRegionPrefix: bespokePrefixes.length > 0,
        contentDominantRegion: contentFrac >= 0.25 }
    : { floatingWindowChrome: !!root.querySelector('.fwin-bar'),
        surfaceChrome: surfaceChrome,
        taskbar: !!document.querySelector('.os-task-win'),
        desktopLayer: !!document.querySelector('.desktop-root,.os-desktop,.os-wall-layer'),
        themeToken: themeToken };
  var identityCount = Object.keys(identityMarkers).filter(function(k){ return identityMarkers[k]; }).length;
  var cardUniformity = 0, cardHost = null, cardHostDetail = null, cardControlSignatures = 0;
  var cardHosts = [];
  var bodyArea = Math.max(1, B.width * B.height);
  var hosts = [].slice.call(root.querySelectorAll('*'));
  for (var hi = 0; hi < hosts.length; hi++) {
    var host = hosts[hi];
    var hb = host.getBoundingClientRect();
    if ((hb.width * hb.height) / bodyArea < 0.25) continue;
    var hostBg = effectiveBg(host);
    var kids = [].slice.call(host.children).filter(function(c){
      if (!painted(c)) return false;
      var b = c.getBoundingClientRect();
      if (b.width < 120 || b.height < 60) return false;
      var cs2 = getComputedStyle(c);
      var own = parseRgb(cs2.backgroundColor);
      var ownBg = alphaOf(cs2.backgroundColor) > 0.05 && own
        && own.some(function(v, i){ return Math.abs(v - hostBg[i]) > 8; });
      var bordered = (cs2.boxShadow && cs2.boxShadow !== 'none')
        || (parseFloat(cs2.borderTopWidth) > 0 && alphaOf(cs2.borderTopColor) > 0.05);
      return ownBg || bordered;
    });
    if (kids.length < 4) continue;
    var buckets = {};
    kids.forEach(function(k){
      var b = k.getBoundingClientRect();
      var key = Math.round(b.width/8) + 'x' + Math.round(b.height/8);
      buckets[key] = (buckets[key] || 0) + 1;
    });
    var frac = Math.max.apply(null, Object.keys(buckets).map(function(k){ return buckets[k]; })) / kids.length;
    // GALLERY vs DASHBOARD, which size uniformity alone cannot tell apart: a gallery repeats
    // ONE kind of thing (13 theme swatches, N posters) and is legitimate; a dashboard flattens
    // UNRELATED functions into identical boxes, which is what §10.4 is actually asking about.
    var sigs = {};
    kids.forEach(function(k){
      var sig = [].slice.call(k.querySelectorAll(CTRL)).filter(painted).map(function(c){
        return c.tagName.toLowerCase() + ':' + (c.getAttribute('role') || '') + ':' + String(c.className || '').split(' ')[0];
      }).sort().join('|');
      sigs[sig] = 1;
    });
    cardHosts.push({
      host: name(host) + ' cards=' + kids.length,
      uniformity: Math.round(frac * 100) / 100,
      signatures: Object.keys(sigs).length,
      detail: Math.round((hb.width * hb.height) / bodyArea * 100) + '% of body',
    });
  }
  /*
   * CORRECTION, 2026-08-27. This used to keep only the MOST UNIFORM host (\`frac <=
   * cardUniformity\` -> continue), so one host answered Q10 for the whole surface and ties went
   * to whichever came first in document order.
   *
   * Two things were wrong with that, and Flashcards showed both at once. As an instrument: a
   * real dashboard sitting beside a legitimate gallery is invisible, because the gallery's
   * 1.00 uniformity and single signature hold the slot and grant the exemption on the
   * dashboard's behalf. As a control: the Q10 plant appends its six-signature grid to the
   * body, \`div.flash-strip\` already carried 24 identical cards at uniformity 1.00, and the
   * plant tied rather than beat it — so the run went CONTROL-VOID on a question that is
   * perfectly falsifiable, for the same reason Q2 and Q3 each needed repairing.
   *
   * The question is "is this surface a generic card dashboard", so ANY qualifying host being
   * a uniform grid of unrelated functions answers it. Every host is now reported, the worst
   * one decides, and the exemption has to be earned by all of them rather than by one.
   */
  var dashboards = cardHosts.filter(function(h){ return h.uniformity >= 0.8 && h.signatures > 1; });
  var deciding = dashboards[0]
    || cardHosts.slice().sort(function(a, b){ return b.uniformity - a.uniformity; })[0]
    || null;
  if (deciding) {
    cardUniformity = deciding.uniformity;
    cardControlSignatures = deciding.signatures;
    cardHost = deciding.host;
    cardHostDetail = deciding.detail;
  }

  return JSON.stringify({
    surface: ${A(SURFACE)},
    hostClass: isFwin ? 'fwin' : 'root-selector',
    theme: document.documentElement.getAttribute('data-theme'),
    lang: document.documentElement.lang,
    presentation: root.getAttribute('data-presentation') || null,
    box: Math.round(R.width) + 'x' + Math.round(R.height),
    controlsPainted: controls.length,
    q1: { entryPoints: entryPoints, primaryInputs: primaryInputs.length, accentButtons: accentButtons.length,
          accentList: accentButtons.map(function(e){ return name(e) + '::' + (e.textContent||'').trim().slice(0,18); }),
          inputList: primaryInputs.map(name) },
    q2: { titleText: titleText, titleFrom: titleEl ? name(titleEl) : null, backAffordances: backAffordances.length,
          backList: backAffordances.slice(0,6).map(function(e){ return (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0,20) || name(e); }) },
    q3: { primaryAction: primaryAction ? name(primaryAction) : null, insideBodyViewport: primaryVisible,
          explicitlyMarked: !!explicitPrimary },
    q4: { collapsedDisclosures: collapsed.length, scannedControls: scanned.length,
          chromeControlsRaw: chromeControls.length, summaryHeaders: summaryHeaders.length,
          behindDisclosure: behindDisclosure.length,
          disclosures: { total: allDetails.length, open: allDetails.filter(function(d){ return d.open; }).length },
          scannedList: scanned.slice(0,20).map(function(e){
            return (e.getAttribute('aria-label') || e.textContent || e.placeholder || e.tagName).trim().slice(0,28); }) },
    q5: { measured: seen.length, unmeasurable: unmeasurable,
          minRatio: minRatio === 99 ? null : Math.round(minRatio*100)/100,
          failingCount: failing.length, worst: worst, failing: failing.slice(0,8) },
    q6: { liquidRegions: liquidRegions.length, byBackdropFilter: blurRegions.length,
          byContextualPaint: contextualPainted.length, carryingATransition: withTransition.length,
          infiniteAnimationsOnLiquid: infiniteOnLiquid.length,
          liquidMaterialTotal: liquidMaterial.length,
          decoratedLeaves: decoratedLeaves.slice(0,8).map(name),
          regionList: liquidRegions.slice(0,8).map(name),
          withoutTransition: liquidRegions.filter(function(e){ return withTransition.indexOf(e) < 0; }).slice(0,8).map(name) },
    q10: { identityMarkers: identityMarkers, identityCount: identityCount,
           markerSet: chromelessHost ? 'chromeless (4 markers, bar 3 = 75%)' : 'chromed (5 markers, bar 3 = 60%)',
           fillsViewport: fillsViewport,
           bespokePrefixes: bespokePrefixes.map(function(p){ return p + ':' + prefixTally[p]; }),
           contentDominant: contentBest, contentFrac: contentFrac,
           cardUniformity: Math.round(cardUniformity*100)/100, cardControlSignatures: cardControlSignatures,
           cardHost: cardHost, cardHostDetail: cardHostDetail, cardHosts: cardHosts,
           dashboardHosts: cardHosts.filter(function(h){ return h.uniformity >= 0.8 && h.signatures > 1; }).length }
  });
})()`;

// ---------------------------------------------------------------------------- control plants
const PLANT = 'data-cat5-plant';
const PLANT_JS = `(function(){
  var root = ${ROOT_EXPR};
  if (!root) return JSON.stringify({ refuse: 'surface not found for control injection' });
  var body = root.querySelector('.fwin-body') || root;
  var isFwin = root.classList && root.classList.contains('fwin');

  /*
   * Q2 — blank the location label. EVERY CANDIDATE, not the first one, and this is the same
   * repair Q3 needed: the snapshot resolves the title as \`candidates.filter(painted &&
   * non-empty)[0]\`, so blanking one node simply promotes the next and the control reports
   * "DID NOT FAIL" on a perfectly falsifiable question. Measured on the manga reader
   * (2026-08-26): the plant blanked \`div.reader-title\` and the term fell straight through to
   * \`span.lq-reading-tool-title\` — "Page text", the open OCR tool's own heading — so Q2
   * stayed YES and the whole run went CONTROL-VOID for the wrong reason. Any surface with a
   * docked reading tool has at least two title-shaped elements, so this is Novels and the VN
   * panel too, not a manga quirk.
   *
   * The selector is now the SNAPSHOT'S selector, character for character, including the
   * \`painted\` filter — a plant that hunts a different population from the one under test is
   * the defect this file has already recorded twice. Each node carries its own text on its
   * own attribute, so N blanked nodes restore to N different strings and the restore does not
   * depend on an array surviving the round trip through /eval.
   */
  function plantPainted(e){
    return typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity:true, checkVisibilityCSS:true, contentVisibilityAuto:true })
      : true;
  }
  var titleEls = isFwin
    ? [].slice.call(root.querySelectorAll('.fwin-title-text, .fwin-title'))
    : [].slice.call(root.querySelectorAll('h1,h2,[role="heading"],[class*="-title"],[class*="-header"] [class*="name"]'))
        .filter(function(e){ return plantPainted(e) && (e.textContent || '').trim().length > 0; });
  /*
   * innerHTML, NOT textContent, and this one was damaging the live app. \`.fwin-title\` is
   * \`<span class="fwin-title"><Icon/><span class="fwin-title-text">…</span></span>\` — nested,
   * so \`textContent = ''\` DELETES the inner span and the window's glyph, and restoring
   * \`textContent\` puts back a bare text node. Measured on Library, 2026-08-26: after a clean
   * CONTROL-OK run with residue 0, the live window's title read
   * \`<span class="fwin-title">Library</span>\` and \`.fwin-title-text\` was gone from the
   * document — the handle three other probes in this directory resolve windows BY. The
   * previous single-node plant did the same thing (the selector list returns the outer span
   * first in document order), so this had been happening on every fwin control run.
   * Restoring the markup restores the subtree; \`residue: 0\` never saw any of it.
   */
  titleEls.forEach(function(e){
    e.setAttribute(${A(PLANT)}, 'title');
    e.setAttribute(${A(PLANT)} + '-html', e.innerHTML);
    e.setAttribute(${A(PLANT)} + '-text', e.textContent || '');
    e.textContent = '';
  });
  var titleEl = titleEls[0] || null;
  var savedTitle = titleEl ? titleEl.getAttribute(${A(PLANT)} + '-text') : null;

  // Q3 — push EVERY primary-capable control far below the body's visible box.
  var NAV = 'nav,[role="tablist"],[class*="rail"],[class*="sidebar"],[class*="-nav"],[class*="tabs"]';
  // The nodes Q3 IS SCORED ON, pinned by the snapshot that ran before this plant: the whole
  // \`explicitPrimary || accentButtons[0] || primaryInputs[0]\` disjunction, not just whichever
  // branch won this time. Moving one of three interchangeable accent buttons promotes the
  // next and the control reads as a pass. The document-order fallback stays only for a plant
  // that somehow runs without a snapshot; when it fires, primaryFromPin is false and the
  // control's claim can be discounted.
  var pinnedAll = (window.__cat5primaries || []).filter(function(e){ return e && e.isConnected; });
  var pinnedPrimary = (window.__cat5primary && window.__cat5primary.isConnected)
    ? window.__cat5primary : null;
  var targets = pinnedAll.length ? pinnedAll : (pinnedPrimary ? [pinnedPrimary] : []);
  if (!targets.length) {
    targets = [].slice.call(root.querySelectorAll('button,[role="button"],input,select,textarea')).filter(function(e){
      var b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && !e.closest('.fwin-bar') && !e.closest(NAV); }).slice(0, 1);
  }
  // The previous inline transform travels WITH each node, so the restore does not depend on
  // an array surviving a round trip through /eval and back in the same order.
  targets.forEach(function(e){
    e.setAttribute(${A(PLANT)}, 'moved');
    e.setAttribute(${A(PLANT)} + '-transform', e.style.transform || '');
    e.style.transform = 'translateY(4000px)';
  });
  var primary = targets[0] || null;
  var savedTransform = primary ? primary.getAttribute(${A(PLANT)} + '-transform') : null;

  // Q5 — one span whose OWN opaque background is 1.07:1 against its own text, so the planted
  // ratio is identical in every theme and the sweep cannot wash it out.
  var s = document.createElement('span');
  s.setAttribute(${A(PLANT)}, 'contrast');
  s.style.cssText = 'display:inline-block;padding:6px 10px;background:#808080;color:#8a8a8a;font-size:14px';
  s.textContent = 'cat5 contrast plant';
  body.appendChild(s);

  // Q10 — a genuine generic dashboard: uniform boxes, HETEROGENEOUS functions. If this does
  // not go NO, the gallery discriminator is a blanket exemption and Q10 is unfalsifiable.
  var grid = document.createElement('div');
  grid.setAttribute(${A(PLANT)}, 'dashboard');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,200px);gap:8px;padding:8px;background:#101010';
  var kinds = ['button','input','select','textarea','a','summary'];
  kinds.forEach(function(kind, i){
    var card = document.createElement('div');
    card.style.cssText = 'width:200px;height:80px;background:#2a2a2a;border:1px solid #555;border-radius:8px';
    var inner = document.createElement(kind);
    if (kind === 'a') inner.setAttribute('href', '#');
    inner.className = 'cat5ctl-kind-' + i;
    inner.textContent = 'card ' + i;
    card.appendChild(inner);
    grid.appendChild(card);
  });
  body.appendChild(grid);

  return JSON.stringify({ savedTitle: savedTitle, savedTransform: savedTransform,
    primaryFound: primary ? primary.tagName.toLowerCase() + '.' + String(primary.className||'').split(' ')[0] : null,
    primaryFromPin: !!pinnedPrimary,
    // How many branches of the disjunction the plant actually attacked, and which. A control
    // that moved one node on a surface with three interchangeable accents measured nothing,
    // so the count is reported rather than assumed.
    primariesMoved: targets.length,
    primariesFromPin: pinnedAll.length,
    primaryList: targets.map(function(e){ return e.tagName.toLowerCase() + '.' + String(e.className||'').split(' ')[0]; }),
    // Same reporting as the Q3 disjunction, for the same reason: a control that blanked one
    // of two title-shaped nodes measured nothing, so the count is stated rather than assumed.
    titlesBlanked: titleEls.length,
    titleList: titleEls.map(function(e){ return e.tagName.toLowerCase() + '.' + String(e.className||'').split(' ')[0]; }),
    dashboardCards: kinds.length, expect: { Q2: 'NO', Q3: 'NO', Q5: 'NO', Q10: 'NO' } });
})()`;

const unplantJs = (savedTitle) => `(function(){
  // Attribute-driven, like the moved nodes below: each blanked title carries its own text, so
  // two blanked headings come back as two different strings. The \`savedTitle\` argument is kept
  // only as the fallback for a node whose attribute somehow did not survive.
  // Outermost first, so a nested pair is rebuilt by its ancestor's markup and the inner
  // node's own entry then finds nothing left to do rather than re-blanking a rebuilt child.
  var titles = [].slice.call(document.querySelectorAll('[${PLANT}="title"]'))
    .sort(function(a, b){ return a.contains(b) ? -1 : b.contains(a) ? 1 : 0; });
  titles.forEach(function(t){
    if (!t.isConnected) return;
    var html = t.getAttribute('${PLANT}-html');
    if (html !== null) { t.innerHTML = html; }
    else {
      var was = t.getAttribute('${PLANT}-text');
      t.textContent = was === null ? ${A(savedTitle === null ? '' : savedTitle)} : was;
    }
    t.removeAttribute('${PLANT}-html');
    t.removeAttribute('${PLANT}-text');
    t.removeAttribute(${A(PLANT)});
  });
  // Each moved node carries its OWN previous inline transform, so a plant that attacked
  // three nodes restores three, and none of them is restored to another one's value.
  var moved = [].slice.call(document.querySelectorAll('[${PLANT}="moved"]'));
  moved.forEach(function(m){
    m.style.transform = m.getAttribute('${PLANT}-transform') || '';
    m.removeAttribute('${PLANT}-transform');
    m.removeAttribute(${A(PLANT)});
  });
  [].slice.call(document.querySelectorAll('[${PLANT}="contrast"],[${PLANT}="dashboard"]')).forEach(function(n){ n.remove(); });
  return JSON.stringify({ restoredMoved: moved.length, restoredTitles: titles.length,
    // The whole marker family, including \`-html\`. A residue count that does not sweep every
    // attribute the plant writes reports 0 while the app still carries one, which is the
    // exact shape of the restore defect this directory already paid for once.
    residue: document.querySelectorAll('[${PLANT}],[${PLANT}-transform],[${PLANT}-text],[${PLANT}-html]').length });
})()`;

// ---------------------------------------------------------------------------- scoring
/** Bars, stated once, so the score is arguable rather than asserted. */
const BARS = {
  q1: '1..3 entry points in the top third — 0 offers nothing to do, many offers no dominant task',
  q2: 'a non-empty location label AND at least one way back',
  q3: 'the primary action is inside the body viewport at rest — "without hunting" means without scrolling',
  q4: '>=1 collapsed disclosure AND <=12 controls scanned in the default state',
  q5: 'no failing text run in EITHER theme, and the two themes must not report an identical minimum',
  q6: 'every Liquid-treated region carries a state-change transition and none loops forever',
  q7: "category 6's parity: the same features reachable in standard as in Liquid",
  q8: "category 6's round trip: 0 field/shell diffs across standard->liquid->standard",
  q9: "category 6's row agreement: no row reachable in only one presentation",
  q10: '>=3 identity markers OF THE SET ITS HOST CLASS CAN HAVE (chromed 3/5, chromeless 3/4), and (uniformity < 0.80 OR one control signature = a gallery, not a dashboard)',
};

function scoreSnapshot(s) {
  return {
    q1: s.q1.entryPoints >= 1 && s.q1.entryPoints <= 3 ? 'YES' : 'NO',
    q2: s.q2.titleText && s.q2.backAffordances >= 1 ? 'YES' : 'NO',
    q3: s.q3.insideBodyViewport ? 'YES' : 'NO',
    q4: s.q4.collapsedDisclosures >= 1 && s.q4.scannedControls <= 12 ? 'YES' : 'NO',
    q6: s.q6.liquidRegions === 0
      ? 'NO-SUBJECT'
      : (s.q6.infiniteAnimationsOnLiquid === 0 && s.q6.carryingATransition === s.q6.liquidRegions ? 'YES' : 'NO'),
    q10: s.q10.identityCount >= 3 && (s.q10.cardUniformity < 0.8 || s.q10.cardControlSignatures <= 1) ? 'YES' : 'NO',
  };
}

(async () => {
  const out = {
    surface: SURFACE, label: LABEL, control: CONTROL,
    at: new Date().toISOString(),
    category: 5, question: 'UI clarity and user-friendliness — the ten §10.4 questions, scored',
  };
  const step = (s) => process.stderr.write(`[cat5] ${s}\n`);

  // --- refusals, before a single number is taken ------------------------------------------
  step('resolve');
  const pinned = await ev(`(function(){ var r = ${LOOKUP}; ${PIN} = r || null; return r ? 'pinned' : 'not-found'; })()`);
  if (pinned !== 'pinned') throw new Error(`REFUSE - surface not found: ${SURFACE}. Open it first; a missing surface measures as a perfectly clear one.`);
  const found = await evj(SNAP);
  if (found.refuse) throw new Error(`REFUSE - ${found.refuse}`);
  out.hostClass = found.hostClass;
  out.box = found.box;
  out.presentationAsFound = found.presentation;

  // --- Q7/Q8/Q9 come from category 6's committed baseline, never re-driven ----------------
  const c6path = path.join(BASE, `cat6-${LABEL}.json`);
  let c6 = null;
  if (fs.existsSync(c6path)) c6 = JSON.parse(fs.readFileSync(c6path, 'utf8'));
  out.cat6 = c6
    ? { file: path.relative(process.cwd(), c6path), verdict: c6.verdict, parity: c6.parity, roundTrip: c6.roundTrip && { diffs: c6.roundTrip.diffs, order: c6.roundTrip.order } }
    : { file: path.relative(process.cwd(), c6path), missing: true };

  // --- the theme sweep: Q5's stability axis, and a fresh snapshot per cell ------------------
  const BASE_THEME = found.theme;
  const SECOND_THEME = ALT_THEME;
  out.axes = { theme: [BASE_THEME, SECOND_THEME] };
  const storeKeys = ['jp-os-theme', 'jp-os-theme-engine-v'];
  const readStore = () => evj(`(function(){ var o = {}; ${A(storeKeys)}.forEach(function(k){ o[k] = localStorage.getItem(k); }); return JSON.stringify(o); })()`);
  out.storeBefore = await readStore();

  let planted = null;
  if (CONTROL) {
    step('control: plant');
    planted = await evj(PLANT_JS);
    if (planted.refuse) throw new Error(`REFUSE - ${planted.refuse}`);
    out.planted = planted;
  }

  /**
   * Q6 IS A QUESTION ABOUT LIQUID, SO IT HAS TO BE ASKED IN LIQUID. Library's first scored run
   * read `liquidRegions: 0` and Q6 `NO-SUBJECT`, which was true and useless: the window was in
   * STANDARD presentation, where by design there is no Liquid material to explain anything.
   * Scoring the question there measures whether the surface is currently opted in, not whether
   * its motion explains a relationship. So the run opts in, snapshots, and opts back out — and
   * READS THE PRESENTATION BACK both times, because a toggle is a flip, not a set, and a flip
   * that did not land would score the wrong presentation twice.
   *
   * A surface with no presentation control keeps `NO-SUBJECT`, which stays the honest answer
   * for it: there is no Liquid mode on that surface to ask about.
   */
  const LIQUID_BTN = { fwin: '.fwin-b-liquid', popout: '.popout-btn-liquid', reader: '.reader-btn-liquid' };
  const presRead = () => ev(`(function(){ var r = ${ROOT_EXPR}; return r ? String(r.getAttribute('data-presentation')) : 'no-root'; })()`);
  const presToggle = () => ev(`(function(){
    var r = ${ROOT_EXPR};
    if (!r) return 'no-root';
    var b = r.querySelector(${A(Object.values(LIQUID_BTN).join(','))});
    if (!b) return 'no-control';
    b.click();
    return 'clicked';
  })()`);

  step('Q6: opt in to Liquid');
  const presBefore = await presRead();
  let q6cell = null;
  const q6leg = { presentationAsFound: presBefore };
  if (presBefore === 'liquid') {
    q6leg.note = 'surface was already in Liquid presentation; measured where it was found';
  } else {
    const clicked = await presToggle();
    q6leg.toggle = clicked;
    if (clicked === 'clicked') {
      await sleep(900);
      const now = await presRead();
      q6leg.reached = now;
      if (now !== 'liquid') q6leg.refused = `toggle did not reach liquid; surface reads ${now}`;
    } else {
      q6leg.refused = clicked === 'no-control' ? 'surface has no Liquid presentation control' : clicked;
    }
  }
  if (!q6leg.refused) {
    const c = await evj(SNAP);
    if (!c.refuse) { q6cell = c; q6leg.measuredIn = c.presentation; }
  }
  if (presBefore !== 'liquid' && !q6leg.refused) {
    await presToggle();
    await sleep(900);
    q6leg.restoredTo = await presRead();
    if (q6leg.restoredTo !== presBefore) q6leg.restoreWarning = `presentation left as ${q6leg.restoredTo}, found ${presBefore}`;
  }
  out.q6leg = q6leg;

  const cells = [];
  for (const theme of [BASE_THEME, SECOND_THEME]) {
    step(`cell theme=${theme}`);
    await ev(`(function(){ document.documentElement.setAttribute('data-theme', ${A(theme)}); return 'ok'; })()`);
    // Trap 2: a theme swap is a 240 ms colour transition and getComputedStyle during one
    // returns the OLD colour, which reads exactly like a fix that did not land.
    await sleep(700);
    const c = await evj(SNAP);
    if (c.refuse) throw new Error(`REFUSE - cell ${theme}: ${c.refuse}`);
    cells.push(c);
  }

  // --- restore, and VERIFY it, before any verdict is computed -------------------------------
  step('restore');
  await ev(`(function(){ document.documentElement.setAttribute('data-theme', ${A(BASE_THEME)}); return 'ok'; })()`);
  if (CONTROL) out.unplanted = await evj(unplantJs(planted && planted.savedTitle));
  await sleep(400);
  out.storeAfter = await readStore();
  out.storeIdentical = JSON.stringify(out.storeBefore) === JSON.stringify(out.storeAfter);
  const back = await evj(SNAP);
  out.restored = { theme: back.theme, presentation: back.presentation, box: back.box,
    plantResidue: out.unplanted ? out.unplanted.residue : 0 };
  if (back.theme !== BASE_THEME) out.restoreWarning = `theme left as ${back.theme}, wanted ${BASE_THEME}`;

  // --- assemble the ten -------------------------------------------------------------------
  const A_CELL = cells[0];
  const B_CELL = cells[1];
  const live = scoreSnapshot(A_CELL);
  const liveAlt = scoreSnapshot(B_CELL);

  // Q5 across the two cells. TERM 2 IS A VOID, NOT A PASS: if both themes report the same
  // minimum the swap never reached the paint and the axis measured nothing — the same guard
  // `l1-q5-drive.cjs` calls its `frozen` control.
  const q5Failing = A_CELL.q5.failingCount + B_CELL.q5.failingCount;
  const q5Moved = A_CELL.q5.minRatio !== B_CELL.q5.minRatio;
  const q5 = {
    verdict: q5Failing === 0 ? 'YES' : 'NO',
    cells: cells.map((c) => ({ theme: c.theme, measured: c.q5.measured, unmeasurable: c.q5.unmeasurable,
      minRatio: c.q5.minRatio, failingCount: c.q5.failingCount, worst: c.q5.worst })),
    failing: [...A_CELL.q5.failing, ...B_CELL.q5.failing].slice(0, 12),
    themeAxisMoved: q5Moved,
  };

  const fromC6 = (term, ok) => (c6 ? (ok ? 'YES' : 'NO') : 'MEASURE');
  const questions = [
    { id: 1, q: 'dominant task immediately obvious', verdict: live.q1, bar: BARS.q1, numbers: A_CELL.q1 },
    { id: 2, q: 'current location and way back obvious', verdict: live.q2, bar: BARS.q2, numbers: A_CELL.q2 },
    { id: 3, q: 'primary actions visible without hunting', verdict: live.q3, bar: BARS.q3, numbers: A_CELL.q3 },
    { id: 4, q: 'advanced tools discoverable without cluttering', verdict: live.q4, bar: BARS.q4, numbers: A_CELL.q4 },
    { id: 5, q: 'every readable surface has stable contrast', verdict: q5.verdict, bar: BARS.q5, numbers: q5 },
    { id: 6, q: 'Liquid motion explains a real relationship', bar: BARS.q6,
      verdict: q6cell ? scoreSnapshot(q6cell).q6 : (q6leg.refused ? 'NO-SUBJECT' : live.q6),
      numbers: { measuredIn: q6cell ? q6cell.presentation : null, leg: q6leg,
        ...(q6cell ? q6cell.q6 : A_CELL.q6),
        inStandardPresentation: A_CELL.q6.liquidRegions } },
    { id: 7, q: 'standard mode remains fully normal', bar: BARS.q7,
      verdict: fromC6('parity', c6 && c6.parity && c6.parity.equal && (c6.parity.failing || []).length === 0),
      numbers: { drivenBy: 'probes/cat6-feature-parity.cjs', parity: c6 && c6.parity } },
    { id: 8, q: 'Liquid can be turned off without losing state', bar: BARS.q8,
      verdict: fromC6('roundTrip', c6 && c6.roundTrip && (c6.roundTrip.diffs || []).length === 0),
      numbers: { drivenBy: 'probes/cat6-feature-parity.cjs', roundTrip: c6 && c6.roundTrip && { order: c6.roundTrip.order, diffs: c6.roundTrip.diffs } } },
    { id: 9, q: 'all pre-migration features reachable and functional', bar: BARS.q9,
      verdict: fromC6('rowsAgree', c6 && c6.parity && c6.parity.rowsAgree === true && (c6.parity.onlyInOne || []).length === 0),
      numbers: { drivenBy: 'probes/cat6-feature-parity.cjs', rowsAgree: c6 && c6.parity && c6.parity.rowsAgree, onlyInOne: c6 && c6.parity && c6.parity.onlyInOne } },
    { id: 10, q: 'still feels like itself, not a generic card dashboard', verdict: live.q10, bar: BARS.q10, numbers: A_CELL.q10 },
  ];
  out.questions = questions;
  // The SECOND cell's raw numbers, not only its verdicts. A drift line that says "q1 moved"
  // and cannot say WHICH controls moved is unactionable, and the first cause to rule out is
  // not the palette at all — a surface whose own state changed between the two cells (a sync
  // that finished, a row that loaded) drifts for a reason that has nothing to do with theme.
  out.altThemeVerdicts = liveAlt;
  out.altThemeNumbers = { theme: B_CELL.theme, controlsPainted: B_CELL.controlsPainted,
    q1: B_CELL.q1, q4: B_CELL.q4, q6: B_CELL.q6, q10: B_CELL.q10 };
  out.controlsPaintedA = A_CELL.controlsPainted;

  // --- verdict ----------------------------------------------------------------------------
  const findings = questions.filter((x) => x.verdict === 'NO').map((x) => `Q${x.id} ${x.q}`);
  const voided = [];
  const unscored = questions.filter((x) => x.verdict === 'MEASURE' || x.verdict === 'NO-SUBJECT');
  for (const u of unscored) voided.push(`Q${u.id} is ${u.verdict} — ${u.verdict === 'MEASURE' ? `no category-6 baseline at ${path.relative(process.cwd(), c6path)}` : 'the surface has no subject for this question'}`);
  if (!q5Moved && !CONTROL) {
    voided.push(`Q5's theme axis did not move (both themes report minRatio ${A_CELL.q5.minRatio}); the swap never reached the paint, so contrast stability measured nothing`);
  }
  if (out.storeIdentical === false) voided.push('persisted theme state was NOT restored byte-identical');
  if (out.restoreWarning) voided.push(out.restoreWarning);
  if (q6leg.restoreWarning) voided.push(q6leg.restoreWarning);
  // A surface whose §10.4 answers differ between themes has not answered them stably. Q6 is
  // excluded: both theme cells are taken in the presentation the surface was FOUND in, and Q6
  // is scored from its own Liquid leg, so comparing the two cells' q6 compares two readings of
  // a question neither of them answers.
  const drift = Object.keys(live).filter((k) => k !== 'q6' && live[k] !== liveAlt[k]);
  if (drift.length) voided.push(`verdicts drift with the theme (${drift.join(', ')}); a §10.4 answer that depends on the palette is not an answer`);

  if (CONTROL) {
    // The control must move all four. A control that does not fail voids the score rather
    // than passing it — the rubric's words.
    const moved = { Q2: live.q2 === 'NO', Q3: live.q3 === 'NO', Q5: q5.verdict === 'NO', Q10: live.q10 === 'NO' };
    out.controlResult = moved;
    const missed = Object.keys(moved).filter((k) => !moved[k]);
    out.verdict = missed.length
      ? `CONTROL DID NOT FAIL on ${missed.join(', ')} — those terms cannot return NO and measure nothing`
      : 'CONTROL FAILED AS REQUIRED on Q2, Q3, Q5, Q10';
    out.score = missed.length ? 'CONTROL-VOID' : 'CONTROL-OK';
  } else {
    out.findings = findings;
    out.voided = voided;
    out.score = voided.length ? 'VOID' : findings.length === 0 ? 10 : 10 - findings.length;
    out.verdict = out.score === 10 ? 'PASS 10/10' : out.score === 'VOID' ? 'VOID' : `${out.score}/10 — ${findings.length} question(s) answer NO`;
  }

  await ev(`(function(){ ${PIN} = null; window.__cat5primary = null; window.__cat5primaries = null; return 'cleared'; })()`);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
  console.log('\nwrote', OUT);
  console.log(`CATEGORY 5 — ${LABEL} (${out.hostClass}, ${out.box}): ${out.verdict}`);
  for (const f of out.findings || []) console.log(`  FINDING  ${f}`);
  for (const v of out.voided || []) console.log(`  VOID     ${v}`);
  if (out.score === 'CONTROL-VOID') process.exit(1);
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
