/**
 * RUBRIC CATEGORY 4 HARNESS — "Use of space", parameterised by surface.
 *
 * ONE harness for every surface in the app, per RULE 1. It consolidates the five one-off probes
 * that between them could only ever score Dictionary, Media and Video, and only by a worker
 * running them in the right order by hand and interpreting the gaps:
 *   - `l1-use-of-space.js`             466 lines of in-page geometry, but it measures ONE size and
 *                                      explicitly refuses to resize; its `__lqScoreTitles` global
 *                                      had to be set by a separate call before every run
 *   - `l1-use-of-space-control.js`     the compact leg, as an inline width written by hand
 *   - `l1-maximize-drive.js`           the maximize CLICK, one call per direction, with the
 *                                      restore assertion left to the worker's eyes
 *   - `l1-max-clip-control.js`         the injected clipped box
 *   - `l1-max-clip-control-cleanup.js` its removal, which a worker had to remember or poison
 *                                      every later measurement in the session
 * The in-page reader is kept nearly verbatim — it is the part that took five days of false cleans
 * to get right and every correction in its header is load-bearing. What is new here is the DRIVE:
 * three sizes in one process, each restored and asserted, and the controls run in the same process
 * as the measurement they must falsify.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/cat4-use-of-space.cjs \
 *     --surface "Library" [--win main] [--label l6-library] [--out <file>] [--control] \
 *     [--compact 260x170] [--settle 500]
 *
 * --surface takes the same two forms as the category-1, -2 and -8 harnesses, deliberately, so a
 * surface is named identically in all four: a leading `@` is a CSS SELECTOR (a section of the main
 * window), anything else is a floating window's TITLE. Never an index.
 *
 * THE THREE SIZES, and why a root surface needs a different lever for two of them.
 * A `.fwin` has its own frame, so compact is an inline `style.width/height` (applied
 * synchronously, so measure-and-restore is safe) and maximized is the product's own
 * `.fwin-b[title="Maximize"]` button — never an inline width, because `.fwin-max` changes the
 * applied CSS and an inline width measures a size the product never paints.
 * A surface with NO `.fwin` above it IS the OS window (opening a book replaces the whole desktop
 * shell: `document.querySelectorAll('.fwin').length` is then 0), so there is no frame to resize
 * and no Maximize button. Its lever is the bridge's `/bounds` route against the OS window,
 * restored from the `previous` content size that route itself reports. Which of the two a surface
 * gets is measured from the DOM, never inferred from the `@` — see correction 14. Both levers are
 * recorded in the output as `sizeMechanism`, so nobody has to infer which one a number came from.
 *
 * THE BARS, and 10 requires all of them at EVERY measured size:
 *   clipped            0
 *   overlaps           0
 *   horizontalScrollers 0  and  hiddenOverflowX 0   (both, see the reader's own header)
 *   deadRegionPctOfViewport  <= 15
 *   contentGrowsNotChrome    chrome share must not RISE and the dominant canvas must not FALL
 *                            from default to maximized. It is a comparison, not a level.
 *   restored                 every size leg put the surface back byte-identically
 *
 * CORRECTIONS CARRIED OVER RATHER THAN RE-DERIVED — each already produced a false number here or
 * in a sibling harness:
 *  1. A MAXIMIZE CLICK IS A REACT STATE UPDATE. `toggleMax` is `setWins`, so a click and a
 *     measurement in one `/eval` read the box from BEFORE the commit. Every size change here is
 *     its own bridge call with a settle in between.
 *  2. A COLLAPSED `<details>` STILL HAS A BOX and reported 4 phantom overlaps in Dictionary.
 *     Every geometry read is gated on `checkVisibility({contentVisibilityAuto: true})`.
 *  3. `horizontalScrollers` ALONE IS NOT THE HORIZONTAL NUMBER. Content pushed out of an
 *     `overflow-x: hidden` box has no scrollbar to count and is strictly worse than one.
 *     `hiddenOverflowX` is the other half and both must be 0.
 *  4. A 0x0 OR MISSING SURFACE MEASURES AS PERFECT — zero clipping, zero overlap, zero dead
 *     region. This harness REFUSES rather than record those zeros.
 *  5. A RUN THAT DIES BEFORE IT WRITES leaves the previous run's file looking current. The `--out`
 *     file is deleted up front.
 *  6. AN INJECTED CONTROL LEFT IN THE DOM poisons every later measurement in the session and
 *     nothing about the page looks wrong. Removal is asserted, not assumed.
 *  7. A COMMENT INSIDE THE IN-PAGE TEMPLATE LITERAL MUST CONTAIN NO BACKTICK AND NO DOLLAR-BRACE.
 *     Both are a SyntaxError in the harness rather than in the browser, so the failure names the
 *     wrong file. Same trap the category-2 and -8 harnesses record.
 *  8. AN OCCLUDED WINDOW HAS NO ResizeObserver. `document.visibilityState` reads `hidden` while a
 *     terminal has the foreground, and RO simply does not fire, so every box measured after a
 *     resize is the box from BEFORE it. Measured here on `@.reader`: two runs of THE SAME
 *     geometry, one hour apart, returned `overlaps: 0` and `overlaps: 2`. The 2 was 51 px of
 *     `.manga-spread` over `.reader-footer` that no user can see, and the 0 was luck. Every read
 *     now focuses first, and refuses rather than record a hidden box.
 *  9. A `.fwin`'s INLINE STYLE CARRIES ITS STACKING ORDER. Restoring from maximize RAISES the
 *     window, so Library came back to a byte-identical box at `z-index: 532` against `446` and the
 *     whole category scored FAIL on `restored`. Geometry is compared; `zIndexMoved` reports the
 *     rest. The header had always said this - the comparison had not.
 * 10. A CSS `background-image` PAINTS CONTENT that the element-tag occupancy list cannot see.
 *     Library's covers are `div.cover` with `background-image: url(media://.../cover.jpeg)` and no
 *     `img` in the tree, so 24 cards of 180x240 cover art counted as DEAD SPACE and the surface
 *     read 15.9 pct against a bar of 15. A `url()` is marked; a bare gradient is not, or every
 *     themed panel would mark itself covered and the detector could never find real dead space.
 * 13. A SINGLE-LINE TEXT FIELD IS NOT A LAYOUT OVERFLOW. An `input` or `textarea` whose value is
 *     longer than its box always reports `scrollWidth > clientWidth`; that is native caret
 *     scrolling. Immersion's `input.immersion-url` read 210>184 at the window's own default size
 *     and failed the horizontal bar, as every text field in the app with a long value would.
 * 12. AN OPAQUE CONTENT HOST paints pixels this pass cannot walk. `iframe`, `webview`, `object`
 *     and `embed` render another document, often in another process. Immersion's stage is a
 *     950x619 `webview.immersion-webview` showing a live page; without it in the occupancy list
 *     every one of those pixels counted as dead space. Correction 10 in a second shape.
 * 11. A `position: fixed` CONTROL IS NOT PLACED IN THE VIEWPORT when the host uses containment.
 *     Every `.fwin` carries `contain: content`, which includes `contain: layout` and makes the
 *     WINDOW the containing block for fixed descendants. The clip box written at viewport
 *     `R.right - 20` landed 197 px off on Immersion (frame `left: 196`), entirely outside
 *     `.fwin-body`, where `outsideItsClipper` correctly declined to call it clipped - so the
 *     control did not fire and Reading Finder and Immersion returned VOID instead of a score.
 *     It is placed absolute inside the clipper now, which is what the header always described.
 * 14. `@` MEANS "A CSS SELECTOR", NOT "THE OS WINDOW". This file read it as the second for its
 *     first five surfaces, because every `@`-rooted surface it had met - the manga reader, the
 *     book reader - genuinely replaces the desktop shell. `@.visual-novel-panel` renders INSIDE
 *     the Immersion `.fwin`. Driving `/bounds` for it resizes the desktop window while the
 *     `.fwin` keeps its own inline 820x580, so the panel never changes size and all three legs
 *     return the SAME numbers under three different size labels - a perfect score for a surface
 *     that was never resized, and the one failure mode correction 4 exists to prevent. The lever
 *     is chosen from `closest('.fwin')` now, measured once from the DOM.
 * 15. A SHEET COVERING THE DOCUMENT IS A CONTRACT, NOT A COLLISION. Below its dock minimum a
 *     `ReadingCanvas` tool becomes a `.lq-reading-sheet` — `position: absolute; inset: 0`, a
 *     0.88-alpha background, `z-index: 2` — and the document stays MOUNTED underneath it, which
 *     is `documentCovered` in `shared/liquidReadingCanvas.ts` and the reason closing a sheet
 *     hands back the tree rather than a rebuilt copy. The pair loop counted every sheet-side box
 *     against every doc-side box: 17 overlaps on the VN panel at 222x103, none of them visible,
 *     because the loser is not painted at all. An element inside an opaque cover cannot collide
 *     with one outside it. A PARTIAL cover still counts, which is the outcome `readingCanvas.css`
 *     calls inexpressible, so the bar keeps the failure it exists for.
 * 16. A PROVEN PAGER'S LAST PAGE IS NOT A DEAD LAYOUT. The same EPUB chapter scored 5.3% dead on
 *     page 1/2 and 70.1% on page 2/2 at the compact host: the latter is the chapter's ordinary
 *     trailing remainder, and a bigger page makes that remainder larger. For a pager that passes
 *     the existing affordance + buffer arithmetic proof, occupancy is the UNION of its page
 *     fragments projected into one page viewport. This measures the pager's content buffer rather
 *     than whichever page happened to be visible. Falsifying the pager proof disables projection;
 *     `--control` verifies the number moves and restores on a last page.
 * 17. A WRAPPED HEADER ROW IS NOT THE DOMINANT CONTENT CANVAS. Flashcards exposed the old
 *     deepest-leaf heuristic: at default size it selected the 80px-tall contextual action row
 *     (13.0%), while maximized it selected a 56px import-form row (6.8%). The application work
 *     viewport grew in both dimensions, but the metric compared two unrelated chrome/form leaves
 *     and called them content. Category 4 asks for the content-to-chrome ratio. The visible
 *     `.fwin-body` (or the root itself on a chromeless surface) is that content viewport; its
 *     clipped share is now reported beside the independently measured outermost chrome.
 * 19. A FRAMELESS WINDOW HAS NO THIRD SIZE, AND THAT IS THE PRODUCT. City is `.fwin-frameless`
 *     with zero chrome buttons, so no state of the app paints it maximized. Demanding the leg
 *     anyway failed it on `allThreeSizes` and `restored` — two of its five failed bars — for
 *     having a shape this file was not written against. `sizesExpected` drops to 2 only when the
 *     maximize leg PROVES `.fwin-frameless` AND that none of the window's OWN chrome buttons is
 *     a Maximize — scanning `.fwin-btns` alone reported 0 for City, whose controls live in
 *     `.fwin-frameless-controls`, and would have exonerated any window anywhere. A framed window
 *     missing just that one button still fails. `contentGrowsNotChrome` then compares compact -> default, the same
 *     question asked of the two sizes that exist, and names the pair it used.
 * 20. AN AMBIENT ART PLATE IS NOT CLIPPING, AND TWO STACKED ARE NOT AN OVERLAP. City's parallax
 *     scene reported `clipped 24` / `overlaps 397` in a 680x709 box because 39 layers are
 *     deliberately larger than the window and deliberately on top of each other — a camera pans
 *     them. `cat2-clunkiness.cjs` has carried this exclusion for scroll traps since its own
 *     correction 5. Three-part and all three must hold: out of flow, no interactive descendant,
 *     no text anywhere in the subtree. An in-flow panel, a clipped menu with buttons, a clipped
 *     paragraph — each still counts. Overlaps need BOTH sides to be plates. Excluded rows are
 *     reported in `artPlateClips` / `artPlateOverlaps`, never dropped.
 * 21. A DEV-ONLY OVERLAY IS NOT PART OF THE SURFACE. These harnesses walk the running DEV app,
 *     so anything behind an `import.meta.env.DEV` guard is on screen here and on no user's
 *     machine. City's sky console was every remaining category-4 failure it had after 19 and 20.
 *     The product marks such a root `data-dev-only` next to its own guard — an attribute, never
 *     a class list this file knows about, because a surface-specific exception is what RULE 1
 *     forbids and a harness deciding for itself what "looks like" a debug panel would hide real
 *     inspectors. Everything removed is named in `devOnlyExcluded`, so misusing the attribute on
 *     a shipping element shows up by name in the run.
 *
 * NEGATIVE CONTROL (`--control`), two legs, because the rubric names one and history says it is
 * not enough on its own:
 *   a. THE INJECTED CLIP. One 300 px box starting 20 px inside the surface's right edge, placed
 *      `position: absolute` INSIDE the clipper (see correction 11 — `position: fixed` resolves
 *      against the `.fwin`, not the viewport) so 280 px hang out of the frame and it must satisfy
 *      the reader's own definition of clipping. `clipped` must RISE and then return to baseline.
 *   b. THE SUB-MINIMUM SHRINK the rubric asks for by name. The surface is driven BELOW the smallest
 *      size it supports and the numbers are reported factually. This leg is recorded rather than
 *      required: the compact hard floors were clamped on 2026-08-22 and the shrink correctly
 *      stopped firing on the surfaces that were fixed — a control that cannot fail on a fixed
 *      surface is not evidence of a blind probe, which is exactly why leg (a) exists beside it.
 *   c. THE PROVEN-PAGER PROOF, when the surface is on its last page. `data-paged-pages` is
 *      falsified without changing content; dead-region occupancy must move, then return exactly.
 * Leg (a) failing to fire VOIDS the score rather than passing it.
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
const SETTLE = Number(arg('settle', '500')) || 500;
const COMPACT = arg('compact', '260x170');
const SUBMIN = arg('submin', '200x140');

if (!SURFACE) {
  console.error('REFUSE - --surface is required; this harness names no surface of its own');
  process.exit(2);
}
if (OUT && fs.existsSync(OUT)) fs.unlinkSync(OUT);

const LABEL = arg('label', SURFACE.replace(/^@/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''));
/**
 * CORRECTION 14. `@` MEANS "A CSS SELECTOR", NOT "THE OS WINDOW", and this file read it as the
 * second for its first five surfaces because every `@`-rooted surface it had met so far - the
 * manga reader, the book reader - genuinely replaces the desktop shell.
 * `@.visual-novel-panel` does not: it renders INSIDE the Immersion `.fwin`. Driving `/bounds`
 * for it resizes the desktop window while the `.fwin` keeps its own inline 820x580, so the
 * panel never changes size and all three legs return the SAME numbers under three different
 * size labels - a perfect score for a surface that was never resized. Which lever a surface
 * needs is a fact about the DOM, so it is measured once from the DOM rather than inferred from
 * the argument's first character.
 */
