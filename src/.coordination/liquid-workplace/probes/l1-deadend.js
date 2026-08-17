/**
 * L1 instrument — the dead-end half of rubric category 2, and its named negative control.
 *
 * A dead end is a control that is present, enabled, and leads nowhere: clicking it produces no
 * observable change. This drives each control on the surface's dominant-task path and diffs a
 * signature of the window before and after — rendered text, control count, result-row count,
 * `aria-pressed`/`aria-selected`/`checked` state, and scroll position. Anything that moves is an
 * effect; nothing moving is a dead-end candidate.
 *
 * THE CONTROL, and why it is injected. The rubric requires that a deliberately wrong flow be
 * reported as a dead end — "if everything you try scores clean, the probe is not discriminating."
 * The wrong flow cannot be a real destructive control here: the Dictionary's star writes to
 * Flashcards and its Anki button writes a note to the user's live collection (the honest-states
 * probe already put one 食べる note there). So a handler-less button is injected into the
 * window, driven exactly like the rest, and removed by `-cleanup.js`. If the injected button is
 * not reported, the probe is not discriminating and every 0 it prints is void.
 *
 * DESTRUCTIVE CONTROLS ARE SKIPPED BY NAME, not silently: the skipped list is reported so the
 * count says what it covered. Window chrome (close/minimize/maximize) is skipped for the same
 * reason — closing the window would end the measurement.
 *
 * THE FALSE POSITIVE THIS VERSION EXISTS TO KILL. The first version resolved all 46 targets up
 * front and then clicked the saved element references in order. Target 2 was `中文`, which
 * switches the dictionary language and **wipes the result list** — so the 43 result-row controls
 * after it were clicking DETACHED nodes, which of course change nothing. It reported **42 dead
 * ends out of 45**, and every one of them was the harness. Two fixes, both load-bearing:
 * every target is re-resolved by label immediately before its click and reported as `gone` (not
 * as a dead end) if the surface no longer offers it; and controls that change the surface's whole
 * mode are excluded from the sweep and driven in their own pass, because they destroy the state
 * the rest of the sweep is measured in. A run whose `gone` count is high is not a finding about
 * the app, it is a sign the sweep order is still wrong.
 *
 * `/eval` is synchronous, so this arms a stepper that runs on a timer; poll with `-read.js`.
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-deadend.js`
 */
(() => {
  const TITLE = 'Dictionary';
  const STEP_MS = 260; // one step per ~16 frames: enough for a React commit plus a network-free paint

  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });

  // Controls whose effect is a write to real user data. Named, skipped, and reported.
  // `mark it Learning` is here because it moves the word's real study state — the first run
  // clicked eight of them before this rule existed.
  const DESTRUCTIVE = /star|flashcard|anki|add|delete|remove|save|export|clear|mark it/i;
  // Controls that swap the surface's whole mode. Driven separately; see the header note.
  const MODE_SWITCH = /^(日本語|中文)$/;

  const label = (el) =>
    (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);

  const signature = () => {
    const controls = [...win.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"]')];
    return JSON.stringify({
      text: (win.textContent || '').replace(/\s+/g, ' ').trim(),
      nControls: controls.length,
      nEntries: win.querySelectorAll('.dict-entry').length,
      states: controls.map((c) =>
        [c.getAttribute('aria-pressed'), c.getAttribute('aria-selected'), c.checked === true ? 1 : 0, c.disabled === true ? 1 : 0].join(''),
      ).join('|'),
      scroll: [...win.querySelectorAll('*')].reduce((a, e) => a + e.scrollTop, 0),
    });
  };

  // The injected dead end: a real, enabled, clickable button with no handler at all.
  const bait = document.createElement('button');
  bait.id = '__liq-deadend-bait';
  bait.textContent = 'Probe control';
  bait.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:1;';
  win.appendChild(bait);

  const all = [...win.querySelectorAll('button,a[href],[role="button"],[role="tab"]')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  const targets = [];
  const skipped = [];
  for (const el of all) {
    const name = label(el) || '(unlabelled)';
    if (el.closest('.fwin-titlebar, .fwin-head') || el.classList.contains('fwin-b')) {
      skipped.push({ name, why: 'window chrome' });
      continue;
    }
    if (el.disabled) {
      skipped.push({ name, why: 'disabled — honest, not a dead end' });
      continue;
    }
    if (el !== bait && DESTRUCTIVE.test(name)) {
      skipped.push({ name, why: 'writes real user data' });
      continue;
    }
    if (el !== bait && MODE_SWITCH.test(name)) {
      skipped.push({ name, why: 'mode switch — driven in its own pass, wipes the measured state' });
      continue;
    }
    targets.push(name);
  }

  // View switchers stay in the sweep but go LAST. They re-render the result area, so anything
  // driven after one of them resolves to nothing and reports `gone` — measuring the sweep order
  // rather than the app. Ordering costs nothing and buys the result rows a real measurement.
  const VIEW_SWITCH = /^(Automatic|Dictionary|Interlinear)$/;
  targets.sort((a, b) => Number(VIEW_SWITCH.test(a)) - Number(VIEW_SWITCH.test(b)));

  const st = { surface: TITLE, done: false, i: 0, results: [], skipped, nTargets: targets.length };
  window.__liqDead = st;

  // Re-resolve by label against the LIVE control list, occurrence-aware so repeated labels
  // ("Play 食べる" appears on several rows) still map one-to-one.
  const resolve = (name, occurrence) => {
    const live = [...win.querySelectorAll('button,a[href],[role="button"],[role="tab"]')].filter(
      (el) => label(el) === name && el.getBoundingClientRect().width > 0,
    );
    return live[occurrence] || null;
  };

  const step = () => {
    if (st.i >= targets.length) {
      st.done = true;
      return;
    }
    const name = targets[st.i];
    const occurrence = targets.slice(0, st.i).filter((n) => n === name).length;
    const el = resolve(name, occurrence);
    if (!el) {
      st.results.push({ name, gone: true });
      st.i += 1;
      setTimeout(step, 0);
      return;
    }
    const isBait = el.id === '__liq-deadend-bait';
    const before = signature();
    el.click();
    setTimeout(() => {
      const after = signature();
      st.results.push({ name, isBait, changed: before !== after });
      st.i += 1;
      step();
    }, STEP_MS);
  };
  setTimeout(step, STEP_MS);

  return JSON.stringify({ armed: true, nTargets: targets.length, targets, skipped });
})()
