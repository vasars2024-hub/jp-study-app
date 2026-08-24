/**
 * L7-K — drive one candidate control per phase, each with its own delayed-settle window.
 *
 * Why a NEW bisect when one already ran. The earlier per-control isolation pass sampled net cost
 * immediately after each click and exonerated all 19 at <=8 MB. `l7i-memstep.cjs` then showed the
 * whole 18-control cadence moving private bytes by 3.1 MB while the SAME process read 7,071 MB two
 * minutes later with nothing clicked. So the allocation is delayed, and an instrument that samples
 * at click time cannot see it. This one waits.
 *
 * `l7j-interlinear-step.cjs` already used this shape to falsify the Interlinear lens (Δ-2.3 MB over
 * 90 s, with an idle control and a non-interlinear adverse control both flat). This generalises it:
 * a list of candidate control names on argv, each clicked once and then sampled for SETTLE_S.
 *
 *   node src/.coordination/liquid-workplace/probes/l7k-candidate-bisect.cjs "Find phrases" "Explain again" ...
 *
 * A phase that steps is the answer; a run where every phase is flat is a FINDING in its own right
 * (it would mean the trigger is not a control on this surface at all) and must be reported as one
 * rather than repeated until something moves.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const OUT = path.join(__dirname, 'l7k-candidate-bisect.json');
const SETTLE_S = Number(process.env.L7K_SETTLE_S || 35);
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
  const all = [...win.querySelectorAll('button,a[href],[role="button"],[role="tab"]')];
  const el = all.find((b) => label(b) === ${JSON.stringify(name)});
  if (!el) return JSON.stringify({ refuse: 'absent', names: all.map(label).slice(0, 80) });
  el.click();
  return JSON.stringify({ clicked: ${JSON.stringify(name)} });
})()`;

const series = [];
async function sampleFor(phase, seconds) {
  let first = null;
  let last = null;
  for (let t = 0; t <= seconds; t += 5) {
    const m = await mem();
    if (first === null) first = m.privateMb;
    last = m.privateMb;
    series.push({ phase, t, ...m });
    if (t < seconds) await sleep(5000);
  }
  const d = Math.round((last - first) * 10) / 10;
  console.log(
    `${phase.padEnd(30)} ${String(first).padStart(8)} -> ${String(last).padStart(8)} MB   `
      + `Δ${d > 0 ? '+' : ''}${d} MB over ${seconds}s`,
  );
  return { first, last, d };
}

async function main() {
  const names = process.argv.slice(2);
  if (!names.length) throw new Error('give at least one control name');
  console.log(`settle window ${SETTLE_S}s per candidate, ${names.length} candidates\n`);

  const idle = await sampleFor('CONTROL idle', SETTLE_S);
  const rows = [];
  for (const name of names) {
    const c = await ev(CLICK(name));
    if (c.refuse) {
      console.log(`${name.padEnd(30)} SKIPPED — ${c.refuse}`);
      rows.push({ name, skipped: c.refuse });
      continue;
    }
    const r = await sampleFor(name, SETTLE_S);
    rows.push({ name, ...r });
  }

  fs.writeFileSync(OUT, JSON.stringify({ idle, rows, series }, null, 2));
  const stepped = rows.filter((r) => typeof r.d === 'number' && r.d > 200);
  console.log(`\nidle control Δ${idle.d} MB`);
  console.log(
    stepped.length
      ? `STEPPED: ${stepped.map((r) => `${r.name} Δ+${r.d} MB`).join(', ')}`
      : 'NO CANDIDATE STEPPED — the trigger is not one of these controls',
  );
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
