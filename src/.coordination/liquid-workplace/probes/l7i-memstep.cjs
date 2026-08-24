/**
 * L7-I — which ACTION steps D1's 4.8 GB, measured one control at a time.
 *
 * `l7h-memprofile.cjs` proved the shape: 6,610 MB of main's private bytes are native memory V8
 * does not own (heapUsed moves 68 MB while private moves 6,643; forced GC does not lower it;
 * `detachedContexts` 0; `arrayBuffers` 0). It is a STEP, not a ramp — 2,212 → 7,074 MB inside one
 * 12 s window, then flat to the megabyte for 84 s. So exactly one action in the cadence is
 * responsible, and the whole-sweep instrument cannot say which.
 *
 * WHY THIS IS NOT THE ALREADY-DONE BISECT. The earlier exoneration pass drove each of the 19
 * controls in ISOLATION off its own boot and got ≤8 MB net every time. That is consistent with a
 * step that only fires in sequence (a control that is disabled, absent, or in a different mode
 * until an earlier control puts the surface there). This drives the identical sweep order
 * `l1-deadend.js` uses and samples main between every step, so an in-cadence step is attributable.
 *
 * The instrument is main's own `/mem`, never `Get-Process`.`WorkingSet64` — under forced GC here
 * RSS fell 7,287 → 6,185 MB while private did not move at all.
 *
 *   node src/.coordination/liquid-workplace/probes/l7i-memstep.cjs
 *
 * Preconditions: the dev app is in the documented Dictionary state (`l7d-setup.cjs`), and it has
 * had >40 s of uptime or the setup probe reports 0 entries.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const OUT = path.join(__dirname, 'l7i-memstep.json');
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
  return b;
}

/**
 * Arms the stepper. Target selection is byte-for-byte the rule `l1-deadend.js` uses — same
 * DESTRUCTIVE skip list, same mode-switch skip, same view-switchers-last ordering — because a
 * different population would measure a different cadence and could not be compared to D1.
 */
const ARM = String.raw`(() => {
  const TITLE = 'Dictionary';
  const CTRL = 'button,a[href],[role="button"],[role="tab"]';
  const DESTRUCTIVE = /star|flashcard|anki|add|delete|remove|save|export|clear|clipboard|copy|mark it|forget/i;
  const MODE_SWITCH = /^(日本語|中文)$/;
  const VIEW_SWITCH = /^(Automatic|Dictionary|Interlinear)$/;

  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: 'no .fwin titled ' + TITLE });

  const label = (el) =>
    (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title')
      || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const painted = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const clsOf = (el) => String(el.className || '').split(' ')[0];
  const keyOf = (l, tag, type, cls) => [l, tag, type, cls].join('~|~');
  const keyFor = (el) => keyOf(label(el), el.tagName.toLowerCase(), (el.getAttribute('type') || '').toLowerCase(), clsOf(el));
  const clsKeyFor = (el) => keyOf('', el.tagName.toLowerCase(), (el.getAttribute('type') || '').toLowerCase(), clsOf(el));

  const all = [...win.querySelectorAll(CTRL)].filter(painted);
  const ordSeen = new Map();
  const clsSeen = new Map();
  const roster = all.map((el) => {
    const key = keyFor(el); const clsKey = clsKeyFor(el);
    const ord = ordSeen.get(key) || 0; const clsOrd = clsSeen.get(clsKey) || 0;
    ordSeen.set(key, ord + 1); clsSeen.set(clsKey, clsOrd + 1);
    return { el, name: label(el) || '(unlabelled)', key, ord, clsKey, clsOrd, cls: clsOf(el) };
  });

  const targets = [];
  const skipped = [];
  for (const t of roster) {
    const el = t.el;
    if (el.closest('.fwin-titlebar, .fwin-head') || el.classList.contains('fwin-b')) { skipped.push(t.name + ' (chrome)'); continue; }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') { skipped.push(t.name + ' (disabled)'); continue; }
    if (DESTRUCTIVE.test(t.name)) { skipped.push(t.name + ' (writes user data)'); continue; }
    if (MODE_SWITCH.test(t.name)) { skipped.push(t.name + ' (mode switch)'); continue; }
    targets.push(t);
  }
  targets.sort((a, b) => Number(VIEW_SWITCH.test(a.name)) - Number(VIEW_SWITCH.test(b.name)));

  const resolve = (t) => {
    if (t.el.isConnected && painted(t.el)) return t.el;
    const byKey = new Map(); const byCls = new Map();
    for (const c of [...win.querySelectorAll(CTRL)].filter(painted)) {
      const push = (m, k) => { const a = m.get(k) || []; a.push(c); m.set(k, a); };
      push(byKey, keyFor(c)); push(byCls, clsKeyFor(c));
    }
    return (byKey.get(t.key) || [])[t.ord] || (byCls.get(t.clsKey) || [])[t.clsOrd] || null;
  };

  const st = { n: targets.length, busy: false, last: null, names: targets.map((t) => t.name) };
  window.__liqStep = st;
  window.__liqStepGo = (i) => {
    const t = targets[i];
    st.busy = true;
    st.last = { i, name: t ? t.name : null, gone: false, clicked: false };
    setTimeout(() => {
      try {
        const el = t && resolve(t);
        if (!el) { st.last.gone = true; } else { el.click(); st.last.clicked = true; }
      } catch (e) { st.last.error = String(e); }
      st.busy = false;
    }, 0);
    return JSON.stringify({ started: i });
  };
  return JSON.stringify({ armed: true, n: targets.length, names: st.names, skipped });
})()`;

