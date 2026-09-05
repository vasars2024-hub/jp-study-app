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
 *  6. A body left SCROLLED by an earlier probe makes Q3's "at rest" and Q4's "default state"
 *     meaningless, and it published a false Q3 FINDING on Resources before it was caught.
 *     `bodyScrollTop` is reported in every snapshot and a non-zero one REFUSES; `--allow-scroll`
 *     scores anyway for a surface that genuinely restores an offset. Argued at the refusal.
 *  7. "Advanced tools discoverable" has no advanced-tool subject on a one-control surface.
 *     A disclosure is required once the surface asks the user to scan more than three controls;
 *     at three or fewer, the absence of a disclosure is valid only when none of those controls
 *     is already behind one. Category 6 remains responsible for proving that features were not
 *     hidden from this painted-control census. The clutter plant takes every surface over three,
 *     so this zero-subject branch is falsifiable rather than a blanket exemption.
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
/**
 * `--alt-attr name=value` — the SECOND CELL driven by a root attribute instead of a theme
 * swap. DEFAULT EMPTY, so every one of the banked baselines re-derives bit-identical.
 *
 * Q5 asks whether contrast is STABLE, and the second cell is only evidence if it is a
 * rendering the product actually ships. For an app window a foreign palette is exactly
 * that. For a SHELL it is not: `.os-desktop-wired` exists only while a wired theme is
 * applied, and `wired-archive` is the only theme in its family — measured 2026-08-31,
 * `theme/wired-archive.ts` is the single `materialSet: 'wired'` id. The classic-light leg
 * therefore reported 79 failures for a combination the product never renders, and all 79
 * were hosted-window content besides.
 *
 * What a shell DOES have is its own degradation ladder, and it is a shipped three-way user
 * control: `data-display-transparency` (full / reduced / off), whose `off` tier reuses the
 * high-contrast block's opaque values (`liquid-tokens.css:280`). That is the moment the
 * taskbar's translucent fill becomes solid and every text run over it changes background —
 * a sharper stability question than a palette swap, asked inside the shell's own identity.
 *
 * The `q5Moved` VOID guard is unchanged and still decides whether the axis reached the
 * paint, so naming an attribute that changes nothing VOIDs rather than passes.
 */
const ALT_ATTR = arg('alt-attr', '');
const ALT_ATTR_NAME = ALT_ATTR ? ALT_ATTR.split('=')[0] : '';
const ALT_ATTR_VALUE = ALT_ATTR ? ALT_ATTR.slice(ALT_ATTR.indexOf('=') + 1) : '';
if (ALT_ATTR && (!ALT_ATTR_NAME || ALT_ATTR.indexOf('=') < 0)) {
  console.error('REFUSE - --alt-attr must be name=value, e.g. --alt-attr data-display-transparency=off');
  process.exit(2);
}
const CONTROL = has('control');
/**
 * `--allow-scroll` — measure a surface whose body is NOT at its resting scroll position.
 * Off by default and deliberately awkward: see the refusal in SNAP. The value is recorded in
 * every snapshot either way, so a run taken with it stays attributable rather than silent.
 */
const ALLOW_SCROLL = has('allow-scroll');
/** `--allow-hover` — score with the pointer parked on a control (correction 41). */
const ALLOW_HOVER = has('allow-hover');
/**
 * `--shell-chrome "<selector list>"` — DEFAULT EMPTY, and every baseline taken before this
 * option existed is therefore bit-identical under it.
 *
 * Q4 asks whether THIS SURFACE's default view is cluttered. The bar already refuses to charge
 * a surface for chrome it did not author: `chromeControls` excludes `.fwin-bar`, the floating
 * window's own title bar. Music is the first surface scored whose root is a SHELL rather than
 * a single app — `@.fwin:has(.mc-root)` is the entire Media Center — and its nav rail, top bar
 * and persistent player bar are byte-identical on all six of its sections. Charging Music for
 * them makes it the only one of the 18 scored surfaces whose root contains another surface's
 * chrome, and makes the score incomparable with the 17 single-app windows.
 *
 * So the exclusion is widened by exactly one principle — same chrome, more of it — and it is
 * made LOUD rather than silent: it applies only when a run names the selectors, `shellControls`
 * and `shellChromeSelector` land in the snapshot so a reader can add them back and disagree,
 * and `scannedControls` keeps its unchanged `<= 12` bar. What it must never become is a
 * general escape hatch: it is not for a surface's own toolbar, and a run that used it says so
 * in its baseline.
 */
const SHELL_CHROME = arg('shell-chrome', '');
/**
 * `--hosted "<selector>"` — WHAT THIS SHELL HOSTS. Defaults to `.fwin`, so every one of the
 * 20 banked baselines re-derives bit-identical and this is a no-op unless a run names it.
 *
 * CORRECTION 30, and it is one correction that answers three open terms at once.
 *
 * Shell detection was spelled "a root that is not a `.fwin` and CONTAINS one". That is not the
 * definition of a shell, it is the definition of the TWO shells that had been scored when it
 * was written. Blanc is a third: `.blanc-root` hosts one of 42 interchangeable tools inline in
 * `.blanc-content` and never renders a floating window at all. So it read `hostClass:
 * 'root-selector'`, and every consequence of being a shell was withheld from it:
 *
 *   Q4  the hosted surface's controls were charged to the shell — the same double-count the
 *       `.fwin` scope exists to prevent, and the reason the shell's clutter number moved with
 *       whichever tool happened to be open.
 *   Q5  the text walk measured 118 runs, most of them the open tool's content, so "does the
 *       SHELL hold contrast" was answered by a hosted surface.
 *   Q6  `isShellRoot` false sent it down the floating-window branch, where it looked for
 *       `.fwin-b-liquid` inside a shell that has no `.fwin`, found none, and refused
 *       "surface has no Liquid presentation control" — on a shell whose chrome carries
 *       `data-lq-role="liquid"` unconditionally (`BlancShell.tsx:435`), which is precisely
 *       the case the shell branch above `isShellRoot` was written for.
 *
 * The structural test is kept and only its VOCABULARY is parameterised: a shell is a root that
 * is not itself the hosted thing and contains one. It is still never named by title, a hosted
 * root can never satisfy it, and a chromeless reader root contains nothing. A run that names a
 * hosted selector says so in `hostedSelector` in its own baseline, so a reader can put the
 * hosted surface back and disagree with the rule rather than with the verdict.
 *
 * What it must not become: a way to subtract a surface's OWN body. `.blanc-content` qualifies
 * because the 42 tools inside it are separately-scored surfaces with their own identities,
 * exactly as the Media Center's sections are; a plain app's content region does not.
 */
const HOSTED = arg('hosted', '.fwin');
/**
 * `--alt-class "<class>"` — the second Q5 cell driven by a class on the SURFACE ROOT.
 * DEFAULT EMPTY, so every banked baseline re-derives unchanged. Mutually exclusive with
 * `--alt-attr`, which drives an attribute on `documentElement`.
 *
 * Q5 asks whether contrast is STABLE, and the second cell is only evidence if it is a
 * rendering the product actually ships. `--alt-attr` was added for the Wired shell because a
 * foreign palette is not one; it puts the attribute on `documentElement`, which is where the
 * theme and display-transparency axes live. A shell whose alternate rendering is a CLASS ON
 * ITS OWN ROOT is out of that lever's reach as written: Blanc renders `.is-dark` on
 * `.blanc-root` from `settings.darkMode` (`BlancShell.tsx:433`), and `data-theme` is null in
 * the Blanc window entirely — so the theme axis moved nothing and the run VOIDed, correctly,
 * on 118 measured runs that never changed.
 *
 * DRIVEN BY WRITING THE CLASS, NOT BY PRESSING THE CONTROL, and the distinction matters. The
 * question here is about a RENDERING, not about an affordance — category 6 owns "can the user
 * get back", and its decision 1 is the opposite for the opposite reason. Pressing Blanc's Dark
 * checkbox would write `settings.darkMode` to a PERSISTED store, which is trap 4's territory
 * and the one thing this harness has already damaged the app doing. The class is captured and
 * restored, the restore is compared before any verdict, and the `q5Moved` / paintKey guard
 * still decides whether the axis reached the paint — so naming a class that changes nothing
 * VOIDs rather than passes.
 */
const ALT_CLASS = arg('alt-class', '');
/**
 * `--fixed-material` — the surface deliberately paints its own palette independently of the
 * document theme. This is not a waiver for an axis that failed to apply: both theme attributes
 * must still differ, and EVERY measured text run in both cells must resolve to an opaque
 * background authored inline by the surface. Sticky notes are the motivating case — their
 * selected paper colour is user state, not a theme token. The ordinary contrast plant remains
 * the negative control and still has to make Q5 fail.
 */
const FIXED_MATERIAL = has('fixed-material');
if (ALT_CLASS && ALT_ATTR) {
  console.error('REFUSE - --alt-class and --alt-attr are two spellings of the same second cell; name one.');
  process.exit(2);
}
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
  // `ok:true` WITH `{__error}` IS A THROW, not an answer: main caught the exception, so
  // the REQUEST succeeded and `.ok` is true. Readers that JSON.parse the result then report
  // `"[object Object]" is not valid JSON`, which names neither the throw nor the expression.
  // Measured 2026-09-03: a null deref inside one cat6 mutation surfaced only as that message.
  if (t.result && typeof t.result === 'object' && t.result.__error) {
    throw new Error(`eval THREW in the renderer: ${t.result.__error} :: ${js.trim().slice(0, 200)}`);
  }
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

/**
 * CORRECTION (2026-08-31, primary): THE ROOT'S OWN BODY, not the first one inside it.
 * Both uses in this file were `root.querySelector('.fwin-body') || root` — a DESCENDANT search,
 * right for a `.fwin` root and wrong for every SHELL root, which CONTAINS floating windows and
 * therefore contains their bodies. Measured live on `@.os-desktop-wired`: the old expression
 * returned a **0x0** body owned by the 'SIG-VID / Signal Archive' window on a 1264x821 desktop.
 *
 * Same bug class as corrections 32/33/33b in `cat3-liquid-utilization.cjs` and
 * `l1-surface-roles.js` (`67594273`) and correction 22 in `cat4-use-of-space.cjs` (`1b937fc9`) —
 * containment mistaken for ownership. It is worse than a refusal in both sites here: the
 * SNAPSHOT reads `B`, the body viewport that Q3 ("the primary action is inside the body viewport
 * at rest") and Q4 are scored against, so a shell would be scored against a minimised window's
 * empty box; and the PLANT would mount its control nodes into that same 0x0 box, where nothing
 * renders, no bar moves, and the control reports "DID NOT FAIL" on a falsifiable question.
 *
 * Ownership, not containment: a `.fwin-body` belongs to this root only when the `.fwin` it
 * belongs to IS this root. A chromeless root owns none and IS its own body.
 */