let IS_ROOT = SURFACE.startsWith('@');
const parseSize = (s) => {
  const m = /^(\d+)x(\d+)$/.exec(s);
  if (!m) { console.error(`REFUSE - size must be WxH, got ${s}`); process.exit(2); }
  return { w: Number(m[1]), h: Number(m[2]) };
};

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

/**
 * The `.fwin` that OWNS the surface, or null when the surface is the desktop shell itself. For a
 * title-named surface this is the surface; `closest` starts at the element, so one expression
 * covers both forms. See correction 14 - this is what decides the lever, and it is a DOM fact.
 */
const hostExpr = (surface) => `(function(){
  var e = ${rootExpr(surface)};
  return e && e.closest ? e.closest('.fwin') : null;
})()`;

/* ------------------------------------------------------------------ in-page */

/**
 * The geometry reader, lifted from `l1-use-of-space.js` with its definitions intact. The only
 * change is how the surface is named: one root expression instead of a `__lqScoreTitles` global a
 * caller had to set in a separate bridge call.
 */
const READ = (surface) => `(function(){
  // CORRECTION 8, and it is the one this harness was built wrong without. An OCCLUDED window
  // reports document.visibilityState === 'hidden' and its ResizeObserver DOES NOT FIRE, so every
  // box after a resize is the box from BEFORE it. Measured on @.reader: at 924x561 the stage was
  // 612x411 while .manga-spread still held its 714 px pre-resize height, giving 51 px of "overlap"
  // with the footer that no user can see. One /focus and it reflows to 612x411, overlap 0.
  // Refusing here is what makes the number real; the caller focuses and retries.
  if (document.visibilityState !== 'visible') return JSON.stringify({ refuse: 'window is ' + document.visibilityState + ' - ResizeObserver is dead, every post-resize box is stale; refusing to record it' });
  var win = ${rootExpr(surface)};
  if (!win) return JSON.stringify({ refuse: 'surface not found: ' + ${JSON.stringify(surface)} });
  var R = win.getBoundingClientRect();
  if (!R.width || !R.height) return JSON.stringify({ refuse: 'surface is 0x0 (minimised or unmounted) - refusing to record zeros' });
  var body = win.querySelector('.fwin-body') || win;
  var B = body.getBoundingClientRect();

  var scrollableAncestor = function(el, axis){
    var n = el.parentElement;
    while (n && n !== win.parentElement) {
      var cs = getComputedStyle(n);
      var can = axis === 'x'
        ? /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1
        : /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1;
      if (can) return true;
      n = n.parentElement;
    }
    return false;
  };
  var pagerControls = function(root){
    return [].slice.call(root.querySelectorAll('[data-paged-control]')).filter(function(c){ return !c.disabled; }).length;
  };
  // A DECLARED pager is honoured only when an enabled control exists AND its grid arithmetically
  // covers its own buffer. Without both, "declare the attribute and the category cannot see you".
  var provenPager = function(n){
    if (n.getAttribute('data-paged') !== 'true') return false;
    if (pagerControls(win) < 1) return false;
    var pages = Number(n.getAttribute('data-paged-pages'));
    var step = Number(n.getAttribute('data-paged-step'));
    if (!isFinite(pages) || !isFinite(step) || pages < 1 || step <= 0) return false;
    return (pages - 1) * step + n.clientWidth >= n.scrollWidth - 2;
  };
  var pagerFor = function(e){
    var n = e;
    while (n && n !== win.parentElement && n !== win) {
      if (provenPager(n)) return n;
      n = n.parentElement;
    }
    return null;
  };
  // Project every rendered page fragment into the pager's one-page viewport. Range rects for
  // off-screen CSS columns remain available even while clipped; modulo the published step makes
  // page 1 and page N contribute to the same occupancy grid instead of scoring only the page the
  // user happened to leave visible. This is horizontal because the proven-pager contract itself
  // publishes clientWidth/scrollWidth and NovelReader pages on that axis in both writing modes.
  var pagerRect = function(r, pager){
    if (!pager) return r;
    var p = pager.getBoundingClientRect();
    var step = Number(pager.getAttribute('data-paged-step'));
    if (!(step > 0)) return r;
    if (r.width >= step - 2) return { left: p.left, right: p.right, top: r.top, bottom: r.bottom, width: p.width, height: r.height };
    var offset = ((r.left - p.left) % step + step) % step;
    var left = p.left + offset;
    return { left: left, right: Math.min(p.right, left + r.width), top: r.top, bottom: r.bottom, width: Math.min(r.width, p.right - left), height: r.height };
  };
  var outsideItsClipper = function(el, b){
    var n = el.parentElement;
    while (n && n !== win.parentElement && n !== win) {
      var cs = getComputedStyle(n);
      if (/^(hidden|clip|auto|scroll)$/.test(cs.overflowX) || /^(hidden|clip|auto|scroll)$/.test(cs.overflowY)) {
        if (provenPager(n)) return true;
        if (n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1) return false;
        var c = n.getBoundingClientRect();
        var ix = Math.min(b.right, c.right) - Math.max(b.left, c.left);
        var iy = Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top);
        return ix <= 0 || iy <= 0;
      }
      n = n.parentElement;
    }
    return false;
  };
  // CORRECTION 21. A DEV-ONLY OVERLAY IS NOT PART OF THE SURFACE. These harnesses walk the
  // RUNNING DEV APP, so anything behind an import.meta.env.DEV guard is on screen here and on no
  // user's machine. City's sky console accounted for every remaining category-4 failure it had
  // after corrections 19 and 20 - 2 clipped and 8 overlaps at 260x170, from a debug panel that
  // ReadingGardenSkyEvents returns null for in any packaged build.
  // It is an ATTRIBUTE the product sets next to its own guard, never a class list this file
  // knows about: a surface-specific exception is what RULE 1 forbids, and a harness that decided
  // for itself which panels look like debug tools would hide real inspectors. Everything it
  // removes is counted and named in devOnlyExcluded, so an audit can see what was taken out and
  // check the guard for itself. Adding the attribute to a shipping element to dodge a score
  // would show up there by name.
  var devOnlyExcluded = [];
  var isDevOnly = function(e){ return !!e.closest('[data-dev-only]'); };
  var painted = function(e){
    if (isDevOnly(e)) return false;
    return typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
      : true;
  };
  var name = function(e){ return e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]; };

  [].slice.call(win.querySelectorAll('[data-dev-only]')).forEach(function(e){
    devOnlyExcluded.push(name(e) + ' (+' + e.querySelectorAll('*').length + ' descendants)');
  });
  var all = [].slice.call(win.querySelectorAll('*')).filter(painted);
  var deadRegionPagers = all.filter(provenPager);

  // CORRECTION 20. AN AMBIENT ART PLATE IS NOT CLIPPING, AND TWO OF THEM STACKED ARE NOT AN
  // OVERLAP. City is a parallax scene: world-back, background-master, sky-events, life and
  // foreground-mask are DELIBERATELY larger than the window and DELIBERATELY on top of one
  // another, because a camera pans across them. Scored literally they read clipped 24 and
  // overlaps 397 in a 680x709 box - a surface that fails this category for being what it is.
  // cat2-clunkiness.cjs already carries exactly this exclusion for scroll traps (its correction
  // 5); this is the same judgement applied to the same art.
  //
  // The question is asked of the nearest OUT-OF-FLOW ANCESTOR-OR-SELF, not of the element, and
  // that ancestor has to be paint all the way down. City forced this: the clouds and the fog are
  // absolutely-positioned sprites holding a position: static canvas, so an element-only test
  // saw a static canvas, called it in flow, and still scored 7 clips and 215 overlaps of pure
  // parallax. Asking about the ancestor is also the SAFER rule, not the looser one - because the
  // ancestor contains the element, "no text in the ancestor" implies "no text in the element",
  // and a poster inside an absolutely-positioned card that has a title is NOT excused.
  //
  // Three parts, all of which must hold of that ancestor:
  //   1. out of flow (absolute/fixed)  - an in-flow panel, list, log or table still counts
  //   2. no interactive descendant     - a clipped menu carries buttons and still counts
  //   3. no text anywhere inside it    - a clipped paragraph, label or card title still counts
  // A decorative plate is paint. Nothing down there can be read and nothing can be acted on, so
  // there is no content to be denied. Excluded rows are REPORTED in artPlateClips /
  // artPlateOverlaps / artPlateOverflow, never silently dropped - the sibling harness's rule.
  var ACTIONABLE = 'button,a[href],input,select,textarea,[tabindex],[role="button"]';

  // "Contains no control" is the WRONG question and cat2 already worked out the right one: what
  // matters is whether anything a user could READ or ACT ON has been stranded outside the
  // surface. City's world layer holds the mushroom hitbox, which sits in the MIDDLE of the
  // visible scene - the layer is 909px wide in a 680px window and nothing is lost. Asking
  // "does it contain a button" failed it anyway. Asking the question of the control's own box
  // keeps the real case: at 260x170 that same hitbox IS outside the window, and this returns
  // true and City is correctly still marked. The instrument has to be able to say both.
  var strandCache = new WeakMap();
  var strandsContent = function(e){
    if (strandCache.has(e)) return strandCache.get(e);
    var v = (function(){
      var outside = function(b){
        if (b.width <= 0 || b.height <= 0) return false;
        return b.right > R.right + 1 || b.left < R.left - 1 || b.bottom > R.bottom + 1 || b.top < R.top - 1;
      };
      var acts = e.querySelectorAll(ACTIONABLE);
      for (var i2 = 0; i2 < acts.length; i2 += 1) {
        if (!painted(acts[i2])) continue;
        if (outside(acts[i2].getBoundingClientRect())) return true;
      }
      if (e.matches(ACTIONABLE) && outside(e.getBoundingClientRect())) return true;
      var tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      var t = tw.nextNode();
      while (t) {
        if (t.nodeValue && t.nodeValue.trim() && t.parentElement && painted(t.parentElement)) {
          var rg = document.createRange();
          rg.selectNodeContents(t);
          var rects = rg.getClientRects();
          for (var r2 = 0; r2 < rects.length; r2 += 1) if (outside(rects[r2])) return true;
        }
        t = tw.nextNode();
      }
      return false;
    })();
    strandCache.set(e, v);
    return v;
  };

  // Pure paint: no text and no control ANYWHERE inside. Only the overlap rule uses this - two
  // boxes on top of each other hide things from each other regardless of the surface edge, so
  // "outside R" is not the question there.
  var pureCache = new WeakMap();
  var purePaint = function(e){
    if (pureCache.has(e)) return pureCache.get(e);
    var v = (function(){
      if (e.matches(ACTIONABLE) || e.querySelector(ACTIONABLE)) return false;
      var tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      var t = tw.nextNode();
      while (t) { if (t.nodeValue && t.nodeValue.trim()) return false; t = tw.nextNode(); }
      return true;
    })();
    pureCache.set(e, v);
    return v;
  };

  var outOfFlowHost = function(e){
    var n = e;
    while (n && n !== win.parentElement) {
      var pos = getComputedStyle(n).position;
      if (pos === 'absolute' || pos === 'fixed') return n;
      if (n === win) return null;
      n = n.parentElement;
    }
    return null;
  };
  var plateCache = new WeakMap();
  var artPlate = function(e){
    if (plateCache.has(e)) return plateCache.get(e);
    var host = outOfFlowHost(e);
    var v = !!host && !strandsContent(host);
    plateCache.set(e, v);
    return v;
  };

  var artPlateClips = [];
  var clipped = all.filter(function(e){
    var b = e.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return false;
    if (outsideItsClipper(e, b)) return false;
    var outX = b.right > R.right + 1 || b.left < R.left - 1;
    var outY = b.bottom > R.bottom + 1 || b.top < R.top - 1;
    if (!((outX && !scrollableAncestor(e, 'x')) || (outY && !scrollableAncestor(e, 'y')))) return false;
    if (artPlate(e)) { artPlateClips.push(name(e)); return false; }
    return true;
  });

  var regions = [];
  var walk = function(el, d){
    if (d > 3) return;
    for (var i = 0; i < el.children.length; i += 1) {
      var c = el.children[i];
      var b = c.getBoundingClientRect();
      if (b.width < 8 || b.height < 8) continue;
      if (!painted(c)) continue;
      if (!c.matches('input,textarea,select,button,label,summary,a')
        && ((b.width * Math.min(b.height, R.height)) / (R.width * R.height)) * 100 >= 1) regions.push(c);
      walk(c, d + 1);
    }
  };
  walk(body, 0);
  // CORRECTION 15. A SHEET COVERING THE DOCUMENT IS THE PRIMITIVE'S CONTRACT, NOT A COLLISION.
  // Below its dock minimum a ReadingCanvas tool becomes a sheet - position: absolute, inset: 0,
  // 0.88-alpha background, z-index 2 - and the document keeps rendering underneath it, mounted,
  // exactly as liquidReadingCanvas.ts documents ("documentCovered"). Measured on the VN panel at
  // 222x103: 17 pairs, every one of them a sheet-side box against a doc-side box it is painted
  // over. Nothing collides; the loser is not painted at all. This fired only once the panel
  // stopped crushing its canvas to 0px, so it had been hidden behind a worse defect rather than
  // being absent. The exclusion is deliberately narrow - an element INSIDE an opaque full cover
  // never collides with anything OUTSIDE it, because everything outside is behind the cover at
  // the intersection - so a PARTIAL cover, the one outcome the canvas calls inexpressible,
  // still reports as an overlap.
  var alphaOf = function(color){
    if (!color || color === 'transparent') return 0;
    // Every backslash here is DOUBLED because this whole reader is a template literal: a lone
    // \\s in one is an escape the literal eats, and the regex ships matching the letter s.
    var slash = /\\/\\s*([0-9.]+)\\s*\\)/.exec(color);   // rgb(r g b / a), color(srgb r g b / a)
    if (slash) return parseFloat(slash[1]);
    var legacy = /rgba\\(\\s*[^)]*,\\s*([0-9.]+)\\s*\\)/.exec(color);
    if (legacy) return parseFloat(legacy[1]);
    return /^(rgb|color|#|[a-z]+$)/.test(color) ? 1 : 0;
  };
  var covers = regions.filter(function(e){
    var cs = getComputedStyle(e);
    if (!/^(absolute|fixed)$/.test(cs.position)) return false;
    if (alphaOf(cs.backgroundColor) < 0.5) return false;
    var p = e.parentElement;
    if (!p) return false;
    var re = e.getBoundingClientRect(), rp = p.getBoundingClientRect();
    return re.left <= rp.left + 1 && re.top <= rp.top + 1
      && re.right >= rp.right - 1 && re.bottom >= rp.bottom - 1;
  });
  var coverOf = function(e){
    for (var k = 0; k < covers.length; k += 1) {
      if (covers[k] === e || covers[k].contains(e)) return covers[k];
    }
    return null;
  };
  // CORRECTION 18. AN ELEMENT CLIPPED BY A SCROLLING ANCESTOR DOES NOT COLLIDE OUTSIDE IT.
  // Every region was paired by its RAW rect, so any pane taller (or wider) than the scroller
  // holding it reported a collision with whatever chrome sits past the scroller - pixels that
  // scroller never paints. Measured on Scraper maximized: div.scr-page is 4182px tall inside a
  // 598px main.scr-main (overflow: auto), so its raw rect ran straight through the 41px status
  // bar and the surface failed the overlaps bar on a box no user can see. Left uncorrected this
  // is not a Scraper quirk - it fires on EVERY surface whose scrolling pane holds more than one
  // screen of content, which is most of them. Corrections 2 and 15 in a third shape: a box that
  // exists where it is not painted. The clip is the intersection with every non-visible-overflow
  // ancestor up to the surface root, which is precisely the region that scroller does paint, so
  // a box genuinely escaping its container still reports.
  var visibleRect = function(el){
    var b = el.getBoundingClientRect();
    var l = b.left, t = b.top, r = b.right, bt = b.bottom;
    var n = el.parentElement;
    while (n) {
      var cs = getComputedStyle(n);
      var c = null;
      if (cs.overflowX !== 'visible') {
        c = n.getBoundingClientRect();
        l = Math.max(l, c.left); r = Math.min(r, c.right);
      }
      if (cs.overflowY !== 'visible') {
        c = c || n.getBoundingClientRect();
        t = Math.max(t, c.top); bt = Math.min(bt, c.bottom);
      }
      if (n === win) break;
      n = n.parentElement;
    }
    return { left: l, top: t, right: r, bottom: bt };
  };
  var overlaps = [];
  var artPlateOverlaps = [];
  for (var i = 0; i < regions.length; i += 1) {
    for (var j = i + 1; j < regions.length; j += 1) {
      var a = regions[i], b2 = regions[j];
      if (a.contains(b2) || b2.contains(a)) continue;
      if (coverOf(a) !== coverOf(b2)) continue;
      var ra = visibleRect(a), rb = visibleRect(b2);
      var ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      var oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox <= 4 || oy <= 4) continue;
      // CORRECTION 20, second half. Overlap is a different harm from clipping - two boxes hide
      // things from EACH OTHER, so the surface edge is not the question. Both sides must be out
      // of flow (two in-flow panels colliding is a real defect and still reported) and at least
      // one must be PURE PAINT with no text and no control anywhere in it. That is what a
      // positioned art stack is: the composition IS layers on top of layers. A dropdown over a
      // decorative backdrop is excused for the same honest reason; two real panels are not.
      if (outOfFlowHost(a) && outOfFlowHost(b2) && (purePaint(a) || purePaint(b2))) {
        artPlateOverlaps.push(name(a) + ' x ' + name(b2) + ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
        continue;
      }
      if (ox > 4 && oy > 4) overlaps.push(name(a) + ' x ' + name(b2) + ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
    }
  }

  // CORRECTION 13. A SINGLE-LINE TEXT FIELD IS NOT A LAYOUT OVERFLOW. An input or textarea whose
  // VALUE is longer than its box always reports scrollWidth > clientWidth - that is native caret
  // scrolling, not content pushed out of a container. Immersion's address bar read
  // input.immersion-url 210>184 at the window's own default size and failed the horizontal bar,
  // and every text field in the app with a long value would have done the same.
  // CORRECTION 20, third half. THE SAME JUDGEMENT APPLIES TO THE HORIZONTAL BAR. City's
  // main.reading-garden reports 947>678 under overflow-x hidden, and every single thing that
  // crosses its right edge is a parallax plate - the scene is wider than the window because a
  // camera pans it. Correction 3's rationale is that content pushed out of a hidden box has no
  // scrollbar to reach it; paint has nothing to reach. The question is asked of the DESCENDANTS
  // that actually cross the edge (cat2's correction 5 asks it the same way), and one non-plate
  // crossing is enough to keep the container on the list.
  var overflowIsAllPlates = function(e){
    var eb = e.getBoundingClientRect();
    var ecs = getComputedStyle(e);
    var edge = eb.left + e.clientWidth + parseFloat(ecs.borderLeftWidth || 0);
    var kids = e.querySelectorAll('*');
    var crossed = 0;
    for (var q = 0; q < kids.length; q += 1) {
      var kb = kids[q].getBoundingClientRect();
      if (kb.width <= 0 || kb.right <= edge + 1) continue;
      crossed += 1;
      if (!artPlate(kids[q])) return false;
    }
    return crossed > 0;
  };
  var artPlateOverflow = [];
  var nativeTextScroller = function(e){ return e.matches('input,textarea'); };
  var scrollers = all.filter(function(e){
    if (nativeTextScroller(e)) return false;
    var cs = getComputedStyle(e);
    if (!(/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1)) return false;
    if (overflowIsAllPlates(e)) { artPlateOverflow.push(name(e) + ' ' + e.scrollWidth + '>' + e.clientWidth + ' (scroller)'); return false; }
    return true;
  });
  var hiddenX = all.filter(function(e){
    if (nativeTextScroller(e)) return false; // correction 13, same reason as the scroller list
    var cs = getComputedStyle(e);
    if (!/^(hidden|clip)$/.test(cs.overflowX)) return false;
    if (e.scrollWidth <= e.clientWidth + 1) return false;
    if (e.clientWidth <= 1 && cs.position === 'absolute') return false;
    if (cs.textOverflow === 'ellipsis') return false;
    if (provenPager(e)) return false;
    if (overflowIsAllPlates(e)) { artPlateOverflow.push(name(e) + ' ' + e.scrollWidth + '>' + e.clientWidth + ' (hidden)'); return false; }
    return true;
  });

  var N = 40;
  var cw = B.width / N, ch = B.height / N;
  var covered = [];
  for (var y0 = 0; y0 < N; y0 += 1) { covered.push(new Array(N).fill(false)); }
  var mark = function(r, pager){
    r = pagerRect(r, pager);
    if (r.width < 1 || r.height < 1) return;
    var xa = Math.max(0, Math.floor((r.left - B.left) / cw));
    var xb = Math.min(N - 1, Math.ceil((r.right - B.left) / cw) - 1);
    var ya = Math.max(0, Math.floor((r.top - B.top) / ch));
    var yb = Math.min(N - 1, Math.ceil((r.bottom - B.top) / ch) - 1);
    for (var y = ya; y <= yb; y += 1) for (var x = xa; x <= xb; x += 1) covered[y][x] = true;
  };
  var tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  var t = tw.nextNode();
  while (t) {
    if (t.nodeValue && t.nodeValue.trim() && t.parentElement && painted(t.parentElement)) {
      var rg = document.createRange();
      rg.selectNodeContents(t);
      var rects = rg.getClientRects();
      for (var k = 0; k < rects.length; k += 1) mark(rects[k], pagerFor(t.parentElement));
    }
    t = tw.nextNode();
  }
  all.forEach(function(e){
    // iframe/webview/object/embed are correction 12, and they are correction 10 in a second shape:
    // an OPAQUE CONTENT HOST whose pixels live in another document (or another process) that this
    // pass cannot walk. Immersion's stage is a 950x619 webview.immersion-webview showing a live
    // page, and without this line every one of those pixels counted as dead space.
    if (e.matches('input,textarea,select,button,img,canvas,video,svg,iframe,webview,object,embed,[role="button"]')) return mark(e.getBoundingClientRect(), pagerFor(e));
    // CORRECTION 10. A CSS background-image PAINTS CONTENT and the element-tag list cannot see it.
    // Library's covers are div.cover with background-image: url(media://.../cover.jpeg) and no img
    // anywhere, so 24 cards of 180x240 cover art scored as DEAD SPACE and the category read
    // 15.9 pct against a 15 bar - a FAIL that would have sent someone to fix a grid that is full.
    // A url() is content; a bare gradient is decoration and stays uncounted, or every themed
    // panel would mark itself covered and the detector would never find real dead space again.
    var bi = getComputedStyle(e).backgroundImage;
    if (bi && bi.indexOf('url(') >= 0) mark(e.getBoundingClientRect(), pagerFor(e));
  });
  var best = 0, bestBox = null;
  var heights = new Array(N).fill(0);
  for (var y2 = 0; y2 < N; y2 += 1) {
    for (var x2 = 0; x2 < N; x2 += 1) heights[x2] = covered[y2][x2] ? 0 : heights[x2] + 1;
    var stack = [];
    for (var x3 = 0; x3 <= N; x3 += 1) {
      var h = x3 === N ? 0 : heights[x3];
      var start = x3;
      while (stack.length && stack[stack.length - 1][1] >= h) {
        var top = stack.pop();
        var area = top[1] * (x3 - top[0]);
        if (area > best) { best = area; bestBox = { w: x3 - top[0], h: top[1], x: top[0], y: y2 - top[1] + 1 }; }
        start = top[0];
      }
      stack.push([start, h]);
    }
  }
  var cellArea = cw * ch;

  var chromeSel = '.fwin-bar,nav,header,footer,aside,[role="toolbar"],[role="tablist"]';
  var clip = function(b){
    return Math.max(0, Math.min(b.right, R.right) - Math.max(b.left, R.left))
      * Math.max(0, Math.min(b.bottom, R.bottom) - Math.max(b.top, R.top));
  };
  // Ask the PARENT, never e.closest(sel): closest starts AT e, matches every hit, and deduped
  // nothing - that put Media's chrome at 62.1% by counting a nav inside its own sidebar.
  var outermost = [].slice.call(win.querySelectorAll(chromeSel)).filter(function(e){
    return painted(e) && (!e.parentElement || !e.parentElement.closest(chromeSel));
  });
  var chrome = outermost.reduce(function(s, e){ return s + clip(e.getBoundingClientRect()); }, 0);
  var total = R.width * R.height;
  // CORRECTION 17. The regions list still proves the reader traversed real rendered content, but its
  // deepest leaf is not a stable content-to-chrome denominator: responsive wrapping changes which
  // unrelated leaf wins. The clipped work viewport is the content area the window gives back as
  // chrome falls, and works unchanged for framed and chromeless surfaces.
  var dominant = clip(B);

  return JSON.stringify({
    box: Math.round(R.width) + 'x' + Math.round(R.height),
    viewport: window.innerWidth + 'x' + window.innerHeight,
    maximized: win.classList.contains('fwin-max'),
    regions: regions.length,
    clipped: clipped.length,
    clippedList: clipped.slice(0, 6).map(name),
    overlaps: overlaps.length,
    overlapList: overlaps.slice(0, 6),
    // CORRECTION 20: reported, never dropped. A reader must be able to see what was excused.
    artPlateClipCount: artPlateClips.length,
    artPlateClips: artPlateClips.slice(0, 8),
    // The truncated list above is for a reader. The control needs the WHOLE list, and its plant
    // is not in the first 8 on a surface with 20 plates - which read as the exclusion not firing.
    artPlateClipsHasControlPlant: artPlateClips.some(function(n){ return String(n).indexOf('lqcat4-plate-control') !== -1; }),
    artPlateOverlapCount: artPlateOverlaps.length,
    artPlateOverlaps: artPlateOverlaps.slice(0, 6),
    artPlateOverflowCount: artPlateOverflow.length,
    artPlateOverflow: artPlateOverflow.slice(0, 6),
    devOnlyExcludedCount: devOnlyExcluded.length,
    devOnlyExcluded: devOnlyExcluded.slice(0, 6),
    horizontalScrollers: scrollers.length,
    horizontalScrollerList: scrollers.slice(0, 4).map(function(e){ return name(e) + ' ' + e.scrollWidth + '>' + e.clientWidth; }),
    hiddenOverflowX: hiddenX.length,
    hiddenOverflowXList: hiddenX.slice(0, 6).map(function(e){ return name(e) + ' ' + e.scrollWidth + '>' + e.clientWidth; }),
    deadRegionPctOfWindow: Number(((best * cellArea) / (R.width * R.height) * 100).toFixed(1)),
    deadRegionPctOfViewport: Number(((best * cellArea) / (window.innerWidth * window.innerHeight) * 100).toFixed(1)),
    deadRegionBox: bestBox ? Math.round(bestBox.w * cw) + 'x' + Math.round(bestBox.h * ch) + ' at grid ' + bestBox.x + ',' + bestBox.y : null,
    deadRegionBasis: deadRegionPagers.length
      ? 'union of rendered fragments across ' + deadRegionPagers.map(function(p){ return p.getAttribute('data-paged-pages'); }).join(',') + '-page proven pager buffer(s)'
      : 'visible surface',
    chromePct: Number((chrome / total * 100).toFixed(1)),
    chromeParts: outermost.map(name),
    dominantCanvasPct: Number((dominant / total * 100).toFixed(1))
  });
})()`;

