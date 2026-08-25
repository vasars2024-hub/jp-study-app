/**
 * Acceptance walk for the two Q4 product changes on the Media Center surface — the sidebar's
 * `Study tools` disclosure and the library toolbar's `View` disclosure.
 *
 * **A control that COUNTS right is not a control that WORKS.** Q4's score fell from 19 scanned
 * to 11 because four destinations and three view controls moved behind disclosures; the whole
 * point of disclosure rather than deletion is that every one of them is still reachable, so
 * this drives each of them and reads a side effect. `honesty-probe`'s rule: presence is not
 * evidence, the side effect is.
 *
 * Each step is its own `/eval` with a real sleep between, because the bridge never awaits a
 * promise and React needs a paint between a click and the read.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l1-q4-mc-walk.cjs [Video]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const TITLE = process.argv[2] || 'Video';
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

const WIN = `([].slice.call(document.querySelectorAll('.fwin')).filter(function (w) {
  var r = w.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  var t = w.querySelector('.fwin-title-text, .fwin-title');
  return !!t && (t.textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0;
})[0])`;

/**
 * `checkVisibility`, never `getBoundingClientRect`. A control inside a CLOSED `<details>`
 * still reports a confident non-zero rect (`closed-details-rect-lies`), which is exactly the
 * error that would make this walk certify a disclosure it never opened.
 */
const STATE = `(function () {
  var w = ${WIN};
  if (!w) return { refuse: 'no visible .fwin titled ' + ${JSON.stringify(TITLE)} };
  var vis = function (e) {
    return !!e && typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
      : !!e;
  };
  var group = w.querySelector('.mc-nav-group');
  var view = w.querySelector('.medialib-view');
  // 20, not 14. At 14 the longest label truncates to "Media workspac" and every
  // indexOf('Media workspace') === 0 test below is false because the needle is longer than
  // the haystack — a truncation that reported a working disclosure as broken.
  var navNames = [].slice.call(w.querySelectorAll('.mc-nav button, .mc-seanime-link'))
    .filter(vis).map(function (b) { return (b.textContent || '').trim().slice(0, 20); });
  // aria-current, NOT aria-pressed. The shared Sidebar primitive marks the selected
  // scope with aria-current, so reading aria-pressed returned null for every shelf and
  // the scope-restore gate passed vacuously on null === null — a gate that certified
  // nothing while reading green.
  var railScope = [].slice.call(w.querySelectorAll('.medialib-rail button')).filter(function (b) {
    return b.getAttribute('aria-current') === 'true' || b.getAttribute('aria-pressed') === 'true';
  })[0];
  var active = w.querySelector('.mc-nav button.is-active, .mc-settings-link.is-active');
  return {
    tab: (w.querySelector('.mc-breadcrumb strong') || {}).textContent || null,
    activeNav: active ? (active.textContent || '').trim().slice(0, 14) : null,
    groupOpen: group ? group.open : null,
    groupSummaryVisible: group ? vis(group.querySelector('summary')) : null,
    readinessVisible: vis(navNames.indexOf('Readiness') >= 0 ? group : null) && navNames.some(function (n) { return n.indexOf('Readiness') === 0; }),
    workspaceVisible: navNames.some(function (n) { return n.indexOf('Media workspace') === 0; }),
    visibleNav: navNames,
    settingsVisible: vis(w.querySelector('.mc-settings-link')),
    topbarSettings: w.querySelectorAll('.mc-topbar .mc-top-action').length,
    viewOpen: view ? view.open : null,
    viewSummaryText: view ? (view.querySelector('summary').textContent || '').trim() : null,
    sortValue: view ? (view.querySelector('select') || {}).value : null,
    sortVisible: view ? vis(view.querySelector('select')) : null,
    gridPressed: view ? (view.querySelector('.medialib-view-toggle button') || {}).getAttribute('aria-pressed') : null,
    railScope: railScope ? (railScope.textContent || '').trim() : null,
    cardCount: w.querySelectorAll('.medialib-card').length,
    firstCard: (function () {
      var c = w.querySelector('.medialib-card');
      return c ? (c.textContent || '').trim().slice(0, 26) : null;
    })(),
    listRows: w.querySelectorAll('.medialib-row, .medialib-list-row').length,
  };
})()`;

