/**
 * RUBRIC CATEGORY 2 HARNESS — "Clunkiness", parameterised by surface.
 *
 * ONE harness for every surface in the app, per RULE 1. It consolidates the three one-off probes
 * that each hardcoded Dictionary and each had to be rewritten for the next surface:
 *   - `l1-clunkiness.js`          arms the recorder; `TITLE`/`RESULT_SEL` were Dictionary literals
 *                                 promoted to `window.__lqClunk*` globals a worker had to set by hand
 *   - `l1-clunkiness-control.js`  the two negative controls, as a SEPARATE arm a worker had to
 *                                 remember to run, interpret, and never mix with the measurement
 *   - `l1-clunkiness-read.js`     the reader: scroll traps, open dialogs, latency roll-up
 * Those three were arm / drive-by-hand / read: the DRIVE was the part that lived in a worker's head,
 * which is why every surface cost a fresh transcript. Here the drive is an argument (`--task`), the
 * controls run in the same process as the measurement they must falsify, and the modal-trap leg
 * actually presses Escape instead of handing an inventory back for someone else to close the loop on.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/cat2-clunkiness.cjs \
 *     --surface "Library" [--win main] [--label l6-library] [--out <file>] [--control] \
 *     --task "click:.chip-manga >> wait:400 >> click:.card" \
 *     [--undo "click:.chip-all"] [--result ".card"] [--compare "@.reader"] \
 *     [--churn ".music-time,.music-seek"] [--idle 1600] \
 *     [--anchors ".fc-card >> .fc-actions"] [--anchor-tol 2]
 *
 * --surface takes the same two forms as the category-1, -4 and -8 harnesses, deliberately, so a
 * surface is named identically in all four: a leading `@` is a CSS SELECTOR (a section of the main
 * window), anything else is a floating window's TITLE. Never an index — `probe-picks-first-visible-fwin`
 * is a recorded false-scoring in this repo.
 * --win pins every bridge call to ONE OS window; without it `/eval` resolves the FOCUSED window and
 * a run silently scores another surface.
 *
 * THE STEP DSL, which is what removes the per-surface file:
 *   click:<css>        resolve the selector to its centre, verify nothing occludes it, /click there
 *   type:<css>=<text>  focus() the field, then /type the text as real char events
 *   clear:<css>        empty a text filter through React's native setter (a RESTORE primitive:
 *                      it costs no input, so `--undo` can put a surface back without being billed)
 *   scroll:<css>=<px>  put a scroll container back (the second RESTORE primitive, correction 18)
 *   key:<Key>          /key, e.g. `key:Escape`, `key:Enter`
 *   wait:<ms>          settle
 * Steps are separated by ` >> `, which no CSS selector can contain. `type:` splits on its LAST `=`
 * so `[data-x="y"]` survives.
 *
 * THE RUBRIC'S NUMBERS, and its 10 needs all of them:
 *   clicks / keystrokes  the input cost of the dominant task, counted from the renderer's own
 *                        capture-phase listeners rather than from the driver's intent
 *   deadEnds             steps that produced NO observable change (bar: 0)
 *   modalTraps           open dialogs that survive a real Escape (bar: 0)
 *   scrollTraps          content taller than its clipped box with no way to reach it (bar: 0)
 *   overBar100           inputs not acknowledged within 100 ms (bar: 0), and VOID when
 *                        sharedPaintSamples > 0 — see correction 32
 *   costParity           the same task's input cost against the Standard-presentation path
 *
 * CORRECTIONS CARRIED OVER RATHER THAN RE-DERIVED — each already produced a false number here:
 *  1. TIMING ACROSS THE BRIDGE MEASURES THE BRIDGE. A first cut timed `performance.now()` at arm
 *     against `performance.now()` when the field's value changed, and reported **268 ms** for the
 *     first keystroke of 食べる — that is the HTTP round trip between the /eval that armed and the
 *     /type that drove, two separate requests. Timing is per-EVENT, inside the renderer, always.
 *  2. `ev.timeStamp` IS STAMPED WHERE THE EVENT IS CREATED. A bridge-driven click is created by
 *     `webContents.sendInputEvent` in the MAIN process, so `rAF_now - ev.timeStamp` bills the app
 *     for the main→renderer hop and for main's own queueing. Measured on a genuinely inert element,
 *     repainting nothing: **154.1 / 355.9 / 187.3 / 76.9 / 22.8 ms**, three of five over the
 *     rubric's own 100 ms bar. A floor that straddles the bar cannot score the bar. `recvMs` is
 *     therefore the scoring number — the clock starts at the earliest RENDERER-side observation of
 *     the event (capture phase at the root) and stops at the `requestAnimationFrame` that
 *     acknowledges it — and `stampMs` is recorded alongside it, UNSCORED, so the gap stays visible.
 *  3. A DEAD END IS A DRIVEN RESULT, NOT A READ ONE. Reading the DOM can say a control is disabled;
 *     only pressing it can say it leads nowhere. Every step is bracketed by a snapshot and scored
 *     on whether the surface actually moved. `l1-clunkiness.js` explicitly declined to report a
 *     dead-end count because its drive lived outside the probe — that gap is what this closes.
 *  4. THE CHANGE SIGNAL MUST BE WIDER THAN TEXT. A step that opens a dialog, moves focus, scrolls,
 *     or only flips a control from enabled to disabled changes no text at all. The snapshot carries
 *     text, the control inventory (label + disabled + painted), the result count, the open-dialog
 *     set, focus identity and scroll offsets, and a step counts as live if ANY of them moved.
 *  5. SCROLL TRAPS HAVE FOUR HONEST EXCLUSIONS, all of which this probe scored as defects once.
 *     `sr-only` text is clipped ON PURPOSE and is the affordance category 1 rewards (four spans,
 *     21 unreachable px each). A line clamp WITH a disclosure control beside it is progressive
 *     disclosure, which §2.3 asks for — the Media Center's `medialib-drawer__synopsis` read as
 *     **182 unreachable px** sitting directly above its own "Show more". An `object-fit: cover`
 *     crop is a deliberate frame, not lost content (`medialib-drawer__hero`, 40 px). And an element
 *     whose overflow is `visible` in both axes is not clipped, so nothing is unreachable.
 *  6. A SYNTHETIC CLICK DOES NOT FOCUS. `/type` goes to whatever holds focus, so a `type:` step
 *     `focus()`es its field first — that IS the keyboard path — and asserts it took. Without it the
 *     characters land in the last-focused field, usually in another window entirely.
 *  7. `elementFromPoint` IS DOCUMENT-GLOBAL. With overlapping `.fwin` windows it silently returns
 *     whichever window is on top, so every `click:` step verifies the topmost element at the point
 *     is the target or its descendant and REFUSES by name otherwise. Raising is done through the
 *     TASKBAR BUTTON: a pointerdown on the frame fires edge-snap and persists a full-desk resize.
 *  8. A MINIMISED OR 0x0 ROOT MEASURES AS PERFECT. Zero traps, zero dead ends, zero slow inputs.
 *     This harness REFUSES rather than record those zeros.
 *  9. THE STANDARD-VS-LIQUID TERM HAS NO SECOND HALF ON MOST SURFACES, and inventing one is the
 *     exact flattery the pin forbids. `data-presentation` on the `.fwin` is read FACTUALLY: a
 *     main-window section has no per-window presentation, so the term is `N/A-single-path` and is
 *     not a bar; a floating window that has one and was given no `--compare` is `UNMEASURED`, which
 *     is neither a pass nor a fail. Only a real `--compare` run produces a delta.
 * 17. AN UNDO IS JUDGED ON THE SURFACE, NOT ON THE ANNOUNCEMENT ABOUT THE TRIP. The VN panel's
 *     add reports "Added to library." into a `role="status"`, and its remove leaves that sentence
 *     standing, so a do/undo round trip that genuinely restored the surface hashed differently and
 *     VOIDed the run. Every surface with a status line has this, so it is fixed once: `stateHash`
 *     excludes live regions and is what `undo.restored` compares, while `textHash` keeps them and
 *     is what the change signal reads - a step whose only effect is a message did something. The
 *     live-region contents are reported before and after rather than dropped.
 * 18. A TASK THAT SCROLLS CANNOT BE DRIVEN TWICE, and the presentation leg drives every task
 *     twice by construction — the same shape correction 13 fixed for text filters. Statistics'
 *     dominant task is a jump to a section 814 px down; on the second pass every earlier step's
 *     target sat above the fold and `POINT` correctly refused it as occluded, so the surface could
 *     not be scored at all. `scroll:` is the second restore primitive: it puts a container back,
 *     and like `clear:` it is UNCOUNTED, because a restore is not a gesture the user spends.
 * 19. A SURFACE THAT CHANGES ON ITS OWN SCORES EVERY STEP AS LIVE, so it reports zero dead ends
 *     no matter what you drive at it. Music's transport is the first one here: once a track plays,
 *     the elapsed-time text ticks once a second and the seek slider's own `value` advances, so two
 *     snapshots taken a second apart with NOTHING driven already differ on both the text and the
 *     control channel. That is a false-pass generator, not a nuisance - correction 3 says a dead
 *     end is a driven result, and this makes every driven result look alive. `--churn "<css,...>"`
 *     names the self-changing regions and they are dropped from textHash, stateHash and
 *     controlHash (still counted in textRuns/controlCount, so an empty surface cannot hide behind
 *     it). The exclusion is never taken on trust: the IDLE LEG samples the surface twice `--idle`
 *     ms apart with no input, at rest AND after the task, and VOIDs the run if anything UNDECLARED
 *     still moves, or if `--churn` excluded regions that never moved in either phase.
 * 62. `--result` COUNTS RENDERED ROWS, AND A VIRTUALISED LIST ONLY RENDERS ITS VIEWPORT. Measured
 *     live on Immersion, 2026-09-05, driving `.immersion-site-search input` over 1,199 saved sites
 *     with `--result ".immersion-site-card"`: typing `red` narrowed the list from 1,199 rows to 356
 *     and the harness scored the step a DEAD END, because the rendered count is pinned at the ~19
 *     rows that fit and text/controls/results/scroll were all flat. The filter was never broken.
 *     Negative control, same session: `zzzzqqq` -> 0 rendered, `quruli` -> 1 rendered, i.e. the
 *     selector only reports the truth once the result set falls BELOW the viewport - which is the
 *     one case a clunkiness run does not need help with. `scrollHeight` of the scrolling container
 *     tracks the whole set (82,696 -> 24,555 -> 2,189 -> 69 -> 16 px across "", red, hltv, quruli,
 *     zzzzqqq) and is now its own `resultVolume` channel. It is a SEPARATE channel, not folded into
 *     `scroll`, so a report still says which fact made a step count; and it is restricted to
 *     elements whose own `overflowY` is auto/scroll, so an ordinary reflow cannot manufacture
 *     movement and hide a real dead end. Every VirtualList surface in the app shares this trap.
 * 10. A COMMENT INSIDE THE IN-PAGE TEMPLATE LITERAL MUST CONTAIN NO BACKTICK AND NO DOLLAR-BRACE.
 *     Both are a SyntaxError in the harness rather than in the browser, so the failure names the
 *     wrong file. Same trap the category-8 harness records.
 *
 * NEGATIVE CONTROL (`--control`), required by the rubric — "a deliberately wrong flow must be
 * reported as a dead end. If everything you try scores clean, the probe is not discriminating."
 * Three deliberate failures are injected into the SAME root and the harness asserts each count
 * MOVED, then removes them and asserts the numbers returned to baseline:
 *   a. a handler-less button, which is driven with a real click and must be reported as a dead end
 *      — and which doubles as correction 2's inert latency floor, since it repaints nothing;
 *   b. a `role="dialog"` that ignores Escape, which must be reported as a modal trap;
 *   c. a clipped overflowing box, which must be reported as a scroll trap.
 * A probe that has not returned a failure this session is unproven, so a `--control` run that fails
 * to move all three VOIDS the score rather than passing.
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
const TASK = arg('task', '');
const UNDO = arg('undo', '');
const RESULT_SEL = arg('result', '');
const COMPARE = arg('compare', '');
// Correction 12: drive the same task in BOTH presentations of the same window.
const BOTH = has('both-presentations');
// Correction 19: the self-changing regions of this surface, as a CSS selector list. Declared by
// the caller, PROVEN by the idle leg - never taken on trust, and never a free exclusion.
const CHURN = arg('churn', '');
/*
 * L7 bullet 997, "keep review/input surfaces spatially fixed during active tasks" — the regions
 * this surface promises NOT to move while the task runs, as ` >> `-separated CSS selectors.
 *
 * This is a DIFFERENT question from anything else the harness asks, and it was genuinely
 * unmeasured before 2026-09-03. The Flashcards progress note records the card and action rects as
 * byte-identical across a Liquid -> Standard -> Liquid PRESENTATION round trip; a presentation
 * round trip returns to the same state by construction. The bullet is about the surface staying
 * put while the STATE ADVANCES underneath it — reveal an answer, grade it, take the next card —
 * which is when a grading row is actually at risk of sliding under the pointer.
 *
 * Rects are scored ROOT-RELATIVE. A floating window that is dragged mid-task moves every anchor
 * in viewport space and none of them relative to the surface, and the bullet is about internal
 * layout, not about where the user put the window.
 */
