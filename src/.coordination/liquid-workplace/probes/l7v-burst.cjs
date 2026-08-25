/**
 * L7 instrument — rubric category 7 legs 2 and 4, pointed at the VIDEO window's Media Center.
 *
 * Leg 2 asks for the longest MAIN-PROCESS block observed while the surface does its real work,
 * against a 500 ms bar. Leg 4 asks what that same burst costs main in private bytes and handles —
 * the path that once took the Dictionary window from 604.2 MB to 7,082.0 MB over 19 controls.
 * Both are read from routes that touch main only: `/health` for the block and `/mem` for the
 * allocation. `/eval` is deliberately NOT used for the timing, because a renderer eval measures
 * the renderer.
 *
 * THE BURST is the Media Center's own dominant-task path, driven through the product: shelf
 * switches across the whole rail, the release-kind filter, both view densities, a series drawer
 * opened and closed, and the sidebar destinations. Every one is reversible and none writes user
 * data — the same skip rules `l1-deadend.js` carries (`Add`, `Play`, `.medialib-ep`, standalone
 * cards, the native dialogs) are applied here by reusing its label test.
 *
 * THE CONTROL is `--sensitivity`: a synchronous block planted in MAIN via a route that runs
 * there. Without one, a run of small numbers cannot be told from an instrument that cannot see.
 * `/health` is answered on main's own loop, so a real main block shows up as a long sample.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l7v-burst.cjs [--title Video] [--sensitivity]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const idx = process.argv.indexOf('--title');
const TITLE = (process.argv.find((a) => a.startsWith('--title=')) || '').split('=')[1]
  || (idx >= 0 ? process.argv[idx + 1] : '') || 'Video';
const SENSITIVITY = process.argv.includes('--sensitivity');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
const get = async (route) => (await fetch(`http://127.0.0.1:${cfg.port}${route}`, { headers: H })).json();
const post = async (route, body) => (await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
  method: 'POST', headers: H, body: JSON.stringify(body || {}),
})).json();
async function ev(js) {
  const t = await post('/eval', { js: js.replace(/\s*;\s*$/, '').trimEnd() });
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  try { return JSON.parse(t.result); } catch { return t.result; }
}

const WIN = `([].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
  var r = w.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  var t = w.querySelector('.fwin-title-text, .fwin-title');
  return !!t && (t.textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0;
})[0])`;

/** One burst step: click the nth drivable control matching a selector + label prefix. */
const step = (sel, prefix) => `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window' });
  var t = [].slice.call(w.querySelectorAll(${JSON.stringify(sel)})).filter(function(el){
    var r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && el.checkVisibility({contentVisibilityAuto:true}))) return false;
    var n = (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g,' ').trim();
    return n.indexOf(${JSON.stringify(prefix)}) === 0;
  })[0];
  if (!t) return JSON.stringify({ clicked: false, why: ${JSON.stringify(prefix)} });
  t.click();
  return JSON.stringify({ clicked: true });
})()`;

const openDetails = `(function(){
  var w = ${WIN};
  [].slice.call(w.querySelectorAll('details')).forEach(function(d){ d.open = true; });
  return JSON.stringify({ ok: true });
})()`;

const openSeriesCard = `(function(){
  var w = ${WIN};
  var c = [].slice.call(w.querySelectorAll('.medialib-card')).filter(function(x){
    var b = x.querySelector('.medialib-card__badge');
    return b && /^\\d+\\s*\\/\\s*\\d+$/.test((b.textContent || '').trim());
  })[0];
  if (!c) return JSON.stringify({ clicked: false });
  c.click();
  return JSON.stringify({ clicked: true });
})()`;

const closeDrawer = `(function(){
  var w = ${WIN};
  var b = w.querySelector('.medialib-drawer [class*="__close"]');
  if (b) b.click();
  return JSON.stringify({ closed: !!b });
})()`;

const surface = `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window' });
  return JSON.stringify({
    shelf: (w.querySelector('.medialib-rail [aria-current="true"]') || {}).textContent || null,
    cards: w.querySelectorAll('.medialib-card').length,
    controls: w.querySelectorAll('button,a[href],[role="button"],[role="tab"]').length,
    nodes: w.querySelectorAll('*').length,
    chars: (w.textContent || '').replace(/\\s+/g, ' ').trim().length,
  });
})()`;

