/**
 * RUBRIC CATEGORY 7 HARNESS — "performance under real load", ONE runner for every surface.
 *
 * RULE 1 (pin, 2026-08-25): eight harnesses, not eighty probes. Category 7 already had two
 * good INSTRUMENTS — `tools/liquid-perf-probe.ps1` (main event-loop availability) and
 * `tools/liquid-interaction-probe.ps1` (renderer frame stability across a real gesture) —
 * and no runner. Every surface scored so far re-derived by hand which legs to run, in which
 * order, against which baseline, and each of those hand-runs produced a different subset.
 * That is the shape RULE 1 exists to stop. This file is the missing half: the instruments
 * are reused verbatim, and everything a SURFACE contributes is data in `SPECS`.
 *
 * Adding a surface is ~10 lines. It is never a new probe.
 *
 * The five numbers the rubric names, and where each comes from:
 *   frame stability, drag        interaction probe, -Interaction drag   -Title <surface>
 *   frame stability, resize      interaction probe, -Interaction resize -Title <surface>
 *   theme-switch cost            interaction probe, -Interaction theme  (gesture.paintedMs)
 *   longest main-process block   perf probe, -DuringJs <the surface's heaviest real work>
 *   memory                       /mem (main) + the scene's renderer heap
 *
 * THREE THINGS THIS RUNNER REFUSES TO REPORT WITHOUT, each already paid for:
 *
 *  1. THE SCENE. A category-7 timing without its `.fwin` count and element count is not
 *     comparable to anything. The "330-446 ms theme-switch regression" chased on 2026-08-26
 *     was a 10-window desk measured against L0's 2-window baseline; at L0's own scene the
 *     same swap costs 5.4 ms. Cost is linear in open-window elements. Every leg here carries
 *     its scene, and a leg whose scene MOVED mid-gesture is VOID rather than scored.
 *
 *  2. THIS SESSION'S CEILING, not L0's milliseconds. L0 recorded p50 10.0 ms because that
 *     session ran at ~100 Hz. Measured 2026-08-26 the same display answers 16.7 ms — 60 Hz.
 *     Scoring a 16.7 ms frame against a 10.0 ms baseline reports a 67% regression that does
 *     not exist. Frames are scored against the `ceiling` leg taken in the same session, and
 *     the L0 numbers are recorded alongside as provenance, never as the bar.
 *
 *  3. A REAL RESTART. The rubric voids any main-process number taken without one, so
 *     `/mem`'s `uptimeSec` is recorded and a process still inside its first two minutes
 *     REFUSES — post-boot settling reads as a resize cost (L0's own 475.3 ms row).
 *
 * The surface must already be open; this runner measures, it does not navigate. A spec root
 * inside `.fwin` is scoped by title. A root with no `.fwin` ancestor is the OS window itself
 * and uses the interaction probe's `-Root` branch. Either way, a missing root refuses so an
 * absent surface can never score as a fast one.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/cat7-perf.cjs --surface captures
 *   node src/.coordination/liquid-workplace/probes/cat7-perf.cjs --surface captures --jank
 *
 * --jank runs the drag leg a second time with the interaction probe's 120 ms renderer
 * blocks. It is the sensitivity control: if the distribution does NOT get worse, the
 * recorder is not seeing the frames it claims to and every number in the run is void.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// ---------------------------------------------------------------------------- specs
// `title` is a substring, matched against the window's own title text, and is passed
// straight to the interaction probe's -Title. `heavy` is the surface's HEAVIEST REAL
// operation — the rubric's words — expressed as one renderer expression, because /eval
// is synchronous and one expression is all it takes (a trailing `;` throws).
// A surface's "scroll the whole collection" load, written once. Picks the element inside the
// root with the largest real overflow rather than naming a scroller per surface -- the same
// ranking `cat7-collection-weight.cjs` uses, and for the same reason: a list that is not
// virtualised scrolls in an ANCESTOR, so a hardcoded child selector silently misses and the
// load never happens. Returns the element it chose so the record shows what was scrolled.
const scrollAll = (rootSel) => `(() => {
  // Cleared before any refuse, so a load that never armed cannot be vouched for by the
  // PREVIOUS run's receipt. That is the zombie-recorder shape this repo has already paid for.
  delete window.__lqScrollLoad;
  const root = document.querySelector(${JSON.stringify(rootSel)});
  if (!root) return 'REFUSE: no ' + ${JSON.stringify(rootSel)};
  let best = null, over = 0;
  for (const e of [root, ...root.querySelectorAll('*')]) {
    if (e.clientHeight < 40) continue;
    const o = e.scrollHeight - e.clientHeight;
    if (o > over) { over = o; best = e; }
  }
  if (!best || over < 20) return 'REFUSE: nothing scrolls inside ' + ${JSON.stringify(rootSel)};
  const start = best.scrollTop;
  const rec = { sel: String(best.className || best.tagName).slice(0, 60), over: over, ticks: 0, reached: 0, start, restored: false };
  window.__lqScrollLoad = rec;
  let n = 0;
  const t = setInterval(() => {
    best.scrollTop = (n * 240) % Math.max(1, best.scrollHeight);
    rec.ticks++;
    if (best.scrollTop > rec.reached) rec.reached = best.scrollTop;
    if (++n > 90) {
      clearInterval(t);
      best.scrollTop = start;
      rec.restored = best.scrollTop === start;
    }
  }, 20);
  return 'scrolling ' + rec.sel + ' over=' + over;
})()`;

/**
 * The receipt for every `scrollAll` leg, and it has to come from the LOAD, not from a re-query.
 *
 * A proof written as `document.querySelector('<the scroller>').scrollTop` looks equivalent and is
 * not: `scrollAll` chooses by LARGEST OVERFLOW and `querySelector` returns DOM ORDER, and on
 * Flashcards those are different nodes — two `.flash-group-body-vlist` bodies, the 15,142 px one
 * first in the document and the 331,582 px one second. The re-query read the untouched scroller,
 * answered 0, and VOIDed a leg that had in fact scrolled the right element to 21,600 px. So the
 * load records what IT touched, and this only reads it back.
 *
 * The bar is `reached`, not the resting `scrollTop`: a virtualised body's `scrollHeight` shrinks
 * as rows unmount, so the browser clamps the final position well below the furthest point driven.
 */