const ANCHORS = arg('anchors', '');
// The bullet's own bar. An anchor that moves at all has moved, but sub-pixel rounding and
// subpixel text metrics are not a shift a pointer can miss; 2px is the smallest honest floor.
const ANCHOR_TOL = Number(arg('anchor-tol', '2'));
// Long enough that a once-a-second clock is certain to tick inside the window.
const IDLE_MS = Number(arg('idle', '1600')) || 1600;
const SETTLE = Number(arg('settle', '600')) || 600;
// Correction 59's sampling gap. Each sample is a bridge round trip, so this is a cost/resolution
// trade and not a free knob: 120 ms gives ~4 samples inside the default 600 ms settle, which is
// enough to catch the 91-342 ms round trip that produced the correction. Lower it for a surface
// whose acknowledgement is shorter than that; the extra samples only ever cost time.
const TRANSIENT_STEP = Number(arg('transient-step', '120')) || 120;
// Correction 32: the gap between characters of a `type:` step. Anything under one 60 Hz frame
// makes every keystroke in a word share one paint, which is not a latency — see the recorder.
// `|| 40` would be wrong here: `--key-spacing 0` is the falsifier that reproduces the burst this
// correction is about, and `0 || 40` would silently give it the passing value instead.
const KEY_SPACING = Number.isFinite(Number(arg('key-spacing', '40'))) ? Number(arg('key-spacing', '40')) : 40;
/*
 * L7 BULLET 970 — "Keep review/input surfaces spatially fixed during active tasks."
 *
 * ADDITIVE AND OPT-IN. `--fixity` names the review/input regions of this surface as a CSS
 * selector list; without it nothing below runs and a cat2 score is byte-identical to every
 * banked one. It deliberately does NOT feed cat2's ten points: the bullet is a separate
 * contract, and folding it in would silently re-score six surfaces that were certified
 * before it existed.
 *
 * The measurement is the bullet's own words and nothing else: sample each named region's
 * box at rest, then after EVERY step of the surface's own dominant task, and report the
 * worst movement. `dx`/`dy` are measured ROOT-RELATIVE so a window that is dragged is not
 * billed to the surface; `rootDx`/`rootDy` are reported beside them so the two can never
 * silently disagree. A region that UNMOUNTS mid-task is a stronger failure than one that
 * moves and is counted separately (`vanished`) rather than skipped.
 *
 * `--fixity-control` is the required falsification: plant `position:relative; top:9px` on
 * the first region between two samples and require the instrument to report >= 9px, then
 * restore the EXACT original style attribute and require 0px again. The plant is verified
 * to have applied by reading the used box back — a mutation control that silently no-ops
 * reads as a PASS, which is a recorded false result in this repo.
 */
const FIXITY = arg('fixity', '');
const FIXITY_CONTROL = has('fixity-control');
const FIXITY_BAR_PX = Number(arg('fixity-bar', '0'));

if (!SURFACE) {
  console.error('REFUSE - --surface is required; this harness names no surface of its own');
  process.exit(2);
}
// A run that dies before it writes leaves the PREVIOUS run's file sitting there looking current.
// That cost the category-8 harness a stale FAIL nearly recorded as fresh.
if (OUT && fs.existsSync(OUT)) fs.unlinkSync(OUT);

const LABEL = arg('label', SURFACE.replace(/^@/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''));

const cfg = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'debug', 'bridge.json'), 'utf8',
));
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
// One expression per /eval; a trailing `;` reads as "Script failed to execute".
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
  return t.result;
}
const sleep = (ms) => new Promise((s) => { setTimeout(s, ms); });

const rootExpr = (surface) => (surface.startsWith('@')
  ? `document.querySelector(${JSON.stringify(surface.slice(1))})`
  : `[].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
       var r = w.getBoundingClientRect();
       if (!(r.width > 0 && r.height > 0)) return false;
       var t = w.querySelector('.fwin-title-text, .fwin-title');
       return !!t && (t.textContent || '').indexOf(${JSON.stringify(surface)}) >= 0;
     })[0]`);

/* ------------------------------------------------------- in-page: bullet 970 */

/**
 * One spatial sample of every named review/input region. Root-relative by construction, with
 * the root's own viewport box carried alongside so a moved WINDOW is distinguishable from a
 * moved REGION rather than assumed away.
 *
 * `present:false` is recorded, never dropped: a region that unmounts during the task has not
 * stayed fixed, and a reader that only diffed the regions it found on both ends would score
 * that as clean.
 */
const FIXITY_READ = (surface, sel) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ rootGone: true });
  var RR = root.getBoundingClientRect();
  if (!RR.width || !RR.height) return JSON.stringify({ refuse: 'surface is 0x0 - refusing to record zeros' });
  var r2 = function(n){ return Math.round(n * 100) / 100; };
  var out = ${JSON.stringify(sel)}.split(',').map(function(raw){
    var s = raw.trim();
    if (!s) return null;
    var all = [].slice.call(root.querySelectorAll(s));
    var el = all[0];
    if (!el) return { sel: s, present: false, matches: 0 };
    var b = el.getBoundingClientRect();
    return {
      sel: s,
      present: true,
      matches: all.length,
      x: r2(b.left - RR.left), y: r2(b.top - RR.top),
      w: r2(b.width), h: r2(b.height),
      vx: r2(b.left), vy: r2(b.top),
    };
  }).filter(Boolean);
  return JSON.stringify({ root: { x: r2(RR.left), y: r2(RR.top), w: r2(RR.width), h: r2(RR.height) }, regions: out })
})()`;

/**
 * The negative control's plant and its exact restore. `was` is the ORIGINAL style ATTRIBUTE
 * (null when the element carried none), so restoring cannot leave an empty `style=""` behind —
 * 381 empty style attributes is a residue this repo has already shipped and had to withdraw.
 */
const FIXITY_PLANT = (surface, sel, on) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ refuse: 'root gone' });
  var el = root.querySelector(${JSON.stringify(sel)});
  if (!el) return JSON.stringify({ refuse: 'region not found: ' + ${JSON.stringify(sel)} });
  var before = el.getBoundingClientRect().top;
  if (${on ? 'true' : 'false'}) {
    if (!el.hasAttribute('data-lq970-was')) {
      el.setAttribute('data-lq970-was', el.getAttribute('style') === null ? '@@lq970-absent@@' : el.getAttribute('style'));
    }
    el.style.position = 'relative';
    el.style.top = '9px';
  } else {
    var was = el.getAttribute('data-lq970-was');
    el.removeAttribute('data-lq970-was');
    if (was === null || was === '@@lq970-absent@@') el.removeAttribute('style');
    else el.setAttribute('style', was);
  }
  var after = el.getBoundingClientRect().top;
  return JSON.stringify({
    applied: Math.round((after - before) * 100) / 100,
    was: el.getAttribute('data-lq970-was'),
    styleAttr: el.getAttribute('style'),
    residueAttr: el.hasAttribute('data-lq970-was'),
  })
})()`;

/* ------------------------------------------------------------------ in-page */

/**
 * Arms the renderer-side recorder. Capture phase at the root, so this is the earliest moment the
 * renderer can be shown to have the event (correction 1 and 2).
 */