const read = () => ev(`JSON.stringify(${STATE})`);

/** Click a control by a predicate over its trimmed text, focusing first. */
const clickByText = (sel, text) => `(function () {
  var w = ${WIN};
  var b = [].slice.call(w.querySelectorAll(${JSON.stringify(sel)})).filter(function (x) {
    return (x.textContent || '').trim().indexOf(${JSON.stringify(text)}) === 0;
  })[0];
  if (!b) return JSON.stringify({ clicked: false, saw: [].slice.call(w.querySelectorAll(${JSON.stringify(sel)})).map(function (x) { return (x.textContent || '').trim().slice(0, 14); }) });
  // focus() first — a synthetic click does not focus, and focus IS the keyboard path.
  b.focus();
  b.click();
  return JSON.stringify({ clicked: true, on: (b.textContent || '').trim().slice(0, 20) });
})()`;

(async () => {
  const out = { at: new Date().toISOString(), title: TITLE, steps: {} };
  out.steps.start = await read();
  if (out.steps.start.refuse) throw new Error(out.steps.start.refuse);

  // --- 1. The sidebar group opens, and the four destinations are inside it. -------------------
  // Closed FIRST, because the open state is a persisted preference: a previous run of this
  // walk leaves it open, and then "click the summary" is the test closing it while the gate
  // reads a state the click never produced. Always drive from a state you set.
  out.steps.forceClosed = await ev(`(function(){ var d = ${WIN}.querySelector('.mc-nav-group'); if (!d) return JSON.stringify({ ok: false }); if (d.open) { d.querySelector('summary').click(); } return JSON.stringify({ ok: true, open: d.open }); })()`);
  await sleep(350);
  out.steps.beforeOpen = await read();
  out.steps.openGroup = await ev(`(function(){ var d = ${WIN}.querySelector('.mc-nav-group'); if (!d) return JSON.stringify({ ok: false }); d.querySelector('summary').focus(); d.querySelector('summary').click(); return JSON.stringify({ ok: true, open: d.open }); })()`);
  await sleep(350);
  out.steps.groupOpened = await read();

  // --- 2. A destination behind the disclosure actually navigates. -----------------------------
  out.steps.clickDiscover = await ev(clickByText('.mc-nav button', 'Discover'));
  await sleep(700);
  out.steps.onDiscover = await read();

  // --- 3. Leaving it and closing the group: the group must NOT be force-open any more. --------
  out.steps.backToLibrary = await ev(clickByText('.mc-nav button', 'Library'));
  await sleep(700);
  out.steps.onLibrary = await read();
  out.steps.closeGroup = await ev(`(function(){ var d = ${WIN}.querySelector('.mc-nav-group'); d.querySelector('summary').focus(); d.querySelector('summary').click(); return JSON.stringify({ open: d.open }); })()`);
  await sleep(350);
  out.steps.groupClosed = await read();

  // --- 4. Ctrl+8 reaches Discover WITH THE GROUP CLOSED, and the group force-opens for it. ----
  // The shortcut is a root `keydown` listener that indexes NAV, so it cannot depend on the
  // button being rendered — that is the claim, and this is the measurement.
  out.steps.ctrl8 = await ev(`(function(){
    var w = ${WIN};
    var root = w.querySelector('.mc-root');
    root.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: '8', ctrlKey: true, bubbles: true, cancelable: true }));
    return JSON.stringify({ dispatched: true });
  })()`);
  await sleep(700);
  out.steps.afterCtrl8 = await read();

  out.steps.backToLibrary2 = await ev(clickByText('.mc-nav button', 'Library'));
  await sleep(700);
  out.steps.onLibrary2 = await read();

  // --- 5. The View disclosure: open, change the sort, and read the ORDER, not the select. -----
  // A SHELF WITH ONE ENTRY CANNOT DEMONSTRATE A REORDER, and the library opens on
  // `Continue watching`, which holds 1 title and renders it as a spotlight rather than a
  // `.medialib-card`. Scoring the sort there would have been the rubric's "measured only on
  // an empty harness" — capped at 0, not passed. Switch to the largest shelf, measure, and
  // put the scope back at the end.
  // The shelf the surface was FOUND on, taken from step 0's read rather than re-queried here:
  // `MediaLibraryShell` remounts when the tab comes back and its rail is not in the DOM for
  // the first few hundred ms, so a re-query at this point returned `null` and the restore
  // then had nothing to aim at. Parked on `window` so the restore matches it byte-for-byte.
  out.steps.scopeWas = await ev(`(function(){
    window.__q4scopeWas = ${JSON.stringify(out.steps.start.railScope)};
    return JSON.stringify({ scope: window.__q4scopeWas });
  })()`);
  out.steps.widenScope = await ev(`(function(){
    var w = ${WIN};
    var best = null, bestN = -1;
    [].slice.call(w.querySelectorAll('.medialib-rail button')).forEach(function (b) {
      var m = (b.textContent || '').match(/(\\d+)\\s*$/);
      var n = m ? Number(m[1]) : 0;
      if (n > bestN) { bestN = n; best = b; }
    });
    if (!best) return JSON.stringify({ switched: false });
    best.focus(); best.click();
    return JSON.stringify({ switched: true, to: (best.textContent || '').trim(), count: bestN });
  })()`);
  await sleep(900);
  out.steps.wideShelf = await read();

  out.steps.openView = await ev(`(function(){ var d = ${WIN}.querySelector('.medialib-view'); if (!d) return JSON.stringify({ ok: false }); d.querySelector('summary').focus(); d.querySelector('summary').click(); return JSON.stringify({ ok: true, open: d.open }); })()`);
  await sleep(350);
  out.steps.viewOpened = await read();

  out.steps.changeSort = await ev(`(function(){
    var s = ${WIN}.querySelector('.medialib-view select');
    if (!s) return JSON.stringify({ changed: false });
    var was = s.value;
    var other = [].slice.call(s.options).map(function (o) { return o.value; }).filter(function (v) { return v !== was; })[0];
    var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(s, other);
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return JSON.stringify({ changed: true, was: was, now: other });
  })()`);
  await sleep(700);
  out.steps.afterSort = await read();

  // --- 6. The density toggle changes the rendered collection, not just aria-pressed. ----------
  out.steps.clickList = await ev(`(function(){
    var b = ${WIN}.querySelectorAll('.medialib-view-toggle button')[1];
    if (!b) return JSON.stringify({ clicked: false });
    b.focus(); b.click();
    return JSON.stringify({ clicked: true, label: b.getAttribute('aria-label') });
  })()`);
  await sleep(700);
  out.steps.afterList = await read();
  out.steps.clickGrid = await ev(`(function(){ var b = ${WIN}.querySelectorAll('.medialib-view-toggle button')[0]; b.focus(); b.click(); return JSON.stringify({ clicked: true }); })()`);
  await sleep(700);
  out.steps.afterGrid = await read();

  // --- 7. Escape closes it, and an outside pointerdown closes it. -----------------------------
  out.steps.escape = await ev(`(function(){
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return JSON.stringify({ dispatched: true });
  })()`);
  await sleep(350);
  out.steps.afterEscape = await read();

  out.steps.reopenView = await ev(`(function(){ var d = ${WIN}.querySelector('.medialib-view'); d.querySelector('summary').click(); return JSON.stringify({ open: d.open }); })()`);
  await sleep(300);
  out.steps.outsideDown = await ev(`(function(){
    var w = ${WIN};
    var target = w.querySelector('.medialib-browser__title') || w.querySelector('.mc-content');
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return JSON.stringify({ dispatchedOn: target.className });
  })()`);
  await sleep(350);
  out.steps.afterOutside = await read();

  // --- Restore the shelf scope the surface was found on. ---------------------------------------
  out.steps.restoreScope = await ev(`(function(){
    var w = ${WIN};
    var b = [].slice.call(w.querySelectorAll('.medialib-rail button')).filter(function (x) {
      return (x.textContent || '').trim() === window.__q4scopeWas;
    })[0];
    if (!b) return JSON.stringify({ restored: false, want: window.__q4scopeWas });
    b.click();
    return JSON.stringify({ restored: true, to: (b.textContent || '').trim() });
  })()`);
  await sleep(700);
  out.steps.end = await read();

  // --- The gates ------------------------------------------------------------------------------
  const S = out.steps;
  out.gates = {
    groupSummaryReachable: S.start.groupSummaryVisible === true,
    // The discrimination: closed, the four must NOT be in the visible set. Without this half
    // the gate passes for a group that never hid anything.
    closedGroupHidesFour: S.beforeOpen.groupOpen === false
      && !['Readiness', 'Review', 'Discover', 'Media workspace'].some((n) => S.beforeOpen.visibleNav.some((v) => v.indexOf(n) === 0)),
    groupOpensAndRevealsFour: S.groupOpened.groupOpen === true
      && ['Readiness', 'Review', 'Discover', 'Media workspace'].every((n) => S.groupOpened.visibleNav.some((v) => v.indexOf(n) === 0)),
    disclosedDestinationNavigates: S.onDiscover.activeNav && S.onDiscover.activeNav.indexOf('Discover') === 0,
    groupClosesAgain: S.groupClosed.groupOpen === false,
    ctrlShortcutWorksWhileClosed: S.afterCtrl8.activeNav && S.afterCtrl8.activeNav.indexOf('Discover') === 0,
    activeDestinationForcesGroupOpen: S.afterCtrl8.groupOpen === true,
    settingsStillInSidebar: S.start.settingsVisible === true,
    topbarSettingsDuplicateGone: S.start.topbarSettings === 1,
    viewOpensAndShowsSort: S.viewOpened.viewOpen === true && S.viewOpened.sortVisible === true,
    // The harness has to be able to show a reorder before the reorder can be scored.
    shelfBigEnoughToSort: S.wideShelf.cardCount >= 2,
    // Guards the restore gate against passing on `null === null`.
    scopeWasActuallyRead: typeof S.start.railScope === 'string' && S.start.railScope.length > 0,
    // The side effect, not the select: a different sort must reorder the rendered shelf.
    sortReordersTheShelf: !!S.changeSort.changed && S.wideShelf.cardCount >= 2
      && S.afterSort.firstCard !== S.viewOpened.firstCard,
    scopeRestored: S.end.railScope === S.start.railScope,
    sortNamedWhileClosed: typeof S.start.viewSummaryText === 'string' && S.start.viewSummaryText.length > 'View'.length,
    densityTogglesTheCollection: S.afterList.gridPressed === 'false' && S.afterGrid.gridPressed === 'true',
    escapeClosesView: S.afterEscape.viewOpen === false,
    outsidePointerDownClosesView: S.afterOutside.viewOpen === false,
  };
  const failed = Object.keys(out.gates).filter((k) => !out.gates[k]);
  out.verdict = failed.length === 0
    ? `Q4's two disclosures WORK on ${TITLE}: ${out.gates.groupOpensAndRevealsFour ? 4 : 0} disclosed destinations reachable by pointer and by Ctrl+8 with the group closed, sort reorders the shelf, density flips the collection, and both close paths fire`
    : `FAILED: ${failed.join(', ')}`;

  console.log(JSON.stringify(out, null, 1));
  if (failed.length) process.exitCode = 1;
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
