/** Reader for `l1-honest-states-control.js`. Stops the watcher and reports what the surface said. */
(() => {
  const st = window.__liqC8ctl;
  if (!st) return JSON.stringify({ refuse: 'not armed' });
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(st.surface));
  if (st.stop) st.stop();
  const grew = (win.textContent || '').replace(/\s+/g, ' ');
  // Text the window grew that the baseline did not have — the failure being named, if it is.
  const newRuns = grew.split(/(?<=[.。!?])\s+/).filter((s) => s.length > 8 && !st.baselineText.includes(s));
  return JSON.stringify({
    surface: st.surface,
    labelSequence: st.labels,
    errorTexts: st.errorTexts,
    newTextRuns: newRuns.slice(0, 6).map((s) => s.slice(0, 220)),
    rawKeyCandidates: (grew.match(/\b[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*){2,}\b/g) || []).slice(0, 8),
  });
})()
