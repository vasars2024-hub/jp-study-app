/**
 * L1 instrument — rubric category 4, "Use of space", at one size.
 *
 * The rubric asks for four numbers, and 10 requires all four:
 *   - clipped/overlapping elements — 0 at every size;
 *   - horizontal body scroll — absent;
 *   - largest contiguous dead region as a fraction of the viewport — under 15%;
 *   - content-to-chrome ratio, with content growing into extra space rather than chrome.
 *
 * THREE DEFINITIONS THAT DECIDE THE NUMBERS, stated so a reader can disagree with them.
 *
 * 1. `clipped` = a box that extends past the window frame AND has no scrollable ancestor
 *    inside that window **on the axis it exits by**. Content taller than the frame inside a
 *    scroller is not clipping — Dictionary's 3,194 px of results in a 580 px window is the
 *    product working. This is the same `unreach` definition `liquid-surface-baseline.ps1`
 *    already uses; using a different one would make L1's numbers incomparable with L0's.
 *
 *    THE AXIS IS PART OF THE DEFINITION, and leaving it out produced a false clean for five
 *    days (2026-08-22). The original `scrollableAncestor` matched `overflowY + overflowX`
 *    against one regex and asked only whether *either* dimension scrolled, so Dictionary's
 *    `.fwin-body` — `overflow-y: auto`, `overflow-x: hidden` — exempted every descendant from
 *    the check on BOTH axes. At 260x170 that hid `.dict-entry` boxes 480 px wide in a 258 px
 *    body: 268 px of every entry unreachable, `clipped: 0`.
 * 2. `overlap` = two REGIONS (>=1% of the window, depth <=3, not single controls) whose rects
 *    intersect by more than 4 px in both axes and where neither contains the other. Ancestor/
 *    descendant overlap is layout, not a defect.
 * 3. `deadRegion` = the largest axis-aligned rectangle of a 40x40 sampling grid over the
 *    window's content box in which no cell centre is covered by a text run or a control.
 *    Measured with `Range.getClientRects()` for text, so a padded empty container does not
 *    read as content. Reported as a fraction of the WINDOW, and separately of the viewport.
 *
 * A COLLAPSED `<details>` STILL HAS A BOX. Chrome lays its non-summary children out and
 * `getBoundingClientRect()` returns their full rect even though nothing is painted. The first
 * run of this probe reported **4 overlaps** in Dictionary on exactly that — the collapsed
 * `lexicon-notes-browser`'s filter row and note text "overlapping" `section.lexicon-workbench`
 * below. `checkVisibility({contentVisibilityAuto: true})` returns **false** for them, and every
 * geometry read here is gated on it. A rect without a visibility check is not a measurement.
 *
 * Horizontal scroll is read on the window's own scroll container, not `document.body`: the
 * app paints floating windows on a fake desktop, so the document never scrolls and a body
 * reading is a guaranteed clean bill of health (css-measure §5, same root cause as the dead
 * `@media (max-width:)` blocks).
 *
 * `horizontalScrollers` alone is NOT the whole horizontal number, and reporting it as if it
 * were is the second half of the same false clean. A box that overflows sideways inside
 * `overflow-x: hidden` has no scrollbar to count — the content is simply gone, which is
 * strictly worse than a scrollbar, and the rubric's "no horizontal body scroll" bar reads
 * clean on it. `hiddenOverflowX` counts exactly that case: `overflow-x` computing to
 * `hidden`/`clip` with `scrollWidth > clientWidth`. Both numbers must be 0.
 *
 * SIZE. This probe measures whatever size the window is currently at and reports it. It does
 * NOT resize — `l1-use-of-space-sizes.js` drives the sizes, because a resize that goes through
 * the product's own commit path writes `desktop-layout.json` and must be restored the same way.
 *
 * Run: `node debug/evfile.cjs src/.coordination/liquid-workplace/probes/l1-use-of-space.js`
 */
