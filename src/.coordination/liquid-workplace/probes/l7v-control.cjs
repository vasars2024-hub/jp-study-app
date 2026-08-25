/**
 * The DECISIVE negative control for L7 leg 2 on Video.
 *
 * Leg 2 now reports nothing over 500 ms on this surface. A clean number from an instrument
 * that has never been shown to reach the bar is not a pass, it is an unmeasured surface — and
 * `l7v-burst.cjs --sensitivity` only ever moved `/health` to 36-53 ms, an order of magnitude
 * short of the 500 ms bar it is meant to prove reachable.
 *
 * So this plants a block on main of a KNOWN, escalating size and reports the smallest one the
 * sampler catches over 500 ms. `dict:lookup` runs on main's own loop against the 697k-row
 * dictionary; the terms are distinct and generated, so no per-term cache can absorb the run
 * the way 600 repetitions of one word did.
 *
 * Nothing here writes user data: a lookup is a read, and a miss is a miss.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l7v-control.cjs [--counts 600,3000,12000]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const ci = process.argv.indexOf('--counts');
const COUNTS = (ci >= 0 ? process.argv[ci + 1] : '600,3000,12000')
  .split(',').map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
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
 * Distinct kana terms, built in the renderer so nothing large crosses `/eval`. Every call is
 * fired and dropped: what is measured is how long main's loop stops, not what it answers.
 */
const fire = (n) => `(function(){
  var base = ['\\u3042','\\u3044','\\u3046','\\u3048','\\u304a','\\u304b','\\u304d','\\u304f','\\u3051','\\u3053'];
  for (var i = 0; i < ${n}; i += 1) {
    var w = base[i % 10] + base[(i >> 3) % 10] + base[(i >> 6) % 10] + String(i);
    void window.api.lookupWord(w);
  }
  return 'fired:${n}'
})()`;

(async () => {
  await post('/focus', {});
  await sleep(400);
  if (String(await ev('1+1')).trim() !== '2') throw new Error('REFUSE - husk renderer');

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

  await sleep(2000);
  let firstOver = null;
  for (const n of COUNTS) {
    current = `n=${n}`;
    console.log('plant     ', await ev(fire(n)));
    await sleep(Math.max(6000, n * 2));
    current = 'quiet';
    await sleep(2000);
    const mine = samples.filter((s) => s.step === `n=${n}`).map((s) => s.ms).sort((a, b) => a - b);
    const max = mine[mine.length - 1];
    console.log(`CONTROL    ${String(n).padStart(6)} distinct lookups -> samples ${mine.length}, p50 ${mine[Math.floor(mine.length / 2)]} ms, MAX ${max} ms`);
    if (max > 500 && firstOver === null) firstOver = { n, max };
  }

  stop = true;
  await poll;
  const idle = samples.filter((s) => s.step === 'idle' || s.step === 'quiet').map((s) => s.ms).sort((a, b) => a - b);
  console.log('');
  console.log(`IDLE/QUIET  samples ${idle.length}, p50 ${idle[Math.floor(idle.length / 2)]} ms, MAX ${idle[idle.length - 1]} ms`);
  console.log(firstOver
    ? `CONTROL FIRES at ${firstOver.n} lookups: ${firstOver.max} ms > 500 ms bar`
    : 'CONTROL DID NOT FIRE - leg 2 is VOID, not a pass');
})().catch((e) => { console.error(String(e && e.stack ? e.stack : e)); process.exit(1); });
