/**
 * RUBRIC CATEGORY 1 HARNESS — "Accessibility", parameterised by surface.
 *
 * ONE harness for every surface in the app. It consolidates four one-off probes that each
 * hardcoded their surface and each had to be re-written for the next one:
 *   - `l1-accessibility.js`   contrast + hit targets + keyboard, `.fwin` title only
 *   - `l1-hit-area.js`        the 2.5.8 spacing exception, Dictionary only
 *   - `l1-reduced-motion.js`  the motion leg, with `['Dictionary','Media']` in the file
 *   - `l1-a11y-control.js`    the negative control, as a separate manual step
 * Nothing here names a surface: the root, the window and the label are all arguments, and
 * the negative control runs in the same process as the measurement it has to falsify.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/cat1-accessibility.cjs \
 *     --surface "@.reader" [--win main] [--label novels] [--control] [--out <file>]
 *
 * --surface takes the same two forms as the category-4 harness, deliberately, so a surface is
 * named identically in both: a leading `@` is a CSS SELECTOR (a section of the main window —
 * opening a book replaces the desktop shell, so `.fwin` count is 0 and a title finds nothing),
 * anything else is a floating window's TITLE. Never an index: `probe-picks-first-visible-fwin`
 * is a recorded false-scoring in this repo.
 * --win pins every bridge call to ONE OS window. Mandatory whenever the surface is not in the
 * main window, or `/eval` resolves the FOCUSED window and a run silently scores another surface.
 *
 * THE FOUR NUMBERS, and the rubric's 10 needs all four:
 *   minRatio        minimum contrast ratio and the element that owns it (>=4.5 body, >=3 large)
 *   smallestTarget  smallest interactive box in px (rubric bar 32; WCAG 2.5.8's 24 reported too,
 *                   because they disagree and the gap is real)
 *   unreachable     interactive controls that refuse focus (must be 0)
 *   motionAfter     non-zero durations left under reduce-motion (rubric bar: <= 0.01 s, so 0)
 *
 * EVERY CORRECTION BELOW HAS ALREADY PRODUCED A FALSE FINDING IN THIS REPO (`css-measure`), and
 * they are carried over verbatim rather than re-derived:
 *  1. `color-mix()` computes to `color(srgb r g b / a)` with channels 0..1. An 8-bit parser reads
 *     every mixed colour as near-black (a real case scored 1.38 where the truth was 5.33); a
 *     parser that merely fails to match returns null, which reads as ABSENT rather than weak and
 *     hid 23 real failures out of 52. `parseColor` handles it and `selfTest` feeds it a known
 *     value every run. The colourspace token is stripped first — `display-p3` contains a digit.
 *  2. A minimised or 0x0 root measures as perfect. This harness REFUSES rather than record zeros.
 *  3. WCAG 2.5.8 has a spacing exception; a raw size rule is a finding generator (a flat "under
 *     24 px fails" reported 98 suite-wide, of which the exception cleared all 11 in the Scraper).
 *     Sizes come from `getBoundingClientRect()`, never the declaration — the shell runs at a
 *     user-set UI zoom and a control declared 24 px rendered at 23.52.
 *  4. A borderless-by-design control is not a contrast failure; controls are scored on their
 *     text/glyph colour, not on a border ring that is deliberately absent.
 *  5. EFFECTIVE background, not declared: every ancestor's alpha is composited down to an opaque
 *     base. For a Liquid material that is the entire point of the category.
 *  6. Two reduced-motion MECHANISMS ship — the OS media query and an in-app `reduce-motion` class
 *     with a `--motion-duration` token. `matchMedia` answers only the first. Both are reported;
 *     the class is toggled and restored, and `classRestored` proves the restore.
 *  7. `tabindex="-1"` on a NON-interactive element is a programmatic focus host, not a dead
 *     control (`div.mc-root` carries one with a comment saying so). Counted separately.
 *
 * NEGATIVE CONTROL (`--control`), required by the rubric and run against the SAME root: three
 * deliberate failures are injected into the surface — 1.6:1 text, a 12 px button 8 px from its
 * neighbour, and a `tabindex="-1"` real button — the probe is re-run, and the harness asserts
 * each count MOVED. Then the node is removed and a third run asserts the numbers returned to
 * baseline. A probe that has not returned a failure this session is unproven, so a `--control`
 * run that fails to move any of the three exits non-zero and VOIDS the score rather than passing.
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
if (!SURFACE) {
  console.error('REFUSE - --surface is required; this harness names no surface of its own');
  process.exit(2);
}
const IS_SELECTOR = SURFACE.startsWith('@');
const SELECTOR = IS_SELECTOR ? SURFACE.slice(1) : null;
const LABEL = arg('label', (SELECTOR || SURFACE).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''));

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'debug', 'bridge.json'), 'utf8'));
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

const ROOT_EXPR = IS_SELECTOR
  ? `document.querySelector(${JSON.stringify(SELECTOR)})`
  : `[].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
       var r = w.getBoundingClientRect();
       if (!(r.width > 0 && r.height > 0)) return false;
       var t = w.querySelector('.fwin-title-text, .fwin-title');
       return !!t && (t.textContent || '').indexOf(${JSON.stringify(SURFACE)}) >= 0;
     })[0]`;

const PROBE = `(function(){
  var root = ${ROOT_EXPR};
  if (!root) return JSON.stringify({ refuse: 'surface not found: ' + ${JSON.stringify(SURFACE)} });
  var WR = root.getBoundingClientRect();
  if (!WR.width || !WR.height) return JSON.stringify({ refuse: 'surface is 0x0 (minimised or unmounted) - refusing to record zeros' });

  function parseColor(s){
    if (!s) return null;
    var str = String(s).trim();
    if (str === 'transparent') return { r:0, g:0, b:0, a:0 };
    var fn = str.match(/^color\\(\\s*([a-z0-9-]+)\\s+([^)]+)\\)$/i);
    if (fn) {
      var nums = fn[2].replace(/\\//g, ' ').trim().split(/\\s+/).map(Number);
      if (nums.length >= 3 && nums.every(function(n){ return isFinite(n); })) {
        return { r: nums[0]*255, g: nums[1]*255, b: nums[2]*255, a: nums.length > 3 ? nums[3] : 1 };
      }
      return null;
    }
    var m = str.match(/^rgba?\\(([^)]+)\\)$/i);
    if (m) {
      var n2 = m[1].replace(/\\//g, ' ').replace(/,/g, ' ').trim().split(/\\s+/).map(Number);
      if (n2.length >= 3 && n2.every(function(n){ return isFinite(n); })) {
        return { r: n2[0], g: n2[1], b: n2[2], a: n2.length > 3 ? n2[3] : 1 };
      }
    }
    return null;
  }
  function over(fg, bg){
    var a = fg.a + bg.a*(1-fg.a);
    if (a <= 0) return { r:0, g:0, b:0, a:0 };
    return {
      r: (fg.r*fg.a + bg.r*bg.a*(1-fg.a))/a,
      g: (fg.g*fg.a + bg.g*bg.a*(1-fg.a))/a,
      b: (fg.b*fg.a + bg.b*bg.a*(1-fg.a))/a,
      a: a
    };
  }
  function lum(c){
    function f(v){ var x = v/255; return x <= 0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4); }
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
  }
  function ratio(a, b){
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
  }

  // POSITIVE CONTROL for the parser, every run. The assertion is on the CHANNELS, not on a
  // ratio: the ratio depends on the backdrop, and an over-tight bound fails on a correct parse.
  var st = (function(){
    var c = parseColor('color(srgb 0.87 0.49 0.50)');
    if (!c) return { ok:false, why:'parser returned NULL on color(srgb ...) - every result below would read as ABSENT, not weak' };
    function near(v, want){ return Math.abs(v-want) < 1; }
    var ok = near(c.r,221.85) && near(c.g,124.95) && near(c.b,127.5);
    return { ok: ok, why: ok ? 'channels scaled 0..1 -> 0..255' : 'channels wrong - an 8-bit misread puts these near 1, i.e. near-black',
             parsed: Math.round(c.r)+','+Math.round(c.g)+','+Math.round(c.b) };
  })();

  function painted(e){
    return typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity:true, checkVisibilityCSS:true, contentVisibilityAuto:true })
      : true;
  }
  function effectiveBg(el){
    var acc = null, n = el;
    while (n && n !== document.documentElement.parentElement) {
      var c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) acc = acc ? over(acc, c) : { r:c.r, g:c.g, b:c.b, a:c.a };
      if (acc && acc.a >= 0.999) return acc;
      n = n.parentElement;
    }
    var base = parseColor(getComputedStyle(document.body).backgroundColor) || { r:255, g:255, b:255, a:1 };
    return acc ? over(acc, { r:base.r, g:base.g, b:base.b, a:1 }) : { r:base.r, g:base.g, b:base.b, a:1 };
  }
  function label(e){
    return e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '');
  }

  // ---- 1. text contrast, on the EFFECTIVE background ----------------------------
  // A Set, not an array: a reading surface has thousands of text nodes and an indexOf scan
  // makes the walk quadratic — the /eval that timed out at 30 s was this loop, not the app.
  var textRows = [], seen = new Set();
  var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (var t = tw.nextNode(); t; t = tw.nextNode()) {
    var s = t.nodeValue && t.nodeValue.trim();
    if (!s) continue;
    var el = t.parentElement;
    if (!el || seen.has(el) || !painted(el)) continue;
    seen.add(el);
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    var cs = getComputedStyle(el);
    var fg = parseColor(cs.color);
    if (!fg) { textRows.push({ el: label(el), unmeasurable: cs.color }); continue; }
    var bg = effectiveBg(el);
    var composited = fg.a < 1 ? over(fg, bg) : fg;
    var px = parseFloat(cs.fontSize) || 16;
    var bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    var large = px >= 24 || (bold && px >= 18.66);
    textRows.push({ el: label(el), text: s.slice(0,24), px: Math.round(px*10)/10, large: large,
                    ratio: Math.round(ratio(composited, bg)*100)/100, bar: large ? 3 : 4.5,
                    inactive: !!el.closest(':disabled') });
  }
  var measurable = textRows.filter(function(x){ return typeof x.ratio === 'number'; });
  // WCAG 1.4.3's own exemption: text that is part of an INACTIVE user interface component has
  // no contrast requirement. The hit leg already excludes disabled controls (pointer-events is
  // none on them, so elementFromPoint filed them occluded); the contrast leg did not, and VN's
  // "Add to library" - disabled until the title input is non-empty, so disabled on every empty
  // form - scored 2.69 and failed the whole surface. Every form in the app with a disabled
  // submit fails forever that way, and the only "fix" is to paint disabled controls as though
  // they were live. That is damage, not repair, the same conclusion this file already records
  // for rect-vs-pointer target sizes. Skipped rows are PRINTED with their ratios, never silent.
  // aria-disabled=true is deliberately NOT exempt: such a control stays operable, so its text
  // is not part of an inactive component and the exemption does not reach it.
  // No backticks and no dollar-brace in this comment: it lives inside the PROBE template
  // literal, so either one is a parse error in THIS file, not in the browser. Both were made.
  var inactiveRows = measurable.filter(function(x){ return x.inactive; });
  var active = measurable.filter(function(x){ return !x.inactive; });
  var failing = active.filter(function(x){ return x.ratio < x.bar; }).sort(function(a,b){ return a.ratio - b.ratio; });
  var minRow = active.slice().sort(function(a,b){ return a.ratio - b.ratio; })[0] || null;

  // ---- 2. hit targets, WITH the 2.5.8 spacing exception -------------------------
  var CTRL = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="checkbox"],[tabindex]';
  var boxes = [].slice.call(root.querySelectorAll(CTRL)).filter(function(e){
    if (!painted(e)) return false;
    var b = e.getBoundingClientRect();
    return b.width >= 1 && b.height >= 1;
  }).map(function(e){
    var b = e.getBoundingClientRect();
    return { e: e, cx: b.left + b.width/2, cy: b.top + b.height/2, min: Math.min(b.width, b.height) };
  });
  for (var i = 0; i < boxes.length; i++) {
    var nearest = Infinity;
    for (var j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      var d = Math.sqrt(Math.pow(boxes[j].cx - boxes[i].cx, 2) + Math.pow(boxes[j].cy - boxes[i].cy, 2));
      if (d < nearest) nearest = d;
    }
    boxes[i].nearest = nearest;
  }
  var wcagFails = boxes.filter(function(b){ return b.min < 24 && b.nearest < 24; })
    .map(function(b){ return { el: label(b.e), min: Math.round(b.min*100)/100, nearest: Math.round(b.nearest*10)/10 }; });
  var under32 = boxes.filter(function(b){ return b.min < 32; }).sort(function(a,b){ return a.min - b.min; })
    .map(function(b){ return { el: label(b.e), min: Math.round(b.min*100)/100, nearest: Math.round(b.nearest*10)/10 }; });
  var smallest = boxes.slice().sort(function(a,b){ return a.min - b.min; })[0];

  // ---- 3. keyboard reachability, by actually focusing ---------------------------
  //
  // A ROVING TABINDEX IS NOT A DEAD CONTROL, and a flat "tabindex=-1 fails" rule is the §3
  // finding-generator shape all over again. ARIA's composite widgets — tablist, radiogroup,
  // menu, toolbar, listbox, tree, grid — are REQUIRED to expose one tab stop and move focus
  // with the arrow keys, so seven of eight tabs carrying -1 is the correct implementation,
  // not seven unreachable controls. The first run of this harness reported exactly that on
  // .reading-workspace-nav (role=tablist, one tab at 0 with aria-selected=true).
  //
  // But "it declares role=tablist" is not evidence either — a tablist with no keydown handler
  // is genuinely unreachable and looks identical in the DOM. So the pattern is DRIVEN: focus
  // the container's single tab stop, dispatch the arrow key, and see whether focus actually
  // moved to another member. Only then are that container's -1 members counted reachable.
  var INTERACTIVE = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="checkbox"]';
  var COMPOSITE = '[role="tablist"],[role="radiogroup"],[role="menu"],[role="menubar"],[role="toolbar"],[role="listbox"],[role="tree"],[role="grid"]';
  var prevFocus = document.activeElement;
  var roving = [];
  var rovingMembers = new Set();
  var composites = [].slice.call(root.querySelectorAll(COMPOSITE));
  for (var ci = 0; ci < composites.length; ci++) {
    var cEl = composites[ci];
    var members = [].slice.call(cEl.querySelectorAll('[tabindex]')).filter(painted);
    var stop = members.filter(function(m){ return m.getAttribute('tabindex') === '0'; })[0];
    var others = members.filter(function(m){ return m.getAttribute('tabindex') === '-1'; });
    if (!stop || others.length === 0) continue;
    var horizontal = cEl.getAttribute('aria-orientation') !== 'vertical';
    var key = horizontal ? 'ArrowRight' : 'ArrowDown';
    var backKey = horizontal ? 'ArrowLeft' : 'ArrowUp';
    var movedTo = null, restored = true;
    // DRIVING A TABLIST CHANGES THE SURFACE. With automatic activation the arrow key does not
    // only move focus, it selects — the first live run switched the Reading Finder tab and the
    // motion leg then sampled 7 durations before and 45 after, on a panel that had remounted
    // underneath it. The drive is reversed with the opposite arrow and the restore is asserted,
    // so a container that cannot be put back is reported rather than silently left mutated.
    var wasSelected = members.map(function(m){ return m.getAttribute('aria-selected'); });
    try {
      stop.focus({ preventScroll: true });
      stop.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
      if (document.activeElement !== stop && members.indexOf(document.activeElement) >= 0) {
        movedTo = label(document.activeElement);
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: backKey, bubbles: true, cancelable: true }));
      }
    } catch (err) { movedTo = null; }
    for (var si = 0; si < members.length; si++) {
      if (members[si].getAttribute('aria-selected') !== wasSelected[si]) restored = false;
    }
    var works = !!movedTo;
    roving.push({ container: label(cEl), role: cEl.getAttribute('role'), key: key, members: members.length, arrowMoved: works, movedTo: movedTo, selectionRestored: restored });
    if (works) for (var mi = 0; mi < others.length; mi++) rovingMembers.add(others[mi]);
  }

  var unreachable = [], focusHosts = [];
  for (var k = 0; k < boxes.length; k++) {
    var e2 = boxes[k].e;
    if (e2.disabled) continue;
    var isControl = e2.matches(INTERACTIVE);
    if (e2.getAttribute('tabindex') === '-1') {
      if (rovingMembers.has(e2)) continue; // reachable by arrow key, proven above
      (isControl ? unreachable : focusHosts).push({ el: label(e2), why: 'tabindex=-1' });
      continue;
    }
    try {
      e2.focus({ preventScroll: true });
      if (document.activeElement !== e2) unreachable.push({ el: label(e2), why: 'focus() did not take' });
    } catch (err) { unreachable.push({ el: label(e2), why: 'focus() threw' }); }
  }
  if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });

  var htmlEl = document.documentElement;

  return JSON.stringify({
    surface: ${JSON.stringify(SURFACE)},
    theme: htmlEl.getAttribute('data-theme'),
    presentation: root.getAttribute && root.getAttribute('data-presentation'),
    box: Math.round(WR.width) + 'x' + Math.round(WR.height),
    parserSelfTest: st,
    text: {
      measured: measurable.length,
      unmeasurable: textRows.length - measurable.length,
      minRatio: minRow ? minRow.ratio : null,
      minOwner: minRow ? (minRow.el + ' "' + minRow.text + '" ' + minRow.px + 'px') : null,
      failingCount: failing.length,
      worst: failing.slice(0, 8),
      inactiveSkipped: inactiveRows.length,
      inactiveWorst: inactiveRows.filter(function(x){ return x.ratio < x.bar; })
        .sort(function(a,b){ return a.ratio - b.ratio; }).slice(0, 6)
    },
    targets: {
      total: boxes.length,
      smallest: smallest ? (label(smallest.e) + ' ' + (Math.round(smallest.min*100)/100) + 'px') : null,
      smallestPx: smallest ? Math.round(smallest.min*100)/100 : null,
      under32Count: under32.length,
      under32: under32.slice(0, 10),
      wcag258FailCount: wcagFails.length,
      wcag258Fails: wcagFails.slice(0, 8)
    },
    keyboard: {
      controls: boxes.length,
      unreachableCount: unreachable.length,
      unreachable: unreachable.slice(0, 8),
      focusHostCount: focusHosts.length,
      focusHosts: focusHosts.slice(0, 4),
      // Composite widgets whose arrow-key navigation was driven, with the result. A container
      // listed here with arrowMoved:false IS a finding — its members are counted unreachable.
      roving: roving
    }
  });
})()`;

// The motion leg is a SEPARATE expression because the mechanism the rubric names —
// `prefers-reduced-motion` — cannot be reached from the page. `matchMedia` reports the OS and
// there is no setter, so the leg is driven from outside through the bridge's `/emulate` route
// (CDP `Emulation.setEmulatedMedia`) and this expression only samples. `osQueryMatches` is
// carried in every sample deliberately: it is this leg's negative control. If it does not go
// false -> true -> false across the three samples, the emulation never took and the leg is
// VOID, not a pass — which is exactly how the previous class-toggle probe scored a surface
// that had never been asked the question.
const MOTION_SAMPLE = `(function(){
  var root = ${ROOT_EXPR};
  if (!root) return JSON.stringify({ refuse: 'surface not found' });
  function painted(e){
    return typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity:true, checkVisibilityCSS:true, contentVisibilityAuto:true })
      : true;
  }
  function label(e){
    return e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '');
  }
  function secs(v){
    return String(v || '').split(',').map(function(x){
      var q = x.trim();
      if (q.slice(-2) === 'ms') return parseFloat(q)/1000;
      if (q.slice(-1) === 's') return parseFloat(q);
      return 0;
    }).filter(function(n){ return isFinite(n); });
  }
  var moving = [], all = [].slice.call(root.querySelectorAll('*'));
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (!painted(e)) continue;
    var cs = getComputedStyle(e);
    var d = Math.max.apply(null, [0].concat(secs(cs.transitionDuration), secs(cs.animationDuration)));
    if (d > 0.01) moving.push({ el: label(e), dur: Math.round(d*1000)/1000 });
  }
  moving.sort(function(a,b){ return b.dur - a.dur; });
  return JSON.stringify({
    osQueryMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    motionDurationToken: getComputedStyle(document.documentElement).getPropertyValue('--motion-duration').trim(),
    reduceMotionClass: document.documentElement.classList.contains('reduce-motion'),
    overThreshold: moving.length,
    longest: moving[0] || null,
    sample: moving.slice(0, 5)
  });
})()`;

// The negative control lives HERE rather than in a sibling file, so it can only ever run
// against the same root the measurement used. Three deliberate failures, one per number that
// has a bar; the fourth (motion) is falsified by the `before` sample, which is non-zero on any
// real surface and is printed next to `after`.
const CONTROL_INJECT = `(function(){
  var root = ${ROOT_EXPR};
  if (!root) return JSON.stringify({ refuse: 'surface not found' });
  var d = document.createElement('div');
  d.id = '__cat1Control';
  d.style.cssText = 'position:relative;background:#3a3a3a;padding:4px;display:flex;gap:8px;align-items:center';
  d.innerHTML = '<span style="color:#4a4a4a;font-size:13px">contrast control</span>'
    + '<button style="width:12px;height:12px;padding:0" aria-label="tiny a">a</button>'
    + '<button style="width:12px;height:12px;padding:0;margin-left:-4px" aria-label="tiny b">b</button>'
    + '<button tabindex="-1" style="width:40px;height:40px" aria-label="unreachable">u</button>';
  root.appendChild(d);
  return JSON.stringify({ injected: true, id: '__cat1Control' });
})()`;
const CONTROL_REMOVE = `(function(){
  var n = document.getElementById('__cat1Control');
  if (n && n.parentElement) n.parentElement.removeChild(n);
  return JSON.stringify({ removed: !document.getElementById('__cat1Control') });
})()`;

/**
 * The hit-target bar is scored on the POINTER-reachable region, not on `getBoundingClientRect()`.
 * Both numbers are real and they disagree by design: `.fwin-b` renders a 30x24 box and owns a
 * 32x32.5 pointer region through an inset `::after`, so the rect number reports five failures on
 * every window in the app and scoring it is what made category 1 "unfixable without inflating
 * compact chrome" — damage, not repair (`css-measure` §2; 98 false failures suite-wide).
 *
 * `l1-hit-area.js` already implements the walk, its refusals and the neighbour-theft guard, and
 * has 300 lines of recorded corrections in its header. Duplicating it here would be a second
 * instrument to keep in step, so this harness DELEGATES to it and folds its numbers into the
 * verdict. That is the consolidation: one command, one verdict, both instruments, no new file.
 * The rect number is still printed — it is the right number for layout — but it is not a bar.
 */
