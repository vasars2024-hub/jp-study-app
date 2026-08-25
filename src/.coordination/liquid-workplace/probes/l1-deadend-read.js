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
  // Second pass, keyed the way the sweep identifies a target. A no-change verdict is only a dead
  // end when it survives being re-driven from the state the sweep ENDED in — see the long note in
  // `l1-deadend.js`, where `Media Settings` read dead once and moved 759 → 369 nodes on the
  // re-drive because the target before it had already opened that same tab.
  const ckey = (r) => `${r.name}${r.cls}`;
  const confirmed = new Map((st.confirm || []).map((c) => [ckey(c), c]));
  const secondPass = (r) => confirmed.get(ckey(r)) || null;
  const isCandidate = (r) => !r.changed && !r.activeAtClick && !r.formUnchanged;
  /** Dead once and dead again. A candidate whose re-drive could not resolve is NOT counted here. */
  const deadTwice = (r) => isCandidate(r) && secondPass(r) && secondPass(r).changed === false;
  const out = {
    surface: st.surface,
    done: st.done,
    // Stopped by a later arm rather than finished. `done` is true so the bait is cleaned up, but
    // nothing below is a score.
    aborted: st.aborted || false,
    // A sweep that threw parks its error here rather than stalling silently at `done:false`.
    error: st.error || null,
    crashedAt: st.crashedAt ?? null,
    progress: `${st.results.length}/${st.nTargets}`,
    // What the verdicts actually cover. `gone` and `unstable` are the coverage holes.
    coverage: `${clicked.length}/${real.length}`,
    resolvedBy: { live: by('live'), key: by('key'), class: by('class') },
    worstSettleTries: real.reduce((a, r) => Math.max(a, r.settleTries || 0), 0),
    // The control. `changed:false` means the probe caught the handler-less button.
    // The control, both passes. `changed:false` twice means the probe caught the handler-less
    // button AND the second pass did not rescue it — a pass that can rescue a bait is broken.
    baitReported: st.results.filter((r) => r.isBait).map((r) => ({
      changed: r.changed,
      settleTries: r.settleTries,
      unstable: r.unstable,
      secondPassChanged: secondPass(r) ? secondPass(r).changed : null,
    })),
    // A no-change verdict is only a dead end when the control HAD something to do. Two
    // pre-click facts, recorded by the sweep, carve out the two correct no-ops — see the
    // `activeAtClick` / `formUnchanged` note there. The bait carries neither, so the control
    // still lands in `deadEnds` and a run whose bait moves is still void.
    deadEnds: clicked.filter(deadTwice).map((r) => r.name),
    // Read as no-change once, moved on the re-drive: sweep order, not a product defect. Listed
    // rather than dropped, because a long list here means the sweep order still needs work.
    movedOnSecondPass: clicked
      .filter((r) => isCandidate(r) && secondPass(r) && secondPass(r).changed === true)
      .map((r) => r.name),
    // A candidate the second pass could not re-resolve or that never settled: unmeasured, not a
    // dead end, and a coverage hole that has to be named.
    unconfirmed: clicked
      .filter((r) => isCandidate(r) && (!secondPass(r) || secondPass(r).gone || secondPass(r).unstable))
      .map((r) => r.name),
    alreadyActive: clicked.filter((r) => !r.changed && r.activeAtClick).map((r) => r.name),
    sameInputResubmit: clicked.filter((r) => !r.changed && !r.activeAtClick && r.formUnchanged).map((r) => r.name),
    withEffect: clicked.filter((r) => r.changed).map((r) => r.name),
    // Not findings about the app — see the header notes.
    gone: real.filter((r) => r.gone).map((r) => ({ name: r.name, cls: r.cls })),
    unstable: real.filter((r) => r.unstable).map((r) => r.name),
    // The tripwire. A run that moved user data is a finding about the probe, not about the app.
    savedStoreUntouched: st.savedStoreUntouched,
    // The view switchers go last, so the sweep ends on one of them. `lensModeRestored: false`
    // means the surface was left in a different lens than it was found in, and everything driven
    // after this run is measuring that lens instead of the one under test.
    lensMode: st.lensMode || null,
    lensModeRestored: st.lensModeRestored ?? null,
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
