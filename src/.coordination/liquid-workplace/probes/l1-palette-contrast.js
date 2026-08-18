/**
 * L1 instrument — rubric category 1's GOVERNING check, which `l1-accessibility.js` deliberately
 * does not do: `css-measure` §0, "a contrast defect MOVES WITH THE PALETTE. A number that does
 * not move is counting elements, not measuring contrast."
 *
 * TWO WAYS THIS HAS ALREADY GONE WRONG IN THIS REPO, both guarded here.
 *
 * 1. Setting `data-theme` on `<html>` from the bridge does NOT switch the palette. It skips
 *    `applyThemeAttributes` (materials + dataAttrs) and the change event React listens to, and
 *    the half-applied result manufactured 39 failures at ~1.01 that were not real. This probe
 *    goes through `applyTheme(id, { persist: false })` — `theme/engine.ts:145`, the engine's own
 *    single choke point — and `persist: false` means `jp-os-theme` is never written, so there is
 *    no capture-patch-restore to get wrong.
 * 2. `import()` can hand back a DUPLICATE module copy whose registry is empty, and `applyTheme`
 *    on an empty registry silently falls back to the default theme — every palette then measures
 *    identically and the run reads as "contrast is palette-independent". `registered` below is
 *    the guard: if it is not 13, throw the run away.
 * 3. /eval is SYNCHRONOUS, so the measurement happens in the same task as `applyTheme` — before
 *    any CSS transition has advanced a frame. `.fwin-title` transitions `color` over 140ms and
 *    `.fwin-b` over 80ms, so both reported the PREVIOUS palette's colour against the NEW
 *    palette's background: 6 fabricated failures (#d8ebe0 and #7fa08e, forest-night's --text and
 *    --muted, measured on a white ground). Settled, they are #1e1e1e and #5f5f66 and correct.
 *    The same lag can fabricate a PASS just as easily. `freezeTransitions` below cancels every
 *    running transition so each measurement is of the settled value; it is removed in a
 *    `finally`, and `frozen` in the output is the proof it was actually installed.
 *
 * The probe is a two-parter because the bridge's /eval is synchronous and a promise serialises
 * to `{}`. Run `l1-palette-contrast-load.js` first; it parks the live module on
 * `window.__lqTheme`. Then run this file, which switches, measures, and always restores.
 *
 * Reports per palette: minimum ratio, count of failing text runs, and — the number that decides
 * WHO owns a failure — how many of them sit inside a Liquid region versus outside it. A failure
 * that reproduces in Standard presentation at the same ratio is not Liquid's.
 *
 * Run: `node debug/evfile.cjs .../l1-palette-contrast-load.js`
 *      `node debug/evfile.cjs .../l1-palette-contrast.js`
 */
