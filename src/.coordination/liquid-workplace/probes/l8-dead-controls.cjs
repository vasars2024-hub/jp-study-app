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
 * THREE CORRECTIONS BEFORE ITS FIRST RUN (the version committed at a3279036 had all three, and
 * each of them manufactures the "0 dead" this probe exists to earn honestly):
 *
 *  1. The observer watched `document.body`. This surface is one `.fwin` on a desktop shell that
 *     has a taskbar, a clock and other windows churning independently, so ANY unrelated mutation
 *     inside the 450 ms settle window was attributed to whichever control had just been clicked.
 *     A probe that scores every control ALIVE reports the same "0 dead" as a perfect surface.
 *     The observer is now scoped to the measured window; document-scope effects are still caught,
 *     because the fingerprint reads `dialogs`, `winCount` and `lsLen` document-wide.
 *
 *  2. Not every control is actuated by a click. `HTMLElement.click()` on `input[type=text]`,
 *     `input[type=number]`, `textarea` or `select` dispatches a click event and changes nothing —
 *     it does not even run the focusing steps, which the spec reserves for real user interaction.
 *     This surface has both (the search box, and the examples `Show` count), so the committed
 *     version would have reported two FALSE DEAD controls and sent the next worker hunting a
 *     product defect that does not exist. Those are now actuated the way a user actuates them —
 *     value set plus a real `input`/`change` — and restored to their captured value.
 *
 *  3. There was no control for DEADNESS itself. `--self-test` injects a real painted button into
 *     the window whose handler does nothing at all and asserts the probe returns DEAD for it. If
 *     that button comes back ALIVE the instrument cannot distinguish the two states and every
 *     number here is void, per the rubric's own rule. The button is removed afterwards and its
 *     removal asserted.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l8-dead-controls.cjs [--limit N]
 *      [--only <substring>] [--self-test]
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
const SELF_TEST = process.argv.includes('--self-test');

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
    { test: (c, l, x) => /^(×|✕|✖)$/.test(x) || /^close$/i.test(l), why: 'closes the window being measured' },
    { test: (c, l, x) => /^(─|—|_)$/.test(x) || /^minimi[sz]e$/i.test(l), why: 'minimises the window being measured' },
    { test: (c, l, x) => /^(▢|□|⛶)$/.test(x) || /^(maximi[sz]e|restore down)$/i.test(l), why: 'maximises — changes the geometry every other number is measured against' },
    { test: (c, l, x) => /^(⧉)$/.test(x) || /pop\\s*(it)?\\s*out/i.test(l), why: 'pops the window out into a separate BrowserWindow' },
    { test: (c) => c.classList.contains('fwin-b-liquid'), why: 'presentation toggle — measured by l1-q78-drive.cjs, not here' },
    { test: (c, l) => /anki|add card|mine/i.test(l) || /anki/i.test(String(c.className || '')), why: 'writes a real note into the user\\'s real Anki collection' },
    { test: (c, l) => /delete|remove|clear|reset|trash/i.test(l), why: 'destructive — userData has no restore point' },
    { test: (c, l) => /copy/i.test(l) || /copy/i.test(String(c.className || '')), why: 'overwrites the system clipboard' },
  ];

  const all = [...win.querySelectorAll(CTRL)].filter(painted);
  const list = all.map((c) => {
    const l = labelOf(c);
    // The raw glyph as well as the resolved label. THE 2026-08-24 FAILURE: every exclusion for the
    // window chrome was written against the glyph, labelOf prefers title/aria-label, and so
    // "Pop out into its own window" never matched /^⧉$/ — the probe popped the surface into a
    // separate BrowserWindow on its FIRST control and scored the other 45 on a detached tree.
    const txt = (c.textContent || '').trim();
    const hit = EXCLUDE.find((r) => r.test(c, l, txt));
    const b = c.getBoundingClientRect();
    const tag = c.tagName.toLowerCase();
    const type = (c.getAttribute('type') || '').toLowerCase();
    // How a user actually actuates this control. 'click' for anything a click activates;
    // 'value' for the ones a click provably does nothing to (see correction 2 in the header).
    const VALUE_INPUT = tag === 'textarea' || tag === 'select'
      || (tag === 'input' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image'].includes(type || 'text'));
    return {
      el: c,
      label: l,
      tag,
      type,
      actuate: VALUE_INPUT ? 'value' : 'click',
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
      // Scoped to the measured window, NOT document.body -- the shell's taskbar and clock churn
      // on their own and would be attributed to whichever control was clicked last.
      obs.observe(this.win, { childList: true, subtree: true, attributes: true, characterData: true });
      this.cur = { i, rec, obs, before: this.fingerprint() };
      return rec;
    },
    /**
     * Actuate control i the way a user does. Returns what it did so the driver reports the
     * actuation rather than assuming one: a control recorded as DEAD after the wrong kind of
     * actuation is a probe defect wearing a product defect's clothes.
     */
    click(i) {
      const c = this.list[i];
      if (!c || !c.el.isConnected) return { clicked: false, why: 'element detached' };
      if (c.actuate !== 'value') { c.el.click(); return { clicked: true, how: 'click' }; }

      const el = c.el;
      const proto = el.tagName.toLowerCase() === 'textarea'
        ? window.HTMLTextAreaElement.prototype
        : (el.tagName.toLowerCase() === 'select' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      if (this.saved == null) this.saved = {};
      if (!(i in this.saved)) this.saved[i] = el.value;
      const original = this.saved[i];

      // Alternate between a probe value and the captured original, so the driver's two-actuation
      // "there and back" contract holds for value controls exactly as it does for clicks.
      let next;
      if (el.tagName.toLowerCase() === 'select') {
        const opts = [...el.options].map((o) => o.value);
        next = el.value === original ? (opts.find((v) => v !== original) ?? original) : original;
      } else if (c.type === 'number' || c.type === 'range') {
        const cur = Number(el.value);
        const lo = el.min === '' ? cur - 1 : Number(el.min);
        const hi = el.max === '' ? cur + 1 : Number(el.max);
        const alt = String(cur === lo ? Math.min(cur + 1, hi) : Math.max(cur - 1, lo));
        next = el.value === original ? alt : original;
      } else {
        next = el.value === original ? original + '__l8' : original;
      }
      if (next === el.value) return { clicked: false, why: 'no distinct alternate value exists' };
      setter.call(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { clicked: true, how: 'value', from: original, to: next };
    },
    /** Put every value control this run touched back to the value it was found holding. */
    restoreValues() {
      const out = [];
      for (const key of Object.keys(this.saved || {})) {
        const c = this.list[Number(key)];
        if (!c || !c.el.isConnected) { out.push({ i: Number(key), restored: false, why: 'detached' }); continue; }
        const el = c.el;
        const proto = el.tagName.toLowerCase() === 'textarea'
          ? window.HTMLTextAreaElement.prototype
          : (el.tagName.toLowerCase() === 'select' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, this.saved[key]);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        out.push({ i: Number(key), restored: el.value === this.saved[key], value: el.value });
      }
      return out;
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

/**
 * The DEADNESS control. Injects a real, painted, clickable button into the measured window whose
 * handler does nothing whatsoever, and appends it to `__l8.list` so the driver probes it through
 * exactly the same path as a product control. If it comes back ALIVE, the instrument cannot tell
 * the two states apart and every number this probe produces is VOID, not 10.
 */
const PLANT_DEAD = `(() => {
  const l8 = window.__l8;
  if (!l8) return JSON.stringify({ refuse: 'not installed' });
  const b = document.createElement('button');
  b.type = 'button';
  b.id = '__l8_dead_control';
  b.textContent = 'l8 dead control';
  b.style.cssText = 'position:absolute;left:8px;bottom:8px;width:120px;height:24px;opacity:1;z-index:1';
  b.addEventListener('click', () => {});
  l8.win.appendChild(b);
  const r = b.getBoundingClientRect();
  const painted = typeof b.checkVisibility === 'function'
    ? b.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
  l8.list.push({ el: b, label: 'l8 dead control', tag: 'button', type: '', actuate: 'click',
    cls: '__l8_dead', box: Math.round(r.width) + 'x' + Math.round(r.height), disabled: false, excluded: null });
  return JSON.stringify({ i: l8.list.length - 1, painted, box: Math.round(r.width) + 'x' + Math.round(r.height) });
})()`;

const UNPLANT_DEAD = `(() => {
  const b = document.getElementById('__l8_dead_control');
  if (b) b.remove();
  const l8 = window.__l8;
  if (l8 && l8.list.length && l8.list[l8.list.length - 1].cls === '__l8_dead') l8.list.pop();
  return JSON.stringify({ gone: !document.getElementById('__l8_dead_control') });
})()`;

/**
 * The ALIVENESS control — the guard whose absence made the 2026-08-24 run's 45 false DEADs
 * indistinguishable from a genuinely dead surface. A planted button that DOES mutate the measured
 * window (it appends a marker, and removes it again on the second click, so it restores itself
 * exactly like a real toggle). If this reads DEAD the probe is not observing the window it thinks
 * it is, and every DEAD it reports is void. Deadness and aliveness are two different claims and
 * each needs its own control.
 */
const PLANT_ALIVE = `(() => {
  const l8 = window.__l8;
  if (!l8) return JSON.stringify({ refuse: 'not installed' });
  const b = document.createElement('button');
  b.type = 'button';
  b.id = '__l8_alive_control';
  b.textContent = 'l8 alive control';
  b.style.cssText = 'position:absolute;left:136px;bottom:8px;width:120px;height:24px;opacity:1;z-index:1';
  b.addEventListener('click', () => {
    const old = document.getElementById('__l8_alive_marker');
    if (old) { old.remove(); return; }
    const s = document.createElement('span');
    s.id = '__l8_alive_marker';
    s.textContent = '.';
    l8.win.appendChild(s);
  });
  l8.win.appendChild(b);
  const r = b.getBoundingClientRect();
  l8.list.push({ el: b, label: 'l8 alive control', tag: 'button', type: '', actuate: 'click',
    cls: '__l8_alive', box: Math.round(r.width) + 'x' + Math.round(r.height), disabled: false, excluded: null });
  return JSON.stringify({ i: l8.list.length - 1, box: Math.round(r.width) + 'x' + Math.round(r.height) });
})()`;

const UNPLANT_ALIVE = `(() => {
  const b = document.getElementById('__l8_alive_control');
  if (b) b.remove();
  const m = document.getElementById('__l8_alive_marker');
  if (m) m.remove();
  const l8 = window.__l8;
  if (l8 && l8.list.length && l8.list[l8.list.length - 1].cls === '__l8_alive') l8.list.pop();
  return JSON.stringify({
    gone: !document.getElementById('__l8_alive_control'),
    markerGone: !document.getElementById('__l8_alive_marker'),
  });
})()`;

/**
 * Cheap per-control assertion that the surface still exists and is still the one measured. One
 * control detached the window from the document on the 2026-08-24 run and nothing noticed for 45
 * more controls, because a detached tree mutates for nobody and reads exactly like dead code.
 */
const STILL_THERE = `(() => JSON.stringify({
  attached: !!(window.__l8 && document.contains(window.__l8.win)),
  fwins: document.querySelectorAll('.fwin').length,
}))()`;

const diff = (a, b) => {
  const out = {};
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = [a[k], b[k]];
  return out;
};

/** Probe one control: actuate, settle, read; actuate back, settle, read. Same path for every row. */
async function probeOne(t) {
  await ev(`JSON.stringify(window.__l8.arm(${t.i}))`);
  const c1 = await ev(`JSON.stringify(window.__l8.click(${t.i}))`);
  await sleep(SETTLE);
  const r1 = await ev(`JSON.stringify(window.__l8.read())`);

  // Second actuation: proof of life on the way back, and the restoration in one move.
  await ev(`JSON.stringify(window.__l8.arm(${t.i}))`);
  await ev(`JSON.stringify(window.__l8.click(${t.i}))`);
  await sleep(SETTLE);
  const r2 = await ev(`JSON.stringify(window.__l8.read())`);

  const m1 = r1.mutations || {};
  const totalMut1 = (m1.adds || 0) + (m1.removes || 0) + (m1.attrs || 0) + (m1.text || 0);
  const d1 = r1.before ? diff(r1.before, r1.after) : {};
  const restored = r2.after && r1.before ? Object.keys(diff(r1.before, r2.after)).length === 0 : false;

  return {
    i: t.i,
    label: t.label,
    cls: t.cls,
    box: t.box,
    disabled: t.disabled,
    actuatedBy: c1.how || null,
    clicked: c1.clicked !== false,
    notActuatedWhy: c1.clicked === false ? c1.why : null,
    mutations: totalMut1,
    stateDelta: d1,
    verdict: c1.clicked === false ? 'NOT ACTUATED'
      : (totalMut1 === 0 && Object.keys(d1).length === 0 ? 'DEAD' : 'ALIVE'),
    restoredAfterSecondClick: restored,
    residual: restored ? null : (r2.after && r1.before ? diff(r1.before, r2.after) : null),
  };
}

(async () => {
  const setup = await ev(INSTALL);
  if (setup.refuse) throw new Error(setup.refuse);

  // The deadness control runs FIRST, on a pristine surface, and its verdict gates the census.
  let selfTest = null;
  if (SELF_TEST) {
    const planted = await ev(PLANT_DEAD);
    if (planted.refuse) throw new Error(planted.refuse);
    const res = await probeOne({ i: planted.i, label: 'l8 dead control', cls: '__l8_dead', box: planted.box, disabled: false });
    const removed = await ev(UNPLANT_DEAD);
    selfTest = { planted, verdict: res.verdict, mutations: res.mutations, stateDelta: res.stateDelta, removed };
    process.stderr.write(`SELF-TEST planted dead button -> ${res.verdict} (mutations ${res.mutations})\n`);
    if (res.verdict !== 'DEAD') {
      console.log(JSON.stringify({ VOID: 'the deadness control did not read DEAD; this instrument cannot distinguish a dead control from a live one', selfTest }, null, 2));
      process.exit(3);
    }

    const alive = await ev(PLANT_ALIVE);
    if (alive.refuse) throw new Error(alive.refuse);
    const ares = await probeOne({ i: alive.i, label: 'l8 alive control', cls: '__l8_alive', box: alive.box, disabled: false });
    const aremoved = await ev(UNPLANT_ALIVE);
    selfTest.aliveness = { planted: alive, verdict: ares.verdict, mutations: ares.mutations, restored: ares.restoredAfterSecondClick, removed: aremoved };
    process.stderr.write(`SELF-TEST planted ALIVE button -> ${ares.verdict} (mutations ${ares.mutations})\n`);
    if (ares.verdict !== 'ALIVE') {
      console.log(JSON.stringify({ VOID: 'the aliveness control did not read ALIVE; the probe is not observing the window it thinks it is, so every DEAD it reports is void', selfTest }, null, 2));
      process.exit(3);
    }
  }

  const roster = await ev(`JSON.stringify(window.__l8.list.map((r,i)=>({i,label:r.label,tag:r.tag,type:r.type,actuate:r.actuate,cls:r.cls,box:r.box,disabled:r.disabled,excluded:r.excluded})))`);
  let targets = roster.filter((r) => !r.excluded);
  if (ONLY) targets = targets.filter((r) => (r.label + ' ' + r.cls).toLowerCase().includes(ONLY.toLowerCase()));
  if (LIMIT) targets = targets.slice(0, LIMIT);

  const results = [];
  for (const t of targets) {
    const there = await ev(STILL_THERE);
    if (!there.attached) {
      console.log(JSON.stringify({
        VOID: `the measured window left the document before control ${t.i} (${t.label}); every verdict from here on would be taken on a detached tree, which reads DEAD for everything`,
        lastGoodIndex: results.length ? results[results.length - 1].i : null,
        fwinsInDocument: there.fwins,
        results,
      }, null, 2));
      process.exit(4);
    }
    const res = await probeOne(t);
    results.push(res);
    process.stderr.write(`${t.i} [${t.actuate}] ${t.label} -> ${res.verdict}\n`);
  }

  const valueRestore = await ev(`JSON.stringify(window.__l8.restoreValues())`);
  const dead = results.filter((r) => r.verdict === 'DEAD');
  const unrestored = results.filter((r) => r.verdict === 'ALIVE' && !r.restoredAfterSecondClick);

  console.log(JSON.stringify({
    surface: 'Dictionary (liquid)',
    selfTest,
    controlsTotal: setup.total,
    probed: results.length,
    byActuation: {
      click: results.filter((r) => r.actuatedBy === 'click').length,
      value: results.filter((r) => r.actuatedBy === 'value').length,
      notActuated: results.filter((r) => r.verdict === 'NOT ACTUATED').length,
    },
    excludedCount: setup.excluded.length,
    excluded: setup.excluded,
    disabledPresented: setup.disabled,
    dead: dead.length,
    deadControls: dead.map((r) => ({ label: r.label, cls: r.cls, box: r.box, disabled: r.disabled })),
    aliveNotRestored: unrestored.map((r) => ({ label: r.label, residual: r.residual })),
    valueRestore,
    results,
  }, null, 2));
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
