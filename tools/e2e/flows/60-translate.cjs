'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Translate workbench. It needs the local model (Qwen3 GGUF). On a fresh profile that
 * model is not downloaded, so what is verified is the setup state: translating says
 * plainly that the model is missing and where to install it, nothing is downloaded behind
 * the user's back, and the window stays usable. If a model IS present (an owner run with
 * a populated profile), the flow translates a sentence instead.
 */
const { installHelpers, poll } = require('./_lib.cjs');

module.exports = {
  id: 'translate',
  title: 'Translate workbench (model setup state)',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const status = await ev(`window.api.translateStatus()`, { await: true });
    result.note(`translateStatus: ${JSON.stringify(status).slice(0, 300)}`);

    await ev(`__e2e.open('translate')`);
    const area = await poll(ctx, `!!document.querySelector('.tr-textarea, .aero-translate-textarea')`, 20000);
    result.check('Translate opens with a source box', area);
    await ev(`__e2e.fill(document.querySelector('.tr-textarea, .aero-translate-textarea'), '猫は窓辺で眠っていた。')`);
    // The visible Translate button (Ctrl+Enter does the same).
    const clicked = await ev(`(() => { const b = [...document.querySelectorAll('.btn.primary')].find((x) => __e2e.vis(x) && !x.disabled && /Translate/i.test(x.textContent)); return b ? __e2e.click(b) : false; })()`);
    result.check('the Translate button is enabled with text in the box', clicked);

    if (status && status.modelFound) {
      const out = await poll(ctx, `(() => { const o = document.querySelector('.tr-output, .aero-translate-output'); return o && o.textContent.trim().length > 3 ? o.textContent.trim() : null; })()`, 180000, 1000);
      result.check('with the model installed, a translation appears', Boolean(out), out);
      return;
    }
    result.check('the local model is not downloaded on this profile', status && status.modelFound === false, status);
    const err = await poll(ctx, `(() => { const e = document.querySelector('.tr-error, .aero-translate-error'); return e ? e.textContent.trim() : null; })()`, 30000);
    result.check('translating says the model is missing and where to install it', Boolean(err) && /not installed/i.test(err) && /Settings/.test(err), err);
    const after = await ev(`window.api.translateStatus()`, { await: true });
    result.check('nothing was downloaded or loaded behind the user\'s back', after && after.modelFound === false && !after.ready, after);
    const usable = await ev(`(() => { const b = [...document.querySelectorAll('.btn.primary')].find((x) => __e2e.vis(x) && /Translate/i.test(x.textContent)); return b ? !b.disabled : false; })()`);
    result.check('the workbench stays usable (button enabled again)', usable);
    await ctx.shot('setup-state');
  },
};
