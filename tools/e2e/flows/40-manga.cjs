'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Manga: a generated .cbz (three PNG pages with drawn vertical speech boxes) and the
 * matching .mokuro volume. The volume is picked through the reader's own "Import .mokuro"
 * file input, and the boxes must load with NO OCR model installed.
 *
 * The automatic reading's model-free half is checked too: with "Read each page
 * automatically" on (the default) and no model, the reader opens its OCR panel by itself
 * on the one-click install (never clicked here: it would download); the setting is in
 * the reader's settings; and a word in an OCR'd bubble is looked up and mined to a card,
 * the user's path once the text is there. The real-model pipeline is measured by
 * tools/ocr-eval/manga-eval.cjs, not here.
 */
const fs = require('node:fs');
const { installHelpers, poll, clickText, ensureDictionaryReady } = require('./_lib.cjs');
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
    // Auto-read is on by default; with no model, the panel opens by itself on the install offer.
    const offer = await poll(ctx, `(() => {
      const c = document.querySelector('.ocr-panel-content');
      const prompt = c?.querySelector('.asset-install-prompt');
      return prompt && prompt.querySelector('button') ? prompt.innerText.replace(/\\s+/g, ' ').trim() : null;
    })()`, 15000);
    result.check('auto-read with no model opens the OCR panel on the one-click model install', Boolean(offer) && /read automatically/i.test(offer), offer);
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
    // The key that turns forward depends on the reading direction: remember it for page 3.
    let forward = 'ArrowLeft';
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      await ctx.request('/key', { window: 'main', key });
      if (await poll(ctx, `/\\b2 \\/ 3\\b/.test(document.body.innerText) ? true : null`, 3000)) {
        forward = key;
        break;
      }
    }
    const want2 = m.expectedLines[1];
    const page2 = await poll(ctx, `(() => { const b = ${blockTexts}; return b.length === ${want2.length} && ${JSON.stringify(want2)}.every((w) => b.includes(w)) ? b : null; })()`, 10000);
    result.check('page 2 (never scanned) shows its .mokuro boxes', Boolean(page2), page2 ?? (await ev(blockTexts)));
    await ctx.shot('page2');

    // Page 3 holds one bubble of two lines, the shape the OCR's line grouping writes
    // (shared/mangaTextLines.ts; the grouping itself is unit-tested, there is no model
    // here). The reader must keep it one block, set vertically, its lines in the stored
    // order with the first line in the right-hand column.
    await ctx.request('/key', { window: 'main', key: forward });
    const onPage3 = await poll(ctx, `/\\b3 \\/ 3\\b/.test(document.body.innerText) ? true : null`, 5000);
    result.check('the reader turns to page 3', Boolean(onPage3));
    const want3 = m.expectedBlocks[2];
    const grouped = await poll(ctx, `(() => {
      const blocks = [...document.querySelectorAll('.manga-ocr-block')];
      if (blocks.length !== ${want3.length}) return null;
      const text = blocks[0].querySelector('.manga-ocr-text');
      const ps = text ? [...text.querySelectorAll('p')] : [];
      if (ps.length !== ${want3[0].length}) return null;
      return {
        lines: ps.map((p) => p.textContent),
        writingMode: getComputedStyle(text).writingMode,
        lefts: ps.map((p) => Math.round(p.getBoundingClientRect().left)),
      };
    })()`, 10000);
    result.check('page 3: a grouped two-line bubble stays one block, lines in reading order', Boolean(grouped) && JSON.stringify(grouped.lines) === JSON.stringify(want3[0]), { grouped, want: want3 });
    result.check('page 3: the bubble is set vertically, first line in the right-hand column', Boolean(grouped) && grouped.writingMode === 'vertical-rl' && grouped.lefts[0] > grouped.lefts[1], grouped);
    await ctx.shot('page3-grouped');

    // Hover-or-click a word in the bubble, look it up, mine it: the reader's study loop.
    const word = '食べる';
    const dict = await ensureDictionaryReady(ctx, { word });
    result.check('the built-in dictionary is ready for lookups', dict.ready, dict);
    const click = await clickText(ctx, '.manga-ocr-block .manga-ocr-text', word[0]);
    result.check('a real click lands on the bubble text', click.ok === true && click.delivered >= 1, click);
    const popupWord = await poll(ctx, `document.querySelector('.dict-popup .dict-word')?.textContent`, 10000);
    result.check(`the lookup popup shows ${word}`, popupWord === word, popupWord);
    await ctx.shot('lookup');
    await ev(`__e2e.click(document.querySelector('.dict-popup .dict-mine'))`);
    const popupGone = await poll(ctx, `!document.querySelector('.dict-popup') ? true : null`, 5000);
    result.check('Mine closes the popup', Boolean(popupGone));

    // The setting lives in the reader's own settings, OCR tab, and persists.
    const stored = `JSON.parse(localStorage.getItem('jp-manga-reader-settings') || '{}').autoOcr`;
    await ev(`(() => { const d = document.querySelector('details.lq-overflow'); if (d) d.open = true; return __e2e.clickText('button', 'Reader settings'); })()`);
    await poll(ctx, `__e2e.clickText('[role=tab]', 'OCR') || null`, 5000);
    const setting = await poll(ctx, `(() => { const i = document.querySelector('input[data-manga-auto-ocr-setting]'); return i ? { on: i.checked, label: i.closest('label')?.innerText.trim() } : null; })()`, 5000);
    result.check('the reader settings offer "Read each page automatically", on by default', Boolean(setting) && setting.on === true, setting);
    await ev(`__e2e.click('input[data-manga-auto-ocr-setting]')`);
    const off = await poll(ctx, `${stored} === false ? true : null`, 3000);
    await ev(`__e2e.click('input[data-manga-auto-ocr-setting]')`);
    const on = await poll(ctx, `${stored} === true ? true : null`, 3000);
    result.check('turning it off and on again is saved', Boolean(off) && Boolean(on), { off, on });
    await ev(`(document.querySelector('.manga-settings-panel .dict-x, [role=dialog] .dict-x')?.click(), true)`);

    const still = await ev(`window.api.mangaOcrAvailable()`, { await: true });
    result.check('still no OCR model afterwards (nothing was downloaded)', still === false, still);

    // The mined word is a card, from this manga.
    await ev(`__e2e.clickText('button', 'Library')`);
    await poll(ctx, `!document.querySelector('.manga-stage') ? true : null`, 10000);
    await ev(`__e2e.open('flashcards')`);
    const card = await poll(ctx, `(() => { const t = document.body.innerText; return t.includes(${JSON.stringify(word)}) ? true : null; })()`, 20000);
    result.check('the mined word is in Flashcards', Boolean(card));
    await ctx.shot('card');
  },
};
