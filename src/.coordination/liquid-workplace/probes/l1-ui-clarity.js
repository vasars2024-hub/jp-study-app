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
 * and Liquid turning off without state loss. When this probe first ran, L3 (per-window
 * presentation state) was unbuilt: there were **0** Liquid-presentation toggles on all five
 * windows, so there was no Liquid mode to enter, no toggle to find, and no second term to compare
 * against. A probe that answered those "yes" because nothing was broken would be scoring the
 * ABSENCE of the feature as the presence of its quality. So the probe proves the absence
 * observably — it counts the toggles — and refuses to score a question with no subject.
 *
 * L3 has since landed `button.fwin-b-liquid`, so on an opted-in window Q6, Q7 and Q8 now HAVE a
 * subject and are measured rather than skipped. Q6 is answerable from one snapshot (regions
 * carrying a `backdrop-filter`, and whether any of them animate infinitely). Q7 and Q8 are not —
 * they need a round trip — so `debug/l1-q78-drive.cjs` drives it and parks its verdicts here.
 * A surface with no toggle still reports `NO-SUBJECT`, which stays the honest answer for it.
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
 * Q5 (contrast) is answered from the instrument that owns that number — `l1-accessibility.js`
 * re-driven at this same tree — and is marked `inheritedFrom` so no reader mistakes it for
 * something this probe measured.
 *
 * Q9 (parity) USED TO BE inherited the same way, as the literal `'INHERIT'`. It is not any more,
 * and the reason is a false measurement this file produced: the note beside the literal said "no
 * migration has occurred", which stopped being true when L3.2 shipped `Make Liquid` on this
 * window, and the 2026-08-24 run reported "0 of 7 rows both" against a ledger holding **7 of 7**.
 * A hardcoded verdict cannot go stale gracefully — it reads as a number nobody computed.
 * `l1-q9-drive.cjs` now requires the ledger AND a live `__L6.check()` to agree, and parks the
 * result on `window.__q9verdict` the way `l1-q78-drive.cjs` parks Q7 and Q8.
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

  /**
   * Verdicts the round-trip driver parked, or `{}` if it has not run at this tree. Read once,
   * outside `measure`, so every window in one run reports the same provenance.
   */
  const liquidVerdict = (window.__q78verdict && typeof window.__q78verdict === 'object') ? window.__q78verdict : {};

  /**
   * PARKED VERDICTS ARE PER-SURFACE, AND UNTIL THIS COMMIT THIS FILE READ THEM AS GLOBAL.
   *
   * `q9Verdict` was read ONCE, outside `measure`, and then rendered into every window's row.
   * `l1-q9-drive.cjs` was careful to give each surface its own slot — `__q9verdict` for the
   * dictionary, `__q9verdictMedia` for the Media Center, with a comment saying that one global
   * would mean "whichever ran last decided Q9 for the other" — but the CONSUMER still read one.
   * So a `--app dictionary` run followed by a clarity sweep printed the dictionary's 7-of-7
   * against the **Video** window, which measures a different eight rows. The driver's fix never
   * reached the report. `l1-q78-drive.cjs` is worse: `--title Video` and `--title Dictionary`
   * park on the SAME `__q78verdict`, so Q7 and Q8 are still cross-surface and are reported as
   * `crossSurface: true` below rather than silently attributed.
   *
   * Resolution is by the window's own title, which is what every driver in this directory now
   * takes as its argument. `MEASURE` when nothing was parked for THIS surface — never the
   * neighbour's answer.
   */
  const q5Verdicts = (window.__q5verdicts && typeof window.__q5verdicts === 'object') ? window.__q5verdicts : {};
  const forTitle = (registry, label) => {
    if (!registry || typeof registry !== 'object') return null;
    if (registry[label]) return registry[label];
    const key = Object.keys(registry).find((k) => label.indexOf(k) >= 0 || k.indexOf(label) >= 0);
    return key ? registry[key] : null;
  };
  /** The Media Center renders in more than one window, so its slot is keyed by app, not title. */
  const q9For = (label) => {
    const media = (window.__q9verdictMedia && typeof window.__q9verdictMedia === 'object') ? window.__q9verdictMedia : null;
    const dict = (window.__q9verdict && typeof window.__q9verdict === 'object') ? window.__q9verdict : null;
    const isDictionary = label.indexOf('Dictionary') >= 0;
    const picked = isDictionary ? dict : media;
    return picked || {};
  };

  const measure = (win, label) => {
    const q9Verdict = q9For(label);
    const q5Verdict = forTitle(q5Verdicts, label) || {};
    const q78on = typeof liquidVerdict.title === 'string' ? liquidVerdict.title : null;
    // The driver resolves its window by CONTAINMENT (`indexOf(TITLE) >= 0`), so the attribution
    // test has to be the same one — an exact compare would call `--title Video` foreign to a
    // window whose title text is `Video`, plus whatever the chrome appends.
    const q78matches = q78on !== null && label.indexOf(q78on) >= 0;
    const q78crossSurface = !liquidVerdict.q7 ? null : (q78on === null ? 'unattributed' : !q78matches);
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
    /**
     * `-spotlight` is in this list because a shelf holding ONE title does not render a card —
     * `MediaLibraryBrowser` promotes it to `section.medialib-spotlight`, whose `Open` and
     * `More actions` are the same two content actions the card would have carried. Nothing in
     * `-row|-card|-item|li` matches it, so those two counted as CHROME and pushed Video's
     * scanned set to 13 against a bar of 12 — Q4 read NO on this window while
     * `l1-q4-guards.cjs`, which resolves the same surface, read 11 and YES. Measured
     * 2026-08-25; the two instruments disagreed only on the spotlight's two buttons.
     * The same shelf in a window showing >1 item renders cards and was always excluded, so the
     * verdict depended on how many items happened to be in the active shelf.
     */
    const repeatingRow = (e) => e.closest('.dict-entry,[class*="-row"],[class*="-card"],[class*="-item"],[class*="-spotlight"],li');
    const chromeControls = controls.filter((e) => !repeatingRow(e) && !e.closest('.fwin-bar'));

    /**
     * THE CLUTTER TERM, and why it is not simply `chromeControls.length`.
     *
     * `chromeControls` counted **22** here and scored Q4 NO against a bar of 12. Two things were
     * wrong with it, and neither is about the product:
     *
     * 1. **It counts the contents of an OPEN disclosure.** 13 of the 22 sat inside `details`
     *    elements, and they were on screen only because an earlier probe clicked the drawers open
     *    to score category 3. A clutter measure whose value depends on whether someone opened a
     *    drawer is measuring drawer state. This is L5.2's trap in the other direction: there, a
     *    closed drawer inflated a Liquid-eligible denominator by 125%; here, an open one inflates
     *    clutter by the same mechanism.
     * 2. **It double-charges the disclosure mechanism.** The first half of this bar rewards having
     *    collapsed disclosures; the second half then charges for the `summary` header that every
     *    disclosure must have. A surface is penalised for the exact structure the question asks
     *    for, and the more advanced tools it tucks away, the worse it scores.
     *
     * So the clutter term is *controls the user must scan in the surface's default state*:
     * `chromeControls` minus the contents of any `details` (tucked away by definition) and minus
     * the `summary` headers (counted once, by `collapsedDisclosures`, not twice). **The bar stays
     * at 12** — the definition is corrected, the bar is not moved to meet a number, and every raw
     * component is reported below so a reader can disagree with the split rather than only with
     * the verdict.
     *
     * Two guards, because this is the kind of redefinition that turns a NO into a YES:
     * `drawerStateInvariant` re-counts with every disclosure forced closed and again forced open
     * and requires the same number — if the term still moves, the definition is still wrong; and
     * `l1-ui-clarity-q4-control.js` plants real top-level controls and must push it over 12.
     */
    const inDisclosureContent = (e) => !!e.closest('details') && e.tagName !== 'SUMMARY';
    const summaryHeaders = chromeControls.filter((e) => e.tagName === 'SUMMARY');
    const behindDisclosure = chromeControls.filter(inDisclosureContent);
    const scanned = chromeControls.filter((e) => !inDisclosureContent(e) && e.tagName !== 'SUMMARY');
    const allDetails = [...win.querySelectorAll('details')];

    // --- Q6/Q7/Q8: is there any Liquid presentation state to ask about at all. ---------------
    const blurRegions = [...win.querySelectorAll('*')].filter((e) => {
      if (!painted(e)) return false;
      const cs = getComputedStyle(e);
      return (cs.backdropFilter && cs.backdropFilter !== 'none')
        || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
    });
    /**
     * LIQUID IS NOT SPELLED `backdrop-filter` ON THIS SURFACE, and counting only blur reported
     * Q6 as NO-SUBJECT on a window that was visibly in Liquid presentation with three painted
     * regions. `theme/liquid-window.css` says why in its own comment: `.fwin` carries
     * `transform: translateZ(0)` and is therefore a backdrop root, so a `backdrop-filter` inside
     * it would sample the window's own opaque body. The interior Liquid treatment is
     * translucency + border + radius + shadow on `.lq-contextual`, painted ONLY under
     * `.fwin-liquid`. A probe that recognises one spelling of a material reports the absence of
     * the other as the absence of the feature — the same class of error as the `.desktop`
     * selector below, which matched nothing and read as "the app has no desktop".
     */
    const alphaOfBg = (e) => alphaOf(getComputedStyle(e).backgroundColor);
    const contextualPainted = [...win.querySelectorAll('.lq-contextual')].filter((e) => {
      if (!painted(e)) return false;
      const cs = getComputedStyle(e);
      return alphaOfBg(e) > 0.02 || parseFloat(cs.borderTopWidth) > 0 || (cs.boxShadow && cs.boxShadow !== 'none');
    });
    /**
     * A REGION IS A CONTAINER. A decorated leaf is not one, and counting one cost Q6 a real NO.
     *
     * Measured 2026-08-25 on the Video window: `liquidRegions` 4, `carryingATransition` 3, Q6 NO.
     * The dissenting element was `span.medialib-card__badge` — **35x34**, the episode-count chip
     * painted on a poster, `backdrop-filter: blur(6px)` with a fixed `rgb(0 0 0 / 0.66)` and no
     * transition (`mediaLibrary.css:495`). It is a static label with no state to change, so the
     * only way to satisfy the old term is to give a chip decorative motion — which is precisely
     * the failure Q6 exists to catch, not a fix for it. The score would have been bought.
     *
     * So the term names what it always meant: Q6 asks whether Liquid MOTION explains a
     * relationship, and motion is only meaningful for something whose presence or position moves
     * with state — a surface that HOLDS content. Two conditions, neither of which mentions the
     * badge: a region contains at least one painted element child, and it is not itself a control
     * (a control is a control, not a region).
     *
     * A redefinition that flips a score needs its own guards or it is indistinguishable from
     * moving the bar — the same rule Q4's `l1-q4-guards.cjs` was written under. `l1-q6-guards.cjs`
     * plants a Liquid-material CONTAINER with no transition (Q6 must go NO), and separately
     * suppresses the transition on a real region (Q6 must go NO), then restores both.
     */
    const isControl = (e) => e.matches(CTRL);
    const holdsContent = (e) => [...e.children].some((c) => c.nodeType === 1 && painted(c));
    const isRegion = (e) => !isControl(e) && holdsContent(e);
    const liquidMaterial = [...new Set([...blurRegions, ...contextualPainted])];
    const liquidRegions = liquidMaterial.filter(isRegion);
    const decoratedLeaves = liquidMaterial.filter((e) => !isRegion(e));
    // "Motion that EXPLAINS a relationship" is a transition bound to entering or moving, i.e.
    // motion caused by a state change. A looping animation explains nothing and is the failure.
    const withTransition = liquidRegions.filter((e) => {
      const t = getComputedStyle(e).transitionDuration;
      return t && t.split(',').some((v) => parseFloat(v) > 0);
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
        q(4, 'advanced tools discoverable without cluttering',
          collapsed.length >= 1 && scanned.length <= 12 ? 'YES' : 'NO',
          {
            collapsedDisclosures: collapsed.length,
            scannedControls: scanned.length,
            bar: '>=1 collapsed and <=12 controls scanned in the default state',
            // Every component of the split, so the definition is arguable rather than asserted.
            chromeControlsRaw: chromeControls.length,
            summaryHeaders: summaryHeaders.length,
            behindDisclosure: behindDisclosure.length,
            disclosures: { total: allDetails.length, open: allDetails.filter((d) => d.open).length },
            scannedList: scanned.map((e) =>
              (e.getAttribute('aria-label') || e.textContent || e.placeholder || e.tagName).trim().slice(0, 28)),
          }),
        /**
         * Q5 was the string literal `'INHERIT'`, pointing at category 1's number. Two things
         * were wrong with that and only one is the staleness Q9 had. Category 1 on Video
         * measured ONE cell — forest-night, liquid, every disclosure closed — and Q5 does not
         * ask whether contrast passes, it asks whether it is STABLE, which a single sample
         * cannot answer. Re-driven across theme x disclosure-state it found FOUR failing
         * elements the inherited number could not see, worst 1.07:1. `l1-q5-drive.cjs` parks
         * the result per surface. `MEASURE` when it has not run here — never a guess.
         */
        q(5, 'every readable surface has stable contrast',
          q5Verdict.verdict || 'MEASURE',
          q5Verdict.verdict
            ? { drivenBy: 'probes/l1-q5-drive.cjs', why: q5Verdict.why, terms: q5Verdict.terms, numbers: q5Verdict.numbers }
            : { note: 'run probes/l1-q5-drive.cjs --title <this window> first; it needs both themes and both disclosure states' }),
        q(6, 'Liquid motion explains a real relationship',
          liquidRegions.length === 0
            ? 'NO-SUBJECT'
            : (infiniteOnLiquid.length === 0 && withTransition.length === liquidRegions.length ? 'YES' : 'NO'),
          {
            liquidRegions: liquidRegions.length,
            byBackdropFilter: blurRegions.length,
            byContextualPaint: contextualPainted.length,
            carryingATransition: withTransition.length,
            infiniteAnimationsOnLiquid: infiniteOnLiquid.length,
            bar: 'every Liquid-treated region carries a state-change transition and none loops forever',
            // The split the redefinition rests on, reported so it is arguable rather than
            // asserted: what carries a Liquid material, and which of those are containers.
            liquidMaterialTotal: liquidMaterial.length,
            decoratedLeaves: decoratedLeaves.map((e) =>
              `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}`),
            regionList: liquidRegions.map((e) =>
              `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}`),
            withoutTransition: liquidRegions.filter((e) => !withTransition.includes(e)).map((e) =>
              `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}`),
          }),
        /**
         * Q7/Q8 need a ROUND TRIP — liquid → standard → liquid — and a single `/eval` cannot
         * drive one, because the bridge never awaits and React needs a paint between the click
         * and the read. `debug/l1-q78-drive.cjs` drives it and parks its verdicts and numbers on
         * `window.__q78verdict`. This probe reads them and marks them `drivenBy` so no reader
         * mistakes them for something a single snapshot produced.
         *
         * The three states are all different and all honest: `NO-SUBJECT` when the surface has no
         * presentation toggle at all (L1's original finding — 0 on all five windows); `MEASURE`
         * when a toggle exists but the round trip has not been driven at this tree; and the
         * driver's own YES/NO once it has.
         */
        /**
         * `q78on` is the window `l1-q78-drive.cjs` was pointed at when it parked. It parks ONE
         * global for every `--title`, so an older payload carries no title at all: that reads
         * `crossSurface: 'unattributed'`, which is the honest state, not a pass. A verdict
         * measured on another window is reported as `MEASURE` here — Q7 compares a surface's
         * own two presentations, so the neighbour's answer is not evidence about this one.
         */
        q(7, 'standard mode remains fully normal',
          liquidToggles.length === 0 ? 'NO-SUBJECT'
            : (liquidVerdict.q7 && q78matches ? liquidVerdict.q7.verdict : 'MEASURE'),
          liquidToggles.length === 0
            ? { liquidPresentationToggles: 0, why: 'no Liquid mode to leave on this surface' }
            : { liquidPresentationToggles: liquidToggles.length, drivenBy: 'probes/l1-q78-drive.cjs', measuredOnWindow: q78on, crossSurface: q78crossSurface, checks: liquidVerdict.q7 && q78matches ? liquidVerdict.q7.checks : null }),
        q(8, 'Liquid can be turned off without losing state',
          liquidToggles.length === 0 ? 'NO-SUBJECT'
            : (liquidVerdict.q8 && q78matches ? liquidVerdict.q8.verdict : 'MEASURE'),
          liquidToggles.length === 0
            ? { liquidPresentationToggles: 0, why: 'nothing to turn off on this surface' }
            : { liquidPresentationToggles: liquidToggles.length, drivenBy: 'probes/l1-q78-drive.cjs', measuredOnWindow: q78on, crossSurface: q78crossSurface, checks: liquidVerdict.q8 && q78matches ? liquidVerdict.q8.checks : null }),
        /**
         * Q9 was the string literal `'INHERIT'` with the note "no migration has occurred". True
         * when written, false since L3.2 shipped `Make Liquid` here and L6 closed all seven
         * dictionary rows to `both` — and a literal does not notice. The 2026-08-24 run reported
         * `0 of 7 rows both` against a file holding 7 of 7, because the probe never opened it.
         * `l1-q9-drive.cjs` now computes it from the ledger AND a live `__L6.check()`, and parks
         * the verdict here. `MEASURE` when the driver has not run at this tree — never a guess.
         */
        q(9, 'all pre-migration features reachable and functional',
          q9Verdict.verdict || 'MEASURE',
          q9Verdict.verdict
            ? { drivenBy: 'probes/l1-q9-drive.cjs', why: q9Verdict.why, ledger: q9Verdict.ledger, live: q9Verdict.live }
            : { note: 'run probes/l1-q9-drive.cjs first; it needs both the ledger and a live L6 check' }),
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
