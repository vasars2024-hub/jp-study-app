/**
 * L1 instrument — rubric category 5, "UI clarity and user-friendliness": the ten §10.4 questions,
 * scored instead of asked of a human.
 *
 * Each question is turned into a predicate over the RENDERED surface, and every predicate reports
 * its raw numbers next to its verdict so a reader can disagree with the bar rather than only with
 * the score. Verdicts are `YES` / `NO` / `NO-SUBJECT`.
 *
 * `NO-SUBJECT` IS THE POINT OF THIS PROBE, not an evasion. Three of the ten questions ask about
 * Liquid presentation state — motion that explains a relationship, standard mode staying normal,
 * and Liquid turning off without state loss. L3 (per-window presentation state) and L4 (the Video
 * pilot) are unbuilt, so there is no Liquid mode to enter, no toggle to find, and no second term
 * to compare against. A probe that answered those "yes" because nothing was broken would be
 * scoring the ABSENCE of the feature as the presence of its quality. So the probe proves the
 * absence observably — it counts Liquid-presentation toggles on the surface and requires that
 * count to be 0 — and refuses to score them.
 *
 * WHY THE BARS ARE WHERE THEY ARE, since arbitrary bars are how a self-scored 10 goes wrong:
 *   Q1 `entryPoints` in the top third of the body, 1..3. One obvious way in, not a wall. A
 *      surface with 0 offers the user nothing to do; one with many offers no dominant task.
 *   Q3 the primary action must be inside the body's visible box at `scrollTop 0` — "without
 *      hunting" means without scrolling, which is measurable, unlike "without hunting".
 *   Q4 at least one collapsed disclosure (advanced tools exist and are tucked away) AND chrome
 *      controls <= 12 (the default view is not itself the clutter). Chrome excludes the result
 *      list, because 8 results x per-row controls is the product working, not clutter.
 *   Q10 identity markers (floating window chrome, taskbar, desktop layer, a theme token) >= 3,
 *      AND the dominant region must not be a uniform card grid — measured as the largest set of
 *      sibling boxes sharing a rounded size, over total siblings.
 *
 * Q5 (contrast) and Q9 (parity) are answered from the two instruments that already own those
 * numbers — `l1-accessibility.js` re-driven at this same tree, and `parity-ledger.json`. They are
 * marked `inheritedFrom` so no reader mistakes them for something this probe measured.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-ui-clarity.js`
 */
