'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * The browser extension against the headless app. The extension cannot run inside the
 * app's own Electron session, so a separate HEADLESS Chrome is started
 * (`--headless=new --remote-debugging-pipe --enable-unsafe-extension-debugging`, its own
 * profile in the run's temp dir — never the owner's Chrome, no window, no debugging port)
 * and the repo's `extension/` is loaded unpacked over CDP (`Extensions.loadUnpacked`)
 * from a temp copy whose default port is the run's private extension-server port, so even
 * its first health ping cannot reach a Gum the owner has running on 18765.
 *
 * Paired with the app's token (written to the extension's storage, as "Pull from Gum"
 * would), a local fixture page with Japanese text is opened; Shift + hover over a word
 * opens the extension's lookup popup (answered by the app's /v1/scan), and "s" saves the
 * word: it is mined into the app's deck (folder "Extension"). Chrome is checked to own
 * no visible window, then closed and every one of its processes killed.
 *
 * Optional AI (the run's fake OpenAI-compatible server, `world: { ai: true }`): the app is
 * pointed at the fake with "Explain in context" allowed; the popup's "Explain in context"
 * is clicked and the fake's answer must come back labelled AI with the sense marked. Then
 * "Use AI features" is turned off: the popup still looks words up, draws no AI button, and
 * "Save word" still mines — and the fake is asked nothing. The AI settings are put back.
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { installHelpers, poll, ensureDictionaryReady, DECK } = require('./_lib.cjs');
const { chromeAvailable, launchHeadlessChrome, chromeProcesses, killChrome, CHROME } = require('../chromeCdp.cjs');

const SCREENS = path.join(os.homedir(), 'Videos', 'Gum Showcase', 'screens');
const PAGE_TEXT = '窓辺の猫は静かに眠っていた。今日は雨ですね。';
const TARGET = '猫';
/** Mined with AI off (a second word, so the deck's duplicate check does not decide the result). */
const OFF_WORD = '雨';

function fixturePage() {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>E2E 読み物</title>
<style>body{font:32px/1.8 "Yu Gothic","MS Gothic",sans-serif;margin:60px;background:#fff;color:#111}</style></head>
<body><h1>E2E fixture page</h1><p id="text">${PAGE_TEXT}</p></body></html>`);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}/reading.html`,
    hits,
    close: () => new Promise((r) => {
      server.closeAllConnections();
      server.close(() => r());
    }),
  })));
}

/** Find the extension's popup host and its (closed) shadow content, piercing with CDP. */
async function popupState(browser, sessionId) {
  const { root } = await browser.send('DOM.getDocument', { depth: -1, pierce: true }, sessionId);
  let host = null;
  const walk = (node) => {
    if (host) return;
    const attrs = node.attributes ?? [];
    // The light-DOM host (`data-gum-host="popup"`); the dialog inside its closed shadow
    // root carries `id="jp-study-popup"` and `.open` while shown.
    if (attrs.includes('data-gum-host') && attrs[attrs.indexOf('data-gum-host') + 1] === 'popup') {
      host = node;
      return;
    }
    for (const c of node.children ?? []) walk(c);
    for (const s of node.shadowRoots ?? []) walk(s);
  };
  walk(root);
  if (!host) return null;
  const shadow = (host.shadowRoots ?? [])[0];
  if (!shadow) return { host: true, html: '' };
  const { outerHTML } = await browser.send('DOM.getOuterHTML', { nodeId: shadow.nodeId }, sessionId).catch(() => ({ outerHTML: '' }));
  const term = /class="rp-term"[^>]*>([^<]*)</.exec(outerHTML)?.[1] ?? null;
  const open = /id="jp-study-popup"[^>]*class="[^"]*\bopen\b/.test(outerHTML) || /class="[^"]*\bopen\b[^"]*"[^>]*id="jp-study-popup"/.test(outerHTML);
  return { host: true, open, term, length: outerHTML.length };
}

/** The popup's closed shadow content as markup ('' when there is none). */
async function popupShadowHtml(browser, sessionId) {
  const { root } = await browser.send('DOM.getDocument', { depth: -1, pierce: true }, sessionId);
  let host = null;
  const walk = (node) => {
    if (host) return;
    const attrs = node.attributes ?? [];
    if (attrs.includes('data-gum-host') && attrs[attrs.indexOf('data-gum-host') + 1] === 'popup') {
      host = node;
      return;
    }
    for (const c of node.children ?? []) walk(c);
    for (const s of node.shadowRoots ?? []) walk(s);
  };
  walk(root);
  const shadow = host && (host.shadowRoots ?? [])[0];
  if (!shadow) return '';
  const { outerHTML } = await browser.send('DOM.getOuterHTML', { nodeId: shadow.nodeId }, sessionId).catch(() => ({ outerHTML: '' }));
  // Without the stylesheet: its selectors name every class the checks look for.
  return outerHTML.replace(/<style[\s\S]*?<\/style>/g, '');
}

