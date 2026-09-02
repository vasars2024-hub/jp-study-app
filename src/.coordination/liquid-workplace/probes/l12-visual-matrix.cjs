/**
 * L12 BULLET 1 — the standard/Liquid/theme/state screenshot matrix, parameterised by
 * every dimension it sweeps.
 *
 * WHY THIS IS A HARNESS AND NOT A PROBE (RULE 1 forbids new single-use probes). Nothing
 * about a surface, a theme id, a window title or a pixel is written here. The four
 * dimensions are all ENUMERATED FROM SOURCE at run time:
 *   - apps          <- `DESKTOP_WIN_SECTIONS` parsed out of `src/shared/desktop.ts`
 *   - themes        <- `listThemes()` off the LIVE theme registry, not the source array
 *   - presentations <- the surface's own `.fwin-b-liquid` toggle, by cat3's ownership rule
 *   - states        <- the shell's own window controls
 * L12 bullet 4's "final visual atlas" is this same harness with `--atlas`: it writes an
 * HTML contact sheet beside the PNGs, risk cells first. That second caller is what keeps
 * this file out of single-use-probe territory.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/l12-visual-matrix.cjs \
 *     [--apps all|a,b,c] [--themes all|+hidden|a,b] [--presentations standard,liquid] \
 *     [--states normal,maximized] [--out file] [--control] [--keep] [--atlas] [--no-freeze]
 *
 * ---------------------------------------------------------------------------------
 * THE TRAP THIS HARNESS EXISTS TO NOT FALL INTO, and it has burned this repo twice.
 *
 * (1) `document.documentElement.dataset.theme = x` DOES NOT REPAINT ENOUGH TO MEASURE.
 *     It is banked memory: a probe that stamped the attribute reported the OPPOSITE
 *     background and put a false claim in a commit message. So the flip goes through the
 *     product's own choke point, `renderer/theme/engine.ts:144 applyTheme` — reached by
 *     `import('/src/renderer/theme/engine.ts')` off the Vite dev module registry, which
 *     returns the SAME module instance the app itself holds. Verified by side effect
 *     before this file was written: applying `high-contrast` moved the computed body
 *     background `rgb(13,12,18) -> rgb(0,0,0)` and persisted `jp-os-theme`. An attribute
 *     stamp moves neither.
 *
 *     The alternative product path — the QuickSettings `<select>` — was rejected on a
 *     measured ground, not a stylistic one: the picker only exists while the flyout is
 *     OPEN, so `.os-flyout--quick` and `.os-panel-backdrop` would be painted into every
 *     single cell of the matrix. The engine call has no such shadow.
 *
 * (2) A THEME SWAP IS A TRANSITION. `getComputedStyle` immediately after `applyTheme`
 *     returns the OLD colour, and `capturePage` immediately after returns a frame of the
 *     PREVIOUS theme. A fixed sleep is a guess that gets shorter than the transition on a
 *     loaded machine and silently mislabels every image after it.
 *
 *     The FIRST fix here was wrong and the controls caught it, which is the whole reason
 *     they exist. `settle()` polled `body`/`html`/`.os-desktop` background colours — none
 *     of which belong to the window being photographed — so it returned "settled" while
 *     the window's own transition was still running. The full 650-cell run then failed C1
 *     and VOIDed itself, with all 611 captured images "distinct" partly because some were
 *     just different frames of a live transition. Six repeats 400 ms apart on three
 *     separate windows came back 1/6 distinct each, ruling out per-app animation and
 *     naming the gate as the defect.
 *
 *     So capture now settles on THE BYTES IT IS ABOUT TO BANK: `captureStable()` re-shoots
 *     the same rect until two consecutive PNGs are byte-identical. That is strictly
 *     stronger than any colour proxy, because it is the artifact itself. `settle()` is
 *     kept for the cheap pre-roll after a theme flip; convergence is the real gate. A cell
 *     that never converges is `converged:false` — a genuine finding about live content,
 *     not something to average away.
 *
 * (2b) A BLINKING CARET IS ONE OSCILLATOR, AND IT IS REAL, BUT IT WAS NOT WHY C1 FAILED.
 *     Measured, not reasoned about: 14 captures of one unchanged Dictionary window, 250 ms
 *     apart, came back `ABBCDEEDEEDDEE` — 5 distinct images whose byte lengths spanned all
 *     of 27 bytes (23,193–23,220). The tail oscillates D/E/D/E, a two-state PERIOD rather
 *     than a transition. `document.activeElement` is an INPUT inside the window and
 *     Chromium blinks a caret at ~530 ms, longer than the convergence gap, so two
 *     consecutive shots land in the same phase and the gate converges on a RANDOM phase.
 *     A `caret-color: transparent` freeze removes exactly those pixels and nothing else:
 *     same window, same cadence, freeze on -> `AAABCCCCCC`, one image six times running.
 *     `--no-freeze` is its falsifier.
 *
 *     AND C1 STILL FAILED WITH THE FREEZE ON. Recorded because a plausible fix that does
 *     not move the number is the cheapest kind of false credit available here.
 *
 * (2c) WHAT ACTUALLY FAILED C1 IS A LATE PLATEAU, AND THE CAPTURE IS NOT NOISY AT ALL.
 *     The two frames C1 compared differed in 171 pixels out of 475,600, scattered over the
 *     whole frame, at a maximum channel delta of ONE. That reads like compositor noise, and
 *     if it were, byte-identity would be an impossible gate on this platform and the whole
 *     control would have to be rewritten around a tolerance. So it was measured directly:
 *
 *       floor  — same window, settled, two captures back to back:      0 pixels differ
 *       floor  — same window, after a theme round trip away and back:  0 pixels differ
 *       signal — study-os vs classic-light:      99.591% of pixels, mean delta 249.6
 *       signal — standard vs liquid:             92.728% of pixels, mean delta  21.75
 *
 *     The floor is exactly zero. `capturePage` IS byte-deterministic once the content has
 *     stopped moving, so byte-identity is the right equality after all and no tolerance is
 *     needed for C1. What defeats it is that this surface settles in STEPS: the repeat trace
 *     `AAAABBBBBB` holds one image for four consecutive captures — about 1.3 s — and then
 *     changes for good. Two-in-a-row converges inside that plateau, one call lands on A and
 *     the next on B, and C1 correctly reports them as different. The gate was too weak, not
 *     the platform too noisy. Convergence now requires `--run` (default 3) consecutive
 *     identical frames 300 ms apart, which is longer than the observed plateau.
 *
 *     The same measurement condemns the must-differ controls as they were first written.
 *     With a floor of zero, ANY byte difference passed them — one stray pixel would have
 *     satisfied C2, C3 and C4 while the theme, the toggle or the crop did nothing. They now
 *     assert a MAGNITUDE (>=1% of pixels differing by more than 8), which sits four orders
 *     above the measured floor and two below the weakest real signal.
 *
 * (3) `study-os` IS THE DEFAULT AND CARRIES NO `data-theme` ATTRIBUTE AT ALL —
 *     `applyTheme` REMOVES it for the default id (engine.ts:147). A verifier that reads
 *     the attribute back to confirm the flip therefore scores the default theme as a
 *     FAILURE every time. `themeApplied()` compares against the id the engine reports it
 *     is on, and treats `null === DEFAULT_THEME_ID` as correct.
 *
 * ---------------------------------------------------------------------------------
 * THE CONTROLS, because 182 PNGs of the same picture is a matrix that proves nothing and
 * would look exactly like a successful run. `--control` runs six, in this order:
 *
 *   C0  FLOOR / the instrument's own noise. Two captures of an unchanged, settled window,
 *       taken exactly the way the matrix takes them. Everything below is scored against
 *       this number, and a run where the floor is NOT zero VOIDs with that stated first —
 *       because it would mean byte-identity is the wrong equality here and every other
 *       verdict needs a tolerance before it means anything.
 *
 *   C1  REPEAT / must be IDENTICAL. The same cell captured twice with nothing changed
 *       between must produce a byte-identical PNG. If it does not, the instrument itself
 *       is noisy (an animation, a caret, a clock) and EVERY difference C2 and C3 report
 *       is unattributable. C1 failing VOIDs the run — it is not a product finding.
 *
 *   C2  THEME / must DIFFER. Two themes whose declared swatches are furthest apart must
 *       produce different bytes at the same app/presentation/state. Identical bytes mean
 *       the flip never reached the pixels, which is trap (1) firing.
 *
 *   C3  PRESENTATION / must DIFFER. Standard vs Liquid on the same app/theme/state must
 *       produce different bytes. Identical bytes mean the toggle moved a class and
 *       nothing else, which is the defect L3 exists to catch.
 *
 *   C4  APP / must DIFFER. Two different apps at the same theme and presentation must
 *       produce different bytes. This one is here because the FIRST draft of this harness
 *       failed it by construction and looked fine: `/screenshot` captures the whole
 *       renderer, so with several windows open every app returned the identical desktop
 *       image and the app axis was decorative. The fix was a `rect` on the bridge route
 *       plus a raise-then-crop; C4 is what keeps that fix honest. Failing it VOIDs the run.
 *
 *   C5  STATE / must DIFFER, scored on the RECT rather than the pixels. Maximizing changes
 *       the capture's dimensions, so a pixel comparison has no common grid and would pass
 *       trivially on "different sizes" — true, and silent about whether anything maximized.
 *       The falsifiable claim is geometric: the maximized rect must be strictly larger in
 *       area. This control exists because the state axis was DECORATIVE in the first draft
 *       — `--states` was accepted, written into every filename, and never set anything.
 *
 * C2, C3 and C4 additionally require a MAGNITUDE, not just different bytes. With a floor of
 * zero, one changed pixel would have satisfied "differs" — so each of them could have passed
 * while the theme flip, the toggle or the crop did nothing at all. The gate is >=1% of
 * pixels differing by more than 8, which is four orders above the measured floor and two
 * below the weakest real signal on this desktop.
 *
 * A run without `--control` reports `controls: null` and is explicitly NOT certification
 * evidence. The manifest says so in its own `certifiable` field rather than leaving a
 * reader to infer it.
 *
 * ---------------------------------------------------------------------------------
 * WHAT IS COMMITTED. The PNGs land in `debug/shots/l12-matrix/`, which is gitignored
 * (`.gitignore:125` covers all of `debug/`). Only the JSON manifest is committed: size,
 * sha256, dimensions and the pass/fail of every cell. The boss audit counts added
 * binaries, and a visual atlas is worth nothing to it if the bytes are unverifiable — a
 * sha256 per cell is checkable forever without storing one megabyte in git.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.indexOf(`--${name}`) >= 0;

const CONTROL = has('control');
const KEEP = has('keep');
const ATLAS = has('atlas');
const FREEZE = !has('no-freeze');
/** Consecutive byte-identical frames a cell must produce before it is banked. See trap (2c). */
const RUN = Math.max(2, Number(arg('run', '3')) || 3);
/**
 * How many frames a cell may spend trying to converge. It is a CLI knob and not a constant
 * because `converged:false` has two completely different causes and 12 attempts cannot tell
 * them apart: a surface that genuinely oscillates, and a surface that is merely slower than
 * the budget on a loaded desk. The full 650-cell run reported 68 unconverged cells; the same
 * `stats` surface driven alone settled in 7 frames (`ABBBCCCCCCCC`). Re-running the failing
 * subset at a higher `--tries` on the SAME 25-window scene is the control that separates the
 * two, and without it "never converged" is an adjective, not a measurement.
 */
