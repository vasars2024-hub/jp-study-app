'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * EPUB: a generated book with publisher CSS for vertical writing, ruby and 縦中横 is
 * imported, opened, checked through computed styles, a word is mined from the page with a
 * real (CDP) click, and the card it makes reopens the book ("Open in book").
 */
const { installHelpers, poll, clickText } = require('./_lib.cjs');
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

    // Mine a word with a real click on the page.
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
  },
};