const HIT_AREA = fs.readFileSync(path.join(__dirname, 'l1-hit-area.js'), 'utf8')
  .replace(/\s*;\s*$/, '').trimEnd();
async function hitArea() {
  // Snapshot every scroll offset first. The walk scrolls each control to the centre of its
  // scroll parent and restores afterwards, but it REPORTS what it failed to put back
  // (`scrollLeaks`) rather than fixing it, and a leak is a real mutation of the user's surface
  // — the first run of this harness left `main.reading-workspace-panel` at scrollLeft 1628.
  // Snapshot/restore here so the harness leaves the app as it found it either way.
  const SNAP = `(function(){
    var out = [];
    var all = [].slice.call(document.querySelectorAll('*'));
    for (var i = 0; i < all.length; i++) {
      if (all[i].scrollTop || all[i].scrollLeft) out.push({ i: i, t: all[i].scrollTop, l: all[i].scrollLeft });
    }
    window.__cat1Scroll = out;
    return JSON.stringify({ recorded: out.length });
  })()`;
  await ev(SNAP);
  // Point the delegated probe at the same root, through the two globals it reads. Deleted
  // afterwards, so a later probe cannot inherit this run's surface.
  await ev(IS_SELECTOR
    ? `(function(){ window.__lqScoreRoot = ${JSON.stringify(SELECTOR)}; delete window.__lqScoreTitle; return 'set' })()`
    : `(function(){ window.__lqScoreTitle = ${JSON.stringify(SURFACE)}; delete window.__lqScoreRoot; return 'set' })()`);
  // Twice, and the pass condition for the INSTRUMENT is that the two agree: the recorded
  // scroll-leak defect made consecutive runs on an unchanged surface read 4 then 9.
  const a = JSON.parse(await ev(HIT_AREA));
  const b = JSON.parse(await ev(HIT_AREA));
  await ev(`(function(){ delete window.__lqScoreRoot; delete window.__lqScoreTitle; return 'cleared' })()`);
  const restore = JSON.parse(await ev(`(function(){
    var snap = window.__cat1Scroll || [];
    var all = [].slice.call(document.querySelectorAll('*'));
    var byIndex = {};
    for (var i = 0; i < snap.length; i++) byIndex[snap[i].i] = snap[i];
    var put = 0, cleared = 0;
    for (var j = 0; j < all.length; j++) {
      var want = byIndex[j];
      if (want) {
        if (all[j].scrollTop !== want.t || all[j].scrollLeft !== want.l) { all[j].scrollTop = want.t; all[j].scrollLeft = want.l; put++; }
      } else if (all[j].scrollTop || all[j].scrollLeft) {
        all[j].scrollTop = 0; all[j].scrollLeft = 0; cleared++;
      }
    }
    delete window.__cat1Scroll;
    return JSON.stringify({ put: put, cleared: cleared });
  })()`));
  if (a.refuse || b.refuse) return { refuse: a.refuse || b.refuse };
  return {
    ...b,
    scrollRestore: restore,
    stable: a.belowFloorByHit === b.belowFloorByHit && a.stolenCount === b.stolenCount,
    firstRun: { belowFloorByHit: a.belowFloorByHit, stolenCount: a.stolenCount, occludedCount: a.occludedCount },
  };
}

