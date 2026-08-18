/**
 * L1 solver — how much accent fill can the Liquid toggle carry before it eats its own glyph?
 *
 * Raising `.fwin-b-liquid.is-liquid`'s fill from 16% to 24% (to compensate for taking the accent
 * OFF the glyph) made the glyph's own ground worse and put it back under the bar: 4.07 on
 * classic-light, 4.19 on forest-night, measured on the live window. The fix for a contrast
 * defect created the next one, which is exactly why the fill gets solved rather than picked.
 *
 * Largest fill share that keeps the inherited glyph colour at >= 4.5:1 on every palette, with
 * the state still carried by the tint plus the inset border. Measured on the REAL toggle with
 * `effBg` compositing the whole ancestor chain.
 */
(() => {
  const PALETTES = [
    'classic-light', 'soft-sepia', 'ocean-blue', 'mint-green', 'rose-pine', 'paper',
    'study-os', 'forest-night', 'high-contrast', 'dark-nebula', 'oled-black', 'midnight-ink',
    'cyberpunk',
  ];
  const FILLS = [24, 22, 20, 18, 16, 14, 12, 10, 8];
  const BAR = 4.5;

  const mod = window.__lqTheme && window.__lqTheme.mod;
  if (!mod) return JSON.stringify({ refuse: 'run l1-palette-contrast-load.js first' });
  if (mod.listThemes().length < 13) return JSON.stringify({ refuse: 'duplicate module copy' });

  const win = [...document.querySelectorAll('.fwin')].find((w) =>
    (w.querySelector('.fwin-title-text')?.textContent || '').includes('Dictionary'));
  if (!win) return JSON.stringify({ refuse: 'no Dictionary window' });
  const tg = win.querySelector('.fwin-b-liquid');
  if (!tg) return JSON.stringify({ refuse: 'no liquid toggle' });
  if (!tg.classList.contains('is-liquid'))
    return JSON.stringify({ refuse: 'toggle is not in the is-liquid state — nothing to measure' });

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
  const over = (f, b) => ({
    r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a), a: 1,
  });
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const effBg = (el) => {
    const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e);
    let base = { r: 0, g: 0, b: 0, a: 1 };
    for (let i = chain.length - 1; i >= 0; i--) {
      const c = parse(getComputedStyle(chain[i]).backgroundColor);
      if (c && c.a > 0) base = over(c, base);
    }
    return base;
  };
  const r2 = (n) => Math.round(n * 100) / 100;

  const prior = tg.style.background;
  const root = document.documentElement;
  const startTheme = root.getAttribute('data-theme') || 'study-os';
  const storedTheme = localStorage.getItem('jp-os-theme');
  const out = {};
  let frozen = false;
  try {
    const st = document.createElement('style');
    st.id = 'lq-fill-freeze';
    st.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.appendChild(st);
    frozen = !!document.getElementById('lq-fill-freeze');

    for (const id of PALETTES) {
      mod.applyTheme(id, { persist: false });
      const row = {};
      for (const f of FILLS) {
        tg.style.background = `color-mix(in srgb, var(--accent) ${f}%, transparent)`;
        const bg = effBg(tg);
        const fg = parse(getComputedStyle(tg).color);
        row[f] = fg ? r2(ratio(over(fg, bg), bg)) : null;
      }
      tg.style.background = '';
      // Control: no fill at all. The glyph must be legible without the state cue, or the
      // sweep is measuring the fill's contribution rather than the glyph's floor.
      row.noFill = (() => {
        tg.style.background = 'transparent';
        const bg = effBg(tg);
        const fg = parse(getComputedStyle(tg).color);
        tg.style.background = '';
        return fg ? r2(ratio(over(fg, bg), bg)) : null;
      })();
      out[id] = row;
    }
  } finally {
    if (prior) tg.style.background = prior; else tg.style.removeProperty('background');
    mod.applyTheme(startTheme, { persist: false });
    document.getElementById('lq-fill-freeze')?.remove();
    if (storedTheme === null) localStorage.removeItem('jp-os-theme');
    else localStorage.setItem('jp-os-theme', storedTheme);
  }

  let chosen = null;
  const perFill = {};
  for (const f of FILLS) {
    const fails = PALETTES.filter((id) => !(out[id][f] >= BAR)).map((id) => `${id}=${out[id][f]}`);
    perFill[f] = { failing: fails.length, examples: fails.slice(0, 3) };
    if (!fails.length && chosen === null) chosen = f;
  }
  const noFillFails = PALETTES.filter((id) => !(out[id].noFill >= BAR)).map((id) => `${id}=${out[id].noFill}`);

  return JSON.stringify(
    { frozen, restoredTo: root.getAttribute('data-theme'), chosenFill: chosen, perFill,
      glyphFloorWithoutFill: { failing: noFillFails.length, examples: noFillFails }, out },
    null, 1);
})()
