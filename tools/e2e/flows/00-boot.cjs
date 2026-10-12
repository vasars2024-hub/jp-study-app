'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/** Boot: the app came up headless, renders as visible, and captures real pixels. */
module.exports = {
  id: 'boot',
  title: 'Headless boot',
  async run(ctx) {
    const { eval: ev, e2e, request, result, shot } = ctx;
    const status = await e2e('status');
    result.check('headless mode is active in main', status.active === true);
    result.check('no headless patch failed', (status.patchFailures ?? []).length === 0, status.patchFailures);
    // `visible` is the OS's answer (must be false); `shown` is the app's own belief, which
    // headless mode keeps faithful so show/hide logic (the lock guard) runs as on a desktop.
    result.check('every BrowserWindow is hidden from the desktop', status.visibleWindows === 0, status.windows);
    result.check('the main window is nevertheless "shown" as far as the app knows', status.windows.some((w) => w.shown), status.windows);
    const page = await ev(`({ vis: document.visibilityState, hidden: document.hidden, api: typeof window.api, url: location.href })`);
    result.check('the page renders as visible (never-shown window paints)', page.vis === 'visible' && page.hidden === false, page);
    result.check('the preload API is exposed', page.api === 'object', page.api);
    const rafRan = await ev(`new Promise((r) => requestAnimationFrame(() => r(true)))`, { await: true });
    result.check('requestAnimationFrame runs in the hidden window', rafRan === true);
    const devtools = (status.calls ?? []).some((c) => c.api === 'webContents.openDevTools');
    if (/^https?:/.test(page.url)) result.check('dev build tried to open DevTools and was stubbed', devtools, 'webContents.openDevTools');
    else result.note(`production snapshot (${page.url}); DevTools are never opened there`);
    const stubs = [...new Set((status.calls ?? []).map((c) => c.api))];
    result.check('global shortcuts were stubbed, not registered with Windows', stubs.includes('globalShortcut.register'), stubs);
    const health = await request('/health', {});
    result.check('the bridge answers', health.ok === true && (health.windows ?? []).length >= 1, (health.windows ?? []).length);
    result.check('the tray exists only as a stand-in (menu kept, no icon)', (status.tray ?? []).length > 0, status.tray);
    await shot('desktop');

    // --- isolation from the owner's services, clipboard, screen and files ---------------
    const iso = status.isolation ?? {};
    result.check('every isolation stub is installed', Array.isArray(iso.missing) && iso.missing.length === 0, { missing: iso.missing, stubs: (iso.stubs ?? []).map((s) => s.name) });
    const shim = await ev(`window.__gumE2eShim ? { ...window.__gumE2eShim } : null`);
    result.check('the page shim ran in the main window before the app (clipboard + capture)', Boolean(shim), shim);

    // Clipboard: the page's copy lands in the harness buffer, the harness's text is what the page pastes.
    await ev(`navigator.clipboard.writeText('e2e clipboard probe 窓辺')`, { await: true });
    const afterPageWrite = await e2e('clipboard');
    result.check('navigator.clipboard.writeText writes the in-memory clipboard', afterPageWrite.clipboard?.text === 'e2e clipboard probe 窓辺', afterPageWrite.clipboard);
    await e2e('clipboard', { set: { text: '雨の日の約束' } });
    const pageRead = await ev(`navigator.clipboard.readText()`, { await: true });
    result.check('navigator.clipboard.readText reads the in-memory clipboard', pageRead === '雨の日の約束', pageRead);
    const keyCopy = await ev(`(() => { const t = document.createElement('textarea'); t.value = 'copied by keyboard'; document.body.appendChild(t); t.focus(); t.select(); window.__e2eCopyProbe = t; return true; })()`);
    const keyed = keyCopy ? await request('/key', { window: 'main', key: 'c', modifiers: ['ctrl'] }) : null;
    await ev(`(window.__e2eCopyProbe?.remove(), delete window.__e2eCopyProbe, true)`);
    const afterKey = await e2e('clipboard');
    result.check('Ctrl+C through the bridge copies into the in-memory clipboard, never the OS one', keyed?.transport === 'headless-clipboard-shim' && afterKey.clipboard?.text === 'copied by keyboard', { keyed, clipboard: afterKey.clipboard });

    // Screen capture: getDisplayMedia answers the synthetic stream, nothing asks the session.
    const display = await ev(`navigator.mediaDevices.getDisplayMedia({ video: true }).then((s) => { const t = s.getVideoTracks()[0]; const r = { tracks: s.getTracks().length, w: t?.getSettings().width, h: t?.getSettings().height }; s.getTracks().forEach((x) => x.stop()); return r; })`, { await: true });
    const after = await e2e('status');
    result.check('getDisplayMedia answers a synthetic canvas stream (no screen, no prompt)', display?.tracks === 1 && display.w > 0 && (after.isolation?.capture?.displayMediaRefused ?? 0) === 0, { display, capture: after.isolation?.capture });

    // AnkiConnect: the boot heartbeat went to the fake (profiles.json + the 8765 remap), and a
    // page request to 8765 is redirected there too.
    const world = ctx.world;
    if (world) {
      const viaPage = await ev(`fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify({ action: 'version', version: 6 }) }).then((r) => r.json()).catch((e) => ({ error: String(e) }))`, { await: true });
      result.check('a page request to 127.0.0.1:8765 reaches the fake AnkiConnect', viaPage?.result === 6, viaPage);
      const status2 = await ev(`window.api.ankiStatus ? window.api.ankiStatus() : null`, { await: true });
      const actions = [...new Set(world.anki.fake.calls.map((c) => c.action))];
      result.check("the app's own Anki traffic (heartbeat / status) answered by the fake", actions.includes('version') && actions.includes('deckNames'), { actions, status: status2 });
      const loop = (await e2e('status')).isolation?.loopback ?? {};
      result.check('no protected loopback port was contacted directly', loop.leaked === 0, { ports: loop.ports, refused: loop.refused, remapped: loop.remapped });
    }
  },
};
