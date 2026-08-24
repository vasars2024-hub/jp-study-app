/**
 * Put the Dictionary window back the way a sweep found it, and prove no user data moved.
 *
 * Two things every L1 run on this surface needs and neither of the sweep probes does:
 *
 * 1. **The lens.** `l1-deadend.js` drives the view switchers LAST, so it ends on Interlinear with
 *    `.dict-entry` at 0 — which reads exactly like a failed search and has already sent one worker
 *    looking for a broken dictionary. This clicks back to `Automatic` and reports the entry count.
 *
 * 2. **The user-data check.** The sweep skips every destructive control by name, but that rule has
 *    silently failed once already (2026-08-24: sixteen icon-only buttons had no name for it to
 *    match, and 6 words plus 8 clipboard rows were written before anyone read the stores). So this
 *    reports the two stores by count, against the app-start timestamp in `debug/bridge.json`, and
 *    optionally undoes what a run added — flashcards through the product's own toggle, clipboard
 *    rows by dropping exactly the rows created after the app started.
 *
 * Pass the app-start epoch as `window.__l1Since` before running, or it only reports and undoes
 * nothing. `debug/bridge.json` carries it as `started`.
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-surface-settle.js`
 */
(() => {
  const SINCE = typeof window.__l1Since === 'number' ? window.__l1Since : null;
  const UNDO = window.__l1Undo === true;
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes('Dictionary'),
  );
  if (!win) return JSON.stringify({ refuse: 'no .fwin titled Dictionary' });

  const lab = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '')
    .replace(/\s+/g, ' ').trim();
  const auto = [...win.querySelectorAll('button,[role="tab"]')].find((b) => lab(b) === 'Automatic');
  if (auto) auto.click();

  const saved = JSON.parse(localStorage.getItem('jp-saved-words-ja') || '[]');
  const clip = JSON.parse(localStorage.getItem('jp-clipboard-history') || '[]');
  const savedNew = SINCE ? saved.filter((w) => (w.addedAt || 0) > SINCE) : [];
  const clipNew = SINCE ? clip.filter((c) => (c.createdAt || 0) > SINCE) : [];

  const undone = { stars: 0, clipRows: 0 };
  if (UNDO && SINCE) {
    // Flashcards come off through the product's own toggle; clipboard has no product-side reverse,
    // so exactly the rows this session created are dropped from both tiers.
    for (const b of win.querySelectorAll('.dict-star.on')) { b.click(); undone.stars += 1; }
    if (clipNew.length) {
      const keep = clip.filter((c) => (c.createdAt || 0) <= SINCE);
      localStorage.setItem('jp-clipboard-history', JSON.stringify(keep));
      window.dispatchEvent(new CustomEvent('clipboard-history-changed'));
      const req = indexedDB.open('jp-study-db', 1);
      req.onsuccess = () => {
        try { req.result.transaction('kv', 'readwrite').objectStore('kv').put(keep, 'clipboard-history'); }
        catch { /* the localStorage tier is the one the app reads */ }
      };
      undone.clipRows = clipNew.length;
    }
  }

  return JSON.stringify({
    lensRestored: !!auto,
    entries: win.querySelectorAll('.dict-entry').length,
    baitPresent: !!document.getElementById('__liq-deadend-bait'),
    since: SINCE,
    savedTotal: saved.length,
    savedThisSession: savedNew.map((w) => w.word),
    clipTotal: clip.length,
    clipThisSession: clipNew.length,
    undone: UNDO ? undone : null,
    clean: savedNew.length === 0 && clipNew.length === 0,
  });
})()
