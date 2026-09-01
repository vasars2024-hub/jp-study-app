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
 *     [--compact 260x170] [--settle 500] [--zoom 2.0] [--ui-request "bigger text"]
 *
 * `--zoom` and `--ui-request` are L11 bullet 2's zoom and text-scaling clauses: a global CONDITION
 * the whole existing sweep runs under, applied and restored through the product's own code. See
 * correction 25.
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

/**
 * CORRECTION 25. ZOOM AND TEXT SCALING ARE A CONDITION TO RUN THE EXISTING SWEEP UNDER, NOT A
 * NEW PROBE. L11 bullet 2 names both by name, and neither is browser zoom or OS DPI:
 *   --zoom <factor>        `src/renderer/appZoom.ts`. Scales `#root` with CSS `zoom` and re-sizes
 *                          it to (100/z)vw x (100/z)vh so the painted box stays exactly one
 *                          viewport. ZOOM_MIN 0.8, ZOOM_MAX 2.0, snapped to 0.05.
 *   --ui-request "<words>" `src/shared/uiCustomization.ts`. The product's own natural-language
 *                          interpreter: "bigger text" -> the `bigger-text` intent -> a token patch
 *                          on font-size-sm/md/lg. There is NO `data-display-*` hook for text
 *                          scale; looking for one is the wrong search.
 * Both drive the PRODUCT'S OWN code through a Vite dev module URL rather than a reimplementation.
 * That is faithful here specifically because neither entry point carries module-level state:
 * `applyZoom` writes `--app-zoom` and `#root`, and `getZoomFactor()` READS `--app-zoom` back from
 * the DOM, so the app's own copy of the module agrees with a second instance. `applyUiCustomization`
 * looks its one `<style>` element up by id. A duplicate instance of a module that DID hold state
 * would measure the duplicate.
 * Four guards, because a condition that silently fails to apply scores a perfect unzoomed run —
 * correction 4's failure mode wearing a different hat:
 *   a. the condition must demonstrably CHANGE something, or the run VOIDs;
 *   b. it must still be applied AFTER the sweep. `installZoomResizeHook` re-applies the PERSISTED
 *      zoom on every window `resize`, so the `/bounds` lever on a root surface silently undoes it;
 *   c. restore is byte-compared on `#root`'s cssText, the custom-CSS element and the resolved font
 *      tokens, not eyeballed;
 *   d. neither entry point may persist. `applyZoom` does not (only `setZoom` writes
 *      `jp-app-zoom`), and `applyUiCustomization` does not (only `saveUiCustomizationDocument`
 *      writes `jp-ui-customization-v1`). Both storage keys are compared before and after anyway.
 */
const ZOOM = arg('zoom', '');
const UI_REQUEST = arg('ui-request', '');
const HAS_CONDITION = Boolean(ZOOM || UI_REQUEST);
if (ZOOM && !(Number(ZOOM) >= 0.8 && Number(ZOOM) <= 2.0)) {
  console.error(`REFUSE - --zoom must be within the product's own ZOOM_MIN 0.8 .. ZOOM_MAX 2.0, got ${ZOOM}`);
  process.exit(2);
}

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

// --- CORRECTION 25's condition mode -------------------------------------------------------
// One expression per /eval, and a dynamic import returns a promise, which serializes to `{}`.
// So the modules are stashed on globals and the status is polled.
const CONDITION_BOOT = `(window.__cat4cond = { s: 'pending' }, Promise.all([
  import('/src/renderer/appZoom.ts'),
  import('/src/shared/uiCustomization.ts'),
  import('/src/renderer/uiCustomizationStore.ts')
]).then(function (m) {
  window.__cat4zoom = m[0]; window.__cat4uic = m[1]; window.__cat4uis = m[2];
  window.__cat4cond = { s: 'ok' };
}).catch(function (e) { window.__cat4cond = { s: 'err', e: String(e) }; }), 'kicked')`;