/** The `.fwin` levers. A root surface has neither, and says so rather than faking one. */
const FWIN_STYLE_READ = (surface) => `(function(){
  var w = ${hostExpr(surface)};
  if (!w) return JSON.stringify({ refuse: 'surface not found' });
  return JSON.stringify({ style: w.getAttribute('style'), max: w.classList.contains('fwin-max') });
})()`;

const FWIN_SET_SIZE = (surface, w, h) => `(function(){
  var el = ${hostExpr(surface)};
  if (!el) return JSON.stringify({ refuse: 'surface not found' });
  el.style.width = ${JSON.stringify(`${w}px`)};
  el.style.height = ${JSON.stringify(`${h}px`)};
  var r = el.getBoundingClientRect();
  return JSON.stringify({ box: Math.round(r.width) + 'x' + Math.round(r.height) });
})()`;

const FWIN_RESTORE_STYLE = (surface, style) => `(function(){
  var el = ${hostExpr(surface)};
  if (!el) return JSON.stringify({ refuse: 'surface not found' });
  ${style === null ? 'el.removeAttribute("style")' : `el.setAttribute('style', ${JSON.stringify(style)})`};
  return JSON.stringify({ style: el.getAttribute('style') });
})()`;

// Maximize goes through the product's own button: `.fwin-max` changes the applied CSS, so an
// inline width would measure a size the product never paints.
const FWIN_MAX_CLICK = (surface) => `(function(){
  var w = ${hostExpr(surface)};
  if (!w) return JSON.stringify({ refuse: 'surface not found' });
  var b = [].slice.call(w.querySelectorAll('.fwin-btns .fwin-b')).filter(function(x){
    return x.getAttribute('title') === 'Maximize';
  })[0];
  if (!b) {
    // CORRECTION 19, first half. The REASON a maximize is unavailable decides whether the
    // missing leg is a defect or a product fact, so it is measured here rather than inferred
    // from the refusal string by the caller.
    //
    // THE PROOF MUST SCAN THE WHOLE WINDOW, NOT .fwin-btns. A frameless window puts its chrome
    // in .fwin-frameless-controls, so the first version of this check counted 0 buttons for
    // City and would have counted 0 for ANY window whose controls live elsewhere - an
    // exoneration that proves nothing. City actually carries three (Pop out, Minimize, Close)
    // and deliberately no Maximize: DesktopShell forces max: false for section 'city' in two
    // places. So the honest test is "frameless AND its own chrome offers no Maximize", with the
    // titles reported so a reader can check the claim rather than trust it. A FRAMED window
    // missing only this one button is a different thing and still fails.
    var chrome = [].slice.call(w.querySelectorAll('.fwin-b'));
    var titles = chrome.map(function(x){ return x.getAttribute('title'); });
    return JSON.stringify({
      refuse: 'no Maximize button - refusing to fake it with an inline width',
      noMaximizeAffordance: w.classList.contains('fwin-frameless')
        && titles.indexOf('Maximize') === -1,
      chromeButtons: chrome.length,
      chromeButtonTitles: titles,
      frameless: w.classList.contains('fwin-frameless'),
    });
  }
  var was = w.classList.contains('fwin-max');
  b.click();
  return JSON.stringify({ wasMaximized: was });
})()`;

