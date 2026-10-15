'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Statistics review insights, from reviews given through the real review UI:
 *
 *  - six cards pasted into the Flashcards importer as their own deck, four of them
 *    graded (Easy, Easy, Good, Again) — the review log rows the insights read are the
 *    ones a learner's answers write, nothing is injected;
 *  - Statistics draws the insight charts (each one a named image with a data table)
 *    and counts those answers;
 *  - the per-deck table's Due is what Review would open for that deck: the Flashcards
 *    source picker's own count, read back from its "Start review (N)" button.
 */
const { installHelpers, poll } = require('./_lib.cjs');

const WORDS = [
  ['朝日', 'あさひ', 'morning sun'],
  ['夕焼け', 'ゆうやけ', 'sunset glow'],
  ['星空', 'ほしぞら', 'starry sky'],
  ['月光', 'げっこう', 'moonlight'],
  ['稲妻', 'いなずま', 'lightning'],
  ['虹色', 'にじいろ', 'rainbow colour'],
];
const DECK = 'E2E Stats';
const GRADES = ['easy', 'easy', 'good', 'again'];

module.exports = {
  id: 'stats',
  title: 'Statistics insights: charts and per-deck Due from real reviews',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);

    // --- a deck of its own, reviewed through the review UI -------------------------
    await ev(`__e2e.open('flashcards')`);
    const paste = await poll(ctx, `!!document.querySelector('.deck-import-paste')`, 20000);
    result.check('Flashcards opens with the deck importer', paste);
    const tsv = WORDS.map((w) => w.join('\t')).join('\n');
    await ev(`(() => {
      __e2e.fill(document.querySelector('.deck-import-panel input[type=text]'), ${JSON.stringify(DECK)});
      const area = document.querySelector('.deck-import-paste');
      const dt = new DataTransfer();
      dt.setData('text/plain', ${JSON.stringify(tsv)});
      area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return true;
    })()`);
    const imported = await poll(ctx, `document.querySelector('.deck-import-status.ok')?.textContent`, 10000);
    result.check(`${WORDS.length} cards imported as "${DECK}"`, Boolean(imported) && new RegExp(`\\b${WORDS.length}\\b`).test(imported), imported);

    // Review this deck only, due cards only: what the insights' Due column counts.
    const pickDeck = `(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.startsWith(${JSON.stringify(`${DECK} (`)})));
      if (!sel) return null;
      const opt = [...sel.options].find((o) => o.textContent.startsWith(${JSON.stringify(`${DECK} (`)}));
      if (sel.value !== opt.value) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, opt.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const due = __e2e.byText('label', /Due cards only/)?.querySelector('input[type=checkbox]');
      if (due && !due.checked) due.click();
      return opt.textContent;
    })()`;
    const picked = await poll(ctx, pickDeck, 10000);
    result.check('the review source picker offers the new deck', Boolean(picked), picked);
    await poll(ctx, `__e2e.byText('button', /^Start review \\(\\d+\\)$/)?.textContent`, 10000);
    await ev(`__e2e.click(__e2e.byText('button', /^Start review \\(\\d+\\)$/))`);
    const shell = await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-card')`, 10000);
    result.check('the review session opens on the deck', shell);

    const grade = async (rating) => {
      const cls = rating === 'good' ? 'got' : rating;
      await ev(`(() => { const b = document.querySelector('.flash-review-shell .flash-actions .btn.primary'); if (b && !document.querySelector('.flash-review-shell .flash-again')) b.click(); return true; })()`);
      const shown = await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-${cls}')`, 5000);
      if (!shown) return false;
      await ev(`__e2e.click(document.querySelector('.flash-review-shell .flash-${cls}'))`);
      await ctx.sleep(300);
      return true;
    };
    let graded = 0;
    for (const rating of GRADES) if (await grade(rating)) graded += 1;
    result.check(`${GRADES.length} answers given through the review UI`, graded === GRADES.length, { graded });

    await ev(`(__e2e.clickText('.flash-review-shell button', 'Exit'), true)`);
    await poll(ctx, `!document.querySelector('.flash-review-shell')`, 5000);
    // A sitting that ran out of cards ends on its summary: leave it with Done.
    await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => __e2e.vis(x) && x.innerText.trim() === 'Done' && [...(x.parentElement?.querySelectorAll('button') ?? [])].some((y) => y.innerText.trim() === 'Review again')); if (b) b.click(); return !!b; })()`);

    // What Review would open for this deck now: the picker's count and the button's.
    await poll(ctx, pickDeck, 10000);
    const queue = await poll(ctx, `(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.startsWith(${JSON.stringify(`${DECK} (`)})));
      const opt = sel && [...sel.options].find((o) => o.textContent.startsWith(${JSON.stringify(`${DECK} (`)}));
      const option = opt ? Number(opt.textContent.match(/\\((\\d+)\\)\\s*$/)?.[1]) : NaN;
      const label = __e2e.byText('button', /^Start review( \\(\\d+\\))?$/)?.textContent ?? '';
      const button = Number(label.match(/\\((\\d+)\\)/)?.[1] ?? 0);
      return Number.isFinite(option) ? { option, button, label } : null;
    })()`, 10000);
    result.check('the review queue for the deck is known (picker and Start button agree)', Boolean(queue) && queue.option === queue.button, queue);

    // --- Statistics --------------------------------------------------------------
    await ev(`__e2e.open('stats')`);
    const charts = await poll(ctx, `(() => {
      const root = document.querySelector('.stats2-insights');
      if (!root) return null;
      const list = [...root.querySelectorAll('.stats2-chart')];
      return list.length >= 5 ? list.map((c) => c.getAttribute('aria-label') || '') : null;
    })()`, 20000);
    result.check('Statistics draws the review insight charts', Boolean(charts), charts && charts.length);
    const tables = await ev(`document.querySelectorAll('.stats2-insights .stats2-data table').length`);
    result.check('every insight chart carries its data table', Boolean(charts) && tables === charts.length, { charts: charts && charts.length, tables });
    const total = Number((charts ?? []).map((label) => label.match(/(\d[\d,]*)\s+review/i)?.[1]).find(Boolean)?.replace(/,/g, '') ?? NaN);
    result.check(`the reviews chart counts the ${GRADES.length} answers (at least)`, Number.isFinite(total) && total >= GRADES.length, { total, first: charts && charts[0] });

    const row = await poll(ctx, `(() => {
      const tr = [...document.querySelectorAll('.stats2-decks tbody tr')].find((r) => r.querySelector('th')?.textContent.trim() === ${JSON.stringify(DECK)});
      if (!tr) return null;
      const cells = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
      return { cards: Number(cells[0]), due: Number(cells[6]), reviews: Number(cells[7]), retention: cells[8] };
    })()`, 10000);
    result.check('the per-deck table lists the deck with its cards and answers', Boolean(row) && row.cards === WORDS.length && row.reviews === GRADES.length, row);
    result.check("the deck's Due is what Review would open for it", Boolean(row) && Boolean(queue) && row.due === queue.option, { stats: row && row.due, review: queue });
    await ev(`(() => { document.querySelector('.stats2-decks')?.scrollIntoView({ block: 'center' }); return true; })()`);
    await ctx.shot('insights');
  },
};
