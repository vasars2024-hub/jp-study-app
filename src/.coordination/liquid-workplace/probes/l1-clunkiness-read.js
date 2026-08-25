/**
 * Reader for `l1-clunkiness.js`. Reports the rubric's numbers and the structural traps that can
 * be decided from the DOM once the dominant task has been driven.
 *
 * Reads, never drives — so it can be called repeatedly mid-flow without changing the cost it is
 * counting. Every count says which set it covered.
 */
(() => {
  const st = window.__liqClunk;
  if (!st) return JSON.stringify({ refuse: 'not armed — run l1-clunkiness.js first' });

  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(st.surface),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${st.surface}` });

  // Scroll traps: content taller than its box with no way to reach the rest of it.
  const scrollTraps = [];
  for (const el of win.querySelectorAll('*')) {
    const over = el.scrollHeight - el.clientHeight;
    if (over <= 2) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') continue;
    if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue; // not clipped: it overflows visibly
    // Visually-hidden screen-reader text is clipped ON PURPOSE and is not a trap. The first run
    // reported four `span.sr-only` with 21 unreachable px each; they are the accessibility
    // affordance category 1 scores, so counting them here would penalise the surface for being
    // accessible. Signature: the standard clip-rect/1px-box pattern, not the class name.
    const r = el.getBoundingClientRect();
    if (r.width <= 4 || r.height <= 4) continue;
    if (cs.clipPath !== 'none' || (cs.clip && cs.clip !== 'auto')) continue;
    // A line clamp WITH a disclosure control beside it is a summary, not a trap:
    // the rest of the text is one click away and the control says so. Measured
    // 2026-08-25 on the Media Center's detail drawer, which reported
    // `p.medialib-drawer__synopsis` with **182 unreachable px** — sitting
    // directly above its own "Show more" button. Without this the probe scores
    // progressive disclosure, which is the thing §2.3 asks for, as a defect.
    const clamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    const disclosure = el.parentElement
      && [...el.parentElement.children].some(
        (sib) => sib !== el && (sib.tagName === 'BUTTON' || sib.querySelector?.('button')),
      );
    if (clamped && disclosure) continue;
    // A fixed-size media crop is not unreachable content either: `object-fit:
    // cover` means the picture is deliberately larger than its frame. Same run
    // reported `div.medialib-drawer__hero` at 40px for exactly this.
    const media = [...el.children].filter((c) => c.tagName === 'IMG' || c.tagName === 'VIDEO');
    if (media.length > 0 && media.every((m) => getComputedStyle(m).objectFit === 'cover')) continue;
    scrollTraps.push({
      sel: el.tagName.toLowerCase() + '.' + String(el.className || '').trim().split(/\s+/)[0],
      overflowY: cs.overflowY,
      unreachablePx: Math.round(over),
    });
  }

  // Open dialogs the driver must prove escapable.
  const dialogs = [...win.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open],.modal')]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => ({
      sel: el.tagName.toLowerCase() + '.' + String(el.className || '').trim().split(/\s+/)[0],
      txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    }));

  // `recvMs` is the scoring number (renderer receipt → acknowledging paint). `stampMs` is kept
  // unscored because on a bridge-driven click it bills the app for the main→renderer hop — see
  // the trap note in `l1-clunkiness.js`.
  const pick = (kind, field) => st.latencies.filter((l) => l.kind === kind).map((l) => l[field]);
  const allRecv = st.latencies.map((l) => l.recvMs);
  const allStamp = st.latencies.map((l) => l.stampMs);

  return JSON.stringify({
    surface: st.surface,
    cost: { clicks: st.clicks, keystrokes: st.keystrokes },
    latencyMs: {
      inputRecv: pick('input', 'recvMs'),
      clickRecv: pick('click', 'recvMs'),
      worstRecv: allRecv.length ? Math.max(...allRecv) : null,
      overBar100Recv: allRecv.filter((ms) => ms > 100).length,
      inputStampUnscored: pick('input', 'stampMs'),
      clickStampUnscored: pick('click', 'stampMs'),
      worstStampUnscored: allStamp.length ? Math.max(...allStamp) : null,
      n: allRecv.length,
    },
    resultMarks: st.resultMarks,
    resultSel: st.resultSel || '.dict-entry',
    entriesNow: win.querySelectorAll(st.resultSel || '.dict-entry').length,
    scrollTraps: { n: scrollTraps.length, items: scrollTraps.slice(0, 8) },
    openDialogs: { n: dialogs.length, items: dialogs },
  });
})()
