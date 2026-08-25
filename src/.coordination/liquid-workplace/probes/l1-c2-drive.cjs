/**
 * L1 instrument — the driver for rubric category 2's dead-end sweep (`l1-deadend.js`).
 *
 * WHY A DRIVER AND NOT A HAND-TYPED SETUP. The sweep measures the controls that are ON SCREEN at
 * arm time, and on the Media Center that population is a product of four separate disclosure
 * states plus the active shelf plus whether a card's detail drawer is open. Every earlier Video
 * run set that up by hand through one-off `/eval`s, and the state it ended up in is why two of
 * them disagreed: `Continue watching` (2 entries, ONE title) renders a spotlight and not a card,
 * so the roster it armed on had no drawer in it at all. This file makes the arm state an argument
 * with a printed receipt, and restores it afterwards.
 *
 * ARM STATE, and each half is load-bearing:
 *   - `--shelf` picks the rail row (default `Recently added`, the widest shelf — 36 files / 8
 *     titles / >=2 kinds, which is the only state where the release-kind disclosure renders).
 *   - every `<details>` in the window is OPENED. `painted()` now filters on `checkVisibility`,
 *     so a control inside a closed disclosure is out of the population; opening them puts those
 *     nine controls back IN, reachable rather than merely rectangular. Measured as found on
 *     2026-08-25: 9 of 32 controls returned a real `getBoundingClientRect` box and
 *     `checkVisibility → false`.
 *   - the first card's detail drawer is opened, because a card does not navigate — it toggles a
 *     drawer in place, roster 34 -> 45, and those eleven controls are the surface's deepest
 *     dominant-task path.
 *
 * THE CONTROL IS THE SWEEP'S OWN BAIT: a handler-less `Probe control` button injected into the
 * window and driven exactly like the rest. It must report `changed:false` on BOTH the sweep pass
 * and the confirmation pass. If it ever moves, every 0 the run prints is void, and this driver
 * says so in its own summary rather than leaving it to the reader.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/l1-c2-drive.cjs [--title Video] [--shelf "Recently added"]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const arg = (name, dflt) => {
  const eq = (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=');
  if (eq) return eq;
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const TITLE = arg('title', 'Video');
const SHELF = arg('shelf', 'Recently added');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(route, payload) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return r.json();
}

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js: js.replace(/\s*;\s*$/, '').trimEnd() }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 400)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

/** The window walk, inlined into every leg so no two legs can disagree about the surface. */
const WIN = `([].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
  var r = w.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  var t = w.querySelector('.fwin-title-text, .fwin-title');
  return !!t && (t.textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0;
})[0])`;

const goLibrary = `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window' });
  if (w.querySelector('.medialib-rail')) return JSON.stringify({ already: true });
  var t = [].slice.call(w.querySelectorAll('.mc-sidebar button, .mc-sidebar a[href], nav button')).filter(function(el){
    return ((el.textContent || '').replace(/\\s+/g,' ').trim()).indexOf('Library') === 0;
  })[0];
  if (!t) return JSON.stringify({ clicked: false, why: 'no Library destination' });
  t.click();
  return JSON.stringify({ clicked: true });
})()`;

const snapshot = `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window titled ${TITLE}' });
  var mc = w.querySelector('.mc-root');
  var vis = function(el){ var r = el.getBoundingClientRect(); return r.width>0 && r.height>0 && el.checkVisibility({contentVisibilityAuto:true}); };
  return JSON.stringify({
    presentation: w.getAttribute('data-presentation'),
    shelf: (w.querySelector('.medialib-rail [aria-current="true"]') || {}).textContent || null,
    details: [].slice.call(w.querySelectorAll('details')).map(function(d){ return String(d.className).split(' ')[0] + '=' + d.open; }),
    cards: w.querySelectorAll('.medialib-card').length,
    spotlight: w.querySelectorAll('.medialib-spotlight').length,
    drawer: w.querySelectorAll('.medialib-drawer').length,
    kindChips: w.querySelectorAll('.medialib-chip').length,
    controlsBox: [].slice.call(w.querySelectorAll('button,a[href],[role="button"],[role="tab"]')).filter(function(el){ var r=el.getBoundingClientRect(); return r.width>0&&r.height>0; }).length,
    controlsVisible: [].slice.call(w.querySelectorAll('button,a[href],[role="button"],[role="tab"]')).filter(vis).length,
    view: (function(){ var b = [].slice.call(w.querySelectorAll('button')).filter(function(x){ return /^(Grid|List) view$/.test((x.textContent||'').trim()) && x.classList.contains('active'); })[0]; return b ? b.textContent.trim() : null; })()
  });
})()`;

