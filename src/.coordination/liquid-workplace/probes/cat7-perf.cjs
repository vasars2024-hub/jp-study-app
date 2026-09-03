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
 *   node src/.coordination/liquid-workplace/probes/cat7-perf.cjs --surface library --under-load
 *
 * --jank runs the drag leg a second time with the interaction probe's 120 ms renderer
 * blocks. It is the sensitivity control: if the distribution does NOT get worse, the
 * recorder is not seeing the frames it claims to and every number in the run is void.
 *
 * --under-load adds drag and resize legs measured WHILE the surface's own `heavy` work is
 * running, which is L11 bullet 3's actual question and which no other leg here asks — the
 * three gestures above run on an idle surface and `heavy` is measured beside them, not under
 * them. It implies --jank. See the LOAD_ARM block for the three things it refuses without.
 *
 *   node src/.coordination/liquid-workplace/probes/cat7-perf.cjs --surface dictionary \
 *     --long-session --cycles 12
 *
 * --long-session replaces the gesture legs entirely with L11 bullet 4's fifth clause: N round
 * trips of the real Liquid cadence, sampling the RENDERER's heap and DOM counters after a
 * forced collection on every cycle. It refuses without a collector control that both arms and
 * fires. See correction 34.
 *
 *   node src/.coordination/liquid-workplace/probes/cat7-perf.cjs --surface player --playback
 *
 * --playback is L0's SIXTH baseline row — player frame stability — the one number of the six
 * that PERF_BASELINE.md:104 and VIDEO_BASELINE.md:109 both record as never measured, for the
 * same reason: it needs a real clip and none was loaded. It keeps the ceiling legs (frames are
 * unreadable without them), drops the gesture legs, and adds the decoder's own ledger, because
 * the rAF distribution alone CANNOT see a dropped video frame: the compositor repaints the
 * previous picture, on time, so a decoder losing every second frame looks identical to a
 * healthy one. It refuses without two controls — a PAUSED player the instrument must decline
 * to score, and -Jank. See correction 40.
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
// The Dictionary surface's real search load, as queries. Written as readable Japanese here and
// emitted as \uXXXX escapes, because this string reaches the renderer as a PowerShell argument
// and a transport that mangles it would still produce a clean main-availability reading -- every
// mangled query is simply a cold miss. 28 distinct headwords, so a 20 s / 700 ms span never
// repeats one and never measures the cache instead of the lookup.
const DICT_QUERIES = [
  '勉強', '走る', '泳ぐ', '登る', '降りる', '渡る', '曲がる', '進む', '戻る', '届ける',
  '預ける', '借りる', '貸す', '返す', '払う', '売る', '買う', '配る', '集める', '並べる',
  '調べる', '考える', '伝える', '育てる', '数える', '選ぶ', '答える', '続ける',
];
const DICT_QUERIES_JS = JSON.stringify(DICT_QUERIES).replace(
  /[^\x20-\x7e]/g,
  (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
);

// A surface's "scroll the whole collection" load, written once. Picks the element inside the
// root with the largest real overflow rather than naming a scroller per surface -- the same
// ranking `cat7-collection-weight.cjs` uses, and for the same reason: a list that is not
// virtualised scrolls in an ANCESTOR, so a hardcoded child selector silently misses and the
// load never happens. Returns the element it chose so the record shows what was scrolled.
//
// CORRECTION 36 -- the paragraph above named the ancestor case and the code did not implement
// it: the sweep was `[root, ...root.querySelectorAll('*')]`, root and DESCENDANTS only, so a
// surface that scrolls in an ancestor hit `REFUSE: nothing scrolls inside <root>` and its load
// never armed. That is not hypothetical; it is exactly what the Video spec below did on every
// run it was ever given (measured 2026-09-03: no descendant of `.mc-video-page` has any
// overflow, and `main.mc-content` above it has 563 px). The fallback walks OUTWARD only when
// nothing inside qualifies, so every surface that already passed keeps the same scroller and
// the same numbers, and `rec.sel` now carries `inside:`/`ancestor:` so a banked JSON says which.
const scrollAll = (rootSel) => `(() => {
  // Cleared before any refuse, so a load that never armed cannot be vouched for by the
  // PREVIOUS run's receipt. That is the zombie-recorder shape this repo has already paid for.
  delete window.__lqScrollLoad;
  const root = document.querySelector(${JSON.stringify(rootSel)});
  if (!root) return 'REFUSE: no ' + ${JSON.stringify(rootSel)};
  let best = null, over = 0, where = 'inside';
  for (const e of [root, ...root.querySelectorAll('*')]) {
    if (e.clientHeight < 40) continue;
    const o = e.scrollHeight - e.clientHeight;
    if (o > over) { over = o; best = e; }
  }
  if (!best || over < 20) {
    where = 'ancestor';
    best = null; over = 0;
    let p = root.parentElement;
    while (p && p !== document.body) {
      const o = p.scrollHeight - p.clientHeight;
      if (p.clientHeight >= 40 && o > 20) { best = p; over = o; break; }
      p = p.parentElement;
    }
  }
  if (!best || over < 20) return 'REFUSE: neither ' + ${JSON.stringify(rootSel)} + ' nor any ancestor of it scrolls';
  const start = best.scrollTop;
  const rec = { sel: where + ':' + String(best.className || best.tagName).slice(0, 60), over: over, ticks: 0, reached: 0, start, restored: false };
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

/**
 * The under-load receipt for every `scrollAll` leg (correction 33, generalised). Without it a
 * scroll spec VOIDs under load BY CONSTRUCTION: the load's own 91 x 20 ms span is ~1.8 s, its
 * re-arm interval is its `durationMs` (3 s), and a ~1.8 s gesture can never see a whole cycle
 * — flashcards read `0 cycle(s)` on both legs on 2026-09-01 while `last` proved the load was
 * running. Ticks are the real work here: each one moves a virtual list and remounts its rows.
 * -1 rather than null when the record is absent, so "never armed" and "armed but idle" stay
 * distinguishable in the banked JSON.
 */
const scrollProgress = `(window.__lqScrollLoad ? window.__lqScrollLoad.ticks : -1)`;

/**
 * `--under-load` — L11 bullet 3's own words, which no leg above answers.
 *
 * The bullet is "drag/resize at target frame rate WHILE media, dictionaries, and large lists are
 * ACTIVE". This harness measured the three gestures on an otherwise idle surface, and measured
 * each surface's heaviest real work SEPARATELY as main-process availability. Both are real
 * numbers and neither is the question: a surface can drag at the ceiling when nothing else is
 * happening and drop frames the moment its own list is scrolling.
 *
 * So the load is armed AROUND the gesture instead of beside it. Every `heavy.js` here is a
 * one-shot expression that self-terminates (`scrollAll` runs 91 ticks of 20 ms, ~1.8 s) and a
 * gesture outlives that, so the load re-arms on a timer for as long as the gesture runs.
 *
 * THREE THINGS IT REFUSES WITHOUT, each a shape this repo has already paid for:
 *
 *  1. A HARD DEADLINE IN THE RENDERER. `deleting-probe-state-is-not-a-stop` is banked here: a
 *     run that dies mid-gesture must not leave a scroll loop driving the app into the NEXT
 *     run's numbers. The renderer stops itself on wall-clock time even if nothing ever calls
 *     the stop, and every tick re-checks its own generation id so a second arm cannot leave the
 *     first one running.
 *  2. WORK ACROSS THE GESTURE, not merely a load that once started. The counter is read
 *     before and after the reading; too little movement in between means the load was over
 *     (or throttled to nothing) while the frames were being recorded, and the leg is VOID
 *     rather than a flattering PASS. This is the same false-pass shape as the `heavy` leg's
 *     `proof`, one layer up.
 *
 *     WHICH counter, and this is correction 33, which cost every under-load run this harness
 *     has ever taken. It used to count ARMS -- how many times the re-arm timer called
 *     `heavy.js`. Two things made that unreadable. The re-arm interval resolved to
 *     `Math.min(deadlineMs, 2000)` = 2000 ms for every surface, while a gesture spans ~1800 ms,
 *     so "at least two cycles across the gesture" was arithmetically unsatisfiable BY
 *     CONSTRUCTION -- no surface could ever pass it. And a `heavy.js` is not a pulse: most are
 *     self-timed programs (dictionary schedules 28 searches over 20 s and returns at once), so
 *     re-arming stacked a second interval on the first AND, because each one opens with
 *     `delete window.__lqDictLoad`, wiped the receipt the leg was about to be judged on. That
 *     is the whole of "REFUSE: only 2 searches ran": the counter had been reset 2 s earlier,
 *     not the load having failed.
 *     So the interval is now the load's OWN declared `durationMs` -- a load is never re-armed
 *     while it is still running -- and a spec may declare `progress`, an expression returning a
 *     monotonic count of REAL work (dictionary: searches actually issued). Where it exists it
 *     replaces the arm count, which makes this guard strictly harder to satisfy: it now proves
 *     the surface did work while the frames were recorded, not merely that a timer fired.
 *  3. THE SENSITIVITY CONTROL. A clean under-load reading only means something if the recorder
 *     can see load at all, so `--under-load` turns `--jank` on and the existing control check
 *     applies: if injected 120 ms blocks do NOT worsen the distribution, every number is void.
 */
const LOAD_ARM = (heavyJs, deadlineMs, cycleMs) => `(() => {
  const gen = (window.__lqLoadGen = (window.__lqLoadGen || 0) + 1);
  const run = function () { return ${heavyJs}; };
  const rec = { gen, cycles: 0, refusals: 0, last: null, until: Date.now() + ${deadlineMs} };
  window.__lqLoad = rec;
  const cycle = () => {
    // Generation AND deadline, both checked here rather than by whoever stops it. An aborted
    // run leaves no stopper behind; it must still stop.
    //
    // A SUPERSEDED TICK MUST TOUCH NOTHING. This first read 'if (gen mismatch || past deadline)
    // { window.__lqLoad = null }', and that one line voided all four under-load legs of the
    // first two runs with '0 cycles, 0 refusals, last: null'. Stopping bumps the generation, the
    // previous generation's timer fires up to 2 s later, and it cleared the record the NEXT leg
    // had just armed — across runs too, because the page had not reloaded between them. A dead
    // generation may stop itself and nothing else; only the owner of the current record may
    // clear it. Same family as 'deleting-probe-state-is-not-a-stop'.
    //
    // TRAP, and it is why this comment uses quotes: these lines live INSIDE the LOAD_ARM
    // template literal opened on line 154. A backtick here does not comment -- it CLOSES the
    // template, and the next word parses as real JS. 98c78aa5 added this note with backticks
    // and shipped a probe that 'node --check' rejects outright, which is what actually voided the
    // two under-load runs the note claims to have fixed. Never put a backtick in a comment
    // inside a template literal.
    if (window.__lqLoadGen !== gen) return;
    if (Date.now() > rec.until) { if (window.__lqLoad === rec) window.__lqLoad = null; return; }
    let r;
    try { r = String(run()); } catch (e) { r = 'REFUSE: ' + String(e); }
    rec.last = r.slice(0, 120);
    if (/^REFUSE/.test(r)) rec.refusals += 1; else rec.cycles += 1;
    setTimeout(cycle, ${Math.max(200, Math.min(deadlineMs, Number(cycleMs) > 0 ? Number(cycleMs) : 2000))});
  };
  cycle();
  return 'armed gen=' + gen + ' until=' + rec.until;
})()`;

const LOAD_READ = `JSON.stringify(window.__lqLoad
  ? { gen: window.__lqLoad.gen, cycles: window.__lqLoad.cycles, refusals: window.__lqLoad.refusals, last: window.__lqLoad.last }
  : { gen: null, cycles: 0, refusals: 0, last: null })`;

// Bumping the generation is what stops it; the record is cleared by the loop's own next tick,
// so nothing here depends on the stopper having run.
const LOAD_STOP = `(window.__lqLoadGen = (window.__lqLoadGen || 0) + 1, window.__lqLoad = null, 'stopped')`;

/**
 * `--player-frames` — L0's sixth performance axis, and the one the five others were recorded
 * without: "boot, window drag, resize, theme switch, memory, and PLAYER FRAME STABILITY".
 *
 * THE INSTRUMENT IS `getVideoPlaybackQuality()`, NOT rAF, and that is not a preference. A rAF
 * recorder samples the COMPOSITOR: a decoder dropping half its frames still presents a new
 * compositor frame every 16.7 ms, so rAF scores a healthy player and a stuttering one
 * identically. `totalVideoFrames`/`droppedVideoFrames` are the video pipeline's own counters and
 * are the only ones that can tell those two apart. Both numbers are cumulative from the element's
 * creation, so every reading here is a DELTA between two samples — a raw cumulative ratio is
 * dominated by the startup burst (measured on this clip: 203 of the first 1,950 frames, 10.4%,
 * while the steady state is nothing like that).
 *
 * The sampler runs in the RENDERER on a self-terminating timer rather than as N bridge round
 * trips, for the same reason every other leg here does: a 1 s cadence driven over HTTP jitters by
 * tens of milliseconds and the per-interval numbers stop being comparable. It carries the same
 * two guards as `LOAD_ARM` — a generation id and a hard wall-clock deadline — so a run that dies
 * mid-leg cannot leave a sampler feeding the next run's numbers.
 *
 * FOUR THINGS IT RECORDS SO THE READING CAN BE VOIDED RATHER THAN FLATTERED:
 *   elementSwapped  the media chunk remounts its player; a delta across two different decoders
 *                   is meaningless, so the element is stamped with the generation and re-checked
 *                   on every tick (a JS property, never a data-attribute — this must not mutate
 *                   the product's DOM).
 *   pausedDuring    a paused player decodes nothing and drops nothing. It scores as perfect.
 *   rateChanged     the ratio of media time to wall time only reads as a stall at a known rate.
 *   corrupted       counted separately; a corrupt frame is not a dropped one.
 */
const FRAME_ARM = (sel, ms, everyMs) => `(() => {
  const gen = (window.__lqFramesGen = (window.__lqFramesGen || 0) + 1);
  window.__lqFrames = null;
  const v = document.querySelector(${JSON.stringify(sel)});
  if (!v) return 'REFUSE: no element matches ' + ${JSON.stringify(sel)};
  if (typeof v.getVideoPlaybackQuality !== 'function') return 'REFUSE: ' + ${JSON.stringify(sel)} + ' is a <' + v.tagName.toLowerCase() + '>, not a media element with playback quality';
  const q0 = v.getVideoPlaybackQuality();
  const rec = {
    gen, sel: ${JSON.stringify(sel)},
    startedAt: performance.now(), until: performance.now() + ${ms},
    rate: v.playbackRate, pausedAtArm: v.paused, readyState: v.readyState,
    width: v.videoWidth, height: v.videoHeight, duration: v.duration,
    src: String(v.currentSrc || v.src || '').slice(0, 160),
    samples: [[0, v.currentTime, q0.totalVideoFrames, q0.droppedVideoFrames, q0.corruptedVideoFrames]],
    elementSwapped: false, rateChanged: false, pausedDuring: false, done: false,
  };
  v.__lqFrameGen = gen;
  window.__lqFrames = rec;
  const tick = () => {
    if (window.__lqFramesGen !== gen) return;
    const cur = document.querySelector(${JSON.stringify(sel)});
    if (!cur || cur.__lqFrameGen !== gen) { rec.elementSwapped = true; rec.done = true; return; }
    if (cur.playbackRate !== rec.rate) rec.rateChanged = true;
    if (cur.paused) rec.pausedDuring = true;
    const q = cur.getVideoPlaybackQuality();
    rec.samples.push([Math.round(performance.now() - rec.startedAt), cur.currentTime,
      q.totalVideoFrames, q.droppedVideoFrames, q.corruptedVideoFrames]);
    if (performance.now() >= rec.until) { rec.done = true; return; }
    setTimeout(tick, ${everyMs});
  };
  setTimeout(tick, ${everyMs});
  return 'armed gen=' + gen + ' ' + rec.width + 'x' + rec.height + ' rate=' + rec.rate;
})()`;

const FRAME_READ = `JSON.stringify(window.__lqFrames || null)`;
// The generation bump is what stops it; the record is cleared here as well because, unlike
// LOAD_ARM's loop, a superseded FRAME tick returns without touching anything at all.
const FRAME_STOP = `(window.__lqFramesGen = (window.__lqFramesGen || 0) + 1, window.__lqFrames = null, 'stopped')`;

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
      progress: scrollProgress,
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
      progress: scrollProgress,
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
    heavy: { label: 'scroll the rendered volume', durationMs: 3000, js: scrollAll('.novel-scroller'), progress: scrollProgress, proof: scrollProof },
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
      progress: scrollProgress,
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
      progress: scrollProgress,
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
      progress: scrollProgress,
      proof: scrollProof,
    },
    collection: { container: '.stats-view', row: '.stats-book-row' },
  },
  calendar: {
    title: 'Calendar',
    root: '.calendar-view',
    heavy: {
      // Calendar's repeatable read-only load is switching the four render branches. Each pass
      // replaces a 42-cell month grid, seven-column week, day list, and three-section agenda;
      // unlike creating an event, it writes no user data. The receipt proves every branch was
      // reached and the user's starting mode returned.
      label: 'cycle all four calendar views',
      durationMs: 3000,
      js: `(() => {
        delete window.__lqCalendarLoad;
        const buttons = Array.from(document.querySelectorAll('.calendar-view .cal-mode-btn'));
        if (buttons.length !== 4) return 'REFUSE: expected four calendar modes, found ' + buttons.length;
        const start = buttons.findIndex((b) => b.classList.contains('active'));
        if (start < 0) return 'REFUSE: calendar has no active mode';
        const rec = { start, ticks: 0, visits: [0, 0, 0, 0], restored: false };
        window.__lqCalendarLoad = rec;
        const timer = setInterval(() => {
          const next = rec.ticks % 4;
          buttons[next].click();
          rec.visits[next] += 1;
          rec.ticks += 1;
          if (rec.ticks >= 56) {
            clearInterval(timer);
            buttons[start].click();
            setTimeout(() => { rec.restored = buttons[start].classList.contains('active'); }, 120);
          }
        }, 45);
        return 'cycling four views from ' + start;
      })()`,
      progress: `(window.__lqCalendarLoad ? window.__lqCalendarLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqCalendarLoad;
        if (!r) return 'REFUSE: calendar load never armed';
        if (r.ticks < 56 || r.visits.some((n) => n < 10)) return 'REFUSE: incomplete calendar cycle ' + JSON.stringify(r);
        if (!r.restored) return 'REFUSE: calendar did not restore mode ' + r.start;
        return 'cycled ' + r.ticks + ' views (' + r.visits.join('/') + '), restored mode ' + r.start;
      })()`,
    },
    collection: { container: '.cal-month-grid', row: '.cal-month-cell' },
  },
  resources: {
    title: 'Resources',
    root: '.res-view',
    heavy: {
      // Resources' heaviest repeatable read-only work is the category rail, NOT scrolling.
      // `showLanding` is `filter === 'All' && !query`, so every step off All unmounts a
      // 256-path SVG choropleth, a 10-tile bundle grid, the My-tools strip and the New
      // strip, and every step back mounts all four again — on top of re-deriving and
      // re-rendering the whole filtered group list. It writes no user data and it restores
      // the chip the user was on.
      label: 'cycle the category rail, mounting and unmounting the landing sections',
      durationMs: 3000,
      js: `(() => {
        delete window.__lqResourcesLoad;
        const chips = Array.from(document.querySelectorAll('.res-view .res-filter .gram-level-btn'));
        if (chips.length < 3) return 'REFUSE: expected a category rail, found ' + chips.length + ' chips';
        const start = chips.findIndex((b) => b.classList.contains('active'));
        if (start < 0) return 'REFUSE: the category rail has no active chip';
        const rec = { start, chips: chips.length, ticks: 0, categories: 0, landings: 0, restored: false };
        window.__lqResourcesLoad = rec;
        let n = 0;
        const timer = setInterval(() => {
          const goLanding = n % 2 === 1;
          const idx = goLanding ? 0 : 1 + (Math.floor(n / 2) % (chips.length - 1));
          chips[idx].click();
          if (goLanding) { rec.landings += 1; } else { rec.categories += 1; }
          rec.ticks += 1;
          n += 1;
          if (rec.ticks >= 44) {
            clearInterval(timer);
            chips[start].click();
            setTimeout(() => { rec.restored = chips[start].classList.contains('active'); }, 120);
          }
        }, 55);
        return 'cycling ' + (chips.length - 1) + ' categories from chip ' + start;
      })()`,
      progress: `(window.__lqResourcesLoad ? window.__lqResourcesLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqResourcesLoad;
        if (!r) return 'REFUSE: the resources load never armed';
        if (r.ticks < 44) return 'REFUSE: incomplete category cycle ' + JSON.stringify(r);
        if (r.categories < 20 || r.landings < 20) return 'REFUSE: unbalanced cycle ' + JSON.stringify(r);
        if (!r.restored) return 'REFUSE: the rail did not return to chip ' + r.start;
        return 'cycled ' + r.ticks + ' filters (' + r.categories + ' category / ' + r.landings
          + ' landing), restored chip ' + r.start;
      })()`,
    },
    collection: { container: '.res-view', row: '.res-card' },
  },
  video: {
    title: 'Video',
    root: '.mc-video-page',
    heavy: {
      // The Video section is a LAUNCHER, not a player, and that fact picks this leg. Its stage
      // renders `workspace`/`connecting`/`needs-server` copy (MediaCenterView.tsx:890-921) and
      // hands playback to the media-workspace window; `playItem` calls main's media:open and
      // then dispatches `os:open` to navigate away (MediaContent.tsx:995-1001), so it writes
      // resume state AND leaves the surface — it cannot be the repeatable read-only load.
      // What the page itself does at scale is mount and unmount the inspector's three setup
      // tools behind `<details class="mc-inspector-advanced">` (06708e7c) while the Up Next
      // shelf paints its artwork tiles. Cycle the disclosure and sweep the shelf together,
      // and put both back exactly as they were found.
      //
      // CORRECTION 36 — this leg refused 'Video load never armed' on every run it was ever
      // given, and the cause was here, not in the surface. It looked for the scroller INSIDE
      // '.mc-video-page' and no descendant of that root scrolls: measured live 2026-09-03,
      // '.mc-video-empty' is scrollHeight 422 / clientHeight 422 and every other descendant is
      // 0, because the Video page does not scroll its own shelf — its scroller is the ANCESTOR
      // 'main.mc-content' (overflow 563 px). The old filter therefore matched nothing, the arm
      // returned REFUSE before setting the receipt, and the proof one layer up reported the
      // missing receipt as 'never armed' — a refusal that named the surface for the
      // instrument's own mistake. Same family as the cat6 instrument defect banked at
      // 'af21269d': an instrument that models a state the product cannot enter. The scroller is
      // now RESOLVED — inside the root first, then the nearest scrollable ancestor — and the
      // node it picked is recorded in the receipt so no reader has to guess which one moved.
      label: 'cycle the inspector disclosure across the recent-media shelf',
      durationMs: 3000,
      js: `(() => {
        delete window.__lqVideoLoad;
        const page = document.querySelector('.mc-video-page');
        if (!page) return 'REFUSE: no Video page';
        const det = page.querySelector('details.mc-inspector-advanced');
        if (!det) return 'REFUSE: no advanced inspector disclosure on the Video page';
        const scrolls = (e) => e && e.scrollHeight - e.clientHeight > 20;
        let shelf = [].slice.call(page.querySelectorAll('.mc-video-empty, .mc-up-next'))
          .filter(scrolls)
          .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
        let where = 'inside';
        if (!shelf) {
          where = 'ancestor';
          let p = page.parentElement;
          while (p && p !== document.body && !scrolls(p)) p = p.parentElement;
          shelf = scrolls(p) ? p : null;
        }
        if (!shelf) return 'REFUSE: neither the Video page nor any ancestor of it scrolls';
        const openStart = det.open;
        const scrollStart = shelf.scrollTop;
        const rec = {
          openStart, scrollStart, ticks: 0, opens: 0, closes: 0,
          scroller: where + ':' + shelf.tagName.toLowerCase() + '.' + String(shelf.className).trim().split(/\\s+/)[0],
          overflow: shelf.scrollHeight - shelf.clientHeight,
          tiles: page.querySelectorAll('.mc-media-tile').length,
          maxScroll: 0, restored: false,
        };
        window.__lqVideoLoad = rec;
        const timer = setInterval(() => {
          det.open = !det.open;
          if (det.open) rec.opens += 1; else rec.closes += 1;
          rec.ticks += 1;
          // sin(0..pi) returns the shelf to its own starting offset on the last tick.
          const d = Math.sin((rec.ticks / 40) * Math.PI);
          shelf.scrollTop = scrollStart + Math.round(d * rec.overflow);
          rec.maxScroll = Math.max(rec.maxScroll, shelf.scrollTop);
          if (rec.ticks >= 40) {
            clearInterval(timer);
            det.open = openStart;
            shelf.scrollTop = scrollStart;
            setTimeout(() => { rec.restored = det.open === openStart && shelf.scrollTop === scrollStart; }, 120);
          }
        }, 60);
        return 'cycling the disclosure over ' + rec.overflow + ' px of ' + rec.scroller;
      })()`,
      // Correction 33's `progress`, which this spec never declared and which VOIDed both of its
      // under-load legs the first time they ever reached the surface: the load runs 40 x 60 ms
      // ~= 2.4 s and re-arms on its own 3 s `durationMs`, so a ~1.8 s gesture can never contain a
      // whole ARM and the arm counter reads 0 by construction. A tick is real work here — each
      // one mounts or unmounts the inspector's three setup tools and moves the page scroller.
      progress: `(window.__lqVideoLoad ? window.__lqVideoLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqVideoLoad;
        if (!r) return 'REFUSE: Video load never armed';
        if (r.ticks < 40 || r.opens < 15 || r.closes < 15) return 'REFUSE: incomplete Video cycle ' + JSON.stringify(r);
        if (r.maxScroll < r.overflow * 0.8) return 'REFUSE: the shelf never swept its overflow ' + JSON.stringify(r);
        if (!r.restored) return 'REFUSE: Video did not restore open=' + r.openStart + ' scrollTop=' + r.scrollStart;
        return 'cycled ' + r.ticks + ' disclosures (' + r.opens + ' open / ' + r.closes + ' closed) over ' + r.tiles
          + ' tiles and ' + r.overflow + ' px of ' + r.scroller + ', restored';
      })()`,
    },
    collection: { container: '.mc-up-next', row: '.mc-media-tile' },
  },
  /*
   * MERGE NOTE 2026-09-03: wt/files-app carried a second, independent player spec for this
   * same surface -- `playbackOnly`, scored with --playback, whose receipt is
   * PERF_BASELINE_PLAYER.md. It refused a `heavy` leg on the grounds that every repeatable
   * operation here writes a resume position and there is no restore point for it. That
   * reasoning still holds; the spec below is kept because it is the one on the branch being
   * landed and the one the --player-frames guard supports. The --playback path remains
   * available to any spec that declares playbackOnly.
   */
  /**
   * CORRECTION 37 — the PLAYER, which is a different surface from `video` above and is the only
   * one L0's sixth performance axis can be measured on.
   *
   * `video` is the LAUNCHER: its own spec comment says so, and measured live 2026-09-03
   * `document.querySelectorAll('video').length` is 0 while `.mc-video-page` is on screen. The
   * decoder lives in the media-workspace host, mounted lazily with the media chunk, and the
   * element's real path is
   * `DIV#root < DIV.seanime-host < DIV.seanime-host-body < DIV.seanime-host-pane <
   *  DIV#media-workspace.dark < SECTION.study-player-slice < DIV.relative x3 < VIDEO`.
   * `#media-workspace.closest('.fwin')` is null, so the runner takes the `-Root` gesture path
   * and no window title can be matched — hence correction 29's `@selector` form.
   *
   * `playerFramesOnly` because the gesture legs are the wrong question here and would be
   * actively misleading: dragging and resizing the host WHILE a decoder is running measures the
   * gesture against a moving scene, and the rubric already voids a leg whose scene moved.
   */
  player: {
    title: '@#media-workspace',
    root: '#media-workspace',
    playerFramesOnly: true,
    videoSelector: '#media-workspace video',
  },
  city: {
    // Mooncap Garden is FRAMELESS: no `.fwin-title-text` for a substring to match, so it is
    // named structurally by correction 29's `@selector` form — the same way cat4 and cat8
    // already name it (`--surface @.fwin-frameless`). `.reading-garden` is inside a `.fwin`,
    // so the gesture legs take the window path, not the -Root path; driving -Root here would
    // resize the whole Electron OS window instead of the garden's own window.
    title: '@.fwin-frameless',
    root: '.reading-garden',
    heavy: {
      // City is the one sampled surface whose load runs UNPROMPTED: seven `<canvas>` layers,
      // 48 stars and 22 dust motes animate continuously whether or not anyone touches it. The
      // only user-driven work on top of that is the mushroom hitbox, which mounts and unmounts
      // the whole dossier dialog (`#reading-garden-info`, ReadingGarden.tsx:461-469). The sky
      // console's Star/Asteroid/Ice-barrage buttons are NOT usable here: they are
      // `import.meta.env.DEV`-gated `data-dev-only` debug controls (correction 28), so firing
      // them would score the product against a panel no user has.
      label: 'open and close the dossier over the running garden animation',
      durationMs: 3000,
      js: `(() => {
        delete window.__lqCityLoad;
        const hit = document.querySelector('.reading-garden .reading-garden-mushroom-hitbox');
        if (!hit) return 'REFUSE: the mushroom hitbox is absent, so City has no user-driven load';
        const openAtStart = hit.getAttribute('aria-expanded') === 'true';
        const rec = {
          openAtStart, ticks: 0, opened: 0, closed: 0, restored: false,
          canvases: document.querySelectorAll('.reading-garden canvas').length,
        };
        window.__lqCityLoad = rec;
        const timer = setInterval(() => {
          hit.click();
          rec.ticks += 1;
          if (document.querySelector('#reading-garden-info')) rec.opened += 1; else rec.closed += 1;
          if (rec.ticks >= 20) {
            clearInterval(timer);
            setTimeout(() => {
              if ((hit.getAttribute('aria-expanded') === 'true') !== openAtStart) hit.click();
              setTimeout(() => { rec.restored = (hit.getAttribute('aria-expanded') === 'true') === openAtStart; }, 160);
            }, 160);
          }
        }, 130);
        return 'toggling the dossier over ' + rec.canvases + ' animating canvases';
      })()`,
      progress: `(window.__lqCityLoad ? window.__lqCityLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqCityLoad;
        if (!r) return 'REFUSE: City load never armed';
        if (r.ticks < 20 || r.opened < 8 || r.closed < 8) return 'REFUSE: incomplete City cycle ' + JSON.stringify(r);
        if (r.canvases < 7) return 'REFUSE: only ' + r.canvases + ' canvases were animating; the ambient load was not present';
        if (!r.restored) return 'REFUSE: City did not restore the dossier to expanded=' + r.openAtStart;
        return 'toggled the dossier ' + r.ticks + ' times (' + r.opened + ' open / ' + r.closed + ' closed) over '
          + r.canvases + ' animating canvases, restored';
      })()`,
    },
    // City has NO windowed collection, and the field is kept only to record what its weight
    // was actually sampled as. `cat7-collection-weight` will call the canvas stack INERT here
    // — it finds a 1,122 px "spacer" that is really the parallax world layer — and that
    // verdict is an artifact of asking a canvas surface a list question, not a defect. The
    // number that matters from that run is `nodes: 120` for 7 continuously painting canvases.
    collection: { container: '.reading-garden', row: '.reading-garden canvas' },
  },
  music: {
    title: 'Music',
    root: '.mc-music-page',
    heavy: {
      // Sorting rebuilds the browsable order, queue and folder-tree branch without playing
      // audio or changing library data. Cycle every mode repeatedly and restore both the
      // control and its persisted value, so the load leaves no user preference behind.
      label: 'cycle all four library sort modes',
      // The 50 ms timer is renderer-scheduled and measured live at ~68 ms under the
      // concurrent health sampler; four seconds covers all 48 ticks plus restoration.
      durationMs: 4000,
      // The under-load receipt (correction 33): 48 ticks x 50 ms is ~2.4 s against a 4 s
      // re-arm, so a ~1.8 s gesture never sees a whole cycle — VOIDed on both legs on
      // 2026-09-01 with `last` proving the load was running. Ticks are the real work.
      progress: `(window.__lqMusicLoad ? window.__lqMusicLoad.ticks : -1)`,
      js: `(() => {
        delete window.__lqMusicLoad;
        const select = document.querySelector('.mc-music-sort select');
        if (!select || select.options.length !== 4) return 'REFUSE: expected four Music sort modes';
        const start = select.value;
        const values = Array.from(select.options, (o) => o.value);
        const rec = { start, values, ticks: 0, visits: values.map(() => 0), restored: false };
        window.__lqMusicLoad = rec;
        const timer = setInterval(() => {
          const index = rec.ticks % values.length;
          select.value = values[index];
          select.dispatchEvent(new Event('change', { bubbles: true }));
          rec.visits[index] += 1;
          rec.ticks += 1;
          if (rec.ticks >= 48) {
            clearInterval(timer);
            select.value = start;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => { rec.restored = select.value === start && localStorage.getItem('jp-music-sort') === start; }, 160);
          }
        }, 50);
        return 'cycling four Music sort modes from ' + start;
      })()`,
      proof: `(() => {
        const r = window.__lqMusicLoad;
        if (!r) return 'REFUSE: Music load never armed';
        if (r.ticks < 48 || r.visits.some((n) => n < 12)) return 'REFUSE: incomplete Music cycle ' + JSON.stringify(r);
        if (!r.restored) return 'REFUSE: Music did not restore sort mode ' + r.start;
        return 'cycled ' + r.ticks + ' sorts (' + r.visits.join('/') + '), restored ' + r.start;
      })()`,
    },
    collection: { container: '.music-vlist', row: '.music-song' },
  },
  games: {
    title: 'Game Arena',
    root: '.game-arena',
    heavy: {
      // Selecting a game replaces the Arena's complete work branch without writing a result.
      // Cycle every available game repeatedly, then restore the exact starting selection; this
      // exercises the surface's largest repeatable renderer load without starting or scoring a
      // round, changing settings, requesting camera access, or touching persisted progress.
      label: 'cycle every available game',
      durationMs: 3500,
      js: `(() => {
        delete window.__lqGamesLoad;
        const buttons = Array.from(document.querySelectorAll('.game-arena .game-list-item'));
        if (buttons.length < 11) return 'REFUSE: expected the complete game list, found ' + buttons.length;
        const start = buttons.findIndex((b) => b.classList.contains('active'));
        if (start < 0) return 'REFUSE: game list has no active selection';
        const rec = { start, count: buttons.length, ticks: 0, visits: buttons.map(() => 0), restored: false };
        window.__lqGamesLoad = rec;
        const timer = setInterval(() => {
          const next = rec.ticks % buttons.length;
          buttons[next].click();
          rec.visits[next] += 1;
          rec.ticks += 1;
          if (rec.ticks >= buttons.length * 4) {
            clearInterval(timer);
            buttons[start].click();
            setTimeout(() => { rec.restored = buttons[start].classList.contains('active'); }, 160);
          }
        }, 45);
        return 'cycling ' + buttons.length + ' games from ' + start;
      })()`,
      progress: `(window.__lqGamesLoad ? window.__lqGamesLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqGamesLoad;
        if (!r) return 'REFUSE: Games load never armed';
        if (r.ticks < r.count * 4 || r.visits.some((n) => n < 4)) return 'REFUSE: incomplete Games cycle ' + JSON.stringify(r);
        if (!r.restored) return 'REFUSE: Games did not restore selection ' + r.start;
        return 'cycled ' + r.count + ' games ' + r.ticks + ' times, restored selection ' + r.start;
      })()`,
    },
    collection: { container: '.game-list', row: '.game-list-item' },
  },
  scraper: {
    title: 'Scraper',
    root: '.scr-shell',
    heavy: {
      /*
       * NAVIGATION IS THIS SURFACE'S LOAD, and that is a measured claim rather than a
       * convenient one. Swept live before this spec was written, all 17 rail pages in
       * one pass: the largest is Dashboard at 551 elements / 61 rows, and Results,
       * Downloads, Site Rules, Plugins and all three testers render 0 rows on this
       * profile — the last scrape was 19 days ago. So there is no collection here to
       * scroll: `scrollAll('.scr-shell')` would have picked `div.scr-drawer-pane`
       * (1,315 px of overflow, the largest in the root) and measured the SETTINGS
       * DRAWER instead of the Scraper.
       *
       * What the surface does at scale is swap pages. Each click unmounts one lazy
       * page chunk and mounts another into `.scr-main`, and `ScraperSettingsDrawer`
       * documents that the page behind the drawer re-renders with it. 17 pages twice
       * is 34 mounts, which is the heaviest real work this surface performs without
       * touching the network or the user's data.
       *
       * `shell.page` is persisted, so the load restores the page it started on and the
       * proof REFUSES unless the rail came back to it.
       */
      label: 'navigate all 17 rail pages, twice',
      // 34 ticks at 110 ms is ~3.74 s plus a 200 ms settle for the restore check.
      durationMs: 4500,
      js: `(() => {
        delete window.__lqScraperLoad;
        const rail = document.querySelector('nav.scr-rail');
        if (!rail) return 'REFUSE: no scraper rail';
        const btns = Array.from(rail.querySelectorAll('button')).filter((b) => (b.textContent || '').trim());
        if (btns.length < 10) return 'REFUSE: expected the full rail, found ' + btns.length + ' pages';
        const activeIndex = btns.findIndex((b) => b.classList.contains('is-active'));
        const startIndex = activeIndex < 0 ? 0 : activeIndex;
        const rec = { pages: btns.length, start: (btns[startIndex].textContent || '').trim(), ticks: 0, restored: false };
        window.__lqScraperLoad = rec;
        const total = btns.length * 2;
        const timer = setInterval(() => {
          btns[rec.ticks % btns.length].click();
          rec.ticks += 1;
          if (rec.ticks >= total) {
            clearInterval(timer);
            btns[startIndex].click();
            setTimeout(() => {
              const back = rail.querySelector('button.is-active');
              rec.restored = !!back && (back.textContent || '').trim() === rec.start;
            }, 200);
          }
        }, 110);
        return 'cycling ' + btns.length + ' pages twice from ' + rec.start;
      })()`,
      progress: `(window.__lqScraperLoad ? window.__lqScraperLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqScraperLoad;
        if (!r) return 'REFUSE: the load never armed';
        if (r.ticks < r.pages * 2) return 'REFUSE: only ' + r.ticks + ' of ' + (r.pages * 2) + ' navigations ran';
        if (!r.restored) return 'REFUSE: the rail did not return to ' + r.start;
        return r.pages + ' pages x2 = ' + r.ticks + ' navigations, restored to ' + r.start;
      })()`,
    },
    collection: { container: '.scr-main', row: '.scr-row' },
  },
  settings: {
    title: 'Settings',
    root: '.os-settings-v2',
    heavy: {
      /*
       * NAVIGATION IS THIS SURFACE'S LOAD, for the same measured reason the Scraper's is:
       * there is no collection to scroll. Home is the largest page and renders 5 status
       * chips and 10 quick cards; `scrollAll('.os-settings-v2')` would have picked the
       * 204 px rail, which is 19 buttons and not this app's work.
       *
       * What Settings does at scale is swap pages. Each rail click unmounts one settings
       * panel and mounts another into `.os-set-pane-v2`, and the panels are the heavy
       * part — Appearance builds the theme/font pickers, Display the monitor matrix,
       * Scraper the whole MAL/source console. Every page twice is the heaviest real work
       * this surface performs without touching the network or user data.
       *
       * The page is persisted state, so the load restores the page it started on and the
       * proof REFUSES unless the rail came back to it.
       *
       * CORRECTION 39 (2026-09-01) — the tick interval is DERIVED, not fixed. This leg was
       * written at 110 ms against a 19-page rail: 38 ticks, ~4.2 s, inside `durationMs`.
       * The rail is 24 pages today, so 48 fixed ticks need 5.28 s, the sampling window shut
       * at 5.0 s, and the proof read 38 of 48 and VOIDed the whole run — after every gesture
       * had already been paid for. The load itself was fine (`ticks` reached 48 and the rail
       * restored); only the arithmetic was stale. A hardcoded interval times out whenever the
       * product grows a page, which is the one thing a settings rail reliably does. So the
       * budget is declared and the interval falls out of it, and if the rail ever grows past
       * what the floor can serve the leg REFUSES up front instead of half-running.
       */
      label: 'navigate every settings page, twice',
      // BUDGET below + the 200 ms restore settle + slack must stay under this.
      durationMs: 5000,
      js: `(() => {
        delete window.__lqSettingsLoad;
        const BUDGET = 4200, FLOOR = 45;
        const rail = document.querySelector('nav.os-set-nav-v2');
        if (!rail) return 'REFUSE: no settings rail';
        const btns = Array.from(rail.querySelectorAll('.os-set-nav-item'));
        if (btns.length < 10) return 'REFUSE: expected the full rail, found ' + btns.length + ' pages';
        const total = btns.length * 2;
        const every = Math.min(110, Math.floor(BUDGET / total));
        if (every < FLOOR) return 'REFUSE: ' + total + ' navigations do not fit ' + BUDGET + ' ms above the ' + FLOOR + ' ms floor';
        const label = (b) => { const s = b.querySelector('span:not([class])'); return ((s && s.textContent) || '').trim(); };
        const activeIndex = btns.findIndex((b) => b.getAttribute('aria-current') === 'page');
        const startIndex = activeIndex < 0 ? 0 : activeIndex;
        const rec = { pages: btns.length, start: label(btns[startIndex]), ticks: 0, every, restored: false };
        window.__lqSettingsLoad = rec;
        const timer = setInterval(() => {
          btns[rec.ticks % btns.length].click();
          rec.ticks += 1;
          if (rec.ticks >= total) {
            clearInterval(timer);
            btns[startIndex].click();
            setTimeout(() => {
              const back = rail.querySelector('.os-set-nav-item[aria-current="page"]');
              rec.restored = !!back && label(back) === rec.start;
            }, 200);
          }
        }, every);
        return 'cycling ' + btns.length + ' pages twice from ' + rec.start + ' at ' + every + ' ms';
      })()`,
      progress: `(window.__lqSettingsLoad ? window.__lqSettingsLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqSettingsLoad;
        if (!r) return 'REFUSE: the load never armed';
        if (r.ticks < r.pages * 2) return 'REFUSE: only ' + r.ticks + ' of ' + (r.pages * 2) + ' navigations ran';
        if (!r.restored) return 'REFUSE: the rail did not return to ' + r.start;
        return r.pages + ' pages x2 = ' + r.ticks + ' navigations at ' + r.every + ' ms, restored to ' + r.start;
      })()`,
    },
    collection: { container: '.os-set-pane-v2', row: '.os-set-quick-card' },
  },
  youtube: {
    title: 'YouTube',
    root: '.yt-root',
    heavy: {
      /*
       * NAVIGATION, not scrolling, and the reason is measured rather than preferred.
       * `.yt-list` is the only overflowing box on this surface and it overflows by 603 px;
       * `scrollProof` REFUSES below 1000 px reached, so a scroll leg here would VOID rather
       * than score. What this surface actually does at scale is swap destinations: each rail
       * click unmounts a `<header>`, a fourteen-control preference form and a virtualised
       * list, and mounts the next destination's. Twelve round trips is 24 mounts.
       *
       * Nothing here reaches the network or writes user data. Refresh, Channel, Log and
       * Download all every call `window.api` and are deliberately not driven — the rubric's
       * "heaviest real operation" never means "cause a side effect the score does not need".
       *
       * The selected destination is persisted state, so the load returns to the one it
       * started on and the proof REFUSES unless the rail agrees it got there.
       */
      label: 'swap every rail destination, twelve times',
      // 24 ticks at 110 ms is ~2.6 s, plus a 250 ms settle for the restore check.
      durationMs: 3500,
      js: `(() => {
        delete window.__lqYtLoad;
        const tree = document.querySelector('.yt-tree');
        if (!tree) return 'REFUSE: no playlist rail';
        const btns = Array.from(tree.querySelectorAll('.yt-pl-item'));
        if (btns.length < 2) return 'REFUSE: the rail has ' + btns.length + ' destination(s); a swap needs two';
        const label = (b) => { const s = b.querySelector('.yt-pl-item-title'); return ((s && s.textContent) || '').trim(); };
        const activeIndex = btns.findIndex((b) => b.classList.contains('active'));
        const startIndex = activeIndex < 0 ? 0 : activeIndex;
        const rec = { dests: btns.length, start: label(btns[startIndex]), ticks: 0, restored: false };
        window.__lqYtLoad = rec;
        const total = btns.length * 12;
        const timer = setInterval(() => {
          btns[rec.ticks % btns.length].click();
          rec.ticks += 1;
          if (rec.ticks >= total) {
            clearInterval(timer);
            btns[startIndex].click();
            setTimeout(() => {
              const back = document.querySelector('.yt-tree .yt-pl-item.active');
              rec.restored = !!back && label(back) === rec.start;
            }, 250);
          }
        }, 110);
        return 'swapping ' + btns.length + ' destinations x12 from ' + rec.start;
      })()`,
      progress: `(window.__lqYtLoad ? window.__lqYtLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqYtLoad;
        if (!r) return 'REFUSE: the load never armed';
        if (r.ticks < r.dests * 12) return 'REFUSE: only ' + r.ticks + ' of ' + (r.dests * 12) + ' swaps ran';
        if (!r.restored) return 'REFUSE: the rail did not return to ' + r.start;
        return r.dests + ' destinations x12 = ' + r.ticks + ' swaps, restored to ' + r.start;
      })()`,
    },
    collection: { container: '.yt-list', row: '.yt-row' },
  },
  dictionary: {
    title: 'Dictionary',
    root: '.dict-view',
    heavy: {
      // CORRECTED. This slot held L0's `126 cold unseen lookups` burst, described here as
      // "L0's own reference load, kept verbatim". It is not L0's reference load -- it is L0's
      // SENSITIVITY CONTROL, and L7_PERF_DICTIONARY.md:49 labels the row exactly that: the
      // one that MUST breach so the instrument is proven able to see a breach. The same
      // paragraph says the burst "caps whatever surface owns lookupTermsBatch, not this one".
      // Scoring a deliberately-failing control as the surface's "HEAVIEST REAL operation"
      // (this file's own words, line 65) made the cell unable to reach 10 by construction:
      // 8,081.5 ms banked, 9,093.3 ms re-measured, against a 500 ms bar, forever.
      //
      // Source agrees it is not a real load. All five product call sites of
      // `window.api.lookupTerm` -- agentToolRegistry.ts:128, BlancReadyToolPanels.tsx:1074
      // and :1337, DictionaryResults.tsx:352, LensReaderPanel.tsx:228 -- issue ONE awaited
      // lookup for one user action; the bulk path is `lookupTermsBatch`, reached only from
      // main/mining.ts:1657. Nothing in the product fires 126 concurrent single-term IPCs.
      //
      // The surface's heaviest REAL operation is a search, banked at max 319.2 ms against the
      // 500 ms bar, so that is what runs here now -- driven repeatedly through the window's
      // OWN form, which is also the load L11 bullet 3 means by "while dictionaries are active".
      label: 'a real search through the window own form, every 700 ms',
      durationMs: 20000,
      js: `(() => {
        // Clear the PREVIOUS run's interval before dropping the record that holds its handle,
        // or the handle is unreachable and the old loop keeps searching underneath the new one
        // (correction 33: leg 2 was measuring twice the load leg 1 did).
        if (window.__lqDictLoad && window.__lqDictLoad.timer) clearInterval(window.__lqDictLoad.timer);
        delete window.__lqDictLoad;
        const form = document.querySelector('form.dict-search');
        if (!form) return 'REFUSE: no form.dict-search';
        const input = form.querySelector('input');
        const btn = form.querySelector('button');
        if (!input || !btn) return 'REFUSE: the search form has no input or no button';
        const words = ${DICT_QUERIES_JS};
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        const rec = { ticks: 0, seen: {}, distinct: 0, sawResults: false, entriesMin: Infinity, entriesMax: 0, last: null };
        window.__lqDictLoad = rec;
        const timer = setInterval(() => {
          const w = words[rec.ticks % words.length];
          setter.call(input, w);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          btn.click();
          rec.ticks += 1;
          rec.last = w;
          if (!rec.seen[w]) { rec.seen[w] = 1; rec.distinct += 1; }
          const n = document.querySelectorAll('.dict-entry').length;
          if (n > 0) rec.sawResults = true;
          rec.entriesMin = Math.min(rec.entriesMin, n);
          rec.entriesMax = Math.max(rec.entriesMax, n);
          if (rec.ticks >= words.length) clearInterval(timer);
        }, 700);
        rec.timer = timer;
        return 'searching ' + words.length + ' words';
      })()`,
      // The under-load receipt (correction 33). `ticks` is incremented once per search that
      // actually reached the input, so its movement across a gesture is proof the surface was
      // doing its real work WHILE the frames were recorded — not that a timer fired. -1 rather
      // than null when the record is absent, so "never armed" and "armed but idle" stay
      // distinguishable in the banked JSON.
      progress: `(window.__lqDictLoad ? window.__lqDictLoad.ticks : -1)`,
      // The same receipt re-scaled for the under-load legs, which span ~1.8 s each and can
      // physically issue only 2-3 searches at 700 ms. Both CORRECTNESS checks are kept
      // verbatim — armed at all, and .dict-entry actually rendered, which is the mojibake
      // guard and the one that matters most; only the DURATION threshold moves, 20 -> 2.
      loadProof: `(() => {
        const r = window.__lqDictLoad;
        if (!r) return 'REFUSE: the search load never armed';
        if (r.ticks < 2) return 'REFUSE: only ' + r.ticks + ' searches ran across the gesture';
        if (!r.sawResults) return 'REFUSE: no search rendered a .dict-entry, so the queries never reached the dictionary';
        return r.ticks + ' searches this leg, ' + r.distinct + ' distinct, entries ' + r.entriesMin + '-' + r.entriesMax + ', last ' + JSON.stringify(r.last);
      })()`,
      // sawResults is the mojibake guard as much as the ran-at-all guard: these queries are
      // Japanese, they travel to the renderer through a PowerShell argument, and a transport
      // that mangles them still produces a perfectly clean main-availability distribution
      // because every mangled query is a cold miss. No entry ever rendered => no claim.
      proof: `(() => {
        const r = window.__lqDictLoad;
        if (!r) return 'REFUSE: the search load never armed';
        if (r.ticks < 20) return 'REFUSE: only ' + r.ticks + ' searches ran';
        if (r.distinct < 20) return 'REFUSE: only ' + r.distinct + ' distinct queries reached the input';
        if (!r.sawResults) return 'REFUSE: no search rendered a .dict-entry, so the queries never reached the dictionary';
        return r.ticks + ' searches, ' + r.distinct + ' distinct, entries ' + r.entriesMin + '-' + r.entriesMax + ', last ' + JSON.stringify(r.last);
      })()`,
    },
    collection: { container: '.dict-view', row: '.dict-entry' },
  },
  shell: {
    // The shell is the root OS window rather than a floating app, so the interaction
    // probe drives its Root branch. The structural root also prevents a foreign theme
    // from being mistaken for the Wired identity this L9 cell is certifying.
    title: 'Wired shell',
    root: '.os-desktop-wired',
    heavy: {
      // Start is the shell's largest reversible synchronous mount: on this scene it
      // adds roughly 300 nodes and 50 controls. Cycling it exercises the taskbar,
      // launcher and hosted-window scene without changing a preference or user data.
      label: 'mount and unmount the Start router 24 times',
      durationMs: 4000,
      js: `(() => {
        delete window.__lqShellLoad;
        const root = document.querySelector('.os-desktop-wired');
        const start = root && root.querySelector('.os-start-btn');
        if (!start) return 'REFUSE: no Wired Start router';
        const openAtStart = start.getAttribute('aria-expanded') === 'true';
        const rec = {
          openAtStart, ticks: 0, opened: 0, closed: 0,
          minNodes: root.querySelectorAll('*').length,
          maxNodes: root.querySelectorAll('*').length,
          restored: false,
        };
        window.__lqShellLoad = rec;
        const timer = setInterval(() => {
          start.click();
          rec.ticks += 1;
          if (start.getAttribute('aria-expanded') === 'true') rec.opened += 1;
          else rec.closed += 1;
          const nodes = root.querySelectorAll('*').length;
          rec.minNodes = Math.min(rec.minNodes, nodes);
          rec.maxNodes = Math.max(rec.maxNodes, nodes);
          if (rec.ticks >= 24) {
            clearInterval(timer);
            setTimeout(() => {
              if ((start.getAttribute('aria-expanded') === 'true') !== openAtStart) start.click();
              setTimeout(() => {
                rec.restored = (start.getAttribute('aria-expanded') === 'true') === openAtStart;
              }, 160);
            }, 160);
          }
        }, 120);
        return 'cycling Start over ' + rec.minNodes + ' initial nodes';
      })()`,
      progress: `(window.__lqShellLoad ? window.__lqShellLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqShellLoad;
        if (!r) return 'REFUSE: shell load never armed';
        if (r.ticks < 24 || r.opened < 10 || r.closed < 10) return 'REFUSE: incomplete shell cycle ' + JSON.stringify(r);
        if (r.maxNodes - r.minNodes < 200) return 'REFUSE: Start mounted only ' + (r.maxNodes - r.minNodes) + ' nodes';
        if (!r.restored) return 'REFUSE: Start did not restore expanded=' + r.openAtStart;
        return 'cycled Start ' + r.ticks + ' times (' + r.opened + ' open / ' + r.closed + ' closed), mounted '
          + (r.maxNodes - r.minNodes) + ' nodes and restored expanded=' + r.openAtStart;
      })()`,
    },
  },
  blanc: {
    // Blanc is a whole second BrowserWindow, not a `.fwin`, so the interaction probe drives its
    // Root branch and every bridge call is pinned to that window (correction 30). `.blanc-root`
    // is the shell's own element; the `blanc-shell` class lives on <html>, which is not a
    // resizable root and would make the drag gesture meaningless.
    title: 'Blanc shell',
    root: '.blanc-root',
    // Resolved from /health at run time, never hardcoded: BrowserWindow ids are assigned in
    // creation order and change on every restart, so a literal `2` scores whatever happened to
    // open second. Ambiguity refuses rather than picking the first match.
    winMatch: 'blanc.html',
    heavy: {
      // Blanc's Start-equivalent: the master search is the one control that builds a
      // cross-tool index over tools, study material and the library in a single synchronous
      // mount, and it is fully reversible from the keyboard. Measured 2026-08-31 on this
      // scene: `.blanc-root` 307 elements at rest -> 477 open -> 487 with a query -> 307 on
      // Escape. Route switching is heavier but persists which tool the user is on; a perf leg
      // must not leave the shell somewhere the user did not put it.
      label: 'open and close the master search index 20 times',
      durationMs: 6000,
      js: `(() => {
        delete window.__lqBlancLoad;
        const root = document.querySelector('.blanc-root');
        const open = root && root.querySelector('.blanc-top-search');
        if (!open) return 'REFUSE: no Blanc master search control';
        const openAtStart = !!root.querySelector('.blanc-master-search-input-row');
        const rec = {
          openAtStart, ticks: 0, opened: 0, closed: 0,
          minNodes: root.querySelectorAll('*').length,
          maxNodes: root.querySelectorAll('*').length,
          restored: false,
        };
        window.__lqBlancLoad = rec;
        const esc = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
        const timer = setInterval(() => {
          const field = root.querySelector('.blanc-master-search-input-row input');
          if (field) { esc(field); rec.closed += 1; } else { open.click(); rec.opened += 1; }
          rec.ticks += 1;
          const nodes = root.querySelectorAll('*').length;
          rec.minNodes = Math.min(rec.minNodes, nodes);
          rec.maxNodes = Math.max(rec.maxNodes, nodes);
          if (rec.ticks >= 20) {
            clearInterval(timer);
            setTimeout(() => {
              const f = root.querySelector('.blanc-master-search-input-row input');
              if (!!f !== openAtStart) { if (f) esc(f); else open.click(); }
              setTimeout(() => {
                rec.restored = !!root.querySelector('.blanc-master-search-input-row') === openAtStart;
              }, 160);
            }, 200);
          }
        }, 200);
        return 'cycling master search over ' + rec.minNodes + ' initial nodes';
      })()`,
      progress: `(window.__lqBlancLoad ? window.__lqBlancLoad.ticks : -1)`,
      proof: `(() => {
        const r = window.__lqBlancLoad;
        if (!r) return 'REFUSE: Blanc load never armed';
        if (r.ticks < 20 || r.opened < 8 || r.closed < 8) return 'REFUSE: incomplete search cycle ' + JSON.stringify(r);
        // 170 nodes measured; the bar is the smaller 120 so a scene with fewer library rows
        // still counts, and anything an order of magnitude smaller is not this mount at all.
        if (r.maxNodes - r.minNodes < 120) return 'REFUSE: the search mounted only ' + (r.maxNodes - r.minNodes) + ' nodes';
        if (!r.restored) return 'REFUSE: master search did not restore open=' + r.openAtStart;
        return 'cycled the master search ' + r.ticks + ' times (' + r.opened + ' open / ' + r.closed + ' closed), mounted '
          + (r.maxNodes - r.minNodes) + ' nodes and restored open=' + r.openAtStart;
      })()`,
    },
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
const UNDER_LOAD = has('under-load');
// Correction 34. A MODE, not a probe: it reuses this file's refusals (settled main process,
// resolved window, structural root present), its bridge client and its retry policy verbatim.
const LONG_SESSION = has('long-session');
// L0's sixth baseline row. A MODE, not a probe: it reuses this file's refusals, its bridge
// client, its retry policy and — the part that makes the numbers readable at all — this
// session's own frame ceiling. See the PLAYBACK block for the two controls it refuses without.
const PLAYBACK = has('playback');
const CYCLES = Math.max(1, Number(arg('cycles', '12')) || 12);
// Correction 37. A MODE, exactly as --long-session is: it reuses this file's refusals, its
// bridge client, its retry policy and its scene record verbatim, and adds one instrument.
const PLAYER_FRAMES = has('player-frames');
const SECONDS = Math.max(10, Number(arg('seconds', '30')) || 30);
// The control's rate. 8x on a 23.976 fps clip asks the pipeline for ~192 fps against a 60 Hz
// display, so a recorder that can see dropped frames at all must see these.
const CONTROL_RATE = Math.max(2, Number(arg('control-rate', '8')) || 8);
// Overrides the spec's `videoSelector`. Its purpose is the refusal control: point it at an
// element that decodes nothing and this mode must refuse rather than score a still picture 10/10.
const SELECTOR = arg('selector', '');
const spec = SPECS[SURFACE];
if (!spec) {
  console.error(`REFUSE - --surface must be one of: ${Object.keys(SPECS).join(', ')}`);
  process.exit(2);
}
if (spec.playbackOnly && !PLAYBACK) {
  console.error(`REFUSE - --surface ${SURFACE}: ${spec.playbackOnly}`);
  process.exit(2);
}
if (spec.playerFramesOnly && !PLAYER_FRAMES) {
  console.error(`REFUSE - --surface ${SURFACE} declares no gesture legs and is scored only by --player-frames. Dragging or resizing a host while its decoder runs measures a moving scene, which this runner voids anyway.`);
  process.exit(2);
}
if (PLAYER_FRAMES && !spec.videoSelector && !SELECTOR) {
  console.error(`REFUSE - --surface ${SURFACE} declares no videoSelector, so --player-frames has no subject. Pass --selector, or score --surface player.`);
  process.exit(2);
}
/**
 * CORRECTION 30 — `--win`, and it is the same gap categories 5 and 8 already closed.
 *
 * Every bridge route here resolved the FOCUSED OS window. That is correct for the eighteen
 * surfaces above, which are all `.fwin` windows or full-window readers inside the desktop; it is
 * wrong for a shell that IS its own BrowserWindow. Measured 2026-08-31: with Blanc open in window
 * 2 and the desktop focused, `document.querySelector('.blanc-root')` in the desktop's document is
 * null, so the structural-root refusal fired and the surface simply could not be scored. The two
 * PowerShell instruments carry the same pin (`-Win`), and the interaction probe additionally
 * ASSERTS the requested window took the foreground both before and after the gesture — with two
 * windows of one app, "something is focused" no longer rules out the rAF throttle.
 *
 * A spec declares its window as a URL/title substring in `winMatch`, resolved from /health at run
 * time; `--win <id>` overrides it. Both unset is the old, focused-window behaviour.
 */
let WIN = arg('win', '');

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
  const r = await http('/eval', {
    method: 'POST',
    body: JSON.stringify({ ...(WIN ? { window: WIN } : {}), js: js.replace(/\s*;\s*$/, '').trimEnd() }),
  });
  if (!r.ok) throw new Error(`eval failed: ${JSON.stringify(r).slice(0, 300)}`);
  // `ok:true` WITH `{__error}` IS A THROW, not an answer: main caught the exception, so
  // the REQUEST succeeded and `.ok` is true. Readers that JSON.parse the result then report
  // `"[object Object]" is not valid JSON`, which names neither the throw nor the expression.
  // Measured 2026-09-03: a null deref inside one cat6 mutation surfaced only as that message.
  if (r.result && typeof r.result === 'object' && r.result.__error) {
    throw new Error(`eval THREW in the renderer: ${r.result.__error} :: ${js.trim().slice(0, 200)}`);
  }
  return r.result;
}