const BURST = [
  ['rail', '.medialib-rail button,.medialib-rail [role="button"]', 'Continue watching'],
  ['rail', '.medialib-rail button,.medialib-rail [role="button"]', 'Study queue'],
  ['rail', '.medialib-rail button,.medialib-rail [role="button"]', 'Favorites'],
  ['rail', '.medialib-rail button,.medialib-rail [role="button"]', 'Tracking'],
  ['rail', '.medialib-rail button,.medialib-rail [role="button"]', 'Anime'],
  ['rail', '.medialib-rail button,.medialib-rail [role="button"]', 'TV shows'],
  ['rail', '.medialib-rail button,.medialib-rail [role="button"]', 'Unsorted'],
  ['rail', '.medialib-rail button,.medialib-rail [role="button"]', 'Recently added'],
  ['kind', '.medialib-kind button', 'Series'],
  ['kind', '.medialib-kind button', 'All'],
  ['view', '.medialib-view button,button', 'List view'],
  ['view', '.medialib-view button,button', 'Grid view'],
  ['nav', '.mc-sidebar button,nav button', 'Home'],
  ['nav', '.mc-sidebar button,nav button', 'Readiness'],
  ['nav', '.mc-sidebar button,nav button', 'Review'],
  ['nav', '.mc-sidebar button,nav button', 'Study Mode'],
  ['nav', '.mc-sidebar button,nav button', 'Music'],
  ['nav', '.mc-sidebar button,nav button', 'Library'],
];

(async () => {
  console.log('focus     ', JSON.stringify(await post('/focus', {})));
  await sleep(500);
  const before = await ev(surface);
  if (before.refuse) throw new Error(before.refuse);
  console.log('surface   ', JSON.stringify(before));
  if (!before.cards) throw new Error('REFUSE — 0 cards; an empty harness caps this category at 0');

  const mem0 = await get('/mem');
  const health = [];
  let stop = false;
  // What the sampler thinks is happening right now. A max with no step attached is a number
  // nobody can act on; the first run of this probe returned 3,117 ms and could not say which of
  // eighteen controls produced it.
  let current = 'idle';
  const poll = (async () => {
    while (!stop) {
      const t0 = Date.now();
      try { await get('/health'); } catch { /* counted by the gap */ }
      health.push({ ms: Date.now() - t0, step: current });
      await sleep(120);
    }
  })();

  if (SENSITIVITY) {
    /**
     * THE SENSITIVITY CONTROL, and it is deliberately not this surface's own work. What has to be
     * proven is that `/health` can SEE a main block at all; the Media Center's heaviest action is
     * the thing under test and cannot double as the proof that the instrument works. 600 lookups
     * through `dict:lookup` run on main's own loop against the 697k-row dictionary — the same
     * shape the Dictionary surface's control used, where 756 lookups read 38,049.3 ms against a
     * 1.0 ms idle p50. `/eval` returns immediately; the burst runs on after it.
     */
    await ev(`(function(){ for (var i = 0; i < 600; i += 1) { window.api.lookupWord('\\u98df\\u3079\\u308b'); } return JSON.stringify({ fired: 600 }); })()`);
    console.log('control    600 dict:lookup calls fired onto main');
  }

  const driven = [];
  await ev(openDetails);
  for (const [group, sel, prefix] of BURST) {
    current = `${group}:${prefix}`;
    const r = await ev(step(sel, prefix));
    driven.push(`${group}:${prefix}=${r.clicked ? 'ok' : 'miss'}`);
    await sleep(260);
    if (group === 'rail' || group === 'kind') await ev(openDetails);
  }
  current = 'drawer-open';
  console.log('drawer    ', JSON.stringify(await ev(openSeriesCard)));
  await sleep(700);
  current = 'drawer-close';
  console.log('drawer x  ', JSON.stringify(await ev(closeDrawer)));
  await sleep(700);
  current = 'settle';

  stop = true;
  await poll;
  await sleep(3000);
  const mem1 = await get('/mem');

  const sorted = health.map((h) => h.ms).sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  const over = health.filter((h) => h.ms > 500).map((h) => `${h.step}=${h.ms}ms`);
  // `/mem` reports main's own numbers at the top level; there is no `main` sub-object and no
  // handle count. Handles come from `Get-Process` in the section that records the run.
  const mb = (m) => (m ? m.privateMb : null);
  const rss = (m) => (m ? m.rssMb : null);

  console.log('driven    ', driven.join(' '));
  console.log('after     ', JSON.stringify(await ev(surface)));
  console.log('');
  console.log(`LEG 2     /health samples ${health.length}, p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, MAX ${sorted[sorted.length - 1]} ms  (bar: no main block over 500 ms)`);
  console.log(`OVER 500  ${over.length ? over.join(' ') : 'none'}`);
  console.log(`LEG 4     main private ${mb(mem0)} MB -> ${mb(mem1)} MB (delta ${Math.round((mb(mem1) - mb(mem0)) * 10) / 10}), rss ${rss(mem0)} -> ${rss(mem1)}, uptime ${mem0.uptimeSec}s -> ${mem1.uptimeSec}s`);
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