(() => {
  const painted = (e) =>
    typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
      : true;

  const CTRL = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],summary';

  const parseRgb = (s) => {
    const m = String(s).match(/-?[\d.]+/g);
    if (!m) return null;
    const n = m.slice(0, 3).map(Number);
    // `color()` / `oklab()` forms come back 0..1; the 0..255 forms never have three sub-1 values.
    return n.every((v) => v <= 1) && n.some((v) => v > 0) ? n.map((v) => Math.round(v * 255)) : n;
  };
  const alphaOf = (s) => {
    const m = String(s).match(/-?[\d.]+/g);
    return m && m.length >= 4 ? Number(m[3]) : (/transparent|^none$/.test(String(s)) ? 0 : 1);
  };
  /**
   * The EFFECTIVE backdrop, not the declared one. `.fwin-body` computes to
   * `rgba(0, 0, 0, 0)` in this shell — the window's fill is painted by an ancestor. The first
   * version of this probe compared every control's background against that transparent value,
   * i.e. against BLACK, which is how a filled control on a dark panel reads as "accent". Walk up
   * until something actually paints.
   */
  const effectiveBg = (el) => {
    let n = el;
    while (n) {
      const cs = getComputedStyle(n);
      if (alphaOf(cs.backgroundColor) > 0.05) return parseRgb(cs.backgroundColor) || [0, 0, 0];
      n = n.parentElement;
    }
    return [0, 0, 0];
  };

  const measure = (win, label) => {
    const R = win.getBoundingClientRect();
    if (!R.width || !R.height) return { label, refuse: 'window is 0x0 — refusing to record zeros' };
    const body = win.querySelector('.fwin-body') || win;
    const B = body.getBoundingClientRect();
    const controls = [...win.querySelectorAll(CTRL)].filter(painted);
    const inBody = (e) => {
      const b = e.getBoundingClientRect();
      return b.top >= B.top - 1 && b.bottom <= B.bottom + 1 && b.width > 0;
    };

    // --- Q1: one obvious way in. -------------------------------------------------------------
    const topThird = (e) => {
      const b = e.getBoundingClientRect();
      return b.top < B.top + B.height / 3 && b.width > 0;
    };
    const filled = (e) => {
      const cs = getComputedStyle(e);
      if (alphaOf(cs.backgroundColor) <= 0.05) return false; // a ghost button paints nothing
      const c = parseRgb(cs.backgroundColor);
      const bg = effectiveBg(e.parentElement || body);
      if (!c) return false;
      const d = Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]);
      return d > 60; // a filled/accent control, not a ghost button on the panel
    };
    // A `<select>` is an entry point. Anki's whole top third is one deck picker and four window
    // chrome glyphs; a counter that accepted only `input`/`textarea` scored it `entryPoints: 0`
    // and called the surface unclear when the surface was fine.
    const NAV = 'nav,[role="tablist"],[class*="rail"],[class*="sidebar"],[class*="-nav"],[class*="tabs"]';
    const primaryInputs = controls.filter((e) => e.matches('input:not([type=checkbox]):not([type=radio]),textarea,select') && topThird(e));
    const accentButtons = controls.filter((e) => e.matches('button,[role="button"]') && topThird(e) && filled(e) && !e.closest('.fwin-bar') && !e.closest(NAV));
    const entryPoints = primaryInputs.length + accentButtons.length;

    // --- Q2: where am I, and how do I get back. ----------------------------------------------
    const titleText = (win.querySelector('.fwin-title-text')?.textContent || '').trim();
    const backAffordances = controls.filter((e) => {
      const l = (e.getAttribute('aria-label') || e.title || e.textContent || '').trim();
      return /^(back|home|close|×|✕|返回|назад|戻る)$/i.test(l) || /back|home/i.test(e.className || '');
    });

    // --- Q3: primary action visible without scrolling. ---------------------------------------
    // Prefer a control the app itself marks primary. The first version took `accentButtons[0]`,
    // which on Dictionary was `button.gram-level-btn` (the JA/ZH grammar toggle) and on Media
    // `button.ui-sidebar__item` (a nav row) — it answered YES about the wrong element on both.
    const explicitPrimary = controls.find(
      (e) => /(^|\s|-)primary(\s|$|-)/.test(String(e.className || '')) && !e.closest('.fwin-bar') && !e.closest(NAV),
    );
    const primaryAction = explicitPrimary || accentButtons[0] || primaryInputs[0] || null;
    const primaryVisible = primaryAction ? inBody(primaryAction) : false;

    // --- Q4: advanced tools tucked away, default view not cluttered. -------------------------
    const collapsed = [...win.querySelectorAll('details:not([open]),[aria-expanded="false"]')].filter(painted);
    // Chrome = controls outside the surface's dominant repeating content (result rows, cards).
    const repeatingRow = (e) => e.closest('.dict-entry,[class*="-row"],[class*="-card"],[class*="-item"],li');
    const chromeControls = controls.filter((e) => !repeatingRow(e) && !e.closest('.fwin-bar'));

    // --- Q6/Q7/Q8: is there any Liquid presentation state to ask about at all. ---------------
    const liquidRegions = [...win.querySelectorAll('*')].filter((e) => {
      if (!painted(e)) return false;
      const cs = getComputedStyle(e);
      return (cs.backdropFilter && cs.backdropFilter !== 'none')
        || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
    });
    const liquidToggles = controls.filter((e) => {
      const l = (e.getAttribute('aria-label') || e.title || e.textContent || '').trim();
      return /liquid|glass|presentation mode/i.test(l) || /liquid|glass/i.test(String(e.className || ''));
    });
    const infiniteOnLiquid = liquidRegions.filter((e) => {
      const cs = getComputedStyle(e);
      return cs.animationIterationCount && cs.animationIterationCount.split(',').some((v) => v.trim() === 'infinite');
    });

    // --- Q10: still itself, not a card dashboard. --------------------------------------------
    const identityMarkers = {
      floatingWindowChrome: !!win.querySelector('.fwin-bar'),
      taskbar: !!document.querySelector('.os-task-win'),
      // `.desktop` does not exist in this shell — the real layers are `.desktop-root` /
      // `.os-desktop` / `.os-wall-stage` / `.os-wall-layer`. A selector that matches nothing
      // reports `false`, which reads as "the app has no desktop" rather than "the probe is wrong".
      desktopLayer: !!document.querySelector('.desktop-root,.os-desktop,.os-wall-layer'),
      themeToken: !!document.documentElement.getAttribute('data-theme'),
    };
    const identityCount = Object.values(identityMarkers).filter(Boolean).length;
    /**
     * Card-grid signature. The first version took the most size-uniform container of >=4 children
     * ANYWHERE in the window, and so scored `ul.scr-rail-list`, `nav.ui-sidebar`,
     * `ul.os-set-nav-list` and `ul.lexicon-conjugation-list` at a uniformity of **1.00** — four
     * surfaces marked "generic card dashboard" for having a navigation sidebar and a conjugation
     * table. Equal-height list rows are not cards.
     *
     * A card here has to actually look like one: >=120x60, and painting its OWN background,
     * border or shadow against its host. The host also has to be a meaningful part of the body
     * (>=25% of its area), because a uniform 3-item strip in a corner is not a dashboard.
     */
    let cardUniformity = 0; let cardHost = null; let cardHostDetail = null; let cardControlSignatures = 0;
    const bodyArea = Math.max(1, B.width * B.height);
    for (const host of win.querySelectorAll('*')) {
      const hb = host.getBoundingClientRect();
      if ((hb.width * hb.height) / bodyArea < 0.25) continue;
      const hostBg = effectiveBg(host);
      const kids = [...host.children].filter((c) => {
        if (!painted(c)) return false;
        const b = c.getBoundingClientRect();
        if (b.width < 120 || b.height < 60) return false;
        const cs = getComputedStyle(c);
        const ownBg = alphaOf(cs.backgroundColor) > 0.05
          && parseRgb(cs.backgroundColor).some((v, i) => Math.abs(v - hostBg[i]) > 8);
        const bordered = (cs.boxShadow && cs.boxShadow !== 'none')
          || (parseFloat(cs.borderTopWidth) > 0 && alphaOf(cs.borderTopColor) > 0.05);
        return ownBg || bordered;
      });
      if (kids.length < 4) continue;
      const buckets = new Map();
      for (const k of kids) {
        const b = k.getBoundingClientRect();
        const key = `${Math.round(b.width / 8)}x${Math.round(b.height / 8)}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      const frac = Math.max(...buckets.values()) / kids.length;
      if (frac > cardUniformity) {
        cardUniformity = frac;
        cardHost = `${host.tagName.toLowerCase()}.${String(host.className || '').split(' ')[0]} cards=${kids.length}`;
        cardHostDetail = `${Math.round((hb.width * hb.height) / bodyArea * 100)}% of body`;
        /**
         * GALLERY vs DASHBOARD, which size uniformity alone cannot tell apart — and getting this
         * wrong means reporting Settings' 13-swatch theme picker as "a generic card dashboard".
         * A gallery repeats ONE kind of thing (13 theme swatches, N posters); a dashboard flattens
         * UNRELATED functions into identical boxes. So: count the distinct control signatures
         * inside the cards. One signature is a gallery and is legitimate; several is the failure
         * §10.4 is actually asking about.
         */
        const sigs = new Set();
        for (const k of kids) {
          const sig = [...k.querySelectorAll(CTRL)].filter(painted)
            .map((c) => `${c.tagName.toLowerCase()}:${c.getAttribute('role') || ''}:${String(c.className || '').split(' ')[0]}`)
            .sort().join('|');
          sigs.add(sig);
        }
        cardControlSignatures = sigs.size;
      }
    }

    const q = (id, question, verdict, numbers) => ({ id, question, verdict, numbers });

    return {
      label,
      box: `${Math.round(R.width)}x${Math.round(R.height)}`,
      controlsPainted: controls.length,
      questions: [
        q(1, 'dominant task immediately obvious', entryPoints >= 1 && entryPoints <= 3 ? 'YES' : 'NO',
          { entryPoints, primaryInputs: primaryInputs.length, accentButtons: accentButtons.length, bar: '1..3 in top third' }),
        q(2, 'current location and way back obvious', titleText && backAffordances.length >= 1 ? 'YES' : 'NO',
          { titleText, backAffordances: backAffordances.length }),
        q(3, 'primary actions visible without hunting', primaryVisible ? 'YES' : 'NO',
          { primaryAction: primaryAction ? `${primaryAction.tagName.toLowerCase()}.${String(primaryAction.className || '').split(' ')[0]}` : null, insideBodyViewport: primaryVisible }),
        q(4, 'advanced tools discoverable without cluttering', collapsed.length >= 1 && chromeControls.length <= 12 ? 'YES' : 'NO',
          { collapsedDisclosures: collapsed.length, chromeControls: chromeControls.length, bar: '>=1 collapsed and <=12 chrome controls' }),
        q(5, 'every readable surface has stable contrast', 'INHERIT',
          { inheritedFrom: 'l1-accessibility.js, re-driven at this tree' }),
        q(6, 'Liquid motion explains a real relationship',
          liquidRegions.length === 0 ? 'NO-SUBJECT' : (infiniteOnLiquid.length === 0 ? 'YES' : 'NO'),
          { liquidRegions: liquidRegions.length, infiniteAnimationsOnLiquid: infiniteOnLiquid.length }),
        q(7, 'standard mode remains fully normal', liquidToggles.length === 0 ? 'NO-SUBJECT' : 'MEASURE',
          { liquidPresentationToggles: liquidToggles.length, why: 'no Liquid mode to leave — L3 unbuilt' }),
        q(8, 'Liquid can be turned off without losing state', liquidToggles.length === 0 ? 'NO-SUBJECT' : 'MEASURE',
          { liquidPresentationToggles: liquidToggles.length, why: 'nothing to turn off — L3 unbuilt' }),
        q(9, 'all pre-migration features reachable and functional', 'INHERIT',
          { inheritedFrom: 'parity-ledger.json', note: 'no migration has occurred; see the document for why this earns no discriminating point' }),
        q(10, 'still feels like itself, not a generic card dashboard',
          identityCount >= 3 && (cardUniformity < 0.8 || cardControlSignatures <= 1) ? 'YES' : 'NO',
          { identityMarkers, identityCount, cardUniformity: Number(cardUniformity.toFixed(2)), cardControlSignatures, cardHost, cardHostDetail, bar: '>=3 markers, and (uniformity < 0.80 OR one control signature = a gallery, not a dashboard)' }),
      ],
    };
  };

  const wins = [...document.querySelectorAll('.fwin')];
  const pick = (i) => (wins[i] ? measure(wins[i], (wins[i].querySelector('.fwin-title-text')?.textContent || `win#${i}`).trim()) : { label: `win#${i}`, refuse: 'no such window' });

  return JSON.stringify({
    lang: document.documentElement.lang,
    theme: document.documentElement.getAttribute('data-theme'),
    dictEntriesLive: document.querySelectorAll('.dict-entry').length,
    windows: wins.map((_, i) => pick(i)),
  });
})()