const CONTROL_INJECT = (surface) => `(function(){
  var win = ${rootExpr(surface)};
  if (!win) return JSON.stringify({ refuse: 'surface not found' });
  var R = win.getBoundingClientRect();
  if (!R.width || !R.height) return JSON.stringify({ refuse: 'surface is 0x0' });
  var body = win.querySelector('.fwin-body') || win;
  // CORRECTION 11. THE CONTROL MUST BE PLACED IN THE CLIPPER'S OWN COORDINATE SPACE, not the
  // viewport's. Every .fwin carries contain: content, which includes contain: layout and
  // therefore makes the WINDOW the containing block for position:fixed descendants. A fixed box
  // written at viewport x = R.right - 20 landed at fwinLeft + (R.right - 20) - measured 197 px off
  // on Immersion, whose frame starts at left: 196 - i.e. entirely OUTSIDE .fwin-body. The reader's
  // own outsideItsClipper then correctly declined to call it clipped, so the control silently
  // did not fire and both Reading Finder and Immersion came back VOID rather than scored.
  // Absolute-in-body puts it exactly where the header always claimed: 20 px inside the right
  // edge, 300 px wide, so 280 px hang out and it must satisfy the reader's definition.
  var cbPos = getComputedStyle(body).position;
  var restorePos = cbPos === 'static' ? body.style.position : null;
  if (cbPos === 'static') body.style.position = 'relative';
  var p = document.createElement('div');
  p.id = '__lqcat4_clip';
  if (restorePos !== null) p.setAttribute('data-restore-pos', restorePos);
  p.style.cssText = 'position:absolute;left:' + (body.clientWidth - 20) + 'px;top:120px;width:300px;height:60px;background:#f0f;z-index:9;';
  // CORRECTION 20 makes this text load-bearing, not decoration. The plate exclusion excuses an
  // out-of-flow box with no text and no control, which is exactly what this plant used to be -
  // it would have been excused along with City's parallax and the control would have silently
  // stopped firing. Real content stranded outside the frame is what the bar is about, so the
  // plant now IS real content and the exclusion must decline to cover it.
  p.textContent = 'lq control: stranded content';
  body.appendChild(p);
  var pb = p.getBoundingClientRect();
  return JSON.stringify({
    injected: true,
    placedIn: body === win ? 'the surface itself (root)' : 'div.fwin-body',
    probeRightEdge: Math.round(pb.right),
    frameRightEdge: Math.round(R.right),
    hangsOutBy: Math.round(pb.right - R.right)
  });
})()`;

