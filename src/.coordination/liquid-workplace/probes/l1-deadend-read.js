/**
 * Reader/cleanup for `l1-deadend.js`. Removes the injected bait button when the sweep is done.
 *
 * `coverage` is the number category 2 actually needs: 0 dead ends over 19 of 35 targets is not a
 * 0. `resolvedBy` says how each verdict was earned — `live` (the node survived), `key` (rebound by
 * `label|tag|type|class`+ordinal) or `class` (the label-is-state fallback) — so a run leaning on
 * the weakest match cannot hide inside the total.
 *
 * `unstable` is the honest fourth verdict: the window never held still for two consecutive
 * signatures, so the click's effect could not be separated from in-flight async work. It is not a
 * dead end and it is not an effect; it is a measurement that did not happen, and it is listed.
 *
 * `savedStoreUntouched` must read true. It is the tripwire for the failure this probe has now
 * produced twice: a sweep that writes to the flashcard store and reports clean numbers anyway.
 *
 * `retired` is the one-way half: a control that came back DISABLED stopped being offered, which is
 * honest. One that came back enabled under a different label is a one-way candidate and is listed
 * separately, because only a second click can tell a cycling control from one that can never act.
 */
(() => {
  const st = window.__liqDead;
  if (!st) return JSON.stringify({ refuse: 'not armed' });
  const real = st.results.filter((r) => !r.isBait);
  const clicked = real.filter((r) => !r.gone && !r.unstable);
  const by = (k) => clicked.filter((r) => r.resolvedBy === k).length;
  const out = {
    surface: st.surface,
    done: st.done,
    progress: `${st.results.length}/${st.nTargets}`,
    // What the verdicts actually cover. `gone` and `unstable` are the coverage holes.
    coverage: `${clicked.length}/${real.length}`,
    resolvedBy: { live: by('live'), key: by('key'), class: by('class') },
    worstSettleTries: real.reduce((a, r) => Math.max(a, r.settleTries || 0), 0),
    // The control. `changed:false` means the probe caught the handler-less button.
    baitReported: st.results.filter((r) => r.isBait).map((r) => ({ changed: r.changed, settleTries: r.settleTries, unstable: r.unstable })),
    deadEnds: clicked.filter((r) => !r.changed).map((r) => r.name),
    withEffect: clicked.filter((r) => r.changed).map((r) => r.name),
    // Not findings about the app — see the header notes.
    gone: real.filter((r) => r.gone).map((r) => ({ name: r.name, cls: r.cls })),
    unstable: real.filter((r) => r.unstable).map((r) => r.name),
    // The tripwire. A run that moved user data is a finding about the probe, not about the app.
    savedStoreUntouched: st.savedStoreUntouched,
    // Retired itself into a disabled state: the surface stopped offering it, honestly.
    retired: clicked.filter((r) => r.after && r.after.present && r.after.disabled)
      .map((r) => ({ name: r.name, became: r.after.label })),
    // Still enabled but now wearing a different label — the second-click pass decides these.
    oneWayCandidates: clicked
      .filter((r) => r.after && r.after.present && !r.after.disabled && r.after.label !== r.name)
      .map((r) => ({ name: r.name, became: r.after.label })),
    skipped: st.skipped,
  };
  if (st.done) {
    const bait = document.getElementById('__liq-deadend-bait');
    if (bait) bait.remove();
    out.baitRemoved = !document.getElementById('__liq-deadend-bait');
  }
  return JSON.stringify(out);
})()