(() => {
  const PALETTES = ['forest-night', 'classic-light', 'high-contrast'];
  const TITLE = 'Dictionary';

  const mod = window.__lqTheme && window.__lqTheme.mod;
  if (!mod) return JSON.stringify({ refuse: 'run l1-palette-contrast-load.js first' });
  const registered = mod.listThemes().length;
  if (registered < 13)
    return JSON.stringify({
      refuse: `duplicate module copy — ${registered} themes registered, expected 13. Every palette would measure the same and the run would read as a pass.`,
    });

  const win = [...document.querySelectorAll('.fwin')].find((w) =>
    (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });
  const WR = win.getBoundingClientRect();
  if (!WR.width || !WR.height) return JSON.stringify({ refuse: 'window is 0x0 — refusing zeros' });

  // `color-mix()` computes to `color(srgb r g b / a)` with 0..1 channels. An 8-bit parser reads
  // every mixed colour as near-black; a parser that merely fails to match returns null and scores
  // the element as ABSENT rather than weak, which once hid 23 real failures behind a PASS.
  const parse = (s) => {
    if (!s || s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    const fn = String(s).match(/^color\(\s*[a-z0-9-]+\s+([^)]+)\)$/i);
    if (fn) {
      const n = fn[1].replace(/\//g, ' ').trim().split(/\s+/).map(Number);
      if (n.length >= 3 && n.every(Number.isFinite))
        return { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n.length > 3 ? n[3] : 1 };
      return null;
    }
    const m = String(s).match(/^rgba?\(([^)]+)\)$/i);
    if (!m) return null;
    const n = m[1].replace(/[,/]/g, ' ').trim().split(/\s+/).map(Number);
    if (n.length < 3 || !n.every(Number.isFinite)) return null;
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
  };
  const selfTest = (() => {
    const c = parse('color(srgb 0.87 0.49 0.50)');
    const got = c ? `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}` : 'null';
    return { ok: got === '222,125,128', parsed: got };
  })();

  const over = (f, b) => ({
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // Effective, not declared: a translucent Liquid material's real contrast is the whole point.
  const effBg = (el) => {
    const chain = [];
    for (let e = el; e; e = e.parentElement) chain.push(e);
    let base = { r: 0, g: 0, b: 0, a: 1 };
    for (let i = chain.length - 1; i >= 0; i--) {
      const c = parse(getComputedStyle(chain[i]).backgroundColor);
      if (c && c.a > 0) base = over(c, base);
    }
    return base;
  };

  const measure = () => {
    const rows = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3 && child.textContent.trim()) {
          const cs = getComputedStyle(node);
          const r = node.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const fg = parse(cs.color);
          if (!fg) {
            rows.push({ unmeasurable: true });
            continue;
          }
          const bg = effBg(node);
          const px = parseFloat(cs.fontSize);
          const bar = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700) ? 3 : 4.5;
          rows.push({
            el:
              node.tagName.toLowerCase() +
              (typeof node.className === 'string' && node.className
                ? '.' + node.className.trim().split(/\s+/).join('.')
                : ''),
            text: child.textContent.trim().slice(0, 16),
            px: Math.round(px * 10) / 10,
            ratio: Math.round(ratio(over(fg, bg), bg) * 100) / 100,
            bar,
            inLiquid: !!node.closest('.lq-contextual, .lq-liquid, .lq-ambient'),
          });
        } else if (child.nodeType === 1) walk(child);
      }
    };
    walk(win);
    const measured = rows.filter((r) => !r.unmeasurable);
    const failing = measured.filter((r) => r.ratio < r.bar);
    const min = measured.slice().sort((a, b) => a.ratio - b.ratio)[0] || null;
    return {
      measured: measured.length,
      unmeasurable: rows.length - measured.length,
      minRatio: min ? min.ratio : null,
      minOwner: min ? `${min.el} "${min.text}" ${min.px}px` : null,
      failing: failing.length,
      failingInLiquidRegion: failing.filter((r) => r.inLiquid).length,
      worst: failing.sort((a, b) => a.ratio - b.ratio).slice(0, 4),
    };
  };

  // Cancels in-flight transitions so every sample is the settled value. `transition: none`
  // on a running transition snaps it to its target, which is exactly the number wanted.
  const FREEZE_ID = 'lq-palette-freeze';
  const freezeTransitions = () => {
    const el = document.createElement('style');
    el.id = FREEZE_ID;
    el.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.appendChild(el);
  };
  const thawTransitions = () => document.getElementById(FREEZE_ID)?.remove();

  const startTheme = document.documentElement.getAttribute('data-theme') || 'study-os';
  const storedBefore = localStorage.getItem('jp-os-theme');
  const out = {};
  const tint = {};
  let frozen = false;
  try {
    freezeTransitions();
    frozen = !!document.getElementById(FREEZE_ID);
    for (const id of PALETTES) {
      mod.applyTheme(id, { persist: false });
      const cs = getComputedStyle(document.documentElement);
      // Attribution: if the glass tokens track the palette, a Liquid failure is the consuming
      // rule's hardcoded colour, not the material's.
      tint[id] = {
        glassTint: cs.getPropertyValue('--glass-tint').trim(),
        lqLiquidBg: cs.getPropertyValue('--lq-liquid-bg').trim(),
        lqLiquidText: cs.getPropertyValue('--lq-liquid-text').trim(),
        text: cs.getPropertyValue('--text').trim(),
        panel: cs.getPropertyValue('--panel').trim(),
      };
      out[id] = measure();
    }
  } finally {
    mod.applyTheme(startTheme, { persist: false });
    thawTransitions();
  }

  return JSON.stringify({
    registered,
    parserSelfTest: selfTest,
    // Must be true. A run with `frozen: false` measured mid-transition and every
    // transitioned property in it is the previous palette's value.
    frozen,
    thawed: !document.getElementById(FREEZE_ID),
    presentation: win.getAttribute('data-presentation'),
    box: `${Math.round(WR.width)}x${Math.round(WR.height)}`,
    restoredTo: document.documentElement.getAttribute('data-theme'),
    storedBefore,
    storedAfter: localStorage.getItem('jp-os-theme'),
    tokens: tint,
    palettes: out,
  });
})()