/*
 * CORRECTION 20's OWN CONTROL, and it runs in the direction the exclusion could go wrong.
 * `injectedClip` proves the reader still SEES real content stranded outside the frame. This one
 * proves the exclusion is doing something rather than nothing: the same box, at the same place,
 * hanging out by the same amount — but empty, out of flow and holding no control, i.e. a plate.
 * `clipped` must NOT rise, and the box must appear by name in `artPlateClips`. If a future edit
 * narrows the test to a no-op, this leg fails and says so; if a future edit widens it into a
 * blanket amnesty, the `injectedClip` leg above fails instead. Neither can drift unnoticed.
 */
const PLATE_CONTROL_INJECT = (surface) => `(function(){
  var win = ${rootExpr(surface)};
  if (!win) return JSON.stringify({ refuse: 'surface not found' });
  var R = win.getBoundingClientRect();
  if (!R.width || !R.height) return JSON.stringify({ refuse: 'surface is 0x0' });
  var body = win.querySelector('.fwin-body') || win;
  var cbPos = getComputedStyle(body).position;
  var restorePos = cbPos === 'static' ? body.style.position : null;
  if (cbPos === 'static') body.style.position = 'relative';
  var p = document.createElement('div');
  p.id = '__lqcat4_plate';
  p.className = 'lqcat4-plate-control';
  if (restorePos !== null) p.setAttribute('data-restore-pos', restorePos);
  p.style.cssText = 'position:absolute;left:' + (body.clientWidth - 20) + 'px;top:200px;width:300px;height:60px;background:linear-gradient(#0ff,#00f);z-index:9;';
  body.appendChild(p);
  var pb = p.getBoundingClientRect();
  return JSON.stringify({
    injected: true,
    hangsOutBy: Math.round(pb.right - R.right),
    hasText: !!(p.textContent || '').trim(),
    hasControl: !!p.querySelector('button,a[href],input,select,textarea,[tabindex],[role="button"]')
  });
})()`;

