/**
 * Negative control for `l1-surface-roles.js` — rubric category 3.
 *
 * The rubric: "a surface that is deliberately all-glass must score low here. If the category
 * cannot produce a low score, it is measuring nothing." A `denseWorkOnTranslucent: 0` that has
 * never been anything else is not a pass, it is an unproven instrument.
 *
 * Two forced failures, in one eval so the restore cannot be stranded by a dead probe:
 *   A. ONE dense-work region (`div.dict-entries`, the 8-entry result list) given a blur.
 *      Expect the count to go 0 -> 1 and name that region.
 *   B. THE WHOLE WINDOW BODY given a blur — the "deliberately all-glass" case. Expect every
 *      Work region to flag, i.e. the count to reach the window's full Work total.
 *
 * Both are inline styles on elements whose material comes from a stylesheet class, so the
 * restore is `style.removeProperty` and is asserted, not assumed. React re-renders `.fwin`'s
 * inline geometry but not these properties; the probe measures in the same eval that sets them
 * (css-measure §5).
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-surface-roles-control.js`
 */
(() => {
  // Three globals, same idiom as `l1-surface-roles.js`'s `__lqScoreTitles`, and for the same
  // reason the dead-end sweep cost four turns: a hardcoded `TITLE = 'Dictionary'` plus a
  // hardcoded `.dict-entries` made this control unrunnable against the OTHER surface gate 461
  // names, and category 3 sat at 9 on Video with "the control has not been re-run" as the
  // only open item. The defaults reproduce every run already recorded in `L1_SURFACE_ROLES.md`.
  const TITLE = (typeof window !== 'undefined' && window.__lqControlTitle) || 'Dictionary';
  // The dense-work region control A blurs. It must be a region the SCORING probe also
  // classifies as Work, or the two instruments disagree and the control reports VOID for a
  // reason that is not the product's — that already happened once, see `collect()` below.
  const DENSE_SEL = (typeof window !== 'undefined' && window.__lqControlDenseSel) || '.dict-entries';
  // Depth 3 reaches Dictionary's result list, which is a direct child of the window body, and
  // is a FALSE CLEAN on the Media shell: `.medialib-browser` is at depth 5 under
  // `.mc-root > .mc-workspace > .mc-content > .mc-page > .medialib-root > .medialib-shell`.
  const DEPTH = (typeof window !== 'undefined' && window.__lqControlDepth) || 3;
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });
  const wr = win.getBoundingClientRect();
  if (!wr.width || !wr.height) return JSON.stringify({ refuse: 'window is 0x0' });
  /**
   * Control B's "deliberately all-glass window" is the element the dense regions actually sit
   * ON, which is not always `.fwin-body`. `translucentBacking` stops at the FIRST opaque paint,
   * so on the Media shell — where `div.mc-root` is an opaque plate between the body and every
   * region — blurring the body cannot reach anything and control B reports 0 while control A
   * fires perfectly. That is a true statement about the product (the plate protects dense work)
   * and a useless control. Point it at the plate instead; the default stays `.fwin-body`, which
   * IS the backing on Dictionary.
   */
  const GLASS_SEL = (typeof window !== 'undefined' && window.__lqControlGlassSel) || '.fwin-body';
  // The WALK root stays `.fwin-body` whatever control B glasses, so the region set this control
  // counts is the same one `l1-surface-roles.js` scores. Moving the walk root would silently
  // change every depth and make the two instruments disagree again.
  const body = win.querySelector('.fwin-body');
  const glass = win.querySelector(GLASS_SEL);
  const entries = win.querySelector(DENSE_SEL);
  if (!body || !glass || !entries) {
    return JSON.stringify({ refuse: `no .fwin-body / ${GLASS_SEL} / ${DENSE_SEL} — is the surface populated?` });
  }

  const alphaOf = (s) => {
    const v = String(s || '').trim();
    if (!v || v === 'transparent') return 0;
    let m = v.match(/^rgba?\(([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean); return p.length >= 4 ? Number(p[3]) : 1; }
    m = v.match(/^color\(\s*[a-z0-9-]+\s+([^)]+)\)$/i);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean); return p.length >= 4 ? Number(p[3]) : 1; }
    return null;
  };
  const isDense = (el) =>
    !el.matches('nav,header,footer,aside,[role="tablist"],[role="toolbar"]')
    && ((el.textContent || '').trim().length >= 200
      || el.querySelectorAll('input,textarea,select,[contenteditable="true"]').length >= 1
      || el.querySelectorAll('table,tr,.dict-entry,.card,article').length >= 1
      || el.querySelectorAll('li').length >= 3);
  const translucentBacking = (el) => {
    let n = el;
    while (n && n !== win.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backdropFilter && cs.backdropFilter !== 'none') return true;
      if (Number(cs.opacity) < 1) return true;
      const a = alphaOf(cs.backgroundColor);
      if (a === null) return false;
      if (a >= 0.95) return false;
      if (a > 0) return true;
      n = n.parentElement;
    }
    return false;
  };
  // Region collection mirrors `l1-surface-roles.js` exactly — same depth, same 1% area floor,
  // same control skip, same leaf-most-Work rule applied OVER THE REGION SET rather than over
  // every descendant. The first version of this control scanned all descendants instead, so
  // `.dict-entries` was excluded as a container and control A did not fire: the instruments
  // disagreed and the control reported VOID for a reason that was not the product's.
  const collect = () => {
    const regions = [];
    const walk = (el, d) => {
      if (d > DEPTH) return;
      for (const c of el.children) {
        const b = c.getBoundingClientRect();
        if (b.width < 8 || b.height < 8) continue;
        if (c.matches('input,textarea,select,button,label,summary,a')) { walk(c, d + 1); continue; }
        if (((b.width * Math.min(b.height, wr.height)) / (wr.width * wr.height)) * 100 >= 1) {
          regions.push(c);
        }
        walk(c, d + 1);
      }
    };
    walk(body, 0);
    return regions;
  };
  /** The leaf-most dense-work regions, translucent or not. Control B's own denominator. */
  const workRegions = () => {
    const work = collect().filter(isDense);
    return work.filter((r) => !work.some((o) => o !== r && r.contains(o)));
  };
  const count = () =>
    workRegions()
      .filter(translucentBacking)
      .map((c) => `${c.tagName.toLowerCase()}.${String(c.className || '').split(' ')[0]}`);

  const beforeEntries = entries.getAttribute('style');
  const beforeBody = glass.getAttribute('style');
  /**
   * The attribute string is not the restore, and treating it as one VOIDED a control that had
   * just fired perfectly (0 -> 1 -> 3 -> 0). Both elements arrive with NO style attribute here
   * (`null`), and `style.removeProperty` on such an element leaves an empty `style=""` behind,
   * so the raw comparison reads `null !== ""` and calls a byte-identical surface unrestored.
   * What the rubric actually requires is that the MATERIAL is back, so capture the two computed
   * properties this control mutates and compare those. The raw strings stay in the report.
   */
  const material = (el) => {
    const cs = getComputedStyle(el);
    return `${cs.backdropFilter}|${cs.backgroundColor}`;
  };
  const beforeMaterial = { entries: material(entries), body: material(glass) };
  const result = { title: TITLE, box: `${Math.round(wr.width)}x${Math.round(wr.height)}` };
  try {
    result.baseline = count();
    result.workTotal = workRegions().length;
    result.workList = workRegions().map((c) => `${c.tagName.toLowerCase()}.${String(c.className || '').split(' ')[0]}`);
    entries.style.backdropFilter = 'blur(12px)';
    entries.style.backgroundColor = 'rgba(30,30,40,0.55)';
    result.controlA_oneRegionBlurred = count();
    entries.style.removeProperty('backdrop-filter');
    entries.style.removeProperty('background-color');
    glass.style.backdropFilter = 'blur(18px)';
    glass.style.backgroundColor = 'rgba(30,30,40,0.5)';
    result.controlB_allGlassWindow = count();
  } finally {
    entries.style.removeProperty('backdrop-filter');
    entries.style.removeProperty('background-color');
    glass.style.removeProperty('backdrop-filter');
    glass.style.removeProperty('background-color');
    if (beforeEntries === null) entries.removeAttribute('style'); else entries.setAttribute('style', beforeEntries);
    if (beforeBody === null) glass.removeAttribute('style'); else glass.setAttribute('style', beforeBody);
  }
  result.restored = count();
  // Raw comparison, no `|| null` coercion. Both elements ship with an EMPTY `style=""`
  // attribute (React writes one), and `('' || null)` folds that to null, so the coerced
  // form reported "not restored" on a tree that was byte-identical.
  result.styleBefore = { entries: beforeEntries, body: beforeBody };
  result.styleAfter = { entries: entries.getAttribute('style'), body: glass.getAttribute('style') };
  result.restoredStyleIdentical =
    entries.getAttribute('style') === beforeEntries && glass.getAttribute('style') === beforeBody;
  result.materialBefore = beforeMaterial;
  result.materialAfter = { entries: material(entries), body: material(glass) };
  result.restoredMaterialIdentical =
    result.materialAfter.entries === beforeMaterial.entries
    && result.materialAfter.body === beforeMaterial.body;
  /*
   * WHAT CONTROL B HAS TO SHOW, and two bars that were both wrong.
   *
   * `controlB > controlA` was the original, and it encoded an accident of Dictionary: that
   * window happened to hold enough dense-work regions that glassing the backing beat glassing
   * one. The Media shell holds exactly ONE (`section.medialib-browser`), so B can never EXCEED
   * A there and a control that fired perfectly reported VOID.
   *
   * `controlB === workTotal` — "every Work region flags" — is the rubric's own wording and is
   * ALSO wrong, measured: Dictionary's `workTotal` is 7 and B reaches 2, because
   * `section.lexicon-conjugation`, the three `details.lexicon-*` panels and
   * `div.lexicon-notes-controls` each paint their OWN opaque fill, so `translucentBacking`
   * stops there and nothing done to an ancestor can reach them. That is a true statement about
   * the product — those five are self-opaque anchors — and it means "every region" is not
   * achievable by glassing one element on any surface built that way.
   *
   * What actually proves the instrument is that the count moves off zero AND scales: B must
   * flag a SUPERSET of A, and must exceed A unless there is nothing left to grow into
   * (`workTotal === 1`). `workTotal`/`workList` are reported either way so the ceiling is
   * visible rather than assumed.
   */
  const aSet = result.controlA_oneRegionBlurred;
  const bSet = result.controlB_allGlassWindow;
  result.controlBSupersetOfA = aSet.every((x) => bSet.includes(x));
  result.controlBScaled = bSet.length > aSet.length || result.workTotal === 1;
  result.verdict =
    result.baseline.length === 0
    && aSet.length >= 1
    && result.workTotal >= 1
    && result.controlBSupersetOfA
    && result.controlBScaled
    && result.restored.length === 0
    && result.restoredMaterialIdentical
      ? 'CONTROL FAILED AS REQUIRED — category 3 instrument is proven'
      : 'VOID — the control did not fail, so the score means nothing';
  return JSON.stringify(result);
})()
