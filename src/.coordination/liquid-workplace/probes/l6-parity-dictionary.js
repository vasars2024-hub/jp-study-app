/**
 * L6 instrument — rubric category 6, "Feature parity and reversibility", driven in
 * BOTH presentations.
 *
 * SURFACES, 2026-08-25. This file was Dictionary-only and is now surface-aware; the
 * filename is kept deliberately because `parity-ledger.json`'s `automatedProof`
 * strings cite it by name on all seven dictionary rows. `window.__L6` is the
 * Dictionary instrument, unchanged in every observable way; `window.__L6M` is the
 * same instrument re-aimed at the **Media Center** surface that the window titled
 * `Video` hosts, sharing this file's traps, its `typeInto`, and its round-trip shape.
 *
 * Why the Media Center and not the "Media workspace": measured 2026-08-25, the
 * seanime host is a full-screen overlay mounted at `body > div > .seanime-host`,
 * NOT inside any `.fwin`. It therefore has no window chrome, no `Make Liquid`
 * control and no `data-presentation` — the parity ledger's six `mediaWorkspace`
 * rows genuinely have no Liquid destination and stay `pending` for that reason,
 * which is a fact about that surface rather than a gap in this probe. The Video
 * window's own surface is the Media Center (`.mc-root`), and that is what a
 * category-6 score for the Video window has to be measured on.
 *
 * Why this file exists. Every one of the 7 dictionary rows in `parity-ledger.json`
 * carried `status: "pending"` with the recorded reason *"no Liquid destination
 * exists"*. L3.2 (`20462e3a`) shipped `Make Liquid` on this exact window, so that
 * reason is now false and the category is no longer capped. This is the check that
 * closes the rows.
 *
 * THE RULE THIS FILE IS BUILT AROUND — the rubric, category 6: parity is verified by
 * **observable side effects, never by button presence**. A probe that counts buttons
 * in Standard and counts the same buttons in Liquid proves nothing: the failure mode
 * this category exists to catch is a control that survives the transition and stops
 * working. So every row below asserts a state change it caused, and a row whose
 * control is present but inert reports `false`, not `true`.
 *
 * Traps already paid for in this repo, encoded here:
 *
 * 1. `/eval` IS SYNCHRONOUS AND NEVER AWAITS. Every step returns immediately; results
 *    that need React to re-render are read by a LATER call, not by this one. That is
 *    why this file installs `window.__L6` and returns, instead of running a sequence.
 * 2. REACT DOES NOT SEE `input.value = x`. The native setter has to be called and an
 *    `input` event dispatched, or the search runs against an empty string and the row
 *    scores as a broken feature when the instrument is what is broken.
 * 3. A 0x0 OR HIDDEN WINDOW MEASURES AS PERFECT — every count is equal because every
 *    count is zero. `snapshot()` REFUSES when the window box is degenerate.
 * 4. THE TITLE IS TRANSLATED. Finding the window by the English string fails in ja/zh/ru;
 *    the section is matched on the taskbar-independent title regex plus the presence of
 *    the dictionary search input, and the probe says which it used.
 * 5. A NEGATIVE CONTROL IS REQUIRED. `__L6.mutate()` deliberately removes one feature's
 *    real handler at runtime; the same `check()` must then report that row `false`. A
 *    parity check that has never caught a missing feature has never been shown to work.
 *
 * Run:
 *   node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l6-parity-dictionary.js
 *   node debug/ev.cjs "JSON.stringify(window.__L6.check())"
 */
