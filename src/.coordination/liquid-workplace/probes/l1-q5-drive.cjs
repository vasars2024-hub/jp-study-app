/**
 * L1 driver — rubric category 5's **Q5**, *"every readable surface has stable contrast"*.
 *
 * WHY THIS FILE EXISTS. `l1-ui-clarity.js:347` answered Q5 with the string literal `'INHERIT'`
 * and the note *"inheritedFrom: l1-accessibility.js, re-driven at this tree"*. That is the same
 * shape Q9 carried until `l1-q9-drive.cjs` replaced it: **a hardcoded verdict reads as a number
 * nobody computed.** Worse here, because the inheritance is not even wrong in the same direction
 * — category 1 on Video scored `minRatio 5.13` in ONE cell (forest-night, liquid, every
 * disclosure closed), and Q5 does not ask "is contrast passing", it asks whether it is
 * **STABLE**. A single-cell number cannot answer a stability question at all.
 *
 * WHAT "STABLE" MEANS HERE, AND WHY THESE TWO AXES. A Liquid surface's real contrast is a
 * function of what it is painted over and of which text is on screen, so a number taken once is
 * a sample, not a property. Two axes are measurable through this instrument and both are real:
 *
 *   1. **THEME.** `l1-accessibility.js`'s own header states the governing check: *"a contrast
 *      defect MOVES WITH THE PALETTE. A number that does not move when the theme changes is
 *      counting elements, not measuring contrast."* That check had never been run on the Video
 *      window. It is a term here, and a term that VOIDS rather than passes: if the two themes
 *      report the same `minRatio`, the theme swap did not reach the paint and the whole run is
 *      void.
 *   2. **DISCLOSURE STATE.** `e61d3179` moved eight Media Center destinations behind
 *      `details.mc-nav-group` and `details.medialib-view`. Text inside a CLOSED `<details>` is
 *      filtered out by the probe's `painted()` (`checkVisibility({contentVisibilityAuto:true})`)
 *      — correctly, but it means that population's contrast has **never been measured on any
 *      run**. Buying Q4's point by hiding controls, and then scoring Q5 only on what is left
 *      visible, would be the exact trade the rubric exists to catch. So the disclosures are
 *      opened and the population must grow; a cell that does not grow proves the axis is a no-op
 *      and fails term 4.
 *
 * NOT AXES, and recorded so no later worker adds them thinking they were missed. Moving the
 * window over a lighter part of the wallpaper changes nothing this instrument can see:
 * `effectiveBg` composites ancestor `background-color` down to `document.body`'s and never
 * samples what a `backdrop-filter` is actually blurring. A probe axis that cannot move the
 * number is worse than no axis — it manufactures a passing cell. Hover is excluded for the
 * separate reason in `hover-sticks-after-a-bridge-click`.
 *
 * THEME SWITCHING IS NON-PERSISTENT AND THAT IS DELIBERATE. `applyTheme()`
 * (`renderer/theme/engine.ts:144`) writes `localStorage` unless `persist: false`, and the engine
 * is not on `window`. This driver stamps `data-theme` on `<html>` directly, which is the same
 * choke point `applyTheme` uses for these two themes — neither `forest-night` nor
 * `classic-light` declares `materialSet` or `dataAttrs` (`engine.ts:71`, `:82`), so there are no
 * managed attributes to mirror, and the live `<html>` carries no `data-materials`. `jp-os-theme`
 * is never written. The one thing this does NOT do is re-render React's theme context; contrast
 * inside the window is CSS-variable driven, and term 3 proves the swap reached the paint.
 *
 * THE CONTROLS. Two, because the run has two ways to pass falsely.
 *   `--control plant`  — injects one span whose own opaque background is 1.07:1 against its own
 *                        text into the window body. `failingCount` must become >= 1 and the
 *                        verdict must read NO. A contrast term that has never caught a low
 *                        contrast element has not been shown to work.
 *   `--control frozen` — runs the "second theme" as the SAME theme. Term 3 must fail and the
 *                        run must read VOID, not YES. This is the guard on the guard: without
 *                        it, a theme swap that silently did nothing would report two identical
 *                        passing cells and look like extra evidence.
 * A control run parks nothing, and asserts that it parked nothing.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l1-q5-drive.cjs [--title Video]
 *      [--alt classic-light] [--control plant|frozen]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const A11Y = 'src/.coordination/liquid-workplace/probes/l1-accessibility.js';

const arg = (name, dflt) => {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};

const TITLE = arg('title', 'Video');
const ALT_THEME = arg('alt', 'classic-light');
const CONTROL = arg('control', null);
if (CONTROL && CONTROL !== 'plant' && CONTROL !== 'frozen') {
  throw new Error(`unknown --control ${CONTROL}; expected plant or frozen`);
}
const PLANT_ATTR = 'data-l1q5-plant';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  // The bridge returns `result: null` both for an expression that THREW and for one that
  // returned nothing, so a null is never quietly treated as an answer.
  if (t.result === null) throw new Error('eval returned null — the expression threw or returned nothing');
  try { return JSON.parse(t.result); } catch { return t.result; }
}

/** Window resolution is BY TITLE everywhere in this directory — see `l1-q4-guards.cjs`'s repair. */
const winExpr = `[...document.querySelectorAll('.fwin')].find((w) => ((w.querySelector('.fwin-title-text')||{}).textContent||'').indexOf(${JSON.stringify(TITLE)}) >= 0)`;

