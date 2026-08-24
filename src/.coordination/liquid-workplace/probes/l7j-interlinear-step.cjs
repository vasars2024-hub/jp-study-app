/**
 * L7-J — is D1's step the Interlinear lens, and is it DELAYED?
 *
 * `l7i-memstep.cjs` drove the same 18-control cadence `l1-deadend.js` uses, sampling main's `/mem`
 * between every step, and the whole sweep moved private bytes by **3.1 MB** (785.5 -> 788.6). Two
 * minutes later, with nothing clicked at all, the same process read **7,071 MB**. So D1 is not
 * attributable to a click's synchronous cost: the allocation lands AFTER the action that starts it,
 * which is exactly why the earlier per-control isolation pass exonerated all 19 at <=8 MB net.
 *
 * The last control the stepper drove was the Interlinear lens, and `lookupOfflineInterlinearMerged`
 * (`src/main/dictionary.ts:311`) is the one Dictionary path that awaits two lazy main-process
 * loaders — `initYomitan()` and `getMainJapaneseTokenizer()` (kuromoji/IPADIC). Both are
 * once-per-process caches, which would explain a plateau that lands within 10 MB of 7,074 on four
 * separate boots and never comes back.
 *
 * This tests that with its control first, in one process:
 *   phase 1  idle after a search        -- must stay FLAT, or the step is a timer and not an action
 *   phase 2  a non-Interlinear control  -- adverse control: must stay FLAT
 *   phase 3  the Interlinear lens       -- the hypothesis
 * Each phase samples every 5 s so a delayed allocation is timed rather than missed.
 *
 *   node src/.coordination/liquid-workplace/probes/l7j-interlinear-step.cjs
 *
 * Preconditions: a FRESH boot in the documented Dictionary state (`l7d-setup.cjs`).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const OUT = path.join(__dirname, 'l7j-interlinear-step.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

async function mem() {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/mem`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const b = await r.json();
  if (!b.ok) throw new Error(`/mem failed: ${JSON.stringify(b).slice(0, 300)}`);
  delete b.metrics;
  delete b.spaces;
  return b;
}

const CLICK = (name) => `(() => {
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes('Dictionary'));
  if (!win) return JSON.stringify({ refuse: 'no Dictionary window' });
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '')
    .replace(/\\s+/g, ' ').trim();
  const el = [...win.querySelectorAll('button,a[href],[role="button"],[role="tab"]')]
    .find((b) => label(b) === ${JSON.stringify(name)});
  if (!el) return JSON.stringify({ refuse: 'no control named ${name}' });
  el.click();
  return JSON.stringify({ clicked: ${JSON.stringify(name)} });
})()`;

const series = [];
async function sampleFor(phase, seconds) {
  const out = [];
  for (let t = 0; t <= seconds; t += 5) {
    const m = await mem();
    out.push({ phase, t, ...m });
    series.push({ phase, t, ...m });
    console.log(
      `${phase.padEnd(26)} t+${String(t).padStart(2)}s  private=${String(m.privateMb).padStart(8)} MB  `
        + `heapUsed=${m.heapUsedMb}  external=${m.externalMb}  malloced=${m.mallocedMb}`,
    );
    if (t < seconds) await sleep(5000);
  }
  const d = Math.round((out[out.length - 1].privateMb - out[0].privateMb) * 10) / 10;
  console.log(`  -> ${phase}: Δ${d > 0 ? '+' : ''}${d} MB over ${seconds}s\n`);
  return d;
}

async function main() {
  // Phase 1 — the "is it a timer?" control. An idle process that steps on its own would make
  // every attribution below meaningless.
  const idleDelta = await sampleFor('1 idle after search', 40);

  // Phase 2 — the adverse control. A Dictionary action that does NOT go through the interlinear
  // path. If this steps too, the hypothesis is wrong and the cause is any main-side lookup.
  console.log('click:', JSON.stringify(await ev(CLICK('Find containing words'))));
  const adverseDelta = await sampleFor('2 after non-interlinear', 40);

  // Phase 3 — the hypothesis.
  console.log('click:', JSON.stringify(await ev(CLICK('Interlinear'))));
  const interlinearDelta = await sampleFor('3 after Interlinear', 90);

  fs.writeFileSync(OUT, JSON.stringify(series, null, 2));
  console.log('VERDICT');
  console.log(`  idle control        Δ${idleDelta} MB   (must be small)`);
  console.log(`  adverse control     Δ${adverseDelta} MB   (must be small)`);
  console.log(`  Interlinear         Δ${interlinearDelta} MB`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
