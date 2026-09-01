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
      label: 'cycle the inspector disclosure across the recent-media shelf',
      durationMs: 3000,
      js: `(() => {
        delete window.__lqVideoLoad;
        const det = document.querySelector('.mc-video-page details.mc-inspector-advanced');
        if (!det) return 'REFUSE: no advanced inspector disclosure on the Video page';
        const shelf = [].slice.call(document.querySelectorAll('.mc-video-page .mc-video-empty'))
          .filter((e) => e.scrollHeight - e.clientHeight > 20)
          .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
        if (!shelf) return 'REFUSE: the Up Next shelf has no scrollable overflow to sweep';
        const openStart = det.open;
        const scrollStart = shelf.scrollTop;
        const rec = {
          openStart, scrollStart, ticks: 0, opens: 0, closes: 0,
          overflow: shelf.scrollHeight - shelf.clientHeight,
          tiles: document.querySelectorAll('.mc-video-page .mc-media-tile').length,
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
        return 'cycling the disclosure over ' + rec.overflow + ' px of shelf';
      })()`,
      proof: `(() => {
        const r = window.__lqVideoLoad;
        if (!r) return 'REFUSE: Video load never armed';
        if (r.ticks < 40 || r.opens < 15 || r.closes < 15) return 'REFUSE: incomplete Video cycle ' + JSON.stringify(r);
        if (r.maxScroll < r.overflow * 0.8) return 'REFUSE: the shelf never swept its overflow ' + JSON.stringify(r);
        if (!r.restored) return 'REFUSE: Video did not restore open=' + r.openStart + ' scrollTop=' + r.scrollStart;
        return 'cycled ' + r.ticks + ' disclosures (' + r.opens + ' open / ' + r.closes + ' closed) over ' + r.tiles
          + ' tiles and ' + r.overflow + ' px, restored';
      })()`,
    },
    collection: { container: '.mc-up-next', row: '.mc-media-tile' },
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
       * Scraper the whole MAL/source console. 19 pages twice is 38 mounts, the heaviest
       * real work this surface performs without touching the network or user data.
       *
       * The page is persisted state, so the load restores the page it started on and the
       * proof REFUSES unless the rail came back to it.
       */
      label: 'navigate every settings page, twice',
      // 38 ticks at 110 ms is ~4.2 s plus a 200 ms settle for the restore check.
      durationMs: 5000,
      js: `(() => {
        delete window.__lqSettingsLoad;
        const rail = document.querySelector('nav.os-set-nav-v2');
        if (!rail) return 'REFUSE: no settings rail';
        const btns = Array.from(rail.querySelectorAll('.os-set-nav-item'));
        if (btns.length < 10) return 'REFUSE: expected the full rail, found ' + btns.length + ' pages';
        const label = (b) => { const s = b.querySelector('span:not([class])'); return ((s && s.textContent) || '').trim(); };
        const activeIndex = btns.findIndex((b) => b.getAttribute('aria-current') === 'page');
        const startIndex = activeIndex < 0 ? 0 : activeIndex;
        const rec = { pages: btns.length, start: label(btns[startIndex]), ticks: 0, restored: false };
        window.__lqSettingsLoad = rec;
        const total = btns.length * 2;
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
        }, 110);
        return 'cycling ' + btns.length + ' pages twice from ' + rec.start;
      })()`,
      proof: `(() => {
        const r = window.__lqSettingsLoad;
        if (!r) return 'REFUSE: the load never armed';
        if (r.ticks < r.pages * 2) return 'REFUSE: only ' + r.ticks + ' of ' + (r.pages * 2) + ' navigations ran';
        if (!r.restored) return 'REFUSE: the rail did not return to ' + r.start;
        return r.pages + ' pages x2 = ' + r.ticks + ' navigations, restored to ' + r.start;
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
      label: '126 cold lookups',
      durationMs: 20000,
      // L0's own reference load, kept verbatim so this runner reproduces the baseline row
      // rather than inventing a second, incomparable one.
      js: `(() => { const w = ['走る','泳ぐ','登る','降りる','渡る','曲がる','進む','戻る','届く','届ける','預ける','借りる','貸す','返す','払う','売る','買う','配る','集める','並ぶ','並べる']; const suf = ['','が','を','に','で','は']; for (const s of suf) { for (const x of w) { window.api.lookupTerm(x + s).catch(() => {}); } } return 'fired ' + (w.length * suf.length); })()`,
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
const spec = SPECS[SURFACE];
if (!spec) {
  console.error(`REFUSE - --surface must be one of: ${Object.keys(SPECS).join(', ')}`);
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
  if (has('jank') && legs.dragJank && legs.dragJank.frames_over_100 <= (legs.drag.frames_over_100 || 0)) {
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
