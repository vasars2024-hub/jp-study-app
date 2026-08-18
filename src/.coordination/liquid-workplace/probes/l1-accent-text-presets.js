/**
 * L1 solver, part 2 — the share must hold for EVERY accent the product ships, not just the one
 * this machine happens to have selected.
 *
 * `l1-accent-text-solve.js` measured one accent (`#10b981`, mint — whatever was live) and
 * returned share 40 for `color-mix(in srgb, var(--accent) P%, var(--text))`. That number is
 * boundary-tight on three palettes and it was derived from a SINGLE hue. `--accent` is
 * user-chosen: `osPersonalization.ts:39` ships nine presets and `:201` also accepts a free
 * `customAccent` hex. A share tuned to mint says nothing about amber `#f59e0b`, which is far
 * lighter and therefore far closer to a light palette's ground.
 *
 * So: nine presets x six light palettes, plus the three darks as the no-regression control, and
 * take the largest share that clears 4.5:1 in EVERY cell. Also re-measures `--accent-2`-as-text
 * on the darks per preset, because `--accent-text` inherits `var(--accent-2)` there and the
 * claim "dark was never the defect" was itself only ever measured on mint.
 *
 * Negative control, second attempt — the first one was wrong and is recorded here rather than
 * quietly dropped. `#ffffff` as the accent was supposed to be the thing that MUST fail; at share
 * 30 it scored 5.54 on classic-light and passed. That is not the instrument lying, it is the
 * recipe working: 30% white + 70% `#1e1e1e` is `#626262`, which is legible. A control has to be
 * something the fix genuinely cannot rescue.
 *
 * The control that does fail: the STATUS QUO, `var(--accent-2)` as text, measured in the same
 * run on the same surfaces for all nine presets. Every one of those 54 cells must land under
 * 4.5:1 — that is the defect being fixed, so if any of them passes, the surfaces or the bar are
 * wrong and the run is VOID. Share 100 (the mix made inert) is measured for the same reason.
 *
 * Traps, inherited and re-checked here:
 *  - `mod.applyTheme(id, {persist:false})`, never `data-theme`;
 *  - refuse below 13 registered themes (a duplicate module copy measures every palette alike);
 *  - freeze transitions before the first switch (/eval is synchronous; an unfrozen read reports
 *    the palette it just left);
 *  - `--accent`/`--accent-2` are written INLINE on <html> by personalization, so this probe
 *    overrides them inline too and restores the exact prior inline text in the `finally`.
 *
 * Run: `node debug/evfile.cjs .../l1-palette-contrast-load.js` first, then this file.
 */