const scrollProof = `(() => {
  const s = window.__lqScrollLoad;
  if (!s) return 'REFUSE: the scroll load never armed - nothing recorded a receipt';
  if (s.ticks < 10) return 'REFUSE: the scroll load ticked only ' + s.ticks + ' times; its timer was throttled or cleared';
  if (s.reached < 1000) return 'REFUSE: the scroll load reached only ' + Math.round(s.reached) + ' px on ' + s.sel;
  if (!s.restored) return 'REFUSE: the scroll load did not restore its starting offset ' + s.start + ' on ' + s.sel;
  return 'scrolled ' + s.sel + ' to ' + Math.round(s.reached) + ' px over ' + s.ticks + ' ticks (overflow ' + s.over + '), restored to ' + s.start;
})()`;

const SPECS = {
  captures: {
    title: 'Reading',
    root: '.reading-captures',
    heavy: {
      label: 'select every capture in turn',
      durationMs: 2500,
      // Clicking each row re-renders the reader pane against a different capture. That is
      // what a user does with this surface and it is the only work it does at any scale.
      js: `(() => { const rows = Array.from(document.querySelectorAll('.reading-captures-row')); rows.forEach((r, i) => setTimeout(() => r.click(), i * 12)); return 'clicking ' + rows.length; })()`,
    },
    collection: { container: '.reading-captures', row: '.reading-captures-row' },
  },
  library: {
    title: 'Library',
    root: '.library',
    heavy: {
      label: 'scroll the whole library',
      durationMs: 2500,
      js: scrollAll('.library'),
      proof: scrollProof,
    },
    collection: { container: '.library', row: '.card' },
  },
  immersion: {
    title: 'Immersion',
    root: '.immersion-root',
    heavy: {
      // The rail is a scrolling collection of 20 site cards; scrolling it is the surface's
      // real load. CLICKING each card is NOT usable here -- a card navigates the embedded
      // browser to a live site, which is network work on the user's own connection and
      // changes real state. The rubric's "heaviest real operation" never means "cause a
      // side effect the score does not need".
      label: 'scroll the whole site rail',
      durationMs: 2500,
      js: scrollAll('.immersion-root'),
      proof: scrollProof,
    },
    collection: { container: '.immersion-root', row: '.immersion-site-row' },
  },
  novels: {
    title: 'Novels',
    // The shelf was deliberately partial: it does not exercise the app's heaviest path. The
    // complete cell opens a real volume, captures its progress, and restores it after this run.
    // `.novel-scroller` has no `.fwin` ancestor because the reader replaces the desktop shell,
    // so the runner selects the root-window gesture path from the DOM fact above.
    root: '.novel-scroller',
    heavy: { label: 'scroll the rendered volume', durationMs: 3000, js: scrollAll('.novel-scroller'), proof: scrollProof },
    collection: { container: '.novel-scroller', row: '.novel-content p' },
  },
  manga: {
    title: 'Manga',
    root: '.manga-canvas',
    heavy: {
      label: 'page through the volume',
      durationMs: 3000,
      js: `(() => { const b = Array.from(document.querySelectorAll('button')).filter((x) => /next|次|下一|След/i.test((x.textContent || '').trim())); if (!b.length) return 'no pager'; let n = 0; const t = setInterval(() => { b[0].click(); if (++n > 12) clearInterval(t); }, 60); return 'paging'; })()`,
    },
    collection: { container: '.manga-canvas', row: 'img, canvas' },
  },
  vn: {
    // The visual-novel library REPLACES Immersion's browser INSIDE Immersion's own window,
    // so its window chrome — bar, resize grip, title — is Immersion's and both gesture legs
    // run unchanged. Both identity terms are load-bearing and neither is sufficient: the
    // title alone matches the browser as well (`39872497` measured that mistake costing five
    // fabricated regressions in category 6), and `.visual-novel-panel` alone names no window
    // for the interaction probe to grip.
    title: 'Immersion',
    root: '.visual-novel-panel',
    heavy: {
      // Morphological analysis of every captured line is the only work this surface does at
      // scale, and it is the one the user waits on. 8 s because the leg must COVER its load;
      // `span_ms` is checked against it rather than assumed.
      label: 'analyze every captured line',
      durationMs: 8000,
      js: `(() => { const b = document.querySelectorAll('.visual-novel-analysis-actions button')[0]; if (!b) return 'REFUSE: no analyze button'; if (b.disabled) return 'REFUSE: analyze is disabled — ' + (b.title || 'no reason given'); b.click(); return 'analyzing ' + document.querySelectorAll('.visual-novel-capture-row').length + ' lines'; })()`,
      proof: `(() => { const s = document.querySelector('.visual-novel-analysis-summary'); return s ? s.textContent.trim().slice(0, 120) : '' })()`,
    },
    collection: { container: '.visual-novel-capture-list', row: '.visual-novel-capture-row' },
  },
  flashcards: {
    title: 'Flashcards',
    root: '.flash-view',
    heavy: {
      // The deck body is a VirtualList over the whole collection, so scrolling it is not a
      // paint — every frame unmounts and remounts a window of rows. Measured live before the
      // spec was written: `.flash-group-body-vlist` carries 331,582 px of overflow against 32
      // mounted `.flash-row`s, which is the whole point of picking it. Review is NOT the heavy
      // leg: it renders one card and it writes SRS state the score does not need.
      label: 'scroll the whole deck',
      durationMs: 3000,
      js: scrollAll('.flash-view'),
      proof: scrollProof,
    },
    collection: { container: '.flash-group-body-vlist', row: '.flash-row' },
  },
  notebook: {
    title: 'Notebook',
    root: '.gx-notebook',
    heavy: {
      // The timeline renders the capped 400-row aggregate plus its provenance chains. Scrolling
      // that whole tree is the heaviest read-only operation a Notebook user can repeat without
      // starting Live Captions or navigating into another app and changing the measured surface.
      label: 'scroll the whole notebook timeline',
      durationMs: 3000,
      js: scrollAll('.gx-notebook'),
      proof: scrollProof,
    },
    collection: { container: '.gx-notebook-timeline', row: '.gx-notebook-item' },
  },
  statistics: {
    title: 'Statistics',
    root: '.stats-view',
    heavy: {
      // Statistics has no destructive-free recompute a user can repeat -- Reset wipes the store
      // and Anki sync writes 41k entries (L7_REVIEW_LEARNING, 2026-08-28 09:48). Scrolling the
      // whole view is its heaviest repeatable read-only work, and the scroller is the WINDOW
      // BODY, an ANCESTOR of the root: `.stats-view` is exactly as tall as its content, so
      // scrollAll('.stats-view') correctly finds nothing and refuses. `:has` scopes the body to
      // this window rather than to whichever .fwin happens to be first in the document.
      label: 'scroll the whole statistics view',
      durationMs: 2500,
      js: scrollAll('.fwin:has(.stats-view) .fwin-body'),
      proof: scrollProof,
    },
    collection: { container: '.stats-view', row: '.stats-book-row' },
  },
  dictionary: {
    title: 'Dictionary',
    root: '.dict-view',
    heavy: {
      label: '126 cold lookups',
      durationMs: 20000,
      // L0's own reference load, kept verbatim so this runner reproduces the baseline row
      // rather than inventing a second, incomparable one.
      js: `(() => { const w = ['走る','泳ぐ','登る','降りる','渡る','曲がる','進む','戻る','届く','届ける','預ける','借りる','貸す','返す','払う','売る','買う','配る','集める','並ぶ','並べる']; const suf = ['','が','を','に','で','は']; for (const s of suf) { for (const x of w) { window.api.lookupTerm(x + s).catch(() => {}); } } return 'fired ' + (w.length * suf.length); })()`,
    },
    collection: { container: '.dict-view', row: '.dict-entry' },
  },
};

