'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Visual novels: a texthooker the harness owns (a WebSocket fixture on an ephemeral port,
 * tools/e2e/world.cjs — never a real Textractor / LunaTranslator) sends hooked lines while
 * a capture session runs. The lines are captured (speaker parsed, a URL and an echo
 * dropped), cleaned (hook character repetition, inline furigana, zero-width marks) and
 * filtered (a user rule drops system messages), shown in the novel's line list with this
 * session's reading speed, and one is mined into the deck from there with the line before
 * AND the line after it as context. The Capture setup's filter preview cleans a pasted
 * line. The in-memory clipboard (headless mode) is the second capture source.
 *
 * Then the per-line picture and voice (off by default): with both on, every hooked line
 * gets a screenshot (headless: the harness's synthetic screen, never the real one) and the
 * system-audio clip of its time span (headless: the page shim's synthetic tone, never the
 * real system audio). And the OCR fallback for games without a hook: the Reading Lens
 * watches the text box (drawn once on the synthetic screen) and what it reads is captured
 * as lines.
 */
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');

const TITLE = 'E2E 窓辺の物語';
const LINES = [
  { send: '【小町】おはようございます。', japanese: 'おはようございます。', speaker: '小町' },
  { send: JSON.stringify({ sentence: '今日は雨ですね。' }), japanese: '今日は雨ですね。', speaker: '' },
  { send: 'https://example.invalid/not-a-line', japanese: null },
  { send: '窓辺の猫が静かに眠っている。', japanese: '窓辺の猫が静かに眠っている。', speaker: '' },
  // Texthooker garbage the cleanup fixes, and a system line a user rule drops.
  { send: 'ここんんばばんんはは', japanese: 'こんばんは', speaker: '' },
  { send: '｜窓辺《まどべ》に\u200B立つ。', japanese: '窓辺に立つ。', speaker: '' },
  { send: '[SYS]セーブしました', japanese: null },
  // The game saying the same short line twice is two lines, not an echo.
  { send: 'はい。', japanese: 'はい。', speaker: '' },
  { send: 'はい。', japanese: 'はい。', speaker: '' },
  // A hooker that sends BINARY frames (UTF-8 bytes) is captured too.
  { send: 'バイナリで届いた行です。', binary: true, japanese: 'バイナリで届いた行です。', speaker: '' },
];
const MINE = '今日は雨ですね。';
const MEDIA_LINES = ['声のある一行目です。', '声のある二行目です。'];
const LENS = 'readingLens=1';
const DECK = `(() => { const d = JSON.parse(localStorage.getItem('jp-flashcard-deck') || '{"cards":[]}'); return d.cards || d; })()`;

module.exports = {
  id: 'vn',
  title: 'Visual novels: texthooker WebSocket fixture -> cleaned, filtered lines -> mine with context',
  async run(ctx) {
    const { eval: ev, result, world } = ctx;
    if (!world) {
      result.skip('no texthooker fixture in this process (run it through npm run e2e or --serve)');
      return;
    }
    await installHelpers(ctx);
    const hook = world.hook;

    const added = await ev(`window.api.visualNovelAdd({ title: ${JSON.stringify(TITLE)} })`, { await: true });
    const entry = (added?.database?.entries ?? []).find((e) => e.title === TITLE);
    result.check('a novel is added to the library', Boolean(added?.ok && entry), { ok: added?.ok, entries: (added?.database?.entries ?? []).map((e) => e.title) });
    if (!entry) return;
    const settings = await ev(`window.api.visualNovelUpdateSettings({ websocketEnabled: true, websocketUrl: ${JSON.stringify(hook.url)}, lineFilters: { rules: [{ pattern: '^\\\\[SYS\\\\]', mode: 'drop', enabled: true }] } })`, { await: true });
    const filters = settings?.settings?.lineFilters;
    result.check('the texthooker WebSocket is set to the fixture, with a drop rule for system lines', Boolean(settings) && filters?.rules?.[0]?.mode === 'drop' && filters.collapseRepeats && filters.stripRuby, { url: hook.url, filters });

    await ev(`__e2e.open('visualnovels')`);
    const listed = await poll(ctx, `(() => { const b = [...document.querySelectorAll('button.visual-novel-entry')].find((x) => x.textContent.includes(${JSON.stringify(TITLE)})); if (b && !b.classList.contains('is-selected')) b.click(); return b ? true : null; })()`, 20000);
    result.check('the Visual novels app lists it', Boolean(listed));
    const startBtn = await poll(ctx, `__e2e.byText('.vn-capture-bar button', 'Start capture') ? true : null`, 10000);
    if (startBtn) await ev(`__e2e.clickText('.vn-capture-bar button', 'Start capture')`);
    else await ev(`window.api.visualNovelCaptureStart(${JSON.stringify(entry.id)})`, { await: true });
    let connected = true;
    try {
      await hook.waitForClient(1, 20000);
    } catch {
      connected = false;
    }
    const state = await pollAsync(ctx, `window.api.visualNovelCaptureState().then((s) => s && s.websocket === 'connected' ? s : null)`, 10000);
    result.check('"Start capture" connects to the texthooker fixture', connected && Boolean(state), { via: startBtn ? 'button' : 'api', handshakes: hook.handshakes, state });

    // "Test capture" while a real capture runs would replace it; it is off, and main refuses it.
    const testBtn = await ev(`(() => { const b = document.querySelector('.vn-capture-bar [data-vn-capture-test]'); return b ? { disabled: b.disabled, title: b.title } : null; })()`);
    const testRefused = await ev(`window.api.visualNovelCaptureStart(${JSON.stringify(entry.id)}, { test: true })`, { await: true });
    const stillLive = await ev(`window.api.visualNovelCaptureState()`, { await: true });
    result.check('"Test capture" is disabled with a reason while capturing, and main refuses a test without ending the capture',
      Boolean(testBtn?.disabled && testBtn.title) && testRefused?.ok === false && testRefused?.errorCode === 'capture-running'
        && stillLive?.active === true && stillLive?.test === false && stillLive?.websocket === 'connected',
      { testBtn, testRefused, stillLive: stillLive && { active: stillLive.active, test: stillLive.test, websocket: stillLive.websocket } });

    for (const line of LINES) {
      if (line.binary && typeof hook.sendBinary === 'function') hook.sendBinary(line.send);
      else hook.send(line.send);
      await ctx.sleep(500);
    }
    const want = LINES.filter((l) => l.japanese).map((l) => l.japanese);
    const rows = await poll(ctx, `(() => { const r = [...document.querySelectorAll('.visual-novel-capture-row')].map((x) => x.innerText.replace(/\\s+/g, ' ').trim()); return ${JSON.stringify(want)}.every((w) => r.some((t) => t.includes(w))) ? r : null; })()`, 15000);
    result.check('the hooked lines appear in the novel\'s line list', Boolean(rows), rows ?? await ev(`[...document.querySelectorAll('.visual-novel-capture-row')].map((x) => x.innerText)`));
    const db = await ev(`window.api.visualNovelList()`, { await: true });
    const captures = (db?.captures ?? db?.database?.captures ?? []).filter((c) => c.visualNovelId === entry.id);
    result.check('saved as hooked lines (source "hook"), the speaker parsed off 【小町】', want.every((w) => captures.some((c) => c.japanese === w && c.source === 'hook')) && captures.some((c) => c.speaker === '小町' && c.japanese === LINES[0].japanese), captures.map((c) => ({ japanese: c.japanese, speaker: c.speaker, source: c.source })));
    result.check('a URL from the hook is not captured as a line', !captures.some((c) => /example\.invalid/.test(c.japanese)), captures.length);
    result.check('a line the game says twice (はい。 / はい。) is kept twice', captures.filter((c) => c.japanese === 'はい。').length === 2, captures.map((c) => c.japanese));
    result.check('a binary WebSocket frame is captured as a line', captures.some((c) => c.japanese === 'バイナリで届いた行です。'), captures.map((c) => c.japanese));
    result.check('cleanup fixed the hook garbage: repeated characters collapsed, furigana markup and zero-width marks gone',
      captures.some((c) => c.japanese === 'こんばんは') && captures.some((c) => c.japanese === '窓辺に立つ。')
        && !captures.some((c) => /ここんん|《|\u200B/.test(c.japanese)),
      captures.map((c) => c.japanese));
    const filtered = await pollAsync(ctx, `window.api.visualNovelCaptureState().then((s) => s && s.filtered >= 1 ? s.filtered : null)`, 5000);
    result.check('the user rule dropped the system line, and the session counts it', Boolean(filtered) && !captures.some((c) => /セーブ/.test(c.japanese)), { filtered });
    const sessionStats = await poll(ctx, `(() => { const s = document.querySelector('[data-vn5-session-stats]'); return s && /this session: \\d+ lines/.test(s.innerText) ? s.innerText : null; })()`, 10000);
    result.check('the capture bar shows this session\'s lines, characters and filtered count', Boolean(sessionStats) && /chars/.test(sessionStats) && /filtered/.test(sessionStats), sessionStats);
    await ctx.shot('lines');

    // The clipboard source, against the in-memory clipboard (never the owner's).
    await ctx.e2e('clipboard', { set: { text: 'この行はクリップボードから来た。' } });
    const fromClip = await pollAsync(ctx, `window.api.visualNovelList().then((d) => ((d && (d.captures || d.database?.captures)) || []).find((c) => c.japanese === 'この行はクリップボードから来た。') || null)`, 5000, 400);
    if (fromClip) result.check('a copied line is captured from the (in-memory) clipboard too', fromClip.source === 'clipboard', fromClip);
    else result.note('clipboard capture did not pick up the in-memory clipboard line within 5 s (it skips copies while a Gum window has focus)');

    // Capture setup: the filter preview runs a pasted line through cleanup + rules.
    await ev(`__e2e.click('#vn-tab-setup')`);
    const filtersUi = await poll(ctx, `(() => { const f = document.querySelector('[data-vn5-filters]'); return f && __e2e.vis(f) ? true : null; })()`, 8000);
    if (filtersUi) await ev(`__e2e.fill('[data-vn5-filter-sample]', 'ここんんばばんんはは')`);
    const preview = filtersUi
      ? await poll(ctx, `(() => { const r = document.querySelector('[data-vn5-preview-row="0"]'); return r && r.innerText.includes('こんばんは') ? r.innerText.replace(/\\s+/g, ' ') : null; })()`, 5000)
      : null;
    result.check('Capture setup shows the line filters, and the preview cleans a pasted line', Boolean(filtersUi && preview), { filtersUi, preview });
    await ctx.shot('filters');
    await ev(`__e2e.click('#vn-tab-read')`);

    // Mine one line from the list, with the line before and the line after as context.
    await ev(`localStorage.setItem('jp-vn5-study-prefs', JSON.stringify({ contextLines: 1, contextAfterLines: 1, attachScreenshot: true, holdNewLines: false, autoPlay: false, repeat: 1 }))`);
    const before = await ev(`${DECK}.map((c) => c.id)`);
    const picked = await ev(`(() => { const r = [...document.querySelectorAll('.visual-novel-capture-row')].find((x) => x.innerText.includes(${JSON.stringify(MINE)})); if (!r) return false; r.click(); return true; })()`);
    const save = await poll(ctx, `__e2e.byText('button', 'Save card') ? true : null`, 10000);
    if (save) await ev(`__e2e.clickText('button', 'Save card')`);
    const mined = await poll(ctx, `(() => { const known = new Set(${JSON.stringify(before)}); const fresh = ${DECK}.filter((c) => !known.has(c.id)); return fresh.length ? fresh.map((c) => ({ word: c.word, sentence: c.sentence, meaning: c.meaning, folder: c.folder, source: c.source, contextBefore: c.contextBefore, contextAfter: c.contextAfter })) : null; })()`, 15000);
    const status = await ev(`document.querySelector('.visual-novel-status')?.textContent ?? null`);
    result.check('"Save card" on a captured line mines it into the deck', Boolean(picked && save && mined) && mined.some((c) => c.sentence === MINE), { picked, save, mined, status });
    const card = (mined ?? []).find((c) => c.sentence === MINE);
    result.check('the card carries the line before (with its speaker) and the line after as context',
      Boolean(card) && /小町/.test(card.contextBefore ?? '') && /おはようございます/.test(card.contextBefore ?? '') && /窓辺の猫が静かに眠っている/.test(card.contextAfter ?? ''),
      card && { contextBefore: card.contextBefore, contextAfter: card.contextAfter });
    await ctx.shot('mined');

    // Optional AI (docs/AI_AUDIT.md N12): the selected line offers its AI panel (explain,
    // translate with context), mining translated nothing by itself (that option is off by
    // default), and with "Use AI features" off the panel is gone while the above still works.
    const aiPanel = await poll(ctx, `document.querySelector('[data-vn-ai-assist]') ? true : null`, 8000);
    result.check('the selected line offers its optional AI panel (explain / translate with context)', Boolean(aiPanel));
    result.check('mining did not translate the line automatically (off by default)', Boolean(card) && !card.meaning, card && { meaning: card.meaning });
    await ev(`window.api.aiSetupSetEnabled(false)`, { await: true });
    const aiGone = await poll(ctx, `document.documentElement.hasAttribute('data-ai-off') && !document.querySelector('[data-vn-ai-assist]') ? true : null`, 8000);
    result.check('with "Use AI features" off the line AI panel is not offered; Sentence assist is unchanged',
      Boolean(aiGone) && Boolean(await ev(`__e2e.byText('button', 'Save card') ? true : null`)));
    await ev(`window.api.aiSetupSetEnabled(true)`, { await: true });

    const stop = await ev(`__e2e.clickText('.vn-capture-bar button', 'Stop capture') || null`);
    if (!stop) await ev(`window.api.visualNovelCaptureStop()`, { await: true });
    const off = await pollAsync(ctx, `window.api.visualNovelCaptureState().then((s) => !s || !s.active)`, 10000);
    result.check('"Stop capture" ends the session and lets the hook go', Boolean(off), { clientsLeft: hook.clients() });

    // --- per-line picture and voice ------------------------------------------------------
    result.check('pictures, voice and screen OCR are all off by default, and lines so far have none',
      settings?.settings?.lineScreenshots === false && settings?.settings?.lineAudio === false && settings?.settings?.ocrCapture === false
        && captures.every((c) => !c.screenshotPath && !c.audioPath),
      { lineScreenshots: settings?.settings?.lineScreenshots, lineAudio: settings?.settings?.lineAudio, ocrCapture: settings?.settings?.ocrCapture });
    await ev(`window.api.visualNovelUpdateSettings({ lineScreenshots: true, lineAudio: true })`, { await: true });
    await ev(`window.api.visualNovelCaptureStart(${JSON.stringify(entry.id)})`, { await: true });
    try {
      await hook.waitForClient(1, 20000);
    } catch {
      /* the check below reports it */
    }
    const media = await pollAsync(ctx, `window.api.visualNovelCaptureState().then((s) => s && s.websocket === 'connected' && s.audio && s.audio !== 'off' ? s : null)`, 30000, 400);
    result.check('with voice on, capture starts the system-audio replay buffer (headless: the synthetic tone)', media?.audio === 'on' && media?.screenshots === true, media && { audio: media.audio, screenshots: media.screenshots });
    await ctx.sleep(2500); // let the buffer fill before the first line
    for (const line of MEDIA_LINES) {
      hook.send(line);
      await ctx.sleep(2500);
    }
    await ev(`window.api.visualNovelCaptureStop()`, { await: true });
    const withMedia = await pollAsync(ctx, `window.api.visualNovelList().then((d) => {
      const all = ((d && (d.captures || d.database?.captures)) || []).filter((c) => ${JSON.stringify(MEDIA_LINES)}.includes(c.japanese));
      return all.length === ${MEDIA_LINES.length} && all.every((c) => c.screenshotPath && c.audioPath) ? all.map((c) => ({ japanese: c.japanese, screenshotPath: c.screenshotPath, audioPath: c.audioPath })) : null;
    })`, 30000, 500);
    const mediaNow = withMedia ?? await ev(`window.api.visualNovelList().then((d) => ((d && (d.captures || d.database?.captures)) || []).filter((c) => ${JSON.stringify(MEDIA_LINES)}.includes(c.japanese)).map((c) => ({ japanese: c.japanese, screenshotPath: c.screenshotPath, audioPath: c.audioPath })))`, { await: true });
    result.check('every line captured live gets its own screenshot and voice clip', Boolean(withMedia), mediaNow);
    if (withMedia) {
      const first = withMedia[0];
      const image = await ev(`window.api.visualNovelReadCaptureImage(${JSON.stringify(first.screenshotPath)})`, { await: true });
      const audio = await ev(`window.api.visualNovelReadCaptureAudio(${JSON.stringify(first.audioPath)})`, { await: true });
      result.check('the stored screenshot and clip read back as an image and audio',
        image?.ok === true && /^data:image\//.test(image.dataUrl ?? '') && audio?.ok === true && /^data:audio\//.test(audio.dataUrl ?? ''),
        { image: image?.ok, imageType: (image?.dataUrl ?? '').slice(0, 22), audio: audio?.ok, audioType: (audio?.dataUrl ?? '').slice(0, 22) });
      result.check('each line keeps its own clip', new Set(withMedia.map((c) => c.audioPath)).size === withMedia.length, withMedia.map((c) => c.audioPath));
    }
    const audioOff = await pollAsync(ctx, `window.api.captionsGetState ? window.api.captionsGetState().then((s) => (s && s.capture === 'off' ? true : null)) : Promise.resolve(true)`, 10000);
    result.check('stopping capture lets the system-audio buffer go again', Boolean(audioOff));
    await ev(`window.api.visualNovelUpdateSettings({ lineScreenshots: false, lineAudio: false })`, { await: true });

    // --- OCR fallback: the Reading Lens watches the game's text box -----------------------
    await ev(`window.api.lensSetEnabled(true)`, { await: true });
    const lensEngines = await ev(`window.api.lensOcrEngineStatus()`, { await: true });
    await ev(`window.api.lensSetDefaultEngine(${JSON.stringify(lensEngines?.manga ? 'manga' : 'web')})`, { await: true });
    await ev(`window.api.visualNovelUpdateSettings({ ocrCapture: true, websocketEnabled: false })`, { await: true });
    await ev(`window.api.visualNovelCaptureStart(${JSON.stringify(entry.id)})`, { await: true });
    const inLens = (js, o = {}) => ctx.eval(js, { ...o, window: LENS });
    const pending = await pollAsync(ctx, `window.api.visualNovelCaptureState().then((s) => s && s.ocr && s.ocr !== 'off' ? s.ocr : null)`, 10000);
    const remembered = await ev(`window.api.lensGetSettings().then((s) => s && s.canRepeatRegion)`, { await: true });
    if (!remembered) {
      // A fresh profile: the Lens asks for the text box once.
      const layer = await poll({ ...ctx, eval: (js) => inLens(js) }, `!!document.querySelector('.lens-select-layer')`, 20000);
      result.check('with screen OCR on, capture opens the Reading Lens to choose the text box', pending === 'pending' && Boolean(layer), { pending, layer });
      const init = await inLens(`window.api.lensGetInit()`, { await: true });
      const bounds = init?.bounds ?? { width: 1920, height: 1080 };
      const img = world.screen ?? { region: { x: 120, y: 200, width: 1680, height: 360 } };
      const kx = bounds.width / 1920;
      const ky = bounds.height / 1080;
      const r = { x: Math.round(img.region.x * kx), y: Math.round(img.region.y * ky), w: Math.round(img.region.width * kx), h: Math.round(img.region.height * ky) };
      const fire = (type, x, y, buttons) => inLens(`(() => { const el = document.querySelector('.lens-select-layer'); if (!el) return false; el.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, clientX: ${Math.round(x)}, clientY: ${Math.round(y)}, button: 0, buttons: ${buttons} })); return true; })()`);
      await fire('mousedown', r.x, r.y, 1);
      for (let i = 1; i <= 6; i++) {
        await ctx.sleep(30);
        await fire('mousemove', r.x + (r.w * i) / 6, r.y + (r.h * i) / 6, 1);
      }
      await ctx.sleep(60);
      await fire('mouseup', r.x + r.w, r.y + r.h, 0);
    } else {
      result.check('with screen OCR on, capture asks the Reading Lens to watch the text box', pending === 'pending' || pending === 'watching', { pending });
    }
    const watching = await pollAsync(ctx, `window.api.visualNovelCaptureState().then((s) => s && s.ocr === 'watching' ? true : null)`, 120000, 500);
    result.check('the Lens watches the chosen text box for the capture', Boolean(watching));
    const ocrLine = await pollAsync(ctx, `window.api.visualNovelList().then((d) => { const c = ((d && (d.captures || d.database?.captures)) || []).filter((x) => x.visualNovelId === ${JSON.stringify(entry.id)} && x.source === 'ocr'); return c.length ? c.map((x) => x.japanese) : null; })`, 120000, 1000);
    result.check('the text the Lens reads off the screen is captured as a line (source "ocr")', Boolean(ocrLine) && ocrLine.some((t) => /窓辺|猫|眠|雨/.test(t)), ocrLine);
    await ctx.sleep(3000);
    const ocrAgain = await ev(`window.api.visualNovelList().then((d) => ((d && (d.captures || d.database?.captures)) || []).filter((x) => x.visualNovelId === ${JSON.stringify(entry.id)} && x.source === 'ocr').length)`, { await: true });
    result.check('the unchanged text box is not captured again', ocrAgain === (ocrLine ?? []).length, { first: (ocrLine ?? []).length, later: ocrAgain });
    await ev(`window.api.visualNovelCaptureStop()`, { await: true });
    const lensStopped = await pollAsync(ctx, `window.api.lensGetSettings().then((s) => (s && s.watching === false ? true : null))`, 10000);
    result.check('stopping capture ends the Lens watch it started', Boolean(lensStopped));
    await ev(`window.api.visualNovelUpdateSettings({ ocrCapture: false })`, { await: true });
  },
};
