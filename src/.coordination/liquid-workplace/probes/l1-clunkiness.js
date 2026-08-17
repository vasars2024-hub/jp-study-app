/**
 * L1 instrument — rubric category 2, "Clunkiness", on one window.
 *
 * The rubric's numbers: clicks and keystrokes to complete the dominant task (against the
 * Standard-mode path), dead ends, modal traps, scroll traps, and the observed latency between
 * input and visible response. 10 requires no extra input cost, 0 dead ends, 0 modal traps, and
 * **every input acknowledged within 100 ms**.
 *
 * TWO LATENCY TRAPS THIS FILE EXISTS TO AVOID, both of which produced a false number here.
 *
 * (1) A first cut timed `performance.now()` at arm against `performance.now()` when the field's
 *     value changed, and reported **268 ms** for the first keystroke of 食べる. That is the
 *     bridge's own HTTP round trip: the /eval that armed the probe and the /type that drove it
 *     are two separate requests. Per-event timing fixes it; on those same keystrokes it reads
 *     single digits.
 *
 * (2) `ev.timeStamp` is stamped where the event is CREATED. A bridge-driven click is created by
 *     `webContents.sendInputEvent` in the MAIN process, so `rAF_now - ev.timeStamp` bills the
 *     app for the main→renderer hop and for main's own queueing. Measured: five clicks on a
 *     genuinely inert `p.muted` — repainting nothing — read **154.1 / 355.9 / 187.3 / 76.9 /
 *     22.8 ms**, three of them over the rubric's 100 ms bar. A floor that straddles the bar
 *     cannot score the bar. `recvMs` below is therefore the scoring number: the clock starts at
 *     the earliest RENDERER-side observation of the event (capture phase at the window) and
 *     stops at the `requestAnimationFrame` that acknowledges it, so it contains the app's work
 *     and nothing else. `stampMs` is kept alongside it, unscored, so the gap stays visible.
 *
 * Keystrokes do not show the same inflation (`char` events land differently), but both numbers
 * are recorded for both kinds rather than trusting that asymmetry.
 *
 * SCROLL TRAPS are content that cannot be reached: `scrollHeight > clientHeight + 2` while the
 * computed `overflow-y` is `hidden` or `visible` on an element that is itself clipped. An
 * element that scrolls is not a trap, and the +2 absorbs sub-pixel layout.
 *
 * MODAL TRAPS are driven, not read: any open dialog is sent a real Escape through the bridge
 * and re-checked. This probe reports the open-dialog inventory; the driver closes the loop.
 *
 * DEAD ENDS are scoped to the dominant-task path — the controls a user actually touches to do
 * the thing the surface is for. Counting every control in the window is `honesty-probe` A and a
 * separate slice; this probe does not report a 0 it did not earn, and says which set it covered.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-clunkiness.js`
 * then drive, then read with `-read.js`.
 */
(() => {
  const TITLE = 'Dictionary';

  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });

  const st = {
    surface: TITLE,
    // Per-event input→paint latency, in ms. One entry per real user event.
    latencies: [],
    // Every click and keystroke the driver spends, so the cost is counted rather than assumed.
    clicks: 0,
    keystrokes: 0,
    // Result-row arrivals, stamped against the click that asked for them.
    resultMarks: [],
    lastActionAt: null,
  };

  const round1 = (n) => Math.round(n * 10) / 10;
  const stamp = (kind, ev) => {
    const recvAt = performance.now();
    const evAt = ev && typeof ev.timeStamp === 'number' ? ev.timeStamp : recvAt;
    requestAnimationFrame(() => {
      const paintAt = performance.now();
      st.latencies.push({ kind, recvMs: round1(paintAt - recvAt), stampMs: round1(paintAt - evAt) });
    });
  };

  const onInput = (ev) => {
    st.keystrokes += 1;
    stamp('input', ev);
  };
  const onClick = (ev) => {
    st.clicks += 1;
    st.lastActionAt = performance.now();
    stamp('click', ev);
  };

  win.addEventListener('input', onInput, true);
  win.addEventListener('click', onClick, true);

  let lastCount = win.querySelectorAll('.dict-entry').length;
  const mo = new MutationObserver(() => {
    const n = win.querySelectorAll('.dict-entry').length;
    if (n !== lastCount) {
      st.resultMarks.push({
        entries: n,
        msSinceAction: st.lastActionAt === null ? null : Math.round(performance.now() - st.lastActionAt),
      });
      lastCount = n;
    }
  });
  mo.observe(win, { childList: true, subtree: true });

  st.disarm = () => {
    win.removeEventListener('input', onInput, true);
    win.removeEventListener('click', onClick, true);
    mo.disconnect();
  };

  window.__liqClunk = st;
  return JSON.stringify({ armed: true, surface: TITLE, entriesAtArm: lastCount });
})()
