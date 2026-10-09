'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * First-run setup on a fresh profile: consent (declined), study language, level, the
 * downloads step showing the built-in dictionary as ready, a theme pick, finish → the
 * first-steps checklist on the desktop.
 */
const { installHelpers, poll } = require('./_lib.cjs');

module.exports = {
  id: 'setup',
  title: 'First-run setup (fresh profile)',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);

    const fresh = await ev(`({ firstRun: localStorage.getItem('jp-study.firstRun.v1'), consent: !!document.querySelector('.consent') })`);
    result.check('profile is fresh (no first-run record)', fresh.firstRun === null, fresh);

    // The country-ping consent comes first; the privacy-preserving answer is "No thanks".
    if (fresh.consent) {
      await ctx.shot('consent');
      result.check('consent: chose "No thanks"', await ev(`__e2e.clickText('.consent button', 'No thanks')`));
      await poll(ctx, `!document.querySelector('.consent')`, 10000);
    }

    const step = (id) => poll(ctx, `document.querySelector('.frs-root')?.dataset.firstRunStep === ${JSON.stringify(id)}`, 20000);
    const next = () => ev(`__e2e.click(document.querySelector('.frs-foot-right .btn.primary'))`);

    result.check('setup dialog opens at the language step', await step('language'));
    await ev(`(() => { const b = [...document.querySelectorAll('.frs-choice[role=radio]')].find((x) => x.querySelector('[lang="ja"]')); return __e2e.click(b); })()`);
    const ja = await poll(ctx, `document.querySelector('.frs-choice.is-selected [lang="ja"]') ? true : false`, 5000);
    result.check('language: Japanese selected', ja);
    await ctx.shot('language');
    await next();

    result.check('level step', await step('level'));
    await ev(`__e2e.click(document.querySelectorAll('.frs-choice-list .frs-choice')[1])`);
    const level = await ev(`document.querySelector('.frs-choice-list .is-selected .frs-choice-title')?.textContent`);
    result.check('level: second band selected', Boolean(level), level);
    const seedLabel = await ev(`document.querySelector('.frs-check span')?.textContent`);
    result.note(`level seed option: ${seedLabel}`);
    await next();

    result.check('downloads step', await step('downloads'));
    // The built-in JMdict pack is provisioned by main on first boot; the row turns "ready"
    // once dictListYomitan reports it. Re-entering the step re-asks, so poll by toggling.
    let ready = await poll(ctx, `document.querySelector('[data-download="dictionary-builtin"].is-ready') ? true : false`, 8000);
    const deadline = Date.now() + 5 * 60_000;
    while (!ready && Date.now() < deadline) {
      await ev(`__e2e.clickText('.frs-foot-right .btn', 'Back')`);
      await step('level');
      await next();
      await step('downloads');
      ready = await poll(ctx, `document.querySelector('[data-download="dictionary-builtin"].is-ready') ? true : false`, 8000);
    }
    const dlRows = await ev(`[...document.querySelectorAll('.frs-dl-row')].map((r) => ({ id: r.dataset.download, cls: r.className, status: r.querySelector('.frs-dl-status')?.textContent }))`);
    result.check('downloads: built-in dictionary shown as ready', ready, dlRows);
    await ctx.shot('downloads');
    await next();

    result.check('anki step', await step('anki'));
    await next();

    result.check('theme step', await step('theme'));
    const themes = await ev(`[...document.querySelectorAll('.frs-theme')].length`);
    result.check('theme: four looks offered', themes === 4, themes);
    // Pick Aero, then back to Study OS: the pick must move, and the final pick is kept.
    await ev(`__e2e.click(document.querySelectorAll('.frs-theme')[1])`);
    const aero = await poll(ctx, `document.querySelectorAll('.frs-theme')[1].getAttribute('aria-checked') === 'true'`, 3000);
    await ev(`__e2e.click(document.querySelectorAll('.frs-theme')[0])`);
    const studyOs = await poll(ctx, `document.querySelectorAll('.frs-theme')[0].getAttribute('aria-checked') === 'true'`, 3000);
    result.check('theme: selection follows clicks (Aero, then Study OS)', aero && studyOs);
    await ctx.shot('theme');
    await next();

    result.check('finish step', await step('finish'));
    const summary = await ev(`__e2e.text('.frs-summary')`);
    result.check('finish summary names Japanese and the Study OS look', /日本語|Japanese/.test(summary) && /Study OS/i.test(summary), summary);
    await ctx.shot('finish');
    await ev(`__e2e.click(document.querySelector('.frs-foot-right .btn.primary'))`);

    const closed = await poll(ctx, `!document.querySelector('.frs-root')`, 10000);
    result.check('setup dialog closes', closed);
    const record = await ev(`JSON.parse(localStorage.getItem('jp-study.firstRun.v1') || 'null')`);
    result.check('first-run record: done, theme study-os, checklist armed', record?.status === 'done' && record?.theme === 'study-os' && !!record?.checklistStartedAt, record);
    const checklist = await poll(ctx, `document.querySelector('.fsc-root')?.dataset.firstSteps`, 15000);
    const items = await ev(`[...document.querySelectorAll('.fsc-item')].map((i) => i.dataset.firstStep)`);
    result.check('first-steps checklist appears with its four tasks', Boolean(checklist) && items.length === 4, { checklist, items });
    await ctx.shot('checklist');
  },
};
