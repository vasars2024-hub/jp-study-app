/**
 * Negative control for `l1-ui-clarity.js`. Category 5's own rule is that at least one question
 * must be able to fail; after the four probe repairs Q10 answers YES on all five surfaces, and a
 * question that cannot return NO is measuring nothing.
 *
 * Induces three failures in the Dictionary window, each aimed at a different question:
 *   Q2  blank the window title            -> "current location obvious" must go NO
 *   Q3  displace the primary action below the body viewport -> "visible without hunting" NO
 *   Q10 inject a real DASHBOARD: 6 equally sized cards, each painting its own background, each
 *       carrying a DIFFERENT control signature -> uniformity 1.00 with >1 signature must go NO.
 *
 * Q10's plant is the important one. The probe already sees `div.os-theme-grid` at uniformity 1.00
 * and calls it YES because all 13 swatches share one control signature — a gallery. If the
 * injected dashboard, which differs only in that its cards are heterogeneous, does not go NO, the
 * gallery discriminator is just a blanket exemption and Q10 is unfalsifiable.
 *
 * Everything is marked `data-l1-clarity-control` / restored by `-cleanup.js`.
 */
(() => {
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes('Dictionary'),
  );
  if (!win) return JSON.stringify({ refuse: 'Dictionary window not open' });
  const body = win.querySelector('.fwin-body') || win;

  // Q2 — blank the title, remembering it verbatim.
  const titleEl = win.querySelector('.fwin-title-text');
  const savedTitle = titleEl ? titleEl.textContent : null;
  if (titleEl) titleEl.textContent = '';

  // Q3 — push the primary action far below the body's visible box.
  const NAV = 'nav,[role="tablist"],[class*="rail"],[class*="sidebar"],[class*="-nav"],[class*="tabs"]';
  const primary = [...win.querySelectorAll('button,[role="button"]')].find(
    (e) => /(^|\s|-)primary(\s|$|-)/.test(String(e.className || '')) && !e.closest('.fwin-bar') && !e.closest(NAV),
  );
  const savedTransform = primary ? primary.style.transform : null;
  if (primary) {
    primary.setAttribute('data-l1-clarity-moved', '1');
    primary.style.transform = 'translateY(4000px)';
  }

  // Q10 — a genuine generic dashboard: uniform boxes, heterogeneous functions.
  const grid = document.createElement('div');
  grid.setAttribute('data-l1-clarity-control', 'dashboard');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,200px);gap:8px;padding:8px;background:#101010';
  const kinds = ['button', 'input', 'select', 'textarea', 'a', 'summary'];
  kinds.forEach((kind, i) => {
    const card = document.createElement('div');
    card.style.cssText = 'width:200px;height:80px;background:#2a2a2a;border:1px solid #555;border-radius:8px';
    const inner = document.createElement(kind === 'a' ? 'a' : kind);
    if (kind === 'a') inner.setAttribute('href', '#');
    inner.className = `l1ctl-kind-${i}`;
    inner.textContent = `card ${i}`;
    card.appendChild(inner);
    grid.appendChild(card);
  });
  body.appendChild(grid);

  return JSON.stringify({
    savedTitle,
    savedTransform,
    primaryFound: !!primary,
    dashboardCards: kinds.length,
    expect: { Q2: 'NO', Q3: 'NO', Q10: 'NO' },
  });
})()