const CONDITION_SNAPSHOT = `JSON.stringify({
  appZoomVar: document.documentElement.style.getPropertyValue('--app-zoom'),
  rootStyle: (document.getElementById('root') || { style: {} }).style.cssText,
  zoomFactor: window.__cat4zoom.getZoomFactor(),
  zoomPersisted: localStorage.getItem('jp-app-zoom'),
  uiCss: document.getElementById('jp-ui-customization')
    ? document.getElementById('jp-ui-customization').textContent : null,
  uiPersisted: localStorage.getItem('jp-ui-customization-v1'),
  fontSm: getComputedStyle(document.documentElement).getPropertyValue('--font-size-sm').trim(),
  fontMd: getComputedStyle(document.documentElement).getPropertyValue('--font-size-md').trim(),
  fontLg: getComputedStyle(document.documentElement).getPropertyValue('--font-size-lg').trim()
})`;

async function conditionSnapshot() { return JSON.parse(await ev(CONDITION_SNAPSHOT)); }

// The two halves of the round trip are separate so the sweep can sit between them and so the
// "still applied afterwards" re-read (guard b) has something to compare against.
async function conditionApply() {
  await ev(CONDITION_BOOT);
  for (let i = 0; i < 40; i += 1) {
    const st = JSON.parse(await ev('JSON.stringify(window.__cat4cond)'));
    if (st.s === 'ok') break;
    if (st.s === 'err') { console.error(`REFUSE - condition modules failed to import: ${st.e}`); process.exit(2); }
    await sleep(150);
  }
  const before = await conditionSnapshot();
  /*
   * CORRECTION 25a. `setZoom`, NOT `applyZoom`, and it took a landed fix to notice.
   * `applyZoom` produces the same DOM as `setZoom` minus persistence — which reads like the
   * strictly safer probe entry point, and this file used it first for exactly that reason. But
   * only `setZoom` dispatches `app-zoom-changed`, and that event is the product's cross-surface
   * zoom contract: the Settings slider syncs off it, and so does the desktop shell's re-fit of
   * window geometry into the new layout viewport. A probe on `applyZoom` therefore measures a
   * state the product never reaches through its own control, and would have scored the shell's
   * zoom handling as broken after it was fixed.
   * The persistence that comes with it is handled the way this repo handles any persisted
   * setting: captured, patched, restored, and byte-compared — including the ABSENT case, where
   * the key must end up removed rather than written back as the default.
   */
  if (ZOOM) await ev(`(window.__cat4zoom.setZoom(${Number(ZOOM)}), 'applied')`);
  if (UI_REQUEST) {
    const q = JSON.stringify(UI_REQUEST);
    await ev(`(window.__cat4plan = window.__cat4uic.interpretUiRequest(${q}), window.__cat4uis.applyUiCustomization(
      window.__cat4uis.loadUiCustomizationDocument(),
      { tokens: window.__cat4plan.tokens, componentSettings: window.__cat4plan.componentSettings }
    ), 'applied')`);
  }
  await sleep(SETTLE);
  const during = await conditionSnapshot();
  const plan = UI_REQUEST ? JSON.parse(await ev('JSON.stringify(window.__cat4plan)')) : null;
  return { before, during, plan };
}

// Restore uses the PRODUCT'S own no-argument calls: `applyZoom(loadZoom())` re-applies whatever is
// persisted (the app's real state), and `applyUiCustomization()` with no preview re-renders the
// active profile. Neither is this file writing values back by hand.
async function conditionRestore(before) {
  if (ZOOM) {
    // Back through the same product route, so the shell gets its `app-zoom-changed` on the way
    // out too — then the storage key is put back exactly as found. `setZoom` always writes, so
    // an originally-absent key has to be removed, not written back as "1".
    const original = before.zoomPersisted;
    await ev(`(window.__cat4zoom.setZoom(${Number(original == null ? 1 : original)}), 'restored')`);
    if (original == null) await ev("(localStorage.removeItem('jp-app-zoom'), 'unset')");
  }
  if (UI_REQUEST) await ev('(window.__cat4uis.applyUiCustomization(window.__cat4uis.loadUiCustomizationDocument()), \'restored\')');
  await sleep(SETTLE);
  const after = await conditionSnapshot();
  const fields = ['appZoomVar', 'rootStyle', 'zoomPersisted', 'uiCss', 'uiPersisted', 'fontSm', 'fontMd', 'fontLg'];
  const drifted = fields.filter((f) => String(before[f]) !== String(after[f]));
  return { after, drifted };
}

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

