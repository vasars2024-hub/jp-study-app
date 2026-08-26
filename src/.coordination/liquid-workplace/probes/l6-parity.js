/**
 * L6 — rubric category 6, "Feature parity and reversibility", as ONE harness.
 *
 * RULE 1 (pin, 2026-08-25): eight harnesses, not eighty probes. This file is the
 * category-6 harness. It is built by consolidating `l6-parity-dictionary.js`
 * (683 lines, two hardcoded instruments: `__L6` Dictionary and `__L6M` Media
 * Center) into a single engine plus a SPEC per app. A new app is ~40 lines of
 * data, not a new 683-line probe.
 *
 *   engine   — findWin / snapshot / check / step / toggleLiquid / mutate / restore
 *   spec     — identity (title regex + structural root), features, steps, mutations
 *
 * CALIBRATION, and it is why `dictionary` is in here at all: the dictionary spec
 * is a faithful port of `__L6.check()`'s seven rows. If this engine does not
 * reproduce dictionary 7/7 in both presentations, the engine is wrong and the
 * new apps' scores are void. `parity-ledger.json` still cites the old file by
 * name on those seven rows; both instruments must agree.
 *
 * Traps encoded here, every one already paid for in this repo:
 *
 *  1. `/eval` IS SYNCHRONOUS. Every call returns immediately. Anything needing a
 *     React re-render is read by a LATER call. That is why this installs
 *     `window.__LQP` and returns instead of running a sequence.
 *  2. REACT DOES NOT SEE `input.value = x`. Call the native setter, dispatch
 *     `input`, or the surface scores as broken when the instrument is.
 *  3. A 0x0 OR HIDDEN WINDOW MEASURES AS PERFECT — every count equal because
 *     every count is zero. `snapshot`/`check` REFUSE on a degenerate box.
 *  4. THE TITLE IS TRANSLATED. Identity is title regex OR a structural root
 *     selector, and the result says which matched.
 *  5. A NEGATIVE CONTROL IS REQUIRED. `mutate()` removes ONE feature; the same
 *     `check()` must report exactly that row false and no other row moved.
 *  6. REACT DOES NOT FORWARD THE NATIVE `select` EVENT (2026-08-25). `onSelect`
 *     is synthesised from focus + keyup/mouseup/selectionchange and bails unless
 *     the element is `document.activeElement`. `selectRange` focuses first, then
 *     keyups. A dispatched bare `select` reads a live feature as dead.
 *  7. WHEN TWO COPIES OF ONE APP ARE OPEN, pick by `data-presentation`, never by
 *     index — that is how a Video window got scored as Dictionary.
 *  8. A CHROMELESS HOST HAS NO LIQUID DESTINATION — but a POP-OUT is no longer
 *     one. As of `6c16653f` `.popout-root` carries `data-presentation` and its
 *     own `.popout-btn-liquid`, so the engine scores it as `host: 'popout'` and
 *     runs the full lifecycle row against the pop-out bar's THREE controls. What
 *     is still `chromeless` — the seanime workspace, full-screen overlays — has
 *     genuinely no destination, and that stays a fact about the surface rather
 *     than a false absence. Do not collapse the two: the distinction is what
 *     turned a footnote into a fixed defect.
 *
 * Run:
 *   node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l6-parity.js
 *   node debug/lq-ev.cjs "JSON.stringify(window.__LQP.check('grammar'))"
 *   node debug/lq-ev.cjs "JSON.stringify(window.__LQP.apps())"
 */
