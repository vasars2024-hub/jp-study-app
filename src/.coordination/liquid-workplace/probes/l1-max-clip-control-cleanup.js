/**
 * Removes `l1-max-clip-control.js`'s injected box and proves it is gone.
 *
 * Run this before the restore click, and re-run `l1-use-of-space.js` after it: the injected
 * clip must fall back to the surface's real number. A control left in the DOM would poison
 * every later measurement in the session, and nothing about the page would look wrong.
 */
(() => {
  const p = document.getElementById('__l1_ctrl_clip');
  if (p) p.remove();
  return JSON.stringify({ removed: !!p, stillPresent: !!document.getElementById('__l1_ctrl_clip') });
})()
