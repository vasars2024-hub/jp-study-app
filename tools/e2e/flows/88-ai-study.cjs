'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * The optional AI study helpers (src/main/aiStudyAssist.ts), through the real UI, answered
 * by the harness's fake OpenAI-compatible server (tools/e2e/world.cjs `startFakeAi`). This
 * flow declares `world: { ai: true }`, so a run that includes it starts the fake and presets
 * the fresh profile: AI on, provider = the local compatible server at the fake's URL, and
 * the four study helpers allowed to use it. Nothing reaches a real AI API or real Anki.
 *
 *  1. Review: Again → "Why was I wrong?" → the fake's explanation, labelled as AI.
 *  2. Review, answer side: i+1 example sentences — the sentence without the word is dropped
 *     by main's validation, the one with many unknown words is discarded by the renderer's
 *     known-word check, and only the ticked one is added, on "Add to card".
 *  3. Leech (threshold 2, two real lapses through the review): the review's leech banner
 *     offers a rescue; a part is written only when it is ticked AND Approve is pressed. When
 *     the AI call fails, "is:leech" still gives the rescue without AI (a reading hint).
 *  4. Write mode: a wrong typed answer → "Why was I wrong?" judges it acceptable, and the
 *     card's accepted answers change only when "Accept … as correct" is clicked.
 *  5. The pop-up dictionary (a real click in a book): "Explain in context" marks the sense
 *     the fake picked; when the call fails, the first sense is marked "most common".
 *  1b. Streaming (docs/AI_AUDIT.md F9): the explanation was asked for as a stream; with a
 *     slow model (a flow-owned fake that sends the first half and holds the rest) the first
 *     half appears on screen as prose — never JSON — while the reply is still arriving, and
 *     Cancel stops the request (the model sees the hang-up) and keeps that partial text.
 *  6. "Use AI features" off (Settings > AI): every one of these entries is hidden, and what
 *     works without AI still does — Again reschedules, Write grades, the saved memory aid
 *     and example stay on the card, "is:leech" finds the leech, the pop-up lists the senses.
 *
 * The profile is left as a run without the preset would have it: AI on, no provider
 * configured, the helpers' cloud opt-ins at their defaults, scheduling as it was.
 */
const { installHelpers, poll, pollAsync, clickText, ensureDictionaryReady, DECK } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');
const { startSlowAiStream } = require('./_aiStreamFake.cjs');

/** What the slow fake streams before it holds: a why-wrong reply cut mid-explanation. */
const SLOW_PARTIAL = 'E2E slow stream: the first half of the answer';

const DECK_NAME = 'E2E AI';
const SOURCE = 'import-e2e-ai::E2E AI';
/** Single-token words (the i+1 check tokenizes), none of them in another flow's deck. 子猫 shares 猫 (a "similar card"). */
const WORDS = [
  ['猫', 'ねこ', 'cat'],
  ['電車', 'でんしゃ', 'train'],
  ['時計', 'とけい', 'clock'],
  ['公園', 'こうえん', 'park'],
  ['学校', 'がっこう', 'school'],
  ['子猫', 'こねこ', 'kitten'],
];
const LEECH_WORD = '猫';
const BOOK_TITLE = '窓辺の猫（E2E）';
const BOOK_WORD = '台所';
const TYPED = 'e2e-variant';
const SCHED_KEY = 'jp-flashcard-scheduling-v1';
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** First-run dialogs left over when this flow runs without `setup` before it. */
async function dismissFirstRun(ctx) {
  await ctx.eval(`(() => { const b = [...document.querySelectorAll('.consent button')].find((x) => /No thanks/i.test(x.innerText)); if (b) b.click(); return true; })()`);
  await ctx.sleep(300);
  await ctx.eval(`(() => { const b = document.querySelector('.frs-root .frs-quiet'); if (b) b.click(); return true; })()`);
  await poll(ctx, `!document.querySelector('.frs-root') || null`, 5000);
}

/** A card of this flow's deck, as stored. */
const cardJs = (word) => `(${DECK}.find((c) => c.bookId === 'import-e2e-ai' && c.word === ${JSON.stringify(word)}) || null)`;

/** Any `[data-ai-entry]` element on screen (hidden by `html[data-ai-off]` when AI is off). */
const VISIBLE_AI_ENTRIES = `[...document.querySelectorAll('[data-ai-entry]')].filter((el) => __e2e.vis(el)).map((el) => (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 60))`;

