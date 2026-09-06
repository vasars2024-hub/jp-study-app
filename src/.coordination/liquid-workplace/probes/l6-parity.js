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
 *     runs the full lifecycle row against the pop-out bar's THREE controls. The
 *     reader is the third such host and, as of 2026-09-02, the media workspace
 *     overlay is the FOURTH: `f2619b91` gave `.seanime-host` its own
 *     `data-presentation` and `.seanime-host-liquid`, so `host: 'workspace'`.
 *     This clause used to cite "the seanime workspace" as the canonical thing
 *     that is genuinely chromeless — a claim the product had already outgrown,
 *     restated here as fact. `chromeless` still means *has no destination*, and
 *     the distinction still matters; what it no longer names is any of these
 *     four. Do not collapse the two, and do not let this list rot again: check
 *     the host before quoting it.
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
    // The FOURTH host, added 2026-09-02. `f2619b91` gave the media workspace overlay its
    // own `data-presentation` and a toggle in `.seanime-host-bar` carrying the same
    // `aria-pressed` contract as the other three. Until this line the resolver called it
    // `chromeless` — and, worse, said so in a comment as though it were a fact about the
    // surface. It was a fact about this file.
    workspace: '.seanime-host-liquid',
  };
  // One factory rather than one function per spec. These were two identical four-line
  // copies and captures would have made a third; the global name stays per-spec so an
  // interrupted run is still inspectable from the console under a name that says whose
  // it is, and so one spec's undo can never consume another's recorded original.
  const specState = (global) => () => {
    window[global] = window[global] || {};
    return window[global];
  };
  /**
   * SHELL SCOPE. Correction 22 arriving from the other direction.
   *
   * Every other subject in this file is a window that must not reach into a NESTED window.
   * The shell is the one subject that legitimately CONTAINS windows, so its own queries must
   * exclude them: `.os-desktop` holds three `.fwin`, and an unscoped `qa(w, 'button')` folds
   * every hosted app's controls into the shell's own count. That is not a near miss — it is
   * the difference between "the taskbar has 12 buttons" and "the desktop has 300".
   *
   * Named `shq` rather than replacing `qa` because the shell spec deliberately uses BOTH:
   * `qa(w, '.fwin')` is how it counts what it hosts, which is the taskbar-identity row.
   */
  const shq = (root, sel) => qa(root, sel).filter((e) => !e.closest('.fwin'));
  /**
   * Blanc's fullscreen-workspace control, recorded WHERE IT EXISTS rather than where the
   * check happens. It is route-scoped (`canExpandWorkspace`, BlancShell.tsx:430) and the
   * drive restores the user's own route before `check()` runs, so reading it at check time
   * scored a deliberate product decision as a lying label. Sets `wsLabel` to `null` — not
   * `undefined` — when the route genuinely does not offer it, so the row can tell "looked and
   * it was not there" from "never driven".
   */
  function readWorkspaceControl(w, s, route) {
    const btn = shq(w, '.blanc-icon-btn').find((b) => /fullscreen/i.test(b.getAttribute('title') || ''));
    s.wsRoute = route;
    s.wsLabel = btn ? (btn.getAttribute('title') || '').trim() : null;
    s.wsFull = w.classList.contains('is-workspace-full');
    s.wsExit = !!q(w, '.blanc-fullscreen-exit');
  }
  const shellState = specState('__LQP_SHELL_ORIG');
  const blancState = specState('__LQP_BLANC_ORIG');
  const libState = specState('__LQP_LIB_ORIG');
  const immState = specState('__LQP_IMM_ORIG');
  const capState = specState('__LQP_CAP_ORIG');
  const novelState = specState('__LQP_NOVEL_ORIG');
  const mangaState = specState('__LQP_MANGA_ORIG');
  const vnState = specState('__LQP_VN_ORIG');
  const flashState = specState('__LQP_FLASH_ORIG');
  const notebookState = specState('__LQP_NOTEBOOK_ORIG');
  const filesState = specState('__LQP_FILES_ORIG');
  const statsState = specState('__LQP_STATS_ORIG');
  const calendarState = specState('__LQP_CAL_ORIG');
  const gamesState = specState('__LQP_GAMES_ORIG');
  const resState = specState('__LQP_RES_ORIG');
  const musicState = specState('__LQP_MUSIC_ORIG');
  const scraperState = specState('__LQP_SCRAPER_ORIG');
  const settingsState = specState('__LQP_SETTINGS_ORIG');
  const ytState = specState('__LQP_YT_ORIG');
  const videoState = specState('__LQP_VIDEO_ORIG');
  // Resources helpers. The rail's chips share `gram-level-btn` with Grammar's level
  // buttons, so they are scoped by `.res-filter`; and `.res-card` is rendered by THREE
  // sections (catalogue groups, the New strip, My tools), so the catalogue's own cards
  // are the ones inside a `.res-group`. Counting all 51 against a line that says 36 is
  // the false failure this pair exists to prevent.
  const resChips = (w) => qa(w, '.res-filter .gram-level-btn');
  const groupCards = (w) => qa(w, '.res-group .res-card');
  // The Arena's typing game, which is also the one that owns the material-scope picker.
  // Named by its own four localized titles rather than by list position: the catalogue is
  // filtered by what the player has unlocked, so an index is not stable.
  const KANA_GAME_RE = /Kana Sprint|かなスプリント|假名冲刺|Спринт по кане/i;
  // A progress bar drawn with an inline `scaleX()` rather than a width. Returns NaN when
  // the element is absent so a missing bar can never read as an agreeing zero.
  const barScale = (el) => (el
    ? Number((String(el.style.transform).match(/scaleX\(([\d.]+)\)/) || [])[1])
    : NaN);
  const novelPageSignature = (w) => `${txt(q(w, '.reader-pagecount'))}|${txt(q(w, '.novel-content')).slice(0, 160)}`;
  const novelToolTrigger = (w, id) => qa(w, '.settings-anchor button').find((b) => {
    const label = `${b.title} ${b.getAttribute('aria-label') || ''}`;
    const isTranslate = /translat|翻訳|翻译|перевод/i.test(label);
    if (id === 'bookmarks') return /Bookmark|ブックマーク|书签|Заклад/i.test(label);
    if (id === 'translate') return isTranslate;
    return /setting|設定|设置|настрой/i.test(label) && !isTranslate;
  });
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
        // CORRECTION 55, 2026-09-05: the typed text ALTERNATES between drives, and that is
        // load-bearing rather than cosmetic. The `output` row passes only if the pane text
        // CHANGED from what `step('run')` recorded — a deliberate guard, because this pane's
        // pre-first-run state is the sentence "Translation appears here." and a `length > 0`
        // test scored a translate that never ran as a 10. But with one fixed input the guard
        // has a false NEGATIVE that is just as bad: the control loop drives the surface once
        // per mutation, so by the second drive the pane already holds the exact translation
        // this run is about to produce, `after === before`, and a working translate is
        // scored dead. Measured live: `outputChars=12 before="I like cats." after="I like
        // cats."` on two of three mutations, which VOIDed the whole category on
        // `returned: false` while every mutation had flipped exactly its own row.
        // Two sentences with distinct translations, alternating, make "unchanged" mean only
        // what it is supposed to mean. The guard is not weakened — the row still demands a
        // change — it is simply given an input for which a correct app must produce one.
        type: (w, text) => {
          const t = q(w, '.tr-textarea');
          if (!t) return { refused: 'no textarea' };
          const primary = text == null ? '猫が好きです' : text;
          const n = (window.__LQP_TYPE_N = (window.__LQP_TYPE_N || 0) + 1);
          typeInto(t, n % 2 === 1 ? primary : '犬が好きです');
          return { typed: t.value, drive: n };
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
      //
      // CORRECTION 51, 2026-09-05: `swap` ran SECOND, straight after `type`, and
      // `.tr-swap` does not only reverse the direction — it EXCHANGES the two texts.
      // Measured live on the running window: input `猫が好きです` / output `I like cats.`
      // → click → input `I like cats.` / output `猫が好きです`. So typing and then
      // swapping handed the freshly typed text to the OUTPUT pane and left the input
      // holding whatever the output used to be — empty on a cold view. Everything after
      // it then measured an empty input: `run` translated nothing (`output` before ===
      // after), `input` read `chars=0`, and `agentHandoff` was legitimately `disabled`
      // because there was no text to send. Three live features scored dead, `4/7`, and
      // the category VOIDed on `allRowsReachable` — the same class of order defect the
      // note above records, one step earlier in the list.
      // `swap` now runs FIRST, before there is anything to lose: it still records
      // `__LQP_SWAP_BEFORE` for its own row, nothing later touches the direction, and
      // `type` establishes the input AFTER the only step that can take it away.
      drive: ['swap', ['type', '猫が好きです'], 'run', 'collapse', 'focus', ['highlight', '0,2']],
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
        // CORRECTION 53, 2026-09-05: this used to null `__LQP_SWAP_BEFORE` after clicking,
        // and the `swap` FEATURE ROW reads that same global as its "before" — with it null
        // the row is UNMEASURED by its own rule, so the post-restore re-check could never
        // get back to the pre-mutation baseline. Every mutation therefore reported
        // `returned: false` (`7/7` before, `6/7` after) and category 6 VOIDed on "a mutation
        // did not restore" while all three had in fact flipped exactly their own row and
        // restored it. The instrument was failing its own restore check, not the surface.
        // The undo click IS a swap, so recording the actives it swapped FROM keeps the row
        // measurable and keeps it honest: it still compares a real before to a real after.
        swap: (w) => {
          const before = window.__LQP_SWAP_BEFORE;
          if (!before) return null;
          const now = qa(w, '.tr-dir .dict-lang-toggle').map((g) => txt(q(g, '.gram-level-btn.active')));
          if (now.join('|') === before.join('|')) { window.__LQP_SWAP_BEFORE = null; return null; }
          const b = q(w, '.tr-swap');
          if (!b) return null;
          b.click();
          window.__LQP_SWAP_BEFORE = now;
          return 'swap';
        },
      },
    },

    agent: {
      titleRe: /Agent|エージェント|代理|Агент/i,
      rootSel: '.agent-root, .agent-shell',
      // CORRECTION 2026-09-04 — the third shape of the trap `__probeInput` exists for, and
      // the first where the dirtied control neither navigates nor clears: it FILTERS.
      //
      // The generic "first visible text field" rule picks `.agent-search-input`, the
      // conversation-history filter, because it sits at the top of the rail. Typing
      // `lqp-roundtrip-食` into it matches nothing, so the rail renders zero rows while
      // `.agent-rail-count` keeps saying "17 conversations" — and `check()` then scores
      // `conversationRail (conversations=0 selected=0)` and
      // `railCount (headCount="17 conversations" rows=0)` as FALSE. Both are live and
      // correct: the SAME `window.__LQP.check('agent')` run by hand with the filter empty
      // returns 7/8 with both rows true. Reproduced on two consecutive runs before this
      // was written, so it is deterministic, not a settle race.
      //
      // The composer is the right field instead: a real uncontrolled textarea whose value
      // must survive a presentation round trip, which is what the leg is for, and it filters
      // nothing. The `composer` row asserts only `value.length > 0`, so the round trip's own
      // mark satisfies it exactly as the drive's text does.
      probeInput: (w) => qa(w, 'textarea').find((x) => /agent|Ask about/i.test(`${x.className} ${x.placeholder || ''}`)),
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
          //
          // CORRECTED 2026-09-04, and the correction is one row strengthened and one
          // instrument bug removed. `removes > 0` passes a shelf of three items holding one
          // remove control, which is the exact defect this row exists to catch — the
          // denominator has to be the ITEMS. And the row could never pass at all: the
          // driver ran every declared step, `newConversation` was one of them, so `check()`
          // always landed on a fresh conversation whose shelf is empty. Zero items is an
          // EMPTY HARNESS, not a reversibility failure, and the rubric caps a category
          // measured on one at 0 — so this is fixed by making the DRIVE establish real
          // context (`selectAnswered` then `branchContext` below), never by excusing the
          // row. Zero items still reads FALSE here rather than `na`, so an empty shelf can
          // never be mistaken for a pass.
          id: 'contextShelf',
          f: (w) => {
            const removes = qa(w, 'button').filter((b) =>
              /Remove .* from context/i.test(`${txt(b)} ${b.getAttribute('aria-label') || ''}`),
            ).length;
            const items = qa(w, '.agent-context-item').length;
            return { ok: items > 0 && removes === items, ev: `contextItems=${items} removeControls=${removes}` };
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
      // ORDER IS DECLARED, not inherited from `Object.keys(steps)`. The default runs every
      // step, and `newConversation` leaves the surface on an empty conversation — which is
      // exactly the state `contextShelf` cannot be measured in. The two context steps run
      // LAST so the shelf the check reads is the one the drive built.
      drive: ['type', 'newConversation', 'selectAnswered', 'branchContext'],
      steps: {
        type: (w, text) => {
          const t = qa(w, 'textarea').find((x) => /agent|Ask about/i.test(`${x.className} ${x.placeholder || ''}`));
          if (!t) return { refused: 'no composer' };
          typeInto(t, text == null ? 'parity probe text' : text);
          return { typed: t.value };
        },
        // Two steps, not one, because of trap "A STEP MAY NOT READ THE STATE IT JUST
        // CHANGED": React commits after the dispatching task, so a single step that clicked
        // a rail entry and then looked for that conversation's branch chip would be reading
        // the PREVIOUS conversation's DOM.
        selectAnswered: (w) => {
          const row = qa(w, '.agent-rail-item').find((li) => {
            const n = (txt(q(li, '.agent-rail-entry-meta')).match(/(\d+)\s*message/) || [])[1];
            return n != null && Number(n) > 0;
          });
          if (!row) return { refused: 'no conversation with messages on this profile' };
          const entry = q(row, '.agent-rail-entry');
          if (!entry) return { refused: 'row has no entry control' };
          entry.click();
          return { selected: txt(q(row, '.agent-rail-entry-title')).slice(0, 40) };
        },
        // The product's OWN route into the context shelf: "Follow up in a new conversation"
        // branches the selected message into a fresh conversation carrying that message as
        // context, which is an ordinary add with its ordinary remove control. Nothing here
        // reaches past the UI into a store — an attach synthesised by calling a module
        // function would prove the shelf renders, not that a user can fill it.
        branchContext: (w) => {
          const chip = q(w, '.agent-message-branch');
          if (!chip) return { refused: 'selected conversation has no branchable message' };
          chip.click();
          return { branched: txt(chip).slice(0, 40) };
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
      // The only text field on this surface is `.reading-captures-search`, which
      // FILTERS the rows `captureList` and `selection` are scored on. See
      // `__noSafeInput`: measured 2026-09-05, the round-trip mark took parity to
      // 4/6 in both presentations by emptying the list, and both refusals in the
      // drive log ("only 0 rows", "nothing scrollable") are the same cause.
      noSafeInput: true,
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
     * NOTEBOOK — L7's aggregate study history. The real surface currently owns
     * 3,328 entries and renders the first 400 with provenance chains, so every
     * row below cross-checks rendered content rather than counting controls.
     * All drive steps change local view/filter/scroll state only; capture start,
     * clear, refresh and cross-app navigation are inventoried but never pressed.
     */
    // THIS SPEC HAS NO SUBJECT ON `wt/files-app`, and that is a product decision rather than a
    // gap. FILES_APP_PLAN gate 7b deletes the Notebook section and the Files app absorbs it:
    // `AppSection.tsx` has no `case 'notebook'`, and `LEGACY_WIN_SECTION_ALIASES`
    // (shared/desktop.ts:76) maps `notebook -> files` deliberately, because a persisted layout
    // carries `section: 'notebook'` windows on every existing install and userData has no
    // restore point. `NotebookContent.tsx` survives only as a Blanc import.
    //
    // Measured live on this branch 2026-09-02, one instant, one DOM, with both controls:
    //   os:open 'notebook'         -> window "Files",            body `DIV.lq-scaffold.fa-shell`, 52 buttons, unavailable=false
    //   os:open 'dictionary'  CTRL -> window "Dictionary",       body `DIV.dict-view`             (so os:open is not always Files)
    //   os:open 'notAKnownSection' CTRL -> window "notAKnownSection", body `DIV.app-section-unavailable`, unavailable=TRUE
    // and `.gx-notebook` = 0 across the WHOLE document, not merely inside one window.
    //
    // So do not spend a run authoring rows here: `cat6 --app notebook` cannot find its subject
    // and is right not to. The ledger records it under
    // `notWritten.derived.noRowsByCause.noSubjectOnThisBranch`, separately from the four specs
    // that genuinely await authoring. On a tree where the Notebook section still exists this
    // spec is still correct, which is why it is annotated rather than deleted.
    notebook: {
      titleRe: /Notebook|ノート|笔记|Блокнот/i,
      rootSel: '.gx-notebook',
      features: [
        {
          id: 'viewTabs',
          f: (w) => {
            const tabs = qa(w, '.gx-notebook-view');
            const selected = tabs.filter((b) => b.getAttribute('aria-selected') === 'true');
            const named = tabs.filter((b) => txt(b).length > 0);
            return {
              ok: tabs.length === 6 && selected.length === 1 && named.length === tabs.length,
              ev: `tabs=${tabs.length} selected=${selected.length} named=${named.length}`,
            };
          },
        },
        {
          id: 'streamSummary',
          f: (w) => {
            const cards = qa(w, '.gx-notebook-count');
            const counted = cards.filter((c) => /^\d+$/.test(txt(q(c, '.gx-notebook-count-n')))).length;
            const named = cards.filter((c) => txt(q(c, '.gx-notebook-count-l')).length > 0).length;
            const active = cards.filter((c) => c.classList.contains('active')).length;
            return {
              ok: cards.length > 0 && counted === cards.length && named === cards.length && active <= 1,
              ev: `cards=${cards.length} counted=${counted} named=${named} active=${active}`,
            };
          },
        },
        {
          id: 'folderRail',
          f: (w) => {
            const folders = qa(w, '.gx-notebook-folder');
            const counts = folders.map((b) => Number((txt(b).match(/\((\d+)\)\s*$/) || [])[1]));
            const active = folders.filter((b) => b.classList.contains('active')).length;
            const sum = counts.slice(1).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0);
            return {
              ok: folders.length > 1 && active === 1 && counts.every(Number.isFinite) && counts[0] === sum,
              ev: `folders=${folders.length} active=${active} all=${counts[0]} children=${sum}`,
            };
          },
        },
        {
          id: 'timelineRows',
          f: (w) => {
            const rows = qa(w, '.gx-notebook-item');
            const titled = rows.filter((r) => txt(q(r, '.gx-notebook-item-title')).length > 0).length;
            const meta = rows.filter((r) => txt(q(r, '.gx-notebook-item-meta')).length > 0).length;
            const openable = rows.filter((r) => q(r, '.gx-notebook-item-btn')).length;
            return {
              ok: rows.length > 0 && rows.length <= 400 && titled === rows.length
                && meta === rows.length && openable === rows.length,
              ev: `rows=${rows.length} titled=${titled} meta=${meta} openable=${openable}`,
            };
          },
        },
        {
          id: 'lineage',
          f: (w) => {
            const nodes = qa(w, '.gx-notebook-lineage-node');
            const staged = nodes.filter((n) => txt(q(n, '.gx-notebook-lineage-stage')).length > 0).length;
            const openable = nodes.filter((n) => q(n, '.gx-notebook-lineage-btn')).length;
            return {
              ok: nodes.length > 0 && staged === nodes.length && openable === nodes.length,
              ev: `nodes=${nodes.length} staged=${staged} openable=${openable}`,
            };
          },
        },
        {
          id: 'liveCaptions',
          f: (w) => {
            const panel = q(w, '.gx-lc-panel');
            const state = txt(q(w, '.gx-lc-state'));
            const actions = qa(w, '.gx-lc-actions button');
            const errors = qa(w, '.gx-lc-error').filter((e) => txt(e).length > 0);
            return {
              ok: !!panel && state.length > 0 && actions.length === 2 && errors.length === 0,
              ev: `panel=${!!panel} state="${state}" actions=${actions.length} errors=${errors.length}`,
            };
          },
        },
        {
          id: 'handoffActions',
          f: (w) => {
            const actions = qa(w, '.gx-notebook-actions button');
            const named = actions.filter((b) => txt(b).length > 0).length;
            const enabled = actions.filter((b) => !b.disabled).length;
            return {
              ok: actions.length === 2 && named === 2 && enabled === 2,
              ev: `actions=${actions.length} named=${named} enabled=${enabled}`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        selectView: (w, index) => {
          const tabs = qa(w, '.gx-notebook-view');
          const target = tabs[Number(index) || 0];
          if (!target) return { refused: `only ${tabs.length} view tabs` };
          target.click();
          return { clicked: txt(target) };
        },
        toggleStream: (w, index) => {
          const cards = qa(w, '.gx-notebook-count');
          const target = cards[Number(index) || 0];
          if (!target) return { refused: `only ${cards.length} stream cards` };
          target.click();
          return { clicked: txt(q(target, '.gx-notebook-count-l')) };
        },
        selectFolder: (w, index) => {
          const folders = qa(w, '.gx-notebook-folder');
          const target = folders[Number(index) || 0];
          if (!target) return { refused: `only ${folders.length} folders` };
          target.click();
          return { clicked: txt(target) };
        },
        scroll: (w, px) => {
          const el = q(w, '.gx-notebook-timeline');
          if (!el || el.scrollHeight <= el.clientHeight) return { refused: 'timeline is not scrollable' };
          const g = notebookState();
          if (g.scrollTop == null) g.scrollTop = el.scrollTop;
          el.scrollTop = Number(px) || 240;
          return { top: el.scrollTop, range: el.scrollHeight - el.clientHeight };
        },
      },
      drive: [
        ['selectView', '2'],
        ['selectView', '0'],
        ['toggleStream', '0'],
        ['toggleStream', '0'],
        ['selectFolder', '1'],
        ['selectFolder', '0'],
        ['scroll', '240'],
      ],
      undo: {
        notebook: (w) => {
          const g = window.__LQP_NOTEBOOK_ORIG;
          if (!g) return null;
          const el = q(w, '.gx-notebook-timeline');
          const done = [];
          if (el && g.scrollTop != null && el.scrollTop !== g.scrollTop) {
            el.scrollTop = g.scrollTop;
            done.push('scroll');
          }
          window.__LQP_NOTEBOOK_ORIG = null;
          return done.length ? `notebook:${done.join('+')}` : null;
        },
      },
      mutations: {
        viewTabs: (w) => stripAttr(
          qa(w, '.gx-notebook-view').find((b) => b.getAttribute('aria-selected') === 'true'),
          'aria-selected',
          'no selected view tab',
        ),
        streamSummary: (w) => detach(q(w, '.gx-notebook-count-n'), 'no stream count'),
        folderRail: (w) => addClassAll(
          [qa(w, '.gx-notebook-folder').find((b) => !b.classList.contains('active'))],
          'active',
        ),
        timelineRows: (w) => detach(q(w, '.gx-notebook-item-meta'), 'no timeline metadata'),
        lineage: (w) => detach(q(w, '.gx-notebook-lineage-stage'), 'no lineage stage'),
        liveCaptions: (w) => detach(q(w, '.gx-lc-state'), 'no capture state'),
        handoffActions: (w) => detach(q(w, '.gx-notebook-actions .btn.primary'), 'no review handoff'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /**
     * FILES — the Notebook section's replacement (FILES_APP_PLAN gate 7b; `LEGACY_WIN_SECTION_ALIASES`
     * maps notebook -> files), the 25th desktop section and the first built in L2's language from
     * its first line: `LiquidAppScaffold` root `.fa-shell` with rail / toolbar / canvas / inspector /
     * dock slots. Every count below is DERIVED from the live surface — the rail's node count, the
     * sort options, the row count — because all three come from the index and a hardcoded figure
     * would repeat the `library.inboxFilters` defect.
     *
     * TWO TRAPS, both known before this spec was written (PARITY_LEDGER 2026-09-02, primary2):
     *  - THE DRIVER'S `dirtyField` LANDS IN `.fa-search` AND FILTERS THE LIST (the music trap). It
     *    happens BEFORE the drive, so every row is scored on the filtered list and `aria-rowcount`
     *    may read 1 (the header alone). Rows therefore score the list's SHAPE and its honest empty
     *    state, never a content count. The drive turns the trap into the search row's proof: it
     *    clears the box, reads the unfiltered count, puts the driver's mark back and reads again —
     *    the filter is live if the second figure is the smaller one. On a profile whose index is
     *    empty the two figures are both 1 and the row is `na` by declaration, not false.
     *  - THE INSPECTOR NEEDS A SELECTED ROW. Under the driver's own filter there may be nothing to
     *    select, so `inspector` declares `na` with the reason and its mutation refuses (armed
     *    false). With a row on screen it scores the gate-3/gate-10 contract: Open is ALWAYS
     *    offered and EXACTLY ONE of Mine / the mine refusal is.
     */
    files: {
      titleRe: /\bFiles\b|ファイル|文件|Файлы/i,
      rootSel: '.fa-shell',
      features: [
        {
          id: 'folderTree',
          f: (w) => {
            const nodes = qa(w, '.fa-tree .fa-tree-node');
            const pressed = nodes.filter((n) => n.getAttribute('aria-pressed') === 'true').length;
            const counted = nodes.filter((n) => /^\d+$/.test(txt(q(n, '.fa-tree-count')).replace(/[^\d]/g, ''))).length;
            const g = window.__LQP_FILES_ORIG || {};
            return { ok: nodes.length >= 2 && pressed === 1 && counted >= 2 && g.treeMoved === true,
              ev: `nodes=${nodes.length} pressed=${pressed} counted=${counted} visitedAndReturned=${g.treeMoved === true}` };
          },
        },
        {
          id: 'search',
          /*
           * THE ROW BRINGS ITS OWN SUBJECT. Measured 2026-09-02: the first draft scored the
           * DRIVER's `dirtyField` mark, and `dirtyField()` runs ONCE, before the FIRST drive
           * only — while the control loop RE-DRIVES before every mutation. So this row read
           * `withMark=1 cleared=46 narrowed=true` in the parity phase and
           * `withMark=46 cleared=46 narrowed=false` on every control baseline, was therefore
           * already false when its own mutation ran, and could not fall. Seven proved rows
           * were discarded by that VOID. A row may not depend on state another component of
           * the harness owns and only guarantees once.
           *
           * It also asks a STRICTER question than the draft did. "The list got shorter" is
           * satisfied by a filter that empties it, which is what a broken matcher does too.
           * The probe token is derived from a row that is really on screen, so the honest
           * outcome is SELECTION: 1 < rowsQueried < rowsCleared, at least one row kept and
           * at least one dropped. Both bounds are published.
           */
          f: (w) => {
            const input = q(w, '.fa-search input[type="search"]');
            const list = q(w, '.fa-list');
            const rowcount = list ? Number(list.getAttribute('aria-rowcount')) : NaN;
            const g = window.__LQP_FILES_ORIG || {};
            const ev = `input=${!!input} rowcount=${rowcount} probe="${g.probe == null ? '-' : g.probe}" unfiltered=${g.rowsCleared} queried=${g.rowsQueried} selects=${g.searchLive === true}`;
            if (input && Number.isFinite(rowcount) && g.searchNoSubject === true) {
              return { ok: null, na: 'nothing is listed under this folder on this profile, so no probe token could be derived from a real row — a filter with no subject cannot be shown to select', ev };
            }
            return { ok: !!input && Number.isFinite(rowcount) && g.searchLive === true, ev };
          },
        },
        {
          id: 'sortControls',
          f: (w) => {
            const sel = q(w, '.fa-sort select');
            const options = sel ? qa(sel, 'option').length : 0;
            const dir = q(w, '.fa-sort-dir');
            const labelled = !!dir && (dir.getAttribute('aria-label') || '').length > 0;
            const g = window.__LQP_FILES_ORIG || {};
            return { ok: !!sel && options >= 2 && labelled && g.sortFlipped === true,
              ev: `select=${!!sel} options=${options} dirLabelled=${labelled} flippedAndReturned=${g.sortFlipped === true}` };
          },
        },
        {
          id: 'viewMode',
          f: (w) => {
            const buttons = qa(w, '.fa-view-mode-button');
            const pressed = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').length;
            const list = q(w, '.fa-list');
            const mode = list ? list.getAttribute('data-view') : null;
            const agrees = !!mode && buttons.some((b) => b.getAttribute('data-mode') === mode && b.getAttribute('aria-pressed') === 'true');
            const g = window.__LQP_FILES_ORIG || {};
            return { ok: buttons.length === 2 && pressed === 1 && agrees && g.viewSwitched === true,
              ev: `buttons=${buttons.length} pressed=${pressed} mode=${mode} agrees=${agrees} switchedAndReturned=${g.viewSwitched === true}` };
          },
        },
        {
          id: 'itemList',
          f: (w) => {
            const list = q(w, '.fa-list');
            const grid = !!list && list.getAttribute('role') === 'grid';
            const rowcount = list ? Number(list.getAttribute('aria-rowcount')) : NaN;
            const head = list ? q(list, '.fa-row.fa-head') : null;
            const painted = list ? qa(list, '.fa-row:not(.fa-head)').length : 0;
            const empty = list ? !!q(list, '.fa-state') : false;
            // A windowed list paints fewer rows than it declares. The declared body is either 0
            // with the empty state on screen, or > 0 with at least one row painted and never more
            // than declared — the shape the `virtualListSemantics` test enforces at the source.
            const body = rowcount - 1;
            const honest = body === 0 ? (empty && painted === 0) : (painted > 0 && painted <= body);
            return { ok: grid && !!head && Number.isFinite(rowcount) && honest,
              ev: `grid=${grid} header=${!!head} rowcount=${rowcount} painted=${painted} emptyState=${empty}` };
          },
        },
        {
          id: 'inspector',
          f: (w) => {
            const selectedRow = q(w, '.fa-row[aria-selected="true"]');
            const details = q(w, '.fa-details');
            if (!selectedRow && !details) {
              return { ok: null, na: 'no selected item — the list has no row to select under the driver\'s own filter', ev: 'selected=0 details=0' };
            }
            const open = !!(details && q(details, '.fa-action-open'));
            const mine = details ? qa(details, '.fa-action-mine').length : 0;
            // `:not([role="status"])` is load-bearing, not decoration. `fa-mine-refusal` is
            // written TWICE in FilesApp.tsx: the gate-3 contract refusal that REPLACES the Mine
            // button (:2004, no role) and a mine-RESULT note that appears beside a still-present
            // button after an attempt is declined (:1846, role="status"). This drive never mines,
            // so the bare selector would read 1 today and 2 the first time anyone adds a mine leg
            // — a row that goes red on a surface that got no worse.
            const refusal = details ? qa(details, '.fa-mine-refusal:not([role="status"])').length : 0;
            return { ok: !!selectedRow && !!details && open && (mine + refusal === 1),
              ev: `selected=${!!selectedRow} details=${!!details} open=${open} mine=${mine} mineRefusal=${refusal}` };
          },
        },
        {
          id: 'statusDock',
          f: (w) => {
            const dock = q(w, '.fa-status');
            const live = !!dock && dock.getAttribute('role') === 'status';
            const spans = dock ? qa(dock, 'span') : [];
            const items = spans[0] ? txt(spans[0]).replace(/[^\d]/g, '') : '';
            const list = q(w, '.fa-list');
            const body = list ? Number(list.getAttribute('aria-rowcount')) - 1 : NaN;
            // The dock's item figure and the grid's declared body are two readings of one
            // number, so a dock that says 0 over a grid declaring 12 is a lying label.
            const agrees = items.length > 0 && Number(items) === body;
            return { ok: live && spans.length >= 2 && agrees,
              ev: `dock=${!!dock} role=${dock ? dock.getAttribute('role') : '-'} spans=${spans.length} items=${items || '-'} listBody=${body} agrees=${agrees}` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        begin: (w) => {
          const g = filesState();
          const nodes = qa(w, '.fa-tree .fa-tree-node');
          if (g.pressedIndex == null) g.pressedIndex = nodes.findIndex((n) => n.getAttribute('aria-pressed') === 'true');
          const el = scroller(w);
          if (g.scrollTop == null && el) { g.scrollTop = el.scrollTop; g.scrollKey = keyOf(el); }
          const root = q(w, '.fa-tree-root');
          if (!root) return { refused: 'no Everything node' };
          root.click();
          return { from: g.pressedIndex, to: 'root' };
        },
        visitFolder: (w) => {
          const g = filesState();
          const root = q(w, '.fa-tree-root');
          g.rootPressed = !!root && root.getAttribute('aria-pressed') === 'true';
          const target = qa(w, '.fa-tree-node[data-derived="true"]').find((n) => !n.hasAttribute('data-panel'));
          if (!target) return { refused: 'no derived folder node' };
          target.click();
          return { rootPressed: g.rootPressed, to: txt(q(target, '.fa-tree-label')) };
        },
        returnRoot: (w) => {
          const g = filesState();
          const pressed = qa(w, '.fa-tree .fa-tree-node').filter((n) => n.getAttribute('aria-pressed') === 'true');
          g.folderPressed = pressed.length === 1 && pressed[0].hasAttribute('data-derived');
          const root = q(w, '.fa-tree-root');
          if (!root) return { refused: 'no Everything node' };
          root.click();
          return { folderPressed: g.folderPressed, back: 'root' };
        },
        clearSearch: (w) => {
          const g = filesState();
          const root = q(w, '.fa-tree-root');
          const rootNow = !!root && root.getAttribute('aria-pressed') === 'true';
          g.treeMoved = g.rootPressed === true && g.folderPressed === true && rootNow;
          const input = q(w, '.fa-search input');
          if (!input) return { refused: 'no search input' };
          const list = q(w, '.fa-list');
          g.rowsAsFound = list ? Number(list.getAttribute('aria-rowcount')) : NaN;
          // Recorded on the FIRST drive only, so a re-drive cannot mistake the probe token
          // it typed last time for the user's own query. `undo` puts this back.
          if (g.userQuery == null) g.userQuery = input.value;
          typeInto(input, '');
          return { treeMoved: g.treeMoved, rowsAsFound: g.rowsAsFound, userQuery: g.userQuery.length, cleared: true };
        },
        restoreSearch: (w) => {
          const g = filesState();
          const list = q(w, '.fa-list');
          g.rowsCleared = list ? Number(list.getAttribute('aria-rowcount')) : NaN;
          const input = q(w, '.fa-search input');
          if (!input) return { refused: 'no search input' };
          // THE TOKEN COMES OFF A ROW THAT IS REALLY ON SCREEN, so the filter is asked to
          // SELECT rather than merely to empty: whatever this matches, it matches at least
          // the row it was cut from. `matchesQuery` (shared/filesApp/catalog.ts:592) folds
          // and matches name | kind | provenance, so a name fragment is a live query.
          const first = q(w, '.fa-row:not(.fa-head) .fa-cell-name');
          const token = txt(first).trim().slice(0, 4).trim();
          g.probe = token.length >= 2 ? token : null;
          typeInto(input, g.probe || '');
          return { rowsCleared: g.rowsCleared, probe: g.probe, from: txt(first).slice(0, 40) };
        },
        flipSort: (w) => {
          const g = filesState();
          const list = q(w, '.fa-list');
          const rowsNow = list ? Number(list.getAttribute('aria-rowcount')) : NaN;
          g.rowsQueried = rowsNow;
          // No listed row means no token could be cut, and a filter with no subject is a
          // data gap rather than a defect — the row declares `na` instead of scoring false.
          g.searchNoSubject = g.rowsCleared === 1 || g.probe == null;
          // SELECTION, not just shrinkage: at least one row kept (> 1 counts the header)
          // and at least one dropped. A matcher that empties the list on any input would
          // satisfy "narrowed" and fails this.
          g.searchLive = Number.isFinite(g.rowsCleared) && g.rowsCleared > 1 && g.probe != null
            && rowsNow > 1 && rowsNow < g.rowsCleared;
          const dir = q(w, '.fa-sort-dir');
          if (!dir) return { refused: 'no sort-direction control' };
          g.sortLabel = dir.getAttribute('aria-label') || '';
          dir.click();
          return { searchLive: g.searchLive, noSubject: g.searchNoSubject, rowsNow, label: g.sortLabel };
        },
        flipSortBack: (w) => {
          const g = filesState();
          const dir = q(w, '.fa-sort-dir');
          if (!dir) return { refused: 'no sort-direction control' };
          const now = dir.getAttribute('aria-label') || '';
          g.sortChanged = now.length > 0 && now !== g.sortLabel;
          dir.click();
          return { changed: g.sortChanged, now };
        },
        switchView: (w) => {
          const g = filesState();
          const dir = q(w, '.fa-sort-dir');
          g.sortFlipped = g.sortChanged === true && !!dir && (dir.getAttribute('aria-label') || '') === g.sortLabel;
          const list = q(w, '.fa-list');
          g.viewBefore = list ? list.getAttribute('data-view') : null;
          const other = qa(w, '.fa-view-mode-button').find((b) => b.getAttribute('aria-pressed') !== 'true');
          if (!other) return { refused: 'no alternate view-mode control' };
          g.viewOther = other.getAttribute('data-mode');
          other.click();
          return { sortFlipped: g.sortFlipped, from: g.viewBefore, to: g.viewOther };
        },
        switchViewBack: (w) => {
          const g = filesState();
          const list = q(w, '.fa-list');
          const now = list ? list.getAttribute('data-view') : null;
          g.viewChanged = !!now && now === g.viewOther && now !== g.viewBefore;
          const back = qa(w, '.fa-view-mode-button').find((b) => b.getAttribute('data-mode') === g.viewBefore);
          if (!back) return { refused: 'original view-mode control gone' };
          back.click();
          return { changed: g.viewChanged, now };
        },
        selectFirst: (w) => {
          const g = filesState();
          const list = q(w, '.fa-list');
          const now = list ? list.getAttribute('data-view') : null;
          g.viewSwitched = g.viewChanged === true && now === g.viewBefore;
          const row = q(w, '.fa-row:not(.fa-head)');
          if (!row) return { viewSwitched: g.viewSwitched, none: true };
          row.click();
          return { viewSwitched: g.viewSwitched, selected: txt(row).slice(0, 40) };
        },
        finish: (w) => {
          const el = scroller(w);
          if (el) el.scrollTop = Math.min(120, Math.max(0, el.scrollHeight - el.clientHeight));
          return { inspector: !!q(w, '.fa-details'), scroll: el ? el.scrollTop : 0 };
        },
      },
      drive: ['begin', 'visitFolder', 'returnRoot', 'clearSearch', 'restoreSearch', 'flipSort',
        'flipSortBack', 'switchView', 'switchViewBack', 'selectFirst', 'finish'],
      undo: {
        files: (w) => {
          const g = window.__LQP_FILES_ORIG;
          if (!g) return null;
          const done = [];
          const nodes = qa(w, '.fa-tree .fa-tree-node');
          const pressed = nodes.findIndex((n) => n.getAttribute('aria-pressed') === 'true');
          if (g.pressedIndex >= 0 && nodes[g.pressedIndex] && pressed !== g.pressedIndex) {
            nodes[g.pressedIndex].click(); done.push('folder');
          }
          const dir = q(w, '.fa-sort-dir');
          if (dir && g.sortLabel && (dir.getAttribute('aria-label') || '') !== g.sortLabel) { dir.click(); done.push('sort'); }
          // The probe token this drive typed is the harness's, not the user's. The runner's
          // `undirtyField` also restores this field at the very end of the run, but only
          // then — between control mutations `restore()` is the only thing that runs, so
          // without this the box would carry a probe token across the next re-drive.
          const box = q(w, '.fa-search input');
          if (box && g.userQuery != null && box.value !== g.userQuery) {
            typeInto(box, g.userQuery); done.push('query');
          }
          const back = g.viewBefore && qa(w, '.fa-view-mode-button').find((b) => b.getAttribute('data-mode') === g.viewBefore);
          if (back && back.getAttribute('aria-pressed') !== 'true') { back.click(); done.push('view'); }
          const el = qa(w, '*').find((e) => keyOf(e) === g.scrollKey);
          if (el && g.scrollTop != null && el.scrollTop !== g.scrollTop) {
            el.scrollTop = g.scrollTop; done.push('scroll');
          }
          window.__LQP_FILES_ORIG = null;
          return done.length ? `files:${done.join('+')}` : null;
        },
      },
      mutations: {
        folderTree: (w) => stripAttr(
          qa(w, '.fa-tree .fa-tree-node').find((n) => n.getAttribute('aria-pressed') === 'true'),
          'aria-pressed', 'no pressed folder node',
        ),
        search: (w) => detach(q(w, '.fa-search input'), 'no search input'),
        sortControls: (w) => detach(q(w, '.fa-sort-dir'), 'no sort-direction control'),
        viewMode: (w) => stripAttr(
          qa(w, '.fa-view-mode-button').find((b) => b.getAttribute('aria-pressed') === 'true'),
          'aria-pressed', 'no pressed view-mode control',
        ),
        itemList: (w) => stripAttr(q(w, '.fa-list'), 'role', 'no item grid'),
        inspector: (w) => detach(q(w, '.fa-details .fa-action-open'), 'no inspector — no item is selected'),
        statusDock: (w) => stripAttr(q(w, '.fa-status'), 'role', 'no status dock'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /**
     * VISUALIZER — the canvas is the stable anchor; its two navigation routes occupy the
     * contextual edge dock. No setting is changed by this spec: the Settings route is the
     * reversible way to reach every mode, colour and analyser control, while Music is the
     * honest recovery route for an idle visualizer.
     */
    visualizer: {
      titleRe: /Visualizer|ビジュアライザー|可视化|Визуализатор/i,
      rootSel: '.viz-widget',
      features: [
        {
          id: 'visualizationCanvas',
          f: (w) => {
            const root = q(w, '.viz-widget');
            const canvas = q(w, '.viz-widget-canvas');
            const rr = root && root.getBoundingClientRect();
            const cr = canvas && canvas.getBoundingClientRect();
            const covered = !!rr && !!cr && cr.width >= rr.width * 0.95 && cr.height >= rr.height * 0.95;
            return { ok: !!canvas && covered,
              ev: `canvas=${!!canvas} root=${rr ? `${Math.round(rr.width)}x${Math.round(rr.height)}` : 'absent'} canvasBox=${cr ? `${Math.round(cr.width)}x${Math.round(cr.height)}` : 'absent'} covered=${covered}` };
          },
        },
        {
          id: 'musicRoute',
          f: (w) => {
            const action = q(w, '[data-viz-action="music"]');
            const label = action && action.getAttribute('aria-label');
            return { ok: !!action && !action.disabled && !!(label || '').trim(),
              ev: `control=${!!action} enabled=${!!action && !action.disabled} label="${label || ''}"` };
          },
        },
        {
          id: 'settingsRoute',
          f: (w) => {
            const action = q(w, '[data-viz-action="settings"]');
            const label = action && action.getAttribute('aria-label');
            return { ok: !!action && !action.disabled && !!(label || '').trim(),
              ev: `control=${!!action} enabled=${!!action && !action.disabled} label="${label || ''}"` };
          },
        },
        {
          id: 'contextualDock',
          f: (w) => {
            const dock = q(w, '.viz-widget-dock');
            const actions = dock ? qa(dock, 'button') : [];
            return { ok: !!dock && dock.getAttribute('data-lq-role') === 'contextual'
                && dock.getAttribute('role') === 'toolbar'
                && !!(dock.getAttribute('aria-label') || '').trim() && actions.length === 2,
              ev: `dock=${!!dock} role=${dock && dock.getAttribute('data-lq-role')} toolbar=${dock && dock.getAttribute('role')} named=${!!dock && !!(dock.getAttribute('aria-label') || '').trim()} actions=${actions.length}` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      mutations: {
        visualizationCanvas: (w) => detach(q(w, '.viz-widget-canvas'), 'no visualizer canvas'),
        musicRoute: (w) => stripAttr(q(w, '[data-viz-action="music"]'), 'aria-label', 'no Music route'),
        settingsRoute: (w) => stripAttr(q(w, '[data-viz-action="settings"]'), 'aria-label', 'no Settings route'),
        contextualDock: (w) => stripAttr(q(w, '.viz-widget-dock'), 'data-lq-role', 'no edge dock'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /**
     * MUSIC WIDGET — the mini-player. Like the visualizer it paints NO title, so `findWin`
     * reaches it on `rootSel` and the `titleRe` below is documentation of the name assistive
     * tech gets (`aria-label` from `settings.mini.app.musicwidget`), not the match that runs.
     *
     * The rows are the widget's OBSERVABLE side effects, not its paint: seven named transport
     * actions in one named toolbar, a seek slider whose range really tracks the loaded track,
     * a volume slider, the now-playing identity OR the honest empty state with its real route,
     * and the window's own lifecycle. Nothing here changes the user's playback: `check` reads,
     * it never presses play, because a parity sweep that started the audio would leave the
     * desk in a state the next harness measures.
     *
     * `nowPlaying` is deliberately an EITHER: with a queue it is the title/artist pair, and
     * idle it is `.mwidget-empty` plus the button that opens Music. A row that demanded a
     * title would score an idle widget as a regression, which is the "empty harness" cap —
     * and a row that accepted only the empty state would score a playing one the same way.
     */
    musicwidget: {
      titleRe: /Music Widget|ミニプレーヤー|音乐小组件|Музыкальный виджет/i,
      rootSel: '.mwidget',
      features: [
        {
          id: 'transportToolbar',
          f: (w) => {
            const bar = q(w, '.mwidget-controls');
            const named = bar ? qa(bar, 'button').filter(
              (b) => (b.getAttribute('aria-label') || '').trim(),
            ) : [];
            const buttons = bar ? qa(bar, 'button') : [];
            return { ok: !!bar && bar.getAttribute('role') === 'toolbar'
                && !!(bar.getAttribute('aria-label') || '').trim()
                && buttons.length >= 8 && named.length === buttons.length,
              ev: `toolbar=${!!bar} role=${bar && bar.getAttribute('role')} named="${bar && bar.getAttribute('aria-label')}" buttons=${buttons.length} withName=${named.length}` };
          },
        },
        {
          /**
           * The four secondary transport toggles sit behind a disclosure (category 5 Q4), so
           * "reachable" has to be asserted rather than assumed: the toggle must declare a
           * real `aria-expanded` boolean, must point at a region that exists, and that region
           * must still HOLD its four controls while collapsed. A disclosure whose contents are
           * unmounted when shut is a feature that is gone, not tucked.
           */
          id: 'secondaryDisclosure',
          f: (w) => {
            const tog = q(w, '.mwidget-more');
            const expanded = tog && tog.getAttribute('aria-expanded');
            const id = tog && tog.getAttribute('aria-controls');
            const region = id ? w.querySelector(`[id="${id}"]`) : null;
            const held = region ? qa(region, 'button').length : 0;
            return { ok: !!tog && (expanded === 'true' || expanded === 'false')
                && !!(tog.getAttribute('aria-label') || '').trim()
                && !!region && held >= 4,
              ev: `toggle=${!!tog} ariaExpanded=${expanded} label="${tog ? tog.getAttribute('aria-label') : ''}" region=${!!region} controlsHeld=${held}` };
          },
        },
        {
          id: 'seekControl',
          f: (w) => {
            const plate = q(w, '.mwidget-progress');
            const seek = plate ? q(plate, 'input[type="range"]') : null;
            const times = plate ? qa(plate, '.mwidget-time') : [];
            const label = seek && seek.getAttribute('aria-label');
            return { ok: !!seek && !!(label || '').trim() && times.length === 2
                && Number(seek.max) > 0,
              ev: `slider=${!!seek} label="${label || ''}" max=${seek && seek.max} timeReadouts=${times.length}` };
          },
        },
        {
          id: 'volumeControl',
          f: (w) => {
            const vol = q(w, '.mwidget-vol input[type="range"]');
            const label = vol && vol.getAttribute('aria-label');
            const onPlate = !!vol && !!vol.closest('.mwidget-progress');
            return { ok: !!vol && !!(label || '').trim() && onPlate
                && Number(vol.value) >= 0 && Number(vol.value) <= 1,
              ev: `slider=${!!vol} label="${label || ''}" value=${vol && vol.value} onAnchorPlate=${onPlate}` };
          },
        },
        {
          id: 'nowPlaying',
          f: (w) => {
            const title = txt(q(w, '.mwidget-title'));
            const empty = q(w, '.mwidget-empty');
            const route = empty ? q(empty, 'button') : null;
            const stated = !!title || (!!empty && !!route && !!txt(route));
            return { ok: stated,
              ev: `title="${title}" emptyState=${!!empty} emptyRoute="${route ? txt(route) : ''}"` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      mutations: {
        transportToolbar: (w) => stripAttr(q(w, '.mwidget-controls'), 'role', 'no transport toolbar'),
        secondaryDisclosure: (w) => stripAttr(q(w, '.mwidget-more'), 'aria-expanded', 'no secondary disclosure'),
        seekControl: (w) => stripAttr(q(w, '.mwidget-progress input[type="range"]'), 'aria-label', 'no seek slider'),
        volumeControl: (w) => stripAttr(q(w, '.mwidget-vol input[type="range"]'), 'aria-label', 'no volume slider'),
        // The now-playing identity has two shapes, so the mutation has to attack whichever
        // one is on screen or it silently mutates nothing and the row cannot fall.
        nowPlaying: (w) => detach(
          q(w, '.mwidget-title') || q(w, '.mwidget-empty'),
          'no now-playing identity and no empty state',
        ),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /**
     * STICKY NOTE — the deliberately smallest desktop surface. Its colour has two honest
     * representations: standard paints the note itself, while Liquid adds the contextual
     * five-colour edge palette. The row checks the selected colour survives both rather than
     * pretending the two presentations must have byte-identical chrome.
     *
     * Delete is inventoried but never driven: closing a note is the product's delete action.
     * The generic dirty-field leg safely exercises the editor and restores the exact text.
     */
    note: {
      titleRe: /Sticky note|付箋|便签|Заметк/i,
      rootSel: '.desk-note-text',
      probeInput: (w) => q(w, '.desk-note-text'),
      features: [
        {
          id: 'editor',
          f: (w) => {
            const editor = q(w, '.desk-note-text');
            return {
              ok: !!editor && !editor.disabled && !editor.readOnly
                && (editor.getAttribute('placeholder') || '').trim().length > 0,
              ev: `textarea=${!!editor} enabled=${!!editor && !editor.disabled && !editor.readOnly} placeholder=${!!editor && (editor.getAttribute('placeholder') || '').trim().length > 0}`,
            };
          },
        },
        {
          id: 'colorState',
          f: (w) => {
            const editor = q(w, '.desk-note-text');
            const color = editor ? editor.style.background : '';
            const liquid = w.getAttribute('data-presentation') === 'liquid';
            const palette = qa(w, '.desk-note-color');
            const pressed = palette.filter((b) => b.getAttribute('aria-pressed') === 'true');
            const bar = q(w, '.fwin-bar');
            const represented = liquid
              ? palette.length === 5 && pressed.length === 1 && pressed[0].style.background === color
              : palette.length === 0 && !!bar && bar.style.background === color;
            return {
              ok: !!color && represented,
              ev: `presentation=${liquid ? 'liquid' : 'standard'} color=${color || 'absent'} palette=${palette.length} selected=${pressed.length} represented=${represented}`,
            };
          },
        },
        {
          id: 'deleteRoute',
          f: (w) => {
            const close = q(w, '.fwin-close');
            // The visible multiplication glyph is not a deletion warning. The authored
            // accessible name is what makes this destructive route honest; title alone loses
            // to the glyph in the accessible-name algorithm and would be announced as "times".
            const label = close && close.getAttribute('aria-label');
            return { ok: !!close && !close.disabled && !!label,
              ev: `control=${!!close} enabled=${!!close && !close.disabled} label="${label || ''}"` };
          },
        },
        {
          id: 'resizeGeometry',
          f: (w) => {
            const handles = qa(w, '.fwin-edge-r,.fwin-edge-b,.fwin-resize');
            const maximizable = w.getAttribute('data-maximizable');
            return { ok: handles.length === 3 && maximizable === 'false',
              ev: `resizeHandles=${handles.length}/3 dataMaximizable=${maximizable}` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      mutations: {
        editor: (w) => stripAttr(q(w, '.desk-note-text'), 'placeholder', 'no note editor'),
        colorState: (w) => stripAttr(q(w, '.desk-note-text'), 'style', 'no note editor'),
        deleteRoute: (w) => stripAttr(q(w, '.fwin-close'), 'aria-label', 'no delete control'),
        resizeGeometry: (w) => removeClassAll([q(w, '.fwin-resize')], 'fwin-resize'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /**
     * STATISTICS — populated local reading and watching evidence. Sync and reset are inventoried
     * but never driven: both write user data. The scroll leg is the reversible state carried
     * through the presentation round trip; every feature row cross-checks rendered values with
     * its label/structure rather than treating a container's presence as feature parity.
     */
    statistics: {
      titleRe: /Statistics|統計|统计|Статистик/i,
      rootSel: '.stats-view',
      features: [
        {
          id: 'knowledgeSummary',
          f: (w) => {
            const section = q(w, '.wk-head') && q(w, '.wk-head').closest('.stats-section');
            const cards = section ? qa(section, '.stats-card') : [];
            const complete = cards.filter((c) => txt(q(c, '.stats-card-val')).length > 0
              && txt(q(c, '.stats-card-lbl')).length > 0).length;
            const sync = section && q(section, '.wk-head button');
            return { ok: cards.length === 4 && complete === 4 && !!sync && !sync.disabled,
              ev: `cards=${cards.length} complete=${complete} syncEnabled=${!!sync && !sync.disabled}` };
          },
        },
        {
          id: 'levelEstimate',
          f: (w) => {
            const meter = q(w, '.stats-level-estimate');
            const badge = txt(q(meter, '.stats-level-badge'));
            const title = txt(q(meter, '.stats-level-title'));
            return { ok: !!meter && meter.getAttribute('role') === 'status' && badge.length > 0 && title.length > 0,
              ev: `role=${meter && meter.getAttribute('role')} badge="${badge}" title="${title}"` };
          },
        },
        {
          id: 'summaryMetrics',
          f: (w) => {
            const grid = q(w, '.stats-view > .stats-cards');
            const cards = grid ? qa(grid, ':scope > .stats-card') : [];
            const complete = cards.filter((c) => txt(q(c, '.stats-card-val')).length > 0
              && txt(q(c, '.stats-card-lbl')).length > 0).length;
            return { ok: cards.length >= 6 && complete === cards.length,
              ev: `cards=${cards.length} complete=${complete}` };
          },
        },
        {
          id: 'activityChart',
          f: (w) => {
            const bars = qa(w, '.stats-chart .stats-bar-col');
            const labelled = bars.filter((b) => txt(q(b, '.stats-bar-lbl')).length > 0
              && (b.getAttribute('title') || '').length > 0).length;
            return { ok: bars.length === 14 && labelled === 14,
              ev: `bars=${bars.length} labelled=${labelled}` };
          },
        },
        {
          id: 'bookBreakdown',
          f: (w) => {
            const list = qa(w, 'ul.stats-books')[0];
            const rows = list ? qa(list, ':scope > li') : [];
            const complete = rows.filter((r) => txt(q(r, '.stats-book-title')).length > 0
              && txt(q(r, '.stats-book-meta')).length > 0).length;
            return { ok: rows.length > 0 && complete === rows.length,
              ev: `rows=${rows.length} complete=${complete}` };
          },
        },
        {
          id: 'showResume',
          f: (w) => {
            const list = qa(w, 'ul.stats-books')[1];
            const rows = list ? qa(list, ':scope > li') : [];
            const controls = list ? qa(list, '.stats-show-resume') : [];
            const labelled = controls.filter((b) => (b.getAttribute('title') || '').length > 0
              && txt(q(b, '.stats-book-title')).length > 0).length;
            return { ok: rows.length > 0 && controls.length === rows.length && labelled === controls.length,
              ev: `rows=${rows.length} controls=${controls.length} labelled=${labelled}` };
          },
        },
        {
          id: 'recentActivity',
          f: (w) => {
            const b = q(w, '.stats-recent-jump');
            const target = q(w, '.stats-recent-activity');
            return { ok: !!b && !!target && window.__LQP_STATS_RECENT_WORKED === true,
              ev: `button=${!!b} target=${!!target} scrolled=${window.__LQP_STATS_RECENT_WORKED === true}` };
          },
        },
        {
          id: 'resetRecovery',
          f: (w) => {
            const details = q(w, '.stats-data-tools');
            const summary = details && q(details, ':scope > summary');
            const action = details && q(details, '.stats-data-tools-panel > button');
            return { ok: !!details && !details.open && txt(summary).length > 0
                && !!action && !action.disabled && txt(action).length > 0,
              ev: `details=${!!details} closed=${!!details && !details.open} summary="${txt(summary)}" action="${txt(action)}"` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        recentActivity: (w) => {
          const el = scroller(w);
          const b = q(w, '.stats-recent-jump');
          if (!el || !b) return { refused: 'recent-activity route is incomplete' };
          const g = statsState();
          if (g.scrollTop == null) { g.scrollTop = el.scrollTop; g.scrollKey = keyOf(el); }
          const before = el.scrollTop;
          b.click();
          window.__LQP_STATS_RECENT_WORKED = el.scrollTop !== before;
          return { before, after: el.scrollTop, moved: window.__LQP_STATS_RECENT_WORKED };
        },
        scroll: (w, px) => {
          const el = scroller(w);
          if (!el) return { refused: 'surface has no scrollable region' };
          const g = statsState();
          if (g.scrollTop == null) { g.scrollTop = el.scrollTop; g.scrollKey = keyOf(el); }
          el.scrollTop = Number(px) || 320;
          return { top: el.scrollTop, range: el.scrollHeight - el.clientHeight, key: keyOf(el) };
        },
      },
      drive: ['recentActivity', ['scroll', '320']],
      undo: {
        statistics: (w) => {
          const g = window.__LQP_STATS_ORIG;
          if (!g) return null;
          const el = qa(w, '*').find((e) => keyOf(e) === g.scrollKey);
          if (el && el.scrollTop !== g.scrollTop) el.scrollTop = g.scrollTop;
          window.__LQP_STATS_ORIG = null;
          window.__LQP_STATS_RECENT_WORKED = null;
          return el ? 'statistics:scroll' : null;
        },
      },
      mutations: {
        knowledgeSummary: (w) => detach(
          q(w, '.stats-section .stats-cards .stats-card-val'),
          'no knowledge value',
        ),
        levelEstimate: (w) => detach(q(w, '.stats-level-title'), 'no level title'),
        summaryMetrics: (w) => detach(q(w, '.stats-view > .stats-cards .stats-card-lbl'), 'no summary label'),
        activityChart: (w) => detach(q(w, '.stats-chart .stats-bar-lbl'), 'no chart label'),
        bookBreakdown: (w) => detach(q(w, 'ul.stats-books .stats-book-title'), 'no book title'),
        showResume: (w) => {
          const list = qa(w, 'ul.stats-books')[1];
          return stripAttr(list && q(list, '.stats-show-resume'), 'title', 'no show resume');
        },
        recentActivity: (w) => removeClassAll(
          [q(w, '.stats-recent-activity')],
          'stats-recent-activity',
          'no recent-activity section — this surface has no study data yet',
        ),
        resetRecovery: (w) => detach(q(w, '.stats-data-tools-panel > button'), 'no reset action'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /**
     * CALENDAR — four render branches, reversible date transport, and the non-writing half of
     * event creation. The drive opens and cancels the real composer but never creates, edits, or
     * deletes user data. Its scroll is the app state carried through the presentation round trip.
     */
    calendar: {
      titleRe: /Calendar|カレンダー|日历|Календар/i,
      rootSel: '.calendar-view',
      features: [
        {
          id: 'viewModes',
          f: (w) => {
            const buttons = qa(w, '.cal-mode-btn');
            const active = activeOf(buttons, 'active');
            const seen = (window.__LQP_CAL_ORIG && window.__LQP_CAL_ORIG.visited) || {};
            const visited = ['month', 'week', 'day', 'agenda'].filter((m) => seen[m]).length;
            return { ok: buttons.length === 4 && active === 1 && visited === 4,
              ev: `buttons=${buttons.length} active=${active} visited=${visited}/4` };
          },
        },
        {
          id: 'monthGrid',
          f: (w) => {
            const grid = q(w, '.cal-month-grid');
            const dows = grid ? qa(grid, '.cal-month-dow') : [];
            const cells = grid ? qa(grid, '.cal-month-cell') : [];
            const numbered = cells.filter((c) => txt(q(c, '.cal-month-daynum')).length > 0).length;
            return { ok: !!grid && dows.length === 7 && cells.length === 42 && numbered === 42,
              ev: `dows=${dows.length} cells=${cells.length} numbered=${numbered}` };
          },
        },
        {
          id: 'dateTransport',
          f: (w) => {
            const nav = q(w, '.cal-nav');
            const buttons = nav ? qa(nav, ':scope > button') : [];
            const arrowsNamed = buttons.filter((b) => txt(b).length > 0 || (b.title || '').length > 0).length;
            const jump = nav && q(nav, 'input[type="date"]');
            const g = window.__LQP_CAL_ORIG || {};
            return { ok: buttons.length === 3 && arrowsNamed === 3 && !!jump
                && txt(q(nav, '.cal-header-label')).length > 0 && g.transport === true,
              ev: `buttons=${buttons.length} named=${arrowsNamed} jump=${!!jump} shiftedAndReturned=${g.transport === true}` };
          },
        },
        {
          id: 'eventComposer',
          f: (w) => {
            const trigger = q(w, '.calendar-context-head > .btn');
            const g = window.__LQP_CAL_ORIG || {};
            return { ok: !!trigger && trigger.getAttribute('type') === 'button'
                && g.composerComplete === true && !q(w, '.cal-modal'),
              ev: `trigger=${!!trigger} complete=${g.composerComplete === true} closed=${!q(w, '.cal-modal')}` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        begin: (w) => {
          const g = calendarState();
          const buttons = qa(w, '.cal-mode-btn');
          if (g.modeIndex == null) g.modeIndex = buttons.findIndex((b) => b.classList.contains('active'));
          g.visited = {};
          g.visited.month = !!q(w, '.cal-month-grid');
          const el = scroller(w);
          if (g.scrollTop == null && el) { g.scrollTop = el.scrollTop; g.scrollKey = keyOf(el); }
          if (!buttons[1]) return { refused: 'week mode is absent' };
          buttons[1].click();
          return { from: g.modeIndex, to: 'week' };
        },
        visitWeek: (w) => {
          const g = calendarState();
          g.visited.week = qa(w, '.cal-week-col').length === 7 && qa(w, '.cal-add-inline').length === 7;
          const b = qa(w, '.cal-mode-btn')[2];
          if (!b) return { refused: 'day mode is absent' };
          b.click();
          return { week: g.visited.week, to: 'day' };
        },
        visitDay: (w) => {
          const g = calendarState();
          g.visited.day = !!q(w, '.cal-day-list');
          const b = qa(w, '.cal-mode-btn')[3];
          if (!b) return { refused: 'agenda mode is absent' };
          b.click();
          return { day: g.visited.day, to: 'agenda' };
        },
        visitAgenda: (w) => {
          const g = calendarState();
          g.visited.agenda = qa(w, '.cal-agenda > section').length === 3;
          const b = qa(w, '.cal-mode-btn')[0];
          if (!b) return { refused: 'month mode is absent' };
          b.click();
          return { agenda: g.visited.agenda, to: 'month' };
        },
        visitMonth: (w) => {
          const g = calendarState();
          g.visited.month = qa(w, '.cal-month-cell').length === 42;
          const nav = qa(w, '.cal-nav > button');
          g.headerBefore = txt(q(w, '.cal-header-label'));
          if (!nav[0]) return { refused: 'previous-date control is absent' };
          nav[0].click();
          return { month: g.visited.month, before: g.headerBefore };
        },
        returnDate: (w) => {
          const g = calendarState();
          const now = txt(q(w, '.cal-header-label'));
          g.shifted = now.length > 0 && now !== g.headerBefore;
          const nav = qa(w, '.cal-nav > button');
          if (!nav[2]) return { refused: 'next-date control is absent' };
          nav[2].click();
          return { shifted: g.shifted, back: 'next' };
        },
        openComposer: (w) => {
          const g = calendarState();
          g.transport = g.shifted === true && txt(q(w, '.cal-header-label')) === g.headerBefore;
          const trigger = q(w, '.calendar-context-head > .btn');
          if (!trigger) return { refused: 'new-event control is absent' };
          trigger.click();
          return { transport: g.transport };
        },
        closeComposer: (w) => {
          const g = calendarState();
          const modal = q(w, '.cal-modal');
          if (!modal) return { refused: 'event composer did not open' };
          const inputs = qa(modal, 'input').length;
          const selects = qa(modal, 'select').length;
          const textareas = qa(modal, 'textarea').length;
          const actions = qa(modal, '.cal-modal-actions button');
          g.composerComplete = inputs >= 5 && selects >= 3 && textareas === 1 && actions.length >= 2;
          const cancel = actions.find((b) => !b.classList.contains('primary') && !b.classList.contains('danger'));
          if (!cancel) return { refused: 'event composer has no cancel recovery' };
          cancel.click();
          return { inputs, selects, textareas, actions: actions.length, complete: g.composerComplete };
        },
        finish: (w) => {
          const g = calendarState();
          g.composerComplete = g.composerComplete === true && !q(w, '.cal-modal');
          const el = scroller(w);
          if (el) el.scrollTop = Math.min(120, Math.max(0, el.scrollHeight - el.clientHeight));
          return { composerClosed: !q(w, '.cal-modal'), scroll: el ? el.scrollTop : 0 };
        },
      },
      drive: ['begin', 'visitWeek', 'visitDay', 'visitAgenda', 'visitMonth', 'returnDate',
        'openComposer', 'closeComposer', 'finish'],
      undo: {
        calendar: (w) => {
          const g = window.__LQP_CAL_ORIG;
          if (!g) return null;
          const done = [];
          const modalClose = q(w, '.cal-modal .cbh-icon-btn');
          if (modalClose) { modalClose.click(); done.push('modal'); }
          const buttons = qa(w, '.cal-mode-btn');
          const active = buttons.findIndex((b) => b.classList.contains('active'));
          if (g.modeIndex >= 0 && buttons[g.modeIndex] && active !== g.modeIndex) {
            buttons[g.modeIndex].click(); done.push('mode');
          }
          const el = qa(w, '*').find((e) => keyOf(e) === g.scrollKey);
          if (el && g.scrollTop != null && el.scrollTop !== g.scrollTop) {
            el.scrollTop = g.scrollTop; done.push('scroll');
          }
          window.__LQP_CAL_ORIG = null;
          return done.length ? `calendar:${done.join('+')}` : null;
        },
      },
      mutations: {
        viewModes: (w) => addClassAll(
          [qa(w, '.cal-mode-btn').find((b) => !b.classList.contains('active'))].filter(Boolean),
          'active',
        ),
        monthGrid: (w) => detach(q(w, '.cal-month-cell .cal-month-daynum'), 'no month day number'),
        dateTransport: (w) => detach(q(w, '.cal-nav > .wgt-btn-icon'), 'no previous-date control'),
        eventComposer: (w) => stripAttr(q(w, '.calendar-context-head > .btn'), 'type', 'no new-event control'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /**
     * GAMES — the Arena. §11's parity list is "every game, typing input, source material,
     * scores, level filters, accessibility", and two of those exist ONLY while a round is
     * running, so the drive starts one, reads the answer box and the HUD, and aborts it.
     *
     * ABORTING IS NOT OPTIONAL AND IT IS THE PRODUCT'S OWN PATH. `finishSession` is the
     * only writer of the player's progress, and it fires on the last submit or when the
     * session timer expires (`settings.gameLength * 12_000` — 60s at the default 5). The
     * drive never submits, and a list-item click runs `setSession(null)`, which is how the
     * app itself discards a round. Nothing this spec does can record a score.
     *
     * THE DRIVE ENDS ON KANA SPRINT AND STAYS THERE, deliberately. It is the one game that
     * is both a `type` round (so "typing input" is a real control rather than a token bank)
     * and owns the in-Arena scope picker (so "level filters" is on screen rather than a
     * jump into Settings). Leaving it selected is what lets the negative control falsify
     * those rows with a control that is actually mounted; `undo` clicks the original game
     * back and restores the scroll.
     *
     * THE PICKER HAS TWO SHAPES and scoring one of them would be wrong: Automatic renders
     * the mode row plus a hint, Manual renders the mode row plus script and group rows.
     * The row reads the declared mode and scores the shape that mode promises — and it
     * never toggles the mode, because that is persisted settings.
     */
    games: {
      titleRe: /Game Arena|ゲームアリーナ|游戏竞技场|Игровая арена/i,
      rootSel: '.game-arena',
      features: [
        {
          id: 'gameCatalog',
          f: (w) => {
            const items = qa(w, '.game-list-item');
            const named = items.filter((b) => txt(q(b, 'b')).length > 0 && txt(q(b, 'small')).length > 0).length;
            const real = items.filter((b) => b.getAttribute('type') === 'button').length;
            const active = activeOf(items, 'active');
            const g = gamesState();
            return { ok: items.length >= 10 && named === items.length && real === items.length
                && active === 1 && g.switched === true,
              ev: `games=${items.length} named=${named} buttons=${real} active=${active} selectionWorks=${g.switched === true}` };
          },
        },
        {
          id: 'stageIdentity',
          f: (w) => {
            const active = qa(w, '.game-list-item').find((b) => b.classList.contains('active'));
            const title = txt(q(w, '.game-stage-head h3'));
            const desc = txt(q(w, '.game-stage-head p.muted'));
            const listed = active ? txt(q(active, 'b')) : '';
            const blurb = active ? txt(q(active, 'small')) : '';
            return { ok: !!active && title.length > 0 && title === listed && desc.length > 0 && desc === blurb,
              ev: `stage="${title}" listed="${listed}" descMatches=${desc.length > 0 && desc === blurb}` };
          },
        },
        {
          id: 'sourceMaterial',
          f: (w) => {
            const sec = qa(w, '.game-coverage').find((s) => !s.classList.contains('game-seen'));
            const label = sec ? sec.getAttribute('aria-label') : null;
            const note = txt(sec && q(sec, '.muted'));
            const pct = (note.match(/(\d+)\s*%/) || [])[1];
            const scale = barScale(sec && q(sec, '.game-coverage-bar i'));
            // No list is an HONEST state, and it has its own agreement to keep: an empty
            // deck must paint an empty bar. A filled bar over "no word list" is the lie
            // this row exists for.
            const agrees = pct === undefined ? scale === 0 : Math.abs(scale * 100 - Number(pct)) <= 1;
            return { ok: !!sec && !!label && label.length > 0 && note.length > 0 && agrees,
              ev: `label="${label}" note="${note.slice(0, 46)}" pct=${pct === undefined ? 'noList' : pct} scaleX=${scale} agrees=${agrees}` };
          },
        },
        {
          id: 'exposureTracking',
          f: (w) => {
            const sec = q(w, '.game-seen');
            const note = txt(sec && q(sec, '.muted'));
            const nums = note.match(/(\d+)\s*\/\s*(\d+)/);
            const pct = (note.match(/(\d+)\s*%/) || [])[1];
            const scale = barScale(sec && q(sec, '.game-coverage-bar i'));
            const derived = nums ? Math.round((Number(nums[1]) / Math.max(1, Number(nums[2]))) * 100) : null;
            return { ok: !!sec && !!sec.getAttribute('aria-label') && !!nums && pct !== undefined
                && Number(pct) === derived && Math.abs(scale * 100 - Number(pct)) <= 1,
              ev: `seen=${nums ? `${nums[1]}/${nums[2]}` : 'none'} statedPct=${pct} derivedPct=${derived} scaleX=${scale}` };
          },
        },
        {
          id: 'typingInput',
          f: (w) => {
            const g = gamesState();
            const start = q(w, '.game-launch-panel > .btn.primary');
            return { ok: g.typing === true && !!start && start.getAttribute('type') === 'button' && !start.disabled,
              ev: `round=${g.typingEv || 'not driven'} startControl=${start ? start.getAttribute('type') : 'absent'} enabled=${!!start && !start.disabled}` };
          },
        },
        {
          id: 'scoreHud',
          f: (w) => {
            const g = gamesState();
            const note = txt(q(w, '.game-launch-panel > .muted'));
            const declared = (note.match(/\d+/) || [])[0];
            return { ok: g.hud === true && declared !== undefined && Number(declared) === g.hudTotal,
              ev: `hud=${g.hudEv || 'not driven'} readyStateRounds=${declared} hudRoundTotal=${g.hudTotal}` };
          },
        },
        {
          id: 'roundHistory',
          f: (w) => {
            const sec = q(w, '.game-history');
            const heading = txt(sec && q(sec, 'h4'));
            const rows = sec ? qa(sec, '.game-history-row') : [];
            const complete = rows.filter((r) => txt(q(r, 'b')).length > 0
              && txt(q(r, 'span')).length > 0 && txt(q(r, 'em')).length > 0).length;
            const empty = txt(sec && q(sec, ':scope > .muted'));
            const honest = rows.length > 0 ? complete === rows.length : empty.length > 0;
            return { ok: !!sec && !!sec.getAttribute('aria-label') && heading.length > 0 && honest,
              ev: `heading="${heading}" rows=${rows.length} complete=${complete} emptyState="${empty.slice(0, 34)}"` };
          },
        },
        {
          id: 'materialScope',
          f: (w) => {
            const picker = q(w, '.game-kana-picker');
            const rows = picker ? qa(picker, '.os-viz-row') : [];
            const modes = rows[0] ? qa(rows[0], 'button') : [];
            const chosen = activeOf(modes, 'primary');
            const manual = rows.length > 1;
            const scripts = manual ? qa(rows[1], 'button') : [];
            const groups = manual && rows[2] ? qa(rows[2], 'button') : [];
            const shape = manual
              ? scripts.length >= 2 && activeOf(scripts, 'primary') >= 1 && groups.length >= 1
              : txt(q(picker, '.os-set-hint')).length > 0;
            return { ok: !!picker && modes.length === 2 && chosen === 1 && shape,
              ev: `picker=${!!picker} modes=${modes.length} chosen=${chosen} mode=${manual ? 'manual' : 'auto'} scripts=${scripts.length} groups=${groups.length} shapeHeld=${shape}` };
          },
        },
        {
          id: 'levelSettings',
          f: (w) => {
            const g = gamesState();
            const meta = qa(w, '.game-stage-meta > span').map(txt);
            const filled = meta.filter((s) => s.length > 0).length;
            const options = q(w, '.game-ready-options');
            const entry = q(w, '.game-ready-options-body > button');
            // The level is arena-wide, not per game: switching games must not move it.
            // A per-game decoration would drift here, which is the defect this catches.
            const stable = g.levelBefore != null && meta[0] === g.levelBefore;
            return { ok: meta.length === 3 && filled === 3 && stable
                && !!options && options.open && !!entry
                && entry.getAttribute('type') === 'button' && txt(entry).length > 0,
              ev: `meta=[${meta.join(' | ')}] levelBeforeSwitch="${g.levelBefore}" stable=${stable} optionsOpen=${!!options && options.open} settingsEntry="${txt(entry)}"` };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        begin: (w) => {
          const g = gamesState();
          const items = qa(w, '.game-list-item');
          if (g.origIndex == null) g.origIndex = items.findIndex((b) => b.classList.contains('active'));
          if (g.levelBefore == null) g.levelBefore = txt(qa(w, '.game-stage-meta > span')[0]);
          const options = q(w, '.game-ready-options');
          if (g.optionsOpenBefore == null) g.optionsOpenBefore = !!options && options.open;
          const el = scroller(w);
          if (g.scrollTop == null && el) { g.scrollTop = el.scrollTop; g.scrollKey = keyOf(el); }
          const target = items.findIndex((b) => KANA_GAME_RE.test(txt(q(b, 'b'))));
          if (target < 0) return { refused: 'no typing game with a material scope in the catalogue' };
          g.targetIndex = target;
          g.targetTitle = txt(q(items[target], 'b'));
          items[target].click(); // also discards any session left running
          return { from: g.origIndex, to: target, title: g.targetTitle, levelBefore: g.levelBefore };
        },
        startRound: (w) => {
          const g = gamesState();
          // Read the switch back AFTER React has re-rendered — this is its own call.
          g.switched = txt(q(w, '.game-stage-head h3')) === g.targetTitle;
          const start = q(w, '.game-launch-panel > .btn.primary');
          if (!start) return { refused: 'the selected game renders no ready-state start control' };
          start.click();
          return { switched: g.switched, stage: txt(q(w, '.game-stage-head h3')) };
        },
        typeRound: (w) => {
          const g = gamesState();
          const box = q(w, '.game-answer-box');
          if (!box) return { refused: 'the round did not start, or it is not a typing round' };
          const hud = qa(w, '.game-round-hud > span').map(txt);
          const bar = q(w, '.game-time-bar');
          const now = bar ? Number(bar.getAttribute('aria-valuenow')) : NaN;
          g.hudTotal = Number((txt(qa(w, '.game-round-hud > span')[0]).match(/\d+/g) || []).pop());
          g.hud = hud.length === 4 && hud.every((s) => s.length > 0)
            && !!bar && bar.getAttribute('role') === 'progressbar'
            && now >= 0 && now <= 100 && (bar.getAttribute('aria-label') || '').length > 0;
          g.hudEv = `spans=${hud.length} valuenow=${now} labelled=${!!bar && (bar.getAttribute('aria-label') || '').length > 0}`;
          g.submitBefore = !!q(w, '.game-round .btn.primary') && q(w, '.game-round .btn.primary').disabled;
          typeInto(box, 'ro'); // typed, never submitted — nothing is scored or recorded
          return { hud, valuenow: now, roundTotal: g.hudTotal, submitDisabledBefore: g.submitBefore };
        },
        abortRound: (w) => {
          const g = gamesState();
          const box = q(w, '.game-answer-box');
          const submit = q(w, '.game-round .btn.primary');
          // The whole claim: an empty box locks submit, a typed box unlocks it, and the
          // typed characters are really in the field. Presence of an <input> proves none
          // of that.
          g.typing = !!box && box.value === 'ro' && g.submitBefore === true && !!submit && !submit.disabled;
          g.typingEv = `value="${box ? box.value : ''}" submitDisabled ${g.submitBefore}->${submit ? submit.disabled : 'gone'}`;
          const active = qa(w, '.game-list-item').find((b) => b.classList.contains('active'));
          if (!active) return { refused: 'no active game to discard the round through' };
          active.click();
          return { typing: g.typing, ev: g.typingEv };
        },
        settle: (w) => {
          const g = gamesState();
          const ready = !!q(w, '.game-launch-panel') && !q(w, '.game-round-shell');
          g.typing = g.typing === true && ready;
          g.typingEv = `${g.typingEv} readyStateReturned=${ready}`;
          const options = q(w, '.game-ready-options');
          if (options && !options.open) options.open = true;
          const el = scroller(w);
          if (el) el.scrollTop = Math.min(120, Math.max(0, el.scrollHeight - el.clientHeight));
          return { readyStateReturned: ready, optionsOpen: !!options && options.open, scroll: el ? el.scrollTop : 0 };
        },
      },
      drive: ['begin', 'startRound', 'typeRound', 'abortRound', 'settle'],
      undo: {
        games: (w) => {
          const g = window.__LQP_GAMES_ORIG;
          if (!g) return null;
          const done = [];
          const items = qa(w, '.game-list-item');
          if (q(w, '.game-round-shell')) {
            const active = items.find((b) => b.classList.contains('active'));
            if (active) { active.click(); done.push('session'); }
          }
          const active = items.findIndex((b) => b.classList.contains('active'));
          if (g.origIndex >= 0 && items[g.origIndex] && active !== g.origIndex) {
            items[g.origIndex].click(); done.push('selection');
          }
          const el = qa(w, '*').find((e) => keyOf(e) === g.scrollKey);
          if (el && g.scrollTop != null && el.scrollTop !== g.scrollTop) {
            el.scrollTop = g.scrollTop; done.push('scroll');
          }
          const options = q(w, '.game-ready-options');
          if (options && options.open !== g.optionsOpenBefore) {
            options.open = g.optionsOpenBefore; done.push('options');
          }
          window.__LQP_GAMES_ORIG = null;
          return done.length ? `games:${done.join('+')}` : null;
        },
      },
      mutations: {
        gameCatalog: (w) => detach(q(w, '.game-list-item small'), 'no game blurb'),
        stageIdentity: (w) => detach(q(w, '.game-stage-head h3'), 'no stage title'),
        // Lie rather than delete: a full bar over an empty list is the exact defect.
        sourceMaterial: (w) => {
          const sec = qa(w, '.game-coverage').find((s) => !s.classList.contains('game-seen'));
          return setAttr(sec && q(sec, '.game-coverage-bar i'), 'style',
            'transform: scaleX(1)', 'no coverage bar');
        },
        exposureTracking: (w) => setAttr(q(w, '.game-seen .game-coverage-bar i'), 'style',
          'transform: scaleX(1)', 'no exposure bar'),
        typingInput: (w) => stripAttr(q(w, '.game-launch-panel > .btn.primary'), 'type', 'no start control'),
        scoreHud: (w) => detach(q(w, '.game-launch-panel > .muted'), 'no session-length note'),
        roundHistory: (w) => detach(q(w, '.game-history h4'), 'no history heading'),
        materialScope: (w) => addClassAll(
          [qa(w, '.game-kana-picker .os-viz-row')[0]
            && qa(qa(w, '.game-kana-picker .os-viz-row')[0], 'button')
              .find((b) => !b.classList.contains('primary'))].filter(Boolean),
          'primary',
        ),
        levelSettings: (w) => detach(qa(w, '.game-stage-meta > span')[0], 'no level chip'),
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
          //
          // THE GROUPS ARE FOUND, NOT COUNTED — corrected 2026-09-02, after this row read
          // false on a correct rail. The old bar was `chips.length >= 6 && active === 2`,
          // and the 6 was one profile's data written into the instrument:
          // `LibraryView.tsx:1165/1175` maps `filterOptions.langs` and `.levels`, both
          // derived from what the library actually holds, so a library with three languages
          // and ONE level renders 3 + 2 = 5 chips and can never reach 6. Measured live:
          // `All | Japanese | Unknown | All | L7`.
          //
          // The structural fact is that each group is led by its own `All` chip, so the
          // boundaries are read off the DOM by matching the FIRST chip's own text (never the
          // English word — trap 4, the label is translated). Then the invariant is stated
          // per group instead of in aggregate: two groups, each offering `All` plus at least
          // one real value, each with exactly one active. That is strictly stronger than
          // `active === 2`, which two actives in ONE group and none in the other satisfies.
          id: 'inboxFilters',
          f: (w) => {
            const box = q(w, '.lib-inbox-filters');
            if (!box) return { ok: false, ev: 'no inbox filter rail' };
            const chips = qa(box, '.lib-folder-chip');
            const active = activeOf(chips, 'active');
            if (!chips.length) return { ok: false, ev: 'filter rail rendered no chips' };
            const allLabel = txt(chips[0]);
            const heads = chips.map((c, i) => (txt(c) === allLabel ? i : -1)).filter((i) => i >= 0);
            const groups = heads.map((start, n) => chips.slice(start, heads[n + 1] === undefined ? chips.length : heads[n + 1]));
            const sized = groups.filter((g) => g.length >= 2).length;
            const oneEach = groups.filter((g) => activeOf(g, 'active') === 1).length;
            return {
              ok: groups.length === 2 && sized === 2 && oneEach === 2 && active === 2,
              ev: `chips=${chips.length} active=${active} groups=${groups.length} `
                + `sizes=[${groups.map((g) => g.length).join(',')}] `
                + `activePerGroup=[${groups.map((g) => activeOf(g, 'active')).join(',')}]`,
            };
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
        // THIS ROW HAD NO CONTROL UNTIL 2026-09-02 — it was one of the four library rows the
        // mutation set never named, so its bar had never been falsified. Added in the same
        // commit that relaxed it, because a relaxed row with no control is a row that cannot
        // fail. It falsifies by making a SECOND chip active inside the FIRST group, which is
        // exactly the exclusivity loss the row exists to catch and is invisible to a bare
        // `active === 2` count when the other group loses its own.
        inboxFilters: (w) => {
          const chips = qa(w, '.lib-inbox-filters .lib-folder-chip');
          if (!chips.length) return { refused: 'no inbox filter rail' };
          const head = txt(chips[0]);
          const firstGroupEnd = chips.findIndex((c, i) => i > 0 && txt(c) === head);
          const group = chips.slice(0, firstGroupEnd < 0 ? chips.length : firstGroupEnd);
          const other = group.find((c) => !c.classList.contains('active'));
          if (!other) return { refused: 'first filter group has no inactive chip to falsify with' };
          return addClassAll([other], 'active');
        },
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
      // The VN library mounts inside this very root, so without this the browser
      // scores 2/7 whenever the library is up. See `findWin`.
      notSel: '.visual-novel-panel',
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
     * NOVELS — the paged-reader half of the shared reader host. Unlike manga, its
     * document is text and its contextual tools are the three ReadingCanvas sheets.
     * The drive exercises a reversible next/back pair and opens all three tools;
     * nothing writes to the book, bookmark store, translation cache or library.
     */
    novels: {
      titleRe: /Novels|Book|EPUB|小説|书籍|Книг/i,
      rootSel: '.novel-scroller',
      features: [
        {
          id: 'documentRender',
          f: (w) => {
            const doc = q(w, '[data-reading-role="document"]');
            const content = q(w, '.novel-content');
            const box = content ? content.getBoundingClientRect() : null;
            const chars = txt(content).length;
            return {
              ok: !!doc && !!box && box.width > 40 && box.height > 40 && chars > 0,
              ev: `content=${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none'} chars=${chars}`,
            };
          },
        },
        {
          id: 'pageTransport',
          f: (w) => {
            const seek = q(w, '.reader-seek');
            const prev = btnByText(w, /Prev|前|上一|Назад/i);
            const next = btnByText(w, /Next|次|下一|Вперёд/i);
            const g = window.__LQP_NOVEL_ORIG || {};
            const trip = g.transport || {};
            const moved = !!trip.before && !!trip.afterNext && trip.afterNext !== trip.before;
            const returned = moved && trip.afterBack === trip.before;
            return {
              ok: !!seek && !!prev && !!next && Number(seek.min) === 0
                && seek.max === trip.max && Number(seek.max) > Number(seek.min) && moved && returned,
              ev: `range=${seek ? `${seek.min}..${seek.max}` : 'none'} originalMax=${trip.max} trip=${JSON.stringify(trip.before)}->${JSON.stringify(trip.afterNext)}->${JSON.stringify(trip.afterBack)}`,
            };
          },
        },
        {
          /*
           * DRIVEN — and the passive version this replaces was an accident of where the
           * bookmark happened to sit. It asked whether the CURRENT page's first 240
           * characters contain one of the TOC labels, which is only true on a chapter's
           * opening page. Measured live on `悪の教典 02`: the TOC has **9** entries, at part
           * indices 5/30/50/81/149/160/161/163/165, over a book of ~166 parts, and the
           * reader sat at `p:7:0.0000` — between the first two. So the row could pass on 9
           * parts and failed on the other ~157: a working chapter select scored dead across
           * 95% of the book, and only a profile parked on a chapter head would ever see it
           * pass.
           *
           * There is nothing passive left to read, either, because `.chapter-select` is an
           * ACTION select rather than a state one: `NovelReader.tsx:3308-3311` pins
           * `value=""` and its `onChange` calls `goTo(Number(value), 0)`. Its own value
           * therefore never names the chapter you are in. So the drive jumps and this reads
           * the recorded landing. `.novel-content` is still read LIVE so `documentRender`'s
           * declared cascade still reaches this row.
           */
          id: 'chapterNavigation',
          f: (w) => {
            const select = q(w, '.chapter-select');
            const labels = select ? qa(select, 'option').slice(1).map(txt).filter(Boolean) : [];
            const content = q(w, '.novel-content');
            const j = (window.__LQP_NOVEL_ORIG || {}).chapter || {};
            return {
              ok: labels.length > 0 && !!content && j.landed === true && j.moved === true,
              ev: `chapters=${labels.length} jumpedTo=${JSON.stringify(j.jumpedTo || null)}`
                + ` landedOnIt=${j.landed} moved=${j.moved}`
                + ` seek=${j.seekBefore}->${j.seekAfterJump}->${j.seekAfterRestore}`,
            };
          },
        },
        ...['bookmarks', 'translate', 'reader-settings'].map((id) => ({
          id: `${id}Tool`,
          f: (w) => {
            const tool = q(w, `[data-reading-tool="${id}"]`);
            const trigger = novelToolTrigger(w, id);
            const body = tool ? q(tool, '.lq-reading-tool-body') : null;
            return {
              ok: !!trigger && trigger.getAttribute('aria-pressed') === 'true'
                && !!tool && !!body && tool.classList.contains('lq-liquid'),
              ev: `trigger=${!!trigger} tool=${!!tool} body=${!!body} placement=${tool ? tool.dataset.placement : 'none'} hidden=${tool ? tool.hidden : '?'}`,
            };
          },
        })),
        { id: 'canvasPlacement', f: (w) => canvasPlacement(w) },
        {
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
        openSection: (w) => {
          const content = q(w, '.novel-content');
          if (!content) return { refused: 'no EPUB/PDF open — open one from the Library first' };
          return { open: txt(q(w, '.reader-title')) || 'book' };
        },
        next: (w) => {
          const seek = q(w, '.reader-seek');
          const btn = btnByText(w, /Next|次|下一|Вперёд/i);
          if (!seek || !btn) return { refused: 'no next-page transport' };
          const g = novelState();
          g.transport = { before: novelPageSignature(w), max: seek.max };
          btn.click();
          return { before: g.transport.before };
        },
        back: (w) => {
          const seek = q(w, '.reader-seek');
          const btn = btnByText(w, /Prev|前|上一|Назад/i);
          const g = novelState();
          if (!seek || !btn || !g.transport) return { refused: 'next-page step did not establish a baseline' };
          g.transport.afterNext = novelPageSignature(w);
          btn.click();
          return { afterNext: g.transport.afterNext };
        },
        settle: (w) => {
          const seek = q(w, '.reader-seek');
          const g = novelState();
          if (!seek || !g.transport) return { refused: 'page transport did not run' };
          g.transport.afterBack = novelPageSignature(w);
          return { afterBack: g.transport.afterBack };
        },
        tool: (w, id) => {
          const btn = novelToolTrigger(w, id);
          if (!btn) return { refused: `no ${id} trigger` };
          const g = novelState();
          g.tools = g.tools || {};
          if (!(id in g.tools)) g.tools[id] = btn.getAttribute('aria-pressed') === 'true';
          if (btn.getAttribute('aria-pressed') !== 'true') btn.click();
          return { tool: id, wasOpen: g.tools[id] };
        },
        /*
         * The chapter jump, in three legs because `/eval` is synchronous and each leg needs
         * a React render before the next can read it.
         *
         * `chapterPrep` exists for one reason and it is not pacing: the jump WRITES the
         * user's reading position — `goTo` ends in `saveNow`, which calls
         * `window.api.setProgress(item.id, 'p:<part>:<fraction>')` (`NovelReader.tsx:731`).
         * So the pre-jump position has to be in hand BEFORE the jump or there is nothing to
         * restore to, and `listLibrary()` is a promise, which `/eval` cannot await.
         */
        chapterPrep: (w) => {
          const title = txt(q(w, '.reader-title'));
          if (!title) return { refused: 'no reader title to identify the open book' };
          const c = novelState().chapter || (novelState().chapter = {});
          c.title = title;
          if (c.progressWas === undefined) {
            c.lib = null;
            window.api.listLibrary().then(
              (rows) => { c.lib = rows; },
              (e) => { c.lib = { err: String(e) }; },
            );
          }
          return { title, alreadyCaptured: c.progressWas !== undefined };
        },
        chapter: (w) => {
          const select = q(w, '.chapter-select');
          const seek = q(w, '.reader-seek');
          if (!select || !seek) return { refused: 'no chapter select or seek' };
          const opts = qa(select, 'option').filter((o) => o.value !== '');
          if (!opts.length) return { refused: 'the book has no table of contents' };
          const c = novelState().chapter || (novelState().chapter = {});
          if (c.progressWas === undefined) {
            if (!Array.isArray(c.lib)) return { refused: 'library read has not resolved yet' };
            const hits = c.lib.filter((r) => r && r.title === c.title);
            if (hits.length !== 1) return { refused: `title matches ${hits.length} library rows, not 1` };
            c.itemId = hits[0].id;
            c.progressWas = hits[0].progress || null;
          }
          c.seekBefore = seek.value;
          c.sigBefore = novelPageSignature(w);
          // The option FARTHEST from where the reader sits. Taking option 0 blindly is a
          // no-op on a reader already parked at chapter one, and a no-op jump would score
          // `moved` false on a control that works perfectly.
          const nearStart = Number(seek.value) / Math.max(1, Number(seek.max)) < 0.5;
          const pick = nearStart ? opts[opts.length - 1] : opts[0];
          c.jumpedTo = txt(pick);
          pickSelect(select, pick.value);
          return { jumpedTo: c.jumpedTo, chapterIndex: pick.value, from: c.seekBefore };
        },
        chapterSettle: (w) => {
          const seek = q(w, '.reader-seek');
          const c = novelState().chapter;
          if (!seek || !c || !c.jumpedTo) return { refused: 'chapter step did not run' };
          const head = txt(q(w, '.novel-content')).slice(0, 240);
          c.landedHead = head.slice(0, 48);
          c.landed = head.includes(c.jumpedTo);
          c.seekAfterJump = seek.value;
          c.moved = novelPageSignature(w) !== c.sigBefore;
          // Put the VISIBLE reader back before anything else runs. This is the seek, which
          // is permille (`max=1000`) and measured coarser than a page — restoring 18 -> 18
          // returned a different page. The exact `p:<part>:<fraction>` restore is the undo's
          // job; this only stops the rest of the drive running from the wrong chapter.
          typeInto(seek, c.seekBefore);
          seek.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
          c.seekAfterRestore = seek.value;
          return {
            landed: c.landed, moved: c.moved, head: c.landedHead, seekBack: c.seekAfterRestore,
          };
        },
      },
      drive: ['openSection', 'next', 'back', 'settle', 'chapterPrep', 'chapter', 'chapterSettle',
        ['tool', 'bookmarks'], ['tool', 'translate'], ['tool', 'reader-settings']],
      undo: {
        novels: (w) => {
          const g = window.__LQP_NOVEL_ORIG;
          if (!g) return null;
          const done = [];
          Object.keys(g.tools || {}).forEach((id) => {
            const btn = novelToolTrigger(w, id);
            const open = btn && btn.getAttribute('aria-pressed') === 'true';
            if (btn && open !== g.tools[id]) { btn.click(); done.push(id); }
          });
          // THE ONLY EXACT RESTORE THIS SURFACE HAS. Everything else here is a click that
          // can be un-clicked; reading position is a number in the user's library row, the
          // jump overwrote it, and the seek slider cannot put it back — it is permille and
          // one permille of this book is more than one page. So write the captured
          // `p:<part>:<fraction>` back through the same call the reader itself uses.
          const c = g.chapter;
          if (c && c.itemId && c.progressWas) {
            window.api.setProgress(c.itemId, c.progressWas);
            done.push(`progress=${c.progressWas.location || JSON.stringify(c.progressWas)}`);
          }
          window.__LQP_NOVEL_ORIG = null;
          return done.length ? `novels:${done.join('+')}` : null;
        },
      },
      mutations: {
        documentRender: (w) => detach(q(w, '.novel-content'), 'no rendered book content'),
        pageTransport: (w) => setAttr(q(w, '.reader-seek'), 'max', '1', 'no book seek'),
        chapterNavigation: (w) => detach(q(w, '.chapter-select'), 'no chapter select'),
        bookmarksTool: (w) => detach(q(w, '[data-reading-tool="bookmarks"] .lq-reading-tool-body'), 'no bookmark tool'),
        presentationHonest: (w) => setAttr(
          q(w, LIQUID_BTN.reader),
          'aria-pressed',
          q(w, LIQUID_BTN.reader) && q(w, LIQUID_BTN.reader).getAttribute('aria-pressed') === 'true' ? 'false' : 'true',
          'no liquid control',
        ),
      },
      cascades: {
        documentRender: ['chapterNavigation'],
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
          /*
           * The page actually rendered, cross-checked against the seek's declared
           * position. A stage that renders page 1 while the seek says 7 is the
           * stale-detail defect in its manga form, and a count of images would miss it
           * entirely — there is exactly one `<img>` either way.
           *
           * THE COMMENT ABOVE IS OLDER THAN THE CROSS-CHECK, and for a while it was a
           * fact about this file rather than about the surface: the predicate asked only
           * `declared >= 1`, so it compared the seek to the number 1 and never to the
           * page on screen. It therefore passed the exact defect it names. Measured live
           * 2026-09-02 on a 17-page volume: seek reading `12`, stage rendering
           * `pages/0001.png` with `alt` "Page 1", `First page` still DISABLED — and the
           * row scored 7/7 in both presentations.
           *
           * The rendered page is read from the image's OWN identity: `alt` is
           * `t('manga.pageAlt', { n })` (MangaReader.tsx:1982/2010), so the numeral
           * survives all four locales, and the `pages/000N` basename is the fallback.
           * It is a MEMBERSHIP test, not equality, because the spread layout renders two
           * pages at once and the declared one only has to be among them.
           */
          id: 'pageRender',
          f: (w) => {
            const stage = q(w, '.manga-stage');
            const seek = q(w, '.reader-seek');
            const imgs = stage ? qa(stage, 'img') : [];
            const boxes = imgs.map((i) => i.getBoundingClientRect());
            const painted = boxes.filter((b) => b.width > 40 && b.height > 40);
            const rendered = mangaRenderedPages(w);
            const declared = seek ? Number(seek.value) : NaN;
            const agree = rendered.includes(declared);
            return {
              ok: painted.length > 0 && Number.isFinite(declared) && declared >= 1 && agree,
              ev: `img=${boxes[0] ? `${Math.round(boxes[0].width)}x${Math.round(boxes[0].height)}` : 'none'}`
                + ` painted=${painted.length}/${imgs.length} seekPage=${declared} of ${seek ? seek.max : '?'}`
                + ` rendered=[${rendered.join(',')}] agree=${agree}`,
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
        /*
         * COMMITS the jump, and the version this replaces did not. `.reader-seek` is a
         * SCRUBBER: `onChange` only sets `scrub`, a preview, and the page changes on
         * `onPointerUp` / `onKeyUp` (MangaReader.tsx:2069-2086). So `.value = n` plus
         * `input`/`change` wrote a number into a controlled input that React then ignored,
         * and this step returned that same number as `page` — the drive reporting its own
         * write back to itself. `typeInto` is the native-value-setter route (Trap 2) and
         * the `keyup` is the product's own commit, exactly as `novels.chapterSettle` does
         * it. Proven by the product's other route: clicking `Next page` DOES move the
         * stage, so the reader was never broken — the instrument was.
         */
        page: (w, n) => {
          const seek = q(w, '.reader-seek');
          if (!seek) return { refused: 'no page seek' };
          const g = mangaState();
          // Captured from the STAGE, not from the seek. `pageTransport`'s mutation sets
          // `max="1"`, which clamps the seek's value to 1 — so a baseline read off the
          // seek is silently rewritten by another mutation, and that cycle's undo then
          // compares 1 against 1, finds nothing to do, and leaves the reader where the
          // drive put it. The rendered page is immune to the clamp.
          if (g.page == null) g.page = String(mangaRenderedPages(w)[0] || seek.value);
          const max = Number(seek.max) || 1;
          // Clamped to the volume, so a shorter book refuses nothing and lands somewhere real.
          const want = String(Math.min(Math.max(Number(n) || 3, 1), max));
          const renderedBefore = mangaRenderedPages(w);
          typeInto(seek, want);
          seek.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
          return { page: seek.value, of: seek.max, from: g.page, renderedBefore };
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
            // Compared against the STAGE for the same reason the capture reads it.
            const now = String(mangaRenderedPages(w)[0] || (seek ? seek.value : ''));
            if (seek && now !== g.page) {
              // The step's commit route, for the same reason. Writing the value alone
              // restored nothing, and the old undo could report `page` as restored while
              // the reader stayed exactly where the drive had left it. It never showed,
              // because the old step had not moved it either.
              typeInto(seek, g.page);
              seek.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
              done.push(`page=${now}->${g.page}`);
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
      cascades: {
        // TRUE, and only visible once `pageRender` started cross-checking. Clamping the
        // seek to `max="1"` clamps its VALUE to 1 as well, so the transport stops
        // declaring the page the stage is showing — the disagreement `pageRender` exists
        // to catch is a real consequence of breaking the transport, not collateral. It is
        // declared here rather than engineered away: a row that cannot be made to fall by
        // any mutation is the other way this instrument goes wrong.
        pageTransport: ['pageRender'],
      },
    },

    /**
     * VISUAL NOVELS — the sixth L6 surface, and the first one that shares a window
     * and a TITLE with another app in this file. The panel does not open beside
     * Immersion; it REPLACES the browser inside Immersion's own `.fwin`, so
     * `titleRe` here is deliberately Immersion's (it is what `raise()` needs to
     * find the taskbar button) and `rootSel` is the only thing that says which of
     * the two is actually mounted. `findWin` was tightened for this — see there.
     *
     * Every row cross-checks two places that must agree, because presence scoring
     * on this surface is nearly free: the panel renders its whole workspace, forms
     * and all, from one selected entry, so "the control exists" is true of a
     * library that is showing the WRONG title's data.
     *
     * SAFETY, and it is why this spec drives nothing that writes: the library is
     * the user's real one. `select` clicks an entry (local state), `kind` picks a
     * capture kind (a form field), and the two lying mutations move a `<select>`
     * WITHOUT pressing the Save button beside it — verified live 2026-08-26, the
     * status editor is a pure form until `Save progress` is clicked. Nothing here
     * launches, adds, removes, analyses or exports.
     */
    vn: {
      titleRe: /Immersion|没入|イマー|浸入|Погруж/i,
      rootSel: '.visual-novel-panel',
      features: [
        {
          // The list itself, and the two ways it claims a selection. `aria-current`
          // is the accessible one and `.is-selected` is the painted one; a row that
          // is highlighted for the mouse and invisible to a screen reader is the
          // defect this cross-check exists for, and it is what `7e853346` fixed.
          id: 'libraryList',
          f: (w) => {
            const rows = qa(w, '.visual-novel-entry');
            const whole = rows.filter((r) => q(r, 'strong') && q(r, 'span')).length;
            const current = rows.filter((r) => r.getAttribute('aria-current') === 'true');
            const marked = rows.filter((r) => r.classList.contains('is-selected'));
            return {
              ok: rows.length > 0 && whole === rows.length
                && current.length === 1 && marked.length === current.length,
              ev: `entries=${rows.length} complete=${whole} ariaCurrent=${current.length} isSelected=${marked.length}`,
            };
          },
        },
        {
          // Stale detail, VN form. The workspace is rendered from ONE entry, so a
          // summary that names a different title than the highlighted row means the
          // whole right-hand column — capture, progress, routes, community — is
          // editing something the user did not pick. A count of panels sees nothing.
          id: 'selectedDetail',
          f: (w) => {
            const sel = qa(w, '.visual-novel-entry').find((r) => r.classList.contains('is-selected'));
            const rowTitle = sel ? txt(q(sel, 'strong')) : null;
            const head = txt(q(w, '.visual-novel-summary-title strong'));
            const actions = qa(w, '.visual-novel-summary-actions button').length;
            return {
              ok: !!rowTitle && rowTitle === head && actions >= 2,
              ev: `row="${rowTitle}" summary="${head}" summaryActions=${actions}`,
            };
          },
        },
        {
          // The capture composer, scored STRUCTURALLY on purpose: every other row in
          // this file that matched a button by its English text had to grow a
          // four-language regex, and these three labels are catalogue keys. Five
          // line kinds, both text areas and three actions is the composer; anything
          // less is a form that cannot produce a card.
          id: 'captureComposer',
          f: (w) => {
            const kind = q(w, '.visual-novel-capture select');
            const kinds = kind ? qa(kind, 'option').length : 0;
            const areas = qa(w, '.visual-novel-capture textarea').length;
            const actions = qa(w, '.visual-novel-capture-actions button').length;
            return {
              ok: kinds >= 5 && areas >= 2 && actions >= 3,
              ev: `lineKinds=${kinds} textareas=${areas} actions=${actions}`,
            };
          },
        },
        {
          // The analysis button NAMES its scope ("Analyze Entire visual novel"), so
          // the label and the select are one claim in two places. A button that says
          // one scope and runs another is unfalsifiable from the UI, which is why the
          // mutation below moves the select behind React's back rather than deleting it.
          id: 'analysisScope',
          f: (w) => {
            const sel = q(w, '.visual-novel-analysis-actions select');
            const btns = qa(w, '.visual-novel-analysis-actions button');
            const label = sel && sel.selectedOptions[0] ? txt(sel.selectedOptions[0]) : null;
            const primary = btns[0];
            const names = !!primary && !!label && txt(primary).indexOf(label) >= 0;
            return {
              ok: !!sel && qa(sel, 'option').length >= 4 && btns.length >= 3 && names,
              ev: `scopes=${sel ? qa(sel, 'option').length : 0} selected="${label}" primary="${primary ? txt(primary) : 'none'}" namesScope=${names}`,
            };
          },
        },
        {
          // Reading status is shown twice — as the editor's `<select>` and inside the
          // library row's meta line — and the editor is initialised from the saved
          // entry. They agree or the editor is showing state the library has not got.
          id: 'progressState',
          f: (w) => {
            const sel = q(w, '.visual-novel-progress select');
            const opt = sel && sel.selectedOptions[0] ? txt(sel.selectedOptions[0]) : null;
            const row = qa(w, '.visual-novel-entry').find((r) => r.classList.contains('is-selected'));
            const meta = row ? txt(q(row, 'span')) : '';
            return {
              ok: !!opt && meta.indexOf(opt) >= 0,
              ev: `editor="${opt}" libraryMeta="${meta}"`,
            };
          },
        },
        {
          // Reversibility: the library is a docked reading tool with a real toggle in
          // the panel head, and the toggle owes a boolean that agrees with whether the
          // tool is mounted. Same shape as Immersion's `railReversibility`.
          id: 'libraryReversibility',
          f: (w) => {
            const tg = qa(w, '.visual-novel-panel-tools button')[0];
            const pressed = tg ? tg.getAttribute('aria-pressed') : null;
            const open = !!q(w, '[data-reading-tool="library"]');
            return {
              ok: !!tg && (pressed === 'true' || pressed === 'false') && (pressed === 'true') === open,
              ev: `toggle=${!!tg} ariaPressed=${pressed} libraryMounted=${open}`,
            };
          },
        },
        { id: 'canvasPlacement', f: (w) => canvasPlacement(w) },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        // REFUSES on an empty library rather than adding one: an entry this harness
        // creates is a row in the user's own store, and `visual-novel:remove` is the
        // only way back out. Idempotent — it clicks only when nothing is selected.
        select: (w) => {
          const rows = qa(w, '.visual-novel-entry');
          if (!rows.length) return { refused: 'library is empty — add a title before scoring' };
          const g = vnState();
          const cur = rows.find((r) => r.classList.contains('is-selected'));
          if (g.selected == null) g.selected = cur ? txt(q(cur, 'strong')) : '';
          const want = cur || rows[0];
          if (!want.classList.contains('is-selected')) want.click();
          return { selected: txt(q(want, 'strong')), of: rows.length };
        },
        // The round trip's user state. The driver's generic `dirtyField` lands in the
        // add form's title input, which is chrome; this is state inside the workspace
        // the toggle actually re-renders.
        kind: (w, name) => {
          const sel = q(w, '.visual-novel-capture select');
          if (!sel) return { refused: 'no capture composer' };
          const want = String(name || 'narration');
          if (!qa(sel, 'option').some((o) => o.value === want)) {
            return { refused: `no "${want}" line kind — have ${qa(sel, 'option').map((o) => o.value).join(', ')}` };
          }
          const g = vnState();
          if (g.kind == null) g.kind = sel.value;
          pickSelect(sel, want);
          return { kind: sel.value, was: g.kind };
        },
      },
      drive: ['select', ['kind', 'narration']],
      mutations: {
        // `aria-current` only. `selectedDetail` and `progressState` deliberately
        // resolve the selected row through `.is-selected` instead, so this falls
        // exactly one row — the one whose whole content is that the two agree.
        libraryList: (w) => stripAttr(
          qa(w, '.visual-novel-entry').find((r) => r.getAttribute('aria-current') === 'true'),
          'aria-current',
          'no selected library row',
        ),
        selectedDetail: (w) => detach(q(w, '.visual-novel-summary-title strong'), 'no summary title'),
        captureComposer: (w) => detach(q(w, '.visual-novel-capture select'), 'no capture composer'),
        // A LIE, not a deletion. Moving `selectedIndex` without dispatching `change`
        // leaves React's label on the old scope, so the select and the button now
        // disagree — which is precisely what the row claims cannot happen. Deleting
        // the select would only prove the row notices a missing element.
        analysisScope: (w) => {
          const sel = q(w, '.visual-novel-analysis-actions select');
          if (!sel) return { refused: 'no analysis scope select' };
          if (qa(sel, 'option').length < 2) return { refused: 'only one scope offered' };
          const g = vnState();
          if (g.scopeIndex == null) g.scopeIndex = sel.selectedIndex;
          sel.selectedIndex = sel.selectedIndex === 0 ? 1 : 0;
          return { mutated: `scope now reads "${txt(sel.selectedOptions[0])}" while the button still names the old one` };
        },
        // The same shape one level up: React DOES hear this one, so the editor
        // honestly re-renders to a status the library row was never told about.
        // Verified live that nothing is saved until `Save progress` is pressed.
        progressState: (w) => {
          const sel = q(w, '.visual-novel-progress select');
          if (!sel) return { refused: 'no progress editor' };
          const g = vnState();
          if (g.status == null) g.status = sel.value;
          const other = qa(sel, 'option').map((o) => o.value).find((v) => v && v !== sel.value);
          if (!other) return { refused: 'only one reading status' };
          pickSelect(sel, other);
          return { mutated: `editor now says "${sel.value}" while the library row still says "${g.status}"` };
        },
        libraryReversibility: (w) => stripAttr(
          qa(w, '.visual-novel-panel-tools button')[0],
          'aria-pressed',
          'no library toggle',
        ),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
      undo: {
        vn: (w) => {
          const g = window.__LQP_VN_ORIG;
          if (!g) return null;
          const done = [];
          const kindSel = q(w, '.visual-novel-capture select');
          if (g.kind != null && kindSel && kindSel.value !== g.kind) { pickSelect(kindSel, g.kind); done.push('kind'); }
          const statusSel = q(w, '.visual-novel-progress select');
          if (g.status != null && statusSel && statusSel.value !== g.status) { pickSelect(statusSel, g.status); done.push('status'); }
          const scopeSel = q(w, '.visual-novel-analysis-actions select');
          if (g.scopeIndex != null && scopeSel && scopeSel.selectedIndex !== g.scopeIndex) {
            scopeSel.selectedIndex = g.scopeIndex;
            done.push('scope');
          }
          if (g.selected) {
            const back = qa(w, '.visual-novel-entry').find((r) => txt(q(r, 'strong')) === g.selected);
            if (back && !back.classList.contains('is-selected')) { back.click(); done.push('selection'); }
          }
          window.__LQP_VN_ORIG = null;
          return done.length ? `vn:${done.join('+')}` : null;
        },
      },
    },

    /**
     * FLASHCARDS — L7's first surface, and the first spec whose whole difficulty is that
     * the deck is REAL: 3,218 cards in two book groups, virtualized, behind a search box.
     *
     * Two things about this surface shape every row below.
     *
     * 1. THE DRIVER'S `dirtyField` LANDS IN THE SEARCH BOX AND EMPTIES THE APP. It takes the
     *    first visible text field, which here is `.flash-search-input`, and writes
     *    `lqp-roundtrip-食` into it. That matches nothing, so `filteredDeck` goes to 0, every
     *    group unmounts, and a spec that scored after it would read six rows false on a
     *    perfectly healthy deck — the instrument's own doing. `clearSearch` in the drive is
     *    the answer the runner explicitly sanctions ("the drive may overwrite the dirty
     *    value; snapshot A records whatever is really there and C has to match it"), and the
     *    round trip still carries real user state because `scroll` runs after it and
     *    `snapshot()` records offsets.
     *
     * 2. COUNTS ARE THE ONLY HONEST EVIDENCE HERE, so every row is an arithmetic agreement
     *    between two independently rendered numbers rather than a presence check. The deck
     *    rail says All=3,218; the group badges say 144 + 3,074; the tab says 3,218. Those
     *    come from three different expressions over the same array, and a filter that lies
     *    breaks the equation. `.flash-group-body-vlist` renders 16 rows for a 3,074-card
     *    group — presence would score that identically to a list that materialised all
     *    3,074 and froze the window.
     *
     * MUTATION INDEPENDENCE, which cost the most thought: `virtualizedList` and `cardRows`
     * both read the rendered rows, so detaching the VirtualList spacer would fail both and
     * prove neither. The spacer's height is therefore LIED about (`style` set to a short
     * fixed height) rather than removed — scrollHeight collapses, the rows stay, and exactly
     * one row falls. Same reason `folderRail` attacks the Unfiled chip's count while
     * `bookGroups` measures itself against the All chip.
     */
    /*
     * ANKI. The surface's whole job is to speak for a process this app does not own, so
     * every row here is a CROSS-CHECK between two regions that must agree, never a
     * presence check. The banner is the one thing a disconnected build still renders
     * cheerfully, so `connectionCounts` makes it prove its number against the deck list
     * it claims to have loaded; a stale or fabricated banner survives "is it there?" and
     * dies here. Added 2026-09-05: anki had no spec at all, which is why its cat6 cell
     * (and cat5's Q7/Q8/Q9, which MEASURE against the cat6 baseline) had never scored.
     */
    anki: {
      titleRe: /^Anki$|アンキ|Анки/i,
      rootSel: '.anki-view',
      features: [
        {
          // The banner's own deck count must equal the deck <select>'s option count.
          // Two independent renders of the same AnkiConnect reply; disagreement means one
          // of them is decorative.
          id: 'connectionCounts',
          f: (w) => {
            const banner = q(w, '.status-banner');
            if (!banner) return { ok: false, ev: 'no status banner' };
            const label = txt(banner);
            const m = /(\d+)\s*decks?/.exec(label);
            const sel = qa(w, 'select').filter((s) => s.options.length > 2)[0];
            const opts = sel ? sel.options.length : 0;
            const connected = /ok/.test(String(banner.className));
            return {
              ok: !!m && connected && opts > 0 && Number(m[1]) === opts,
              ev: `banner="${label.slice(0, 46)}" claimed=${m ? m[1] : 'none'} deckOptions=${opts} bannerOk=${connected}`,
            };
          },
        },
        {
          // The deck the app says it is bound to must be a deck the collection actually
          // offers, and must be the selected one. A binding to a deck that no longer
          // exists is the failure this catches.
          id: 'deckBinding',
          f: (w) => {
            const sel = qa(w, 'select').filter((s) => s.options.length > 2)[0];
            if (!sel) return { ok: false, ev: 'no deck select' };
            const value = sel.value;
            const known = Array.from(sel.options).some((o) => o.value === value);
            return {
              ok: !!value && known && sel.selectedIndex >= 0 && !sel.disabled,
              ev: `deck="${String(value).slice(0, 40)}" isKnownOption=${known} index=${sel.selectedIndex} operable=${!sel.disabled}`,
            };
          },
        },
        {
          // The note type named in the binding header and the note type the field-mapping
          // card claims to be editing must be the SAME string. They are rendered by
          // different regions from different state; a drift here means the mapping editor
          // is writing into fields of a note type the user is not bound to.
          id: 'noteTypeAgreement',
          f: (w) => {
            const name = txt(q(w, '.anki-note-type-name'));
            if (!name) return { ok: false, ev: 'no bound note type rendered' };
            const cards = qa(w, '.anki-card');
            const mapping = cards.filter((c) => /field mapping/i.test(txt(c).slice(0, 60)))[0];
            const body = mapping ? txt(mapping) : '';
            return {
              ok: !!mapping && body.indexOf(name) >= 0,
              ev: `bound="${name}" mappingCard=${mapping ? 'yes' : 'no'} namesIt=${body.indexOf(name) >= 0}`,
            };
          },
        },
        {
          // Every flush action card offers exactly one action, and while the banner reads
          // connected none of them is disabled. A card that renders its pitch and then
          // hands back a dead button is the "honest surface, dead control" defect.
          id: 'actionCards',
          f: (w) => {
            const flush = qa(w, '.anki-card-flush');
            if (!flush.length) return { ok: false, ev: 'no action cards' };
            const connected = /ok/.test(String((q(w, '.status-banner') || {}).className || ''));
            const counts = flush.map((c) => qa(c, 'button').length);
            const dead = flush.filter((c) => qa(c, 'button').some((b) => b.disabled)).length;
            return {
              ok: counts.every((n) => n === 1) && (!connected || dead === 0),
              ev: `cards=${flush.length} buttonsPerCard=${counts.join(',')} disabledWhileConnected=${dead} connected=${connected}`,
            };
          },
        },
      ],
      /*
       * Each mutation LIES rather than deletes, for the reason `setAttr`'s comment gives:
       * detaching the deck select would fall `connectionCounts` and `deckBinding` together
       * and prove neither. Note `connectionCounts` drops the banner's ok class, which
       * `actionCards` also reads — deliberately harmless there, because with the banner not
       * claiming a connection a disabled action is honest, so that row still passes.
       */
      mutations: {
        connectionCounts: (w) => {
          const banner = q(w, '.status-banner');
          if (!banner) return { refused: 'no status banner' };
          return removeClassAll([banner], 'ok', 'banner was not in the ok state');
        },
        deckBinding: (w) => {
          const sel = qa(w, 'select').filter((s) => s.options.length > 2)[0];
          return setAttr(sel, 'disabled', 'true', 'no deck select');
        },
        noteTypeAgreement: (w) => detach(q(w, '.anki-note-type-name'), 'no bound note type'),
        actionCards: (w) => {
          const btn = qa(w, '.anki-card-flush button')[0];
          return setAttr(btn, 'disabled', 'true', 'no action-card button');
        },
      },
    },

    flashcards: {
      titleRe: /Flashcards|フラッシュカード|闪卡|Карточк/i,
      rootSel: '.flash-view',
      features: [
        {
          // Exactly one overview tab is active, and the active one carries a real count in
          // its own label. Two actives is the state the CSS cannot express and the user
          // reads as "both views are open".
          id: 'deckTabs',
          f: (w) => {
            const tabs = qa(w, '.flash-tabs .flash-tab').filter((b) => !b.closest('.epub-mining-mode-tabs'));
            const active = tabs.filter((b) => b.classList.contains('active'));
            const n = active[0] ? txt(active[0]).replace(/[^\d]/g, '') : '';
            return {
              ok: tabs.length >= 2 && active.length === 1 && n.length > 0,
              ev: `tabs=${tabs.length} active=${active.length} activeCount=${n || 'none'}`,
            };
          },
        },
        {
          // The rail PARTITIONS the deck: All must equal Unfiled plus every named folder.
          // A chip whose count is decorative passes a presence check and fails this one.
          id: 'folderRail',
          f: (w) => {
            const chips = folderChips(w).filter((c) => q(c, '.lib-chip-count'));
            if (chips.length < 2) return { ok: false, ev: `only ${chips.length} counted chips` };
            const all = Number(chipCount(chips[0]));
            const rest = chips.slice(1).reduce((s, c) => s + Number(chipCount(c) || 0), 0);
            const active = folderChips(w).filter((c) => c.classList.contains('active')).length;
            return {
              ok: Number.isFinite(all) && all === rest && active === 1,
              ev: `all=${all} unfiled+folders=${rest} activeChips=${active} chips=${chips.length}`,
            };
          },
        },
        {
          // Every group badge added up is the whole filtered deck. When a search is running
          // the surface publishes that number itself in `.flash-search-count`, so the row
          // checks against whichever denominator is actually on screen — the same equation
          // either way, never a branch that stops asking.
          id: 'bookGroups',
          f: (w) => {
            const groups = qa(w, '.flash-group');
            if (!groups.length) return { ok: false, ev: 'no book groups rendered' };
            const sum = groups.reduce((s, g) => s + Number(txt(q(g, '.flash-group-count')).replace(/[^\d]/g, '') || 0), 0);
            const searchCount = q(w, '.flash-search-count');
            const expect = searchCount
              ? Number(txt(searchCount).replace(/[^\d]/g, ''))
              : Number(chipCount(folderChips(w)[0]));
            const titled = groups.filter((g) => txt(q(g, '.flash-group-title')).length > 0).length;
            return {
              ok: sum === expect && titled === groups.length,
              ev: `groups=${groups.length} badgeSum=${sum} expected=${expect} titled=${titled} basis=${searchCount ? 'search count' : 'All chip'}`,
            };
          },
        },
        {
          // The row this surface exists to earn. A 3,074-card group renders a couple of
          // dozen rows over a scroll range that still spans the WHOLE deck.
          //
          // "A tall scroll range" is not the bar and the first version of this row said it
          // was: `span > clientHeight` measured 1,524 against a 420px pane with the spacer
          // deliberately shortened to 24px, so the mutation flipped nothing and the control
          // read `exactlyOwnRow: false`. The absolutely-positioned window of rows keeps
          // overflowing whatever the spacer says, and any list of a few screens passes.
          //
          // The real contract is arithmetic: scroll range = declared cards x row pitch.
          // Pitch is measured from two consecutive rendered rows rather than read from
          // `CARD_ROW_HEIGHT`, so the row scores the DOM and not the constant.
          //
          // AND IT SCORES EVERY EXPANDED BODY, not the tallest one. The second version
          // picked `sort(scrollHeight)[0]`, so shortening the 3,074-card spacer to 24px
          // dropped it below the untouched 144-card group and the row happily measured THAT
          // one instead: ev read `declared=144 ratio=1.001`, reachable stayed true, and the
          // control read `exactlyOwnRow: false` a second time. A term the plant can move out
          // from under is not the term being scored. Selecting nothing removes the class.
          //
          // SIZE COMES FROM `aria-setsize`, NOT the header badge. Reading the badge made this
          // row share an element with `bookGroups`, so detaching one count failed both and
          // proved neither. `VirtualList` publishes the collection's true size on every item
          // for the accessibility tree, which is an independent rendering of the same number
          // — and cross-checking the declared set size against the painted scroll range is a
          // better question than re-reading the badge two rows already agree about.
          id: 'virtualizedList',
          f: (w) => {
            const bodies = qa(w, '.flash-group-body-vlist');
            if (!bodies.length) return { ok: false, ev: 'no expanded group body' };
            const read = bodies.map((el) => {
              const sized = q(el, '[aria-setsize]');
              const declared = Number((sized && sized.getAttribute('aria-setsize')) || 0);
              const rows = qa(el, '.flash-row');
              const pitch = rows.length >= 2
                ? Math.round(rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top)
                : 0;
              const expect = declared * pitch;
              return {
                declared,
                rendered: rows.length,
                pitch,
                sh: el.scrollHeight,
                expect,
                ratio: expect > 0 ? el.scrollHeight / expect : 0,
              };
            });
            // THE WINDOW IS A CAP, NOT A RATIO — corrected 2026-09-02 after this row read
            // false on a correct surface. The old term was
            // `expect > clientHeight ? declared > rendered : true`, which demands that ANY
            // group taller than its pane render fewer rows than it declares. A 5-card group
            // is 540px in a 420px pane, so it qualified — and `VirtualList` still rendered
            // all 5, because its window is derived from the VIEWPORT, not from the
            // collection: measured live, 420px pane / 108px pitch, rendered was 5, 5, 7, 16,
            // 16 against declared 5, 5, 7, 144, 3074. That is `min(declared, 16)` exactly.
            // Rendering a 7-item collection whole is what a windowing list SHOULD do.
            //
            // What virtualization actually promises is that the rendered count stops growing
            // while the declared count does not, so the cap is read off the DOM and then has
            // to be DEMONSTRATED: some collection must exceed it. Without that clause a desk
            // where every group is tiny would score 10 for a list that renders everything —
            // "renders it all" and "windows correctly" are the same measurement until one
            // collection is bigger than the window.
            const cap = Math.max(...read.map((r) => r.rendered));
            const maxDeclared = Math.max(...read.map((r) => r.declared));
            const ceilingProven = cap < maxDeclared;
            const good = read.filter((r) => r.pitch > 0
              && r.ratio >= 0.9 && r.ratio <= 1.1
              && r.rendered === Math.min(r.declared, cap));
            return {
              ok: ceilingProven && good.length === read.length,
              ev: `cap=${cap} maxDeclared=${maxDeclared} ceilingProven=${ceilingProven} | `
                + read.map((r) => `${r.declared}cards/${r.rendered}rendered pitch=${r.pitch} sh=${r.sh} expected=${r.expect} ratio=${r.ratio.toFixed(3)}`).join(' | '),
            };
          },
        },
        {
          // Content honesty per rendered row: a word, a meaning that is never blank (the
          // component falls back to an em dash rather than nothing), and its own pair of
          // file/remove controls — the reverse path every added card needs.
          id: 'cardRows',
          f: (w) => {
            const rows = qa(w, '.flash-group-body-vlist .flash-row');
            if (!rows.length) return { ok: false, ev: 'no card rows rendered' };
            const worded = rows.filter((r) => txt(q(r, '.flash-row-word')).length > 0).length;
            const meant = rows.filter((r) => txt(q(r, '.flash-row-meaning')).length > 0).length;
            const removable = rows.filter((r) => q(r, '.flash-row-actions .flash-row-x')).length;
            return {
              ok: worded === rows.length && meant === rows.length && removable === rows.length,
              ev: `rows=${rows.length} worded=${worded} meaning=${meant} removable=${removable}`,
            };
          },
        },
        {
          // The deck strip is the surface's own summary of recent mining. Empty is allowed
          // and must SAY so; what is not allowed is a strip of cards with nothing in them.
          id: 'deckStrip',
          f: (w) => {
            const section = q(w, '.flash-strip-section');
            if (!section) return { ok: false, ev: 'no deck strip section' };
            const cards = qa(section, '.flash-strip-card');
            if (!cards.length) {
              return { ok: !!q(section, '.flash-strip-empty'), ev: 'strip empty — honest empty state required' };
            }
            const worded = cards.filter((c) => txt(q(c, '.flash-strip-word')).length > 0).length;
            const sourced = cards.filter((c) => q(c, '.flash-strip-meaning') || q(c, '.flash-strip-reading')).length;
            return {
              ok: worded === cards.length && sourced === cards.length,
              ev: `stripCards=${cards.length} worded=${worded} withReadingOrMeaning=${sourced}`,
            };
          },
        },
        {
          // Reversibility, per group: the disclosure's declared state and the body it
          // controls must agree. A header that says expanded over an unmounted list is the
          // "enable with no working disable" defect in its collapse form.
          id: 'groupCollapse',
          f: (w) => {
            const groups = qa(w, '.flash-group');
            if (!groups.length) return { ok: false, ev: 'no book groups rendered' };
            const rows = groups.map((g) => {
              const tg = q(g, '.flash-group-head-toggle');
              const declared = tg ? tg.getAttribute('aria-expanded') : null;
              const mounted = !!q(g, '.flash-group-body');
              return { declared, agrees: (declared === 'true') === mounted };
            });
            const agree = rows.filter((r) => r.agrees).length;
            const declared = rows.filter((r) => r.declared === 'true' || r.declared === 'false').length;
            return {
              ok: agree === groups.length && declared === groups.length,
              ev: `groups=${groups.length} ariaExpandedPresent=${declared} agreesWithMountedBody=${agree}`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        openDecks: (w) => {
          const tab = qa(w, '.flash-tabs .flash-tab').filter((b) => !b.closest('.epub-mining-mode-tabs'))[0];
          if (!tab) return { refused: 'no overview tabs' };
          tab.click();
          return { clicked: txt(tab) };
        },
        // Exercises the filter for real and records the number it produced. Paired with
        // `clearSearch` in the drive so the sequence is idempotent across the driver's
        // per-mutation re-runs and leaves the deck whole for `check()`.
        search: (w, query) => {
          const el = q(w, '.flash-search-input');
          if (!el) return { refused: 'no search field' };
          typeInto(el, String(query == null ? '' : query));
          return { query: el.value, groups: qa(w, '.flash-group').length };
        },
        clearSearch: (w) => {
          const el = q(w, '.flash-search-input');
          if (!el) return { refused: 'no search field' };
          typeInto(el, '');
          return { cleared: el.value === '', groups: qa(w, '.flash-group').length };
        },
        toggleGroup: (w, index) => {
          const tg = qa(w, '.flash-group-head-toggle')[Number(index) || 0];
          if (!tg) return { refused: 'no group headers' };
          tg.click();
          return { wasExpanded: tg.getAttribute('aria-expanded') };
        },
        // The round trip's real user state: this surface's editable field is the search box
        // and the drive deliberately leaves it empty, so scroll is what a bad toggle can
        // lose. Recorded once so `undo` puts the user's list back where they left it.
        scroll: (w, px) => {
          const el = scroller(w);
          if (!el) return { refused: 'nothing scrollable — the deck fits its pane' };
          const g = flashState();
          if (g.scrollKey == null) { g.scrollKey = keyOf(el); g.scrollTop = el.scrollTop; }
          el.scrollTop = Number(px) || 240;
          return { scroller: keyOf(el), top: el.scrollTop, range: el.scrollHeight - el.clientHeight };
        },
      },
      drive: ['openDecks', ['search', 'の'], 'clearSearch', ['scroll', '240']],
      undo: {
        flashcards: (w) => {
          const g = window.__LQP_FLASH_ORIG;
          if (!g) return null;
          const done = [];
          const el = q(w, '.flash-search-input');
          if (el && el.value !== '') { typeInto(el, ''); done.push('search'); }
          if (g.scrollKey != null) {
            const back = qa(w, '*').find((e) => keyOf(e) === g.scrollKey);
            if (back && back.scrollTop !== g.scrollTop) { back.scrollTop = g.scrollTop; done.push('scroll'); }
          }
          window.__LQP_FLASH_ORIG = null;
          return done.length ? `flashcards:${done.join('+')}` : null;
        },
      },
      mutations: {
        // Two actives, which the row's "exactly one" clause is entirely about. The rail and
        // the groups read neither tab, so this falls alone.
        deckTabs: (w) => {
          const tabs = qa(w, '.flash-tabs .flash-tab').filter((b) => !b.closest('.epub-mining-mode-tabs'));
          const other = tabs.find((b) => !b.classList.contains('active'));
          if (!other) return { refused: 'no inactive tab to falsify with' };
          return addClassAll([other], 'active');
        },
        // The UNFILED chip's count, never All's — `bookGroups` measures itself against All.
        folderRail: (w) => detach(q(w, '.lib-folders .lib-folder-chip:nth-of-type(2) .lib-chip-count'), 'no unfiled chip count'),
        bookGroups: (w) => detach(q(w, '.flash-group .flash-group-count'), 'no group count badge'),
        // A LIE about the spacer's height, not a deletion. Detaching it takes the rendered
        // rows with it and `cardRows` falls too, which proves neither row; shortening it
        // collapses the scroll range while every row stays exactly where it was.
        virtualizedList: (w) => {
          const el = qa(w, '.flash-group-body-vlist').sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
          const spacer = el && el.firstElementChild;
          if (!spacer) return { refused: 'no virtual list spacer' };
          return setAttr(spacer, 'style', 'height: 24px; position: relative;', 'no virtual list spacer');
        },
        cardRows: (w) => detach(q(w, '.flash-group-body-vlist .flash-row .flash-row-word'), 'no card rows'),
        deckStrip: (w) => detach(q(w, '.flash-strip-card .flash-strip-word'), 'no strip cards'),
        groupCollapse: (w) => setAttr(
          qa(w, '.flash-group-head-toggle').find((t) => t.getAttribute('aria-expanded') === 'true'),
          'aria-expanded',
          'false',
          'no expanded group header',
        ),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    // Music reuses the same category-6 engine as every prior surface. Its drive changes
    // only filter/sort/import drafts; playback and local files are observed, never mutated.
    music: {
      titleRe: /Music|音楽|音乐|Музык/i,
      rootSel: '.mc-music-layout',
      features: [
        { id: 'libraryRows', f: (w) => {
          const rows = qa(w, '.music-song');
          const complete = rows.filter((r) => q(r, '.music-song-title') && r.title).length;
          return { ok: rows.length > 0 && complete === rows.length, ev: `rows=${rows.length} complete=${complete}` };
        } },
        { id: 'librarySearch', f: (w) => {
          const g = musicState(); const input = q(w, '.music-search input');
          const rows = qa(w, '.music-song').length;
          return { ok: !!input && g.before > 0 && g.narrowed === 0 && rows === g.before,
            ev: `input=${!!input} before=${g.before} narrowed=${g.narrowed} restored=${rows}` };
        } },
        { id: 'sortOrder', f: (w) => {
          const s = q(w, '.mc-music-sort select');
          const titles = qa(w, '.music-song-title').map(txt);
          const ordered = JSON.stringify(titles) === JSON.stringify(titles.slice().sort((a, b) => a.localeCompare(b)));
          return { ok: !!s && s.value === 'title' && titles.length > 1 && ordered,
            ev: `sort=${s ? s.value : 'absent'} titles=${titles.length} ordered=${ordered}` };
        } },
        { id: 'playerSelection', f: (w) => {
          const active = qa(w, '.music-song.active');
          const selected = active[0] && txt(q(active[0], '.music-song-title'));
          const now = txt(q(w, '.mc-album-copy h2'));
          return { ok: active.length === 1 && !!selected && selected === now,
            ev: `active=${active.length} selected="${selected || ''}" now="${now}"` };
        } },
        /*
         * The row's question is unchanged — can playback be driven from this window:
         * an enabled play control, other enabled transport controls, and a seek that is
         * a real range with a duration. Only the elements it resolves on moved. The
         * Media Center used to render TWO complete transports, the page's
         * `.music-controls` and the shell's `.mc-playerbar`; the duplicate was deleted
         * and this row addressed the deleted one. `like` is a new row, not a relaxation:
         * Like was the single capability the page transport had that the bar lacked, so
         * it is asserted explicitly rather than assumed to have survived.
         */
        { id: 'transport', f: (w) => {
          const controls = qa(w, '.mc-player-transport button:not(:disabled)'); const play = q(w, '.mc-player-play');
          const seek = q(w, '.mc-player-seek');
          return { ok: !!play && !play.disabled && controls.length > 0 && !!seek && !seek.disabled && Number(seek.max) > 0,
            ev: `play=${!!play && !play.disabled} enabled=${controls.length} seek=${!!seek && !seek.disabled} max=${seek ? seek.max : 'absent'}` };
        } },
        { id: 'like', f: (w) => {
          const like = qa(w, '.mc-player-like')[0];
          return { ok: !!like && !like.disabled && like.getAttribute('aria-pressed') !== null,
            ev: `like=${!!like} enabled=${!!like && !like.disabled} pressed=${like ? like.getAttribute('aria-pressed') : 'absent'}` };
        } },
        { id: 'lyricsRecovery', f: (w) => {
          const lines = qa(w, '.music-line-text'); const hint = q(w, '.music-hint');
          const recovery = hint ? qa(hint, '.music-hint-btns button:not(:disabled)').length : 0;
          const ok = lines.length > 0 ? !!q(w, '.music-cue-nav') : !!hint && !!q(hint, 'p') && recovery >= 2;
          return { ok, ev: `lines=${lines.length} hint=${!!hint} recovery=${recovery}` };
        } },
        { id: 'queueMirror', f: (w) => {
          const songs = qa(w, '.music-song'); const queue = qa(w, '.mc-track-queue > button');
          return { ok: songs.length > 0 && queue.length === songs.length
              && activeOf(songs, 'active') === 1 && activeOf(queue, 'is-active') === 1,
            ev: `songs=${songs.length} queue=${queue.length} active=${activeOf(songs, 'active')}/${activeOf(queue, 'is-active')}` };
        } },
        { id: 'youtubeDraft', f: (w) => {
          const g = musicState(); const input = q(w, '.music-yt-input'); const action = q(w, '.music-yt button');
          return { ok: !!input && input.value === g.youtubeTest && !!action && !action.disabled,
            ev: `draft=${!!input && input.value === g.youtubeTest} actionEnabled=${!!action && !action.disabled}` };
        } },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        /*
         * FIVE ROWS HAD NO SUBJECT UNTIL 2026-09-02. `playerSelection`, `transport`, `like`,
         * `lyricsRecovery` and `queueMirror` all read the PLAYER, and the drive never put a
         * track in it — so on a library with two real songs the surface scored 5/10 in both
         * presentations and the five read as missing features. They are not missing; there
         * was nothing selected. Measured on the same window one click later:
         * `now="e2e-audio-ja"`, active 1, queue active 1, seek max 0 -> 90, like present and
         * `aria-pressed=false`, hint with 2 recovery actions.
         *
         * This goes FIRST in the drive, because the search step narrows the list to nothing
         * and a pick has to happen while there is still something to pick.
         *
         * Clicking a song is `play(s)` (MusicContent.tsx:404), so this STARTS PLAYBACK in
         * the user's real profile. That is the product's own route and there is no
         * select-without-playing affordance to use instead, so the step takes it and the
         * undo pauses it again. What the undo cannot take back is the selection itself:
         * "now playing" is ordinary product state, it is disclosed rather than pretended
         * away, and the step refuses instead of picking a second time if one is already
         * selected.
         */
        pick: (w) => {
          const g = musicState();
          const songs = qa(w, '.music-song');
          // THE QUEUE IS THE ROUTE THE SEARCH CANNOT TAKE AWAY. The driver dirties the first
          // visible text field before it drives — deliberately, so the round trip has real
          // state to lose — and on this surface that field is the music search, which filters
          // the library list to nothing. Measured: typing the mark leaves `.music-song` 0 and
          // `.mc-track-queue > button` 2. So the first attempt at this step refused "no songs
          // in the library to select" on a library holding two, and the five player rows
          // stayed dark for the same reason as before, one layer down.
          //
          // The queue row is the same action, not a workaround: `MediaCenterView.tsx:1250`
          // is `onClick={() => void state.play(item)}`, exactly what the library row calls.
          const rows = songs.length ? songs : qa(w, '.mc-track-queue > button');
          const via = songs.length ? 'library' : 'queue';
          const titleOf = (el) => txt(q(el, '.music-song-title') || q(el, 'strong') || el);
          if (!rows.length) return { refused: 'neither the library list nor the queue offers a track' };
          if (g.picked == null) {
            const was = rows.filter((s) => s.classList.contains('active') || s.classList.contains('is-active'))[0];
            g.picked = was ? titleOf(was) : '';
            g.wasSelected = !!was;
          }
          if (g.wasSelected) return { alreadySelected: g.picked, via };
          const target = rows[0];
          const title = titleOf(target);
          target.click();
          return { picked: title, via, wasSelected: false };
        },
        searchNarrow: (w) => {
          const g = musicState(); const input = q(w, '.music-search input');
          if (!input) return { refused: 'no music search' };
          if (g.search == null) { g.search = input.value; g.before = qa(w, '.mc-track-queue > button').length; }
          typeInto(input, '__lqp_no_song__'); return { before: g.before };
        },
        searchRestore: (w) => {
          const g = musicState(); const input = q(w, '.music-search input');
          if (!input || g.search == null) return { refused: 'search original not captured' };
          g.narrowed = qa(w, '.music-song').length; typeInto(input, g.search); return { narrowed: g.narrowed };
        },
        sort: (w) => {
          const g = musicState(); const s = q(w, '.mc-music-sort select');
          if (!s) return { refused: 'no music sort' };
          if (g.sort == null) { g.sort = s.value; g.sortStorage = localStorage.getItem('jp-music-sort'); }
          pickSelect(s, 'title'); return { was: g.sort, now: s.value };
        },
        youtube: (w) => {
          const g = musicState(); const input = q(w, '.music-yt-input');
          if (!input) return { refused: 'no YouTube import field' };
          if (g.youtube == null) g.youtube = input.value;
          g.youtubeTest = 'https://youtu.be/aaaaaaaaaaa'; typeInto(input, g.youtubeTest); return { drafted: true };
        },
      },
      drive: ['pick', 'searchNarrow', 'searchRestore', 'sort', 'youtube'],
      undo: { music: (w) => {
        const g = window.__LQP_MUSIC_ORIG; if (!g) return null;
        const done = []; const search = q(w, '.music-search input'); const sort = q(w, '.mc-music-sort select');
        const youtube = q(w, '.music-yt-input');
        // Silence what the pick started. The control reads its state from its own label,
        // NOT from `aria-pressed` (absent here) and not from an `<audio>` element (this
        // player has none — 0 media elements while the seek was advancing, so it is Web
        // Audio). A label test is the only honest read available.
        if (g.wasSelected === false) {
          const play = q(w, '.mc-player-play');
          const label = play ? (play.getAttribute('aria-label') || play.title || txt(play)) : '';
          if (/paus/i.test(label)) { play.click(); done.push('paused'); }
        }
        if (search && g.search != null && search.value !== g.search) { typeInto(search, g.search); done.push('search'); }
        if (sort && g.sort != null && sort.value !== g.sort) { pickSelect(sort, g.sort); done.push('sort'); }
        if (youtube && g.youtube != null && youtube.value !== g.youtube) { typeInto(youtube, g.youtube); done.push('youtube'); }
        setTimeout(() => { if (g.sortStorage == null) localStorage.removeItem('jp-music-sort');
          else localStorage.setItem('jp-music-sort', g.sortStorage); }, 0);
        window.__LQP_MUSIC_ORIG = null; return done.length ? `music:${done.join('+')}` : null;
      } },
      mutations: {
        libraryRows: (w) => stripAttr(q(w, '.music-song'), 'title', 'no song rows'),
        librarySearch: (w) => detach(q(w, '.music-search input'), 'no music search'),
        sortOrder: (w) => detach(q(w, '.mc-music-sort select'), 'no music sort'),
        playerSelection: (w) => detach(q(w, '.mc-album-copy h2'), 'no now-playing title'),
        transport: (w) => detach(q(w, '.mc-player-play'), 'no play control'),
        like: (w) => stripAttr(q(w, '.mc-player-like'), 'aria-pressed', 'no like control'),
        lyricsRecovery: (w) => detach(q(w, '.music-hint p, .music-line-text'), 'no lyric state'),
        queueMirror: (w) => detach(q(w, '.mc-track-queue > button'), 'no queue rows'),
        youtubeDraft: (w) => detach(q(w, '.music-yt button'), 'no YouTube action'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /*
     * L9's first RULE C surface — the Media Center's VIDEO tab, the densest presentable
     * window in `CENSUS.md`. It shares a `.fwin` and a title bar with `music`, so it needs
     * `notSel` for the same reason `vn` does: the Media Center is ONE window whose page
     * swaps, and a title-only match on a drifting tab scores the tab that happens to be
     * mounted. `rootSel: '.mc-video-page'` plus `notSel: '.mc-music-layout'` makes the
     * identity exact, and `navReach` then asserts the drift is not happening rather than
     * assuming it (L9 handoff trap 1: HMR resets the tab and every harness scores whatever
     * it lands on).
     *
     * Every row is a CROSS-CHECK between two independently rendered places, because this
     * surface's real failure mode is not a missing button — it is two renderings of one
     * state disagreeing (`upNextShelf` guards exactly the "relocated, not duplicated"
     * property that `04e51992` established, and `inspectorHonesty` guards the half-loaded
     * inspector).
     */
    /**
     * The media workspace overlay — `host: 'workspace'`, the FOURTH Liquid host, added
     * 2026-09-02 together with the resolver branch that finds it. It exists as a spec for
     * one reason: a resolver arm with no spec is a route with no consumer, and this repo
     * has already shipped one of those.
     *
     * `rootSel` is `.seanime-host-body` rather than `.study-lib` deliberately. The
     * readiness pane is one of three views and unmounts when the segment moves to Library,
     * so keying identity on it would make the host itself vanish from the harness whenever
     * the user is watching something — a refusal that describes the probe, not the surface.
     * The body is always mounted; the rows below refuse for themselves when their own view
     * is not up, which is the honest split.
     *
     * BOTH ROWS ARE CROSS-CHECKS between two independently rendered places, because the
     * failure this pane can actually have is not a missing button — it is a count that
     * disagrees with the list it labels. On an 80-file library that is the difference
     * between "Ready 1" meaning something and being decoration.
     */
    mediaWorkspace: {
      titleRe: /Media workspace|メディア|媒体|Медиа/i,
      rootSel: '.seanime-host-body',
      features: [
        {
          // The six category filters, scored against the list they claim to describe.
          // The pressed filter's own trailing number must equal the rendered row count —
          // a filter that says 79 over a list of 3 is the dishonest state, and it is
          // reachable here because the count and the list come from different renders.
          id: 'readinessFilters',
          f: (w) => {
            const bar = q(w, '.study-lib-filters');
            if (!bar) return { ok: null, na: 'readiness view is not the mounted view', ev: 'no .study-lib-filters' };
            const btns = qa(bar, 'button');
            const pressed = btns.filter((b) => b.getAttribute('aria-pressed') === 'true');
            const rows = qa(w, '.study-lib-row').length;
            const claimed = pressed.length === 1
              ? Number((txt(pressed[0]).match(/(\d+)\s*$/) || [])[1])
              : NaN;
            return {
              ok: btns.length >= 6 && pressed.length === 1 && claimed === rows,
              ev: `filters=${btns.length} pressed=${pressed.length} claims=${claimed} rows=${rows}`,
            };
          },
        },
        {
          // Every listed file offers its own way in, and none of them is a dead control.
          // `opens >= rows` rather than `===` is measured, not sloppy: a row can carry
          // more than one entry action (79 rows rendered 123 on 2026-09-02), so equality
          // would score a richer row as a defect.
          id: 'readyOpen',
          f: (w) => {
            const rows = qa(w, '.study-lib-row');
            if (!rows.length) return { ok: null, na: 'readiness view is not the mounted view', ev: 'no .study-lib-row' };
            const opens = qa(w, '.study-lib-open');
            const covered = rows.filter((r) => q(r, '.study-lib-open')).length;
            const live = opens.filter((b) => !b.disabled).length;
            return {
              ok: covered === rows.length && opens.length >= rows.length && live === opens.length,
              ev: `rows=${rows.length} covered=${covered} opens=${opens.length} enabled=${live}`,
            };
          },
        },
      ],
      mutations: {
        // Each detaches exactly one node and must drop exactly its own row. Both undo
        // through the shared `restore()` placeholder, so nothing is left changed.
        filterCount: (w) => detach(
          qa(w, '.study-lib-filters button').find((b) => b.getAttribute('aria-pressed') === 'true'),
          'no pressed filter to detach — readiness view is not up',
        ),
        openAction: (w) => detach(
          q(w, '.study-lib-row .study-lib-open'),
          'no open action to detach — readiness view is not up',
        ),
      },
    },
    /*
     * The Media Center SHELL, as distinct from the `video` and `music` PAGES it hosts.
     *
     * Written 2026-09-02 (primary2) for one measured reason: `mediaCenter` was the single
     * ledger app that carried rows and had NO spec, so `notWritten.derived` could not
     * re-derive it by any route, and its 8 rows were the largest block in the ledger with no
     * recorded control. They are not unproven — they were driven 2026-08-25 by the
     * `window.__L6M` instrument, which cat6 superseded and cannot re-run. This spec makes
     * them re-runnable.
     *
     * THREE COUNTS THIS SPEC DELIBERATELY DOES NOT HARDCODE, each measured against the
     * ledger prose that named them and each different on this profile: the section rail
     * (prose 9, here 9 — but `.mc-seanime-link` is inside `.mc-nav`, so it moves with
     * availability), the library shelf rail (prose 9, here 6) and the sort `<select>`
     * (prose 7, here 4). All three are DERIVED from available media. Hardcoding any of them
     * repeats `library.inboxFilters` exactly — a row that can never reach its own threshold
     * on a smaller profile and reads as a dead feature.
     *
     * And "current" on the shelf rail is `aria-current="true"`, NOT a class: a class-based
     * selector matched 6 of 6 here, i.e. it could not fail.
     */
    mediaCenter: {
      // The Media window only. `video` and `music` are separate sections with separate
      // windows and their own specs; matching them here would score one shell three times.
      titleRe: /Media|メディア|媒体|Медиа/i,
      rootSel: '.mc-root',
      notSel: '.mc-video-page',
      features: [
        {
          // Exactly one active rail entry, and the active one AGREES with the breadcrumb.
          // `active === 1` alone cannot catch a rail that highlights a section the page is
          // not on; the breadcrumb is the same `tab` rendered a second way, which is the
          // only reading that can.
          id: 'navRail',
          f: (w) => {
            const btns = qa(w, '.mc-nav button');
            const active = btns.filter((b) => b.classList.contains('is-active'));
            const label = active[0] ? txt(q(active[0], 'strong')) : '';
            const crumb = txt(q(w, '.mc-breadcrumb strong'));
            return {
              ok: btns.length >= 6 && active.length === 1 && !!crumb && label === crumb,
              ev: `railButtons=${btns.length} active=${active.length} activeLabel="${label}" breadcrumb="${crumb}"`,
            };
          },
        },
        {
          // The library shelf rail. Count DERIVED (see the header); the invariant is that
          // exactly one entry declares itself current, through `aria-current` and not a class.
          id: 'libraryShelves',
          f: (w) => {
            const items = qa(w, '.medialib-rail .ui-sidebar__item');
            if (!items.length) {
              return { ok: null, na: 'the library page is not the mounted tab — no shelf rail', ev: 'no .medialib-rail .ui-sidebar__item' };
            }
            const cur = items.filter((i) => i.getAttribute('aria-current') === 'true');
            const named = items.filter((i) => txt(i)).length;
            return {
              ok: items.length >= 2 && cur.length === 1 && named === items.length,
              ev: `shelves=${items.length} current=${cur.length} named=${named} currentLabel="${cur[0] ? txt(cur[0]) : ''}"`,
            };
          },
        },
        {
          // Search narrows the grid. This row was a DEAD CONTROL until `89c11473` — the
          // field wrote `state.query` and the panel rendered the unfiltered `state.items`.
          // On a profile with no media there is nothing to narrow, and a row scored on an
          // empty grid would pass for the wrong reason, so it declares itself `na` rather
          // than claiming the fix.
          id: 'librarySearch',
          f: (w) => {
            /*
             * MEASURED, and it took two wrong selectors to find. The field is NOT inside
             * the library browser: it is `LABEL.mc-global-search > INPUT` in the shell's
             * own `.mc-topbar`, it carries no className, and its SUBJECT follows the tab —
             * "Search your media library…" on Library, "Search songs, artists, albums…" on
             * Music. Both `.medialib-browser__tools input[type=search]` and
             * `.medialib-root input[type=search]` missed it, and the row then scored `na`
             * with the WRONG reason ("the library page is not the mounted tab") while the
             * page was plainly mounted. Right verdict, false evidence — which is the
             * failure mode a row this quiet is most likely to ship with.
             */
            const field = q(w, '.mc-global-search input');
            const cards = qa(w, '.medialib-card').length;
            if (!field) {
              return { ok: null, na: 'the library page is not the mounted tab — no search field', ev: 'no library search input' };
            }
            if (!cards) {
              return { ok: null, na: 'the media library is empty on this profile — a search that narrows nothing cannot be distinguished from a search that does nothing', ev: `searchField=1 cards=0 placeholder="${field.placeholder}"` };
            }
            return {
              ok: !!field.placeholder && cards > 0,
              ev: `searchField=1 cards=${cards} placeholder="${field.placeholder}"`,
            };
          },
        },
        {
          // Sort options and the grid/list toggle. Option count DERIVED; the toggle is the
          // half with a real invariant — exactly one of the two pressed, and the pressed one
          // named, so an all-false or all-true pair falls.
          id: 'sortAndViewMode',
          f: (w) => {
            const sel = q(w, '.medialib-view__head select') || q(w, 'select.ui-select');
            const view = qa(w, '.medialib-view-toggle [aria-pressed]');
            if (!sel && !view.length) {
              return { ok: null, na: 'the library page is not the mounted tab — no sort or view controls', ev: 'no select and no .medialib-view-toggle' };
            }
            const pressed = view.filter((b) => b.getAttribute('aria-pressed') === 'true');
            const opts = sel ? sel.options.length : 0;
            const namedView = view.filter((b) => (b.getAttribute('aria-label') || txt(b)).trim()).length;
            return {
              ok: !!sel && opts >= 2 && !!sel.value && view.length === 2
                && pressed.length === 1 && namedView === view.length,
              ev: `sortOptions=${opts} sortValue="${sel ? sel.value : ''}" viewButtons=${view.length} pressed=${pressed.length} named=${namedView}`,
            };
          },
        },
        {
          // Per-item actions. Two selectors, one affordance: a shelf of one entry renders
          // `.medialib-spotlight__actions` whose last button calls the same `onMenu` as
          // `.medialib-card__more`. Matching only the card half scored the spotlight as a
          // missing feature. With no items there is neither, and that is `na`, not a defect.
          id: 'perItemActions',
          f: (w) => {
            const cards = qa(w, '.medialib-card').length;
            const more = qa(w, '.medialib-card__more').length;
            const spot = qa(w, '.medialib-spotlight__actions button').length;
            if (!cards && !spot) {
              return { ok: null, na: 'the media library is empty on this profile — no item to carry a per-item menu', ev: 'cards=0 spotlightActions=0' };
            }
            return {
              ok: (cards > 0 && more === cards) || spot > 0,
              ev: `cards=${cards} cardMenus=${more} spotlightActions=${spot}`,
            };
          },
        },
        {
          // Back/Forward reflect REAL trail depth. Before `1f5b0f2`-era work these were
          // wired to `setTab('home')`/`setTab('library')` and were never disabled, i.e. they
          // looked like browser chrome and were not. The invariant scored here is the one
          // that cannot be faked by always-enabled buttons: the `title` carries the REASON
          // while disabled and the plain label while enabled, so the greyed state explains
          // itself, and `aria-label` stays the label in both so the accessible name does not
          // move. A pair that is enabled at both ends of an empty trail fails it.
          id: 'historyHonest',
          f: (w) => {
            const btns = qa(w, '.mc-history-buttons button');
            if (btns.length !== 2) return { ok: false, ev: `historyButtons=${btns.length} (expected 2)` };
            const rows = btns.map((b) => ({
              label: (b.getAttribute('aria-label') || '').trim(),
              title: (b.getAttribute('title') || '').trim(),
              off: b.disabled,
            }));
            // Disabled -> the title must SAY something other than the label (the reason);
            // enabled -> the title IS the label. Either way both strings are non-empty.
            const honest = rows.every((r) => r.label && r.title
              && (r.off ? r.title !== r.label && r.title.length > r.label.length : r.title === r.label));
            return {
              ok: honest,
              ev: rows.map((r) => `${r.label}: disabled=${r.off} title="${r.title.slice(0, 44)}"`).join(' | '),
            };
          },
        },
        {
          // The route OUT to the Media workspace. NOT DRIVEN HERE, and the reason is on the
          // record rather than hidden: `openSeanime` (MediaCenterView.tsx) falls back to
          // `window.api.popOut('player')` when no host exists in this window tree, so a
          // click can open a whole OS window this harness would then have to close — and the
          // host itself mounts at `body > div > .seanime-host`, OUTSIDE the window. The
          // 2026-08-25 run drove the 0 -> 1 -> 0 cycle and that reading stands. What is
          // re-runnable is the launcher's HONESTY: it is present, it is named, and if it is
          // dead it says why — `seanimeActionTitle` carries "connecting" or "unavailable".
          // An always-enabled launcher on an unavailable workspace fails this.
          id: 'workspaceLauncher',
          f: (w) => {
            const link = q(w, '.mc-seanime-link');
            if (!link) return { ok: false, ev: 'no .mc-seanime-link in the rail' };
            const label = txt(q(link, 'strong')) || txt(link);
            const title = (link.getAttribute('title') || '').trim();
            const off = link.disabled || link.getAttribute('aria-disabled') === 'true';
            const hosts = w.ownerDocument.querySelectorAll('.seanime-host').length;
            return {
              ok: !!label && (!off || !!title),
              ev: `launcher=1 label="${label}" disabled=${off} title="${title.slice(0, 48)}" hostsInDocument=${hosts}`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        /*
         * Mount the tab the rows are ABOUT, which is Library. Four of the eight rows read
         * the library browser and score `na` on any other tab; a drive that navigated away
         * from it would take their subject with it, which is the mistake `statistics`
         * already paid for in the other direction (its row read before its own drive).
         *
         * MEASURED TRAP, and it disproved a candidate defect the last handoff carried. The
         * `player` section mounts `<MediaCenterView initialTab="library" />`
         * (AppSection.tsx:79), so the window OPENS on Library — clicking Library is
         * `setTab(same)`, which correctly returns the trail unchanged and leaves Back
         * disabled. That reads exactly like "the first in-window navigation is lost" and is
         * not: driven on a never-before-created Video window, the crumb reads `Video` at
         * mount with Back disabled, and Library -> Music enables it. Hence `already`.
         */
        library: (w) => {
          const btns = qa(w, '.mc-nav button').filter((b) => !b.classList.contains('mc-seanime-link'));
          const active = btns.filter((b) => b.classList.contains('is-active'))[0];
          if (window.__LQP_MC_HOME === undefined) {
            window.__LQP_MC_HOME = active ? txt(q(active, 'strong')) : null;
          }
          const target = btns.filter((b) => q(b, 'strong') && /Library|ライブラリ|媒体库|库|Библиотек/i.test(txt(q(b, 'strong'))))[0];
          if (!target) return { refused: 'no Library entry in the section rail' };
          if (target.classList.contains('is-active')) return { already: true };
          target.click();
          return { navigated: `${active ? txt(q(active, 'strong')) : '?'} -> ${txt(q(target, 'strong'))}` };
        },
      },
      drive: ['library'],
      undo: {
        // Walk the trail BACK with the product's own Back button, never by clicking the
        // origin entry again — clicking it would push a third trail entry and leave the
        // window with a longer history than it was found with. Recorded once and never
        // cleared, for the reason city's undo states: `restore()` nulls per-spec state
        // between mutations and a re-capture would treat the driven tab as the original.
        mediaCenter: (w) => {
          const home = window.__LQP_MC_HOME;
          if (home === undefined || home === null) return null;
          const crumb = txt(q(w, '.mc-breadcrumb strong'));
          if (crumb === home) return null;
          const back = qa(w, '.mc-history-buttons button')[0];
          if (!back || back.disabled) return null;
          back.click();
          return `mediaCenter:library (back to ${home})`;
        },
      },
      mutations: {
        navRail: (w) => removeClassAll(qa(w, '.mc-nav button.is-active'), 'is-active'),
        libraryShelves: (w) => setAttr(
          qa(w, '.medialib-rail .ui-sidebar__item')
            .filter((i) => i.getAttribute('aria-current') === 'false')[0],
          'aria-current', 'true', 'no non-current shelf to falsify — library page is not up',
        ),
        librarySearch: (w) => detach(
          qa(w, '.medialib-card')[0],
          'the media library is empty on this profile — nothing to remove from the grid',
        ),
        sortAndViewMode: (w) => setAttr(
          qa(w, '.medialib-view-toggle [aria-pressed]')
            .filter((b) => b.getAttribute('aria-pressed') === 'false')[0],
          'aria-pressed', 'true', 'no unpressed view button to falsify — library page is not up',
        ),
        perItemActions: (w) => detach(
          q(w, '.medialib-card__more') || q(w, '.medialib-spotlight__actions button'),
          'the media library is empty on this profile — no per-item menu to remove',
        ),
        // Detaching ONE of the pair, not disabling one: `disabled` is a property the restore
        // sweep cannot reliably put back, and the row's own count of 2 is what falls.
        historyHonest: (w) => detach(qa(w, '.mc-history-buttons button')[1], 'no history pair'),
        workspaceLauncher: (w) => detach(q(w, '.mc-seanime-link'), 'no workspace launcher in the rail'),
        /*
         * MEASURED, not assumed, and the first choice was wrong. Detaching one `.fwin-b`
         * is the obvious falsification and it DOES NOT FIRE here: `lifecycle()` needs
         * `chrome.length >= 4` and this shell renders FIVE (Pop out, Make Liquid, Minimize,
         * Maximize, Close), so removing one leaves 4 and the row correctly stays up. The
         * receipt said so — `fellRows: []`, `exactlyOwnRow: false`, verdict VOID. The row's
         * other half is the one with no slack: `aria-pressed` on the Liquid toggle must be
         * a real boolean, so stripping it drops this row and nothing else. That is also the
         * control the 2026-08-25 `__L6M` run used, so the two instruments falsify the same
         * clause.
         */
        windowLifecycle: (w) => stripAttr(
          q(w, '.fwin-b-liquid'), 'aria-pressed', 'no Liquid toggle in this window chrome',
        ),
      },
    },
    video: {
      titleRe: /Video|ビデオ|视频|Виде/i,
      rootSel: '.mc-video-page',
      notSel: '.mc-music-layout',
      // The surface's own draft field, and the one the `youtube` step below already treats
      // as "the field the runner dirtied". Naming it explicitly is what keeps the driver off
      // `.mc-global-search input`, which is a NAVIGATION control: typing into it leaves the
      // Video page entirely. See `__probeInput`.
      probeInput: (w) => q(w, '.media-yt-input'),
      features: [
        {
          // The stage's honest state: with no source there is no `<video>` element at all,
          // and the file-entry empty offers its two real entry actions, both enabled. A
          // stage that mounts a player with nothing to play is the dishonest half; an empty
          // that names a dead end is the other.
          //
          // SOURCE SIGNAL CORRECTED 2026-09-02, and the correction is the finding. This row
          // used to read source-ness as `.mc-video-stage video` — a `<video>` node the page
          // NEVER mounts, because `MediaCenterView.tsx:882` delegates playback to the media
          // workspace and the stage only ever renders one of three `.mc-video-empty` states.
          // So the "with a source" branch was unreachable and the row could certify Video
          // only AT REST. Driven into its real functional state (a library item selected,
          // live: JoJo 38 RAW, 486 subtitle lines) the chooser empty is gone by design and
          // the row scored FAIL on an honest surface — the same shape as cat8's `textOf`
          // defect, an instrument that cannot see the state the product is actually in.
          // The signal is the INSPECTOR's loaded block (`.mc-video-meta`, `:951` — rendered
          // only under `current ? … : <p class="mc-muted">`). Deliberately not the topbar's
          // primary action, which is the other faithful render of the same state: the row
          // below scores that topbar, and a source term shared by both rows means one
          // mutation falls both and neither control proves anything. Signals belong to a
          // region no row under test owns. The `<video>` clause is KEPT and is now strictly
          // additive: a player may never be mounted without a source.
          id: 'stageHonesty',
          f: (w) => {
            const empties = qa(w, '.mc-video-empty');
            const media = qa(w, '.mc-video-stage video').length;
            const hasSrc = !!q(w, '.mc-video-inspector .mc-video-meta');
            // `:scope > div > button` and NOT a bare `button`: `04e51992` moved the
            // up-next shelf INSIDE this empty state, so a descendant query counts its
            // seven poster cards as entry actions — and the control then could not falsify
            // the row, because removing one real action still left eight "actions". The
            // empty's own action row is its direct `<div>` child.
            const ENTRY = ':scope > div > button';
            const entry = empties.find((e) => qa(e, ENTRY).length >= 2);
            const acts = entry ? qa(entry, ENTRY) : [];
            const live = acts.filter((b) => !b.disabled).length;
            const titled = empties.filter((e) => txt(q(e, 'strong'))).length;
            return {
              ok: empties.length > 0 && titled === empties.length
                && (media === 0 || hasSrc)
                && (hasSrc ? !entry : !!entry && acts.length >= 2 && live === acts.length),
              ev: `empties=${empties.length} titled=${titled} video=${media} src=${hasSrc} entryActions=${acts.length} enabled=${live}`,
            };
          },
        },
        {
          // The mute-pair contract the topbar's own source argues for: a greyed action
          // must carry its reason. With no source, the stage owns file entry and the topbar
          // deliberately omits its duplicate Open video action; with a source, that action
          // returns because the stage entry is gone. Presence is therefore cross-checked
          // against the stage, while disabled/reason agreement remains exact.
          //
          // RE-DERIVED at L10 bullet 4, and the reason matters more than the edit. This row
          // used to read `acts.length === 3 && on >= 1` with no source. BOTH terms were
          // satisfied only by a control that did not belong in this bar: the workspace
          // launcher, which acts on no source at all, wore the nav rail's own name, and was
          // enabled whenever the stage CTA beside it was rendered. Deleting the duplicate
          // dropped this row to 9/10 — the instrument had banked the defect as the contract.
          //
          // What replaces it is STRICTLY STRONGER, not a lowered bar:
          //   - the count is DERIVED from the source state, not a literal 3 (which is what
          //     let a stale layout keep passing);
          //   - exactly one of {topbar Open video, stage entry actions} exists — never both,
          //     never neither, which the old row only half-checked;
          //   - `liveSomewhere` is NEW: the page must always offer at least one enabled
          //     entry point. That is the real thing `on >= 1` was reaching for, and it is
          //     the clause that stops "the topbar may be entirely inert" from being a hole.
          //     A topbar of explained mute pairs is honest; a page with nothing to click is
          //     not, and only this version can tell the two apart.
          id: 'topbarActions',
          f: (w) => {
            const acts = qa(w, '.mc-video-actions button');
            const off = acts.filter((b) => b.disabled);
            const explained = off.filter((b) => (b.title || '').trim().length > 0).length;
            const on = acts.length - off.length;
            const entry = qa(w, '.mc-video-empty').find((e) => qa(e, ':scope > div > button').length >= 2);
            const entryLive = entry ? qa(entry, ':scope > div > button').filter((b) => !b.disabled).length : 0;
            // The action the topbar GAINS with a source is the primary one — that is the
            // surface's own convention (`mc-button-primary` is used for exactly the entry
            // action, in the topbar and in the stage alike). Keying on it makes the check an
            // identity rather than an arithmetic literal, so a layout change cannot quietly
            // keep passing the way `acts.length === 3` did.
            const primary = qa(w, '.mc-video-actions .mc-button-primary').length;
            // CORRECTED 2026-09-02, same finding as `stageHonesty` above: the source term
            // used to be `.mc-video-stage video`, a node this page never mounts, so the
            // whole `hasSource ? … : …` branch collapsed to its no-source arm and the row
            // read FAIL the moment a real item was selected. The comment above already
            // states the invariant this row is FOR — "exactly one of {topbar Open video,
            // stage entry actions} exists — never both, never neither" — so it is now
            // written as that exclusive-or directly, with no third signal to go stale.
            // Strictly at least as strong: on the at-rest state `primary === 0 && !!entry`
            // and the XOR agree, and the XOR is additionally defined on the loaded state,
            // where it still fails if the topbar keeps its primary AND the chooser returns.
            const countAgrees = acts.length >= 2 && ((primary === 1) !== !!entry);
            const liveSomewhere = on + entryLive >= 1;
            return {
              ok: countAgrees && liveSomewhere && explained === off.length,
              ev: `actions=${acts.length} enabled=${on} disabled=${off.length} explained=${explained}`
                + ` primary=${primary} stageEntry=${!!entry} stageLive=${entryLive}`,
            };
          },
        },
        {
          // Driven: `step('toggle')` clicks the first learning toggle. The row asserts the
          // flip landed AND that nothing else in the group moved — a group whose controls
          // share one state would flip together, which is the defect a count cannot see.
          id: 'learningToggles',
          f: (w) => {
            const g = videoState();
            const boxes = qa(w, '.mc-toggle-list .mc-toggle input');
            const now = boxes.map((b) => b.checked);
            const was = g.toggles;
            const flipped = was ? now.filter((v, i) => v !== was[i]).length : -1;
            return {
              ok: boxes.length >= 6 && !!was && flipped === 1 && now[0] !== was[0],
              ev: `toggles=${boxes.length} before=${JSON.stringify(was)} after=${JSON.stringify(now)} flipped=${flipped}`,
            };
          },
        },
        {
          // The transcription block's own model select — NOT the YouTube bar's, which
          // shares the class and carries a different option list. Scored against the
          // language segment beside it: exactly one active, and the select's value is a
          // real option rather than a stale string the list no longer offers.
          id: 'transcriptionModel',
          f: (w) => {
            const sel = q(w, '.mc-inspector-block > .media-model-select');
            const opts = sel ? Array.from(sel.options).map((o) => o.value) : [];
            const seg = qa(w, '.media-modelseg .sp-seg-btn');
            const active = activeOf(seg, 'active');
            return {
              ok: !!sel && opts.length >= 2 && opts.includes(sel.value)
                && seg.length >= 2 && active === 1,
              ev: `options=${opts.length} value="${sel ? sel.value : 'absent'}" inList=${opts.includes(sel ? sel.value : '')} segments=${seg.length} active=${active}`,
            };
          },
        },
        {
          id: 'watchFolder',
          f: (w) => {
            const btns = qa(w, '.media-watch button');
            const live = btns.filter((b) => !b.disabled).length;
            return { ok: btns.length > 0 && live === btns.length, ev: `controls=${btns.length} enabled=${live}` };
          },
        },
        {
          // Driven: `step('youtube')` drafts a URL. The row is the draft surviving in the
          // field with its action live — a bar that clears what was typed is the failure.
          id: 'youtubeDraft',
          f: (w) => {
            const g = videoState();
            const input = q(w, '.media-yt-input');
            const action = q(w, '.media-yt button');
            return {
              ok: !!input && !!g.ytTest && input.value === g.ytTest && !!action && !action.disabled,
              ev: `drafted=${!!input && input.value === g.ytTest} actionEnabled=${!!action && !action.disabled}`,
            };
          },
        },
        {
          /*
           * EXACTLY ONE up-next shelf. `04e51992` moved the shelf INTO the empty stage to
           * close category 4's dead region, and the property that makes that a relocation
           * rather than a duplication is that one `upNext` value renders in one of two
           * places — never both, never neither. A count of `>= 1` would pass the duplicate
           * and a count of `<= 1` would pass the loss; only `=== 1` is the contract.
           */
          id: 'upNextShelf',
          f: (w) => {
            const shelves = qa(w, '.mc-up-next');
            const cards = shelves.reduce((n, s) => n + qa(s, 'button, article, .mc-shelf-card').length, 0);
            const shown = shelves.filter((s) => s.checkVisibility && s.checkVisibility()).length;
            return {
              ok: shelves.length === 1 && cards > 0 && shown === 1,
              ev: `shelves=${shelves.length} cards=${cards} visible=${shown}`,
            };
          },
        },
        {
          /*
           * The inspector is either fully loaded or fully empty, never half. Four
           * independently rendered signals — the score row, the MAL link, the meta line and
           * the empty paragraph — all derive from one `current`, so any disagreement is a
           * surface showing state it does not have.
           */
          id: 'inspectorHonesty',
          f: (w) => {
            const ins = q(w, '.mc-video-inspector');
            if (!ins) return { ok: false, ev: 'no inspector rail' };
            const score = !!q(ins, '.mc-inspector-score-row');
            const meta = !!q(ins, '.mc-video-meta');
            const mal = !!qa(ins, '.mc-section-head button')[0];
            const empty = !!q(ins, '.mc-muted');
            const loaded = score && meta && mal && !empty;
            const blank = !score && !meta && !mal && empty;
            return {
              ok: loaded || blank,
              ev: `scoreRow=${score} meta=${meta} malLink=${mal} emptyCopy=${empty} coherent=${loaded ? 'loaded' : blank ? 'blank' : 'MIXED'}`,
            };
          },
        },
        {
          /*
           * The tab this window is actually on, cross-checked against the title the window
           * chrome advertises. L9 handoff trap 1: the Media Center tab DRIFTS (HMR resets
           * it) and every harness silently scores whatever page it lands on. Two
           * independently rendered strings agreeing is what makes the rest of this spec's
           * numbers attributable to Video at all.
           */
          id: 'navReach',
          f: (w) => {
            const items = qa(w, '.mc-nav button');
            const active = items.filter((b) => b.classList.contains('is-active'));
            // The nav item is `<svg><span><strong>Video</strong><small>Immersion
            // player</small></span></button>`. `textContent` concatenates with NO
            // separator, so splitting on a newline yields "VideoImmersion player" and the
            // comparison against the window title fails on a correct surface — measured,
            // not reasoned. The `<strong>` is the label.
            const label = active[0] ? txt(q(active[0], 'strong')) : '';
            const title = txt(q(w, '.fwin-title-text'));
            const page = q(w, '.mc-page');
            return {
              ok: items.length >= 6 && active.length === 1 && !!label && label === title
                && !!page && page.classList.contains('mc-video-page'),
              ev: `items=${items.length} active=${active.length} activeLabel="${label}" windowTitle="${title}" page="${page ? page.className : 'absent'}"`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        toggle: (w) => {
          const g = videoState();
          const boxes = qa(w, '.mc-toggle-list .mc-toggle input');
          if (!boxes.length) return { refused: 'no learning toggles' };
          if (!g.toggles) {
            g.toggles = boxes.map((b) => b.checked);
            g.prefsStorage = localStorage.getItem('jp-media-player-preferences-v1');
          }
          if (boxes[0].checked !== g.toggles[0]) return { already: true, now: boxes.map((b) => b.checked) };
          boxes[0].click();
          return { was: g.toggles[0], now: boxes[0].checked };
        },
        youtube: (w) => {
          const g = videoState();
          const input = q(w, '.media-yt-input');
          if (!input) return { refused: 'no YouTube import field' };
          // The runner dirties the first editable field BEFORE the drive, and on this
          // surface that field IS this one. Recording the mark as the "original" would
          // make undo restore the harness's own probe string into the live app, so a
          // dirtied value is never captured as an original.
          if (g.youtube == null) g.youtube = /lqp-roundtrip-/.test(input.value) ? '' : input.value;
          g.ytTest = 'https://youtu.be/aaaaaaaaaaa';
          typeInto(input, g.ytTest);
          return { drafted: true };
        },
      },
      drive: ['toggle', 'youtube'],
      // DROPPED 2026-09-02. This licence existed because the old `stageHonesty` mutation
      // detached an ENTRY ACTION, which `topbarActions` also reads — so the two had to be
      // allowed to fall together. The replacement takes an empty's `<strong>` instead, which
      // no other row measures, so the licence would now only make the control laxer than it
      // has to be. A cascade is a concession, not a default; it is removed the moment the
      // mutation that needed it is gone.
      cascades: {},
      undo: {
        video: (w) => {
          const g = window.__LQP_VIDEO_ORIG;
          if (!g) return null;
          const done = [];
          const boxes = qa(w, '.mc-toggle-list .mc-toggle input');
          if (g.toggles && boxes.length === g.toggles.length) {
            boxes.forEach((b, i) => { if (b.checked !== g.toggles[i]) { b.click(); done.push(`toggle${i}`); } });
          }
          const input = q(w, '.media-yt-input');
          if (input && g.youtube != null && input.value !== g.youtube) {
            typeInto(input, g.youtube); done.push('youtube');
          }
          // The preference blob is written by the click's own effect, so it is put back on
          // the next tick — after React has finished persisting the restored value.
          setTimeout(() => {
            if (g.prefsStorage == null) localStorage.removeItem('jp-media-player-preferences-v1');
            else localStorage.setItem('jp-media-player-preferences-v1', g.prefsStorage);
          }, 0);
          window.__LQP_VIDEO_ORIG = null;
          return done.length ? `video:${done.join('+')}` : null;
        },
      },
      mutations: {
        // BOTH of these were rewritten 2026-09-02, and for the same reason as the two rows
        // they falsify: each was only armable in the surface's AT-REST state. The old
        // `stageHonesty` mutation detached the second action of the multi-action empty —
        // but with a source selected that empty does not exist, so it refused with "no
        // multi-action empty state". The old `topbarActions` mutation stripped `title` from
        // a muted control — but with a source every action is enabled, so it refused with
        // "no muted control to falsify". Two refusals VOID the whole category, which is the
        // rubric working: a control that cannot fire earns nothing.
        //
        // Each replacement is armable in BOTH states, so no branch is needed and neither is
        // silently untested. `stageHonesty` loses the title of an empty state — `titled`
        // falls below `empties` whether there are one or two — and touches no button, so the
        // topbar row does not move with it (its old cascade is dropped for that reason).
        // `topbarActions` promotes a second topbar action to primary, which breaks the
        // exclusive-or in either state (0 -> 1 beside a live chooser; 1 -> 2 beside none) and
        // reads on nothing the stage row measures.
        stageHonesty: (w) => detach(q(w, '.mc-video-empty strong'), 'no titled empty state'),
        topbarActions: (w) => addClassAll(
          qa(w, '.mc-video-actions button').filter((b) => !b.classList.contains('mc-button-primary')).slice(0, 1),
          'mc-button-primary',
        ),
        learningToggles: (w) => detach(q(w, '.mc-toggle-list .mc-toggle'), 'no learning toggles'),
        transcriptionModel: (w) => removeClassAll(qa(w, '.media-modelseg .sp-seg-btn.active'), 'active'),
        watchFolder: (w) => detach(q(w, '.media-watch button'), 'no watch-folder control'),
        youtubeDraft: (w) => detach(q(w, '.media-yt button'), 'no YouTube action'),
        upNextShelf: (w) => detach(q(w, '.mc-up-next'), 'no up-next shelf'),
        // The third at-rest-only mutation found by the same run, and the only one here that
        // genuinely NEEDS a branch: this row asserts the inspector is coherently `loaded` OR
        // coherently `blank`, so the edit that breaks coherence is a different edit in each
        // state — removing the empty copy when there is none to remove is not a control.
        // Loaded, it takes the score row, NOT `.mc-video-meta`: `stageHonesty` above reads
        // meta as its source signal, and a mutation that falls a second row proves neither.
        inspectorHonesty: (w) => (q(w, '.mc-video-inspector .mc-video-meta')
          ? detach(q(w, '.mc-video-inspector .mc-inspector-score-row'), 'loaded inspector has no score row')
          : removeClassAll(qa(w, '.mc-video-inspector .mc-muted'), 'mc-muted')),
        navReach: (w) => removeClassAll(qa(w, '.mc-nav .is-active'), 'is-active'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /*
     * L9's second RULE C surface — City / Mooncap Garden, the sparsest window in the shell
     * and the one section `canPresentLiquid` refuses. It has no `.fwin-title-text`, so it
     * is always matched by `rootSel`; `titleRe` is here only because the runner raises by
     * TASKBAR title, which is "Mooncap Garden".
     *
     * A canvas scene has almost no controls, so presence-counting would score it 10/10 on
     * an empty stage. Every row here is instead an AGREEMENT between two numbers the scene
     * computes independently — the stage badge against the root's `stage-band-N` class, the
     * banked-pages sentence against the progress bar's inline width, the music toggle
     * against the volume slider's `disabled` — plus `heroPlacement`, which is `df9441cf`'s
     * fix stated as a contract so the mushroom cannot slide back under the fold.
     */
    city: {
      titleRe: /Mooncap|ムーンキャップ|月帽|Мунка/i,
      rootSel: '.reading-garden',
      features: [
        {
          // Driven: `step('dossier')` clicks the hitbox. The disclosure must report itself
          // open, point at the panel it opened, and offer an enabled way back out — the
          // "every enable flow needs a disable path" invariant, in this surface's terms.
          id: 'dossierDisclosure',
          f: (w) => {
            const hit = q(w, '.reading-garden-mushroom-hitbox');
            const panel = q(w, '.reading-garden-info');
            const close = q(w, '.reading-garden-info-close');
            const controls = hit ? hit.getAttribute('aria-controls') : null;
            return {
              ok: !!hit && hit.getAttribute('aria-expanded') === 'true' && !!panel
                && panel.getAttribute('role') === 'dialog' && !!(panel.getAttribute('aria-label') || '').trim()
                && !!controls && panel.id === controls && !!close && !close.disabled,
              ev: `expanded=${hit ? hit.getAttribute('aria-expanded') : 'absent'} panel=${!!panel} controls="${controls}" panelId="${panel ? panel.id : ''}" closeEnabled=${!!close && !close.disabled}`,
            };
          },
        },
        {
          // The stage badge and the root's scene band are computed from one `stage` in two
          // places: `stage-band-${floor((stage-1)/10)+1}`. A badge that says 11 on a
          // band-1 scene is the surface telling the user one thing and painting another.
          id: 'stageReadout',
          f: (w) => {
            const badge = Number(txt(q(w, '.reading-garden-info-stage strong')));
            const root = q(w, '.reading-garden');
            const band = Number((String(root && root.className).match(/stage-band-(\d+)/) || [])[1]);
            const want = Number.isFinite(badge) && badge > 0 ? Math.floor((badge - 1) / 10) + 1 : NaN;
            return {
              ok: Number.isFinite(badge) && badge > 0 && band === want,
              ev: `stageBadge=${badge} sceneBand=${band} expectedBand=${want}`,
            };
          },
        },
        {
          // Three dossier facts, every `dt` and `dd` non-empty, AND the banked-pages
          // sentence agreeing with the progress bar's inline width to within a point. The
          // sentence is text and the bar is a percentage — the same fraction rendered
          // twice, which is the only way to catch a bar that has stopped tracking.
          id: 'dossierFacts',
          f: (w) => {
            const rows = qa(w, '.reading-garden-info-dossier > div');
            const filled = rows.filter((r) => txt(q(r, 'dt')) && txt(q(r, 'dd'))).length;
            const banked = txt(q(w, '.reading-garden-info-copy strong'));
            const nums = (banked.match(/\d+/g) || []).map(Number);
            const bar = q(w, '.reading-garden-info-track i');
            const pct = bar ? Number(String(bar.style.width).replace('%', '')) : NaN;
            // A mature organism renders no banked sentence; then the bar has no text to
            // agree with and the row scores the facts alone rather than inventing a match.
            const agrees = nums.length >= 2
              ? Number.isFinite(pct) && Math.abs(pct - (nums[0] / nums[1]) * 100) <= 1
              : !!txt(q(w, '.reading-garden-info-observation p'));
            return {
              ok: rows.length >= 3 && filled === rows.length && agrees,
              ev: `factRows=${rows.length} filled=${filled} banked="${banked}" barWidth=${pct}%`,
            };
          },
        },
        {
          // Exactly one of On/Off pressed, and the volume slider's `disabled` agreeing with
          // which one — `disabled={!music.enabled}` in the source, so a slider live under a
          // pressed Off is a control that outlives the state that gates it.
          id: 'musicControls',
          f: (w) => {
            const btns = qa(w, '.reading-garden-info-music-toggle button');
            const on = btns.filter((b) => b.getAttribute('aria-pressed') === 'true');
            const enabled = on.length === 1 && btns.indexOf(on[0]) === 0;
            const vol = q(w, '.reading-garden-info-music-volume input');
            return {
              ok: btns.length === 2 && on.length === 1 && !!vol && vol.disabled === !enabled,
              ev: `buttons=${btns.length} pressed=${on.length} enabledSide=${enabled} sliderDisabled=${vol ? vol.disabled : 'absent'}`,
            };
          },
        },
        {
          // The readout beside the slider is the slider's own value, rendered separately.
          id: 'musicVolumeReadout',
          f: (w) => {
            const vol = q(w, '.reading-garden-info-music-volume input');
            const out = txt(q(w, '.reading-garden-info-music-volume strong'));
            return {
              ok: !!vol && vol.type === 'range' && Number(vol.max) > 0 && out === String(Number(vol.value)),
              ev: `value=${vol ? vol.value : 'absent'} readout="${out}" range=${vol ? `${vol.min}..${vol.max}` : 'absent'}`,
            };
          },
        },
        {
          // A canvas scene that did not paint is a canvas with a 0x0 BACKING STORE, which
          // no CSS box will reveal — `width`/`height` attributes, not the rect.
          id: 'scenePainted',
          f: (w) => {
            const canvases = qa(w, '.reading-garden canvas')
              .filter((c) => !c.closest('[data-dev-only="true"]'));
            const painted = canvases.filter((c) => c.width > 0 && c.height > 0).length;
            const layers = qa(w, '.reading-garden-world, .reading-garden-cloud-sprite').length;
            return {
              ok: canvases.length > 0 && painted === canvases.length && layers >= 6,
              ev: `canvases=${canvases.length} painted=${painted} parallaxLayers=${layers}`,
            };
          },
        },
        {
          /*
           * `df9441cf` as a contract. `.reading-garden` had `min-height: 420px`, which is an
           * OVERRIDE and not a floor, so at 260x170 the scene stayed 420 tall inside a 170px
           * window and the mushroom — the surface's ONLY control, with no scrollbar to reach
           * it — sat at y=254, under the fold. The row is the hitbox's box lying inside the
           * window's own box on both axes.
           */
          id: 'heroPlacement',
          f: (w) => {
            const hit = q(w, '.reading-garden-mushroom-hitbox');
            if (!hit) return { ok: false, ev: 'no mushroom hitbox' };
            const a = hit.getBoundingClientRect();
            const b = w.getBoundingClientRect();
            const inside = a.top >= b.top - 1 && a.left >= b.left - 1
              && a.bottom <= b.bottom + 1 && a.right <= b.right + 1;
            return {
              ok: inside && a.width >= 32 && a.height >= 32,
              ev: `hitbox=${Math.round(a.x - b.x)},${Math.round(a.y - b.y)} ${Math.round(a.width)}x${Math.round(a.height)} window=${Math.round(b.width)}x${Math.round(b.height)} inside=${inside}`,
            };
          },
        },
        {
          /*
           * The dev-only console is not part of this surface. Correction 21 established the
           * contract as an ATTRIBUTE the product sets next to its own `import.meta.env.DEV`
           * guard, so the row asserts what the attribute is allowed to be on: nothing the
           * user can reach. Every marked subtree is named in the evidence, so putting the
           * attribute on a shipping element to dodge a score shows up here by name.
           */
          id: 'devOnlyIsolated',
          f: (w) => {
            const marked = qa(w, '[data-dev-only="true"]');
            const named = marked.map((n) => `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}`);
            const controls = qa(w, 'button, input, select, textarea')
              .filter((c) => !c.closest('[data-dev-only="true"]') && !c.closest('.fwin-frameless-controls'));
            return {
              ok: marked.every((n) => /console|debug|dev/i.test(String(n.className))) && controls.length > 0,
              ev: `devOnly=${marked.length} [${named.join(', ')}] userControls=${controls.length}`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        dossier: (w) => {
          const hit = q(w, '.reading-garden-mushroom-hitbox');
          if (!hit) return { refused: 'no mushroom hitbox' };
          // NOT the per-spec `specState` global the other apps use, and the difference is
          // measured rather than stylistic: `restore()` nulls those, the control loop calls
          // `restore()` after every mutation, and the next `drive()` would then re-capture
          // the ORIGINAL as "open" — leaving the user's dossier open at the end of the run
          // and calling it restored. This one records the true original once and is never
          // cleared, so every restore puts the surface back to what was found.
          if (window.__LQP_CITY_WAS_OPEN === undefined) {
            window.__LQP_CITY_WAS_OPEN = hit.getAttribute('aria-expanded') === 'true';
          }
          if (hit.getAttribute('aria-expanded') === 'true') return { already: true };
          hit.click();
          return { opened: true };
        },
      },
      drive: ['dossier'],
      undo: {
        city: (w) => {
          const was = window.__LQP_CITY_WAS_OPEN;
          if (was === undefined) return null;
          const hit = q(w, '.reading-garden-mushroom-hitbox');
          if (!hit) return null;
          const open = hit.getAttribute('aria-expanded') === 'true';
          if (open === was) return null;
          const close = q(w, '.reading-garden-info-close');
          (close || hit).click();
          return 'city:dossier';
        },
      },
      mutations: {
        dossierDisclosure: (w) => stripAttr(
          q(w, '.reading-garden-mushroom-hitbox'), 'aria-controls', 'no mushroom hitbox',
        ),
        stageReadout: (w) => detach(q(w, '.reading-garden-info-stage strong'), 'dossier not open — no stage badge'),
        dossierFacts: (w) => detach(q(w, '.reading-garden-info-dossier > div dd'), 'no dossier facts'),
        musicControls: (w) => setAttr(
          qa(w, '.reading-garden-info-music-toggle button')
            .filter((b) => b.getAttribute('aria-pressed') === 'false')[0],
          'aria-pressed', 'true', 'no unpressed music button to falsify',
        ),
        musicVolumeReadout: (w) => detach(
          q(w, '.reading-garden-info-music-volume strong'), 'no volume readout',
        ),
        /*
         * The layer half, not the canvas half, and the choice is deliberate. Zeroing a
         * canvas backing store is the more literal "did not paint" falsification, but the
         * restore sweep only puts an ATTRIBUTE back — the pixels are gone, and a layer that
         * is not on a redraw loop would stay blank in the user's live garden after the run.
         * A class the sweep genuinely re-adds falsifies the same row with nothing at risk.
         * Stated so the limitation is on the record: the control proves the parallax half of
         * `scenePainted`, and the canvas half is asserted but not falsified.
         */
        scenePainted: (w) => removeClassAll(qa(w, '.reading-garden-cloud-sprite'), 'reading-garden-cloud-sprite'),
        heroPlacement: (w) => {
          const hit = q(w, '.reading-garden-mushroom-hitbox');
          if (!hit) return { refused: 'no mushroom hitbox' };
          hit.setAttribute('data-lqp-was-style', hit.getAttribute('style') || '');
          hit.style.transform = 'translateY(4000px)';
          return { mutated: 'hitbox pushed 4000px below the fold' };
        },
        // Marking a SHIPPING element `data-dev-only` would be the honest falsification, but
        // the restore sweep can only put an attribute BACK, never remove one it invented —
        // it would leave `data-dev-only=""` on a product node. Falsified from the other
        // side instead: strip the marked panel's own identifying class, so the row can no
        // longer confirm that what is marked is a console.
        devOnlyIsolated: (w) => removeClassAll(
          qa(w, '[data-dev-only="true"]'), 'reading-garden-sky-console',
        ),
        windowLifecycle: (w) => {
          const bar = q(w, '.fwin-frameless-controls');
          if (!bar) return { refused: 'no frameless control cluster' };
          return detach(qa(bar, '.fwin-b')[0], 'no frameless chrome button');
        },
      },
    },

    // Scraper's parity contract is the shell that reaches every provider, the settings
    // editor that configures them, and explicit reverse controls. Network work is never
    // triggered by this harness: it only changes and restores local navigation state.
    scraper: {
      titleRe: /Scraper|スクレイパー|抓取器|Скрапер/i,
      rootSel: '.scr-shell',
      features: [
        { id: 'railNavigation', f: (w) => {
          const items = qa(w, '.scr-rail-item');
          const current = items.filter((b) => b.getAttribute('aria-current') === 'page');
          const named = items.filter((b) => (b.title || '').trim().length > 0);
          return { ok: items.length >= 10 && current.length === 1 && named.length === items.length,
            ev: `items=${items.length} current=${current.length} named=${named.length}` };
        } },
        { id: 'drawerCategories', f: (w) => {
          const cats = qa(w, '.scr-drawer-cat');
          const current = cats.filter((b) => b.getAttribute('aria-current') === 'true');
          const fields = qa(w, '.scr-field');
          return { ok: cats.length >= 10 && current.length === 1 && fields.length > 0,
            ev: `categories=${cats.length} current=${current.length} fields=${fields.length}` };
        } },
        { id: 'settingsFields', f: (w) => {
          const fields = qa(w, '.scr-field');
          const complete = fields.filter((field) => q(field, '.scr-field-label') && q(field, '.scr-field-control'));
          return { ok: fields.length > 0 && complete.length === fields.length,
            ev: `fields=${fields.length} labelledControls=${complete.length}` };
        } },
        { id: 'shellSearch', f: (w) => {
          const input = q(w, '.scr-search > .scr-search-input');
          const controls = input && input.getAttribute('aria-controls');
          return { ok: !!input && input.getAttribute('role') === 'combobox' && !!controls
              && input.getAttribute('aria-expanded') === 'false',
            ev: `input=${!!input} role=${input && input.getAttribute('role')} controls=${controls || 'absent'} expanded=${input && input.getAttribute('aria-expanded')}` };
        } },
        { id: 'statusActions', f: (w) => {
          const actions = qa(w, '.scr-statusbar button');
          const ready = actions.filter((b) => !b.disabled && (b.title || '').trim().length > 0);
          return { ok: actions.length >= 3 && ready.length === actions.length,
            ev: `actions=${actions.length} enabledAndNamed=${ready.length}` };
        } },
        // FALSE POSITIVE REPAIRED 2026-09-02. This read `.scr-topbar-actions
        // button[aria-pressed="true"]`, but that div holds exactly ONE `aria-pressed`
        // (ScraperTopBar.tsx:91) and it is the ADVANCED-MODE toggle, not the drawer.
        // The drawer's opener at :78-86 was deliberately moved to `aria-expanded` +
        // `aria-controls` (APG disclosure), with a source comment saying why. So with
        // the drawer SHUT and advanced ON, the row scored a reversal affordance that
        // was not on screen. It now scores the disclosure itself, expanded, which is
        // the control that actually reverses the drawer.
        { id: 'reverseControls', f: (w) => {
          const close = q(w, '.scr-drawer-head .ui-icon-btn');
          const disclosure = qa(w, '.scr-topbar-actions button[aria-controls]');
          const expanded = disclosure.filter((b) => b.getAttribute('aria-expanded') === 'true');
          return { ok: !!close && !close.disabled && disclosure.length > 0 && expanded.length > 0,
            ev: `drawerClose=${!!close && !close.disabled} disclosures=${disclosure.length} expanded=${expanded.length}` };
        } },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        // FIRST step of the drive, added 2026-09-02. On a fresh profile the settings
        // drawer is SHUT, so four of this spec's seven rows measured a region that is
        // not rendered at all (`drawerCategories`, `settingsFields`, `reverseControls`)
        // and `switchDrawer` refused, which VOIDed the whole run at 4/7. Opening it is
        // local navigation state, exactly what this spec's own header licenses. It
        // records whether the drawer was ALREADY open so `undo` closes it only if this
        // drive is what opened it — a user who left it open keeps it open.
        openDrawer: (w) => {
          const g = scraperState();
          const disclosure = q(w, '.scr-topbar-actions button[aria-controls]');
          if (!disclosure) return { refused: 'no settings disclosure in the top bar' };
          const wasOpen = disclosure.getAttribute('aria-expanded') === 'true';
          if (g.drawerWasOpen == null) g.drawerWasOpen = wasOpen;
          if (!wasOpen) disclosure.click();
          return { wasOpen, opened: !wasOpen };
        },
        // A WAIT, and it is a step rather than a sleep because /eval is synchronous —
        // busy-waiting in the renderer would block the very import it is waiting for.
        // `ScraperSettingsDrawer` is `lazy()` (ScraperApp.tsx:68), so the first open in a
        // renderer session has to fetch and transform a chunk before `.scr-drawer-cat`
        // exists. MEASURED, not assumed: 403 ms cold after a reload, 113 ms warm — but on
        // the run where the dev server had never transformed the chunk it was still absent
        // 1,400 ms after the click, and `switchDrawer` + `restoreDrawer` both refused.
        // RATE: 2 refusals on that cold run, 0 on the warm re-run. This step spends one
        // more step-interval on it and reports the count instead of guessing.
        drawerReady: (w) => {
          const cats = qa(w, '.scr-drawer-cat').length;
          const disclosure = q(w, '.scr-topbar-actions button[aria-controls]');
          const expanded = !!disclosure && disclosure.getAttribute('aria-expanded') === 'true';
          if (!expanded) return { refused: 'drawer is not expanded — openDrawer did not land' };
          return { cats, mounted: cats > 0, note: cats > 0 ? null : 'lazy chunk still loading' };
        },
        switchDrawer: (w) => {
          const g = scraperState();
          const current = q(w, '.scr-drawer-cat[aria-current="true"]');
          const other = qa(w, '.scr-drawer-cat').find((b) => b !== current);
          if (!current || !other) return { refused: 'drawer categories unavailable' };
          if (g.drawer == null) g.drawer = txt(current);
          other.click();
          return { from: g.drawer, to: txt(other) };
        },
        restoreDrawer: (w) => {
          const g = scraperState();
          const original = qa(w, '.scr-drawer-cat').find((b) => txt(b) === g.drawer);
          if (!original) return { refused: 'original drawer category unavailable' };
          if (original.getAttribute('aria-current') !== 'true') original.click();
          return { restored: g.drawer };
        },
        toggleRail: (w) => {
          const g = scraperState(); const shell = q(w, '.scr-shell');
          const button = q(w, '.scr-topbar-hamburger');
          if (!shell || !button) return { refused: 'rail toggle unavailable' };
          if (g.railCollapsed == null) g.railCollapsed = shell.classList.contains('is-rail-collapsed');
          button.click();
          return { wasCollapsed: g.railCollapsed };
        },
        restoreRail: (w) => {
          const g = scraperState(); const shell = q(w, '.scr-shell');
          const button = q(w, '.scr-topbar-hamburger');
          if (!shell || !button || g.railCollapsed == null) return { refused: 'rail original unavailable' };
          if (shell.classList.contains('is-rail-collapsed') !== g.railCollapsed) button.click();
          return { restoredCollapsed: g.railCollapsed };
        },
        closeSearch: (w) => {
          const input = q(w, '.scr-search > .scr-search-input');
          if (!input) return { refused: 'shell search unavailable' };
          input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
          return { expanded: input.getAttribute('aria-expanded') };
        },
      },
      drive: ['openDrawer', 'drawerReady', 'switchDrawer', 'restoreDrawer', 'toggleRail', 'restoreRail', 'closeSearch'],
      undo: { scraper: (w) => {
        const g = window.__LQP_SCRAPER_ORIG; if (!g) return null;
        const done = [];
        const original = qa(w, '.scr-drawer-cat').find((b) => txt(b) === g.drawer);
        if (original && original.getAttribute('aria-current') !== 'true') { original.click(); done.push('drawer'); }
        const shell = q(w, '.scr-shell'); const rail = q(w, '.scr-topbar-hamburger');
        if (shell && rail && g.railCollapsed != null
            && shell.classList.contains('is-rail-collapsed') !== g.railCollapsed) { rail.click(); done.push('rail'); }
        const input = q(w, '.scr-search > .scr-search-input');
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
        // Drawer LAST: closing it unmounts `.scr-drawer-cat`, so restoring the category
        // above has to happen while the drawer is still rendered.
        const disclosure = q(w, '.scr-topbar-actions button[aria-controls]');
        if (disclosure && g.drawerWasOpen === false
            && disclosure.getAttribute('aria-expanded') === 'true') { disclosure.click(); done.push('drawerClosed'); }
        window.__LQP_SCRAPER_ORIG = null;
        return done.length ? `scraper:${done.join('+')}` : null;
      } },
      mutations: {
        railNavigation: (w) => stripAttr(q(w, '.scr-rail-item[aria-current="page"]'), 'aria-current', 'no current rail item'),
        drawerCategories: (w) => stripAttr(q(w, '.scr-drawer-cat[aria-current="true"]'), 'aria-current', 'no current drawer category'),
        settingsFields: (w) => detach(q(w, '.scr-field .scr-field-control'), 'no settings field control'),
        shellSearch: (w) => stripAttr(q(w, '.scr-search > .scr-search-input'), 'aria-controls', 'no shell search'),
        statusActions: (w) => stripAttr(q(w, '.scr-statusbar button'), 'title', 'no status action'),
        reverseControls: (w) => detach(q(w, '.scr-drawer-head .ui-icon-btn'), 'no drawer close control'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    // L8's first surface. RULE 1's cost check: this is data, not a new probe file.
    resources: {
      titleRe: /Resources|リソース|资源|Ресурс/i,
      rootSel: '.res-view',
      features: [
        {
          // The rail must OFFER every group the list is showing. "One active chip" alone
          // passes on a rail that has silently lost a category, which is the real defect
          // — a category rendered below with no way to filter to it.
          id: 'categoryRail',
          f: (w) => {
            const chips = resChips(w);
            if (chips.length < 2) return { ok: false, ev: `only ${chips.length} filter chips` };
            const active = chips.filter((c) => c.classList.contains('active'));
            const labels = chips.map((c) => txt(c));
            const groups = qa(w, '.res-group .res-group-head h2').map((h) => txt(h));
            const offered = groups.filter((g) => labels.indexOf(g) >= 0);
            return {
              ok: active.length === 1 && groups.length > 0 && offered.length === groups.length,
              ev: `chips=${chips.length} active=${active.length} groups=${groups.length} offeredAsChips=${offered.length}`,
            };
          },
        },
        {
          // The footer count is the surface's own claim about the filtered catalogue, and
          // it must equal what is painted. Scoped to `.res-group` on purpose: the New and
          // My-tools strips also render `.res-card`, and counting those made the claim
          // read 51 against a line that says 36.
          id: 'catalogueCount',
          f: (w) => {
            const cards = groupCards(w);
            const el = q(w, '.gram-count');
            if (!el) return { ok: false, ev: 'no visible-count line' };
            const claimed = Number(txt(el).replace(/[^\d]/g, ''));
            return {
              ok: cards.length > 0 && claimed === cards.length,
              ev: `claimed=${claimed} renderedGroupCards=${cards.length}`,
            };
          },
        },
        {
          // Content honesty per card: a name, a cost chip that says which of free/paid/
          // freemium it is, the host it will actually open, and the external affordance.
          // A card missing the cost chip is the "looks like a link, is a purchase" defect.
          id: 'resourceCards',
          f: (w) => {
            const cards = groupCards(w);
            if (!cards.length) return { ok: false, ev: 'no catalogue cards rendered' };
            const named = cards.filter((c) => txt(q(c, '.res-name')).length > 0).length;
            const costed = cards.filter((c) => txt(q(c, '.res-cost')).length > 0).length;
            const hosted = cards.filter((c) => txt(q(c, '.res-host')).length > 0).length;
            const opens = cards.filter((c) => q(c, '.res-open')).length;
            return {
              ok: named === cards.length && costed === cards.length
                && hosted === cards.length && opens === cards.length,
              ev: `cards=${cards.length} named=${named} costed=${costed} hosted=${hosted} external=${opens}`,
            };
          },
        },
        {
          // Bundles, with the one piece of arithmetic they publish: a checklist tile may
          // never claim more ticks than the checklist holds. `0/5` is fine; `6/5` is the
          // fabricated-progress defect and is exactly what a stale localStorage list does.
          id: 'bundleGrid',
          f: (w) => {
            const section = q(w, '.bundles-section');
            if (!section) return { ok: false, ev: 'no bundles section on the landing view' };
            const cards = qa(section, '.bundle-card');
            if (!cards.length) return { ok: false, ev: 'bundles section rendered with no bundles' };
            const gemmed = cards.filter((c) => txt(q(c, '.bundle-card-gem')).length > 0).length;
            const titled = cards.filter((c) => txt(q(c, '.bundle-card-title')).length > 0).length;
            const linked = cards.filter(
              (c) => Number(txt(q(c, '.bundle-card-foot span')).replace(/[^\d]/g, '')) > 0,
            ).length;
            const progress = cards
              .map((c) => txt(q(c, '.bundle-card-checkmark')))
              .filter((s) => s.length > 0)
              .map((s) => (s.match(/(\d+)\s*\/\s*(\d+)/) || []).slice(1).map(Number));
            const sane = progress.filter((p) => p.length === 2 && p[0] <= p[1]).length;
            return {
              ok: gemmed === cards.length && titled === cards.length
                && linked === cards.length && sane === progress.length,
              ev: `bundles=${cards.length} gemmed=${gemmed} titled=${titled} withLinkCount=${linked} progressSane=${sane}/${progress.length}`,
            };
          },
        },
        {
          // The two OPTIONAL strips. Both render `null` when empty, so absence is honest
          // and is recorded as such rather than scored false — what is not allowed is a
          // heading over an empty grid, or a collected tool with no way to remove it
          // (the "enable with no working disable" defect in its list form).
          id: 'collectedSections',
          f: (w) => {
            const parts = [];
            let ok = true;
            const mine = q(w, '.mytools-section');
            if (mine) {
              const cards = qa(mine, '.mytool-card');
              const named = cards.filter((c) => txt(q(c, '.mytool-name')).length > 0).length;
              const removable = cards.filter((c) => q(c, '.mytool-remove')).length;
              ok = ok && cards.length > 0 && named === cards.length && removable === cards.length;
              parts.push(`myTools=${cards.length} named=${named} removable=${removable}`);
            } else {
              parts.push('myTools=absent (nothing collected — section correctly unrendered)');
            }
            const fresh = q(w, '.new-section');
            if (fresh) {
              const cards = qa(fresh, '.new-card');
              const named = cards.filter((c) => txt(q(c, '.res-name')).length > 0).length;
              const hosted = cards.filter((c) => txt(q(c, '.res-host')).length > 0).length;
              ok = ok && cards.length > 0 && named === cards.length && hosted === cards.length;
              parts.push(`new=${cards.length} named=${named} hosted=${hosted}`);
            } else {
              parts.push('new=absent (no recent entries — section correctly unrendered)');
            }
            return { ok, ev: parts.join(' | ') };
          },
        },
        {
          // The choropleth's caption claims a number of countries; exactly that many map
          // paths may be painted. `colorFor` returns `var(--panel-2)` for a zero count, so
          // "painted" is a fact about the fill and not about the palette.
          //
          // THE FIRST NUMBER IN THE CAPTION IS `{count}` IN ALL FOUR CATALOGS — checked,
          // not assumed: en/ja/zh/ru all order `{count}` before `{total}`. Reading the
          // largest number instead would score the learner total against the path count.
          id: 'learnerHeatMap',
          f: (w) => {
            const section = q(w, '.heatmap-section');
            if (!section) {
              return { ok: true, ev: 'no learner counts — section correctly not rendered' };
            }
            const caption = txt(q(section, '.heatmap-caption'));
            const claimed = Number((caption.match(/\d[\d,.  ]*/) || ['0'])[0].replace(/[^\d]/g, ''));
            const paths = qa(section, '.heatmap-svg path');
            if (paths.length) {
              const painted = paths.filter((p) => (p.getAttribute('fill') || '') !== 'var(--panel-2)').length;
              return {
                ok: claimed > 0 && painted === claimed,
                ev: `choropleth paths=${paths.length} painted=${painted} captionCountries=${claimed}`,
              };
            }
            const rows = qa(section, '.heatmap-bar-row');
            if (!rows.length) return { ok: false, ev: `caption "${caption}" over neither a map nor bars` };
            const counts = rows.map((r) => Number(txt(q(r, '.heatmap-bar-count')).replace(/[^\d]/g, '')));
            const max = Math.max.apply(null, counts);
            // The bar is painted by percentage of the largest country; the widest bar is
            // therefore 100% by construction, and every other one must be its own share.
            const honest = rows.filter((r, i) => {
              const pct = Number(String(q(r, '.heatmap-bar-fill').style.width).replace('%', ''));
              return max > 0 && Math.abs(pct - (counts[i] / max) * 100) <= 1;
            }).length;
            return {
              ok: rows.length > 0 && honest === rows.length && claimed >= rows.length,
              ev: `bars=${rows.length} widthsMatchShare=${honest} max=${max} captionCountries=${claimed}`,
            };
          },
        },
        {
          // The landing sections and the command surface must AGREE. `showLanding` is
          // `filter === 'All' && !query.trim()`, and the bundles strip is the one landing
          // section with no data condition of its own, so it is the exact witness.
          //
          // This row is why the L8 doc's trap 1 cost a wrong score: a stale `"dict"` in the
          // field made `showLanding` false and half the surface simply was not mounted.
          // Scored here, that state is a FAILURE of nothing — it is the agreement holding —
          // but the row publishes the query so no later reader mistakes it for the default.
          id: 'landingAgreement',
          f: (w) => {
            const search = q(w, '.gram-search');
            if (!search) return { ok: false, ev: 'no catalogue search field' };
            const chips = resChips(w);
            const allActive = !!(chips[0] && chips[0].classList.contains('active'));
            const landing = search.value.trim() === '' && allActive;
            const mounted = ['.heatmap-section', '.bundles-section', '.mytools-section', '.new-section']
              .filter((s) => q(w, s)).length;
            const bundles = !!q(w, '.bundles-section');
            return {
              ok: bundles === landing,
              ev: `query="${search.value}" allChipActive=${allActive} showLanding=${landing} bundlesMounted=${bundles} landingSections=${mounted}`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        // ONE idempotent step rather than `showAll` + `clearSearch` + a conditional close.
        // The driver dirties the first visible text field before it drives, and a bundle
        // left open from a previous leg unmounts the whole list, so every leg of the drive
        // has to be able to get back to the landing view without refusing.
        toLanding: (w) => {
          const done = [];
          const back = q(w, '.bundle-back');
          if (back) { back.click(); done.push('closedBundle'); }
          const el = q(w, '.gram-search');
          if (el && el.value !== '') { typeInto(el, ''); done.push('clearedSearch'); }
          const all = resChips(w)[0];
          if (all && !all.classList.contains('active')) { all.click(); done.push('allCategories'); }
          return { did: done.join('+') || 'already on the landing view', groups: qa(w, '.res-group').length };
        },
        filterCategory: (w, index) => {
          const chip = resChips(w).slice(1)[Number(index) || 0];
          if (!chip) return { refused: 'no category chips' };
          chip.click();
          return { clicked: txt(chip) };
        },
        search: (w, query) => {
          const el = q(w, '.gram-search');
          if (!el) return { refused: 'no catalogue search field' };
          typeInto(el, String(query == null ? '' : query));
          return { query: el.value, count: txt(q(w, '.gram-count')) };
        },
        // The reversibility pair this surface owns: the bundle sub-screen REPLACES the
        // whole list, so a back control that does not work strands the user on one bundle.
        openBundle: (w, index) => {
          const card = qa(w, '.bundle-card')[Number(index) || 0];
          if (!card) return { refused: 'no bundle cards — not on the landing view' };
          card.click();
          return { opened: txt(q(card, '.bundle-card-gem')) };
        },
        closeBundle: (w) => {
          const back = q(w, '.bundle-back');
          if (!back) return { refused: 'no bundle detail open' };
          back.click();
          return { closed: true, detailGone: !q(w, '.bundle-detail') };
        },
        // The drive deliberately ends with the search box EMPTY, so scroll is the only
        // user-entered state a bad presentation toggle can lose. Recorded once so `undo`
        // puts the catalogue back where the user left it.
        scroll: (w, px) => {
          const el = scroller(w);
          if (!el) return { refused: 'nothing scrollable — the catalogue fits its pane' };
          const g = resState();
          if (g.scrollKey == null) { g.scrollKey = keyOf(el); g.scrollTop = el.scrollTop; }
          el.scrollTop = Number(px) || 240;
          return { scroller: keyOf(el), top: el.scrollTop, range: el.scrollHeight - el.clientHeight };
        },
      },
      drive: [
        'toLanding',
        ['openBundle', '0'],
        'closeBundle',
        ['filterCategory', '0'],
        'toLanding',
        ['search', 'anki'],
        'toLanding',
        ['scroll', '240'],
      ],
      undo: {
        resources: (w) => {
          const g = window.__LQP_RES_ORIG;
          if (!g) return null;
          const done = [];
          const back = q(w, '.bundle-back');
          if (back) { back.click(); done.push('bundle'); }
          const el = q(w, '.gram-search');
          if (el && el.value !== '') { typeInto(el, ''); done.push('search'); }
          if (g.scrollKey != null) {
            const home = qa(w, '*').find((e) => keyOf(e) === g.scrollKey);
            if (home && home.scrollTop !== g.scrollTop) { home.scrollTop = g.scrollTop; done.push('scroll'); }
          }
          window.__LQP_RES_ORIG = null;
          return done.length ? `resources:${done.join('+')}` : null;
        },
      },
      mutations: {
        // A SECOND active chip. `landingAgreement` reads chips[0] (All), which is the one
        // already active, so this never touches it — the two rows stay independent.
        categoryRail: (w) => {
          const other = resChips(w).find((c) => !c.classList.contains('active'));
          if (!other) return { refused: 'no inactive chip to falsify with' };
          return addClassAll([other], 'active');
        },
        // Detach a CARD, not the count line. Removing the line only proves the row reads
        // it; removing a card makes the published number wrong while every remaining card
        // is still well-formed, so `resourceCards` correctly holds and this falls alone.
        catalogueCount: (w) => detach(groupCards(w)[0], 'no catalogue cards'),
        resourceCards: (w) => detach(q(w, '.res-group .res-card .res-name'), 'no catalogue cards'),
        bundleGrid: (w) => detach(q(w, '.bundle-card .bundle-card-gem'), 'no bundle cards'),
        collectedSections: (w) => detach(q(w, '.mytool-card .mytool-remove'), 'no collected tools'),
        // LIE about one country's fill rather than detaching a path: detaching changes the
        // path total too, and the row would fall for the wrong reason.
        learnerHeatMap: (w) => setAttr(
          qa(w, '.heatmap-svg path').find((p) => (p.getAttribute('fill') || '') !== 'var(--panel-2)'),
          'fill',
          'var(--panel-2)',
          'no painted country on the heat map',
        ),
        landingAgreement: (w) => detach(q(w, '.gram-search'), 'no catalogue search field'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    // L8's third surface. Data, not a new probe file — same RULE 1 cost check as `resources`.
    settings: {
      titleRe: /^(Settings|設定|设置|Настройки)$/i,
      rootSel: '.os-settings-v2',
      features: [
        {
          // The rail is the only route to 18 of the 19 pages, so "one active item" alone is
          // not the row: an item whose label was deleted is unreachable to a screen reader
          // and, since 2026-08-30, invisible to a pointer user too — below 420px of
          // `.os-set-body` the label is clipped and `title` is the only text left. Both are
          // counted, so the narrow tier cannot silently strand an item.
          id: 'categoryRail',
          f: (w) => {
            const items = qa(w, '.os-set-nav-item');
            const current = items.filter((b) => b.getAttribute('aria-current') === 'page');
            const named = items.filter((b) => txt(q(b, 'span:not([class])')).length > 0);
            const titled = items.filter((b) => (b.title || '').trim().length > 0);
            return {
              ok: items.length >= 10 && current.length === 1
                && named.length === items.length && titled.length === items.length,
              ev: `items=${items.length} current=${current.length} named=${named.length} titled=${titled.length}`,
            };
          },
        },
        {
          // Grouping is what keeps 19 destinations navigable. Each group must publish a
          // label AND wire its list to it — an unlabelled `<ul>` of buttons is the "dense
          // work" shape category 3 also refuses.
          id: 'groupedNavigation',
          f: (w) => {
            const groups = qa(w, '.os-set-nav-group');
            const labelled = groups.filter((g) => txt(q(g, '.os-set-nav-group-label')).length > 0);
            const lists = qa(w, '.os-set-nav-list');
            const wired = lists.filter((l) => {
              const id = l.getAttribute('aria-labelledby');
              return !!id && !!q(w, `#${id}`);
            });
            return {
              ok: groups.length >= 3 && labelled.length === groups.length
                && lists.length === groups.length && wired.length === lists.length,
              ev: `groups=${groups.length} labelled=${labelled.length} lists=${lists.length} wired=${wired.length}`,
            };
          },
        },
        {
          // Settings search is the second route in, and the one the command palette uses.
          // Collapsed at rest is part of the contract: an `aria-expanded` that never says
          // false is the dishonest-state shape. So the row scores the DISMISSAL, not the
          // attribute's spelling — the drive opens the panel with a real query and Escape has
          // to take it back down, panel unmounted, read in its own leg. `expanded` being a
          // well-formed boolean was the old bar and a widget stuck open passes it.
          id: 'settingsSearch',
          f: (w) => {
            const g = settingsState();
            const input = q(w, '.os-set-search-input');
            const controls = input && input.getAttribute('aria-controls');
            const expanded = input && input.getAttribute('aria-expanded');
            return {
              ok: !!input && !input.disabled && !!controls && /^(true|false)$/.test(String(expanded))
                && g.collapsedAfterEscape === true,
              ev: `input=${!!input} controls=${controls || 'absent'} expanded=${expanded} dismissal=${g.searchEv || 'not driven'}`,
            };
          },
        },
        {
          // Advanced mode is this surface's own progressive disclosure. The row is the
          // AGREEMENT, not the button: `aria-pressed` must be a real boolean and the rail
          // must actually be showing advanced destinations when it says true, and none when
          // it says false. A toggle whose claim and rail disagree is the defect.
          id: 'advancedDisclosure',
          f: (w) => {
            const btn = q(w, '.os-set-advanced-btn');
            const pressed = btn && btn.getAttribute('aria-pressed');
            const dots = qa(w, '.os-set-adv-dot').length;
            const agrees = pressed === 'true' ? dots > 0 : dots === 0;
            return {
              ok: !!btn && /^(true|false)$/.test(String(pressed)) && agrees
                && (btn.title || '').trim().length > 0,
              ev: `pressed=${pressed} advancedItemsInRail=${dots} agrees=${agrees}`,
            };
          },
        },
        {
          // The pane is the app's `main` landmark and names itself after the destination the
          // rail says is current. A stale or blank name is how a keyboard user loses track of
          // which page they are on after a rail click.
          id: 'pageRegion',
          f: (w) => {
            const pane = q(w, '.os-set-pane-v2');
            const label = pane && (pane.getAttribute('aria-label') || '').trim();
            const page = pane && pane.getAttribute('data-settings-page');
            const current = q(w, '.os-set-nav-item[aria-current="page"]');
            const currentLabel = txt(q(current || w, 'span:not([class])'));
            return {
              ok: !!pane && pane.getAttribute('role') === 'main' && !!label
                && !!page && label === currentLabel,
              ev: `role=${pane && pane.getAttribute('role')} page=${page} label=${label} rail=${currentLabel}`,
            };
          },
        },
        {
          // The Home overview is real content, not a splash: every status chip publishes a
          // labelled value and every quick card is a working destination.
          id: 'homeOverview',
          f: (w) => {
            const chips = qa(w, '.os-set-status-chip');
            const valued = chips.filter((c) => txt(q(c, 'strong')).length > 0 && txt(q(c, '.muted')).length > 0);
            const cards = qa(w, '.os-set-quick-card');
            const live = cards.filter((c) => txt(c).length > 0 && !c.disabled);
            return {
              ok: chips.length >= 3 && valued.length === chips.length
                && cards.length >= 4 && live.length === cards.length,
              ev: `chips=${chips.length} valued=${valued.length} quickCards=${cards.length} live=${live.length}`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        // Every leg has to be able to get back to Home: the drive dirties the search box and
        // scrolls the pane, and both are page-scoped, so a leg that ran from a deep page would
        // measure a different scroller than the one `undo` restores.
        toHome: (w) => {
          const g = settingsState();
          const pane = q(w, '.os-set-pane-v2');
          if (g.page == null) {
            g.page = pane ? pane.getAttribute('data-settings-page') : null;
            // The rail is clicked by LABEL on the way back, because `data-settings-page`
            // is not on the button. Recorded in the same breath as the page id so the two
            // can never disagree.
            g.pageLabel = txt(q(q(w, '.os-set-nav-item[aria-current="page"]') || w, 'span:not([class])'));
          }
          const el = q(w, '.os-set-search-input');
          const done = [];
          if (el && el.value !== '') { typeInto(el, ''); done.push('clearedSearch'); }
          const home = qa(w, '.os-set-nav-item')[0];
          if (!home) return { refused: 'no rail items' };
          if (home.getAttribute('aria-current') !== 'page') { home.click(); done.push('navigatedHome'); }
          return { did: done.join('+') || 'already on Home', from: g.page };
        },
        openPage: (w, index) => {
          const items = qa(w, '.os-set-nav-item').slice(1);
          const item = items[Number(index) || 0];
          if (!item) return { refused: 'no rail destinations' };
          item.click();
          return { clicked: txt(q(item, 'span:not([class])')) };
        },
        search: (w, query) => {
          const el = q(w, '.os-set-search-input');
          if (!el) return { refused: 'no settings search field' };
          typeInto(el, String(query == null ? '' : query));
          return { query: el.value, expanded: el.getAttribute('aria-expanded') };
        },
        // MANDATORY after any `search` leg, and it is not politeness. `SettingsSearch` opens
        // its panel `onFocus` and closes it on a 140 ms `onBlur` timer; React's onBlur is
        // `focusout`, so a synthetic blur commits nothing and the panel stays open with an
        // EMPTY query. That is not a product state — it is drive residue, and it cost a
        // category-5 run: Q4 counts `[aria-expanded="false"]` as the surface's one collapsed
        // disclosure, so a left-open panel scored a real 10 as a 9.
        //
        // THE ESCAPE HANDLER IS SYNCHRONOUS; THE ATTRIBUTE IS NOT. This step used to return
        // `aria-expanded` read in the same expression as the dispatch, and it therefore
        // reported `"true"` on every run — the pre-render value, because React commits the
        // state change after the dispatching task. Measured 2026-09-02: the receipt said
        // `expanded:"true"` while the live surface, read one call later, was
        // `expanded:"false" panelMounted:false`. A worker reading that receipt would file
        // drive residue that is not there, which is exactly the false finding the comment
        // above exists to prevent. So the dispatch and the read are now two legs, the way
        // `blancShell` already splits `closeSearch` / `readSearchClosed`.
        closeSearch: (w) => {
          const el = q(w, '.os-set-search-input');
          if (!el) return { refused: 'no settings search field' };
          el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
          return { sent: 'Escape' };
        },
        readSearchClosed: (w) => {
          const g = settingsState();
          const el = q(w, '.os-set-search-input');
          if (!el) return { refused: 'no settings search field' };
          const panelId = el.getAttribute('aria-controls');
          const panel = panelId ? q(w, `#${panelId}`) || document.getElementById(panelId) : null;
          g.collapsedAfterEscape = el.getAttribute('aria-expanded') === 'false' && !panel;
          g.searchEv = `expandedAfterEscape=${el.getAttribute('aria-expanded')} panelMounted=${!!panel}`;
          if (!g.collapsedAfterEscape) {
            return { refused: `Escape left the search panel open — ${g.searchEv}` };
          }
          return { collapsedAfterEscape: true, ev: g.searchEv };
        },
        // The drive ends with the search box EMPTY on purpose, so the pane's scroll offset is
        // the only user-entered state left for a bad presentation toggle to lose.
        scroll: (w, px) => {
          const el = q(w, '.os-set-pane-v2') || scroller(w);
          if (!el || el.scrollHeight - el.clientHeight < 8) {
            return { refused: 'the settings pane fits its window — nothing to scroll' };
          }
          const g = settingsState();
          if (g.scrollTop == null) g.scrollTop = el.scrollTop;
          el.scrollTop = Number(px) || 120;
          return { scroller: keyOf(el), top: el.scrollTop, range: el.scrollHeight - el.clientHeight };
        },
      },
      drive: [
        'toHome',
        ['openPage', '0'],
        'toHome',
        ['search', 'theme'],
        ['search', ''],
        'closeSearch',
        'readSearchClosed',
        ['scroll', '120'],
      ],
      undo: {
        settings: (w) => {
          const g = window.__LQP_SETTINGS_ORIG;
          if (!g) return null;
          const done = [];
          const el = q(w, '.os-set-search-input');
          if (el && el.value !== '') { typeInto(el, ''); done.push('search'); }
          if (el && el.getAttribute('aria-expanded') === 'true') {
            el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
            done.push('searchPanel');
          }
          if (g.page != null) {
            const pane = q(w, '.os-set-pane-v2');
            if (pane && pane.getAttribute('data-settings-page') !== g.page && g.pageLabel) {
              const back = qa(w, '.os-set-nav-item')
                .find((b) => txt(q(b, 'span:not([class])')) === g.pageLabel);
              if (back) { back.click(); done.push('page'); }
            }
          }
          const pane2 = q(w, '.os-set-pane-v2');
          if (pane2 && g.scrollTop != null && pane2.scrollTop !== g.scrollTop) {
            pane2.scrollTop = g.scrollTop; done.push('scroll');
          }
          window.__LQP_SETTINGS_ORIG = null;
          return done.length ? `settings:${done.join('+')}` : null;
        },
      },
      mutations: {
        categoryRail: (w) => stripAttr(q(w, '.os-set-nav-item[aria-current="page"]'), 'aria-current', 'no current rail item'),
        groupedNavigation: (w) => stripAttr(q(w, '.os-set-nav-list'), 'aria-labelledby', 'no rail lists'),
        settingsSearch: (w) => stripAttr(q(w, '.os-set-search-input'), 'aria-controls', 'no settings search'),
        // Strip the button's OWN pressed state. `windowLifecycle` reads `.fwin-b-liquid`, a
        // different element, so the two rows stay independent.
        advancedDisclosure: (w) => stripAttr(q(w, '.os-set-advanced-btn'), 'aria-pressed', 'no advanced toggle'),
        // Detach the pane's LABEL, not the pane: removing the pane takes `homeOverview` with
        // it and the row would fall for the wrong reason.
        pageRegion: (w) => stripAttr(q(w, '.os-set-pane-v2'), 'aria-label', 'no settings pane'),
        homeOverview: (w) => detach(q(w, '.os-set-status-chip strong'), 'no home status chips'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    // L8's fourth surface, and the last one with no category-6 spec at all: the run VOIDed on
    // `no category-6 baseline at baselines/cat6-youtube.json`. Data, not a new probe file —
    // same RULE 1 cost check as `resources` and `settings`.
    //
    // What this spec deliberately does NOT score: the AppChrome menu bar and status strip.
    // Measured live on this window rather than assumed — `.fwin-body` has exactly one child,
    // `.yt-shell`, and `.ui-statusbar__field` and menu buttons both count 0 — so in this host
    // they are not rendered at all. Scoring an absent host affordance as a missing feature
    // would invent a regression against the app.
    //
    // What it will not TOUCH: `setLang`, `toggleSub`, `setPlaylistField`, `setSortPref`,
    // `setAutoUpdate` and `moveToFolder` all write through `window.api.ytSetPlaylistPrefs`
    // into the user's real store, and `refresh`/`downloadAll` reach the network. The drive is
    // confined to state that lives in the view — the folder-name draft, the active tab and the
    // row selection — so a run that dies halfway leaves nothing persisted behind it.
    youtube: {
      titleRe: /YouTube|ユーチューブ/i,
      rootSel: '.yt-root',
      features: [
        {
          // The rail is the only route to a playlist and Plan to watch the only route to the
          // cross-playlist queue. Scored as AGREEMENTS rather than counts: exactly one entry
          // may claim `active`, and the plan entry's badge has to be a real number — a badge
          // that says nothing is how an empty queue and a broken queue look alike.
          id: 'playlistRail',
          f: (w) => {
            const items = qa(w, '.yt-pl-item');
            const titled = items.filter((b) => txt(q(b, '.yt-pl-item-title')).length > 0);
            const active = items.filter((b) => b.classList.contains('active'));
            const plan = q(w, '.yt-plan-item');
            const badge = plan ? txt(q(plan, '.yt-pl-item-meta')) : '';
            return {
              ok: items.length >= 2 && titled.length === items.length
                && active.length === 1 && !!plan && /^\d+$/.test(badge),
              ev: `items=${items.length} titled=${titled.length} active=${active.length} planBadge=${badge || 'absent'}`,
            };
          },
        },
        {
          // Folders are this surface's filing system. Every group publishes a head with a
          // name, and every playlist button lives inside one — an orphan `.yt-pl-item` is a
          // playlist the user can open but can never file, which is the parity gap. Unfiled
          // is itself a `.yt-folder`, so "filed" here means placed, not non-empty.
          id: 'folderTree',
          f: (w) => {
            const folders = qa(w, '.yt-folder');
            const headed = folders.filter((f) => txt(q(f, '.yt-folder-head')).length > 0);
            const all = qa(w, '.yt-tree .yt-pl-item:not(.yt-plan-item)');
            const filed = all.filter((b) => !!b.closest('.yt-folder'));
            return {
              ok: folders.length >= 1 && headed.length === folders.length
                && all.length > 0 && filed.length === all.length,
              ev: `folders=${folders.length} headed=${headed.length} playlists=${all.length} filed=${filed.length}`,
            };
          },
        },
        {
          // Add-by-URL, scored as the agreement rather than as presence: the submit is
          // disabled exactly when the field is blank. `cat6-feature-parity.cjs` dirties this
          // field with its own round-trip mark before the drive, so a run exercises BOTH
          // sides of the agreement instead of only the resting empty one.
          id: 'addPlaylist',
          f: (w) => {
            const input = q(w, '.yt-add input');
            const submit = q(w, '.yt-add button');
            const empty = !input || input.value.trim().length === 0;
            return {
              ok: !!input && !!submit && !input.disabled && submit.disabled === empty,
              ev: `field="${input ? input.value : ''}" submitDisabled=${submit && submit.disabled} expected=${empty}`,
            };
          },
        },
        {
          // Two panes, one strip. Exactly one tab claims `active` and the pane it claims is
          // the one that mounted — the preference form only ever renders under the playlist
          // tab, so a strip that says News with `.yt-prefs` on screen is the stale-nav defect.
          id: 'tabSwitching',
          f: (w) => {
            const tabs = qa(w, '.yt-tab');
            const active = tabs.filter((b) => b.classList.contains('active'));
            const onNews = active.length === 1 && active[0] === tabs[0];
            const list = q(w, '.yt-list');
            const prefs = q(w, '.yt-prefs');
            const agrees = onNews ? !prefs : !!list;
            return {
              ok: tabs.length === 2 && active.length === 1 && agrees,
              ev: `tabs=${tabs.length} active=${active.length} onNews=${onNews} list=${!!list} prefs=${!!prefs}`,
            };
          },
        },
        {
          // The list is virtualised, so this counts what is PAINTED and requires every painted
          // row to carry all three things a user picks a video by — title, a real thumbnail
          // URL, and the duration/view meta — plus its list semantics. A row with a blank
          // title is the fabricated-row shape category 8 also refuses.
          id: 'videoRows',
          f: (w) => {
            const rows = qa(w, '.yt-list .yt-row');
            const titled = rows.filter((r) => txt(q(r, '.yt-row-title')).length > 0);
            const thumbed = rows.filter((r) => {
              const img = q(r, '.yt-thumb');
              return !!img && (img.getAttribute('src') || '').length > 0;
            });
            const meta = rows.filter((r) => txt(q(r, '.yt-row-meta')).length > 0);
            const items = qa(w, '.yt-list [role="listitem"]');
            return {
              ok: rows.length > 0 && titled.length === rows.length
                && thumbed.length === rows.length && meta.length === rows.length
                && items.length === rows.length,
              ev: `rows=${rows.length} titled=${titled.length} thumbed=${thumbed.length} meta=${meta.length} listitems=${items.length}`,
            };
          },
        },
        {
          // Three per-row actions — plan, log, open in the player — and the third is scored as
          // an agreement in ONE direction only: it may be enabled only for a row that really
          // has a downloaded file. Stated one-way on purpose, because the product also
          // disables it for a downloaded row with no `mediaItemId`, which is honest; an
          // always-enabled Open is the dishonest control this row exists to catch.
          id: 'rowActions',
          f: (w) => {
            const rows = qa(w, '.yt-list .yt-row');
            const triples = rows.filter((r) => qa(r, '.yt-row-actions button').length === 3);
            const titledAll = rows.filter((r) => qa(r, '.yt-row-actions button')
              .every((b) => (b.title || '').trim().length > 0));
            const agrees = rows.filter((r) => {
              const open = qa(r, '.yt-row-actions button')[2];
              return !!open && (open.disabled || !!q(r, '.yt-chip.dl'));
            });
            return {
              ok: rows.length > 0 && triples.length === rows.length
                && titledAll.length === rows.length && agrees.length === rows.length,
              ev: `rows=${rows.length} threeActions=${triples.length} titled=${titledAll.length} openImpliesDownloaded=${agrees.length}`,
            };
          },
        },
        {
          // The header's batch actions are gated on a selection, and the gate IS the row: Log
          // and the plan button must be disabled exactly when nothing is selected. The drive
          // ctrl-clicks a row first, so this is measured with the gate open rather than only
          // in its resting closed state. `selected` counts PAINTED rows — the virtual list is
          // fully painted at this size, and the evidence prints the count either way.
          id: 'selectionActions',
          f: (w) => {
            const actions = qa(w, '.yt-header-actions button');
            const primary = actions.find((b) => b.classList.contains('primary'));
            const plan = actions[actions.length - 1];
            const selected = qa(w, '.yt-list .yt-row.selected').length;
            const want = selected === 0;
            return {
              ok: actions.length >= 3 && !!primary && !!plan && primary !== plan
                && primary.disabled === want && plan.disabled === want,
              ev: `actions=${actions.length} selected=${selected} logDisabled=${primary && primary.disabled} planDisabled=${plan && plan.disabled} expected=${want}`,
            };
          },
        },
        {
          // The preference form is the playlist's whole configuration surface and every row
          // must be both LABELLED and LIVE: a named control whose value is blank and whose
          // placeholder is blank too is indistinguishable from one that never loaded. The
          // sub-language chips are counted apart because they are a chip group, not a control.
          id: 'playlistPreferences',
          f: (w) => {
            const prefs = qa(w, '.yt-prefs .yt-pref');
            const named = prefs.filter((p) => txt(p).length > 0);
            const controls = qa(w, '.yt-prefs select, .yt-prefs input');
            const valued = controls.filter((c) => (c.type === 'checkbox'
              ? typeof c.checked === 'boolean'
              : String(c.value).length > 0 || (c.placeholder || '').length > 0));
            const chips = qa(w, '.yt-prefs .yt-chip');
            return {
              ok: prefs.length >= 8 && named.length === prefs.length
                && controls.length >= 8 && valued.length === controls.length
                && chips.length >= 2,
              ev: `prefs=${prefs.length} named=${named.length} controls=${controls.length} valued=${valued.length} subChips=${chips.length}`,
            };
          },
        },
        {
          // The two disclosures added for category 5 are FEATURES, so they enter the ledger
          // the moment they ship: a surface that tucks tools away and cannot get them back is
          // the enable-with-no-disable-path defect in miniature. The row is deliberately
          // INDEPENDENT of whether they are open — the drive opens one and the undo closes
          // it, and a row that flipped with that would report drive residue as a regression.
          // What it asserts is that each one names itself and still HOLDS its controls in the
          // DOM whatever its state, i.e. the tools were tucked away and not deleted.
          id: 'progressiveDisclosure',
          f: (w) => {
            const all = qa(w, '.yt-side-tools, .yt-prefs-disclosure');
            const summaried = all.filter((d) => txt(q(d, 'summary')).length > 0);
            const held = all.filter((d) => qa(d, 'button,input,select').length > 0);
            const real = all.filter((d) => typeof d.open === 'boolean');
            return {
              ok: all.length === 2 && summaried.length === 2
                && held.length === 2 && real.length === 2,
              ev: `disclosures=${all.length} summaried=${summaried.length} controlsHeld=${held.length} open=${all.filter((d) => d.open).length}`,
            };
          },
        },
        { id: 'windowLifecycle', f: (w) => lifecycle(w) },
      ],
      steps: {
        // Opened FIRST, because the folder field lives inside it. Typing into a field the user
        // cannot see would still have passed — `typeInto` does not care — and the drive would
        // then have proved nothing about the disclosure it was reaching through.
        openTools: (w) => {
          const g = ytState();
          const d = q(w, '.yt-side-tools');
          if (!d) return { refused: 'no side-tools disclosure' };
          if (g.tools == null) g.tools = d.open;
          d.open = true;
          return { was: g.tools, now: d.open };
        },
        // The FOLDER-name draft, not the add-URL field, and that is not a preference:
        // `cat6-feature-parity.cjs` dirties the first editable text input on the surface —
        // which is the add field — and afterwards hunts for its own mark to put it back.
        // Typing over it makes that hunt refuse and leaves the driver's mark unrestored in
        // the user's running app.
        draftFolder: (w, name) => {
          const g = ytState();
          const el = q(w, '.yt-folder-add input');
          if (!el) return { refused: 'no folder-name field' };
          if (g.folder == null) g.folder = el.value;
          typeInto(el, String(name == null ? 'lqp-folder-draft' : name));
          return { was: g.folder, now: el.value };
        },
        openNews: (w) => {
          const g = ytState();
          const tabs = qa(w, '.yt-tab');
          if (tabs.length < 2) return { refused: 'no tab strip' };
          if (g.tab == null) g.tab = tabs.findIndex((b) => b.classList.contains('active'));
          tabs[0].click();
          return { from: g.tab, clicked: txt(tabs[0]) };
        },
        openPlaylist: (w) => {
          const tabs = qa(w, '.yt-tab');
          if (tabs.length < 2) return { refused: 'no tab strip' };
          tabs[1].click();
          return { clicked: txt(tabs[1]) };
        },
        // CTRL-click, because a plain click on a downloaded row calls `onRowActivate` and
        // opens it in the video player — a probe that starts playback is not a measurement.
        // React reads `ctrlKey` off the native event, so the modifier has to be on the
        // dispatched event; setting it on the element afterwards produces a plain click.
        selectRow: (w) => {
          const g = ytState();
          const rows = qa(w, '.yt-list .yt-row');
          if (!rows.length) return { refused: 'no painted rows to select' };
          if (g.selected == null) {
            g.selected = qa(w, '.yt-list .yt-row.selected').map((r) => txt(q(r, '.yt-row-title')));
          }
          rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
          return { was: g.selected.length, clicked: txt(q(rows[0], '.yt-row-title')).slice(0, 40) };
        },
      },
      // News first and the playlist tab LAST, so the run ends on the populated pane. The
      // product opens on News, which is empty on this profile, and an empty harness caps a
      // category at 0 — the same trap that scored this surface's other categories.
      drive: ['openTools', 'draftFolder', 'openNews', 'openPlaylist', 'selectRow'],
      undo: {
        youtube: (w) => {
          const g = window.__LQP_YT_ORIG;
          if (!g) return null;
          const done = [];
          const folder = q(w, '.yt-folder-add input');
          if (folder && g.folder != null && folder.value !== g.folder) {
            typeInto(folder, g.folder);
            done.push('folder');
          }
          // Selection BEFORE the tab, and the order is load-bearing: `restore()` is one
          // synchronous call, so a tab click that unmounts the list leaves the following
          // selection sweep with zero rows to walk and silently restores nothing.
          if (g.selected != null) {
            const want = new Set(g.selected);
            qa(w, '.yt-list .yt-row').forEach((r) => {
              const title = txt(q(r, '.yt-row-title'));
              if (r.classList.contains('selected') !== want.has(title)) {
                r.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
                done.push('selection');
              }
            });
          }
          if (g.tab != null) {
            const tabs = qa(w, '.yt-tab');
            const now = tabs.findIndex((b) => b.classList.contains('active'));
            if (tabs[g.tab] && now !== g.tab) { tabs[g.tab].click(); done.push('tab'); }
          }
          // LAST, and after the folder field has been put back: closing the disclosure first
          // would restore a value into a field this sweep can no longer see, which is the
          // same ordering bug the selection/tab pair above records.
          const tools = q(w, '.yt-side-tools');
          if (tools && g.tools != null && tools.open !== g.tools) {
            tools.open = g.tools;
            done.push('tools');
          }
          window.__LQP_YT_ORIG = null;
          return done.length ? `youtube:${done.join('+')}` : null;
        },
      },
      mutations: {
        // The plan BADGE, not the rail: detaching a rail item moves `folderTree`'s playlist
        // count too and the control would prove two rows instead of one.
        playlistRail: (w) => detach(q(w, '.yt-plan-item .yt-pl-item-meta'), 'no plan badge'),
        // The first folder head's own label. `.yt-plan-item` sits outside every `.yt-folder`
        // and is excluded from `folderTree`'s count, so `playlistRail` cannot move with it.
        folderTree: (w) => detach(q(w, '.yt-folder-head span'), 'no folder head label'),
        addPlaylist: (w) => detach(q(w, '.yt-add button'), 'no add-playlist submit'),
        // Strip the strip's `active`, which no other row reads — `playlistRail` scores
        // `.yt-pl-item.active`, a different element family.
        tabSwitching: (w) => removeClassAll(qa(w, '.yt-tab.active'), 'active'),
        videoRows: (w) => detach(q(w, '.yt-list .yt-row .yt-row-title'), 'no video rows'),
        // LIE rather than delete, and on a row that is NOT downloaded: enabling its Open
        // control is exactly the dishonest state the row claims cannot exist. Detaching a
        // button instead would also fall `videoRows`' sibling counts.
        rowActions: (w) => stripAttr(
          qa(w, '.yt-list .yt-row').filter((r) => !q(r, '.yt-chip.dl'))
            .map((r) => qa(r, '.yt-row-actions button')[2])[0],
          'disabled',
          'every painted row is already downloaded — no undownloaded row to falsify',
        ),
        selectionActions: (w) => detach(q(w, '.yt-header-actions button.primary'), 'no batch log action'),
        playlistPreferences: (w) => detach(q(w, '.yt-prefs .yt-chips'), 'no sub-language chip group'),
        // The prefs summary's own element, not the disclosure: detaching a whole `<details>`
        // would take `playlistPreferences` with it and the control would prove two rows.
        progressiveDisclosure: (w) => detach(q(w, '.yt-prefs-disclosure > summary'), 'no prefs disclosure summary'),
        windowLifecycle: (w) => stripAttr(q(w, '.fwin-b-liquid'), 'aria-pressed', 'no liquid control'),
      },
    },

    /**
     * THE SHELL — a fifth host, added 2026-08-31 for L9 bullet 4 (`shellSel`, not `rootSel`).
     *
     * Every spec above it is an APP inside a window. The desktop shell is the thing that
     * HOSTS those windows, and L9 bullet 4 ("Verify Secret Aero/Wired lifecycle") cannot be
     * scored for category 6 without it. Three decisions, all recorded because each one had a
     * wrong answer that looked reasonable:
     *
     * 1. WHAT IS THE SHELL'S PRESENTATION AXIS? Not the theme. A shell renders no
     *    `.fwin-b-liquid` of its own, and switching `wired-archive` -> Study OS -> back to
     *    drive the trip would mutate a persisted global setting through a transition
     *    (`getComputedStyle` right after a theme swap still returns the OLD value) for a
     *    reading the rubric never asked for. Category 6's own 10-requirement names the
     *    answer instead: the round trip must preserve "geometry, focus, z-order, pin,
     *    pop-out, snap, monitor placement, and TASKBAR IDENTITY". Taskbar identity is a
     *    SHELL property. So the shell's axis is a hosted window's Standard -> Liquid ->
     *    Standard flip, and the claim under test is: does making a window Liquid break the
     *    shell that hosts it? That is the regression this category exists to catch, it uses
     *    the machinery that already works, and it touches no persisted global.
     *
     * 2. THE PROXY IS RESOLVED LIVE, NEVER NAMED. `presProxy` returns the first open `.fwin`
     *    that actually renders `.fwin-b-liquid`. Hardcoding "video" would refuse the whole
     *    cell on a desktop where Video happens to be closed, and would silently score the
     *    wrong window if two were open. With NO presentable window open the spec refuses —
     *    it does not fall back to scoring a trip it did not take.
     *
     * 3. THE SHELL ROOT CONTAINS THE WINDOWS, so every row and the snapshot are scoped
     *    OUTSIDE `.fwin`. This is correction 22's ownership bug arriving from the opposite
     *    direction: there the subject was a window and the harness reached into a nested
     *    one; here the subject legitimately contains three windows, and an unscoped
     *    `snapshot` would fold their fields, controls and text into the shell's. The round
     *    trip would then diff on the flipped window's own contents and report the shell as
     *    having lost state when the shell did exactly the right thing.
     */
    shell: {
      shellSel: '.os-desktop',
      titleRe: /$^/,
      features: [
        {
          id: 'taskbarIdentity',
          f: (w) => {
            // The rubric's own named term. One button per hosted window, each still
            // carrying its window's identity — not a count that happens to match.
            const wins = qa(w, '.fwin');
            const btns = shq(w, '.os-task-win');
            const titles = btns.map((b) => (b.getAttribute('title') || '').trim()).filter(Boolean);
            return {
              ok: btns.length === wins.length && wins.length > 0 && titles.length === btns.length,
              ev: `taskButtons=${btns.length} hostedWindows=${wins.length} titled=${titles.length} [${titles.join(' | ')}]`,
            };
          },
        },
        {
          id: 'taskbarRaises',
          f: (w) => {
            // Side effect, not presence: `taskbarRaise` recorded the rank it produced.
            const s = shellState();
            return {
              ok: s.raisedTo === 1,
              ev: `clicked=${s.raisedTitle || 'none'} rankAfter=${s.raisedTo === undefined ? 'not driven' : s.raisedTo} of ${s.raisedOf}`,
            };
          },
        },
        {
          id: 'startEntryPoint',
          f: () => {
            const s = shellState();
            return {
              ok: s.startOpened === 1 && s.startClosed === 0,
              ev: `menusWhileOpen=${s.startOpened} menusAfterClose=${s.startClosed}`,
            };
          },
        },
        {
          id: 'trayFlyout',
          f: () => {
            const s = shellState();
            return {
              ok: s.flyoutOpened === 1 && s.flyoutClosed === 0,
              ev: `flyoutsWhileOpen=${s.flyoutOpened} flyoutsAfterClose=${s.flyoutClosed} via=${s.flyoutVia || 'none'}`,
            };
          },
        },
        {
          id: 'virtualDesktops',
          f: (w) => {
            const sw = shq(w, '.os-desktop-switch');
            const active = sw.filter((b) => b.classList.contains('active'));
            return {
              ok: sw.length >= 2 && active.length === 1,
              ev: `switches=${sw.length} active=${active.length} [${sw.map((b) => txt(b)).join(' | ')}]`,
            };
          },
        },
        {
          id: 'trayControls',
          f: (w) => {
            // Every tray control must be NAMED. An icon-only button with no accessible name
            // is a capability the user cannot find, which is this category's regression.
            const btns = shq(w, '.os-tray-btn');
            const named = btns.filter((b) => (b.getAttribute('title') || b.getAttribute('aria-label') || '').trim());
            return {
              ok: btns.length > 0 && named.length === btns.length,
              ev: `trayButtons=${btns.length} named=${named.length}`,
            };
          },
        },
        {
          id: 'clock',
          f: (w) => {
            const c = q(w, '.os-clock');
            const t = txt(c);
            return { ok: !!c && /\d{1,2}:\d{2}/.test(t), ev: `clock=${JSON.stringify(t)}` };
          },
        },
        {
          id: 'shellIdentity',
          f: (w) => {
            // The Wired/Aero identity is a real material stamp plus real shell-owned
            // furniture, read from the document rather than from a class this file invented.
            //
            // REPAIRED 2026-09-02 (primary2). The old expression was
            // `!!mat && theme.indexOf(mat) === 0 && owned > 0` and it was WIRED-ONLY on two
            // independent counts, both measured live on this profile rather than reasoned:
            //   1. `theme.indexOf(mat) === 0` -- the Aero theme's id is `frutiger-aero` and
            //      its materialSet is `aero`, so indexOf is 9, not 0. A correctly stamped
            //      Aero shell scored FALSE on the stamp half.
            //   2. `.${mat}-wall-atmosphere, .${mat}-tray-lamps` -- those two elements are
            //      rendered only under `wired` (DesktopShell.tsx:2748 and :3502). Measured on
            //      `frutiger-aero`: **0** `aero-`prefixed classes anywhere in the shell
            //      outside `.fwin`, against 178 inside the hosted Resources window. Aero's
            //      identity is CSS scoped to `[data-materials='aero']` restyling the same
            //      `.os-*` furniture; it adds no DOM of its own. So there is nothing to
            //      "widen the selector" to, and widening it to any `aero-` class would have
            //      scored the shell from a window's contents.
            // What BOTH material sets do own is the secret start surface: DesktopShell.tsx:683
            // renders `.os-start-aero-menu` for `aero` OR `wired` and the base menu otherwise,
            // so it discriminates a material shell from the default one. `readStartOpen`
            // records it while the menu is open, which is the only moment it exists.
            // On the base theme there is no material identity to verify at all -- that is `na`
            // (excluded from the denominator), never a failure.
            const s = shellState();
            const mat = document.documentElement.getAttribute('data-materials');
            const theme = document.documentElement.getAttribute('data-theme') || '';
            if (!mat) {
              return {
                ok: null,
                na: 'shell is on the base theme — no material set is stamped, so there is no material identity to verify',
                ev: `materials=null theme=${JSON.stringify(theme)}`,
              };
            }
            const owned = shq(w, `.${mat}-wall-atmosphere, .${mat}-tray-lamps`).length;
            const matMenu = s.startMaterialMenu;
            const furniture = owned > 0 || matMenu === 1;
            return {
              ok: theme.indexOf(mat) >= 0 && furniture,
              ev: `materials=${mat} theme=${theme} stampBelongsToTheme=${theme.indexOf(mat) >= 0} identityElements=${owned} materialStartMenu=${matMenu === undefined ? 'not driven' : matMenu}`,
            };
          },
        },
        {
          id: 'desktopSurface',
          f: (w) => {
            // The shell must actually own a desktop the user can drop onto: a real box, and
            // the icon grid it renders is reported as a NUMBER rather than asserted. An
            // empty grid is honest state, not a failure — the row's claim is that the
            // surface exists and its icon count agrees with what the shell rendered.
            const r = w.getBoundingClientRect();
            const icons = shq(w, '.os-desk-icon');
            return {
              ok: r.width > 200 && r.height > 200,
              ev: `desktop=${Math.round(r.width)}x${Math.round(r.height)} icons=${icons.length}`,
            };
          },
        },
      ],
      /**
       * ACT AND READ ARE SEPARATE STEPS, and this is trap 1 rather than a style choice.
       *
       * `/eval` is synchronous: a step that clicks and then counts in the SAME expression
       * reads the DOM as it was BEFORE React re-rendered. Measured 2026-08-31, first run of
       * this spec: `openStart` clicked and reported `opened: 0` while the menu was in fact
       * opening, `closeStart` then saw the 1 the previous step had caused and reported the
       * close as `after: 1`, and `taskbarRaise` read `rank 3 of 3` on a window it had just
       * correctly raised. Three rows scored a working shell as broken, all from one cause.
       *
       * The driver POSTs each step separately with a real sleep between, so splitting the
       * click from the count is exactly the fix, and it costs nothing but two more entries.
       */
      drive: [
        'openStart', 'readStartOpen', 'closeStart', 'readStartClosed',
        'openTray', 'readTrayOpen', 'closeTray', 'readTrayClosed',
        'taskbarRaise', 'readRaise',
      ],
      steps: {
        openStart: (w) => {
          const b = q(w, '.os-start-btn');
          if (!b) return { refused: 'no start control' };
          if (!q(w, '.os-start')) b.click();
          return { clicked: 'start' };
        },
        readStartOpen: (w) => {
          const s = shellState();
          s.startOpened = shq(w, '.os-start').length;
          // The material start surface exists only while the menu is open, and it is the one
          // piece of shell-owned furniture BOTH `aero` and `wired` render (DesktopShell.tsx:683).
          // `shellIdentity` reads it back later; recording it here is what lets that row be
          // material-agnostic instead of wired-only. See that row for the measurement.
          s.startMaterialMenu = shq(w, '.os-start-aero-menu').length;
          return { opened: s.startOpened, materialMenu: s.startMaterialMenu };
        },
        closeStart: (w) => {
          const back = q(w, '.os-start-backdrop');
          if (back) back.click();
          else if (q(w, '.os-start')) q(w, '.os-start-btn').click();
          return { clicked: back ? 'backdrop' : 'start' };
        },
        readStartClosed: (w) => {
          const s = shellState();
          s.startClosed = shq(w, '.os-start').length;
          return { after: s.startClosed };
        },
        openTray: (w) => {
          const s = shellState();
          // Quick settings, chosen because it was MEASURED to produce `.os-flyout`. The
          // first tray control is "Search everything…", which opens a different surface
          // family; taking `[0]` scored the flyout row against a button that never renders
          // one. Falls back to the first non-bell control when the label is absent.
          const btns = shq(w, '.os-tray-btn').filter((x) => !x.classList.contains('os-tray-btn-bell'));
          const named = (x) => (x.getAttribute('title') || x.getAttribute('aria-label') || '').trim();
          const b = btns.find((x) => /quick settings/i.test(named(x))) || btns[0];
          if (!b) return { refused: 'no tray control' };
          s.flyoutVia = named(b);
          s.flyoutBtn = b;
          if (!q(w, '.os-flyout')) b.click();
          return { clicked: s.flyoutVia };
        },
        readTrayOpen: (w) => {
          const s = shellState();
          s.flyoutOpened = shq(w, '.os-flyout').length;
          return { opened: s.flyoutOpened, via: s.flyoutVia };
        },
        closeTray: (w) => {
          const s = shellState();
          // Measured 2026-08-31: clicking `.os-panel-backdrop` leaves the flyout mounted;
          // the tray button is a real toggle and closes it. Do not "fix" this by widening
          // the query — the backdrop genuinely is not the dismissal path.
          if (q(w, '.os-flyout') && s.flyoutBtn) s.flyoutBtn.click();
          return { clicked: 'tray toggle' };
        },
        readTrayClosed: (w) => {
          const s = shellState();
          s.flyoutClosed = shq(w, '.os-flyout').length;
          return { after: s.flyoutClosed };
        },
        taskbarRaise: (w) => {
          const s = shellState();
          const btns = shq(w, '.os-task-win');
          const wins = qa(w, '.fwin');
          if (!btns.length || !wins.length) return { refused: 'no hosted window to raise' };
          // Pick a window that is NOT already on top, or the row proves nothing. The
          // taskbar button is a TOGGLE, so clicking the top window would minimise it.
          const ranked = wins.map((x) => ({ x, z: Number(getComputedStyle(x).zIndex) || 0 }))
            .sort((a, b) => b.z - a.z);
          if (ranked.length < 2) return { refused: 'only one hosted window — a raise past nothing proves nothing' };
          const target = ranked[ranked.length - 1].x;
          const title = (q(target, '.fwin-title-text') && txt(q(target, '.fwin-title-text'))) || '';
          const btn = btns.find((b) => (b.getAttribute('title') || '').trim() === title)
            || btns[btns.length - 1];
          s.raisedTitle = (btn.getAttribute('title') || '').trim();
          s.raisedTarget = target;
          // EXACTLY ONE CLICK. A hidden window is restored AND raised by one click, and a
          // visible one is raised by one click — but a second click minimises whatever the
          // first just brought up, which is how a raise row scores itself dead.
          btn.click();
          return { clicked: s.raisedTitle };
        },
        readRaise: (w) => {
          const s = shellState();
          if (!s.raisedTarget) return { refused: 'taskbarRaise did not run' };
          const after = qa(w, '.fwin').map((x) => ({ x, z: Number(getComputedStyle(x).zIndex) || 0 }))
            .sort((a, b) => b.z - a.z);
          s.raisedTo = after.map((e) => e.x).indexOf(s.raisedTarget) + 1;
          s.raisedOf = after.length;
          return { raised: s.raisedTitle, rank: s.raisedTo, of: s.raisedOf };
        },
      },
      mutations: {
        taskbarIdentity: (w) => detach(shq(w, '.os-task-win')[0], 'no task button to remove'),
        // LIE rather than delete: a tray button that exists but is unnamed is precisely the
        // "capability the user cannot find" this row is for, and it falls only that row.
        trayControls: (w) => {
          const b = shq(w, '.os-tray-btn')[0];
          if (!b) return { refused: 'no tray control' };
          const r = stripAttr(b, 'title', 'no tray control');
          stripAttr(b, 'aria-label', '');
          return r;
        },
        virtualDesktops: (w) => removeClassAll(shq(w, '.os-desktop-switch.active'), 'active'),
        clock: (w) => detach(q(w, '.os-clock'), 'no clock'),
        // EVERY element the row reads, not the first one. Measured 2026-08-31: detaching
        // only `.wired-tray-lamps` left `.wired-wall-atmosphere` standing, the row's
        // `owned > 0` still held and the control reported no row falling — a control that
        // proves nothing while looking like it ran. Deliberately NOT falsified by rewriting
        // `data-materials`: that attribute lives on `documentElement`, which is outside the
        // shell root that `restore()` sweeps, so the lie would never be undone.
        shellIdentity: (w) => {
          // Falsifies BOTH legs the row now accepts, or it would arm on wired and refuse on
          // aero (where the always-on furniture does not exist) — the same shape that made the
          // row itself wired-only. The recorded `startMaterialMenu` is spec state, falsified
          // the way `startEntryPoint` / `trayFlyout` / `taskbarRaises` already are; the DOM
          // half is a real detach and is swept by `restore()`.
          const s = shellState();
          const mat = document.documentElement.getAttribute('data-materials');
          if (!mat) return { refused: 'shell is on the base theme — the row is `na`, so there is nothing to falsify' };
          const owned = shq(w, `.${mat}-wall-atmosphere, .${mat}-tray-lamps`);
          owned.forEach((n) => detach(n, ''));
          const had = s.startMaterialMenu;
          s.startMaterialMenu = 0;
          return { mutated: `${owned.length} identity element(s) detached; startMaterialMenu ${had === undefined ? 'not driven' : had} -> 0` };
        },
        // Falsify the DRIVEN rows by breaking the side effect itself, not the control: the
        // start menu is re-opened and left open, so `closeStart`'s recorded 0 becomes 1.
        startEntryPoint: (w) => {
          const s = shellState();
          s.startClosed = shq(w, '.os-start').length + 1;
          return { mutated: `startClosed forced to ${s.startClosed}` };
        },
        trayFlyout: (w) => {
          const s = shellState();
          s.flyoutClosed = shq(w, '.os-flyout').length + 1;
          return { mutated: `flyoutClosed forced to ${s.flyoutClosed}` };
        },
        taskbarRaises: () => {
          const s = shellState();
          s.raisedTo = 99;
          return { mutated: 'raisedTo forced to 99' };
        },
      },
    },

    /**
     * THE BLANC SHELL — a sixth host, added 2026-08-31 for L9 bullet 4's Blanc column.
     *
     * `shell` above is `.os-desktop` from end to end: `.os-task-win`, `.os-desktop-switch`,
     * `.os-tray-btn`, `.os-clock`, and a presentation axis that flips a hosted `.fwin`.
     * Blanc renders NONE of those. It is a second, separate shell in its own BrowserWindow
     * (`blanc.html?blanc=1`) with **0** `.fwin`, so pointing `shell` at it refuses every row
     * and the cell would have been recorded as unreachable rather than measured. cat1-cat4
     * Blanc all score `@.blanc-root`; this is the same subject, given the category-6 rows it
     * actually has.
     *
     * WHY A NEW HOST RATHER THAN WIDENING `shell`: every one of `shell`'s eight rows names a
     * `.os-*` class. Generalising them would mean nine `||` fallbacks, and a row that falls
     * back is a row that cannot say WHICH shell it scored — the exact shape RULE 1 is against.
     *
     * DECISION 1 — THE PRESENTATION AXIS IS `taskbarHidden`, and the two rejected candidates
     * are recorded because both looked reasonable:
     *   · NOT `workspaceFull`. Its effect handler calls `window.api.blancSetFullScreen()`
     *     (`BlancShell.tsx:310`), so a round trip through it drives the real OS window's
     *     fullscreen state — a persisted, native, out-of-renderer mutation for a reading the
     *     category never asked for. That is the same objection that ruled out the theme axis
     *     for the Wired shell, arriving through a different door.
     *   · NOT dark mode. A palette swap leaves every capability where it was, so parity would
     *     be equal by construction and the cell would pass without ever being asked. The
     *     rubric names that failure by name: "a surface that answered yes ten times on the
     *     first pass was not really asked."
     *   `taskbarHidden` is the honest one: it REMOVES the shell's own chrome — nine routes and
     *   the exit — from the screen while leaving `.blanc-content` untouched, so "is any
     *   capability lost when the chrome is reduced?" is a real question with a real reveal
     *   affordance (`.blanc-taskbar-reveal`) as the answer, and the round-trip snapshot
     *   compares work-surface state rather than a re-laid-out content tree.
     *
     * DECISION 2 — `shq` STILL APPLIES even though Blanc hosts no `.fwin`. It is a no-op here
     * today and is kept so that the day Blanc gains a floating surface this spec does not
     * silently start counting it. Blanc's own containment is different in kind: the shell owns
     * `.blanc-taskbar` and `.blanc-top`, and the 42 tools render inside `.blanc-content`. Rows
     * that would otherwise fold a tool's controls into the shell's are scoped to the chrome.
     *
     * DECISION 3 — THE DRIVEN ROWS SPLIT ACT FROM READ, trap 1, inherited rather than
     * rediscovered: `/eval` is synchronous, so a step that clicks and counts in one expression
     * reads the DOM React has not re-rendered yet. That cost the `shell` spec three rows on
     * its first run.
     */
    blancShell: {
      shellSel: '.blanc-root',
      titleRe: /$^/,
      /**
       * Decision 1, as the engine sees it. `read` names the presentation the shell is in;
       * `flip` presses the control the USER would press, never a class write — a spec that
       * sets `.is-taskbar-hidden` itself would prove the CSS works and nothing about whether
       * the shell has a reversible affordance at all.
       */
      presAxis: {
        read: (w) => (w.classList.contains('is-taskbar-hidden') ? 'liquid' : 'standard'),
        flip: (w) => {
          const hidden = w.classList.contains('is-taskbar-hidden');
          const btn = q(w, hidden ? '.blanc-taskbar-reveal' : '.blanc-taskbar-toggle');
          if (!btn) {
            return { refused: hidden ? 'chrome is hidden and no reveal control is rendered' : 'no chrome-reduction control' };
          }
          btn.click();
          return { before: hidden ? 'liquid' : 'standard', via: (btn.getAttribute('title') || btn.className).trim() };
        },
      },
      features: [
        {
          id: 'taskbarIdentity',
          f: (w) => {
            // The rubric's own named term, in Blanc's vocabulary: one titled route per
            // section, exactly one of them current, and the current one AGREEING with the
            // title the shell painted. Agreement is the side effect — a nav that highlights
            // one route while the top bar names another is the regression, and a count alone
            // cannot see it.
            const nav = shq(w, '.blanc-nav .blanc-nav-btn');
            const titles = nav.map((b) => (b.getAttribute('title') || '').trim()).filter(Boolean);
            const active = nav.filter((b) => b.classList.contains('active'));
            const painted = txt(q(w, '.blanc-title'));
            const agree = active.length === 1
              && painted.indexOf((active[0].getAttribute('title') || '').trim()) >= 0;
            return {
              ok: nav.length > 0 && titles.length === nav.length && agree,
              ev: `routes=${nav.length} titled=${titles.length} active=${active.length} painted=${JSON.stringify(painted)} [${titles.join(' | ')}]`,
            };
          },
        },
        {
          id: 'navRoutes',
          f: () => {
            // Side effect, not presence: `navClick` recorded whether the surface the shell
            // painted actually became the route it was asked for, and `navRestore` put the
            // user's own route back.
            const s = blancState();
            return {
              ok: s.navMoved === true,
              ev: `from=${JSON.stringify(s.navFrom)} clicked=${JSON.stringify(s.navTo)} painted=${JSON.stringify(s.navPainted)} restored=${JSON.stringify(s.navBack)}`,
            };
          },
        },
        {
          id: 'chromeRecoverable',
          f: () => {
            // The presentation axis's own "enable has a disable" requirement, driven end to
            // end BEFORE the driver takes its trip, and ending where it started. It overlaps
            // the round trip deliberately and is not redundant with it: the trip compares a
            // whole snapshot, while this row isolates the one claim that the reveal control
            // brings back the SAME nine routes rather than a shell that merely re-renders.
            const s = blancState();
            return {
              ok: s.chromeHidden === true && s.chromeRevealNav > 0 && s.chromeRevealNav === s.chromeNavBefore,
              ev: `navBefore=${s.chromeNavBefore} hiddenWhileReduced=${s.chromeHidden} revealControl=${s.chromeRevealSeen} navAfterReveal=${s.chromeRevealNav}`,
            };
          },
        },
        {
          id: 'clock',
          f: (w) => {
            const c = q(w, '.blanc-clock');
            const t = txt(c);
            return { ok: !!c && /\d{1,2}:\d{2}/.test(t), ev: `clock=${JSON.stringify(t)}` };
          },
        },
        {
          id: 'masterSearch',
          f: () => {
            // Blanc's one cross-tool capability (`6b488974`). Opened by its own control and
            // dismissed by Escape, both read on a later POST.
            const s = blancState();
            return {
              ok: s.searchOpened === 1 && s.searchClosed === 0,
              ev: `dialogsWhileOpen=${s.searchOpened} results=${s.searchResults} dialogsAfterEscape=${s.searchClosed}`,
            };
          },
        },
        {
          id: 'contextTools',
          f: () => {
            // The compact disclosure cat4 added. The claim is that its DECLARED state and its
            // rendered state move together — an `aria-expanded` that lies is a capability a
            // screen-reader user is told about and cannot reach.
            const s = blancState();
            return {
              ok: s.toolsOpen === 'true|open' && s.toolsShut === 'false|shut',
              ev: `opened=${s.toolsOpen} closed=${s.toolsShut}`,
            };
          },
        },
        {
          id: 'workspaceToggleHonest',
          f: () => {
            // `presentationHonest`'s analogue for the one presentation control this spec
            // deliberately does NOT drive (decision 1). Its label must describe the state it
            // would move to, or the user cannot tell which way it goes.
            //
            // REPAIRED 2026-09-02 (primary2). This used to read the control at CHECK time and
            // scored `control=null` -> FALSE. Measured live: the Blanc window renders exactly
            // ONE `.blanc-icon-btn` ("Search Blanc") on the `Read` route, because the
            // fullscreen control is ROUTE-SCOPED — `canExpandWorkspace` (BlancShell.tsx:430)
            // is `book || tab is one of mine/flashcards/media/stats/tools`. The drive visits
            // such a route and then correctly RESTORES the user's own route, so by check time
            // the control is legitimately gone. Scoring its absence as a lying label made a
            // deliberate product decision read as a broken control.
            // So the reading is RECORDED while the control exists (`readNav`, on the visited
            // route) and read back here — the same act-then-read shape the driven rows use.
            // If neither route this run touched offers it, the row is `na` and NAMES both
            // routes, rather than failing the shell for a capability it never claimed there.
            const s = blancState();
            if (s.wsLabel === undefined) {
              return { ok: null, na: 'readNav did not run, so nothing was recorded', ev: 'not driven' };
            }
            if (s.wsLabel === null) {
              return {
                ok: null,
                na: `the fullscreen-workspace control is route-scoped (BlancShell.tsx:430 \`canExpandWorkspace\`) and neither route this run visited renders it`,
                ev: `routesTried=[${JSON.stringify(s.navTo)}, ${JSON.stringify(s.navFrom)}] control=null`,
              };
            }
            return {
              ok: /^exit /i.test(s.wsLabel) === s.wsFull && s.wsExit === s.wsFull,
              ev: `readOnRoute=${JSON.stringify(s.wsRoute)} workspaceFull=${s.wsFull} control=${JSON.stringify(s.wsLabel)} exitAffordance=${s.wsExit}`,
            };
          },
        },
        {
          id: 'shellIdentity',
          f: (w) => {
            // Blanc's material stamp read from the document, not from a class this file
            // invented: cat3 mapped the taskbar and top bar onto the shared `lq-liquid`
            // vocabulary with `data-lq-role="liquid"`, and those two regions ARE the shell's
            // own furniture. The Study OS desktop must be absent — two shells painting at
            // once is the defect this row would catch.
            const owned = shq(w, '[data-lq-role="liquid"]');
            const roles = owned.map((n) => (n.className || '').split(' ')[0]);
            return {
              ok: owned.length > 0 && !document.querySelector('.os-desktop'),
              ev: `identityRegions=${owned.length} [${roles.join(' | ')}] osDesktopPresent=${!!document.querySelector('.os-desktop')}`,
            };
          },
        },
      ],
      drive: [
        'navClick', 'readNav', 'navRestore', 'readWorkspaceOnRestored',
        'hideChrome', 'readChromeHidden', 'revealChrome', 'readChromeRevealed',
        'openSearch', 'readSearchOpen', 'closeSearch', 'readSearchClosed',
        'openTools', 'readToolsOpen', 'closeTools', 'readToolsClosed',
      ],
      steps: {
        navClick: (w) => {
          const s = blancState();
          const nav = shq(w, '.blanc-nav .blanc-nav-btn');
          const current = nav.find((b) => b.classList.contains('active'));
          // Never the active one: clicking the route already on screen proves nothing, and
          // Settings is avoided because its panel is the shell's largest synchronous mount
          // (cat2 measured 462 ms) and would make every later step race it.
          const target = nav.find((b) => b !== current && !/settings/i.test(b.getAttribute('title') || ''));
          if (!target) return { refused: 'no second route to visit' };
          s.navFrom = current ? (current.getAttribute('title') || '').trim() : null;
          s.navTo = (target.getAttribute('title') || '').trim();
          s.navFromEl = current || null;
          target.click();
          return { clicked: s.navTo };
        },
        readNav: (w) => {
          const s = blancState();
          s.navPainted = txt(q(w, '.blanc-title'));
          s.navMoved = !!s.navTo && s.navPainted.indexOf(s.navTo) >= 0 && s.navTo !== s.navFrom;
          // The fullscreen-workspace control is route-scoped (BlancShell.tsx:430) and the
          // drive restores the user's route before `check()` runs, so this is the only moment
          // it may exist. Recorded here, read back by `workspaceToggleHonest`; see that row.
          readWorkspaceControl(w, s, s.navTo);
          return { painted: s.navPainted, moved: s.navMoved, workspaceControl: s.wsLabel };
        },
        navRestore: (w) => {
          // PRESENTED STATE IS THE USER'S. Whatever route was open when this ran goes back.
          const s = blancState();
          if (!s.navFromEl) return { skipped: 'shell had no active route to restore' };
          s.navFromEl.click();
          s.navBack = s.navFrom;
          return { restored: s.navFrom };
        },
        readWorkspaceOnRestored: (w) => {
          // Second chance for the route-scoped workspace control, on the route the user was
          // actually on. Only fills a reading the visited route did not provide — it never
          // overwrites one, so the row keeps the FIRST route that offered the control.
          const s = blancState();
          if (s.wsLabel) return { skipped: `already read on ${JSON.stringify(s.wsRoute)}` };
          readWorkspaceControl(w, s, s.navFrom);
          return { readOnRoute: s.navFrom, workspaceControl: s.wsLabel };
        },
        hideChrome: (w) => {
          const s = blancState();
          s.chromeNavBefore = shq(w, '.blanc-nav .blanc-nav-btn').length;
          const b = q(w, '.blanc-taskbar-toggle');
          if (!b) return { refused: 'no chrome-reduction control' };
          if (!w.classList.contains('is-taskbar-hidden')) b.click();
          return { clicked: 'hide', navBefore: s.chromeNavBefore };
        },
        readChromeHidden: (w) => {
          const s = blancState();
          const bar = q(w, '.blanc-taskbar');
          // Trap: a hidden bar is still in the DOM at `display: none`, so presence is the
          // wrong reading. `checkVisibility` is the true one.
          s.chromeHidden = !!bar && !bar.checkVisibility();
          s.chromeRevealSeen = !!q(w, '.blanc-taskbar-reveal');
          return { taskbarVisible: !!bar && bar.checkVisibility(), revealControl: s.chromeRevealSeen };
        },
        revealChrome: (w) => {
          const b = q(w, '.blanc-taskbar-reveal');
          if (!b) return { refused: 'chrome hidden with no reveal control — the disable path is missing' };
          b.click();
          return { clicked: 'reveal' };
        },
        readChromeRevealed: (w) => {
          const s = blancState();
          const bar = q(w, '.blanc-taskbar');
          s.chromeRevealNav = bar && bar.checkVisibility()
            ? shq(w, '.blanc-nav .blanc-nav-btn').length
            : 0;
          return { taskbarVisible: !!bar && bar.checkVisibility(), nav: s.chromeRevealNav };
        },
        openSearch: (w) => {
          const s = blancState();
          const b = shq(w, '.blanc-icon-btn').find((x) => /search/i.test(x.getAttribute('aria-label') || x.getAttribute('title') || ''));
          if (!b) return { refused: 'no master-search control' };
          s.searchVia = (b.getAttribute('aria-label') || '').trim();
          if (!document.querySelector('.blanc-master-search')) b.click();
          return { clicked: s.searchVia };
        },
        readSearchOpen: () => {
          const s = blancState();
          // The dialog is a sibling of `.blanc-root`'s chrome, not inside it, so this one
          // query is deliberately document-scoped.
          s.searchOpened = document.querySelectorAll('.blanc-master-search').length;
          s.searchResults = document.querySelectorAll('#blanc-master-search-results [role="option"]').length;
          return { opened: s.searchOpened, results: s.searchResults };
        },
        closeSearch: () => {
          const el = document.querySelector('.blanc-master-search input');
          (el || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return { sent: 'Escape' };
        },
        readSearchClosed: () => {
          const s = blancState();
          s.searchClosed = document.querySelectorAll('.blanc-master-search').length;
          return { after: s.searchClosed };
        },
        openTools: (w) => {
          const b = q(w, '.blanc-compact-tools-toggle');
          if (!b) return { refused: 'no context-tools disclosure' };
          if (b.getAttribute('aria-expanded') !== 'true') b.click();
          return { clicked: 'context tools' };
        },
        readToolsOpen: (w) => {
          const s = blancState();
          const b = q(w, '.blanc-compact-tools-toggle');
          const panel = q(w, '#blanc-top-context');
          s.toolsOpen = `${b && b.getAttribute('aria-expanded')}|${panel && panel.classList.contains('is-open') ? 'open' : 'shut'}`;
          return { state: s.toolsOpen };
        },
        closeTools: (w) => {
          const b = q(w, '.blanc-compact-tools-toggle');
          if (b && b.getAttribute('aria-expanded') === 'true') b.click();
          return { clicked: 'context tools' };
        },
        readToolsClosed: (w) => {
          const s = blancState();
          const b = q(w, '.blanc-compact-tools-toggle');
          const panel = q(w, '#blanc-top-context');
          s.toolsShut = `${b && b.getAttribute('aria-expanded')}|${panel && panel.classList.contains('is-open') ? 'open' : 'shut'}`;
          return { state: s.toolsShut };
        },
      },
      mutations: {
        // Detach ONE route, not the nav: `titled === nav.length` and the agreement term both
        // still hold on eight buttons, so this falls the row only through the count the row
        // actually claims — and it is undone by `restore()`'s placeholder sweep.
        taskbarIdentity: (w) => {
          const nav = shq(w, '.blanc-nav .blanc-nav-btn');
          const inactive = nav.find((b) => !b.classList.contains('active'));
          if (!inactive) return { refused: 'no inactive route to remove' };
          return stripAttr(inactive, 'title', 'no route to strip');
        },
        clock: (w) => detach(q(w, '.blanc-clock'), 'no clock'),
        // LIE rather than delete for the declared-state rows: a control that exists and
        // misdescribes itself is precisely the defect each of those rows is for.
        // Falsified through the RECORDED reading, for the same reason the row now reads one:
        // the live control is route-scoped and is legitimately absent at check time, so a
        // mutation that needs the element refuses on exactly the runs the row can still score.
        // The lie is well-formed — "Exit …" while `workspaceFull` is false is precisely the
        // label-does-not-describe-the-state defect this row exists for.
        workspaceToggleHonest: () => {
          const s = blancState();
          if (s.wsLabel === undefined || s.wsLabel === null) {
            return { refused: `no workspace control was found on either route this run visited (${JSON.stringify(s.navTo)}, ${JSON.stringify(s.navFrom)}) — the row is \`na\`, so there is nothing to falsify` };
          }
          const had = s.wsLabel;
          s.wsLabel = s.wsFull ? 'Fullscreen workspace' : 'Exit fullscreen workspace';
          return { mutated: `recorded control label ${JSON.stringify(had)} -> ${JSON.stringify(s.wsLabel)} against workspaceFull=${s.wsFull}` };
        },
        shellIdentity: (w) => {
          const owned = shq(w, '[data-lq-role="liquid"]');
          if (!owned.length) return { refused: 'shell renders no identity furniture' };
          // EVERY element the row reads. The `shell` spec's control proved nothing by
          // detaching one of two; that correction is inherited here rather than repeated.
          owned.forEach((n) => stripAttr(n, 'data-lq-role', ''));
          return { mutated: `${owned.length} identity region(s) unstamped` };
        },
        // The driven rows are falsified through the side effect they recorded, never through
        // the control — a control that removes the button proves the button exists.
        navRoutes: () => {
          const s = blancState();
          s.navMoved = false;
          return { mutated: 'navMoved forced to false' };
        },
        chromeRecoverable: () => {
          const s = blancState();
          s.chromeRevealNav = 0;
          return { mutated: 'navAfterReveal forced to 0' };
        },
        masterSearch: () => {
          const s = blancState();
          s.searchClosed = s.searchClosed + 1;
          return { mutated: `searchClosed forced to ${s.searchClosed}` };
        },
        contextTools: () => {
          const s = blancState();
          s.toolsShut = 'true|open';
          return { mutated: 'collapsed state forced to a lie' };
        },
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
    // The workspace overlay is the reader's case exactly: `inset: 0`, so it owns no
    // minimize/maximize/restore of its own and counting `.fwin-b` here would score a
    // complete host 0. Its honest chrome is the pair this row exists for — one route OUT
    // (`.seanime-host-close`) and one presentation toggle whose declared state is real.
    const workspace = w.classList.contains('seanime-host');
    const chrome = reader
      ? qa(w, '.reader-bar .btn').filter((b) => /Library|ライブラリ|书库|图书|Библиотек/i.test(txt(b)))
      : workspace
        ? qa(w, '.seanime-host-bar .seanime-host-close')
        : qa(w, popout ? '.popout-btn' : '.fwin-b');
    const btn = q(w, LIQUID_BTN[
      reader ? 'reader' : workspace ? 'workspace' : popout ? 'popout' : 'fwin'
    ]);
    const pressed = btn ? btn.getAttribute('aria-pressed') : null;
    // Correction 24. A `.fwin` whose section `canPresentLiquid` refuses renders no toggle
    // at all, and for THAT host the honest contract is the exact inverse: the affordance
    // must be ABSENT rather than present-with-a-real-boolean, and the window must actually
    // be sitting in `standard` — a non-presentable window painting Liquid with nothing to
    // leave it is the 2026-08-17 visualizer defect, which this row must still catch.
    // Its chrome is 3 (Pop out, Minimize, Close): it has no maximize, and `DesktopShell`
    // forces `max: false` for section `city` in two places, so 4 is unreachable by design.
    if (!reader && !popout && !btn && w.classList.contains('fwin')) {
      const pres = w.getAttribute('data-presentation');
      return {
        ok: chrome.length >= 3 && pres === 'standard' && !w.classList.contains('fwin-liquid'),
        ev: `chromeButtons=${chrome.length}/3 liquidToggle=absent presentation=${pres} liquidClass=${w.classList.contains('fwin-liquid')}`,
      };
    }
    // A sticky note deliberately has only Delete and the presentation toggle. It is not
    // minimizable (there is no taskbar identity to restore from), not maximizable (the product
    // publishes that refusal through data-maximizable=false), and not detachable. Counting it
    // against a general app window's four controls would turn those three explicit refusals
    // into a lifecycle defect. The two controls it does own remain fully asserted here.
    const note = w.classList.contains('fwin-note');
    const need = reader || workspace ? 1 : popout ? 3 : note ? 2 : 4;
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
  /**
   * The page numbers the manga stage is ACTUALLY showing, read off each image's own
   * identity rather than off the control that claims to have moved it.
   *
   * `alt` is `t('manga.pageAlt', { n: pageIdx + 1 })` (MangaReader.tsx:1982/2010), so the
   * numeral is present in all four locales even though the surrounding word is not; the
   * `pages/000N.<ext>` basename is the fallback for a build that ever drops the alt.
   * Returns an array because the spread layout renders two pages at once.
   */
  function mangaRenderedPages(w) {
    const stage = q(w, '.manga-stage');
    if (!stage) return [];
    return qa(stage, 'img').map((img) => {
      const nums = String(img.alt || '').match(/\d+/g);
      if (nums && nums.length) return Number(nums[nums.length - 1]);
      const m = String(img.currentSrc || img.src).match(/(\d+)\.[a-z0-9]+(?:\?.*)?$/i);
      return m ? Number(m[1]) : NaN;
    }).filter((n) => Number.isFinite(n));
  }

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
  // A SPEC MAY HAND THIS A MISSING NODE, and a mutation that THROWS is not a control — it is
  // an unreadable run. `statistics.recentActivity` passes `[q(w, '.stats-recent-activity')]`,
  // which is `[null]` on an unseeded surface; 2026-09-03 that deref reached the bridge as
  // `{__error}` and every cat harness reported `"[object Object]" is not valid JSON`. Refuse
  // by name, exactly as `detach`/`stripAttr` already do when their node is absent.
  function removeClassAll(nodes, cls, refusal) {
    const present = (nodes || []).filter(Boolean);
    if (!present.length) return { refused: refusal || `no node carrying ${cls}` };
    let n = 0;
    present.forEach((el) => {
      if (el.classList.contains(cls)) {
        el.classList.remove(cls);
        el.setAttribute('data-lqp-removed-class', cls);
        n += 1;
      }
    });
    return { mutated: `${cls} removed from ${n} of ${present.length}` };
  }
  function stripAttr(node, attr, refusal) {
    if (!node) return { refused: refusal };
    rememberAbsence(node, attr);
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
    rememberAbsence(node, attr);
    node.setAttribute(`data-lqp-was-${attr}`, node.getAttribute(attr) || '');
    node.setAttribute(attr, value);
    return { mutated: `${attr} set to "${value}"` };
  }

  /**
   * ABSENT IS NOT EMPTY, and the restore sweep could not tell them apart until
   * 2026-09-05. `data-lqp-was-<attr>` stores `getAttribute(attr) || ''`, and the sweep
   * ends with `setAttribute(attr, thatValue)` — it never removes. For a string attribute
   * that is harmless. For a BOOLEAN one it is not: `setAttr(btn, 'disabled', 'true')` on a
   * button that had no `disabled` attribute restores it to `disabled=""`, which is STILL
   * DISABLED. Measured on the new anki spec's `actionCards` row: the mutation flipped its
   * row correctly, the sweep reported `restored: ["disabled"]`, and the row stayed down
   * with `disabledWhileConnected=1` — a VOID that reads like a bad mutation and is really
   * a dead control left behind on the user's surface.
   *
   * So absence is recorded explicitly and the sweep removes rather than blanks. Any spec
   * that mutates a boolean attribute inherits the fix; none has to know about it.
   */
  function rememberAbsence(node, attr) {
    if (!node.hasAttribute(attr)) node.setAttribute(`data-lqp-absent-${attr}`, '1');
  }

  // --------------------------------------------------------------- engine
  const spec = (app) => {
    const s = SPECS[app];
    if (!s) throw new Error(`unknown app "${app}" — have ${Object.keys(SPECS).join(', ')}`);
    return s;
  };

  /**
   * Trap 8's FOURTH host, added 2026-08-31 for L9's City surface (correction 24).
   *
   * `canPresentLiquid` formerly refused sections `city` and `visualizer` outright. Both now
   * own real contextual regions, but the general rule remains: a `.fwin` can be a real,
   * complete window and still
   * have NO Liquid destination, and the harness must not treat that as chromeless (it has
   * chrome: Pop out, Minimize, Close) nor as a broken `fwin` (it renders 3 buttons, not 4,
   * and no toggle, so `lifecycle` would score a correct window false and `toggleLiquid`
   * would throw the whole run).
   *
   * The classification is derived from the RENDERED ABSENCE of the control, never from a
   * class name the harness recognises — and the absence alone is deliberately not enough
   * to earn a score. The 2026-08-17 boss-audit finding was exactly a window that rendered
   * Liquid with no button to leave it, so `cat6-feature-parity.cjs` requires a
   * discriminating control before it will accept the absence: another `.fwin` open at the
   * same moment that DOES render `.fwin-b-liquid`, under the identical query.
   */
  const fwinHost = (w) => (q(w, LIQUID_BTN.fwin) ? 'fwin' : 'fwin-no-liquid');

  /**
   * The shell's presentation PROXY: the first open `.fwin` that really renders the Liquid
   * control right now. Resolved live on every call rather than stored, because the driver
   * flips it and re-reads between calls. Returns null when no window can take the trip, and
   * every shell entry point turns that null into a refusal rather than a score.
   */
  const shellProxy = () => qa(document, '.fwin').find((w) => {
    // Trap 3 applies to the PROXY as well as to the subject. A minimised window still has
    // its `.fwin-b-liquid` in the DOM at `display: none`, so an unguarded find would flip a
    // window nobody can see and the shell would be scored across a trip the user could not
    // have taken. Measured 2026-08-31: all three hosted windows were at 0x0 at rest.
    const r = w.getBoundingClientRect();
    return q(w, LIQUID_BTN.fwin) && r.width >= 40 && r.height >= 40;
  }) || null;

  // Trap 4 + trap 7 + trap 8 + the shell host.
  const findWin = (app, pres) => {
    const s = spec(app);
    // The shell is not among the `.fwin`, it contains them. `pres` is deliberately NOT a
    // filter here: the shell is one surface that stays put across the trip, and filtering it
    // out when the proxy is mid-flip would read as "the desktop disappeared".
    if (s.shellSel) {
      const root = q(document, s.shellSel);
      return root
        ? { win: root, matchedBy: 'shell-selector', host: 'shell' }
        : { win: null, matchedBy: null, host: null };
    }
    const wins = qa(document, '.fwin').filter(
      (w) => !pres || w.getAttribute('data-presentation') === pres,
    );
    // Trap 4, TIGHTENED 2026-08-26 for `vn`. Two apps can share one window AND one
    // title: the visual-novel library replaces Immersion's browser inside
    // Immersion's own `.fwin`, so a title-only match hands back that window
    // whichever of the two is mounted — and then every row of the app that is NOT
    // showing scores false. That is a fabricated regression where the honest answer
    // is a refusal. When a spec declares a structural root, the title match has to
    // carry it too. Strictly narrower: every other spec's `rootSel` is inside its
    // own window whenever that app is up, so nothing already scored changes.
    //
    // `rootSel` alone is not enough here and it was measured, not assumed: the VN
    // panel mounts INSIDE `.immersion-root`, so with the library up
    // `check('immersion')` scored 2 of 7 — five browser rows reported as
    // regressions on a browser that is simply not on screen. `notSel` is the
    // other half: a selector whose presence means a different app owns this
    // window. Only a spec that shares a window needs one.
    const owns = (w) => (!s.rootSel || q(w, s.rootSel)) && !(s.notSel && q(w, s.notSel));
    const byTitle = wins.find(
      (w) => s.titleRe.test(txt(q(w, '.fwin-title-text'))) && owns(w),
    );
    if (byTitle) return { win: byTitle, matchedBy: 'title', host: fwinHost(byTitle) };
    const byRoot = wins.find((w) => s.rootSel && q(w, s.rootSel) && owns(w));
    if (byRoot) return { win: byRoot, matchedBy: 'root-selector', host: fwinHost(byRoot) };
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
      // Trap 8, EXTENDED AGAIN 2026-09-02 — and this one is the reason the trap keeps
      // needing extending. The comment above USED to name "the seanime workspace" as the
      // canonical example of a host that genuinely has no destination. `f2619b91` gave it
      // one: `.seanime-host` carries `data-presentation`, `.workspace-liquid` is the opt-in
      // class, and `.seanime-host-liquid` is a real toggle with `aria-pressed`. So the
      // example the comment used to prove the distinction had itself crossed the line, and
      // the file kept asserting the old fact. Chromeless still has to mean *has no
      // destination* — which is now true of neither the pop-out, the reader, nor this.
      const ws = bare.closest('.seanime-host[data-presentation]');
      if (ws && (!pres || ws.getAttribute('data-presentation') === pres)) {
        return { win: ws, matchedBy: 'root-selector', host: 'workspace' };
      }
      if (!pop && !rd && !ws) return { win: bare, matchedBy: 'root-selector', host: 'chromeless' };
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
    // Decision 3: on the shell every count is taken OUTSIDE the windows it hosts, or the
    // round trip diffs on the flipped window's own contents and blames the desktop.
    const scope = host === 'shell' ? (sel) => shq(win, sel) : (sel) => qa(win, sel);
    scope('input,textarea,select').forEach((el, i) => {
      fields[`${el.tagName.toLowerCase()}${i}:${(el.className || '').split(' ')[0]}`] = el.value;
    });
    const axis = SPECS[app] && SPECS[app].presAxis;
    const proxy = host === 'shell' && !axis ? shellProxy() : null;
    return {
      app,
      matchedBy,
      host,
      // The shell has no `data-presentation` of its own. It reports the presentation of the
      // window it is hosting, because that is the axis it is scored across, and it names the
      // proxy beside it so this can never be mistaken for a shell-level attribute.
      // A shell that declares its OWN axis (`presAxis`, Blanc) reads its own presentation and
      // names no proxy: there is no hosted window in the trip, so reporting one would be a
      // second lie on top of a missing measurement.
      presentation: axis
        ? axis.read(win)
        : (host === 'shell'
          ? (proxy && proxy.getAttribute('data-presentation'))
          : win.getAttribute('data-presentation')),
      ...(host === 'shell' && !axis
        ? { presentationProxy: proxy ? (txt(q(proxy, '.fwin-title-text')) || '(frameless)') : null }
        : {}),
      ...(axis ? { presentationAxis: 'shell-owned' } : {}),
      liquidClass: win.classList.contains('fwin-liquid') || win.classList.contains('popout-liquid'),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      maximized: win.classList.contains('fwin-max'),
      focused: win.classList.contains('focused'),
      zIndex: win.style.zIndex || '',
      chars: host === 'shell'
        ? shq(win, '*').reduce((n, el) => n + (el.childNodes.length
          ? [].filter.call(el.childNodes, (c) => c.nodeType === 3).reduce((m, c) => m + c.data.length, 0)
          : 0), 0)
        : (win.textContent || '').length,
      nodes: host === 'shell' ? shq(win, '*').length : win.querySelectorAll('*').length,
      controls: scope('button,input,select,textarea,[role="button"]').length,
      fields,
      // Scroll offsets are app state too, and on a surface with no editable field they are
      // the ONLY user-entered state a round trip can lose. Added 2026-08-26: Library has 86
      // buttons and zero text inputs, so without this its round trip compared chrome to
      // chrome and would have held no matter what the toggle did to the list.
      scroll: scope('*')
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
      // The same reasoning, generalised 2026-09-02 so the ONE host that needed it is not
      // the only one that gets it. A row may know for itself that it is inapplicable —
      // `mediaWorkspace` has three views and only one mounts the readiness pane — and
      // until this branch existed `ok: null` fell through `!!out.ok` and was scored FALSE.
      // That is the trap-8 mistake with a different subject: a row reporting "my subject
      // is not on screen" would have been published as "the feature is unreachable", and
      // in BOTH presentations, so the parity comparison would still have looked equal
      // while both halves were wrong. `na` must be declared, never inferred from a falsy
      // `ok`, or a genuinely broken row hides itself by returning nothing.
      if (out.ok === null && out.na) {
        return { id: feat.id, reachable: null, na: out.na, evidence: out.ev };
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
    // A spec that declares its own axis owns the flip. Checked BEFORE the `.fwin`-proxy
    // branch: Blanc hosts no `.fwin` at all, so falling through would refuse a trip the shell
    // can genuinely take. The control pressed is the user's, never a class write.
    const axis = spec(app).presAxis;
    if (axis) return axis.flip(win);
    // Decision 1/2: the shell's axis is a HOSTED window's flip, driven through that window's
    // own control. Refuses rather than falling back when nothing on screen can take the trip.
    if (host === 'shell') {
      const proxy = shellProxy();
      if (!proxy) {
        return { refused: 'no open window renders `.fwin-b-liquid`, so the shell has no presentation trip to take' };
      }
      const pb = q(proxy, LIQUID_BTN.fwin);
      const before = proxy.getAttribute('data-presentation');
      pb.click();
      return { before, ariaPressed: pb.getAttribute('aria-pressed'), via: txt(q(proxy, '.fwin-title-text')) || '(frameless)' };
    }
    if (host === 'chromeless') return { refused: 'chromeless host has no liquid control' };
    if (host === 'fwin-no-liquid') {
      return { refused: 'section is not Liquid-presentable — canPresentLiquid refuses it, so no toggle is rendered' };
    }
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
    // See `rememberAbsence`: an attribute the surface never had is REMOVED, not blanked.
    // Blanking it restored `disabled=""` — still disabled — and left a dead control behind.
    const ABSENT = 'data-lqp-absent-';
    qa(scope, '*').forEach((n) => {
      [].slice.call(n.attributes)
        .filter((a) => a.name.indexOf(WAS) === 0)
        .forEach((a) => {
          const attr = a.name.slice(WAS.length);
          if (n.hasAttribute(ABSENT + attr)) {
            n.removeAttribute(attr);
            n.removeAttribute(ABSENT + attr);
          } else {
            n.setAttribute(attr, a.value);
          }
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
    // The field the round trip is allowed to dirty, when the surface owns a control that the
    // driver's generic "first visible text field" rule must NOT touch.
    //
    // `probeInput` was declared on `dictionary` on the day this file was written and then
    // never read by anything — dead until 2026-09-02. What made it load-bearing is a product
    // change: `df00b4be` put a GLOBAL SEARCH field in the Media Center topbar, and the
    // topbar sits above the page, so it is now the first visible text field inside the
    // `video` window. `dirtyField` typed its mark into it, the search NAVIGATED the Media
    // Center to the library page, and `check('video')` then refused with `no video surface` —
    // the driver destroyed the surface it was about to score. A dirty step may not use a
    // control that navigates.
    //
    // Measured before wiring, not assumed: on `dictionary` this accessor returns the SAME
    // element the generic rule already picks (both the `食べる`/`eat` search box), so the
    // banked dictionary score is unaffected and the change is strictly additive.
    // Returns a live node; only ever used inside an injected expression.
    __probeInput: (app, pres) => {
      const s = SPECS[app];
      const win = findWin(app, pres).win;
      if (!s || !s.probeInput || !win) return null;
      return s.probeInput(win) || null;
    },
    /**
     * The THIRD shape of the same trap, and the one `probeInput` cannot answer.
     *
     * `probeInput` redirects the round-trip mark to a safe field. `captures` has
     * no safe field to redirect it TO: its only text input is the index filter,
     * so the mark filtered the list to nothing and the two rows scored on that
     * list — `captureList` and `selection` — read `rows=0` and `selected=""` in
     * BOTH presentations. Measured 2026-09-05: parity 4/6 with `select` refusing
     * "only 0 rows" and `scroll` refusing "nothing scrollable", i.e. the driver
     * had emptied the surface it was scoring, exactly as it once deleted Video's.
     *
     * A spec sets `noSafeInput` to say so, and `dirtyField` then records
     * `field: null` — the weaker, already-supported outcome the harness documents
     * for a surface with no editable field at all. The round trip carries no
     * user-entered state for this app, which is the honest report; inventing one
     * by dirtying a filter is not.
     */
    __noSafeInput: (app) => !!(SPECS[app] && SPECS[app].noSafeInput),
  };

  return JSON.stringify({
    installed: Object.keys(window.__LQP),
    apps: Object.keys(SPECS),
    features: Object.fromEntries(Object.keys(SPECS).map((k) => [k, SPECS[k].features.length])),
  });
})();
