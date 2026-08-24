/**
 * L7-N — WHICH Dictionary control starts the Qwen3 load? Attribution without a memory number.
 *
 * `148ca3e9` bounded and disposed the model, which closed D1's magnitude, but it left one thing
 * explicitly unclaimed: *which action in the Dictionary cadence starts a model load at all*.
 * `l7k-candidate-bisect.cjs` falsified six controls by watching private bytes, and a memory
 * sampler is a poor instrument for this — it costs 35 s per candidate, it cannot separate "this
 * control did not load" from "the model was already resident", and after the first trigger every
 * later candidate reads flat because `ensureSession()` returns the cached session.
 *
 * There is a direct signal. `src/main/translate.ts`'s `ensureSession()` broadcasts
 * `translate:progress` with `status:'init'` **before** `import('node-llama-cpp')`, then
 * `progress` 20/45/80 and `status:'ready'`. Preload already exposes it as
 * `window.api.onTranslateModelProgress` (`src/preload.ts:1432`). So a renderer-side recorder turns
 * "did this control load a GGUF" into a boolean that arrives in ~1 s, not a 3 GB delta 20 s later.
 *
 * Shape: arm the recorder, then drive one candidate at a time and read what arrived. The FIRST
 * candidate that emits `init` is the answer, and the run stops there — anything after it would be
 * measured against a warm session and is not evidence.
 *
 *   node src/.coordination/liquid-workplace/probes/l7n-load-trigger.cjs "Search" "Play 食べる" ...
 *
 * CONTROLS, both required or the boolean means nothing:
 *  - negative: the recorder is armed and read once with NOTHING clicked. It must stay empty, or
 *    every attribution below is an artifact of an event that fires on its own.
 *  - positive: after the sweep, `ensureTranslateReady()` is invoked through the product's own
 *    IPC. It MUST produce `init`, which proves the recorder can see a load it did not miss.
 *    A run whose positive control stays silent is VOID, not a run where nothing triggers.
 *
 * Precondition: a fresh boot in the documented Dictionary state (`l7d-setup.cjs`), with the model
 * NOT resident — after `IDLE_UNLOAD_MS` has elapsed, or before anything has prompted it.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const OUT = path.join(__dirname, 'l7n-load-trigger.json');
const WATCH_S = Number(process.env.L7N_WATCH_S || 8);
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
  return { privateMb: b.privateMb, uptimeSec: b.uptimeSec, pid: b.pid };
}

// One expression, no trailing semicolon: the bridge's /eval is synchronous and evaluates exactly
// one expression.
const ARM = `(function(){
  if (window.__l7nOff) { try { window.__l7nOff(); } catch (e) {} }
  window.__l7n = [];
  if (!window.api || typeof window.api.onTranslateModelProgress !== 'function') {
    return JSON.stringify({ refuse: 'no onTranslateModelProgress on window.api' });
  }
  window.__l7nOff = window.api.onTranslateModelProgress(function(p){
    window.__l7n.push({ t: Date.now(), status: p && p.status, progress: p && p.progress, file: p && p.file });
  });
  return JSON.stringify({ armed: true })
})()`;

const READ = `JSON.stringify({ events: window.__l7n || [], n: (window.__l7n || []).length })`;
const DRAIN = `JSON.stringify({ drained: (window.__l7n || []).length, events: (window.__l7n = []) })`;
const DISARM = `JSON.stringify({ disarmed: !!(window.__l7nOff && (window.__l7nOff(), window.__l7nOff = null, true)), left: (window.__l7n = undefined, true) })`;

const CLICK = (name) => `(function(){
  var win = [].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
    var t = w.querySelector('.fwin-title-text');
    return (t && t.textContent || '').indexOf('Dictionary') >= 0;
  })[0];
  if (!win) return JSON.stringify({ refuse: 'no Dictionary window' });
  var label = function(el){
    return (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '')
      .replace(/\\s+/g, ' ').trim();
  };
  var el = [].slice.call(win.querySelectorAll('button,a[href],[role="button"],[role="tab"]'))
    .filter(function(b){ return label(b) === ${JSON.stringify(name)}; })[0];
  if (!el) return JSON.stringify({ refuse: 'absent' });
  if (el.disabled) return JSON.stringify({ refuse: 'disabled' });
  el.click();
  return JSON.stringify({ clicked: true })
})()`;

// The positive control goes through the product's own IPC, not through a control, so it proves the
// recorder rather than re-testing the surface.
const POSITIVE = `JSON.stringify({ started: !!(window.api && window.api.translateEnsureReady && window.api.translateEnsureReady()) })`;

async function watch(labelText, seconds) {
  for (let t = 0; t < seconds; t += 1) {
    await sleep(1000);
    const r = await ev(READ);
    if (r.n > 0) {
      const m = await mem();
      console.log(`  ${labelText}: ${r.n} event(s) after ${t + 1}s — ${r.events.map((e) => `${e.status || ''}${e.progress != null ? `/${e.progress}` : ''}`).join(' ')} (private ${m.privateMb} MB)`);
      return { fired: true, afterS: t + 1, events: r.events, privateMb: m.privateMb };
    }
  }
  console.log(`  ${labelText}: SILENT for ${seconds}s`);
  return { fired: false, afterS: seconds, events: [] };
}

async function main() {
  const candidates = process.argv.slice(2);
  if (candidates.length === 0) throw new Error('give at least one control name');

  const before = await mem();
  console.log(`pid ${before.pid}, uptime ${before.uptimeSec}s, private ${before.privateMb} MB`);
  console.log('arm:', JSON.stringify(await ev(ARM)));

  // NEGATIVE CONTROL — nothing clicked.
  const idle = await watch('CONTROL idle (nothing clicked)', 6);
  await ev(DRAIN);

  const rows = [];
  let answer = null;
  for (const name of candidates) {
    const c = await ev(CLICK(name));
    if (c.refuse) {
      console.log(`  ${name}: skipped (${c.refuse})`);
      rows.push({ name, skipped: c.refuse });
      continue;
    }
    const w = await watch(name, WATCH_S);
    rows.push({ name, ...w });
    await ev(DRAIN);
    if (w.fired) {
      answer = name;
      console.log(`\nTRIGGER FOUND: ${name}. Stopping — every later candidate would meet a warm session.`);
      break;
    }
  }

  // POSITIVE CONTROL — only meaningful if nothing above fired; a warm session emits nothing.
  let positive = null;
  if (!answer) {
    console.log('positive control:', JSON.stringify(await ev(POSITIVE)));
    positive = await watch('CONTROL ensureTranslateReady', 20);
  }

  const after = await mem();
  console.log('disarm:', JSON.stringify(await ev(DISARM)));

  const verdict = {
    pid: before.pid,
    privateBeforeMb: before.privateMb,
    privateAfterMb: after.privateMb,
    idleControlFired: idle.fired,
    rows,
    answer,
    positiveControl: positive,
    void: idle.fired || (!answer && positive != null && !positive.fired),
  };
  fs.writeFileSync(OUT, JSON.stringify(verdict, null, 2));
  console.log('\nVERDICT');
  console.log(`  idle control fired: ${idle.fired}  (must be false)`);
  console.log(`  trigger: ${answer || 'none of the candidates'}`);
  if (positive) console.log(`  positive control fired: ${positive.fired}  (must be true or the run is VOID)`);
  console.log(`  VOID: ${verdict.void}`);
  console.log(`  private ${before.privateMb} -> ${after.privateMb} MB`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
