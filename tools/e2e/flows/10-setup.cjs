'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * First-run setup on a fresh profile: consent (declined), study language, level, the
 * downloads step showing the built-in dictionary as ready, a theme pick, finish (with the
 * Snip to cards offer, off by default) → the first-steps checklist on the desktop.
 */
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');

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
    // The built-in JMdict pack is provisioned by main on first boot. While that import runs
    // the row says it is being set up (never a download offer); it turns "ready" by itself
    // once dictListYomitan reports the pack — the step re-asks on main's import stream.
    const builtIn = `document.querySelector('[data-download="dictionary-builtin"]')`;
    const dlRowsEarly = await ev(`[...document.querySelectorAll('.frs-dl-row')].map((r) => ({ id: r.dataset.download, cls: r.className, status: r.querySelector('.frs-dl-status')?.textContent }))`);
    result.note(`downloads on entry: ${JSON.stringify(dlRowsEarly)}`);
    const ready = await poll(ctx, `${builtIn}?.classList.contains('is-ready') ? true : false`, 5 * 60_000);
    const dlRows = await ev(`[...document.querySelectorAll('.frs-dl-row')].map((r) => ({ id: r.dataset.download, cls: r.className, status: r.querySelector('.frs-dl-status')?.textContent }))`);
    result.check('downloads: built-in dictionary shown as ready without leaving the step', Boolean(ready), dlRows);
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
    // v1: Snip to cards is off by default and offered here with one switch.
    const snipOffer = await ev(`(() => { const o = document.querySelector('[data-first-run-optin="snip"]'); const i = o && o.querySelector('input[role="switch"]'); return o ? { text: o.textContent, checked: i ? i.checked : null, disabled: i ? i.disabled : null } : null; })()`);
    result.check('finish: Snip to cards offered, off by default, with the privacy note',
      Boolean(snipOffer) && snipOffer.checked === false && /Snip to cards/.test(snipOffer.text) && /this computer only/.test(snipOffer.text), snipOffer);
    const snipBefore = await ev(`window.api.snipGetStatus()`, { await: true });
    result.check('main agrees: clipboard watching is off in a fresh profile', snipBefore?.enabled === false && snipBefore?.watching === false, snipBefore);
    // One click turns it on in main, a second turns it off again (the snip-cards flow
    // proves the off default and enables it itself).
    await ev(`__e2e.click(document.querySelector('[data-first-run-optin="snip"] input[role="switch"]'))`);
    const snipOn = await pollAsync(ctx, `window.api.snipGetStatus().then((s) => s && s.enabled ? s : null)`, 5000, 200);
    result.check('finish: one click enables Snip to cards (main starts watching)', Boolean(snipOn) && snipOn.watching === true, snipOn);
    await ev(`__e2e.click(document.querySelector('[data-first-run-optin="snip"] input[role="switch"]'))`);
    const snipOff = await pollAsync(ctx, `window.api.snipGetStatus().then((s) => s && !s.enabled ? s : null)`, 5000, 200);
    result.check('finish: a second click turns it off again', Boolean(snipOff), snipOff);
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
