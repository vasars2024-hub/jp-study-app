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
  // Which window this sweep drives. It was the literal `'Dictionary'`, which is why category 2
  // read as "unmeasurable on Video" for four turns — the instrument was fine, it just could not
  // be pointed. Set `window.__lqDeadEndTitle` before arming; the fallback keeps every earlier
  // Dictionary run reproducible with no argument.
  const TITLE = window.__lqDeadEndTitle || 'Dictionary';
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

  /**
   * ONE SWEEP AT A TIME, and this is not hygiene — an overlapping run VOIDS the new one.
   *
   * Measured 2026-08-25. A run left driving at ~1 Hz (see the throttle note in
   * `l1-c2-drive.cjs`) was "cleared" by deleting `window.__liqDead` and removing the bait, but
   * the async loop holds its own reference to the state object and kept clicking. The next arm
   * therefore snapshotted a surface with 91 controls on it — a card context menu the OTHER sweep
   * had just opened — and armed on 35 once it closed again, so the roster, the targets and the
   * bait all belonged to different moments. Its bait read `changed:true`, correctly: the room was
   * moving on its own, which is exactly what `settle()` cannot separate from a click.
   *
   * Deleting the global is not a stop. The flag is, because the loop reads it every target.
   */
  const prior = window.__liqDead;
  if (prior && !prior.done) {
    prior.abort = true;
    return JSON.stringify({
      refuse: 'a previous sweep is still running — abort flagged, re-arm once it reports aborted',
      priorSurface: prior.surface,
      priorProgress: `${prior.results.length}/${prior.nTargets}`,
    });
  }

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
  // `add` is anchored because the unanchored form skipped the Media shelf's `Recently added`
  // filter — a read-only rail row — and cost a real coverage point while reporting it as a write
  // to user data. The other words are deliberately left unanchored: anchoring `star` would stop
  // matching `Starred`, which would UN-skip a control that writes.
  const DESTRUCTIVE = /star|flashcard|anki|\badd\b|delete|remove|save|export|clear|clipboard|copy|mark it|forget/i;
  // Controls that swap the surface's whole mode. Driven separately; see the header note.
  const MODE_SWITCH = /^(日本語|中文)$/;
  // Controls whose effect is an OS-modal file dialog. `/eval` is synchronous and the dialog is
  // modal on the main process, so driving one does not measure a dead end — it stops the sweep and
  // the app until a human clicks. Named and reported like DESTRUCTIVE rather than silently
  // dropped. (`Add` already matched DESTRUCTIVE; `Open media` matched nothing and would have hung
  // the first Media-shell run.)
  const NATIVE_DIALOG = /^(open media|open file|open folder|import|browse|choose)/i;
  // Controls that spawn a SEPARATE window. `Media workspace` calls `window.api.popOut('player')`,
  // which changes the `.fwin` set the sweep resolves every target against — the effect is real but
  // it invalidates the instrument mid-run. Its own pass, not this one.
  const SPAWNS_WINDOW = /^media workspace/i;
  // Controls that START PLAYBACK of a real file. They write watch progress — `watchedSec` on the
  // media item — and there is no product-side undo, which is the same rule `Add to favorites`
  // already lives under. 2026-08-25's census named all three by hand and refused to drive them
  // (`Play`, `1The Big O - 01`, `2The Big O - 02`); this encodes that refusal so the sweep can run
  // one-pass. An episode row is matched by CLASS, not name: its label is the episode's own title,
  // arbitrary user text (`MediaEpisodeRow.tsx:39`). That also retires the substring trap where a
  // podcast episode called "…why I start this podcast" was skipped by `DESTRUCTIVE`'s
  // unanchored `star` and lost a real coverage point to the wrong reason.
  //
  // `Open` / `Resume` joined the rule 2026-08-25 and they were NOT covered by `^play\b`. The
  // spotlight's primary action is `media.spotlight.open` / `.resume` (`MediaSpotlightCard.tsx:135`)
  // and it routes to `activate()` (`MediaLibraryShell.tsx:227`), which for a standalone file
  // (`grouping === 'none'`) calls `onPlay` — the same write with a different word on it. A shelf
  // holding ONE title renders that spotlight instead of a card, so the moment this sweep is armed
  // on `Continue watching` it drives playback. Anchored to `.medialib-spotlight__actions` so the
  // topbar's `Open media` (already NATIVE_DIALOG) and any future unrelated `Open` are untouched.
  //
  // A CARD IS TWO DIFFERENT CONTROLS WEARING ONE CLASS, and the previous entry in
  // `L1_CLUNKINESS.md` got this wrong in the safe-sounding direction: *"a media card does not
  // navigate to the player, it toggles a detail drawer in place"*. That is true of a SERIES card
  // only. `activate()` (`MediaLibraryShell.tsx:227`) opens the drawer for a grouped entry and
  // calls `onPlay` for `grouping === 'none'` — a standalone file plays. Driven blind on
  // 2026-08-25 the first card of `Recently added` was a podcast, and the click left the Library
  // tab entirely: `.medialib-rail` gone, 49 controls → 36, the whole arm state lost.
  // The DOM says which is which. `MediaLibraryBrowser.tsx:308` sets the badge to
  // `"<watched> / <episodes>"` for a series and to a formatted DURATION for a standalone, both
  // into `.medialib-card__badge`, so the count form is the discriminator.
  const SERIES_CARD = (el) =>
    /^\d+\s*\/\s*\d+$/.test((el.querySelector('.medialib-card__badge')?.textContent || '').trim());
  const STARTS_PLAYBACK = (el, name) =>
    el.classList.contains('medialib-ep')
    || /^play\b/i.test(name)
    || (!!el.closest('.medialib-spotlight__actions') && /^(open|resume)\b/i.test(name))
    || (el.classList.contains('medialib-card') && !SERIES_CARD(el));

  const label = (el) =>
    (el.getAttribute('aria-label')
      || el.textContent
      || el.getAttribute('title')
      || el.getAttribute('placeholder')
      || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);

  /**
   * A BOX IS NOT VISIBILITY, and on this surface that is nine controls out of thirty-two.
   *
   * Measured 2026-08-25 on the Video window as found: `getBoundingClientRect()` returns a real
   * non-zero box for every control inside a CLOSED `<details>` — `mc-nav-group` (Readiness,
   * Review, Discover, Media workspace), both `medialib-rail__group`s (Anime, TV shows, Unsorted)
   * and `medialib-view` (Grid view, List view). `checkVisibility({contentVisibilityAuto:true})`
   * reports false for all nine and true for the other twenty-three, so the two disagree on
   * exactly the disclosed set.
   *
   * Why it matters more here than as a tidiness point: three of those nine RE-LIST the grid.
   * A sweep that drives a control the user cannot see is not measuring the dominant-task path,
   * and driving a hidden `Unsorted4` unmounts every card the run had yet to reach — which is the
   * sweep-order defect this probe has already paid for three times. The population is now what
   * is actually on screen; to score the disclosed controls, open the disclosure at arm (the
   * driver does) so they are genuinely reachable rather than merely rectangular.
   */
  const painted = (el) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    return typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ contentVisibilityAuto: true })
      : true;
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
      /**
       * A TRANSIENT OVERLAY THAT MOVES IS AN EFFECT, and without this term seven of the Video
       * window's controls were unmeasurable. Every media card carries a `More actions` button
       * opening the SAME `[role="menu"]` with the same items (`ContextMenu.tsx:138`); once the
       * first one has opened it, every later one only re-anchors it. Text, control count and
       * aria state are then byte-identical — `role="menuitem"` is not in the control selector
       * either — so the click read `changed:false` and 7 of 41 targets came back `unconfirmed`
       * on 2026-08-25. Position and item count are what actually moved. Menus outside every
       * `.fwin` are included because an overlay is not required to live inside the window that
       * opened it; another window's own menu would be inside ITS `.fwin` and is excluded.
       */
      menus: [...document.querySelectorAll('[role="menu"],[role="dialog"],[role="listbox"]')]
        .filter((m) => win.contains(m) || !m.closest('.fwin'))
        .map((m) => {
          const r = m.getBoundingClientRect();
          return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}:${m.querySelectorAll('[role="menuitem"],button,a[href]').length}`;
        })
        .join('|'),
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

  /** Every field a form holds, in document order — the input a submit control acts on. */
  const formValues = (f) =>
    [...f.querySelectorAll('input,textarea,select')]
      .map((i) => `${i.name || i.type || i.tagName}=${i.value}`)
      .join('');
  const formAtArm = new Map();
  for (const f of win.querySelectorAll('form')) formAtArm.set(f, formValues(f));

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
    if (el !== bait && NATIVE_DIALOG.test(t.name)) {
      skipped.push({ name: t.name, why: 'opens an OS-modal file dialog — would block the sweep' });
      continue;
    }
    if (el !== bait && SPAWNS_WINDOW.test(t.name)) {
      skipped.push({ name: t.name, why: 'spawns a separate window — invalidates the resolver mid-run' });
      continue;
    }
    if (el !== bait && STARTS_PLAYBACK(el, t.name)) {
      skipped.push({ name: t.name, why: 'starts playback — writes watch progress, no product-side undo' });
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
  // `Grid view`/`List view` are the Media shell's equivalent and were added when this probe was
  // first pointed at a window other than Dictionary — same mechanism, same position in the sweep.
  const VIEW_SWITCH = /^(Automatic|Dictionary|Interlinear|Grid view|List view)$/;

  /**
   * CONTENT BEFORE CHROME, and it is the same mechanism one level up.
   *
   * The first Media-shell run scored **coverage 13/23** with 10 targets `gone`, because the sweep
   * drove the sidebar's nine page-switchers early and every later target lived on the page they
   * unmounted. The two it then called dead ends were the class-only fallback rebinding onto
   * whatever now sat at that ordinal — `Grid view` re-resolved to `Forward`, `List view` to
   * `Run player diagnostics`. Neither was a product defect; both were sweep order.
   *
   * The distinction that fixes it is the one `l1-ui-clarity.js` already draws: a control in the
   * window's PERSISTENT CHROME (sidebar, topbar) replaces the content region, a control INSIDE
   * that region does not. So drive the content region first, its view switchers next, chrome last.
   * A surface with no detectable content region — Dictionary, where every control is a sibling of
   * the results — keeps the original ordering exactly, so no earlier run changes meaning.
   *
   * ...but "inside the content region" is not one bucket on the Media shell, and assuming it was
   * cost this probe a run. Measured 2026-08-25, with the control that settles it:
   *   - A media card does **not** navigate to the player. It toggles a detail drawer in place —
   *     roster **34 → 45**, adding `Close`, `Play`, `Show more`, four `ui-tab`s and two
   *     `medialib-ep` rows. Clicking it again closes them.
   *   - The library rail's filter chips live at `nav.medialib-rail` INSIDE `main.mc-content`, so
   *     they rank as ordinary content while re-listing the entire card grid. Driving `Unsorted4`
   *     is what removed `The Big O`, and with it every drawer control the sweep had yet to reach.
   * Control run, cards ranked as plain content (`debug/l1-deadend-control.js`): coverage
   * **23/33 with 10 `gone`** — the card plus all nine of its drawer's controls, nothing else.
   * So the content region has its own order: drawer contents → cards → re-listers → chrome.
   */
  const inContent = (el) => !!el.closest('main,[role="main"],[class*="-content"],[class*="__content"]');
  /** Toggles a detail region open/closed in place: everything that region holds goes first. */
  const EXPANDER = (el) => !!el.closest('.medialib-card');
  /**
   * Changes WHICH items the content region enumerates: goes after the items themselves.
   * `.medialib-kind` joined the list 2026-08-25 — `be3c9887` moved the release-kind chips behind
   * a disclosure in `.medialib-browser__tools`, outside `.medialib-rail`, so they ranked as
   * ordinary content while filtering the whole grid. Same mechanism as the rail, one container
   * over.
   */
  const RELISTS = (el, name) => VIEW_SWITCH.test(name)
    || !!el.closest('.medialib-rail')
    || !!el.closest('.medialib-kind');
  /**
   * A DISMISSER RANKS LAST INSIDE THE REGION IT DISMISSES, and this is the third form of the
   * same sweep-order defect on this surface. The detail drawer's own close button is FIRST in
   * DOM — `medialib-drawer__hero` precedes `medialib-drawer__body`
   * (`MediaDetailPanel.tsx:262`) — and it is ordinary content by every other test here, so the
   * run opened on it and unmounted the eight controls behind it: coverage **25/33** with the
   * drawer's whole body `gone`. Half a band keeps it inside its own group (before the cards at
   * 1) while putting it after everything that group holds.
   * Window chrome close is not reached by this: `.fwin-titlebar` is skipped above.
   */
  const DISMISSES = (el, name) => /__close(\b|$|\s)/.test(String(el.className || ''))
    || /^(Close|Dismiss|Back)$/i.test(name);
  /**
   * A SHELF SWITCH OUTRANKS THE TOOLBAR IT REPLACES — the fourth form of this sweep-order defect
   * and the one the 2026-08-25 run paid for. The rail and the browser toolbar both re-list, so
   * both sat in band 2 and DOM order put the rail first. Driving `Unsorted4` swapped the shelf,
   * and with it the whole toolbar: `details.medialib-kind` only renders on a >=2-kind shelf
   * (`MediaLibraryBrowser.tsx:182`), so `All` / `Series` / `OVA / ONA` unmounted, and the view
   * disclosure remounted closed, taking `Grid view` / `List view` with it — **5 targets `gone`**,
   * every one of them an instrument artifact. The rail changes WHICH SHELF; the toolbar filters
   * the shelf you are standing in, so it has to run first.
   */
  const SWITCHES_SHELF = (el) => !!el.closest('.medialib-rail');
  const anyContent = targets.some((t) => inContent(t.el));
  const band = (t) => (!anyContent
    ? Number(VIEW_SWITCH.test(t.name))
    : (!inContent(t.el) ? 3 : RELISTS(t.el, t.name) ? 2 : EXPANDER(t.el) ? 1 : 0));
  const rank = (t) => band(t)
    + (DISMISSES(t.el, t.name) ? 0.5 : 0)
    + (band(t) === 2 && SWITCHES_SHELF(t.el) ? 0.25 : 0);
  targets.sort((a, b) => rank(a) - rank(b));

  // ...and because they go last, the sweep used to END on `Interlinear`, which renders no
  // `.dict-entry` at all. Every probe run afterwards then reads 0 entries and looks like a search
  // that returned nothing — that cost one wasted fixture run on 2026-08-24. Remember which mode
  // was active at arm time and click it back when the sweep finishes.
  const lensModeAtArm = [...win.querySelectorAll('button')].find(
    // Two spellings of "this one is on": the Dictionary lens uses `active`, the Media shell's
    // view switch uses `is-active`. Matching only the first silently restored nothing on Media.
    (b) => VIEW_SWITCH.test(label(b)) && (b.classList.contains('active') || b.classList.contains('is-active')),
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
    // The class-only fallback is for a control whose LABEL IS ITS OWN STATE — it has no stable
    // name to match on, so class+ordinal is the only identity left. A target that does have a
    // stable name must never reach it: on 2026-08-25 `Grid view` and `List view` (icon-only,
    // `className === ''`, identified solely by `aria-label`) were rebound by class+ordinal onto
    // whatever class-less button sat at that index on the PLAYER page, clicked, and reported as a
    // dead end. Driven alone the toggle works — `aria-pressed` flips and the card box goes
    // 84 px → 240 px → 84 px. `gone` is the honest verdict for a named control that is no longer
    // on the surface; a fabricated dead end is not.
    const named = t.name && t.name !== '(unlabelled)';
    const alt = named ? null : (byCls.get(t.clsKey) || [])[t.clsOrd];
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
      // Checked every target so a later arm can stop this one; see the ONE SWEEP AT A TIME note.
      if (st.abort) { st.aborted = true; st.done = true; return; }
      const { el, by } = resolve(t);
      if (!el) {
        st.results.push({ name: t.name, cls: t.cls, gone: true, resolvedBy: null });
        st.i += 1;
        continue;
      }
      const isBait = el.id === '__liq-deadend-bait';
      const quiet = await settle();
      const before = quiet.sig;
      // Two ways a control can correctly do nothing, both decidable BEFORE the click, both
      // measured on 2026-08-24 when the sweep reported `Search` and `Automatic` as dead ends
      // and neither was. Recorded here as facts; `-read.js` does the bucketing.
      //   activeAtClick — the already-selected member of a segmented group. `Automatic` carried
      //     `aria-pressed="true"` and `class="active"`; clicking the option that is already on
      //     is required to be a no-op, and calling it a dead end scores correct behaviour.
      //   formUnchanged — a submit whose form holds byte-identical values to arm time, i.e. the
      //     sweep never gave it anything new to do. Verified live the other way: setting the
      //     query 食べる → 水 and clicking the same `Search` re-rendered 8 different entries.
      const activeAtClick =
        el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-selected') === 'true' ||
        el.classList.contains('active');
      const form = el.closest('form');
      const formUnchanged = form ? formValues(form) === formAtArm.get(form) : false;
      el.click();
      await wait(STEP_MS);
      const after = signature();
      const row = {
        name: t.name,
        cls: t.cls,
        isBait,
        resolvedBy: by,
        changed: before !== after,
        activeAtClick,
        formUnchanged,
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

    /**
     * SECOND PASS — a dead end has to be dead from TWO different starting states.
     *
     * Measured 2026-08-25 on the Video window: the one-pass sweep reported `Media Settings` as a
     * dead end. It is not. It is the topbar gear (`MediaCenterView.tsx:1777`,
     * `onClick={() => setTab('settings')}`), and the target driven immediately before it was the
     * sidebar's `Media SettingsPlayback and sources`, which had just set that same tab. Driven by
     * hand from the Discover page it moves the surface hard: heading *"Find the right next
     * watch."* → *"Playback, subtitles, and where your media comes from."*, chars 3,085 → 2,454,
     * nodes 759 → 369.
     *
     * `activeAtClick` cannot catch this and should not be widened to try. It reads
     * `aria-pressed` / `aria-selected` / `.active` — the marks a segmented OPTION carries. A
     * topbar shortcut to a destination is not an option in a group and carries none of them, and
     * no DOM attribute tells this probe where a click was going to go. What does settle it is
     * re-driving the candidate from wherever the sweep ended up: any two controls aiming at one
     * destination produce this artifact, and the second state breaks the tie without the probe
     * having to know the app's routes.
     *
     * The bait goes through this pass too. A handler-less button is dead from every state, so if
     * the confirmation pass ever "rescues" it, the pass itself is the thing that is broken.
     */
    st.confirm = [];
    const candidates = targets.filter((t, n) => {
      const r = st.results[n];
      return r && !r.gone && !r.unstable && !r.changed && !r.activeAtClick && !r.formUnchanged;
    });
    for (const t of candidates) {
      const { el, by } = resolve(t);
      if (!el) {
        st.confirm.push({ name: t.name, cls: t.cls, gone: true, resolvedBy: null });
        continue;
      }
      const quiet = await settle();
      const before = quiet.sig;
      el.click();
      await wait(STEP_MS);
      st.confirm.push({
        name: t.name,
        cls: t.cls,
        isBait: el.id === '__liq-deadend-bait',
        resolvedBy: by,
        changed: before !== signature(),
        settleTries: quiet.tries,
        unstable: !quiet.stable,
      });
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
  /**
   * A THROW USED TO LOOK EXACTLY LIKE A LONG RUN. `void run()` swallowed any exception into an
   * unhandled rejection, so `-read.js` sat at `done:false` forever and the reader's only signal
   * was a progress number that stopped moving — measured 2026-08-25, a run parked at `22/24` with
   * no way to tell a stall from a slow settle. The error is now parked on the state and reported,
   * and `done` is still only set by a run that reached the end, so a crashed sweep can never be
   * read as a completed one.
   */
  run().catch((e) => {
    st.error = String((e && e.stack) || e).slice(0, 400);
    st.crashedAt = st.results.length;
  });

  return JSON.stringify({
    armed: true,
    nRoster: roster.length,
    nTargets: targets.length,
    targets: targets.map((t) => t.name),
    unlabelled: targets.filter((t) => t.name === '(unlabelled)').length,
    skipped,
  });
})()