const PLATE_CONTROL_REMOVE = `(function(){
  var p = document.getElementById('__lqcat4_plate');
  if (p && p.hasAttribute('data-restore-pos')) {
    var host = p.parentElement;
    var was = p.getAttribute('data-restore-pos');
    if (host) { if (was) host.style.position = was; else host.style.removeProperty('position'); }
  }
  if (p) p.remove();
  return JSON.stringify({ removed: true, stillPresent: !!document.getElementById('__lqcat4_plate') });
})()`;

const CONTROL_REMOVE = `(function(){
  var p = document.getElementById('__lqcat4_clip');
  // Correction 6 applies to the position it may have had to set as well as to the node: an
  // inline position: relative left on .fwin-body is a control left in the DOM by another name.
  if (p && p.hasAttribute('data-restore-pos')) {
    var host = p.parentElement;
    var was = p.getAttribute('data-restore-pos');
    if (host) { if (was) host.style.position = was; else host.style.removeProperty('position'); }
  }
  if (p) p.remove();
  return JSON.stringify({ removed: !!p, stillPresent: !!document.getElementById('__lqcat4_clip') });
})()`;

const PAGER_PROOF_INVALIDATE = (surface) => `(function(){
  var win = ${rootExpr(surface)};
  if (!win) return JSON.stringify({ applicable: false, reason: 'surface not found' });
  var enabled = [].slice.call(win.querySelectorAll('[data-paged-control]')).filter(function(b){
    return !b.disabled && b.getAttribute('aria-disabled') !== 'true';
  }).length;
  var pager = [].slice.call(win.querySelectorAll('[data-paged="true"]')).filter(function(n){
    var pages = Number(n.getAttribute('data-paged-pages'));
    var step = Number(n.getAttribute('data-paged-step'));
    var proven = enabled > 0 && pages > 1 && step > 0
      && (pages - 1) * step + n.clientWidth >= n.scrollWidth - 2;
    var last = proven && Math.abs(n.scrollLeft) >= (pages - 1) * step - 2;
    return last;
  })[0];
  if (!pager) return JSON.stringify({ applicable: false, reason: 'no proven pager on its last page' });
  pager.setAttribute('data-lq-dead-pages', pager.getAttribute('data-paged-pages'));
  pager.setAttribute('data-paged-pages', '1');
  return JSON.stringify({ applicable: true });
})()`;

const PAGER_PROOF_RESTORE = `(function(){
  var pager = document.querySelector('[data-lq-dead-pages]');
  if (!pager) return JSON.stringify({ restored: false, reason: 'control marker missing' });
  pager.setAttribute('data-paged-pages', pager.getAttribute('data-lq-dead-pages'));
  pager.removeAttribute('data-lq-dead-pages');
  return JSON.stringify({ restored: true, pages: pager.getAttribute('data-paged-pages') });
})()`;

/* ----------------------------------------------------------------- the drive */

/**
 * Every measurement goes through here, and the focus is not a courtesy — see correction 8. The
 * window is raised, given a settle for the ResizeObserver its own reflow depends on, and only then
 * read. A refusal that still says "hidden" after the retry is reported as a refusal rather than
 * quietly becoming a number, because a stale box scores as CLEAN as easily as it scores as broken:
 * this surface produced both a false PASS and a false FAIL from the same geometry before this
 * existed.
 */
let visibleAtEveryRead = true;
async function read() {
  await post('/focus', {});
  await sleep(SETTLE);
  let r = JSON.parse(await ev(READ(SURFACE)));
  if (r.refuse && /is hidden|is prerender/.test(r.refuse)) {
    await post('/focus', {});
    await sleep(SETTLE * 2);
    r = JSON.parse(await ev(READ(SURFACE)));
    if (r.refuse) visibleAtEveryRead = false;
  }
  return r;
}

/**
 * Drives one non-default size, measures it, and puts the surface back. Every leg reports the
 * mechanism it used and whether the restore was byte-identical — a size measured without a proven
 * restore is a measurement that damaged the thing it measured.
 */