// L0-baseline-1, recorded 2026-08-16 in PERF_BASELINE_RESTART.md. PROVENANCE, NOT THE BAR —
// see refusal 2 above. `ceilingP50` is what makes the rest of the row readable at all.
const L0 = {
  ceilingP50: 10.0,
  drag: { p50: 10.0, p95: 10.1, max: 90.1, over100: 0, mainMax: 129.5 },
  resize: { p50: 10.0, p95: 10.2, max: 80.1, over100: 0, mainMax: 145.8 },
  theme: { p50: 10.0, p95: 10.1, max: 20.0, over100: 0, mainMax: 143.4, paintedMs: 20.0 },
  mainBlockBarMs: 500,
};

// ---------------------------------------------------------------------------- args
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);
const SURFACE = arg('surface', '');
const spec = SPECS[SURFACE];
if (!spec) {
  console.error(`REFUSE - --surface must be one of: ${Object.keys(SPECS).join(', ')}`);
  process.exit(2);
}

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', Connection: 'close' };

// A leg here takes minutes of PowerShell, and the bridge closes an idle keep-alive socket
// in that gap. Node then reuses the dead socket and the whole run dies ECONNRESET on the
// closing /mem read — after every measurement was already taken. Retry, and ask for a fresh
// connection each time; a transport hiccup must not throw away four minutes of gestures.
async function http(route, init, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${cfg.port}${route}`, { ...init, headers: H })).json();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw last;
}
const get = (route) => http(route, {});
async function ev(js) {
  const r = await http('/eval', { method: 'POST', body: JSON.stringify({ js: js.replace(/\s*;\s*$/, '').trimEnd() }) });
  if (!r.ok) throw new Error(`eval failed: ${JSON.stringify(r).slice(0, 300)}`);
  return r.result;
}

// The instruments are PowerShell. Scalars only across that boundary: `pwsh -File` binds
// "8,16,24" as the single number 81624, which is a banked trap in this repo.
function ps(script, args) {
  const r = spawnSync('pwsh', ['-NoProfile', '-File', script, ...args], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true,
  });
  const out = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
  if (r.status !== 0 || !out.startsWith('{')) {
    throw new Error(`instrument failed (${script} ${args.join(' ')}): ${(r.stderr || out || '').slice(0, 500)}`);
  }
  return JSON.parse(out);
}

const IPROBE = 'tools/liquid-interaction-probe.ps1';
const PPROBE = 'tools/liquid-perf-probe.ps1';

(async () => {
  // --- refusals, before a single number is taken -----------------------------------
  const mem = await get('/mem');
  if (!mem.ok) throw new Error('REFUSE - /mem did not answer; main memory is part of this score');
  if (mem.uptimeSec < 120) {
    throw new Error(`REFUSE - main process is ${mem.uptimeSec}s old. The rubric voids a main number taken without a settled process; L0's own 475.3 ms "resize cost" was post-boot settling.`);
  }

  const found = JSON.parse(await ev(`(function(){
    var wins = [].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
      var r = w.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    });
    var t = function(w){ var e = w.querySelector('.fwin-title-text, .fwin-title'); return e ? (e.textContent || '').trim() : ''; };
    var mine = wins.filter(function(w){ return t(w).indexOf(${JSON.stringify(spec.title)}) >= 0; });
    var root = document.querySelector(${JSON.stringify(spec.root)});
    return JSON.stringify({
      windows: wins.length, titles: wins.map(t),
      matched: mine.length,
      matchedElements: mine.reduce(function(n, w){ return n + 1 + w.querySelectorAll('*').length; }, 0),
      rootPresent: !!root,
      rootInFwin: !!(root && root.closest('.fwin')),
      rootElements: root ? 1 + root.querySelectorAll('*').length : 0,
    });
  })()`));
  if (!found.rootPresent) {
    throw new Error(`REFUSE - structural root ${spec.root} is absent, so the requested surface is not on screen.`);
  }
  if (found.rootInFwin && found.matched === 0) {
    throw new Error(`REFUSE - no visible .fwin titled "${spec.title}". Open the surface first; a missing window measures as a fast one. Visible: ${JSON.stringify(found.titles)}`);
  }
  const interactionScope = found.rootInFwin ? ['-Title', spec.title] : ['-Root', spec.root];

  const step = (s) => process.stderr.write(`[cat7] ${s}\n`);
  const legs = {};
  // Collected before the scoring block exists, and merged into `voided` there.
  const voidedEarly = [];
  // --- 1. the session's own frame ceiling, AND its own outlier rate -----------------
  /**
   * THREE READINGS, NOT ONE, AND THE THIRD NUMBER THEY PRODUCE IS THE POINT. The ceiling leg
   * animates a throwaway fixed layer with no layout, no React and no product code, so anything
   * it reports is the machine. Measured 2026-08-26, eight consecutive ceiling readings on an
   * otherwise idle desk: seven at p50 16.7 / max ~17, and one at **max 117.0 ms with 1 frame
   * over 100**. One reading in eight, on a leg that runs no product code at all.
   *
   * That single number explains a run of results this harness has been producing. `breaches()`
   * fired on `frames_over_100 > 0`, with no allowance for an outlier the display itself makes:
   * a full run takes 6-9 gesture readings, so at a ~12% per-reading outlier rate MOST runs of a
   * perfectly healthy surface either VOID as UNSTABLE or report a finding that six re-runs then
   * disprove. Library's phantom "p95 66.9 / max 200.5 / 3 over 100" was this. The VN panel's
   * first run here was this — p50 33.4 / p95 66.8, agreed by both repeats, then eight clean
   * readings — and so were its second and third runs, which voided on a 7,989.5 ms frame and on
   * a lone disagreeing resize.
   *
   * So the ceiling is now the ENVIRONMENT CONTROL as well as the frame budget: a gesture is not
   * blamed for producing no more over-100 frames than the bare compositor produced in the same
   * session. This does not loosen any bar that is about the product — p50 and p95 still score
   * against the ceiling exactly as before, and every raw reading is still recorded. What it
   * removes is a term the control demonstrably fails.
   */
  const ceilingRuns = [];
  for (let i = 0; i < 3; i++) { step(`ceiling ${i + 1}/3`); ceilingRuns.push(ps(IPROBE, ['-Interaction', 'ceiling', '-AsJson'])); }
  legs.ceiling = ceilingRuns.reduce((a, b) => (a.frame_p50_ms <= b.frame_p50_ms ? a : b));
  legs.ceilingRuns = ceilingRuns.map((r) => ({ p50: r.frame_p50_ms, p95: r.frame_p95_ms, max: r.frame_max_ms, over100: r.frames_over_100, frames: r.frames }));
  const ceilingP50 = Math.min(...ceilingRuns.map((r) => r.frame_p50_ms));
  const ceilingP95 = Math.min(...ceilingRuns.map((r) => r.frame_p95_ms));
  // The noise floor: the worst the machine did with nothing of ours running.
  const ceilingOver100 = Math.max(...ceilingRuns.map((r) => r.frames_over_100));
  const ceilingMaxMs = Math.max(...ceilingRuns.map((r) => r.frame_max_ms));

  // --- 2-4. the three gestures, every one scoped to THIS surface's window -----------
  // TWICE, and a third time only to break a tie. A single gesture reading is noise: Library's
  // first scored resize came back p95 66.9 / max 200.5 / 3 frames over 100 ms, and SIX
  // consecutive re-runs -- three on the same mount, three on a freshly reopened window -- all
  // returned p95 16.8 / max 17.0 / 0 over 100. Something took the foreground for ~200 ms. The
  // probe's own focus guard only catches a steal that is still in effect when the gesture ends.
  // Reporting that one reading would have filed a phantom Library defect and cost the next
  // worker a turn, which is precisely what the scene trap cost the last one. A breach is a
  // FINDING only when the majority of readings breach; otherwise the leg is UNSTABLE and every
  // reading is kept in the record.
  const breaches = (r) => (r.frame_p50_ms > ceilingP50 * 1.5) || (r.frame_p95_ms > ceilingP95 * 2)
    || r.frames_over_100 > ceilingOver100 || r.main_max_ms > L0.mainBlockBarMs;
  for (const g of ['drag', 'resize', 'theme']) {
    step(g);
    const runs = [ps(IPROBE, ['-Interaction', g, ...interactionScope, '-AsJson'])];
    step(`${g} (repeat)`);
    runs.push(ps(IPROBE, ['-Interaction', g, ...interactionScope, '-AsJson']));
    if (breaches(runs[0]) !== breaches(runs[1])) {
      step(`${g} (tie-break)`);
      runs.push(ps(IPROBE, ['-Interaction', g, ...interactionScope, '-AsJson']));
    }
    const bad = runs.filter(breaches).length;
    // Score the reading the majority agrees with, so the reported numbers are a real run and
    // never an average of runs that disagree.
    legs[g] = runs.find((r) => breaches(r) === (bad * 2 > runs.length)) || runs[0];
    legs[g].repeats = runs.map((r) => ({ p50: r.frame_p50_ms, p95: r.frame_p95_ms, max: r.frame_max_ms, over100: r.frames_over_100, mainMax: r.main_max_ms, breached: breaches(r) }));
    legs[g].unstable = bad > 0 && bad < runs.length;
  }

  // --- 5. main availability under the surface's heaviest real work ------------------
  step('heavy: ' + spec.heavy.label);
  // -DurationMs, not -Samples: 40 back-to-back /health calls at an idle p50 of 1.3 ms are
  // over in ~52 ms, so a fixed count samples a 240 ms operation across its first fiftieth
  // and reports it clean. The span each spec declares must COVER its own load, and the
  // achieved `span_ms` is checked below rather than trusted.
  legs.heavy = ps(PPROBE, ['-Samples', '40', '-DurationMs', String(spec.heavy.durationMs), '-Label', `${SURFACE}: ${spec.heavy.label}`, '-DuringJs', spec.heavy.js, '-AsJson']);
  // THE LOAD'S OWN RECEIPT. `liquid-perf-probe.ps1` fires -DuringJs and never reads what it
  // returned, by design — it is measuring main while the renderer works. The cost is that a
  // heavy expression which REFUSES (no button, a disabled button, a root that moved) produces
  // a perfectly clean distribution indistinguishable from a fast surface. That is the exact
  // false-pass shape this file's header records for the path-vs-text bug, one layer up. A
  // spec may declare `proof`: an expression evaluated after the leg whose answer must be
  // non-empty and must not refuse. No proof, no claim — the leg is VOID, never a 10.
  if (spec.heavy.proof) {
    legs.heavyProof = await ev(spec.heavy.proof);
    if (!legs.heavyProof || /^REFUSE/.test(String(legs.heavyProof))) {
      voidedEarly.push(`heavy leg left no proof it ran: ${spec.heavy.label} answered ${JSON.stringify(legs.heavyProof)}`);
    }
  }
  // Idle, taken AFTER the load, is what makes the heavy number mean something.
  step('idle');
  legs.idle = ps(PPROBE, ['-Samples', '40', '-DurationMs', String(spec.heavy.durationMs), '-Label', `${SURFACE}: idle`, '-AsJson']);

  // --- 6. the sensitivity control, when asked for -----------------------------------
  if (has('jank')) step('drag CONTROL (-Jank)');
  if (has('jank')) legs.dragJank = ps(IPROBE, ['-Interaction', 'drag', ...interactionScope, '-Jank', '-AsJson']);

  const memAfter = await get('/mem');

  // ---------------------------------------------------------------- scoring
  // Frames are scored against THIS session's ceiling, never against L0's milliseconds.
  const findings = [];
  const voided = [...voidedEarly];
  const environment = [];
  for (const g of ['drag', 'resize', 'theme']) {
    const r = legs[g];
    if (!r.scene_stable) { voided.push(`${g}: the scene moved during the gesture (${r.scene_before.fwins}/${r.scene_before.fwinElements} -> ${r.scene_after.fwins}/${r.scene_after.fwinElements})`); continue; }
    if (r.stale_recorder) voided.push(`${g}: a stale frame recorder was found and disarmed; re-run to be sure`);
    if (r.frame_p50_ms > ceilingP50 * 1.5) findings.push(`${g}: p50 ${r.frame_p50_ms} ms against a ${ceilingP50} ms ceiling`);
    if (r.frame_p95_ms > ceilingP95 * 2) findings.push(`${g}: p95 ${r.frame_p95_ms} ms against a ${ceilingP95} ms ceiling`);
    if (r.frames_over_100 > ceilingOver100) findings.push(`${g}: ${r.frames_over_100} frames over 100 ms, against a ceiling that produced ${ceilingOver100} with no product code running`);
    // Reported, never scored. A frame longer than anything the bare compositor managed is worth
    // a reader's eye, but the control above shows the machine makes them unprompted, so it is
    // not evidence about the surface.
    if (r.frame_max_ms > Math.max(ceilingMaxMs, 100)) {
      environment.push(`${g}: longest frame ${r.frame_max_ms} ms against a ceiling max of ${ceilingMaxMs} ms — recorded, not scored`);
    }
    if (r.unstable) voided.push(`${g}: readings disagree across repeats (${r.repeats.map((x) => (x.breached ? 'BREACH' : 'clean')).join(', ')}); the majority is reported and the leg is UNSTABLE`);
    if (r.main_max_ms > L0.mainBlockBarMs) findings.push(`${g}: main blocked ${r.main_max_ms} ms, over the ${L0.mainBlockBarMs} ms bar`);
  }
  if (legs.heavy.span_ms < spec.heavy.durationMs * 0.9) {
    voided.push(`heavy leg sampled only ${legs.heavy.span_ms} ms of a declared ${spec.heavy.durationMs} ms load, so a block after that point is invisible`);
  }
  if (legs.heavy.max_ms > L0.mainBlockBarMs) {
    findings.push(`heaviest real operation (${spec.heavy.label}): main blocked ${legs.heavy.max_ms} ms, over the ${L0.mainBlockBarMs} ms bar`);
  }
  if (has('jank') && legs.dragJank && legs.dragJank.frames_over_100 <= (legs.drag.frames_over_100 || 0)) {
    voided.push(`CONTROL DID NOT FAIL: -Jank produced ${legs.dragJank.frames_over_100} frames over 100 ms against the clean run's ${legs.drag.frames_over_100}. The recorder is not seeing the frames it claims to and every number here is void.`);
  }

  // A spec that admits it covers only part of its surface cannot score 10, however clean the
  // numbers are. Silently scoring the reachable half is exactly the flattering-number failure
  // the pin forbids.
  if (spec.partial) voided.push(`PARTIAL SURFACE: ${spec.partial}`);
  const score = voided.length ? 'VOID' : findings.length === 0 ? 10 : 0;
  const out = {
    surface: SURFACE, title: spec.title, root: spec.root,
    at: new Date().toISOString(),
    scene: legs.drag ? legs.drag.scene_before : null,
    surfaceWindow: {
      mechanism: found.rootInFwin ? 'floating .fwin' : 'root OS window',
      matched: found.matched,
      elements: found.rootInFwin ? found.matchedElements : found.rootElements,
      deskWindows: found.windows,
      titles: found.titles,
    },
    process: { pid: mem.pid, uptimeSecAtStart: mem.uptimeSec, mainRssMbBefore: mem.rssMb, mainRssMbAfter: memAfter.rssMb, mainHeapUsedMbAfter: memAfter.heapUsedMb },
    sessionCeiling: {
      p50: ceilingP50, p95: ceilingP95, frames: legs.ceiling.frames, runs: legs.ceilingRuns,
      noiseFloorOver100: ceilingOver100, noiseFloorMaxMs: ceilingMaxMs,
      l0P50: L0.ceilingP50,
      note: ceilingP50 > L0.ceilingP50 * 1.4 ? 'THIS DISPLAY IS SLOWER THAN L0\'S — L0 ms are not comparable, only the ratio to this ceiling is' : 'comparable to L0',
      environmentNote: ceilingOver100 > 0 || ceilingMaxMs > 100
        ? `THE MACHINE ITSELF STALLED DURING THIS RUN: the ceiling leg, which runs no product code, produced ${ceilingOver100} frame(s) over 100 ms and a ${ceilingMaxMs} ms longest frame. Gesture over-100 counts are scored against that floor.`
        : 'ceiling clean — no environmental stall observed in this session',
    },
    legs, findings, voided, environment, score,
    l0Provenance: L0,
  };
  console.log(JSON.stringify(out, null, 2));
  const file = arg('out', path.join('src/.coordination/liquid-workplace/baselines', `cat7-${SURFACE}-perf.json`));
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log('wrote', file);
  console.log(`\nCATEGORY 7 — ${SURFACE}: ${score === 10 ? 'PASS 10/10' : score === 'VOID' ? 'VOID' : `${findings.length} finding(s), NOT a 10`}`);
  for (const f of findings) console.log(`  FINDING  ${f}`);
  for (const v of voided) console.log(`  VOID     ${v}`);
  for (const e of environment) console.log(`  ENV      ${e}`);
  if (out.sessionCeiling.environmentNote.startsWith('THE MACHINE')) console.log(`  ENV      ${out.sessionCeiling.environmentNote}`);
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  if (e && e.cause) console.error('cause:', e.cause.code || '', e.cause.message || String(e.cause));
  process.exit(1);
});
