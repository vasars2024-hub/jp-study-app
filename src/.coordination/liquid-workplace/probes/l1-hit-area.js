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
  const TITLE = 'Dictionary';
  const FLOOR = 32;
  const STEP = 0.5;
  const REACH = 26; // px from the centre — enough to prove a 52px region, well past the floor
  const INTERACTIVE =
    'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const win = [...document.querySelectorAll('.fwin')].find((w) =>
    (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });
  const WR = win.getBoundingClientRect();
  if (!WR.width || !WR.height)
    return JSON.stringify({ refuse: 'window is 0x0 (minimised?) — refusing to record zeros' });

  const label = (e) =>
    !e
      ? 'null'
      : e.tagName.toLowerCase() +
        (typeof e.className === 'string' && e.className.trim()
          ? '.' + e.className.trim().split(/\s+/).join('.')
          : '');

  const els = [...win.querySelectorAll(INTERACTIVE)].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  });

  // `null` = off-viewport (unmeasurable), `false` = someone else owns the point.
  const owns = (x, y, el) => {
    if (x < 0 || y < 0 || x > innerWidth - 1 || y > innerHeight - 1) return null;
    const got = document.elementFromPoint(x, y);
    if (!got) return null;
    return got === el || el.contains(got) ? true : got;
  };

  // Walk outward until the control stops owning the point. Returns the reach and the blocker.
  const walk = (cx, cy, dx, dy, el) => {
    let last = 0;
    let blocker = null;
    for (let d = STEP; d <= REACH; d += STEP) {
      const o = owns(cx + dx * d, cy + dy * d, el);
      if (o === null) return { reach: last, blocker: 'viewport', capped: false };
      if (o !== true) {
        blocker = label(o);
        break;
      }
      last = d;
    }
    // A walk that ran out of REACH is not a walk that hit something. Conflating the two turned
    // every control wider than 52px into a false "stolen" row on this probe's first run.
    return { reach: last, blocker, capped: !blocker && last >= REACH };
  };

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
  const scrollParent = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      const y = /(auto|scroll|overlay)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight;
      const x = /(auto|scroll|overlay)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth;
      if (y || x) return p;
      p = p.parentElement;
    }
    return null;
  };

  // Centre `el` inside `sp` by writing `sp`'s own offsets. Nothing else in the document moves.
  const centreIn = (el, sp) => {
    const er = el.getBoundingClientRect();
    const sr = sp.getBoundingClientRect();
    sp.scrollTop += er.top + er.height / 2 - (sr.top + sr.height / 2);
    sp.scrollLeft += er.left + er.width / 2 - (sr.left + sr.width / 2);
  };

  for (const el of els) {
    let r = el.getBoundingClientRect();
    let cx = r.left + r.width / 2;
    let cy = r.top + r.height / 2;
    if (owns(cx, cy, el) !== true) {
      const sp = scrollParent(el);
      if (sp) centreIn(el, sp);
      r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    }
    const centre = owns(cx, cy, el);
    if (centre !== true) {
      occluded.push({
        el: label(el),
        rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
        by: centre === null ? 'outside viewport' : label(centre),
      });
      continue;
    }
    const left = walk(cx, cy, -1, 0, el);
    const right = walk(cx, cy, 1, 0, el);
    const up = walk(cx, cy, 0, -1, el);
    const down = walk(cx, cy, 0, 1, el);
    const hitW = left.reach + right.reach + STEP;
    const hitH = up.reach + down.reach + STEP;
    rows.push({
      el: label(el),
      rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
      rectMin: Math.round(Math.min(r.width, r.height) * 10) / 10,
      hit: `${hitW}x${hitH}`,
      hitMin: Math.min(hitW, hitH),
      // The theft signal: a control whose reachable region is narrower than its own rendered
      // box has had part of itself covered by something painted later. A capped axis is not
      // evidence of anything, so it never contributes.
      shrunk:
        (!left.capped && !right.capped && hitW + 0.5 < r.width) ||
        (!up.capped && !down.capped && hitH + 0.5 < r.height),
      blockers: [left, right, up, down].map((w) => w.blocker).filter(Boolean),
    });
  }

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

  return JSON.stringify({
    title: TITLE,
    floor: FLOOR,
    presentation: win.getAttribute('data-presentation'),
    theme: document.documentElement.getAttribute('data-theme'),
    box: `${Math.round(WR.width)}x${Math.round(WR.height)}`,
    controls: els.length,
    measured: rows.length,
    // The headline pair: the rubric's number as a rect, and as a pointer sees it.
    belowFloorByRect: rows.filter((row) => row.rectMin < FLOOR).length,
    belowFloorByHit: below.length,
    belowFloor: group(below, (row) => ({ hitMin: row.hitMin, blockers: row.blockers.slice(0, 2) })),
    smallestHit: rows.slice().sort((a, b) => a.hitMin - b.hitMin)[0] || null,
    stolenCount: stolen.length,
    stolen: group(stolen, (row) => ({ blockers: row.blockers.slice(0, 2) })),
    occludedCount: occluded.length,
    occluded: occluded.slice(0, 8),
    // Not decoration: two consecutive runs must agree, and they only do if this stays small
    // and names scroll REGIONS. Anything with `fwin`/`desktop`/`body` in it is the leak back.
    scrollLeaks: leaked,
  });
})()
