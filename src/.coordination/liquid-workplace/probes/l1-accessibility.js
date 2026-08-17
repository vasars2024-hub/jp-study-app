/**
 * L1 instrument — rubric category 1, "Accessibility", on one window.
 *
 * Four numbers, and 10 requires all four:
 *   - minimum contrast ratio and the element that owns it (>=4.5:1 body text, >=3:1 UI boundary);
 *   - smallest hit target in px (>=32 px smallest dimension per the rubric, which is STRICTER
 *     than WCAG 2.5.8's 24 px — both are reported, because they disagree and the gap is real);
 *   - count of interactive controls not reachable by keyboard (must be 0);
 *   - motion duration under prefers-reduced-motion (<=0.01 s) — driven by `l1-reduced-motion.js`.
 *
 * EVERY CORRECTION BELOW HAS ALREADY PRODUCED A FALSE FINDING IN THIS REPO (`css-measure`).
 *
 * 1. `color-mix()` COMPUTES TO `color(srgb r g b / a)` AND THE CHANNELS ARE 0..1. This app uses
 *    `color-mix()` everywhere. An 8-bit parser reads every mixed colour as nearly black (a real
 *    case scored 1.38 where the truth was 5.33). A parser that merely FAILS TO MATCH the
 *    construct is worse — it returns null, which scores as ABSENT rather than weak and is
 *    indistinguishable from a clean bill of health; that shape hid 23 real failures out of 52.
 *    `parseColor` below handles it, and `selfTest` feeds it a known value every run: a parser
 *    that silently returns null passes every test that only checks it did not throw.
 *    The colourspace token is stripped before matching digits — `display-p3` contains a digit.
 *
 * 2. A MINIMISED OR 0x0 WINDOW MEASURES AS PERFECT. Every box is 0x0 and every question scores
 *    as a pass. This probe REFUSES rather than recording zeros.
 *
 * 3. WCAG 2.5.8 HAS A SPACING EXCEPTION AND A RAW SIZE RULE IS A FINDING GENERATOR. A flat
 *    "under 24 px fails" reported 98 failures suite-wide; applying the exception cleared all 11
 *    in the Scraper (nearest-neighbour centres 31-342 px). An undersized control passes if a
 *    24 px circle centred on it intersects no other target's circle. Implemented below.
 *    Sizes come from `getBoundingClientRect()`, never the declaration — the shell runs at a
 *    user-set UI zoom, and a control declared 24 px rendered at 23.52.
 *
 * 4. A BORDERLESS-BY-DESIGN CONTROL IS NOT A CONTRAST FAILURE. `.os-tray-btn` paints no
 *    boundary at all; sampling it collapses to a flat 1.00:1, which looks identical to an
 *    invisible boundary. For identity/state controls the criterion is satisfied by the MARK
 *    INSIDE, so this probe scores controls on their text/glyph colour, not on a border ring.
 *
 * 5. EFFECTIVE background, not declared. A translucent Liquid material's real contrast is what
 *    counts, so `effectiveBg` composites every ancestor's background-color alpha down to an
 *    opaque base. This is the whole point of the category for a Liquid surface.
 *
 * THE GOVERNING CHECK, which is not in this file. A contrast defect MOVES WITH THE PALETTE. A
 * number that does not move when the theme changes is counting elements, not measuring
 * contrast — that error once produced a headline "66 failures" whose true value was 0. Run this
 * probe on TWO themes and compare before quoting any ratio.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-accessibility.js`
 */
