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
 *  8. A CHROMELESS HOST HAS NO LIQUID DESTINATION. The agent pop-out and the
 *     seanime host mount outside `.fwin`: no window chrome, no `Make Liquid`, no
 *     `data-presentation`. That is a fact about the surface, not a probe gap, and
 *     the engine reports it as `chromeless` rather than scoring a false absence.
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

  // Trap 6, refined 2026-08-25. The previous turn banked "focus, then keyup" and
  // that is necessary but NOT sufficient: React's SelectEventPlugin also produces
  // nothing while the OS window is unfocused, even though `el.focus()` succeeds
  // and `document.activeElement === el` reads true. Measured: with
  // `document.hasFocus() === false` the identical keyup changed nothing and the
  // live feature read as dead; POST `/focus` first and the same keyup flipped
  // Translate's label both ways. So this REFUSES rather than reporting a false
  // negative — the caller must focus the window.
  const selectRange = (el, start, end) => {
    if (!document.hasFocus()) {
      return { refused: 'window not OS-focused — POST /focus first, or React synthesises no select' };
    }
    el.focus();
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
          // INSTRUMENT CORRECTION, 2026-08-25: the first version read the count
          // with `/\d+/` and the live label is `2,410 points`, so it matched "2"
          // and scored a working search FALSE. Group separators are locale-
          // dependent (`2,410` / `2 410` / `2.410`), so strip every non-digit.
          id: 'search',
          f: (w) => {
            const i = q(w, '.gram-search');
            const rows = qa(w, '.gram-x-row');
            const label = txt(q(w, '.gram-x-count'));
            const num = label.replace(/[^\d]/g, '');
            const ok = !!i && rows.length > 0 && (!num || Number(num) === rows.length);
            return { ok, ev: `query="${i ? i.value : 'no-input'}" rows=${rows.length} count="${label}"` };
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
          typeInto(i, term == null ? 'あとで' : term);
          return { typed: i.value };
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
  };

  // ------------------------------------------------------- shared feature fn
  // Window lifecycle is identical for every `.fwin` app: the four chrome
  // controls exist AND the liquid toggle carries a real boolean `aria-pressed`.
  // A toggle with no pressed state is the "enable with no disable path" defect.
  function lifecycle(w) {
    const chrome = qa(w, '.fwin-b');
    const btn = q(w, '.fwin-b-liquid');
    const pressed = btn ? btn.getAttribute('aria-pressed') : null;
    return {
      ok: chrome.length >= 4 && (pressed === 'true' || pressed === 'false'),
      ev: `chromeButtons=${chrome.length} liquidAriaPressed=${pressed}`,
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
    // Trap 8: the same app may be mounted in a chromeless host (pop-out window,
    // full-screen overlay). It is real, it just has no Liquid destination.
    const bare = s.rootSel ? q(document, s.rootSel) : null;
    if (bare && !bare.closest('.fwin')) {
      return { win: bare, matchedBy: 'root-selector', host: 'chromeless' };
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
      liquidClass: win.classList.contains('fwin-liquid'),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      maximized: win.classList.contains('fwin-max'),
      focused: win.classList.contains('focused'),
      zIndex: win.style.zIndex || '',
      chars: (win.textContent || '').length,
      nodes: win.querySelectorAll('*').length,
      controls: qa(win, 'button,input,select,textarea,[role="button"]').length,
      fields,
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
    const btn = q(win, '.fwin-b-liquid');
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
    ['aria-pressed'].forEach((attr) => {
      qa(scope, `[data-lqp-was-${attr}]`).forEach((n) => {
        n.setAttribute(attr, n.getAttribute(`data-lqp-was-${attr}`));
        n.removeAttribute(`data-lqp-was-${attr}`);
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
  };

  return JSON.stringify({
    installed: Object.keys(window.__LQP),
    apps: Object.keys(SPECS),
    features: Object.fromEntries(Object.keys(SPECS).map((k) => [k, SPECS[k].features.length])),
  });
})();