const TRIES = Math.max(3, Number(arg('tries', '12')) || 12);

/**
 * Optional pixel arithmetic. `sharp` is present in node_modules but is a TRANSITIVE
 * dependency, not one this repo declares, so a harness that hard-required it would break
 * on the first clean install. When it is missing the must-differ controls fall back to
 * byte-inequality and say so in `magnitude: null` — they do not silently claim a
 * magnitude they could not compute.
 */
let sharp = null;
try { sharp = require('sharp'); } catch { sharp = null; }

/** Per-pixel max-channel difference between two PNGs, as a fraction of the frame. */
async function pixelDelta(pathA, pathB) {
  if (!sharp) return null;
  const a = await sharp(pathA).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(pathB).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return { incomparable: 'different dimensions', a: a.info, b: b.info };
  }
  const { width, height, channels } = a.info;
  const n = width * height;
  let diff = 0; let max = 0; let over8 = 0;
  for (let i = 0; i < n; i += 1) {
    const o = i * channels;
    let d = 0;
    for (let c = 0; c < Math.min(3, channels); c += 1) {
      const v = Math.abs(a.data[o + c] - b.data[o + c]);
      if (v > d) d = v;
    }
    if (d) { diff += 1; if (d > max) max = d; if (d > 8) over8 += 1; }
  }
  return {
    pixels: n,
    pctDiff: +((100 * diff) / n).toFixed(3),
    pctOver8: +((100 * over8) / n).toFixed(3),
    maxDelta: max,
  };
}

