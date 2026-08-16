/**
 * Negative control for `l1-use-of-space.js` — rubric category 4.
 *
 * The rubric: "shrink below the smallest supported size and confirm the measurement reports the
 * breakage it should." A `clipped: 0` that has never been anything else is an unproven probe.
 *
 * Three sizes, one eval, restore in `finally`:
 *   A. compact — MIN_W x MIN_H = 260x170 (`DesktopShell.tsx:266`, the product's own floor).
 *   B. sub-minimum — 200x130, below anything the product allows. Expect clipping.
 *   C. restore — expect the entry numbers back, and the inline style attribute byte-identical.
 *
 * WHY INLINE STYLE AND NOT THE PRODUCT'S RESIZE. `liquid-surface-baseline.ps1:258-262` records
 * the trap: a resize committed through `resizeStart`/`onPatch` writes `desktop-layout.json`, and
 * a run that dies between the resize and the restore leaves the user's desk at 260x170. Writing
 * `w.style.width` never reaches React state — the shell rewrites that inline style from `win.w`
 * on its next render, so an interrupted run self-heals. The cost is that measurement must happen
 * in the SAME eval that sets the size (css-measure §5), which is why all three legs are here.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-use-of-space-control.js`
 */
(() => {
const run = (TITLE) => {
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return { refuse: `no .fwin titled ${TITLE}` };
  const R0 = win.getBoundingClientRect();
  if (!R0.width || !R0.height) return { refuse: 'window is 0x0' };

  const painted = (e) => e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true });
  const scrollableAncestor = (el) => {
    let n = el.parentElement;
    while (n && n !== win.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1)) return true;
      n = n.parentElement;
    }
    return false;
  };
  const snap = (label) => {
    const R = win.getBoundingClientRect();
    const all = [...win.querySelectorAll('*')].filter(painted);
    const clipped = all.filter((e) => {
      const b = e.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return false;
      const out = b.right > R.right + 1 || b.left < R.left - 1 || b.bottom > R.bottom + 1 || b.top < R.top - 1;
      return out && !scrollableAncestor(e);
    });
    const hs = all.filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1);
    return {
      label,
      box: `${Math.round(R.width)}x${Math.round(R.height)}`,
      clipped: clipped.length,
      clippedTop: clipped.slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}`),
      horizontalScrollers: hs.length,
      paintedNodes: all.length,
    };
  };

  const styleBefore = win.getAttribute('style');
  const out = { title: TITLE };
  try {
    out.entry = snap('entry');
    win.style.width = '260px'; win.style.height = '170px';
    out.compact_260x170 = snap('compact (MIN_W x MIN_H)');
    win.style.width = '200px'; win.style.height = '130px';
    out.subMinimum_200x130 = snap('sub-minimum');
  } finally {
    win.style.width = `${Math.round(R0.width)}px`;
    win.style.height = `${Math.round(R0.height)}px`;
    if (styleBefore !== null) win.setAttribute('style', styleBefore);
  }
  out.restored = snap('restored');
  out.styleIdentical = win.getAttribute('style') === styleBefore;
  out.restoredExactly = out.restored.box === out.entry.box && out.styleIdentical;
  out.broke =
    out.subMinimum_200x130.clipped > out.entry.clipped
    || out.subMinimum_200x130.horizontalScrollers > out.entry.horizontalScrollers;
  return out;
};

// Both reference apps. Dictionary puts everything inside one vertical scroller, so by the
// `unreach` definition it CANNOT clip at any size — a control run only on it reports VOID for
// a reason that is the surface's, not the probe's. `ALL_APPS_BASELINE.md` already records
// media at 49 unreachable boxes at min against dictionary's 0, so Media is the discriminating
// case, and running both is what shows the difference is real.
const results = { Dictionary: run('Dictionary'), Media: run('Media') };
const broke = Object.entries(results).filter(([, r]) => r.broke).map(([k]) => k);
const restored = Object.values(results).every((r) => r.refuse || r.restoredExactly);
return JSON.stringify({
  results,
  brokeAtSubMinimum: broke,
  allRestoredExactly: restored,
  verdict: broke.length >= 1 && restored
    ? `CONTROL FAILED AS REQUIRED on ${broke.join(', ')} — category 4 probe is proven`
    : 'VOID — nothing broke below the supported minimum, so a clean score means nothing',
});
})()
