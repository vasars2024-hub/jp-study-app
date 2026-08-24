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
  const TITLE = 'Dictionary';
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });
  const wr = win.getBoundingClientRect();
  if (!wr.width || !wr.height) return JSON.stringify({ refuse: 'window is 0x0' });
  const body = win.querySelector('.fwin-body');
  const entries = win.querySelector('.dict-entries');
  if (!body || !entries) return JSON.stringify({ refuse: 'no .fwin-body / .dict-entries — run a search first' });

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
      if (d > 3) return;
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
  const count = () => {
    const work = collect().filter(isDense);
    return work
      .filter((r) => !work.some((o) => o !== r && r.contains(o)))
      .filter(translucentBacking)
      .map((c) => `${c.tagName.toLowerCase()}.${String(c.className || '').split(' ')[0]}`);
  };

  const beforeEntries = entries.getAttribute('style');
  const beforeBody = body.getAttribute('style');
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
  const beforeMaterial = { entries: material(entries), body: material(body) };
  const result = { title: TITLE, box: `${Math.round(wr.width)}x${Math.round(wr.height)}` };
  try {
    result.baseline = count();
    entries.style.backdropFilter = 'blur(12px)';
    entries.style.backgroundColor = 'rgba(30,30,40,0.55)';
    result.controlA_oneRegionBlurred = count();
    entries.style.removeProperty('backdrop-filter');
    entries.style.removeProperty('background-color');
    body.style.backdropFilter = 'blur(18px)';
    body.style.backgroundColor = 'rgba(30,30,40,0.5)';
    result.controlB_allGlassWindow = count();
  } finally {
    entries.style.removeProperty('backdrop-filter');
    entries.style.removeProperty('background-color');
    body.style.removeProperty('backdrop-filter');
    body.style.removeProperty('background-color');
    if (beforeEntries === null) entries.removeAttribute('style'); else entries.setAttribute('style', beforeEntries);
    if (beforeBody === null) body.removeAttribute('style'); else body.setAttribute('style', beforeBody);
  }
  result.restored = count();
  // Raw comparison, no `|| null` coercion. Both elements ship with an EMPTY `style=""`
  // attribute (React writes one), and `('' || null)` folds that to null, so the coerced
  // form reported "not restored" on a tree that was byte-identical.
  result.styleBefore = { entries: beforeEntries, body: beforeBody };
  result.styleAfter = { entries: entries.getAttribute('style'), body: body.getAttribute('style') };
  result.restoredStyleIdentical =
    entries.getAttribute('style') === beforeEntries && body.getAttribute('style') === beforeBody;
  result.materialBefore = beforeMaterial;
  result.materialAfter = { entries: material(entries), body: material(body) };
  result.restoredMaterialIdentical =
    result.materialAfter.entries === beforeMaterial.entries
    && result.materialAfter.body === beforeMaterial.body;
  result.verdict =
    result.baseline.length === 0
    && result.controlA_oneRegionBlurred.length >= 1
    && result.controlB_allGlassWindow.length > result.controlA_oneRegionBlurred.length
    && result.restored.length === 0
    && result.restoredMaterialIdentical
      ? 'CONTROL FAILED AS REQUIRED — category 3 instrument is proven'
      : 'VOID — the control did not fail, so the score means nothing';
  return JSON.stringify(result);
})()
