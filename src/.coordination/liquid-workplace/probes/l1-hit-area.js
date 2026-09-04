/**
 * L1/L5 instrument — rubric category 1's hit-target number, measured as a POINTER measures it.
 *
 * `l1-accessibility.js` reports `getBoundingClientRect()`, which is the right number for layout
 * and the WRONG one for "hit target": a control can own 32px of pointer area while rendering an
 * 18px glyph. Reading the rect is what made category 1 look unfixable without inflating compact
 * chrome, which `css-measure` §2 records as damage rather than repair (a raw size rule generated
 * 98 false failures suite-wide). Both numbers are real; this file measures the other one.
 *
 * THE METHOD, and the first version of this probe got it wrong in a way worth recording. It
 * hit-tested the four CORNERS of the required `max(w,32) x max(h,32)` area, and reported 30 of
 * 66 failing — because an absolutely positioned overlay's containing block is its parent's
 * PADDING box, so on any bordered control the overlay is 2px narrower than the rect the corner
 * was computed from, and the corner lands in the 1px border gutter outside both. That is a
 * measurement artefact, not a defect. This version walks OUTWARD FROM THE CENTRE along +x, -x,
 * +y and -y in 0.5px steps until `document.elementFromPoint` stops resolving to the control or
 * one of its descendants, and reports the width and height of the region actually reached. That
 * is the dimension a user aiming at a control gets, and it is axis-independent, so a wide short
 * button is judged on its height alone.
 *
 * THE GUARD, which is the whole reason to hit-test rather than read a rect: an expanded hit area
 * that reaches over a NEIGHBOUR steals its clicks, and the theft shows up here as the neighbour's
 * walk terminating early — its measured region shrinks below its own rendered rect. `stolen`
 * counts exactly that case and names the thief. A rect-based probe cannot see the regression the
 * fix it is scoring would introduce.
 *
 * REFUSALS, each of which would otherwise read as a pass:
 *   - a 0x0 or minimised window measures as perfect          -> refuse outright;
 *   - a point outside the viewport returns null              -> the walk stops and the control is
 *     `unmeasurable`, never a pass;
 *   - a control occluded at its own centre (under another window, or clipped out of an overflow
 *     region) is not evidence about its hit area             -> `occluded`, counted apart.
 *
 * SCROLL FIRST, AND RAISE FIRST. The Dictionary's results region is 3,194px tall inside an
 * 820x580 window: measured cold, 41 of 66 controls sat outside the viewport and 24 more under a
 * stacked sibling window, and the probe scored ONE control and looked like a clean sweep. Each
 * control is scrolled to the centre of its scroll parent and re-read before it is judged, and the
 * scroll offsets are restored afterwards.
 *
 * AND SCROLL NOTHING ELSE — the defect that made every number this probe has ever printed
 * unreliable, found 2026-08-24 by running it twice on an unchanged surface and getting
 * `belowFloorByHit` 4 then 9, `stolenCount` 2 then 7. `el.scrollIntoView()` scrolls EVERY
 * scrollable ancestor, and `overflow: hidden` does not make an element unscrollable — it only
 * removes the scrollbar. So the first control that needed scrolling also scrolled `section.fwin`
 * itself to `scrollTop: 81`, lifting the window's own title bar out of the viewport; the five
 * `fwin-b` buttons then hit-tested to `null` or terminated early against `div.fwin-bar`, and were
 * counted as failures. The restore missed it twice over: it snapshotted only `win.querySelectorAll`
 * (which excludes `win`) and only elements ALREADY scrolled (`.fwin` started at 0). The leak
 * therefore persisted between runs, so each run measured a different geometry. The 2026-08-18
 * "0 below floor by pointer" and the 2026-08-24 "4 below floor" are BOTH void.
 *
 * This version writes `scrollTop`/`scrollLeft` on the nearest real scroll region only, snapshots
 * every element document-wide, and reports `scrollLeaks`. Two consecutive runs agreeing is the
 * pass condition for the instrument itself, and it is cheap: run it twice, every time.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-hit-area.js`
 */
