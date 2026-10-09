'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/** Boot: the app came up headless, renders as visible, and captures real pixels. */
module.exports = {
  id: 'boot',
  title: 'Headless boot',
  async run({ eval: ev, e2e, request, result, shot }) {
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
  },
};
