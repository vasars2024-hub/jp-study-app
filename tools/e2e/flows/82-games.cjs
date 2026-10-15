'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Game Arena: a whole Kana Sprint session, played through the real round UI.
 *
 * Kana Sprint is the game whose answer is fixed by its prompt: each round shows one
 * kana and wants its romaji. The flow reads the app's own kana table
 * (`KANA_PROMPTS` in src/renderer/data/gradedSentences/index.ts) to answer, so
 * every answer is right by construction, and checks that:
 *
 *  - the arena opens and the game starts;
 *  - each typed answer is graded (the round's verdict says Correct);
 *  - each answer is banked as practice — the day's Statistics record gains one
 *    practice answer, and one correct one, per distinct kana (a kana met twice in
 *    a session is credited once) — never as a recall review;
 *  - the finished session reports the practice credit it banked.
 */
const fs = require('node:fs');
const path = require('node:path');
const { installHelpers, poll } = require('./_lib.cjs');

const KANA_SOURCE = path.resolve(__dirname, '../../../src/renderer/data/gradedSentences/index.ts');

/** kana → romaji, from the table the game draws its rounds from. */
function kanaTable() {
  const text = fs.readFileSync(KANA_SOURCE, 'utf8');
  const table = new Map();
  for (const m of text.matchAll(/\{\s*kana:\s*'([^']+)',\s*romaji:\s*'([^']+)'/g)) table.set(m[1], m[2]);
  return table;
}

/** The day records of the Japanese statistics store, summed: practice and recall reviews. */
const STATS_TOTALS = `(() => {
  const data = JSON.parse(localStorage.getItem('jp-study-stats-v1-ja') || '{}');
  const out = { practice: 0, practiceCorrect: 0, reviews: 0 };
  for (const day of Object.values(data.days || {})) {
    out.practice += day.practice || 0;
    out.practiceCorrect += day.practiceCorrect || 0;
    out.reviews += day.reviews || 0;
  }
  return out;
})()`;

module.exports = {
  id: 'games',
  title: 'Game Arena: a Kana Sprint session graded and banked as practice',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const table = kanaTable();
    result.check('the kana table is readable from the source', table.size >= 40, { size: table.size });

    await ev(`__e2e.open('games')`);
    const list = await poll(ctx, `document.querySelectorAll('.game-list .game-list-item').length`, 20000);
    result.check('the arena opens with its game list', list >= 10, { games: list });
    await ev(`__e2e.click(__e2e.byText('.game-list .game-list-item', /Kana Sprint/))`);
    const ready = await poll(ctx, `(() => { const h = document.querySelector('.game-stage-head h3')?.textContent; return h && /Kana Sprint/.test(h) ? h : null; })()`, 5000);
    result.check('Kana Sprint is selected', Boolean(ready), ready);

    const before = await ev(STATS_TOTALS);
    await ev(`__e2e.click(__e2e.byText('.game-launch-panel > button', /Start round/) || document.querySelector('.game-launch-panel > .btn.primary'))`);
    const started = await poll(ctx, `!!document.querySelector('.game-round .game-answer-box')`, 5000);
    result.check('the session starts on a typed round', started);

    const answered = [];
    let firstVerdict = null;
    let firstDelta = null;
    for (let round = 0; round < 40; round++) {
      const prompt = await poll(ctx, `(() => {
        const box = document.querySelector('.game-round .game-answer-box');
        if (!box || box.disabled) return null;
        return document.querySelector('.game-round .game-prompt-main')?.textContent.trim() || null;
      })()`, 4000);
      if (!prompt) break;
      const romaji = table.get(prompt);
      if (!romaji) {
        result.note(`no table entry for the prompt "${prompt}"`);
        break;
      }
      await ev(`(() => {
        const box = document.querySelector('.game-round .game-answer-box');
        __e2e.fill(box, ${JSON.stringify(romaji)});
        __e2e.click(__e2e.byText('.game-round button', /Check/));
        return true;
      })()`);
      const verdict = await poll(ctx, `document.querySelector('.game-round .game-verdict')?.className || null`, 3000);
      answered.push({ prompt, romaji, ok: /\bok\b/.test(verdict || '') });
      if (round === 0) {
        firstVerdict = await ev(`document.querySelector('.game-round .game-verdict')?.textContent.trim() ?? null`);
        const after = await ev(STATS_TOTALS);
        firstDelta = {
          practice: after.practice - before.practice,
          practiceCorrect: after.practiceCorrect - before.practiceCorrect,
          reviews: after.reviews - before.reviews,
        };
        await ctx.shot('graded');
      }
      // The verdict stays up for a beat before the next round replaces it.
      await poll(ctx, `(() => {
        const box = document.querySelector('.game-round .game-answer-box');
        return !box || !box.disabled || !!document.querySelector('.game-result-srs, .game-result');
      })()`, 5000);
      if (await ev(`!!document.querySelector('.game-result-srs')`)) break;
    }

    result.check('the typed answer is graded: the verdict says Correct', answered.length > 0 && answered[0].ok && /Correct/.test(firstVerdict || ''), { first: answered[0], firstVerdict });
    result.check('the answer is banked as practice (one practice answer, one correct), not as a review', Boolean(firstDelta) && firstDelta.practice === 1 && firstDelta.practiceCorrect === 1 && firstDelta.reviews === 0, firstDelta);
    result.check('every round played was graded correct', answered.length >= 3 && answered.every((a) => a.ok), answered);

    const summary = await poll(ctx, `document.querySelector('.game-result-srs')?.textContent || null`, 10000);
    const distinct = new Set(answered.map((a) => a.prompt)).size;
    const after = await ev(STATS_TOTALS);
    const practiced = Number(summary?.match(/practice credit:\s*(\d+)/i)?.[1] ?? NaN);
    result.check('the finished session reports the practice it banked, one per distinct kana', practiced === distinct, { summary, distinct });
    result.check('Statistics holds that practice: one answer per distinct kana, all correct', after.practice - before.practice === distinct && after.practiceCorrect - before.practiceCorrect === distinct && after.reviews === before.reviews, { before, after, distinct });
    await ctx.shot('result');
  },
};
