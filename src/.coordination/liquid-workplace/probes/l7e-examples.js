/**
 * L7-E leg B, load 2: `Find example sentences` — the heaviest action the Dictionary window
 * performs on itself — driven while `tools/liquid-perf-probe.ps1` samples `/health`.
 *
 * Fed to that probe as `-DuringJs (Get-Content ... -Raw)`.
 *
 * VOID unless `window.__l7eExamples.done === true` and the window's node count actually grew:
 * a control that was clicked and did nothing measures no load, and its `/health` distribution
 * would be indistinguishable from idle.
 *
 * RESOLVED BY TITLE, 2026-08-24. This used to take the first `.fwin` without `display:none`,
 * which is only the Dictionary window while `l7d-setup.cjs` has the others hidden. On a desktop
 * carrying Media and Video it picked Media and returned `VOID: no "Find example sentences"
 * button` — a refusal that looks like a missing feature and is an instrument bug. Same fix as
 * `23cc333f` gave the L8 probes and this turn gave `l1-q78-drive.cjs`.
 */
(function () {
  var win = [].slice.call(document.querySelectorAll('.fwin')).filter(function (w) {
    if (w.style.display === 'none') return false;
    var t = w.querySelector('.fwin-title-text, .fwin-title');
    return !!t && /Dictionary|辞書|词典|Словар/i.test(t.textContent || '');
  })[0];
  if (!win) return 'VOID: no visible .fwin titled Dictionary';
  var btn = [].slice.call(win.querySelectorAll('button')).filter(function (b) {
    return /Find example sentences/i.test((b.textContent || '').trim());
  })[0];
  if (!btn) return 'VOID: no "Find example sentences" button';

  window.__l7eExamples = {
    nodesBefore: win.querySelectorAll('*').length,
    charsBefore: (win.textContent || '').length,
    started: Date.now(),
    done: false,
  };
  btn.click();
  setTimeout(function () {
    window.__l7eExamples.nodesAfter = win.querySelectorAll('*').length;
    window.__l7eExamples.charsAfter = (win.textContent || '').length;
    window.__l7eExamples.ms = Date.now() - window.__l7eExamples.started;
    window.__l7eExamples.done = true;
  }, 3000);
  return 'examples-fired';
})()