/**
 * CORRECTION 22 (2026-08-31, primary). THE CONTENT VIEWPORT MUST BE THE ROOT'S OWN BODY.
 * All three uses in this file were `win.querySelector('.fwin-body') || win` — a DESCENDANT
 * search, which is right for a `.fwin` root and wrong for every `@selector` SHELL root. A
 * shell CONTAINS floating windows, so it contains their bodies: on `@.os-desktop-wired`
 * with three `.fwin` open, the first match is a nested WINDOW's body, not the desktop's.
 * The same bug class as corrections 32/33/33b in `cat3-liquid-utilization.cjs` and
 * `l1-surface-roles.js` (2026-08-31, backup) — containment mistaken for ownership.
 *
 * What it cost here, and it is worse than a refusal because all three sites fail SILENTLY:
 *  - the READER (line ~274) takes `B` — the content viewport that correction 17 added
 *    precisely so the category compares content against chrome — from a foreign window.
 *    A minimised nested window is 0x0, so `bodyClippedShare` is measured against nothing
 *    while the root's own 1264x821 canvas goes unmeasured.
 *  - BOTH CONTROLS (lines ~811, ~859) mount their stranded-content and art-plate plants
 *    into that foreign body. A plant inside a 0x0 minimised window strands nothing, the
 *    reader's numbers do not move, and the run scores VOID — the exact shape correction
 *    33b hit in cat3, where the product bars were passing the whole time.
 *
 * The rule is ownership, not containment: a `.fwin-body` belongs to this root only when
 * the `.fwin` it belongs to IS this root. A chromeless root (a shell, a reader that
 * replaced the shell) owns no `.fwin-body` and IS its own content viewport, which is what
 * correction 17 always said in words.
 */
