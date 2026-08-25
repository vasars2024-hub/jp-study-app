/**
 * L1 guards for rubric category 5's **Q7** — "standard mode remains fully normal".
 *
 * Q7 read NO on the Video window and BOTH failing terms were the instrument, not the product:
 *
 *   `zeroBackdropRegions` demanded 0 `backdrop-filter` regions in the standard leg. Video ships
 *   three of its own — `aside.mc-sidebar` and `header.mc-topbar` (`mediaCenter.css:199`/`:470`)
 *   and `span.medialib-card__badge` (`mediaLibrary.css:502`) — declared unconditionally, so they
 *   are present in liquid AND in standard and the presentation moves the count by **0**.
 *
 *   `contextualPainting` tested `alphaOf(bg) > 0.02`, which an alpha of **1.0 passes**. The
 *   shipped `nav.lq-contextual.medialib-rail` is `color(srgb … / 0.72)` in liquid and opaque
 *   `rgb(8, 15, 12)` in standard — exactly correct — and was scored as treatment that survived.
 *   Dictionary passed only by luck: its regions are alpha **0** in standard, which the same loose
 *   test happens to reject.
 *
 * Both terms are now stated as a DIFFERENCE between the legs. **That flips a NO to a YES, so it
 * needs its own controls or it is indistinguishable from moving the bar until the surface passes**
 * — the rule `l1-q4-guards.cjs` and `l1-q6-guards.cjs` were written under, and the reason there
 * are four guards here rather than one:
 *
 *   GUARD 1 `q7` — a translucent + blurred region planted into the standard leg only. Both
 *     repaired terms must fail and Q7 must read **NO**. A term that cannot be pushed over its own
 *     bar is not measuring anything.
 *   GUARD 2 `q7-opaque` — the SAME node at the same moment, OPAQUE and unblurred. Q7 must stay
 *     **YES**. Guard 1 alone would pass for a term that fails on any planted node.
 *   GUARD 3 `q7-owned` — a blurred region planted BEFORE the first snapshot, so it sits in both
 *     legs the way the Media Center's own glass does. Q7 must stay **YES**. Without this,
 *     `noBackdropGainedInStandard` is indistinguishable from a term that counts nothing.
 *   GUARD 4 `q7-suppress` — the REAL shipped `.lq-contextual` forced to keep its translucency
 *     across the toggle, inline and `!important`. Q7 must read **NO**. This is the case §2 is
 *     really about, and it proves the repair did not also stop looking at the product.
 *   GUARD 5 `restored` — the as-found run is repeated last and every number must come back.
 *
 * All five hold or the verdict is **VOID**, never a 10.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l1-q7-guards.cjs [Video]
 */
'use strict';
const { execFile } = require('node:child_process');
const path = require('node:path');

const TITLE = process.argv[2] || 'Video';
const DRIVE = path.join(__dirname, 'l1-q78-drive.cjs');

/**
 * The guards run the REAL driver as a child process rather than re-implementing its round trip.
 * Re-implementing it is how a guard ends up certifying a copy of the term instead of the term the
 * score is read from — `l1-q6-guards.cjs` reads through `l1-ui-clarity.js` for the same reason.
 */
function drive(control) {
  return new Promise((resolve, reject) => {
    const args = [DRIVE, '--title', TITLE];
    if (control) args.push('--control', control);
    execFile(process.execPath, args, { cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${control || 'as-found'}: ${String(stderr || err).slice(0, 400)}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`${control || 'as-found'}: unparseable output — ${String(stdout).slice(0, 300)}`));
      }
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The four numbers a guard is allowed to be judged on, pulled the same way from every run. */
const shape = (r) => ({
  verdict: r.q7.verdict,
  translucentLiquid: r.contextualTranslucent.liquidBefore,
  translucentStandard: r.contextualTranslucent.standard,
  namesStandard: r.contextualTranslucent.namesStandard,
  backdropsLiquid: r.backdrops.liquidBefore.length,
  backdropsStandard: r.backdrops.standard.length,
  gained: r.backdrops.gainedInStandard,
  failing: Object.keys(r.q7.checks).filter((k) => !r.q7.checks[k]),
});

(async () => {
  const out = { at: new Date().toISOString(), title: TITLE };

  out.asFound = shape(await drive(''));
  await sleep(400);
  out.withPlant = shape(await drive('q7'));
  await sleep(400);
  out.withOpaque = shape(await drive('q7-opaque'));
  await sleep(400);
  out.withOwned = shape(await drive('q7-owned'));
  await sleep(400);
  out.withSuppression = shape(await drive('q7-suppress'));
  await sleep(400);
  out.afterAll = shape(await drive(''));

  const F = out.asFound;
  out.guards = {
    // Pushed over the bar: BOTH repaired terms must be the ones that fail, not `sameControlSet`
    // or geometry — a plant that fails the run for an unrelated reason certifies nothing.
    plant: (() => {
      const f = out.withPlant.failing;
      const held = F.verdict === 'YES' && out.withPlant.verdict === 'NO'
        && f.includes('noTranslucencyInStandard') && f.includes('noBackdropGainedInStandard');
      return { held, failing: f, gained: out.withPlant.gained, translucentStandard: out.withPlant.translucentStandard };
    })(),
    // Discrimination A — opacity is normal, and the term must say so.
    opaque: (() => {
      const held = out.withOpaque.verdict === 'YES' && out.withOpaque.translucentStandard === 0
        && out.withOpaque.gained.length === 0;
      return { held, verdict: out.withOpaque.verdict, translucentStandard: out.withOpaque.translucentStandard };
    })(),
    // Discrimination B — a component's own glass, present in both legs, is not the window's.
    owned: (() => {
      const rose = out.withOwned.backdropsStandard === F.backdropsStandard + 1
        && out.withOwned.backdropsLiquid === F.backdropsLiquid + 1;
      const held = out.withOwned.verdict === 'YES' && rose && out.withOwned.gained.length === 0;
      return { held, verdict: out.withOwned.verdict, backdrops: `${F.backdropsStandard} -> ${out.withOwned.backdropsStandard} in both legs`, gained: out.withOwned.gained };
    })(),
    // The product's own region, not a plant.
    suppressReal: (() => {
      const f = out.withSuppression.failing;
      const held = out.withSuppression.verdict === 'NO' && f.includes('noTranslucencyInStandard')
        && out.withSuppression.translucentStandard > 0;
      return { held, failing: f, names: out.withSuppression.namesStandard, translucentStandard: out.withSuppression.translucentStandard };
    })(),
    restored: (() => {
      const held = JSON.stringify(out.afterAll) === JSON.stringify(F);
      return { held, asFound: F, afterAll: out.afterAll };
    })(),
  };

  out.verdict = Object.values(out.guards).every((g) => g.held)
    ? `Q7 ${F.verdict} on ${TITLE}: ${F.translucentLiquid} translucent contextual region(s) in liquid -> `
      + `${F.translucentStandard} in standard, ${F.backdropsLiquid} component-owned backdrop region(s) `
      + `unchanged across the toggle, 0 gained, and all four controls fired`
    : 'VOID — a guard did not hold; see out.guards';

  console.log(JSON.stringify(out, null, 1));
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
