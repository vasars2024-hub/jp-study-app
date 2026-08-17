/**
 * L1 instrument — rubric category 8, "Honest states", on one window.
 *
 * Numbers the rubric asks for: count of dead controls; count of fabricated/placeholder values
 * rendered as real; and whether empty, loading, error and offline each render a named,
 * translated message. 10 requires 0 dead, 0 fabricated, all four states real, and **0 raw i18n
 * keys in all four languages**.
 *
 * THIS FILE MEASURES THE MECHANICALLY DECIDABLE HALF and says so. Dead-control counting means
 * driving all 54/31 controls and asserting a side effect each (`honesty-probe` probe A), which
 * is its own slice; this probe does not guess at it and does not report a 0 it did not earn.
 *
 * RAW I18N KEYS. `translate()` returns the BARE KEY on a miss (`i18n/core.ts:94`), so a missing
 * translation renders as `dict.results.err.addFailed` in the UI. That is the single highest-value
 * mechanical check for this category, because it is invisible to a key-count tool: `i18n-check`
 * compares catalogs against each other, and a key that no catalog has is missing from all of
 * them equally and so passes. Detection is on RENDERED TEXT: a run matching a dotted-identifier
 * shape with no spaces.
 *
 * The pattern deliberately requires >=2 dots. One dot matches real content — filenames
 * (`ep01.mkv`), version strings, `n5.grammar` style tags and ordinary prose abbreviations. Two
 * dots plus camelCase segments is the shape this codebase's keys actually have
 * (`dict.results.err.addFailed`, `settings.display.motionHint`). Candidates are reported
 * individually rather than as a bare count, because the FIRST thing to do with a non-zero here
 * is check it is not a filename.
 *
 * FABRICATED VALUES are probe B and require an empty scratch profile to judge properly — real
 * data on a populated profile and a hardcoded constant look identical. This probe therefore
 * reports the *candidates* (status-like words rendered next to a status dot) and explicitly
 * does NOT issue a verdict on them from a populated profile.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-honest-states.js`
 */
(() => {
  const TITLE = 'Dictionary';

  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(TITLE),
  );
  if (!win) return JSON.stringify({ refuse: `no .fwin titled ${TITLE}` });
  const R = win.getBoundingClientRect();
  if (!R.width || !R.height) return JSON.stringify({ refuse: 'window is 0x0 — refusing to record zeros' });

  const painted = (e) => (typeof e.checkVisibility === 'function'
    ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
    : true);

  // ---- raw i18n keys in rendered text -----------------------------------------
  const KEY = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+){2,}$/;
  const rawKeys = [];
  const tw = document.createTreeWalker(win, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    const s = t.nodeValue && t.nodeValue.trim();
    if (!s || !t.parentElement || !painted(t.parentElement)) continue;
    for (const tok of s.split(/\s+/)) {
      if (KEY.test(tok)) {
        rawKeys.push({
          token: tok,
          el: `${t.parentElement.tagName.toLowerCase()}.${String(t.parentElement.className || '').split(' ')[0]}`,
        });
      }
    }
  }

  // ---- the four states, by what is actually rendered ---------------------------
  // Named message = a text run of >=12 chars that is not a raw key. Presence of the CONTAINER
  // is not the test; `honesty-probe` D calibration records five surfaces mis-bucketed as
  // EMPTY-SILENT by a selector that never read what was rendered.
  const textOf = (sel) => [...win.querySelectorAll(sel)]
    .filter(painted)
    .map((e) => (e.textContent || '').trim())
    .filter((s) => s.length >= 12 && !KEY.test(s));

  const states = {
    emptyLike: textOf('[class*="empty"],[class*="placeholder"],[class*="no-results"]'),
    loadingLike: textOf('[class*="loading"],[class*="spinner"],[aria-busy="true"]'),
    errorLike: textOf('[class*="error"],[class*="err"],[role="alert"]'),
    offlineLike: textOf('[class*="offline"],[class*="unreachable"],[class*="disconnected"]'),
  };

  // ---- fabricated-value CANDIDATES (probe B needs an empty profile — no verdict here) ------
  const STATUS = /^(connected|ready|available|configured|active|enabled|online|ok)$/i;
  const statusCandidates = [];
  for (const e of win.querySelectorAll('*')) {
    if (!painted(e)) continue;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue.trim()).join(' ').trim();
    if (own && STATUS.test(own)) {
      statusCandidates.push({ el: `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}`, text: own });
    }
  }

  return JSON.stringify({
    title: TITLE,
    lang: document.documentElement.getAttribute('lang') || null,
    theme: document.documentElement.getAttribute('data-theme'),
    rawI18nKeyCount: rawKeys.length,
    rawI18nKeys: rawKeys.slice(0, 10),
    states: {
      empty: { count: states.emptyLike.length, sample: states.emptyLike.slice(0, 3) },
      loading: { count: states.loadingLike.length, sample: states.loadingLike.slice(0, 3) },
      error: { count: states.errorLike.length, sample: states.errorLike.slice(0, 3) },
      offline: { count: states.offlineLike.length, sample: states.offlineLike.slice(0, 3) },
    },
    statusCandidatesNeedingEmptyProfile: statusCandidates.slice(0, 8),
    notMeasuredHere: ['dead-control count (probe A — needs all controls driven)',
      'fabricated-value verdict (probe B — needs an empty scratch profile)'],
  });
})()
