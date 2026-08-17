/**
 * Restores `l1-a11y-control.js`'s forced colour and proves it is gone.
 *
 * Re-run `l1-accessibility.js` after this: `failingCount` must fall back to the surface's real
 * number. A forced colour left behind would poison every later contrast reading in the session
 * and nothing on the page would look wrong — the element still renders, just in the wrong ink.
 */
(() => {
  const els = [...document.querySelectorAll('[data-l1-ctrl="1"]')];
  for (const e of els) {
    e.style.color = e.dataset.l1CtrlPrevColor || '';
    delete e.dataset.l1CtrlPrevColor;
    delete e.dataset.l1Ctrl;
  }
  return JSON.stringify({
    restored: els.length,
    stillPresent: document.querySelectorAll('[data-l1-ctrl="1"]').length,
  });
})()