/**
 * ARIA DISCLOSURES, and this is the second half of a correction `l1-hit-area.js` only made once.
 * That probe opens every `<details>` before it walks, because a control inside a closed one still
 * reports a rect and got filed `occluded` — unscored. But `<details>` is not how this app ships
 * most of its disclosure: `CollapsibleSection.tsx` is a `button[aria-expanded][aria-controls]`
 * whose body is UNMOUNTED while closed, and Anki mounts the entire `DeckWorkbench` inside one.
 * So the first Anki run measured **11** controls, reported `disclosedForRun: 0`, and read clean
 * on a population that was missing a whole application. An unmeasured control is not a passing
 * one — the same rule the `<details>` fix was written for.
 *
 * Why this lives in the DRIVER and not in the probe: React does not flush a click synchronously
 * here. Measured on this surface — `b.click()` then re-counting inside ONE `/eval` returned
 * 11 -> 11 -> 11. The body only exists on a later task, so opening and measuring cannot share an
 * expression. Nor is one fixed nap enough: Anki's workbench mounts immediately and then adds its
 * asynchronously-read draft sessions. A 250 ms nap measured 24 controls while the hit-area leg,
 * later in the same run, found 76. Population is therefore polled to a quiet plateau, with the
 * final counts written into the receipt. Nothing in the settle names a surface or entry count.
 *
 * Restores by clicking each one back, then asserts every `aria-expanded` returned to what it was.
 * `ariaRestored: false` is reported, never swallowed: a probe that leaves the user's surface
 * expanded is a mutation, and the next run would capture it as the default state.
 */