/**
 * A must-differ control passes only ABOVE THE MEASURED FLOOR. Byte-inequality alone is not
 * enough: a single changed pixel would satisfy it, so the control could pass on a paint
 * artifact while the thing it interrogates did nothing. Measured on this desktop, the gap
 * is not close — floor 0.000%, theme flip 99.591% of pixels at mean delta 249.6,
 * presentation toggle 92.728% at mean 21.75. 1% over a delta of 8 sits four orders above
 * the floor and two below the weakest real signal.
 */
const DIFF_MIN_PCT = 1.0;
function magnitudeVerdict(m) {
  if (!m) return { enough: null, why: 'sharp unavailable — byte-inequality only' };
  // Two surfaces that are not even the same size are differing in the strongest way there
  // is; there is no common pixel grid to score, and demanding one would fail C4 on exactly
  // the windows that differ most.
  if (m.incomparable) return { enough: true, why: `${m.incomparable} — ${m.a.width}x${m.a.height} vs ${m.b.width}x${m.b.height}` };
  return { enough: m.pctOver8 >= DIFF_MIN_PCT, why: `${m.pctOver8}% of pixels differ by >8 (floor 0, gate ${DIFF_MIN_PCT}%)` };
}
const OUT = arg('out', '');

/**
 * PLATE PATHS CARRY A RUN IDENTITY, and they did not until 2026-09-02.
 *
 * A cell's plate was written to `debug/shots/l12-matrix/<app>__<pres>__<theme>__<state>.png`
 * — four DIMENSION coordinates and nothing about which run produced it. Two runs that share
 * a coordinate therefore write the same file, and the later one destroys the earlier image
 * while the earlier MANIFEST goes on asserting a sha256 for it. The manifest stays green;
 * the evidence underneath it is gone.
 *
 * That is not hypothetical. `l12-atlas.cjs`'s integrity check caught it on its first live
 * run against the banked set: **21 indexed plates no longer hashed to their recorded
 * sha256**, every one of them `oled-black`, and every on-disk hash equal to the `tries40`
 * run's OWN recorded hash — so the clobber is identified, not merely suspected. A second
 * instrument agrees at 21 from the manifests alone without opening a PNG.
 *
 * The fix is the run directory, not a longer filename. A filename that encodes the run is
 * still one namespace, so a re-run with the same flags collides again; a directory makes
 * the invariant structural — a plate path can only be written by the run that owns the
 * directory. `--run-id` is offered so a caller can pin one deliberately, but the DEFAULT
 * has to be unique without being asked, because every clobbered plate above came from a
 * caller who never thought about it. Timestamp plus pid gives that even for two runs
 * started in the same second by different processes.
 *
 * Old manifests keep resolving: their `file` values are repo-relative and still name the
 * flat directory, which is left in place and never written to again.
 */
const SHOT_ROOT = path.join(REPO, 'debug', 'shots', 'l12-matrix');
const RUN_ID = arg('run-id', '')
  || `${path.basename(OUT || 'l12-matrix-manifest.json').replace(/\.json$/i, '')}__${
    new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, 'Z')}__${process.pid}`;
const SHOT_DIR = path.join(SHOT_ROOT, RUN_ID);

/** Dimension 1 — apps, parsed out of the canonical list rather than restated here. */
function sourceSections() {
  const src = fs.readFileSync(path.join(REPO, 'src', 'shared', 'desktop.ts'), 'utf8');
  const m = src.match(/export const DESKTOP_WIN_SECTIONS = \[([\s\S]*?)\] as const;/);
  if (!m) throw new Error('REFUSE - could not parse DESKTOP_WIN_SECTIONS from src/shared/desktop.ts');
  return m[1].split(',').map((s) => (s.match(/'([^']+)'/) || [])[1]).filter(Boolean);
}

/** Holds the in-flight manifest so the crash handler at the bottom can bank a partial. */
const PARTIAL = { m: null, out: null };

const cfgPath = path.join(REPO, 'debug', 'bridge.json');
if (!fs.existsSync(cfgPath)) {
  console.error('REFUSE - no debug/bridge.json; the app is not running with the debug bridge');
  process.exit(2);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A 650-cell run is roughly 4,000 short-lived HTTP connections, and ONE of them failing must
 * not cost the whole sweep. Measured the expensive way: a full run died at cell 164 with a
 * bare `TypeError: fetch failed` while `/health` answered normally seconds later — the app
 * was fine, a single socket was not. Retried with backoff, and the cause is unwrapped when
 * it finally gives up, because `fetch failed` on its own names nothing.
 */
let retries = 0;
async function post(route, body, tries = 4) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
        method: 'POST', headers: H, body: JSON.stringify(body || {}),
      });
      return await r.json();
    } catch (e) {
      retries += 1;
      if (i === tries - 1) {
        const cause = e && e.cause ? ` (cause: ${e.cause.code || e.cause.message || e.cause})` : '';
        throw new Error(`${route} failed after ${tries} attempts: ${e.message}${cause}`);
      }
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return null;
}
/** `/eval` takes ONE expression and never awaits a promise — banked trap. */
async function ev(js) {
  const j = await post('/eval', { js });
  if (!j || j.ok !== true) throw new Error(`eval failed: ${JSON.stringify(j)}`);
  return j.result;
}
const J = async (js) => JSON.parse(await ev(js));

/**
 * Load the product's own theme module off the Vite dev registry and hold it on
 * `window.__l12Mod`. `/eval` will not await, so this kicks the import and polls.
 */
async function loadEngine() {
  await ev("(window.__l12p = import('/src/renderer/theme/engine.ts')"
    + ".then(m => { window.__l12Mod = m; }).catch(e => { window.__l12Err = String(e); }), 'kicked')");
  for (let i = 0; i < 40; i += 1) {
    const s = await ev('window.__l12Mod ? "ready" : (window.__l12Err || "pending")');
    if (s === 'ready') return;
    if (s !== 'pending') throw new Error(`REFUSE - theme engine import failed: ${s}`);
    await sleep(250);
  }
  throw new Error('REFUSE - theme engine module never resolved');
}

/**
 * Trap (2b): hide the text caret for the duration of the run. This is the ONE pixel source
 * on this desktop that is periodic rather than transient, so it defeats a convergence gate
 * instead of tripping it. Injected as a single stylesheet the harness owns by id, and
 * removed at restore — a run that leaves it behind has changed the app it measured.
 */
