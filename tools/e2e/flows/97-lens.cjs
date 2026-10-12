'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Reading Lens on a synthetic screen. Headless mode's `desktopCapturer` answers with the
 * harness's picture (tools/e2e/world.cjs: Japanese text on paper, GUM_E2E_SCREEN_IMAGE),
 * never the real screen, and the lens overlay window stays off the desktop.
 *
 *  - region: the tray's "Reading Lens: select a region" opens the overlay; a region is
 *    dragged over the text; the capture + OCR runs on the synthetic screen. With an OCR
 *    model installed the words are read and one is looked up; without one (a fresh
 *    profile has none) the OCR assertion is skipped and the overlay's "not installed"
 *    answer is checked instead. The manga engine is chosen so a missing model is never
 *    auto-downloaded during the run.
 *  - clipboard: "Reading Lens: read the clipboard" reads the (in-memory) clipboard into a
 *    passage, a word is clicked and looked up in the built-in dictionary.
 */
const { ensureDictionaryReady, installHelpers, poll, pollAsync } = require('./_lib.cjs');

const LENS = 'readingLens=1';
const CLIP_TEXT = '窓辺の猫は静かに眠っていた。';

module.exports = {
  id: 'lens',
  title: 'Reading Lens: synthetic screen -> region -> OCR -> lookup',
  async run(ctx) {
    const { eval: ev, result, world } = ctx;
    await installHelpers(ctx);
    const inLens = (js, o = {}) => ctx.eval(js, { ...o, window: LENS });
    // The lookups below need the built-in dictionary; in a fresh profile it may still be
    // loading, and this flow must not depend on the `dictionary` flow having run first.
    const dict = await ensureDictionaryReady(ctx);
    result.check('the built-in dictionary is ready for lookups', dict.ready, dict);

    const engines = await ev(`window.api.lensOcrEngineStatus()`, { await: true });
    const ocrReady = Boolean(engines?.manga || engines?.web);
    const engine = engines?.manga ? 'manga' : engines?.web ? 'web' : 'manga';
    await ev(`window.api.lensSetEnabled(true)`, { await: true });
    await ev(`window.api.lensSetDefaultEngine(${JSON.stringify(engine)})`, { await: true });
    result.note(`OCR engines: ${JSON.stringify(engines)} -> using ${engine}${ocrReady ? '' : ' (not installed: the OCR assertion is skipped, the overlay flow is verified)'}`);

    // --- region mode, from the tray -------------------------------------------------------
    const before = (await ctx.e2e('status')).isolation?.capture?.getSources ?? 0;
    const tray = await ctx.e2e('clickTray', { label: 'Companion > Reading Lens: select a region' });
    result.check('the tray row "Reading Lens: select a region" opens the lens', tray.ok === true, tray.error ?? '');
    const layer = await poll({ ...ctx, eval: (js) => inLens(js) }, `!!document.querySelector('.lens-select-layer')`, 20000);
    result.check('the lens overlay is in region-select mode (window off the desktop)', Boolean(layer));
    if (!layer) return;
    const init = await inLens(`window.api.lensGetInit()`, { await: true });
    const bounds = init?.bounds ?? { width: 1920, height: 1080 };
    const img = world?.screen ?? { region: { x: 120, y: 200, width: 1680, height: 360 } };
    const k = bounds.width / 1920;
    const r = { x: Math.round(img.region.x * k), y: Math.round(img.region.y * (bounds.height / 1080)), w: Math.round(img.region.width * k), h: Math.round(img.region.height * (bounds.height / 1080)) };
    // A user's drag: down, a few moves, up — each its own task, as real input arrives
    // (the overlay reads the rectangle React committed from the moves).
    const fire = (type, x, y, buttons) => inLens(`(() => { const el = document.querySelector('.lens-select-layer'); if (!el) return false; el.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, clientX: ${Math.round(x)}, clientY: ${Math.round(y)}, button: 0, buttons: ${buttons} })); return true; })()`);
    await fire('mousedown', r.x, r.y, 1);
    for (let i = 1; i <= 6; i++) {
      await ctx.sleep(30);
      await fire('mousemove', r.x + (r.w * i) / 6, r.y + (r.h * i) / 6, 1);
    }
    await ctx.sleep(60);
    const dragged = await inLens(`(() => { const s = document.querySelector('.lens-select-rect'); return s ? { w: s.offsetWidth, h: s.offsetHeight } : null; })()`);
    await fire('mouseup', r.x + r.w, r.y + r.h, 0);
    result.check('the drag draws the selection rectangle over the text', Boolean(dragged && dragged.w > 100 && dragged.h > 40), { dragged, region: r, display: bounds });
    const outcome = await poll({ ...ctx, eval: (js) => inLens(js) }, `(() => {
      const words = [...document.querySelectorAll('.lens-word')].map((w) => w.textContent);
      if (words.length) return { state: 'reading', words };
      const msg = document.querySelector('.lens-message-title, .lens-message')?.textContent?.trim();
      if (msg) return { state: 'message', msg };
      return null;
    })()`, 60000, 300);
    const after = (await ctx.e2e('status')).isolation?.capture ?? {};
    if (ocrReady) {
      result.check('the dragged region was captured from the synthetic screen (desktopCapturer stub)', (after.getSources ?? 0) > before && /synthetic-screen/.test(after.screenImage ?? ''), { getSources: after.getSources, before, image: after.screenImage });
    } else {
      // Main checks the engine before it captures, so with no model nothing is captured at all.
      result.check('no screen capture happened without a model (and none from the real screen, ever)', (after.getSources ?? 0) === before && (after.displayMediaRefused ?? 0) === 0, { getSources: after.getSources, before });
    }
    try {
      await ctx.shot('region', { window: LENS });
    } catch (err) {
      result.note(`no lens screenshot: ${err.message}`);
    }
    if (ocrReady) {
      const text = (outcome?.words ?? []).join('');
      result.check('OCR reads the synthetic screen\'s text', outcome?.state === 'reading' && /窓辺|猫|眠/.test(text), outcome);
      if (outcome?.state === 'reading') {
        await inLens(`(() => { const w = [...document.querySelectorAll('.lens-word')].find((x) => /猫|窓辺/.test(x.textContent)); w?.click(); return !!w; })()`);
        const pop = await poll({ ...ctx, eval: (js) => inLens(js) }, `(() => { const g = document.querySelector('.lens-reader .lens-reader-gloss')?.textContent; return g ? { q: document.querySelector('.lens-reader-q')?.textContent, gloss: g.slice(0, 120) } : null; })()`, 20000);
        result.check('clicking an OCR\'d word looks it up', Boolean(pop), pop);
      }
    } else {
      result.check('without an OCR model the overlay says so (and starts no download)', outcome?.state === 'message' && /not installed/i.test(outcome.msg), outcome);
      result.note('OCR assertion skipped: no OCR model in a fresh profile');
    }
    await inLens(`window.api.lensClose()`, { await: true }).catch(() => null);

    // --- clipboard mode: the in-memory clipboard, read into a passage, a word looked up ---
    await ctx.e2e('clipboard', { set: { text: CLIP_TEXT } });
    const clipTray = await ctx.e2e('clickTray', { label: 'Companion > Reading Lens: read the clipboard' });
    const passage = await poll({ ...ctx, eval: (js) => inLens(js) }, `(() => { const w = [...document.querySelectorAll('.lens-clipboard-word, .lens-clipboard-text .lens-word')].map((x) => x.textContent); return w.length ? w : null; })()`, 20000);
    result.check('"Reading Lens: read the clipboard" reads the in-memory clipboard into words', clipTray.ok === true && Boolean(passage) && passage.join('').includes('窓辺'), { tray: clipTray.error ?? 'ok', passage });
    if (passage) {
      await inLens(`(() => { const all = [...document.querySelectorAll('.lens-clipboard-word, .lens-clipboard-text .lens-word')]; const w = all.find((x) => x.textContent.includes('猫')) || all[0]; w.click(); return w.textContent; })()`);
      const pop = await poll({ ...ctx, eval: (js) => inLens(js) }, `(() => { const r = document.querySelector('.lens-reader'); if (!r) return null; const g = r.querySelector('.lens-reader-gloss')?.textContent; const none = r.querySelector('.lens-reader-nomatch'); return g || none ? { q: r.querySelector('.lens-reader-q')?.textContent, reading: r.querySelector('.lens-reader-reading')?.textContent, gloss: (g || '').slice(0, 120), nomatch: Boolean(none) } : null; })()`, 20000);
      result.check('clicking a word in the passage looks it up in the dictionary', Boolean(pop && pop.gloss), pop);
      try {
        await ctx.shot('lookup', { window: LENS });
      } catch (err) {
        result.note(`no lookup screenshot: ${err.message}`);
      }
    }
    await inLens(`window.api.lensClose()`, { await: true }).catch(() => null);
    const hist = await pollAsync(ctx, `window.api.lensHistoryList({}).then((h) => (h || []).length ? h.length : null)`, 3000);
    result.note(`lens history entries: ${hist ?? 0}`);
  },
};
