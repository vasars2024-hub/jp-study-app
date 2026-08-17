/**
 * Control for `l1-clunkiness.js`. Two controls, because category 2 can go wrong two ways.
 *
 * A. INSTRUMENT FLOOR. The first driven run reported click latencies of **130 ms and 183 ms**,
 *    over the rubric's 100 ms bar. Before that is a finding about the app it has to be shown not
 *    to be the harness: a click on a genuinely inert region does nothing the app must repaint, so
 *    whatever it costs is the floor of `rAF_now - ev.timeStamp` under this bridge. A floor at or
 *    above 100 ms would mean the bar cannot be measured this way at all and the number is VOID.
 *
 * B. DEAD-END DISCRIMINATION (the rubric's named control). A deliberately wrong flow must be
 *    reported as a dead end. The wrong flow driven here is pressing Search on an **empty** query:
 *    a control that leads nowhere would leave the surface unchanged and silent. This control is
 *    only meaningful if it can produce a non-clean result, so it reports what actually changed
 *    rather than a verdict.
 *
 * Arm this instead of the main probe, drive the inert click, then read with `-read.js`.
 */
(() => {
  const TITLE = 'Dictionary';
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });

  // An inert target: the window's own static blurb in the BODY, which owns no handler and no
  // state. The title bar is explicitly excluded — clicking it raises and drags the window, which
  // is a visible response and would put the app's real repaint cost back into the "floor".
  const inert = [...win.querySelectorAll('p,span,small,h1,h2,h3')].find((el) => {
    if (el.closest('.fwin-titlebar,.fwin-head,header')) return false;
    if (el.children.length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 10) return false;
    if (el.closest('button,a,input,select,textarea,[role="button"],[role="tab"]')) return false;
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  });
  if (!inert) return JSON.stringify({ refuse: 'no inert target found in window' });

  const r = inert.getBoundingClientRect();
  const st = { surface: TITLE, latencies: [], clicks: 0, keystrokes: 0, resultMarks: [], lastActionAt: null };
  const round1 = (n) => Math.round(n * 10) / 10;
  const onClick = (ev) => {
    st.clicks += 1;
    st.lastActionAt = performance.now();
    const recvAt = performance.now();
    const evAt = typeof ev.timeStamp === 'number' ? ev.timeStamp : recvAt;
    requestAnimationFrame(() => {
      const paintAt = performance.now();
      st.latencies.push({ kind: 'click', recvMs: round1(paintAt - recvAt), stampMs: round1(paintAt - evAt) });
    });
  };
  win.addEventListener('click', onClick, true);
  st.disarm = () => win.removeEventListener('click', onClick, true);
  window.__liqClunk = st;

  return JSON.stringify({
    armed: 'control-A',
    inertTarget: inert.tagName.toLowerCase() + '.' + String(inert.className || '').trim().split(/\s+/)[0],
    inertText: (inert.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
    clickPt: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) },
  });
})()
