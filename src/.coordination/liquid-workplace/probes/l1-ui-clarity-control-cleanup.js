/**
 * Restores everything `l1-ui-clarity-control.js` changed. Pass the title it returned as
 * `window.__L1_SAVED_TITLE` first, or this falls back to 'Dictionary' — the title is real product
 * chrome, and leaving it blank would silently corrupt every later probe's window lookup.
 */
(() => {
  const win = [...document.querySelectorAll('.fwin')][2];
  if (!win) return JSON.stringify({ refuse: 'window index 2 not present' });

  const titleEl = win.querySelector('.fwin-title-text');
  const restoredTitle = window.__L1_SAVED_TITLE || 'Dictionary';
  if (titleEl && !titleEl.textContent.trim()) titleEl.textContent = restoredTitle;

  const moved = [...document.querySelectorAll('[data-l1-clarity-moved]')];
  for (const m of moved) {
    m.style.transform = '';
    m.removeAttribute('data-l1-clarity-moved');
  }

  const planted = [...document.querySelectorAll('[data-l1-clarity-control]')];
  for (const p of planted) p.remove();

  return JSON.stringify({
    titleNow: titleEl ? titleEl.textContent : null,
    movedRestored: moved.length,
    plantedRemoved: planted.length,
    remainingMarkers: document.querySelectorAll('[data-l1-clarity-control],[data-l1-clarity-moved]').length,
  });
})()
