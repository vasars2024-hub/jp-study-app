'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Translate workbench.
 *
 *  1. The offline engine's setup state. On a fresh profile the local model (Qwen3 GGUF) is not
 *     downloaded, so translating says plainly that it is missing and where to install it, nothing
 *     is downloaded behind the user's back, and the window stays usable. If a model IS present (an
 *     owner run with a populated profile), a sentence is translated instead.
 *  2. A real translation through a cloud engine: DeepL, faked by the harness (world.cjs routes
 *     api-free.deepl.com to `answerFakeDeepl` in fixtures.cjs). The engine is chosen and allowed in
 *     the picker the way a user does it, DeepL's formality and context are set in its options, and
 *     the flow checks both what appears on screen and what the fake was actually sent.
 *  3. Compare engines: the same passage through every allowed engine at once, side by side.
 *
 * Nothing leaves the machine: the DeepL part runs only when the harness's remap for DeepL is in
 * place, and the key is a fake one that is removed again at the end, with the pair, the consent,
 * the fallback setting and the DeepL options put back as they were.
 */
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');

const SENTENCE = '猫は窓辺で眠っていた。';
const SECOND = '今日は雨ですね。';
const FAKE_KEY = 'e2e-fake-key:fx';
const CONTEXT = 'E2E: a quiet scene from a novel.';
const OUTPUT = `(() => { const o = document.querySelector('.tr-output, .aero-translate-output'); return o && o.textContent.trim().length > 3 ? o.textContent.trim() : null; })()`;
const TRANSLATE_BUTTON = `[...document.querySelectorAll('.btn.primary')].find((x) => __e2e.vis(x) && /Translate/i.test(x.textContent))`;

async function clickTranslate(ctx) {
  return ctx.eval(`(() => { const b = ${TRANSLATE_BUTTON}; return b && !b.disabled ? __e2e.click(b) : false; })()`);
}

/** Sets a React-controlled <select> the way a user's pick does. */
function pickJs(selector, value) {
  return `(() => { const s = document.querySelector(${JSON.stringify(selector)}); if (!s) return false; s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value === ${JSON.stringify(value)}; })()`;
}