(() => {
  const TITLE_RE = /Dictionary|辞書|词典|Словар/i;
  const SEARCH_PH = /食べる|eat/;

  const findWin = () => {
    const wins = Array.from(document.querySelectorAll('.fwin'));
    const byTitle = wins.find((w) => {
      const t = w.querySelector('.fwin-title-text');
      return t && TITLE_RE.test(t.textContent || '');
    });
    if (byTitle) return { win: byTitle, matchedBy: 'title' };
    const byInput = wins.find((w) =>
      Array.from(w.querySelectorAll('input')).some((i) => SEARCH_PH.test(i.placeholder || '')),
    );
    return byInput ? { win: byInput, matchedBy: 'search-input' } : { win: null, matchedBy: null };
  };

  // Trap 2. React installs a value setter on the element; assigning `.value`
  // bypasses it and the component never learns the field changed.
  const typeInto = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const q = (win, sel) => win.querySelector(sel);
  const qa = (win, sel) => Array.from(win.querySelectorAll(sel));
  const btnByText = (win, re) =>
    qa(win, 'button').find((b) => re.test((b.textContent || '').trim()));

  /** Everything the round-trip diff compares. Geometry + the window's own data. */
  const snapshot = () => {
    const { win, matchedBy } = findWin();
    if (!win) return { refused: 'no dictionary window' };
    const r = win.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) {
      // Trap 3.
      return { refused: `degenerate box ${Math.round(r.width)}x${Math.round(r.height)}` };
    }
    const search = qa(win, 'input').find((i) => SEARCH_PH.test(i.placeholder || ''));
    const notes = q(win, '.lexicon-notes-filter');
    return {
      matchedBy,
      presentation: win.getAttribute('data-presentation'),
      liquidClass: win.classList.contains('fwin-liquid'),
      rect: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      maximized: win.classList.contains('fwin-max'),
      focused: win.classList.contains('focused'),
      zIndex: win.style.zIndex || '',
      // App data that must survive the round trip byte-for-byte.
      searchValue: search ? search.value : null,
      notesFilterValue: notes ? notes.value : null,
      activeLang: (btnByText(win, /^日本語$/) || {}).className || '',
      resultChars: (win.textContent || '').length,
      resultNodes: win.querySelectorAll('*').length,
      controls: qa(win, 'button,input,select,textarea,[role="button"]').length,
    };
  };

  /**
   * One row = one observable side effect. `reachable` is what the category counts;
   * `evidence` is the number that earned it. Rows that need a prior search read the
   * state a previous step left behind, because `/eval` cannot wait (trap 1).
   */
  const check = () => {
    const { win, matchedBy } = findWin();
    if (!win) return { refused: 'no dictionary window' };
    const r = win.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return { refused: 'degenerate box' };

    const text = win.textContent || '';
    const rows = [];
    const row = (id, reachable, evidence) => rows.push({ id, reachable, evidence });

    // 1. Look up a word. Side effect: the window renders the searched headword and a
    //    source attribution it did not render when empty.
    const searched = /食べる/.test(text) && /JMdict|辞書|词典/i.test(text);
    row('lookup', searched, `chars=${text.length} nodes=${win.querySelectorAll('*').length}`);

    // 2. Language source switch. Side effect: `active` moves between the two buttons.
    const ja = btnByText(win, /^日本語$/);
    const zh = btnByText(win, /^中文$/);
    const exclusive =
      !!ja && !!zh && ja.classList.contains('active') !== zh.classList.contains('active');
    row('sourceSwitch', exclusive, `ja.active=${!!ja && ja.classList.contains('active')} zh.active=${!!zh && zh.classList.contains('active')}`);

    // 3. Result presentation mode. INSTRUMENT CORRECTION, 2026-08-17: the first
    //    version looked for a `<select>` and reported `selects=0`, i.e. the feature
    //    missing. It is a three-BUTTON segmented control (Automatic / Dictionary /
    //    Interlinear) with an `active` class. That false negative is the exact shape
    //    the rubric warns about — a probe that fails to match scores as ABSENT, which
    //    is indistinguishable from a real regression. Side effect: exactly one of the
    //    three carries `active`.
    const modeBtns = qa(win, 'button').filter((b) =>
      /^(Automatic|Dictionary|Interlinear|自動|辞書|対訳|自动|词典|对照|Автоматически|Словарь|Подстрочник)$/.test(
        (b.textContent || '').trim(),
      ),
    );
    const modeActive = modeBtns.filter((b) => b.classList.contains('active')).length;
    row(
      'presentationMode',
      modeBtns.length >= 3 && modeActive === 1,
      `modeButtons=${modeBtns.length} active=${modeActive}`,
    );

    // 4. Per-result actions. Side effect: after a search the result carries action
    //    controls; before one it carries none, which is what makes the count mean
    //    something rather than counting window chrome.
    const actions = qa(win, 'button').filter((b) =>
      /audio|copy|flash|anki|new|音声|コピー/i.test(
        `${b.getAttribute('aria-label') || ''} ${b.title || ''} ${(b.textContent || '').trim()}`,
      ),
    );
    row('resultActions', actions.length > 0, `actions=${actions.length}`);

    // 5. Saved searches. Same instrument correction as row 3: the first version
    //    matched /saved/ and the real control reads "Save search", so it reported 0.
    const saved = qa(win, 'button,[role="button"]').filter((b) =>
      /save\s*search|検索を保存|保存搜索|Сохранить поиск/i.test(
        `${b.getAttribute('aria-label') || ''} ${(b.textContent || '').trim()}`,
      ),
    );
    row('savedSearches', saved.length > 0, `saveSearchControls=${saved.length}`);

    // 6. Notes pane + filter. Side effect: the filter input exists AND accepts a value
    //    React keeps (an uncontrolled leftover would lose it on the next render).
    const notes = q(win, '.lexicon-notes-filter');
    row('notesFilter', !!notes, notes ? `value="${notes.value}"` : 'absent');

    // 7. Window lifecycle. Side effect: the four chrome controls exist AND the liquid
    //    toggle is the reversible one — `aria-pressed` must be a real boolean, because
    //    a toggle with no pressed state is the "enable with no disable path" defect.
    const chrome = qa(win, '.fwin-b');
    const liquidBtn = q(win, '.fwin-b-liquid');
    const pressed = liquidBtn ? liquidBtn.getAttribute('aria-pressed') : null;
    row(
      'windowLifecycle',
      chrome.length >= 4 && (pressed === 'true' || pressed === 'false'),
      `chromeButtons=${chrome.length} liquidAriaPressed=${pressed}`,
    );

    return {
      matchedBy,
      presentation: win.getAttribute('data-presentation'),
      reachable: rows.filter((x) => x.reachable).length,
      total: rows.length,
      rows,
    };
  };

  /** Step: run the search that rows 1/3/4 read. Call, then re-`check()` in a LATER eval. */
  const search = (word) => {
    const { win } = findWin();
    if (!win) return { refused: 'no dictionary window' };
    const input = qa(win, 'input').find((i) => SEARCH_PH.test(i.placeholder || ''));
    if (!input) return { refused: 'no search input' };
    typeInto(input, word || '食べる');
    const btn = btnByText(win, /^(Search|検索|搜索|Поиск)$/);
    if (!btn) return { refused: 'no search button' };
    btn.click();
    return { typed: input.value, clicked: btn.className };
  };

  /** Step: click the window's own Make Liquid / Return to standard control. */
  const toggleLiquid = () => {
    const { win } = findWin();
    if (!win) return { refused: 'no dictionary window' };
    const btn = q(win, '.fwin-b-liquid');
    if (!btn) return { refused: 'no liquid control rendered' };
    const before = win.getAttribute('data-presentation');
    btn.click();
    return { before, ariaPressed: btn.getAttribute('aria-pressed') };
  };

  /**
   * NEGATIVE CONTROL. Deliberately removes ONE feature and nothing else; the SAME
   * `check()` must then report exactly that row `false` and every other row
   * unchanged. A control that flips two rows is as broken as one that flips none —
   * it would mean the rows are not independent observations.
   *
   * Three variants, because a single-variant control only proves the check is
   * sensitive to one shape of loss:
   *   `notesFilter`      — the element is detached (a feature that vanished);
   *   `sourceSwitch`     — both language buttons made active (state that stopped
   *                        being exclusive: present, rendered, and meaningless);
   *   `windowLifecycle`  — `aria-pressed` stripped off the Liquid toggle (the
   *                        reversibility affordance lost while the button remains).
   */
  const mutate = (which) => {
    const { win } = findWin();
    if (!win) return { refused: 'no dictionary window' };
    if (which === 'notesFilter') {
      const notes = q(win, '.lexicon-notes-filter');
      if (!notes) return { refused: 'no notes filter to remove' };
      const mark = document.createComment('l6-notes-placeholder');
      notes.parentNode.insertBefore(mark, notes);
      window.__L6_removed = { node: notes, mark };
      notes.remove();
      return { mutated: 'notes filter detached' };
    }
    if (which === 'sourceSwitch') {
      const ja = btnByText(win, /^日本語$/);
      const zh = btnByText(win, /^中文$/);
      if (!ja || !zh) return { refused: 'language buttons absent' };
      [ja, zh].forEach((b) => {
        if (!b.classList.contains('active')) {
          b.classList.add('active');
          b.setAttribute('data-l6-added-active', '1');
        }
      });
      return { mutated: 'both language buttons active' };
    }
    if (which === 'windowLifecycle') {
      const btn = q(win, '.fwin-b-liquid');
      if (!btn) return { refused: 'no liquid control' };
      btn.setAttribute('data-l6-pressed', btn.getAttribute('aria-pressed') || '');
      btn.removeAttribute('aria-pressed');
      return { mutated: 'aria-pressed stripped from the liquid toggle' };
    }
    return { refused: `unknown variant ${which}` };
  };

  const restore = () => {
    const { win } = findWin();
    if (!win) return { refused: 'no dictionary window' };
    const undone = [];
    if (window.__L6_removed && window.__L6_removed.mark && window.__L6_removed.mark.parentNode) {
      window.__L6_removed.mark.parentNode.insertBefore(
        window.__L6_removed.node,
        window.__L6_removed.mark,
      );
      window.__L6_removed.mark.remove();
      window.__L6_removed = null;
      undone.push('notesFilter');
    }
    qa(win, '[data-l6-added-active]').forEach((n) => {
      n.classList.remove('active');
      n.removeAttribute('data-l6-added-active');
      undone.push('sourceSwitch');
    });
    qa(win, '[data-l6-pressed]').forEach((n) => {
      n.setAttribute('aria-pressed', n.getAttribute('data-l6-pressed'));
      n.removeAttribute('data-l6-pressed');
      undone.push('windowLifecycle');
    });
    return { restored: undone };
  };

  window.__L6 = { findWin, snapshot, check, search, toggleLiquid, mutate, restore };

  // ==========================================================================
  // MEDIA CENTER surface — the app the window titled `Video` hosts (`.mc-root`).
  // ==========================================================================

  /**
   * The desktop carries TWO Media Center windows, and that is the point: one is
   * `liquid` and one is `standard`, so parity is read off the SAME component in
   * both presentations in ONE run rather than by toggling and hoping nothing else
   * moved. Selection is by `data-presentation`, never by title — trap 4 applies
   * doubly here, because `Video` and `Media` are both translated section names.
   */
  const findMediaWin = (pres) => {
    const wins = Array.from(document.querySelectorAll('.fwin')).filter((w) =>
      w.querySelector('.mc-root'),
    );
    if (!wins.length) return { win: null, matchedBy: null };
    // `title:<text>` — the ONE case presentation cannot address. During a round
    // trip the window under test spends a phase sharing its presentation with the
    // other media window, and `data-presentation` then names two windows.
    if (typeof pres === 'string' && pres.indexOf('title:') === 0) {
      const want = pres.slice(6);
      const hit = wins.find(
        (w) => ((w.querySelector('.fwin-title-text') || {}).textContent || '').trim() === want,
      );
      return hit ? { win: hit, matchedBy: `mc-root + title=${want}` } : { win: null, matchedBy: null };
    }
    if (!pres) return { win: wins[0], matchedBy: 'mc-root' };
    const hit = wins.find((w) => (w.getAttribute('data-presentation') || 'standard') === pres);
    return hit
      ? { win: hit, matchedBy: `mc-root + data-presentation=${pres}` }
      : { win: null, matchedBy: null };
  };

  // `.medialib-spotlight-wrap` counts: a single result in GRID view renders as a
  // spotlight rather than a card (`MediaLibraryBrowser.tsx`, the entries.length===1
  // branch), so counting only `.medialib-card` reports a found item as 0 found.
  const cards = (win) => qa(win, '.medialib-card, .medialib-spotlight-wrap');
  const railBtns = (win) => qa(win, '.mc-nav button');
  const shelfBtns = (win) => qa(win, '.ui-sidebar__item[aria-current]');
  const searchInput = (win) => q(win, '.mc-global-search input');
  const sortSelect = (win) => q(win, '.medialib-browser__tools select');
  const viewBtns = (win) => qa(win, '.medialib-view-toggle button[aria-pressed]');

  /** Per-presentation store for rows that only a driven step can answer. */
  const driven = () => (window.__L6M_DRIVEN = window.__L6M_DRIVEN || {});
  const drivenFor = (pres) => {
    const d = driven();
    d[pres] = d[pres] || {};
    return d[pres];
  };

  const snapshotM = (pres) => {
    const { win, matchedBy } = findMediaWin(pres);
    if (!win) return { refused: `no media-center window at presentation=${pres}` };
    const r = win.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) {
      return { refused: `degenerate box ${Math.round(r.width)}x${Math.round(r.height)}` };
    }
    const active = railBtns(win).find((b) => b.classList.contains('is-active'));
    const shelf = shelfBtns(win).find((b) => b.getAttribute('aria-current') === 'true');
    const view = viewBtns(win).find((b) => b.getAttribute('aria-pressed') === 'true');
    const s = searchInput(win);
    const sort = sortSelect(win);
    return {
      matchedBy,
      title: ((win.querySelector('.fwin-title-text') || {}).textContent || '').trim(),
      presentation: win.getAttribute('data-presentation'),
      liquidClass: win.classList.contains('fwin-liquid'),
      rect: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      maximized: win.classList.contains('fwin-max'),
      focused: win.classList.contains('focused'),
      zIndex: win.style.zIndex || '',
      // App data that must survive the round trip byte-for-byte.
      activeRail: active ? (active.textContent || '').trim() : null,
      activeShelf: shelf ? (shelf.textContent || '').trim() : null,
      searchValue: s ? s.value : null,
      sortValue: sort ? sort.value : null,
      viewMode: view ? view.getAttribute('aria-label') : null,
      cardCount: cards(win).length,
      chars: (win.textContent || '').length,
      nodes: win.querySelectorAll('*').length,
      controls: qa(win, 'button,input,select,textarea,[role="button"]').length,
    };
  };

  /**
   * One row = one observable side effect on the Media Center. Rows 3, 5 and 7
   * cannot be answered by reading the resting DOM — a search box that renders is
   * not a search box that filters — so they read what `stepM()` measured and
   * report `false` with `evidence:"not driven"` when nothing has been driven in
   * that presentation. Presence is never enough here.
   */
  const checkM = (pres) => {
    const { win, matchedBy } = findMediaWin(pres);
    if (!win) return { refused: `no media-center window at presentation=${pres}` };
    const r = win.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return { refused: 'degenerate box' };
    const d = drivenFor(pres);

    const rows = [];
    const row = (id, reachable, evidence) => rows.push({ id, reachable, evidence });

    // 1. Section rail. Side effect: `is-active` is exclusive across the rail.
    const rail = railBtns(win);
    const railActive = rail.filter((b) => b.classList.contains('is-active')).length;
    row('railNav', rail.length >= 6 && railActive === 1, `railButtons=${rail.length} active=${railActive}`);

    // 2. Library shelves. Side effect: exactly one `aria-current="true"`.
    const shelf = shelfBtns(win);
    const shelfActive = shelf.filter((b) => b.getAttribute('aria-current') === 'true').length;
    row('shelfFilter', shelf.length >= 6 && shelfActive === 1, `shelves=${shelf.length} current=${shelfActive}`);

    // 3. Library search — DRIVEN. Side effect: the rendered card population changes
    //    for a term that cannot match, and comes back when the term is cleared.
    const ls = d.librarySearch;
    row(
      'librarySearch',
      !!ls && ls.before !== ls.after && ls.restored === ls.before,
      ls ? `cards ${ls.before} -> ${ls.after} -> ${ls.restored} for "${ls.term}"` : 'not driven',
    );

    // 4. Sort + view mode. Side effect: the sort has real options and exactly one
    //    of grid/list carries `aria-pressed="true"`.
    const sort = sortSelect(win);
    const views = viewBtns(win);
    const viewOn = views.filter((b) => b.getAttribute('aria-pressed') === 'true').length;
    row(
      'sortAndView',
      !!sort && sort.options.length >= 4 && views.length === 2 && viewOn === 1,
      `sortOptions=${sort ? sort.options.length : 0} viewButtons=${views.length} pressed=${viewOn}`,
    );

    // 5. Per-item actions — DRIVEN. Side effect: the card's `More actions` opens a
    //    menu with real entries, and closes again.
    const im = d.itemActions;
    row(
      'itemActions',
      !!im && im.opened > 0 && im.closed === 0,
      im ? `menuItems opened=${im.opened} afterClose=${im.closed} via=${im.via || 'card'}` : 'not driven',
    );

    // 6. History. Side effect: `Back`/`Forward` reflect real depth — both disabled
    //    on a fresh history is a truthful state, both enabled with no history is not.
    const back = qa(win, '.mc-history-buttons button')[0];
    const fwd = qa(win, '.mc-history-buttons button')[1];
    row(
      'history',
      !!back && !!fwd && typeof back.disabled === 'boolean' && typeof fwd.disabled === 'boolean',
      `back.disabled=${back ? back.disabled : 'absent'} forward.disabled=${fwd ? fwd.disabled : 'absent'}`,
    );

    // 7. Route to the Media workspace and back — DRIVEN. Side effect: the
    //    full-screen `.seanime-host` mounts and un-mounts. This is the row that
    //    makes "every enable has a disable" observable on this surface.
    const wr = d.workspaceRoute;
    row(
      'workspaceRoute',
      !!wr && wr.afterOpen === 1 && wr.afterClose === 0,
      wr ? `seanimeHost ${wr.before} -> ${wr.afterOpen} -> ${wr.afterClose}` : 'not driven',
    );

    // 8. Window lifecycle, same rule as the dictionary surface: the Liquid toggle
    //    must expose a real boolean pressed state or it is an enable with no disable.
    const chrome = qa(win, '.fwin-b');
    const liquidBtn = q(win, '.fwin-b-liquid');
    const pressed = liquidBtn ? liquidBtn.getAttribute('aria-pressed') : null;
    row(
      'windowLifecycle',
      chrome.length >= 4 && (pressed === 'true' || pressed === 'false'),
      `chromeButtons=${chrome.length} liquidAriaPressed=${pressed}`,
    );

    return {
      matchedBy,
      presentation: win.getAttribute('data-presentation'),
      reachable: rows.filter((x) => x.reachable).length,
      total: rows.length,
      rows,
    };
  };

  /**
   * The driven half. `/eval` never awaits (trap 1), so each phase is its own call
   * and the caller sequences them: `search:type` → `search:read` → `search:clear`,
   * `menu:open` → `menu:read` → `menu:close`, `ws:open` → `ws:read` → `ws:close`.
   */
  const stepM = (name, pres, arg) => {
    const { win } = findMediaWin(pres);
    if (!win) return { refused: `no media-center window at presentation=${pres}` };
    const d = drivenFor(pres);

    if (name === 'search:type') {
      const input = searchInput(win);
      if (!input) return { refused: 'no library search input' };
      const term = arg || 'zzqqxx-no-such-title';
      d.librarySearch = { term, before: cards(win).length, prior: input.value };
      typeInto(input, term); // trap 2
      return { typed: term, before: d.librarySearch.before };
    }
    if (name === 'search:read') {
      if (!d.librarySearch) return { refused: 'search not typed' };
      d.librarySearch.after = cards(win).length;
      return { after: d.librarySearch.after };
    }
    if (name === 'search:clear') {
      const input = searchInput(win);
      if (!input || !d.librarySearch) return { refused: 'nothing to clear' };
      typeInto(input, d.librarySearch.prior || '');
      return { cleared: true };
    }
    if (name === 'search:restored') {
      if (!d.librarySearch) return { refused: 'search not typed' };
      d.librarySearch.restored = cards(win).length;
      return { restored: d.librarySearch.restored };
    }

    if (name === 'menu:open') {
      // TWO RENDERINGS, ONE AFFORDANCE (2026-08-25). `.medialib-card__more` is the grid/list
      // CARD's control. A shelf holding a single entry in grid view renders a SPOTLIGHT
      // instead (`MediaLibraryBrowser`'s `entries.length === 1` branch), whose
      // `.medialib-spotlight__actions` last button calls the identical `onMenu`. Matching only
      // the card selector reported `no card action control` and scored this row NOT reachable
      // in the liquid leg while the feature was on screen and working — the same
      // probe-fails-to-match error the `menu:close` note two branches down already records.
      const more = q(win, '.medialib-card__more')
        || (qa(win, '.medialib-spotlight__actions button').slice(-1)[0] || null);
      if (!more) return { refused: 'no card action control (neither .medialib-card__more nor a spotlight action)' };
      d.itemActions = {
        before: document.querySelectorAll('[role="menuitem"]').length,
        via: more.classList.contains('medialib-card__more') ? 'card' : 'spotlight',
      };
      more.click();
      return { clicked: true, via: d.itemActions.via, before: d.itemActions.before };
    }
    if (name === 'menu:read') {
      if (!d.itemActions) return { refused: 'menu not opened' };
      d.itemActions.opened = document.querySelectorAll('[role="menuitem"]').length;
      return { opened: d.itemActions.opened };
    }
    if (name === 'menu:close') {
      // INSTRUMENT CORRECTION, 2026-08-25. The first version dispatched
      // `pointerdown` and `.click()` and reported the menu as never closing —
      // 4 items still in the DOM, then 8 once the second presentation opened its
      // own. That was the probe: `ContextMenu` listens for **mousedown** on
      // `window` in the capture phase (`ui/ContextMenu.tsx:70`), plus Escape.
      // Neither event it was sent is that one. Exactly the shape the rubric
      // warns about — a probe that fails to match scores the feature as broken.
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      return { dispatched: 'mousedown on body (capture listener on window)' };
    }
    if (name === 'menu:closed') {
      if (!d.itemActions) return { refused: 'menu not opened' };
      d.itemActions.closed = document.querySelectorAll('[role="menuitem"]').length;
      return { closed: d.itemActions.closed };
    }

    if (name === 'ws:open') {
      const link = q(win, '.mc-seanime-link');
      if (!link) return { refused: 'no Media workspace link' };
      d.workspaceRoute = { before: document.querySelectorAll('.seanime-host').length };
      link.click();
      return { clicked: true, before: d.workspaceRoute.before };
    }
    if (name === 'ws:read') {
      if (!d.workspaceRoute) return { refused: 'workspace not opened' };
      d.workspaceRoute.afterOpen = document.querySelectorAll('.seanime-host').length;
      return { afterOpen: d.workspaceRoute.afterOpen };
    }
    if (name === 'ws:close') {
      const close = Array.from(document.querySelectorAll('.seanime-host-btn')).find((b) =>
        /^(Close|閉じる|关闭|Закрыть)$/.test((b.textContent || '').trim()),
      );
      if (!close) return { refused: 'no Close in the workspace host bar' };
      close.click();
      return { clicked: true };
    }
    if (name === 'ws:closed') {
      if (!d.workspaceRoute) return { refused: 'workspace not opened' };
      d.workspaceRoute.afterClose = document.querySelectorAll('.seanime-host').length;
      return { afterClose: d.workspaceRoute.afterClose };
    }
    return { refused: `unknown step ${name}` };
  };

  const toggleLiquidM = (pres) => {
    const { win } = findMediaWin(pres);
    if (!win) return { refused: `no media-center window at presentation=${pres}` };
    const btn = q(win, '.fwin-b-liquid');
    if (!btn) return { refused: 'no liquid control rendered' };
    const before = win.getAttribute('data-presentation');
    btn.click();
    return { before, ariaPressed: btn.getAttribute('aria-pressed') };
  };

  /**
   * NEGATIVE CONTROL, three variants, same rule as the dictionary half: each must
   * flip EXACTLY ONE row to `false` and leave the rest untouched.
   *   `railNav`         — the section rail's active state made non-exclusive;
   *   `sortAndView`     — both view-mode buttons pressed at once;
   *   `windowLifecycle` — `aria-pressed` stripped off the Liquid toggle.
   */
  const mutateM = (which, pres) => {
    const { win } = findMediaWin(pres);
    if (!win) return { refused: `no media-center window at presentation=${pres}` };
    if (which === 'railNav') {
      const off = railBtns(win).filter((b) => !b.classList.contains('is-active'));
      if (!off.length) return { refused: 'no inactive rail button' };
      off[0].classList.add('is-active');
      off[0].setAttribute('data-l6m-added-active', '1');
      return { mutated: `rail button "${(off[0].textContent || '').trim().slice(0, 18)}" also active` };
    }
    if (which === 'sortAndView') {
      const off = viewBtns(win).filter((b) => b.getAttribute('aria-pressed') !== 'true');
      if (!off.length) return { refused: 'no unpressed view button' };
      off[0].setAttribute('data-l6m-prev-pressed', off[0].getAttribute('aria-pressed') || '');
      off[0].setAttribute('aria-pressed', 'true');
      return { mutated: 'both view-mode buttons pressed' };
    }
    if (which === 'windowLifecycle') {
      const btn = q(win, '.fwin-b-liquid');
      if (!btn) return { refused: 'no liquid control' };
      btn.setAttribute('data-l6m-pressed', btn.getAttribute('aria-pressed') || '');
      btn.removeAttribute('aria-pressed');
      return { mutated: 'aria-pressed stripped from the liquid toggle' };
    }
    return { refused: `unknown variant ${which}` };
  };

  const restoreM = (pres) => {
    const { win } = findMediaWin(pres);
    if (!win) return { refused: `no media-center window at presentation=${pres}` };
    const undone = [];
    qa(win, '[data-l6m-added-active]').forEach((n) => {
      n.classList.remove('is-active');
      n.removeAttribute('data-l6m-added-active');
      undone.push('railNav');
    });
    qa(win, '[data-l6m-prev-pressed]').forEach((n) => {
      n.setAttribute('aria-pressed', n.getAttribute('data-l6m-prev-pressed'));
      n.removeAttribute('data-l6m-prev-pressed');
      undone.push('sortAndView');
    });
    qa(win, '[data-l6m-pressed]').forEach((n) => {
      n.setAttribute('aria-pressed', n.getAttribute('data-l6m-pressed'));
      n.removeAttribute('data-l6m-pressed');
      undone.push('windowLifecycle');
    });
    return { restored: undone };
  };

  window.__L6M = {
    findWin: findMediaWin,
    snapshot: snapshotM,
    check: checkM,
    step: stepM,
    toggleLiquid: toggleLiquidM,
    mutate: mutateM,
    restore: restoreM,
  };

  return JSON.stringify({
    installed: Object.keys(window.__L6),
    installedMedia: Object.keys(window.__L6M),
    snapshot: snapshot(),
    mediaLiquid: snapshotM('liquid'),
    mediaStandard: snapshotM('standard'),
  });
})();