async function atSize(kind) {
  if (IS_ROOT) {
    // The OS window is the surface's frame. `/bounds` reports the previous CONTENT size, which is
    // exactly what the restore needs — reading it back from the frame bounds would add the border.
    const target = kind === 'maximized'
      ? null
      : parseSize(kind === 'compact' ? COMPACT : SUBMIN);
    let before;
    let after;
    if (kind === 'maximized') {
      // There is no OS maximize on this route, so "maximized" for a root surface is the largest
      // content size the display offers. Stated, not implied.
      const health = await post('/health', {});
      const win = (health.windows || []).find((w) => w.visible && !w.minimized) || (health.windows || [])[0];
      const grown = { w: Math.max(win.bounds.width, 1600), h: Math.max(win.bounds.height, 1000) };
      before = await post('/bounds', { width: grown.w, height: grown.h });
      await sleep(SETTLE);
      after = await read();
      await post('/bounds', { width: before.previous.width, height: before.previous.height });
    } else {
      before = await post('/bounds', { width: target.w, height: target.h });
      await sleep(SETTLE);
      after = await read();
      await post('/bounds', { width: before.previous.width, height: before.previous.height });
    }
    await sleep(SETTLE);
    const back = await post('/bounds', {});
    // The desktop window has a HARD MINIMUM — asking for 380 has been measured to yield 924
    // (`debug/lq-cat4-sizes.cjs` header). Reporting only what was ASKED for would label a
    // 924-wide measurement "compact 260x170", which is the false number this category is most
    // exposed to. `achieved` is what `/bounds` measured back, and `clampedByOsMinimum` says so
    // out loud so nobody has to compare two fields to notice.
    const achieved = before.contentSize || { width: null, height: null };
    return {
      kind,
      sizeMechanism: 'bridge /bounds on the OS window (root surface: no frame, no Maximize button)',
      requested: kind === 'maximized' ? 'display-max' : `${target.w}x${target.h}`,
      achieved: `${achieved.width}x${achieved.height}`,
      clampedByOsMinimum: kind !== 'maximized' && !!target
        && (achieved.width > target.w || achieved.height > target.h),
      measurement: after,
      restored: back.contentSize.width === before.previous.width && back.contentSize.height === before.previous.height,
      restoredTo: `${back.contentSize.width}x${back.contentSize.height}`,
      restoredFrom: `${before.previous.width}x${before.previous.height}`,
    };
  }

  const was = JSON.parse(await ev(FWIN_STYLE_READ(SURFACE)));
  if (was.refuse) return { kind, refuse: was.refuse };

  if (kind === 'maximized') {
    const click = JSON.parse(await ev(FWIN_MAX_CLICK(SURFACE)));
    if (click.refuse) {
      return {
        kind,
        refuse: click.refuse,
        noMaximizeAffordance: click.noMaximizeAffordance === true,
        chromeButtons: click.chromeButtons,
        chromeButtonTitles: click.chromeButtonTitles || null,
        frameless: click.frameless,
      };
    }
    await sleep(SETTLE);
    const m = await read();
    await ev(FWIN_MAX_CLICK(SURFACE));
    await sleep(SETTLE);
    const back = JSON.parse(await ev(FWIN_STYLE_READ(SURFACE)));
    return {
      kind,
      sizeMechanism: 'the product\'s own .fwin-b[title="Maximize"] (never an inline width: .fwin-max changes the applied CSS)',
      measurement: m,
      // The product stores the pre-maximize box and restores from it, so this is its round trip,
      // not the harness's. CORRECTION 9: z-index legitimately moves because restoring a window
      // RAISES it - Library came back to an identical box at z 532 against 446 and the whole
      // category scored FAIL on it. The header always said this; the comparison did not. Geometry
      // is compared, the stacking order is reported beside it.
      restored: geomOnly(back.style) === geomOnly(was.style) && back.max === was.max,
      zIndexMoved: zOf(was.style) !== zOf(back.style) ? `${zOf(was.style)} -> ${zOf(back.style)} (raised by the restore, not a geometry change)` : false,
      restoredTo: back.style,
      restoredFrom: was.style,
    };
  }

  const target = parseSize(kind === 'compact' ? COMPACT : SUBMIN);
  const set = JSON.parse(await ev(FWIN_SET_SIZE(SURFACE, target.w, target.h)));
  if (set.refuse) return { kind, refuse: set.refuse };
  await sleep(SETTLE);
  const m = await read();
  await ev(FWIN_RESTORE_STYLE(SURFACE, was.style));
  await sleep(SETTLE);
  const back = JSON.parse(await ev(FWIN_STYLE_READ(SURFACE)));
  return {
    kind,
    sizeMechanism: 'inline style.width/height on the .fwin (synchronous, so measure-and-restore is safe)',
    requested: `${target.w}x${target.h}`,
    measurement: m,
    restored: back.style === was.style,
    restoredTo: back.style,
    restoredFrom: was.style,
  };
}

// A `.fwin`'s inline style carries its stacking order alongside its box. Only the box is the
// round trip this harness asserts - see correction 9 at the maximize leg.
const geomOnly = (style) => String(style || '').replace(/z-index:[^;]*;?/g, '').replace(/\s+/g, ' ').trim();
const zOf = (style) => { const m = /z-index:\s*([^;]+)/.exec(String(style || '')); return m ? m[1].trim() : null; };

const BARS_OF = (m) => ({
  clipped: m.clipped === 0,
  overlaps: m.overlaps === 0,
  horizontal: m.horizontalScrollers === 0 && m.hiddenOverflowX === 0,
  deadRegion: m.deadRegionPctOfViewport <= 15,
});