async function waitAriaPopulation() {
  const started = Date.now();
  let samples = 0;
  let stable = 0;
  let previous = '';
  let population = {};
  do {
    await new Promise((s) => setTimeout(s, 250));
    population = JSON.parse(await ev(`(function(){
      var root = ${ROOT_EXPR};
      if (!root) return JSON.stringify({ refuse: 'surface not found while settling disclosures' });
      return JSON.stringify({
        nodes: root.querySelectorAll('*').length,
        controls: root.querySelectorAll('button,input,select,textarea,a[href],[role="button"],[tabindex]').length,
        text: (root.innerText || '').length,
        expanded: root.querySelectorAll('button[aria-expanded="true"][aria-controls]').length
      });
    })()`));
    if (population.refuse) return population;
    const signature = JSON.stringify(population);
    stable = signature === previous ? stable + 1 : 0;
    previous = signature;
    samples++;
    // Two seconds prevents the first synchronous render from masquerading as the plateau; four
    // matching samples then prove a full second with no late content. Six seconds is a refusal
    // ceiling, not a surface-specific expectation.
  } while ((Date.now() - started < 2000 || stable < 4) && Date.now() - started < 6000);
  return { ...population, samples, stable, elapsedMs: Date.now() - started };
}

async function ariaDisclose(open) {
  const r = await ev(`(function(){
    var root = ${ROOT_EXPR};
    if (!root) return JSON.stringify({ refuse: 'surface not found' });
    var remembered = window.__cat1AriaOpened || [];
    var hits = [].slice.call(root.querySelectorAll('button[aria-expanded][aria-controls]'));
    if (${open ? 'true' : 'false'}) {
      hits = hits.filter(function(b){ return b.getAttribute('aria-expanded') === 'false'; })
        .filter(function(b){ var r2 = b.getBoundingClientRect(); return r2.width > 0 && r2.height > 0; });
      remembered = hits.map(function(b){ return b.getAttribute('aria-controls'); }).filter(Boolean);
      window.__cat1AriaOpened = remembered;
    } else {
      hits = hits.filter(function(b){
        return b.getAttribute('aria-expanded') === 'true' && remembered.indexOf(b.getAttribute('aria-controls')) >= 0;
      });
    }
    for (var i = 0; i < hits.length; i++) hits[i].click();
    if (!${open ? 'true' : 'false'}) delete window.__cat1AriaOpened;
    return JSON.stringify({ clicked: hits.length, sel: hits.map(function(b){
      return (b.className || '').toString().trim().split(/\\s+/).join('.'); }).slice(0, 8) });
  })()`);
  const out = JSON.parse(r);
  if (out.clicked) out.settle = await waitAriaPopulation();
  return out;
}

