/**
 * L1 instrument — the dead-end half of rubric category 2, and its named negative control.
 *
 * A dead end is a control that is present, enabled, and leads nowhere: clicking it produces no
 * observable change. This drives each control on the surface's dominant-task path and diffs a
 * signature of the window before and after. Anything that moves is an effect; nothing moving is a
 * dead-end candidate.
 *
 * THE CONTROL, and why it is injected. The rubric requires that a deliberately wrong flow be
 * reported as a dead end — "if everything you try scores clean, the probe is not discriminating."
 * So a handler-less button is injected into the window, driven exactly like the rest, and removed
 * by `-read.js`. If the injected button is not reported, every 0 this probe prints is void.
 *
 * DESTRUCTIVE CONTROLS ARE SKIPPED BY NAME, not silently: the skipped list is reported so the
 * count says what it covered. Window chrome is skipped for the same reason — closing the window
 * would end the measurement.
 *
 * ## The three false results this instrument has produced, and what each one cost
 *
 * 1. **42 dead ends of 45** (2026-08-16). All 46 targets were resolved up front and then clicked
 *    in order; target 2 was `中文`, which wipes the result list, so the 43 rows after it clicked
 *    DETACHED nodes. Fixed by re-resolving before each click, reporting `gone` rather than "dead",
 *    and moving mode/view switchers out of the sweep order.
 *
 * 2. **16 of 35 targets `gone` on every run** (2026-08-22 → fixed 2026-08-24). Re-resolution was
 *    by LABEL, and a label is not an identity here: `label()` returned `''` for an icon-only
 *    button while the roster stored the display fallback `'(unlabelled)'`, so `label(el) === name`
 *    could never match one. Their dead-end status was simply unmeasured — a 0 covering 19 controls
 *    is not a 0 covering 35. The occurrence index was wrong for a second reason: it counted
 *    earlier *targets* sharing a name while indexing into the *live* control list, which also
 *    holds the skipped ones. Both fixed with the durable identity `l8-dead-controls.cjs` uses —
 *    `label|tag|type|firstClass` plus the ordinal among painted controls sharing it, computed over
 *    EVERY painted control so the index lines up, with a class-only fallback for a control whose
 *    label is its own state. `resolvedBy` is reported, so a run leaning on the fallback says so.
 *
 * 3. **20 dead ends, 16 of them real writes to user data** (2026-08-24, the run that fix 2 made
 *    possible). Two defects, both here rather than in the app:
 *    - `label()` read `aria-label`/`textContent`/`placeholder` but never `title`, so the eight
 *      `Copy to clipboard history` and eight `Save to Flashcards` buttons had no name for the
 *      DESTRUCTIVE rule to match. The sweep clicked all sixteen: **6 words into the flashcard
 *      store and 8 rows into clipboard history** (the two 食べる entries share a word, so the
 *      second star toggled the first one back off). All fourteen were undone and verified.
 *    - `signature()` compared text, control count, entry count, aria state and scroll — and
 *      nothing else. A star that flips `class="dict-star lq-hit"` to `…on` and `title` to
 *      `Saved to Flashcards` moves none of those, so a real write read as `changed: false`. The
 *      signature now carries every control's class, title and aria-label, plus open/expanded
 *      counts, which is what makes an icon-only toggle observable at all.
 *
 * ## Quiescence, because the bait failed to fail
 *
 * That same run reported the injected bait as `changed: true`. Nothing clicked it into life: by
 * then `Explain again` and `Find example sentences` had async work in flight ("Asking the model…",
 * "Searching sentences…") and the window kept moving on its own during the bait's 260 ms window.
 * A signature diff cannot tell a click's effect from the room's weather, so each target now waits
 * for two consecutive identical signatures before its `before` is taken, and a target that never
 * settles is reported `unstable` rather than given a verdict it did not earn.
 *
 * ## The paired-undo pass was tried and BACKED OUT — do not re-add it without a scratch profile
 *
 * `Save to Flashcards` is a toggle with a real product-side undo, so the obvious move is to drive
 * it in a paired pass: snapshot the store, click, measure, click back, confirm the store is
 * byte-identical. It was built and run on 2026-08-24 and it reported **restored 2 of 8** — the
 * probe left four words in the flashcard store, in the same session it had already left six there
 * for a different reason. A focused re-run at four undo delays showed the undo click landing
 * before the entry re-renders (`title` still `Save to Flashcards`, `on` still false at undo time),
 * so the pass is racing the render rather than driving a toggle. Driving any control that writes
 * real user data needs the scratch profile `L1_CLUNKINESS.md` already banks as its own slice.
 * Until then these eight are skipped by name and reported, like the other twenty-seven.
 *
 * `/eval` is synchronous, so this kicks off an async runner and returns; poll with `-read.js`.
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-deadend.js`
 */
