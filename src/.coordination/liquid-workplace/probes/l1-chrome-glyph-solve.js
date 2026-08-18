/**
 * L1 solver — the last five category-1 failures on the Liquid Dictionary window.
 *
 * After `27e8e313` the window measures 5 failing on classic-light, all of them window chrome:
 *   `.fwin-b` "─" "▢" "⧉" at 3.28:1  — `color: var(--muted)` (styles.css `.fwin-b`)
 *   `.fwin-b-liquid.is-liquid` "◆" at 3.06:1 — `color: var(--accent)` (liquid-window.css:103)
 *
 * Two different defects that happen to sit next to each other:
 *
 *  - The ◆ is the SAME defect `--accent-text` was created for, one file over: the raw accent
 *    painted as a glyph on light chrome. It needs the token, not a new number.
 *  - The other three are `--muted`, which is a shared body-text token another track is actively
 *    darkening across four palettes right now. Moving it from here would collide with that work
 *    and is wider than the window. Instead `.fwin-b` derives its own colour from `--text` mixed
 *    toward the bar's own `--sidebar` — bidirectional by construction, so ONE declaration serves
 *    all thirteen palettes with no per-palette override to forget.
 *
 * Since the glyph should stay QUIET until hover, the wanted share is the SMALLEST text share that
 * still clears the bar — the most background it can absorb and remain legible. That is the
 * opposite direction from the accent solver, and stating it wrong would pick the loudest value
 * that passes rather than the quietest.
 *
 * Measured on the REAL buttons in the REAL window, with `effBg` walking the ancestor chain and
 * compositing — the Liquid bar is `background: transparent` over the frame material, so a
 * declared-colour reading would measure a ground that is not painted.
 *
 * Traps: engine applyTheme, refuse under 13, freeze transitions, restore every inline colour.
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
    'dark-nebula',
    'oled-black',
    'midnight-ink',
    'cyberpunk',
  ];
  const SHARES = [55, 60, 65, 70, 75, 80, 85, 90, 100];
  const TITLE = 'Dictionary';
  const BAR = 4.5;

  const mod = window.__lqTheme && window.__lqTheme.mod;
  if (!mod) return JSON.stringify({ refuse: 'run l1-palette-contrast-load.js first' });
  const registered = mod.listThemes().length;
  if (registered < 13) return JSON.stringify({ refuse: `${registered} themes, expected 13` });

  const win = [...document.querySelectorAll('.fwin')].find((w) =>
    (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });

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
  const hex = (c) =>
    '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const r2 = (n) => Math.round(n * 100) / 100;

  const btns = [...win.querySelectorAll('.fwin-b')];
  if (!btns.length) return JSON.stringify({ refuse: 'no .fwin-b in that window' });
  const plain = btns.filter((b) => !b.classList.contains('fwin-b-liquid'));
  const toggle = btns.filter((b) => b.classList.contains('fwin-b-liquid'));
  const priorInline = btns.map((b) => b.style.color);

  const FREEZE_ID = 'lq-chrome-glyph-freeze';
  const root = document.documentElement;
  const startTheme = root.getAttribute('data-theme') || 'study-os';
  const storedTheme = localStorage.getItem('jp-os-theme');
  const out = {};
  let frozen = false;
  try {
    const st = document.createElement('style');
    st.id = FREEZE_ID;
    st.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.appendChild(st);
    frozen = !!document.getElementById(FREEZE_ID);

    for (const id of PALETTES) {
      mod.applyTheme(id, { persist: false });
      const row = { shares: {}, toggle: {} };

      // Status quo, the control: whatever the sheet paints right now.
      for (const b of btns) b.style.color = '';
      row.statusQuoPlain = plain.length
        ? (() => {
            const bg = effBg(plain[0]);
            const fg = parse(getComputedStyle(plain[0]).color);
            return fg ? { hex: hex(fg), on: hex(bg), r: r2(ratio(over(fg, bg), bg)) } : null;
          })()
        : null;
      row.statusQuoToggle = toggle.length
        ? (() => {
            const bg = effBg(toggle[0]);
            const fg = parse(getComputedStyle(toggle[0]).color);
            return fg ? { hex: hex(fg), on: hex(bg), r: r2(ratio(over(fg, bg), bg)) } : null;
          })()
        : null;

      for (const p of SHARES) {
        let worst = { r: Infinity, hex: null, on: null };
        for (const b of plain) {
          b.style.color = `color-mix(in srgb, var(--text) ${p}%, var(--sidebar))`;
          const bg = effBg(b);
          const fg = parse(getComputedStyle(b).color);
          if (!fg) {
            worst = { r: NaN, hex: 'UNPARSED', on: null };
            break;
          }
          const r = ratio(over(fg, bg), bg);
          if (r < worst.r) worst = { r, hex: hex(fg), on: hex(bg) };
        }
        row.shares[p] = { hex: worst.hex, on: worst.on, r: r2(worst.r) };
        for (const b of plain) b.style.color = '';
      }

      // The ◆: does the existing --accent-text token clear the bar on the chrome ground?
      for (const b of toggle) {
        b.style.color = 'var(--accent-text)';
        const bg = effBg(b);
        const fg = parse(getComputedStyle(b).color);
        row.toggle.accentText = fg ? { hex: hex(fg), on: hex(bg), r: r2(ratio(over(fg, bg), bg)) } : null;
        b.style.color = '';
      }
      out[id] = row;
    }
  } finally {
    btns.forEach((b, i) => {
      if (priorInline[i]) b.style.color = priorInline[i];
      else b.style.removeProperty('color');
    });
    mod.applyTheme(startTheme, { persist: false });
    document.getElementById(FREEZE_ID)?.remove();
    if (storedTheme === null) localStorage.removeItem('jp-os-theme');
    else localStorage.setItem('jp-os-theme', storedTheme);
  }

  // SMALLEST share clearing the bar everywhere — the quietest legible glyph, not the loudest.
  let chosen = null;
  const perShare = {};
  for (const p of SHARES) {
    const fails = PALETTES.filter((id) => !(out[id].shares[p].r >= BAR)).map(
      (id) => `${id}=${out[id].shares[p].r}`,
    );
    perShare[p] = { failing: fails.length, examples: fails.slice(0, 3) };
    if (!fails.length && chosen === null) chosen = p;
  }

  const sqFailing = PALETTES.filter((id) => out[id].statusQuoPlain && out[id].statusQuoPlain.r < BAR);
  const tgFailing = PALETTES.filter((id) => out[id].statusQuoToggle && out[id].statusQuoToggle.r < BAR);
  const accentTextFailing = PALETTES.filter(
    (id) => !(out[id].toggle.accentText && out[id].toggle.accentText.r >= BAR),
  ).map((id) => `${id}=${out[id].toggle.accentText && out[id].toggle.accentText.r}`);

  return JSON.stringify(
    {
      frozen,
      registered,
      restoredTo: root.getAttribute('data-theme'),
      buttons: { plain: plain.length, toggle: toggle.length },
      chosenShare: chosen,
      perShare,
      controlStatusQuoPlainFailsOn: sqFailing,
      controlStatusQuoToggleFailsOn: tgFailing,
      accentTextOnToggleFailsOn: accentTextFailing,
      out,
    },
    null,
    1,
  );
})()