/**
 * RAISE FIRST, or the whole category measures nothing. `document.elementFromPoint` is
 * document-global, so every control of a window sitting under another resolves to the window on
 * top and the hit-area leg files it `occluded` — unscored. The first live run of this harness
 * read `occluded: 68` of 73 and scored the surface on 5 controls, which the rubric caps at 0.
 * The taskbar button is a TOGGLE: clicking it on a window already on top MINIMISES it, and the
 * next read is a 0x0 refusal. So click only when it is not already on top, and never a
 * pointerdown on the frame — that fires edge-snap and persists a full-desk resize.
 */
async function raise() {
  if (IS_SELECTOR) return 'root surface - no taskbar button';
  const r = await ev(`(function(){
    var w = ${ROOT_EXPR};
    if (!w) return 'no window';
    var b = [].slice.call(document.querySelectorAll('.os-task-win')).filter(function(x){
      return (x.getAttribute('title') || '').indexOf(${JSON.stringify(SURFACE)}) >= 0; })[0];
    if (!b) return 'no-taskbar-button';
    var hidden = getComputedStyle(w).display === 'none';
    var zs = [].slice.call(document.querySelectorAll('.fwin')).map(function(x){ return Number(getComputedStyle(x).zIndex) || 0; });
    var onTop = (Number(getComputedStyle(w).zIndex) || 0) >= Math.max.apply(null, zs);
    if (hidden || !onTop) { b.click(); return hidden ? 'restored' : 'raised'; }
    return 'already-on-top';
  })()`);
  await post('/focus', {});
  await new Promise((s) => setTimeout(s, 300));
  return r;
}