const clickByText = (text, sel = 'button,[role="button"]') => `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window' });
  var t = [].slice.call(w.querySelectorAll(${JSON.stringify(sel)})).filter(function(el){
    return ((el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g,' ').trim()).indexOf(${JSON.stringify(text)}) === 0;
  })[0];
  if (!t) return JSON.stringify({ clicked: false, why: 'not found: ' + ${JSON.stringify(text)} });
  t.click();
  return JSON.stringify({ clicked: true });
})()`;

const setDetails = (open) => `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window' });
  var d = [].slice.call(w.querySelectorAll('details'));
  var changed = 0;
  d.forEach(function(x){ if (x.open !== ${open ? 'true' : 'false'}) { x.open = ${open ? 'true' : 'false'}; changed += 1; } });
  return JSON.stringify({ n: d.length, changed: changed });
})()`;

/**
 * Opens the drawer on the first SERIES card. Not the first card: a standalone entry's card calls
 * `onPlay` (`MediaLibraryShell.tsx:227`) and leaves the Library tab, which is exactly how the
 * 2026-08-25 first run lost its arm state. The badge is `"<watched> / <episodes>"` for a series
 * and a duration for a standalone, so the count form picks the safe one.
 */
const openFirstCard = `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window' });
  if (w.querySelectorAll('.medialib-drawer').length) return JSON.stringify({ already: true });
  var cards = [].slice.call(w.querySelectorAll('.medialib-card'));
  var series = cards.filter(function(c){
    var b = c.querySelector('.medialib-card__badge');
    return b && /^\\d+\\s*\\/\\s*\\d+$/.test((b.textContent || '').trim());
  });
  if (!series.length) return JSON.stringify({ clicked: false, why: 'no series card on this shelf', cards: cards.length });
  var c = series[0];
  var title = (c.getAttribute('aria-label') || c.textContent || '').replace(/\\s+/g,' ').trim().slice(0, 40);
  c.click();
  return JSON.stringify({ clicked: true, card: title, seriesCards: series.length, cards: cards.length });
})()`;

const closeDrawer = `(function(){
  var w = ${WIN};
  if (!w) return JSON.stringify({ refuse: 'no window' });
  var b = w.querySelector('.medialib-drawer [class*="__close"]');
  if (!b) return JSON.stringify({ drawer: w.querySelectorAll('.medialib-drawer').length });
  b.click();
  return JSON.stringify({ closed: true });
})()`;

const probeDir = path.join('src', '.coordination', 'liquid-workplace', 'probes');
const sweepSrc = fs.readFileSync(path.join(probeDir, 'l1-deadend.js'), 'utf8');
const readSrc = fs.readFileSync(path.join(probeDir, 'l1-deadend-read.js'), 'utf8');

