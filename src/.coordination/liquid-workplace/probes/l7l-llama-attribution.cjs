/**
 * L7-L — the positive control that attributes D1: load the local GGUF model, and watch main.
 *
 * The chain that got here, each step falsifying the last guess:
 *   l7h  6,610 MB of main's private bytes are native — heapUsed moves 68 MB while private moves
 *        6,643, forced GC does not lower it, detachedContexts 0, arrayBuffers 0.
 *   l7i  the whole 18-control Dictionary cadence moves private by 3.1 MB, and the SAME process
 *        reads 7,071 MB two minutes later with nothing clicked. So it is DELAYED, not synchronous.
 *   l7j  Interlinear falsified (Δ-2.3 MB over 90 s) with an idle and an adverse control both flat.
 *   l7k  five more candidate controls falsified, idle control Δ-0.4 MB.
 *   then `grep -i llama debug/devapp-l7h2.log` — the 7 GB session's own stdout carries
 *        `[node-llama-cpp] load: control-looking token: 128247 …`, and the healthy 599 MB session's
 *        log carries no llama line at all. A 1,223.0 MB `Qwen3-1.7B.gguf` is installed under
 *        `userData/models`, `src/main/localAgent.ts:159` loads it with `llama.loadModel()` +
 *        `createContext({contextSize})`, and `runtime` caches it for `IDLE_UNLOAD_MS` = 5 min.
 *
 * That fits every measured property of D1 that a JS-side theory could not: native (llama.cpp
 * allocates outside V8), GC-immune, a FIXED plateau within 10 MB of 7,074 on four separate boots
 * (a model plus a fixed-size KV cache is the same size every time), and delayed by the seconds a
 * GGUF load takes.
 *
 * This drives `localAgent:plan` directly through the preload binding, which is the ONE action that
 * calls `loadRuntime`, and samples main every 5 s. Controls, both required:
 *   - an idle window BEFORE the call, which must be flat;
 *   - `localAgent:status` read before and after, so a step that happened with `loaded:false` is
 *     reported as a refutation rather than counted.
 *
 *   node src/.coordination/liquid-workplace/probes/l7l-llama-attribution.cjs
 *
 * This LOADS a 1.2 GB model into the running dev app. Expect the app to hold the memory for five
 * minutes afterwards; restart it rather than measuring anything else on the same process.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const OUT = path.join(__dirname, 'l7l-llama-attribution.json');
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

// `/eval` is synchronous and never awaits a promise, so the call is parked on `window` and read
// back later rather than returned.
const START = `(() => {
  window.__l7l = { started: Date.now(), done: false, res: null, err: null };
  const models = window.api.localAgentModels();
  models.then((list) => {
    window.__l7l.models = list;
    const model = list.find((m) => /\\.gguf$/i.test(m.fileName));
    if (!model) { window.__l7l.err = 'no gguf model installed'; window.__l7l.done = true; return; }
    window.__l7l.modelFileName = model.fileName;
    return window.api.localAgentPlan({
      objective: 'Say the single word OK and nothing else.',
      settings: {
        version: 1, enabled: true, backend: 'local-gguf', modelFileName: model.fileName,
        modelMode: 'standard', acceleration: 'auto', contextSize: 8192, memoryLimitMb: 2048,
        resourceMode: 'balanced', cpuLimitPct: 80, gpuLimitPct: 80, maxConcurrentTasks: 1,
        backgroundProcessing: false, permission: 'read-only', memoryEnabled: false,
        memoryScope: [], chatHistory: 'full', excludeSensitiveContext: true,
        privacyMode: true, debugMode: false,
      },
    }).then((res) => { window.__l7l.res = res; window.__l7l.done = true; });
  }).catch((e) => { window.__l7l.err = String(e); window.__l7l.done = true; });
  return JSON.stringify({ started: true });
})()`;

const STATUS = 'window.api.localAgentStatus().then((s) => { window.__l7lStatus = s; }), "queued"';
const READ_STATUS = 'JSON.stringify(window.__l7lStatus || null)';

const series = [];
async function sampleFor(phase, seconds, extra) {
  let first = null;
  let last = null;
  for (let t = 0; t <= seconds; t += 5) {
    const m = await mem();
    if (first === null) first = m.privateMb;
    last = m.privateMb;
    series.push({ phase, t, ...m });
    const note = extra ? await extra() : '';
    console.log(
      `${phase.padEnd(18)} t+${String(t).padStart(3)}s  private=${String(m.privateMb).padStart(8)} MB  `
        + `heapUsed=${m.heapUsedMb}  external=${m.externalMb}  ${note}`,
    );
    if (t < seconds) await sleep(5000);
  }
  const d = Math.round((last - first) * 10) / 10;
  console.log(`  -> ${phase}: Δ${d > 0 ? '+' : ''}${d} MB over ${seconds}s\n`);
  return { first, last, d };
}

async function main() {
  await ev(STATUS);
  await sleep(500);
  const before = await ev(READ_STATUS);
  console.log('localAgent:status BEFORE =', JSON.stringify(before));

  const idle = await sampleFor('CONTROL idle', 20);

  console.log('start:', JSON.stringify(await ev(START)));
  const load = await sampleFor('llama plan', 150, async () => {
    const st = await ev('JSON.stringify({done: (window.__l7l||{}).done, err: (window.__l7l||{}).err})');
    return st.done ? `done err=${st.err || 'none'}` : '';
  });

  await ev(STATUS);
  await sleep(500);
  const after = await ev(READ_STATUS);
  const result = await ev('JSON.stringify(window.__l7l)');
  console.log('localAgent:status AFTER  =', JSON.stringify(after));
  console.log('plan result =', JSON.stringify(result.res || result.err).slice(0, 300));

  fs.writeFileSync(OUT, JSON.stringify({ before, after, idle, load, result, series }, null, 2));
  console.log('\nVERDICT');
  console.log(`  idle control   Δ${idle.d} MB   (must be small)`);
  console.log(`  llama plan     ${load.first} -> ${load.last} MB   Δ${load.d > 0 ? '+' : ''}${load.d} MB`);
  console.log(`  status loaded  ${before && before.loaded} -> ${after && after.loaded}`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
