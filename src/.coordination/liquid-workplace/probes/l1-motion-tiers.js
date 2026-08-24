/**
 * L1 instrument — rubric category 1's motion number, measured on ALL THREE tiers the app ships
 * rather than on whichever one happens to be reachable from the renderer.
 *
 * `l1-reduced-motion.js` measures tier (b) only, by toggling `html.reduce-motion`, and reported
 * "2 elements at 0.14 s — FAIL". That is a true number about the wrong tier. The rubric's words
 * are "motion duration under `prefers-reduced-motion`", which is tier (a), the OS query. The
 * three tiers are a deliberate design, documented at `theme/a11y.css:49-52`:
 *
 *   (a) `@media (prefers-reduced-motion: reduce)` — the OS preference, a full stop:
 *       `a11y.css:36-46` sets `0.001ms !important` on `*`, `*::before`, `*::after`.
 *   (b) `html.reduce-motion` — the in-app Settings > Display "Reduced" control. HALVES the
 *       shared duration tokens and stops decorative ambience. Softening, not stopping, by
 *       design; scoring the rubric's 0.01 s bar against it is a category error.
 *   (c) `:root[data-motion-mode='disabled']` — the in-app kill switch
 *       (`motion/motion-system.css:200-207`), which also zeroes delays and in-flight
 *       animations. This is the app-side equivalent of (a).
 *
 * (b) and (c) are reachable by writing to `<html>`. (a) is NOT emulable from the renderer —
 * `matchMedia` is read-only and adding the class answers a different question. It needs the app
 * relaunched under `--force-prefers-reduced-motion`, and this probe reports `mqMatches` so the
 * reader can tell which run they are looking at. A run with `mqMatches: false` has NOT measured
 * tier (a) and says so.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-motion-tiers.js`
 */
(() => {
  const TITLE = 'Dictionary';
  const BAR = 0.01;
  const root = document.documentElement;

  const win = [...document.querySelectorAll('.fwin')].find((w) =>
    (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });
  const R = win.getBoundingClientRect();
  if (!R.width || !R.height)
    return JSON.stringify({ refuse: 'window is 0x0 — refusing to record zeros' });

  const secs = (v) =>
    String(v || '')
      .split(',')
      .map((s) => {
        const t = s.trim();
        if (t.endsWith('ms')) return parseFloat(t) / 1000;
        if (t.endsWith('s')) return parseFloat(t);
        return 0;
      })
      .filter((n) => Number.isFinite(n));

  const measure = () => {
    const moving = [];
    for (const e of win.querySelectorAll('*')) {
      if (!e.checkVisibility?.({ contentVisibilityAuto: true })) continue;
      const cs = getComputedStyle(e);
      const d = Math.max(0, ...secs(cs.transitionDuration), ...secs(cs.animationDuration));
      if (d > BAR)
        moving.push({
          el: `${e.tagName.toLowerCase()}${e.className ? `.${String(e.className).split(' ')[0]}` : ''}`,
          dur: Number(d.toFixed(3)),
        });
    }
    moving.sort((a, b) => b.dur - a.dur);
    return { over: moving.length, longest: moving[0] || null, top: moving.slice(0, 4) };
  };

  // Capture-patch-restore, and the restore is verified rather than assumed.
  const hadClass = root.classList.contains('reduce-motion');
  const hadMode = root.getAttribute('data-motion-mode');

  const baseline = measure();

  root.classList.add('reduce-motion');
  const tierB = measure();
  if (!hadClass) root.classList.remove('reduce-motion');

  root.setAttribute('data-motion-mode', 'disabled');
  const tierC = measure();
  if (hadMode === null) root.removeAttribute('data-motion-mode');
  else root.setAttribute('data-motion-mode', hadMode);

  const after = measure();

  return JSON.stringify({
    surface: TITLE,
    presentation: win.getAttribute('data-presentation'),
    theme: root.getAttribute('data-theme'),
    box: `${Math.round(R.width)}x${Math.round(R.height)}`,
    bar: BAR,
    // TIER (a): true only when the app was relaunched under --force-prefers-reduced-motion.
    mqMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    tierA_measured: matchMedia('(prefers-reduced-motion: reduce)').matches ? baseline : null,
    baseline,
    tierB_reduceMotionClass: tierB,
    tierC_motionModeDisabled: tierC,
    restored: {
      classMatches: root.classList.contains('reduce-motion') === hadClass,
      modeMatches: (root.getAttribute('data-motion-mode') ?? null) === hadMode,
      countMatchesBaseline: after.over === baseline.over,
    },
  });
})()
