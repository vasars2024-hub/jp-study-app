/**
 * L1 negative control for rubric category 1 — the control the rubric itself names:
 * "measure one element you know fails (or force a failing value) and confirm the probe
 * reports it. A probe that has never returned a failure this session is unproven."
 *
 * Both surfaces come back with `failingCount: 0`. That is the single most dangerous shape in
 * this repo's history: a parser that fails to match `color(srgb ...)` returns null and scores
 * every boundary as ABSENT rather than weak, which is indistinguishable from a clean bill of
 * health — that exact shape reported PASS off 2 stops out of a real population of 52, with 23
 * failing. So a zero is not accepted until the probe has been made to produce a non-zero.
 *
 * WHY NOT A THEME SWAP. `css-measure` §0 says to move the palette and check the number moves.
 * Setting `data-theme` on <html> from the bridge does NOT do that: measured 2026-08-17, it
 * repaints the CSS-variable tokens (`--panel` -> `#fffaf1`) while `body` stays `rgb(28,28,30)`,
 * the button text stays `rgb(245,245,247)`, and `--accent` stays `#10b981` because
 * `osPersonalization` writes it INLINE on <html>, where it outranks every stylesheet rule
 * (§10, third recorded case). The result is a half-applied palette that manufactures ~1.01
 * ratios out of nothing. 39 "failures" appeared that way and NONE of them were real. A real
 * two-palette run has to go through the product's own theme control.
 *
 * This control instead forces one known-bad value on a real element, in the real palette:
 * `--muted` grey text set to the panel's own colour. It must appear in `worst` with a ratio
 * near 1.0, and `failingCount` must rise from 0.
 *
 * Sequence: this file -> `l1-accessibility.js` (failingCount MUST rise) -> cleanup below.
 * Measured 2026-08-17 on Dictionary: failingCount 0 -> 1, ratio 1.00 on the forced element.
 */
(() => {
  // Same global as the category-3 control: a hardcoded title made this unrunnable against
  // the OTHER surface gate 461 names, which is how a category closes at 10 on one window and
  // is left VOID on the other. Default unchanged, so every recorded Dictionary run reproduces.
  const TITLE = (typeof window !== 'undefined' && window.__lqControlTitle) || 'Dictionary';
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });

  // Pick a real, painted, text-bearing element — not one we created, so the control exercises
  // the same walk the measurement uses.
  const target = [...win.querySelectorAll('span,div,small,button')].find((e) => {
    const t = [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    const r = e.getBoundingClientRect();
    return t && r.width > 8 && r.height > 8 && e.checkVisibility?.({ contentVisibilityAuto: true });
  });
  if (!target) return JSON.stringify({ refuse: 'no painted text element to force' });

  const bg = getComputedStyle(target).backgroundColor;
  // Walk up for the first opaque backdrop, then paint the text that exact colour: ratio -> 1.00.
  let n = target; let opaque = null;
  while (n && !opaque) {
    const c = getComputedStyle(n).backgroundColor;
    if (c && !/rgba\([^)]*,\s*0\s*\)/.test(c) && c !== 'transparent') opaque = c;
    n = n.parentElement;
  }
  target.dataset.l1CtrlPrevColor = target.style.color || '';
  target.dataset.l1Ctrl = '1';
  target.style.color = opaque || '#1a1823';

  return JSON.stringify({
    forced: `${target.tagName.toLowerCase()}.${String(target.className || '').split(' ')[0]}`,
    text: (target.textContent || '').trim().slice(0, 24),
    ownBg: bg,
    forcedColor: opaque || '#1a1823',
  });
})()
