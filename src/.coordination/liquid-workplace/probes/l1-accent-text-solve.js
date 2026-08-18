/**
 * L1 solver — what accent share does `--accent-text` need?
 *
 * The last L1 sitting left 4 failures at 1.92:1 on classic-light: `.dict-reading` x3 and
 * `.dict-ex-btn` x1, all painting `var(--accent-2)`. `--accent-2` is the accent mixed 28%
 * toward WHITE (`osPersonalization.ts:115`, written INLINE on <html>), so on a light palette
 * it moves the text TOWARD the background. That is the wrong direction by construction, and
 * a stylesheet cannot fix it — an inline property outranks every rule (styles.css:41-53).
 *
 * Candidate: `color-mix(in srgb, var(--accent) P%, var(--text))`. Mixing toward the palette's
 * OWN --text is bidirectional: near-white --text reconstructs the lightened accent on a dark
 * palette, #1e1e1e yields a dark tint of the same hue on a light one. This probe finds the
 * largest P (most accent identity retained) that still clears the bar on every palette, rather
 * than guessing one and calling the guess a measurement.
 *
 * Traps inherited from `l1-palette-contrast.js`, all reproduced here:
 *  - go through `mod.applyTheme(id, {persist:false})`, never `data-theme` on <html>;
 *  - refuse the run if the module registry is not 13 (a duplicate import copy measures every
 *    palette identically and reads as a pass);
 *  - freeze transitions before the first switch — /eval is synchronous and an unfrozen sample
 *    reports the PREVIOUS palette's colour, which fabricates passes as readily as failures.
 *
 * Run: `node debug/evfile.cjs .../l1-palette-contrast-load.js` first, then this file.
 */