(() => {
  // Set `window.__lqScoreTitle = 'Video'` before evaluating to score another surface.
  // Dictionary stays the default so every run recorded in L1_ACCESSIBILITY.md reproduces.
  const TITLE = (typeof window !== 'undefined' && window.__lqScoreTitle) || 'Dictionary';
  // A surface that is NOT a floating window — a reader that replaces the desktop shell, a
  // pop-out, Blanc — has no `.fwin` and no title to find, so the title form silently refuses
  // and the category reads as unmeasurable. `__lqScoreRoot` is a CSS selector for exactly
  // those, and it is the same `@`-selector convention the category-4 harness already uses.
  const ROOT_SEL = (typeof window !== 'undefined' && window.__lqScoreRoot) || '';
  const FLOOR = 32;
  const STEP = 0.5;
  const REACH = 26; // px from the centre — enough to prove a 52px region, well past the floor
  const INTERACTIVE =
    'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const win = ROOT_SEL
    ? document.querySelector(ROOT_SEL)
    : [...document.querySelectorAll('.fwin')].find((w) =>
      (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
    );
  if (!win) return JSON.stringify({ refuse: ROOT_SEL ? `no element matching ${ROOT_SEL}` : `no .fwin titled ${TITLE}` });
  const WR = win.getBoundingClientRect();
  if (!WR.width || !WR.height)
    return JSON.stringify({ refuse: 'window is 0x0 (minimised?) — refusing to record zeros' });

  // Reveal one content-visibility:auto record at a time. Preserve the exact style ATTRIBUTE,
  // including the difference between absent and empty; the category driver validates these
  // snapshots again on later renderer tasks before it accepts this probe's numbers.
  const deferredStyles = new Map();
  const painted = (e) =>
    typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
      : true;
  const deferredOwner = (e) => {
    if (painted(e)) return null;
    for (let n = e; n && n !== win.parentElement; n = n.parentElement) {
      if (getComputedStyle(n).contentVisibility === 'auto') return n;
    }
    return null;
  };
  const revealDeferred = (e) => {
    const owner = deferredOwner(e);
    if (!owner) return () => {};
    if (!deferredStyles.has(owner)) deferredStyles.set(owner, { e: owner, style: owner.getAttribute('style') });
    owner.style.setProperty('content-visibility', 'visible');
    owner.getBoundingClientRect();
    return () => {
      const saved = deferredStyles.get(owner).style;
      owner.style.removeProperty('content-visibility');
      if (saved === null) owner.removeAttribute('style');
      else owner.setAttribute('style', saved);
    };
  };

  const label = (e) =>
    !e
      ? 'null'
      : e.tagName.toLowerCase() +
        (typeof e.className === 'string' && e.className.trim()
          ? '.' + e.className.trim().split(/\s+/).join('.')
          : '');

  // DISCLOSE FIRST. A control inside a closed `<details>` still reports a non-zero rect and
  // `visibility: visible` — Chromium hides the content with `content-visibility`, which skips
  // painting and hit-testing but not layout. So it landed in the population, failed every hit
  // test, and was filed as `occluded` "by summary": 10 of 67 controls unscored, and an unscored
  // control is not a passing one. Open every disclosure, measure, then put them all back.
  // Verified safe on this surface: `LexiconCompounds.tsx:62` and its three siblings carry no
  // `onToggle`, and `EntryNote.tsx:176`'s only sets its own `open` state, so the round trip is
  // presentational. Re-check that before reusing this probe on another surface.
  const details = [...win.querySelectorAll('details')].map((d) => ({ d, open: d.open }));
  for (const s of details) s.d.open = true;

  // A DISABLED control is not a pointer target, and filing it as `occluded` is the same false
  // reading as the closed-`<details>` one above. Novels' `.jiten-actions` grid ships two
  // disabled buttons, `.btn:disabled` sets `pointer-events: none`, and `elementFromPoint`
  // therefore returns the CONTAINER at their centres — so both landed in `occluded by
  // div.jiten-actions`, unscored, on a surface that was otherwise clean. That number is the
  // VOID trigger: a form with a dozen disabled controls would void its own measurement while
  // every reachable control passed. Counted separately instead, so they stay visible without
  // being scored against a floor they are exempt from by design. Whether disabling them is
  // HONEST is rubric category 8's question, not this walk's.
  const disabled = [];
  const els = [];
  for (const e of win.querySelectorAll(INTERACTIVE)) {
    const hideAgain = revealDeferred(e);
    try {
      if (!painted(e)) continue;
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0) || getComputedStyle(e).visibility === 'hidden') continue;
      // `aria-disabled` too: a `[role="button"]` cannot carry the DOM property.
      if (e.disabled === true || e.getAttribute('aria-disabled') === 'true') {
        disabled.push({ el: label(e), rect: `${Math.round(r.width)}x${Math.round(r.height)}` });
        continue;
      }
      els.push(e);
    } finally {
      hideAgain();
    }
  }

  // A form control's pointer target is the control PLUS its `<label>`s: clicking a label
  // activates the control it labels, so measuring the 13x13 checkbox glyph alone reports a
  // failure the user cannot experience. Proven live rather than cited — a synthesized click at
  // the far edge of `label.lexicon-notes-scope` (129px from the box, on a `<span>`) flipped
  // `input.checked` false -> true and back, on both scope checkboxes.
  const hostsOf = (el) => (el.labels && el.labels.length ? [el, ...el.labels] : [el]);

  // `null` = off-viewport (unmeasurable), `false` = someone else owns the point.
  const owns = (x, y, el, hosts) => {
    if (x < 0 || y < 0 || x > innerWidth - 1 || y > innerHeight - 1) return null;
    const got = document.elementFromPoint(x, y);
    if (!got) return null;
    return (hosts || hostsOf(el)).some((h) => got === h || h.contains(got)) ? true : got;
  };

  // Walk outward until the control stops owning the point, then REFINE the boundary by
  // bisection. Returns the reach and the blocker.
  //
  // WHY THE REFINEMENT, and it is the difference between three findings and one. A coarse
  // 0.5px walk cannot resolve an edge better than 0.5px, so a control whose true extent is
  // EXACTLY the 32px floor is measured at 31.5 and filed below its own bar. Live on `files`
  // 2026-09-04 that was two of the three remaining rows -- `div.fa-row` (rect 364x32, read
  // 31.5) and `input.fa-bulk-check` (rect 32x32, read 31) -- both flush 32px boxes in a 32px
  // row grid, and neither is reachable-in-31px by any user. `hit-walk-step-caps-at-31-5`
  // records a previous attempt to answer this in CSS by inflating the target: it cost 24
  // STOLEN rows, because a control cannot grow into its neighbour without taking its clicks.
  // The number was the instrument's, so the instrument is where it is repaired.
  //
  // Bisection, not a tolerance. A tolerance would loosen the bar and let a genuinely 31.6px
  // control through; this narrows the uncertainty from +/-STEP to +/-FINE and leaves the bar
  // at 32. The proof that it did not simply widen everything is that `button.fa-cell-size`,
  // whose RECT is 31px, must still fail after it -- see the entry in LIQUID_SCORECARD.md.
  const FINE = 0.05;
  const walk = (cx, cy, dx, dy, el, hosts) => {
    let last = 0;
    let blocker = null;
    for (let d = STEP; d <= REACH; d += STEP) {
      const o = owns(cx + dx * d, cy + dy * d, el, hosts);
      if (o === null) return { reach: last, blocker: 'viewport', capped: false };
      if (o !== true) {
        blocker = label(o);
        break;
      }
      last = d;
    }
    if (blocker) {
      // `last` is owned, `last + STEP` is not. Halve the bracket until it is under FINE.
      let lo = last;
      let hi = Math.min(last + STEP, REACH);
      while (hi - lo > FINE) {
        const mid = (lo + hi) / 2;
        if (owns(cx + dx * mid, cy + dy * mid, el, hosts) === true) lo = mid;
        else hi = mid;
      }
      last = Math.round(lo * 100) / 100;
    }
    // A walk that ran out of REACH is not a walk that hit something. Conflating the two turned
    // every control wider than 52px into a false "stolen" row on this probe's first run.
    return { reach: last, blocker, capped: !blocker && last >= REACH };
  };

  // One side of the control's own box is intact if the walk reached its edge, or ran out of
  // REACH still owning the point.
  //
  // SNAP, and it is the difference between a finding and an artefact. Chromium's hit region for
  // a sub-pixel box is the rect SHIFTED, not the rect: scanned at 0.25px on the Media Center's
  // nav rows (rect top 185.23, bottom 230.88) the region ran 184.48 -> 230.73, so the box is
  // whole and 0.45px higher than where it is painted. A 0.5px walk from a fractional centre can
  // therefore land up to STEP + 0.75 short of one side while the region's total size still
  // covers the rect. Three Media Center controls were reported `stolen` on exactly that, with
  // the blocker naming the control's own CONTAINER — which paints below it and cannot cover it.
  // 1px of tolerance absorbs the snap and leaves the guard intact: the case it exists for is a
  // neighbour's 52px overlay cutting **9px** off `lexicon-knowledge`, and 9 >> 1.5.
  const SNAP = 1;
  const shortfall = (w, need) => (w.capped ? 0 : Math.max(0, need - STEP - SNAP - w.reach));
  const sideOk = (w, need) => shortfall(w, need) === 0;

  const rows = [];
  const occluded = [];

  // Snapshot EVERY element's scroll offset, document-wide, including the ones sitting at 0 —
  // see the scroll-leak trap in the header. Restoring only what was already scrolled, only
  // inside the window, is what let the window's own frame stay scrolled between runs.
  const savedScroll = [...document.querySelectorAll('*')].map((e) => ({
    e,
    top: e.scrollTop,
    left: e.scrollLeft,
  }));

  // The nearest ancestor that is a REAL scroll region: an `auto`/`scroll` overflow with
  // something to scroll. `overflow: hidden` containers are deliberately excluded — they are
  // chrome (`.fwin`, `.os-desktop`, `body`), they are still programmatically scrollable, and
  // scrolling them is exactly the damage this replaces.
  //
  // RESOLVED PER AXIS, and the single-answer version was wrong in a way that reads as a clean
  // measurement. It returned the nearest ancestor that scrolls in EITHER axis and `centreIn`
  // then wrote both offsets on it, so a horizontal-only scroller nested inside the vertical
  // one absorbed the vertical centring as a no-op and every control below the fold stayed
  // below it. Measured live on `files` 2026-09-04: `div.fa-tree` is 52px wide over 172px of
  // content and does not scroll vertically at all (scrollHeight === clientHeight, the rail
  // above it is the real vertical scroller), so all 32 `.fa-tree-node` resolved to it, 25 of
  // them were then filed `occluded by div.os-desktop` — outside the window entirely — and the
  // run scored 53 of 103 controls, one and a half controls above its own VOID threshold.
  // Splitting the walk is strictly TIGHTENING: it can only put a control INSIDE a viewport it
  // was outside of, never the reverse, so it cannot turn a real failure into a pass.
  const scrollParentIn = (el, axis) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      const scrolls =
        axis === 'y'
          ? /(auto|scroll|overlay)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight
          : /(auto|scroll|overlay)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth;
      if (scrolls) return p;
      p = p.parentElement;
    }
    return null;
  };
  // Centre `el` inside its scroll regions by writing THEIR own offsets — the vertical one on
  // the element that actually scrolls vertically, the horizontal one likewise, which are not
  // always the same element. Nothing else in the document moves.
  const centreIn = (el) => {
    const spY = scrollParentIn(el, 'y');
    const spX = scrollParentIn(el, 'x');
    if (spY) {
      const er = el.getBoundingClientRect();
      const sr = spY.getBoundingClientRect();
      spY.scrollTop += er.top + er.height / 2 - (sr.top + sr.height / 2);
    }
    if (spX) {
      // Re-read: writing spY.scrollTop above may have moved this element.
      const er = el.getBoundingClientRect();
      const sr = spX.getBoundingClientRect();
      spX.scrollLeft += er.left + er.width / 2 - (sr.left + sr.width / 2);
    }
    return spY || spX;
  };

  for (const el of els) {
    const hideAgain = revealDeferred(el);
    try {
    // ALWAYS centre, never "only if the centre is not already owned". That shortcut is what
    // made the result depend on iteration order: a control that happened to be visible was
    // measured where it sat, which near a scroller's clip edge means its walk terminates
    // against the clip — a property of the scroll position, not of the control. Centring
    // every control makes the number a property of the control, which is what is being scored.
    // Measure from the biggest host, not always from the control: a 13x13 checkbox inside a
    // 142x32 label is aimed at as a 142x32 target, and the walk has to START inside that box
    // or it reports the glyph.
    const hosts = hostsOf(el);
    const area = (e) => {
      const b = e.getBoundingClientRect();
      return b.width * b.height;
    };
    const target = hosts.reduce((a, b) => (area(b) > area(a) ? b : a));
    centreIn(target);
    let r = target.getBoundingClientRect();
    let cx = r.left + r.width / 2;
    let cy = r.top + r.height / 2;
    const centre = owns(cx, cy, el, hosts);
    if (centre !== true) {
      occluded.push({
        el: label(el),
        rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
        by: centre === null ? 'outside viewport' : label(centre),
      });
      continue;
    }
    const left = walk(cx, cy, -1, 0, el, hosts);
    const right = walk(cx, cy, 1, 0, el, hosts);
    const up = walk(cx, cy, 0, -1, el, hosts);
    const down = walk(cx, cy, 0, 1, el, hosts);
    // `+ FINE`, not `+ STEP`: the trailing term stands for the unresolved sliver past the last
    // owned sample on each side, and after the bisection above that sliver is FINE wide, not
    // STEP. Keeping `+ STEP` here would hand back as slack exactly what the refinement bought.
    const round2 = (n) => Math.round(n * 100) / 100;
    const hitW = round2(left.reach + right.reach + FINE);
    const hitH = round2(up.reach + down.reach + FINE);
    rows.push({
      el: label(el) + (target === el ? '' : ` via ${label(target)}`),
      rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
      rectMin: Math.round(Math.min(r.width, r.height) * 10) / 10,
      hit: `${hitW}x${hitH}`,
      hitMin: Math.min(hitW, hitH),
      // The theft signal: a control whose reachable region does not cover its own rendered box
      // has had part of itself covered by something painted later. Judged PER SIDE against the
      // distance from the centre to that edge — the earlier version compared whole axes and
      // dropped an axis entirely if either side ran out of REACH, which is why a 52px
      // `--lq-hit-target` control that visibly cut 9px off `lexicon-knowledge` reported
      // `stolen: 0`. A capped side still contributes: capped means "reached at least REACH".
      shrunk: !(
        sideOk(left, cx - r.left) &&
        sideOk(right, r.right - cx) &&
        sideOk(up, cy - r.top) &&
        sideOk(down, r.bottom - cy)
      ),
      // The magnitude, so a future reader never has to guess whether a `stolen` row is a real
      // overlay or the sub-pixel snap SNAP now absorbs. Reported in px past the tolerance.
      shrunkBy:
        Math.round(
          Math.max(
            shortfall(left, cx - r.left),
            shortfall(right, r.right - cx),
            shortfall(up, cy - r.top),
            shortfall(down, r.bottom - cy),
          ) * 10,
        ) / 10,
      blockers: [left, right, up, down].map((w) => w.blocker).filter(Boolean),
    });
    } finally {
      hideAgain();
    }
  }

  for (const s of details) s.d.open = s.open;

  // Restore, and REPORT what had to be restored. A leak outside the scroll parents is the
  // signal that this probe has started moving the app again, which is how it went
  // non-deterministic the first time.
  const leaked = [];
  for (const s of savedScroll) {
    if (s.e.scrollTop !== s.top || s.e.scrollLeft !== s.left) {
      leaked.push(`${label(s.e)} ${s.top},${s.left} -> ${s.e.scrollTop},${s.e.scrollLeft}`);
      s.e.scrollTop = s.top;
      s.e.scrollLeft = s.left;
    }
  }

  const below = rows.filter((row) => row.hitMin < FLOOR);
  const stolen = rows.filter((row) => row.shrunk);
  const group = (list, extra) => {
    const m = new Map();
    for (const row of list) {
      const g = m.get(row.el) || { sel: row.el, n: 0, rect: row.rect, hit: row.hit, ...extra(row) };
      g.n += 1;
      m.set(row.el, g);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };

  window.__cat1HitDeferredRestore = [...deferredStyles.values()];
  return JSON.stringify({
    // The SCORED root, not the fallback title. `TITLE` keeps its `'Dictionary'` default so the
    // recorded title-form runs reproduce, but printing it while `ROOT_SEL` is what was measured
    // labels every selector-form run "Dictionary" — a VN run scored 782x513 and said Dictionary.
    title: ROOT_SEL || TITLE,
    floor: FLOOR,
    presentation: win.getAttribute('data-presentation'),
    theme: document.documentElement.getAttribute('data-theme'),
    box: `${Math.round(WR.width)}x${Math.round(WR.height)}`,
    deferredVisibilityOwners: deferredStyles.size,
    controls: els.length,
    measured: rows.length,
    // The headline pair: the rubric's number as a rect, and as a pointer sees it.
    belowFloorByRect: rows.filter((row) => row.rectMin < FLOOR).length,
    belowFloorByHit: below.length,
    belowFloor: group(below, (row) => ({ hitMin: row.hitMin, blockers: row.blockers.slice(0, 2) })),
    smallestHit: rows.slice().sort((a, b) => a.hitMin - b.hitMin)[0] || null,
    stolenCount: stolen.length,
    stolen: group(stolen, (row) => ({ shrunkBy: row.shrunkBy, blockers: row.blockers.slice(0, 2) })),
    // The worst shortfall across ALL rows, stolen or not. A run whose maximum sits just under
    // the tolerance is a run to re-read, not a clean one.
    worstShrunkBy: rows.reduce((m, row) => Math.max(m, row.shrunkBy), 0),
    occludedCount: occluded.length,
    occluded: occluded.slice(0, 8),
    // Exempt, not passing. Printed so a surface cannot quietly shrink its own population.
    disabledCount: disabled.length,
    disabled: disabled.slice(0, 8),
    disclosedForRun: details.filter((s) => !s.open).length,
    disclosuresRestored: details.every((s) => s.d.open === s.open),
    // Not decoration: two consecutive runs must agree, and they only do if this stays small
    // and names scroll REGIONS. Anything with `fwin`/`desktop`/`body` in it is the leak back.
    scrollLeaks: leaked,
  });
})()
