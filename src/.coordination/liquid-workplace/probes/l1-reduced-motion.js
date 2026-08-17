/**
 * L1 instrument — the fourth number of rubric category 1: motion duration under reduced motion.
 * The rubric's bar: reduced motion collapses animation to <= 0.01 s.
 *
 * TWO MECHANISMS SHIP, and conflating them is how this reads as a pass. The app has
 *   (a) the OS media query `@media (prefers-reduced-motion: reduce)`, and
 *   (b) an in-app `reduce-motion` CLASS on <html> plus a `--motion-duration` token, driven by
 *       the Settings > Display control `reduce-motion` (`agentNavigationIndex.ts:279`).
 * `matchMedia` answers (a). Adding the class answers (b). A surface can satisfy one and not
 * the other, and only the union is what a user gets.
 *
 * This probe does NOT emulate the OS setting — that needs CDP, and faking it by adding the
 * class would silently answer a different question than the one asked. It reports what
 * `matchMedia` currently says, and it measures (b) directly by toggling the class and diffing
 * every non-zero duration on the surface. Both numbers are reported separately.
 *
 * A WORKED EXAMPLE OF WHY THE RUBRIC FORBIDS SCORING FROM SOURCE — this one nearly produced a
 * false FAILURE, the rarer direction. Grepping `styles.css` and `shell.css` finds the media
 * query scoped to `.game-arena *` (`styles.css:20942`) and the `.reduce-motion` rules scoped to
 * named widgets (`.music-line`, `.wall-animated`, `.os-companion`, `.buddy-toast`) — none of
 * which reach Dictionary or Media. That reading says the category fails. It is wrong: the
 * global rules live in a file neither grep touched, `theme/a11y.css:36-46` (OS query) and
 * `:50-55` (`html.reduce-motion *`), both app-wide with `!important` and both collapsing to
 * 0.001 ms. The live diff is what settled it — 8 -> 0 on Dictionary and 30 -> 0 on Media.
 * Source explains a score; it cannot produce one, in either direction.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-reduced-motion.js`
 */
(() => {
  const TITLES = ['Dictionary', 'Media'];
  const root = document.documentElement;

  const sample = (title) => {
    const win = [...document.querySelectorAll('.fwin')].find(
      (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(title),
    );
    if (!win) return { title, refuse: 'not open' };
    const R = win.getBoundingClientRect();
    if (!R.width || !R.height) return { title, refuse: 'window is 0x0 — refusing to record zeros' };

    const secs = (v) => String(v || '').split(',')
      .map((s) => {
        const t = s.trim();
        if (t.endsWith('ms')) return parseFloat(t) / 1000;
        if (t.endsWith('s')) return parseFloat(t);
        return 0;
      })
      .filter((n) => Number.isFinite(n));

    const moving = [];
    for (const e of win.querySelectorAll('*')) {
      if (!e.checkVisibility?.({ contentVisibilityAuto: true })) continue;
      const cs = getComputedStyle(e);
      const d = Math.max(0, ...secs(cs.transitionDuration), ...secs(cs.animationDuration));
      if (d > 0.01) {
        moving.push({
          el: `${e.tagName.toLowerCase()}${e.className ? `.${String(e.className).split(' ')[0]}` : ''}`,
          dur: Number(d.toFixed(3)),
        });
      }
    }
    moving.sort((a, b) => b.dur - a.dur);
    return {
      title,
      overThreshold: moving.length,
      longest: moving[0] || null,
      sample: moving.slice(0, 5),
    };
  };

  const had = root.classList.contains('reduce-motion');
  const before = TITLES.map(sample);
  root.classList.add('reduce-motion');
  const after = TITLES.map(sample);
  if (!had) root.classList.remove('reduce-motion');

  return JSON.stringify({
    osQueryMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    motionDurationToken: getComputedStyle(root).getPropertyValue('--motion-duration').trim(),
    reduceMotionClassWasAlreadyOn: had,
    classRestored: root.classList.contains('reduce-motion') === had,
    before,
    after,
  });
})()