const ARM = (surface) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ refuse: 'surface not found: ' + ${JSON.stringify(surface)} });
  var r = root.getBoundingClientRect();
  if (!r.width || !r.height) return JSON.stringify({ refuse: 'surface is 0x0 (minimised or unmounted) - refusing to record zeros' });
  if (window.__lqCat2 && window.__lqCat2.disarm) window.__lqCat2.disarm();

  // Correction 14: a RESTORE PRIMITIVE MUST NOT BE BILLED TO THE USER. Clearing a filter through
  // React's native setter fires one bubbling input event, which the recorder below cannot tell
  // from a keystroke - so putting a field back added a keystroke to the cost of the task, and
  // repeated passes drifted upward while looking like a measurement. Muted work is not counted
  // and contributes no latency sample.
  var st = { surface: ${JSON.stringify(surface)}, latencies: [], clicks: 0, keystrokes: 0, mute: false, muted: 0 };
  var round1 = function(n){ return Math.round(n * 10) / 10; };
  // Correction 32: EVENTS THAT SHARE ONE PAINT DO NOT EACH HAVE A LATENCY. Every rAF callback
  // scheduled before the same frame runs in that frame and reads the same clock, so when the
  // driver delivers characters faster than 60 Hz, sample i is measured as (one shared paint
  // minus keystroke i) - a monotonically DECREASING ramp, not a latency. Measured on the sticky
  // note: 480.1 ... 5.8 over one burst, with an independent counter reporting ZERO frames
  // painted during it; the Settings search field, driven identically as a control, produced the
  // same zero. Any surface whose task is typing therefore failed the 100 ms bar for free.
  // The frame is identified by rAF's own timestamp argument, which is identical for every
  // callback in one frame - no second rAF loop, which would itself perturb the thing measured.
  var stampFor = function(kind, ev){
    var recvAt = performance.now();
    var evAt = ev && typeof ev.timeStamp === 'number' ? ev.timeStamp : recvAt;
    requestAnimationFrame(function(frameTs){
      var paintAt = performance.now();
      st.latencies.push({
        kind: kind,
        recvMs: round1(paintAt - recvAt),
        stampMs: round1(paintAt - evAt),
        frame: round1(typeof frameTs === 'number' ? frameTs : paintAt),
      });
    });
  };
  var onInput = function(ev){ if (st.mute) { st.muted += 1; return; } st.keystrokes += 1; stampFor('input', ev); };
  var onClick = function(ev){ if (st.mute) { st.muted += 1; return; } st.clicks += 1; stampFor('click', ev); };
  root.addEventListener('input', onInput, true);
  root.addEventListener('click', onClick, true);
  st.disarm = function(){
    root.removeEventListener('input', onInput, true);
    root.removeEventListener('click', onClick, true);
  };
  window.__lqCat2 = st;
  return JSON.stringify({ armed: true, surface: ${JSON.stringify(surface)} });
})()`;

/**
 * One snapshot. Correction 4: the change signal is wider than text, because a step that opens a
 * dialog, moves focus, scrolls, or only greys a button changes no text at all.
 */
const SNAP = (surface, churn = CHURN) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ rootGone: true });
  var WR = root.getBoundingClientRect();
  if (!WR.width || !WR.height) return JSON.stringify({ refuse: 'surface is 0x0 - refusing to record zeros' });

  // Correction 19: A SURFACE THAT CHANGES ON ITS OWN SCORES EVERY STEP AS LIVE. Anything the
  // churn set names is dropped from the text, state and control accumulators. The set is never
  // taken on trust - the idle leg in measure() proves each declared selector really does churn
  // and that nothing UNDECLARED still churns, and VOIDs the run otherwise.
  var churnSel = ${JSON.stringify(churn)};
  var churnEls = new Set();
  if (churnSel) {
    var cq = root.querySelectorAll(churnSel);
    for (var ci = 0; ci < cq.length; ci++) churnEls.add(cq[ci]);
  }
  function inChurn(e){
    for (var a = e; a && a !== root.parentElement; a = a.parentElement) if (churnEls.has(a)) return true;
    return false;
  }

  function painted(e){
    return typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity:true, checkVisibilityCSS:true, contentVisibilityAuto:true })
      : true;
  }
  function name(e){
    return e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0];
  }
  function hash(s){
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // Correction 17: A LIVE REGION IS AN ANNOUNCEMENT, NOT SURFACE STATE. The undo assertion
  // compares the surface before and after, and a round trip that ends "Added to library." is a
  // surface that came back plus a sentence about the trip. Folding that sentence into the same
  // hash makes every reversible do/undo pair unrestorable by construction. It is NOT dropped from
  // the change signal, though: a step whose only effect is a message is a step that did something,
  // so textHash keeps it and stateHash - which only the restore assertion reads - does not.
  function liveOwner(e){
    for (var a = e; a && a !== root.parentElement; a = a.parentElement) {
      var role = a.getAttribute && a.getAttribute('role');
      var live = a.getAttribute && a.getAttribute('aria-live');
      if (role === 'status' || role === 'alert' || role === 'log') return a;
      if (live && live !== 'off') return a;
    }
    return null;
  }

  var textAcc = [], stateAcc = [], liveAcc = [], runs = 0, churnRuns = 0;
  var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (var t = tw.nextNode(); t; t = tw.nextNode()) {
    var s = t.nodeValue && t.nodeValue.trim();
    if (!s || !t.parentElement || !painted(t.parentElement)) continue;
    runs++;
    // Counted in textRuns - the surface is not empty just because part of it ticks - but kept
    // out of every hash, so a clock cannot make a dead end look live.
    if (inChurn(t.parentElement)) { churnRuns++; continue; }
    textAcc.push(s);
    var owner = liveOwner(t.parentElement);
    if (owner) liveAcc.push(name(owner) + '|' + s.slice(0, 80));
    else stateAcc.push(s);
  }

  var ctrlAcc = [], ctrlCount = 0, churnCtrls = 0;
  var ctrls = root.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="switch"],[role="menuitem"]');
  for (var i = 0; i < ctrls.length; i++) {
    var c = ctrls[i];
    if (!painted(c)) continue;
    ctrlCount++;
    // Correction 19 again, on the control channel: a seek slider's own \`value\` advances with
    // playback, so a control inventory taken a second apart differs with nothing driven.
    if (inChurn(c)) { churnCtrls++; continue; }
    var dis = c.disabled === true || c.getAttribute('aria-disabled') === 'true';
    // Correction 37: the ACCESSIBLE NAME is state for a control whose state is not binary.
    // \`name()\` keeps only the FIRST class and this row carried no aria-label or title, so a
    // three-way cycle whose whole state lives in its name moved nothing the change signal
    // could see. Measured 2026-09-04 on the Music widget's repeat button: off -> all flips
    // \`aria-label\`/\`title\` "Repeat: off" -> "Repeat: all" and adds the \`on\` class, and the
    // step was still scored a DEAD END. The badge \`1\` only appears at the third position, so
    // \`textContent\` covers one of the three transitions. Widening here can only turn a dead
    // end into a live step, and every banked cat2 baseline records \`deadEndCount 0\`, so no
    // score already taken can move; the injected handler-less control has neither attribute
    // and is unaffected, which the --control leg re-proves per run.
    ctrlAcc.push(name(c) + '|' + (c.textContent || '').trim().slice(0, 24) + '|' + (dis ? 'D' : 'E')
      + '|' + (c.getAttribute('aria-selected') || '') + '|' + (c.getAttribute('aria-expanded') || '')
      + '|' + (c.getAttribute('aria-pressed') || '') + '|' + (typeof c.value === 'string' ? c.value.slice(0, 24) : '')
      + '|' + (c.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 40)
      + '|' + (c.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 40));
  }

  var scrollAcc = [];
  var all = root.querySelectorAll('*');
  for (var j = 0; j < all.length; j++) {
    if (all[j].scrollTop || all[j].scrollLeft) scrollAcc.push(name(all[j]) + ':' + all[j].scrollTop + ',' + all[j].scrollLeft);
  }

  // CORRECTION 62 — A VIRTUALISED LIST RENDERS ITS VIEWPORT, SO --result SATURATES.
  // Only real scroll containers, and only their content height, so an ordinary reflow
  // does not manufacture movement and mask a dead end.
  var volumeAcc = [];
  for (var v = 0; v < all.length; v++) {
    var ve = all[v];
    if (ve.scrollHeight - ve.clientHeight <= 2) continue;
    var vcs = getComputedStyle(ve);
    if (vcs.overflowY !== 'auto' && vcs.overflowY !== 'scroll') continue;
    volumeAcc.push(name(ve) + ':' + ve.scrollHeight);
  }

  // Correction 5's four exclusions. Each of them scored a real affordance as a defect once.
  var scrollTraps = [];
  var decorativeClips = [];
  for (var k = 0; k < all.length; k++) {
    var el = all[k];
    var over = el.scrollHeight - el.clientHeight;
    if (over <= 2) continue;
    var cs = getComputedStyle(el);
    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') continue;
    if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
    var br = el.getBoundingClientRect();
    if (br.width <= 4 || br.height <= 4) continue;
    if (cs.clipPath !== 'none' || (cs.clip && cs.clip !== 'auto')) continue;
    var clamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    var disclosure = false;
    if (el.parentElement) {
      var sibs = [].slice.call(el.parentElement.children);
      for (var s2 = 0; s2 < sibs.length; s2++) {
        if (sibs[s2] !== el && (sibs[s2].tagName === 'BUTTON' || sibs[s2].querySelector('button'))) { disclosure = true; break; }
      }
    }
    if (clamped && disclosure) continue;
    var media = [].slice.call(el.children).filter(function(c2){ return c2.tagName === 'IMG' || c2.tagName === 'VIDEO'; });
    if (media.length > 0 && media.every(function(m){ return getComputedStyle(m).objectFit === 'cover'; })) continue;

    // FIFTH EXCLUSION, and like the other four it exists because a real affordance scored as a
    // defect. City's main.reading-garden reports 127px unreachable, and every element that
    // crosses its clip line is an out-of-flow parallax PLATE - world-back, the background
    // master IMG, the sky-events and life canvases, the foreground mask. They are deliberately
    // taller than the window because the camera pans them; there is no content down there to
    // reach. Clipping paint is not a scroll trap.
    // The test is deliberately two-part so the real case survives: EVERY overflowing descendant
    // must be OUT OF FLOW (absolute/fixed) *and* carry no interactive descendant. The control's
    // own plant is an in-flow div and still counts; a clipped list, panel or log is in flow and
    // still counts; a clipped absolutely-positioned menu carries buttons and still counts.
    // Excluded rows are REPORTED, never silently dropped.
    var clipBottom = br.top + el.clientHeight;
    var kids = el.querySelectorAll('*');
    var plateOnly = false;
    for (var q = 0; q < kids.length; q++) {
      var kb = kids[q].getBoundingClientRect();
      if (kb.height <= 0 || kb.bottom <= clipBottom + 1) continue;
      var kcs = getComputedStyle(kids[q]);
      if (kcs.position !== 'absolute' && kcs.position !== 'fixed') { plateOnly = false; break; }
      plateOnly = true;
    }
    // The second half, and it is asked SEPARATELY on purpose. Asking "does this overflowing
    // element contain a control" is the wrong question: world-front is a full-height plate that
    // crosses the clip line and also holds the mushroom hitbox, which sits in the MIDDLE of the
    // visible scene. The question that matters is whether anything a user could act on has been
    // stranded past the fold, so it is asked of the control's own top edge.
    if (plateOnly) {
      var acts = el.querySelectorAll('button,a[href],input,select,textarea,[tabindex],[role="button"]');
      for (var q2 = 0; q2 < acts.length; q2++) {
        if (acts[q2].getBoundingClientRect().top >= clipBottom - 1) { plateOnly = false; break; }
      }
    }
    if (plateOnly) { decorativeClips.push({ sel: name(el), unreachablePx: Math.round(over), why: 'out-of-flow plates, no control past the fold' }); continue; }

    // SIXTH EXCLUSION - a line-clamped LABEL whose full string is exposed anyway. Measured on the
    // Media Library: span.medialib-card__title is -webkit-line-clamp 2 over a three-line
    // title, so it reports 17px unreachable on every long card and scored the Video surface as
    // two scroll traps. The clamp is an ellipsised truncation, not a hidden region - and the
    // exclusion is deliberately NOT "it is clamped, so it is fine", because that would pass a
    // card whose full title exists nowhere. The bar is the rubric's own words: content with NO
    // WAY TO REACH IT. So the full string must be RECOVERABLE, proven from the DOM: an ancestor
    // (or the element itself) carries title or aria-label that CONTAINS this element's own
    // textContent - the hover tooltip and the screen-reader name are two real routes to it.
    // The existing fourth exclusion (clamped && disclosure) already covers the expander case
    // and is left alone; it looks for a sibling BUTTON, which a card whose only button is the
    // overflow menu two levels up does not have. Excluded rows are reported, never dropped.
    // NOTE FOR ANY LATER EDIT OF THIS FILE: this block lives inside a template literal, so a
    // BACKTICK in a comment ends the string and the whole probe stops parsing. Cost one run.
    var clampRaw = cs.webkitLineClamp || cs.lineClamp || 'none';
    var truncates = (clampRaw && clampRaw !== 'none') || cs.textOverflow === 'ellipsis';
    if (truncates) {
      var norm = function (s) { return (s || '').replace(/\\s+/g, ' ').trim(); };
      var own = norm(el.textContent);
      var exposedOn = null;
      for (var a2 = el; a2 && own; a2 = a2.parentElement) {
        var lbl = norm(a2.getAttribute('title')) || norm(a2.getAttribute('aria-label'));
        if (lbl && lbl.indexOf(own) >= 0) { exposedOn = name(a2) + (a2.getAttribute('title') ? '[title]' : '[aria-label]'); break; }
        if (a2 === root) break;
      }
      // Same question the plate branch asks, for the same reason: a clamp that strands a CONTROL
      // past the fold is a trap however well the text is labelled.
      var stranded = false;
      var acts2 = el.querySelectorAll('button,a[href],input,select,textarea,[tabindex],[role="button"]');
      for (var q3 = 0; q3 < acts2.length; q3++) {
        if (acts2[q3].getBoundingClientRect().top >= clipBottom - 1) { stranded = true; break; }
      }
      if (exposedOn && !stranded) {
        decorativeClips.push({ sel: name(el), unreachablePx: Math.round(over), why: 'line-clamped label, full string exposed on ' + exposedOn });
        continue;
      }
    }

    scrollTraps.push({ sel: name(el), overflowY: cs.overflowY, unreachablePx: Math.round(over) });
  }

  var dialogs = [];
  var dq = root.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open],.modal');
  for (var d = 0; d < dq.length; d++) {
    if (!painted(dq[d]) || dq[d].getBoundingClientRect().width <= 0) continue;
    dialogs.push({ sel: name(dq[d]), txt: (dq[d].textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60) });
  }

  // L7 bullet 997. First PAINTED match per selector, rect taken RELATIVE to the surface root.
  // An anchor that is absent or unpainted is recorded as absent, NOT as a shift of zero - which
  // is the exact way a grading row that vanishes for a frame would score as perfectly stable.
  var anchorSel = ${JSON.stringify(ANCHORS)};
  var anchors = [];
  if (anchorSel) {
    var aList = anchorSel.split(' >> ');
    for (var ai = 0; ai < aList.length; ai++) {
      var asel = aList[ai].trim();
      if (!asel) continue;
      var hit = null;
      var cand = root.querySelectorAll(asel);
      for (var ci2 = 0; ci2 < cand.length; ci2++) {
        var cr = cand[ci2].getBoundingClientRect();
        if (painted(cand[ci2]) && cr.width > 0 && cr.height > 0) { hit = cand[ci2]; break; }
      }
      if (!hit) { anchors.push({ sel: asel, present: false }); continue; }
      var hr = hit.getBoundingClientRect();
      var r2 = function (n) { return Math.round(n * 100) / 100; };
      anchors.push({
        sel: asel, present: true,
        x: r2(hr.left - WR.left), y: r2(hr.top - WR.top),
        w: r2(hr.width), h: r2(hr.height),
        vx: r2(hr.left), vy: r2(hr.top),
      });
    }
  }

  var ae = document.activeElement;
  return JSON.stringify({
    anchors: anchors,
    textRuns: runs,
    churnTextRuns: churnRuns,
    churnControls: churnCtrls,
    textHash: hash(textAcc.join('\\u0001')),
    stateHash: hash(stateAcc.join('\\u0001')),
    liveRegions: liveAcc,
    controlCount: ctrlCount,
    controlHash: hash(ctrlAcc.join('\\u0001')),
    results: ${RESULT_SEL ? `root.querySelectorAll(${JSON.stringify(RESULT_SEL)}).length` : 'null'},
    dialogs: dialogs,
    dialogHash: hash(dialogs.map(function(x){ return x.sel + x.txt; }).join('\\u0001')),
    scrollTraps: scrollTraps,
    decorativeClips: decorativeClips,
    scrollHash: hash(scrollAcc.join('\\u0001')),
    volumeHash: hash(volumeAcc.join('\\u0001')),
    focus: ae ? name(ae) + '#' + (ae.id || '') : null,
    box: Math.round(WR.width) + 'x' + Math.round(WR.height),
    presentation: root.closest('.fwin') ? (root.closest('.fwin').getAttribute('data-presentation') || 'unset') : null
  });
})()`;

/** Correction 7: the point must actually belong to the target, or the click lands in another window. */
const POINT = (surface, sel) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ refuse: 'surface not found' });
  var el = root.querySelector(${JSON.stringify(sel)});
  if (!el) return JSON.stringify({ refuse: 'no match in surface for ' + ${JSON.stringify(sel)} });
  var r = el.getBoundingClientRect();
  if (!r.width || !r.height) return JSON.stringify({ refuse: 'target is 0x0: ' + ${JSON.stringify(sel)} });
  var x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  var top = document.elementFromPoint(x, y);
  var mine = !!top && (top === el || el.contains(top));
  return JSON.stringify({
    x: x, y: y, mine: mine,
    topEl: top ? top.tagName.toLowerCase() + '.' + String(top.className || '').split(' ')[0] : null,
    label: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
    disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true'
  });
})()`;

/**
 * Correction 11: A REAL CLICK FOCUSES ITS OWN TARGET, and counting that as "the surface moved"
 * makes every dead end invisible. `/click` is `sendInputEvent`, not `el.click()` — Chromium moves
 * focus to the pressed control exactly as it would for a human — so after driving a handler-less
 * button the `focus` channel flips and the step scores as live. Caught by the negative control
 * failing to falsify on its own injected dead end, which is what the control is for. Focus landing
 * ON the clicked target is masked; focus landing anywhere ELSE is still a real change, because
 * that is a control moving the user somewhere.
 */
const FOCUS_IS = (surface, sel) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ self: false, caret: false });
  var el = root.querySelector(${JSON.stringify(sel)});
  var ae = document.activeElement;
  var self = !!el && !!ae && (ae === el || el.contains(ae));
  // Correction 40: is the thing now holding focus a TEXT ENTRY field? Only then does a
  // click with no other observable effect still have an outcome — the caret.
  var entry = false;
  if (self && ae) {
    var tag = ae.tagName;
    var type = (ae.getAttribute('type') || 'text').toLowerCase();
    entry = tag === 'TEXTAREA'
      || ae.isContentEditable === true
      || (tag === 'INPUT' && ['text','search','url','email','tel','number','password',''].indexOf(type) >= 0);
  }
  return JSON.stringify({ self: self, caret: entry })
})()`;