/** Centre of the popup button `data-act=<act>` (inside the closed shadow root). */
async function buttonCenter(browser, sessionId, act) {
  const { root } = await browser.send('DOM.getDocument', { depth: -1, pierce: true }, sessionId);
  let found = null;
  const walk = (node) => {
    if (found) return;
    const attrs = node.attributes ?? [];
    const i = attrs.indexOf('data-act');
    if (i >= 0 && attrs[i + 1] === act && node.nodeName === 'BUTTON') {
      found = node;
      return;
    }
    for (const c of node.children ?? []) walk(c);
    for (const s of node.shadowRoots ?? []) walk(s);
  };
  walk(root);
  if (!found) return null;
  // The popup body scrolls: a button below its fold has a box but is not where a click lands.
  await browser.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: found.backendNodeId }, sessionId).catch(() => null);
  const box = await browser.send('DOM.getBoxModel', { backendNodeId: found.backendNodeId }, sessionId).catch(() => null);
  const q = box?.model?.content;
  if (!q) return null;
  return { x: Math.round((q[0] + q[2] + q[4] + q[6]) / 4), y: Math.round((q[1] + q[3] + q[5] + q[7]) / 4) };
}

module.exports = {
  id: 'extension',
  title: 'Extension: headless Chrome + loadUnpacked -> hover -> mine into the app; AI explain / AI off',
  /** Opt-in world: the fake AI server, for "Explain in context" through the popup. */
  world: { ai: true },
  async run(ctx) {
    const { eval: ev, result } = ctx;
    if (!chromeAvailable()) {
      result.skip(`no Chrome at ${CHROME}`);
      return;
    }
    await installHelpers(ctx);
    // A fresh profile may still be loading the built-in dictionary: without it /v1/scan
    // finds nothing and no popup opens (this flow passed only after `dictionary` had run).
    const dict = await ensureDictionaryReady(ctx, { word: TARGET });
    result.note(`dictionary ready for the hover lookup: ${JSON.stringify(dict)}`);
    const status = await ev(`window.api.extensionStatus()`, { await: true });
    result.check('the app\'s extension server runs on the run\'s private port', status?.running === true && status.port === ctx.extensionPort && Boolean(status.token), { running: status?.running, port: status?.port, token: Boolean(status?.token) });
    if (!status?.running) return;

    const base = path.join(ctx.runDir, 'chrome-e2e');
    const extDir = path.join(base, 'extension');
    fs.cpSync(path.join(ctx.repo, 'extension'), extDir, { recursive: true });
    let patched = 0;
    for (const f of fs.readdirSync(extDir)) {
      const p = path.join(extDir, f);
      if (!/\.(js|json)$/.test(f) || !fs.statSync(p).isFile()) continue;
      const src = fs.readFileSync(p, 'utf8');
      if (src.includes('18765')) {
        fs.writeFileSync(p, src.replace(/18765/g, String(ctx.extensionPort)));
        patched += 1;
      }
    }
    result.note(`extension copy: default port 18765 -> ${ctx.extensionPort} in ${patched} file(s)`);
    const page = await fixturePage();
    let browser = null;
    try {
      browser = await launchHeadlessChrome({ userDataDir: path.join(base, 'profile') });
      result.check('headless Chrome answers CDP over the pipe', Boolean(browser.version?.product), browser.version?.product);
      const loaded = await browser.send('Extensions.loadUnpacked', { path: extDir });
      result.check('Extensions.loadUnpacked loads the repo\'s extension', Boolean(loaded?.id), loaded);
      const extId = loaded.id;

      // The service worker: write the pairing (token + port) as "Pull from Gum" does.
      let sw = null;
      for (let i = 0; i < 40 && !sw; i++) {
        const { targetInfos } = await browser.send('Target.getTargets');
        sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extId}/`));
        if (!sw) await ctx.sleep(250);
      }
      const { sessionId: swSession } = await browser.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
      const pairing = { jpStudySettings: { token: status.token, port: ctx.extensionPort, saveDestination: 'both' }, jpStudyToken: status.token, jpStudyPort: ctx.extensionPort };
      await browser.send('Runtime.evaluate', { expression: `chrome.storage.local.set(${JSON.stringify(pairing)}).then(() => true)`, awaitPromise: true }, swSession);
      const health = await browser.send('Runtime.evaluate', {
        expression: `fetch('http://127.0.0.1:${ctx.extensionPort}/v1/health').then((r) => r.json()).then((j) => JSON.stringify({ ok: j.ok, port: j.port, locked: j.locked }))`,
        awaitPromise: true,
      }, swSession);
      const h = JSON.parse(health?.result?.value ?? '{}');
      result.check('the extension reaches the headless app (not a Gum on 18765)', h.ok === true && h.port === ctx.extensionPort, h);

      // The fixture page, in a new (headless) tab.
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const contexts = [];
      const off = browser.on((msg) => {
        if (msg.sessionId === sessionId && msg.method === 'Runtime.executionContextCreated') contexts.push(msg.params.context);
      });
      await browser.send('Page.enable', {}, sessionId);
      await browser.send('Runtime.enable', {}, sessionId);
      await browser.send('DOM.enable', {}, sessionId);
      /** (Re)load the fixture page; true once a fresh content script is injected into it. */
      const loadPage = async () => {
        const before = contexts.length;
        await browser.send('Page.navigate', { url: page.url }, sessionId);
        for (let i = 0; i < 40; i++) {
          if (contexts.slice(before).some((c) => c.auxData?.type === 'isolated' && String(c.origin).includes(extId))) return true;
          await ctx.sleep(250);
        }
        return false;
      };
      const injected = await loadPage();
      result.check('the content script is injected into the 127.0.0.1 fixture page', injected, contexts.map((c) => ({ type: c.auxData?.type, origin: c.origin, name: c.name })));

      /** Shift + hover over `word` on the page, as a reader does; the popup's state once it shows the word. */
      const hoverWord = async (word) => {
        const ptRes = await browser.send('Runtime.evaluate', {
          expression: `(() => { const n = document.getElementById('text').firstChild; const i = n.data.indexOf(${JSON.stringify(word)}); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect(); return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }); })()`,
          returnByValue: true,
        }, sessionId);
        const pt = JSON.parse(ptRes.result.value);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x - 3, y: pt.y }, sessionId);
        await ctx.sleep(100);
        await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 }, sessionId);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, modifiers: 8 }, sessionId);
        let state = null;
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          state = await popupState(browser, sessionId).catch(() => null);
          if (state?.open && state.term && state.term.includes(word)) break;
          await ctx.sleep(250);
          await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x + (Date.now() % 2), y: pt.y, modifiers: 8 }, sessionId);
        }
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }, sessionId);
        return state;
      };
      /** A real click on the popup button `data-act=<act>`, where it is drawn; false when it is not drawn. */
      const clickButton = async (act) => {
        const at = await buttonCenter(browser, sessionId, act);
        if (!at) return false;
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }, sessionId);
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }, sessionId);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }, sessionId);
        return true;
      };

      // Shift + hover over the target word: a user's lookup.
      const popup = await hoverWord(TARGET);
      result.check('Shift + hover opens the extension popup with the word (looked up by the app)', Boolean(popup?.open && popup.term && popup.term.includes(TARGET)), popup);
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId).catch(() => null);
      if (shot?.data) {
        const file = path.join(SCREENS, 'e2e-extension-popup.png');
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
        result.screens.push(file);
      }

      // Mine: the popup's "Save word" button, clicked where it is drawn (inside the closed
      // shadow root, located with a piercing DOM read).
      const before = await ev(`${DECK}.map((c) => c.id)`);
      const ankiNotes = ctx.world ? ctx.world.anki.fake.notes.size : null;
      const save = await buttonCenter(browser, sessionId, 'save-word');
      if (save) {
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: save.x, y: save.y }, sessionId);
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: save.x, y: save.y, button: 'left', clickCount: 1 }, sessionId);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: save.x, y: save.y, button: 'left', clickCount: 1 }, sessionId);
      } else {
        // The popup's own shortcut for the same action.
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', text: 's', windowsVirtualKeyCode: 83 }, sessionId);
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 }, sessionId);
      }
      result.note(`save: ${save ? `"Save word" button clicked at ${save.x},${save.y}` : 'no button found; pressed "s"'}`);
      const mined = await poll(ctx, `(() => { const known = new Set(${JSON.stringify(before)}); const fresh = ${DECK}.filter((c) => !known.has(c.id)); return fresh.length ? fresh.map((c) => ({ word: c.word, sentence: c.sentence, folder: c.folder, source: c.source, url: c.sourceUrl || c.bookId || '' })) : null; })()`, 20000, 300);
      const toast = await browser.send('Runtime.evaluate', { expression: `document.querySelector('#jp-study-toast')?.innerText || ''`, returnByValue: true }, sessionId).catch(() => null);
      result.check('"Save word" in the popup mines the word into the app\'s deck (folder Extension)', Boolean(mined) && mined.some((c) => (c.word || '').includes(TARGET)), { mined, toast: toast?.result?.value });
      if (ctx.world) {
        const deadline2 = Date.now() + 8000;
        while (ctx.world.anki.fake.notes.size === ankiNotes && Date.now() < deadline2) await ctx.sleep(250);
        const note = [...ctx.world.anki.fake.notes.values()].find((n) => Object.values(n.fields).some((v) => String(v).includes(TARGET)));
        result.note(`extension save -> Anki: ${note ? `note in the FAKE AnkiConnect (${JSON.stringify(note.fields).slice(0, 120)})` : 'no note (app-only save)'}`);
      }

      // --- Optional AI (src/main/extensionAiRoutes.ts), answered by the harness's fake ----
      const ai = ctx.world && ctx.world.ai;
      if (!ai) {
        result.note('optional AI: skipped (the run did not start the fake AI server)');
      } else {
        try {
          // The preset may have been put back by an earlier flow (ai-study): point the app
          // at the fake again, with "Explain in context" allowed to use it.
          const setup = await ev(`(async () => {
            await window.api.aiSetupSetEnabled(true);
            await window.api.aiSetupUpdate({ compatBaseUrl: ${JSON.stringify(ai.base)}, compatModel: ${JSON.stringify(ai.model)}, cloudFeatures: { contextExplain: true } });
            await window.api.aiSetProvider('openai-compatible');
            // An earlier flow can leave the engine on the offline model; the fake is a server.
            const engine = await window.api.aiSetEngine('cloud');
            const s = await window.api.aiSetupStatus();
            return { enabled: s.enabled, providerId: s.providerId, engine: engine && engine.engine, contextExplain: s.cloudFeatures && s.cloudFeatures.contextExplain };
          })()`, { await: true }).catch((err) => ({ error: String(err) }));
          const aiStatusJs = `fetch('http://127.0.0.1:${ctx.extensionPort}/v1/ai/status', { headers: { Authorization: 'Bearer ${status.token}' } }).then((r) => r.json()).then((j) => JSON.stringify(j))`;
          const statusOn = JSON.parse((await browser.send('Runtime.evaluate', { expression: aiStatusJs, awaitPromise: true }, swSession))?.result?.value ?? '{}');
          result.check('AI on: the app tells the extension "Explain in context" is ready (no key in the extension)', setup?.enabled === true && statusOn?.enabled === true && statusOn?.features?.explain === 'ready', { setup, status: statusOn });

          // A fresh page: the content script asks the app for the AI status once per popup.
          await loadPage();
          const before = ai.count('contextExplain');
          const shown = await hoverWord(TARGET);
          let drawn = false;
          for (let i = 0; i < 40 && !drawn; i++) {
            drawn = Boolean(await buttonCenter(browser, sessionId, 'ai-explain'));
            if (!drawn) await ctx.sleep(250);
          }
          result.check('AI on: the popup offers "Explain in context" under the dictionary', Boolean(shown?.open) && drawn, { popup: shown, drawn });
          const clicked = await clickButton('ai-explain');
          let html = '';
          const deadline3 = Date.now() + 20000;
          while (Date.now() < deadline3) {
            html = await popupShadowHtml(browser, sessionId).catch(() => '');
            if (/data-ai-result="explain"/.test(html)) break;
            await ctx.sleep(250);
          }
          const explanation = /<p class="rp-ai-text">([^<]*)<\/p>/.exec(html)?.[1] ?? '';
          const aiOut = (/<div class="rp-ai-out"[^>]*>([\s\S]*?)<\/div><\/div>/.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const explainOk = clicked && /E2E fake AI: sense \d fits/.test(explanation) && /class="rp-ai-badge"/.test(html) && /class="rp-ai-pick"/.test(html) && ai.count('contextExplain') === before + 1;
          let direct = null;
          if (!explainOk) {
            // Diagnose: the same request straight from the worker, past the content script.
            const probe = await browser.send('Runtime.evaluate', {
              expression: `fetch('http://127.0.0.1:${ctx.extensionPort}/v1/ai/explain-context', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ${status.token}' }, body: JSON.stringify({ word: '猫', sentence: ${JSON.stringify(PAGE_TEXT)}, senses: ['cat', 'shamisen'], lang: 'ja', uiLang: 'en' }) }).then((r) => r.text())`,
              awaitPromise: true,
            }, swSession).catch((err) => ({ error: String(err) }));
            direct = probe?.result?.value ?? probe;
          }
          result.check('"Explain in context" answers through the popup: the fake\'s sense, labelled AI, marked on the list', explainOk,
            { clicked, explanation, aiOut: aiOut.slice(0, 300), picked: /class="rp-ai-pick"/.test(html), fakeCalls: ai.count('contextExplain') - before, fakeHits: ai.hits.slice(-3), direct });
          const aiShot = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId).catch(() => null);
          if (aiShot?.data) {
            const file = path.join(SCREENS, 'e2e-extension-ai-explain.png');
            fs.writeFileSync(file, Buffer.from(aiShot.data, 'base64'));
            result.screens.push(file);
          }

          // AI off: the controls are hidden, and the dictionary and mining work as before.
          const offState = await ev(`window.api.aiSetupSetEnabled(false).then(() => window.api.aiSetupStatus()).then((s) => s.enabled)`, { await: true });
          const statusOff = JSON.parse((await browser.send('Runtime.evaluate', { expression: aiStatusJs, awaitPromise: true }, swSession))?.result?.value ?? '{}');
          const hitsAtOff = ai.hits.length;
          await loadPage();
          const offPopup = await hoverWord(OFF_WORD);
          let offHtml = '';
          for (let i = 0; i < 20; i++) {
            offHtml = await popupShadowHtml(browser, sessionId).catch(() => '');
            // The status answer has landed once the AI row exists (drawn hidden) or the popup shows no AI row at all.
            if (/data-ai-tools/.test(offHtml)) break;
            await ctx.sleep(250);
          }
          await ctx.sleep(500);
          offHtml = await popupShadowHtml(browser, sessionId).catch(() => '');
          const visibleAi = ['ai-explain', 'ai-meaning', 'ai-breakdown', 'ai-simplify'];
          const drawnOff = [];
          for (const act of visibleAi) if (await buttonCenter(browser, sessionId, act)) drawnOff.push(act);
          const rows = offHtml.match(/<div class="rp-ai"[^>]*>/g) ?? [];
          result.check('AI off: the popup still looks the word up, and draws no AI button',
            offState === false && statusOff?.enabled === false && Boolean(offPopup?.open && offPopup.term?.includes(OFF_WORD)) && drawnOff.length === 0 && rows.every((r) => /\bhidden\b/.test(r)),
            { offState, statusEnabled: statusOff?.enabled, popup: offPopup, drawnOff, rows });
          const beforeOff = await ev(`${DECK}.map((c) => c.id)`);
          const savedOff = await clickButton('save-word');
          const minedOff = await poll(ctx, `(() => { const known = new Set(${JSON.stringify(beforeOff)}); const fresh = ${DECK}.filter((c) => !known.has(c.id)); return fresh.length ? fresh.map((c) => ({ word: c.word, folder: c.folder })) : null; })()`, 20000, 300);
          result.check('AI off: "Save word" still mines into the app\'s deck', savedOff && Boolean(minedOff) && minedOff.some((c) => (c.word || '').includes(OFF_WORD)), { savedOff, minedOff });
          result.check('AI off: nothing was asked of the fake AI', ai.hits.length === hitsAtOff, ai.hits.slice(hitsAtOff));
        } finally {
          // Leave the AI settings as the ai-study flow leaves them (AI on, no provider configured).
          const restored = await ev(`(async () => {
            await window.api.aiSetupSetEnabled(true);
            await window.api.aiSetupUpdate({ compatBaseUrl: '', compatModel: '', cloudFeatures: { contextExplain: false } });
            await window.api.aiSetProvider('gemini-2.5-flash');
            const s = await window.api.aiSetupStatus();
            return { enabled: s.enabled, providerId: s.providerId, compatBaseUrl: s.compatBaseUrl };
          })()`, { await: true }).catch((err) => ({ error: String(err) }));
          result.check('the AI settings are put back (AI on, no provider configured)', restored?.enabled === true && restored.compatBaseUrl === '', restored);
        }
      }
      off();

      const procs = await chromeProcesses(base);
      result.check('headless Chrome owns no visible window (and is our own instance)', procs.length > 0 && procs.every((p) => !p.window), procs);
      result.check('the fixture page was served from 127.0.0.1 only', page.hits.length > 0, page.hits);
    } finally {
      if (browser) await browser.close().catch(() => null);
      await ctx.sleep(500);
      const killed = await killChrome(base);
      const left = await chromeProcesses(base);
      result.check('headless Chrome is gone after the flow (only its own processes killed)', left.length === 0, { killedAfterClose: killed, left });
      await page.close();
    }
  },
};
