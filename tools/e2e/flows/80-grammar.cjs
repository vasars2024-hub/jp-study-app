'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Grammar review: points enrolled through "Learn next", two of them given a history so
 * all three prompt types come due (production for a mature point, cloze for a learned
 * one, recognition for a new one); grading moves the due counts that Flashcards (chip)
 * and Calendar (today's "Due" line) show, and both agree with the stored schedule.
 */
const { installHelpers, poll } = require('./_lib.cjs');

const KEY = 'jp-grammar-srs-v1';

module.exports = {
  id: 'grammar',
  title: 'Grammar review prompts + due counts',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    await ev(`__e2e.open('grammar')`);
    // `.gram-mode-btn` is shared with Translate's tabs: wait for Grammar's own Review tab.
    await poll(ctx, `!!__e2e.byText('.gram-mode-btn', 'Guides & hacks')`, 30000);
    await ev(`__e2e.click(__e2e.byText('.gram-mode-btn', 'Review'))`);
    const panel = await poll(ctx, `!!document.querySelector('.gx-review')`, 15000);
    result.check('Grammar opens on its Review tab', panel);

    await ev(`(() => { const b = [...document.querySelectorAll('.gx-review-level button')].find((x) => !x.disabled); return b ? __e2e.click(b) : false; })()`);
    const enrolled = await poll(ctx, `(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '{}'); const n = Object.keys(s).length; return n >= 2 ? n : null; })()`, 5000);
    result.check('"Learn next" enrols new points into the schedule', enrolled >= 2, enrolled);

    // Give two of them a history: one learned (1 review -> cloze), one mature (3 -> production).
    const ids = await ev(`(() => {
      const s = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}));
      const ids = Object.keys(s);
      const now = Date.now();
      s[ids[0]] = { ...s[ids[0]], repetitions: 3, intervalDays: 20, lastRating: 'good', lastReviewedAt: now - 20 * 864e5, dueAt: now - 3 * 36e5 };
      s[ids[1]] = { ...s[ids[1]], repetitions: 1, intervalDays: 3, lastRating: 'good', lastReviewedAt: now - 3 * 864e5, dueAt: now - 2 * 36e5 };
      localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify(s));
      window.dispatchEvent(new CustomEvent('grammar-srs-changed'));
      return ids;
    })()`);
    const counts = (label) => ev(`(() => {
      const s = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '{}');
      const now = Date.now();
      const end = new Date(); end.setHours(24, 0, 0, 0);
      const states = Object.values(s);
      return { label: ${JSON.stringify(label)}, dueNow: states.filter((x) => x.dueAt <= now).length, dueToday: states.filter((x) => x.dueAt < end.getTime()).length, summary: document.querySelector('.gx-review-summary')?.textContent ?? null };
    })()`);
    const before = await counts('before');
    result.check('the review summary shows the stored due count', before.summary && before.summary.includes(`Due now: ${before.dueNow}`), before);

    const kinds = [];
    const answer = async (rating) => {
      const kind = await poll(ctx, `document.querySelector('.gx-review-card')?.dataset.prompt`, 5000);
      const detail = await ev(`(() => { const c = document.querySelector('.gx-review-card'); return { title: c.querySelector('h2')?.textContent, blank: !!c.querySelector('.gx-review-blank'), input: !!c.querySelector('.gx-review-answer input'), gloss: c.querySelector('.gram-gloss')?.textContent ?? null }; })()`);
      kinds.push({ kind, ...detail });
      if (kind === 'cloze' && detail.input) {
        // Type a wrong answer and check it: the verdict says so and points at Again.
        await ev(`(() => { const i = document.querySelector('.gx-review-answer input'); __e2e.fill(i, 'ちがう'); i.form.requestSubmit(); return true; })()`);
        const verdict = await poll(ctx, `document.querySelector('.gx-review-verdict')?.textContent`, 3000);
        kinds[kinds.length - 1].verdict = verdict;
      } else {
        await ev(`__e2e.click(__e2e.byText('.gx-review-actions button', /Show/))`);
      }
      await poll(ctx, `!!document.querySelector('.gx-review-rate')`, 3000);
      await ev(`__e2e.click([...document.querySelectorAll('.gx-review-rate button')].find((b) => b.textContent.startsWith(${JSON.stringify(rating)})))`);
      await ctx.sleep(300);
    };
    await answer('Good');
    await ctx.shot('production');
    await answer('Good');
    await answer('Good');
    const seen = kinds.map((k) => k.kind);
    result.check('the most overdue point comes first as a production prompt', seen[0] === 'production', kinds[0]);
    result.check('a learned point is asked as a cloze (blank + answer box)', seen[1] === 'cloze' && kinds[1].blank && kinds[1].input, kinds[1]);
    result.check('a checked wrong cloze answer says so', /answer|Not quite|wrong/i.test(kinds[1].verdict ?? ''), kinds[1].verdict);
    result.check('a new point is asked as recognition (title shown)', seen[2] === 'recognition' && Boolean(kinds[2].title), kinds[2]);

    const afterReview = await counts('after');
    result.check('grading lowers the due count in the review summary', afterReview.dueNow < before.dueNow && afterReview.summary.includes(`Due now: ${afterReview.dueNow}`), { before, afterReview });

    // Flashcards' chip and the Calendar's day line read the same schedule.
    await ev(`__e2e.open('flashcards')`);
    const chip = await poll(ctx, `document.querySelector('.gram-due-chip')?.textContent`, 15000);
    result.check('Flashcards shows the same grammar due count', Boolean(chip) && chip.includes(String(afterReview.dueNow)), { chip, expected: afterReview.dueNow });
    await ctx.shot('flashcards-chip');
    await ev(`__e2e.open('calendar')`);
    const day = await poll(ctx, `document.querySelector('.gram-due-day')?.textContent`, 15000);
    result.check("Calendar's today line counts what is owed today", Boolean(day) && day.includes(String(afterReview.dueToday)), { day, expected: afterReview.dueToday });
    await ctx.shot('calendar');
    result.note(`prompt order: ${seen.join(' → ')}; ids ${ids.slice(0, 2).join(', ')}`);
  },
};
