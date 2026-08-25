/**
 * L1 guards for rubric category 5's **Q6** — "Liquid motion explains a real relationship".
 *
 * Q6 was NO on the Video window with `liquidRegions` 4 / `carryingATransition` 3. The dissenting
 * element was `span.medialib-card__badge`: a 35x34 episode-count chip on a poster,
 * `backdrop-filter: blur(6px)` over a fixed `rgb(0 0 0 / 0.66)`, no transition
 * (`mediaLibrary.css:495`). It is a static label with no state to change, so the only way to
 * satisfy the old term was to give a chip decorative motion — the failure Q6 exists to catch. The
 * term has been narrowed to *containers*: a Liquid region is not a control and holds at least one
 * painted element child.
 *
 * **A redefinition that flips a score needs its own controls**, or it is indistinguishable from
 * moving the bar until the surface passes. This is the same rule `l1-q4-guards.cjs` was written
 * under, and it is why both guards below have to fire or the score is VOID rather than 10.
 *
 * GUARD 1 — `containerPlant`. A real Liquid-material CONTAINER (backdrop-filter, a painted child,
 * `transition: none`) is planted in the window. The narrowed term must still see it and Q6 must
 * flip to NO. A term that cannot be pushed over its own bar is not measuring anything.
 *
 * GUARD 2 — `leafPlant`, the discrimination the redefinition claims. A DECORATED LEAF with the
 * identical material and no transition — same blur, same absence, no element children — must be
 * counted in `liquidMaterialTotal` and NOT in `liquidRegions`, and Q6 must stay YES. Guard 1
 * without guard 2 would pass for a term that simply counts everything; guard 2 without guard 1
 * would pass for a term that counts nothing.
 *
 * GUARD 3 — `suppressReal`. `transition: none !important` is forced onto one region the surface
 * actually ships. Q6 must go NO. This is the case the category is really about, and it proves the
 * narrowing did not also stop looking at the regions that remain.
 *
 * Every plant is removed and every override restored, and the run re-reads Q6 afterwards: the
 * numbers must come back to `asFound` or the guard has left the surface changed.
 *
 * Point it with `window.__lqScoreTitle` first (the clarity probe's own switch); this reads
 * whichever window that names.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l1-q6-guards.cjs
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const CLARITY = 'src/.coordination/liquid-workplace/probes/l1-ui-clarity.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  if (t.result === null) throw new Error('eval returned null — the expression threw');
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

/**
 * Which window. `l1-ui-clarity.js` measures EVERY `.fwin` and has no title switch of its own, so
 * the guard picks the row by title and plants into the same one. Taking `windows[0]` instead is
 * the `probe-picks-first-visible-fwin` failure: the plant lands in one window and the reading
 * comes from another, and the guard then reports the term as unpushable.
 */
const TITLE = process.argv[2] || 'Video';

/** Q6's numbers only, read through the real clarity probe so the guard scores what the score does. */
async function readQ6() {
  const src = fs.readFileSync(CLARITY, 'utf8').trim().replace(/;$/, '');
  const out = await ev(src);
  const win = (out.windows || []).find((w) => (w.questions || []).length && String(w.label).includes(TITLE));
  if (!win) throw new Error(`no scored .fwin titled ${TITLE}; saw ${(out.windows || []).map((w) => w.label).join(', ')}`);
  const q6 = win.questions.find((q) => q.id === 6);
  return { label: win.label, verdict: q6.verdict, ...q6.numbers };
}

/**
 * The window under test, resolved the way the clarity probe resolves it. Planting into the wrong
 * `.fwin` is the failure mode `probe-picks-first-visible-fwin` already banked: the guard would
 * report "the term cannot be pushed over its bar" while the plant sat in another window.
 */
const WIN = `[...document.querySelectorAll('.fwin')].find((w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(window.__lqScoreTitle || 'Dictionary'))`;

/** kind: 'container' (a painted child) or 'leaf' (text only). Identical material either way. */
const PLANT = (kind) => `(() => {
  const win = ${WIN};
  if (!win) return JSON.stringify({ planted: 0, why: 'no window' });
  document.querySelectorAll('.l1-q6-plant').forEach((x) => x.remove());
  const host = win.querySelector('.fwin-body') || win;
  const el = document.createElement('div');
  el.className = 'l1-q6-plant';
  el.style.cssText = 'position:absolute;left:8px;bottom:40px;z-index:1;padding:6px 10px;'
    + 'background:rgb(0 0 0 / 0.66);backdrop-filter:blur(6px);border-radius:6px;'
    + 'color:#fff;transition:none;';
  ${kind === 'container'
    ? "const kid = document.createElement('span'); kid.textContent = 'planted region'; el.append(kid);"
    : "el.textContent = 'planted leaf';"}
  host.append(el);
  const cs = getComputedStyle(el);
  return JSON.stringify({
    planted: 1,
    kind: '${kind}',
    backdropFilter: cs.backdropFilter,
    transitionDuration: cs.transitionDuration,
    elementChildren: el.children.length,
  });
})()`;