const OWN_BODY_FN = `function(root){
  if (!root) return root;
  var bodies = [].slice.call(root.querySelectorAll('.fwin-body'));
  for (var i = 0; i < bodies.length; i += 1) {
    if (bodies[i].closest('.fwin') === root) return bodies[i];
  }
  return root;
}`;

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
  /*
   * The dev-only exclusion is correction 38's, further down (\`devOnly()\`), NOT here.
   * primary2 wrote the identical exclusion into this predicate on 2026-09-04, concurrently
   * and independently, and it was dropped on the merge rather than kept alongside: two
   * overlapping exclusions of the same subtree would have double-reported it, and 38's
   * numbers (Q4 9->5, Q6 2->1) are the ones already committed to the scorecard.
   */
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
   * Split a \`background-image\` value into its layers on TOP-LEVEL commas only. Commas inside
   * \`rgba()\`, \`color()\` and a gradient's own argument list are not layer separators, so a
   * plain \`.split(',')\` shreds one gradient into four fragments. Depth-counted, which is all
   * that is needed: computed values carry no quoted strings for a comma to hide in, and any
   * \`url()\` has already returned UNMEASURABLE before this is reached.
   */
  function splitLayers(v){
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < v.length; i++) {
      var ch = v[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
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
        //
        // CORRECTION 27, Video/classic-light 2026-08-31 — the SAME family again, one level up:
        // trap 7's other half fixed the per-STOP alpha and left the per-LAYER one.
        // \`cs.backgroundImage\` is ONE string holding EVERY layer, so the regex above harvested
        // stops across all of them into a single list and \`min(alphas)\` was the most transparent
        // stop of the most transparent LAYER. \`--mc-stage-plate\` is
        // \`radial-gradient(<accent>/0.1 …), linear-gradient(opaque, opaque)\`: min is the 10%
        // bloom, so the walk did NOT stop at an opaque lower layer and it composited
        // \`.mc-video-stage\`'s dark fill under a plate that hides it completely — reporting
        // \`22 failing, minRatio 1.01\` on a plate verified white by a live computed-style read.
        // Layers are scored SEPARATELY, in paint order (CSS lists topmost first, which is the
        // order this array already wants), and the walk stops when ANY ONE layer is opaque
        // everywhere. A layer that drops a fully transparent stop is not opaque everywhere and
        // may not seal, even if every stop it retained is opaque.
        var imgLayers = splitLayers(img), sealed = false;
        for (var li = 0; li < imgLayers.length && !sealed; li++) {
          if (!/gradient\\(/.test(imgLayers[li])) continue;
          var raw = imgLayers[li].match(/(rgba?\\([^)]*\\)|color\\([^)]*\\))/g) || [];
          var stops = [], alphas = [], holed = false;
          for (var gi = 0; gi < raw.length; gi++) {
            var ga = alphaOf(raw[gi]);
            if (ga <= 0.004) { holed = true; continue; }
            var gc = parseRgb(raw[gi]);
            if (gc) { stops.push(gc); alphas.push(ga); }
          }
          if (!stops.length) continue;
          layers.push({ stops: stops, alphas: alphas, a: Math.max.apply(null, alphas) });
          from.push('gradient layer ' + (li + 1) + ' of ' + imgLayers.length + ' on ' + name(n));
          if (!holed && Math.min.apply(null, alphas) >= 0.996) sealed = true;
        }
        // Falls through to this same element's background-color, which a gradient paints OVER —
        // unless one of its layers already sealed, in which case nothing below it is visible.
        if (sealed) break;
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
  var body = (${OWN_BODY_FN})(root);
  var B = body.getBoundingClientRect();
  /**
   * CORRECTION 27 — SHELL SCOPE. Same family as the OWN_BODY_FN repair above it, one level
   * out: that one stopped the harness reading a hosted window's BODY as the shell's; this
   * one stops it reading the hosted windows' CONTENTS as the shell's.
   *
   * Measured live on the Wired shell 2026-08-31: 112 painted controls inside
   * \`.os-desktop-wired\`, of which 13 belong to the shell and 99 are the hosted Media
   * Center's nav rail, menubar and search. Those windows are separately-scored surfaces, so
   * the unscoped read charged them TWICE and made the shell's number a function of which
   * windows happened to be open. Q5 was worse: its classic-light cell reported 79 failing
   * text runs, every one of them hosted-window content.
   *
   * A SHELL IS DETECTED STRUCTURALLY, never named: a root that is not itself the hosted thing
   * and CONTAINS one. A hosted root can never satisfy it, a chromeless reader root contains
   * none, so \`rq\` is the identity function on every one of the 18 surfaces already banked
   * and their baselines re-derive bit-identical. Same principle as category 6's shell
   * decision 3 (\`shq\`), reached from the same evidence. The selector is \`--hosted\`,
   * default \`.fwin\` — see correction 30 at its declaration.
   */
  // root.matches(HOSTED_SEL) and not isFwin: identical for the .fwin default (isFwin IS that
  // match), and correct for a named selector, where "am I the hosted thing" has to be asked
  // about the hosted thing rather than about a floating window. (No backticks in this block:
  // it lives inside a template literal and one backtick ends it.)
  var HOSTED_SEL = ${A(HOSTED)};
  var isShell = !root.matches(HOSTED_SEL) && !!root.querySelector(HOSTED_SEL);
  function rq(sel){
    var list = [].slice.call(root.querySelectorAll(sel));
    return isShell ? list.filter(function(e){ return !e.closest(HOSTED_SEL); }) : list;
  }
  function rq1(sel){ return rq(sel)[0] || null; }
  /**
   * TRAP 6 — "AT REST" IS NOT WHATEVER THE LAST PROBE LEFT BEHIND, and this one had already
   * published a false FINDING before it was caught. Q3's bar is literally "the primary action
   * is inside the body viewport AT REST", and Q4's is "the default state" — both are undefined
   * on a body someone else scrolled. Resources' first post-disclosure run scored Q3 NO with
   * \`primaryAction: input.gram-search, insideBodyViewport: false\`, which read exactly like a
   * layout regression from the disclosure landing above it. It was not: an earlier probe had
   * left \`.fwin-body\` at \`scrollTop: 1563\`, so the search field sat at \`top: -1364\` — off
   * the top of its own window, 1.5 screens up. The layout never changed.
   *
   * Same family as the stale-search-box trap this surface already paid for: leftover UI state
   * manufactures both false passes and false failures. So the value is REPORTED in every
   * snapshot, and a non-zero one REFUSES rather than scoring. \`--allow-scroll\` measures
   * anyway when a surface genuinely restores a scroll offset on mount, and the recorded
   * number is then what makes that score arguable.
   */
  var bodyScrollTop = Math.round(body.scrollTop || 0);
  if (bodyScrollTop > 0 && !${ALLOW_SCROLL})
    return JSON.stringify({ refuse: 'body is scrolled ' + bodyScrollTop + 'px off its resting position - "at rest" (Q3) and "the default state" (Q4) are undefined here. Scroll it to the top, or pass --allow-scroll to score it where it stands.' });
  /*
   * CORRECTION 41 (2026-09-04, primary2) -- A PARKED CURSOR MANUFACTURES AN ENTRY POINT.
   *
   * filled() is "paints a background and separates from its host by >= 1.2:1". A hover fill
   * satisfies it, and the pointer stays wherever the last bridge /click left it: an operator
   * who clicked a control to set the surface up leaves that control in :hover for the whole
   * run. Caught on City the same turn it was introduced -- a manual click on the frameless
   * Liquid toggle (to restore a presentation an earlier run had stranded) left button.fwin-b
   * hovered, its 16% hover wash counted as the only filled button among its siblings, and Q1
   * scored entryPoints 1 on an ambient canvas scene that has no accent control at all.
   * Verdict PASS 10/10, one term of it fabricated by the mouse.
   *
   * The harness's own Q6 leg is not the culprit -- it clicks synthetically, which sets no
   * hover state -- so this is about the state a run INHERITS. It cannot be corrected for
   * (a hovered element's computed background is not its resting one, and there is no way to
   * read the resting one back), so it is a REFUSAL, in the same shape as bodyScrollTop:
   * cheap to clear by parking the pointer, and --allow-hover scores it where it stands.
   */
  var hoveredControls = rq(CTRL).filter(function(e){ return e.matches(':hover'); }).map(name);
  if (hoveredControls.length && !${ALLOW_HOVER})
    return JSON.stringify({ refuse: 'the pointer is parked on ' + hoveredControls.join(', ')
      + ' - a hover fill satisfies filled() and invents a Q1 entry point, and a hover colour is not the resting one Q5 walks. Move the pointer off the surface, or pass --allow-hover to score it where it stands.' });
  var controls = rq(CTRL).filter(painted);
  function inBody(e){
    var b = e.getBoundingClientRect();
    return b.top >= B.top - 1 && b.bottom <= B.bottom + 1 && b.width > 0;
  }
  var NAV = 'nav,[role="tablist"],[class*="rail"],[class*="sidebar"],[class*="-nav"],[class*="tabs"]';

  /*
   * A SHELL'S OWN FURNITURE, read from the shared contract instead of from one shell's class
   * names. Both shells in the tree mark their chrome the same way -- .os-taskbar carries
   * data-lq-role="liquid" (DesktopShell.tsx:3081) and so do .blanc-taskbar and .blanc-top
   * (BlancShell.tsx:436, :476) -- which is the same declaration LiquidAppScaffold marks its
   * rail and dock with. rq() keeps it to the shell's own regions, never the hosted surface's.
   */
  var ownChrome = isShell ? rq('[data-lq-role="liquid"]') .filter(painted) : [];
  function inOwnChrome(e){
    for (var oc = 0; oc < ownChrome.length; oc++) if (ownChrome[oc].contains(e)) return true;
    return false;
  }

  // ---- Q1: one obvious way in. ------------------------------------------------------------
  function entryBand(e){
    var b = e.getBoundingClientRect();
    /*
     * App reading order starts at the top. A desktop shell deliberately inverts that
     * convention: its authored entry band is the taskbar at the bottom.
     *
     * CORRECTION 31 -- "the bottom third" is where the Study OS taskbar happens to be, not
     * what an entry band IS. Blanc's taskbar is a full-height rail on the LEFT, so the
     * bottom-third rule found entryPoints 0 on a shell whose entry band is its most
     * prominent element, and Q1 Q3 both read NO for a reason that is a property of the
     * probe. The band is now the bottom third OR the shell's own marked chrome -- a strict
     * SUPERSET, so it can only add an entry point and never remove one, and the .os-taskbar
     * sits inside the bottom third already, which is why Wired re-derives unchanged.
     */
    return b.width > 0 && (isShell
      ? (b.bottom > B.bottom - B.height/3 || inOwnChrome(e))
      : b.top < B.top + B.height/3);
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
    return e.matches('input:not([type=checkbox]):not([type=radio]),textarea,select') && entryBand(e); });
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
    return e.matches('button,[role="button"]') && entryBand(e)
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
  /*
   * A SHELL HAS NO HEADING, and looking for one is the same host-taxonomy miss the
   * chromeless branch above was written to fix. A desktop shell does not sit somewhere in
   * an app; it IS the place, and "where am I" is which of its own places is current. The
   * product states that the standard way -- the selected desktop switch carries
   * aria-pressed="true" -- so the term reads the app's own declaration rather than
   * inventing a shell-specific selector. Any surface that marks current-ness with
   * aria-current / aria-pressed / aria-selected answers it the same way.
   *
   * DISCLOSED: this reads an attribute that landed in a2e9c1ce, ten minutes before this
   * line. Before it, the Wired shell stated its desktop only in paint, and the honest
   * verdict on that markup is the NO this used to give.
   */
  var titleEl = isFwin
    ? root.querySelector('.fwin-title-text, .fwin-title')
    : isShell
      ? (rq('[aria-current]:not([aria-current="false"]),[aria-pressed="true"],[aria-selected="true"]').filter(function(e){
          return painted(e) && (e.textContent || '').trim().length > 0; })[0] || null)
      : (rq('h1,h2,[role="heading"],[class*="-title"],[class*="-header"] [class*="name"]').filter(function(e){
          return painted(e) && (e.textContent || '').trim().length > 0; })[0] || null);
  var titleText = titleEl ? (titleEl.textContent || '').trim() : '';
  /*
   * A LOCATION LABEL THE PRODUCT AUTHORS, not only one it PAINTS -- measured 2026-09-04 on
   * the Visualizer widget. Three desktop trinkets (visualizer, music widget, Mooncap garden)
   * deliberately paint no title text: DesktopShell returns the empty string for them so a
   * 380x200 ambient window does not carry a title bar's worth of chrome, and the taskbar
   * names them. The probe read the fwin title span only, so it scored those three as
   * UNLOCATED -- a NO whose remedy would have been to add back the chrome the design
   * deliberately removed. That is fixing the instrument's art, not the product's defect.
   *
   * The real defect the run exposed is narrower and worth keeping: a section element with no
   * accessible name is not a region landmark, so all three were unnamed to assistive tech.
   * That is repaired in the product, with an aria-label on the untitled window only. The bar
   * widens to match: an AUTHORED name counts, painted or announced.
   *
   * STRICT SUPERSET, so nothing already banked can move: the fallback is reached only when
   * titleText is empty, and an empty titleText already scored NO. It can turn a NO into a
   * YES and can never turn a YES into a NO. titleFrom records which of the two answered, so
   * a reader can still see that this surface has no PAINTED title.
   *
   * NO BACKTICKS in this block: it lives inside the SNAP template literal, and one closes it.
   */
  var titleFrom = titleEl ? name(titleEl) : null;
  if (!titleText && isFwin) {
    var ariaName = (root.getAttribute('aria-label') || '').trim();
    if (ariaName) { titleText = ariaName; titleFrom = name(root) + '[aria-label]'; }
  }
  var backAffordances = controls.filter(function(e){
    var l = (e.getAttribute('aria-label') || e.title || e.textContent || '').trim();
    return /^(back|home|close|exit|×|✕|返回|назад|戻る|閉じる)$/i.test(l)
      || /back|home|close|exit/i.test(String(e.className || ''))
      || (isShell && e.classList.contains('os-show-desktop-btn'));
  });

  // ---- Q3: primary action visible without scrolling. --------------------------------------
  // Prefer a control the app itself marks primary; taking accentButtons[0] answered YES about
  // the wrong element on two surfaces (a JA/ZH grammar toggle, a nav row).
  /*
   * THE HARNESS'S OWN PLANTS ARE NOT THE PRODUCT'S PRIMARY ACTION — the third repair to this
   * one term, and the same defect as the two above it in a shape the pin could not cover.
   * Pinning fixed "the plant moved a different node"; moving every branch fixed "the plant
   * promoted the next node". Both reason about nodes that exist when the pin is taken. The Q10
   * dashboard plant CREATES six new controls (className cat5ctl-kind-N, inside its
   * data-cat5-plant="dashboard" grid), and they are appended to the body AFTER the pin. So on a
   * surface with no explicit primary and no accent button, the planted read resolves
   * primaryAction to input.cat5ctl-kind-1 — a control the harness itself put there, inside the
   * viewport by construction — and Q3 stays YES no matter what the Q3 plant moved.
   *
   * Measured on the Wired shell: the Q3 plant correctly found and moved button.os-start-btn
   * (primariesMoved 1), and Q3 still answered YES on input.cat5ctl-kind-1. Verdict
   * "CONTROL DID NOT FAIL on Q3" on a question that is perfectly falsifiable.
   *
   * Q4 is why this is scoped to Q3 rather than filtered globally: its clutter plants are MEANT
   * to be counted in scannedControls, and excluding them everywhere would disarm that control.
   * The attribute is spelled out because SNAP is defined above the PLANT const and cannot
   * interpolate it — if PLANT ever changes, this string changes with it.
   */
  var notPlant = function(e){ return !e.closest('[data-cat5-plant]'); };
  var explicitPrimary = controls.filter(function(e){
    return declaredPrimary(e)
      && notPlant(e)
      && !e.closest('.fwin-bar') && !e.closest(NAV); })[0];
  var primaryAction = explicitPrimary
    || accentButtons.filter(notPlant)[0]
    || primaryInputs.filter(notPlant)[0]
    || null;
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

  /*
   * CORRECTION 38 (2026-09-04, backup) -- THIS HARNESS WAS THE LAST ONE STILL SCORING
   * DEBUG CONTROLS NO PACKAGED BUILD SHIPS.
   *
   * The product marks a development-only subtree data-dev-only next to its own
   * import.meta.env.DEV guard -- an attribute, deliberately machine-readable, written for
   * exactly this (ReadingGardenSkyEvents.tsx:300-309). cat4 (isDevOnly, line 555), cat7
   * (correction 28) and cat8 (correction 28, both the text walk and the language leg) all
   * honour it. cat5 did not, and it is the only harness that still charged those controls to
   * a product score.
   *
   * Measured live on City through the bridge before the change: the frameless root holds ONE
   * [data-dev-only] root, DIV.lq-hit-scope reading-garden-sky-console, and 4 of the surface's
   * 9 painted controls sit inside it -- Sky sim, Star, Asteroid, Ice barrage. Q6's ONLY
   * untreated Liquid region was div.reading-garden-sky-console-body, that same subtree's
   * panel: the whole category turned on motion the user can never see.
   *
   * THIS IS NOT AN ESCAPE HATCH, and the difference from --shell-chrome is the point:
   * --shell-chrome is a RUN parameter, so a run can name anything it likes and empty the
   * count. This reads an attribute the PRODUCT writes beside a real build-time guard -- a
   * surface cannot opt out of its score without also removing the control from the shipped
   * build, which is the honest version of the same move. Both counts are published
   * (devOnlyControls, devOnlyLiquidRegions) so a reader can add them back and disagree with
   * the rule rather than with the verdict.
   *
   * NO BACKTICKS IN THIS BLOCK -- it sits inside the in-page template literal, and writing
   * them here is exactly how this correction failed to parse on its first run.
   */
  function devOnly(e){ return !!e.closest('[data-dev-only]'); }
  var devOnlyControls = controls.filter(devOnly).length;

  // ---- Q4: advanced tools tucked away, default view not cluttered. ------------------------
  var collapsed = rq('details:not([open]),[aria-expanded="false"]').filter(painted).filter(function(e){ return !devOnly(e); });
  function repeatingRow(e){
    return e.closest('.dict-entry,[class*="-row"],[class*="-card"],[class*="-item"],[class*="-spotlight"],li'); }
  // --shell-chrome: the same rule as the .fwin-bar exclusion below, extended to the selectors
  // a run names. Empty by default, so an unparameterised run is identical to every baseline
  // taken before this option existed. (No backticks in here: this block lives inside a
  // template literal and one backtick ends it — that cost a run.)
  var SHELL_SEL = ${A(SHELL_CHROME)};
  function shellChrome(e){ return !!SHELL_SEL && !!e.closest(SHELL_SEL); }
  var notPageControls = controls.filter(function(e){ return !repeatingRow(e) && !e.closest('.fwin-bar') && !devOnly(e); });
  var shellControls = notPageControls.filter(shellChrome);
  var chromeControls = notPageControls.filter(function(e){ return !shellChrome(e); });
  /*
   * CORRECTION 19 — the <details> exclusion had an ARIA half it never applied.
   *
   * collapsed already counts [aria-expanded="false"] as a disclosure, so the harness
   * ALREADY treats the ARIA pattern as equivalent to <details> on the closed side. It
   * did not on the open side: inDisclosure excluded the contents of every <details>,
   * OPEN ONES INCLUDED, but charged an aria-controls region's contents in full. A
   * surface using the APG disclosure pattern instead of <details> was therefore scored
   * on a rule its markup could not satisfy — Scraper's settings drawer put 41 of 50
   * controls into scanned, and only because the drawer was open in the live app.
   *
   * The extension is exactly symmetric, not a loosening: a region is tucked away when a
   * PAINTED control on this surface names it through aria-controls and declares its
   * state with aria-expanded. Two guards keep it from becoming the general escape hatch
   * --shell-chrome is documented not to be:
   *   - a region that CONTAINS its own toggle is ignored, so a surface cannot mark its
   *     own wrapper (or the root) and empty the count;
   *   - the toggle itself is never excluded, exactly as SUMMARY is not.
   * ariaDisclosures lands in the snapshot with each region and how many controls it
   * took, so a reader can add them back and disagree with the rule rather than the
   * verdict. The bar stays at 12.
   */
  var ariaRegions = [];
  rq('[aria-expanded][aria-controls]').filter(painted).forEach(function(tog){
    // .split(' ') and not /\\s+/: this block is inside a template literal, where a
    // lone backslash-s collapses to a bare "s" and the id splits on its own letters.
    // aria-controls is space-separated by spec, so the plain split is also correct.
    (tog.getAttribute('aria-controls') || '').split(' ').forEach(function(id){
      if (!id) return;
      var region = null;
      try { region = rq1('#' + CSS.escape(id)); } catch (e) { region = null; }
      if (!region || region === root || region.contains(root) || region.contains(tog)) return;
      if (ariaRegions.indexOf(region) < 0) ariaRegions.push(region);
    });
  });
  function inAriaDisclosure(e){
    for (var i = 0; i < ariaRegions.length; i++) if (ariaRegions[i].contains(e)) return true;
    return false;
  }
  // The clutter term is controls the user must SCAN in the default state: chrome, minus the
  // contents of any <details> (tucked away by definition) and minus the summary headers
  // (counted once by collapsedDisclosures, not charged twice). The bar stays at 12.
  function inDisclosure(e){
    if (e.tagName === 'SUMMARY') return false;
    if (e.closest('details')) return true;
    return inAriaDisclosure(e);
  }
  var summaryHeaders = chromeControls.filter(function(e){ return e.tagName === 'SUMMARY'; });
  var behindDisclosure = chromeControls.filter(inDisclosure);
  var scannedRaw = chromeControls.filter(function(e){ return !inDisclosure(e) && e.tagName !== 'SUMMARY'; });
  /*
   * CORRECTION 34 -- A ROUTE MAP IS ONE SCAN, NOT N.
   *
   * Q4 asks whether ADVANCED TOOLS are tucked away and the default view is uncluttered. A
   * navigation landmark's destinations are neither advanced nor tools: they are the surface's
   * map, and a reader takes a map in as one object. The instrument already says this twice --
   * repeatingRow drops a control inside a repeating li/-row/-card because repeated instances
   * of one kind of thing are scanned as a group, and Q3 excludes NAV outright because
   * navigation is not the surface's primary action. Blanc is where charging N bit: its shell
   * is a nine-destination rail, so the rail alone spent 9 of the 12 budget and no amount of
   * tucking the actual tools away could bring the number under the bar.
   *
   * THREE GUARDS KEEP THIS FROM BEING THE GENERAL ESCAPE HATCH --shell-chrome is documented
   * not to be, and they are why the banked runs cannot move:
   *   - a real landmark (nav / role=navigation), not any container a surface calls a rail;
   *   - at least 3 of them, so a two-button group is still counted in full;
   *   - EXACTLY ONE control signature among them, ignoring state classes. This is Q10's own
   *     gallery discriminator reused rather than a new rule, and it is the guard that matters:
   *     measured 2026-08-31, .os-taskbar carries role="navigation" and holds THREE signatures
   *     (os-desktop-switch, os-task-win, tray), so the Wired cell does not collapse at all.
   * The group counts once rather than zero, every collapsed group lands in navRouteGroups with
   * its size, and scannedRaw is published beside it, so a reader can add them back and
   * disagree with the rule instead of with the verdict. The bar stays at 12.
   */
  function ctlSignature(e){
    return e.tagName + '.' + String(e.className || '').split(' ')
      .filter(function(c){ return c && c !== 'active' && c !== 'is-active' && c !== 'selected' && c !== 'current'; })
      .sort().join('.');
  }
  /*
   * CORRECTION 35 (2026-09-04, primary) -- A TABLIST IS A ROUTE MAP TOO.
   *
   * Correction 34's own words are "a navigation landmark's destinations are neither advanced
   * nor tools: they are the surface's map, and a reader takes a map in as one object". A
   * declared tablist is that same object by a different name -- one visible panel out of N,
   * chosen by a switcher -- and APG treats the whole tablist as ONE tab stop for exactly this
   * reason. Measured on grammar: its four mode tabs spent 4 of the 12 budget while being the
   * one control on the surface a reader never has to read twice.
   *
   * NO BACKTICKS ANYWHERE IN THIS BLOCK. It sits inside the in-page template literal, so one
   * backtick ends the string and the whole harness fails to parse -- which it did, once, and
   * the stale --out JSON from the previous run read exactly like a fresh unchanged result.
   *
   * ALL THREE of correction 34's guards apply unchanged and are what keep this narrow, so this
   * is one more accepted ROLE and not a new rule: the role must be declared (a div a surface
   * merely styles as tabs does not collapse), there must be at least 3 of them, and they must
   * share EXACTLY ONE control signature. A toolbar with mixed controls collapses nothing.
   * Every collapsed group is still published in navRouteGroups with its landmark and size.
   */
  var navRouteGroups = [];
  var navCollapsed = [];
  rq('nav,[role="navigation"],[role="tablist"]').filter(painted).forEach(function(lm){
    var inside = scannedRaw.filter(function(e){ return e !== lm && lm.contains(e) && navCollapsed.indexOf(e) < 0; });
    if (inside.length < 3) return;
    var sigs = [];
    inside.forEach(function(e){ var s = ctlSignature(e); if (sigs.indexOf(s) < 0) sigs.push(s); });
    if (sigs.length !== 1) return;
    navRouteGroups.push({ landmark: lm.tagName + '.' + String(lm.className || ''),
      signature: sigs[0], routes: inside.length, countedAs: 1 });
    navCollapsed = navCollapsed.concat(inside.slice(1));
  });
  var scanned = scannedRaw.filter(function(e){ return navCollapsed.indexOf(e) < 0; });
  var allDetails = rq('details');

  // ---- Q5's population: every painted text run, and its worst ratio. ----------------------
  /**
   * Measured HERE rather than inherited, because Q5 asks whether contrast is STABLE and every
   * committed per-surface contrast number in this repo is a single theme cell. The sweep that
   * makes it a stability answer is the runner's; this is one cell of it.
   */
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  var seen = [], worst = null, minRatio = 99, failing = [], unmeasurable = 0;
  var fixedMaterialRuns = 0, fixedMaterialHosts = [];
  function fixedMaterialHost(el){
    for (var n = el; n; n = n.parentElement) {
      var cs = getComputedStyle(n);
      var inlineBg = n.style && (n.style.background || n.style.backgroundColor);
      if (alphaOf(cs.backgroundColor) >= 0.996) return inlineBg ? name(n) : null;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
    }
    return null;
  }
  /**
   * A WITNESS THAT THE AXIS REACHED THE PAINT, independent of minRatio.
   *
   * The runner VOIDs a run whose two cells report the same minimum, on the argument that the
   * swap never reached the paint. That argument is right and the witness was too narrow: it
   * is the WORST single ratio of the whole population, so an axis that repaints every run
   * and happens to leave the worst one alone reads exactly like a swap that did nothing —
   * and an axis that changes translucency without changing any composited colour (a
   * degradation tier zeroing --lq-liquid-blur) genuinely does repaint and genuinely does
   * not move a ratio. This accumulates every measured foreground and its composited
   * background into one djb2 digest, so the guard can ask what it actually means: did
   * ANYTHING about the paint change. Strictly more sensitive than the old term, so it can
   * only retire false VOIDs, never manufacture a pass — and both witnesses are reported.
   */
  var paintKey = 5381;
  function digest(str){
    for (var di = 0; di < str.length; di++) paintKey = ((paintKey * 33) ^ str.charCodeAt(di)) >>> 0;
  }
  /*
   * CORRECTION 39 (2026-09-04, backup) -- A THIRD WITNESS, BECAUSE THE FIRST TWO CANNOT TELL
   * "THE SWAP NEVER HAPPENED" FROM "THIS SURFACE DOES NOT READ THE PALETTE".
   *
   * Both existing witnesses are properties of THIS SURFACE's own paint: minRatio, and the
   * djb2 digest above. That is deliberate, and it is why the guard is a VOID rather than a
   * pass -- from the surface alone the two cases are genuinely indistinguishable, and this
   * repo has a recorded incident of a dataset theme flip reporting the OPPOSITE background.
   *
   * But it means a surface can be VOIDed for being CORRECT. City is that case: its chrome is
   * a fixed rgba plate over a night-sky canvas, so after the frameless-glyph repair
   * (bfba48af) nothing it paints depends on the palette -- both cells report minRatio 12.42
   * and the same paint digest, and the run VOIDed on the very property the fix was for.
   *
   * The witness that separates them is not on the surface at all: it is whether the SWAP
   * REACHED THE CASCADE. This resolves a fixed list of palette custom properties on
   * documentElement -- the tokens every themed surface derives from -- and digests them. If
   * those moved and the surface's paint did not, the surface provably does not read the
   * palette, which is an ANSWER to "stable contrast", not an absence of one. Measured on
   * City: --bg #0d0c12 -> #ffffff and --text #f5f4f7 -> #1e1e1e across the two cells.
   *
   * IT CANNOT MANUFACTURE A PASS, and that is checkable rather than asserted: it only ever
   * retires a VOID, the failing-run bar is untouched (failingCount must still be 0 in BOTH
   * cells for Q5 to read YES), both cells must have measured something so it cannot rescue an
   * empty harness, and a run whose theme attribute never changed leaves this digest identical
   * too -- which is the negative control recorded with this correction. The resolved values
   * are published per cell so a reader can check the swap by eye.
   *
   * NO BACKTICKS IN THIS BLOCK -- it sits inside the in-page template literal.
   */
  var PALETTE_TOKENS = ['--bg','--text','--muted','--panel','--panel-2','--border','--accent','--accent-2'];
  var paletteValues = {}, paletteKey = 5381;
  (function(){
    var rootCs = getComputedStyle(document.documentElement);
    PALETTE_TOKENS.forEach(function(tok){
      var v = (rootCs.getPropertyValue(tok) || '').trim();
      paletteValues[tok] = v;
      var s = tok + '=' + v + ';';
      for (var pi = 0; pi < s.length; pi++) paletteKey = ((paletteKey * 33) ^ s.charCodeAt(pi)) >>> 0;
    });
  })();
  for (var t = walker.nextNode(); t; t = walker.nextNode()) {
    var s = (t.nodeValue || '').trim();
    if (!s) continue;
    var el = t.parentElement;
    if (!el || !painted(el) || seen.indexOf(el) >= 0) continue;
    // The walker takes a ROOT, not a selector, so shell scope is applied here instead of
    // through rq(). Without it the shell's classic-light cell reported 79 failing runs,
    // every one of them a hosted window's own text.
    if (isShell && el.closest(HOSTED_SEL)) continue;
    seen.push(el);
    var cs = getComputedStyle(el);
    var fg = parseRgb(cs.color);
    if (!fg || alphaOf(cs.color) < 0.95) { unmeasurable++; continue; }
    var bgs = bgCandidates(el);
    if (bgs.unmeasurable) { unmeasurable++; continue; }
    var fixedHost = fixedMaterialHost(el);
    if (fixedHost) {
      fixedMaterialRuns++;
      if (fixedMaterialHosts.indexOf(fixedHost) < 0) fixedMaterialHosts.push(fixedHost);
    }
    // The worst stop, so a gradient is scored where it is hardest to read rather than on average.
    var r = Math.min.apply(null, bgs.colors.map(function(c){ return ratio(fg, c); }));
    digest(name(el) + '|' + fg.join(',') + '|' + bgs.colors.map(function(c){ return c.join(','); }).join(';'));
    var big = parseFloat(cs.fontSize) >= 24
      || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
    var bar = big ? 3.0 : 4.5;
    if (r < bar) failing.push({ el: name(el), ratio: Math.round(r*100)/100, bar: bar, bg: bgs.from, text: s.slice(0,24) });
    if (r < minRatio) { minRatio = r; worst = { el: name(el), ratio: Math.round(r*100)/100, bar: bar, bg: bgs.from, text: s.slice(0,24) }; }
  }

  // ---- Q6: does Liquid motion explain a real relationship. --------------------------------
  var blurRegions = rq('*').filter(function(e){
    if (!painted(e)) return false;
    var cs = getComputedStyle(e);
    return (cs.backdropFilter && cs.backdropFilter !== 'none')
      || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
  });
  // Liquid is not spelled backdrop-filter on every surface: .fwin is a backdrop root, so its
  // interior treatment is translucency + border + radius + shadow on .lq-contextual.
  var contextualPainted = rq('.lq-contextual').filter(function(e){
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
  var liquidMaterialAll = blurRegions.concat(contextualPainted).filter(function(e, i, a){ return a.indexOf(e) === i; });
  // CORRECTION 38's other half. City's only untreated Liquid region was the sky console's
  // panel, which is inside the [data-dev-only] root -- a NO whose only possible repair would
  // have been putting motion on a debug panel no user will ever open.
  var devOnlyLiquid = liquidMaterialAll.filter(devOnly);
  var liquidMaterial = liquidMaterialAll.filter(function(e){ return !devOnly(e); });
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
  var structural = rq('*').filter(function(e){
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
  rq('*').filter(painted).forEach(function(e){
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
  /*
   * A SHELL IS NOT CHROMELESS -- it is the chrome. The chromeless branch was written for a
   * full-screen reader that REPLACES the desktop shell, so all three OS markers are absent
   * by construction there. A desktop shell has every one of them by definition, and scoring
   * it against the replacement set gave identityCount 1 of 4 on a surface that owns the
   * taskbar, the desktop layer and the floating-window chrome the chromed set names. Same
   * repair as the 2026-08-26 one directly above, third host kind. THE BAR IS NOT LOWERED:
   * the shell is scored against the byte-identical chromed set the 18 .fwin surfaces use.
   */
  var chromelessHost = !isFwin && !isShell && fillsViewport;
  var surfaceChrome = !!rq1('[class*="-toolbar"],[class*="-topbar"],[class*="-header"],[class*="-bar"]');
  var themeToken = !!document.documentElement.getAttribute('data-theme');
  var identityMarkers = chromelessHost
    ? { surfaceChrome: surfaceChrome,
        themeToken: themeToken,
        bespokeRegionPrefix: bespokePrefixes.length > 0,
        contentDominantRegion: contentFrac >= 0.25 }
    /*
     * DELIBERATELY NOT rq(). For a .fwin root this asks "does this window have a title
     * bar"; for a SHELL root the same query asks "does this shell host titled windows",
     * which is a true and identity-bearing fact about a desktop shell rather than a
     * neighbour's chrome borrowed. Every other marker here is already document-level.
     *
     * CORRECTION 32 -- three of these five were spelled in STUDY OS's class names, so they
     * were markers of "is this Study OS", not of "does this surface look like itself".
     * Blanc runs in its own window with no .os-desktop anywhere in the document and scored
     * 2 of 5 for being a different shell: no .fwin-bar, no .os-task-win, no desktop layer.
     * Each now has the shell's own equivalent OR-ed on, spelled through the shared
     * data-lq-role contract and --hosted rather than through a second shell's class names.
     *
     * PROVABLY A NO-OP ON ALL 20 BANKED BASELINES, which is why the clauses are appended
     * rather than replacing: an appended OR can only turn false into true, and the one
     * banked shell (l9b4-wired) already records all three of these as TRUE. The keys are
     * kept even though floatingWindowChrome now reads more broadly than its name -- 20
     * committed baselines diff against these key names and the churn buys nothing.
     */
    : { floatingWindowChrome: !!root.querySelector('.fwin-bar')
          || (isShell && !!root.querySelector(HOSTED_SEL)),
        surfaceChrome: surfaceChrome,
        taskbar: !!document.querySelector('.os-task-win')
          || (isShell && ownChrome.some(function(c){
               return c.matches('nav,[role="navigation"]') || !!c.querySelector('nav,[role="navigation"]'); })),
        desktopLayer: !!document.querySelector('.desktop-root,.os-desktop,.os-wall-layer')
          || (isShell && fillsViewport),
        themeToken: themeToken };
  var identityCount = Object.keys(identityMarkers).filter(function(k){ return identityMarkers[k]; }).length;
  var cardUniformity = 0, cardHost = null, cardHostDetail = null, cardControlSignatures = 0;
  var cardHosts = [];
  var bodyArea = Math.max(1, B.width * B.height);
  var hosts = rq('*');
  for (var hi = 0; hi < hosts.length; hi++) {
    var host = hosts[hi];
    var hb = host.getBoundingClientRect();
    if ((hb.width * hb.height) / bodyArea < 0.25) continue;
    var hostBg = effectiveBg(host);
    var kids = [].slice.call(host.children).filter(function(c){
      if (!painted(c)) return false;
      // A shell's hosted windows are bordered, painted boxes well over 120x60, so an
      // unscoped read counts four open windows as a uniform card grid and answers
      // "is this a generic card dashboard" with the user's window arrangement.
      if (isShell && c.matches && (c.matches(HOSTED_SEL) || c.closest(HOSTED_SEL))) return false;
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
    hostClass: isFwin ? 'fwin' : isShell ? 'shell' : 'root-selector',
    // Reported as a NUMBER, not as a flag alone: a reader can see how much of the surface
    // the scope removed and add it back to disagree.
    hostedSelector: HOSTED_SEL,
    shellScope: isShell
      ? { hostedWindows: root.querySelectorAll(HOSTED_SEL).length,
          controlsInHostedWindows: root.querySelectorAll(CTRL).length - rq(CTRL).length }
      : null,
    theme: document.documentElement.getAttribute('data-theme'),
    lang: document.documentElement.lang,
    presentation: root.getAttribute('data-presentation') || null,
    box: Math.round(R.width) + 'x' + Math.round(R.height),
    bodyScrollTop: bodyScrollTop,
    controlsPainted: controls.length,
    q1: { entryPoints: entryPoints, primaryInputs: primaryInputs.length, accentButtons: accentButtons.length,
          accentList: accentButtons.map(function(e){ return name(e) + '::' + (e.textContent||'').trim().slice(0,18); }),
          inputList: primaryInputs.map(name) },
    q2: { titleText: titleText, titleFrom: titleFrom, backAffordances: backAffordances.length,
          backList: backAffordances.slice(0,6).map(function(e){ return (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0,20) || name(e); }) },
    q3: { primaryAction: primaryAction ? name(primaryAction) : null, insideBodyViewport: primaryVisible,
          explicitlyMarked: !!explicitPrimary },
    q4: { collapsedDisclosures: collapsed.length, scannedControls: scanned.length,
          devOnlyControls: devOnlyControls,
          shellChromeSelector: SHELL_SEL || null, shellControls: shellControls.length,
          shellList: shellControls.slice(0,24).map(function(e){
            return (e.getAttribute('aria-label') || e.textContent || e.title || e.tagName).trim().slice(0,24); }),
          scannedBeforeNavCollapse: scannedRaw.length, navRouteGroups: navRouteGroups,
          chromeControlsRaw: chromeControls.length, summaryHeaders: summaryHeaders.length,
          behindDisclosure: behindDisclosure.length,
          disclosures: { total: allDetails.length, open: allDetails.filter(function(d){ return d.open; }).length },
          ariaDisclosures: ariaRegions.map(function(r){
            return { region: name(r), controlsTaken: chromeControls.filter(function(e){ return r.contains(e); }).length }; }),
          scannedList: scanned.slice(0,20).map(function(e){
            return (e.getAttribute('aria-label') || e.textContent || e.placeholder || e.tagName).trim().slice(0,28); }) },
    q5: { measured: seen.length, unmeasurable: unmeasurable, paintKey: paintKey,
          paletteKey: paletteKey, paletteValues: paletteValues,
          fixedMaterialRuns: fixedMaterialRuns, fixedMaterialHosts: fixedMaterialHosts,
          minRatio: minRatio === 99 ? null : Math.round(minRatio*100)/100,
          failingCount: failing.length, worst: worst, failing: failing.slice(0,8) },
    q6: { liquidRegions: liquidRegions.length, devOnlyLiquidRegions: devOnlyLiquid.length,
          devOnlyLiquidList: devOnlyLiquid.slice(0,6).map(name),
          byBackdropFilter: blurRegions.length,
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
  var body = (${OWN_BODY_FN})(root);
  var isFwin = root.classList && root.classList.contains('fwin');
  // The plant hunts the same population the snapshot scores, shell scope included; see the
  // rq() note in SNAP. Without this the shell's Q2 plant blanked headings inside hosted
  // windows and the term it was aiming at never moved. Same --hosted vocabulary as SNAP:
  // a control that attacks a different population than the one scored measures nothing.
  var HOSTED_SEL = ${A(HOSTED)};
  var isShell = !root.matches(HOSTED_SEL) && !!root.querySelector(HOSTED_SEL);
  function prq(sel){
    var list = [].slice.call(root.querySelectorAll(sel));
    return isShell ? list.filter(function(e){ return !e.closest(HOSTED_SEL); }) : list;
  }

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
  /*
   * THREE BRANCHES, matching SNAP's three, because a control that attacks a DIFFERENT term
   * from the one under test proves nothing and still prints as if it ran. The shell branch
   * was added 2026-08-31 after exactly that: SNAP had learned to read a shell's location
   * from its own aria-current / aria-pressed / aria-selected declaration and this plant was
   * still blanking headings, so the run reported "CONTROL DID NOT FAIL on Q2" on a term
   * that is perfectly falsifiable.
   */
  var titleEls = isFwin
    ? [].slice.call(root.querySelectorAll('.fwin-title-text, .fwin-title'))
    : (isShell
        ? prq('[aria-current]:not([aria-current="false"]),[aria-pressed="true"],[aria-selected="true"]')
        : prq('h1,h2,[role="heading"],[class*="-title"],[class*="-header"] [class*="name"]')
      ).filter(function(e){ return plantPainted(e) && (e.textContent || '').trim().length > 0; });
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
  /*
   * THE AUTHORED NAME IS PART OF THE Q2 TERM, so the plant has to take that too. SNAP now
   * falls back to the root's aria-label when nothing is painted -- the three untitled desktop
   * trinkets -- and a plant that blanks only painted titles cannot make the widened term
   * answer NO. Measured 2026-09-04 on the Visualizer: the first control run after the
   * widening reported CONTROL DID NOT FAIL on Q2 on a question that had just been
   * falsifiable, which is exactly what this control exists to catch, and it caught it.
   *
   * The marker is a SUFFIXED attribute and never the bare plant attribute: SNAP's notPlant
   * term is closest(plant-attr), so tagging the ROOT would make every control inside the
   * surface read as the harness's own and would silently null Q3's primaryAction. The
   * residue sweep below is widened by the same suffix, so an unrestored name still counts.
   */
  var ariaStripped = false;
  if (isFwin && root.hasAttribute('aria-label')) {
    root.setAttribute(${A(PLANT)} + '-aria', root.getAttribute('aria-label'));
    root.removeAttribute('aria-label');
    ariaStripped = true;
  }

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
  // A presentation toggle can make React replace a primary node after this plant runs.
  // Keep a selector for the product declaration, so the control can re-apply the same
  // falsification to the replacement before it scores Q3. Classes are preferable to a
  // document-order index: the latter silently moves to a different control after reflow.
  function stableSelector(e){
    if (e.id) return '#' + CSS.escape(e.id);
    var classes = [].slice.call(e.classList || []).filter(function(c){
      return c.indexOf('cat5ctl-') !== 0;
    }).slice(0, 4);
    return e.tagName.toLowerCase() + classes.map(function(c){ return '.' + CSS.escape(c); }).join('');
  }
  window.__cat5primarySelectors = targets.map(stableSelector).filter(function(s, i, a){
    return s && a.indexOf(s) === i;
  });
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

  /*
   * Q4 — the control for CORRECTION 19, and the only reason that correction is a rule
   * rather than an excuse. It plants TWO panels of 8 controls each:
   *
   *   #cat5-ctl-open  unmarked. Nothing claims to disclose it, so every one of its 8
   *                   controls must still be SCANNED. If it is not, the aria exclusion
   *                   is blanket and Q4 is unfalsifiable on any surface that has one.
   *   #cat5-ctl-self  carries its own aria-expanded/aria-controls toggle pointing at
   *                   ITSELF. This is the escape hatch the guard exists to refuse — a
   *                   surface marking its own wrapper would otherwise empty the count.
   *                   Its 8 controls plus the toggle must also still be scanned.
   *
   * Together they take scanned past the bar of 12 from any starting point at or below
   * 12, so Q4 must read NO. Both panels are plant-attributed and removed by unplantJs
   * with the contrast and dashboard nodes.
   */
  function ctlPanel(id, selfMark){
    var p = document.createElement('div');
    p.id = id;
    p.setAttribute(${A(PLANT)}, 'clutter');
    p.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:#181818';
    if (selfMark) {
      var tog = document.createElement('button');
      tog.type = 'button';
      tog.className = 'cat5ctl-selftoggle';
      tog.setAttribute('aria-expanded', 'true');
      tog.setAttribute('aria-controls', id);
      tog.textContent = 'self toggle';
      p.appendChild(tog);
    }
    for (var i = 0; i < 8; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat5ctl-clutter-' + i;
      b.textContent = 'clutter ' + i;
      p.appendChild(b);
    }
    body.appendChild(p);
    return p;
  }
  var clutterOpen = ctlPanel('cat5-ctl-open', false);
  var clutterSelf = ctlPanel('cat5-ctl-self', true);

  return JSON.stringify({ savedTitle: savedTitle, savedTransform: savedTransform,
    clutterPlanted: clutterOpen.querySelectorAll('button').length + clutterSelf.querySelectorAll('button').length,
    clutterSelfGuard: 'cat5-ctl-self declares itself its own disclosure; the guard must refuse it',
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
    ariaNameStripped: ariaStripped,
    titleList: titleEls.map(function(e){ return e.tagName.toLowerCase() + '.' + String(e.className||'').split(' ')[0]; }),
    dashboardCards: kinds.length, expect: { Q2: 'NO', Q3: 'NO', Q4: 'NO', Q5: 'NO', Q10: 'NO' } });
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
  // The stripped accessible name, restored from the node that carries it rather than from a
  // captured variable, for the same reason the titles are.
  [].slice.call(document.querySelectorAll('[${PLANT}-aria]')).forEach(function(r){
    r.setAttribute('aria-label', r.getAttribute('${PLANT}-aria'));
    r.removeAttribute('${PLANT}-aria');
  });
  // Each moved node carries its OWN previous inline transform, so a plant that attacked
  // three nodes restores three, and none of them is restored to another one's value.
  var moved = [].slice.call(document.querySelectorAll('[${PLANT}="moved"]'));
  moved.forEach(function(m){
    m.style.transform = m.getAttribute('${PLANT}-transform') || '';
    m.removeAttribute('${PLANT}-transform');
    m.removeAttribute(${A(PLANT)});
  });
  [].slice.call(document.querySelectorAll('[${PLANT}="contrast"],[${PLANT}="dashboard"],[${PLANT}="clutter"]')).forEach(function(n){ n.remove(); });
  return JSON.stringify({ restoredMoved: moved.length, restoredTitles: titles.length,
    // The whole marker family, including \`-html\`. A residue count that does not sweep every
    // attribute the plant writes reports 0 while the app still carries one, which is the
    // exact shape of the restore defect this directory already paid for once.
    residue: document.querySelectorAll('[${PLANT}],[${PLANT}-transform],[${PLANT}-text],[${PLANT}-html],[${PLANT}-aria]').length });
})()`;