(async () => {
  const base = await read();
  if (base.refuse) { console.error(`REFUSE - ${base.refuse}`); process.exit(2); }

  // CORRECTION 14. Which lever this surface needs is a DOM fact, not a fact about the argument's
  // first character. A `@`-rooted section that lives inside a `.fwin` gets the frame's levers;
  // only a surface with no `.fwin` above it is the desktop window and gets `/bounds`.
  const host = JSON.parse(await ev(`JSON.stringify({ inFwin: !!${hostExpr(SURFACE)} })`));
  IS_ROOT = !host.inFwin;

  const compact = await atSize('compact');
  const maximized = await atSize('maximized');

  const legs = [
    { kind: 'default', sizeMechanism: 'as found', measurement: base, restored: true },
    compact,
    maximized,
  ];
  const refused = legs.filter((l) => l.refuse || (l.measurement && l.measurement.refuse));
  const sized = legs.filter((l) => l.measurement && !l.measurement.refuse);

  const perSize = sized.map((l) => ({
    kind: l.kind,
    box: l.measurement.box,
    clipped: l.measurement.clipped,
    overlaps: l.measurement.overlaps,
    horizontalScrollers: l.measurement.horizontalScrollers,
    hiddenOverflowX: l.measurement.hiddenOverflowX,
    deadPctViewport: l.measurement.deadRegionPctOfViewport,
    deadRegionBasis: l.measurement.deadRegionBasis,
    chromePct: l.measurement.chromePct,
    dominantCanvasPct: l.measurement.dominantCanvasPct,
    bars: BARS_OF(l.measurement),
    restored: l.restored,
  }));

  /*
   * CORRECTION 19, second half. A FRAMELESS WINDOW HAS NO THIRD SIZE, AND THAT IS THE PRODUCT,
   * NOT THE SURFACE FAILING. City is `.fwin-frameless`: it carries no `.fwin-btns` at all, so
   * there is no state in which the app paints it maximized. Demanding the leg anyway scored it
   * `allThreeSizes false` + `restored false` — two of its five failed bars — for having a shape
   * the harness was not written against. That is the instrument, and it is the same class of
   * error as scoring City's parallax art as breakage.
   *
   * The exoneration is NARROW on purpose, and it is proved rather than assumed: the maximize leg
   * reports `noMaximizeAffordance` only when the host really is `fwin-frameless` AND really has
   * zero chrome buttons. A FRAMED window missing only its Maximize button refuses exactly as
   * before and still fails — that is a defect, and this must not launder it. `sizesExpected` and
   * `sizesUnreachable` are both in the output so the count can never be read as three.
   */
  const productHasNoMaximize = legs.some((l) => l.refuse && l.noMaximizeAffordance === true);
  const sizesExpected = productHasNoMaximize ? 2 : 3;
  const ranLegs = legs.filter((l) => !l.refuse);

  // §4.1 asks for content growing into extra space RATHER THAN chrome. That is a comparison
  // between two sizes, not a level at one, so it is UNMEASURED unless both ends exist. On a
  // surface with no maximize, compact -> default is the same question asked of the two sizes the
  // product actually has: the box grows 260x170 -> its own default and chrome must not take the
  // gain. The pair used is always named in `contentGrowsNotChromePair`, so a reader never has to
  // guess which two numbers were compared.
  const dflt = perSize.find((p) => p.kind === 'default');
  const maxi = perSize.find((p) => p.kind === 'maximized');
  const cmpt = perSize.find((p) => p.kind === 'compact');
  const growth = maxi && dflt
    ? { small: dflt, large: maxi, pair: 'default -> maximized' }
    : (productHasNoMaximize && cmpt && dflt ? { small: cmpt, large: dflt, pair: 'compact -> default (no maximize affordance on this window)' } : null);
  const contentGrowsNotChrome = growth
    ? (growth.large.chromePct <= growth.small.chromePct && growth.large.dominantCanvasPct >= growth.small.dominantCanvasPct)
    : 'UNMEASURED';

  const bars = {
    clipped: sized.length === 0 ? 'UNMEASURED' : perSize.every((p) => p.bars.clipped),
    overlaps: sized.length === 0 ? 'UNMEASURED' : perSize.every((p) => p.bars.overlaps),
    horizontal: sized.length === 0 ? 'UNMEASURED' : perSize.every((p) => p.bars.horizontal),
    deadRegion: sized.length === 0 ? 'UNMEASURED' : perSize.every((p) => p.bars.deadRegion),
    contentGrowsNotChrome,
    allThreeSizes: sized.length === sizesExpected,
    restored: ranLegs.length > 0 && ranLegs.every((l) => l.restored === true),
  };
  const unmeasured = Object.entries(bars).filter(([, v]) => typeof v === 'string').map(([k]) => k);
  const failed = Object.entries(bars).filter(([, v]) => v === false).map(([k]) => k);
  const pass = failed.length === 0 && unmeasured.length === 0;

  const out = {
    label: LABEL,
    surface: SURFACE,
    win: WIN || '(focused)',
    rootKind: IS_ROOT
      ? 'desktop-window surface (no .fwin above it)'
      : (SURFACE.startsWith('@') ? 'section inside a floating window' : 'floating window'),
    viewport: base.viewport,
    sizes: perSize,
    refusedLegs: refused.map((l) => ({
      kind: l.kind,
      refuse: l.refuse || l.measurement.refuse,
      // CORRECTION 19: whether this refusal was exonerated, and on what evidence.
      noMaximizeAffordance: l.noMaximizeAffordance === true,
      chromeButtons: l.chromeButtons === undefined ? null : l.chromeButtons,
      chromeButtonTitles: l.chromeButtonTitles || null,
      frameless: l.frameless === undefined ? null : l.frameless,
    })),
    sizesExpected,
    sizesRan: sized.length,
    sizesUnreachable: productHasNoMaximize
      ? ['maximized - this window is .fwin-frameless and its own chrome offers no Maximize, so the product never paints it maximized (titles reported under refusedLegs)']
      : [],
    contentGrowsNotChromePair: growth ? growth.pair : null,
    detail: legs.map((l) => ({
      kind: l.kind,
      sizeMechanism: l.sizeMechanism,
      requested: l.requested || null,
      achieved: l.achieved || null,
      clampedByOsMinimum: l.clampedByOsMinimum === undefined ? null : l.clampedByOsMinimum,
      restoredFrom: l.restoredFrom || null,
      restoredTo: l.restoredTo || null,
      clippedList: l.measurement && l.measurement.clippedList,
      overlapList: l.measurement && l.measurement.overlapList,
      horizontalScrollerList: l.measurement && l.measurement.horizontalScrollerList,
      hiddenOverflowXList: l.measurement && l.measurement.hiddenOverflowXList,
      deadRegionBox: l.measurement && l.measurement.deadRegionBox,
      deadRegionBasis: l.measurement && l.measurement.deadRegionBasis,
      chromeParts: l.measurement && l.measurement.chromeParts,
      artPlateClipCount: l.measurement && l.measurement.artPlateClipCount,
      artPlateClips: l.measurement && l.measurement.artPlateClips,
      artPlateOverlapCount: l.measurement && l.measurement.artPlateOverlapCount,
      artPlateOverlaps: l.measurement && l.measurement.artPlateOverlaps,
      artPlateOverflowCount: l.measurement && l.measurement.artPlateOverflowCount,
      artPlateOverflow: l.measurement && l.measurement.artPlateOverflow,
      devOnlyExcludedCount: l.measurement && l.measurement.devOnlyExcludedCount,
      devOnlyExcluded: l.measurement && l.measurement.devOnlyExcluded,
    })),
    bars,
    verdict: pass
      ? 'PASS 10/10'
      : (failed.length === 0
        ? `UNMEASURED - ${unmeasured.join(',')}; measure the missing size or score 0, never 10`
        : 'FAIL'),
    failedBars: failed,
    unmeasuredBars: unmeasured,
    visibleAtEveryRead,
    notMeasuredHere: [
      'contrast and focus order (rubric category 1 harness)',
      'input cost and dead ends (rubric category 2 harness)',
    ],
  };

  if (CONTROL) {
    const inj = JSON.parse(await ev(CONTROL_INJECT(SURFACE)));
    if (inj.refuse) { console.error(`REFUSE - control: ${inj.refuse}`); process.exit(2); }
    await sleep(SETTLE);
    const dirty = await read();
    const rm = JSON.parse(await ev(CONTROL_REMOVE));
    await sleep(SETTLE);
    const restored = await read();
    const pagerMutation = JSON.parse(await ev(PAGER_PROOF_INVALIDATE(SURFACE)));
    let pagerDirty = null;
    let pagerRestored = null;
    let pagerRestore = null;
    if (pagerMutation.applicable) {
      await sleep(SETTLE);
      pagerDirty = await read();
      pagerRestore = JSON.parse(await ev(PAGER_PROOF_RESTORE));
      await sleep(SETTLE);
      pagerRestored = await read();
    }
    // CORRECTION 20's control, run in its own inject/measure/remove cycle so it can never be
    // confused with the one above: this box must be EXCUSED where that one must be caught.
    const plateInj = JSON.parse(await ev(PLATE_CONTROL_INJECT(SURFACE)));
    let plateDirty = null;
    let plateRm = null;
    let plateRestored = null;
    if (!plateInj.refuse) {
      await sleep(SETTLE);
      plateDirty = await read();
      plateRm = JSON.parse(await ev(PLATE_CONTROL_REMOVE));
      await sleep(SETTLE);
      plateRestored = await read();
    }

    const submin = await atSize('submin');
    const moved = !dirty.refuse && dirty.clipped > base.clipped;
    const backToBaseline = !restored.refuse && restored.clipped === base.clipped;
    out.control = {
      injectedClip: {
        moved,
        backToBaseline,
        clipped: { base: base.clipped, dirty: dirty.refuse ? dirty.refuse : dirty.clipped, restored: restored.refuse ? restored.refuse : restored.clipped },
        removalProven: rm.removed === true && rm.stillPresent === false,
      },
      artPlateExclusion: plateInj.refuse ? { refuse: plateInj.refuse } : {
        // The plant hangs out of the frame by the same amount as the injectedClip plant and is
        // out of flow with no text and no control — a plate by the reader's own three-part test.
        hangsOutBy: plateInj.hangsOutBy,
        plantIsPlate: plateInj.hasText === false && plateInj.hasControl === false,
        clippedDidNotRise: !plateDirty.refuse && plateDirty.clipped === base.clipped,
        countedAsPlate: !plateDirty.refuse && plateDirty.artPlateClipCount > base.artPlateClipCount,
        namedInArtPlateClips: !plateDirty.refuse && plateDirty.artPlateClipsHasControlPlant === true,
        clipped: {
          base: base.clipped,
          dirty: plateDirty.refuse ? plateDirty.refuse : plateDirty.clipped,
          restored: plateRestored.refuse ? plateRestored.refuse : plateRestored.clipped,
        },
        artPlateClipCount: {
          base: base.artPlateClipCount,
          dirty: plateDirty.refuse ? plateDirty.refuse : plateDirty.artPlateClipCount,
          restored: plateRestored.refuse ? plateRestored.refuse : plateRestored.artPlateClipCount,
        },
        removalProven: plateRm && plateRm.removed === true && plateRm.stillPresent === false,
      },
      provenPagerDeadRegion: pagerMutation.applicable ? {
        applicable: true,
        proofFalsifiedMovesNumber: pagerDirty.deadRegionPctOfViewport > pagerRestored.deadRegionPctOfViewport,
        backToBaseline: pagerRestored.deadRegionPctOfViewport === base.deadRegionPctOfViewport,
        deadPctViewport: {
          base: base.deadRegionPctOfViewport,
          proofFalsified: pagerDirty.deadRegionPctOfViewport,
          restored: pagerRestored.deadRegionPctOfViewport,
        },
        restorationProven: pagerRestore && pagerRestore.restored === true,
      } : { applicable: false, reason: pagerMutation.reason },
      // Reported, not required — see the header. A clamped surface correctly stops failing here.
      subMinimumShrink: submin.refuse ? { refuse: submin.refuse } : {
        requested: submin.requested,
        box: submin.measurement.box,
        clipped: submin.measurement.clipped,
        overlaps: submin.measurement.overlaps,
        horizontalScrollers: submin.measurement.horizontalScrollers,
        hiddenOverflowX: submin.measurement.hiddenOverflowX,
        restored: submin.restored,
      },
    };
    if (!moved || !backToBaseline || rm.stillPresent === true) {
      out.verdict = 'VOID - negative control did not falsify';
    }
    if (pagerMutation.applicable && (
      !(pagerDirty.deadRegionPctOfViewport > pagerRestored.deadRegionPctOfViewport)
      || pagerRestored.deadRegionPctOfViewport !== base.deadRegionPctOfViewport
      || !pagerRestore || pagerRestore.restored !== true
    )) {
      out.verdict = 'VOID - proven-pager control did not falsify and restore dead-region occupancy';
    }
    if (!submin.refuse && submin.restored !== true) {
      out.verdict = 'VOID - the sub-minimum leg did not restore the surface';
    }
  }

  const text = JSON.stringify(out, null, 2);
  if (OUT) fs.writeFileSync(OUT, text);
  console.log(text);
  // 0 pass, 1 a real failure, 2 refuse, 3 unmeasured/void.
  process.exit(out.verdict.startsWith('PASS') ? 0 : (out.verdict.startsWith('FAIL') ? 1 : (out.verdict.startsWith('REFUSE') ? 2 : 3)));
})().catch((e) => { console.error(String(e && e.message ? e.message : e)); process.exit(4); });