(() => {
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
  // Verbatim from ACCENT_PRESETS (osPersonalization.ts:39). `light` is what personalization
  // writes to --accent-2, so the dark check uses the shipped value rather than re-deriving it.
  const ACCENTS = [
    { id: 'crimson', accent: '#ff2e4d', light: '#ff6b81' },
    { id: 'scarlet', accent: '#ff3b30', light: '#ff7a72' },
    { id: 'rose', accent: '#ff4d6d', light: '#ff89a0' },
    { id: 'ruby', accent: '#e01e37', light: '#ff5c72' },
    { id: 'ember', accent: '#ff5630', light: '#ff8a6b' },
    { id: 'violet', accent: '#a855f7', light: '#c084fc' },
    { id: 'azure', accent: '#3b82f6', light: '#60a5fa' },
    { id: 'mint', accent: '#10b981', light: '#34d399' },
    { id: 'amber', accent: '#f59e0b', light: '#fbbf24' },
  ];
  const CONTROL = { id: 'CONTROL-white', accent: '#ffffff', light: '#ffffff' };
  // 100 is not a candidate — it is the inert-mix control, and it must fail on the light palettes.
  const SHARES = [100, 55, 50, 45, 40, 35, 30, 25];
  const CANDIDATE_SHARES = [55, 50, 45, 40, 35, 30, 25];
  const SURFACE_VARS = ['--bg', '--panel', '--panel-2', '--sidebar'];
  const BAR = 4.5;

  const mod = window.__lqTheme && window.__lqTheme.mod;
  if (!mod) return JSON.stringify({ refuse: 'run l1-palette-contrast-load.js first' });
  const registered = mod.listThemes().length;
  if (registered < 13)
    return JSON.stringify({ refuse: `duplicate module copy — ${registered} themes, expected 13` });

  const probe = document.createElement('span');
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  document.documentElement.appendChild(probe);

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
    '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const r2 = (n) => Math.round(n * 100) / 100;

  const st = parse(resolve('color-mix(in srgb, #ff0000 50%, #000000)'));
  const selfTest = { mix: { ok: !!st && Math.round(st.r) === 128 && st.g === 0, got: st ? hex(st) : null } };

  const FREEZE_ID = 'lq-accent-preset-freeze';
  const root = document.documentElement;
  const startTheme = root.getAttribute('data-theme') || 'study-os';
  const storedTheme = localStorage.getItem('jp-os-theme');
  const priorAccent = root.style.getPropertyValue('--accent');
  const priorAccent2 = root.style.getPropertyValue('--accent-2');

  const cells = {};
  const statusQuo = {};
  const darkAccent2 = {};
  let frozen = false;
  try {
    const el = document.createElement('style');
    el.id = FREEZE_ID;
    el.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.appendChild(el);
    frozen = !!document.getElementById(FREEZE_ID);

    for (const id of PALETTES) {
      mod.applyTheme(id, { persist: false });
      const isLight = LIGHT.includes(id);
      const pageBg = parse(resolve('var(--bg)')) || { r: 255, g: 255, b: 255, a: 1 };
      const surfaces = {};
      for (const v of SURFACE_VARS) {
        const c = parse(resolve(`var(${v})`));
        if (c) surfaces[v] = over(c, pageBg);
      }
      const worstOf = (fg) =>
        Object.entries(surfaces).reduce(
          (acc, [name, bg]) => {
            const r = ratio(fg, bg);
            return r < acc.r ? { r, on: name } : acc;
          },
          { r: Infinity, on: null },
        );

      for (const a of [...ACCENTS, CONTROL]) {
        root.style.setProperty('--accent', a.accent);
        root.style.setProperty('--accent-2', a.light);
        if (isLight) {
          for (const p of SHARES) {
            const mixed = parse(resolve(`color-mix(in srgb, var(--accent) ${p}%, var(--text))`));
            if (!mixed) continue;
            const w = worstOf(mixed);
            cells[`${id}|${a.id}|${p}`] = { hex: hex(mixed), r: r2(w.r), on: w.on };
          }
          const c2 = parse(resolve('var(--accent-2)'));
          if (c2) {
            const w = worstOf(c2);
            statusQuo[`${id}|${a.id}`] = { hex: hex(c2), r: r2(w.r), on: w.on };
          }
        } else {
          const c2 = parse(resolve('var(--accent-2)'));
          const w = worstOf(c2);
          darkAccent2[`${id}|${a.id}`] = { hex: hex(c2), r: r2(w.r), on: w.on };
        }
      }
    }
  } finally {
    if (priorAccent) root.style.setProperty('--accent', priorAccent);
    else root.style.removeProperty('--accent');
    if (priorAccent2) root.style.setProperty('--accent-2', priorAccent2);
    else root.style.removeProperty('--accent-2');
    mod.applyTheme(startTheme, { persist: false });
    document.getElementById(FREEZE_ID)?.remove();
    probe.remove();
    if (storedTheme === null) localStorage.removeItem('jp-os-theme');
    else localStorage.setItem('jp-os-theme', storedTheme);
  }

  // Largest share passing every (light palette x shipped preset) cell.
  let chosen = null;
  const perShare = {};
  for (const p of CANDIDATE_SHARES) {
    const fails = [];
    for (const id of LIGHT)
      for (const a of ACCENTS) {
        const c = cells[`${id}|${a.id}|${p}`];
        if (!c) fails.push(`${id}|${a.id}|MISSING`);
        else if (c.r < BAR) fails.push(`${id}|${a.id}=${c.r}`);
      }
    perShare[p] = { failing: fails.length, worstExamples: fails.slice(0, 4) };
    if (!fails.length && chosen === null) chosen = p;
  }

  // NEGATIVE CONTROL A — the status quo. All 54 light x preset cells of `var(--accent-2)`-as-text
  // must be under the bar; that is the defect. A pass here voids the run.
  const sqCells = Object.entries(statusQuo).filter(([k]) => !k.endsWith(`|${CONTROL.id}`));
  const sqPassing = sqCells.filter(([, v]) => v.r >= BAR).map(([k, v]) => `${k}=${v.r}`);
  const sqRange = sqCells.length
    ? { min: Math.min(...sqCells.map(([, v]) => v.r)), max: Math.max(...sqCells.map(([, v]) => v.r)) }
    : null;

  // NEGATIVE CONTROL B — the mix made inert (share 100 is the raw accent). Must also fail broadly.
  const inertCells = [];
  for (const id of LIGHT)
    for (const a of ACCENTS) {
      const c = cells[`${id}|${a.id}|100`];
      if (c) inertCells.push([`${id}|${a.id}`, c.r]);
    }
  const inertPassing = inertCells.filter(([, r]) => r >= BAR).map(([k, r]) => `${k}=${r}`);

  // Reported, NOT a control: a pure-white custom accent. The recipe genuinely rescues it on the
  // darkest-text palettes, which is why it cannot serve as the thing that must fail.
  const whiteRows =
    chosen === null
      ? []
      : LIGHT.map((id) => {
          const c = cells[`${id}|${CONTROL.id}|${chosen}`];
          return { palette: id, hex: c && c.hex, r: c && c.r, passes: !!c && c.r >= BAR };
        });

  const darkFailing = Object.entries(darkAccent2)
    .filter(([, v]) => v.r < BAR)
    .map(([k, v]) => `${k}=${v.r}`);

  // The per-cell margin at the chosen share, so the next worker can see how tight it is.
  const chosenTable = {};
  if (chosen !== null)
    for (const id of LIGHT)
      chosenTable[id] = Object.fromEntries(
        ACCENTS.map((a) => {
          const c = cells[`${id}|${a.id}|${chosen}`];
          return [a.id, `${c.hex} ${c.r} on ${c.on}`];
        }),
      );

  return JSON.stringify(
    {
      frozen,
      selfTest,
      registered,
      restoredTo: root.getAttribute('data-theme'),
      accentRestored: root.style.getPropertyValue('--accent') || '(none)',
      chosenShare: chosen,
      perShare,
      controlStatusQuo: {
        cells: sqCells.length,
        allFail: sqPassing.length === 0,
        range: sqRange,
        unexpectedlyPassing: sqPassing,
      },
      controlInertMix: {
        cells: inertCells.length,
        allFail: inertPassing.length === 0,
        unexpectedlyPassing: inertPassing,
      },
      whiteAccentReported: { accent: CONTROL.accent, rows: whiteRows },
      darkAccent2Failing: darkFailing,
      darkAccent2,
      chosenTable,
    },
    null,
    1,
  );
})()