/** Read the source probe once; the bridge takes ONE EXPRESSION, so the trailing `;` must go. */
const a11ySrc = fs.readFileSync(A11Y, 'utf8').replace(/\s*;\s*$/, '').trimEnd();

/** One cell = the owning instrument, re-driven, pointed at this window. Never re-implemented. */
async function cell(name, theme, disclosuresOpen) {
  await ev(`(() => { document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)}); return 'ok'; })()`);
  await ev(`(() => { const w = ${winExpr}; if (!w) return 'no-window';
    [...w.querySelectorAll('details')].forEach((d) => { d.open = ${disclosuresOpen ? 'true' : 'false'}; });
    return String(w.querySelectorAll('details[open]').length); })()`);
  /**
   * A THEME SWAP IS A COLOUR TRANSITION, AND `getComputedStyle` DURING ONE RETURNS THE OLD
   * COLOUR. Measured 2026-08-25: read synchronously after the `data-theme` swap,
   * `.mc-nav button.is-active` reported rgb(255, 255, 255) while its own
   * `--mc-nav-active-ink` already read `#1e1e1e` and the winning rule was
   * `color: var(--mc-nav-active-ink)` — an impossible-looking pair that is simply the
   * transition mid-flight. That reads exactly like a fix that did not land. `--dur-normal` is
   * 240ms and chrome rules use it, so the settle has to clear it with room.
   */
  await sleep(700);
  await ev(`(() => { window.__lqScoreTitle = ${JSON.stringify(TITLE)}; return 'ok'; })()`);
  const r = await ev(a11ySrc);
  if (r.refuse) throw new Error(`cell ${name}: instrument refused — ${r.refuse}`);
  return {
    cell: name,
    theme: r.theme,
    disclosuresOpen,
    box: r.box,
    parserOk: !!(r.parserSelfTest && r.parserSelfTest.ok),
    measured: r.text.measured,
    unmeasurable: r.text.unmeasurable,
    minRatio: r.text.minRatio,
    minOwner: r.text.minOwner,
    failingCount: r.text.failingCount,
    worst: r.text.worst,
  };
}

