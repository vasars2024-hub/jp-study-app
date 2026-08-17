/**
 * L6 instrument — rubric category 6, "Feature parity and reversibility", on the
 * Dictionary window, driven in BOTH presentations.
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
  return JSON.stringify({ installed: Object.keys(window.__L6), snapshot: snapshot() });
})();