function line(label, m, prev) {
  const d = prev === null ? null : Math.round((m.privateMb - prev) * 10) / 10;
  return `${String(label).padEnd(34)} private=${String(m.privateMb).padStart(8)} MB  ${
    d === null ? '' : `Δ${d > 0 ? '+' : ''}${d} MB`.padStart(12)
  }  heapUsed=${m.heapUsedMb}  external=${m.externalMb}  malloced=${m.mallocedMb}`;
}

async function main() {
  const armed = await ev(ARM);
  if (armed.refuse) throw new Error(`refused: ${armed.refuse}`);
  console.log(`armed: ${armed.n} targets, ${armed.skipped.length} skipped`);
  console.log(`targets: ${armed.names.join(' | ')}`);

  const series = [];
  let m = await mem();
  console.log(line('baseline', m, null));
  series.push({ label: 'baseline', ...m, metrics: undefined });
  let prev = m.privateMb;

  for (let i = 0; i < armed.n; i += 1) {
    await ev(`window.__liqStepGo(${i})`);
    // Poll rather than trusting a fixed delay: /eval never awaits a promise, so a fixed sleep
    // would attribute a slow control's allocation to the NEXT control's sample.
    let waited = 0;
    for (;;) {
      const st = await ev('JSON.stringify({busy: window.__liqStep.busy, last: window.__liqStep.last})');
      if (!st.busy) break;
      await sleep(100);
      waited += 100;
      if (waited > 15000) break;
    }
    // The same 260 ms step the sweep uses, so this cadence matches the one that produced D1.
    await sleep(260);
    m = await mem();
    const last = await ev('JSON.stringify(window.__liqStep.last)');
    const tag = `${i}. ${armed.names[i]}${last.gone ? ' [gone]' : ''}`;
    console.log(line(tag, m, prev));
    series.push({ label: tag, clicked: !!last.clicked, gone: !!last.gone, ...m, metrics: undefined });
    prev = m.privateMb;
  }

  fs.writeFileSync(OUT, JSON.stringify(series, null, 2));
  const first = series[0].privateMb;
  const lastMb = series[series.length - 1].privateMb;
  const steps = series
    .slice(1)
    .map((s, i) => ({ label: s.label, d: Math.round((s.privateMb - series[i].privateMb) * 10) / 10 }))
    .sort((a, b) => b.d - a.d);
  console.log(`\nTOTAL ${first} → ${lastMb} MB (Δ${Math.round((lastMb - first) * 10) / 10} MB)`);
  console.log('largest steps:');
  for (const s of steps.slice(0, 5)) console.log(`  ${String(s.d).padStart(9)} MB   ${s.label}`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
