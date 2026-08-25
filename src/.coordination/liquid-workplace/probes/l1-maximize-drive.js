/**
 * L1 instrument — the MAXIMIZED size for rubric category 4.
 *
 * WHY THIS IS A SEPARATE FILE FROM `l1-use-of-space-control.js`. That control drives
 * compact by writing an inline `style.width`, which applies synchronously and can therefore
 * resize-measure-restore inside ONE `/eval`. Maximize cannot: `toggleMax`
 * (`DesktopShell.tsx:1796`) is a React `setWins` state update, so a click and a measurement
 * in the same expression read the box from BEFORE the commit — the "controlled prop is a
 * render behind" trap this repo has already paid for. Each step below is its own bridge
 * call, and `l1-use-of-space.js` is what measures.
 *
 * It also must go through the real `.fwin-b[title="Maximize"]` button rather than an inline
 * width, because `.fwin-max` changes the applied CSS (`styles.css:13849`) and an inline
 * width would measure a size the product never actually paints.
 *
 * `toggleMax` stores the pre-maximize box in `w.rect` and restores from it, so the round
 * trip is the product's own and a second click is the restore. Verify it: `left/top/width/
 * height` must come back byte-identical (z-index legitimately moves, focus raises it).
 *
 * Sequence, one call each:
 *   1. this file with TITLE='Dictionary'   -> maximize
 *   2. l1-use-of-space.js                  -> measure
 *   3. this file with TITLE='Dictionary'   -> restore
 *   4-6. the same three with TITLE='Media'
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-maximize-drive.js`
 * after setting TITLE below. It reports the style it is leaving, so the restore is checkable.
 */
(() => {
  // `window.__lqScoreTitle` (singular — this probe drives ONE window per call, unlike
  // `l1-use-of-space.js`'s plural list) selects the target; the default keeps every run
  // already recorded in L1_USE_OF_SPACE.md reproducible.
  const TITLE = (typeof window !== 'undefined' && window.__lqScoreTitle) || 'Dictionary';

  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });

  const btn = [...win.querySelectorAll('.fwin-btns .fwin-b')].find(
    (b) => b.getAttribute('title') === 'Maximize',
  );
  if (!btn) return JSON.stringify({ refuse: 'no Maximize button — refusing to fake it with an inline width' });

  const styleBefore = win.getAttribute('style');
  const wasMax = win.classList.contains('fwin-max');
  btn.click();
  return JSON.stringify({ title: TITLE, wasMaximized: wasMax, styleBefore });
})()
