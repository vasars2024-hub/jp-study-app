/**
 * L1 acceptance — do the NINE RULES paint `--accent-text`, live, on every light palette?
 *
 * `l1-palette-contrast.js` only sees what is on screen, and it measures the Dictionary window.
 * That covers 4 of the 9 runs (`.dict-reading` x3, `.dict-ex-btn`). The other five —
 * `.novel-link-article a`, `.cs-tag`, `.dict-anki-icon`, `.flash-row-reading`,
 * `.flash-strip-reading`, `.flash-reading`, `.gram-gloss` — live in surfaces that are not open,
 * and "the token computes" is not the same claim as "the rule resolves". A rule can be shadowed
 * by a later `color:` declaration, scoped under an ancestor that is absent, or simply not exist.
 *
 * So: mount one real element per rule, with the ancestor its selector actually requires, read
 * `getComputedStyle().color`, and score it against the palette's own `--panel-2` — the ground
 * that owned every one of the measured failures.
 *
 * NEGATIVE CONTROL, in the same run: a tenth element carrying `color: var(--accent-2)` inline,
 * i.e. the status quo. It must FAIL on all six light palettes. If it passes, the surfaces or the
 * bar are wrong and every green row above it is meaningless.
 *
 * Traps: applyTheme via the engine, refuse below 13 themes, freeze transitions first — a
 * freshly-inserted element has no running transition, but the palette switch does, and the
 * `--panel-2` read would otherwise come from the palette just left.
 */