(() => {
  const TITLE = 'Dictionary';
  const STEP_MS = 260; // one step per ~16 frames: a React commit plus a network-free paint
  const SETTLE_MS = 120; // gap between the two signatures that have to agree
  const SETTLE_TRIES = 20; // ~2.4 s; longer than any in-flight paint, shorter than a model call
  const CTRL = 'button,a[href],[role="button"],[role="tab"]';
  // The tripwire, not a target: whatever the sweep drives, the flashcard store must read exactly
  // the same bytes at the end. Two separate defects in this probe wrote to it on 2026-08-24 —
  // once because sixteen buttons had no name for the destructive rule to match, once because a
  // paired-undo pass raced the render — and neither run noticed until the store was read by hand.
  const SAVED_KEY = 'jp-saved-words-ja';
  const savedAtArm = localStorage.getItem(SAVED_KEY);

  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });

  // Controls whose effect is a write to real user data. Named, skipped, and reported.
  //
  // `forget` was added 2026-08-24 after this sweep drove `Forget this explanation` on 食べる and
  // deleted the user's stored AI explanation for it — there is no restore path, only a re-ask that
  // produces different prose. It also reported the control as a DEAD END, which it is not:
  // `l1c-forget-deadend.js` drives it alone on a fixture and gets a mutation at 4 ms, the button
  // removed, the ask button back to `Explain this word` and the answer 206 chars → 0. The verdict
  // was an ordinal-rebinding artifact — eight sibling entries carry a button with the identical
  // `label|tag|type|class` key, so the node re-resolved after the click belonged to another entry.
  const DESTRUCTIVE = /star|flashcard|anki|add|delete|remove|save|export|clear|clipboard|copy|mark it|forget/i;
  // Controls that swap the surface's whole mode. Driven separately; see the header note.
  const MODE_SWITCH = /^(日本語|中文)$/;

  const label = (el) =>
    (el.getAttribute('aria-label')
      || el.textContent
      || el.getAttribute('title')
      || el.getAttribute('placeholder')
      || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);

  const painted = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const keyOf = (l, tag, type, cls) => [l, tag, type, cls].join('\u0001');
  const clsOf = (el) => String(el.className || '').split(' ')[0];
  const keyFor = (el) =>
    keyOf(label(el), el.tagName.toLowerCase(), (el.getAttribute('type') || '').toLowerCase(), clsOf(el));
  const clsKeyFor = (el) =>
    keyOf('', el.tagName.toLowerCase(), (el.getAttribute('type') || '').toLowerCase(), clsOf(el));

  const signature = () => {
    const controls = [...win.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"]')];
    return JSON.stringify({
      text: (win.textContent || '').replace(/\s+/g, ' ').trim(),
      nControls: controls.length,
      nEntries: win.querySelectorAll('.dict-entry').length,
      // Class, title and aria-label are what an icon-only toggle actually moves. Without them a
      // star writing a row into the flashcard store reads identical before and after.
      states: controls.map((c) =>
        [
          String(c.className || ''),
          c.getAttribute('title') || '',
          c.getAttribute('aria-label') || '',
          c.getAttribute('aria-pressed'),
          c.getAttribute('aria-selected'),
          c.checked === true ? 1 : 0,
          c.disabled === true ? 1 : 0,
        ].join('~'),
      ).join('|'),
      open: win.querySelectorAll('details[open]').length,
      expanded: win.querySelectorAll('[aria-expanded="true"]').length,
      scroll: [...win.querySelectorAll('*')].reduce((a, e) => a + e.scrollTop, 0),
    });
  };

  // The injected dead end: a real, enabled, clickable button with no handler at all.
  const bait = document.createElement('button');
  bait.id = '__liq-deadend-bait';
  bait.textContent = 'Probe control';
  bait.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:1;';
  win.appendChild(bait);

  const all = [...win.querySelectorAll(CTRL)].filter(painted);

  // Ordinals are computed over EVERY painted control, including the ones the sweep skips, because
  // the live index a target is later resolved against holds them too.
  const ordSeen = new Map();
  const clsSeen = new Map();
  const roster = all.map((el) => {
    const key = keyFor(el);
    const clsKey = clsKeyFor(el);
    const ord = ordSeen.get(key) || 0;
    const clsOrd = clsSeen.get(clsKey) || 0;
    ordSeen.set(key, ord + 1);
    clsSeen.set(clsKey, clsOrd + 1);
    return { el, name: label(el) || '(unlabelled)', key, ord, clsKey, clsOrd, cls: clsOf(el) };
  });

  const targets = [];
  const skipped = [];
  for (const t of roster) {
    const el = t.el;
    if (el.closest('.fwin-titlebar, .fwin-head') || el.classList.contains('fwin-b')) {
      skipped.push({ name: t.name, why: 'window chrome' });
      continue;
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      skipped.push({ name: t.name, why: 'disabled — honest, not a dead end' });
      continue;
    }
    if (el !== bait && DESTRUCTIVE.test(t.name)) {
      skipped.push({ name: t.name, why: 'writes real user data, no product-side undo' });
      continue;
    }
    if (el !== bait && MODE_SWITCH.test(t.name)) {
      skipped.push({ name: t.name, why: 'mode switch — driven in its own pass, wipes the measured state' });
      continue;
    }
    targets.push(t);
  }

  // View switchers stay in the sweep but go LAST. They re-render the result area, so anything
  // driven after one of them resolves to nothing and reports `gone` — measuring the sweep order
  // rather than the app.
  const VIEW_SWITCH = /^(Automatic|Dictionary|Interlinear)$/;
  targets.sort((a, b) => Number(VIEW_SWITCH.test(a.name)) - Number(VIEW_SWITCH.test(b.name)));

  // ...and because they go last, the sweep used to END on `Interlinear`, which renders no
  // `.dict-entry` at all. Every probe run afterwards then reads 0 entries and looks like a search
  // that returned nothing — that cost one wasted fixture run on 2026-08-24. Remember which mode
  // was active at arm time and click it back when the sweep finishes.
  const lensModeAtArm = [...win.querySelectorAll('button')].find(
    (b) => VIEW_SWITCH.test(label(b)) && b.classList.contains('active'),
  );
  const lensModeName = lensModeAtArm ? label(lensModeAtArm) : null;

  const st = {
    surface: TITLE,
    done: false,
    i: 0,
    results: [],
    skipped,
    nTargets: targets.length,
    nRoster: roster.length,
  };
  window.__liqDead = st;

  /**
   * Re-bind a target against the LIVE control list. Identity first (`label|tag|type|class` +
   * ordinal), then class-only + class-ordinal for a control whose label is its own state. A
   * target with no live counterpart is `gone` — an honest third state, not a dead end.
   */
  const resolve = (t) => {
    if (t.el.isConnected && painted(t.el)) return { el: t.el, by: 'live' };
    const byKey = new Map();
    const byCls = new Map();
    for (const c of [...win.querySelectorAll(CTRL)].filter(painted)) {
      const push = (m, k) => { const a = m.get(k) || []; a.push(c); m.set(k, a); };
      push(byKey, keyFor(c));
      push(byCls, clsKeyFor(c));
    }
    const hit = (byKey.get(t.key) || [])[t.ord];
    if (hit) return { el: hit, by: 'key' };
    const alt = (byCls.get(t.clsKey) || [])[t.clsOrd];
    if (alt) return { el: alt, by: 'class' };
    return { el: null, by: null };
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Two consecutive identical signatures, or the window is still moving on its own. */
  const settle = async () => {
    let prev = signature();
    for (let n = 1; n <= SETTLE_TRIES; n += 1) {
      await wait(SETTLE_MS);
      const now = signature();
      if (now === prev) return { sig: now, tries: n, stable: true };
      prev = now;
    }
    return { sig: prev, tries: SETTLE_TRIES, stable: false };
  };

  const run = async () => {
    for (const t of targets) {
      const { el, by } = resolve(t);
      if (!el) {
        st.results.push({ name: t.name, cls: t.cls, gone: true, resolvedBy: null });
        st.i += 1;
        continue;
      }
      const isBait = el.id === '__liq-deadend-bait';
      const quiet = await settle();
      const before = quiet.sig;
      el.click();
      await wait(STEP_MS);
      const after = signature();
      const row = {
        name: t.name,
        cls: t.cls,
        isBait,
        resolvedBy: by,
        changed: before !== after,
        settleTries: quiet.tries,
        unstable: !quiet.stable,
        // What the control became: a control that retired itself into a DISABLED state stopped
        // being offered, which is honest. One that stays enabled and can never act again is a
        // category-2 finding, so the distinction is measured rather than assumed.
        after: {
          present: el.isConnected,
          disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
          label: el.isConnected ? (label(el) || '(unlabelled)') : null,
        },
      };
      st.results.push(row);
      st.i += 1;
    }
    st.savedStoreUntouched = localStorage.getItem(SAVED_KEY) === savedAtArm;
    if (lensModeName) {
      const back = [...win.querySelectorAll('button')].find((b) => label(b) === lensModeName);
      if (back && !back.classList.contains('active')) back.click();
      await wait(1200);
      const nowActive = [...win.querySelectorAll('button')].find(
        (b) => VIEW_SWITCH.test(label(b)) && b.classList.contains('active'),
      );
      st.lensMode = { atArm: lensModeName, restoredTo: nowActive ? label(nowActive) : null };
      st.lensModeRestored = st.lensMode.restoredTo === lensModeName;
    }
    st.done = true;
  };
  void run();

  return JSON.stringify({
    armed: true,
    nRoster: roster.length,
    nTargets: targets.length,
    targets: targets.map((t) => t.name),
    unlabelled: targets.filter((t) => t.name === '(unlabelled)').length,
    skipped,
  });
})()
