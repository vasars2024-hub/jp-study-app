'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Known-words manager (Statistics → Word knowledge → Manage words): import a word list,
 * bulk-set a level on a selection, export — and read the exported file back from disk
 * (headless mode saves `<a download>` exports into the profile instead of a Save As).
 */
const fs = require('node:fs');
const path = require('node:path');
const { installHelpers, poll } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');

module.exports = {
  id: 'known-words',
  title: 'Known-words manager: import, bulk set, export',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const list = fixtures.wordList(ctx.mediaDir);

    await ev(`__e2e.open('stats')`);
    const toggle = await poll(ctx, `!!document.querySelector('.kw2-manage-toggle')`, 20000);
    result.check('Statistics offers "Manage words"', toggle);
    await ev(`(() => { const t = document.querySelector('.kw2-manage-toggle'); if (!document.querySelector('.kw2-manager')) t.click(); t.scrollIntoView(); return true; })()`);
    const manager = await poll(ctx, `!!document.querySelector('.kw2-manager .kw2-io textarea')`, 15000);
    result.check('the manager opens', manager);

    // Import: the file's text pasted, as Known.
    const text = fs.readFileSync(list.file, 'utf8');
    await ev(`__e2e.fill(document.querySelector('.kw2-io textarea'), ${JSON.stringify(text)})`);
    await ev(`__e2e.click(document.querySelector('.kw2-io .btn.primary'))`);
    const imported = await poll(ctx, `document.querySelector('.kw2-message')?.textContent`, 10000);
    // "Imported: N new, M raised, K already…" — a word mined earlier in the run is
    // "raised" rather than "new"; together they must account for the 5 unique words.
    const tally = (imported ?? '').match(/\d+/g)?.map(Number) ?? [];
    result.check('the list imports (5 unique words; comment and duplicate ignored)', tally.length >= 3 && tally[0] + tally[1] + tally[2] === 5, imported);

    const rowsFor = (word) => ev(`(() => {
      __e2e.fill(document.querySelector('.kw2-filters input[type=search]'), ${JSON.stringify(word)});
      return true;
    })()`);
    const readRow = (word) => poll(ctx, `(() => { const r = [...document.querySelectorAll('.kw2-row')].find((x) => x.querySelector('.kw2-word')?.textContent === ${JSON.stringify(word)}); return r ? { level: r.querySelector('.kw2-level')?.textContent, source: r.querySelector('.kw2-source')?.textContent } : null; })()`, 5000);
    const levels = {};
    for (const word of list.unique) {
      await rowsFor(word);
      levels[word] = await readRow(word);
    }
    result.check('every imported word is listed as Known, set by hand', list.unique.every((w) => levels[w] && /Known/i.test(levels[w].level) && /hand|manual/i.test(levels[w].source)), levels);

    // Bulk: select two of them and set them to Learning.
    const pick = ['雀', '台所'];
    for (const word of pick) {
      await rowsFor(word);
      await poll(ctx, `!!document.querySelector('.kw2-row')`, 3000);
      await ev(`(() => { const r = [...document.querySelectorAll('.kw2-row')].find((x) => x.querySelector('.kw2-word')?.textContent === ${JSON.stringify(word)}); const c = r?.querySelector('input[type=checkbox]'); if (c && !c.checked) c.click(); return !!c; })()`);
    }
    const selected = await ev(`document.querySelector('.kw2-bulk .muted')?.textContent`);
    await ev(`__e2e.click(__e2e.byText('.kw2-bulk button', /Learning/))`);
    const bulkMsg = await poll(ctx, `(() => { const m = document.querySelector('.kw2-message')?.textContent; return m && /\\b2\\b/.test(m) ? m : null; })()`, 5000);
    result.check('bulk set changes exactly the 2 selected words', Boolean(bulkMsg), { selected, bulkMsg });
    const after = {};
    for (const word of [...pick, '窓辺']) {
      await rowsFor(word);
      after[word] = await readRow(word);
    }
    result.check('the selected words are now Learning; the others are untouched', /Learning/i.test(after['雀']?.level) && /Learning/i.test(after['台所']?.level) && /Known/i.test(after['窓辺']?.level), after);
    await ctx.shot('bulk');

    // Export the manual rows as text, then read the file the export wrote.
    await rowsFor('');
    await ev(`(() => { const s = [...document.querySelectorAll('.kw2-filters select')][1]; s.value = 'manual'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await ctx.sleep(300);
    const exportCount = await ev(`(() => { const b = __e2e.byText('.kw2-io button', /\\.txt|TXT|text/i); return b ? b.textContent : null; })()`);
    await ev(`__e2e.click(__e2e.byText('.kw2-io button', /\\.txt|TXT|text/i))`);
    const exportMsg = await poll(ctx, `(() => { const m = document.querySelector('.kw2-message')?.textContent; return m && /xport/i.test(m) ? m : null; })()`, 5000);
    const file = path.join(ctx.profile, 'e2e-downloads', 'known-words-ja.txt');
    let content = null;
    for (let i = 0; i < 20 && content === null; i++) {
      if (fs.existsSync(file)) content = fs.readFileSync(file, 'utf8');
      else await ctx.sleep(250);
    }
    const status = await ctx.e2e('status');
    const downloaded = (status.calls ?? []).some((c) => /download/.test(c.api));
    result.check('export writes the file (no Save As dialog under the harness)', Boolean(exportMsg) && content !== null && downloaded, { exportCount, exportMsg, file: content === null ? 'missing' : file });
    result.check('the exported file holds every imported word', content !== null && list.unique.every((w) => content.includes(w)), content && content.slice(0, 200));
  },
};