async function freezeCaret(on) {
  if (!FREEZE) return false;
  if (on) {
    await ev("(()=>{var s=document.getElementById('__l12freeze');if(!s){s=document.createElement('style');"
      + "s.id='__l12freeze';s.textContent='*,*::before,*::after{caret-color:transparent !important}';"
      + "document.head.appendChild(s);}return 'on';})()");
    return true;
  }
  await ev("(()=>{var s=document.getElementById('__l12freeze');if(s)s.remove();return 'off';})()");
  return false;
}

/**
 * Wait for the paint to stop moving. Returns the ms it took and whether it settled.
 * Samples the shell's own painted colours, not a single element, so a transition on any
 * one layer still holds the gate.
 */
const SAMPLE = "JSON.stringify([getComputedStyle(document.body).backgroundColor,"
  + "getComputedStyle(document.body).color,"
  + "getComputedStyle(document.documentElement).backgroundColor,"
  + "(document.querySelector('.os-desktop')?getComputedStyle(document.querySelector('.os-desktop')).backgroundColor:'')])";
async function settle(maxMs = 6000) {
  const t0 = Date.now();
  let prev = await ev(SAMPLE);
  let stable = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(120);
    const now = await ev(SAMPLE);
    if (now === prev) {
      stable += 1;
      if (stable >= 2) return { settledMs: Date.now() - t0, settled: true, sample: JSON.parse(now) };
    } else {
      stable = 0;
      prev = now;
    }
  }
  return { settledMs: Date.now() - t0, settled: false, sample: JSON.parse(prev) };
}

/** Trap (3): the default theme is correct WITH the attribute absent. */
async function themeApplied(id) {
  return J(`JSON.stringify((()=>{var d=window.__l12Mod.DEFAULT_THEME_ID;`
    + `var a=document.documentElement.getAttribute('data-theme');`
    + `return {attr:a, expected:${JSON.stringify(id)}, ok:(${JSON.stringify(id)}===d? a===null : a===${JSON.stringify(id)}),`
    + ` stored:localStorage.getItem('jp-os-theme')};})())`);
}

async function applyTheme(id) {
  await ev(`(window.__l12Mod.applyTheme(${JSON.stringify(id)}), 'applied')`);
  const s = await settle();
  const v = await themeApplied(id);
  return { ...s, ...v };
}

/**
 * Presentation, by cat3's ownership rule (its correction 32): a `.fwin-b-liquid` belongs
 * to this window only when its CLOSEST `.fwin` ancestor IS this window. A descendant
 * search finds nested windows' toggles and drives the wrong surface.
 */
/**
 * A `.fwin` carries NO `data-section` — measured, not assumed: its only attributes are
 * `class`, `data-presentation` and an inline `style`. So a window is addressed by its
 * TITLE, exactly as cat3 does, and the section -> title map is DERIVED LIVE by diffing
 * the open title set across the `os:open` rather than restated as a table here (a table
 * would be the hardcoded surface list this harness exists to avoid, and it would rot the
 * first time a window is renamed or localised).
 */
const TITLES = "JSON.stringify([...document.querySelectorAll('.fwin')]"
  + ".map(w => (w.querySelector('.fwin-title-text')||{}).textContent || ''))";
const winExpr = (title) => `[...document.querySelectorAll('.fwin')]`
  + `.find(w => ((w.querySelector('.fwin-title-text')||{}).textContent||'') === ${JSON.stringify(title)})`;

async function readPresentation(section) {
  return J(`JSON.stringify((()=>{var w=${winExpr(section)};`
    + `if(!w) return {present:false};`
    + `var own=[...w.querySelectorAll('.fwin-b-liquid')].filter(b=>b.closest('.fwin')===w);`
    + `return {present:true, attr:w.getAttribute('data-presentation'),`
    + ` liquid:w.classList.contains('fwin-liquid')||w.getAttribute('data-presentation')==='liquid',`
    + ` toggle:own.length>0, nested:w.querySelectorAll('.fwin-b-liquid').length-own.length,`
    + ` maximized:w.classList.contains('fwin-max')};})())`);
}

async function setPresentation(section, want) {
  const cur = await readPresentation(section);
  if (!cur.present) return { ok: false, reason: 'no window' };
  const isLiquid = cur.liquid;
  if ((want === 'liquid') === isLiquid) return { ok: true, changed: false, ...cur };
  if (!cur.toggle) return { ok: false, reason: 'surface offers no presentation toggle of its own', ...cur };
  await ev(`(${winExpr(section)}.querySelector('.fwin-b-liquid').click(), 'clicked')`);
  await settle(3000);
  const after = await readPresentation(section);
  if ((want === 'liquid') !== after.liquid) return { ok: false, reason: `toggle did not reach ${want}`, ...after };
  return { ok: true, changed: true, ...after };
}

/**
 * Dimension 4 — window STATE, which was a label with no mechanism until this was written.
 * The bullet's own words are "standard/Liquid/theme/state", and the first draft accepted a
 * `--states` list, wrote it into every cell tag, and never actually maximized anything: the
 * axis was decorative in exactly the way control C4 exists to catch on the app axis.
 *
 * The maximize control carries NO distinguishing class — `DesktopShell.tsx:3871` renders it
 * as a bare `.fwin-b` whose only label is `t('desktop.maximize')`, which is localised and
 * would rot the moment the harness ran in another language. Two language-independent
 * handles are used together: the glyph is a literal `▢` in source (minimize is `─`), and
 * the button sits immediately before `.fwin-close`. Both must agree, because clicking the
 * wrong sibling MINIMIZES the window and the run would then photograph nothing.
 * Note windows have no min/max pair at all (`isNote &&` guards the fragment), so they
 * report `supported:false` rather than being scored as a failure.
 */
async function readState(title) {
  return J(`JSON.stringify((()=>{var w=${winExpr(title)};if(!w) return {present:false};`
    + `var close=w.querySelector('.fwin-close');`
    + `var glyph=[...w.querySelectorAll('.fwin-b')].filter(b=>b.closest('.fwin')===w&&(b.textContent||'').trim()==='\\u25A2');`
    + `var sib=close&&close.previousElementSibling;`
    + `var btn=glyph.find(b=>b===sib)||null;`
    + `return {present:true, maximized:w.classList.contains('fwin-max'), supported:!!btn,`
    + ` glyphCount:glyph.length, siblingAgrees:!!(btn), rect:(r=>({x:r.x,y:r.y,width:r.width,height:r.height}))(w.getBoundingClientRect())};})())`);
}

