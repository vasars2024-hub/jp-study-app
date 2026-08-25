/**
 * L7 leg-2 ATTRIBUTION — which main-process call is the 1.0-3.1 s block under the Media
 * Center's `Review` and `Study Mode` destinations.
 *
 * `l7v-burst.cjs` stamps each `/health` sample with the burst step in flight, which names the
 * DESTINATION but not the CALL. Worse, the burst advances every 260 ms while a mount effect's
 * work lands whenever it lands, so a block opened by step N is routinely stamped step N+1 —
 * `Readiness` is clicked immediately before `Review` and both mount the same fingerprint read.
 * An attribution that cannot survive that shift is not an attribution.
 *
 * So this probe drives ONE `window.api` call at a time, with 2.5 s of quiet either side, and
 * samples `/health` (answered on main's own loop) at 40 ms throughout. `/eval` is synchronous
 * and returns one expression, so the call is FIRED and not awaited — the block it opens on main
 * is what the sampler sees, which is exactly the quantity under test.
 *
 * NEGATIVE CONTROL, and the run is VOID without it: `--control` measures the same schedule with
 * every call replaced by a no-op of the same shape (an `/eval` that returns a constant). If the
 * control shows blocks too, the numbers are the harness and not the product.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l7v-attribute.cjs [--control] [--only NAME]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const CONTROL = process.argv.includes('--control');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
const get = async (route) => (await fetch(`http://127.0.0.1:${cfg.port}${route}`, { headers: H })).json();
const post = async (route, body) => (await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
  method: 'POST', headers: H, body: JSON.stringify(body || {}),
})).json();
async function ev(js) {
  const t = await post('/eval', { js: js.replace(/\s*;\s*$/, '').trimEnd() });
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  return t.result;
}

/**
 * Each entry fires one renderer-side call that reaches main. The promise is dropped on
 * purpose — `/eval` cannot await it (a promise serialises to `{}`), and awaiting is not what
 * is being measured anyway: the question is how long main's loop stops.
 */
const CALLS = [
  ['miningListFrequencyDicts', 'window.api.miningListFrequencyDicts()'],
  ['ankiStatus', 'window.api.ankiStatus()'],
  ['ankiGetIntervals', 'window.api.ankiGetIntervals()'],
  ['ankiGetIntervalsForNotes', 'window.api.ankiGetIntervalsForNotes([])'],
  ['studyGet', 'window.api.studyGet()'],
];

(async () => {
  console.log('focus     ', JSON.stringify(await post('/focus', {})));
  await sleep(400);
  // A husk check: a bridge that answers /health but has no live renderer would score every
  // call at 0 ms and read as a clean pass.
  const husk = await ev('1+1');
  if (String(husk).trim() !== '2') throw new Error(`REFUSE - husk: eval 1+1 returned ${husk}`);

  const samples = [];
  let stop = false;
  let current = 'idle';
  const poll = (async () => {
    while (!stop) {
      const t0 = Date.now();
      try { await get('/health'); } catch { /* counted by the gap */ }
      samples.push({ ms: Date.now() - t0, step: current });
      await sleep(40);
    }
  })();

  await sleep(2500);
  for (const [name, js] of CALLS) {
    if (ONLY && name !== ONLY) continue;
    current = name;
    const expr = CONTROL ? `(function(){ return 'noop:${name}' })()` : `(function(){ void (${js}); return 'fired' })()`;
    let fired;
    try { fired = await ev(expr); } catch (e) { fired = `ERR ${String(e).slice(0, 120)}`; }
    await sleep(2500);
    current = 'quiet';
    await sleep(1200);
    const mine = samples.filter((s) => s.step === name).map((s) => s.ms).sort((a, b) => a - b);
    console.log(`${CONTROL ? 'CONTROL ' : 'CALL    '} ${name.padEnd(26)} fired=${String(fired).padEnd(8)} samples ${String(mine.length).padStart(3)}  p50 ${mine[Math.floor(mine.length / 2)]} ms  MAX ${mine[mine.length - 1]} ms`);
  }

  stop = true;
  await poll;
  const idle = samples.filter((s) => s.step === 'idle' || s.step === 'quiet').map((s) => s.ms).sort((a, b) => a - b);
  console.log('');
  console.log(`IDLE/QUIET baseline  samples ${idle.length}  p50 ${idle[Math.floor(idle.length / 2)]} ms  p95 ${idle[Math.floor((idle.length - 1) * 0.95)]} ms  MAX ${idle[idle.length - 1]} ms`);
  console.log(`OVER 500 ms          ${samples.filter((s) => s.ms > 500).map((s) => `${s.step}=${s.ms}ms`).join(' ') || 'none'}`);
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