(() => {
  // Set `window.__lqScoreTitles = ['Video']` before evaluating to score another set. The two
  // defaults stay so every run already recorded in L1_USE_OF_SPACE.md reproduces; gate 461 names
  // Video and Dictionary, and `Media` is a THIRD window, not the Video one.
  //
  // AN ENTRY MAY ALSO BE `{ root: '<selector>', title: '<label>' }`, because not every surface
  // is a floating window and a harness that can only see `.fwin` scores those as absent. Found
  // 2026-08-25: opening a book from the Library replaces the whole desktop shell with a
  // full-window `.reader` — `document.querySelectorAll('.fwin').length` is then **0**, and the
  // title form would have refused on L6's own "Novels" surface. Same shape as L5's Agent
  // pop-out, which mounts outside `.fwin` too. Everything below reads `win` as "the surface's
  // own box", so a root selector needs no other change: `R` is that element's rect, and
  // `clipped` then means "leaves the SURFACE", which is the question either way.
  const TITLES = (typeof window !== 'undefined' && window.__lqScoreTitles) || ['Dictionary', 'Media'];

  const measure = (entry) => {
    const title = typeof entry === 'string' ? entry : entry.title || entry.root;
    const win = typeof entry === 'string'
      ? [...document.querySelectorAll('.fwin')].find(
        (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(entry),
      )
      : document.querySelector(entry.root);
    if (!win) {
      return {
        title,
        refuse: typeof entry === 'string'
          ? 'no .fwin with that title'
          : `no element matching ${entry.root}`,
      };
    }
    const R = win.getBoundingClientRect();
    if (!R.width || !R.height) return { title, refuse: 'window is 0x0 — refusing to record zeros' };
    const body = win.querySelector('.fwin-body') || win;
    const B = body.getBoundingClientRect();

    const scrollableAncestor = (el, axis) => {
      let n = el.parentElement;
      while (n && n !== win.parentElement) {
        const cs = getComputedStyle(n);
        const can = axis === 'x'
          ? /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1
          : /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1;
        if (can) return true;
        n = n.parentElement;
      }
      return false;
    };

    /**
     * A PAGINATED READER IS NOT A CLIPPED ONE, and without this the harness cannot score any
     * surface that pages, virtualises or carousels.
     *
     * Measured 2026-08-25 on the full-window NovelReader, a real EPUB: `clipped` **132** at
     * 820 and **239** at 380, every one of them on the x axis, and every one of them a
     * descendant of `div.novel-content` sitting **806 px left of the surface's left edge**
     * inside `div.novel-scroller` — `position: absolute; overflow: hidden`, `scrollWidth`
     * exactly equal to `clientWidth`. That is the product's own pagination: earlier pages are
     * offset negatively and Prev/Next is the affordance. `scrollableAncestor` cannot see it
     * (nothing scrolls) and `hiddenOverflowX` cannot either (`scrollWidth` never grows,
     * because content at a negative offset does not count towards it). The count scaled with
     * how much of the book was off-page, not with any layout failure.
     *
     * So: a box whose rect does not intersect its nearest overflow-clipping ancestor AT ALL
     * is outside that ancestor's viewport, not outside the surface's frame. Whether the user
     * can reach it is that ancestor's contract — a scrollbar, a page control, a virtual list —
     * and the other three numbers here already measure exactly that. Attributing it to the
     * window frame names the wrong cause and makes every paged reader unscorable.
     *
     * TWO NARROWINGS, and the second is the one that keeps this honest. It is `entirely
     * outside`, never `partly cut` — a half-visible box is still being cut off. AND the
     * clipper must itself report NO hidden content: `scrollWidth <= clientWidth` and
     * `scrollHeight <= clientHeight`. That is exactly what separates the two cases this repo
     * has now measured. `.novel-scroller` pages: 1262 == 1262 on both axes, because content
     * at a negative offset never counts towards `scrollWidth` — nothing is lost, it is
     * elsewhere. `.reading-workspace-panel` lost content: `scrollHeight` 740 inside a
     * `clientHeight` of 460, 280 px overflowing forwards with nothing to scroll — and that
     * defect shipped fixed in the commit before this one, so without the narrowing this very
     * change would have hidden it. Written down because it nearly did.
     */
    const outsideItsClipper = (el, b) => {
      let n = el.parentElement;
      while (n && n !== win.parentElement && n !== win) {
        const cs = getComputedStyle(n);
        if (/^(hidden|clip|auto|scroll)$/.test(cs.overflowX) || /^(hidden|clip|auto|scroll)$/.test(cs.overflowY)) {
          if (n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1) return false;
          const c = n.getBoundingClientRect();
          const ix = Math.min(b.right, c.right) - Math.max(b.left, c.left);
          const iy = Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top);
          return ix <= 0 || iy <= 0;
        }
        n = n.parentElement;
      }
      return false;
    };

    const painted = (e) =>
      typeof e.checkVisibility === 'function'
        ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
        : true;

    const all = [...win.querySelectorAll('*')].filter(painted);
    const clipped = all.filter((e) => {
      const b = e.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return false;
      if (outsideItsClipper(e, b)) return false;
      const outX = b.right > R.right + 1 || b.left < R.left - 1;
      const outY = b.bottom > R.bottom + 1 || b.top < R.top - 1;
      return (outX && !scrollableAncestor(e, 'x')) || (outY && !scrollableAncestor(e, 'y'));
    });

    // Regions, same shape as l1-surface-roles.js so the two documents compare.
    const regions = [];
    const walk = (el, d) => {
      if (d > 3) return;
      for (const c of el.children) {
        const b = c.getBoundingClientRect();
        if (b.width < 8 || b.height < 8) continue;
        if (!painted(c)) continue;
        if (!c.matches('input,textarea,select,button,label,summary,a')
          && ((b.width * Math.min(b.height, R.height)) / (R.width * R.height)) * 100 >= 1) regions.push(c);
        walk(c, d + 1);
      }
    };
    walk(body, 0);
    const overlaps = [];
    for (let i = 0; i < regions.length; i += 1) {
      for (let j = i + 1; j < regions.length; j += 1) {
        const a = regions[i]; const b = regions[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
        const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ox > 4 && oy > 4) {
          overlaps.push(`${a.tagName.toLowerCase()}.${String(a.className || '').split(' ')[0]} x ${b.tagName.toLowerCase()}.${String(b.className || '').split(' ')[0]} (${Math.round(ox)}x${Math.round(oy)})`);
        }
      }
    }

    // Horizontal scroll on the window's own scrollers, never document.body.
    const scrollers = all.filter((e) => {
      const cs = getComputedStyle(e);
      return /(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1;
    });
    // Overflow with no scrollbar: worse than a scrollbar, and invisible to `scrollers`.
    // Two exclusions, because without them this number is 4 on a surface with no defect:
    //   - the visually-hidden idiom (`.sr-only`: 1x1, absolute, `clip: rect(0,0,0,0)`) is
    //     overflow ON PURPOSE and is what makes the surface accessible, not what breaks it;
    //   - `text-overflow: ellipsis` is a designed truncation with a visible affordance —
    //     `.fwin-title` at 260 px reads `81>76` and shows the user an ellipsis.
    // Everything left is content pushed out of reach with nothing to say so.
    const hiddenX = all.filter((e) => {
      const cs = getComputedStyle(e);
      if (!/^(hidden|clip)$/.test(cs.overflowX)) return false;
      if (e.scrollWidth <= e.clientWidth + 1) return false;
      if (e.clientWidth <= 1 && cs.position === 'absolute') return false;
      if (cs.textOverflow === 'ellipsis') return false;
      return true;
    });

    // Dead-region grid.
    const N = 40;
    const cw = B.width / N; const ch = B.height / N;
    const covered = Array.from({ length: N }, () => new Array(N).fill(false));
    const mark = (r) => {
      if (r.width < 1 || r.height < 1) return;
      const x0 = Math.max(0, Math.floor((r.left - B.left) / cw));
      const x1 = Math.min(N - 1, Math.ceil((r.right - B.left) / cw) - 1);
      const y0 = Math.max(0, Math.floor((r.top - B.top) / ch));
      const y1 = Math.min(N - 1, Math.ceil((r.bottom - B.top) / ch) - 1);
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) covered[y][x] = true;
    };
    const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let t = tw.nextNode();
    while (t) {
      if (t.nodeValue && t.nodeValue.trim() && t.parentElement && painted(t.parentElement)) {
        const rg = document.createRange();
        rg.selectNodeContents(t);
        for (const r of rg.getClientRects()) mark(r);
      }
      t = tw.nextNode();
    }
    for (const e of all) {
      if (e.matches('input,textarea,select,button,img,canvas,video,svg,[role="button"]')) mark(e.getBoundingClientRect());
    }
    // Largest all-false rectangle: histogram + stack, O(N^2).
    let best = 0; let bestBox = null;
    const heights = new Array(N).fill(0);
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) heights[x] = covered[y][x] ? 0 : heights[x] + 1;
      const stack = [];
      for (let x = 0; x <= N; x += 1) {
        const h = x === N ? 0 : heights[x];
        let start = x;
        while (stack.length && stack[stack.length - 1][1] >= h) {
          const [s, sh] = stack.pop();
          const area = sh * (x - s);
          if (area > best) { best = area; bestBox = { w: x - s, h: sh, x: s, y: y - sh + 1 }; }
          start = s;
        }
        stack.push([start, h]);
      }
    }
    const cellArea = cw * ch;
    return {
      title,
      box: `${Math.round(R.width)}x${Math.round(R.height)}`,
      maximized: win.classList.contains('fwin-max'),
      regions: regions.length,
      clipped: clipped.length,
      clippedList: clipped.slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}`),
      overlaps: overlaps.length,
      overlapList: overlaps.slice(0, 6),
      horizontalScrollers: scrollers.length,
      horizontalScrollerList: scrollers.slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]} ${e.scrollWidth}>${e.clientWidth}`),
      hiddenOverflowX: hiddenX.length,
      hiddenOverflowXList: hiddenX.slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]} ${e.scrollWidth}>${e.clientWidth}`),
      deadRegionPctOfWindow: Number(((best * cellArea) / (R.width * R.height) * 100).toFixed(1)),
      deadRegionPctOfViewport: Number(((best * cellArea) / (window.innerWidth * window.innerHeight) * 100).toFixed(1)),
      deadRegionBox: bestBox ? `${Math.round(bestBox.w * cw)}x${Math.round(bestBox.h * ch)} at grid ${bestBox.x},${bestBox.y}` : null,
      // §4.1: "one dominant canvas occupies roughly 60-75% of the useful area". Two numbers,
      // because they can disagree and the disagreement is the interesting part.
      // `chromePct` is the window bar plus every OUTERMOST navigation landmark — the first run
      // used `.fwin-titlebar`, which does not exist in this shell (`.fwin-bar` does), and so
      // scored Dictionary's chrome at a flat 0%.
      contentToChrome: (() => {
        const chromeSel = '.fwin-bar,nav,header,footer,aside,[role="toolbar"],[role="tablist"]';
        const clip = (b) => Math.max(0, Math.min(b.right, R.right) - Math.max(b.left, R.left))
          * Math.max(0, Math.min(b.bottom, R.bottom) - Math.max(b.top, R.top));
        // `e.closest(sel)` starts AT `e`, so `closest(sel) === e` is true for every match and
        // deduped nothing — it counted `nav.mc-nav` inside `aside.mc-sidebar` and put Media's
        // chrome at 62.1%. Ask the PARENT.
        const outermost = [...win.querySelectorAll(chromeSel)].filter(
          (e) => painted(e) && (!e.parentElement || !e.parentElement.closest(chromeSel)),
        );
        const chrome = outermost.reduce((s, e) => s + clip(e.getBoundingClientRect()), 0);
        const total = R.width * R.height;
        const dominant = regions
          .filter((c) => !regions.some((o) => o !== c && c.contains(o)))
          .reduce((best, c) => Math.max(best, clip(c.getBoundingClientRect())), 0);
        return {
          chromePct: Number((chrome / total * 100).toFixed(1)),
          chromeParts: outermost.map((e) => `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}`),
          dominantCanvasPct: Number((dominant / total * 100).toFixed(1)),
        };
      })(),

      // L6's Gate — "no tool obscures the document" — made mechanically decidable, and
      // parameterised by nothing at all: every reading surface carries the SAME contract
      // (`components/liquid/ReadingCanvas.tsx`), so this block names no surface, no
      // per-surface selector and no size. A window with no reading canvas returns `null`,
      // so every run already recorded in L1_USE_OF_SPACE.md reproduces unchanged.
      //
      // THE DEFINITION, stated so a reader can disagree with it. A sheet legitimately
      // covers the document: the canvas then says `data-covered="true"` and makes the
      // document `inert` + `aria-hidden`, which is an honest hand-over and not an obscured
      // document. So an OCCLUSION is a painted `[data-reading-role="tool"]` whose rect
      // intersects the document's by more than 4 px on BOTH axes **while the canvas is not
      // covered**; and in the covered case the defect is the mirror image — something
      // focusable painted ON the sheet and outside the `inert` subtree. Both shapes have
      // already shipped in this repo (`8aaa9216`, `daf70721`), which is why both count.
      //
      // THE SPLIT THAT DECIDES THE NUMBER, and getting it wrong scores a clean surface as
      // broken. The first run of this block reported **8 leaks in Reading Finder and 16 in
      // Immersion**, which reads like a wholesale focus-containment failure. Measured by
      // rect, 0 of Reading Finder's 8 were painted over the document — all eight are the
      // window's own workspace tab strip, ABOVE the canvas, and a canvas-scoped sheet does
      // not get to claim the window's navigation any more than it claims the title bar.
      // Exactly ONE of Immersion's 16 was real: `.visual-novel-open`, `position: absolute;
      // z-index: 4` on `.immersion-root` and a SIBLING of the canvas, box 409,240 136x26
      // fully inside the sheet's 215,238 342x469, with `elementFromPoint` at its own centre
      // returning the button. So `overDocument` is the gate number and must be 0;
      // `elsewhereInWindow` is reported for context and is NOT a defect on its own.
      readingCanvas: (() => {
        const docs = [...win.querySelectorAll('[data-reading-role="document"]')].filter(painted);
        if (!docs.length) return null;
        const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
        // Scoped by the SHEET ELEMENT, never by `[aria-modal]`: the attribute is a claim
        // the surface makes and this instrument exists to check claims, so keying the
        // filter on it would make the probe agree with whatever the markup asserted.
        const SHEET = '[data-reading-role="tool"][data-placement="sheet"]';
        const leaks = (w) => [...w.querySelectorAll(FOCUSABLE)].filter(
          (e) => painted(e) && !e.closest('[inert]') && !e.closest(SHEET) && !e.closest('.fwin-bar'),
        );
        const paintedOver = (e, box) => {
          const T = e.getBoundingClientRect();
          return Math.min(T.right, box.right) - Math.max(T.left, box.left) > 2
            && Math.min(T.bottom, box.bottom) - Math.max(T.top, box.top) > 2;
        };
        const describe = (e) => `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}:${(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20)}`;
        return docs.map((doc) => {
          const D = doc.getBoundingClientRect();
          const canvas = doc.closest('[data-scroll]') || doc.parentElement;
          const covered = canvas ? canvas.getAttribute('data-covered') === 'true' : false;
          const over = [...(canvas || win).querySelectorAll('[data-reading-role="tool"]')]
            .filter(painted)
            .map((t) => {
              const T = t.getBoundingClientRect();
              return {
                t,
                w: Math.min(T.right, D.right) - Math.max(T.left, D.left),
                h: Math.min(T.bottom, D.bottom) - Math.max(T.top, D.top),
              };
            })
            .filter((o) => o.w > 4 && o.h > 4)
            .map((o) => `${o.t.getAttribute('data-reading-tool')}:${o.t.getAttribute('data-placement')} ${Math.round(o.w)}x${Math.round(o.h)}`);
          // `document.elementFromPoint` is DOCUMENT-global, so with several overlapping
          // `.fwin` windows it answers about whichever one is on top, not about this one.
          // Refuse rather than report a hit that belongs to a different window.
          const hit = document.elementFromPoint(
            Math.round(D.left + D.width / 2),
            Math.round(D.top + Math.min(D.height / 2, 40)),
          );
          return {
            docBox: `${Math.round(D.width)}x${Math.round(D.height)}`,
            // The canvas's own belief about its width. Compare it against `docBox`: an
            // unfocused renderer delivers no ResizeObserver notification, so a stale value
            // here reads exactly like a frozen layout and is not one.
            contentWidth: doc.getAttribute('data-content-width'),
            covered,
            docInert: doc.hasAttribute('inert') || !!doc.closest('[inert]'),
            openTools: Number((canvas && canvas.getAttribute('data-open-tools')) || 0),
            occlusions: over.length,
            occlusionList: over.slice(0, 6),
            hitAtDocTop: hit && win.contains(hit)
              ? `${hit.tagName.toLowerCase()}.${String(hit.className || '').split(' ')[0]}`
              : 'REFUSED — elementFromPoint landed outside this window',
            // THE GATE NUMBER while covered: focusables painted over the document's own
            // rect, i.e. on the sheet, outside its subtree and outside any `inert`. Must
            // be 0. `.visual-novel-open` was 1 here on 2026-08-25.
            overDocument: covered ? leaks(win).filter((e) => paintedOver(e, D)).length : null,
            overDocumentList: covered
              ? leaks(win).filter((e) => paintedOver(e, D)).slice(0, 6).map(describe)
              : null,
            // Context, NOT a defect: the window's own chrome outside the canvas, which
            // stays reachable at every canvas width exactly as it does when the same tool
            // is a dock. Reported so a reader can check the split rather than trust it.
            elsewhereInWindow: covered ? leaks(win).filter((e) => !paintedOver(e, D)).length : null,
            elsewhereList: covered
              ? leaks(win).filter((e) => !paintedOver(e, D)).slice(0, 6).map(describe)
              : null,
            // The sheet's own ARIA, recorded so the claim can be compared against
            // `elsewhereInWindow` rather than assumed. `aria-modal="true"` alongside a
            // non-zero `elsewhereInWindow` is a claim the keyboard does not honour.
            sheetRoleAria: canvas
              ? [...canvas.querySelectorAll('[data-reading-role="tool"][data-placement="sheet"]')]
                .map((s) => `${s.getAttribute('role') || 'none'}/${s.getAttribute('aria-modal') || 'absent'}`).join(',') || null
              : null,
            // The stability half of the same Gate sentence: a caller resizes and compares
            // these two strings across the round trip. Content, not geometry.
            head: (doc.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
            docScrollTop: Math.round(doc.scrollTop),
          };
        });
      })(),
    };
  };

  return JSON.stringify({
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    theme: document.documentElement.getAttribute('data-theme'),
    windows: TITLES.map(measure),
  });
})()