async function setState(title, want) {
  const cur = await readState(title);
  if (!cur.present) return { ok: false, reason: 'no window' };
  if (want === 'normal' && !cur.maximized) return { ok: true, changed: false, ...cur };
  if (want === 'maximized' && cur.maximized) return { ok: true, changed: false, ...cur };
  if (!cur.supported) {
    return { ok: false, reason: cur.glyphCount === 0
      ? 'surface has no maximize control of its own (note/frameless chrome)'
      : 'maximize glyph is not the sibling before close — refusing to guess which button it is',
    ...cur };
  }
  await ev(`(()=>{var w=${winExpr(title)};w.querySelector('.fwin-close').previousElementSibling.click();return 'x';})()`);
  await settle(3000);
  const after = await readState(title);
  if (after.maximized !== (want === 'maximized')) return { ok: false, reason: `state did not reach ${want}`, ...after };
  return { ok: true, changed: true, ...after };
}

/**
 * Open a section and return the TITLE of the window that appeared. `os:open` on an
 * already-open window RAISES it and does not remount (banked trap), so a section whose
 * window is already up yields no new title — that is reported as `alreadyOpen` rather
 * than silently mapped to whatever window happened to be last in the list.
 */
async function openSection(section) {
  const before = await J(TITLES);
  await ev(`(window.dispatchEvent(new CustomEvent('os:open', { detail: ${JSON.stringify(section)} })), 'opened')`);
  for (let i = 0; i < 24; i += 1) {
    await sleep(250);
    const after = await J(TITLES);
    const bag = [...before];
    const fresh = after.filter((t) => {
      const k = bag.indexOf(t);
      if (k >= 0) { bag.splice(k, 1); return false; }
      return true;
    });
    if (fresh.length === 1) return { present: true, title: fresh[0], ...(await readPresentation(fresh[0])) };
    if (fresh.length > 1) return { present: false, reason: `os:open produced ${fresh.length} windows: ${fresh.join(' | ')}` };
  }
  return { present: false, reason: 'no new .fwin appeared' };
}

/**
 * `.fwin-close`, measured off the live title bar — there is no `.fwin-b-close`.
 *
 * ON SOME SURFACES CLOSE IS DESTRUCTIVE AND ASKS FIRST. Measured, not assumed: the
 * sticky note's `.fwin-close` is titled "Delete note" and raises a `.ui-dialog` reading
 * "Delete this note? This cannot be undone." A close that stops at the modal leaves BOTH
 * the window and the dialog on the desk — which is exactly the residue the aborted first
 * run left behind, one empty note on desktop 1 that was not in the pre-run layout.
 *
 * Confirming is safe HERE and only here, by construction: `live` contains only windows
 * this run itself opened, so the thing being deleted is the harness's own creation. The
 * confirm is found by `.ui-btn--danger`, which is the product's own destructive-action
 * class and does not move when the UI is localised. A dialog that is NOT the harness's is
 * left strictly alone.
 */
async function closeSection(title) {
  await ev(`(()=>{var w=${winExpr(title)};`
    + `if(w){var b=w.querySelector('.fwin-close');if(b)b.click();}return 'closed';})()`);
  await sleep(220);
  const pending = await ev("[...document.querySelectorAll('.ui-dialog')].filter(d=>d.checkVisibility()).length");
  if (pending > 0) {
    await ev("(()=>{var d=[...document.querySelectorAll('.ui-dialog')].filter(x=>x.checkVisibility())[0];"
      + "var b=d&&d.querySelector('.ui-btn--danger');if(b)b.click();return 'confirmed';})()");
    await sleep(220);
  }
  return { confirmed: pending > 0 };
}

/**
 * Bring a window to the front and return its viewport rect. Windows overlap on this
 * desktop, so a crop taken without raising would photograph whatever occludes the target
 * and label it with the target's name. Raising uses a pointerdown on the window's own
 * root — never the drag bar, which can fire an edge-snap and move the window.
 */
async function raise(title) {
  return J(`JSON.stringify((()=>{var w=${winExpr(title)};`
    + `if(!w) return {ok:false};`
    + `w.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));`
    + `var r=w.getBoundingClientRect();`
    + `return {ok:true, rect:{x:r.x,y:r.y,width:r.width,height:r.height}, z:getComputedStyle(w).zIndex};})())`);
}

/**
 * Capture, hash, and file the PNG. A `rect` crops to one window; without it the capture
 * is the whole renderer and every app at a given theme yields the same bytes (control C4
 * is what makes that failure visible rather than a silently uniform matrix).
 */
/**
 * Capture the same rect until two consecutive frames are byte-identical, and bank that
 * one. This replaced a colour-sampling `settle()` gate that MEASURED THE WRONG THING and
 * the first full run caught it: `settle()` polls `body`/`html`/`.os-desktop` background
 * colours, none of which belong to the window being photographed, so it reported "settled"
 * while the window's OWN theme transition was still animating. C1 then failed at scale —
 * two back-to-back captures of one unchanged cell differed — and the run VOIDed itself
 * with 611 "distinct" images that were partly just different frames of a running
 * transition. Six repeat captures 400 ms apart on three separate windows were 1/6 distinct
 * each, which is what ruled out per-app animation and pointed at the gate instead.
 *
 * Settling on the captured BYTES is strictly stronger than any proxy: it is exactly the
 * artifact being banked. A cell that never converges inside the budget is recorded
 * `converged: false` and is a genuine finding (live/animated content behind a translucent
 * material), not silently averaged away.
 */
async function captureStable(tag, rect, tries = TRIES, gapMs = 300, run = RUN) {
  let prev = null;
  let prevPath = null;
  let streak = 1;
  for (let i = 0; i < tries; i += 1) {
    const r = await post('/screenshot', rect ? { rect } : {});
    if (!r || r.ok !== true) return { ok: false, error: (r && r.error) || 'screenshot failed' };
    const sha = crypto.createHash('sha256').update(fs.readFileSync(r.path)).digest('hex');
    if (prev === sha) {
      streak += 1;
      if (streak >= run) {
        fs.rmSync(prevPath, { force: true });
        return { ...(await file(tag, r)), converged: true, attempts: i + 1, streak };
      }
    } else {
      streak = 1;
    }
    if (prevPath) fs.rmSync(prevPath, { force: true });
    prev = sha; prevPath = r.path;
    await sleep(gapMs);
  }
  const last = { ok: true, path: prevPath, size: null };
  return { ...(await file(tag, last)), converged: false, attempts: tries, streak };
}

/** Move a captured PNG into the matrix directory and hash it. */
async function file(tag, r) {
  const dest = path.join(SHOT_DIR, `${tag}.png`);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.renameSync(r.path, dest);
  const buf = fs.readFileSync(dest);
  return {
    ok: true,
    file: path.relative(REPO, dest).replace(/\\/g, '/'),
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    size: r.size,
  };
}

