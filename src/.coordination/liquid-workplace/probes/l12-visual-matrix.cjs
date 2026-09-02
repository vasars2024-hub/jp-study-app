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
 * L12 bullet 4's "final visual atlas" is this same harness with `--atlas`, which is the
 * second caller that keeps it out of single-use territory.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/l12-visual-matrix.cjs \
 *     [--apps all|a,b,c] [--themes all|+hidden|a,b] [--presentations standard,liquid] \
 *     [--states normal,maximized] [--out file] [--control] [--keep] [--atlas]
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
 * (3) `study-os` IS THE DEFAULT AND CARRIES NO `data-theme` ATTRIBUTE AT ALL —
 *     `applyTheme` REMOVES it for the default id (engine.ts:147). A verifier that reads
 *     the attribute back to confirm the flip therefore scores the default theme as a
 *     FAILURE every time. `themeApplied()` compares against the id the engine reports it
 *     is on, and treats `null === DEFAULT_THEME_ID` as correct.
 *
 * ---------------------------------------------------------------------------------
 * THE CONTROLS, because 182 PNGs of the same picture is a matrix that proves nothing and
 * would look exactly like a successful run. `--control` runs four, in this order:
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
const OUT = arg('out', '');
const SHOT_DIR = path.join(REPO, 'debug', 'shots', 'l12-matrix');

/** Dimension 1 — apps, parsed out of the canonical list rather than restated here. */
function sourceSections() {
  const src = fs.readFileSync(path.join(REPO, 'src', 'shared', 'desktop.ts'), 'utf8');
  const m = src.match(/export const DESKTOP_WIN_SECTIONS = \[([\s\S]*?)\] as const;/);
  if (!m) throw new Error('REFUSE - could not parse DESKTOP_WIN_SECTIONS from src/shared/desktop.ts');
  return m[1].split(',').map((s) => (s.match(/'([^']+)'/) || [])[1]).filter(Boolean);
}

const cfgPath = path.join(REPO, 'debug', 'bridge.json');
if (!fs.existsSync(cfgPath)) {
  console.error('REFUSE - no debug/bridge.json; the app is not running with the debug bridge');
  process.exit(2);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(route, body) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
    method: 'POST', headers: H, body: JSON.stringify(body || {}),
  });
  return r.json();
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

