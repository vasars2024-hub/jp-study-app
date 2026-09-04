/**
 * L1 instrument — surface-role classification and rubric category 3 (Liquid utilization).
 *
 * WHAT IT ANSWERS. `src/LIQUID_UI_RUBRIC.md` category 3 asks for two numbers:
 *   (a) dense-work regions rendered on a translucent material — must be 0;
 *   (b) navigation/transport/inspector regions given Liquid treatment, vs. total.
 * `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` L1 asks to "confirm the four surface roles"
 * against Video and Dictionary. Both need the same walk, so it is one probe.
 *
 * WHY THE BACKING WALK. A region that paints no background of its own is NOT automatically
 * "not on glass" — it sits on whatever its nearest painting ancestor is. Scoring the element's
 * own `background-color` alone reports 0 dense-work-on-glass for a fully translucent window,
 * which is the exact false pass this category exists to catch. So `backingOf()` walks up until
 * it meets an opaque paint (alpha >= 0.95). It returns two answers, not one: `translucent`
 * ("does this carry Liquid material", which stops at the first partial paint and scores the
 * eligible/treated term) and `grounded` ("is there opaque ground under the text", which
 * treats a partial paint as inconclusive and scores the dense-work term). See CORRECTION 35
 * at `backingOf` for the measurement that separated them.
 *
 * ALPHA PARSING. Chrome resolves this app's `color-mix()` to `color(srgb r g b / a)` and can
 * emit `rgb(r g b / a)` / `oklab(... / a)`. A parser matching only `rgba(...)` reads every mixed
 * colour as opaque and silently under-reports — see `.claude/skills/css-measure` §1, where the
 * same class of miss scored 23 real failures as ABSENT. `alphaOf()` handles all four forms and
 * returns null (not 1) on an unrecognised string, so an unknown paint is visible as `?`.
 *
 * REFUSALS, NOT ZEROS. A missing or 0x0 window returns `refuse:` rather than a clean score
 * (css-measure §3: a minimised window measures as perfect).
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-surface-roles.js`
 * Argument is edited in at ARG below (the bridge's /eval takes one expression, no params).
 */