async function capture(tag, rect) {
  const r = await post('/screenshot', rect ? { rect } : {});
  if (!r || r.ok !== true) return { ok: false, error: (r && r.error) || 'screenshot failed' };
  const dest = path.join(SHOT_DIR, `${tag}.png`);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.renameSync(r.path, dest);
  const buf = fs.readFileSync(dest);
  return {
    ok: true,
    file: path.relative(REPO, dest).replace(/\\/g, '/'),
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    size: r.size,
  };
}

/**
 * `--atlas` — L12 bullet 4's contact sheet, and the second caller that keeps this file out
 * of single-use-probe territory. It was an ACCEPTED-AND-ECHOED FLAG THAT DID NOTHING until
 * this was written, which is the same defect the `--states` axis had: the docstring above
 * claimed it, the console printed `atlas: true`, and no atlas existed.
 *
 * It writes HTML beside the PNGs in gitignored `debug/shots/l12-matrix/`, referencing them
 * by relative filename rather than embedding them, so nothing binary is produced and the
 * committed manifest stays the only durable artifact. The risk column is not decoration:
 * cells that failed, never converged, or missed their theme are listed FIRST and by name,
 * because an atlas whose only job is to look complete is the failure mode here.
 */
function writeAtlas(m) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const risk = m.cells.filter((c) => !c.ok || c.converged === false || c.themeApplied === false);
  const byApp = {};
  for (const c of m.cells) (byApp[c.app] = byApp[c.app] || []).push(c);
  const rows = Object.keys(byApp).map((app) => {
    const cells = byApp[app].map((c) => {
      const name = c.file ? c.file.split('/').pop() : null;
      const bad = !c.ok || c.converged === false;
      return `<figure class="${bad ? 'bad' : ''}">${name ? `<img loading="lazy" src="${esc(name)}" alt="${esc(c.app)}">` : '<div class="miss"></div>'}`
        + `<figcaption>${esc(c.presentation)} · ${esc(c.theme)} · ${esc(c.state)}`
        + `${c.ok ? '' : `<br><b>${esc(c.error || 'no capture')}</b>`}`
        + `${c.converged === false ? '<br><b>never converged</b>' : ''}</figcaption></figure>`;
    }).join('');
    const note = m.apps[app] && m.apps[app].note;
    return `<section><h2>${esc(app)}${note ? ` <small>${esc(note)}</small>` : ''}</h2><div class="grid">${cells}</div></section>`;
  }).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>L12 visual atlas</title>
