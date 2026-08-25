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
/**
 * The slow-path settle. No control is recorded DEAD until it has been re-probed with this much
 * time, because an effect that lands over IPC after the fast settle reads exactly like no effect
 * at all -- `EntryExplain.forget()` awaits `dictExplanationClear` against a 697k-row database
 * before it clears the panel, and at 450 ms it produced this probe's only DEAD.
 */
const SLOW_SETTLE = Number(argOf('--slow-settle', '3000'));
const SELF_TEST = process.argv.includes('--self-test');
/**
 * WHICH window. `document.querySelector('.fwin')` returns the first one in the DOM, which is a
 * lie the moment a second window exists — a probe on this desk has already scored the Video
 * window as Dictionary and never refused. `--title` matches the window's own title text, and
 * the installer REFUSES by name rather than falling back when no window matches.
 */
const TITLE = argOf('--title', 'Dictionary');

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
const PICK_WIN = `(() => {
    const wanted = ${JSON.stringify(TITLE)};
    const painted = [...document.querySelectorAll('.fwin')].filter((w) => {
      const r = w.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return painted.find((w) => {
      const t = w.querySelector('.fwin-title-text, .fwin-title');
      return !!t && (t.textContent || '').includes(wanted);
    }) || null;
  })()`;

const INSTALL = `(() => {
  const win = ${PICK_WIN};
  if (!win) return JSON.stringify({ refuse: 'no painted .fwin titled ' + ${JSON.stringify(TITLE)} });
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
    // A GLYPH ALONE IS NOT THE WINDOW CHROME. \`Remove saved search\` also renders a bare ×, so the
    // glyph tests matched it first and the run reported a destructive control under the reason
    // "closes the window being measured" — a true exclusion with a false reason, which is what an
    // exclusion table is for getting right. The glyph now only counts when it IS the whole label.
    { test: (c, l, x) => (l === x && /^(×|✕|✖)$/.test(x)) || /^close$/i.test(l), why: 'closes the window being measured' },
    { test: (c, l, x) => (l === x && /^(─|—|_)$/.test(x)) || /^minimi[sz]e$/i.test(l), why: 'minimises the window being measured' },
    { test: (c, l, x) => (l === x && /^(▢|□|⛶)$/.test(x)) || /^(maximi[sz]e|restore down)$/i.test(l), why: 'maximises — changes the geometry every other number is measured against' },
    { test: (c, l, x) => /^(⧉)$/.test(x) || /pop\\s*(it)?\\s*out/i.test(l), why: 'pops the window out into a separate BrowserWindow' },
    { test: (c) => c.classList.contains('fwin-b-liquid'), why: 'presentation toggle — measured by l1-q78-drive.cjs, not here' },
    { test: (c, l) => /anki|add card|mine/i.test(l) || /anki/i.test(String(c.className || '')), why: 'writes a real note into the user\\'s real Anki collection' },
    // \`forget\` belongs here and was missing: \`Forget this explanation\` deletes the stored model
    // answer through \`dictExplanationClear\` and there is no undo on the control, so the
    // 2026-08-24 run destroyed a cached explanation in order to prove the button was not dead.
    { test: (c, l) => /delete|remove|clear|reset|trash|forget/i.test(l), why: 'destructive — userData has no restore point' },
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

  /**
   * A DURABLE IDENTITY for every control, because an element reference is not one.
   *
   * THE 2026-08-24 RUN 2 FAILURE: control 6 (中文) re-renders the whole result list, so React
   * replaces every node from index 14 on. \`click(i)\` then found \`el.isConnected === false\` and
   * returned NOT ACTUATED for all 35 of them — 35 controls with no verdict, reported as if the
   * probe had refused them, when in fact the probe had lost them. The identity is
   * label|tag|type|firstClass plus the ordinal among entries sharing it, so the twelve
   * per-entry "Add to Anki"s stay twelve distinct rows rather than collapsing onto one.
   */
  const keyOf = (label, tag, type, cls) => [label, tag, type, cls].join('\\u0001');
  const ordSeen = new Map();
  for (const r of list) {
    r.key = keyOf(r.label, r.tag, r.type, r.cls);
    const n = ordSeen.get(r.key) || 0;
    r.ord = n;
    ordSeen.set(r.key, n + 1);
    r.gone = false;
  }

  const activeNow = [...win.querySelectorAll('button')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true'
      || /(^|\\s)(active|selected|current|is-on)(\\s|$)/.test(String(b.className || '')))
    .map((b) => (b.textContent || '').trim())
    .filter((t) => t.length > 0 && t.length < 24);
  const queryInput = win.querySelector('input[type=text],input[type=search],input:not([type])');

  window.__l8 = {
    win,
    list,
    /** The surface as found. restoreBaseline() steers back to exactly this. */
    baseline: { active: activeNow, query: queryInput ? queryInput.value : null },
    lsBefore: Object.fromEntries([...Array(localStorage.length).keys()]
      .map((n) => localStorage.key(n)).filter(Boolean).map((k) => [k, localStorage.getItem(k)])),
    /**
     * Undo the persistence the census itself created, and only that.
     *
     * \`Save search\` writes \`jp-os-dictionary-saved-searches-v1\`, so the 2026-08-24 run left a
     * key behind and the next one started from a surface with an extra chip on it. Keys the
     * census ADDED are removed; keys it merely CHANGED are reported and left alone, because the
     * shell writes its own geometry during a run and reverting that would be a side effect of the
     * cleanup rather than the end of one.
     */
    lsSettle() {
      const now = Object.fromEntries([...Array(localStorage.length).keys()]
        .map((n) => localStorage.key(n)).filter(Boolean).map((k) => [k, localStorage.getItem(k)]));
      const added = Object.keys(now).filter((k) => !(k in this.lsBefore));
      const changed = Object.keys(now).filter((k) => k in this.lsBefore && now[k] !== this.lsBefore[k]);
      const removed = Object.keys(this.lsBefore).filter((k) => !(k in now));
      for (const k of added) localStorage.removeItem(k);
      return { addedAndRemoved: added, changedLeftAlone: changed, disappeared: removed };
    },
    /**
     * Re-bind every entry whose node React has replaced. Called before each control is armed, so
     * the census measures the control it named rather than a corpse of it.
     *
     * A row that no longer has a live counterpart is marked \`gone\` — an honest third state. It is
     * NOT dead (nothing was clicked) and NOT alive; it is a control the surface stopped offering
     * after an earlier control changed the surface, and it is reported by name.
     */
    rematch() {
      if (!document.contains(this.win)) {
        // Re-pick by TITLE, never by document order: a detached window re-bound to whichever
        // .fwin happened to be first is how a run silently finishes on a different surface.
        // (No backticks in this comment -- it lives inside a template literal.)
        const w = ${PICK_WIN};
        if (w) this.win = w;
      }
      const detached = this.list.filter((r) => !r.el.isConnected);
      if (!detached.length) return { detached: 0, rebound: 0, gone: 0, goneLabels: [] };
      const byKey = new Map();
      // A SECOND index without the label, because a cycling control's label is its state: the
      // word-status button reads "食べる: New. Click to mark it Learning." and then "…: Learning.
      // Click to mark it Familiar." — same control, different key. Class plus ordinal survives that.
      const byCls = new Map();
      for (const c of [...this.win.querySelectorAll(CTRL)].filter(painted)) {
        const cls = String(c.className || '').split(' ')[0];
        const tt = c.tagName.toLowerCase();
        const ty = (c.getAttribute('type') || '').toLowerCase();
        const push = (m, k) => { const a = m.get(k) || []; a.push(c); m.set(k, a); };
        push(byKey, keyOf(labelOf(c), tt, ty, cls));
        push(byCls, keyOf('', tt, ty, cls));
      }
      // The class-ordinal of each roster row, computed the same way, so the fallback lines up.
      const clsOrd = new Map();
      for (const r of this.list) {
        const k = keyOf('', r.tag, r.type, r.cls);
        const n = clsOrd.get(k) || 0;
        r.clsKey = k;
        r.clsOrd = n;
        clsOrd.set(k, n + 1);
      }
      let rebound = 0;
      let reboundByClass = 0;
      const goneLabels = [];
      for (const r of detached) {
        let el = (byKey.get(r.key) || [])[r.ord];
        if (!el) { el = (byCls.get(r.clsKey) || [])[r.clsOrd]; if (el) reboundByClass += 1; }
        if (el) { r.el = el; r.gone = false; rebound += 1; } else { r.gone = true; goneLabels.push(r.label); }
      }
      return { detached: detached.length, rebound, reboundByClass, gone: goneLabels.length, goneLabels };
    },
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
    /**
     * The mutually-exclusive group control i belongs to, or null.
     *
     * A "group" here is a set of sibling controls of which EXACTLY ONE is active — a segmented
     * picker. Both of this surface's are: \`.dict-lang-toggle\` marks its choice with a bare
     * \`active\` class and no ARIA at all, \`.lexicon-lens-picker\` uses \`aria-pressed\` AND the
     * class. Read both, because reading only ARIA misses the first one entirely.
     */
    groupOf(i) {
      const c = this.list[i];
      if (!c || !c.el.isConnected || !c.el.parentElement) return null;
      const isActive = (s) => s.getAttribute('aria-pressed') === 'true'
        || s.getAttribute('aria-selected') === 'true' || s.getAttribute('aria-checked') === 'true'
        || /(^|\\s)(active|selected|current|is-on)(\\s|$)/.test(String(s.className || ''));
      const members = [...c.el.parentElement.children].filter((s) => s.matches && s.matches(CTRL) && painted(s));
      if (members.length < 2 || !members.includes(c.el)) return null;
      const actives = members.filter(isActive);
      // Exactly one active is what makes a second click on the same member a no-op rather than an
      // undo. Zero or several means it is a toolbar, and the ordinary there-and-back applies.
      if (actives.length !== 1) return null;
      return { members, active: actives[0], selfActive: actives[0] === c.el };
    },
    /**
     * Put control i into a state where clicking it is a real state change, and record how to put
     * the group back afterwards. Both branches fix a verdict the 2026-08-24 run got wrong:
     *
     *  - i is the ACTIVE member ("Automatic"): clicking it is a no-op BY DESIGN, so it read DEAD.
     *    Click another member first and the probe click has something to change. That probe click
     *    is then its own restoration.
     *  - i is an inactive member (中文): clicking it selects it and a second click does NOT undo
     *    it. The 2026-08-24 run left the surface on Chinese glosses, 8 entries collapsed to 2, and
     *    the 35 per-entry controls after it were honestly absent — GONE, not measurable. The
     *    restoring actuation is a click on the member that WAS active.
     */
    preArm(i) {
      this.back = null;
      const g = this.groupOf(i);
      if (!g) return { mode: 'plain' };
      const lab = (e) => labelOf(e);
      if (g.selfActive) {
        const other = g.members.find((m) => m !== g.active && !m.disabled
          && !EXCLUDE.some((r) => r.test(m, lab(m), (m.textContent || '').trim())));
        if (!other) return { mode: 'group-sole-safe-member', note: 'no non-excluded sibling to move the group to' };
        other.click();
        return { mode: 'group-active', setupClicked: lab(other), restoreBy: 'the probe click itself' };
      }
      this.back = g.active;
      return { mode: 'group-inactive', wasActive: lab(g.active), restoreBy: lab(g.active) };
    },
    /**
     * Put the SURFACE back, for the controls whose own second actuation cannot.
     *
     * Control 10 on this surface is a saved-search chip: clicking it applies a stored search whose
     * gloss language differs, 8 entries collapse to 2, and clicking it again re-applies the same
     * search. There is no undo on the control. Without this, one such control silently degrades
     * the surface and the 26 per-entry controls after it are honestly absent — the run reports 26
     * GONE and 0 verdicts, which is exactly the shape of a census that measured nothing.
     *
     * It restores by re-selecting the segmented choices that were active at install and, if the
     * result list still does not match, re-running the install-time query. Every action it takes
     * is returned, because a census that repairs the surface silently is a census you cannot audit.
     */
    restoreBaseline() {
      const w = this.win;
      const acts = [];
      const isActive = (s) => s.getAttribute('aria-pressed') === 'true'
        || /(^|\\s)(active|selected|current|is-on)(\\s|$)/.test(String(s.className || ''));
      for (const text of this.baseline.active) {
        const b = [...w.querySelectorAll('button')].find((e) => (e.textContent || '').trim() === text);
        if (b && !isActive(b)) { b.click(); acts.push('reselect ' + text); }
      }
      const q = w.querySelector('input[type=text],input[type=search],input:not([type])');
      if (q && this.baseline.query != null && q.value !== this.baseline.query) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(q, this.baseline.query);
        q.dispatchEvent(new Event('input', { bubbles: true }));
        q.dispatchEvent(new Event('change', { bubbles: true }));
        acts.push('requery ' + this.baseline.query);
      }
      return acts;
    },
    /** Re-run the install-time query. Separate call so the driver can settle between the two. */
    reSearch() {
      const b = [...this.win.querySelectorAll('button')].find((e) => /^search$/i.test((e.textContent || '').trim()));
      if (!b) return { clicked: false, why: 'no Search button' };
      b.click();
      return { clicked: true };
    },
    /** The label control i carries right now. A cycling control's label IS its state. */
    labelNow(i) {
      const c = this.list[i];
      return c && c.el.isConnected ? labelOf(c.el) : null;
    },
    /** The restoring actuation: the member that was active, else a second click on i. */
    unclick(i) {
      if (this.back && this.back.isConnected) {
        const to = labelOf(this.back);
        this.back.click();
        this.back = null;
        return { clicked: true, how: 'group-restore', to };
      }
      this.back = null;
      return this.click(i);
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
      if (!c) return { clicked: false, why: 'no such control index' };
      if (!c.el.isConnected) {
        return c.gone
          ? { clicked: false, gone: true, why: 'the surface no longer offers this control after an earlier control changed it' }
          : { clicked: false, why: 'element detached and rematch was not run' };
      }
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
async function probeOne(t, settle = SETTLE) {
  // Re-resolve BEFORE arming, never after. Any earlier control that re-rendered the result list
  // has replaced the nodes this roster is holding, and an armed observer on a corpse records
  // nothing for any reason at all.
  const rm = await ev(`JSON.stringify(window.__l8.rematch())`);
  // The surface as this control found it. Restoration is measured against THIS, not against the
  // post-setup state, because what the census owes the next control is the original surface.
  const origin = await ev(`JSON.stringify(window.__l8.fingerprint())`);
  const labelBefore = await ev(`JSON.stringify(window.__l8.labelNow(${t.i}))`);
  const pre = await ev(`JSON.stringify(window.__l8.preArm(${t.i}))`);
  if (pre.mode !== 'plain') await sleep(settle);
  await ev(`JSON.stringify(window.__l8.rematch())`);
  await ev(`JSON.stringify(window.__l8.arm(${t.i}))`);
  const c1 = await ev(`JSON.stringify(window.__l8.click(${t.i}))`);
  await sleep(settle);
  const r1 = await ev(`JSON.stringify(window.__l8.read())`);

  // Second actuation: proof of life on the way back, and the restoration in one move. Rematch
  // again — the FIRST actuation is the most likely one to have replaced this very node.
  const rm2 = await ev(`JSON.stringify(window.__l8.rematch())`);
  await ev(`JSON.stringify(window.__l8.arm(${t.i}))`);
  const c2 = await ev(`JSON.stringify(window.__l8.unclick(${t.i}))`);
  await sleep(settle);
  const r2 = await ev(`JSON.stringify(window.__l8.read())`);
  await ev(`JSON.stringify(window.__l8.rematch())`);

  /**
   * A CYCLING control is not a toggle and two clicks do not undo it. The word-status button walks
   * New -> Learning -> Familiar -> Known -> New, so the 2026-08-24 run's there-and-back left all
   * EIGHT looked-up words marked "Familiar" in the user's real study data and nothing noticed,
   * because the fingerprint's `chars` moved by five and read as ordinary churn. Keep actuating
   * until the label is the one it started with, bounded, and report the count.
   */
  let cycle = null;
  if (c2.how !== 'group-restore' && labelBefore) {
    let lab = await ev(`JSON.stringify(window.__l8.labelNow(${t.i}))`);
    let n = 0;
    let oneWay = false;
    while (lab && lab !== labelBefore && n < 6) {
      const was = lab;
      await ev(`JSON.stringify(window.__l8.click(${t.i}))`);
      await sleep(settle);
      await ev(`JSON.stringify(window.__l8.rematch())`);
      lab = await ev(`JSON.stringify(window.__l8.labelNow(${t.i}))`);
      n += 1;
      // A cycle moves. A label that does not move is a ONE-WAY control, and hammering it six
      // times only re-triggers whatever it does — `Play <word>` becomes `No recording for this
      // word` and stays there, so the extra five clicks were five more failed audio lookups.
      if (lab === was) { oneWay = true; break; }
    }
    if (n) cycle = { extraActuations: n, labelBefore, labelAfter: lab, closed: lab === labelBefore, oneWay };
  }

  const final = await ev(`JSON.stringify(window.__l8.fingerprint())`);

  const m1 = r1.mutations || {};
  const totalMut1 = (m1.adds || 0) + (m1.removes || 0) + (m1.attrs || 0) + (m1.text || 0);
  const d1 = r1.before ? diff(r1.before, r1.after) : {};
  let originResidual = diff(origin, final);
  let repair = null;
  if (Object.keys(originResidual).length) {
    // One unrestorable control must not cost the census every control after it.
    const acts = await ev(`JSON.stringify(window.__l8.restoreBaseline())`);
    if (acts.length) {
      await sleep(settle);
      if (acts.some((a) => a.startsWith('requery'))) {
        await ev(`JSON.stringify(window.__l8.reSearch())`);
        await sleep(settle * 2);
      }
      await ev(`JSON.stringify(window.__l8.rematch())`);
      const after = await ev(`JSON.stringify(window.__l8.fingerprint())`);
      repair = { actions: acts, residualAfterRepair: diff(origin, after) };
      originResidual = repair.residualAfterRepair;
    }
  }
  const restored = Object.keys(originResidual).length === 0;

  return {
    i: t.i,
    label: t.label,
    cls: t.cls,
    box: t.box,
    disabled: t.disabled,
    actuatedBy: c1.how || null,
    clicked: c1.clicked !== false,
    notActuatedWhy: c1.clicked === false ? c1.why : null,
    rematch: rm.rebound || rm.gone ? rm : null,
    rematchBeforeSecond: rm2.rebound || rm2.gone ? rm2 : null,
    group: pre.mode === 'plain' ? null : pre,
    restoredBy: c2.how || null,
    cycleRestore: cycle,
    surfaceRepair: repair,
    mutations: totalMut1,
    stateDelta: d1,
    verdict: c1.clicked === false ? (c1.gone ? 'GONE' : 'NOT ACTUATED')
      : (totalMut1 === 0 && Object.keys(d1).length === 0 ? 'DEAD' : 'ALIVE'),
    restoredAfterSecondClick: restored,
    residual: restored ? null : originResidual,
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
    let res = await probeOne(t);
    // A DEAD is the one verdict this probe exists to produce, so it is the one that has to survive
    // a second look. Re-probe it with the slow settle before recording it: an effect that lands
    // over IPC after 450 ms is indistinguishable from no effect, and that is a probe defect
    // wearing a product defect's clothes.
    if (res.verdict === 'DEAD' && SLOW_SETTLE > SETTLE) {
      const slow = await probeOne(t, SLOW_SETTLE);
      process.stderr.write(`${t.i} [${t.actuate}] ${t.label} -> DEAD at ${SETTLE}ms, re-probed at ${SLOW_SETTLE}ms -> ${slow.verdict}\n`);
      res = { ...slow, deadAtFastSettle: true, fastSettleMutations: res.mutations, settleMs: SLOW_SETTLE };
    }
    results.push(res);
    process.stderr.write(`${t.i} [${t.actuate}] ${t.label} -> ${res.verdict}\n`);
  }

  const valueRestore = await ev(`JSON.stringify(window.__l8.restoreValues())`);
  await ev(`JSON.stringify(window.__l8.restoreBaseline())`);
  await sleep(SETTLE);
  const lsSettle = await ev(`JSON.stringify(window.__l8.lsSettle())`);
  const finalSurface = await ev(`JSON.stringify(window.__l8.fingerprint())`);
  const dead = results.filter((r) => r.verdict === 'DEAD');
  const unrestored = results.filter((r) => r.verdict === 'ALIVE' && !r.restoredAfterSecondClick);

  console.log(JSON.stringify({
    surface: TITLE,
    selfTest,
    controlsTotal: setup.total,
    probed: results.length,
    byActuation: {
      click: results.filter((r) => r.actuatedBy === 'click').length,
      value: results.filter((r) => r.actuatedBy === 'value').length,
      notActuated: results.filter((r) => r.verdict === 'NOT ACTUATED').length,
      gone: results.filter((r) => r.verdict === 'GONE').length,
    },
    verdicts: results.reduce((a, r) => { a[r.verdict] = (a[r.verdict] || 0) + 1; return a; }, {}),
    rebound: results.reduce((a, r) => a + ((r.rematch && r.rematch.rebound) || 0)
      + ((r.rematchBeforeSecond && r.rematchBeforeSecond.rebound) || 0), 0),
    goneControls: results.filter((r) => r.verdict === 'GONE').map((r) => ({ label: r.label, cls: r.cls })),
    excludedCount: setup.excluded.length,
    excluded: setup.excluded,
    disabledPresented: setup.disabled,
    dead: dead.length,
    deadControls: dead.map((r) => ({ label: r.label, cls: r.cls, box: r.box, disabled: r.disabled })),
    oneWayControls: results.filter((r) => r.cycleRestore && r.cycleRestore.oneWay)
      .map((r) => ({ label: r.cycleRestore.labelBefore, becomes: r.cycleRestore.labelAfter, cls: r.cls })),
    aliveNotRestored: unrestored.map((r) => ({ label: r.label, residual: r.residual })),
    valueRestore,
    lsSettle,
    finalSurface,
    results,
  }, null, 2));
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