module.exports = {
  id: 'ai-study',
  title: 'AI study helpers (fake AI): why-wrong, examples, leech rescue, explain in context, AI off',
  /** Opt-in world: the fake AI server, and the profile preset pointing at it. */
  world: { ai: true },
  async run(ctx) {
    const { eval: ev, result } = ctx;
    const ai = ctx.world && ctx.world.ai;
    if (!ai) {
      result.skip('the run did not start the fake AI server (world option `ai`)');
      return;
    }
    await installHelpers(ctx);
    await dismissFirstRun(ctx);

    // --- 0. The preset reached main --------------------------------------------------------
    const status = await ev(`window.api.aiSetupStatus()`, { await: true });
    result.check('the profile preset: AI on, local compatible server at the fake, the helpers allowed',
      status?.enabled === true && status.providerId === 'openai-compatible' && status.compatBaseUrl === ai.base && status.compatModel === ai.model
        && ['whyWrong', 'exampleSentences', 'leechRescue', 'contextExplain'].every((f) => status.cloudFeatures?.[f] === true),
      { enabled: status?.enabled, providerId: status?.providerId, compatBaseUrl: status?.compatBaseUrl, compatModel: status?.compatModel, fake: ai.base });

    // The page clock (as the srs flow): same-day steps are minutes and a lapse needs days.
    await ev(`(() => {
      if (!window.__e2eClock) {
        const real = Date.now.bind(Date);
        window.__e2eClock = { offset: 0 };
        Date.now = () => real() + window.__e2eClock.offset;
      }
      return true;
    })()`);
    const advance = (ms) => ev(`(window.__e2eClock.offset += ${ms}, window.dispatchEvent(new Event('focus')), window.__e2eClock.offset)`);
    const schedBefore = await ev(`localStorage.getItem(${JSON.stringify(SCHED_KEY)})`);
    await ev(`(() => {
      const cur = JSON.parse(localStorage.getItem(${JSON.stringify(SCHED_KEY)}) || '{}');
      localStorage.setItem(${JSON.stringify(SCHED_KEY)}, JSON.stringify({ ...cur, learningStepsMinutes: [1, 10], relearningStepsMinutes: [10], leechThreshold: 2, leechAction: 'tag' }));
      return true;
    })()`);

    try {
      // --- the deck --------------------------------------------------------------------------
      await ev(`__e2e.open('flashcards')`);
      await poll(ctx, `!!document.querySelector('.deck-import-paste')`, 20000);
      const tsv = WORDS.map((w) => w.join('\t')).join('\n');
      await ev(`(() => {
        __e2e.fill(document.querySelector('.deck-import-panel input[type=text]'), ${JSON.stringify(DECK_NAME)});
        const dt = new DataTransfer();
        dt.setData('text/plain', ${JSON.stringify(tsv)});
        document.querySelector('.deck-import-paste').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        return true;
      })()`);
      const imported = await poll(ctx, `document.querySelector('.deck-import-status.ok')?.textContent`, 10000);
      result.check(`${WORDS.length} cards imported as "${DECK_NAME}"`, Boolean(imported) && imported.includes(String(WORDS.length)), imported);

      const setSelect = (sel, value) => ev(`(() => {
        const s = document.querySelector(${JSON.stringify(sel)});
        if (!s) return false;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(value)});
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return s.value === ${JSON.stringify(value)};
      })()`);
      const startReview = async () => {
        await setSelect('.flash-review-setup-grid label:nth-of-type(1) select', SOURCE);
        await setSelect('.flash-review-setup-grid label:nth-of-type(2) select', 'source');
        const start = await poll(ctx, `(() => { const b = __e2e.byText('.flash-review-setup button.btn.primary', /^Start review/); return b && !b.disabled ? b.textContent : null; })()`, 10000);
        if (!start) return null;
        await ev(`__e2e.click(__e2e.byText('.flash-review-setup button.btn.primary', /^Start review/))`);
        await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-card')`, 10000);
        return start;
      };
      const words = new Map(WORDS.map(([w, , m]) => [m, w]));
      const current = async () => {
        const raw = await ev(`(() => { const c = document.querySelector('.flash-review-shell .flash-card'); return c ? (c.querySelector('.flash-word')?.textContent || c.querySelector('.flash-recall-prompt')?.textContent || '').trim() : null; })()`);
        return words.get(raw) ?? raw;
      };
      const showAnswer = () => ev(`(() => { const b = document.querySelector('.flash-review-shell .flash-actions .btn.primary'); if (b && !document.querySelector('.flash-review-shell .flash-again')) b.click(); return true; })()`);
      const grade = async (rating) => {
        await showAnswer();
        await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-${rating === 'good' ? 'got' : rating}')`, 5000);
        await ev(`__e2e.click(document.querySelector('.flash-review-shell .flash-${rating === 'good' ? 'got' : rating}'))`);
        await ctx.sleep(250);
      };
      const exitReview = async () => {
        await ev(`(__e2e.clickText('.flash-review-shell button', 'Exit'), true)`);
        await poll(ctx, `!document.querySelector('.flash-review-shell')`, 5000);
        await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => __e2e.vis(x) && x.innerText.trim() === 'Done' && [...(x.parentElement?.querySelectorAll('button') ?? [])].some((y) => y.innerText.trim() === 'Review again')); if (b) b.click(); return !!b; })()`);
      };

      // --- 1. Review: Again → "Why was I wrong?" -------------------------------------------
      const started = await startReview();
      result.check(`a review of "${DECK_NAME}" starts (in deck order)`, Boolean(started), started);
      const first = await current();
      result.check(`the first card is ${LEECH_WORD}`, first === LEECH_WORD, first);
      await grade('again');
      const whyBtn = await poll(ctx, `(() => { const b = __e2e.byText('.flash-review-shell .ai-study.is-collapsed button', 'Why was I wrong?'); return b ? true : null; })()`, 8000);
      result.check('after Again, "Why was I wrong?" is offered', Boolean(whyBtn));
      const whyBefore = ai.count('whyWrong');
      await ev(`__e2e.click(__e2e.byText('.flash-review-shell .ai-study.is-collapsed button', 'Why was I wrong?'))`);
      const why = await poll(ctx, `(() => { const s = document.querySelector('.flash-review-shell .ai-study-why'); const a = s?.querySelector('.ai-study-answer'); return a ? { answer: a.innerText.replace(/\\s+/g, ' '), badge: !!a.querySelector('.ai-study-badge'), notes: s.querySelectorAll('.ai-study-notes li').length, accept: !!__e2e.byText('.ai-study-why button', /^Accept/) } : null; })()`, 15000);
      result.check('the explanation is the fake AI\'s, labelled as an AI suggestion, beside the deck\'s own notes',
        Boolean(why) && why.answer.includes(`E2E fake AI: ${LEECH_WORD}`) && why.badge && why.notes > 0, why);
      result.check('one request reached the fake, as whyWrong', ai.count('whyWrong') === whyBefore + 1, { before: whyBefore, after: ai.count('whyWrong') });
      result.check('a flip-card Again offers no "Accept as correct" (nothing was typed)', Boolean(why) && why.accept === false, why);
      await ctx.shot('why-wrong');

      // --- 1b. Streaming: chunks on screen as prose, Cancel keeps the partial text ---------
      const whyHit = ai.hits.filter((h) => h.feature === 'whyWrong').pop();
      result.check('the explanation was asked for as a stream', Boolean(whyHit) && whyHit.stream === true, whyHit);
      const slow = await startSlowAiStream({ model: ai.model });
      try {
        slow.prefix = `{"confusion":"similar-word","explanation":"${SLOW_PARTIAL}`;
        await ev(`(() => {
          window.__e2eStream = [];
          window.__e2eStreamOff = window.api.onAiStreamChunk((c) => window.__e2eStream.push(c));
          return true;
        })()`);
        await ev(`window.api.aiSetupUpdate({ compatBaseUrl: ${JSON.stringify(slow.base)} }).then(() => true)`, { await: true });
        await ev(`__e2e.click(__e2e.byText('.flash-review-shell .ai-study-why .ai-study-actions button', 'Ask again'))`);
        const drafting = await poll(ctx, `(() => { const d = document.querySelector('.flash-review-shell .ai-study-why [data-ai-stream="drafting"]'); return d && d.innerText.includes(${JSON.stringify(SLOW_PARTIAL)}) ? d.innerText : null; })()`, 20000);
        result.check('while the reply is still arriving, its first half is on screen', Boolean(drafting), drafting);
        result.check('the draft is prose, never the raw JSON', Boolean(drafting) && !/[{}]|"explanation"|similar-word/.test(drafting), drafting);
        const chunks = await ev(`(window.__e2eStream || []).length`);
        result.check('streamed chunks reached the window, tagged with the request id', chunks > 0 && (await ev(`window.__e2eStream.every((c) => typeof c.requestId === 'string' && c.requestId.length > 0)`)), chunks);
        await ctx.shot('stream-drafting');
        await ev(`__e2e.click(__e2e.byText('.flash-review-shell .ai-study-why .ai-study-busy button', 'Cancel'))`);
        const stopped = await poll(ctx, `(() => { const d = document.querySelector('.flash-review-shell .ai-study-why [data-ai-stream="stopped"]'); return d ? d.innerText : null; })()`, 10000);
        result.check('Cancel keeps the partial text, marked as stopped', Boolean(stopped) && stopped.includes(SLOW_PARTIAL) && /stopped/i.test(stopped), stopped);
        let hungUp = false;
        for (let i = 0; i < 40 && !hungUp; i++) {
          hungUp = slow.hits.some((h) => h.aborted);
          if (!hungUp) await ctx.sleep(250);
        }
        result.check('Cancel stopped the request itself (the model saw the hang-up)', hungUp, slow.hits);
        await ctx.sleep(500);
        const still = await ev(`document.querySelector('.flash-review-shell .ai-study-why [data-ai-stream="stopped"]')?.innerText ?? null`);
        result.check('the partial text is still there after the request ended', Boolean(still) && still.includes(SLOW_PARTIAL), still);
        await ctx.shot('stream-stopped');
      } finally {
        await ev(`(() => { try { window.__e2eStreamOff?.(); } catch {} return true; })()`).catch(() => undefined);
        await ev(`window.api.aiSetupUpdate({ compatBaseUrl: ${JSON.stringify(ai.base)} }).then(() => true)`, { await: true }).catch(() => undefined);
        await slow.close();
      }

      // --- 2. Example sentences on the answer side -----------------------------------------
      const exWord = await current();
      await showAnswer();
      const exBtn = await poll(ctx, `__e2e.byText('.flash-review-shell .ai-study-extras button', 'i+1 example sentences') ? true : null`, 8000);
      result.check('the answer side offers i+1 example sentences', Boolean(exBtn), exWord);
      await ev(`__e2e.click(__e2e.byText('.flash-review-shell .ai-study-extras button', 'i+1 example sentences'))`);
      await poll(ctx, `__e2e.byText('.flash-review-shell .ai-study-extras button', 'Write with AI') ? true : null`, 5000);
      const exBefore = await ev(cardJs(exWord));
      await ev(`__e2e.click(__e2e.byText('.flash-review-shell .ai-study-extras button', 'Write with AI'))`);
      const offered = await poll(ctx, `(() => {
        const s = document.querySelector('.flash-review-shell .ai-study-extras section.ai-study');
        if (!s || /Checking the sentences/.test(s.innerText)) return null;
        const kept = [...s.querySelectorAll('fieldset.ai-study-list .ai-study-item')].map((i) => ({ text: i.querySelector('[lang]')?.textContent, ticked: !!i.querySelector('input[type=checkbox]')?.checked, ai: !!i.querySelector('.ai-study-badge') }));
        const discarded = s.querySelector('details summary')?.textContent ?? '';
        if (!kept.length && !discarded) return null;
        return { kept, discarded, discardedTexts: [...s.querySelectorAll('details li [lang]')].map((x) => x.textContent), all: s.innerText };
      })()`, 20000);
      result.check('the sentence that uses the word and only known words is offered, ticked, as AI text',
        Boolean(offered) && offered.kept.length === 1 && offered.kept[0].text === `${exWord}です。` && offered.kept[0].ticked && offered.kept[0].ai, offered && offered.kept);
      result.check('the sentence with too many unknown words is discarded by the known-word check',
        Boolean(offered) && /1 sentence discarded/.test(offered.discarded) && offered.discardedTexts.length === 1 && offered.discardedTexts[0].startsWith(exWord), offered && { discarded: offered.discarded, texts: offered.discardedTexts });
      result.check('the sentence without the word never reaches the screen (main\'s validation drops it)', Boolean(offered) && !offered.all.includes('今日は雨が降っています'));
      result.check('nothing is written to the card before "Add to card"', Boolean(exBefore) && !(exBefore.exampleSentences || []).length, exBefore && exBefore.exampleSentences);
      await ctx.shot('examples');
      await ev(`__e2e.click(__e2e.byText('.flash-review-shell .ai-study-extras button', 'Add to card'))`);
      const added = await poll(ctx, `(() => { const c = ${cardJs(exWord)}; return c && (c.exampleSentences || []).length ? c.exampleSentences : null; })()`, 5000);
      result.check('"Add to card" adds exactly the ticked sentence, marked AI-written',
        Array.isArray(added) && added.length === 1 && added[0].text === `${exWord}です。` && added[0].origin === 'ai', added);

      // The rest of the sitting graduates with Easy; the Again card comes back after its step.
      for (let i = 0; i < 12; i++) {
        const now = await current();
        if (!now || now === LEECH_WORD) break;
        await grade('easy');
      }
      await advance(61_000);
      for (let i = 0; i < 12; i++) {
        const now = await current();
        if (!now) break;
        await grade('easy');
      }
      await exitReview();

      // --- 3. Leech: two real lapses (threshold 2) → rescue, applied only when ticked + approved
      // A lapse: 40 days on, the card comes up in its review and is graded Again.
      const lapse = async () => {
        await advance(40 * DAY);
        const s = await startReview();
        if (!s) return { error: 'no review offered' };
        const seen = [];
        for (let i = 0; i < 20; i++) {
          const now = await current();
          seen.push(now);
          if (now === LEECH_WORD) break;
          if (!now) return { error: 'the session ended before the leech candidate came up', seen };
          await grade('easy');
        }
        if ((await current()) !== LEECH_WORD) return { error: 'the candidate never came up', seen };
        await grade('again');
        return { seen };
      };
      const lapse1 = await lapse();
      // Its relearning step (10 min), then Good graduates it back to review.
      await advance(11 * MIN);
      for (let i = 0; !lapse1.error && i < 20; i++) {
        const now = await current();
        if (!now) break;
        if (now === LEECH_WORD) {
          await grade('good');
          break;
        }
        await grade('easy');
      }
      await exitReview();
      const lapse2 = await lapse();
      result.check(`${LEECH_WORD} lapses twice through the review (leech threshold 2)`, !lapse1.error && !lapse2.error, { lapse1, lapse2 });
      const banner = await poll(ctx, `(() => { const n = [...document.querySelectorAll('.flash-review-shell [role=status]')].map((x) => x.textContent).find((t) => /Leech/.test(t)); return n || null; })()`, 5000);
      result.check('the second lapse makes it a leech: the review says so', Boolean(banner) && banner.includes(LEECH_WORD), banner);
      const before = await ev(cardJs(LEECH_WORD));
      const rescueBefore = ai.count('leechRescue');
      const offeredRescue = await poll(ctx, `__e2e.byText('.flash-review-shell .ai-study.is-collapsed button', 'Suggest rescue') ? true : null`, 5000);
      result.check('the leech banner offers an AI rescue', Boolean(offeredRescue));
      await ev(`__e2e.click(__e2e.byText('.flash-review-shell .ai-study.is-collapsed button', 'Suggest rescue'))`);
      const parts = await poll(ctx, `(() => {
        const f = document.querySelector('.flash-review-shell .ai-study-leech fieldset.ai-study-answer');
        if (!f) return null;
        return [...f.querySelectorAll('label.ai-study-check')].map((l) => ({ label: l.querySelector('strong')?.textContent, ticked: l.querySelector('input').checked, text: l.innerText.replace(/\\s+/g, ' ') }));
      })()`, 15000);
      const part = (name) => (parts || []).find((p) => (p.label || '').startsWith(name));
      result.check('the suggestion has a memory aid (ticked), a clearer meaning (not ticked) and a distinction from 子猫',
        Boolean(part('Memory aid') && part('Memory aid').ticked && part('Clearer meaning') && !part('Clearer meaning').ticked && part('Not to confuse')),
        parts);
      result.check('one request reached the fake, as leechRescue', ai.count('leechRescue') === rescueBefore + 1);
      const tick = (name, on) => ev(`(() => {
        const l = [...document.querySelectorAll('.flash-review-shell .ai-study-leech label.ai-study-check')].find((x) => (x.querySelector('strong')?.textContent || '').startsWith(${JSON.stringify(name)}));
        const i = l && l.querySelector('input');
        if (!i) return false;
        if (i.checked !== ${on ? 'true' : 'false'}) i.click();
        return i.checked === ${on ? 'true' : 'false'};
      })()`);
      const approveState = () => ev(`(() => { const b = __e2e.byText('.flash-review-shell .ai-study-leech button', 'Approve'); return b ? { disabled: b.disabled } : null; })()`);
      // Nothing ticked: there is nothing to approve.
      await tick('Memory aid', false);
      await tick('Not to confuse', false);
      await ctx.sleep(150);
      const none = await approveState();
      const untouched = await ev(cardJs(LEECH_WORD));
      result.check('with no part ticked, Approve is disabled and the card is untouched',
        Boolean(none) && none.disabled === true && !untouched.mnemonic && !untouched.distinction && untouched.meaning === before.meaning, { none, mnemonic: untouched.mnemonic });
      // Only the memory aid ticked: only it is written.
      await tick('Memory aid', true);
      await ctx.sleep(150);
      await ctx.shot('leech-rescue');
      const ready = await approveState();
      await ev(`__e2e.click(__e2e.byText('.flash-review-shell .ai-study-leech button', 'Approve'))`);
      const applied = await poll(ctx, `(() => { const c = ${cardJs(LEECH_WORD)}; return c && c.mnemonic ? { mnemonic: c.mnemonic, meaning: c.meaning, distinction: c.distinction ?? null } : null; })()`, 5000);
      result.check('Approve writes only the ticked part: the memory aid, not the meaning or the distinction',
        Boolean(ready) && ready.disabled === false && Boolean(applied) && applied.mnemonic === `E2E fake AI mnemonic: ${LEECH_WORD} waits by the window.` && applied.meaning === before.meaning && !applied.distinction,
        { ready, applied });
      const appliedNote = await poll(ctx, `__e2e.byText('.flash-review-shell .ai-study-leech [role=status]', 'Applied to the card.') ? true : null`, 3000);
      result.check('the panel says it was applied', Boolean(appliedNote));
      await exitReview();

      // Without a model answer (the call fails): the deck's "rescue all leeches" still gives the
      // deterministic rescue — a partial reveal of the reading and the cards to compare with.
      await poll(ctx, `!document.querySelector('.flash-review-shell') || null`, 5000);
      const leechesBtn = await poll(ctx, `(() => { const b = document.querySelector('.flash-searchbar .flash-search-leeches'); if (!b || !/Leech/i.test(b.textContent)) return null; b.click(); return b.textContent; })()`, 8000);
      const batch = await poll(ctx, `(() => { const b = __e2e.byText('.flash-searchbar .ai-study.is-collapsed button', /^Suggest rescue/); return b ? b.textContent : null; })()`, 8000);
      const searchbar = batch ? null : await ev(`({ search: document.querySelector('.flash-searchbar input')?.value ?? null, text: document.querySelector('.flash-searchbar')?.innerText.replace(/\\s+/g, ' ').slice(0, 300) ?? null, shell: !!document.querySelector('.flash-review-shell') })`);
      result.check('the deck "Leeches" search (is:leech) offers a rescue for every leech it shows', Boolean(batch), { leechesBtn, batch, searchbar });
      const rescueHits = ai.count('leechRescue');
      await ev(`__e2e.click(__e2e.byText('.flash-searchbar .ai-study.is-collapsed button', /^Suggest rescue/))`);
      const leechRow = `[...document.querySelectorAll('.flash-searchbar .ai-study-leech li.ai-study-item')].find((li) => li.querySelector('strong')?.textContent === ${JSON.stringify(LEECH_WORD)})`;
      await poll(ctx, `(${leechRow}) ? true : null`, 5000);
      // Several leeches: each row asks on its own.
      await ev(`(() => { const li = ${leechRow}; const b = li && [...li.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Suggest'); if (b) b.click(); return !!b; })()`);
      // The same card and similar cards: main answers from its cache of validated answers.
      const cachedRescue = await poll(ctx, `(() => { const li = ${leechRow}; return li && li.querySelector('fieldset.ai-study-answer') ? true : null; })()`, 8000);
      result.check('asking again for the same leech is answered from the cache: nothing is sent', Boolean(cachedRescue) && ai.count('leechRescue') === rescueHits, { cachedRescue, before: rescueHits, after: ai.count('leechRescue') });
      // "Ask again" goes to the AI, and this time the call fails.
      ai.failNext('leechRescue');
      await ev(`(() => { const li = ${leechRow}; const b = li && [...li.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Ask again'); if (b) b.click(); return !!b; })()`);
      const fallback = await poll(ctx, `(() => { const li = ${leechRow}; const p = li && [...li.querySelectorAll('.ai-study-note')].find((x) => /Without AI/.test(x.textContent)); return p ? p.textContent.replace(/\\s+/g, ' ') : null; })()`, 10000);
      result.check('when the AI call fails, the rescue falls back to a reading hint and the similar cards', Boolean(fallback) && /hint "ね/.test(fallback) && fallback.includes('子猫'), fallback);
      await ev(`(() => { const i = document.querySelector('.flash-searchbar input'); if (i) __e2e.fill(i, ''); return true; })()`);

      // --- 4. Write mode: "Accept as correct" needs the click ------------------------------
      const writeOk = await openWrite(ctx);
      result.check('Write mode opens', writeOk);
      const missed = await typeWrong(ctx, TYPED);
      result.check('a wrong typed answer is graded wrong and shows the answer', Boolean(missed) && /Not this one\. The answer is \S/.test(missed), missed);
      await ev(`__e2e.click(__e2e.byText('.ai-study.is-collapsed button', 'Why was I wrong?'))`);
      const acceptable = await poll(ctx, `(() => { const s = document.querySelector('.ai-study-why'); const b = s && __e2e.byText('.ai-study-why button', /^Accept/); return b ? { button: b.textContent, note: s.querySelector('.ai-study-actions .ai-study-note')?.textContent ?? '' } : null; })()`, 15000);
      result.check('the fake judges the typed answer acceptable and "Accept … as correct" is offered', Boolean(acceptable) && acceptable.button.includes(TYPED) && acceptable.note.includes(TYPED), acceptable);
      const acceptedNow = () => ev(`${DECK}.filter((c) => ['meaning', 'target'].some((side) => (c.acceptedAnswers?.[side] || []).includes(${JSON.stringify(TYPED)}))).map((c) => ({ word: c.word, acceptedAnswers: c.acceptedAnswers }))`);
      await ctx.sleep(1000);
      const notYet = await acceptedNow();
      result.check('nothing is accepted until the button is clicked', notYet.length === 0, notYet);
      await ctx.shot('accept');
      await ev(`__e2e.click(__e2e.byText('.ai-study-why button', /^Accept/))`);
      const accepted = await poll(ctx, `${DECK}.filter((c) => ['meaning', 'target'].some((side) => (c.acceptedAnswers?.[side] || []).includes(${JSON.stringify(TYPED)}))).length || null`, 5000);
      const said = await poll(ctx, `document.querySelector('.ai-study-why [role=status]')?.textContent || null`, 3000);
      result.check('clicking it adds the typed answer to that one card\'s accepted answers', accepted === 1 && /will be accepted/.test(said ?? ''), { accepted, said, cards: await acceptedNow() });
      await exitWrite(ctx);

      // --- 5. The pop-up dictionary: Explain in context --------------------------------------
      const book = await openBook(ctx);
      result.check('the book opens in the reader', book);
      const popup = await lookUp(ctx);
      result.check(`a real click on ${BOOK_WORD} opens the pop-up dictionary`, popup?.word === BOOK_WORD, popup);
      const explainBefore = ai.count('contextExplain');
      const explainBtn = await poll(ctx, `__e2e.byText('.dict-popup .ai-study.is-collapsed button', 'Explain in context') ? true : null`, 8000);
      result.check('the pop-up offers "Explain in context"', Boolean(explainBtn));
      await ev(`__e2e.click(__e2e.byText('.dict-popup .ai-study.is-collapsed button', 'Explain in context'))`);
      const explained = await poll(ctx, `(() => {
        const s = document.querySelector('.dict-popup .ai-context-explain');
        const a = s?.querySelector('.ai-study-answer');
        if (!a) return null;
        const items = [...s.querySelectorAll('ol li.ai-study-sense')];
        return { senses: items.length, fit: items.findIndex((li) => li.classList.contains('is-fit')), tag: s.querySelector('.is-fit .ai-study-sense-tag')?.textContent ?? '', answer: a.innerText.replace(/\\s+/g, ' '), sentence: s.querySelector('.ai-study-note')?.textContent ?? '' };
      })()`, 15000);
      const wantFit = explained && explained.senses >= 2 ? 1 : 0;
      result.check('the sense the fake picked is marked "fits here", with its explanation, for the sentence the word was met in',
        Boolean(explained) && explained.fit === wantFit && explained.tag === 'fits here' && explained.answer.includes(`E2E fake AI: sense ${wantFit + 1}`) && explained.sentence.includes(BOOK_WORD),
        explained);
      result.check('one request reached the fake, as contextExplain', ai.count('contextExplain') === explainBefore + 1);
      await ctx.shot('explain-in-context');
      ai.failNext('contextExplain');
      await ev(`__e2e.click(__e2e.byText('.dict-popup .ai-context-explain button', 'Ask again'))`);
      const ctxFallback = await poll(ctx, `(() => {
        const s = document.querySelector('.dict-popup .ai-context-explain');
        if (!s || !s.querySelector('.ai-study-error, [role=alert]')) return null;
        const items = [...s.querySelectorAll('ol li.ai-study-sense')];
        return { fit: items.findIndex((li) => li.classList.contains('is-fit')), tag: s.querySelector('.is-fit .ai-study-sense-tag')?.textContent ?? '', note: [...s.querySelectorAll('.ai-study-meta')].map((x) => x.textContent).join(' ') };
      })()`, 10000);
      result.check('when the call fails, the first sense is marked "most common", labelled as the heuristic',
        Boolean(ctxFallback) && ctxFallback.fit === 0 && ctxFallback.tag === 'most common' && /Without AI/.test(ctxFallback.note), ctxFallback);
      await closeBook(ctx);

      // --- 6. "Use AI features" off: hidden, and the non-AI paths still work -----------------
      const hitsAtOff = ai.hits.length;
      const off = await setAiEnabled(ctx, false);
      result.check('Settings > AI: "Use AI features" switches off', off === false);
      await ev(`__e2e.open('flashcards')`);
      await poll(ctx, `!!document.querySelector('.flash-review-setup')`, 15000);
      const offAttr = await poll(ctx, `document.documentElement.hasAttribute('data-ai-off') || null`, 5000);
      result.check('the window knows AI is off (html[data-ai-off])', Boolean(offAttr));

      // Review (the deck, in order): the approved memory aid and example are
      // still on their cards, Again still reschedules, and no AI entry is shown anywhere.
      // A year on, every card of the deck is due again: the sitting walks them in order.
      await advance(400 * DAY);
      const offStart = await startReview();
      const offCard = await current();
      const scheduledBefore = await ev(`(() => { const c = ${cardJs(offCard ?? '')}; return c ? JSON.stringify(c.srs || null) : null; })()`);
      await showAnswer();
      await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-again')`, 5000);
      const leechSide = await ev(`({ extras: document.querySelector('.flash-review-shell .ai-study-extras')?.innerText.replace(/\\s+/g, ' ') ?? '', ai: ${VISIBLE_AI_ENTRIES} })`);
      const againAt = await ev(`Date.now()`);
      await ev(`__e2e.click(document.querySelector('.flash-review-shell .flash-again'))`);
      await ctx.sleep(500);
      const afterAgain = await ev(VISIBLE_AI_ENTRIES);
      const nextCard = await current();
      result.check('AI off: Again still moves the review on, with no "Why was I wrong?" or other AI entry shown',
        Boolean(offStart) && Boolean(offCard) && nextCard !== offCard && leechSide.ai.length === 0 && afterAgain.length === 0,
        { offCard, nextCard, answerSide: leechSide.ai, afterAgain });
      result.check('AI off: the approved memory aid is still shown on the card',
        offCard === LEECH_WORD && leechSide.extras.includes(`E2E fake AI mnemonic: ${LEECH_WORD}`), { offCard, extras: leechSide.extras });
      let exSide = null;
      const offSeen = [];
      for (let i = 0; i < WORDS.length && !exSide; i++) {
        const now = await current();
        offSeen.push(now);
        if (!now) break;
        if (now !== exWord) {
          await grade('easy');
          continue;
        }
        await showAnswer();
        await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-again')`, 5000);
        exSide = await ev(`({ extras: document.querySelector('.flash-review-shell .ai-study-extras')?.innerText.replace(/\\s+/g, ' ') ?? '', generator: !!__e2e.byText('.flash-review-shell .ai-study-extras button', 'i+1 example sentences'), ai: ${VISIBLE_AI_ENTRIES} })`);
      }
      result.check('AI off: the added example sentence is still shown on its card, with no generator',
        Boolean(exSide) && exSide.extras.includes(`${exWord}です。`) && exSide.generator === false && exSide.ai.length === 0, { exSide, offSeen });
      await ctx.shot('ai-off-review');
      await exitReview();
      // The Again was written: the card's schedule changed (the deck's cache settles after a review).
      const rescheduled = await poll(ctx, `(() => { const s = (${cardJs(offCard ?? '')} || {}).srs; return s && s.lastRating === 'again' && s.lastReviewedAt >= ${Number(againAt) || 0} ? s : null; })()`, 8000);
      result.check('AI off: the Again was saved to the card\'s schedule', Boolean(rescheduled),
        rescheduled ? { lastRating: rescheduled.lastRating, phase: rescheduled.phase ?? null, lapses: rescheduled.lapses } : { before: scheduledBefore });

      // is:leech still finds the leech; no rescue button.
      await poll(ctx, `(() => { const b = document.querySelector('.flash-searchbar .flash-search-leeches'); if (!b || !/Leech/i.test(b.textContent)) return null; b.click(); return true; })()`, 8000);
      const leechList = await poll(ctx, `(() => { const q = document.querySelector('.flash-searchbar input')?.value; const rows = [...document.querySelectorAll('.flash-row-word')].filter((x) => __e2e.vis(x)).map((x) => x.textContent.trim()); return q === 'is:leech' && rows.includes(${JSON.stringify(LEECH_WORD)}) ? rows : null; })()`, 5000);
      const leechAi = await ev(VISIBLE_AI_ENTRIES);
      result.check('AI off: "is:leech" still finds the leech, with no AI rescue offered', Boolean(leechList) && leechAi.length === 0, { leechList, leechAi });
      await ev(`(() => { const i = document.querySelector('.flash-searchbar input'); if (i) __e2e.fill(i, ''); return true; })()`);

      // Write: graded, the answer shown, no "Why was I wrong?".
      const writeOff = await openWrite(ctx);
      const missedOff = writeOff ? await typeWrong(ctx, `${TYPED}-off`) : null;
      await ctx.sleep(500);
      const writeAi = await ev(VISIBLE_AI_ENTRIES);
      result.check('AI off: Write still grades a wrong answer and shows the right one, with no "Why was I wrong?"',
        Boolean(missedOff) && /Not this one\. The answer is \S/.test(missedOff) && writeAi.length === 0, { missedOff, writeAi });
      await exitWrite(ctx);

      // The pop-up still lists the senses; no "Explain in context".
      const bookOff = await openBook(ctx);
      const popupOff = bookOff ? await lookUp(ctx) : null;
      await ctx.sleep(800);
      const popupAi = await ev(VISIBLE_AI_ENTRIES);
      const senses = await ev(`document.querySelectorAll('.dict-popup .dict-entry').length`);
      result.check('AI off: the pop-up dictionary still shows the entry, with no "Explain in context"',
        popupOff?.word === BOOK_WORD && senses > 0 && popupAi.length === 0, { popupOff, senses, popupAi });
      await ctx.shot('ai-off-popup');
      await closeBook(ctx);
      result.check('nothing was asked of the fake while AI was off', ai.hits.length === hitsAtOff, ai.hits.slice(hitsAtOff));
      result.note(`fake AI requests: ${JSON.stringify(ai.hits.map((h) => `${h.feature}:${h.status}`))}`);
    } finally {
      // Leave the profile as a run without the preset would have it.
      await ev(`(window.__e2eClock && (window.__e2eClock.offset = 0), true)`).catch(() => undefined);
      await ev(`(() => { ${schedBefore === null ? `localStorage.removeItem(${JSON.stringify(SCHED_KEY)})` : `localStorage.setItem(${JSON.stringify(SCHED_KEY)}, ${JSON.stringify(schedBefore)})`}; return true; })()`).catch(() => undefined);
      const restored = await ev(`(async () => {
        await window.api.aiSetupSetEnabled(true);
        await window.api.aiSetupUpdate({ compatBaseUrl: '', compatModel: '', cloudFeatures: { whyWrong: false, exampleSentences: false, leechRescue: false, contextExplain: false } });
        await window.api.aiSetProvider('gemini-2.5-flash');
        const s = await window.api.aiSetupStatus();
        return { enabled: s.enabled, providerId: s.providerId, compatBaseUrl: s.compatBaseUrl };
      })()`, { await: true }).catch((err) => ({ error: String(err) }));
      result.check('the AI settings are put back (AI on, no provider configured)', restored?.enabled === true && restored.providerId === 'gemini-2.5-flash' && restored.compatBaseUrl === '', restored);
    }
  },
};