<style>body{font:13px/1.45 system-ui;background:#111;color:#ddd;margin:24px}
h1{font-size:18px}h2{font-size:15px;margin:24px 0 8px}small{color:#999;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
figure{margin:0;background:#1b1b1b;border:1px solid #2a2a2a;border-radius:8px;padding:6px}
figure.bad{border-color:#a33}img{width:100%;height:auto;display:block;border-radius:4px}
.miss{height:120px;background:#2a1414;border-radius:4px}
figcaption{color:#aaa;font-size:11px;margin-top:5px;word-break:break-word}
.risk{background:#2a1414;border:1px solid #a33;border-radius:8px;padding:10px 14px}
.risk li{margin:2px 0}</style>
<h1>L12 visual atlas — ${esc(m.dimensions.apps.length)} apps × ${esc(m.dimensions.themes.length)} themes × ${esc(m.dimensions.presentations.length)} presentations × ${esc(m.dimensions.states.length)} states</h1>
<p>${esc(m.generatedAt)} · certifiable: <b>${m.certifiable}</b>${m.void ? ` · <b>VOID: ${esc(m.void)}</b>` : ''} · caret frozen: ${m.caretFrozen}</p>
<div class="risk"><b>Remaining risk — ${risk.length} of ${m.cells.length} cells</b><ul>${
  risk.length ? risk.map((c) => `<li>${esc(c.app)} / ${esc(c.presentation)} / ${esc(c.theme)} / ${esc(c.state)} — ${esc(c.error || (c.converged === false ? 'never converged' : 'theme not applied'))}</li>`).join('')
    : '<li>none — every cell captured, converged, and carried the theme it claims</li>'}</ul></div>
${rows}`;
  const dest = path.join(SHOT_DIR, 'atlas.html');
  fs.writeFileSync(dest, html);
  return path.relative(REPO, dest).replace(/\\/g, '/');
}

(async () => {
  const health = await post('/health', {});
  if (!health || health.ok !== true) {
    console.error('REFUSE - bridge is not healthy'); process.exit(2);
  }
  await loadEngine();
  await freezeCaret(true);

  const allThemes = await J('JSON.stringify(window.__l12Mod.listThemes().map(t=>({id:t.id,label:t.label,light:!!t.light,swatch:t.swatch})))');
  const hiddenThemes = await J('JSON.stringify(window.__l12Mod.listThemes({includeHidden:true}).map(t=>t.id))');
  const originalTheme = await ev('localStorage.getItem("jp-os-theme")');

  const themeArg = arg('themes', 'all');
  const themes = themeArg === 'all' ? allThemes.map((t) => t.id)
    : themeArg === '+hidden' ? hiddenThemes
      : themeArg.split(',').map((s) => s.trim()).filter(Boolean);

  const sections = sourceSections();
  const appArg = arg('apps', 'all');
  const requested = appArg === 'all' ? sections : appArg.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = requested.filter((a) => !sections.includes(a));
  if (unknown.length) {
    console.error(`REFUSE - not canonical sections: ${unknown.join(',')}`); process.exit(2);
  }
  const presentations = arg('presentations', 'standard,liquid').split(',').map((s) => s.trim());
  const states = arg('states', 'normal').split(',').map((s) => s.trim());

  const manifest = {
    schema: 'l12-visual-matrix/v1',
    bullet: 'L12 bullet 1 — every app standard/Liquid/theme/state screenshot matrix',
    generatedAt: new Date().toISOString(),
    // Named in the manifest, not just implied by the plate paths, so the atlas and any
    // later integrity check can say WHICH run owns a directory without parsing filenames.
    runId: RUN_ID,
    shotDir: path.relative(REPO, SHOT_DIR).replace(/\\/g, '/'),
    bridge: { pid: cfg.pid, port: cfg.port },
    dimensions: {
      apps: requested, themes, presentations, states,
      themeCatalog: allThemes.map((t) => ({ id: t.id, light: t.light })),
      canonicalSections: sections.length,
    },
    sampledOut: sections.filter((s) => !requested.includes(s)),
    caretFrozen: FREEZE,
    convergence: { run: RUN, tries: TRIES, gapMs: 300 },
    controls: null,
    certifiable: false,
    cells: [],
    apps: {},
    totals: {},
  };
  // A crash mid-sweep must still bank what it measured. Without this a run that dies at
  // cell 164 of 650 leaves nothing at all, and the next worker cannot tell a hard product
  // failure from a dropped socket.
  PARTIAL.m = manifest;
  PARTIAL.out = OUT || path.join(REPO, 'debug', 'l12-matrix-manifest.json');

  // ---- open every requested app once, and record which ones are presentable ----
  const live = [];
  const titleOf = {};
  for (const app of requested) {
    const p = await openSection(app);
    manifest.apps[app] = {
      opened: !!p.present,
      title: p.title || null,
      presentable: !!p.toggle,
      note: !p.present ? (p.reason || 'os:open produced no .fwin — not a windowed app on this shell')
        : !p.toggle ? 'window has no presentation toggle of its own; standard-only'
          : null,
    };
    if (p.present) { live.push(app); titleOf[app] = p.title; }
  }
  if (!live.length) {
    console.error('REFUSE - none of the requested apps opened a window'); process.exit(2);
  }

  // ---- the matrix. Theme is a SHELL property, so it is the OUTER loop: 26 flips, not
  // one per cell. Presentation is per window and is set once per theme pass. ----
  for (const state of states) {
    const stateOk = {};
    for (const app of live) stateOk[app] = await setState(titleOf[app], state);
    for (const pres of presentations) {
      const presOk = {};
      for (const app of live) presOk[app] = await setPresentation(titleOf[app], pres);
      for (const theme of themes) {
        const t = await applyTheme(theme);
        for (const app of live) {
          const tag = `${app}__${pres}__${theme}__${state}`;
          const up = await raise(titleOf[app]);
          const blocked = !presOk[app].ok ? presOk[app].reason
            : !stateOk[app].ok ? `state ${state}: ${stateOk[app].reason}`
              : !up.ok ? 'window vanished before capture' : null;
          const shot = blocked ? { ok: false, error: blocked } : await captureStable(tag, up.rect);
          manifest.cells.push({
            app, theme, presentation: pres, state,
            themeSettled: t.settled, themeSettledMs: t.settledMs, themeApplied: t.ok,
            presentationReached: presOk[app].ok,
            stateReached: stateOk[app].ok,
            rect: up.rect || null,
            ...shot,
          });
        }
      }
    }
    for (const app of live) await setState(titleOf[app], 'normal');
  }

  // ---- controls ----
  if (CONTROL) {
    const app = live.find((a) => manifest.apps[a].presentable) || live[0];
    const dark = allThemes.find((t) => !t.light) || allThemes[0];
    const lightT = allThemes.find((t) => t.light) || allThemes[1];

    const abs = (c) => (c && c.file ? path.join(REPO, c.file) : null);

    await setPresentation(titleOf[app], 'standard');
    await applyTheme(dark.id);
    const r1 = await raise(titleOf[app]);
    const c1a = await captureStable('__c1a', r1.rect);
    const c1b = await captureStable('__c1b', r1.rect);
    const c1delta = await pixelDelta(abs(c1a), abs(c1b));
    const c1 = { kind: 'repeat/must-be-identical', app, theme: dark.id, a: c1a.sha256, b: c1b.sha256,
      converged: [c1a.converged, c1b.converged], attempts: [c1a.attempts, c1b.attempts],
      run: RUN, delta: c1delta,
      pass: !!c1a.sha256 && c1a.sha256 === c1b.sha256 };

    /**
     * C0 — THE FLOOR, and it is what makes every must-differ control below mean anything.
     * A pair of captures of an UNCHANGED settled window, taken exactly as the matrix takes
     * them. Whatever difference survives here is the instrument's own, and any control that
     * claims a difference smaller than this is claiming noise. Measured 0.000% on this
     * desktop, which is why C1 can demand byte-identity at all.
     */
    const c0a = await captureStable('__c0a', r1.rect);
    const c0b = await captureStable('__c0b', r1.rect);
    const c0delta = await pixelDelta(abs(c0a), abs(c0b));
    const c0 = { kind: 'floor/instrument-noise', app, theme: dark.id, delta: c0delta,
      identical: !!c0a.sha256 && c0a.sha256 === c0b.sha256 };

    await applyTheme(lightT.id);
    const c2bShot = await captureStable('__c2b', (await raise(titleOf[app])).rect);
    const c2delta = await pixelDelta(abs(c1a), abs(c2bShot));
    const c2mag = magnitudeVerdict(c2delta);
    const c2 = { kind: 'theme/must-differ', app, themes: [dark.id, lightT.id], a: c1a.sha256, b: c2bShot.sha256,
      delta: c2delta, magnitude: c2mag,
      pass: !!c2bShot.sha256 && c1a.sha256 !== c2bShot.sha256 && c2mag.enough !== false };
    const c2b = c2bShot;

    await applyTheme(dark.id);
    const presRes = await setPresentation(titleOf[app], 'liquid');
    const c3b = presRes.ok ? await captureStable('__c3b', (await raise(titleOf[app])).rect) : { sha256: null };
    const c3delta = presRes.ok ? await pixelDelta(abs(c1a), abs(c3b)) : null;
    const c3mag = presRes.ok ? magnitudeVerdict(c3delta) : { enough: null, why: 'liquid not reached' };
    const c3 = {
      kind: 'presentation/must-differ', app, theme: dark.id,
      a: c1a.sha256, b: c3b.sha256, reached: presRes.ok,
      delta: c3delta, magnitude: c3mag,
      pass: presRes.ok ? (!!c3b.sha256 && c1a.sha256 !== c3b.sha256 && c3mag.enough !== false) : null,
      note: presRes.ok ? null : `could not reach liquid: ${presRes.reason}`,
    };
    await setPresentation(titleOf[app], 'standard');

    /**
     * C4 — APP / must DIFFER. The one the first draft of this harness could not have
     * caught: `/screenshot` captures the WHOLE renderer, so with several windows open
     * every app at a given theme/presentation returned identical bytes and the "app"
     * axis was decorative. Two different apps, same theme, same presentation, must
     * produce different images. Needs a second live app; with only one it is `null`,
     * never a pass.
     */
    const other = live.find((a) => a !== app);
    let c4 = { kind: 'app/must-differ', pass: null, note: 'only one app live; the app axis is unfalsified in this run' };
    if (other) {
      await applyTheme(dark.id);
      const ra = await raise(titleOf[app]);
      const ca = await captureStable('__c4a', ra.rect);
      const rb = await raise(titleOf[other]);
      const cb = await captureStable('__c4b', rb.rect);
      const c4delta = await pixelDelta(abs(ca), abs(cb));
      const c4mag = magnitudeVerdict(c4delta);
      c4 = {
        kind: 'app/must-differ', theme: dark.id, apps: [app, other],
        a: ca.sha256, b: cb.sha256, delta: c4delta, magnitude: c4mag,
        pass: !!ca.sha256 && !!cb.sha256 && ca.sha256 !== cb.sha256 && c4mag.enough !== false,
      };
    }

    /**
     * C5 — STATE / must DIFFER, and it is scored on the RECT before the pixels. Maximizing
     * changes the capture's dimensions, so a pixel comparison has no common grid and would
     * pass trivially on "different sizes" — which is true but says nothing about whether
     * the window actually maximized. So the falsifiable claim is geometric: the maximized
     * rect must be strictly larger in area than the normal one, on the window's own
     * measurement. A surface with no maximize control of its own reports `null`, never a
     * pass, exactly as C4 does with only one app live.
     */
    let c5 = { kind: 'state/must-differ', pass: null, note: 'not attempted' };
    {
      const nrm = await setState(titleOf[app], 'normal');
      const maxd = await setState(titleOf[app], 'maximized');
      if (!maxd.ok) {
        c5 = { kind: 'state/must-differ', app, pass: null, note: `maximize not reachable: ${maxd.reason}` };
      } else {
        const an = nrm.rect ? nrm.rect.width * nrm.rect.height : 0;
        const am = maxd.rect ? maxd.rect.width * maxd.rect.height : 0;
        const cm = await captureStable('__c5b', maxd.rect);
        c5 = {
          kind: 'state/must-differ', app,
          normalRect: nrm.rect, maximizedRect: maxd.rect,
          areaNormal: an, areaMaximized: am, areaRatio: an ? +(am / an).toFixed(2) : null,
          b: cm.sha256,
          pass: am > an && !!cm.sha256,
        };
        await setState(titleOf[app], 'normal');
      }
    }

    manifest.controls = { c0, c1, c2, c3, c4, c5 };
    manifest.magnitudeGate = sharp ? { pctOver8AtLeast: DIFF_MIN_PCT } : null;
    manifest.certifiable = c1.pass && c2.pass && c3.pass !== false && c4.pass !== false && c5.pass !== false;
    if (!c1.pass) manifest.void = 'C1 FAILED — the capture is not repeatable, so every difference below is unattributable';
    if (c4.pass === false) manifest.void = 'C4 FAILED — two different apps produced identical images, so the app axis measures nothing';
    // Last, so it OUTRANKS the C1 message: a non-zero floor explains a C1 failure and
    // changes what the right gate even is, which the reader must be told first.
    if (c0.delta && c0.delta.pctDiff > 0) {
      manifest.void = `FLOOR IS NOT ZERO — C0 measured ${c0.delta.pctDiff}% of pixels moving on an unchanged window (max channel delta ${c0.delta.maxDelta}), so byte-identity is the wrong C1 gate on this machine and every verdict here needs a tolerance first`;
    }
  }

  // ---- restore: theme is persisted state; a harness that drives it and exits owes it back ----
  await applyTheme(originalTheme || 'study-os');
  const restored = await themeApplied(originalTheme || 'study-os');
  manifest.restore = { theme: originalTheme, ok: restored.ok, stored: restored.stored };
  await freezeCaret(false);
  manifest.restore.caretFreezeRemoved = await ev("!document.getElementById('__l12freeze')");
  let confirms = 0;
  if (!KEEP) for (const app of live) confirms += (await closeSection(titleOf[app])).confirmed ? 1 : 0;
  manifest.restore.windowsClosed = !KEEP;
  manifest.restore.destructiveConfirms = confirms;
  // The desk this run owes back, stated as numbers rather than "restored": anything left
  // here is residue, and the previous aborted run's residue is why this is recorded at all.
  manifest.restore.windowsLeft = await ev("document.querySelectorAll('.fwin').length");
  manifest.restore.dialogsLeft = await ev("[...document.querySelectorAll('.ui-dialog')].filter(d=>d.checkVisibility()).length");

  const cells = manifest.cells;
  manifest.totals = {
    cells: cells.length,
    captured: cells.filter((c) => c.ok).length,
    failed: cells.filter((c) => !c.ok).length,
    distinctImages: new Set(cells.filter((c) => c.sha256).map((c) => c.sha256)).size,
    unsettled: cells.filter((c) => !c.themeSettled).length,
    stateBlocked: cells.filter((c) => c.stateReached === false).length,
    unconverged: cells.filter((c) => c.ok && !c.converged).length,
    captureAttemptsTotal: cells.reduce((n, c) => n + (c.attempts || 0), 0),
    themeMisapplied: cells.filter((c) => !c.themeApplied).length,
    appsOpened: live.length,
    appsPresentable: live.filter((a) => manifest.apps[a].presentable).length,
    bytes: cells.reduce((n, c) => n + (c.bytes || 0), 0),
  };

  const out = OUT || path.join(REPO, 'debug', 'l12-matrix-manifest.json');
  // Atlas BEFORE the manifest is written, or `atlasFile` is set on an object already
  // serialised and the JSON never mentions the artifact it produced.
  if (ATLAS) manifest.atlasFile = writeAtlas(manifest);
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    out: path.relative(REPO, out).replace(/\\/g, '/'),
    ...manifest.totals,
    retries,
    controls: manifest.controls && {
      c0: manifest.controls.c0.identical, c1: manifest.controls.c1.pass,
      c2: manifest.controls.c2.pass, c3: manifest.controls.c3.pass,
      c4: manifest.controls.c4.pass, c5: manifest.controls.c5.pass,
    },
    certifiable: manifest.certifiable,
    void: manifest.void || null,
    caretFrozen: FREEZE,
    atlas: ATLAS,
  }, null, 2));
  if (manifest.void) process.exit(1);
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  if (PARTIAL.m && PARTIAL.out) {
    PARTIAL.m.aborted = { at: new Date().toISOString(), error: String((e && e.message) || e), cellsBanked: PARTIAL.m.cells.length, retries };
    PARTIAL.m.certifiable = false;
    try {
      fs.writeFileSync(PARTIAL.out, `${JSON.stringify(PARTIAL.m, null, 2)}
`);
      console.error(`PARTIAL manifest written: ${path.relative(REPO, PARTIAL.out)} (${PARTIAL.m.cells.length} cells)`);
    } catch (w) { console.error(`could not write partial manifest: ${w.message}`); }
  }
  process.exit(1);
});
