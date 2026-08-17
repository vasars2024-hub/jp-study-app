/**
 * The negative control `l1-honest-states.js` was missing — rubric category 8's
 * "induce a genuine failure (unreachable host, missing file) and confirm the surface names it".
 *
 * `L1_HONEST_STATES.md` recorded category 8 as **VOID, not scored**, because both induced-failure
 * attempts SUCCEEDED: AnkiConnect was up and an AI provider was configured, so the error and
 * offline states were never observed. This closes that.
 *
 * HOW THE FAILURE IS MADE GENUINE, and why it costs a restart. The endpoint is
 * `ProfileStore.getAnkiUrl()` → `schema.ankiUrl`, wired into the client once at
 * `main/anki/index.ts:837`. `schema` is loaded in the store's constructor
 * (`main/profiles.ts:80`) and there is no setter on any IPC channel, so the value cannot be moved
 * from the renderer and cannot be moved live: main does not hot-reload. The genuine failure is
 * therefore `userData/profiles.json`'s `ankiUrl` repointed from `http://127.0.0.1:8765` to
 * `http://127.0.0.1:1` — a closed port on the loopback, which refuses rather than hangs — with the
 * app stopped for the edit (the store is that file's single writer) and restarted around it.
 * Capture-patch-restore, verified by SHA256, not by eye.
 *
 * WHAT WOULD MAKE THIS PROBE A LIE. A surface that renders "Added" against a refused connection is
 * the exact false-success CLAUDE.md forbids; so is a spinner that never resolves. Both are
 * reported here as findings rather than as an absent error state. The probe watches the add
 * button's own label, because `L1_HONEST_STATES.md` banked that Dictionary renders this state as
 * the **button's label**, not in a `[class*="loading"]` container — a probe looking for a
 * container reported `loading: 0` while the surface was visibly loading.
 *
 * Arms a watcher; drive the add, then read with `-read.js`.
 */
(() => {
  const TITLE = 'Dictionary';
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });

  const addBtn = [...win.querySelectorAll('button')].find((b) =>
    /add to anki/i.test((b.textContent || '').trim()),
  );
  if (!addBtn) return JSON.stringify({ refuse: 'no "Add to Anki" button — search first' });

  const st = {
    surface: TITLE,
    t0: performance.now(),
    // Every distinct label the button shows, in order, with when it appeared.
    labels: [],
    // Any text the surface grows that looks like a failure being named.
    errorTexts: [],
    baselineText: (win.textContent || '').replace(/\s+/g, ' '),
  };

  const note = () => {
    const label = (addBtn.textContent || '').replace(/\s+/g, ' ').trim();
    const last = st.labels[st.labels.length - 1];
    if (!last || last.label !== label) {
      st.labels.push({ label, ms: Math.round(performance.now() - st.t0), disabled: addBtn.disabled === true });
    }
    const now = (win.textContent || '').replace(/\s+/g, ' ');
    if (now !== st.baselineText) {
      for (const el of win.querySelectorAll('[role="alert"],[role="status"],.error,.err,.warn,[class*="error"],[class*="Error"]')) {
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt && !st.errorTexts.includes(txt)) st.errorTexts.push(txt.slice(0, 200));
      }
    }
  };

  note();
  const mo = new MutationObserver(note);
  mo.observe(win, { childList: true, subtree: true, characterData: true, attributes: true });
  st.timer = setInterval(note, 250);
  st.stop = () => { mo.disconnect(); clearInterval(st.timer); };

  const r = addBtn.getBoundingClientRect();
  window.__liqC8ctl = st;
  return JSON.stringify({
    armed: true,
    addBtnPt: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) },
    hitOk: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === addBtn ||
      addBtn.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
    initialLabel: st.labels[0]?.label ?? null,
  });
})()
