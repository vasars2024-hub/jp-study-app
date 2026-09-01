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
 *     [--churn ".music-time,.music-seek"] [--idle 1600]
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
 *   overBar100           inputs not acknowledged within 100 ms (bar: 0)
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
// Long enough that a once-a-second clock is certain to tick inside the window.
const IDLE_MS = Number(arg('idle', '1600')) || 1600;
const SETTLE = Number(arg('settle', '600')) || 600;

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
  var stampFor = function(kind, ev){
    var recvAt = performance.now();
    var evAt = ev && typeof ev.timeStamp === 'number' ? ev.timeStamp : recvAt;
    requestAnimationFrame(function(){
      var paintAt = performance.now();
      st.latencies.push({ kind: kind, recvMs: round1(paintAt - recvAt), stampMs: round1(paintAt - evAt) });
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
    ctrlAcc.push(name(c) + '|' + (c.textContent || '').trim().slice(0, 24) + '|' + (dis ? 'D' : 'E')
      + '|' + (c.getAttribute('aria-selected') || '') + '|' + (c.getAttribute('aria-expanded') || '')
      + '|' + (c.getAttribute('aria-pressed') || '') + '|' + (typeof c.value === 'string' ? c.value.slice(0, 24) : ''));
  }

  var scrollAcc = [];
  var all = root.querySelectorAll('*');
  for (var j = 0; j < all.length; j++) {
    if (all[j].scrollTop || all[j].scrollLeft) scrollAcc.push(name(all[j]) + ':' + all[j].scrollTop + ',' + all[j].scrollLeft);
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

    scrollTraps.push({ sel: name(el), overflowY: cs.overflowY, unreachablePx: Math.round(over) });
  }

  var dialogs = [];
  var dq = root.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open],.modal');
  for (var d = 0; d < dq.length; d++) {
    if (!painted(dq[d]) || dq[d].getBoundingClientRect().width <= 0) continue;
    dialogs.push({ sel: name(dq[d]), txt: (dq[d].textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60) });
  }

  var ae = document.activeElement;
  return JSON.stringify({
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
  root.appendChild(host);
  return JSON.stringify({ injected: true });
})()`;

const CONTROL_REMOVE = `(function(){
  var n = document.querySelectorAll('[data-lqcat2-control]');
  for (var i = 0; i < n.length; i++) n[i].remove();
  return JSON.stringify({ removed: n.length })
})()`;

const READ = `(function(){
  var st = window.__lqCat2;
  if (!st) return JSON.stringify({ refuse: 'not armed' });
  var pick = function(kind, field){
    return st.latencies.filter(function(l){ return l.kind === kind; }).map(function(l){ return l[field]; });
  };
  var recv = st.latencies.map(function(l){ return l.recvMs; });
  var stamp = st.latencies.map(function(l){ return l.stampMs; });
  return JSON.stringify({
    clicks: st.clicks,
    keystrokes: st.keystrokes,
    n: recv.length,
    inputRecv: pick('input', 'recvMs'),
    clickRecv: pick('click', 'recvMs'),
    worstRecv: recv.length ? Math.max.apply(null, recv) : null,
    overBar100: recv.filter(function(ms){ return ms > 100; }).length,
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
    await post('/click', { x: pt.x, y: pt.y });
    await sleep(SETTLE);
    out.after = await snapOf(surface);
    // Correction 11: mask the focus channel when focus merely landed on the control just pressed.
    const focusState = JSON.parse(await ev(FOCUS_IS(surface, rem)));
    const selfFocus = focusState.self === true;
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
    await post('/type', { text });
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

async function runTask(surface, spec) {
  const steps = parseSteps(spec);
  const results = [];
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
      deadEnd: r.counted === true && r.moved.any === false && r.caretOnly !== true,
    });
    if (r.moved.rootGone) { before = r.after; break; }
    before = r.after;
  }
  return { steps: results, last: before };
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
  if (base.textRuns === 0) return { refuse: '0 rendered text runs; an empty surface scores 0, not 10' };

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
    const u = await runTask(surface, undoSpec);
    const back = await snapOf(surface);
    undo = {
      spec: undoSpec,
      steps: u.refuse ? u.refuse : u.steps.map((s) => s.step),
      // Correction 17: judged on the surface, never on the announcement about the trip.
      restored: !u.refuse && !back.refuse && back.stateHash === base.stateHash,
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
    endHash: end.textHash,
    baseHash: base.textHash,
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
    const flip = JSON.parse(await ev(PRESENT_TOGGLE(SURFACE, other)));
    if (flip.refuse) { console.error(`VOID - presentation leg: ${flip.refuse}`); process.exit(3); }
    await sleep(900);
    const now = JSON.parse(await ev(PRESENT_READ(SURFACE)));
    if (now.presentation !== other) {
      console.error(`VOID - presentation did not flip: asked ${other}, window reports ${now.presentation}`);
      process.exit(3);
    }
    const alt = await measure(SURFACE, TASK);
    await ev(PRESENT_TOGGLE(SURFACE, was.presentation));
    await sleep(900);
    const back = JSON.parse(await ev(PRESENT_READ(SURFACE)));
    presentationLeg = {
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
    latency: m.cost.n === 0 ? 'UNMEASURED' : m.cost.overBar100 === 0,
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
    const dirty = await measure(SURFACE, 'click:[data-lqcat2-deadend]', '');
    await ev(CONTROL_REMOVE);
    const restored = await measure(SURFACE, '', '');
    const moved = {
      // (a) the handler-less button must come back as a dead end
      deadEnd: !dirty.refuse && dirty.deadEnds.length > m.deadEnds.length,
      // (b) the Escape-ignoring dialog must come back as a modal trap
      modalTrap: !dirty.refuse && dirty.modalTraps.length > m.modalTraps.length,
      // (c) the clipped overflowing box must come back as a scroll trap
      scrollTrap: !dirty.refuse && dirty.scrollTraps.length > m.scrollTraps.length,
    };
    const backToBaseline = !restored.refuse
      && (!restored.undo || restored.undo.restored)
      && restored.deadEnds.length === m.deadEnds.length
      && restored.modalTraps.length === m.modalTraps.length
      && restored.scrollTraps.length === m.scrollTraps.length;
    out.control = {
      moved,
      backToBaseline,
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
