/**
 * L8 instrument — rubric category 8's first unclaimed number: **dead controls**, defined as
 * "present but with no observable effect".
 *
 * `L1_HONEST_STATES.md` deliberately claimed NO zero here — "that is `honesty-probe` probe A over
 * all 54 controls with a side-effect assertion each — its own slice. **No 0 is claimed for it.**"
 * This is that slice.
 *
 * THE RULE THAT SHAPES THE WHOLE PROBE: a control is only alive if clicking it produces an
 * OBSERVABLE side effect. So every control is clicked for real. Which immediately creates the
 * problem this file spends most of its length on —
 *
 * SOME CONTROLS ON THIS SURFACE MUTATE THE USER'S REAL DATA. `addToAnki` writes a real note into
 * the real collection (the earlier honest-states pass did exactly that, and said so). The window
 * chrome's × destroys the surface being measured. A probe that clicks everything to prove nothing
 * is dead would be a probe that damages the thing it is auditing.
 *
 * The answer is NOT to click them and NOT to silently count them as alive. Each excluded control
 * is reported by name with its reason, and the denominator says so: the score is over
 * `probed`, and `excluded` is printed beside it. An audit that hides its own denominator is the
 * failure mode this repo has already paid for twice.
 *
 * RESTORATION. Every probed control is clicked TWICE — there and back — and the surface
 * fingerprint after the second click is compared against the one before the first. A toggle that
 * returns is both proof of life and its own cleanup. A control whose second click does not restore
 * is reported as `alive, NOT restored` with the residual named, never silently left.
 *
 * WHY MutationObserver AND a fingerprint, not either alone. A mutation count alone calls a
 * re-render with no user-visible result "alive"; a fingerprint alone misses an effect that lands
 * and reverts inside the settle window. Both are reported per control so a reader can disagree.
 *
 * Run: node debug/l8-dead-controls.cjs [--limit N] [--only <substring>]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const LIMIT = Number(argOf('--limit', '0')) || 0;
const ONLY = argOf('--only', '');
const SETTLE = Number(argOf('--settle', '450'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 400)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

/**
 * Installed once and left on `window.__l8`. Everything the driver does afterwards addresses a
 * control by INDEX into `__l8.list`, because a CSS path re-resolved after a React re-render is
 * how a probe ends up clicking a different button than the one it measured.
 */
const INSTALL = `(() => {
  const win = document.querySelector('.fwin');
  if (!win) return JSON.stringify({ refuse: 'no .fwin' });
  const painted = (e) => (typeof e.checkVisibility === 'function'
    ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
    : true);
  const CTRL = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],summary';
  const labelOf = (c) => (c.getAttribute('aria-label') || c.title || (c.textContent || '').trim()
    || c.getAttribute('placeholder') || c.tagName.toLowerCase()).replace(/\\s+/g, ' ').slice(0, 48);

  /**
   * The exclusion table. Every row is a control this probe refuses to click, with the reason it
   * refuses. These are NOT counted as alive and NOT counted as dead — they are reported.
   */
  const EXCLUDE = [
    { test: (c, l) => /^(×|✕|✖)$/.test(l), why: 'closes the window being measured' },
    { test: (c, l) => /^(─|—|_)$/.test(l), why: 'minimises the window being measured' },
    { test: (c, l) => /^(▢|□|⛶)$/.test(l), why: 'maximises — changes the geometry every other number is measured against' },
    { test: (c, l) => /^(⧉)$/.test(l), why: 'pops the window out into a separate BrowserWindow' },
    { test: (c) => c.classList.contains('fwin-b-liquid'), why: 'presentation toggle — measured by l1-q78-drive.cjs, not here' },
    { test: (c, l) => /anki|add card|mine/i.test(l) || /anki/i.test(String(c.className || '')), why: 'writes a real note into the user\\'s real Anki collection' },
    { test: (c, l) => /delete|remove|clear|reset|trash/i.test(l), why: 'destructive — userData has no restore point' },
    { test: (c, l) => /copy/i.test(l) || /copy/i.test(String(c.className || '')), why: 'overwrites the system clipboard' },
  ];

  const all = [...win.querySelectorAll(CTRL)].filter(painted);
  const list = all.map((c) => {
    const l = labelOf(c);
    const hit = EXCLUDE.find((r) => r.test(c, l));
    const b = c.getBoundingClientRect();
    return {
      el: c,
      label: l,
      tag: c.tagName.toLowerCase(),
      cls: String(c.className || '').split(' ')[0],
      box: Math.round(b.width) + 'x' + Math.round(b.height),
      disabled: !!c.disabled || c.getAttribute('aria-disabled') === 'true',
      excluded: hit ? hit.why : null,
    };
  });

  window.__l8 = {
    win,
    list,
    fingerprint() {
      const w = this.win;
      const ae = document.activeElement;
      return {
        chars: (w.textContent || '').length,
        nodes: w.querySelectorAll('*').length,
        entries: w.querySelectorAll('.dict-entry').length,
        openDetails: w.querySelectorAll('details[open]').length,
        expanded: w.querySelectorAll('[aria-expanded="true"]').length,
        pressed: w.querySelectorAll('[aria-pressed="true"]').length,
        checked: [...w.querySelectorAll('input[type=checkbox],input[type=radio]')].filter((i) => i.checked).length,
        selects: [...w.querySelectorAll('select')].map((s) => s.value).join('|'),
        inputs: [...w.querySelectorAll('input[type=text],input:not([type]),input[type=search]')].map((i) => i.value).join('|'),
        dialogs: document.querySelectorAll('[role="dialog"],dialog[open],.modal,[class*="overlay"]').length,
        winCount: document.querySelectorAll('.fwin').length,
        focus: ae ? ae.tagName.toLowerCase() + '.' + String(ae.className || '').split(' ')[0] : null,
        lsLen: window.localStorage.length,
      };
    },
    arm(i) {
      const rec = { adds: 0, removes: 0, attrs: 0, text: 0 };
      const obs = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === 'childList') { rec.adds += m.addedNodes.length; rec.removes += m.removedNodes.length; }
          else if (m.type === 'attributes') rec.attrs += 1;
          else rec.text += 1;
        }
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      this.cur = { i, rec, obs, before: this.fingerprint() };
      return rec;
    },
    click(i) {
      const c = this.list[i];
      if (!c || !c.el.isConnected) return { clicked: false, why: 'element detached' };
      c.el.click();
      return { clicked: true };
    },
    read() {
      const c = this.cur;
      if (!c) return { refuse: 'not armed' };
      c.obs.disconnect();
      return { mutations: c.rec, before: c.before, after: this.fingerprint() };
    },
  };

  return JSON.stringify({
    total: list.length,
    probeable: list.filter((r) => !r.excluded).length,
    excluded: list.filter((r) => r.excluded).map((r) => ({ label: r.label, cls: r.cls, why: r.excluded })),
    disabled: list.filter((r) => r.disabled).map((r) => r.label),
  });
})()`;