const UNPLANT = `(() => {
  const before = document.querySelectorAll('.l1-q6-plant').length;
  document.querySelectorAll('.l1-q6-plant').forEach((x) => x.remove());
  return JSON.stringify({ before, remaining: document.querySelectorAll('.l1-q6-plant').length });
})()`;

/** Force `transition: none` onto one region the surface really ships, remembering the inline value. */
const SUPPRESS = `(() => {
  const win = ${WIN};
  const el = win.querySelector('.mc-sidebar') || win.querySelector('.lq-contextual');
  if (!el) return JSON.stringify({ suppressed: false, why: 'no shipped region found' });
  window.__q6suppressed = { el, was: el.style.transition, hadAttr: el.hasAttribute('style') };
  el.style.setProperty('transition', 'none', 'important');
  return JSON.stringify({
    suppressed: true,
    on: el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0],
    transitionDuration: getComputedStyle(el).transitionDuration,
  });
})()`;

const UNSUPPRESS = `(() => {
  const s = window.__q6suppressed;
  if (!s) return JSON.stringify({ restored: false, why: 'nothing captured' });
  s.el.style.removeProperty('transition');
  if (s.was) s.el.style.transition = s.was;
  window.__q6suppressed = null;
  return JSON.stringify({
    restored: true,
    transitionDuration: getComputedStyle(s.el).transitionDuration,
  });
})()`;

(async () => {
  const out = { at: new Date().toISOString(), title: TITLE };

  // The in-page half of the title resolution, so `WIN` and `readQ6` can never diverge.
  out.pointedAt = await ev(`(window.__lqScoreTitle = ${JSON.stringify(TITLE)})`);
  out.asFound = await readQ6();

  // --- Guard 1: a Liquid-material CONTAINER with no transition must flip Q6 to NO ---------------
  out.containerPlanted = await ev(PLANT('container'));
  await sleep(250);
  out.withContainer = await readQ6();
  out.containerUnplanted = await ev(UNPLANT);
  await sleep(250);
  out.afterContainer = await readQ6();

  // --- Guard 2: the same material as a LEAF must be seen and NOT counted as a region ------------
  out.leafPlanted = await ev(PLANT('leaf'));
  await sleep(250);
  out.withLeaf = await readQ6();
  out.leafUnplanted = await ev(UNPLANT);
  await sleep(250);

  // --- Guard 3: suppressing a real region's transition must flip Q6 to NO -----------------------
  out.suppressed = await ev(SUPPRESS);
  await sleep(250);
  out.withSuppression = await readQ6();
  out.unsuppressed = await ev(UNSUPPRESS);
  await sleep(250);
  out.afterAll = await readQ6();

  out.guards = {
    containerPlant: {
      verdictFlipped: out.asFound.verdict === 'YES' && out.withContainer.verdict === 'NO',
      regions: `${out.asFound.liquidRegions} -> ${out.withContainer.liquidRegions}`,
      withoutTransition: out.withContainer.withoutTransition,
      held: out.asFound.verdict === 'YES' && out.withContainer.verdict === 'NO',
    },
    leafPlant: {
      // Seen by the material test, refused by the container test: material +1, regions +0.
      materialRose: out.withLeaf.liquidMaterialTotal === out.asFound.liquidMaterialTotal + 1,
      regionsFlat: out.withLeaf.liquidRegions === out.asFound.liquidRegions,
      verdictHeld: out.withLeaf.verdict === 'YES',
      held: out.withLeaf.liquidMaterialTotal === out.asFound.liquidMaterialTotal + 1
        && out.withLeaf.liquidRegions === out.asFound.liquidRegions
        && out.withLeaf.verdict === 'YES',
    },
    suppressReal: {
      verdictFlipped: out.withSuppression.verdict === 'NO',
      withoutTransition: out.withSuppression.withoutTransition,
      held: out.withSuppression.verdict === 'NO',
    },
    restored: {
      verdict: out.afterAll.verdict === out.asFound.verdict,
      regions: out.afterAll.liquidRegions === out.asFound.liquidRegions,
      material: out.afterAll.liquidMaterialTotal === out.asFound.liquidMaterialTotal,
      carrying: out.afterAll.carryingATransition === out.asFound.carryingATransition,
      held: out.afterAll.verdict === out.asFound.verdict
        && out.afterAll.liquidRegions === out.asFound.liquidRegions
        && out.afterAll.liquidMaterialTotal === out.asFound.liquidMaterialTotal
        && out.afterAll.carryingATransition === out.asFound.carryingATransition,
    },
  };
  out.verdict = Object.values(out.guards).every((g) => g.held)
    ? `Q6 ${out.asFound.verdict} on ${out.asFound.label}: ${out.asFound.liquidRegions} regions all carrying a transition, `
      + `${out.asFound.liquidMaterialTotal - out.asFound.liquidRegions} decorated leaf/leaves refused `
      + `(${(out.asFound.decoratedLeaves || []).join(', ') || 'none'}), and all three controls fired`
    : 'VOID — a guard did not hold; see out.guards';

  console.log(JSON.stringify(out, null, 1));
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