/** Correction 6: focus() first — a synthetic click does not focus, and /type follows focus. */
const FOCUS = (surface, sel) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ refuse: 'surface not found' });
  var el = root.querySelector(${JSON.stringify(sel)});
  if (!el) return JSON.stringify({ refuse: 'no match in surface for ' + ${JSON.stringify(sel)} });
  el.focus();
  return JSON.stringify({ ok: document.activeElement === el, was: typeof el.value === 'string' ? el.value : null });
})()`;

/**
 * Correction 13: `type:` APPENDS AT THE CARET, so a second pass over the same field types
 * "NHKNHK" and measures a query that matches nothing. The presentation leg drives the same task
 * twice by construction, so without a way to put a text filter back this harness can only ever
 * measure its own first run. `clear:` is that primitive, and it goes through React's native value
 * setter plus a bubbling `input` event — assigning `.value` directly leaves React's state a render
 * behind, which is a recorded false result in this repo.
 */
const CLEAR = (surface, sel) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ refuse: 'surface not found' });
  var el = root.querySelector(${JSON.stringify(sel)});
  if (!el) return JSON.stringify({ refuse: 'no match in surface for ' + ${JSON.stringify(sel)} });
  var proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  var set = Object.getOwnPropertyDescriptor(proto, 'value').set;
  var was = el.value;
  // Correction 14: the dispatch below is indistinguishable from a keystroke at the listener, so it
  // is muted. The dispatch is synchronous, which is what makes this window exact.
  var st = window.__lqCat2;
  if (st) st.mute = true;
  set.call(el, '');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (st) st.mute = false;
  return JSON.stringify({ was: was, now: el.value })
})()`;

/*
 * CORRECTION 59 — A STEP WHOSE WORK FINISHES INSIDE THE SETTLE WINDOW READ AS A DEAD END.
 *
 * `driveStep` clicks, sleeps `SETTLE` (600 ms), then snapshots ONCE. That compares two instants
 * and calls the step dead if they match — which silently assumes the step's result PERSISTS past
 * 600 ms. A round trip that starts and ends in the same state is invisible to it.
 *
 * Measured on Translate, 2026-09-05, with a per-frame sampler in the page while the bridge drove
 * the real button. `run()` (`TranslateContent.tsx:130`) has no cache guard: it synchronously
 * clears the output and sets `state:'loading'`, so the button becomes a disabled "Working…" and
 * `.tr-status` appears. On a WARM model that whole trip is:
 *
 *     .tr-status present   frames 32 of 959     first 91 ms     last 342 ms
 *     output showing its placeholder for exactly those same 32 frames
 *
 * so by 600 ms the busy state is gone and the output has been rewritten with the SAME string.
 * `moved` was false on every channel — text, controls, results, dialogs, scroll, focus, box — and
 * the step scored `deadEnd`, failing the surface. The click was not dead: a capture-phase recorder
 * caught pointerdown/mousedown/mouseup/click all on `BUTTON.btn primary`, and the product's own
 * receipt moved — `jp-grammarx-translation-history-v1` went from **41 entries to 42**. The
 * acknowledgement was 91 ms, i.e. inside the rubric's own 100 ms bar, and the harness scored it 0.
 *
 * So the settle window is SAMPLED rather than merely waited out: `snapOf` + `movedBetween` at
 * `--transient-step` (120 ms) intervals across it, and a step that moved the surface at ANY
 * sample is not a dead end even if it came back to where it started by the final snapshot.
 *
 * IT MUST BE THE SAME INSTRUMENT, NOT A MORE SENSITIVE ONE, and that took two failed attempts to
 * get right. Both are recorded because the failure mode is the interesting part:
 *
 *   1. A MutationObserver over the surface root. It rescued the Translate click correctly (19
 *      mutations, first at 124 ms, last at 596 ms) and ALSO rescued the harness's own
 *      handler-less plant, so `--control` reported `moved.deadEnd false`, `counts.dirty [0,1,1]`,
 *      and the run VOIDed. Correct behaviour by the control, and it caught the relaxation.
 *   2. The same observer, excluding the clicked control's own subtree. Still VOIDed, identically.
 *      An inert button appended to `.tr-view` and clicked through the bridge in isolation
 *      produced **0 mutations**, so the plant was not rescuing itself -- the SURFACE was moving
 *      underneath it. React re-renders that change no text, no control state and no geometry
 *      still rewrite DOM nodes, so a raw mutation count is strictly more sensitive than the five
 *      channels the bar is actually defined on, and on any React surface it would eventually
 *      keep a genuinely dead button alive.
 *
 * Hence: no new signal at all. Same `snapOf`, same `movedBetween`, same `maskFocus`, sampled more
 * than once. Anything a sample sees, the end-of-step snapshot would have seen too had it landed
 * at that instant, so this cannot rescue anything the bar would not already have called alive.
 *
 * WHY IT CANNOT BECOME A FREE PASS, which is the only thing that matters about a relaxation:
 *   - It is exactly as sensitive as `moved`, by construction, so a control that answers nothing
 *     reads dead at every sample. The harness's plant still reports it, and a `--control` run in
 *     which the dead-end counter does not move still VOIDs the score. Required every run.
 *   - It only ever rescues a step that already ran; `counted` and the `caretOnly` mask are
 *     untouched.
 *   - `--churn` regions are already excluded from the hashes, so a ticking clock cannot keep a
 *     dead button alive, and the idle leg still VOIDs on anything undeclared that moves.
 *   - `transient` is reported on every step next to `moved`, with each sample's offset and
 *     verdict, so a reader can see exactly which steps were saved by it and audit the call.
 */
// Correction 59 samples the settle window through the SAME channels as movedBetween(); see driveStep.

/**
 * Correction 18's primitive. `scrollTop` is assigned directly rather than driven, because a
 * restore must not be billed as input and must not depend on a wheel landing where it is aimed.
 * The container is resolved inside the surface, so a task never reaches another window's scroller.
 */
const SCROLLTO = (surface, sel, px) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ refuse: 'surface not found' });
  var el = root.matches(${JSON.stringify(sel)}) ? root : root.querySelector(${JSON.stringify(sel)});
  if (!el) return JSON.stringify({ refuse: 'no match in surface for ' + ${JSON.stringify(sel)} });
  var was = el.scrollTop;
  el.scrollTop = ${JSON.stringify(px)};
  return JSON.stringify({ was: was, now: el.scrollTop, range: el.scrollHeight - el.clientHeight })
})()`;

/**
 * Correction 12: THE SECOND TERM IS THE SAME WINDOW, NOT A SECOND SURFACE.
 *
 * `L1_CLUNKINESS.md` got its only Standard-vs-Liquid delta by finding two DIFFERENT windows that
 * happened to host the same component (Video liquid 1080x700 against Media standard 820x580) — so
 * the comparison also carried a size difference, and it only existed because Media Center happens
 * to be mounted twice. None of L6's six surfaces has such a twin, which is how this term stayed
 * NOT MEASURABLE for three weeks. Every conventional `.fwin` carries its own reversible toggle
 * (`button.fwin-b-liquid`, `aria-pressed`, glyph U+25C7 standard / U+25C6 liquid), so the honest
 * comparison is one window, one geometry, one task, both presentations — which is exactly what
 * the plan's non-negotiable "reversible without losing geometry, state, focus or features" means.
 * The leg asserts `aria-pressed` actually flipped, and a failed restore VOIDS rather than passes.
 */
const PRESENT_TOGGLE = (surface, want) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ refuse: 'surface not found' });
  var w = root.closest('.fwin') || root;
  if (!w.classList.contains('fwin')) return JSON.stringify({ refuse: 'not a floating window - no per-window presentation' });
  var b = w.querySelector('button.fwin-b-liquid');
  if (!b) return JSON.stringify({ refuse: 'this window does not offer Liquid presentation' });
  var now = w.getAttribute('data-presentation');
  if (now === ${JSON.stringify(want)}) return JSON.stringify({ already: now, pressed: b.getAttribute('aria-pressed') });
  b.click();
  return JSON.stringify({ clicked: true, from: now })
})()`;