(() => {
  // Every light palette (the six that set `color-scheme: light`) plus three darks as the
  // no-regression control. A formula that fixes light and breaks dark is not a fix.
  const PALETTES = [
    'classic-light',
    'soft-sepia',
    'ocean-blue',
    'mint-green',
    'rose-pine',
    'paper',
    'study-os',
    'forest-night',
    'high-contrast',
  ];
  const LIGHT = ['classic-light', 'soft-sepia', 'ocean-blue', 'mint-green', 'rose-pine', 'paper'];
  const SHARES = [100, 85, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30];
  // Two candidate recipes. srgb-toward-text desaturates hard as the share drops; oklch keeps
  // chroma while moving lightness, and toward-black keeps the hue exactly but only helps on a
  // light ground. All three are measured rather than argued about.
  const RECIPES = {
    srgbText: (p) => `color-mix(in srgb, var(--accent) ${p}%, var(--text))`,
    oklchText: (p) => `color-mix(in oklch, var(--accent) ${p}%, var(--text))`,
    srgbBlack: (p) => `color-mix(in srgb, var(--accent) ${p}%, #000)`,
  };
  // Every surface one of the nine `color: var(--accent-2)` runs actually sits on. The four
  // measured live are on --panel; the flashcard/grammar/novel ones are on the same family.
  //
  // `--card` WAS in this list and had to come out: it is not defined by any palette (it is a
  // key of the SHADOWS record in osPersonalization, not a colour token). An undefined var in
  // `color: var(--card)` is invalid-at-computed-value-time, so the probe span inherited the UA
  // colour — #ffffff under a dark `color-scheme`, #000000 under a light one — i.e. the exact
  // WORST possible ground on every palette. It owned the `worst` figure in all six and hid
  // every real surface behind it. `defined()` below is the guard: a var that does not resolve
  // is dropped, never measured.
  //
  // `--control-bg` came out for a second, different reason: it resolved to #000000 on
  // classic-light and to exactly `--text` on soft-sepia, because it is TRANSLUCENT. Reading a
  // token's own alpha and then scoring it as if opaque paints a black ground under white
  // palettes and manufactures failures the eye cannot see. Surfaces are composited over --bg
  // below; --control-bg stays out of `worst` regardless, because none of the nine runs sits on
  // one (`.dict-ex-btn` is explicitly `background: transparent`). Its value is still reported.
  const SURFACE_VARS = ['--bg', '--panel', '--panel-2', '--card', '--sidebar'];
  const REPORT_ONLY_VARS = ['--control-bg'];

  const mod = window.__lqTheme && window.__lqTheme.mod;
  if (!mod) return JSON.stringify({ refuse: 'run l1-palette-contrast-load.js first' });
  const registered = mod.listThemes().length;
  if (registered < 13)
    return JSON.stringify({
      refuse: `duplicate module copy — ${registered} themes registered, expected 13.`,
    });

  const probe = document.createElement('span');
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  document.documentElement.appendChild(probe);

  // The outer `color-mix(in srgb, X 100%, transparent)` is load-bearing, not decoration: an
  // `in oklch` mix computes to `oklch(...)`, which the rgb/color() parser below returns null
  // for — and a null read scores as "recipe produced nothing", i.e. a FALSE "oklch can never
  // reach 4.5:1". Round-tripping through an srgb mix forces `color(srgb r g b)` output.
  const resolve = (expr) => {
    probe.style.color = '';
    probe.style.color = `color-mix(in srgb, ${expr} 100%, transparent)`;
    const got = getComputedStyle(probe).color;
    if (got && got !== 'rgba(0, 0, 0, 0)') return got;
    probe.style.color = '';
    probe.style.color = expr;
    return getComputedStyle(probe).color;
  };
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
  const lum = (c) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const over = (f, b) => ({
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  });
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const hex = (c) =>
    '#' +
    [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  // Two sentinels, because one cannot tell "undefined" from "happens to equal the sentinel".
  const defined = (v) => {
    const a = resolve(`var(${v}, #123456)`);
    const b = resolve(`var(${v}, #654321)`);
    return a === b;
  };

  // Self-test the resolver: color-mix must actually compute, or every share reads identical.
  const st = parse(resolve('color-mix(in srgb, #ff0000 50%, #000000)'));
  const selfTest = {
    mix: { ok: !!st && Math.round(st.r) === 128 && st.g === 0, got: st ? hex(st) : null },
    // The guard that caught this probe's own first run. A false here voids the whole output.
    definedGuard: {
      realVarIsDefined: defined('--text'),
      inventedVarIsNot: defined('--lq-no-such-token-xyz'),
      ok: defined('--text') === true && defined('--lq-no-such-token-xyz') === false,
    },
  };

  const FREEZE_ID = 'lq-accent-solve-freeze';
  const freeze = () => {
    const el = document.createElement('style');
    el.id = FREEZE_ID;
    el.textContent =
      '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.appendChild(el);
  };

  const startTheme = document.documentElement.getAttribute('data-theme') || 'study-os';
  const storedBefore = localStorage.getItem('jp-os-theme');
  const out = {};
  let frozen = false;
  try {
    freeze();
    frozen = !!document.getElementById(FREEZE_ID);
    for (const id of PALETTES) {
      mod.applyTheme(id, { persist: false });
      const cs = getComputedStyle(document.documentElement);
      const accent = parse(resolve('var(--accent)'));
      const text = parse(resolve('var(--text)'));
      const accent2 = parse(resolve('var(--accent-2)'));
      const pageBg = parse(resolve('var(--bg)')) || { r: 255, g: 255, b: 255, a: 1 };
      const surfaces = {};
      const undefinedVars = [];
      const translucent = {};
      for (const v of SURFACE_VARS) {
        if (!defined(v)) {
          undefinedVars.push(v);
          continue;
        }
        const c = parse(resolve(`var(${v})`));
        if (!c) continue;
        if (c.a < 1) translucent[v] = Math.round(c.a * 100) / 100;
        const composited = over(c, pageBg);
        if (composited) surfaces[v] = composited;
      }
      const reportOnly = {};
      for (const v of REPORT_ONLY_VARS) {
        if (!defined(v)) continue;
        const c = parse(resolve(`var(${v})`));
        if (c) reportOnly[v] = `${hex(over(c, pageBg))} a=${Math.round(c.a * 100) / 100}`;
      }
      // The bar these runs face: 14px/13px/12px normal weight -> 4.5:1 everywhere.
      const worstOf = (fg) =>
        Object.entries(surfaces).reduce(
          (acc, [name, bg]) => {
            const r = ratio(fg, bg);
            return r < acc.r ? { r, on: name } : acc;
          },
          { r: Infinity, on: null },
        );

      const recipes = {};
      for (const [name, fn] of Object.entries(RECIPES)) {
        const shares = {};
        let best = null;
        for (const p of SHARES) {
          const mixed = parse(resolve(fn(p)));
          if (!mixed) continue;
          const w = worstOf(mixed);
          shares[p] = `${hex(mixed)} ${Math.round(w.r * 100) / 100} on ${w.on}`;
          // The LARGEST share that passes — most accent identity retained.
          if (w.r >= 4.5 && best === null) best = p;
        }
        recipes[name] = { largestPassingShare: best, shares };
      }
      const cur = worstOf(accent2);
      out[id] = {
        light: LIGHT.includes(id),
        text: hex(text),
        accent: hex(accent),
        accent2Now: { hex: hex(accent2), worst: Math.round(cur.r * 100) / 100, on: cur.on },
        surfaces: Object.fromEntries(Object.entries(surfaces).map(([k, v]) => [k, hex(v)])),
        translucent,
        reportOnly,
        undefinedVars,
        recipes,
        themeApplied: cs.getPropertyValue('--text').trim() ? id : 'SUSPECT',
      };
    }
  } finally {
    mod.applyTheme(startTheme, { persist: false });
    document.getElementById(FREEZE_ID)?.remove();
    probe.remove();
    if (storedBefore === null) localStorage.removeItem('jp-os-theme');
    else localStorage.setItem('jp-os-theme', storedBefore);
  }

  // The share to pick per recipe: the smallest "largest passing" across the LIGHT palettes,
  // since the dark ones are the ones that must not regress and keep `var(--accent-2)`.
  const verdict = {};
  for (const name of Object.keys(RECIPES)) {
    const perLight = LIGHT.map((id) => [id, out[id]?.recipes[name]?.largestPassingShare ?? null]);
    const missing = perLight.filter(([, v]) => v === null).map(([id]) => id);
    verdict[name] = missing.length
      ? { usable: false, cannotReach4_5: missing }
      : { usable: true, share: Math.min(...perLight.map(([, v]) => v)) };
  }
  return JSON.stringify(
    {
      frozen,
      selfTest,
      registered,
      restoredTo: document.documentElement.getAttribute('data-theme'),
      verdict,
      out,
    },
    null,
    1,
  );
})()