/** Flashcards → Practice → Write, on every card. */
async function openWrite(ctx) {
  await ctx.eval(`__e2e.open('flashcards')`);
  const tile = await poll(ctx, `(() => { const t = [...document.querySelectorAll('.flash-practice__tile')].find((x) => /Write/i.test(x.innerText) && !x.disabled); return t ? true : null; })()`, 10000);
  if (!tile) return false;
  await ctx.eval(`__e2e.click([...document.querySelectorAll('.flash-practice__tile')].find((x) => /Write/i.test(x.innerText) && !x.disabled))`);
  return Boolean(await poll(ctx, `document.querySelector('#flash-write-answer') ? true : null`, 5000));
}

/** Types `answer` into the current Write question and checks it; the verdict line. */
async function typeWrong(ctx, answer) {
  await ctx.eval(`(() => { const i = document.querySelector('#flash-write-answer'); __e2e.fill(i, ${JSON.stringify(answer)}); i.form.requestSubmit(); return true; })()`);
  return poll(ctx, `(() => { const f = document.querySelector('#flash-write-answer')?.closest('fieldset'); const r = f && f.querySelector('p.auto-reading-options__report[aria-live]'); return r && /Not this one|Almost/.test(r.textContent) ? r.textContent : null; })()`, 5000);
}