(async () => {
  const out = { at: new Date().toISOString(), title: TITLE, control: CONTROL, question: 'every readable surface has stable contrast' };

  // As-found state, captured so the restore is verified rather than assumed.
  const asFound = await ev(`(() => { const w = ${winExpr};
    if (!w) return JSON.stringify({ refuse: 'no .fwin titled ${TITLE}' });
    return JSON.stringify({
      theme: document.documentElement.getAttribute('data-theme'),
      presentation: w.getAttribute('data-presentation'),
      label: ((w.querySelector('.fwin-title-text')||{}).textContent||'').trim(),
      details: [...w.querySelectorAll('details')].map((d) => (d.className || d.tagName) + ':' + d.open),
    }); })()`);
  if (asFound.refuse) throw new Error(asFound.refuse);
  out.asFound = asFound;

  /**
   * THE DISCLOSURE AXIS TOUCHES PERSISTED STATE, so it is capture-patch-restore and the
   * restore is compared with `===`, not by eye. `details.mc-nav-group` is CONTROLLED
   * (`MediaCenterView.tsx:1771` `open={toolsOpen}`) and its `onToggle` runs
   * `setNavToolsOpen`, which writes `jp-mc-nav-tools-open` (`:1519`). Setting `d.open` from a
   * probe fires the native `toggle` event, so React persists it exactly as a user click would.
   */
  const STORE_KEYS = ['jp-mc-nav-tools-open', 'jp-os-theme', 'jp-os-theme-engine-v'];
  const readStore = () => ev(`(() => JSON.stringify(Object.fromEntries(${JSON.stringify(STORE_KEYS)}.map((k) => [k, localStorage.getItem(k)]))))()`);
  out.storeBefore = await readStore();
  const BASE_THEME = asFound.theme;
  const SECOND_THEME = CONTROL === 'frozen' ? BASE_THEME : ALT_THEME;
  out.axes = { theme: [BASE_THEME, SECOND_THEME], disclosures: ['closed', 'open'] };

  if (CONTROL === 'plant') {
    // Its OWN opaque background, so the planted ratio is the same in every theme: #808080
    // behind #8a8a8a is 1.07:1 against a 4.5 bar. `effectiveBg` starts at the element itself.
    out.planted = await ev(`(() => { const w = ${winExpr}; if (!w) return 'no-window';
      const host = w.querySelector('.fwin-body') || w;
      const s = document.createElement('span');
      s.setAttribute(${JSON.stringify(PLANT_ATTR)}, '1');
      s.style.cssText = 'display:inline-block;padding:6px 10px;background:#808080;color:#8a8a8a;font-size:14px';
      s.textContent = 'q5 plant';
      host.appendChild(s);
      return String(document.querySelectorAll('[${PLANT_ATTR}]').length); })()`);
  }

  out.cells = [];
  out.cells.push(await cell('A base/closed', BASE_THEME, false));
  out.cells.push(await cell('B base/open', BASE_THEME, true));
  out.cells.push(await cell('C alt/closed', SECOND_THEME, false));
  out.cells.push(await cell('D alt/open', SECOND_THEME, true));

  // ---- restore, then verify it, before any verdict is computed -------------------------------
  if (CONTROL === 'plant') {
    await ev(`(() => { document.querySelectorAll('[${PLANT_ATTR}]').forEach((n) => n.remove()); return 'ok'; })()`);
  }
  const wantOpen = JSON.parse(JSON.stringify(asFound.details)).map((d) => d.endsWith(':true'));
  out.restored = await ev(`(() => { const w = ${winExpr}; if (!w) return JSON.stringify({ refuse: 'window gone' });
    document.documentElement.setAttribute('data-theme', ${JSON.stringify(BASE_THEME)});
    const want = ${JSON.stringify(wantOpen)};
    [...w.querySelectorAll('details')].forEach((d, i) => { d.open = !!want[i]; });
    return JSON.stringify({
      theme: document.documentElement.getAttribute('data-theme'),
      presentation: w.getAttribute('data-presentation'),
      details: [...w.querySelectorAll('details')].map((d) => (d.className || d.tagName) + ':' + d.open),
      plantResidue: document.querySelectorAll('[${PLANT_ATTR}]').length,
      storedTheme: localStorage.getItem('jp-os-theme'),
    }); })()`);
  await sleep(200); // the controlled `<details>` persists through a React state commit
  out.storeAfter = await readStore();
  out.storeIdentical = JSON.stringify(out.storeBefore) === JSON.stringify(out.storeAfter);
  out.restoredExactly =
    out.restored.theme === asFound.theme &&
    out.restored.presentation === asFound.presentation &&
    JSON.stringify(out.restored.details) === JSON.stringify(asFound.details) &&
    out.restored.plantResidue === 0 &&
    out.restored.storedTheme === BASE_THEME &&
    out.storeIdentical;

  // ---- terms ---------------------------------------------------------------------------------
  const cells = out.cells;
  const closedBase = cells[0];
  const openBase = cells[1];
  const byTheme = (t) => cells.filter((c) => c.theme === t);
  const minOf = (list) => list.reduce((m, c) => (m === null || c.minRatio < m ? c.minRatio : m), null);
  const baseMin = minOf(byTheme(BASE_THEME));
  const altMin = minOf(byTheme(SECOND_THEME));

  out.terms = {
    // 1. Nothing under its own WCAG bar in ANY cell — the question is "every readable surface".
    noFailingTextInAnyCell: cells.every((c) => c.failingCount === 0),
    // 2. A colour the parser cannot read scores as ABSENT, which is indistinguishable from clean.
    noUnmeasurableInAnyCell: cells.every((c) => c.unmeasurable === 0),
    // 3. THE GOVERNING CHECK. If the palette moves and the number does not, this is counting
    //    elements. Voids the run rather than passing it.
    themeMovedTheNumbers: baseMin !== null && altMin !== null && Math.abs(baseMin - altMin) > 0.05,
    // 4. The disclosure axis must actually enlarge the population, or it measured nothing new.
    disclosureAddedPopulation: openBase.measured > closedBase.measured,
    // 5. The rubric caps a category measured on an empty harness at 0 rather than scoring it.
    populationFloor: cells.every((c) => c.measured >= 20),
    // 6. The instrument's own parser self-test, in every cell.
    parserSelfTestInAnyCell: cells.every((c) => c.parserOk),
  };
  out.numbers = {
    perCell: cells.map((c) => `${c.cell} theme=${c.theme} measured=${c.measured} min=${c.minRatio} failing=${c.failingCount}`),
    minByTheme: { [BASE_THEME]: baseMin, [SECOND_THEME]: altMin },
    themeDelta: baseMin !== null && altMin !== null ? Number(Math.abs(baseMin - altMin).toFixed(2)) : null,
    populationClosedVsOpen: `${closedBase.measured} -> ${openBase.measured}`,
    newlyMeasuredByDisclosure: openBase.measured - closedBase.measured,
    totalFailing: cells.reduce((n, c) => n + c.failingCount, 0),
    worstOverall: cells.slice().sort((a, b) => a.minRatio - b.minRatio)[0],
  };

  const failed = Object.entries(out.terms).filter(([, v]) => !v).map(([k]) => k);
  // A failed term 3 is not a NO about the product — it is a void instrument, and the rubric says
  // so explicitly. Keep the two outcomes distinguishable.
  out.verdict = failed.length === 0
    ? 'YES'
    : (failed.length === 1 && failed[0] === 'themeMovedTheNumbers' ? 'VOID' : 'NO');
  out.why = failed.length === 0
    ? `${cells.length} cells across ${new Set(cells.map((c) => c.theme)).size} themes x closed/open disclosures: 0 failing of ${cells.reduce((n, c) => n + c.measured, 0)} measured, worst ${out.numbers.worstOverall.minRatio}:1 (${out.numbers.worstOverall.minOwner}), theme delta ${out.numbers.themeDelta}`
    : `failed terms: ${failed.join(', ')}`;

  if (CONTROL) {
    out.parked = false;
    out.controlHeld = CONTROL === 'plant' ? out.verdict === 'NO' : out.verdict === 'VOID';
    out.controlNote = out.controlHeld
      ? `control '${CONTROL}' produced ${out.verdict} — the term is doing work`
      : `CONTROL DID NOT FAIL: Q5 still ${out.verdict}. Per the rubric this VOIDS the score rather than earning it.`;
  } else if (out.verdict === 'YES' && out.restoredExactly) {
    /**
     * ONE SLOT PER SURFACE, keyed by the window title this run actually measured.
     * `l1-q78-drive.cjs` and `l1-q9-drive.cjs` both park on a single global, so whichever
     * surface ran last decides the question for every window `l1-ui-clarity.js` renders — a
     * cross-surface false pass the clarity probe cannot see. This registry is keyed so it cannot.
     */
    out.parkedOn = `__q5verdicts[${JSON.stringify(out.asFound.label)}]`;
    const body = JSON.stringify({
      verdict: out.verdict, why: out.why, title: TITLE, terms: out.terms, numbers: out.numbers, at: out.at,
    });
    out.parked = await ev(`(() => { window.__q5verdicts = window.__q5verdicts || {};
      window.__q5verdicts[${JSON.stringify(out.asFound.label)}] = ${body};
      return JSON.stringify({ parked: Object.keys(window.__q5verdicts) }); })()`);
  } else {
    out.parked = false;
    out.parkedNote = `not parked — verdict ${out.verdict}, restoredExactly ${out.restoredExactly}`;
  }

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(
    `src/.coordination/liquid-workplace/baselines/l1-q5-${TITLE.toLowerCase()}-${CONTROL ? `control-${CONTROL}` : 'run'}.json`,
    JSON.stringify(out, null, 1),
  );
  if (out.verdict !== 'YES' && !CONTROL) process.exit(1);
})().catch(async (e) => {
  console.error('DRIVER FAILED', e.message);
  // Every mutation this driver makes is DOM-only and non-persistent; put them all back.
  try {
    console.error('RESTORE', JSON.stringify(await ev(
      `(() => { document.querySelectorAll('[${PLANT_ATTR}]').forEach((n) => n.remove());
        return JSON.stringify({ theme: document.documentElement.getAttribute('data-theme'), residue: document.querySelectorAll('[${PLANT_ATTR}]').length }); })()`,
    )));
  } catch { /* the window may be gone */ }
  process.exit(1);
});
