'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Reading Lens on a synthetic screen. Headless mode's `desktopCapturer` answers with the
 * harness's picture (tools/e2e/world.cjs: Japanese text on paper, GUM_E2E_SCREEN_IMAGE),
 * never the real screen, and the lens overlay window stays off the desktop.
 *
 *  - region: the tray's "Reading Lens: select a region" opens the overlay; a region is
 *    dragged over the text; the capture + OCR runs on the synthetic screen and the words
 *    are read and one is looked up. With an OCR model installed that model reads; without
 *    one (a fresh profile has none) the `web` engine is chosen, and the app's bundled
 *    offline recognizer (Tesseract's Japanese data) reads the capture while the model is
 *    only offered — a headless run never downloads it (screenOcr.ts).
 *  - watch region: "Watch" on the read keeps the region; the synthetic screen is swapped
 *    for a picture with different text, and the Lens reads the new text by itself, beside
 *    the region; "Stop watching" ends it.
 *  - clipboard: "Reading Lens: read the clipboard" reads the (in-memory) clipboard into a
 *    passage, a word is clicked and looked up in the built-in dictionary.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ensureDictionaryReady, installHelpers, poll, pollAsync } = require('./_lib.cjs');

const LENS = 'readingLens=1';
const CLIP_TEXT = '窓辺の猫は静かに眠っていた。';
/** What the screen shows after it "changes" under a watched region. */
const WATCH_LINES = ['図書館で古い地図を見つけた。', '明日は晴れるでしょう。'];

/** The synthetic screen's layout (world.cjs screenImage) with other lines of text. */
async function renderScreen(dir, lines, name) {
  const world = require('../world.cjs');
  const file = path.join(dir, `${name}.png`);
  const draws = lines.map((line, i) => {
    const t = path.join(dir, `${name}-line-${i}.txt`);
    fs.writeFileSync(t, line, 'utf8');
    return `drawtext=fontfile='${world.filterPath(world.FONT)}':textfile='${world.filterPath(t)}':x=160:y=${240 + i * 160}:fontsize=88:fontcolor=black`;
  });
  draws.push('drawbox=x=120:y=200:w=1680:h=360:color=gray@0.6:t=4');
  await world.ffmpeg(['-f', 'lavfi', '-i', 'color=c=0xf4f1e8:s=1920x1080', '-frames:v', '1', '-vf', draws.join(','), file]);
  return file;
}

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
    const modelReady = Boolean(engines?.manga || engines?.web);
    // No model: `web`, whose missing pack is read by the bundled offline recognizer.
    const engine = engines?.manga ? 'manga' : 'web';
    await ev(`window.api.lensSetEnabled(true)`, { await: true });
    await ev(`window.api.lensSetDefaultEngine(${JSON.stringify(engine)})`, { await: true });
    result.note(`OCR engines: ${JSON.stringify(engines)} -> using ${engine}${modelReady ? '' : ' (no model installed: the bundled offline recognizer reads)'}`);

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
      if (words.length) return { state: 'reading', words, basic: !!document.querySelector('.lens-basic-badge') };
      const msg = document.querySelector('.lens-message-title, .lens-message')?.textContent?.trim();
      if (msg) return { state: 'message', msg };
      return null;
    })()`, 120000, 300);
    const after = (await ctx.e2e('status')).isolation?.capture ?? {};
    result.check('the dragged region was captured from the synthetic screen (desktopCapturer stub, never the real screen)', (after.getSources ?? 0) > before && /synthetic-screen/.test(after.screenImage ?? '') && (after.displayMediaRefused ?? 0) === 0, { getSources: after.getSources, before, image: after.screenImage });
    try {
      await ctx.shot('region', { window: LENS });
    } catch (err) {
      result.note(`no lens screenshot: ${err.message}`);
    }
    const text = (outcome?.words ?? []).join('');
    result.check(`OCR reads the synthetic screen's text (${modelReady ? engine : 'bundled offline recognizer'})`, outcome?.state === 'reading' && /窓辺|猫|眠/.test(text), outcome);
    if (!modelReady) {
      result.check('without a model the read is marked as the built-in recognizer\'s', outcome?.basic === true, outcome);
      const downloads = await ev(`window.api.lensOcrEngineStatus()`, { await: true });
      result.check('a headless run starts no model download', !downloads?.web && !downloads?.manga, downloads);
    }
    if (outcome?.state === 'reading') {
      await inLens(`(() => { const w = [...document.querySelectorAll('.lens-word')].find((x) => /猫|窓辺/.test(x.textContent)); w?.click(); return !!w; })()`);
      const pop = await poll({ ...ctx, eval: (js) => inLens(js) }, `(() => { const g = document.querySelector('.lens-reader .lens-reader-gloss')?.textContent; return g ? { q: document.querySelector('.lens-reader-q')?.textContent, gloss: g.slice(0, 120) } : null; })()`, 20000);
      result.check('clicking an OCR\'d word looks it up', Boolean(pop), pop);
      await inLens(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`).catch(() => null);
    }

    // --- watch region: the same region, re-read by itself when the screen changes -------
    if (outcome?.state === 'reading') {
      // The popup is gone (Escape closed the lens): reopen on the remembered region.
      await ev(`window.api.lensOpen('repeat')`, { await: true });
      const reread = await poll({ ...ctx, eval: (js) => inLens(js) }, `(() => document.querySelector('.lens-watch-start') ? true : null)()`, 120000, 300);
      result.check('"repeat" reads the remembered region again and offers Watch', Boolean(reread));
      const clicked = await inLens(`(() => { const b = document.querySelector('.lens-watch-start'); b?.click(); return !!b; })()`);
      const watching = await poll({ ...ctx, eval: (js) => inLens(js) }, `(() => document.querySelector('.lens-watch-panel') ? true : null)()`, 10000);
      const status = await ev(`window.api.lensGetSettings()`, { await: true });
      result.check('"Watch" starts watching the region (panel beside it, main sampling)', clicked === true && Boolean(watching) && status?.watching === true, { clicked, watching, status: status?.watching });
      const original = world?.screen?.file;
      let changed = null;
      try {
        const next = await renderScreen(ctx.mediaDir, WATCH_LINES, 'watch-screen');
        await ctx.e2e('setScreenImage', { path: next });
        changed = await poll({ ...ctx, eval: (js) => inLens(js) }, `(() => { const t = document.querySelector('.lens-watch-text')?.textContent || ''; return /図書館|地図|明日|晴/.test(t) ? t : null; })()`, 120000, 400);
        result.check('the watched region is read again by itself when its text changes', Boolean(changed), changed);
      } catch (err) {
        result.check('the watched region is read again by itself when its text changes', false, err.message);
      } finally {
        if (original) await ctx.e2e('setScreenImage', { path: original }).catch(() => null);
      }
      try {
        await ctx.shot('watch', { window: LENS });
      } catch (err) {
        result.note(`no watch screenshot: ${err.message}`);
      }
      await inLens(`(() => { const b = document.querySelector('.lens-watch-stop'); b?.click(); return !!b; })()`);
      const stopped = await pollAsync(ctx, `window.api.lensGetSettings().then((s) => (s && s.watching === false ? true : null))`, 10000);
      result.check('"Stop watching" ends the watch', Boolean(stopped));
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
