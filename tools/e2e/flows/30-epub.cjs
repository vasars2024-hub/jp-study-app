'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * EPUB: a generated book with publisher CSS for vertical writing, ruby and 縦中横 is
 * imported, opened, checked through computed styles, a word is mined from the page with a
 * real (CDP) click, and the card it makes reopens the book ("Open in book").
 *
 * Then the same book in horizontal columns (writing mode forced horizontal, paginated):
 * open, TOC jump, page, bookmark, in-book search (Ctrl+F), reopen at the same place, and
 * the bookmark landing on the same text after a font-size change. In-book search is also
 * checked once in vertical pages.
 */
const { installHelpers, poll, clickText, ensureDictionaryReady } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');

const TITLE = '窓辺の猫（E2E）';
const MINED = '台所';

module.exports = {
  id: 'epub',
  title: 'EPUB vertical writing + mining, horizontal columns, bookmarks and search',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const epub = fixtures.epub(ctx.mediaDir);

    const items = await ev(`window.api.importPaths([${JSON.stringify(epub)}])`, { await: true });
    const book = (items ?? []).find((i) => i.title === TITLE);
    result.check('EPUB imports as a book with its OPF title', Boolean(book) && book.kind === 'book', (items ?? []).map((i) => ({ title: i.title, kind: i.kind })));

    await ev(`__e2e.open('library')`);
    const card = await poll(ctx, `!!document.querySelector('.card[aria-label=${JSON.stringify(TITLE)}]')`, 15000);
    result.check('the book appears on the Library shelf', card);
    await ev(`__e2e.click(document.querySelector('.card[aria-label=${JSON.stringify(TITLE)}]'))`);
    const opened = await poll(ctx, `!!document.querySelector('.novel-content #p1')`, 20000);
    result.check('the reader opens the book', opened);
    await ctx.sleep(800);

    const styles = await ev(`(() => {
      const cs = (el) => el ? getComputedStyle(el) : null;
      const content = document.querySelector('.novel-content');
      const p = content.querySelector('#p1');
      const tcy = content.querySelector('.tcy');
      return {
        contentWritingMode: cs(content).writingMode,
        paragraphWritingMode: cs(p).writingMode,
        tcyText: tcy?.textContent,
        tcyCombine: cs(tcy)?.textCombineUpright,
        ruby: [...content.querySelectorAll('ruby')].map((r) => r.querySelector('rt')?.textContent),
        publisherCss: content.classList.contains('epub-pub'),
      };
    })()`);
    result.check('computed writing-mode is vertical-rl', styles.contentWritingMode === 'vertical-rl' && styles.paragraphWritingMode === 'vertical-rl', styles);
    result.check('縦中横: text-combine-upright is "all" on the 12 span', styles.tcyText === '12' && styles.tcyCombine === 'all', styles);
    result.check('ruby kept with its readings', styles.ruby.join(',') === 'こまち,ねこ,まどべ', styles.ruby);
    await ctx.shot('vertical');

    // Mine a word with a real click on the page. The pop-up needs the built-in dictionary,
    // which a fresh profile may still be loading: this flow must not depend on the
    // `dictionary` flow having run (and paid that wait) first.
    const dict = await ensureDictionaryReady(ctx, { word: MINED });
    result.check('the built-in dictionary is ready for lookups', dict.ready, dict);
    const click = await clickText(ctx, '.novel-content', MINED[0]);
    result.check('a real click lands on the page', click.ok === true && click.delivered >= 1, click);
    const popupWord = await poll(ctx, `document.querySelector('.dict-popup .dict-word')?.textContent`, 10000);
    result.check(`the lookup popup shows ${MINED}`, popupWord === MINED, popupWord);
    await ev(`__e2e.click(document.querySelector('.dict-popup .dict-mine'))`);
    const collected = await poll(ctx, `(() => { const c = document.querySelector('.reader-collection'); return c && c.innerText.includes(${JSON.stringify(MINED)}) ? true : null; })()`, 15000);
    result.check('Mine opens the reader Collection with the word', Boolean(collected));
    await ev(`(document.querySelector('.dict-popup .dict-x')?.click(), true)`);
    // The reader re-paginates on its ResizeObserver; give it a frame or two.
    await ctx.sleep(1500);

    // The drawer must not hide the page it was opened from (bug fixed in this run).
    const layout = await ev(`(() => {
      const panel = document.querySelector('.reader-collection')?.getBoundingClientRect();
      const first = document.querySelector('.novel-content #p1')?.getBoundingClientRect();
      const scroller = document.querySelector('.novel-scroller')?.getBoundingClientRect();
      return panel && first && scroller ? { panelLeft: Math.round(panel.left), firstRight: Math.round(first.right), scrollerRight: Math.round(scroller.right) } : null;
    })()`);
    result.check('the open Collection drawer does not cover the first column', Boolean(layout && layout.firstRight <= layout.panelLeft + 1), layout);
    await ctx.shot('mined');

    // The card: back to the desktop, Flashcards, "Open in book".
    await ev(`__e2e.clickText('button', 'Library')`);
    await poll(ctx, `!document.querySelector('.novel-content')`, 10000);
    await ev(`__e2e.open('flashcards')`);
    const openInBook = await poll(ctx, `(() => { const b = document.querySelector('[data-flash-action="row-open-in-book"]'); return b ? b.title || b.getAttribute('aria-label') : null; })()`, 20000);
    result.check('the mined card offers "Open in book"', Boolean(openInBook) && openInBook.includes(MINED), openInBook);
    await ctx.shot('card');
    await ev(`__e2e.click(document.querySelector('[data-flash-action="row-open-in-book"]'))`);
    const reopened = await poll(ctx, `(() => { const c = document.querySelector('.novel-content'); return c && c.innerText.includes(${JSON.stringify(MINED)}) ? true : null; })()`, 20000);
    result.check('"Open in book" reopens the book at the mined text', Boolean(reopened));
    await ctx.shot('reopened');
    await ev(`__e2e.clickText('button', 'Library')`);
    await poll(ctx, `!document.querySelector('.novel-content')`, 10000);

    // Reopen from the shelf: the book lands where it was left, and still does after
    // the font size changed between sessions (the position is a character offset,
    // not a page fraction — novelTextAnchor.ts).
    const SETTINGS_KEY = 'jp-reader-settings';
    const visible = `(() => {
      const sc = document.querySelector('.novel-scroller');
      if (!sc) return null;
      const v = sc.getBoundingClientRect();
      const ids = [...document.querySelectorAll('.novel-content p[id]')]
        .filter((p) => [...p.getClientRects()].some((r) => r.width > 0 && r.right > v.left + 4 && r.left < v.right - 4))
        .map((p) => p.id);
      return { ids, pages: Number(sc.getAttribute('data-paged-pages') || 0), paged: sc.getAttribute('data-paged') === 'true' };
    })()`;
    const openFromShelf = async () => {
      await ev(`__e2e.open('library')`);
      await poll(ctx, `!!document.querySelector('.card[aria-label=${JSON.stringify(TITLE)}]')`, 15000);
      await ev(`__e2e.click(document.querySelector('.card[aria-label=${JSON.stringify(TITLE)}]'))`);
      const ok = await poll(ctx, `!!document.querySelector('.novel-content #q1')`, 20000);
      await ctx.sleep(1200);
      return Boolean(ok);
    };
    const closeBook = async () => {
      await ev(`__e2e.clickText('button', 'Library')`);
      await poll(ctx, `!document.querySelector('.novel-content')`, 10000);
      await ctx.sleep(400);
    };
    /** Ctrl+F, type `term`, Enter: the search lands on the paragraph `id` and marks the match. */
    const searchFor = async (term, id) => {
      await ev(`__e2e.key('f', { ctrlKey: true, code: 'KeyF' }, window)`);
      const panel = await poll(ctx, `document.activeElement && document.activeElement.classList.contains('ns-input') ? true : null`, 5000);
      await ev(`__e2e.fill(document.querySelector('.ns-input'), ${JSON.stringify(term)})`);
      const hits = await poll(ctx, `(() => { const n = document.querySelectorAll('.ns-list .ns-hit').length; return n ? n : null; })()`, 8000);
      await ev(`__e2e.key('Enter', { code: 'Enter' }, document.querySelector('.ns-input'))`);
      const landed = await poll(ctx, `(() => { const v = ${visible}; return v && v.ids.includes(${JSON.stringify(id)}) ? v : null; })()`, 8000);
      const marked = await poll(ctx, `(() => { const h = globalThis.CSS && CSS.highlights && CSS.highlights.get('novel-search-current'); if (!h) return null; const r = [...h][0]; return r ? r.toString() : null; })()`, 5000);
      const count = await ev(`document.querySelector('.ns-count')?.textContent ?? null`);
      // Escape closes the search, not the book.
      await ev(`__e2e.key('Escape', { code: 'Escape' }, document.querySelector('.ns-input'))`);
      const closed = await poll(ctx, `!document.querySelector('.ns-input') && !!document.querySelector('.novel-content')`, 5000);
      return { panel: Boolean(panel), hits, landed: Boolean(landed), marked, count, closed: Boolean(closed) };
    };
    const bookId = async () => ev(`window.api.listLibrary().then((l) => (l.find((i) => i.title === ${JSON.stringify(TITLE)})?.id ?? null))`, { await: true });
    const savedFont = await ev(`(() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').fontSize ?? null; } catch { return null; } })()`);
    const savedFlow = await ev(`(() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').flow ?? null; } catch { return null; } })()`);
    const savedWriting = await ev(`(() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').writingMode ?? null; } catch { return null; } })()`);
    try {
      result.check('the book reopens from the shelf', await openFromShelf());
      const start = await ev(visible);
      result.check('the fixture book spans more than one page', Boolean(start && start.paged && start.pages >= 2), start);
      const flips = Math.max(1, Math.min(2, (start?.pages ?? 2) - 1));
      for (let i = 0; i < flips; i++) {
        await ev(`(document.querySelector('[data-paged-control="next"]')?.click(), true)`);
        await ctx.sleep(300);
      }
      // A page turn scrolls smoothly; wait for it to land before reading the page.
      await poll(ctx, `(() => { const v = ${visible}; return v && v.ids.length && !v.ids.includes('p1') ? true : null; })()`, 8000);
      const before = await ev(visible);
      const anchor = before?.ids?.[0] ?? null;
      result.check('turning pages moves past the first page', Boolean(anchor) && !before.ids.includes('p1'), before);
      await closeBook();

      result.check('the book reopens again', await openFromShelf());
      const same = await ev(visible);
      result.check('reopened at the same place (same font)', Boolean(anchor) && Boolean(same?.ids?.includes(anchor)) && !same.ids.includes('p1'), { anchor, same });
      await ctx.shot('reopen-same');
      await closeBook();

      await ev(`(() => { const k = ${JSON.stringify(SETTINGS_KEY)}; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}'); } catch {} s.fontSize = Math.round((s.fontSize || 100) * 1.4); localStorage.setItem(k, JSON.stringify(s)); return s.fontSize; })()`);
      result.check('the book reopens with a larger font', await openFromShelf());
      const larger = await ev(visible);
      result.check('reopened at the same text after a font-size change', Boolean(anchor) && Boolean(larger?.ids?.includes(anchor)), { anchor, larger });
      await ctx.shot('reopen-larger-font');
      const vSearch = await searchFor('第18段落', 'q18');
      result.check('vertical pages: Ctrl+F finds the text and turns to its page', vSearch.panel && vSearch.hits === 1 && vSearch.landed, vSearch);
      result.check('vertical pages: the match is marked and Escape closes only the search', vSearch.marked === '第18段落' && vSearch.closed, vSearch);
      await closeBook();

      // The same in Scroll flow: scroll part-way, close, change the font, reopen.
      const setSettings = (patch) => ev(`(() => { const k = ${JSON.stringify(SETTINGS_KEY)}; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}'); } catch {} Object.assign(s, ${JSON.stringify(patch)}); localStorage.setItem(k, JSON.stringify(s)); return true; })()`);
      await setSettings({ flow: 'scrolled', fontSize: savedFont ?? 100 });
      result.check('the book opens in Scroll flow', await openFromShelf());
      const scrolled = await ev(`(() => {
        const sc = document.querySelector('.novel-scroller');
        if (!sc || sc.getAttribute('data-paged') === 'true') return null;
        const max = sc.scrollWidth - sc.clientWidth;
        if (max < 50) return { max };
        // vertical-rl: forward is a negative scrollLeft in Chromium.
        sc.scrollLeft = -Math.round(max * 0.6);
        sc.dispatchEvent(new Event('scroll'));
        return { max, at: sc.scrollLeft };
      })()`);
      result.check('Scroll flow scrolls part-way through the book', Boolean(scrolled && scrolled.max >= 50), scrolled);
      await ctx.sleep(1500); // the scroll-end save
      const storedLoc = () => ev(`window.api.listLibrary().then((l) => (l.find((i) => i.title === ${JSON.stringify(TITLE)})?.progress?.location ?? null))`, { await: true });
      const scrollAt = `(() => { const sc = document.querySelector('.novel-scroller'); return sc ? { at: Math.round(sc.scrollLeft), max: sc.scrollWidth - sc.clientWidth } : null; })()`;
      const sBefore = { ...(await ev(visible)), stored: await storedLoc(), scroll: await ev(scrollAt) };
      const sAnchor = sBefore?.ids?.[0] ?? null;
      result.check('Scroll flow: past the first paragraphs', Boolean(sAnchor) && !sBefore.ids.includes('p1'), sBefore);
      await closeBook();
      await setSettings({ fontSize: Math.round((savedFont ?? 100) * 1.4) });
      result.check('the book reopens in Scroll flow with a larger font', await openFromShelf());
      const sAfter = { ...(await ev(visible)), scroll: await ev(scrollAt) };
      result.check('Scroll flow: reopened at the same text after a font-size change', Boolean(sAnchor) && Boolean(sAfter?.ids?.includes(sAnchor)) && !sAfter.ids.includes('p1'), { sAnchor, sAfter });
      await ctx.shot('reopen-scrolled-larger-font');
      await closeBook();

      // ----- Horizontal columns: the same book, writing mode forced horizontal, paginated -----
      await setSettings({ flow: 'paginated', writingMode: 'horizontal', fontSize: savedFont ?? 100 });
      result.check('horizontal: the book opens', await openFromShelf());
      const hMode = await ev(`(() => {
        const c = document.querySelector('.novel-content');
        const sc = document.querySelector('.novel-scroller');
        return c && sc ? { writingMode: getComputedStyle(c).writingMode, paged: sc.getAttribute('data-paged') === 'true', pages: Number(sc.getAttribute('data-paged-pages') || 0) } : null;
      })()`);
      result.check('horizontal: horizontal-tb text laid out in more than one column page', Boolean(hMode && hMode.writingMode === 'horizontal-tb' && hMode.paged && hMode.pages >= 2), hMode);
      // The chapter list: back to the start of the book.
      await ev(`(() => { const s = document.querySelector('.chapter-select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '0'); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      const atStart = await poll(ctx, `(() => { const v = ${visible}; return v && v.ids.includes('p1') ? v : null; })()`, 8000);
      result.check('horizontal: the chapter list jumps to the start of the chapter', Boolean(atStart), atStart);
      await ctx.shot('horizontal-start');
      const hFlips = Math.max(1, Math.min(2, (hMode?.pages ?? 2) - 1));
      for (let i = 0; i < hFlips; i++) {
        await ev(`(document.querySelector('[data-paged-control="next"]')?.click(), true)`);
        await ctx.sleep(300);
      }
      const hPaged = await poll(ctx, `(() => { const v = ${visible}; return v && v.ids.length && !v.ids.includes('p1') ? v : null; })()`, 8000);
      const hAnchor = hPaged?.ids?.[0] ?? null;
      result.check('horizontal: Next turns to a later column page', Boolean(hAnchor), hPaged);

      // Bookmark this page: stored as a character anchor, not a page fraction.
      await ev(`__e2e.click(document.querySelector('[data-reader-tool="bookmarks"]'))`);
      await poll(ctx, `!!document.querySelector('[data-bm-add]')`, 5000);
      await ev(`__e2e.click(document.querySelector('[data-bm-add]'))`);
      const id = await bookId();
      const marks = await poll(ctx, `(() => { try { const l = JSON.parse(localStorage.getItem(${JSON.stringify('jp-bookmarks-')} + ${JSON.stringify(id)}) || '[]'); return l.length ? l : null; } catch { return null; } })()`, 5000);
      result.check('horizontal: the bookmark is a character anchor', Array.isArray(marks) && marks.length === 1 && marks[0].anchor === 'char' && /^p:0:0\.\d{6}$/.test(marks[0].cfi), marks);
      await ev(`__e2e.click(document.querySelector('[data-reader-tool="bookmarks"]'))`);
      await ctx.shot('horizontal-bookmarked');

      // In-book search in horizontal columns.
      const hSearch = await searchFor('第20段落', 'q20');
      result.check('horizontal: Ctrl+F finds the text and turns to its column page', hSearch.panel && hSearch.hits === 1 && hSearch.landed, hSearch);
      result.check('horizontal: the match is marked and Escape closes only the search', hSearch.marked === '第20段落' && hSearch.closed, hSearch);
      await ctx.shot('horizontal-search');
      await ctx.sleep(600); // the position save after the jump
      await closeBook();

      result.check('horizontal: the book reopens', await openFromShelf());
      const hReopen = await ev(visible);
      result.check('horizontal: reopened at the searched text', Boolean(hReopen?.ids?.includes('q20')), hReopen);
      await closeBook();

      // A larger font: the bookmark still lands on the text it was taken at.
      await setSettings({ fontSize: Math.round((savedFont ?? 100) * 1.4) });
      result.check('horizontal: the book reopens with a larger font', await openFromShelf());
      await ev(`__e2e.click(document.querySelector('[data-reader-tool="bookmarks"]'))`);
      await poll(ctx, `!!document.querySelector('.bm-list .bm-jump')`, 5000);
      await ev(`__e2e.click(document.querySelector('.bm-list .bm-jump'))`);
      const hJump = await poll(ctx, `(() => { const v = ${visible}; return v && v.ids.includes(${JSON.stringify(hAnchor)}) ? v : null; })()`, 8000);
      result.check('horizontal: the bookmark lands on the same text after a font-size change', Boolean(hAnchor) && Boolean(hJump), { hAnchor, hJump: hJump ?? (await ev(visible)) });
      await ctx.shot('horizontal-bookmark-larger-font');
      await closeBook();
    } finally {
      // Leave the reader settings as later flows expect them.
      await ev(`(() => { const k = ${JSON.stringify(SETTINGS_KEY)}; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}'); } catch {} if (${JSON.stringify(savedFlow)} === null) delete s.flow; else s.flow = ${JSON.stringify(savedFlow)}; if (${JSON.stringify(savedFont)} === null) delete s.fontSize; else s.fontSize = ${JSON.stringify(savedFont)}; if (${JSON.stringify(savedWriting)} === null) delete s.writingMode; else s.writingMode = ${JSON.stringify(savedWriting)}; localStorage.setItem(k, JSON.stringify(s)); return true; })()`);
    }
  },
};