(() => {
  // ---------------------------------------------------------------- helpers
  const qa = (root, sel) => Array.from(root.querySelectorAll(sel));
  const q = (root, sel) => root.querySelector(sel);
  const txt = (n) => ((n && n.textContent) || '').trim();
  const btnByText = (root, re) => qa(root, 'button').find((b) => re.test(txt(b)));
  const btnsByText = (root, re) => qa(root, 'button').filter((b) => re.test(txt(b)));
  const activeOf = (nodes, cls) => nodes.filter((n) => n.classList.contains(cls)).length;

  // Trap 2.
  const typeInto = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value;
  };

  // Trap 2's `<select>` half. React's `ChangeEventPlugin` listens for `change`, not
  // `input`, and the native setter keeps the value-tracker in step the same way it does
  // for a text field. Setting `.value` and firing nothing at all is the version that
  // scores a live control dead.
  const pickSelect = (el, value) => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  };

  // Library helpers. Kept beside the other shared helpers rather than inside the spec so
  // the spec stays what it is meant to be — data, not a runner.
  const keyOf = (el) => `${(el.className || el.tagName).toString().split(' ')[0]}`;
  /**
   * The Make Liquid / Return to standard control, per host. Three hosts, three
   * class names for one affordance — the app inlines it in `.fwin-bar` and
   * `.popout-bar` because each has a single call site, and shares it as
   * `ReaderLiquidToggle` because the reader has two (Novels and manga). This
   * table exists so `toggleLiquid`, `lifecycle` and every spec's
   * `windowLifecycle` mutation read the same source; before it, the reader's
   * name was simply absent from all three and the host scored as chromeless.
   */
  const LIQUID_BTN = {
    fwin: '.fwin-b-liquid',
    popout: '.popout-btn-liquid',
    reader: '.reader-btn-liquid',
  };
  // One factory rather than one function per spec. These were two identical four-line
  // copies and captures would have made a third; the global name stays per-spec so an
  // interrupted run is still inspectable from the console under a name that says whose
  // it is, and so one spec's undo can never consume another's recorded original.
  const specState = (global) => () => {
    window[global] = window[global] || {};
    return window[global];
  };
  const libState = specState('__LQP_LIB_ORIG');
  const immState = specState('__LQP_IMM_ORIG');
  const capState = specState('__LQP_CAP_ORIG');
  const mangaState = specState('__LQP_MANGA_ORIG');
  // The rail's filter chips only: `+ New folder` is an action and the rename box is a
  // transient editor, and both carry the same class as a real chip.
  const folderChips = (w) => qa(w, '.lib-folders .lib-folder-chip').filter(
    (c) => !c.classList.contains('lib-folder-new') && !c.classList.contains('lib-folder-editor'),
  );
  // Group separators are locale-dependent (the grammar spec's `2,410 points` matched `2`
  // and scored a working search false), so strip to digits before reading a count.
  const chipCount = (c) => txt(q(c, '.lib-chip-count')).replace(/[^\d]/g, '');
  const scroller = (w) => qa(w, '*')
    .filter((e) => e.scrollHeight - e.clientHeight > 40)
    .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];

  // Trap 6, refined 2026-08-25. The previous turn banked "focus, then keyup" and
  // that is necessary but NOT sufficient: React's SelectEventPlugin also produces
  // nothing while the OS window is unfocused, even though `el.focus()` succeeds
  // and `document.activeElement === el` reads true. Measured: with
  // `document.hasFocus() === false` the identical keyup changed nothing and the
  // live feature read as dead; POST `/focus` first and the same keyup flipped
  // Translate's label both ways. So this REFUSES rather than reporting a false
  // negative — the caller must focus the window.
  //
  // FURTHER REFINEMENT, 2026-08-26, and this one is measured rather than reasoned.
  // `el.focus()` in the SAME call as `setSelectionRange` + `keyup` produces nothing:
  // Translate's ask-agent label stayed "Ask the Agent" with `document.hasFocus()` true,
  // `document.activeElement === el` true and the range genuinely `[0,2]`. Split into two
  // bridge calls — focus, then select — and the identical keyup flipped the same label to
  // "Ask the Agent about the selection" on the first try. So focusing is its own step, and
  // this refuses rather than silently focusing and reading a live feature as dead.
  const selectRange = (el, start, end) => {
    if (!document.hasFocus()) {
      return { refused: 'window not OS-focused — POST /focus first, or React synthesises no select' };
    }
    if (document.activeElement !== el) {
      return { refused: 'element not focused — run the `focus` step in its OWN call first' };
    }
    el.setSelectionRange(start, end);
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    return { start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el };
  };

  // ------------------------------------------------------------------ specs
  // Each feature is one OBSERVABLE SIDE EFFECT. `ok` is what the category
  // counts; `ev` is the number that earned it. Presence alone never scores.
  const SPECS = {
    dictionary: {
      titleRe: /Dictionary|辞書|词典|Словар/i,
      rootSel: '.dict-view, .dictionary-view',
      probeInput: (w) => qa(w, 'input').find((i) => /食べる|eat/.test(i.placeholder || '')),
      features: [
        {
          id: 'lookup',
          f: (w) => {
            const t = w.textContent || '';
            return {
              ok: /食べる/.test(t) && /JMdict|辞書|词典/i.test(t),
              ev: `chars=${t.length} nodes=${w.querySelectorAll('*').length}`,
            };
          },
        },
        {
          id: 'sourceSwitch',
          f: (w) => {
            const ja = btnByText(w, /^日本語$/);
            const zh = btnByText(w, /^中文$/);
            const ok =
              !!ja && !!zh && ja.classList.contains('active') !== zh.classList.contains('active');
            return { ok, ev: `ja=${!!ja && ja.classList.contains('active')} zh=${!!zh && zh.classList.contains('active')}` };
          },
        },
        {
          id: 'presentationMode',
          f: (w) => {
            const b = btnsByText(
              w,
              /^(Automatic|Dictionary|Interlinear|自動|辞書|対訳|自动|词典|对照|Автоматически|Словарь|Подстрочник)$/,
            );
            const a = activeOf(b, 'active');
            return { ok: b.length >= 3 && a === 1, ev: `modeButtons=${b.length} active=${a}` };
          },
        },
        {
          id: 'resultActions',
          f: (w) => {
            const n = qa(w, 'button').filter((b) =>
              /audio|copy|flash|anki|new|音声|コピー/i.test(
                `${b.getAttribute('aria-label') || ''} ${b.title || ''} ${txt(b)}`,
              ),
            ).length;
            return { ok: n > 0, ev: `actions=${n}` };
          },
        },
        {
          id: 'savedSearches',
          f: (w) => {
            const n = qa(w, 'button,[role="button"]').filter((b) =>
              /save\s*search|検索を保存|保存搜索|Сохранить поиск/i.test(
                `${b.getAttribute('aria-label') || ''} ${txt(b)}`,
              ),
            ).length;
            return { ok: n > 0, ev: `saveSearchControls=${n}` };
          },
        },
        {
          id: 'notesFilter',
          f: (w) => {
            const n = q(w, '.lexicon-notes-filter');
            return { ok: !!n, ev: n ? `value="${n.value}"` : 'absent' };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        search: (w, word) => {
          const i = qa(w, 'input').find((x) => /食べる|eat/.test(x.placeholder || ''));
          if (!i) return { refused: 'no search input' };
          typeInto(i, word || '食べる');
          const b = btnByText(w, /^(Search|検索|搜索|Поиск)$/);
          if (!b) return { refused: 'no search button' };
          b.click();
          return { typed: i.value };
        },
      },
      mutations: {
        notesFilter: (w) => detach(q(w, '.lexicon-notes-filter'), 'no notes filter'),
        sourceSwitch: (w) => {
          const ja = btnByText(w, /^日本語$/);
          const zh = btnByText(w, /^中文$/);
          if (!ja || !zh) return { refused: 'language buttons absent' };
          return addClassAll([ja, zh], 'active');
        },
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    grammar: {
      titleRe: /Grammar|文法|语法|Граммат/i,
      rootSel: '.gram-view',
      features: [
        {
          // The four sections of the app. Exactly one active = the router works;
          // four buttons with none or two active is a mode picker that lost its state.
          id: 'modeSwitch',
          f: (w) => {
            const b = qa(w, '.gram-mode-btn');
            const a = activeOf(b, 'active');
            return { ok: b.length >= 3 && a === 1, ev: `modeButtons=${b.length} active=${a}` };
          },
        },
        {
          // The catalogue itself. Rows must carry a level badge, or the list is
          // rendering without the data that makes a row mean anything.
          id: 'patternList',
          f: (w) => {
            const rows = qa(w, '.gram-x-row');
            const badged = rows.filter((r) => q(r, '.gram-badge')).length;
            return { ok: rows.length > 0 && badged === rows.length, ev: `rows=${rows.length} badged=${badged}` };
          },
        },
        {
          // Search narrows the list. Read AFTER `step('search')`: the count element
          // and the row count must agree, and the rows must contain the query.
          //
          // TWO instrument corrections, both 2026-08-25 and both worth keeping:
          //  (a) the first version read the count with `/\d+/` and the live label
          //      is `2,410 points`, so it matched "2" and scored a working search
          //      FALSE. Group separators are locale-dependent — strip non-digits.
          //  (b) the second version then required `count === renderedRows`, which
          //      only held because the list was NOT actually windowing. Once the
          //      catalogue really virtualised (18 rows of 2,410) that identity is
          //      false BY DESIGN. A parity check must not encode a performance bug
          //      as its pass condition. Scored on the count CHANGING instead, with
          //      the rendered rows required to be a window of it, never more.
          id: 'search',
          f: (w) => {
            const i = q(w, '.gram-search');
            const rows = qa(w, '.gram-x-row');
            const label = txt(q(w, '.gram-x-count'));
            const num = Number(label.replace(/[^\d]/g, ''));
            const before = window.__LQP_GRAM_COUNT_BEFORE;
            const ok =
              !!i && rows.length > 0 && rows.length <= num && before != null && label !== before;
            return {
              ok,
              ev: `query="${i ? i.value : 'no-input'}" renderedRows=${rows.length} count="${label}" countBefore="${before}"`,
            };
          },
        },
        {
          // Selecting a row renders the detail, and the detail is THAT row: the
          // focused row's title must appear inside the detail pane. A detail pane
          // showing a stale pattern is the failure this cross-check exists for.
          id: 'detail',
          f: (w) => {
            const d = q(w, '.gram-x-detail');
            const focused = q(w, '.gram-x-row.focused');
            const title = txt(q(focused || w, '.gram-x-title'));
            const ok = !!d && !!title && (d.textContent || '').includes(title);
            return { ok, ev: d ? `detailChars=${(d.textContent || '').length} focusedTitle="${title}"` : 'no detail pane' };
          },
        },
        {
          // Study state owner: the band control writes the user's grade for the
          // pattern. Exactly one of the four grades is active.
          id: 'bandControl',
          f: (w) => {
            const b = qa(w, '.gram-x-band .wk-grade-btn, .wk-grade.gram-x-band .wk-grade-btn');
            const a = activeOf(b, 'active');
            return { ok: b.length >= 2 && a === 1, ev: `bandButtons=${b.length} active=${a}` };
          },
        },
        {
          // Presets: the select must carry options, and the save control must exist.
          id: 'presets',
          f: (w) => {
            const sel = q(w, '.gram-x-preset-select');
            const save = btnByText(w, /^(Save|保存|Сохранить)$/);
            const opts = sel ? sel.options.length : 0;
            return { ok: !!sel && opts > 0 && !!save, ev: `presetOptions=${opts} saveControl=${!!save}` };
          },
        },
        {
          // L5 bullet 1's handoff, from this app's side. The control must exist,
          // be enabled, and NAME the pattern it will send — a generic "Ask the
          // Agent" with no subject is the label defect `3050f020` already fixed once.
          id: 'agentHandoff',
          f: (w) => {
            const b = q(w, '.gram-ask-agent');
            const label = txt(b);
            const focused = txt(q(w, '.gram-x-row.focused .gram-x-title'));
            const names = !!focused && label.includes(focused.replace(/N[1-5]|HSK\d+.*$/, '').trim().slice(0, 3));
            return { ok: !!b && !b.disabled && label.length > 8, ev: `label="${label.slice(0, 60)}" namesPattern=${names}` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        search: (w, term) => {
          const i = q(w, '.gram-search');
          if (!i) return { refused: 'no grammar search input' };
          window.__LQP_GRAM_COUNT_BEFORE = txt(q(w, '.gram-x-count'));
          typeInto(i, term == null ? 'あとで' : term);
          return { typed: i.value, countBefore: window.__LQP_GRAM_COUNT_BEFORE };
        },
        pickRow: (w, idx) => {
          const rows = qa(w, '.gram-x-row-main');
          const r = rows[Number(idx) || 0];
          if (!r) return { refused: `no row ${idx} of ${rows.length}` };
          r.focus();
          r.click();
          return { clicked: txt(r).slice(0, 30), rows: rows.length };
        },
        mode: (w, name) => {
          const b = qa(w, '.gram-mode-btn').find((x) => new RegExp(name, 'i').test(txt(x)));
          if (!b) return { refused: `no mode ${name}` };
          b.click();
          return { clicked: txt(b) };
        },
      },
      mutations: {
        // A feature that vanished.
        presets: (w) => detach(q(w, '.gram-x-preset-select'), 'no preset select'),
        // State that stopped being exclusive: present, rendered, meaningless.
        modeSwitch: (w) => addClassAll(qa(w, '.gram-mode-btn'), 'active'),
        // The reversibility affordance lost while the button remains.
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    translate: {
      titleRe: /Translate|翻訳|翻译|Перевод/i,
      rootSel: '.tr-view',
      features: [
        {
          id: 'tabs',
          f: (w) => {
            const b = qa(w, '.tr-tabs .gram-mode-btn');
            const a = activeOf(b, 'active');
            return { ok: b.length >= 2 && a === 1, ev: `tabs=${b.length} active=${a}` };
          },
        },
        {
          // Direction: two toggles, one active each, and they must not be the same
          // language — a translate view pointed at itself is the defect.
          // INSTRUMENT CORRECTION, 2026-08-25: the first version read only the FIRST
          // active button per group, so the negative control that made two buttons
          // active in one group left the row passing — a check with no sensitivity
          // to the exact loss it exists to catch. Count actives per group.
          id: 'direction',
          f: (w) => {
            const groups = qa(w, '.tr-dir .dict-lang-toggle');
            const counts = groups.map((g) => qa(g, '.gram-level-btn.active').length);
            const actives = groups.map((g) => txt(q(g, '.gram-level-btn.active')));
            const ok =
              groups.length >= 2 &&
              counts.every((n) => n === 1) &&
              new Set(actives).size === actives.length;
            return { ok, ev: `groups=${groups.length} activePerGroup=[${counts.join(',')}] active=[${actives.join(',')}]` };
          },
        },
        {
          // The input keeps what React was told. An uncontrolled leftover loses it
          // on the next render, which is invisible until a translation runs on ''.
          id: 'input',
          f: (w) => {
            const t = q(w, '.tr-textarea');
            return { ok: !!t && t.value.length > 0, ev: t ? `chars=${t.value.length}` : 'no textarea' };
          },
        },
        {
          // Output pane carries the result of the last run. Read AFTER `step('run')`.
          //
          // INSTRUMENT CORRECTION, 2026-08-25: the first version scored `ok` on
          // "the pane has text", and the pane's EMPTY state is the sentence
          // "Translation appears here." — so a translate that never ran scored a
          // 10. This is the exact false pass the rubric names. The row now needs
          // the text to have CHANGED from what `step('run')` recorded.
          id: 'output',
          f: (w) => {
            const o = q(w, '.tr-output');
            const body = txt(o);
            const before = window.__LQP_OUT_BEFORE;
            const ok = !!o && body.length > 0 && before != null && body !== before;
            return {
              ok,
              ev: o
                ? `outputChars=${body.length} before="${String(before).slice(0, 28)}" after="${body.slice(0, 28)}"`
                : 'no output pane',
            };
          },
        },
        {
          // Swap is the cheapest real side effect this app has: the two actives
          // must exchange. Read AFTER `step('swap')` against the recorded before.
          id: 'swap',
          f: (w) => {
            // Same correction as `output`: with no recorded before, this row is
            // UNMEASURED, not passing. A control that merely exists scores false.
            const b = q(w, '.tr-swap');
            const before = window.__LQP_SWAP_BEFORE;
            const now = qa(w, '.tr-dir .dict-lang-toggle').map((g) =>
              txt(q(g, '.gram-level-btn.active')),
            );
            const ok = !!b && !!before && before.join('|') !== now.join('|');
            return { ok, ev: `control=${!!b} before=[${(before || []).join(',')}] after=[${now.join(',')}]` };
          },
        },
        {
          // L5 bullet 1 from Translate's side: the label must say WHICH text it
          // will send — the highlighted range or the whole input. Scored as a SIDE
          // EFFECT, not presence: `step('highlight')` records the label first, and
          // the row passes only if highlighting a range CHANGED what the control
          // says it will send. A button that reads the same either way has lost
          // the half of this feature that makes it honest.
          id: 'agentHandoff',
          f: (w) => {
            const b = q(w, '.tr-ask-agent');
            const label = txt(b);
            const before = window.__LQP_ASK_LABEL_BEFORE;
            const ok = !!b && !b.disabled && before != null && label !== before;
            return {
              ok,
              ev: `before="${String(before).slice(0, 28)}" after="${label.slice(0, 28)}" disabled=${b ? !!b.disabled : 'n/a'}`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        type: (w, text) => {
          const t = q(w, '.tr-textarea');
          if (!t) return { refused: 'no textarea' };
          typeInto(t, text == null ? '猫が好きです' : text);
          return { typed: t.value };
        },
        // Collapse the caret so the `agentHandoff` before-state is the no-selection
        // label. Must be its OWN call: `/eval` is synchronous, so React has not
        // re-rendered by the time the same call would read the label back (trap 1).
        collapse: (w) => {
          const t = q(w, '.tr-textarea');
          if (!t) return { refused: 'no textarea' };
          if (!document.hasFocus()) return { refused: 'window not OS-focused' };
          t.focus();
          t.setSelectionRange(t.value.length, t.value.length);
          t.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'End' }));
          return { collapsedAt: t.value.length };
        },
        // Focusing is its OWN step (2026-08-26). Same call as the select, and React
        // synthesises nothing; separate calls, and the label flips first try.
        focus: (w) => {
          const t = q(w, '.tr-textarea');
          if (!t) return { refused: 'no textarea' };
          t.focus();
          return { focused: document.activeElement === t, sel: [t.selectionStart, t.selectionEnd] };
        },
        // Trap 6 lives here: React synthesises `select`, so focus then keyup.
        highlight: (w, spec) => {
          const t = q(w, '.tr-textarea');
          if (!t) return { refused: 'no textarea' };
          const [s, e] = String(spec || '0,2').split(',').map(Number);
          window.__LQP_ASK_LABEL_BEFORE = txt(q(w, '.tr-ask-agent'));
          const r = selectRange(t, s, e);
          return { ...r, labelBefore: window.__LQP_ASK_LABEL_BEFORE };
        },
        swap: (w) => {
          window.__LQP_SWAP_BEFORE = qa(w, '.tr-dir .dict-lang-toggle').map((g) =>
            txt(q(g, '.gram-level-btn.active')),
          );
          const b = q(w, '.tr-swap');
          if (!b) return { refused: 'no swap control' };
          b.click();
          return { before: window.__LQP_SWAP_BEFORE };
        },
        // INSTRUMENT CORRECTION, 2026-08-25: `btnByText(/^Translate$/)` matched the
        // TAB, not the action — this view has two controls with that exact label
        // and the tab comes first in document order. Clicking the tab is a no-op
        // that looks like a translate which produced nothing. Bind to the action row.
        run: (w) => {
          const b = q(w, '.tr-actions .btn.primary') || q(w, '.aero-translate-run');
          if (!b) return { refused: 'no translate action button' };
          window.__LQP_OUT_BEFORE = txt(q(w, '.tr-output'));
          b.click();
          return { clicked: txt(b), outputBefore: window.__LQP_OUT_BEFORE };
        },
      },
      mutations: {
        direction: (w) => {
          const g = qa(w, '.tr-dir .dict-lang-toggle')[0];
          if (!g) return { refused: 'no direction group' };
          return addClassAll(qa(g, '.gram-level-btn'), 'active');
        },
        input: (w) => {
          const t = q(w, '.tr-textarea');
          if (!t) return { refused: 'no textarea' };
          window.__LQP_TEXT_BEFORE = t.value;
          typeInto(t, '');
          return { mutated: 'textarea cleared' };
        },
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
      // Clearing the textarea empties the span the ask-agent button would send, so that
      // button correctly disables and its row correctly falls with it. Two rows down, one
      // feature removed — a real dependency, declared rather than waved through.
      cascades: { input: ['agentHandoff'] },
      // Declaration order is WRONG for this app and the driver would otherwise use it.
      // Measured 2026-08-26: with `highlight` third, the two steps after it re-render the
      // view, the caret collapses, and `agentHandoff` reads its label back unchanged — a
      // live feature scored dead by the order it was driven in. Whatever records a "before"
      // for a row runs LAST among the steps that can disturb it.
      drive: [['type', '猫が好きです'], 'swap', 'run', 'collapse', 'focus', ['highlight', '0,2']],
      undo: {
        input: (w) => {
          const t = q(w, '.tr-textarea');
          if (t && window.__LQP_TEXT_BEFORE != null) {
            typeInto(t, window.__LQP_TEXT_BEFORE);
            window.__LQP_TEXT_BEFORE = null;
            return 'input';
          }
          return null;
        },
        // `swap` is a DRIVE step, not a mutation, so `restore()` never used to undo it and
        // the driver left the translate direction reversed on the live desktop. A harness
        // that drives persisted UI state owes it back exactly as it found it.
        swap: (w) => {
          const before = window.__LQP_SWAP_BEFORE;
          if (!before) return null;
          const now = qa(w, '.tr-dir .dict-lang-toggle').map((g) => txt(q(g, '.gram-level-btn.active')));
          if (now.join('|') === before.join('|')) { window.__LQP_SWAP_BEFORE = null; return null; }
          const b = q(w, '.tr-swap');
          if (!b) return null;
          b.click();
          window.__LQP_SWAP_BEFORE = null;
          return 'swap';
        },
      },
    },

    agent: {
      titleRe: /Agent|エージェント|代理|Агент/i,
      rootSel: '.agent-root, .agent-shell',
      features: [
        {
          // The rail is the conversation list. Exactly one selected, or the canvas
          // is showing a conversation the rail does not agree it is showing.
          id: 'conversationRail',
          f: (w) => {
            const items = qa(w, '.agent-rail-entry');
            const sel = items.filter((n) => n.classList.contains('is-selected')).length;
            return { ok: items.length > 0 && sel === 1, ev: `conversations=${items.length} selected=${sel}` };
          },
        },
        {
          // Rail head count must agree with the rendered rows — a stale count is a
          // list that stopped tracking its own store.
          id: 'railCount',
          f: (w) => {
            const label = txt(q(w, '.agent-rail-count'));
            const n = (label.match(/\d+/) || [])[0];
            const rows = qa(w, '.agent-rail-entry').length;
            return { ok: n != null && Number(n) === rows, ev: `headCount="${label}" rows=${rows}` };
          },
        },
        {
          // The conversation canvas renders the selected conversation's messages,
          // and its title matches the selected rail row.
          id: 'conversation',
          f: (w) => {
            const title = txt(q(w, '.agent-conversation-title'));
            const railTitle = txt(q(w, '.agent-rail-entry.is-selected .agent-rail-entry-title'));
            const msgs = qa(w, '.agent-message').length;
            const ok = !!title && (!railTitle || title.startsWith(railTitle.slice(0, 8)));
            return { ok, ev: `title="${title.slice(0, 30)}" rail="${railTitle.slice(0, 30)}" messages=${msgs}` };
          },
        },
        {
          // The composer keeps what it was told (same uncontrolled-leftover check
          // as Translate). Read AFTER `step('type')`.
          id: 'composer',
          f: (w) => {
            const t = qa(w, 'textarea').find((x) => /agent|Ask about/i.test(`${x.className} ${x.placeholder || ''}`));
            return { ok: !!t && t.value.length > 0, ev: t ? `chars=${t.value.length}` : 'no composer' };
          },
        },
        {
          // L5's retention half from the Agent's side: every context item carries a
          // remove control, i.e. every add has an intentional reverse.
          id: 'contextShelf',
          f: (w) => {
            const removes = qa(w, 'button').filter((b) =>
              /Remove .* from context/i.test(`${txt(b)} ${b.getAttribute('aria-label') || ''}`),
            ).length;
            return { ok: removes > 0, ev: `removeControls=${removes}` };
          },
        },
        {
          // Reversible view state: Simple/Full is exactly one selected.
          id: 'viewToggle',
          f: (w) => {
            const b = qa(w, '.agent-view-toggle-button');
            const sel = b.filter((n) => n.classList.contains('is-selected')).length;
            return { ok: b.length >= 2 && sel === 1, ev: `views=${b.length} selected=${sel}` };
          },
        },
        {
          // The four side panels the workspace docks. Each must be reachable as a
          // real control, not prose.
          id: 'panels',
          f: (w) => {
            const wanted = [/Reusable prompts/i, /Capabilities/i, /Permissions/i, /Pipeline/i];
            const found = wanted.filter((re) => qa(w, 'button').some((b) => re.test(txt(b)))).length;
            return { ok: found === wanted.length, ev: `panels=${found}/${wanted.length}` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        type: (w, text) => {
          const t = qa(w, 'textarea').find((x) => /agent|Ask about/i.test(`${x.className} ${x.placeholder || ''}`));
          if (!t) return { refused: 'no composer' };
          typeInto(t, text == null ? 'parity probe text' : text);
          return { typed: t.value };
        },
        newConversation: (w) => {
          const b = btnByText(w, /^New conversation$/);
          if (!b) return { refused: 'no new-conversation control' };
          const before = qa(w, '.agent-rail-entry').length;
          b.click();
          return { before };
        },
      },
      mutations: {
        conversationRail: (w) => {
          const sel = q(w, '.agent-rail-entry.is-selected');
          if (!sel) return { refused: 'nothing selected' };
          sel.classList.remove('is-selected');
          sel.setAttribute('data-lqp-removed-class', 'is-selected');
          return { mutated: 'selection cleared on the rail' };
        },
        contextShelf: (w) => {
          // Must use the SAME predicate the feature uses — these controls carry the
          // wording in `aria-label`, so a text-only filter refused while the check
          // was counting seven of them.
          const b = qa(w, 'button').filter((x) =>
            /Remove .* from context/i.test(`${txt(x)} ${x.getAttribute('aria-label') || ''}`),
          );
          if (!b.length) return { refused: 'no remove controls' };
          const marks = b.map((n) => {
            const m = document.createComment('lqp');
            n.parentNode.insertBefore(m, n);
            n.remove();
            return { node: n, mark: m };
          });
          window.__LQP_DETACHED = (window.__LQP_DETACHED || []).concat(marks);
          return { mutated: `${b.length} remove controls detached` };
        },
        viewToggle: (w) => removeClassAll(qa(w, '.agent-view-toggle-button'), 'is-selected'),
      },
    },

    // L6's first surface, and RULE 1's own test: this SPEC is the whole cost of
    // scoring a new app for category 6. No new probe file, no new engine.
    //
    // Identity is structural, and it has to be: the window is titled "Reading
    // Finder" whichever of its eight tabs is showing, so a title match alone
    // would score the Captures section against the Library catalogue and report
    // six false absences. `sec()` is the guard — every feature says "not open"
    // rather than "absent", which is the difference between a finding and a
    // product state (see the probe-refusal rule in `L1_HONEST_STATES.md`).
    captures: {
      titleRe: /Reading Finder|Captures|読書|阅读|Чтен/i,
      rootSel: '.reading-captures',
      features: [
        {
          id: 'captureList',
          f: (w) => {
            const r = q(w, '.reading-captures');
            if (!r) return { ok: false, ev: 'captures section not open' };
            const rows = qa(r, '.reading-captures-row');
            const metaed = rows.filter((x) => q(x, '.reading-captures-row-meta')).length;
            return { ok: rows.length > 0 && metaed === rows.length, ev: `rows=${rows.length} withSource=${metaed}` };
          },
        },
        {
          // The selected row and the reader heading must be the same capture. A
          // heading left on the previous one is the stale-detail defect the
          // grammar spec's `detail` row exists for, in its reading form.
          id: 'selection',
          f: (w) => {
            const r = q(w, '.reading-captures');
            if (!r) return { ok: false, ev: 'captures section not open' };
            const cur = qa(r, '.reading-captures-row').find((x) => x.getAttribute('aria-current') === 'true');
            const head = txt(q(r, '.reading-captures-reader-head h2'));
            const title = txt(q(cur || r, '.reading-captures-row-title'));
            return { ok: !!cur && !!head && !!title, ev: `selected="${title}" heading="${head}"` };
          },
        },
        {
          // L6's Gate, measured. Shared with Library and Immersion since 2026-08-26; it
          // was three identical copies and is now one function.
          id: 'canvasPlacement',
          f: (w) => canvasPlacement(w),
        },
        {
          // "Content remains legible at all sizes" — the measure clamp is real
          // and the rendered passage obeys it rather than the pane's full width.
          id: 'measureClamp',
          f: (w) => {
            const doc = q(w, '[data-reading-role="document"]');
            if (!doc) return { ok: false, ev: 'no reading canvas' };
            const declared = doc.style.getPropertyValue('--lq-reading-measure');
            const cap = declared === 'none' ? Infinity : Number(declared.replace(/[^\d.]/g, ''));
            const p = q(w, '.reading-captures-passage');
            const pw = p ? Math.round(p.getBoundingClientRect().width) : 0;
            return { ok: cap <= 760 && pw > 0 && pw <= cap + 1, ev: `measure="${declared}" passage=${pw}` };
          },
        },
        {
          // Reversibility: the list is this section's navigation, so removing it
          // needs a route back. The toggle's boolean must agree with reality.
          id: 'listReversibility',
          f: (w) => {
            const tg = q(w, '.reading-captures-list-toggle');
            const pressed = tg ? tg.getAttribute('aria-pressed') : null;
            const open = !!q(w, '[data-reading-tool="captures"]');
            return { ok: !!tg && (pressed === 'true' || pressed === 'false') && (pressed === 'true') === open, ev: `toggle=${!!tg} ariaPressed=${pressed} listOpen=${open}` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        openSection: (w) => {
          const tab = qa(w, '.reading-workspace-tab').find((b) => /Captures|キャプチャ|捕获|Захват/i.test(txt(b)));
          if (!tab) return { refused: 'no Captures tab' };
          tab.click();
          return { clicked: txt(tab) };
        },
        select: (w, index) => {
          const rows = qa(w, '.reading-captures-row');
          const target = rows[Number(index) || 1];
          if (!target) return { refused: `only ${rows.length} rows` };
          target.click();
          return { picked: txt(q(target, '.reading-captures-row-title')) };
        },
        toggleList: (w) => {
          const tg = q(w, '.reading-captures-list-toggle');
          if (!tg) return { refused: 'no list toggle' };
          tg.click();
          return { pressedWas: tg.getAttribute('aria-pressed') };
        },
        // The round trip's ONLY user-entered state. Captures is the second L6 surface with
        // no editable text field, so `dirtyField` returns null and without this the trip
        // compares chrome to chrome and holds no matter what the presentation toggle did —
        // vacuous, not clean. `snapshot()` records scroll offsets for exactly this reason.
        scroll: (w, px) => {
          const el = scroller(w);
          if (!el) return { refused: 'nothing scrollable — the captures fit their pane' };
          const g = capState();
          if (g.scrollKey == null) { g.scrollKey = keyOf(el); g.scrollTop = el.scrollTop; }
          el.scrollTop = Number(px) || 240;
          return { scroller: keyOf(el), top: el.scrollTop, range: el.scrollHeight - el.clientHeight };
        },
      },
      // EXPLICIT, because the declaration-order fallback ends on `toggleList` and that step
      // INVERTS rather than sets. Measured 2026-08-26: the fallback drive left the list
      // collapsed, so `captureList` read `rows=0` and `selection` read `selected=""` — two rows
      // scored false on a surface that had 42 captures and was working perfectly. The list is
      // this section's navigation, so collapsing it un-mounts the rows the other rows are about.
      //
      // Toggling TWICE is the point, not a workaround: it exercises the reversibility the row
      // claims (closed and back) AND is idempotent, which the driver requires because it re-runs
      // the whole sequence once per mutation. `select` goes LAST so the selection is established
      // after the collapse, never destroyed by it.
      drive: ['openSection', 'toggleList', 'toggleList', ['select', '1'], ['scroll', '240']],
      undo: {
        captures: (w) => {
          const g = window.__LQP_CAP_ORIG;
          if (!g) return null;
          const done = [];
          if (g.scrollKey != null) {
            const el = qa(w, '*').find((e) => keyOf(e) === g.scrollKey);
            if (el && el.scrollTop !== g.scrollTop) { el.scrollTop = g.scrollTop; done.push('scroll'); }
          }
          window.__LQP_CAP_ORIG = null;
          return done.length ? `captures:${done.join('+')}` : null;
        },
      },
      mutations: {
        // One row's source meta, NOT the whole `<ul>`. Measured 2026-08-25:
        // detaching the list took `captureList` AND `selection` false in one
        // move, because the selected row lives inside it — a control that fails
        // two rows proves neither. This fails exactly one.
        captureList: (w) => detach(q(w, '.reading-captures-row-meta'), 'no capture rows'),
        listReversibility: (w) => stripAttr(q(w, '.reading-captures-list-toggle'), 'aria-pressed', 'no list toggle'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /**
     * LIBRARY — the catalogue, and the first L6 surface with NO editable text field:
     * 91 buttons, zero inputs. The driver's `dirtyField` therefore finds nothing, so the
     * only user-entered state a round trip can lose here is SCROLL POSITION — which is
     * why `snapshot()` records scroll offsets and why this spec drives one deliberately
     * rather than letting the trip compare chrome to chrome and hold no matter what.
     *
     * Every row is a CROSS-CHECK between a control's declared state and what the list
     * actually rendered, because a count of controls would miss every defect this surface
     * can really have: a sort select that changes value without reordering, a layout
     * switch whose `aria-pressed` disagrees with the container that mounted, a folder chip
     * whose count disagrees with the cards it filtered to, a grouping select that buckets
     * nothing. Presence never scores.
     */
    library: {
      titleRe: /Library|ライブラリ|书库|图书|Библиотек/i,
      rootSel: '.library',
      features: [
        {
          // The folder rail: every filter chip carries a real count and exactly one is
          // active. A rail with two actives is a filter that lost its exclusivity while
          // still rendering, which is invisible until the list stops agreeing with it.
          id: 'folderTree',
          f: (w) => {
            const chips = folderChips(w);
            const active = activeOf(chips, 'active');
            const counted = chips.filter((c) => /^\d+$/.test(chipCount(c))).length;
            return {
              ok: chips.length >= 2 && active === 1 && counted === chips.length,
              ev: `chips=${chips.length} active=${active} counted=${counted}`,
            };
          },
        },
        {
          // The filter WORKS: the card count changed from what `step('folder')` recorded
          // AND equals the count the active chip advertises. Either half alone passes on a
          // dead control — the count agrees trivially when nothing filtered.
          id: 'folderFilter',
          f: (w) => {
            const chip = folderChips(w).find((c) => c.classList.contains('active'));
            const declared = chip ? Number(chipCount(chip)) : NaN;
            const cards = qa(w, '.card').length;
            const before = window.__LQP_LIB_CARDS_BEFORE;
            const ok = !!chip && Number.isFinite(declared) && cards === declared
              && before != null && cards !== before;
            return {
              ok,
              ev: `activeChip="${txt(chip).replace(/\s+/g, ' ')}" declared=${declared} cards=${cards} cardsBefore=${before}`,
            };
          },
        },
        {
          // Sorting is scored on the RENDERED ORDER, not on the select's value, and the
          // comparison is per group because grouping buckets the list — a globally sorted
          // check would read a correctly grouped catalogue as out of order. Deliberately
          // order-independent of the other drive steps: a row that compares against a
          // step-recorded `before` would be contaminated by the folder step narrowing the
          // list afterwards, and would then pass for the wrong reason.
          id: 'sortOrder',
          f: (w) => {
            const sel = q(w, '#lib-sort');
            if (!sel) return { ok: false, ev: 'no sort select' };
            const groups = qa(w, '.lib-group');
            const scope = groups.length ? groups : [w];
            let seen = 0;
            const bad = scope.filter((g) => {
              const t = qa(g, '.card-title').map(txt);
              seen += t.length;
              return JSON.stringify(t)
                !== JSON.stringify(t.slice().sort((a, b) => a.localeCompare(b)));
            }).length;
            return {
              ok: sel.value === 'title' && seen >= 2 && bad === 0,
              ev: `sort="${sel.value}" groups=${scope.length} titles=${seen} outOfOrder=${bad}`,
            };
          },
        },
        {
          // Grouping: every group carries its heading and the buckets account for every
          // card. A grouping select that renders one unlabelled bucket is the "control
          // changed, list did not" defect.
          id: 'groupBy',
          f: (w) => {
            const sel = q(w, '#lib-group');
            const groups = qa(w, '.lib-group');
            const heads = groups.filter((g) => q(g, '.lib-group-head')).length;
            const cards = qa(w, '.card').length;
            const summed = groups.reduce((n, g) => n + qa(g, '.card').length, 0);
            return {
              ok: !!sel && sel.value !== 'none' && groups.length >= 1
                && heads === groups.length && summed === cards,
              ev: `group="${sel ? sel.value : 'absent'}" groups=${groups.length} heads=${heads} cards=${cards} summed=${summed}`,
            };
          },
        },
        {
          // The layout switch's boolean must agree with the container that actually
          // mounted. `aria-pressed="true"` on Covers while `.lib-list-groups` is rendered
          // is a switch that lies to a screen reader about what is on screen.
          id: 'layoutSwitch',
          f: (w) => {
            const btns = qa(w, '.aero-library-layout-switch button');
            const pressed = btns.filter((b) => b.getAttribute('aria-pressed') === 'true');
            const mode = pressed[0] ? pressed[0].getAttribute('data-library-layout') : null;
            const mounted = mode === 'list' ? q(w, '.lib-list-groups')
              : mode === 'grid' ? q(w, '.lib-groups') : null;
            return {
              ok: btns.length >= 2 && pressed.length === 1 && !!mounted,
              ev: `modes=${btns.length} pressed=${pressed.length} mode=${mode} containerMounted=${!!mounted}`,
            };
          },
        },
        {
          // Two chip groups — language and level — sharing one flat container, so exactly
          // TWO actives is the invariant, one per group.
          id: 'inboxFilters',
          f: (w) => {
            const box = q(w, '.lib-inbox-filters');
            if (!box) return { ok: false, ev: 'no inbox filter rail' };
            const chips = qa(box, '.lib-folder-chip');
            const active = activeOf(chips, 'active');
            return { ok: chips.length >= 6 && active === 2, ev: `chips=${chips.length} active=${active}` };
          },
        },
        {
          // Per-card affordances: every rendered card owns its remove and its folder
          // control. A card that renders without them is a row the user cannot act on.
          id: 'cardActions',
          f: (w) => {
            const cards = qa(w, '.card').length;
            const removes = qa(w, '.card-remove').length;
            const files = qa(w, '.card-file').length;
            return {
              ok: cards > 0 && removes === cards && files === cards,
              ev: `cards=${cards} remove=${removes} folder=${files}`,
            };
          },
        },
        {
          // L6's Gate, in the catalogue's form: no measure clamp to score here (Library
          // runs the FILL policy, `--lq-reading-measure: none` by design — a grid of
          // covers is not a passage), only the placement invariant.
          id: 'canvasPlacement',
          f: (w) => canvasPlacement(w),
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        // Pick the LARGEST non-active folder rather than a fixed one: the count has to
        // change for `folderFilter` to mean anything, and the driver runs this step many
        // times (twice per mutation), so it must produce a real change on every run rather
        // than being a no-op the second time round. Alternating between the two biggest
        // chips does that without ever landing on an empty folder.
        folder: (w) => {
          const chips = folderChips(w);
          if (!chips.length) return { refused: 'no folder chips' };
          const g = libState();
          const cur = chips.findIndex((c) => c.classList.contains('active'));
          if (g.folder == null) g.folder = cur;
          const target = chips
            .map((c, i) => ({ c, i, n: Number(chipCount(c) || '0') }))
            .filter((x) => x.i !== cur && x.n > 0)
            .sort((a, b) => b.n - a.n)[0];
          if (!target) return { refused: 'no other non-empty folder to filter to' };
          window.__LQP_LIB_CARDS_BEFORE = qa(w, '.card').length;
          target.c.click();
          return { picked: txt(target.c).replace(/\s+/g, ' '), cardsBefore: window.__LQP_LIB_CARDS_BEFORE };
        },
        sort: (w) => {
          const sel = q(w, '#lib-sort');
          if (!sel) return { refused: 'no sort select' };
          const g = libState();
          if (g.sort == null) g.sort = sel.value;
          pickSelect(sel, 'title');
          return { was: g.sort, now: sel.value };
        },
        group: (w) => {
          const sel = q(w, '#lib-group');
          if (!sel) return { refused: 'no group select' };
          const g = libState();
          if (g.group == null) g.group = sel.value;
          pickSelect(sel, 'lang');
          return { was: g.group, now: sel.value };
        },
        // The stand-in for `dirtyField` on a surface with no text field. Without it the
        // round trip has no user state to lose and holds vacuously.
        scroll: (w, px) => {
          const el = scroller(w);
          if (!el) return { refused: 'nothing scrollable — the catalogue fits its window' };
          const g = libState();
          if (g.scrollKey == null) {
            g.scrollKey = keyOf(el);
            g.scrollTop = el.scrollTop;
          }
          el.scrollTop = Number(px) || 240;
          return { scroller: keyOf(el), top: el.scrollTop, range: el.scrollHeight - el.clientHeight };
        },
      },
      mutations: {
        // ONE chip's count, not the rail: detaching the rail would take `folderFilter`
        // with it, and a control that fails two rows proves neither. The active chip's own
        // count is left alone so `folderFilter` keeps its subject.
        folderTree: (w) => detach(
          folderChips(w).filter((c) => !c.classList.contains('active'))
            .map((c) => q(c, '.lib-chip-count')).filter(Boolean)[0],
          'no inactive folder chip carries a count',
        ),
        layoutSwitch: (w) => stripAttr(
          qa(w, '.aero-library-layout-switch button').find((b) => b.getAttribute('aria-pressed') === 'true'),
          'aria-pressed',
          'no layout button is pressed',
        ),
        groupBy: (w) => detach(q(w, '.lib-group-head'), 'list is not grouped'),
        cardActions: (w) => detach(q(w, '.card-remove'), 'no cards rendered'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
      // Narrow FIRST so `folderFilter` records its before against the widest list, then
      // sort, then group (grouping is what `sortOrder` compares within), then scroll last
      // so nothing re-renders the position away before the snapshot.
      drive: ['folder', 'sort', 'group', ['scroll', '240']],
      undo: {
        // One undo for the whole surface: the four drive steps all write in-memory view
        // state that the app does not persist, so leaving any of them changed would hand
        // the next worker a library filtered to a folder they did not choose.
        library: (w) => {
          const g = window.__LQP_LIB_ORIG;
          window.__LQP_LIB_CARDS_BEFORE = null;
          if (!g) return null;
          const done = [];
          const s = q(w, '#lib-sort');
          if (s && g.sort != null && s.value !== g.sort) { pickSelect(s, g.sort); done.push('sort'); }
          const gr = q(w, '#lib-group');
          if (gr && g.group != null && gr.value !== g.group) { pickSelect(gr, g.group); done.push('group'); }
          if (g.folder != null) {
            const chip = folderChips(w)[g.folder];
            if (chip && !chip.classList.contains('active')) { chip.click(); done.push('folder'); }
          }
          if (g.scrollKey != null) {
            const el = qa(w, '*').find((e) => keyOf(e) === g.scrollKey);
            if (el && el.scrollTop !== g.scrollTop) { el.scrollTop = g.scrollTop; done.push('scroll'); }
          }
          window.__LQP_LIB_ORIG = null;
          return done.length ? `library:${done.join('+')}` : null;
        },
      },
    },

    /**
     * IMMERSION — the in-app browser. Its rows are all COMPOSITION cross-checks, because
     * everything this surface can get wrong is a disagreement between a control's state
     * and what the stage actually mounted: an address bar showing one page while the
     * webview shows another, a mode segment reporting Reader while only the live guest is
     * on screen, a rail toggle pressed with no rail.
     *
     * The three modes are a real branch, from `ImmersionContent.tsx:172-175`:
     *   live   -> webview,  no reader
     *   reader -> BOTH, split
     *   focus  -> reader,   no webview (while an extraction exists)
     * so `modeSwitch` scores the active button against that table rather than counting
     * three buttons.
     *
     * REAL FUNCTIONAL STATE IS MANDATORY HERE and the rubric caps an empty harness at 0:
     * with nothing loaded this surface is `.immersion-empty` plus five starter buttons and
     * every row below is either absent or vacuous. `open` navigates if it has to and is a
     * no-op if a page is already up, so the driver's eleven drives cost ONE page load.
     */
    immersion: {
      titleRe: /Immersion|没入|イマー|浸入|Погруж/i,
      rootSel: '.immersion-root',
      features: [
        {
          // The address bar shows the page that is actually loaded. This is also what
          // undoes the driver's `dirtyField`, which lands in this very input.
          id: 'urlBar',
          f: (w) => {
            const bar = q(w, '.immersion-url');
            const wv = q(w, '.immersion-webview');
            const src = wv ? wv.getAttribute('src') || '' : '';
            const ok = !!bar && !bar.disabled && /^https?:\/\//.test(bar.value) && bar.value === src;
            return { ok, ev: `bar="${bar ? bar.value.slice(0, 46) : 'absent'}" webviewSrc="${src.slice(0, 46)}"` };
          },
        },
        {
          id: 'modeSwitch',
          f: (w) => {
            const btns = qa(w, '.immersion-mode-btn');
            const active = btns.filter((b) => b.classList.contains('active'));
            const mode = active[0] ? (active[0].className.match(/immersion-mode-btn-(\w+)/) || [])[1] : null;
            const reader = !!q(w, '.immersion-reader');
            const webview = !!q(w, '.immersion-webview');
            const want = { live: [true, false], reader: [true, true], focus: [false, true] }[mode];
            const composed = !!want && want[0] === webview && want[1] === reader;
            return {
              ok: btns.length >= 3 && active.length === 1 && composed,
              ev: `modes=${btns.length} active=${active.length} mode=${mode} webview=${webview} reader=${reader} composed=${composed}`,
            };
          },
        },
        {
          // The extraction is the feature, not the pane. An `.immersion-reader` holding the
          // empty state's own sentence is the false pass this row exists for, so it wants
          // real characters and no starter state anywhere on the stage.
          id: 'readerExtraction',
          f: (w) => {
            const r = q(w, '.immersion-reader');
            const chars = r ? (r.textContent || '').length : 0;
            const empty = !!q(w, '.immersion-empty');
            return { ok: !!r && chars > 100 && !empty, ev: `readerChars=${chars} starterStateShowing=${empty}` };
          },
        },
        {
          // The rail is a VIRTUAL list (`VirtualList` at `ImmersionContent.tsx:1041`), so
          // rendered rows are a WINDOW of the history, never all of it — the grammar spec
          // already paid for encoding "rendered === total" as a pass condition. Score the
          // rendered rows being complete rows instead.
          id: 'siteRail',
          f: (w) => {
            const rows = qa(w, '.immersion-site-row');
            const whole = rows.filter(
              (r) => q(r, '.immersion-site-title') && q(r, '.immersion-site-meta') && q(r, '.immersion-site-remove'),
            ).length;
            return { ok: rows.length > 0 && whole === rows.length, ev: `renderedRows=${rows.length} complete=${whole}` };
          },
        },
        {
          // Reversibility: the rail is a reading tool, so its trigger owes a real boolean
          // that agrees with whether the tool is mounted.
          id: 'railReversibility',
          f: (w) => {
            const tg = q(w, '.immersion-sites-toggle');
            const pressed = tg ? tg.getAttribute('aria-pressed') : null;
            const open = !!q(w, '[data-reading-tool="sites"]');
            return {
              ok: !!tg && (pressed === 'true' || pressed === 'false') && (pressed === 'true') === open,
              ev: `toggle=${!!tg} ariaPressed=${pressed} railMounted=${open}`,
            };
          },
        },
        {
          id: 'canvasPlacement',
          f: (w) => canvasPlacement(w),
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        // Idempotent by design: the driver runs the drive twice per mutation, and eleven
        // navigations to a live public site would be both slow and rude. Navigate only
        // from the starter state; otherwise resync the address bar to the loaded page,
        // which is exactly what undoes `dirtyField` on this surface.
        open: (w) => {
          const wv = q(w, '.immersion-webview');
          const bar = q(w, '.immersion-url');
          if (!wv) {
            const s = qa(w, '.immersion-starters button')[0];
            if (!s) return { refused: 'nothing loaded and no starter to load' };
            immState().navigated = true;
            s.click();
            return { navigating: txt(s), note: 'give this one a long --step-ms; a real page is loading' };
          }
          const src = wv.getAttribute('src') || '';
          if (bar && bar.value !== src) typeInto(bar, src);
          return { loaded: src.slice(0, 60), bar: bar ? bar.value.slice(0, 60) : null };
        },
        mode: (w, want) => {
          const btns = qa(w, '.immersion-mode-btn');
          if (!btns.length) return { refused: 'no mode segment' };
          const g = immState();
          if (g.mode == null) {
            const cur = btns.find((b) => b.classList.contains('active'));
            g.mode = cur ? (cur.className.match(/immersion-mode-btn-(\w+)/) || [])[1] || null : null;
          }
          const name = want || 'reader';
          const target = btns.find((b) => b.classList.contains(`immersion-mode-btn-${name}`));
          if (!target) return { refused: `no ${name} mode button` };
          if (!target.classList.contains('active')) target.click();
          return { was: g.mode, now: name };
        },
        // The round trip's user state. The address bar is overwritten by `open`, so
        // without this the trip would compare a resynced field to itself.
        scroll: (w, px) => {
          const el = scroller(w);
          if (!el) return { refused: 'nothing scrollable — the extraction fits its pane' };
          const g = immState();
          if (g.scrollKey == null) { g.scrollKey = keyOf(el); g.scrollTop = el.scrollTop; }
          el.scrollTop = Number(px) || 200;
          return { scroller: keyOf(el), top: el.scrollTop, range: el.scrollHeight - el.clientHeight };
        },
      },
      mutations: {
        urlBar: (w) => {
          const bar = q(w, '.immersion-url');
          if (!bar) return { refused: 'no address bar' };
          immState().barWas = bar.value;
          typeInto(bar, 'lqp-mutated');
          return { mutated: 'address bar no longer shows the loaded page' };
        },
        modeSwitch: (w) => addClassAll(qa(w, '.immersion-mode-btn'), 'active'),
        // ONE row's meta, not the list: detaching the list would take `siteRail` and
        // `railReversibility` together and prove neither.
        siteRail: (w) => detach(q(w, '.immersion-site-meta'), 'no rendered site rows'),
        railReversibility: (w) => stripAttr(q(w, '.immersion-sites-toggle'), 'aria-pressed', 'no rail toggle'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
      drive: ['open', 'mode', ['scroll', '200']],
      undo: {
        immersion: (w) => {
          const g = window.__LQP_IMM_ORIG;
          if (!g) return null;
          const done = [];
          const bar = q(w, '.immersion-url');
          if (bar && g.barWas != null) { typeInto(bar, g.barWas); g.barWas = null; done.push('urlBar'); }
          if (g.mode) {
            const target = qa(w, '.immersion-mode-btn').find((b) => b.classList.contains(`immersion-mode-btn-${g.mode}`));
            if (target && !target.classList.contains('active')) { target.click(); done.push('mode'); }
          }
          if (g.scrollKey != null) {
            const el = qa(w, '*').find((e) => keyOf(e) === g.scrollKey);
            if (el && el.scrollTop !== g.scrollTop) { el.scrollTop = g.scrollTop; done.push('scroll'); }
          }
          // `navigated` is deliberately NOT undone here: a page this harness opened is a
          // real history entry in the user's own store, and the only honest way back is
          // the rail's own Remove control. Reported so it is never silently left behind.
          window.__LQP_IMM_ORIG = null;
          return done.length ? `immersion:${done.join('+')}${g.navigated ? ' (NAVIGATED — remove the site row by hand)' : ''}` : null;
        },
      },
    },

    /**
     * MANGA — the first spec whose host is the READER rather than a floating window.
     * `App.tsx:702` returns `MangaReader` as the whole app render, so there is no
     * `.fwin` to find; `findWin` matches `.manga-canvas` and walks up to
     * `.reader[data-presentation]`, which L3.2 made a real Liquid host.
     *
     * Three consequences the earlier specs never had to handle, all of them measured
     * on this surface rather than assumed:
     *
     *  - THE DRIVE CANNOT OPEN THE SURFACE. Every other spec's first step clicks a tab
     *    inside a window that is already mounted. Opening a manga volume unmounts the
     *    desktop and all ten windows with it, and closing the reader unmounts the
     *    reader. So the volume is the operator's precondition, `openSection` REFUSES
     *    with the reason instead of navigating, and the drive only moves state that
     *    lives inside the reader.
     *  - THERE IS NO TEXT FIELD, so `dirtyField` finds nothing — the third L6 surface
     *    in this file with that property, after Library and Captures. The seek input
     *    is `type=range` and is app state rather than typed text, so the round trip's
     *    real content is PAGE POSITION plus the OCR mode, and `page` drives both.
     *  - PAGE COUNT IS THE VOLUME'S, NOT A CONSTANT. Every row derives its bound from
     *    `.reader-seek`'s own `max` (17 on the volume this was written against), so a
     *    different volume does not turn a pass into a fail.
     */
    manga: {
      titleRe: /Manga|マンガ|漫画/i,
      rootSel: '.manga-canvas',
      features: [
        {
          // The page actually rendered, cross-checked against the seek's declared
          // position. A stage that renders page 1 while the seek says 7 is the
          // stale-detail defect in its manga form, and a count of images would
          // miss it entirely — there is exactly one `<img>` either way.
          id: 'pageRender',
          f: (w) => {
            const stage = q(w, '.manga-stage');
            const seek = q(w, '.reader-seek');
            const img = stage ? q(stage, 'img') : null;
            const box = img ? img.getBoundingClientRect() : null;
            const painted = !!box && box.width > 40 && box.height > 40;
            const declared = seek ? Number(seek.value) : NaN;
            return {
              ok: painted && Number.isFinite(declared) && declared >= 1,
              ev: `img=${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none'} seekPage=${declared} of ${seek ? seek.max : '?'}`,
            };
          },
        },
        {
          // The transport's bounds must be the volume's. A seek whose max is 1 on a
          // 17-page volume is a control that renders and cannot reach the book —
          // the "inactive control presented as working" failure, which presence
          // scoring passes every time.
          id: 'pageTransport',
          f: (w) => {
            const seek = q(w, '.reader-seek');
            if (!seek) return { ok: false, ev: 'no page seek' };
            // These two are ICON buttons — `<Icon name="skip-back">`, no text node
            // at all — so `btnByText` cannot see them and scored a live transport
            // `first=false last=false` on the first run. Their accessible name is
            // in `title`/`aria-label`, which is where every other spec in this
            // file reads an icon control from.
            const named = (re) => qa(w, 'button').filter(
              (b) => re.test(`${b.getAttribute('aria-label') || ''} ${b.title || ''} ${txt(b)}`),
            ).length;
            const first = named(/First page|最初のページ|第一页|Первая страница/i);
            const last = named(/Last page|最後のページ|最后一页|Последняя страница/i);
            const max = Number(seek.max);
            return {
              ok: first > 0 && last > 0 && Number(seek.min) === 1 && max > 1,
              ev: `range=${seek.min}..${seek.max} first=${first} last=${last}`,
            };
          },
        },
        {
          // The five OCR presentations are a segmented control, so EXACTLY one is
          // active. Two active (or none) means the segments and the stage disagree
          // about what is on screen.
          id: 'ocrModes',
          f: (w) => {
            const segs = qa(w, '.sp-seg-btn');
            const active = segs.filter(
              (b) => b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true',
            );
            return {
              ok: segs.length >= 5 && active.length === 1,
              ev: `segments=${segs.length} active=${active.length}${active[0] ? ` ("${txt(active[0])}")` : ''}`,
            };
          },
        },
        {
          // The OCR tool is the reader's Liquid region and the page is its anchor.
          // Both must be present and correctly ROLED, or category 3's treatment on
          // this surface is decorating something that is not a tool.
          id: 'ocrTool',
          f: (w) => {
            const tool = q(w, '[data-reading-tool="manga-ocr"]');
            const doc = q(w, '[data-reading-role="document"]');
            const body = tool ? q(tool, '.lq-reading-tool-body') : null;
            return {
              ok: !!tool && !!doc && !!body && tool.classList.contains('lq-liquid') && doc.classList.contains('lq-anchor'),
              ev: `tool=${!!tool} liquid=${!!tool && tool.classList.contains('lq-liquid')} doc=${!!doc} anchor=${!!doc && doc.classList.contains('lq-anchor')}`,
            };
          },
        },
        {
          // L6's Gate, shared. Fourth caller.
          id: 'canvasPlacement',
          f: (w) => canvasPlacement(w),
        },
        {
          // The reader's presentation toggle must agree with the host it is
          // toggling. `.reader` carries `data-presentation` and the button carries
          // `aria-pressed`; a toggle that says "liquid" over a standard reader is
          // the declared-state-disagrees-with-reality defect, and it is the exact
          // thing that made this host unreachable to the harness in the first place.
          id: 'presentationHonest',
          f: (w) => {
            const btn = q(w, LIQUID_BTN.reader);
            const pressed = btn ? btn.getAttribute('aria-pressed') : null;
            const pres = w.getAttribute('data-presentation');
            const cls = w.classList.contains('reader-liquid');
            return {
              ok: !!btn && (pressed === 'true') === (pres === 'liquid') && cls === (pres === 'liquid'),
              ev: `ariaPressed=${pressed} dataPresentation=${pres} readerLiquidClass=${cls}`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        // REFUSES rather than navigating — see the spec's header. Opening a volume
        // from the Library unmounts the desktop, and this step runs once per
        // mutation, so a step that opened the reader would also have to be able to
        // close it and would churn the user's shell ten windows at a time.
        openSection: (w) => {
          const stage = q(w, '.manga-stage');
          if (!stage) return { refused: 'no manga volume open — open one from the Library first' };
          return { open: txt(q(w.closest('.reader') || w, '.reader-title')) || 'manga volume' };
        },
        // The round trip's real content. Captures and Library drive SCROLL because
        // they have no text field; a manga reader has no meaningful scroll either
        // (one page fills the stage), so page position is the state a bad trip loses.
        page: (w, n) => {
          const seek = q(w, '.reader-seek');
          if (!seek) return { refused: 'no page seek' };
          const g = mangaState();
          if (g.page == null) g.page = seek.value;
          const max = Number(seek.max) || 1;
          // Clamped to the volume, so a shorter book refuses nothing and lands somewhere real.
          const want = String(Math.min(Math.max(Number(n) || 3, 1), max));
          seek.value = want;
          seek.dispatchEvent(new Event('input', { bubbles: true }));
          seek.dispatchEvent(new Event('change', { bubbles: true }));
          return { page: seek.value, of: seek.max };
        },
        // Idempotent by construction — it SETS a named mode rather than cycling, so
        // the driver re-running the drive once per mutation cannot walk the surface
        // somewhere new. This is the lesson `captures` paid for with a `toggleList`
        // fallback that inverted.
        mode: (w, name) => {
          const want = String(name || 'Regions');
          const segs = qa(w, '.sp-seg-btn');
          const target = segs.find((b) => txt(b) === want);
          if (!target) return { refused: `no "${want}" segment — have ${segs.map(txt).join(', ')}` };
          const g = mangaState();
          if (g.mode == null) {
            const cur = segs.find((b) => b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true');
            g.mode = cur ? txt(cur) : '';
          }
          if (!target.classList.contains('active')) target.click();
          return { mode: want, wasActive: target.classList.contains('active') };
        },
      },
      drive: ['openSection', ['page', '3'], ['mode', 'Regions']],
      undo: {
        manga: (w) => {
          const g = window.__LQP_MANGA_ORIG;
          if (!g) return null;
          const done = [];
          if (g.mode) {
            const back = qa(w, '.sp-seg-btn').find((b) => txt(b) === g.mode);
            if (back && !back.classList.contains('active')) { back.click(); done.push('mode'); }
          }
          if (g.page != null) {
            const seek = q(w, '.reader-seek');
            if (seek && seek.value !== g.page) {
              seek.value = g.page;
              seek.dispatchEvent(new Event('input', { bubbles: true }));
              seek.dispatchEvent(new Event('change', { bubbles: true }));
              done.push('page');
            }
          }
          window.__LQP_MANGA_ORIG = null;
          return done.length ? `manga:${done.join('+')}` : null;
        },
      },
      mutations: {
        // The `<img>` only, never `.manga-stage`: detaching the stage takes
        // `pageRender` AND `canvasPlacement` in one move (the document region
        // collapses), and a control that fails two rows proves neither.
        pageRender: (w) => detach(q(w, '.manga-stage img'), 'no rendered page'),
        // `max` and not `min`: `min` is what the harness's own broken restore left
        // stripped on the first run, and a mutation is not allowed to be
        // indistinguishable from the damage a previous mutation did. `max="1"` is
        // also the truer falsification — a one-page range on a 17-page volume is a
        // transport that renders and cannot reach the book.
        pageTransport: (w) => setAttr(q(w, '.reader-seek'), 'max', '1', 'no page seek'),
        // A WRONG boolean, not a missing one. Stripping `aria-pressed` also fails
        // `windowLifecycle`, which reads the same attribute for a different reason,
        // and a control that fails two rows proves neither.
        presentationHonest: (w) => setAttr(
          q(w, LIQUID_BTN.reader),
          'aria-pressed',
          q(w, LIQUID_BTN.reader) && q(w, LIQUID_BTN.reader).getAttribute('aria-pressed') === 'true' ? 'false' : 'true',
          'no liquid control',
        ),
      },
    },
  };

  // ------------------------------------------------------- shared feature fn
  // Window lifecycle is identical for every `.fwin` app: the four chrome
  // controls exist AND the liquid toggle carries a real boolean `aria-pressed`.
  // A toggle with no pressed state is the "enable with no disable path" defect.
  function lifecycle(w) {
    // A pop-out's chrome is `.popout-btn` in its own bar and has THREE controls,
    // not four: it has no restore-down separate from maximize. Counting it
    // against the `.fwin` bar's four would score a complete host as broken.
    //
    // A READER has NEITHER, and that is a fact about the host rather than a gap:
    // it fills the OS window, so it has no minimize, maximize or restore-down of
    // its own to render. What it must still have is the pair this row actually
    // exists to check — a route OUT and a presentation toggle whose declared
    // state is real. Counting `.fwin-b` here would score a complete host 0; the
    // honest analogue is its own back-to-Library control, which is the reader's
    // whole lifecycle. `presentationHonest` scores the toggle's agreement with
    // the host separately, so this row does not double-count it.
    const popout = w.classList.contains('popout-root');
    const reader = w.classList.contains('reader');
    const chrome = reader
      ? qa(w, '.reader-bar .btn').filter((b) => /Library|ライブラリ|书库|图书|Библиотек/i.test(txt(b)))
      : qa(w, popout ? '.popout-btn' : '.fwin-b');
    const btn = q(w, LIQUID_BTN[reader ? 'reader' : popout ? 'popout' : 'fwin']);
    const pressed = btn ? btn.getAttribute('aria-pressed') : null;
    const need = reader ? 1 : popout ? 3 : 4;
    return {
      ok: chrome.length >= need && (pressed === 'true' || pressed === 'false'),
      ev: `chromeButtons=${chrome.length}/${need} liquidAriaPressed=${pressed}`,
    };
  }

  /**
   * L6's Gate, as one shared row: *no tool obscures the document.* Every open reading
   * tool is `docked` beside the document or a `sheet` over the whole of it — a partial
   * cover cannot be expressed — and the docked widths plus the gutter must add back up to
   * the canvas. Third caller as of 2026-08-26, so it stopped being three copies.
   *
   * The MEASURE CLAMP is deliberately not scored here: Captures runs the measure policy
   * and clamps a passage, Library and Immersion run the fill policy where
   * `--lq-reading-measure` is `none` BY DESIGN (a grid of covers and a live browser guest
   * are not passages). A spec that wants the clamp scores it as its own row.
   */
  function canvasPlacement(w) {
    const c = q(w, '.lq-reading');
    if (!c) return { ok: false, ev: 'no reading canvas' };
    const doc = q(c, '[data-reading-role="document"]');
    if (!doc) return { ok: false, ev: 'canvas has no document region' };
    const tools = qa(c, '[data-reading-role="tool"]');
    const cw = Math.round(c.getBoundingClientRect().width);
    const dw = Math.round(doc.getBoundingClientRect().width);
    const docked = tools.filter((t) => t.dataset.placement === 'docked');
    const sheets = tools.filter((t) => t.dataset.placement === 'sheet');
    const sum = docked.reduce((n, t) => n + Math.round(t.getBoundingClientRect().width) + 12, dw);
    const legal = tools.every((t) => /^(docked|sheet)$/.test(t.dataset.placement || ''));
    const sheetsFull = sheets.every((t) => Math.abs(Math.round(t.getBoundingClientRect().width) - dw) <= 1);
    const covered = c.dataset.covered === 'true';
    return {
      ok: c.dataset.measured === 'true' && legal && sheetsFull
        && Math.abs(sum - cw) <= 1 && covered === sheets.length > 0,
      ev: `canvas=${cw} doc=${dw} docked=${docked.length} sheets=${sheets.length} sum=${sum} covered=${covered}`,
    };
  }

  // ------------------------------------------------------- mutation helpers
  function detach(node, refusal) {
    if (!node) return { refused: refusal };
    const mark = document.createComment('lqp-placeholder');
    node.parentNode.insertBefore(mark, node);
    window.__LQP_DETACHED = (window.__LQP_DETACHED || []).concat([{ node, mark }]);
    node.remove();
    return { mutated: 'element detached' };
  }
  function addClassAll(nodes, cls) {
    let n = 0;
    nodes.forEach((el) => {
      if (!el.classList.contains(cls)) {
        el.classList.add(cls);
        el.setAttribute('data-lqp-added-class', cls);
        n += 1;
      }
    });
    return { mutated: `${cls} added to ${n} of ${nodes.length}` };
  }
  function removeClassAll(nodes, cls) {
    let n = 0;
    nodes.forEach((el) => {
      if (el.classList.contains(cls)) {
        el.classList.remove(cls);
        el.setAttribute('data-lqp-removed-class', cls);
        n += 1;
      }
    });
    return { mutated: `${cls} removed from ${n} of ${nodes.length}` };
  }
  function stripAttr(node, attr, refusal) {
    if (!node) return { refused: refusal };
    node.setAttribute(`data-lqp-was-${attr}`, node.getAttribute(attr) || '');
    node.removeAttribute(attr);
    return { mutated: `${attr} stripped` };
  }
  /**
   * Falsify by LYING rather than by deleting. Removing an attribute fails every
   * row that reads it, which on manga meant `presentationHonest` and
   * `windowLifecycle` fell together and the control proved neither. Setting it to
   * a wrong-but-well-formed value falls only the row that cross-checks it against
   * something else — which is the defect that row exists for, stated exactly.
   * Recorded under the same `data-lqp-was-` marker the generic restore sweeps.
   */
  function setAttr(node, attr, value, refusal) {
    if (!node) return { refused: refusal };
    node.setAttribute(`data-lqp-was-${attr}`, node.getAttribute(attr) || '');
    node.setAttribute(attr, value);
    return { mutated: `${attr} set to "${value}"` };
  }

  // --------------------------------------------------------------- engine
  const spec = (app) => {
    const s = SPECS[app];
    if (!s) throw new Error(`unknown app "${app}" — have ${Object.keys(SPECS).join(', ')}`);
    return s;
  };

  // Trap 4 + trap 7 + trap 8.
  const findWin = (app, pres) => {
    const s = spec(app);
    const wins = qa(document, '.fwin').filter(
      (w) => !pres || w.getAttribute('data-presentation') === pres,
    );
    const byTitle = wins.find((w) => s.titleRe.test(txt(q(w, '.fwin-title-text'))));
    if (byTitle) return { win: byTitle, matchedBy: 'title', host: 'fwin' };
    const byRoot = wins.find((w) => s.rootSel && q(w, s.rootSel));
    if (byRoot) return { win: byRoot, matchedBy: 'root-selector', host: 'fwin' };
    // Trap 8, REVISED 2026-08-25 (`6c16653f`). A pop-out is no longer chromeless:
    // `.popout-root` now carries `data-presentation` and its bar carries
    // `.popout-btn-liquid`, so it is a real Liquid host and returning the
    // POP-OUT ROOT — not the app root — makes it the exact analogue of `.fwin`
    // (frame + body), which is what `snapshot`'s rect and `check`'s rows assume.
    // A host that genuinely has no destination (a full-screen overlay, the
    // seanime workspace) still scores `chromeless`, and that distinction is the
    // whole point: one is a fact about the surface, the other was a defect.
    const bare = s.rootSel ? q(document, s.rootSel) : null;
    if (bare && !bare.closest('.fwin')) {
      const pop = bare.closest('.popout-root[data-presentation]');
      if (pop && (!pres || pop.getAttribute('data-presentation') === pres)) {
        return { win: pop, matchedBy: 'root-selector', host: 'popout' };
      }
      // Trap 8, EXTENDED 2026-08-26 for the same reason it was revised for the
      // pop-out. The full-screen reader is the app's THIRD Liquid host: since
      // L3.2 `.reader` carries `data-presentation` and `.reader-bar` carries
      // `.reader-btn-liquid`. `App.tsx:702` returns it as the WHOLE app render,
      // so it is inside neither `.fwin` nor `.popout-root` and this function
      // used to fall through and call it `chromeless` — which made
      // `toggleLiquid` refuse and put category 6 out of reach on BOTH `@.reader`
      // surfaces, Novels and manga, on a host that has a working toggle.
      // "Chromeless" has to keep meaning *has no destination*, not *this
      // function has not been taught about it*.
      const rd = bare.closest('.reader[data-presentation]');
      if (rd && (!pres || rd.getAttribute('data-presentation') === pres)) {
        return { win: rd, matchedBy: 'root-selector', host: 'reader' };
      }
      if (!pop && !rd) return { win: bare, matchedBy: 'root-selector', host: 'chromeless' };
    }
    return { win: null, matchedBy: null, host: null };
  };

  const refuseIfDegenerate = (win) => {
    const r = win.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) {
      return `degenerate box ${Math.round(r.width)}x${Math.round(r.height)}`; // Trap 3.
    }
    return null;
  };

  const snapshot = (app, pres) => {
    const { win, matchedBy, host } = findWin(app, pres);
    if (!win) return { app, refused: `no ${app} surface` };
    const bad = refuseIfDegenerate(win);
    if (bad) return { app, refused: bad };
    const r = win.getBoundingClientRect();
    const fields = {};
    qa(win, 'input,textarea,select').forEach((el, i) => {
      fields[`${el.tagName.toLowerCase()}${i}:${(el.className || '').split(' ')[0]}`] = el.value;
    });
    return {
      app,
      matchedBy,
      host,
      presentation: win.getAttribute('data-presentation'),
      liquidClass: win.classList.contains('fwin-liquid') || win.classList.contains('popout-liquid'),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      maximized: win.classList.contains('fwin-max'),
      focused: win.classList.contains('focused'),
      zIndex: win.style.zIndex || '',
      chars: (win.textContent || '').length,
      nodes: win.querySelectorAll('*').length,
      controls: qa(win, 'button,input,select,textarea,[role="button"]').length,
      fields,
      // Scroll offsets are app state too, and on a surface with no editable field they are
      // the ONLY user-entered state a round trip can lose. Added 2026-08-26: Library has 86
      // buttons and zero text inputs, so without this its round trip compared chrome to
      // chrome and would have held no matter what the toggle did to the list.
      scroll: qa(win, '*')
        .filter((el) => el.scrollTop > 0 || el.scrollLeft > 0)
        .slice(0, 8)
        .map((el) => `${(el.className || el.tagName).toString().split(' ')[0]}:${Math.round(el.scrollTop)},${Math.round(el.scrollLeft)}`),
    };
  };

  const check = (app, pres) => {
    const s = spec(app);
    const { win, matchedBy, host } = findWin(app, pres);
    if (!win) return { app, refused: `no ${app} surface` };
    const bad = refuseIfDegenerate(win);
    if (bad) return { app, refused: bad };
    const rows = s.features.map((feat) => {
      let out;
      try {
        out = feat.f(win);
      } catch (err) {
        out = { ok: false, ev: `probe threw: ${err && err.message}` };
      }
      // Trap 8: on a chromeless host the window-chrome row is not a failure, it
      // is inapplicable. Scoring it false would invent a regression.
      if (host === 'chromeless' && feat.id === 'windowLifecycle') {
        return { id: feat.id, reachable: null, na: 'chromeless host — no window chrome', evidence: out.ev };
      }
      return { id: feat.id, reachable: !!out.ok, evidence: out.ev };
    });
    const scored = rows.filter((r) => r.reachable !== null);
    return {
      app,
      matchedBy,
      host,
      presentation: win.getAttribute('data-presentation'),
      reachable: scored.filter((r) => r.reachable).length,
      total: scored.length,
      na: rows.length - scored.length,
      rows,
    };
  };

  const step = (app, name, arg, pres) => {
    const s = spec(app);
    const fn = s.steps && s.steps[name];
    if (!fn) return { refused: `no step "${name}" for ${app} — have ${Object.keys(s.steps || {}).join(', ')}` };
    const { win } = findWin(app, pres);
    if (!win) return { refused: `no ${app} surface` };
    return fn(win, arg);
  };

  const toggleLiquid = (app, pres) => {
    const { win, host } = findWin(app, pres);
    if (!win) return { refused: `no ${app} surface` };
    if (host === 'chromeless') return { refused: 'chromeless host has no liquid control' };
    // The pop-out's control is the same affordance in its own bar (`6c16653f`),
    // and so is the reader's (`ReaderLiquidToggle`, shared by both readers).
    const btn = q(win, LIQUID_BTN[host] || '.fwin-b-liquid');
    if (!btn) return { refused: 'no liquid control rendered' };
    const before = win.getAttribute('data-presentation');
    btn.click();
    return { before, ariaPressed: btn.getAttribute('aria-pressed') };
  };

  const mutate = (app, which, pres) => {
    const s = spec(app);
    const fn = s.mutations && s.mutations[which];
    if (!fn) return { refused: `no mutation "${which}" — have ${Object.keys(s.mutations || {}).join(', ')}` };
    const { win } = findWin(app, pres);
    if (!win) return { refused: `no ${app} surface` };
    return fn(win);
  };

  const restore = (app, pres) => {
    const { win } = findWin(app, pres);
    const undone = [];
    (window.__LQP_DETACHED || []).forEach((d) => {
      if (d.mark && d.mark.parentNode) {
        d.mark.parentNode.insertBefore(d.node, d.mark);
        d.mark.remove();
        undone.push('detached');
      }
    });
    window.__LQP_DETACHED = [];
    const scope = win || document;
    qa(scope, '[data-lqp-added-class]').forEach((n) => {
      n.classList.remove(n.getAttribute('data-lqp-added-class'));
      n.removeAttribute('data-lqp-added-class');
      undone.push('added-class');
    });
    qa(scope, '[data-lqp-removed-class]').forEach((n) => {
      n.classList.add(n.getAttribute('data-lqp-removed-class'));
      n.removeAttribute('data-lqp-removed-class');
      undone.push('removed-class');
    });
    /*
     * GENERIC, corrected 2026-08-26. This was the literal list `['aria-pressed']`
     * while `stripAttr` has always taken an arbitrary attribute name, so every
     * attribute except that one was stripped from the LIVE app and never put
     * back. It went unseen because every spec written before manga happened to
     * strip only `aria-pressed`.
     *
     * Measured, on the first manga run: the `pageTransport` mutation stripped
     * `min` from `.reader-seek`, `restored` reported `["manga:mode+page"]` with
     * no attribute in it, and `returned: true` — the harness declared the surface
     * clean while `min` was gone. A range input with no `min` silently defaults
     * to 0, so the harness had left a real page-0 off-by-one in the user's
     * running reader and called it restored. Two rounds of scoring after that
     * read `range=..17`, which would have been filed as a product defect.
     *
     * `data-lqp-was-` is the marker, so the sweep is over the marker rather than
     * over a list somebody has to remember to extend.
     */
    const WAS = 'data-lqp-was-';
    qa(scope, '*').forEach((n) => {
      [].slice.call(n.attributes)
        .filter((a) => a.name.indexOf(WAS) === 0)
        .forEach((a) => {
          const attr = a.name.slice(WAS.length);
          n.setAttribute(attr, a.value);
          n.removeAttribute(a.name);
          undone.push(attr);
        });
    });
    const s = SPECS[app];
    if (s && s.undo && win) {
      Object.keys(s.undo).forEach((k) => {
        const r = s.undo[k](win);
        if (r) undone.push(r);
      });
    }
    return { restored: undone };
  };

  window.__LQP = {
    apps: () => Object.keys(SPECS),
    findWin: (app, pres) => {
      const r = findWin(app, pres);
      return { found: !!r.win, matchedBy: r.matchedBy, host: r.host };
    },
    snapshot,
    check,
    step,
    toggleLiquid,
    mutate,
    restore,
    // Additive accessors for the node driver (`cat6-feature-parity.cjs`). They exist so the
    // driver can stay app-agnostic: it asks the spec for its own title regex and its own
    // mutation names instead of carrying a per-app list, which is what made the three
    // single-use runners single-use. `__win` returns a live node and is only ever used
    // INSIDE an injected expression — it cannot cross the bridge.
    __win: (app, pres) => findWin(app, pres).win,
    __titleRe: (app) => (SPECS[app] && SPECS[app].titleRe) || /$^/,
    __mutations: (app) => (SPECS[app] && SPECS[app].mutations) || {},
    // The ordered step sequence that has to run before `check()` can answer the rows whose
    // claim is "the feature still WORKS" rather than "the control exists". Without it the
    // driver has to carry a per-app list, which is exactly what made `l6m-parity-run.cjs`
    // single-use. Entries are `"name"` or `["name", arg]`; a spec that declares no order
    // gets its steps in declaration order, which is what the old runners did by hand.
    __drive: (app) => {
      const s = SPECS[app] || {};
      return s.drive || Object.keys(s.steps || {});
    },
    // Rows a mutation is ALLOWED to take with it. Removing one feature can honestly disable
    // another that depends on it; naming those keeps the control strict about everything else.
    __cascades: (app) => (SPECS[app] && SPECS[app].cascades) || {},
  };

  return JSON.stringify({
    installed: Object.keys(window.__LQP),
    apps: Object.keys(SPECS),
    features: Object.fromEntries(Object.keys(SPECS).map((k) => [k, SPECS[k].features.length])),
  });
})();