module.exports = {
  id: 'translate',
  title: 'Translate workbench (model setup state, DeepL through a fake, engine comparison)',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    // First-run dialogs left over when this flow runs without `setup` before it: declined, so the
    // screenshots show the workbench.
    await ev(`(() => { const b = [...document.querySelectorAll('.consent button')].find((x) => /No thanks/i.test(x.innerText)); if (b) b.click(); return true; })()`);
    await ctx.sleep(300);
    await ev(`(() => { const b = document.querySelector('.frs-root .frs-quiet'); if (b) b.click(); return true; })()`);
    await poll(ctx, `!document.querySelector('.frs-root') || null`, 5000);
    const status = await ev(`window.api.translateStatus()`, { await: true });
    result.note(`translateStatus: ${JSON.stringify(status).slice(0, 300)}`);

    await ev(`__e2e.open('translate')`);
    const area = await poll(ctx, `!!document.querySelector('.tr-textarea, .aero-translate-textarea')`, 20000);
    result.check('Translate opens with a source box', area);
    await ev(`__e2e.fill(document.querySelector('.tr-textarea, .aero-translate-textarea'), ${JSON.stringify(SENTENCE)})`);
    // The visible Translate button (Ctrl+Enter does the same).
    const clicked = await clickTranslate(ctx);
    result.check('the Translate button is enabled with text in the box', clicked);

    // ---- 1. The offline engine ----------------------------------------------------------------
    if (status && status.modelFound) {
      const out = await poll(ctx, OUTPUT, 180000, 1000);
      result.check('with the model installed, a translation appears', Boolean(out), out);
    } else {
      result.check('the local model is not downloaded on this profile', status && status.modelFound === false, status);
      const err = await poll(ctx, `(() => { const e = document.querySelector('.tr-error, .aero-translate-error'); return e ? e.textContent.trim() : null; })()`, 30000);
      result.check('translating says the model is missing and where to install it', Boolean(err) && /not installed/i.test(err) && /Settings/.test(err), err);
      const after = await ev(`window.api.translateStatus()`, { await: true });
      result.check('nothing was downloaded or loaded behind the user\'s back', after && after.modelFound === false && !after.ready, after);
      const usable = await poll(ctx, `(() => { const b = ${TRANSLATE_BUTTON}; return b ? !b.disabled : false; })()`, 10000);
      result.check('the workbench stays usable (button enabled again)', usable);
      await ctx.shot('setup-state');
    }

    // ---- 2. DeepL, through the harness's fake ---------------------------------------------------
    const fake = ctx.world && ctx.world.providers && ctx.world.providers.deepl;
    const iso = (await ctx.e2e('status')).isolation || {};
    const remapped = Boolean(iso.remote && iso.remote['api-free.deepl.com']);
    result.check('DeepL is answered by the harness, not the internet', remapped && Array.isArray(fake), iso.remote);
    if (!remapped || !Array.isArray(fake)) return;

    const before = await ev(`window.api.translateProviders()`, { await: true });
    const hadFallback = before && before.settings ? before.settings.fallbackToLocal !== false : true;
    const deeplBefore = await ev(`window.api.translateDeeplOptions()`, { await: true });
    try {
      const stored = await ev(`window.api.setCredentialSecret('deepl', 'apiKey', ${JSON.stringify(FAKE_KEY)})`, { await: true });
      result.check('a (fake) DeepL key is saved in the vault', stored && stored.ok === true, stored && stored.messageKey);
      // No stand-in: a DeepL failure must show as one here. Also refreshes every open picker.
      await ev(`window.api.translateSetFallback(false)`, { await: true });

      const ready = await poll(ctx, `(() => { const o = [...document.querySelectorAll('.xlate2-engine-pick option')].find((x) => x.value === 'deepl'); return o && !o.disabled; })()`, 10000);
      result.check('DeepL becomes choosable once a key is saved', ready);
      await ev(pickJs('.xlate2-engine-pick select', 'deepl'));
      const asked = await poll(ctx, `!!document.querySelector('.xlate2-consent')`, 5000);
      result.check('choosing DeepL asks before any text is sent', asked && fake.length === 0, { requests: fake.length });
      await ev(`__e2e.clickText('.xlate2-consent button', /^Allow DeepL/)`);
      const chosen = await pollAsync(ctx, `window.api.translateProviders().then((s) => s.settings.pairs['ja>en'] === 'deepl' && Boolean(s.settings.consent.deepl))`, 5000);
      result.check('"Allow" records the consent and makes DeepL the pair\'s engine', chosen);

      // DeepL's options: more formal, with a context note.
      const toggled = await poll(ctx, `(() => { const b = document.querySelector('.xlate2-deepl-toggle'); return b ? __e2e.click(b) : false; })()`, 5000);
      result.check('DeepL options are offered while DeepL is the engine', toggled);
      await poll(ctx, `!!document.querySelector('.xlate2-deepl select:not([disabled])')`, 5000);
      await ev(pickJs('.xlate2-deepl select', 'more'));
      await ev(`__e2e.fill(document.querySelector('.xlate2-deepl textarea'), ${JSON.stringify(CONTEXT)})`);
      await ev(`__e2e.clickText('.xlate2-deepl button', 'Save')`);
      const saved = await pollAsync(ctx, `window.api.translateDeeplOptions().then((o) => o.formality === 'more' && o.context === ${JSON.stringify(CONTEXT)})`, 5000);
      result.check('formality and context are saved by main', saved);

      // A real translation through it.
      await poll(ctx, `(() => { const b = ${TRANSLATE_BUTTON}; return b && !b.disabled; })()`, 10000);
      await clickTranslate(ctx);
      const out = await poll(ctx, `(() => { const o = ${OUTPUT}; return o && /sleeping by the window/.test(o) ? o : null; })()`, 30000);
      result.check('the DeepL translation appears in the result pane', Boolean(out) && /The cat was sleeping by the window\./.test(out), out);
      const last = fake[fake.length - 1];
      const body = last && last.body;
      result.check('DeepL was sent the passage with the key, source and target', Boolean(body) && last.authorized
        && Array.isArray(body.text) && body.text[0].includes(SENTENCE) && body.source_lang === 'JA' && /^EN/.test(body.target_lang), last);
      result.check('DeepL was sent the formality and the context', Boolean(body) && body.formality === 'prefer_more' && body.context === CONTEXT, body);
      result.check('the formal rendering is what is shown', Boolean(out) && /\(formal\)/.test(out), out);
      const by = await ev(`__e2e.text('.xlate2-source')`);
      result.check('the result says DeepL translated it', /DeepL/.test(by), by);
      await ev(`(() => { const o = document.querySelector('.xlate2-source'); if (o) o.scrollIntoView({ block: 'center' }); return true; })()`);
      await ctx.shot('deepl-result');

      // ---- 3. Compare engines ----------------------------------------------------------------
      // A second passage, so DeepL is really asked again rather than answered from the cache.
      const sentBefore = fake.length;
      await ev(`__e2e.fill(document.querySelector('.tr-textarea, .aero-translate-textarea'), ${JSON.stringify(SECOND)})`);
      await ev(`__e2e.click(document.querySelector('.xlate2-compare-toggle'))`);
      const panel = await poll(ctx, `!!document.querySelector('.xlate2-compare')`, 5000);
      result.check('"Compare engines" opens the comparison', panel);
      const offered = await ev(`[...document.querySelectorAll('.xlate2-compare-engine')].filter((l) => { const i = l.querySelector('input'); return i && i.checked && !i.disabled; }).map((l) => l.getAttribute('data-provider'))`);
      result.check('DeepL is offered for comparison, and no cloud engine that was not allowed', Array.isArray(offered) && offered.includes('deepl')
        && offered.every((id) => id === 'deepl' || id === 'local' || id === 'local-large'), offered);
      if (!(status && status.modelFound)) {
        const local = await ev(`(() => { const l = document.querySelector('.xlate2-compare-engine[data-provider="local"]'); return l ? { disabled: l.querySelector('input').disabled, text: l.innerText.trim() } : null; })()`);
        result.check('the missing offline model is listed, unticked, with the reason', Boolean(local) && local.disabled && /not installed/i.test(local.text), local);
      }
      await ev(`__e2e.clickText('.xlate2-compare-actions button', 'Compare')`);
      const cells = await poll(ctx, `(() => { const c = [...document.querySelectorAll('.xlate2-compare-cell')]; return c.length && c.every((x) => !x.classList.contains('is-busy')) ? Object.fromEntries(c.map((x) => [x.getAttribute('data-provider'), { status: [...x.classList].find((k) => k.startsWith('is-')), text: x.innerText.replace(/\\s+/g, ' ').trim() }])) : null; })()`, 60000);
      result.check('every compared engine finishes, side by side', Boolean(cells) && Object.keys(cells).length === offered.length, cells);
      result.check('DeepL\'s column holds its translation of the new passage', Boolean(cells && cells.deepl) && cells.deepl.status === 'is-done' && /It is raining today/.test(cells.deepl.text), cells && cells.deepl);
      if (status && status.modelFound) {
        result.check('the offline column holds the offline translation', Boolean(cells && cells.local) && cells.local.status === 'is-done', cells && cells.local);
      }
      result.check('the comparison sent the passage to DeepL once more', fake.length === sentBefore + 1, { before: sentBefore, after: fake.length });
      await ev(`(() => { const g = document.querySelector('.xlate2-compare'); if (g) g.scrollIntoView({ block: 'start' }); return true; })()`);
      await ctx.sleep(400);
      await ctx.shot('compare');
    } finally {
      // Back as it was: offline for the pair, no consent, no key, the options and the fallback restored.
      await ev(`window.api.translateSetPairProvider('ja', 'en', 'local')`, { await: true }).catch(() => undefined);
      await ev(`window.api.translateSetProviderConsent('deepl', false)`, { await: true }).catch(() => undefined);
      await ev(`window.api.clearCredential('deepl')`, { await: true }).catch(() => undefined);
      await ev(`window.api.translateSetDeeplOptions(${JSON.stringify(deeplBefore || { formality: 'default', context: '' })})`, { await: true }).catch(() => undefined);
      await ev(`window.api.translateSetFallback(${hadFallback ? 'true' : 'false'})`, { await: true }).catch(() => undefined);
    }
    const restored = await ev(`window.api.translateProviders()`, { await: true });
    const deeplRow = restored && restored.providers ? restored.providers.find((p) => p.id === 'deepl') : null;
    result.check('the fake key, the consent and the pair\'s engine are removed again', Boolean(deeplRow) && !deeplRow.ready && !deeplRow.consented
      && restored.settings.pairs['ja>en'] !== 'deepl', { deepl: deeplRow, pairs: restored && restored.settings.pairs });
  },
};