// ---------------------------------------------------------------------------- scoring
/** Bars, stated once, so the score is arguable rather than asserted. */
const BARS = {
  q1: '1..3 entry points in the host entry band — top for an app, taskbar for a shell',
  q2: 'a non-empty location label AND at least one way back',
  q3: 'the primary action is inside the body viewport at rest — "without hunting" means without scrolling',
  q4: '<=12 controls scanned in the default state AND (>=1 disclosure of EITHER kind - a <details> or an aria-expanded/aria-controls region - OR <=3 controls with none already behind a disclosure)',
  q5: 'no failing text run in EITHER theme, with a moved paint digest OR moved palette tokens on documentElement OR a declared fixed material owning every measured run',
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
    /*
     * CORRECTION 40 (2026-09-04, primary2) -- THE VERDICT NEVER FOLLOWED ITS OWN INSTRUMENT.
     *
     * `inDisclosure` was extended to the APG `aria-expanded`/`aria-controls` pattern because
     * scoring a surface on `<details>` alone charged it for a rule its markup could not
     * satisfy (the block above says exactly that, and Scraper's drawer is its example). The
     * COUNT that decides the verdict was left behind: `collapsedDisclosures` is
     * `allDetails.length`, so a surface whose only disclosure is an aria one had its tucked
     * contents correctly removed from `scanned` and was then failed for having no disclosure.
     *
     * City is the case that exposes it. `ariaDisclosures` in the very same receipt reads
     * `[{region: 'aside.lq-contextual', controlsTaken: 4}]` -- the mushroom hitbox is an
     * `aria-expanded` button that opens the dossier -- while `collapsedDisclosures` reads 0.
     * The mushroom IS the disclosure. This is the same shape cat1's correction 33 had to
     * learn, one level up.
     *
     * Deliberately NOT a loosening: `ariaRegions` is already built under two guards (a region
     * containing its own toggle is ignored, and the toggle itself is never excluded), so this
     * term can only fire where the instrument already removed something. Both counts stay in
     * the snapshot separately so a reader can disagree with the rule rather than the verdict.
     */
    q4: s.q4.scannedControls <= 12
      && (s.q4.collapsedDisclosures + (s.q4.ariaDisclosures || []).length >= 1
        || (s.q4.scannedControls <= 3 && s.q4.behindDisclosure === 0)) ? 'YES' : 'NO',
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
  out.hostedSelector = found.hostedSelector;
  out.shellScope = found.shellScope;
  out.box = found.box;
  out.bodyScrollTop = found.bodyScrollTop;
  out.presentationAsFound = found.presentation;

  // --- Q7/Q8/Q9 come from category 6's committed baseline, never re-driven ----------------
  const c6path = path.join(BASE, `cat6-${LABEL}.json`);
  let c6 = null;
  if (fs.existsSync(c6path)) c6 = JSON.parse(fs.readFileSync(c6path, 'utf8'));
  out.cat6 = c6
    ? { file: path.relative(process.cwd(), c6path), verdict: c6.verdict, parity: c6.parity, roundTrip: c6.roundTrip && { diffs: c6.roundTrip.diffs, order: c6.roundTrip.order } }
    : { file: path.relative(process.cwd(), c6path), missing: true };

  // --- the sweep: Q5's stability axis, and a fresh snapshot per cell ------------------------
  const BASE_THEME = found.theme;
  const SECOND_THEME = ALT_THEME;
  /**
   * The value the root already carried, so the restore puts back ABSENCE as absence rather
   * than as an empty string — `[attr='']` and no attribute at all select differently.
   * `ABSENT` is a sentinel STRING because the bridge cannot carry a JS null (`ev` treats a
   * null result as "the expression threw"), and it is namespaced so it cannot collide with
   * a real value of the attribute being driven.
   */
  const ABSENT = 'cat5:absent';
  const attrBefore = ALT_ATTR
    ? await ev(`(function(){ var v = document.documentElement.getAttribute(${A(ALT_ATTR_NAME)}); return v === null ? ${A(ABSENT)} : v; })()`)
    : null;
  const setAttr = (v) => ev(`(function(){ var h = document.documentElement;
    if (${A(v)} === ${A(ABSENT)}) h.removeAttribute(${A(ALT_ATTR_NAME)});
    else h.setAttribute(${A(ALT_ATTR_NAME)}, ${A(v)});
    return 'ok' })()`);
  const attrLabel = attrBefore === ABSENT ? '(absent)' : attrBefore;
  /** The class the ROOT already carried, restored the same capture-patch-restore way. */
  const classBefore = ALT_CLASS
    ? await ev(`(function(){ var r = ${ROOT_EXPR}; return r && r.classList.contains(${A(ALT_CLASS)}) ? 'on' : 'off'; })()`)
    : null;
  const setClass = (on) => ev(`(function(){ var r = ${ROOT_EXPR};
    if (!r) return 'no-root';
    r.classList[${A(on)} === 'on' ? 'add' : 'remove'](${A(ALT_CLASS)});
    return 'ok' })()`);
  // The second cell is always the OTHER state, so a surface found already in its alternate
  // rendering is swept the same way rather than measured twice in the same one.
  const classAlt = classBefore === 'on' ? 'off' : 'on';
  /** Both cells as {label, apply}. Theme mode is byte-identical to what it replaced. */
  const cellPlan = ALT_ATTR
    ? [{ label: `${ALT_ATTR_NAME}=${attrLabel}`, apply: () => setAttr(attrBefore) },
       { label: `${ALT_ATTR_NAME}=${ALT_ATTR_VALUE}`, apply: () => setAttr(ALT_ATTR_VALUE) }]
    : ALT_CLASS
      ? [{ label: `.${ALT_CLASS}=${classBefore}`, apply: () => setClass(classBefore) },
         { label: `.${ALT_CLASS}=${classAlt}`, apply: () => setClass(classAlt) }]
      : [BASE_THEME, SECOND_THEME].map((theme) => ({
          label: `theme=${theme}`,
          apply: () => ev(`(function(){ document.documentElement.setAttribute('data-theme', ${A(theme)}); return 'ok'; })()`),
        }));
  out.axes = ALT_ATTR
    ? { attr: cellPlan.map((c) => c.label), theme: [BASE_THEME, BASE_THEME],
        why: 'the shell root exists only under its own theme family, so the second cell is its shipped degradation tier rather than a foreign palette' }
    : ALT_CLASS
      ? { rootClass: cellPlan.map((c) => c.label), theme: [BASE_THEME, BASE_THEME],
          why: 'the surface renders its alternate from a class on its own root, not from the document theme, so the second cell is that rendering rather than a palette the surface never sees' }
      : { theme: [BASE_THEME, SECOND_THEME] };
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
  /**
   * SHELL SCOPE APPLIES TO THE TOGGLE TOO, and here it was not merely a wrong number — it
   * MUTATED THE APP. `r.querySelector('.fwin-b-liquid, …')` on a shell root returns the
   * first HOSTED window's control, so the Wired run at 17:09 on 2026-08-31 flipped
   * 'SIG-VID / Signal Archive' to Liquid, then read `data-presentation` off the shell
   * (which has none), refused with "surface reads null", and — because the restore branch
   * is guarded on `!refused` — left that window flipped. A refusing leg stranding app state
   * is a trap this directory has already paid for once.
   */
  const OWN_LIQUID_BTN = `(function(){
    var r = ${ROOT_EXPR};
    if (!r) return null;
    var H = ${A(HOSTED)};
    var isShell = !r.matches(H) && !!r.querySelector(H);
    return [].slice.call(r.querySelectorAll(${A(Object.values(LIQUID_BTN).join(','))}))
      .filter(function(b){ return !isShell || !b.closest(H); })[0] || null;
  })()`;
  const presToggle = () => ev(`(function(){
    var b = ${OWN_LIQUID_BTN};
    if (!b) return 'no-control';
    b.click();
    return 'clicked';
  })()`);

  step('Q6: opt in to Liquid');
  const presBefore = await presRead();
  const isShellRoot = found.hostClass === 'shell';
  let q6cell = null;
  const q6leg = { presentationAsFound: presBefore };
  /**
   * THE SHELL HAS ONE PRESENTATION, so there is nothing to opt into — and that is the
   * honest reading, not a waiver. Every other host answers Q6 in Liquid because in Standard
   * there is by design no Liquid material to explain anything. A shell renders its chrome
   * with whatever material its identity gives it, unconditionally: `.os-taskbar` carries
   * `data-lq-role="liquid"` whether or not any hosted window is Liquid, and dropping that
   * role is a code change, not a user-reachable mode.
   *
   * Category 6 answered the same question differently ON PURPOSE and the two do not
   * conflict. Its 10-requirement names "taskbar identity", a SHELL property that only a
   * hosted window's flip can threaten, so its axis is that flip. Q6's bar is "every
   * Liquid-treated region carries a state-change transition and none loops forever", which
   * is a property of the shell's OWN material and is the same in either case. Driving a
   * neighbour's toggle to read it would mutate a window this run does not score for a
   * number that cannot move.
   *
   * NOT A FREE YES: `scoreSnapshot` still returns NO-SUBJECT on zero regions and NO on any
   * region missing a transition or looping forever, and `liquidRegions` is published so a
   * thin population is visible rather than hidden behind a verdict.
   */
  if (isShellRoot) {
    q6leg.basis = 'shell: one presentation — its chrome material is unconditional, so Q6 is measured where the shell is found; no hosted window was touched';
  } else if (presBefore === 'liquid') {
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
  // EVERY CLICK IS UNDONE, INCLUDING A REFUSING ONE. This used to be guarded on
  // `!q6leg.refused`, so the one path that reached the toggle and then refused — a flip
  // that did not land where it was aimed — left the app holding the probe's change, and
  // the next run recorded that damage as the user's setting.
  if (q6leg.toggle === 'clicked') {
    await presToggle();
    await sleep(900);
    q6leg.restoredTo = await presRead();
    if (q6leg.restoredTo !== presBefore) q6leg.restoreWarning = `presentation left as ${q6leg.restoredTo}, found ${presBefore}`;
  }
  out.q6leg = q6leg;

  // React may replace the planted buttons while the Liquid leg toggles presentation. An
  // inline transform on the old, disconnected node then proves nothing and Q3 falsely stays
  // YES. Re-apply by the declarations captured above; every replacement stores its own prior
  // transform and the ordinary unplant path restores it.
  if (CONTROL) {
    out.replantedPrimaries = await evj(`(function(){
      var selectors = window.__cat5primarySelectors || [];
      var nodes = [];
      selectors.forEach(function(sel){
        [].slice.call(document.querySelectorAll(sel)).forEach(function(e){
          if (nodes.indexOf(e) < 0) nodes.push(e);
        });
      });
      var added = 0;
      nodes.forEach(function(e){
        if (e.getAttribute(${A(PLANT)}) !== 'moved') {
          e.setAttribute(${A(PLANT)}, 'moved');
          e.setAttribute(${A(PLANT)} + '-transform', e.style.transform || '');
          added++;
        }
        e.style.transform = 'translateY(4000px)';
      });
      return JSON.stringify({ selectors: selectors, matched: nodes.length, replacements: added });
    })()`);
  }

  const cells = [];
  for (const plan of cellPlan) {
    step(`cell ${plan.label}`);
    await plan.apply();
    // Trap 2: a theme swap is a 240 ms colour transition and getComputedStyle during one
    // returns the OLD colour, which reads exactly like a fix that did not land. The
    // attribute axis is the same shape — `data-display-transparency` retunes `--lq-*`
    // tokens that painted elements transition on.
    await sleep(700);
    const c = await evj(SNAP);
    if (c.refuse) throw new Error(`REFUSE - cell ${plan.label}: ${c.refuse}`);
    c.cell = plan.label;
    cells.push(c);
  }

  // --- restore, and VERIFY it, before any verdict is computed -------------------------------
  step('restore');
  /*
   * CORRECTION 33 — `setAttribute('data-theme', null)` WRITES THE STRING "null".
   *
   * Every surface scored so far lived in the Study OS window, where `data-theme` is always
   * set, so `BASE_THEME` was always a real id and this restore was a no-op assignment. The
   * Blanc window has no `data-theme` at all: the restore therefore stamped `data-theme="null"`
   * onto its documentElement, the read-back compared "null" against null, and the run VOIDed
   * with the self-refuting `theme left as null, wanted null` — while leaving a bogus attribute
   * behind for the next run to find. Absence is restored as absence, exactly as the attribute
   * leg's ABSENT sentinel already does one function up.
   */
  if (BASE_THEME === null || BASE_THEME === undefined) {
    await ev(`(function(){ document.documentElement.removeAttribute('data-theme'); return 'ok'; })()`);
  } else {
    await ev(`(function(){ document.documentElement.setAttribute('data-theme', ${A(BASE_THEME)}); return 'ok'; })()`);
  }
  if (ALT_ATTR) await setAttr(attrBefore);
  if (CONTROL) out.unplanted = await evj(unplantJs(planted && planted.savedTitle));
  await sleep(400);
  out.storeAfter = await readStore();
  out.storeIdentical = JSON.stringify(out.storeBefore) === JSON.stringify(out.storeAfter);
  const back = await evj(SNAP);
  out.restored = { theme: back.theme, presentation: back.presentation, box: back.box,
    plantResidue: out.unplanted ? out.unplanted.residue : 0 };
  if (back.theme !== BASE_THEME) out.restoreWarning = `theme left as ${back.theme}, wanted ${BASE_THEME}`;
  if (ALT_ATTR) {
    // The driven attribute is restored and READ BACK, absence included — the same standard
    // the theme leg is held to. A run that leaves the shell in a degradation tier has
    // changed a shipped user setting.
    const attrAfter = await ev(`(function(){ var v = document.documentElement.getAttribute(${A(ALT_ATTR_NAME)}); return v === null ? ${A(ABSENT)} : v; })()`);
    out.restored.attr = { name: ALT_ATTR_NAME, before: attrBefore, after: attrAfter, identical: attrAfter === attrBefore };
    if (attrAfter !== attrBefore) out.restoreWarning = `${ALT_ATTR_NAME} left as ${attrAfter}, found ${attrBefore}`;
  }
  if (ALT_CLASS) {
    // Same standard as the attribute leg. A run that leaves Blanc in dark mode has changed a
    // rendering the user chose, and the next run would record that damage as their setting.
    await setClass(classBefore);
    const classAfter = await ev(`(function(){ var r = ${ROOT_EXPR}; return r && r.classList.contains(${A(ALT_CLASS)}) ? 'on' : 'off'; })()`);
    out.restored.rootClass = { name: ALT_CLASS, before: classBefore, after: classAfter, identical: classAfter === classBefore };
    if (classAfter !== classBefore) out.restoreWarning = `.${ALT_CLASS} left ${classAfter}, found ${classBefore}`;
  }

  // --- assemble the ten -------------------------------------------------------------------
  const A_CELL = cells[0];
  const B_CELL = cells[1];
  const live = scoreSnapshot(A_CELL);
  const liveAlt = scoreSnapshot(B_CELL);

  // Q5 across the two cells. TERM 2 IS A VOID, NOT A PASS: if both themes report the same
  // minimum the swap never reached the paint and the axis measured nothing — the same guard
  // `l1-q5-drive.cjs` calls its `frozen` control.
  const q5Failing = A_CELL.q5.failingCount + B_CELL.q5.failingCount;
  const q5MovedRatio = A_CELL.q5.minRatio !== B_CELL.q5.minRatio;
  const q5MovedPaint = A_CELL.q5.paintKey !== B_CELL.q5.paintKey;
  const q5Moved = q5MovedRatio || q5MovedPaint;
  /*
   * primary2 reached correction 38's conclusion independently and concurrently the same day,
   * from City: repairing its Q5 defect made the garden theme-independent, both cells reported
   * the same 12.6 minimum and the same paint digest, and the guard VOIDed the surface for the
   * very property the fix delivered. Its proof was narrower (it required --fixed-material and
   * a five-token witness); backup's palette digest below needs no flag and covers it, so only
   * this note survived the merge. Two workers arriving at the same VOID from two surfaces is
   * the strongest evidence the guard was wrong.
   */
  const q5FixedProved = FIXED_MATERIAL
    && A_CELL.theme !== B_CELL.theme
    && A_CELL.q5.measured > 0 && B_CELL.q5.measured > 0
    && A_CELL.q5.fixedMaterialRuns === A_CELL.q5.measured
    && B_CELL.q5.fixedMaterialRuns === B_CELL.q5.measured;
  // CORRECTION 39 — the third witness. Needs no flag, because unlike --fixed-material it is
  // not the run ASSERTING anything: the two cells either resolved different palette tokens on
  // documentElement or they did not. Both cells must have measured something, so it cannot
  // rescue an empty harness, and the failing-run bar above is untouched.
  const q5PaletteMoved = A_CELL.q5.paletteKey !== undefined
    && B_CELL.q5.paletteKey !== undefined
    && A_CELL.q5.paletteKey !== B_CELL.q5.paletteKey;
  const q5PaletteProved = q5PaletteMoved
    && A_CELL.theme !== B_CELL.theme
    && A_CELL.q5.measured > 0 && B_CELL.q5.measured > 0;
  const q5AxisProved = q5Moved || q5FixedProved || q5PaletteProved;
  const q5 = {
    verdict: q5Failing === 0 ? 'YES' : 'NO',
    cells: cells.map((c) => ({ cell: c.cell, theme: c.theme, measured: c.q5.measured, unmeasurable: c.q5.unmeasurable,
      minRatio: c.q5.minRatio, failingCount: c.q5.failingCount, worst: c.q5.worst,
      fixedMaterialRuns: c.q5.fixedMaterialRuns, fixedMaterialHosts: c.q5.fixedMaterialHosts,
      paletteValues: c.q5.paletteValues })),
    failing: [...A_CELL.q5.failing, ...B_CELL.q5.failing].slice(0, 12),
    themeAxisMoved: q5Moved,
    fixedMaterialProved: q5FixedProved,
    paletteAxisProved: q5PaletteProved,
    axisWitness: { minRatioMoved: q5MovedRatio, paintDigestMoved: q5MovedPaint,
      paletteTokensMoved: q5PaletteMoved, fixedMaterialRequested: FIXED_MATERIAL },
  };

  const fromC6 = (term, ok) => (c6 ? (ok ? 'YES' : 'NO') : 'MEASURE');
  const noLiquidHost = !!(c6 && c6.host === 'fwin-no-liquid' && c6.bars);
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
    /*
     * CORRECTION 26, 2026-08-31. On a `fwin-no-liquid` host (`canPresentLiquid` refuses the
     * section, so the window has one presentation and no toggle — category 6's correction
     * 24) these three read from that baseline's own bars instead. Left alone, Q7 and Q9
     * scored `NO` because `parity.equal` and `parity.rowsAgree` are `null` there, and Q8
     * scored `NO` on the single `zIndex` diff that a minimize/restore trip legitimately
     * produces — three fabricated findings on a surface category 6 measured as complete.
     *
     * Q8 is the one to read carefully. "Liquid can be turned off without losing state" is
     * answered by PROVED ABSENCE — `liquidAbsenceProved`, the discriminating query that
     * showed a neighbouring window rendering the control while this one does not — plus the
     * reversible transition the window does have holding. It is not a free YES, but it is a
     * weaker question than the one a presentable surface answers, and `basis` says so in
     * the output rather than in a comment.
     *
     * KNOWN WEAKENING, stated rather than hidden: on this host Q7 and Q9 share their
     * evidence, because a surface with one presentation has one row set. Two of ten
     * questions are therefore less independent here than on a presentable surface.
     */
    { id: 7, q: 'standard mode remains fully normal', bar: BARS.q7,
      verdict: noLiquidHost
        ? (c6.bars.allRowsReachable && (c6.parity.failing || []).length === 0 ? 'YES' : 'NO')
        : fromC6('parity', c6 && c6.parity && c6.parity.equal && (c6.parity.failing || []).length === 0),
      numbers: { drivenBy: 'probes/cat6-feature-parity.cjs', basis: noLiquidHost ? 'no-liquid-host: the only presentation is standard' : null, parity: c6 && c6.parity } },
    { id: 8, q: 'Liquid can be turned off without losing state', bar: BARS.q8,
      verdict: noLiquidHost
        ? (c6.bars.liquidAbsenceProved && c6.bars.roundTripHeld ? 'YES' : 'NO')
        : fromC6('roundTrip', c6 && c6.roundTrip && (c6.roundTrip.diffs || []).length === 0),
      numbers: { drivenBy: 'probes/cat6-feature-parity.cjs',
        basis: noLiquidHost ? 'no-liquid-host: absence proved against a neighbour that renders the control, plus the minimize/restore trip' : null,
        liquidAbsence: noLiquidHost ? c6.liquidAbsence : null,
        lifecycleTrip: noLiquidHost ? c6.lifecycleTrip : null,
        roundTrip: c6 && c6.roundTrip && { order: c6.roundTrip.order, diffs: c6.roundTrip.diffs } } },
    { id: 9, q: 'all pre-migration features reachable and functional', bar: BARS.q9,
      verdict: noLiquidHost
        ? (c6.bars.allRowsReachable && (c6.parity.failing || []).length === 0 ? 'YES' : 'NO')
        : fromC6('rowsAgree', c6 && c6.parity && c6.parity.rowsAgree === true && (c6.parity.onlyInOne || []).length === 0),
      numbers: { drivenBy: 'probes/cat6-feature-parity.cjs', basis: noLiquidHost ? 'no-liquid-host: shares Q7 evidence — one presentation, one row set' : null, rowsAgree: c6 && c6.parity && c6.parity.rowsAgree, onlyInOne: c6 && c6.parity && c6.parity.onlyInOne } },
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
  if (!q5AxisProved && !CONTROL) {
    voided.push(`Q5's ${ALT_ATTR ? ALT_ATTR_NAME : ALT_CLASS ? ('.' + ALT_CLASS) : 'theme'} axis did not move (both of ${A_CELL.cell} / ${B_CELL.cell} report minRatio ${A_CELL.q5.minRatio}), the palette tokens on documentElement did not move either, and no declared fixed material owned every measured run; contrast stability measured nothing`);
  }
  if (out.storeIdentical === false) voided.push('persisted theme state was NOT restored byte-identical');
  if (out.restoreWarning) voided.push(out.restoreWarning);
  if (q6leg.restoreWarning) voided.push(q6leg.restoreWarning);
  // A surface whose §10.4 answers differ between themes has not answered them stably. Q6 is
  // excluded: both theme cells are taken in the presentation the surface was FOUND in, and Q6
  // is scored from its own Liquid leg, so comparing the two cells' q6 compares two readings of
  // a question neither of them answers.
  const drift = Object.keys(live).filter((k) => k !== 'q6' && live[k] !== liveAlt[k]);
  if (drift.length) voided.push(`verdicts drift across ${A_CELL.cell} -> ${B_CELL.cell} (${drift.join(', ')}); a §10.4 answer that depends on the ${ALT_ATTR ? 'degradation tier' : ALT_CLASS ? 'root class' : 'palette'} is not an answer`);

  if (CONTROL) {
    // The control must move all five. A control that does not fail voids the score rather
    // than passing it — the rubric's words. Q4 joined the set with CORRECTION 19: its two
    // clutter panels are the falsification of the aria-disclosure exclusion, so a run where
    // Q4 stays YES means that exclusion swallowed a panel nothing disclosed.
    const moved = { Q2: live.q2 === 'NO', Q3: live.q3 === 'NO', Q4: live.q4 === 'NO',
      Q5: q5.verdict === 'NO', Q10: live.q10 === 'NO' };
    out.controlResult = moved;
    // The component numbers, so a reader can see WHICH panel survived the exclusion rather
    // than only that the total cleared the bar.
    out.controlQ4 = { scannedControls: A_CELL.q4.scannedControls, bar: 12,
      behindDisclosure: A_CELL.q4.behindDisclosure, ariaDisclosures: A_CELL.q4.ariaDisclosures };
    const missed = Object.keys(moved).filter((k) => !moved[k]);
    out.verdict = missed.length
      ? `CONTROL DID NOT FAIL on ${missed.join(', ')} — those terms cannot return NO and measure nothing`
      : 'CONTROL FAILED AS REQUIRED on Q2, Q3, Q4, Q5, Q10';
    out.score = missed.length ? 'CONTROL-VOID' : 'CONTROL-OK';
  } else {
    out.findings = findings;
    out.voided = voided;
    out.score = voided.length ? 'VOID' : findings.length === 0 ? 10 : 10 - findings.length;
    out.verdict = out.score === 10 ? 'PASS 10/10' : out.score === 'VOID' ? 'VOID' : `${out.score}/10 — ${findings.length} question(s) answer NO`;
  }

  await ev(`(function(){ ${PIN} = null; window.__cat5primary = null; window.__cat5primaries = null; window.__cat5primarySelectors = null; return 'cleared'; })()`);
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