const run = async () => JSON.parse(await ev(PROBE));
const sampleMotion = async () => JSON.parse(await ev(MOTION_SAMPLE));
const emulate = async (features) => post('/emulate', features ? { features } : { clear: true });

/**
 * Drive the OS-level `prefers-reduced-motion` and sample the surface on each side.
 * Returns the three samples plus whether the emulation demonstrably took and was released.
 */
async function motionLeg() {
  const before = await sampleMotion();
  if (before.refuse) return { refuse: before.refuse };
  const on = await emulate([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (!on.ok) return { refuse: `/emulate failed: ${on.error || JSON.stringify(on).slice(0, 200)}` };
  const during = await sampleMotion();
  const off = await emulate(null);
  const after = await sampleMotion();
  return {
    emulationTook: before.osQueryMatches === false && during.osQueryMatches === true,
    emulationReleased: after.osQueryMatches === false && off.ok === true,
    beforeOverThreshold: before.overThreshold,
    beforeLongest: before.longest,
    duringOverThreshold: during.overThreshold,
    duringLongest: during.longest,
    afterOverThreshold: after.overThreshold,
    motionDurationToken: before.motionDurationToken,
    reduceMotionClass: before.reduceMotionClass,
  };
}

/**
 * Every exit after the disclosure step goes through here. `refusing-leg-strands-app-state` is a
 * recorded failure in this repo: cat8's language leg returned on refuse before its restore, left
 * the whole app in Japanese, and the NEXT run then captured that as the user's own setting and
 * printed `restored: true`. A probe that opens a disclosure and then refuses would do the same
 * thing to the surface's default state, so the restore runs on the way out of every branch.
 */
let restoreAria = async () => ({ skipped: 'nothing was opened' });
async function bail(code, msg) {
  console.error(msg);
  console.error(`  aria-disclosures on exit: ${JSON.stringify(await restoreAria())}`);
  process.exit(code);
}

(async () => {
  const raised = await raise();
  const disclosed = await ariaDisclose(true);
  if (disclosed.refuse) { console.error(`REFUSE - aria-disclosure leg: ${disclosed.refuse}`); process.exit(2); }
  if (disclosed.clicked) restoreAria = () => ariaDisclose(false);
  const base = await run();
  if (base.refuse) await bail(2, `REFUSE - ${base.refuse}`);
  base.raised = raised;
  base.ariaDisclosed = disclosed;
  if (!base.parserSelfTest.ok) {
    await bail(3, `VOID - colour parser self-test failed: ${base.parserSelfTest.why}`);
  }
  base.motion = await motionLeg();
  if (base.motion.refuse) await bail(3, `VOID - motion leg: ${base.motion.refuse}`);
  if (!base.motion.emulationTook || !base.motion.emulationReleased) {
    await bail(3, `VOID - prefers-reduced-motion emulation did not take or did not release: ${JSON.stringify(base.motion)}`);
  }

  base.hit = await hitArea();
  if (base.hit.refuse) await bail(3, `VOID - hit-area leg: ${base.hit.refuse}`);
  // An occluded control is not evidence about its hit area, so a run that could only score a
  // handful of controls is an empty measurement — which the rubric caps at 0, not at a pass.
  const scored = (base.hit.rows || base.hit.measured || base.targets.total) - (base.hit.occludedCount || 0);
  if (base.hit.occludedCount > 0 && scored < base.targets.total * 0.5) {
    await bail(3, `VOID - ${base.hit.occludedCount} of ${base.targets.total} controls occluded; the surface was not raised clear. Scored ${scored}.`);
  }
  if (!base.hit.stable) {
    await bail(3, `VOID - hit-area instrument disagreed with itself across two runs: ${JSON.stringify(base.hit.firstRun)} vs ${JSON.stringify({ belowFloorByHit: base.hit.belowFloorByHit, stolenCount: base.hit.stolenCount, occludedCount: base.hit.occludedCount })}`);
  }

  // The rubric's bars, computed here so no caller has to remember them.
  const bars = {
    contrast: base.text.failingCount === 0,
    // The pointer number, not the rect number. See HIT_AREA above.
    targets32: base.hit.belowFloorByHit === 0 && base.hit.stolenCount === 0,
    wcag258: base.targets.wcag258FailCount === 0,
    keyboard: base.keyboard.unreachableCount === 0,
    // The bar is <= 0.01 s, and this harness counts only durations ABOVE that, so 0 is the bar.
    // `beforeOverThreshold` is printed beside it: a surface with nothing moving to begin with
    // has not demonstrated anything, and the rubric caps an empty measurement at 0.
    motion: base.motion.duringOverThreshold === 0 && base.motion.beforeOverThreshold > 0,
  };
  // The rubric bar for a target is 32 px in the smallest dimension. WCAG 2.5.8's 24 px with the
  // spacing exception is reported alongside because they disagree; the SCORE follows the rubric.
  const pass = Object.values(bars).every(Boolean);

  const out = {
    label: LABEL,
    surface: SURFACE,
    win: WIN || '(focused)',
    ...base,
    bars,
    verdict: pass ? 'PASS 10/10' : 'FAIL',
    failedBars: Object.entries(bars).filter(([, v]) => !v).map(([k]) => k),
  };

  if (CONTROL) {
    const inj = JSON.parse(await ev(CONTROL_INJECT));
    if (inj.refuse) await bail(2, `REFUSE - control: ${inj.refuse}`);
    const dirty = await run();
    // The control has to falsify the bar that is actually SCORED, which for targets is the
    // pointer walk — a control that only moves the rect count proves nothing about the number
    // in the verdict.
    const dirtyHit = await hitArea();
    await ev(CONTROL_REMOVE);
    const restored = await run();
    const moved = {
      contrast: dirty.text.failingCount > base.text.failingCount,
      targetsByPointer: !dirtyHit.refuse && dirtyHit.belowFloorByHit > base.hit.belowFloorByHit,
      targetsByRect: dirty.targets.under32Count > base.targets.under32Count,
      wcag258: dirty.targets.wcag258FailCount > base.targets.wcag258FailCount,
      keyboard: dirty.keyboard.unreachableCount > base.keyboard.unreachableCount,
    };
    // The restore is asserted on the counts that are SCORED. The rect under-32 count is
    // reported but not asserted: a live surface's control set moves under the probe — a
    // VirtualList mounts and unmounts rows between passes — and Immersion's rect count read 40
    // then 39 with nothing injected. Voiding a correct 10/10 on that drift would be the
    // opposite failure to the one this control exists to catch, so the drift is printed.
    const backToBaseline = restored.text.failingCount === base.text.failingCount
      && restored.targets.wcag258FailCount === base.targets.wcag258FailCount
      && restored.keyboard.unreachableCount === base.keyboard.unreachableCount;
    const rectDrift = restored.targets.under32Count - base.targets.under32Count;
    out.control = {
      moved,
      backToBaseline,
      rectDrift,
      // [contrast failures, rect under32, wcag2.5.8 failures, unreachable, belowFloorByHit]
      counts: {
        base: [base.text.failingCount, base.targets.under32Count, base.targets.wcag258FailCount, base.keyboard.unreachableCount, base.hit.belowFloorByHit],
        dirty: [dirty.text.failingCount, dirty.targets.under32Count, dirty.targets.wcag258FailCount, dirty.keyboard.unreachableCount, dirtyHit.belowFloorByHit],
        restored: [restored.text.failingCount, restored.targets.under32Count, restored.targets.wcag258FailCount, restored.keyboard.unreachableCount],
      },
    };
    if (!Object.values(moved).every(Boolean) || !backToBaseline) {
      out.verdict = 'VOID - negative control did not falsify';
    }
  }

  // Put the surface back BEFORE the score is written, and record the round trip in the file:
  // a scorecard that cannot say the disclosures returned to their default state is a scorecard
  // whose next run may be measuring this run's leftovers.
  out.ariaRestored = await restoreAria();

  const text = JSON.stringify(out, null, 2);
  if (OUT) fs.writeFileSync(OUT, text);
  console.log(text);
  process.exit(out.verdict.startsWith('PASS') ? 0 : 1);
})().catch(async (e) => {
  console.error(String(e && e.message ? e.message : e));
  try { console.error(`  aria-disclosures on throw: ${JSON.stringify(await restoreAria())}`); } catch { /* the bridge is what threw */ }
  process.exit(4);
});