(() => {
  // `window.__lqScoreTitles` overrides the titles, same idiom as `l1-use-of-space.js`, so a
  // second surface no longer needs the file edited between runs. The default keeps every run
  // already recorded in the L1 documents reproducible. Gate 461 names Video and Dictionary;
  // `Media` is a THIRD window on the same shell, not the Video one.
  const surfaces = (typeof window !== 'undefined' && (window.__lqScoreSurfaces || window.__lqScoreTitles))
    || ['Dictionary', 'Media'];
  // `window.__lqRoleDepth` raises the walk. Depth 3 was enough for Dictionary, whose work
  // surface is a direct child of the window body, and is a FALSE CLEAN on the Media shell:
  // `.medialib-rail` (navigation) and `.medialib-browser` (the work canvas) are at depth 4-5
  // inside `.mc-root > .mc-workspace > .mc-content > .mc-page`, so a depth-3 walk classifies
  // the containers and never reaches the regions the category is about.
  const maxDepth = (typeof window !== 'undefined' && window.__lqRoleDepth) || 3;
  const ARG = { surfaces, maxDepth, minAreaPct: 1.0 };

  const alphaOf = (s) => {
    const v = String(s || '').trim();
    if (!v || v === 'transparent' || v === 'none') return 0;
    let m = v.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const parts = m[1].split(/[\s,/]+/).filter(Boolean);
      return parts.length >= 4 ? Number(parts[3]) : 1;
    }
    // color(srgb r g b / a) and color(display-p3 …) — the colourspace token carries a digit,
    // so it is dropped by name before the numbers are read.
    m = v.match(/^color\(\s*[a-z0-9-]+\s+([^)]+)\)$/i);
    if (m) {
      const parts = m[1].split(/[\s/]+/).filter(Boolean);
      return parts.length >= 4 ? Number(parts[3]) : 1;
    }
    m = v.match(/^(?:oklab|oklch|lab|lch|hsla?|hwb)\(([^)]+)\)$/i);
    if (m) {
      const slash = m[1].split('/');
      return slash.length > 1 ? Number(slash[1].trim()) : 1;
    }
    return null;
  };

  const TRANSLUCENT_MAX = 0.95;

  const paintOf = (el) => {
    const cs = getComputedStyle(el);
    const a = alphaOf(cs.backgroundColor);
    return {
      alpha: a,
      backdrop: cs.backdropFilter && cs.backdropFilter !== 'none' ? cs.backdropFilter : null,
      image: cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 40) : null,
      opacity: Number(cs.opacity),
    };
  };

  /**
   * Walks up to the first opaque paint and answers TWO different questions, because the
   * rubric asks two and they are not the same question.
   *
   * `translucent` — "does this region carry Liquid material?". It stops at the first partial
   * paint, blur or `opacity`, which is the right test for the ELIGIBLE/treated term: a
   * contextual region at alpha 0.72 over an opaque panel really is glassy, you see the panel
   * through it. Unchanged, and every banked `liquidTreatedEligible` still means what it meant.
   *
   * `grounded` — "is there opaque ground under this region's text?", which is what the
   * dense-work bar is actually about (§2.3: reading and tables stay on stable anchors).
   * CORRECTION 35 (2026-09-04, primary): these were the SAME term, and that produced a false
   * FAIL on `grammar`. `.gram-x-row.focused` paints a 16% selection tint —
   * `color(srgb 1 0.42 0.51 / 0.16)` — and the old walk stopped there and called the row
   * "dense work on translucent". Measured in Liquid presentation on the live surface, the
   * chain under it is `div.gram-x-row=0.16 -> (5 transparent divs) -> div.fwin-body=rgb(26,24,35)
   * -> section.fwin=0.72+blur`: `.fwin-body` is FULLY OPAQUE with no blur and no `opacity`, so
   * the desktop is nowhere near that text and the tint composites over a solid plate. The
   * product code was correct; forcing it opaque would have meant `color-mix(... , var(--panel))`
   * hardcoding one shell's ground into a row every theme remaps, which the plan forbids.
   * So a partial paint is now INCONCLUSIVE for grounding and the walk continues; only a
   * `backdrop-filter`, an `opacity < 1`, or running out of chain without meeting an opaque
   * paint means ungrounded. A hand-rolled translucent stage with no blur over a translucent
   * window is still caught, because the walk then reaches the window's own blur.
   *
   * This relaxation is NOT self-certifying: control E in `cat3-liquid-utilization.cjs` strips
   * the opaque ground out from under the surface and requires every Work region to be counted
   * again. Controls A and B both inject `backdrop-filter`, so neither of them exercises this
   * branch — that is exactly why E had to be added alongside the change.
   */
  const backingOf = (el, stopAt) => {
    const chain = [];
    let node = el;
    let translucent = false;
    let reason = null;
    let grounded = null;
    let groundedReason = null;
    const settleGround = (value, why) => {
      if (grounded === null) { grounded = value; groundedReason = why; }
    };
    while (node && node !== stopAt.parentElement) {
      const p = paintOf(node);
      const link = `${node.tagName.toLowerCase()}.${String(node.className || '').split(' ')[0]}=${p.alpha}${p.backdrop ? '+blur' : ''}`;
      chain.push(link);
      if (p.backdrop) {
        translucent = true; reason = `backdrop-filter on ${link}`;
        settleGround(false, `backdrop-filter on ${link}`);
        break;
      }
      if (p.opacity < 1) {
        translucent = true; reason = `opacity ${p.opacity} on ${link}`;
        settleGround(false, `opacity ${p.opacity} on ${link}`);
        break;
      }
      if (p.alpha === null) {
        // An unrecognised paint cannot be PROVEN opaque, and this walk never guesses in the
        // direction that passes a bar. It counts as ungrounded and says so by name.
        reason = `unparsed paint on ${link}`;
        settleGround(false, `unparsed paint on ${link}`);
        break;
      }
      if (p.alpha >= TRANSLUCENT_MAX) {
        reason = `opaque at ${link}`;
        settleGround(true, `opaque ground at ${link}`);
        break;
      }
      if (p.alpha > 0) {
        // Decides `translucent` once, and only `translucent`. Grounding keeps walking.
        if (!translucent) { translucent = true; reason = `alpha ${p.alpha} on ${link}`; }
      }
      node = node.parentElement;
    }
    // Ran off the top of the surface without ever meeting an opaque paint: nothing backs it.
    if (grounded === null) {
      grounded = false;
      groundedReason = `no opaque paint from ${chain[0] || '(empty chain)'} up to the surface root`;
    }
    return {
      translucent, reason, grounded, groundedReason, chain: chain.slice(-4),
    };
  };

  const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),summary,details';

  // A single control is not a region. Counting one is how the first run of this probe
  // reported `label.mc-global-search` (a 290x30 search field) as a dense-work region on
  // glass. Controls are category 1's business; category 3 scores regions.
  const CONTROL_SEL = 'input,textarea,select,button,label,summary,a';
  // CORRECTION 34 (2026-09-04, primary): a MULTI-LINE EDITOR is the work, not the chrome.
  // Measured on the sticky note, whose `.fwin-body` holds exactly one child, a 258x185
  // `textarea.desk-note-text` at 80% of the window: `textarea` is in CONTROL_SEL, so the walk
  // skipped it, returned `regions: 0`, and every bar passed vacuously for a scored 10/10 on an
  // empty walk. That is the "empty harness" false pass the rubric caps at 0, and it would score
  // an identical 10 on a note that HAD put its editing surface on glass. The discriminator is
  // HTML's own and is deliberately narrow: `textarea` and `[contenteditable="true"]` are the
  // multi-line editing elements. A single-line `input` stays chrome however wide it is — that is
  // exactly `label.mc-global-search` above, and promoting it is the failure this rule was
  // written for. The area floor still applies, so a small composer never reaches the walk.
  const EDITOR_SEL = 'textarea,[contenteditable="true"]';
  // Navigation / transport / inspector landmarks. §2.3 makes these the regions Liquid is
  // FOR, so they are never "dense work" however many buttons or list rows they contain —
  // the first run scored `aside.mc-sidebar` and `header.mc-topbar` as dense work on that
  // basis alone, which would have been two false findings.
  const CONTEXTUAL_SEL = [
    'nav',
    'header',
    'footer',
    'aside',
    '[role="tablist"]',
    '[role="toolbar"]',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="menubar"]',
    '[role="dialog"]',
    '[data-lq-role="liquid"]',
    '.lq-contextual',
    '.lq-dock',
    '.lq-inspector',
    '.lq-reading-tool',
    '.lq-reading-sheet',
  ].join(',');
  const SHARED_PRIMITIVE_SEL = [
    '[data-lq-role="liquid"]',
    '.lq-contextual',
    '.lq-dock',
    '.lq-inspector',
    '.lq-reading-tool',
    '.lq-reading-sheet',
  ].join(',');

  // CORRECTION — a bare nested <header>/<footer> is a SECTION CAPTION, not app chrome.
  // HTML's own scoping rule, not a heuristic: <header> maps to the `banner` landmark and
  // <footer> to `contentinfo` ONLY when they are not descendants of article / aside / main /
  // nav / section. Nested, the browser exposes them as generic — they caption their section.
  // Measured 2026-09-01 on Settings > Appearance: 26 Liquid-eligible regions, 14 untreated,
  // and ALL FOURTEEN were `header.os-set-card-head` — the <h3> + description strip inside
  // `section.os-set-card`, a settings FORM card. Scoring those as untreated Liquid chrome asks
  // for glass on fourteen work-card captions, which is precisely the "universal glass is a
  // failure" outcome §2.3 forbids, so the FAIL was the instrument's, not the product's.
  // The exemption is deliberately narrow and the product itself supplies the discriminator:
  // a document-wide sweep found exactly FOUR distinct header shapes, and the three that are
  // real chrome — `os-set-page-head`, `mc-topbar`, `medialib-browser__head` — all already
  // carry `lq-contextual`. Only the card caption is bare. So an explicit `lq-` primitive or an
  // explicit landmark ROLE still counts at any depth; only an unannotated nested header drops
  // out. `nav`, `aside` and the role selectors are untouched — an <aside> is complementary at
  // any depth, and a toolbar inside a dense editor pane is still contextual chrome.
  const SECTIONING_SEL = 'article,aside,main,nav,section';
  const EXPLICIT_LANDMARK_SEL = '[role="tablist"],[role="toolbar"],[role="navigation"],[role="banner"],[role="menubar"],[role="dialog"],[role="contentinfo"]';
  const isSectionCaption = (el) => (el.tagName === 'HEADER' || el.tagName === 'FOOTER')
    && !el.matches(SHARED_PRIMITIVE_SEL)
    && !el.matches(EXPLICIT_LANDMARK_SEL)
    && Boolean(el.parentElement && el.parentElement.closest(SECTIONING_SEL));

  /**
   * CORRECTION 35 (2026-09-04, primary2) — DENSITY IS THE REGION'S OWN, not its subtree's.
   *
   * `text`, `forms`, `rows` and `items` were raw `textContent` / `querySelectorAll` over the
   * whole subtree, so a container inherited the density of two things that are not its own
   * content. Measured on `files`, whose rail is `nav.lq-scaffold-rail` (`data-lq-role="liquid"`)
   * over a navigation tree of ~30 buttons and three headed sections:
   *
   *   div.fa-tree         text 532  ->  Work, because 532 >= 200. Every one of those 532
   *                       characters is a `button.fa-tree-node` LABEL. The instrument already
   *                       says so 70 lines up — "A single control is not a region... Controls
   *                       are category 1's business; category 3 scores regions" — and then
   *                       counted their text as the container's prose anyway.
   *   div.fa-collections  forms 1   ->  Work, and the one form control is a `<select>` three
   *                       levels down inside `.fa-folder-actions`, which THIS SAME WALK
   *                       classifies as contextual chrome. Counting it twice, once for the
   *                       chrome region and again for its ancestor, is the same depth-counting
   *                       the "leaf-most only" rule below already rejects.
   *
   * So two exclusions, and they are deliberately NOT the same set:
   *
   *   text   skips CONTROL subtrees and CONTEXTUAL subtrees. A button's label is the button's,
   *          and a nested chrome region's prose is that region's.
   *   forms/rows/items skip CONTEXTUAL subtrees ONLY. A form control inside a region IS that
   *          region's density — that is the whole point of the rule — and `input` is itself in
   *          CONTROL_SEL, so excluding controls here would drive `forms` to 0 everywhere and
   *          blind the walk to every form panel on the surface.
   *
   * MONOTONE, which is why no banked baseline needs re-deriving to stay honest: both exclusions
   * can only LOWER a count, so a region can only move Work -> Anchor/Ambient, never the other
   * way. `isContextual` is untouched, and `dense` short-circuits on it, so the Liquid-eligible
   * set — and with it BOTH contextual bars and their denominators — is bit-identical. The only
   * SCORED term that can move is `denseWorkOnTranslucent`, and only downward, i.e. only toward
   * the bar it must satisfy. A surface that banked PASS with 0 cannot go below 0. The unscored
   * `byRole` histogram does shift — Work -> Anchor, and a region whose text was all button
   * labels reads Anchor -> Ambient — so a banked receipt's histogram is a stale reading of the
   * same surface, not a changed surface. Re-derived on `musicwidget` (banked 10/10 this
   * morning) to confirm rather than assert.
   */
  const CTX_SKIP = (n) => n.matches(CONTEXTUAL_SEL) && !isSectionCaption(n);
  /** Top-most `sel` subtrees inside `el` that `skip` accepts — nested ones are already inside. */
  const topMostSkipped = (el, sel, skip) => {
    const hits = [...el.querySelectorAll(sel)].filter(skip);
    return hits.filter((n) => !hits.some((o) => o !== n && o.contains(n)));
  };

  const classify = (el) => {
    const textSkipped = topMostSkipped(
      el,
      `${CONTROL_SEL},${CONTEXTUAL_SEL}`,
      (n) => n.matches(CONTROL_SEL) || CTX_SKIP(n),
    );
    const text = Math.max(0, (el.textContent || '').trim().length
      - textSkipped.reduce((sum, n) => sum + (n.textContent || '').trim().length, 0));
    const ctxSkipped = topMostSkipped(el, CONTEXTUAL_SEL, CTX_SKIP);
    const own = (sel) => [...el.querySelectorAll(sel)]
      .filter((n) => !ctxSkipped.some((s) => s.contains(n))).length;
    // Correction 34: `querySelectorAll` is descendants-only, so a region that IS the editor
    // counted `forms: 0` and fell through to Ambient. Count the element itself too.
    const forms = own('input,textarea,select,[contenteditable="true"]')
      + (el.matches(EDITOR_SEL) ? 1 : 0);
    const rows = own('table,tr,.dict-entry,.card,article');
    const items = own('li');
    const focusables = [...el.querySelectorAll(FOCUSABLE)].filter((n) => {
      const b = n.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && !n.disabled;
    }).length;
    // The denominator is the rubric's contextual chrome, not every region that happens to
    // contain a button. The old `isNav || focusables >= 1` rule promoted result notices such as
    // `.dict-truncated` into the Liquid denominator and made an opaque Work notice look like
    // untreated navigation. Semantic landmarks and shared Liquid primitives are the runtime
    // evidence for navigation / transport / inspector / transition regions.
    const isContextual = el.matches(CONTEXTUAL_SEL) && !isSectionCaption(el);
    const dense = !isContextual && (text >= 200 || forms >= 1 || rows >= 1 || items >= 3);
    const sharedPrimitive = isContextual && Boolean(el.closest(SHARED_PRIMITIVE_SEL));
    let role;
    if (dense) role = 'Work';
    else if (isContextual) role = 'Liquid-eligible';
    else if (text === 0) role = 'Ambient';
    else role = 'Anchor';
    return { role, text, forms, rows, items, focusables, isContextual, sharedPrimitive };
  };

  const rootFor = (surface) => surface.startsWith('@')
    ? document.querySelector(surface.slice(1))
    : [...document.querySelectorAll('.fwin')].find(
      (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(surface),
    );

  const measureWindow = (surface) => {
    const win = rootFor(surface);
    if (!win) return { surface, refuse: `surface not found: ${surface}` };
    const wr = win.getBoundingClientRect();
    if (!wr.width || !wr.height) return { surface, refuse: 'surface is 0x0 — measurement invalid' };
    // CORRECTION 33 (2026-08-31, backup): `win.querySelector('.fwin-body')` is a DESCENDANT
    // search. For a `.fwin` root that is its own body, which is the intent. For an `@selector`
    // SHELL root it is a nested WINDOW's body — the desktop contains the floating windows.
    // Measured on `@.os-desktop-wired`: the walk started from a 0x0 minimised window body and
    // returned `regions: 0` on a 1264x821 desktop that plainly has `.wired-wall-atmosphere`
    // (100%) and `.os-taskbar` (6.8%). Zero regions then made every bar vacuous and the
    // negative control unfalsifiable, so the run scored VOID for an instrument fault.
    // Ownership, not containment: a body counts only when the window that owns it is the root.
    const ownBody = [...win.querySelectorAll('.fwin-body')]
      .find((b) => b.closest('.fwin') === win);
    const body = ownBody || win;
    const winArea = wr.width * wr.height;
    const regions = [];
    let controlsSkipped = 0;
    const pathOf = (el) => {
      const parts = [];
      let node = el;
      while (node && node !== body) {
        const parent = node.parentElement;
        if (!parent) return null;
        parts.push([...parent.children].indexOf(node));
        node = parent;
      }
      return node === body ? parts.reverse() : null;
    };
    const walk = (el, d) => {
      if (d > ARG.maxDepth) return;
      for (const c of el.children) {
        const b = c.getBoundingClientRect();
        if (b.width < 8 || b.height < 8) continue;
        if (c.matches(CONTROL_SEL) && !c.matches(EDITOR_SEL)) { controlsSkipped += 1; walk(c, d + 1); continue; }
        const areaPct = ((b.width * Math.min(b.height, wr.height)) / winArea) * 100;
        if (areaPct >= ARG.minAreaPct) {
          const cls = classify(c);
          const back = backingOf(c, win);
          const own = paintOf(c);
          regions.push({
            sel: `${c.tagName.toLowerCase()}.${String(c.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')}`,
            box: `${Math.round(b.width)}x${Math.round(b.height)}`,
            areaPct: Number(areaPct.toFixed(1)),
            el: c,
            path: pathOf(c),
            role: cls.role,
            evidence: `text=${cls.text} forms=${cls.forms} rows=${cls.rows} li=${cls.items} foc=${cls.focusables} contextual=${cls.isContextual}`,
            sharedPrimitive: cls.sharedPrimitive,
            ownAlpha: own.alpha,
            ownBackdrop: own.backdrop,
            translucentBacking: back.translucent,
            backingReason: back.reason,
            grounded: back.grounded,
            groundedReason: back.groundedReason,
          });
        }
        walk(c, d + 1);
      }
    };
    walk(body, 0);

    // Leaf-most only: a container whose descendant is also Work is an Anchor holding work,
    // not a dense-work region in its own right. Without this a single table flags its four
    // ancestors too, and the "must be 0" number becomes a depth count.
    const allWork = regions.filter((r) => r.role === 'Work');
    for (const r of allWork) {
      if (allWork.some((o) => o !== r && r.el.contains(o.el))) r.role = 'Anchor(holds work)';
    }
    const work = regions.filter((r) => r.role === 'Work');
    const eligible = regions.filter((r) => r.role === 'Liquid-eligible');
    // CORRECTION 35: the dense-work bar is scored on GROUNDING, not on whether the region
    // tints itself. `translucentBacking` still drives the eligible/treated term below.
    const denseOnGlass = work.filter((r) => !r.grounded);
    for (const r of regions) delete r.el;
    return {
      surface,
      box: `${Math.round(wr.width)}x${Math.round(wr.height)}`,
      presentation: win.getAttribute('data-presentation') || '(root)',
      windowOwnPaint: paintOf(win),
      regions: regions.length,
      controlsSkipped,
      byRole: {
        Work: work.length,
        'Liquid-eligible': eligible.length,
        Anchor: regions.filter((r) => r.role === 'Anchor').length,
        'Anchor(holds work)': regions.filter((r) => r.role === 'Anchor(holds work)').length,
        Ambient: regions.filter((r) => r.role === 'Ambient').length,
      },
      denseWorkOnTranslucent: denseOnGlass.length,
      denseWorkOnTranslucentList: denseOnGlass.map((r) => `${r.sel} (${r.groundedReason})`),
      liquidTreatedEligible: eligible.filter((r) => r.translucentBacking || r.ownBackdrop).length,
      sharedPrimitiveEligible: eligible.filter((r) => r.sharedPrimitive).length,
      eligibleTotal: eligible.length,
      detail: regions,
    };
  };

  return JSON.stringify({
    theme: document.documentElement.getAttribute('data-theme'),
    materials: document.documentElement.getAttribute('data-materials'),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    windows: ARG.surfaces.map(measureWindow),
  });
})()
