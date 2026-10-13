'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * EPUB: a generated book with publisher CSS for vertical writing, ruby and 縦中横 is
 * imported, opened, checked through computed styles, a word is mined from the page with a
 * real (CDP) click, and the card it makes reopens the book ("Open in book").
 */
const { installHelpers, poll, clickText, ensureDictionaryReady } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');

const TITLE = '窓辺の猫（E2E）';
const MINED = '台所';

module.exports = {
  id: 'epub',
  title: 'EPUB vertical writing + mining',
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
    const savedFont = await ev(`(() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').fontSize ?? null; } catch { return null; } })()`);
    const savedFlow = await ev(`(() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').flow ?? null; } catch { return null; } })()`);
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
    } finally {
      // Leave the reader settings as later flows expect them.
      await ev(`(() => { const k = ${JSON.stringify(SETTINGS_KEY)}; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}'); } catch {} if (${JSON.stringify(savedFlow)} === null) delete s.flow; else s.flow = ${JSON.stringify(savedFlow)}; if (${JSON.stringify(savedFont)} === null) delete s.fontSize; else s.fontSize = ${JSON.stringify(savedFont)}; localStorage.setItem(k, JSON.stringify(s)); return true; })()`);
    }
  },
};