(() => {
  const TITLE = 'Dictionary';

  // ---- colour ------------------------------------------------------------------
  const parseColor = (s) => {
    if (!s) return null;
    const str = String(s).trim();
    if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    // `color(srgb r g b / a)` and friends: channels are 0..1. Strip the colourspace
    // token first, because `display-p3` contains a digit that would be read as a channel.
    const fn = str.match(/^color\(\s*([a-z0-9-]+)\s+([^)]+)\)$/i);
    if (fn) {
      const nums = fn[2].replace(/\//g, ' ').trim().split(/\s+/).map(Number);
      if (nums.length >= 3 && nums.every((n) => Number.isFinite(n))) {
        return { r: nums[0] * 255, g: nums[1] * 255, b: nums[2] * 255, a: nums.length > 3 ? nums[3] : 1 };
      }
      return null;
    }
    const m = str.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const nums = m[1].replace(/\//g, ' ').replace(/,/g, ' ').trim().split(/\s+/).map(Number);
      if (nums.length >= 3 && nums.every((n) => Number.isFinite(n))) {
        return { r: nums[0], g: nums[1], b: nums[2], a: nums.length > 3 ? nums[3] : 1 };
      }
    }
    return null;
  };

  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const lum = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a); const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  // POSITIVE CONTROL for the parser, run every time. `color(srgb 0.87 0.49 0.50)` is the exact
  // recorded case: an 8-bit parser calls it 1.38, the truth is 5.33 on this repo's dark panel.
  // The assertion is on the CHANNELS, not on a ratio: the ratio depends on which backdrop you
  // pick, and an over-tight ratio bound fails on a correct parse (it did, first run — 6.12
  // against this panel vs. the 5.33 the source recorded against a different one). The two
  // failures this guards against are both channel-level: null (scores as ABSENT) and the 8-bit
  // misread (0.87 -> ~1, i.e. near-black). Both are impossible if the channels come back ~222.
  const selfTest = (() => {
    const c = parseColor('color(srgb 0.87 0.49 0.50)');
    if (!c) return { ok: false, why: 'parser returned NULL on color(srgb ...) — every result below would read as ABSENT, not weak' };
    const near = (v, want) => Math.abs(v - want) < 1;
    const ok = near(c.r, 221.85) && near(c.g, 124.95) && near(c.b, 127.5);
    return {
      ok,
      why: ok ? 'channels scaled 0..1 -> 0..255 correctly' : 'channels wrong — 8-bit misread would put these near 1, i.e. near-black',
      parsed: `${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)}`,
      ratioVsPanel: Number(ratio(c, { r: 26, g: 24, b: 35, a: 1 }).toFixed(2)),
    };
  })();

  // ---- window ------------------------------------------------------------------
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });
  const WR = win.getBoundingClientRect();
  if (!WR.width || !WR.height) return JSON.stringify({ refuse: 'window is 0x0 (minimised?) — refusing to record zeros' });

  const painted = (e) => (typeof e.checkVisibility === 'function'
    ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
    : true);

  const effectiveBg = (el) => {
    let acc = null;
    let n = el;
    while (n && n !== document.documentElement.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) acc = acc ? over(acc, c) : { ...c };
      if (acc && acc.a >= 0.999) return acc;
      n = n.parentElement;
    }
    // Nothing opaque found: composite what we have over the page canvas.
    const base = parseColor(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    return acc ? over(acc, { ...base, a: 1 }) : { ...base, a: 1 };
  };

  const label = (e) => `${e.tagName.toLowerCase()}${e.className ? `.${String(e.className).split(' ')[0]}` : ''}`;

  // ---- 1. text contrast --------------------------------------------------------
  const textRows = [];
  const tw = document.createTreeWalker(win, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    const s = t.nodeValue && t.nodeValue.trim();
    if (!s) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || !painted(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg) { textRows.push({ el: label(el), unmeasurable: cs.color }); continue; }
    const bg = effectiveBg(el);
    const composited = fg.a < 1 ? over(fg, bg) : fg;
    const px = parseFloat(cs.fontSize) || 16;
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    // WCAG large text: >=24px, or >=18.66px bold. Large text's bar is 3:1, not 4.5:1.
    const large = px >= 24 || (bold && px >= 18.66);
    textRows.push({
      el: label(el), text: s.slice(0, 24), px: Number(px.toFixed(1)), large,
      ratio: Number(ratio(composited, bg).toFixed(2)),
      bar: large ? 3 : 4.5,
    });
  }
  const measurable = textRows.filter((r) => typeof r.ratio === 'number');
  const failing = measurable.filter((r) => r.ratio < r.bar).sort((a, b) => a.ratio - b.ratio);
  const minRow = measurable.slice().sort((a, b) => a.ratio - b.ratio)[0] || null;

  // ---- 2. hit targets, WITH the 2.5.8 spacing exception -------------------------
  const CTRL = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="checkbox"],[tabindex]';
  const ctrls = [...win.querySelectorAll(CTRL)].filter((e) => {
    if (!painted(e)) return false;
    const r = e.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  });
  const boxes = ctrls.map((e) => {
    const r = e.getBoundingClientRect();
    return { e, r, cx: r.left + r.width / 2, cy: r.top + r.height / 2, min: Math.min(r.width, r.height) };
  });
  // Exception: an undersized target passes if a 24px circle centred on it touches no other
  // target's 24px circle — i.e. nearest-neighbour centre distance >= 24.
  const withSpacing = boxes.map((b) => {
    let nearest = Infinity;
    for (const o of boxes) {
      if (o === b) continue;
      const d = Math.hypot(o.cx - b.cx, o.cy - b.cy);
      if (d < nearest) nearest = d;
    }
    return { ...b, nearest };
  });
  const wcagFails = withSpacing
    .filter((b) => b.min < 24 && b.nearest < 24)
    .map((b) => ({ el: label(b.e), min: Number(b.min.toFixed(2)), nearest: Number(b.nearest.toFixed(1)) }));
  const under32 = withSpacing
    .filter((b) => b.min < 32)
    .sort((a, b) => a.min - b.min)
    .map((b) => ({ el: label(b.e), min: Number(b.min.toFixed(2)), nearest: Number(b.nearest.toFixed(1)) }));
  const smallest = withSpacing.slice().sort((a, b) => a.min - b.min)[0];

  // ---- 3. keyboard reachability ------------------------------------------------
  // Tested by actually focusing, not by reading tabIndex: a control can carry tabindex="0"
  // and still refuse focus. Restore the previous activeElement afterwards.
  //
  // A `tabindex="-1"` element that is NOT otherwise interactive is a PROGRAMMATIC FOCUS HOST,
  // not a control, and counting it is a finding generator of exactly the §2 shape. The measured
  // case: `div.mc-root` (`MediaCenterView.tsx:1539`) carries `tabIndex={-1}` and a comment
  // saying so explicitly — it exists so a bubbling keydown reaches the shortcut listener.
  // Reporting it as "1 control not reachable by keyboard" would be false. Counted separately.
  const INTERACTIVE = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="checkbox"]';
  const prevFocus = document.activeElement;
  const unreachable = [];
  const focusHosts = [];
  for (const b of boxes) {
    const e = b.e;
    if (e.disabled) continue; // a disabled control is intentionally unreachable
    const isControl = e.matches(INTERACTIVE);
    if (e.getAttribute('tabindex') === '-1') {
      (isControl ? unreachable : focusHosts).push({ el: label(e), why: 'tabindex=-1' });
      continue;
    }
    try {
      e.focus({ preventScroll: true });
      if (document.activeElement !== e) unreachable.push({ el: label(e), why: 'focus() did not take' });
    } catch (err) {
      unreachable.push({ el: label(e), why: 'focus() threw' });
    }
  }
  if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });

  return JSON.stringify({
    title: TITLE,
    theme: document.documentElement.getAttribute('data-theme'),
    box: `${Math.round(WR.width)}x${Math.round(WR.height)}`,
    parserSelfTest: selfTest,
    text: {
      measured: measurable.length,
      unmeasurable: textRows.length - measurable.length,
      minRatio: minRow ? minRow.ratio : null,
      minOwner: minRow ? `${minRow.el} "${minRow.text}" ${minRow.px}px` : null,
      failingCount: failing.length,
      worst: failing.slice(0, 8),
    },
    targets: {
      total: boxes.length,
      smallest: smallest ? `${label(smallest.e)} ${Number(smallest.min.toFixed(2))}px` : null,
      under32Count: under32.length,
      under32: under32.slice(0, 10),
      wcag258FailCount: wcagFails.length,
      wcag258Fails: wcagFails.slice(0, 8),
    },
    keyboard: {
      controls: boxes.length,
      unreachableCount: unreachable.length,
      unreachable: unreachable.slice(0, 8),
      // Deliberate `tabindex=-1` focus hosts — NOT counted as unreachable controls. See above.
      focusHostCount: focusHosts.length,
      focusHosts: focusHosts.slice(0, 4),
    },
  });
})()