(() => {
  const LIGHT = ['classic-light', 'soft-sepia', 'ocean-blue', 'mint-green', 'rose-pine', 'paper'];
  const DARK = ['study-os', 'forest-night', 'high-contrast'];
  const BAR = 4.5;

  // [class to apply, tag, optional ancestor spec]. The ancestor matters: `.novel-link-article a`
  // does not match a bare <a>, and mounting one without the wrapper would read the UA link blue
  // and score it as a pass on nothing.
  const RULES = [
    { name: '.novel-link-article a', tag: 'a', wrapClass: 'novel-link-article' },
    { name: '.dict-reading', tag: 'div', cls: 'dict-reading' },
    { name: '.dict-anki-icon', tag: 'span', cls: 'dict-anki-icon' },
    { name: '.cs-tag', tag: 'span', cls: 'cs-tag' },
    { name: '.flash-row-reading', tag: 'div', cls: 'flash-row-reading' },
    { name: '.flash-strip-reading', tag: 'div', cls: 'flash-strip-reading' },
    { name: '.flash-reading', tag: 'div', cls: 'flash-reading' },
    { name: '.gram-gloss', tag: 'div', cls: 'gram-gloss' },
    { name: '.dict-ex-btn', tag: 'button', cls: 'dict-ex-btn' },
  ];

  const mod = window.__lqTheme && window.__lqTheme.mod;
  if (!mod) return JSON.stringify({ refuse: 'run l1-palette-contrast-load.js first' });
  const registered = mod.listThemes().length;
  if (registered < 13)
    return JSON.stringify({ refuse: `duplicate module copy — ${registered} themes, expected 13` });

  // `color(srgb r g b)` is NOT optional here, and leaving it out produced a false PASS on the
  // first run of this probe: on a light palette `--accent-text` is a `color-mix`, which computes
  // to `color(srgb ...)`, so every one of the nine rows parsed to null and refused. `failing`
  // counts `pass === false`, a refused row has no `pass`, and the palette therefore reported
  // "0 failing" having measured nothing. `min` was the only tell — Infinity serialises as null.
  const parse = (s) => {
    const fn = String(s || '').match(/^color\(\s*[a-z0-9-]+\s+([^)]+)\)$/i);
    if (fn) {
      const n = fn[1].replace(/\//g, ' ').trim().split(/\s+/).map(Number);
      if (n.length >= 3 && n.every(Number.isFinite))
        return { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n.length > 3 ? n[3] : 1 };
      return null;
    }
    const m = String(s || '').match(/^rgba?\(([^)]+)\)$/i);
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

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  const mounted = [];
  for (const r of RULES) {
    let parent = host;
    if (r.wrapClass) {
      const w = document.createElement('div');
      w.className = r.wrapClass;
      host.appendChild(w);
      parent = w;
    }
    const el = document.createElement(r.tag);
    if (r.cls) el.className = r.cls;
    el.textContent = '読み';
    parent.appendChild(el);
    mounted.push({ name: r.name, el });
  }
  // The control: the status quo declaration, inline, on the same ground.
  const ctl = document.createElement('div');
  ctl.style.color = 'var(--accent-2)';
  ctl.textContent = '読み';
  host.appendChild(ctl);
  document.body.appendChild(host);

  const FREEZE_ID = 'lq-accent-rules-freeze';
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

    for (const id of [...LIGHT, ...DARK]) {
      mod.applyTheme(id, { persist: false });
      const cs = getComputedStyle(root);
      const pageBg = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
      // Read --panel-2 through a probe so a var chain resolves; it is a hex in every palette.
      const p2raw = cs.getPropertyValue('--panel-2').trim();
      const tmp = document.createElement('span');
      tmp.style.color = p2raw || 'transparent';
      host.appendChild(tmp);
      const ground = parse(getComputedStyle(tmp).color);
      tmp.remove();
      if (!ground) {
        out[id] = { refuse: `--panel-2 did not resolve: "${p2raw}"` };
        continue;
      }
      const bg = over(ground, pageBg);

      const rows = {};
      const refused = [];
      for (const m of mounted) {
        const c = parse(getComputedStyle(m.el).color);
        if (!c) {
          rows[m.name] = { refuse: `colour did not parse: ${getComputedStyle(m.el).color}` };
          refused.push(m.name);
          continue;
        }
        const r = ratio(over(c, bg), bg);
        rows[m.name] = { hex: hex(c), r: r2(r), pass: r >= BAR };
      }
      const cc = parse(getComputedStyle(ctl).color);
      const cr = cc ? ratio(over(cc, bg), bg) : null;
      out[id] = {
        light: LIGHT.includes(id),
        ground: hex(bg),
        // A refused row is not a passing row. Reported separately so "0 failing" can never mean
        // "0 measured" again.
        refused,
        measured: mounted.length - refused.length,
        failing: Object.values(rows).filter((x) => x.pass === false).length,
        min: r2(Math.min(...Object.values(rows).map((x) => (typeof x.r === 'number' ? x.r : Infinity)))),
        rows,
        control: cc ? { hex: hex(cc), r: r2(cr), pass: cr >= BAR } : null,
      };
    }
  } finally {
    mod.applyTheme(startTheme, { persist: false });
    document.getElementById(FREEZE_ID)?.remove();
    host.remove();
    if (storedTheme === null) localStorage.removeItem('jp-os-theme');
    else localStorage.setItem('jp-os-theme', storedTheme);
  }

  const lightFailing = LIGHT.reduce((n, id) => n + ((out[id] && out[id].failing) || 0), 0);
  const darkFailing = DARK.reduce((n, id) => n + ((out[id] && out[id].failing) || 0), 0);
  const controlValid = LIGHT.every((id) => out[id] && out[id].control && out[id].control.pass === false);
  // The run is only readable if every palette measured all nine. Anything less is VOID.
  const totalRefused = [...LIGHT, ...DARK].reduce((n, id) => n + ((out[id] && out[id].refused?.length) || 0), 0);

  return JSON.stringify(
    {
      frozen,
      registered,
      restoredTo: root.getAttribute('data-theme'),
      rulesMeasured: mounted.length,
      totalRefused,
      void: totalRefused > 0,
      lightFailing,
      darkFailing,
      controlFailsEverywhereOnLight: controlValid,
      out,
    },
    null,
    1,
  );
})()