const diff = (a, b) => {
  const out = {};
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = [a[k], b[k]];
  return out;
};

(async () => {
  const setup = await ev(INSTALL);
  if (setup.refuse) throw new Error(setup.refuse);

  const roster = await ev(`JSON.stringify(window.__l8.list.map((r,i)=>({i,label:r.label,tag:r.tag,cls:r.cls,box:r.box,disabled:r.disabled,excluded:r.excluded})))`);
  let targets = roster.filter((r) => !r.excluded);
  if (ONLY) targets = targets.filter((r) => (r.label + ' ' + r.cls).toLowerCase().includes(ONLY.toLowerCase()));
  if (LIMIT) targets = targets.slice(0, LIMIT);

  const results = [];
  for (const t of targets) {
    await ev(`JSON.stringify(window.__l8.arm(${t.i}))`);
    const c1 = await ev(`JSON.stringify(window.__l8.click(${t.i}))`);
    await sleep(SETTLE);
    const r1 = await ev(`JSON.stringify(window.__l8.read())`);

    // Second click: proof of life on the way back, and the restoration in one move.
    await ev(`JSON.stringify(window.__l8.arm(${t.i}))`);
    await ev(`JSON.stringify(window.__l8.click(${t.i}))`);
    await sleep(SETTLE);
    const r2 = await ev(`JSON.stringify(window.__l8.read())`);

    const m1 = r1.mutations || {};
    const totalMut1 = (m1.adds || 0) + (m1.removes || 0) + (m1.attrs || 0) + (m1.text || 0);
    const d1 = r1.before ? diff(r1.before, r1.after) : {};
    const restored = r2.after && r1.before ? Object.keys(diff(r1.before, r2.after)).length === 0 : false;

    results.push({
      i: t.i,
      label: t.label,
      cls: t.cls,
      box: t.box,
      disabled: t.disabled,
      clicked: c1.clicked !== false,
      mutations: totalMut1,
      stateDelta: d1,
      verdict: !c1.clicked ? 'DETACHED'
        : (totalMut1 === 0 && Object.keys(d1).length === 0 ? 'DEAD' : 'ALIVE'),
      restoredAfterSecondClick: restored,
      residual: restored ? null : (r2.after && r1.before ? diff(r1.before, r2.after) : null),
    });
    process.stderr.write(`${t.i} ${t.label} -> ${results[results.length - 1].verdict}\n`);
  }

  const dead = results.filter((r) => r.verdict === 'DEAD');
  const unrestored = results.filter((r) => r.verdict === 'ALIVE' && !r.restoredAfterSecondClick);

  console.log(JSON.stringify({
    surface: 'Dictionary (liquid)',
    controlsTotal: setup.total,
    probed: results.length,
    excludedCount: setup.excluded.length,
    excluded: setup.excluded,
    disabledPresented: setup.disabled,
    dead: dead.length,
    deadControls: dead.map((r) => ({ label: r.label, cls: r.cls, box: r.box, disabled: r.disabled })),
    aliveNotRestored: unrestored.map((r) => ({ label: r.label, residual: r.residual })),
    results,
  }, null, 2));
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
