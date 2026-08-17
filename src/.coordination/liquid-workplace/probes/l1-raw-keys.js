/**
 * L1 instrument — rubric category 8's missing half: "0 raw i18n keys in ALL FOUR languages".
 *
 * WHY THIS IS NOT REDUNDANT WITH `tools/i18n-check.cjs`, restated because the first pass of
 * category 8 measured `lang=en` only and said so. `i18n-check` compares the four catalogs
 * against each other. A key that NO catalog has is missing from all four equally, so it passes
 * that gate — and `translate()` (`shared/i18n/core.ts:94`) returns the key itself in exactly
 * that case: *"Not in English either — show the key, which at least makes the bug findable."*
 * So the only instrument that can find one is a scan of what is actually RENDERED.
 *
 * THE FALLBACK CHAIN DECIDES WHAT EACH LANGUAGE CAN SHOW, and this is why the sweep needs all
 * four rather than one. `translate()` falls back to English before it gives up, so:
 *   - a key present in `en` but missing from `ja` renders ENGLISH in the Japanese UI — a
 *     translation gap, NOT a raw key;
 *   - a key missing from `en` too renders the dotted key — a raw key, in every language at once.
 * Both are counted, separately. Only the second is the rubric's number; the first is reported
 * because a Japanese UI rendering English chrome is a real finding that no count of keys shows.
 *
 * WHAT COUNTS AS A RAW KEY. A rendered string, from a painted element, that has no whitespace
 * and matches the catalog key shape (`a.b`, lowercase-initial dotted segments). That shape also
 * matches `file.srt`, `1.2.3` and `example.com`, so the probe deliberately does NOT decide: it
 * reports every candidate string, and the caller checks each against the real catalog node-side.
 * A probe that self-adjudicates its own false positives is how this repo produced 39 fake
 * contrast failures and 42 fake dead ends.
 *
 * ATTRIBUTES COUNT. `placeholder`, `title`, `aria-label` and `alt` all reach the user and all go
 * through `t()`. A text-node-only sweep misses every one of them.
 *
 * A ZERO IS ONLY A MEASUREMENT NEXT TO ITS DENOMINATOR — `textRuns` is reported for every
 * window so "0 raw keys" can be told apart from "the sweep found nothing to read".
 *
 * WINDOWS ARE ADDRESSED BY DOM INDEX, NOT BY TITLE, and that correction is the whole reason
 * this comment exists. The first version matched `.fwin-title-text` against English names
 * (`'Dictionary'`, `'Settings'`). That works exactly once: the moment the sweep switches the UI
 * language the titles become 辞書 / 设置 / Настройки, every lookup returns `no .fwin with that
 * title`, and the probe reports **`candidates: 0` on four refused windows** — a zero that looks
 * identical to a clean sweep. It was only saved by the whole-document pass. So the index is the
 * identity here, the CURRENT title is reported as data, and `refusedWindows` is surfaced at the
 * top level where a reader cannot miss it.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-raw-keys.js`
 */
(() => {
  const KEY_SHAPE = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+$/;
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  const painted = (e) =>
    typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
      : true;

  const where = (e) => {
    const bits = [];
    let n = e;
    for (let i = 0; n && i < 3; i += 1) {
      bits.unshift(`${n.tagName.toLowerCase()}${n.className && typeof n.className === 'string' ? `.${n.className.split(' ')[0]}` : ''}`);
      n = n.parentElement;
    }
    return bits.join('>');
  };

  const sweep = (root, label) => {
    const runs = [];
    const candidates = [];

    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let t = tw.nextNode();
    while (t) {
      const v = (t.nodeValue || '').trim();
      const p = t.parentElement;
      if (v && p && painted(p) && !/^(script|style)$/i.test(p.tagName)) {
        runs.push(v);
        if (!/\s/.test(v) && v.length >= 6 && KEY_SHAPE.test(v)) {
          candidates.push({ kind: 'text', value: v, at: where(p) });
        }
      }
      t = tw.nextNode();
    }

    for (const e of root.querySelectorAll('*')) {
      if (!painted(e)) continue;
      for (const a of ATTRS) {
        const v = (e.getAttribute(a) || '').trim();
        if (!v) continue;
        runs.push(v);
        if (!/\s/.test(v) && v.length >= 6 && KEY_SHAPE.test(v)) {
          candidates.push({ kind: a, value: v, at: where(e) });
        }
      }
    }

    return { label, textRuns: runs.length, candidates };
  };

  const windows = [];
  const all = [...document.querySelectorAll('.fwin')];
  all.forEach((win, index) => {
    const titleNow = (win.querySelector('.fwin-title-text')?.textContent || '').trim();
    const r = win.getBoundingClientRect();
    if (!r.width || !r.height) {
      windows.push({ index, titleNow, refuse: 'window is 0x0 — refusing to record zeros' });
      return;
    }
    windows.push({ index, titleNow, ...sweep(win, `win#${index}`) });
  });

  // Desktop chrome (taskbar, start surface) is chrome the user reads on every screen.
  const shell = document.querySelector('.desktop') || document.body;
  windows.push(sweep(shell, 'shell(whole document)'));

  return JSON.stringify({
    lang: document.documentElement.lang,
    storedLang: (() => { try { return localStorage.getItem('ui-lang'); } catch { return 'unreadable'; } })(),
    theme: document.documentElement.getAttribute('data-theme'),
    windowCount: all.length,
    // Named at the top level: a refused window contributes 0 candidates and 0 runs, which is
    // indistinguishable from a clean one unless the refusal is reported next to the score.
    refusedWindows: windows.filter((w) => w.refuse).length,
    dictEntriesLive: document.querySelectorAll('.dict-entry').length,
    windows,
    totalCandidates: windows.reduce((s, w) => s + (w.candidates ? w.candidates.length : 0), 0),
  });
})()
