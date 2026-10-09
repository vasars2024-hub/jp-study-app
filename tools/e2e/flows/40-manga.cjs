'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Manga: a generated .cbz (three PNG pages with drawn vertical speech boxes) and the
 * matching .mokuro volume. The volume is picked through the reader's own "Import .mokuro"
 * file input, and the boxes must load with NO OCR model installed.
 */
const fs = require('node:fs');
const { installHelpers, poll } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');

module.exports = {
  id: 'manga',
  title: 'Manga .cbz + .mokuro (no OCR model)',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const m = await fixtures.manga(ctx.mediaDir);

    const model = await ev(`window.api.mangaOcrAvailable()`, { await: true });
    result.check('the manga OCR model is NOT installed on this profile', model === false, model);

    const items = await ev(`window.api.importPaths([${JSON.stringify(m.cbz)}])`, { await: true });
    const item = (items ?? []).find((i) => i.kind === 'manga' && /ame-no-hi/.test(i.title));
    result.check('the .cbz imports as a 3-page manga', Boolean(item) && item.pageCount === m.pages, item && { title: item.title, pages: item.pageCount });

    await ev(`__e2e.open('library')`);
    const sel = `.card[aria-label=${JSON.stringify(item?.title ?? 'ame-no-hi-e2e')}]`;
    await poll(ctx, `!!document.querySelector(${JSON.stringify(sel)})`, 15000);
    await ev(`(() => { const c = document.querySelector(${JSON.stringify(sel)}); c.querySelector('.cover')?.click() ?? c.click(); return true; })()`);
    const reader = await poll(ctx, `/\\b1 \\/ 3\\b/.test(document.body.innerText) ? true : null`, 20000);
    result.check('the manga reader opens on page 1 of 3', Boolean(reader));
    await ctx.shot('before');
    // With no manga-ocr model, "Scan" is the bundled Tesseract fallback; it opens the OCR
    // panel that holds the "Import .mokuro" picker. Its own boxes are replaced by the
    // import below, and page 2 is never scanned at all — that page is the clean proof.
    await ev(`__e2e.clickText('button', 'Scan')`);
    const input = await poll(ctx, `!!document.querySelector('input[type=file][accept*=".mokuro"]')`, 20000);
    result.check('the OCR panel offers the "Import .mokuro" picker without a model', input);
    await poll(ctx, `!/Scanning/i.test(document.querySelector('.ocr-panel-content')?.innerText ?? '')`, 60000);

    // Hand the picker the file the way a user's choice arrives: a File in input.files.
    const json = fs.readFileSync(m.mokuroFile, 'utf8');
    await ev(`(() => {
      const input = document.querySelector('input[type=file][accept*=".mokuro"]');
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(json)}], 'ame-no-hi-e2e.mokuro', { type: 'application/json' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const notice = await poll(ctx, `(() => { const n = [...document.querySelectorAll('.ocr-msg span')].map((s) => s.textContent).join(' '); return n || null; })()`, 20000);
    result.check('the import reports the pages it matched', Boolean(notice) && /3/.test(notice), notice);

    const blockTexts = `[...document.querySelectorAll('.manga-ocr-block')].map((x) => (x.innerText || x.textContent || x.getAttribute('aria-label') || '').replace(/\\s+/g, ''))`;
    const want1 = m.expectedLines[0];
    const blocks = await poll(ctx, `(() => { const b = ${blockTexts}; return b.length === ${want1.length} && ${JSON.stringify(want1)}.every((w) => b.includes(w)) ? b : null; })()`, 20000);
    result.check('page 1 shows exactly the .mokuro boxes and text', Boolean(blocks), { blocks: blocks ?? (await ev(blockTexts)), want: want1 });
    await ctx.shot('boxes');

    // Next page (never scanned): its boxes can only have come from the .mokuro file.
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      await ctx.request('/key', { window: 'main', key });
      if (await poll(ctx, `/\\b2 \\/ 3\\b/.test(document.body.innerText) ? true : null`, 3000)) break;
    }
    const want2 = m.expectedLines[1];
    const page2 = await poll(ctx, `(() => { const b = ${blockTexts}; return b.length === ${want2.length} && ${JSON.stringify(want2)}.every((w) => b.includes(w)) ? b : null; })()`, 10000);
    result.check('page 2 (never scanned) shows its .mokuro boxes', Boolean(page2), page2 ?? (await ev(blockTexts)));
    await ctx.shot('page2');
    const still = await ev(`window.api.mangaOcrAvailable()`, { await: true });
    result.check('still no OCR model afterwards (nothing was downloaded)', still === false, still);
  },
};
