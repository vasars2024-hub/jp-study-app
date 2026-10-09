'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * SRS: 30 cards pasted into the Flashcards importer, reviewed with learning steps on.
 *
 *  - ordering: an Again card waits for its 1-minute step (fresh cards come first), then
 *    returns AHEAD of fresh cards once due (`shared/reviewSessionQueue.ts`'s rule 1);
 *  - undo puts the card back with its previous step;
 *  - leech: one card lapses for real, twice, through the review UI (threshold 2);
 *  - the FSRS optimizer worker runs on a synthetic 1,200-row log: progress shows, Cancel
 *    stops it, a second run finishes with the held-out decision.
 *
 * Time: same-day steps are minutes and lapses need days, so the page clock is moved with
 * a Date.now offset (`__e2eClock`) — the scheduler reads Date.now for every grade. Nothing
 * else about the review is simulated.
 */
const { installHelpers, poll } = require('./_lib.cjs');

const WORDS = [
  ['春', 'はる', 'spring'], ['夏', 'なつ', 'summer'], ['秋', 'あき', 'autumn'], ['冬', 'ふゆ', 'winter'],
  ['山', 'やま', 'mountain'], ['川', 'かわ', 'river'], ['海', 'うみ', 'sea'], ['空', 'そら', 'sky'],
  ['雨', 'あめ', 'rain'], ['雪', 'ゆき', 'snow'], ['風', 'かぜ', 'wind'], ['花', 'はな', 'flower'],
  ['木', 'き', 'tree'], ['森', 'もり', 'forest'], ['町', 'まち', 'town'], ['道', 'みち', 'road'],
  ['駅', 'えき', 'station'], ['店', 'みせ', 'shop'], ['本', 'ほん', 'book'], ['机', 'つくえ', 'desk'],
  ['椅子', 'いす', 'chair'], ['窓', 'まど', 'window'], ['扉', 'とびら', 'door'], ['鍵', 'かぎ', 'key'],
  ['鳥', 'とり', 'bird'], ['魚', 'さかな', 'fish'], ['犬', 'いぬ', 'dog'], ['馬', 'うま', 'horse'],
  ['牛', 'うし', 'cow'], ['羊', 'ひつじ', 'sheep'],
];
const DECK = 'E2E SRS';
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

module.exports = {
  id: 'srs',
  title: 'SRS session, undo, leech, FSRS optimizer',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    await ev(`(() => {
      if (!window.__e2eClock) {
        const real = Date.now.bind(Date);
        window.__e2eClock = { offset: 0 };
        Date.now = () => real() + window.__e2eClock.offset;
      }
      return true;
    })()`);
    // Moving the clock is "time passes"; the focus event is the user coming back to the
    // window, which is when an open Flashcards window re-reads what is due (useDueClock).
    const advance = (ms) => ev(`(window.__e2eClock.offset += ${ms}, window.dispatchEvent(new Event('focus')), window.__e2eClock.offset)`);

    // Scheduling: FSRS, Anki's learning steps, one 10-minute relearning step, leech at 2.
    await ev(`(() => {
      const key = 'jp-flashcard-scheduling-v1';
      const cur = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...cur, algorithm: 'fsrs', learningStepsMinutes: [1, 10], relearningStepsMinutes: [10], leechThreshold: 2, leechAction: 'tag' }));
      return true;
    })()`);

    await ev(`__e2e.open('flashcards')`);
    const paste = await poll(ctx, `!!document.querySelector('.deck-import-paste')`, 20000);
    result.check('Flashcards opens with the deck importer', paste);
    const tsv = WORDS.map((w) => w.join('\t')).join('\n');
    await ev(`(() => {
      const name = document.querySelector('.deck-import-panel input[type=text]');
      __e2e.fill(name, ${JSON.stringify(DECK)});
      const area = document.querySelector('.deck-import-paste');
      const dt = new DataTransfer();
      dt.setData('text/plain', ${JSON.stringify(tsv)});
      area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return true;
    })()`);
    const imported = await poll(ctx, `document.querySelector('.deck-import-status.ok')?.textContent`, 10000);
    result.check('30 cards imported by paste', Boolean(imported) && /30/.test(imported), imported);

    const startLabel = await poll(ctx, `__e2e.byText('button', /^Start review \\(\\d+\\)$/)?.textContent`, 10000);
    result.check('"Start review (N)" offers the new cards', Boolean(startLabel), startLabel);
    await ev(`__e2e.click(__e2e.byText('button', /^Start review \\(\\d+\\)$/))`);
    await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-card')`, 10000);

    const words = new Map(WORDS.map(([w, , m]) => [m, w]));
    const current = async () => {
      const raw = await ev(`(() => { const c = document.querySelector('.flash-review-shell .flash-card'); return c ? (c.querySelector('.flash-word')?.textContent || c.querySelector('.flash-recall-prompt')?.textContent || '').trim() : null; })()`);
      return words.get(raw) ?? raw;
    };
    const grade = async (rating) => {
      await ev(`(() => { const b = document.querySelector('.flash-review-shell .flash-actions .btn.primary'); if (b && !document.querySelector('.flash-review-shell .flash-again')) b.click(); return true; })()`);
      await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-${rating === 'good' ? 'got' : rating}')`, 5000);
      const hint = await ev(`document.querySelector('.flash-review-shell .flash-${rating === 'good' ? 'got' : rating} .flash-srs-hint')?.textContent ?? null`);
      await ev(`__e2e.click(document.querySelector('.flash-review-shell .flash-${rating === 'good' ? 'got' : rating}'))`);
      await ctx.sleep(250);
      return hint;
    };

    // --- ordering with steps -------------------------------------------------------
    const a = await current();
    const againHint = await grade('again');
    const b = await current();
    result.check('Again on a new card waits for its 1-minute step: a fresh card is next', Boolean(a) && b !== a, { a, againHint, b });
    await grade('good');
    const c = await current();
    result.check('Good moves a new card into its next step; another fresh card follows', c !== a && c !== b, { b, c });
    await advance(61_000);
    await grade('good');
    const back = await current();
    result.check('once its step is due, the Again card returns ahead of fresh cards', back === a, { expected: a, got: back });
    await ctx.shot('step-return');

    // --- undo ----------------------------------------------------------------------
    const goodHintBefore = await grade('good');
    const afterGood = await current();
    await ev(`__e2e.click(document.querySelector('.flash-review-shell .flash-undo'))`);
    await ctx.sleep(300);
    const undone = await current();
    await ev(`(() => { const b = document.querySelector('.flash-review-shell .flash-actions .btn.primary'); if (b && !document.querySelector('.flash-review-shell .flash-again')) b.click(); return true; })()`);
    const goodHintAfter = await poll(ctx, `document.querySelector('.flash-review-shell .flash-got .flash-srs-hint')?.textContent`, 3000);
    result.check('Undo brings the same card back with the same next step', undone === a && afterGood !== a && goodHintAfter === goodHintBefore, { a, afterGood, undone, goodHintBefore, goodHintAfter });
    await grade('easy');
    result.note(`${a} graduated with Easy (it is the leech candidate)`);

    // --- leech after real lapses ---------------------------------------------------
    const lapse = async (n) => {
      await ev(`__e2e.clickText('.flash-review-shell button', 'Exit')`);
      await poll(ctx, `!document.querySelector('.flash-review-shell')`, 5000);
      await advance(40 * DAY);
      const start = await poll(ctx, `__e2e.byText('button', /^Start review \\(\\d+\\)$/) ? true : null`, 10000);
      if (!start) return { error: 'no review offered' };
      await ev(`__e2e.click(__e2e.byText('button', /^Start review \\(\\d+\\)$/))`);
      await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-card')`, 10000);
      // Everything else in the sitting is graduated out of the way with Easy.
      for (let i = 0; i < 40; i++) {
        const now = await current();
        if (now === a) break;
        if (!now) return { error: 'session ended before the candidate came up' };
        await grade('easy');
      }
      if ((await current()) !== a) return { error: 'candidate never came up' };
      await grade('again');
      const notice = await poll(ctx, `(() => { const n = [...document.querySelectorAll('.flash-review-shell [role=status]')].map((x) => x.textContent).find((t) => /Leech/.test(t)); return n || null; })()`, n === 2 ? 5000 : 1200);
      if (n === 1) {
        // Relearning step (10 min), then Good graduates it back to review.
        await advance(11 * MIN);
        for (let i = 0; i < 40; i++) {
          const now = await current();
          if (now === a || !now) break;
          await grade('easy');
        }
        if ((await current()) === a) await grade('good');
      }
      return { notice };
    };
    const first = await lapse(1);
    result.check('lapse 1 (real, through the review UI) is not yet a leech', !first.error && !first.notice, first);
    const second = await lapse(2);
    result.check('lapse 2 makes it a leech: the review says so', !second.error && Boolean(second.notice) && second.notice.includes(a), second);
    await ctx.shot('leech');
    await ev(`(__e2e.clickText('.flash-review-shell button', 'Exit'), true)`);
    await poll(ctx, `!document.querySelector('.flash-review-shell')`, 5000);
    // The tag is on the card: the deck's own "is:leech" search finds it.
    const search = await ev(`(() => { const i = [...document.querySelectorAll('input')].find((x) => /search|find/i.test(x.placeholder || x.getAttribute('aria-label') || '')); if (!i) return null; __e2e.fill(i, 'is:leech'); return true; })()`);
    const leechRow = search ? await poll(ctx, `(() => { const t = document.body.innerText; return t.includes(${JSON.stringify(a)}) ? true : null; })()`, 5000) : null;
    result.check('"is:leech" finds the card (leech tag written)', Boolean(leechRow), { search });
    await ev(`(() => { const i = [...document.querySelectorAll('input')].find((x) => /search|find/i.test(x.placeholder || x.getAttribute('aria-label') || '')); if (i) __e2e.fill(i, ''); return true; })()`);

    // --- FSRS optimizer on a synthetic log -----------------------------------------
    const seeded = await ev(`(async () => {
      const rows = [];
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const start = Date.now() - 400 * ${DAY};
      for (let c = 0; c < 180; c++) {
        let at = start + c * 20 * 60 * 60 * 1000;
        let interval = 0;
        for (let r = 0; r < 20; r++) {
          const recall = r === 0 ? rnd() > 0.3 : rnd() > 0.12;
          const rating = !recall ? 'again' : rnd() < 0.15 ? 'hard' : rnd() < 0.85 ? 'good' : 'easy';
          const prev = interval;
          interval = rating === 'again' ? 1 : Math.max(1, Math.round((interval || 1) * (rating === 'hard' ? 1.2 : rating === 'good' ? 2.5 : 3.5)));
          rows.push({ id: 'e2e-' + c + '-' + r, at, mode: 'review', cardId: 'e2e-card-' + c, word: 'w' + c, rating, correct: rating !== 'again', prevIntervalDays: prev, intervalDays: interval, ...(r === 0 ? { isNew: true } : {}) });
          at += interval * ${DAY} + Math.floor(rnd() * 6 * 60 * 60 * 1000);
          if (at > Date.now() - ${DAY}) break;
        }
      }
      const db = await new Promise((res, rej) => { const q = indexedDB.open('jp-study-db'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        for (const row of rows) store.put(row, 'review-log-row:' + row.id);
        tx.oncomplete = () => res(true);
        tx.onerror = () => rej(tx.error);
      });
      db.close();
      return rows.length;
    })()`, { await: true });
    result.check('a synthetic review log of >= 1,000 rows is stored', seeded >= 1000, seeded);
    // The review log is read once per window and cached: reload so the optimizer sees it.
    await ctx.request('/reload', { window: 'main' });
    await ctx.sleep(4000);
    await poll(ctx, `!!(window.api && document.readyState === 'complete')`, 60000);
    await installHelpers(ctx);
    await ev(`__e2e.open('flashcards')`);
    await poll(ctx, `!!document.querySelector('details.flash-deck-prefs')`, 20000);
    await ev(`(() => { const d = document.querySelector('details.flash-deck-prefs'); d.open = true; d.scrollIntoView(); return true; })()`);
    const runBtn = await poll(ctx, `!!document.querySelector('.srs2-optimizer .btn')`, 10000);
    result.check('the FSRS optimizer is offered (algorithm FSRS)', runBtn);

    // Run until the worker reports progress, then cancel it mid-fit. The first run of a
    // session also reads the whole log from IndexedDB before the worker starts, so a run
    // that finishes before any progress was seen is simply started again.
    let shown = null;
    let moved = null;
    for (let attempt = 0; attempt < 3 && moved === null; attempt++) {
      await ev(`__e2e.click(document.querySelector('.srs2-optimizer .btn'))`);
      shown = shown || (await poll(ctx, `!!document.querySelector('.srs3-optimizer-progress progress')`, 10000, 50));
      moved = await poll(ctx, `(() => { const p = document.querySelector('.srs3-optimizer-progress progress'); if (!p) return 'finished'; return Number(p.value) > 0 ? Number(p.value) : null; })()`, 60000, 50);
      if (moved === 'finished') {
        result.note(`optimizer attempt ${attempt + 1} finished before progress was sampled; running it again to cancel mid-fit`);
        moved = null;
      }
    }
    result.check('a run shows progress that moves (worker reports back)', Boolean(shown) && moved !== null, { shown, percent: moved });
    const cancelled = await ev(`(() => { const b = __e2e.byText('.srs2-optimizer button', 'Cancel'); return b ? __e2e.click(b) : false; })()`);
    const cancelMsg = await poll(ctx, `(() => { const r = document.querySelector('.srs2-optimizer .auto-reading-options__report'); return r && /cancel/i.test(r.textContent) ? r.textContent : null; })()`, 10000);
    result.check('Cancel stops the worker and says so', cancelled && Boolean(cancelMsg), cancelMsg);

    await ev(`__e2e.click(document.querySelector('.srs2-optimizer .btn'))`);
    const decision = await poll(ctx, `(() => { const r = document.querySelector('.srs2-optimizer .auto-reading-options__report'); return r && !/cancel/i.test(r.textContent) && r.textContent.trim() ? r.innerText : null; })()`, 180000, 500);
    const apply = await ev(`!!__e2e.byText('.srs2-optimizer button', /Use these|Apply/i)`);
    result.check('a full run ends in a held-out decision', Boolean(decision) && /held|later|latest|predict|reviews/i.test(decision), { decision, apply });
    result.note(`optimizer decision: ${String(decision).replace(/\s+/g, ' ').slice(0, 300)}`);
    await ctx.shot('optimizer');
    await ev(`(window.__e2eClock && (window.__e2eClock.offset = 0), true)`);
  },
};