const PRESENT_READ = (surface) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ refuse: 'surface not found' });
  var w = root.closest('.fwin') || root;
  var b = w.querySelector('button.fwin-b-liquid');
  var r = w.getBoundingClientRect();
  return JSON.stringify({
    presentation: w.getAttribute('data-presentation'),
    pressed: b ? b.getAttribute('aria-pressed') : null,
    box: Math.round(r.width) + 'x' + Math.round(r.height)
  })
})()`;

const CONTROL_INJECT = (surface) => `(function(){
  var root = ${rootExpr(surface)};
  if (!root) return JSON.stringify({ refuse: 'surface not found' });
  var host = document.createElement('div');
  host.setAttribute('data-lqcat2-control', '1');
  // Pinned inside the root's own box on top of everything: appended in flow it can land below the
  // fold of a scrolling surface, where elementFromPoint refuses and the control never runs at all.
  // pointer-events:auto is load-bearing, not decoration: a surface whose ROOT is
  // pointer-events:none (City's main.reading-garden is, so the frameless drag strip keeps
  // its band) makes every appended child inherit none. The plant would then be unreachable,
  // and an unreachable button "changes nothing when clicked" - so the dead-end bar would
  // move for the wrong reason and the control would read as fired.
  host.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:99999;padding:6px;background:#111;pointer-events:auto';
  var b = document.createElement('button');
  b.setAttribute('data-lqcat2-deadend', '1');
  b.textContent = 'Control dead end';
  b.style.cssText = 'display:block;width:180px;height:34px';
  var dlg = document.createElement('div');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('data-lqcat2-modal', '1');
  dlg.textContent = 'Control modal that ignores Escape';
  dlg.style.cssText = 'display:block;width:220px;height:40px;background:#222;color:#fff';
  var sc = document.createElement('div');
  sc.setAttribute('data-lqcat2-scroll', '1');
  sc.style.cssText = 'width:200px;height:40px;overflow:hidden';
  var inner = document.createElement('div');
  inner.style.cssText = 'height:300px';
  inner.textContent = 'Control unreachable content';
  sc.appendChild(inner);
  host.appendChild(b); host.appendChild(dlg); host.appendChild(sc);

  /*
   * L7 bullet 997's negative control, and it has to fire DURING a step or it proves nothing.
   * The three plants above are all present before the run starts, so an anchor measured before
   * and after the same step sees them equally and the delta is 0 either way. This one is armed
   * and only displaces the anchor when its button is CLICKED, which is the only shape that can
   * falsify a per-step shift reading.
   *
   * It moves the REAL anchor rather than a stand-in: a control that resolves its own victim can
   * name a different element than the question scores, which is a recorded false PASS here.
   */
  var anchorSel = ${JSON.stringify(ANCHORS)};
  var shiftInfo = null;
  if (anchorSel) {
    var first = anchorSel.split(' >> ')[0].trim();
    var target = null;
    var cnd = root.querySelectorAll(first);
    for (var z = 0; z < cnd.length; z++) {
      var zr = cnd[z].getBoundingClientRect();
      var vis = typeof cnd[z].checkVisibility === 'function'
        ? cnd[z].checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
      if (vis && zr.width > 0 && zr.height > 0) { target = cnd[z]; break; }
    }
    if (target) {
      var sb = document.createElement('button');
      sb.setAttribute('data-lqcat2-shift', '1');
      sb.textContent = 'Control shift anchor';
      sb.style.cssText = 'display:block;width:180px;height:34px';
      sb.addEventListener('click', function () {
        target.setAttribute('data-lqcat2-shifted', target.style.marginTop || '');
        target.style.marginTop = '37px';
      });
      host.appendChild(sb);
      shiftInfo = { sel: first, before: Math.round(target.getBoundingClientRect().top) };
    } else {
      shiftInfo = { sel: first, refuse: 'no painted match for the first anchor; cannot arm the shift control' };
    }
  }

  root.appendChild(host);
  return JSON.stringify({ injected: true, shiftControl: shiftInfo });
})()`;

const CONTROL_REMOVE = `(function(){
  // Restore the displaced anchor FIRST and report what it was put back to, so an anchor left
  // 37px down cannot ride into the restoration leg as the surface's natural resting layout.
  var s = document.querySelectorAll('[data-lqcat2-shifted]');
  var unshifted = [];
  for (var j = 0; j < s.length; j++) {
    s[j].style.marginTop = s[j].getAttribute('data-lqcat2-shifted') || '';
    s[j].removeAttribute('data-lqcat2-shifted');
    unshifted.push(Math.round(s[j].getBoundingClientRect().top));
  }
  var n = document.querySelectorAll('[data-lqcat2-control]');
  for (var i = 0; i < n.length; i++) n[i].remove();
  return JSON.stringify({ removed: n.length, unshifted: unshifted })
})()`;

const READ = `(function(){
  var st = window.__lqCat2;
  if (!st) return JSON.stringify({ refuse: 'not armed' });
  var pick = function(kind, field){
    return st.latencies.filter(function(l){ return l.kind === kind; }).map(function(l){ return l[field]; });
  };
  var recv = st.latencies.map(function(l){ return l.recvMs; });
  var stamp = st.latencies.map(function(l){ return l.stampMs; });
  // Correction 32: count the samples that do NOT own their paint. Grouping by rAF's frame
  // timestamp, any frame holding more than one sample means every sample in it is
  // (shared paint - own event), which is an artifact of the delivery rate and not a latency.
  var perFrame = {};
  for (var i = 0; i < st.latencies.length; i++) {
    var f = String(st.latencies[i].frame);
    perFrame[f] = (perFrame[f] || 0) + 1;
  }
  var shared = st.latencies.filter(function(l){ return perFrame[String(l.frame)] > 1; });
  var busiest = 0;
  for (var k in perFrame) if (perFrame[k] > busiest) busiest = perFrame[k];
  return JSON.stringify({
    clicks: st.clicks,
    keystrokes: st.keystrokes,
    n: recv.length,
    inputRecv: pick('input', 'recvMs'),
    clickRecv: pick('click', 'recvMs'),
    worstRecv: recv.length ? Math.max.apply(null, recv) : null,
    overBar100: recv.filter(function(ms){ return ms > 100; }).length,
    sharedPaintSamples: shared.length,
    sharedPaintFrames: Object.keys(perFrame).filter(function(f){ return perFrame[f] > 1; }).length,
    busiestFrame: busiest,
    framesObserved: Object.keys(perFrame).length,
    inputStampUnscored: pick('input', 'stampMs'),
    clickStampUnscored: pick('click', 'stampMs'),
    worstStampUnscored: stamp.length ? Math.max.apply(null, stamp) : null
  })
})()`;

const DISARM = `(function(){
  if (window.__lqCat2 && window.__lqCat2.disarm) window.__lqCat2.disarm();
  delete window.__lqCat2;
  return JSON.stringify({ disarmed: true })
})()`;

/* ------------------------------------------------------------------- driver */

/** Correction 7: raise through the TASKBAR BUTTON. A pointerdown on the frame fires edge-snap. */
async function raise(surface) {
  if (surface.startsWith('@')) return 'root surface - no taskbar button';
  const r = await ev(`(function(){
    var w = ${rootExpr(surface)};
    if (!w) return 'no window';
    var b = [].slice.call(document.querySelectorAll('.os-task-win')).filter(function(x){
      return (x.getAttribute('title') || '').indexOf(${JSON.stringify(surface)}) >= 0; })[0];
    if (!b) return 'no-taskbar-button';
    var hidden = getComputedStyle(w).display === 'none';
    var zs = [].slice.call(document.querySelectorAll('.fwin')).map(function(x){ return Number(getComputedStyle(x).zIndex) || 0; });
    var onTop = (Number(getComputedStyle(w).zIndex) || 0) >= Math.max.apply(null, zs);
    if (hidden || !onTop) { b.click(); return hidden ? 'restored' : 'raised'; }
    return 'already-on-top';
  })()`);
  await post('/focus', {});
  await sleep(300);
  return r;
}

const parseSteps = (spec) => (spec ? spec.split('>>').map((s) => s.trim()).filter(Boolean) : []);

const snapOf = async (surface, churn = CHURN) => JSON.parse(await ev(SNAP(surface, churn)));

/**
 * L7 bullet 997's scoring term. Root-relative displacement of each declared anchor between two
 * snapshots. Returns per-anchor rows plus the worst single number, which is what the bullet is
 * scored on.
 *
 * A `present -> absent` transition gets its OWN verdict and is never folded into a shift of 0.
 * The failure this measures is a region not being where the pointer left it, and a region that is
 * not there at all is the extreme case of that, not the safe case. A `resizePx` is reported
 * separately and UNSCORED: a card frame that grows downward around longer text has not moved its
 * own top-left, and the bullet is about position under the pointer.
 */
function anchorDelta(before, after) {
  const A = new Map((before.anchors || []).map((a) => [a.sel, a]));
  const rows = [];
  const r2 = (n) => Math.round(n * 100) / 100;
  for (const b of after.anchors || []) {
    const a = A.get(b.sel);
    if (!a) continue;
    if (!a.present && !b.present) { rows.push({ sel: b.sel, state: 'absent-throughout', shiftPx: null }); continue; }
    if (a.present !== b.present) { rows.push({ sel: b.sel, state: b.present ? 'appeared' : 'vanished', shiftPx: null }); continue; }
    const dx = r2(b.x - a.x), dy = r2(b.y - a.y), dw = r2(b.w - a.w), dh = r2(b.h - a.h);
    rows.push({
      sel: b.sel, state: 'present', dx, dy, dw, dh,
      shiftPx: r2(Math.max(Math.abs(dx), Math.abs(dy))),
      resizePx: r2(Math.max(Math.abs(dw), Math.abs(dh))),
    });
  }
  return {
    rows,
    maxShiftPx: rows.reduce((m, r) => (r.shiftPx !== null && r.shiftPx > m ? r.shiftPx : m), 0),
    movedOverTol: rows.filter((r) => r.shiftPx !== null && r.shiftPx > ANCHOR_TOL).map((r) => `${r.sel}:${r.shiftPx}`),
    vanished: rows.filter((r) => r.state === 'vanished').map((r) => r.sel),
  };
}

/**
 * Correction 4: a step is live if ANY channel moved. Reported per channel so a next worker can see
 * WHICH one carried the change rather than trusting a boolean.
 */
function movedBetween(a, b, opts) {
  if (b.rootGone) return { any: true, rootGone: true };
  const m = {
    text: a.textHash !== b.textHash,
    controls: a.controlHash !== b.controlHash || a.controlCount !== b.controlCount,
    results: a.results !== b.results,
    dialogs: a.dialogHash !== b.dialogHash,
    scroll: a.scrollHash !== b.scrollHash,
    // Correction 62: the whole result set, not the rendered slice of it.
    resultVolume: a.volumeHash !== b.volumeHash,
    focus: a.focus !== b.focus && !(opts && opts.maskFocus),
    box: a.box !== b.box,
  };
  return { ...m, any: Object.values(m).some(Boolean) };
}

/** Drives one step and returns what it cost and whether the surface moved. */
async function driveStep(surface, step, before) {
  const [rawKind, ...rest] = step.split(':');
  // Correction 15: an UNDO STEP MAY ALREADY BE DONE. The modal leg presses a real Escape at every
  // open dialog before the undo runs, so a drawer the task opened is legitimately already closed
  // and `click:.rf-drawer-x` refuses on a surface that is in exactly the right state. A trailing
  // `?` means "if it is still there" — for restore steps only; a measured step that vanishes is a
  // finding, not something to skip, so the task spec should never use it.
  const optional = rawKind.endsWith('?');
  const kind = optional ? rawKind.slice(0, -1) : rawKind;
  const rem = rest.join(':');
  const out = { step, kind, optional };
  if (optional) {
    const sel = kind === 'type' ? rem.slice(0, rem.lastIndexOf('=')) : rem;
    const present = JSON.parse(await ev(`(function(){
      var root = ${rootExpr(surface)};
      return JSON.stringify({ n: root ? root.querySelectorAll(${JSON.stringify(sel)}).length : 0 })
    })()`));
    if (present.n === 0) {
      out.skipped = 'already in the target state';
      out.after = before;
      out.moved = { any: false };
      out.counted = false;
      return out;
    }
  }

  if (kind === 'wait') {
    await sleep(Number(rem) || SETTLE);
    out.after = await snapOf(surface);
    out.moved = movedBetween(before, out.after);
    out.counted = false; // a wait spends no input, so it can never be a dead end
    return out;
  }

  if (kind === 'click') {
    const pt = JSON.parse(await ev(POINT(surface, rem)));
    if (pt.refuse) return { ...out, refuse: pt.refuse };
    // Correction 7: refuse by name rather than clicking whatever is on top.
    if (!pt.mine) return { ...out, refuse: `occluded: ${rem} centre resolves to ${pt.topEl}; raise the target first` };
    out.target = { sel: rem, label: pt.label, disabled: pt.disabled, at: `${pt.x},${pt.y}` };
    const clickedAt = Date.now();
    await post('/click', { x: pt.x, y: pt.y });
    // Correction 11: mask the focus channel when focus merely landed on the control just pressed.
    // Read once, immediately, and reuse for every sample below: the mask is a property of the
    // gesture, and re-reading it per sample would let a later focus change flip it mid-window.
    const focusState = JSON.parse(await ev(FOCUS_IS(surface, rem)));
    const selfFocus = focusState.self === true;
    /*
     * Correction 59: WATCH the settle window rather than only waiting it out. Deliberately the
     * SAME instrument as the end-of-step comparison -- `snapOf` + `movedBetween`, with the same
     * focus mask -- just sampled more than once, so this can never be more sensitive than the
     * bar it feeds. Anything a sample sees, the final snapshot would also have seen had it landed
     * at that instant.
     */
    const samples = [];
    let sawMove = false;
    let last = null;
    while (Date.now() - clickedAt < SETTLE) {
      await sleep(TRANSIENT_STEP);
      last = await snapOf(surface);
      if (last.refuse) break;
      const mv = movedBetween(before, last, { maskFocus: selfFocus });
      samples.push({ atMs: Date.now() - clickedAt, any: mv.any });
      if (mv.any) sawMove = true;
    }
    out.transient = {
      channel: 'snapOf + movedBetween (identical to the end-of-step comparison)',
      samples,
      sawMove,
      firstMoveAtMs: sawMove ? samples.find((s) => s.any).atMs : -1,
    };
    out.after = await snapOf(surface);
    out.moved = movedBetween(before, out.after, { maskFocus: selfFocus });
    out.selfFocus = selfFocus;
    // Correction 40 — see `caretOnly` at the dead-end verdict.
    out.caretOnly = focusState.caret === true;
    out.counted = true;
    return out;
  }

  if (kind === 'type') {
    const eq = rem.lastIndexOf('=');
    if (eq < 0) return { ...out, refuse: 'type: needs <css>=<text>' };
    const sel = rem.slice(0, eq);
    const text = rem.slice(eq + 1);
    const f = JSON.parse(await ev(FOCUS(surface, sel)));
    if (f.refuse) return { ...out, refuse: f.refuse };
    if (!f.ok) return { ...out, refuse: `focus() did not take on ${sel}; /type would go to the last-focused field` };
    // Correction 13: /type appends at the caret, so a field left dirty by an earlier pass turns
    // "NHK" into "NHKNHKNHK" and the run measures a query that matches nothing. Typing starts from
    // the resting state, which is also the state the rubric's input count is defined against.
    if (typeof f.was === 'string' && f.was !== '') await ev(CLEAR(surface, sel));
    out.target = { sel, text, wasValue: f.was };
    // Correction 32: ONE REQUEST PER CHARACTER. `/type` loops `sendInputEvent` with no gap, so a
    // whole word lands inside a single frame and the recorder above now (correctly) reports the
    // run UNSCOREABLE. Spacing is also the more faithful measurement: nobody types a six-letter
    // query in under 16 ms, and the bar being scored is whether ONE keystroke is acknowledged
    // within 100 ms. 40 ms clears a 60 Hz frame with margin and costs 40 ms per character.
    for (const ch of text) {
      await post('/type', { text: ch });
      await sleep(KEY_SPACING);
    }
    await sleep(SETTLE);
    out.after = await snapOf(surface);
    out.moved = movedBetween(before, out.after);
    out.counted = true;
    return out;
  }

  if (kind === 'clear') {
    const c = JSON.parse(await ev(CLEAR(surface, rem)));
    if (c.refuse) return { ...out, refuse: c.refuse };
    await sleep(SETTLE);
    out.target = { sel: rem, was: c.was };
    out.after = await snapOf(surface);
    out.moved = movedBetween(before, out.after);
    // Clearing is a restore primitive, not a user gesture: it spends no input the rubric counts.
    out.counted = false;
    return out;
  }

  if (kind === 'scroll') {
    const eq = rem.lastIndexOf('=');
    if (eq < 0) return { ...out, refuse: 'scroll: needs <css>=<px>' };
    const s = JSON.parse(await ev(SCROLLTO(surface, rem.slice(0, eq), Number(rem.slice(eq + 1)) || 0)));
    if (s.refuse) return { ...out, refuse: s.refuse };
    await sleep(SETTLE);
    out.target = { sel: rem.slice(0, eq), was: s.was, now: s.now, range: s.range };
    out.after = await snapOf(surface);
    out.moved = movedBetween(before, out.after);
    // Correction 18: a restore primitive, not a user gesture — same billing as `clear:`.
    out.counted = false;
    return out;
  }

  if (kind === 'key') {
    await post('/key', { key: rem });
    await sleep(SETTLE);
    out.after = await snapOf(surface);
    out.moved = movedBetween(before, out.after);
    out.counted = true;
    return out;
  }

  return { ...out, refuse: `unknown step kind: ${kind}` };
}

/**
 * Bullet 970 samples only on the surface under test, and only when `--fixity` named regions.
 * The compare surface and the undo leg are deliberately excluded: the undo is UNMEASURED by
 * construction (correction 13) and billing its restore steps as task movement would make every
 * surface that returns to base look like it shifted.
 */
const fixityFor = (surface) => (FIXITY && surface === SURFACE ? FIXITY : '');
const r2 = (n) => Math.round(n * 100) / 100;

async function sampleFixity(surface, sel, phase) {
  const s = JSON.parse(await ev(FIXITY_READ(surface, sel)));
  return { phase, ...s };
}

/**
 * The bullet's number, computed here rather than left for a reader to interpret. `dx`/`dy` are
 * the WORST movement of each region across every sample, root-relative; `rootDx`/`rootDy` say
 * whether the window itself moved, so a clean region inside a moved window cannot read as fixed.
 */
function rollUpFixity(samples) {
  if (!samples || samples.length < 2) return { refuse: 'fewer than two samples; nothing to compare' };
  const base = samples[0];
  if (base.rootGone || base.refuse) return { refuse: base.refuse || 'root gone at rest' };
  let vanished = 0;
  let ambiguous = 0;
  let rootDx = 0;
  let rootDy = 0;
  const regions = base.regions.map((b, i) => {
    if (!b.present) { vanished += 1; return { sel: b.sel, absentAtRest: true }; }
    if (b.matches > 1) ambiguous += 1;
    let dx = 0; let dy = 0; let dw = 0; let dh = 0; let gone = null;
    for (const s of samples.slice(1)) {
      if (s.rootGone || s.refuse) { gone = s.refuse || 'root gone'; break; }
      const c = s.regions[i];
      if (!c || !c.present) { gone = `unmounted after step "${s.phase}"`; break; }
      dx = Math.max(dx, Math.abs(c.x - b.x));
      dy = Math.max(dy, Math.abs(c.y - b.y));
      dw = Math.max(dw, Math.abs(c.w - b.w));
      dh = Math.max(dh, Math.abs(c.h - b.h));
    }
    if (gone) vanished += 1;
    return { sel: b.sel, matches: b.matches, dx: r2(dx), dy: r2(dy), dw: r2(dw), dh: r2(dh), vanished: gone };
  });
  for (const s of samples.slice(1)) {
    if (s.rootGone || s.refuse || !s.root) continue;
    rootDx = Math.max(rootDx, Math.abs(s.root.x - base.root.x));
    rootDy = Math.max(rootDy, Math.abs(s.root.y - base.root.y));
  }
  const moved = regions.filter((r) => !r.absentAtRest && Math.max(r.dx || 0, r.dy || 0) > FIXITY_BAR_PX);
  return {
    barPx: FIXITY_BAR_PX,
    samples: samples.length,
    phases: samples.map((s) => s.phase),
    regions,
    ambiguousSelectors: ambiguous,
    vanished,
    rootDx: r2(rootDx),
    rootDy: r2(rootDy),
    maxShiftPx: r2(Math.max(0, ...regions.map((r) => Math.max(r.dx || 0, r.dy || 0)))),
    spatiallyFixed: vanished === 0 && moved.length === 0 && r2(rootDx) === 0 && r2(rootDy) === 0,
    movedRegions: moved,
  };
}

async function runTask(surface, spec) {
  const steps = parseSteps(spec);
  const results = [];
  const fsel = fixityFor(surface);
  const fixity = fsel ? [await sampleFixity(surface, fsel, 'rest')] : null;
  let before = await snapOf(surface);
  if (before.refuse) return { refuse: before.refuse };
  for (const step of steps) {
    const r = await driveStep(surface, step, before);
    if (r.refuse) return { refuse: `${step}: ${r.refuse}`, steps: results };
    results.push({
      step: r.step,
      target: r.target || null,
      counted: r.counted,
      moved: r.moved,
      caretOnly: r.caretOnly === true,
      /*
       * Correction 3: this is the dead-end verdict, and it is driven, not read.
       *
       * Correction 40 (2026-09-01) — CLICKING INTO A TEXT FIELD IS NOT A DEAD END. Measured
       * on the Settings search box: the click moved no text, no controls, no scroll and no
       * focus (the field already held it from a previous leg), so the step scored `deadEnd`
       * and the whole surface FAILED — while the identical run an hour earlier passed only
       * because the pane happened to still be settling and the text hash moved on its own.
       * The bar is meant to catch a control that answers nothing; a text field's answer IS
       * the caret, and correction 11 has already masked the focus channel for exactly this
       * gesture, so it can never be the thing that saves the step.
       *
       * Deliberately narrow: `caret` is true only when the element now holding focus is a
       * text-entry field. A click on a button that does nothing still scores a dead end.
       * Verified against the product before changing the instrument: with Settings raised, a
       * real OS click at the field's centre focuses it, and focusing an empty box changes
       * nothing else on the pane — 45 controls and 903 characters before and after.
       */
      // Correction 59 — see TRANSIENT_ARM. A step that mutated the surface during the settle
      // window did something, even if the surface came back to where it started by the snapshot.
      // Narrower than `moved`: a handler-less button mutates nothing at any instant, so the
      // required `--control` still moves this counter and still VOIDs a run that it does not.
      transient: r.transient || null,
      deadEnd: r.counted === true
        && r.moved.any === false
        && r.caretOnly !== true
        && !(r.transient && r.transient.sawMove === true),
      // L7 bullet 997, measured across THIS step's own state advance. `before` is still the
      // pre-step snapshot here; it is reassigned two lines below.
      anchorShift: ANCHORS ? anchorDelta(before, r.after) : null,
    });
    if (fixity) fixity.push(await sampleFixity(surface, fsel, r.step));
    if (r.moved.rootGone) { before = r.after; break; }
    before = r.after;
  }
  return { steps: results, last: before, fixity };
}

/**
 * MODAL TRAPS, driven. `l1-clunkiness.js` reported the open-dialog inventory and left closing the
 * loop to a human driver; here each dialog is focused, sent a real Escape, and re-checked. A dialog
 * that survives is the trap.
 */
async function modalLeg(surface, snap) {
  const traps = [];
  const closed = [];
  for (const d of snap.dialogs) {
    await ev(`(function(){
      var root = ${rootExpr(surface)};
      var el = root && [].slice.call(root.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open],.modal')).filter(function(x){
        return (x.tagName.toLowerCase() + '.' + String(x.className || '').split(' ')[0]) === ${JSON.stringify(d.sel)}; })[0];
      if (el) { var f = el.querySelector('button,[href],input,select,textarea,[tabindex]'); (f || el).focus(); }
      return JSON.stringify({ ok: !!el })
    })()`);
    await post('/key', { key: 'Escape' });
    await sleep(SETTLE);
    const after = await snapOf(surface);
    const still = (after.dialogs || []).some((x) => x.sel === d.sel && x.txt === d.txt);
    if (still) traps.push({ ...d, escapeSent: true, stillOpen: true });
    else closed.push(d.sel);
  }
  // Disclosed rather than silent: scoring this bar REQUIRES pressing Escape, so a dialog that was
  // open when the run started and obeys Escape is left CLOSED. That is a real change to live state.
  return { traps, closedByEscape: closed };
}

/**
 * Correction 19's proof, and the reason `--churn` is not a licence to exclude whatever is
 * inconvenient. Two snapshots `IDLE_MS` apart with NOTHING driven between them:
 *   raw  - churn set ignored. If this moves, the surface genuinely changes on its own.
 *   net  - churn set applied. If this still moves, something UNDECLARED changes on its own and
 *          the dead-end signal is not valid on this surface, so the run VOIDs.
 * An exclusion is EARNED only if `raw` moved in at least one phase; a `--churn` that never
 * excluded a real change is a silent widening of the pass band and VOIDs the run too.
 */
async function idleLeg(surface, phase) {
  const rawA = await snapOf(surface, '');
  await sleep(IDLE_MS);
  const rawB = await snapOf(surface, '');
  if (rawA.refuse || rawB.refuse || rawA.rootGone || rawB.rootGone) {
    return { phase, refuse: rawA.refuse || rawB.refuse || 'root gone during idle sample' };
  }
  const raw = movedBetween(rawA, rawB);
  let net = raw;
  let excluded = { textRuns: 0, controls: 0 };
  if (CHURN) {
    const a = await snapOf(surface);
    await sleep(IDLE_MS);
    const b = await snapOf(surface);
    if (a.refuse || b.refuse || a.rootGone || b.rootGone) {
      return { phase, refuse: a.refuse || b.refuse || 'root gone during idle sample' };
    }
    net = movedBetween(a, b);
    excluded = { textRuns: a.churnTextRuns, controls: a.churnControls };
  }
  return {
    phase,
    idleMs: IDLE_MS,
    rawChurns: raw.any,
    rawChannels: Object.keys(raw).filter((k) => k !== 'any' && raw[k]),
    netChurns: net.any,
    netChannels: Object.keys(net).filter((k) => k !== 'any' && net[k]),
    excluded,
  };
}

async function measure(surface, taskSpec, undoSpec = UNDO, withIdle = false) {
  const raised = await raise(surface);
  const armed = JSON.parse(await ev(ARM(surface)));
  if (armed.refuse) return { refuse: armed.refuse };

  // Correction 16: THE BASELINE HAS TO BE THE RESTING STATE, or the undo assertion is circular.
  // `type:` normalises its field before typing (correction 13), so a baseline taken before that
  // clear carries the PREVIOUS run's query, the undo correctly returns the field to empty, and the
  // restore then reads as failed against a base that was never resting. Normalising here instead
  // makes base, task and undo symmetric by construction, with no per-surface flag to remember.
  const normalised = [];
  for (const step of parseSteps(taskSpec)) {
    const k = step.split(':')[0].replace(/\?$/, '');
    if (k !== 'type') continue;
    const rem = step.slice(step.indexOf(':') + 1);
    const sel = rem.slice(0, rem.lastIndexOf('='));
    const c = JSON.parse(await ev(CLEAR(surface, sel)));
    if (!c.refuse && c.was) normalised.push({ sel, was: c.was });
  }
  if (normalised.length) await sleep(SETTLE);

  const base = await snapOf(surface);
  if (base.refuse) return { refuse: base.refuse };
  // Correction 8's sibling: an empty surface has not been measured; the rubric caps it at 0.
  //
  // CORRECTION 61 — "empty" IS THE WRONG WORD FOR THE COMMONEST CAUSE, AND IT COST THREE RUNS.
  // `painted()` gates every text run on `checkVisibility({ checkOpacity: true })`, so a fully
  // populated surface reports zero when its ENTRY ANIMATION IS FROZEN. Measured 2026-09-05: a
  // `.fwin` opened while the OS window was covered sat at `fwinIn:running:0` with opacity 0 and
  // 68 unpainted text nodes, and this refusal blamed the surface. The distinction is cheap to
  // make and only made once the refusal has already fired, so it costs a live run nothing.
  if (base.textRuns === 0) {
    const why = JSON.parse(await ev(`(function(){
      var root = ${rootExpr(surface)};
      if (!root) return JSON.stringify({ rootGone: true });
      var raw = 0;
      var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (var t = tw.nextNode(); t; t = tw.nextNode()) if (t.nodeValue && t.nodeValue.trim()) raw++;
      var frozen = [];
      var scan = root.getAnimations ? root.getAnimations({ subtree: true }) : [];
      for (var i = 0; i < scan.length; i++) {
        var a = scan[i];
        if (a.playState === 'running' && (a.currentTime || 0) === 0) {
          frozen.push(a.animationName || a.transitionProperty || '?');
        }
      }
      return JSON.stringify({
        rawTextNodes: raw,
        rootOpacity: getComputedStyle(root).opacity,
        frozenAtZero: frozen.slice(0, 6),
        hasFocus: document.hasFocus()
      })
    })()`));
    if (why.rawTextNodes > 0) {
      return {
        refuse: `NOT EMPTY - ${why.rawTextNodes} text nodes are present but none PAINTS. `
          + `root opacity ${why.rootOpacity}, animations stuck at currentTime 0: `
          + `${why.frozenAtZero.length ? why.frozenAtZero.join(', ') : 'none'} `
          + `(document.hasFocus ${why.hasFocus}). The compositor does not advance an animation in `
          + `a window it is not painting; raise/uncover the OS window and re-run. This is a `
          + `MEASUREMENT refusal, not a score of 0.`,
      };
    }
    return { refuse: '0 rendered text runs; an empty surface scores 0, not 10' };
  }

  // Correction 19: sampled at rest AND after the task, because a surface can be still until the
  // task starts something - a transport clock only ticks once a track is playing.
  const idle = withIdle ? [await idleLeg(surface, 'resting')] : [];

  const task = taskSpec ? await runTask(surface, taskSpec) : { steps: [], last: base };
  if (task.refuse) { await ev(DISARM); return { refuse: `task: ${task.refuse}`, partial: task.steps }; }

  const end = task.last;
  const modal = await modalLeg(surface, end);
  // Read the cost BEFORE the undo, or the restore's own clicks land in the measured total.
  const cost = JSON.parse(await ev(READ));
  if (withIdle) idle.push(await idleLeg(surface, 'after-task'));

  // Correction 13: the undo runs UNMEASURED, after the cost is banked, and its success is asserted
  // on the surface's own base text hash. The presentation leg drives the same task twice by
  // construction, so a surface that does not come back cannot be compared with itself.
  let undo = null;
  if (undoSpec) {
    /*
     * CORRECTION 40 — AN UNDO THAT IS A TOGGLE RE-DOES THE TASK WHEN THE SURFACE IS ALREADY BACK.
     *
     * Correction 15 already knew the modal leg can revert the task before the undo runs: it
     * presses a real Escape at every open dialog, and a drawer the task opened is then legitimately
     * closed. Its remedy was the trailing `?` — "drive this step only if its control is still
     * there" — which is the right answer for a CLOSE button, because a close button unmounts with
     * the thing it closes. It is the wrong answer for a TOGGLE, whose control is present in both
     * states: `click:<toggle>?` still fires and puts the surface back into the state the undo was
     * supposed to leave.
     *
     * Measured on City (Mooncap Garden), 2026-09-04, with a MutationObserver plus capture-phase
     * click/keydown recorders in the page while the harness drove it:
     *   click .reading-garden-mushroom-hitbox -> aria-expanded true   (the task)
     *   Escape (modalLeg; the dossier is role="dialog") -> aria-expanded false   (already restored)
     *   click .reading-garden-mushroom-hitbox -> aria-expanded true   (the undo, re-opening it)
     * and the run VOIDed as "undo did not restore" on a surface whose disclosure is correct in both
     * directions — proven separately by four consecutive bridge clicks toggling true/false/true/false.
     *
     * Worse than a false VOID, it is NON-DETERMINISTIC: `.reading-garden-info` carries
     * `animation: garden-info-reveal 220ms both` whose 0% frame is `opacity:0`, and the dialog
     * inventory only counts painted nodes. A snapshot landing inside those 220 ms sees no dialog,
     * sends no Escape, and the same command then restores cleanly. The first run of this surface
     * did exactly that and PASSED; the next three VOIDed. One harness, one surface, two answers.
     *
     * So the restore leg asks the question a restore leg actually has: is the surface already back?
     * If it is, the undo is a no-op and driving it is what breaks the round trip. This cannot mask a
     * defect. A task that moved nothing is already a dead end and fails its own bar; a task that
     * moved and was reverted by the harness's own Escape is genuinely restored, and the reason is
     * recorded here rather than inferred. When the surface is NOT at base the undo runs exactly as
     * before, so every banked scorecard stays byte-identical.
     */
    const pre = await snapOf(surface);
    const alreadyBack = !pre.refuse && pre.stateHash === base.stateHash;
    const u = alreadyBack ? null : await runTask(surface, undoSpec);
    const back = alreadyBack ? pre : await snapOf(surface);
    undo = {
      spec: undoSpec,
      steps: alreadyBack ? [] : (u.refuse ? u.refuse : u.steps.map((s) => s.step)),
      // Disclosed, never silent: a skipped undo has to say why it was skipped and what put the
      // surface back, or this correction becomes a way to pass a restore that never happened.
      skipped: alreadyBack ? 'already-at-base' : null,
      restoredBy: alreadyBack ? (modal.closedByEscape.length ? `modalLeg Escape: ${modal.closedByEscape.join(', ')}` : 'the task itself left the surface at base') : null,
      // Correction 17: judged on the surface, never on the announcement about the trip.
      restored: alreadyBack || (!u.refuse && !back.refuse && back.stateHash === base.stateHash),
      baseHash: base.stateHash,
      afterHash: back.stateHash,
      // Reported rather than dropped, so an announcement that should have been cleared is visible.
      liveRegionsBefore: base.liveRegions,
      liveRegionsAfter: back.liveRegions,
      textHashRoundTrip: { base: base.textHash, after: back.textHash },
    };
  }
  await ev(DISARM);

  return {
    raised,
    normalisedBeforeBaseline: normalised,
    idle,
    undo,
    presentation: base.presentation,
    base: { textRuns: base.textRuns, controlCount: base.controlCount, box: base.box, results: base.results },
    steps: task.steps,
    deadEnds: task.steps.filter((s) => s.deadEnd),
    scrollTraps: end.scrollTraps,
    decorativeClips: end.decorativeClips || [],
    openDialogs: end.dialogs,
    modalTraps: modal.traps,
    dialogsClosedByEscape: modal.closedByEscape,
    cost,
    // L7 bullet 997. Rolled up per step AND base-to-end, because the two answer different
    // questions: a row that slides away on `reveal` and slides back on `grade` is a shift a
    // pointer lands in the middle of, and base-to-end alone would report it as 0.
    anchorStability: ANCHORS ? {
      declared: ANCHORS.split(' >> ').map((s) => s.trim()).filter(Boolean),
      tolerancePx: ANCHOR_TOL,
      base: base.anchors,
      end: end.anchors,
      perStepMaxShiftPx: task.steps.map((s) => (s.anchorShift ? s.anchorShift.maxShiftPx : null)),
      worstStepShiftPx: task.steps.reduce(
        (m, s) => (s.anchorShift && s.anchorShift.maxShiftPx > m ? s.anchorShift.maxShiftPx : m), 0,
      ),
      stepsOverTol: task.steps
        .filter((s) => s.anchorShift && s.anchorShift.movedOverTol.length)
        .map((s) => ({ step: s.step, moved: s.anchorShift.movedOverTol })),
      vanishedAtStep: task.steps
        .filter((s) => s.anchorShift && s.anchorShift.vanished.length)
        .map((s) => ({ step: s.step, vanished: s.anchorShift.vanished })),
      baseToEnd: anchorDelta(base, end),
    } : null,
    endHash: end.textHash,
    baseHash: base.textHash,
    // L7 bullet 970. `null` whenever `--fixity` named nothing, so every banked cat2 file that
    // predates this leg stays comparable field for field.
    fixity: task.fixity ? rollUpFixity(task.fixity) : null,
    fixitySamples: task.fixity || null,
  };
}

/* --------------------------------------------------------------------- main */

(async () => {
  const m = await measure(SURFACE, TASK, UNDO, true);
  if (m.refuse) {
    console.error(`REFUSE - ${m.refuse}${m.partial ? ` (drove ${m.partial.length} step(s))` : ''}`);
    process.exit(2);
  }
  if (m.undo && !m.undo.restored) {
    console.error(`VOID - undo did not restore the surface: ${JSON.stringify(m.undo)}`);
    process.exit(3);
  }
  // Correction 19's two verdicts, both of which VOID rather than quietly score.
  const idleBad = (m.idle || []).filter((p) => p.refuse || p.netChurns);
  if (idleBad.length) {
    console.error(`VOID - the surface changes with no input and the change is not declared; `
      + `every step reads as live and no dead end can be seen: ${JSON.stringify(idleBad)}`);
    process.exit(3);
  }
  if (CHURN && !(m.idle || []).some((p) => p.rawChurns)) {
    console.error(`VOID - --churn "${CHURN}" excluded regions that never changed on their own in `
      + `either idle phase; an unearned exclusion widens the pass band: ${JSON.stringify(m.idle)}`);
    process.exit(3);
  }

  /*
   * BULLET 970's NEGATIVE CONTROL. Runs after the measurement it must falsify, in the same
   * process, and restores what it planted. Three assertions, all of which VOID rather than
   * quietly score, because each has a recorded false-pass shape behind it:
   *   applied  — the plant really moved the used box (a no-op plant reads as a clean PASS);
   *   detected — the INSTRUMENT saw the movement (a plant the reader cannot see is not a control);
   *   restored — the region is back at its exact rest offset with no residue.
   */
  let fixityControl = null;
  if (FIXITY && FIXITY_CONTROL) {
    const target = FIXITY.split(',')[0].trim();
    const a = await sampleFixity(SURFACE, FIXITY, 'control-before');
    const plant = JSON.parse(await ev(FIXITY_PLANT(SURFACE, target, true)));
    await sleep(SETTLE);
    const b = await sampleFixity(SURFACE, FIXITY, 'control-planted');
    const unplant = JSON.parse(await ev(FIXITY_PLANT(SURFACE, target, false)));
    await sleep(SETTLE);
    const c = await sampleFixity(SURFACE, FIXITY, 'control-restored');
    const at = (s) => (s.regions || []).find((r) => r.sel === target) || {};
    const detected = r2(Math.abs((at(b).y ?? 0) - (at(a).y ?? 0)));
    const residue = r2(Math.abs((at(c).y ?? 0) - (at(a).y ?? 0)));
    const wantAttr = plant.was === '@@lq970-absent@@' ? null : plant.was;
    fixityControl = {
      target,
      appliedPx: plant.applied,
      detectedPx: detected,
      residuePx: residue,
      styleAttrAtRest: wantAttr,
      styleAttrAfterRestore: unplant.styleAttr,
      markerLeftBehind: unplant.residueAttr === true,
      readerSaw: rollUpFixity([a, b]),
      passes: plant.applied >= 9
        && detected >= 9
        && residue === 0
        && unplant.styleAttr === wantAttr
        && unplant.residueAttr !== true,
    };
    if (!fixityControl.passes) {
      console.error(`VOID - bullet 970 control did not falsify and restore: ${JSON.stringify(fixityControl)}`);
      process.exit(3);
    }
  }

  /**
   * CORRECTION 44 — THE PRESENTATION TOGGLE DROPS CLICKS, SO ONE CLICK IS NOT A MEASUREMENT.
   *
   * Measured live on `novels`, 2026-09-04, before this was written. Six consecutive synthetic
   * clicks on `button.fwin-b-liquid` two seconds apart flipped six times for six; three earlier
   * clicks at ~1 s spacing flipped ONCE; and one click watched by a MutationObserver on
   * `data-presentation` produced no mutation at all across 4.25 s of 250 ms polling, then the very
   * next click flipped immediately. So the flip is FLAKY, not slow — a longer sleep does not fix
   * it, which is why `liquid-toggle-lands-every-other-click` says retry rather than wait.
   *
   * The single click + 900 ms read this replaces VOIDed the whole cell on a surface that was fine.
   * It cannot fabricate a pass: the window's own `data-presentation` is still the only accepted
   * evidence, and a leg that never reaches the asked-for presentation still VOIDs. The attempt
   * count is PUBLISHED into `presentationLeg`, so a cell that needed three clicks can never be
   * read as one that flipped cleanly.
   */
  const flipTo = async (want) => {
    const attempts = [];
    for (let i = 0; i < 4; i += 1) {
      const before = JSON.parse(await ev(PRESENT_READ(SURFACE)));
      if (before.presentation === want) {
        attempts.push({ attempt: i + 1, alreadyAt: want });
        return { ok: true, read: before, attempts };
      }
      const t = JSON.parse(await ev(PRESENT_TOGGLE(SURFACE, want)));
      if (t.refuse) return { ok: false, refuse: t.refuse, attempts };
      await sleep(900);
      const after = JSON.parse(await ev(PRESENT_READ(SURFACE)));
      attempts.push({ attempt: i + 1, from: before.presentation, to: after.presentation });
      if (after.presentation === want) return { ok: true, read: after, attempts };
    }
    const final = JSON.parse(await ev(PRESENT_READ(SURFACE)));
    return {
      ok: false,
      refuse: `asked ${want}, window reports ${final.presentation} after ${attempts.length} clicks`,
      read: final,
      attempts,
    };
  };

  // Correction 9: the second term is read factually and never invented.
  let costParity = 'UNMEASURED';
  let compare = null;
  let presentationLeg = null;
  let singlePathEvidence = null;
  if (COMPARE) {
    compare = await measure(COMPARE, TASK);
    if (compare.refuse) { console.error(`VOID - compare surface: ${compare.refuse}`); process.exit(3); }
    costParity = (m.cost.clicks + m.cost.keystrokes) <= (compare.cost.clicks + compare.cost.keystrokes);
  } else if (m.presentation === null) {
    costParity = 'N/A-single-path';
  } else if (!BOTH) {
    // A floating window whose section REFUSES Liquid has one path, and the parity term has no
    // second operand. Read factually from the window's own chrome rather than asserted: City's
    // `.fwin-frameless` has no `button.fwin-b-liquid` at all, so `PRESENT_READ` returns
    // `pressed: null` — the affordance is ABSENT, not disabled. Recorded as the same
    // `N/A-single-path` the root-surface case uses, with the evidence beside it, so it is a
    // measurement of the product and not a way to skip a bar.
    const soloRead = JSON.parse(await ev(PRESENT_READ(SURFACE)));
    if (soloRead.pressed === null && !soloRead.refuse) {
      costParity = 'N/A-single-path';
      singlePathEvidence = { liquidToggle: 'absent - no button.fwin-b-liquid in this window', read: soloRead };
    }
  } else if (BOTH && TASK) {
    // Correction 12: same window, same geometry, same task, both presentations.
    const was = JSON.parse(await ev(PRESENT_READ(SURFACE)));
    const other = was.presentation === 'liquid' ? 'standard' : 'liquid';
    const flip = await flipTo(other);
    if (!flip.ok) { console.error(`VOID - presentation leg: ${flip.refuse}`); process.exit(3); }
    const now = flip.read;
    const alt = await measure(SURFACE, TASK);
    const home = await flipTo(was.presentation);
    const back = home.read || JSON.parse(await ev(PRESENT_READ(SURFACE)));
    presentationLeg = {
      flipAttempts: flip.attempts.length,
      restoreAttempts: home.attempts.length,
      first: { presentation: was.presentation, box: was.box, total: m.cost.clicks + m.cost.keystrokes, deadEnds: m.deadEnds.length, worstRecv: m.cost.worstRecv },
      second: alt.refuse ? { refuse: alt.refuse } : {
        presentation: other, box: now.box, total: alt.cost.clicks + alt.cost.keystrokes,
        deadEnds: alt.deadEnds.length, worstRecv: alt.cost.worstRecv,
      },
      // Geometry is part of the plan's own reversibility non-negotiable, so it is asserted here too.
      restored: back.presentation === was.presentation && back.box === was.box,
      restoredTo: back,
    };
    if (alt.refuse) { console.error(`VOID - presentation leg second pass: ${alt.refuse}`); process.exit(3); }
    if (!presentationLeg.restored) {
      console.error(`VOID - presentation not restored: ${JSON.stringify(presentationLeg.restoredTo)} vs ${JSON.stringify(was)}`);
      process.exit(3);
    }
    const liquidTotal = was.presentation === 'liquid' ? presentationLeg.first.total : presentationLeg.second.total;
    const standardTotal = was.presentation === 'liquid' ? presentationLeg.second.total : presentationLeg.first.total;
    costParity = liquidTotal <= standardTotal;
    presentationLeg.liquidTotal = liquidTotal;
    presentationLeg.standardTotal = standardTotal;
  }

  const drove = m.steps.filter((s) => s.counted).length;
  const bars = {
    // A task nobody drove has no input cost and no dead ends; that is not a 10.
    deadEnds: drove === 0 ? 'UNMEASURED' : m.deadEnds.length === 0,
    modalTraps: m.modalTraps.length === 0,
    scrollTraps: m.scrollTraps.length === 0,
    // Correction 32: a run whose samples shared a paint has no latency to score. It is neither
    // a 10 nor a failure - it is UNSCOREABLE, and it lands in `unmeasured` below so the bar
    // cannot pass on an instrument that was not measuring. Exempting typed tasks instead would
    // have hidden the real 31.5 ms/keystroke defect that this ramp was masking (fixed 8b4dc866).
    latency: m.cost.n === 0
      ? 'UNMEASURED'
      : (m.cost.sharedPaintSamples > 0
        ? `UNSCOREABLE - ${m.cost.sharedPaintSamples} of ${m.cost.n} samples shared a paint (busiest frame held ${m.cost.busiestFrame}); space the driver so each event gets its own frame`
        : m.cost.overBar100 === 0),
    costParity: costParity === true ? true : (costParity === false ? false : costParity),
  };
  const unmeasured = Object.entries(bars).filter(([, v]) => typeof v === 'string' && v !== 'N/A-single-path').map(([k]) => k);
  const failed = Object.entries(bars).filter(([, v]) => v === false).map(([k]) => k);
  const pass = failed.length === 0 && unmeasured.length === 0;

  // Correction 31: React StrictMode double-invokes every render IN DEVELOPMENT ONLY, and this
  // harness only ever drives a dev build. That tax is a developer's, never a user's. Measured
  // 2026-08-31 on the Wired Start menu - same task, same open tree, same ~12 ms inert floor:
  // worstRecv 118.1 ms with StrictMode on and 52.3 ms with it off, against a 100 ms bar. Same
  // class of error as correction 2 (billing the app for the main->renderer hop), and fixed the
  // same way: the scored run is taken with the dev doubling off, the on-number is recorded
  // beside it, and every artifact says which it was. `src/renderer/strictRoot.tsx` reads the
  // flag and production ignores it. The opt-out is for TIMING ONLY - with StrictMode off,
  // effects mount once, so categories 6 and 8 must be measured with it ON.
  const strictOff = (await ev("String(localStorage.getItem('jp-lq-strict'))")) === 'off';

  const out = {
    label: LABEL,
    surface: SURFACE,
    win: WIN || '(focused)',
    task: TASK || '(none)',
    strictMode: strictOff
      ? 'off - dev double-render removed; latency scores the cost a shipped user pays'
      : 'on - latency carries the dev double-render tax; see correction 31',
    presentation: m.presentation === null ? 'main-window section (no per-window presentation)' : m.presentation,
    raised: m.raised,
    base: m.base,
    inputCost: { clicks: m.cost.clicks, keystrokes: m.cost.keystrokes, total: m.cost.clicks + m.cost.keystrokes },
    // Correction 2: recvMs scores, stampMs is recorded and never scored.
    latencyMs: {
      clickRecv: m.cost.clickRecv,
      inputRecv: m.cost.inputRecv,
      worstRecv: m.cost.worstRecv,
      overBar100: m.cost.overBar100,
      n: m.cost.n,
      // Correction 32: the instrument's own honesty fields. Non-zero sharedPaintSamples voids
      // the latency bar above rather than scoring it.
      sharedPaintSamples: m.cost.sharedPaintSamples,
      sharedPaintFrames: m.cost.sharedPaintFrames,
      busiestFrame: m.cost.busiestFrame,
      framesObserved: m.cost.framesObserved,
      clickStampUnscored: m.cost.clickStampUnscored,
      inputStampUnscored: m.cost.inputStampUnscored,
      worstStampUnscored: m.cost.worstStampUnscored,
    },
    steps: m.steps,
    idle: m.idle,
    churn: CHURN || null,
    undo: m.undo,
    stepsDriven: drove,
    deadEndCount: m.deadEnds.length,
    deadEnds: m.deadEnds,
    scrollTrapCount: m.scrollTraps.length,
    scrollTraps: m.scrollTraps.slice(0, 8),
    decorativeClips: (m.decorativeClips || []).slice(0, 8),
    openDialogs: m.openDialogs,
    modalTrapCount: m.modalTraps.length,
    modalTraps: m.modalTraps,
    dialogsClosedByEscape: m.dialogsClosedByEscape,
    costParity: COMPARE
      ? { compare: COMPARE, thisTotal: m.cost.clicks + m.cost.keystrokes, comparePresentation: compare.presentation, compareTotal: compare.cost.clicks + compare.cost.keystrokes }
      : (presentationLeg || singlePathEvidence || costParity),
    bars,
    // L7 bullet 970, reported BESIDE the ten points and never folded into them. `null` when
    // --fixity named nothing.
    spatialFixity: m.fixity,
    spatialFixitySamples: m.fixitySamples,
    spatialFixityControl: fixityControl,
    spatialFixityVerdict: m.fixity
      ? (m.fixity.refuse
        ? `REFUSE - ${m.fixity.refuse}`
        : (fixityControl
          ? (m.fixity.spatiallyFixed ? 'FIXED - controlled' : 'MOVED - controlled')
          : (m.fixity.spatiallyFixed ? 'FIXED - UNCONTROLLED, run --fixity-control' : 'MOVED - uncontrolled')))
      : null,
    verdict: pass
      ? 'PASS 10/10'
      : (failed.length === 0
        ? `UNMEASURED - ${unmeasured.join(',')}; drive the surface with --task or score 0, never 10`
        : 'FAIL'),
    failedBars: failed,
    unmeasuredBars: unmeasured,
    notMeasuredHere: [
      'dead controls outside the dominant-task path (honesty-probe A - every control driven)',
      'mute-pair explanation quality (rubric category 8 harness)',
    ],
  };

  if (CONTROL) {
    const inj = JSON.parse(await ev(CONTROL_INJECT(SURFACE)));
    if (inj.refuse) { console.error(`REFUSE - control: ${inj.refuse}`); process.exit(2); }
    // The injected task is not the dominant task, so the dominant task's undo does not belong
    // here. On a disclosure path it inverted the surface: clicking the injected dead-end changed
    // nothing, then `click:.collapse-header` opened the workbench and stranded it there while the
    // control still reported `backToBaseline: true`. Removing the injected nodes is this sub-run's
    // restore. The real task+undo was already driven by the scored run above. Replaying TASK from
    // its post-task state manufactures a dead end on idempotent paths (for example typing the same
    // Music search twice), so the restoration leg measures the unchanged native state directly.
    const dirtyTask = ANCHORS
      ? 'click:[data-lqcat2-deadend] >> click:[data-lqcat2-shift]'
      : 'click:[data-lqcat2-deadend]';
    const dirty = await measure(SURFACE, dirtyTask, '');
    const rem = JSON.parse(await ev(CONTROL_REMOVE));
    const restored = await measure(SURFACE, '', '');
    const moved = {
      // (a) the handler-less button must come back as a dead end
      deadEnd: !dirty.refuse && dirty.deadEnds.length > m.deadEnds.length,
      // (b) the Escape-ignoring dialog must come back as a modal trap
      modalTrap: !dirty.refuse && dirty.modalTraps.length > m.modalTraps.length,
      // (c) the clipped overflowing box must come back as a scroll trap
      scrollTrap: !dirty.refuse && dirty.scrollTraps.length > m.scrollTraps.length,
    };
    // (d) L7 bullet 997 - the anchor instrument must SEE a 37px displacement of the real anchor.
    // Only asserted when anchors were declared; a run with none must not claim this control fired.
    if (ANCHORS) {
      moved.anchorShift = !dirty.refuse
        && !!dirty.anchorStability
        && dirty.anchorStability.worstStepShiftPx > ANCHOR_TOL;
    }
    const backToBaseline = !restored.refuse
      && (!restored.undo || restored.undo.restored)
      && restored.deadEnds.length === m.deadEnds.length
      && restored.modalTraps.length === m.modalTraps.length
      && restored.scrollTraps.length === m.scrollTraps.length
      // The displaced anchor has to come back to where the scored run found it, or the control
      // has quietly rewritten the surface it was supposed to falsify.
      && (!ANCHORS || !restored.anchorStability
        || JSON.stringify(restored.anchorStability.base) === JSON.stringify(m.anchorStability.base));
    out.control = {
      moved,
      backToBaseline,
      anchorControl: ANCHORS ? {
        armedOn: inj.shiftControl,
        worstStepShiftPx: dirty.refuse ? null : dirty.anchorStability.worstStepShiftPx,
        perStep: dirty.refuse ? null : dirty.anchorStability.perStepMaxShiftPx,
        removeReport: rem,
        anchorsScored: m.anchorStability ? m.anchorStability.base : null,
        anchorsRestored: restored.refuse ? null : restored.anchorStability.base,
      } : null,
      counts: {
        base: [m.deadEnds.length, m.modalTraps.length, m.scrollTraps.length],
        dirty: dirty.refuse ? dirty.refuse : [dirty.deadEnds.length, dirty.modalTraps.length, dirty.scrollTraps.length],
        restored: restored.refuse ? restored.refuse : [restored.deadEnds.length, restored.modalTraps.length, restored.scrollTraps.length],
      },
      // Correction 2's floor, taken on the injected button because it repaints nothing.
      inertClickRecvMs: dirty.refuse ? null : dirty.cost.clickRecv,
    };
    if (!Object.values(moved).every(Boolean) || !backToBaseline) {
      out.verdict = 'VOID - negative control did not falsify';
    }
  }

  const text = JSON.stringify(out, null, 2);
  if (OUT) fs.writeFileSync(OUT, text);
  console.log(text);
  // 0 pass, 1 a real failure, 2 refuse, 3 unmeasured/void.
  process.exit(out.verdict.startsWith('PASS') ? 0 : (out.verdict.startsWith('FAIL') ? 1 : (out.verdict.startsWith('REFUSE') ? 2 : 3)));
})().catch((e) => { console.error(String(e && e.message ? e.message : e)); process.exit(4); });