async function exitWrite(ctx) {
  await ctx.eval(`(() => { const b = [...document.querySelectorAll('fieldset.auto-reading-options button')].find((x) => __e2e.vis(x) && x.textContent.trim() === 'Exit'); if (b) b.click(); return !!b; })()`);
  await poll(ctx, `!document.querySelector('#flash-write-answer') || null`, 5000);
}

/** The fixture book in the reader (imported here too, so this flow runs without `epub`). */
async function openBook(ctx) {
  const epub = fixtures.epub(ctx.mediaDir);
  await ctx.eval(`window.api.importPaths([${JSON.stringify(epub)}])`, { await: true });
  await ctx.eval(`__e2e.open('library')`);
  const card = await poll(ctx, `!!document.querySelector('.card[aria-label=${JSON.stringify(BOOK_TITLE)}]') || null`, 15000);
  if (!card) return false;
  await ctx.eval(`__e2e.click(document.querySelector('.card[aria-label=${JSON.stringify(BOOK_TITLE)}]'))`);
  const opened = await poll(ctx, `!!document.querySelector('.novel-content #p1') || null`, 20000);
  await ctx.sleep(800);
  return Boolean(opened);
}

/** A real click on the book's word: the pop-up's headword. */
async function lookUp(ctx) {
  // A fresh profile may still be loading the built-in dictionary.
  const dict = await ensureDictionaryReady(ctx, { word: BOOK_WORD });
  let click = { ok: false };
  let word = null;
  // The reader may still be laying the page out under the first click: try again.
  for (let attempt = 0; attempt < 3 && !word; attempt++) {
    if (attempt) await ctx.sleep(1000);
    click = await clickText(ctx, '.novel-content', BOOK_WORD[0]);
    word = await poll(ctx, `document.querySelector('.dict-popup .dict-word')?.textContent || null`, 6000);
  }
  return { word, click: click.ok, dictionaryReady: dict.ready };
}

async function closeBook(ctx) {
  await ctx.eval(`(document.querySelector('.dict-popup .dict-x')?.click(), true)`);
  await ctx.eval(`__e2e.clickText('button', 'Library')`);
  await poll(ctx, `!document.querySelector('.novel-content') || null`, 10000);
}

/** Settings > AI > "Use AI features", clicked like a user; main's answer afterwards. */
async function setAiEnabled(ctx, on) {
  await ctx.eval(`__e2e.open('settings')`);
  await ctx.sleep(400);
  await ctx.eval(`(window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'ai', settingId: 'ai-enabled' } })), true)`);
  const toggle = await poll(ctx, `(() => { const t = document.querySelector('[data-testid="ai-enabled"]'); return t && !t.disabled ? true : null; })()`, 10000);
  if (toggle) {
    await ctx.eval(`(() => { const t = document.querySelector('[data-testid="ai-enabled"]'); if (t.checked !== ${on ? 'true' : 'false'}) t.click(); return true; })()`);
  }
  await pollAsync(ctx, `window.api.aiSetupStatus().then((s) => s.enabled === ${on ? 'true' : 'false'} || null)`, 5000);
  const s = await ctx.eval(`window.api.aiSetupStatus()`, { await: true });
  return s?.enabled;
}
