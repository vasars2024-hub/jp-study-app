/** Reader/cleanup for `l1-deadend.js`. Removes the injected bait button when the sweep is done. */
(() => {
  const st = window.__liqDead;
  if (!st) return JSON.stringify({ refuse: 'not armed' });
  const real = st.results.filter((r) => !r.isBait);
  const out = {
    surface: st.surface,
    done: st.done,
    progress: `${st.results.length}/${st.nTargets}`,
    // The control. `changed:false` means the probe caught the handler-less button.
    baitReported: st.results.filter((r) => r.isBait).map((r) => ({ changed: r.changed })),
    deadEnds: real.filter((r) => !r.changed && !r.gone).map((r) => r.name),
    withEffect: real.filter((r) => r.changed).map((r) => r.name),
    // Not a finding about the app — see the header note on detached nodes.
    gone: real.filter((r) => r.gone).map((r) => r.name),
    skipped: st.skipped,
  };
  if (st.done) {
    const bait = document.getElementById('__liq-deadend-bait');
    if (bait) bait.remove();
    out.baitRemoved = !document.getElementById('__liq-deadend-bait');
  }
  return JSON.stringify(out);
})()
