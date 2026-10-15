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
const SESSION_OPTIONS_KEY = 'jp-grammarx-session-options-v1';

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
      // The end of the current study day (4 am by default), as the Calendar counts it: between
      // midnight and 4 am "today" still runs to 4 am, not to the next midnight.
      const end = new Date(); end.setHours(4, 0, 0, 0); if (end.getTime() <= now) end.setDate(end.getDate() + 1);
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

    // --- Practice test: no enrolment until the learner accepts (G13) ---------------
    const srsKeys = () => ev(`Object.keys(JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '{}')).sort()`);
    await ev(`localStorage.setItem(${JSON.stringify(SESSION_OPTIONS_KEY)}, JSON.stringify({ count: 3, direction: 'recognition', types: ['flip'], mastered: 'include', newRatio: 1 }))`);
    await ev(`__e2e.open('grammar')`);
    await poll(ctx, `!!__e2e.byText('.gram-mode-btn', 'Practice')`, 15000);
    await ev(`__e2e.click(__e2e.byText('.gram-mode-btn', 'Practice'))`);
    await poll(ctx, `!!__e2e.byText('.gx-practice-toolbar button', 'Grammar Test')`, 15000);
    const keysBeforeTest = await srsKeys();
    await ev(`__e2e.clickText('.gx-practice-toolbar button', 'Grammar Test')`);
    await poll(ctx, `!!document.querySelector('.gx-test-overlay')`, 5000);
    await ev(`__e2e.clickText('.gx-test-setup button', 'Start')`);
    for (let i = 0; i < 3; i += 1) {
      const step = await poll(ctx, `document.querySelector('.gx-test-done') ? 'done' : (__e2e.byText('.gx-test-card button', 'Reveal meaning') ? 'reveal' : null)`, 5000);
      if (step === 'done') break;
      await ev(`__e2e.clickText('.gx-test-card button', 'Reveal meaning')`);
      await poll(ctx, `!!document.querySelector('.gx-grade-good')`, 3000);
      await ev(`__e2e.click(document.querySelector('.gx-grade-good'))`);
    }
    const done = await poll(ctx, `!!document.querySelector('.gx-test-done')`, 5000);
    result.check('the practice test runs to its results screen', done);
    const keysAfterTest = await srsKeys();
    result.check('a finished practice test has scheduled no new point', JSON.stringify(keysAfterTest) === JSON.stringify(keysBeforeTest), { before: keysBeforeTest.length, after: keysAfterTest.length });
    const offer = await ev(`document.querySelector('.gx-test-enrol-add')?.textContent ?? null`);
    const offered = Number((offer ?? '').match(/\d+/)?.[0] ?? 0);
    result.check('the results offer "Add N new points to reviews"', offered > 0 && /Add \d+ new points? to reviews/.test(offer), offer);
    await ev(`__e2e.click(document.querySelector('.gx-test-enrol-add'))`);
    const enrolledAfter = await poll(ctx, `(() => { const n = Object.keys(JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '{}')).length; return n > ${keysBeforeTest.length} ? n : null; })()`, 3000);
    result.check('accepting the offer schedules exactly those points', enrolledAfter === keysBeforeTest.length + offered, { before: keysBeforeTest.length, offered, after: enrolledAfter });
    const enrolNote = await ev(`document.querySelector('.gx-test-enrol-done')?.textContent ?? null`);
    result.check('the dialog confirms what it added', Boolean(enrolNote) && enrolNote.includes(String(offered)), enrolNote);
    await ctx.shot('test-enrol-offer');
    await ev(`__e2e.key('Escape', {}, document.querySelector('.gx-test-overlay'))`);
    await poll(ctx, `!document.querySelector('.gx-test-overlay')`, 3000);

    // --- A new N5 point, and example audio (G11, G12) -----------------------------
    await ev(`__e2e.click(__e2e.byText('.gram-mode-btn', 'Grammar points'))`);
    // The Library window an earlier flow left open reuses the `.gram-search` class for its own
    // box ("Title, author, series or tag"), and it comes first in the document: fill the
    // explorer's search, found through the explorer's placeholder.
    const explorerSearch = `[...document.querySelectorAll('.gram-search')].find((el) => el.placeholder === 'Search grammar or meaning…')`;
    await poll(ctx, `!!${explorerSearch}`, 10000);
    const findRow = `[...document.querySelectorAll('.gram-x-row')].find((x) => x.querySelector('.gram-x-title')?.textContent === '〜をください')`;
    await ev(`__e2e.fill(${explorerSearch}, 'をください')`);
    const row = await poll(ctx, `(() => { const r = ${findRow}; return r ? r.textContent : null; })()`, 10000);
    result.check('the new N5 point 〜をください is in the explorer', Boolean(row) && row.includes('N5'), row);
    if (row) await ev(`__e2e.click(${findRow}.querySelector('.gram-x-row-main'))`);
    const detail = await poll(ctx, `(() => { const c = document.querySelector('.gram-card'); return c && c.querySelector('h2')?.textContent === '〜をください' ? { examples: c.querySelectorAll('.gram-examples li').length, buttons: c.querySelectorAll('.gram-examples li .gram-ex-audio').length } : null; })()`, 5000);
    result.check('its detail shows examples, each with a speaker button', Boolean(detail) && detail.examples >= 3 && detail.buttons === detail.examples, detail);

    // Record every state the first speaker passes through, then press it.
    await ev(`(() => {
      const b = document.querySelector('.gram-card .gram-examples li .gram-ex-audio');
      window.__gramAudioStates = [b.dataset.audioState];
      new MutationObserver(() => window.__gramAudioStates.push(b.dataset.audioState)).observe(b, { attributes: true, attributeFilter: ['data-audio-state'] });
      return __e2e.click(b);
    })()`);
    const audio = await poll(ctx, `(() => { const s = window.__gramAudioStates; return s.includes('playing') || s.includes('error') ? { states: s, alert: document.querySelector('.gram-card .gram-ex-audio-error')?.textContent ?? null } : null; })()`, 90000);
    result.check('pressing it starts synthesis (loading state)', Boolean(audio) && audio.states.includes('loading'), audio);
    result.check(
      'the example reaches the playing state, or names the missing voice in words',
      Boolean(audio) && (audio.states.includes('playing') || (audio.states.includes('error') && /voice|synthesizer|read aloud/i.test(audio.alert ?? ''))),
      audio,
    );
    if (audio && audio.states.includes('playing')) {
      // A second press stops it (or it already ended on its own).
      await ev(`(() => { const b = document.querySelector('.gram-card .gram-examples li .gram-ex-audio'); return b.dataset.audioState === 'playing' ? __e2e.click(b) : true; })()`);
      const stopped = await poll(ctx, `document.querySelector('.gram-card .gram-examples li .gram-ex-audio')?.dataset.audioState === 'idle' || null`, 5000);
      result.check('a second press stops the example', Boolean(stopped));
    } else {
      result.note(`example audio did not play on this machine: ${audio?.alert ?? 'no state'}`);
    }
    await ctx.shot('example-audio');
  },
};