/** `.fwin-close`, measured off the live title bar — there is no `.fwin-b-close`. */
async function closeSection(title) {
  await ev(`(()=>{var w=${winExpr(title)};`
    + `if(w){var b=w.querySelector('.fwin-close');if(b)b.click();}return 'closed';})()`);
  await sleep(150);
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
async function captureStable(tag, rect, tries = 8, gapMs = 220) {
  let prev = null;
  let prevPath = null;
  for (let i = 0; i < tries; i += 1) {
    const r = await post('/screenshot', rect ? { rect } : {});
    if (!r || r.ok !== true) return { ok: false, error: (r && r.error) || 'screenshot failed' };
    const sha = crypto.createHash('sha256').update(fs.readFileSync(r.path)).digest('hex');
    if (prev === sha) {
      fs.rmSync(prevPath, { force: true });
      return { ...(await file(tag, r)), converged: true, attempts: i + 1 };
    }
    if (prevPath) fs.rmSync(prevPath, { force: true });
    prev = sha; prevPath = r.path;
    await sleep(gapMs);
  }
  const last = { ok: true, path: prevPath, size: null };
  return { ...(await file(tag, last)), converged: false, attempts: tries };
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

(async () => {
  const health = await post('/health', {});
  if (!health || health.ok !== true) {
    console.error('REFUSE - bridge is not healthy'); process.exit(2);
  }
  await loadEngine();

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
    bridge: { pid: cfg.pid, port: cfg.port },
    dimensions: {
      apps: requested, themes, presentations, states,
      themeCatalog: allThemes.map((t) => ({ id: t.id, light: t.light })),
      canonicalSections: sections.length,
    },
    sampledOut: sections.filter((s) => !requested.includes(s)),
    controls: null,
    certifiable: false,
    cells: [],
    apps: {},
    totals: {},
  };

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
    for (const pres of presentations) {
      const presOk = {};
      for (const app of live) presOk[app] = await setPresentation(titleOf[app], pres);
      for (const theme of themes) {
        const t = await applyTheme(theme);
        for (const app of live) {
          const tag = `${app}__${pres}__${theme}__${state}`;
          const up = await raise(titleOf[app]);
          const shot = presOk[app].ok && up.ok
            ? await captureStable(tag, up.rect)
            : { ok: false, error: presOk[app].ok ? 'window vanished before capture' : presOk[app].reason };
          manifest.cells.push({
            app, theme, presentation: pres, state,
            themeSettled: t.settled, themeSettledMs: t.settledMs, themeApplied: t.ok,
            presentationReached: presOk[app].ok,
            rect: up.rect || null,
            ...shot,
          });
        }
      }
    }
  }

  // ---- controls ----
  if (CONTROL) {
    const app = live.find((a) => manifest.apps[a].presentable) || live[0];
    const dark = allThemes.find((t) => !t.light) || allThemes[0];
    const lightT = allThemes.find((t) => t.light) || allThemes[1];

    await setPresentation(titleOf[app], 'standard');
    await applyTheme(dark.id);
    const r1 = await raise(titleOf[app]);
    const c1a = await captureStable('__c1a', r1.rect);
    const c1b = await captureStable('__c1b', r1.rect);
    const c1 = { kind: 'repeat/must-be-identical', app, theme: dark.id, a: c1a.sha256, b: c1b.sha256,
      converged: [c1a.converged, c1b.converged], attempts: [c1a.attempts, c1b.attempts],
      pass: !!c1a.sha256 && c1a.sha256 === c1b.sha256 };

    await applyTheme(lightT.id);
    const c2b = await captureStable('__c2b', (await raise(titleOf[app])).rect);
    const c2 = { kind: 'theme/must-differ', app, themes: [dark.id, lightT.id], a: c1a.sha256, b: c2b.sha256, pass: !!c2b.sha256 && c1a.sha256 !== c2b.sha256 };

    await applyTheme(dark.id);
    const presRes = await setPresentation(titleOf[app], 'liquid');
    const c3b = presRes.ok ? await captureStable('__c3b', (await raise(titleOf[app])).rect) : { sha256: null };
    const c3 = {
      kind: 'presentation/must-differ', app, theme: dark.id,
      a: c1a.sha256, b: c3b.sha256, reached: presRes.ok,
      pass: presRes.ok ? (!!c3b.sha256 && c1a.sha256 !== c3b.sha256) : null,
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
      c4 = {
        kind: 'app/must-differ', theme: dark.id, apps: [app, other],
        a: ca.sha256, b: cb.sha256,
        pass: !!ca.sha256 && !!cb.sha256 && ca.sha256 !== cb.sha256,
      };
    }

    manifest.controls = { c1, c2, c3, c4 };
    manifest.certifiable = c1.pass && c2.pass && c3.pass !== false && c4.pass !== false;
    if (!c1.pass) manifest.void = 'C1 FAILED — the capture is not repeatable, so every difference below is unattributable';
    if (c4.pass === false) manifest.void = 'C4 FAILED — two different apps produced identical images, so the app axis measures nothing';
  }

  // ---- restore: theme is persisted state; a harness that drives it and exits owes it back ----
  await applyTheme(originalTheme || 'study-os');
  const restored = await themeApplied(originalTheme || 'study-os');
  manifest.restore = { theme: originalTheme, ok: restored.ok, stored: restored.stored };
  if (!KEEP) for (const app of live) await closeSection(titleOf[app]);
  manifest.restore.windowsClosed = !KEEP;

  const cells = manifest.cells;
  manifest.totals = {
    cells: cells.length,
    captured: cells.filter((c) => c.ok).length,
    failed: cells.filter((c) => !c.ok).length,
    distinctImages: new Set(cells.filter((c) => c.sha256).map((c) => c.sha256)).size,
    unsettled: cells.filter((c) => !c.themeSettled).length,
    unconverged: cells.filter((c) => c.ok && !c.converged).length,
    captureAttemptsTotal: cells.reduce((n, c) => n + (c.attempts || 0), 0),
    themeMisapplied: cells.filter((c) => !c.themeApplied).length,
    appsOpened: live.length,
    appsPresentable: live.filter((a) => manifest.apps[a].presentable).length,
    bytes: cells.reduce((n, c) => n + (c.bytes || 0), 0),
  };

  const out = OUT || path.join(REPO, 'debug', 'l12-matrix-manifest.json');
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    out: path.relative(REPO, out).replace(/\\/g, '/'),
    ...manifest.totals,
    controls: manifest.controls && {
      c1: manifest.controls.c1.pass, c2: manifest.controls.c2.pass,
      c3: manifest.controls.c3.pass, c4: manifest.controls.c4.pass,
    },
    certifiable: manifest.certifiable,
    void: manifest.void || null,
    atlas: ATLAS,
  }, null, 2));
  if (manifest.void) process.exit(1);
})().catch((e) => { console.error(String((e && e.stack) || e)); process.exit(1); });
