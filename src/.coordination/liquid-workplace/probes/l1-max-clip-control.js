/**
 * L1 negative control for the MAXIMIZED measurement — rubric category 4.
 *
 * The thing that has to be disproved: at maximized both surfaces report `clipped: 0`, and a
 * zero from a probe that cannot see anything looks exactly like a zero from a clean surface.
 * The compact control (`l1-use-of-space-control.js`) does not cover this — it proves the
 * probe fires at 260x170 on Media, not that it fires at 1264x765 on the maximized geometry,
 * which is a different code path (`.fwin-max`, `styles.css:13849`).
 *
 * So: inject one box that MUST be counted — 300 px wide, starting 20 px inside the right
 * frame edge, appended to `.fwin-body` with `position:fixed` so it has no scrollable
 * ancestor and therefore satisfies `l1-use-of-space.js`'s `unreach` definition of clipping.
 *
 * REFUSES if the target is not actually maximized. A control that certifies a size it was
 * not run at is worse than no control.
 *
 * Sequence: this file -> `l1-use-of-space.js` (clipped must RISE, and only on the target)
 * -> `l1-max-clip-control-cleanup.js` -> `l1-use-of-space.js` again (must fall back).
 *
 * Measured 2026-08-17 on maximized Media 1264x765: clipped 0 -> 1, Dictionary unchanged at 0.
 */
(() => {
  const TITLE = 'Media';

  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });
  if (!win.classList.contains('fwin-max')) {
    return JSON.stringify({ refuse: `${TITLE} is not maximized — a control must run at the size it certifies` });
  }

  const R = win.getBoundingClientRect();
  const body = win.querySelector('.fwin-body') || win;
  const probe = document.createElement('div');
  probe.id = '__l1_ctrl_clip';
  probe.style.cssText = `position:fixed;left:${R.right - 20}px;top:${R.top + 120}px;width:300px;height:60px;background:#f0f;z-index:9;`;
  body.appendChild(probe);

  return JSON.stringify({
    injected: true,
    target: TITLE,
    winBox: `${Math.round(R.width)}x${Math.round(R.height)}`,
    probeRightEdge: Math.round(R.right - 20 + 300),
    frameRightEdge: Math.round(R.right),
  });
})()