(async () => {
  /**
   * FOCUS FIRST, because an unfocused Electron window throttles `setTimeout` to ~1 Hz and the
   * sweep is built out of them. Measured 2026-08-25: a 120 ms interval ticked ONCE in 2 s while
   * the terminal held the foreground, so `settle()`'s 20 tries stretched from 2.4 s to ~20 s and
   * the run looked stalled at `3/42`. Worse than slow — a settle that times out reports
   * `unstable`, which is a coverage hole this probe would then attribute to the app.
   */
  console.log('focus     ', JSON.stringify(await post('/focus', {})));
  await sleep(600);

  const asFound = await ev(snapshot);
  if (asFound.refuse) throw new Error(asFound.refuse);
  console.log('as-found  ', JSON.stringify(asFound));

  console.log('library   ', JSON.stringify(await ev(goLibrary)));
  await sleep(900);
  if (SHELF && String(asFound.shelf || '').indexOf(SHELF) !== 0) {
    console.log('shelf     ', JSON.stringify(await ev(clickByText(SHELF, '.medialib-rail button,.medialib-rail [role="button"]'))));
    await sleep(700);
  }
  console.log('disclose  ', JSON.stringify(await ev(setDetails(true))));
  await sleep(400);
  console.log('card      ', JSON.stringify(await ev(openFirstCard)));
  await sleep(900);
  console.log('disclose2 ', JSON.stringify(await ev(setDetails(true))));
  await sleep(300);

  const armState = await ev(snapshot);
  console.log('at arm    ', JSON.stringify(armState));

  /**
   * REFUSE RATHER THAN ARM ON THE WRONG PAGE. The first run of this driver (2026-08-25) armed on
   * the Media Center's HOME tab: the shelf click found no `.medialib-rail`, `openFirstCard` found
   * no card, and the sweep went ahead and measured 24 home-page tiles. Its numbers read exactly
   * like a category-2 result for the Library — `coverage 15/22`, `deadEnds []` — on a surface it
   * had never been pointed at. A refusal that names the missing state costs one line; a number
   * from the wrong page costs the whole score.
   */
  const missing = [];
  if (!armState.shelf) missing.push('no .medialib-rail — the window is not on the Library tab');
  if (SHELF && String(armState.shelf || '').indexOf(SHELF) !== 0) missing.push(`shelf is ${JSON.stringify(armState.shelf)}, wanted ${JSON.stringify(SHELF)}`);
  if (!armState.cards && !armState.spotlight) missing.push('no cards and no spotlight — the shelf is empty');
  if (armState.cards && !armState.drawer) missing.push('a card exists but its detail drawer did not open');
  if (armState.details.some((d) => d.endsWith('=false'))) missing.push(`a disclosure is still closed: ${armState.details.join(',')}`);
  if (missing.length) throw new Error(`REFUSE — arm state not reached:\n  - ${missing.join('\n  - ')}`);

  // The throttle check, run against the wall clock the sweep will actually live in.
  await ev('(function(){ window.__lqTick = 0; var id = setInterval(function(){ window.__lqTick += 1; if (window.__lqTick >= 40) clearInterval(id); }, 120); return JSON.stringify({ started: true }); })()');
  await sleep(1500);
  const ticks = (await ev('JSON.stringify({ tk: window.__lqTick })')).tk;
  console.log('timer     ', `${ticks} ticks of a 120 ms interval in 1.5 s (unthrottled ~12)`);
  if (ticks < 6) throw new Error(`REFUSE — renderer timers are throttled (${ticks} ticks in 1.5 s). The window is not focused; every settle() would time out and report unstable.`);

  await ev(`(window.__lqDeadEndTitle = ${JSON.stringify(TITLE)})`);
  let armed = await ev(sweepSrc);
  // The first arm only FLAGS a still-running sweep; the second one gets a quiet surface.
  if (armed.refuse && /previous sweep/.test(armed.refuse)) {
    console.log('abort     ', JSON.stringify(armed));
    await sleep(6000);
    armed = await ev(sweepSrc);
  }
  if (armed.refuse) throw new Error(`REFUSE — ${armed.refuse}`);
  console.log('armed     ', JSON.stringify({ nRoster: armed.nRoster, nTargets: armed.nTargets, unlabelled: armed.unlabelled }));
  console.log('targets   ', JSON.stringify(armed.targets));
  console.log('skipped   ', JSON.stringify(armed.skipped));

  let read = null;
  let last = '';
  let stalled = 0;
  for (let i = 0; i < 120; i += 1) {
    await sleep(5000);
    read = await ev(readSrc);
    if (read.refuse) throw new Error(read.refuse);
    console.log(`progress  ${read.progress}${read.done ? ' done' : ''}`);
    if (read.error) throw new Error(`sweep threw at ${read.crashedAt}: ${read.error}`);
    stalled = read.progress === last ? stalled + 1 : 0;
    last = read.progress;
    // 60 s with the counter frozen is not a slow settle: the longest a single target can take is
    // SETTLE_TRIES * SETTLE_MS + STEP_MS ~= 2.7 s.
    if (stalled >= 12) throw new Error(`sweep stalled at ${read.progress} for 60 s`);
    if (read.done) break;
  }
  if (!read.done) throw new Error(`sweep never completed: ${read.progress}`);
  console.log('RESULT    ', JSON.stringify(read, null, 1));

  const bait = read.baitReported && read.baitReported[0];
  const baitOk = bait && bait.changed === false && bait.secondPassChanged !== true;
  console.log('');
  console.log(`VERDICT   coverage ${read.coverage}, deadEnds ${JSON.stringify(read.deadEnds)}, unstable ${read.unstable.length}, gone ${read.gone.length}`);
  console.log(`CONTROL   ${baitOk ? 'FIRED — bait changed:false on both passes' : 'DID NOT FIRE — this run is VOID'}  ${JSON.stringify(read.baitReported)}`);
  console.log(`TRIPWIRE  savedStoreUntouched=${read.savedStoreUntouched}`);

  console.log('restore   ', JSON.stringify(await ev(closeDrawer)));
  await sleep(600);
  console.log('restore d ', JSON.stringify(await ev(setDetails(false))));
  await sleep(300);
  console.log('as-left   ', JSON.stringify(await ev(snapshot)));
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
