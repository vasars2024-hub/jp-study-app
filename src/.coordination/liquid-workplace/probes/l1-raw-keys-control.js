/**
 * Negative control for `l1-raw-keys.js`. The rubric: *"if the control does not fail, the probe
 * is broken and the score is VOID — not 10."*
 *
 * Plants three things a real raw-key leak looks like, in the Dictionary window:
 *   1. a text node that is a REAL catalog key (`settings.language.title`) — the exact string
 *      `translate()` returns when a key is missing from every catalog;
 *   2. a `placeholder` attribute carrying a key — the half a text-node-only sweep misses;
 *   3. a text node that is a key on a DISPLAY:NONE element — this one must NOT be reported,
 *      because an unpainted key does not reach a user, and a probe that flags it is
 *      over-reporting rather than measuring.
 *
 * So the control fails in two directions at once: 2 must be found, 1 must be found, and the
 * third must be silent. A probe that returns 3 is as broken as one that returns 0.
 *
 * Everything is marked `data-l1-control` and removed by `l1-raw-keys-control-cleanup.js`.
 */
(() => {
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes('Dictionary'),
  );
  if (!win) return JSON.stringify({ refuse: 'Dictionary window not open — control cannot be planted' });
  const body = win.querySelector('.fwin-body') || win;

  const visible = document.createElement('div');
  visible.setAttribute('data-l1-control', 'visible-text');
  visible.textContent = 'settings.language.title';
  body.appendChild(visible);

  const attr = document.createElement('input');
  attr.setAttribute('data-l1-control', 'attr');
  attr.setAttribute('placeholder', 'dictionary.search.placeholder');
  body.appendChild(attr);

  const hidden = document.createElement('div');
  hidden.setAttribute('data-l1-control', 'hidden-text');
  hidden.style.display = 'none';
  hidden.textContent = 'settings.storage.title';
  body.appendChild(hidden);

  return JSON.stringify({
    planted: 3,
    expectFound: ['settings.language.title', 'dictionary.search.placeholder'],
    expectSilent: ['settings.storage.title'],
    marker: '[data-l1-control]',
  });
})()