const OWN_BODY_FN = `function(root){
  if (!root) return root;
  var bodies = [].slice.call(root.querySelectorAll('.fwin-body'));
  for (var i = 0; i < bodies.length; i += 1) {
    if (bodies[i].closest('.fwin') === root) return bodies[i];
  }
  return root;
}`;

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
  var body = (${OWN_BODY_FN})(win);
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
  // CORRECTION 23. A DECORATIVE BACKDROP PAINTED BEHIND THE CHROME IS NOT AN OVERLAP WITH IT.
  // purePaint (correction 20) proxies "decoration" as "no text anywhere", which is right for
  // City's parallax and wrong for a wall that carries ORNAMENTAL text. Measured on the Wired
  // shell: div.wired-wall-atmosphere is 1264x821 at 0,0 - the whole desktop - position absolute,
  // pointer-events none, 0 controls, and it holds 19 characters of decorative kana. So it fails
  // purePaint by those 19 characters, and every one of the surface's overlaps was this backdrop
  // against the chrome sitting on top of it: wall x os-taskbar, wall x os-task-wins, wall x
  // os-tray, plus wall-kana x the same at the compact size.
  //
  // A full-surface background layer intersects the box of EVERY element on the surface, so under
  // the old rule any surface with one fails this bar no matter how good its layout. That is an
  // instrument assumption, not a defect.
  //
  // The test is the app's OWN declaration rather than this file's judgement about what looks
  // decorative: aria-hidden means the product has already said this text is ornament and not
  // content, and pointer-events none means it cannot take a click. A backdrop that is inert,
  // hidden from the accessibility tree AND painted behind the other box hides nothing from it -
  // the other box is on top - and what it loses to the other box is ornament by declaration.
  // Any one of the three missing and the pair is still counted.
  var a11yHidden = function(e){
    var n = e;
    while (n && n !== win.parentElement) {
      if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return true;
      n = n.parentElement;
    }
    return false;
  };
  var decorativeBackdrop = function(e){
    if (!outOfFlowHost(e)) return false;
    if (getComputedStyle(e).pointerEvents !== 'none') return false;
    if (e.matches(ACTIONABLE) || e.querySelector(ACTIONABLE)) return false;
    return a11yHidden(e);
  };
  // Is "a" painted BEHIND "b"? Resolve both to the child of their nearest common ancestor that
  // each descends from, then compare z-index with document order as the tiebreak - which is how
  // the painting algorithm orders siblings. When both resolve to the SAME child neither is
  // behind the other in any meaningful sense, so this declines rather than guesses.
  var zOf = function(e){ var v = parseInt(getComputedStyle(e).zIndex, 10); return isNaN(v) ? 0 : v; };
  var childUnder = function(anc, e){
    var n = e;
    while (n && n.parentElement !== anc) n = n.parentElement;
    return n;
  };
  var paintsBehind = function(a2, b3){
    var anc = a2.parentElement;
    while (anc && !anc.contains(b3)) anc = anc.parentElement;
    if (!anc) return false;
    var ca = childUnder(anc, a2), cb = childUnder(anc, b3);
    if (!ca || !cb || ca === cb) return false;
    var za = zOf(ca), zb = zOf(cb);
    if (za !== zb) return za < zb;
    return !!(ca.compareDocumentPosition(cb) & Node.DOCUMENT_POSITION_FOLLOWING);
  };

  // CORRECTION 24. A DESKTOP'S FREE WORKSPACE IS NOT DEAD SPACE. The dead-region bar asks whether
  // a surface wastes the room it was given, and 15 pct is the right bar for an APPLICATION
  // interior, which is what every surface scored before this one was. A window-hosting shell is
  // the opposite shape: its empty middle is not layout that failed to fill, it is the workspace
  // the windows open into, and a desktop with no free space is the broken one. Measured on the
  // Wired shell: 59.5 pct at 1264x821, 54.0 compact, 63.4 maximized, against chromePct 0 - and
  // the three .fwin it hosts were all minimised to 0x0 at the time, so the room they would take
  // was empty BY DEFINITION. No arrangement of a desktop passes a 15 pct bar.
  //
  // So the bar does not apply here. It is NOT silently passed: the percentages are recorded at
  // every size exactly as measured, deadRegionApplies says false, and deadRegionBasis names
  // the reason. This is correction 19's shape - a product whose shape means the leg does not
  // exist - and it is deliberately narrow: it needs the surface to actually HOST windows, so an
  // application interior with a big empty panel is still scored, and so is a .fwin, which is a
  // window rather than a desktop no matter what it contains.
  var hostedWindows = win.classList && win.classList.contains('fwin') ? [] : [].slice.call(win.querySelectorAll('.fwin')).filter(function(f){
    return f.parentElement && !f.parentElement.closest('.fwin');
  });

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
  var backdropOverlaps = [];
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
      // CORRECTION 23, applied. Reported by name in its own list, never silently dropped, and
      // the direction that matters is recorded: which one was the backdrop, and behind what.
      if (decorativeBackdrop(a) && paintsBehind(a, b2)) {
        backdropOverlaps.push(name(a) + ' behind ' + name(b2) + ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
        continue;
      }
      if (decorativeBackdrop(b2) && paintsBehind(b2, a)) {
        backdropOverlaps.push(name(b2) + ' behind ' + name(a) + ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
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
    // CORRECTION 23, same discipline: excused pairs are named, with which side was the backdrop.
    backdropOverlapCount: backdropOverlaps.length,
    backdropOverlaps: backdropOverlaps.slice(0, 6),
    // Only the BACKDROP side counts. The rows read "X behind Y", and the in-front control plant
    // legitimately appears on the Y side - the wall really is behind it - so a bare substring
    // match reported the exclusion as having excused the plant when it had not. Split on the
    // separator and test the excused side alone.
    backdropOverlapsHasControlPlant: backdropOverlaps.some(function(n){ return String(n).split(' behind ')[0].indexOf('lqcat4-front-control') !== -1; }),
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
    deadRegionApplies: hostedWindows.length === 0,
    hostedWindowCount: hostedWindows.length,
    deadRegionBasis: hostedWindows.length
      ? 'NOT SCORED - window-hosting shell: the empty area is the workspace ' + hostedWindows.length + ' detached window(s) open into, not layout that failed to fill'
      : (deadRegionPagers.length
        ? 'union of rendered fragments across ' + deadRegionPagers.map(function(p){ return p.getAttribute('data-paged-pages'); }).join(',') + '-page proven pager buffer(s)'
        : 'visible surface'),
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
  var body = (${OWN_BODY_FN})(win);
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
  var body = (${OWN_BODY_FN})(win);
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

/*
 * CORRECTION 23's OWN CONTROL, and it runs in the one direction that exclusion could go wrong:
 * widening into a blanket amnesty. This plant satisfies EVERY backdrop condition except the last
 * one — out of flow, pointer-events none, aria-hidden, no control anywhere — but it carries
 * z-index 999999, so it is painted IN FRONT of the chrome it covers. A box on top genuinely does
 * hide what is under it, so it must NOT be excused: `overlaps` must RISE while it is mounted, and
 * it must NOT appear in `backdropOverlaps`. It also carries TEXT, which keeps correction 20's
 * older plate rule from excusing it first and letting this leg pass for the wrong reason.
 *
 * So the two legs pin the exclusion from both sides: the Wired wall (inert, hidden, behind) is
 * excused, and this box (inert, hidden, IN FRONT) is not. An edit that drops the paintsBehind
 * test fails here; an edit that narrows the rule to nothing fails on the surface itself.
 */
const FRONT_CONTROL_INJECT = (surface) => `(function(){
  var win = ${rootExpr(surface)};
  if (!win) return JSON.stringify({ refuse: 'surface not found' });
  var R = win.getBoundingClientRect();
  if (!R.width || !R.height) return JSON.stringify({ refuse: 'surface is 0x0' });
  var body = (${OWN_BODY_FN})(win);
  var cbPos = getComputedStyle(body).position;
  var restorePos = cbPos === 'static' ? body.style.position : null;
  if (cbPos === 'static') body.style.position = 'relative';
  var p = document.createElement('div');
  p.id = '__lqcat4_front';
  p.className = 'lqcat4-front-control';
  if (restorePos !== null) p.setAttribute('data-restore-pos', restorePos);
  p.setAttribute('aria-hidden', 'true');
  p.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(255,0,255,0.15);pointer-events:none;z-index:999999;';
  p.textContent = 'lq control: inert aria-hidden plant, painted IN FRONT';
  body.appendChild(p);
  var cs = getComputedStyle(p);
  return JSON.stringify({
    injected: true,
    ariaHidden: p.getAttribute('aria-hidden') === 'true',
    pointerEvents: cs.pointerEvents,
    zIndex: cs.zIndex,
    hasText: !!(p.textContent || '').trim(),
    hasControl: !!p.querySelector('button,a[href],input,select,textarea,[tabindex],[role="button"]')
  });
})()`;

const FRONT_CONTROL_REMOVE = `(function(){
  var p = document.getElementById('__lqcat4_front');
  if (p && p.hasAttribute('data-restore-pos')) {
    var host = p.parentElement;
    var was = p.getAttribute('data-restore-pos');
    if (host) { if (was) host.style.position = was; else host.style.removeProperty('position'); }
  }
  if (p) p.remove();
  return JSON.stringify({ removed: true, stillPresent: !!document.getElementById('__lqcat4_front') });
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
  // CORRECTION 24: a window-hosting shell has no dead-region bar to fail. The measured
  // percentage still travels in the artifact at every size; only the SCORING is withheld.
  deadRegion: m.deadRegionApplies === false ? 'NOT-APPLICABLE' : m.deadRegionPctOfViewport <= 15,
});

(async () => {
  // CORRECTION 25 guard (a): the condition goes on FIRST, so every size leg below — including the
  // `default` leg, which is read as-found — is measured under it rather than beside it.
  const cond = HAS_CONDITION ? await conditionApply() : null;

  const base = await read();
  if (base.refuse) {
    if (cond) await conditionRestore(cond.before);
    console.error(`REFUSE - ${base.refuse}`);
    process.exit(2);
  }

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
    deadRegion: sized.length === 0
      ? 'UNMEASURED'
      : (perSize.every((p) => p.bars.deadRegion === 'NOT-APPLICABLE')
        ? 'NOT-APPLICABLE'
        : perSize.every((p) => p.bars.deadRegion === true || p.bars.deadRegion === 'NOT-APPLICABLE')),
    contentGrowsNotChrome,
    allThreeSizes: sized.length === sizesExpected,
    restored: ranLegs.length > 0 && ranLegs.every((l) => l.restored === true),
  };
  // CORRECTION 24. 'NOT-APPLICABLE' and 'UNMEASURED' must not collapse into each other. UNMEASURED
  // means this run failed to get a number and the rubric's own rule is "measure it or score 0,
  // never 10". NOT-APPLICABLE means the number exists, is recorded at every size, and the bar is
  // not a question this shape of surface can answer. Folding the first into the second would let
  // a broken run score; folding the second into the first makes a desktop unscoreable forever.
  /*
   * CORRECTION 25, the four guards. The sweep is over, so this is the last moment the condition
   * can still be checked against the same window the numbers came from.
   */
  let conditionReport = null;
  if (cond) {
    const stillOn = await conditionSnapshot();
    const zoomChanged = ZOOM ? cond.during.zoomFactor !== cond.before.zoomFactor : null;
    const fontChanged = UI_REQUEST
      ? ['fontSm', 'fontMd', 'fontLg'].some((f) => cond.during[f] !== cond.before[f])
      : null;
    const zoomHeld = ZOOM ? stillOn.zoomFactor === cond.during.zoomFactor : null;
    const fontHeld = UI_REQUEST
      ? ['fontSm', 'fontMd', 'fontLg'].every((f) => stillOn[f] === cond.during[f])
      : null;
    conditionReport = {
      zoom: ZOOM ? Number(ZOOM) : null,
      uiRequest: UI_REQUEST || null,
      uiPlan: cond.plan ? { intents: cond.plan.intents, tokens: cond.plan.tokens, unmatched: cond.plan.unmatched } : null,
      productRoute: [
        ZOOM ? "src/renderer/appZoom.ts applyZoom() - applies without persisting; setZoom is the one that writes jp-app-zoom" : null,
        UI_REQUEST ? 'src/shared/uiCustomization.ts interpretUiRequest() -> uiCustomizationStore.applyUiCustomization(doc, preview) - the preview argument is the product\'s own non-persisting path' : null,
      ].filter(Boolean),
      // (a) did it actually take?
      zoomFactorBefore: cond.before.zoomFactor,
      zoomFactorDuring: cond.during.zoomFactor,
      fontTokensBefore: { sm: cond.before.fontSm, md: cond.before.fontMd, lg: cond.before.fontLg },
      fontTokensDuring: { sm: cond.during.fontSm, md: cond.during.fontMd, lg: cond.during.fontLg },
      applied: (zoomChanged !== false) && (fontChanged !== false),
      // (b) was it still on when the last number was taken?
      heldThroughSweep: (zoomHeld !== false) && (fontHeld !== false),
      zoomFactorAfterSweep: stillOn.zoomFactor,
      // (c) and (d) are filled in after the negative-control legs below — the control has to run
      // under the SAME condition as the measurement it must falsify, or its injected clip is
      // compared against a baseline taken in a different state.
      restored: null,
      driftedFields: null,
      persistedUnchanged: null,
    };
  }

  const notApplicable = Object.entries(bars).filter(([, v]) => v === 'NOT-APPLICABLE').map(([k]) => k);
  const unmeasured = Object.entries(bars).filter(([, v]) => typeof v === 'string' && v !== 'NOT-APPLICABLE').map(([k]) => k);
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
    globalCondition: conditionReport,
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
      backdropOverlapCount: l.measurement && l.measurement.backdropOverlapCount,
      backdropOverlaps: l.measurement && l.measurement.backdropOverlaps,
      deadRegionApplies: l.measurement && l.measurement.deadRegionApplies,
      hostedWindowCount: l.measurement && l.measurement.hostedWindowCount,
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
    notApplicableBars: notApplicable,
    deadRegionPctBySize: perSize.map((p) => `${p.kind} ${p.deadPctViewport}%`),
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

    // CORRECTION 23's control, its own cycle for the same reason as the one above.
    const frontInj = JSON.parse(await ev(FRONT_CONTROL_INJECT(SURFACE)));
    let frontDirty = null;
    let frontRm = null;
    let frontRestored = null;
    if (!frontInj.refuse) {
      await sleep(SETTLE);
      frontDirty = await read();
      frontRm = JSON.parse(await ev(FRONT_CONTROL_REMOVE));
      await sleep(SETTLE);
      frontRestored = await read();
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
      backdropExclusion: frontInj.refuse ? { refuse: frontInj.refuse } : {
        // The plant IS a backdrop by every test but the last: inert, hidden from the a11y tree,
        // no control — and painted in front, which is the one thing that makes it a real collision.
        plantIsInertAndHidden: frontInj.ariaHidden === true && frontInj.pointerEvents === 'none' && frontInj.hasControl === false,
        plantCarriesText: frontInj.hasText === true,
        plantPaintedInFront: frontInj.zIndex === '999999',
        overlapsRose: !frontDirty.refuse && frontDirty.overlaps > base.overlaps,
        notExcusedAsBackdrop: !frontDirty.refuse && frontDirty.backdropOverlapsHasControlPlant === false,
        backToBaseline: !frontRestored.refuse && frontRestored.overlaps === base.overlaps,
        overlaps: {
          base: base.overlaps,
          dirty: frontDirty.refuse ? frontDirty.refuse : frontDirty.overlaps,
          restored: frontRestored.refuse ? frontRestored.refuse : frontRestored.overlaps,
        },
        backdropOverlapCount: {
          base: base.backdropOverlapCount,
          dirty: frontDirty.refuse ? frontDirty.refuse : frontDirty.backdropOverlapCount,
          restored: frontRestored.refuse ? frontRestored.refuse : frontRestored.backdropOverlapCount,
        },
        removalProven: frontRm && frontRm.removed === true && frontRm.stillPresent === false,
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

  // CORRECTION 25. The condition comes OFF here, after the control legs, so everything this run
  // measured — sweep and control alike — was measured in one state.
  if (conditionReport) {
    const { after, drifted } = await conditionRestore(cond.before);
    conditionReport.restored = drifted.length === 0;
    conditionReport.driftedFields = drifted;
    conditionReport.persistedUnchanged = String(cond.before.zoomPersisted) === String(after.zoomPersisted)
      && String(cond.before.uiPersisted) === String(after.uiPersisted);
  }

  // These VOID rather than fail, and they are checked LAST so a condition run that never actually
  // got its condition on can never be read as a clean sweep. An unzoomed window measures
  // perfectly at 0.8 and at 2.0 alike.
  if (conditionReport) {
    if (!conditionReport.applied) {
      out.verdict = 'VOID - the requested global condition did not change the app; an unapplied condition scores the default state';
    } else if (!conditionReport.heldThroughSweep) {
      out.verdict = 'VOID - the global condition was undone during the sweep (installZoomResizeHook re-applies the persisted zoom on any OS-window resize)';
    } else if (!conditionReport.restored) {
      out.verdict = `VOID - the global condition did not restore: ${conditionReport.driftedFields.join(',')}`;
    } else if (!conditionReport.persistedUnchanged) {
      out.verdict = 'VOID - the global condition wrote to persisted storage; this run changed the user profile';
    }
  }

  const text = JSON.stringify(out, null, 2);
  if (OUT) fs.writeFileSync(OUT, text);
  console.log(text);
  // 0 pass, 1 a real failure, 2 refuse, 3 unmeasured/void.
  process.exit(out.verdict.startsWith('PASS') ? 0 : (out.verdict.startsWith('FAIL') ? 1 : (out.verdict.startsWith('REFUSE') ? 2 : 3)));
})().catch((e) => { console.error(String(e && e.message ? e.message : e)); process.exit(4); });