// The instruments are PowerShell. Scalars only across that boundary: `pwsh -File` binds
// "8,16,24" as the single number 81624, which is a banked trap in this repo.
function ps(script, argv) {
  // Correction 30: the pin travels with every instrument call, never only with the runner's own
  // reads -- a gesture recorded in the wrong window is exactly the artifact this scores against.
  const args = WIN ? [...argv, '-Win', String(WIN)] : argv;
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
  // Correction 30: resolve the spec's own window FIRST, so every read below — including the
  // structural-root refusal — already looks at the surface it claims to be scoring.
  if (!WIN && spec.winMatch) {
    const h = await get('/health');
    const hit = (h.windows || []).filter((w) => !w.destroyed && w.visible
      && (String(w.url || '').includes(spec.winMatch) || String(w.title || '').includes(spec.winMatch)));
    if (hit.length !== 1) {
      throw new Error(`REFUSE - ${hit.length} visible windows match "${spec.winMatch}"; a perf run must name exactly one. Open the surface, or pass --win <id>. Saw: ${JSON.stringify((h.windows || []).map((w) => ({ id: w.id, title: w.title, url: w.url })))}`);
    }
    WIN = String(hit[0].id);
  }
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
    // Correction 29: a spec whose title starts with '@' names its window by SELECTOR, because
    // a frameless window has no title element and substring-matching '' matches every window —
    // which would let an absent surface be scored on whichever window happened to be open.
    var want = ${JSON.stringify(spec.title)};
    var bySel = want.charAt(0) === '@' ? want.slice(1) : '';
    var mine = wins.filter(function(w){
      return bySel ? (w.matches(bySel) || !!w.querySelector(bySel)) : t(w).indexOf(want) >= 0;
    });
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

  /**
   * CORRECTION 34 — `--long-session`, L11 bullet 4's fifth clause, and the mode exists because
   * the previous attempt measured the WRONG PROCESS.
   *
   * That attempt ran 12 cycles of the real Liquid cadence and reported main private
   * 427.8 -> 427.4 MB with `heapUsed` byte-identical and `detachedContexts` 0 -> 0, which reads
   * like a clean long session. It is not a reading about Liquid at all: `/mem` samples MAIN, and
   * every line of Liquid presentation code — `liquidWindowPresentation.ts`, the four hosts, the
   * observers and the listeners they add — runs in the RENDERER. Its own instrument said so:
   * the renderer's `usedJSHeapSize` moved 233.6 -> 433.6 MB under a plant and never came back,
   * because main's `gc()` runs in main's isolate and cannot collect a renderer heap.
   *
   * So this mode reads the renderer through `/rmem` (CDP `HeapProfiler.collectGarbage` plus
   * `Runtime.getHeapUsage` and `Memory.getDOMCounters`), samples AFTER a forced collection on
   * every cycle rather than only at the endpoints, and refuses on three things the previous
   * attempt could not check:
   *
   *  1. THE COLLECTOR CONTROL, and it runs FIRST. A deliberate on-heap plant plus a detached
   *     DOM subtree must be visible in the numbers, and must be GONE after release and one
   *     collection. If the plant does not free, this instrument cannot tell a leak from an
   *     unswept heap and every number below is VOID — which is exactly the state the previous
   *     turn was in without being able to say so.
   *  2. A PROGRESS RECEIPT. Windows observed at `[data-presentation="liquid"]` after each
   *     liquid half and back at 0 after each standard half. A cadence that toggled nothing is
   *     an empty harness, and an empty harness measures as a leak-free one.
   *  3. A SCENE FLOOR. Peak `.fwin` count and element count per cycle, so a run against a bare
   *     desktop cannot pass by having nothing to retain.
   */
  if (LONG_SESSION) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const rmem = async (gc) => {
      const r = await http('/rmem', {
        method: 'POST',
        body: JSON.stringify({ ...(WIN ? { window: WIN } : {}), gc: gc === true }),
      });
      if (!r.ok) {
        throw new Error(`REFUSE - /rmem did not answer (${JSON.stringify(r).slice(0, 200)}). The renderer heap is the whole point of this mode and main's /mem structurally cannot see it.`);
      }
      if (gc === true && r.gcRan !== true) {
        throw new Error('REFUSE - /rmem reported gcRan false, so every sample below is an unswept heap.');
      }
      return r;
    };
    // The cadence is the product's own command, reduced exactly as keyboardShortcuts.ts:1541
    // reduces the palette entry: one `os:window` event with an action tag.
    const TOGGLE = "(window.dispatchEvent(new CustomEvent('os:window', { detail: 'togglePresentation' })), 'sent')";
    const OBSERVE = `JSON.stringify({
      liquid: document.querySelectorAll('[data-presentation="liquid"]').length,
      fwins: document.querySelectorAll('.fwin').length,
      elements: document.querySelectorAll('.fwin *').length,
    })`;
    /**
     * `--churn` — and without it this leg answers a much weaker question than it looks like.
     *
     * The plain cadence toggles presentation on a window that stays open. Measured here first,
     * that is CSS-only: the mean per-cycle difference between the two halves was **0 nodes and
     * 0.0 MB**, so "nodes flat across 12 cycles" was true of a cadence that never allocated a
     * node to prove it. The leak-bearing path in a long Liquid session is the one that MOUNTS
     * and UNMOUNTS Liquid chrome — open a window, make it Liquid, put it back, close it — and
     * the plain mode never walks it.
     *
     * `--churn` walks it, through the product's own title-bar controls rather than the global
     * command, so the window under test is named rather than inferred from focus. It also gives
     * this leg the sensitivity receipt the plain mode cannot have: the open+liquid sample minus
     * the closed sample IS the allocation, so a flat growth number is only meaningful next to a
     * non-zero one.
     */
    const CHURN = has('churn');
    const SECTION = arg('section', SURFACE);
    const findWin = `var wins = [].slice.call(document.querySelectorAll('.fwin'));
      var tt = function (w) { var e = w.querySelector('.fwin-title-text, .fwin-title'); return e ? (e.textContent || '').trim() : ''; };
      var w = wins.filter(function (x) { return tt(x).indexOf(${JSON.stringify(spec.title)}) >= 0; })[0];`;
    const clickIn = (btnSel) => `(function () { ${findWin}
      if (!w) return 'REFUSE: no window titled ${spec.title}';
      var b = w.querySelector(${JSON.stringify(btnSel)});
      if (!b) return 'REFUSE: ${btnSel} absent';
      b.click();
      return 'clicked';
    })()`;
    const OBSERVE_MINE = `(function () { ${findWin}
      return JSON.stringify({
        present: w ? (w.getAttribute('data-presentation') || 'standard') : 'absent',
        liquid: document.querySelectorAll('[data-presentation="liquid"]').length,
        fwins: wins.length,
        elements: document.querySelectorAll('.fwin *').length,
      });
    })()`;

    // --- control 1: can this collector free a renderer heap at all? -------------------
    step('collector CONTROL — plant');
    const controlBase = await rmem(true);
    // On-heap objects, not an ArrayBuffer: a typed array's backing store is external and would
    // move `usedSize` by an amount V8 does not own, which is not the pool the cadence fills.
    // The detached subtree is the DOM half — `nodes` is what names a retained subtree, and a
    // heap number alone never could.
    await ev(`(window.__lqPlant = { objs: Array.from({ length: 1200000 }, function (_, i) { return { i: i, a: i * 2, b: 'lq' }; }), dom: (function () { var d = document.createElement('div'); for (var i = 0; i < 20000; i++) { var s = document.createElement('span'); s.textContent = 'x'; d.appendChild(s); } return d; })() }, 'planted')`);
    await sleep(300);
    const controlPlanted = await rmem(true);
    step('collector CONTROL — release');
    await ev("(delete window.__lqPlant, 'released')");
    await sleep(300);
    const controlReleased = await rmem(true);
    const plantHeapMb = controlPlanted.usedMb - controlBase.usedMb;
    const plantNodes = controlPlanted.nodes - controlBase.nodes;
    // Freed against the RISE, not against an absolute figure: a machine that never made the
    // allocation visible is a different failure from one that made it and kept it.
    const freedHeadroom = controlPlanted.usedMb - controlReleased.usedMb;
    const freedNodes = controlPlanted.nodes - controlReleased.nodes;
    legs.collectorControl = {
      base: controlBase, planted: controlPlanted, released: controlReleased,
      plantHeapMb: Math.round(plantHeapMb * 10) / 10,
      plantNodes,
      freedHeapMb: Math.round(freedHeadroom * 10) / 10,
      freedNodes,
    };
    if (plantHeapMb < 20) {
      voidedEarly.push(`COLLECTOR CONTROL DID NOT ARM: a 1.2M-object plant moved the renderer heap only ${legs.collectorControl.plantHeapMb} MB, so this instrument cannot see an allocation it made itself and every number below is void.`);
    } else if (freedHeadroom < plantHeapMb * 0.7) {
      voidedEarly.push(`COLLECTOR CONTROL DID NOT FIRE: the plant rose ${legs.collectorControl.plantHeapMb} MB and only ${legs.collectorControl.freedHeapMb} MB came back after release + collection, so a rising heap here cannot be told apart from an unswept one. This is the exact state the 2026-09-01 main-only reading was in.`);
    }
    if (plantNodes < 15000) {
      voidedEarly.push(`DOM CONTROL DID NOT ARM: a 20,000-node detached subtree moved the node counter by ${plantNodes}, so the DOM half of this reading is blind.`);
    } else if (freedNodes < plantNodes * 0.7) {
      voidedEarly.push(`DOM CONTROL DID NOT FIRE: ${plantNodes} planted nodes and only ${freedNodes} released, so a retained subtree cannot be told apart from a collected one.`);
    }

    // --- the cadence ------------------------------------------------------------------
    const baseline = await rmem(true);
    const mainBaseline = await http('/mem', { method: 'POST', body: JSON.stringify({ gc: true }) });
    const cycles = [];
    let liquidObserved = 0;
    let standardObserved = 0;
    let peakFwins = 0;
    let peakElements = 0;
    // Both halves are sampled, and both after a collection, for one reason: without the liquid
    // half there is no way to tell a round trip from a no-op. "Nodes flat across 12 cycles" is
    // worthless if the liquid presentation never allocated a node to begin with, and the
    // attribute flip alone does not settle that — a CSS-only presentation and a mount/unmount
    // one produce the same `[data-presentation]` receipt and completely different leak risk.
    let liquidDeltaNodes = 0;
    let liquidDeltaMb = 0;
    const refusals = [];
    for (let i = 0; i < CYCLES; i++) {
      step(`cadence ${i + 1}/${CYCLES}${CHURN ? ' (churn)' : ''}`);
      let onLiquid;
      let onStandard;
      let liquidSample;
      let s;
      if (CHURN) {
        // Open through the product's own desktop command, then drive the window's own
        // title-bar controls. `os:open` takes the section as the detail DIRECTLY.
        await ev(`(window.dispatchEvent(new CustomEvent('os:open', { detail: ${JSON.stringify(SECTION)} })), 'opened')`);
        await sleep(500);
        const madeLiquid = await ev(clickIn('.fwin-b-liquid'));
        if (String(madeLiquid).startsWith('REFUSE')) refusals.push(`cycle ${i + 1} make-liquid: ${madeLiquid}`);
        await sleep(450);
        onLiquid = JSON.parse(await ev(OBSERVE_MINE));
        liquidSample = await rmem(true);
        const backToStandard = await ev(clickIn('.fwin-b-liquid'));
        if (String(backToStandard).startsWith('REFUSE')) refusals.push(`cycle ${i + 1} return-to-standard: ${backToStandard}`);
        await sleep(450);
        onStandard = JSON.parse(await ev(OBSERVE_MINE));
        const closed = await ev(clickIn('.fwin-close'));
        if (String(closed).startsWith('REFUSE')) refusals.push(`cycle ${i + 1} close: ${closed}`);
        await sleep(500);
        const afterClose = JSON.parse(await ev(OBSERVE_MINE));
        if (afterClose.present !== 'absent') refusals.push(`cycle ${i + 1}: the window was still present after Close, so this cycle unmounted nothing`);
        s = await rmem(true);
      } else {
        await ev(TOGGLE);
        await sleep(450);
        onLiquid = JSON.parse(await ev(OBSERVE));
        liquidSample = await rmem(true);
        await ev(TOGGLE);
        await sleep(450);
        onStandard = JSON.parse(await ev(OBSERVE));
        s = await rmem(true);
      }
      liquidObserved += onLiquid.liquid;
      standardObserved += onStandard.liquid;
      peakFwins = Math.max(peakFwins, onLiquid.fwins, onStandard.fwins);
      peakElements = Math.max(peakElements, onLiquid.elements, onStandard.elements);
      liquidDeltaNodes += liquidSample.nodes - s.nodes;
      liquidDeltaMb += liquidSample.usedMb - s.usedMb;
      cycles.push({
        cycle: i + 1,
        liquidWindows: onLiquid.liquid,
        standardWindows: onStandard.liquid,
        fwins: onLiquid.fwins,
        elements: onLiquid.elements,
        usedMb: s.usedMb, nodes: s.nodes, documents: s.documents, listeners: s.jsEventListeners,
        liquidUsedMb: liquidSample.usedMb, liquidNodes: liquidSample.nodes,
        liquidListeners: liquidSample.jsEventListeners,
      });
    }
    const after = await rmem(true);
    const mainAfter = await http('/mem', { method: 'POST', body: JSON.stringify({ gc: true }) });

    legs.longSession = {
      cycles: CYCLES,
      mode: CHURN ? `churn — open ${SECTION}, Make Liquid, Return to standard, Close, every cycle` : 'toggle only — the window stays open',
      refusals,
      baseline, after, cycleSamples: cycles,
      main: {
        privateMbBefore: mainBaseline.privateMb, privateMbAfter: mainAfter.privateMb,
        heapUsedMbBefore: mainBaseline.heapUsedMb, heapUsedMbAfter: mainAfter.heapUsedMb,
        detachedContextsBefore: mainBaseline.detachedContexts, detachedContextsAfter: mainAfter.detachedContexts,
      },
      receipt: {
        liquidObserved, standardObserved, peakFwins, peakElements,
        // Mean, not total: a per-cycle figure is what a reader compares against the growth
        // allowance below, and a total would flatter or damn the run purely by cycle count.
        liquidHalfNodeDelta: Math.round(liquidDeltaNodes / CYCLES),
        liquidHalfHeapMb: Math.round((liquidDeltaMb / CYCLES) * 10) / 10,
        note: 'liquidObserved counts windows found at [data-presentation="liquid"] after each liquid half; standardObserved is the same read after each standard half and must be 0. liquidHalfNodeDelta/liquidHalfHeapMb are the mean per-cycle difference between the two halves, both sampled after a forced collection — they say how much the presentation actually allocates, which is what makes a flat growth number mean something.',
      },
      growth: {
        usedMb: Math.round((after.usedMb - baseline.usedMb) * 10) / 10,
        nodes: after.nodes - baseline.nodes,
        documents: after.documents - baseline.documents,
        listeners: after.jsEventListeners - baseline.jsEventListeners,
        mainPrivateMb: Math.round((mainAfter.privateMb - mainBaseline.privateMb) * 10) / 10,
      },
      // THE COMPARISON CHURN MODE ACTUALLY NEEDS, and `growth` above is not it. The baseline is
      // taken with the surface OPEN and the run ends with it CLOSED, so `growth` straddles a
      // whole window and comes out large and negative on a perfectly clean run — a number a
      // reader would either dismiss or misread. Cycle 1's closed sample against the last one is
      // like-for-like: same scene, same presentation, N mount/unmount round trips apart.
      growthAcrossCycles: {
        usedMb: Math.round((cycles[cycles.length - 1].usedMb - cycles[0].usedMb) * 10) / 10,
        nodes: cycles[cycles.length - 1].nodes - cycles[0].nodes,
        documents: cycles[cycles.length - 1].documents - cycles[0].documents,
        listeners: cycles[cycles.length - 1].listeners - cycles[0].listeners,
        from: 1, to: cycles.length,
      },
    };

    const findings = [];
    const voided = [...voidedEarly];
    if (liquidObserved < CYCLES) {
      voided.push(`EMPTY CADENCE: only ${liquidObserved} liquid window observations across ${CYCLES} cycles, so the toggle did not do the work this leg claims to measure.`);
    }
    if (standardObserved !== 0) {
      voided.push(`CADENCE DID NOT REVERSE: ${standardObserved} window(s) still at data-presentation="liquid" after a standard half, so the cycles are not round trips and growth cannot be attributed to them.`);
    }
    if (peakFwins < 1 || peakElements < 50) {
      voided.push(`EMPTY HARNESS: peak ${peakFwins} .fwin / ${peakElements} elements across the run — a desktop with nothing on it cannot retain anything, so a clean reading here means nothing.`);
    }
    if (refusals.length) {
      voided.push(`CADENCE REFUSED ${refusals.length} time(s), so the cycles are not the round trips this leg claims: ${refusals.slice(0, 4).join(' | ')}`);
    }
    // The sensitivity check, and it only applies where an allocation is expected. In churn mode
    // a whole window mounts and unmounts every cycle, so a zero delta means the samples are not
    // straddling the mount at all and a flat growth number proves nothing. In toggle-only mode a
    // zero delta is a real answer about the product (the presentation is CSS-driven), recorded
    // in the receipt rather than scored.
    if (CHURN && legs.longSession.receipt.liquidHalfNodeDelta < 50) {
      voided.push(`CHURN DID NOT ALLOCATE: the open+liquid half differed from the closed half by only ${legs.longSession.receipt.liquidHalfNodeDelta} nodes on average, so these samples never straddled a mount and a flat growth number is not evidence.`);
    }
    // Churn scores the like-for-like series; toggle-only mode has no window to straddle, so its
    // endpoints are already comparable and stay the scored pair.
    const g = CHURN ? legs.longSession.growthAcrossCycles : legs.longSession.growth;
    g.mainPrivateMb = legs.longSession.growth.mainPrivateMb;
    // Documents is the sharpest of the four: one detached document surviving a forced
    // collection is a leak by itself, so it is scored exactly, not proportionally.
    // The pair the scored numbers came from, named so a finding quotes the same two samples it
    // was computed from rather than whichever pair reads worse.
    const from = CHURN
      ? { nodes: cycles[0].nodes, documents: cycles[0].documents, listeners: cycles[0].listeners, usedMb: cycles[0].usedMb, label: 'cycle 1, closed' }
      : { nodes: baseline.nodes, documents: baseline.documents, listeners: baseline.jsEventListeners, usedMb: baseline.usedMb, label: 'baseline' };
    const to = CHURN
      ? { nodes: cycles[cycles.length - 1].nodes, documents: cycles[cycles.length - 1].documents, listeners: cycles[cycles.length - 1].listeners, usedMb: cycles[cycles.length - 1].usedMb, label: `cycle ${cycles.length}, closed` }
      : { nodes: after.nodes, documents: after.documents, listeners: after.jsEventListeners, usedMb: after.usedMb, label: 'after' };
    if (g.documents > 0) findings.push(`renderer retained ${g.documents} extra document(s) after ${CYCLES} cycles and a forced collection (${from.label} ${from.documents} -> ${to.label} ${to.documents})`);
    if (g.nodes > Math.max(500, from.nodes * 0.05)) findings.push(`renderer DOM nodes grew ${g.nodes} after a forced collection (${from.label} ${from.nodes} -> ${to.label} ${to.nodes}), over the ${Math.max(500, Math.round(from.nodes * 0.05))} allowance`);
    if (g.listeners > Math.max(100, from.listeners * 0.05)) findings.push(`renderer JS event listeners grew ${g.listeners} after a forced collection (${from.label} ${from.listeners} -> ${to.label} ${to.listeners}), over the ${Math.max(100, Math.round(from.listeners * 0.05))} allowance`);
    // The heap gets the loosest bar on purpose: JIT code, caches and V8's own growth all land
    // here and none of them are the cadence. It is the DOM counters that name a Liquid leak.
    if (g.usedMb > Math.max(15, from.usedMb * 0.25)) findings.push(`renderer JS heap grew ${g.usedMb} MB after a forced collection (${from.label} ${from.usedMb} -> ${to.label} ${to.usedMb} MB), over the ${Math.max(15, Math.round(from.usedMb * 0.25))} MB allowance`);
    if (g.mainPrivateMb > 50) findings.push(`main private bytes grew ${g.mainPrivateMb} MB across the cadence (${mainBaseline.privateMb} -> ${mainAfter.privateMb} MB)`);
    if (mainAfter.detachedContexts > mainBaseline.detachedContexts) findings.push(`main detached contexts ${mainBaseline.detachedContexts} -> ${mainAfter.detachedContexts}`);

    const score = voided.length ? 'VOID' : findings.length === 0 ? 10 : 0;
    const out = {
      surface: SURFACE, title: spec.title, root: spec.root, mode: 'long-session',
      at: new Date().toISOString(),
      process: { pid: mem.pid, uptimeSecAtStart: mem.uptimeSec, rendererPid: baseline.pid },
      surfaceWindow: {
        mechanism: found.rootInFwin ? 'floating .fwin' : 'root OS window',
        matched: found.matched, deskWindows: found.windows, titles: found.titles,
      },
      legs, findings, voided, score,
    };
    console.log(JSON.stringify(out, null, 2));
    const file = arg('out', path.join('src/.coordination/liquid-workplace/baselines', `cat7-${SURFACE}-long-session.json`));
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
    console.log('wrote', file);
    console.log(`\nCATEGORY 7 — ${SURFACE} LONG SESSION: ${score === 10 ? 'PASS 10/10' : score === 'VOID' ? 'VOID' : `${findings.length} finding(s), NOT a 10`}`);
    for (const f of findings) console.log(`  FINDING  ${f}`);
    for (const v of voided) console.log(`  VOID     ${v}`);
    return;
  }

  /**
   * CORRECTION 37 — `--player-frames`, L0's sixth axis, open since 2026-08-16.
   *
   * `PERF_BASELINE.md:104` and `VIDEO_BASELINE.md:109` both record it open with the same reason:
   * "needs a real clip". That is the whole of the gap — the other five axes were recorded off one
   * cold start and this one cannot be, because a player with nothing loaded drops no frames and
   * therefore scores perfectly. Every refusal below exists to stop exactly that.
   *
   * THE SENSITIVITY CONTROL IS THE SUBJECT ITSELF, at `--control-rate`, and it is not optional:
   * a clean frame reading only means something if this recorder can see a decoder that is
   * dropping frames, and nothing else in this harness can demonstrate that. The control runs
   * AFTER the scored arm, on the same element, in the same session, and is then undone —
   * playbackRate back to 1 and the media position seeked back to where the control began. That
   * restoration is measured, not assumed, and it is reported in the record.
   *
   * WHY NOT A SECOND OFF-SCREEN <video> ON THE SAME SOURCE, which was the first design: it
   * decodes the SAME sidecar directstream id, and doing that at 8x wedged the stream — the next
   * three opens mounted the library browser instead of the player. One decoder, one stream.
   */
  if (PLAYER_FRAMES) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const sel = SELECTOR || spec.videoSelector;

    // Deltas between consecutive samples are what this mode reports; a cumulative ratio is
    // dominated by the startup burst and says nothing about the steady state.
    const summarise = (rec) => {
      const s = rec.samples;
      const a = s[0];
      const b = s[s.length - 1];
      const wallS = (b[0] - a[0]) / 1000;
      const mediaS = b[1] - a[1];
      const decoded = b[2] - a[2];
      const dropped = b[3] - a[3];
      const corrupted = b[4] - a[4];
      const intervals = [];
      for (let i = 1; i < s.length; i++) {
        const d = s[i][2] - s[i - 1][2];
        const dr = s[i][3] - s[i - 1][3];
        intervals.push({
          atMs: s[i][0], ms: s[i][0] - s[i - 1][0], decoded: d, dropped: dr,
          droppedPct: d > 0 ? Math.round((1000 * dr) / d) / 10 : null,
        });
      }
      // Intervals with too few frames to rate are excluded from the worst-interval bar and
      // counted separately, so a 3-frame hiccup cannot report as a 33% interval.
      const rated = intervals.filter((i) => i.decoded >= 5);
      const worst = rated.reduce((m, i) => (m === null || i.droppedPct > m.droppedPct ? i : m), null);
      const r1 = (n) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
      const r2 = (n) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
      return {
        sel: rec.sel, resolution: `${rec.width}x${rec.height}`, clipDurationS: r1(rec.duration),
        src: rec.src, rate: rec.rate, samples: s.length,
        wallS: r2(wallS), mediaS: r2(mediaS), decoded, dropped, corrupted,
        droppedPct: decoded > 0 ? r1((100 * dropped) / decoded) : null,
        droppedPerWallSec: wallS > 0 ? r2(dropped / wallS) : null,
        decodedFps: mediaS > 0 ? r1(decoded / mediaS) : null,
        // At rate 1 this is 1.00 for a player keeping up. It is the stall term: a decoder can
        // drop nothing and still fall behind the clock, and a rAF recorder sees neither.
        playbackRatio: wallS > 0 && rec.rate > 0 ? r2(mediaS / wallS / rec.rate) : null,
        // The sampler's OWN cadence, recorded rather than assumed. A renderer that starves its
        // 1 s timer still yields a valid endpoint delta — the counters are cumulative — but the
        // per-second series stops being a series, and a reader has to be able to see that.
        longestSampleGapMs: intervals.reduce((m, i) => Math.max(m, i.ms), 0),
        intervalsRated: rated.length, intervalsWithDrops: rated.filter((i) => i.dropped > 0).length,
        worstInterval: worst,
        flags: {
          elementSwapped: rec.elementSwapped, rateChanged: rec.rateChanged,
          pausedAtArm: rec.pausedAtArm, pausedDuring: rec.pausedDuring, done: rec.done,
        },
        intervals,
      };
    };

    /**
     * `minSamples` differs between the two legs, and that is not a loosened bar — it is the
     * control's own load. Measured 2026-09-03: at 8x the renderer's 1 s timer fired TWICE in
     * 10.6 s, because a decoder asked for ~192 fps starves everything else on the thread. The
     * scored leg is judged per-second and needs its cadence; the control is a single delta
     * between two endpoints of cumulative counters and needs exactly two samples to be a real
     * number. Requiring the scored leg's cadence of the control would have voided every run.
     */
    const runLeg = async (label, ms, everyMs, minSamples = 5) => {
      const armed = await ev(FRAME_ARM(sel, ms, everyMs));
      if (String(armed).startsWith('REFUSE')) throw new Error(`REFUSE (${label}) - ${armed}`);
      step(`${label}: ${armed}, ${Math.round(ms / 1000)}s at ${everyMs}ms`);
      await sleep(ms + 1500);
      const raw = JSON.parse(await ev(FRAME_READ));
      await ev(FRAME_STOP);
      if (!raw) throw new Error(`REFUSE (${label}) - the sampler record is gone; something cleared it mid-leg`);
      const why = `samples=${raw.samples.length} elementSwapped=${raw.elementSwapped} pausedDuring=${raw.pausedDuring} rateChanged=${raw.rateChanged} spanMs=${raw.samples.length ? raw.samples[raw.samples.length - 1][0] : 0}`;
      if (raw.elementSwapped) throw new Error(`REFUSE (${label}) - the player element was replaced mid-leg, so the two endpoints are different decoders and their difference is not a delta. ${why}`);
      if (!raw.done) throw new Error(`REFUSE (${label}) - the sampler never reached its deadline. A throttled renderer timer cannot produce a comparable cadence. ${why}`);
      if (raw.samples.length < minSamples) throw new Error(`REFUSE (${label}) - fewer than ${minSamples} samples: ${why}`);
      return summarise(raw);
    };

    // --- the scored arm, on the surface exactly as it was found -----------------------
    const scored = await runLeg('clean', SECONDS * 1000, 1000);
    const voided = [];
    const findings = [];

    // Refusals that only a taken reading can make. Each one is a way an ABSENT or STILL player
    // scores as a perfect one, which is the failure this whole mode exists to prevent.
    if (scored.decoded <= 0) {
      throw new Error(`REFUSE - the subject decoded 0 frames across ${scored.wallS}s. A player that is not playing drops nothing and would score 10/10; there is no measurement here.`);
    }
    if (scored.flags.pausedAtArm || scored.flags.pausedDuring) {
      throw new Error('REFUSE - the subject was paused during the leg. Same reason as above.');
    }
    if (scored.flags.elementSwapped) {
      throw new Error('REFUSE - the player element was replaced mid-leg, so the two endpoints are different decoders and their difference is not a delta.');
    }
    if (scored.flags.rateChanged) throw new Error('REFUSE - playbackRate moved during the scored leg.');
    if (!(scored.rate === 1)) throw new Error(`REFUSE - the scored leg needs rate 1, saw ${scored.rate}.`);
    if (scored.decodedFps !== null && scored.decodedFps < 5) {
      voided.push(`the subject decoded only ${scored.decodedFps} fps of media time, which is not a player running normally`);
    }

    // --- the sensitivity control, then put it back ------------------------------------
    const ctBefore = Number(await ev(`document.querySelector(${JSON.stringify(sel)}).currentTime`));
    await ev(`(function(){var v=document.querySelector(${JSON.stringify(sel)});v.playbackRate=${CONTROL_RATE};return v.playbackRate;})()`);
    let control = null;
    let restored = null;
    try {
      control = await runLeg(`control x${CONTROL_RATE}`, 6000, 500, 2);
    } finally {
      await ev(`(function(){var v=document.querySelector(${JSON.stringify(sel)});if(!v)return 'gone';v.playbackRate=1;v.currentTime=${ctBefore};return 'restored';})()`);
      await sleep(2500);
      restored = JSON.parse(await ev(`JSON.stringify((function(){var v=document.querySelector(${JSON.stringify(sel)});if(!v)return{present:false};return {present:true,rate:v.playbackRate,paused:v.paused,currentTime:Math.round(v.currentTime*100)/100,readyState:v.readyState};})())`));
    }
    step(`restored: ${JSON.stringify(restored)}`);
    if (!restored.present || restored.rate !== 1) {
      voided.push(`the control was not undone: the subject reads ${JSON.stringify(restored)} and must read rate 1 on a present element`);
    }

    // The bar the control has to clear, and it is deliberately coarse: this asks whether the
    // recorder can see a dropping decoder AT ALL, not how much worse 8x is.
    const cleanRate = scored.droppedPerWallSec || 0;
    const fastRate = control ? control.droppedPerWallSec || 0 : 0;
    const controlFired = !!control && control.decoded > 0 && fastRate >= cleanRate * 5 + 5;
    if (!controlFired) {
      voided.push(`CONTROL DID NOT FIRE: at ${CONTROL_RATE}x the subject dropped ${fastRate}/s against ${cleanRate}/s clean (needs >= ${Math.round((cleanRate * 5 + 5) * 100) / 100}/s). This recorder cannot demonstrate that it sees a dropping decoder, so the clean number above is not evidence of anything.`);
    }

    // --- the bars ---------------------------------------------------------------------
    if (scored.droppedPct > 1) findings.push(`${scored.dropped} of ${scored.decoded} frames dropped over ${scored.wallS}s = ${scored.droppedPct}%, over the 1% allowance`);
    if (scored.worstInterval && scored.worstInterval.droppedPct > 5) findings.push(`worst second dropped ${scored.worstInterval.dropped} of ${scored.worstInterval.decoded} = ${scored.worstInterval.droppedPct}% at t+${scored.worstInterval.atMs}ms, over the 5% per-second allowance`);
    if (scored.corrupted > 0) findings.push(`${scored.corrupted} corrupted frame(s) decoded`);
    if (scored.playbackRatio !== null && scored.playbackRatio < 0.98) findings.push(`media time advanced ${scored.mediaS}s over ${scored.wallS}s of wall clock at rate 1 = ${scored.playbackRatio}x, so the player fell behind its own clock`);

    const score = voided.length ? 'VOID' : findings.length === 0 ? 10 : 0;
    const out = {
      surface: SURFACE, title: spec.title, root: spec.root, mode: 'player-frames',
      at: new Date().toISOString(),
      instrument: 'HTMLVideoElement.getVideoPlaybackQuality() deltas, renderer-side sampler at 1000 ms',
      process: { pid: mem.pid, uptimeSecAtStart: mem.uptimeSec },
      surfaceWindow: {
        mechanism: found.rootInFwin ? 'floating .fwin' : 'root OS window',
        matched: found.matched, deskWindows: found.windows, titles: found.titles,
        rootElements: found.rootElements,
      },
      legs: { scored, control, restored, controlRate: CONTROL_RATE, controlFired },
      findings, voided, score,
    };
    console.log(JSON.stringify(out, null, 2));
    const file = arg('out', path.join('src/.coordination/liquid-workplace/baselines', `cat7-${SURFACE}-frames.json`));
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
    console.log('wrote', file);
    console.log(`\nPLAYER FRAME STABILITY — ${SURFACE}: ${score === 10 ? 'PASS 10/10' : score === 'VOID' ? 'VOID' : `${findings.length} finding(s), NOT a 10`}`);
    console.log(`  clean    ${scored.resolution} ${scored.decoded} decoded / ${scored.dropped} dropped over ${scored.wallS}s = ${scored.droppedPct}% (${scored.decodedFps} fps, ratio ${scored.playbackRatio}, ${scored.intervalsWithDrops}/${scored.intervalsRated} seconds with a drop)`);
    if (control) console.log(`  control  x${CONTROL_RATE}: ${control.decoded} decoded / ${control.dropped} dropped over ${control.wallS}s = ${control.droppedPct}% (${fastRate}/s vs ${cleanRate}/s clean) -> ${controlFired ? 'FIRED' : 'DID NOT FIRE'}`);
    for (const f of findings) console.log(`  FINDING  ${f}`);
    for (const v of voided) console.log(`  VOID     ${v}`);
    if (score !== 10) process.exitCode = 1;
    return;
  }

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

  /**
   * `--playback` — PLAYER FRAME STABILITY, L0's sixth baseline row and the only one of the six
   * still open (PERF_BASELINE.md:104 and VIDEO_BASELINE.md:109 both record it so, for the same
   * reason: it needs a real clip and none was ever loaded).
   *
   * TWO LEDGERS, and the rAF one alone would have been a false pass. The recorder every other
   * leg here uses reports the RENDERER's frame cadence, and on a video surface that is the
   * compositor: a dropped video frame simply repaints the previous picture, on time, so a
   * decoder dropping every second frame produces the same clean rAF distribution as a healthy
   * one. `getVideoPlaybackQuality()` is the decoder's own ledger and is what the rubric's words
   * name. Both are recorded; the decoder ledger is what can fail this leg on its own.
   *
   * TWO CONTROLS IT REFUSES WITHOUT, and this leg needs both because the two ledgers fail
   * independently:
   *
   *  1. THE NEGATIVE CONTROL, and it runs FIRST. The failure this leg exists to avoid is
   *     scoring a player that is not playing — a paused `<video>` decodes nothing and drops
   *     nothing, which reports as a flawless 0.00%. So the clip is PAUSED and the instrument
   *     must REFUSE. If it scores a paused player, every number below is void. The renderer
   *     also arms its own watchdog before pausing: `refusing-leg-strands-app-state` is banked
   *     here, and a run that dies mid-control must not leave the user's clip stopped.
   *  2. THE SENSITIVITY CONTROL. `-Jank`'s 120 ms renderer blocks must make the rAF
   *     distribution visibly worse, exactly as the drag leg's control does. Without it a clean
   *     playback reading only says the recorder saw nothing.
   *
   * It changes nothing else. The scored leg DRIVES NOTHING — it observes a clip the app is
   * already playing — so there is no restore step and no state to strand.
   */
  if (PLAYBACK) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Picks the same element the instrument picks — largest painted box — so the control acts on
    // the video the leg is about to score and not on a wallpaper loop that happens to be first
    // in the document. `control-must-attack-the-scored-term` is banked for exactly that gap.
    const PICK = `const painted = [].slice.call(document.querySelectorAll('video')).filter(function (x) {
      const b = x.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(x).visibility !== 'hidden';
    });
    const v = painted.length ? painted.map(function (e) { return { e: e, r: e.getBoundingClientRect() }; })
      .sort(function (a, b) { return b.r.width * b.r.height - a.r.width * a.r.height; })[0].e : null;`;

    step('playback NEGATIVE CONTROL — pause the clip; the instrument must refuse');
    const paused = String(await ev(`(() => { ${PICK}
      if (!v) return 'REFUSE: no painted <video> to pause';
      if (v.paused) return 'REFUSE: the clip is already paused, so this control cannot prove anything';
      window.__lqPlayCtl = { at: v.currentTime, rate: v.playbackRate };
      v.pause();
      // The renderer restores itself on wall-clock time even if nothing ever calls the resume.
      window.__lqPlayWatchdog = setTimeout(function () { try { v.play(); } catch (e) { /* the user closed it */ } }, 20000);
      return 'paused at ' + v.currentTime.toFixed(2) + ' s';
    })()`));
    let controlRefused = null;
    let controlScored = null;
    if (/^REFUSE/.test(paused)) {
      voidedEarly.push(`playback negative control could not arm: ${paused}`);
    } else {
      try {
        controlScored = ps(IPROBE, ['-Interaction', 'playback', '-AsJson']);
      } catch (e) {
        // PowerShell colours Write-Error, and the escape sequences land verbatim in a banked
        // JSON file where they make the one string that PROVES the control fired unreadable.
        controlRefused = String(e && e.message ? e.message : e)
          // fromCharCode, not an escape literal: write-tool-emits-raw-nul is banked here.
          .split(String.fromCharCode(27)).join('')
          .replace(/\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim();
        // PowerShell echoes the offending SOURCE LINE before the message, so a plain head-slice
        // banks the guard's own code and cuts off the reason it fired -- which is the one thing
        // this record exists to show. Take the last REFUSE marker where there is one.
        const reasonAt = controlRefused.lastIndexOf('REFUSE:');
        controlRefused = (reasonAt >= 0 ? controlRefused.slice(reasonAt) : controlRefused).slice(0, 400);
      } finally {
        const resumed = String(await ev(`(() => { ${PICK}
          if (window.__lqPlayWatchdog) { clearTimeout(window.__lqPlayWatchdog); delete window.__lqPlayWatchdog; }
          if (!v) return 'REFUSE: the player left the screen while the control was running';
          const ctl = window.__lqPlayCtl || {};
          delete window.__lqPlayCtl;
          // play() returns a promise and /eval serialises a promise to {} - fire it, do not
          // return it, and read the paused flag back on the next call instead. NO BACKTICK in
          // this comment: these lines live inside a template literal and one would close it.
          v.play();
          return 'resume requested from ' + (ctl.at === undefined ? '?' : ctl.at.toFixed(2)) + ' s';
        })()`));
        await sleep(700);
        const backPlaying = String(await ev(`(() => { ${PICK}
          return v ? JSON.stringify({ paused: v.paused, at: +v.currentTime.toFixed(2) }) : 'REFUSE: no video';
        })()`));
        legs.playbackControlRestore = { resumed, backPlaying };
        if (/^REFUSE/.test(backPlaying) || JSON.parse(backPlaying).paused !== false) {
          voidedEarly.push(`playback negative control did NOT put the clip back: ${resumed} / ${backPlaying}. The surface is left in a state this run created.`);
        }
      }
      if (controlRefused === null) {
        voidedEarly.push(`CONTROL DID NOT FAIL: the instrument SCORED a paused player (${controlScored ? `${controlScored.frames} frames, p50 ${controlScored.frame_p50_ms} ms` : 'no record'}). A still picture drops no frames, so every playback number here would be a fabricated pass.`);
      }
      legs.playbackNegativeControl = {
        armed: paused,
        refusedWith: controlRefused,
        scoredAnyway: controlRefused === null ? controlScored : null,
      };
    }

    step('playback');
    legs.playback = ps(IPROBE, ['-Interaction', 'playback', '-AsJson']);
    step('playback (repeat)');
    legs.playbackRepeat = ps(IPROBE, ['-Interaction', 'playback', '-AsJson']);
    step('playback CONTROL (-Jank)');
    legs.playbackJank = ps(IPROBE, ['-Interaction', 'playback', '-Jank', '-AsJson']);

    const memEnd = await get('/mem');
    const findings = [];
    const voided = [...voidedEarly];
    const environment = [];
    const g = legs.playback.gesture;
    const gr = legs.playbackRepeat.gesture;

    if (!legs.playback.scene_stable) {
      voided.push(`playback: the scene moved during the reading (${legs.playback.scene_before.fwins}/${legs.playback.scene_before.fwinElements} -> ${legs.playback.scene_after.fwins}/${legs.playback.scene_after.fwinElements})`);
    }
    if (legs.playback.stale_recorder) voided.push('playback: a stale frame recorder was found and disarmed; re-run to be sure');
    if (legs.playbackJank.frames_over_100 <= (legs.playback.frames_over_100 || 0)
      && legs.playbackJank.frame_p95_ms <= legs.playback.frame_p95_ms) {
      voided.push(`CONTROL DID NOT FAIL: -Jank produced ${legs.playbackJank.frames_over_100} frames over 100 ms / p95 ${legs.playbackJank.frame_p95_ms} ms against the clean run's ${legs.playback.frames_over_100} / ${legs.playback.frame_p95_ms} ms. The recorder is not seeing the frames it claims to.`);
    }

    // --- the renderer half, scored against THIS session's ceiling ---------------------
    if (legs.playback.frame_p50_ms > ceilingP50 * 1.5) findings.push(`playback: renderer p50 ${legs.playback.frame_p50_ms} ms against a ${ceilingP50} ms control`);
    if (legs.playback.frame_p95_ms > ceilingP95 * 2) findings.push(`playback: renderer p95 ${legs.playback.frame_p95_ms} ms against a ${ceilingP95} ms control`);
    if (legs.playback.frames_over_100 > ceilingOver100) findings.push(`playback: ${legs.playback.frames_over_100} renderer frames over 100 ms, against a control that produced ${ceilingOver100}`);
    if (legs.playback.main_max_ms > L0.mainBlockBarMs) findings.push(`playback: main blocked ${legs.playback.main_max_ms} ms, over the ${L0.mainBlockBarMs} ms bar`);

    // --- the decoder half, which is what "player frame stability" actually names ------
    // 1.0% is the bar, and it is the industry's rather than one invented here: below it a
    // viewer cannot see a dropped frame, above it playback visibly stutters. Stated as a
    // number so the next worker can move it deliberately instead of by feel. Corrupted frames
    // have no allowance at all — one is a decode error, not a scheduling loss.
    const DROP_BAR_PCT = 1.0;
    if (g && gr) {
      if (g.dropPct !== null && g.dropPct > DROP_BAR_PCT && gr.dropPct !== null && gr.dropPct > DROP_BAR_PCT) {
        findings.push(`playback: the decoder dropped ${g.droppedFrames} of ${g.decodedFrames} frames (${g.dropPct}%) and ${gr.droppedFrames} of ${gr.decodedFrames} (${gr.dropPct}%) on the repeat, against a ${DROP_BAR_PCT}% bar`);
      } else if ((g.dropPct > DROP_BAR_PCT) !== (gr.dropPct > DROP_BAR_PCT)) {
        // One reading is noise here for the same measured reason it is on the gesture legs.
        environment.push(`playback: the two readings disagree on the drop bar (${g.dropPct}% vs ${gr.dropPct}%) — recorded as noise, not scored`);
      }
      if (g.corruptedFrames > 0 || gr.corruptedFrames > 0) {
        findings.push(`playback: the decoder reported ${g.corruptedFrames}/${gr.corruptedFrames} CORRUPTED frames; that is a decode error, not a scheduling loss`);
      }
    } else {
      voided.push('playback: the instrument returned no decoder ledger, so the leg measured nothing about the player');
    }

    const score = voided.length ? 'VOID' : findings.length === 0 ? 10 : 0;
    const out = {
      surface: SURFACE, mode: 'playback', title: spec.title, root: spec.root,
      at: new Date().toISOString(),
      scene: legs.playback.scene_before,
      process: { pid: mem.pid, uptimeSecAtStart: mem.uptimeSec, mainRssMbBefore: mem.rssMb, mainRssMbAfter: memEnd.rssMb, mainHeapUsedMbAfter: memEnd.heapUsedMb },
      sessionCeiling: {
        p50: ceilingP50, p95: ceilingP95, runs: legs.ceilingRuns,
        noiseFloorOver100: ceilingOver100, noiseFloorMaxMs: ceilingMaxMs, l0P50: L0.ceilingP50,
      },
      player: g ? {
        source: g.source, intrinsic: g.intrinsic, box: g.box, playbackRate: g.playbackRate,
        spanMs: g.spanMs, advancedSec: g.advancedSec,
        decodedFrames: g.decodedFrames, droppedFrames: g.droppedFrames, corruptedFrames: g.corruptedFrames,
        decodedFps: g.decodedFps, dropPct: g.dropPct,
        repeat: gr ? { decodedFrames: gr.decodedFrames, droppedFrames: gr.droppedFrames, decodedFps: gr.decodedFps, dropPct: gr.dropPct, advancedSec: gr.advancedSec } : null,
        dropBarPct: DROP_BAR_PCT,
      } : null,
      renderer: {
        p50: legs.playback.frame_p50_ms, p95: legs.playback.frame_p95_ms, max: legs.playback.frame_max_ms,
        over100: legs.playback.frames_over_100, frames: legs.playback.frames,
        repeat: { p50: legs.playbackRepeat.frame_p50_ms, p95: legs.playbackRepeat.frame_p95_ms, over100: legs.playbackRepeat.frames_over_100 },
        jankControl: { p50: legs.playbackJank.frame_p50_ms, p95: legs.playbackJank.frame_p95_ms, over100: legs.playbackJank.frames_over_100, blocks: legs.playbackJank.jank_blocks },
      },
      legs, findings, voided, environment, score,
    };
    console.log(JSON.stringify(out, null, 2));
    const file = arg('out', path.join('src/.coordination/liquid-workplace/baselines', `cat7-${SURFACE}-playback.json`));
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
    console.log('wrote', file);
    console.log(`\nPLAYER FRAME STABILITY — ${SURFACE}: ${score === 10 ? 'PASS 10/10' : score === 'VOID' ? 'VOID' : `${findings.length} finding(s), NOT a 10`}`);
    for (const f of findings) console.log(`  FINDING  ${f}`);
    for (const v of voided) console.log(`  VOID     ${v}`);
    for (const e of environment) console.log(`  ENV      ${e}`);
    return;
  }

  // A bare compositor is not the control for theme switching on a multi-window desk: every
  // other open app still repaints. Measure that shared cost with only this surface's root hidden,
  // then restore its exact inline style before scoring the real surface. Without this leg a
  // single global theme frame is blamed on each surface independently.
  step('theme CONTROL (target root hidden)');
  const hiddenRoot = JSON.parse(await ev(`(() => {
    const root = document.querySelector(${JSON.stringify(spec.root)});
    if (!root) return JSON.stringify({ refused: 'missing root' });
    const beforeStyle = root.getAttribute('style');
    root.style.visibility = 'hidden';
    return JSON.stringify({ beforeStyle, hidden: getComputedStyle(root).visibility === 'hidden' });
  })()`));
  if (hiddenRoot.refused || !hiddenRoot.hidden) {
    voidedEarly.push(`theme control could not hide ${spec.root}: ${JSON.stringify(hiddenRoot)}`);
  } else {
    try {
      const runs = [
        ps(IPROBE, ['-Interaction', 'theme', ...interactionScope, '-AsJson']),
        ps(IPROBE, ['-Interaction', 'theme', ...interactionScope, '-AsJson']),
      ];
      legs.themeControlRuns = runs.map((r) => ({
        p50: r.frame_p50_ms, p95: r.frame_p95_ms, max: r.frame_max_ms,
        over100: r.frames_over_100, mainMax: r.main_max_ms,
      }));
    } finally {
      const restored = JSON.parse(await ev(`(() => {
        const root = document.querySelector(${JSON.stringify(spec.root)});
        if (!root) return JSON.stringify({ refused: 'root vanished' });
        const beforeStyle = ${JSON.stringify(hiddenRoot.beforeStyle)};
        if (beforeStyle === null) root.removeAttribute('style');
        else root.setAttribute('style', beforeStyle);
        return JSON.stringify({ style: root.getAttribute('style') });
      })()`));
      if (restored.refused || restored.style !== hiddenRoot.beforeStyle) {
        voidedEarly.push(`theme control did not exactly restore ${spec.root}: ${JSON.stringify(restored)}`);
      }
    }
  }
  const themeControlP50 = legs.themeControlRuns
    ? Math.min(...legs.themeControlRuns.map((r) => r.p50)) : ceilingP50;
  const themeControlP95 = legs.themeControlRuns
    ? Math.min(...legs.themeControlRuns.map((r) => r.p95)) : ceilingP95;
  const themeControlOver100 = legs.themeControlRuns
    ? Math.max(...legs.themeControlRuns.map((r) => r.over100)) : ceilingOver100;
  const themeControlMaxMs = legs.themeControlRuns
    ? Math.max(...legs.themeControlRuns.map((r) => r.max)) : ceilingMaxMs;

  // --- 2-4. the three gestures, every one scoped to THIS surface's window -----------
  // TWICE, then a third reading to break a tie. If those three disagree, take two final
  // confirmations: the measured ~12% compositor outlier rate makes one stray reading common,
  // while a 3/2 split is still too unstable to score. A single gesture reading is noise: Library's
  // first scored resize came back p95 66.9 / max 200.5 / 3 frames over 100 ms, and SIX
  // consecutive re-runs -- three on the same mount, three on a freshly reopened window -- all
  // returned p95 16.8 / max 17.0 / 0 over 100. Something took the foreground for ~200 ms. The
  // probe's own focus guard only catches a steal that is still in effect when the gesture ends.
  // Reporting that one reading would have filed a phantom Library defect and cost the next
  // worker a turn, which is precisely what the scene trap cost the last one. A breach is a
  // FINDING only when at least four of five readings breach; one dissenting reading is recorded
  // as environmental noise, while two dissenting readings leave the leg UNSTABLE and void.
  const breaches = (gesture, r) => {
    const p50 = gesture === 'theme' ? themeControlP50 : ceilingP50;
    const p95 = gesture === 'theme' ? themeControlP95 : ceilingP95;
    const over100 = gesture === 'theme' ? themeControlOver100 : ceilingOver100;
    return (r.frame_p50_ms > p50 * 1.5) || (r.frame_p95_ms > p95 * 2)
      || r.frames_over_100 > over100 || r.main_max_ms > L0.mainBlockBarMs;
  };
  for (const g of ['drag', 'resize', 'theme']) {
    step(g);
    const runs = [ps(IPROBE, ['-Interaction', g, ...interactionScope, '-AsJson'])];
    step(`${g} (repeat)`);
    runs.push(ps(IPROBE, ['-Interaction', g, ...interactionScope, '-AsJson']));
    if (breaches(g, runs[0]) !== breaches(g, runs[1])) {
      step(`${g} (tie-break)`);
      runs.push(ps(IPROBE, ['-Interaction', g, ...interactionScope, '-AsJson']));
      if (runs.some((r) => breaches(g, r)) && runs.some((r) => !breaches(g, r))) {
        step(`${g} (confirmation 1/2)`);
        runs.push(ps(IPROBE, ['-Interaction', g, ...interactionScope, '-AsJson']));
        step(`${g} (confirmation 2/2)`);
        runs.push(ps(IPROBE, ['-Interaction', g, ...interactionScope, '-AsJson']));
      }
    }
    const bad = runs.filter((r) => breaches(g, r)).length;
    // Score the reading the majority agrees with, so the reported numbers are a real run and
    // never an average of runs that disagree.
    legs[g] = runs.find((r) => breaches(g, r) === (bad * 2 > runs.length)) || runs[0];
    legs[g].repeats = runs.map((r) => ({ p50: r.frame_p50_ms, p95: r.frame_p95_ms, max: r.frame_max_ms, over100: r.frames_over_100, mainMax: r.main_max_ms, breached: breaches(g, r) }));
    legs[g].unstable = Math.min(bad, runs.length - bad) > 1;
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
  } else {
    // "No proof, no claim — the leg is VOID, never a 10" was written directly above and then
    // applied only to specs that had opted IN, which is the opposite of what it says: a spec
    // that declared no proof got the free pass, and a spec that wrote one got audited. 18 of
    // the 21 specs with a heavy leg already declare `proof`; enforcing the rule as written
    // VOIDs the remaining ones until theirs is written, which is the honest state, not a
    // regression. Named rather than silently exempted.
    voidedEarly.push(`heavy leg declares no proof, so "${spec.heavy.label}" cannot be told apart from an expression that refused: no proof, no claim`);
  }
  // Idle, taken AFTER the load, is what makes the heavy number mean something.
  step('idle');
  legs.idle = ps(PPROBE, ['-Samples', '40', '-DurationMs', String(spec.heavy.durationMs), '-Label', `${SURFACE}: idle`, '-AsJson']);

  // --- 6. the sensitivity control, when asked for -----------------------------------
  // `--under-load` implies it: a clean reading taken under load is only readable next to a
  // control that demonstrably makes the same recorder look worse.
  const wantJank = has('jank') || UNDER_LOAD;
  if (wantJank) step('drag CONTROL (-Jank)');
  if (wantJank) legs.dragJank = ps(IPROBE, ['-Interaction', 'drag', ...interactionScope, '-Jank', '-AsJson']);

  // --- 6b. THE BULLET'S OWN QUESTION: the gestures WHILE the surface's real work runs ------
  // Extra legs, never a replacement for 2-4: the idle readings taken minutes ago in this same
  // session, against this same ceiling, are the control this comparison needs.
  if (UNDER_LOAD) {
    legs.underLoad = {};
    for (const g of ['drag', 'resize']) {
      step(`${g} UNDER LOAD (${spec.heavy.label})`);
      // The gesture's own duration is not exposed, so the deadline covers the slowest observed
      // reading with room to spare; the loop stops itself either way.
      await ev(LOAD_ARM(spec.heavy.js, 120000, spec.heavy.durationMs));
      const armed = JSON.parse(await ev(LOAD_READ));
      const workBefore = spec.heavy.progress ? Number(await ev(spec.heavy.progress)) : null;
      let reading;
      let after;
      let workAfter = null;
      try {
        reading = ps(IPROBE, ['-Interaction', g, ...interactionScope, '-AsJson']);
      } finally {
        after = JSON.parse(await ev(LOAD_READ));
        if (spec.heavy.progress) workAfter = Number(await ev(spec.heavy.progress));
        await ev(LOAD_STOP);
      }
      const cyclesDuring = after.cycles - armed.cycles;
      // Where the spec declares real work, that is the receipt; the arm count is kept beside it
      // as provenance rather than dropped, because a disagreement between the two is itself
      // diagnostic (arms advancing while work does not = the load is re-arming over itself).
      const workDuring = spec.heavy.progress && workBefore >= 0 && workAfter >= 0 ? workAfter - workBefore : null;
      legs.underLoad[g] = {
        p50: reading.frame_p50_ms,
        p95: reading.frame_p95_ms,
        max: reading.frame_max_ms,
        over100: reading.frames_over_100,
        mainMax: reading.main_max_ms,
        sceneStable: reading.scene_stable,
        // The two halves the under-load scene test actually needs, recorded rather than
        // collapsed into one boolean: windows opening/closing would make the frames
        // incomparable, content drift inside the loaded surface is the load doing its job.
        sceneFwinsBefore: reading.scene_before ? reading.scene_before.fwins : null,
        sceneFwinsAfter: reading.scene_after ? reading.scene_after.fwins : null,
        sceneElementsBefore: reading.scene_before ? reading.scene_before.fwinElements : null,
        sceneElementsAfter: reading.scene_after ? reading.scene_after.fwinElements : null,
        closedLoop: reading.gesture ? reading.gesture.closedLoop === true : false,
        // `armed` and `after` raw, not only their difference: a leg that voids on
        // `cyclesDuring` is otherwise indistinguishable between "the load stopped early" and
        // "the record was never there", and that ambiguity cost a diagnosis once already.
        load: {
          label: spec.heavy.label, cyclesDuring, workDuring, workBefore, workAfter,
          refusals: after.refusals, last: after.last, armed, after,
        },
      };
    }
    // Restore whatever the load disturbed, through the load's own receipt, before the surface is
    // handed back. `scrollAll` returns its scroller to the offset it started on; anything that
    // refused is reported rather than assumed harmless.
    // `heavy.proof` is calibrated to the heavy leg's full span (dictionary: 28 searches over
    // 20 s). Two ~1.8 s gestures cannot reach that bar, so reusing it verbatim REFUSED on a
    // load that was working perfectly — the third of correction 33's three false voids. A spec
    // may declare `loadProof` for this context; it must keep every check that is about
    // CORRECTNESS (dictionary: armed at all, and results actually rendered — the mojibake
    // guard) and re-scale only the ones that are about DURATION.
    legs.underLoadProof = spec.heavy.loadProof || spec.heavy.proof
      ? await ev(spec.heavy.loadProof || spec.heavy.proof)
      : null;
  }

  const memAfter = await get('/mem');

  // ---------------------------------------------------------------- scoring
  // Frames are scored against THIS session's ceiling, never against L0's milliseconds.
  const findings = [];
  const voided = [...voidedEarly];
  const environment = [];
  for (const g of ['drag', 'resize', 'theme']) {
    const r = legs[g];
    const controlP50 = g === 'theme' ? themeControlP50 : ceilingP50;
    const controlP95 = g === 'theme' ? themeControlP95 : ceilingP95;
    const controlOver100 = g === 'theme' ? themeControlOver100 : ceilingOver100;
    const controlMaxMs = g === 'theme' ? themeControlMaxMs : ceilingMaxMs;
    if (!r.scene_stable) { voided.push(`${g}: the scene moved during the gesture (${r.scene_before.fwins}/${r.scene_before.fwinElements} -> ${r.scene_after.fwins}/${r.scene_after.fwinElements})`); continue; }
    if (r.stale_recorder) voided.push(`${g}: a stale frame recorder was found and disarmed; re-run to be sure`);
    if (r.frame_p50_ms > controlP50 * 1.5) findings.push(`${g}: p50 ${r.frame_p50_ms} ms against a ${controlP50} ms control`);
    if (r.frame_p95_ms > controlP95 * 2) findings.push(`${g}: p95 ${r.frame_p95_ms} ms against a ${controlP95} ms control`);
    if (r.frames_over_100 > controlOver100) findings.push(`${g}: ${r.frames_over_100} frames over 100 ms, against a control that produced ${controlOver100}`);
    // Reported, never scored. A frame longer than anything the bare compositor managed is worth
    // a reader's eye, but the control above shows the machine makes them unprompted, so it is
    // not evidence about the surface.
    if (r.frame_max_ms > Math.max(controlMaxMs, 100)) {
      environment.push(`${g}: longest frame ${r.frame_max_ms} ms against a control max of ${controlMaxMs} ms — recorded, not scored`);
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
  // The under-load legs are scored against the SAME session ceiling as their idle counterparts,
  // so the only difference between the two readings is the load.
  if (UNDER_LOAD && legs.underLoad) {
    for (const g of ['drag', 'resize']) {
      const r = legs.underLoad[g];
      if (!r) continue;
      const idle = legs[g];
      r.idle = idle ? { p50: idle.frame_p50_ms, p95: idle.frame_p95_ms, over100: idle.frames_over_100 } : null;
      // Scene stability, under load, is NOT the idle test (correction 33). The idle legs void
      // when the document's element count moves, and that is right for them. Here the load's
      // whole purpose is to change the surface — the dictionary rewrites its results list on
      // every search — so the idle test can only ever fail, the same unsatisfiable-by-
      // construction shape as the arm counter above. What must still hold is everything that
      // would make the FRAMES incomparable: no window opened or closed, and the dragged window
      // ended where it started. Content drift inside the loaded surface is recorded as data.
      const fwinsMoved = r.sceneFwinsBefore !== r.sceneFwinsAfter;
      if (fwinsMoved || !r.closedLoop) {
        voided.push(`${g} under load: the scene moved during the gesture (windows ${r.sceneFwinsBefore} -> ${r.sceneFwinsAfter}, closed loop ${r.closedLoop})`);
        continue;
      }
      // Refusal 2 of this mode: a load that was over before the frames were recorded turns the
      // whole leg back into the idle measurement it was supposed to differ from. Where the spec
      // declares `progress` this asks for real work, not arms — see correction 33.
      const receipt = r.load.workDuring === null ? r.load.cyclesDuring : r.load.workDuring;
      const receiptKind = r.load.workDuring === null ? 'cycle(s)' : 'unit(s) of real work';
      if (!(receipt >= 2)) {
        voided.push(`${g} under load: the load completed only ${receipt} ${receiptKind} across the gesture (${r.load.refusals} refusals, last: ${JSON.stringify(r.load.last)}), so these frames were not recorded under load`);
        continue;
      }
      if (r.p50 > ceilingP50 * 1.5) findings.push(`${g} under load (${r.load.label}): p50 ${r.p50} ms against a ${ceilingP50} ms control (idle was ${r.idle ? r.idle.p50 : '?'} ms)`);
      if (r.p95 > ceilingP95 * 2) findings.push(`${g} under load (${r.load.label}): p95 ${r.p95} ms against a ${ceilingP95} ms control (idle was ${r.idle ? r.idle.p95 : '?'} ms)`);
      if (r.over100 > ceilingOver100) findings.push(`${g} under load (${r.load.label}): ${r.over100} frames over 100 ms, against a control that produced ${ceilingOver100}`);
      if (r.mainMax > L0.mainBlockBarMs) findings.push(`${g} under load (${r.load.label}): main blocked ${r.mainMax} ms, over the ${L0.mainBlockBarMs} ms bar`);
    }
    if (legs.underLoadProof && /^REFUSE/.test(String(legs.underLoadProof))) {
      voided.push(`under-load legs left no valid receipt: ${legs.underLoadProof}`);
    }
  }
  if (wantJank && legs.dragJank && legs.dragJank.frames_over_100 <= (legs.drag.frames_over_100 || 0)) {
    voided.push(`CONTROL DID NOT FAIL: -Jank produced ${legs.dragJank.frames_over_100} frames over 100 ms against the clean run's ${legs.drag.frames_over_100}. The recorder is not seeing the frames it claims to and every number here is void.`);
  }

  // A spec that admits it covers only part of its surface cannot score 10, however clean the
  // numbers are. Silently scoring the reachable half is exactly the flattering-number failure
  // the pin forbids.
  if (spec.partial) voided.push(`PARTIAL SURFACE: ${spec.partial}`);
  const score = voided.length ? 'VOID' : findings.length === 0 ? 10 : 0;
  // Correction 31 (shared with the cat2 harness, where it was measured). React StrictMode
  // double-invokes every render IN DEVELOPMENT ONLY and this harness only ever drives a dev
  // build, so every frame/latency figure here carries a tax production strips. Wired Start
  // menu, same task and same open tree: worstRecv 118.1 ms with StrictMode on, 52.3 ms off,
  // against a 100 ms bar. Stamped rather than corrected here, because this category's own
  // numbers are frame-time under load and nobody has yet re-derived the tax for THAT leg -
  // do not assume the 2.3x from cat2 transfers. `src/renderer/strictRoot.tsx` reads the flag.
  const strictOff = (await ev("String(localStorage.getItem('jp-lq-strict'))")) === 'off';

  const out = {
    surface: SURFACE, title: spec.title, root: spec.root,
    at: new Date().toISOString(),
    strictMode: strictOff
      ? 'off - dev double-render removed; see correction 31'
      : 'on - figures carry the dev double-render tax; see correction 31',
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
