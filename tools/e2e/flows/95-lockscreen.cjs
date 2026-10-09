'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Lockscreen (lock2: main/lockGuard.ts + lockscreenPin.ts), driven end to end.
 *
 * A PIN is set and the lock enabled in Settings → Lockscreen. With an app pop-out and
 * Blanc open, the lock is armed, then every path the guard covers that is drivable
 * without a desktop is tried: the pop-out IPC, a global chord (through the same
 * `globalShortcut` callback Windows would call), a tray row (the stand-in keeps the app's
 * real menu), a second launch with `--open=`, an extension-server request, and Blanc's own
 * lock state. Content stays hidden or refused; the lock UI is rendered in the lock
 * surfaces' DOM ("shown", headless). Then five wrong PINs trip main's backoff, the right
 * PIN is refused during it, and after it the right PIN unlocks and everything comes back.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { installHelpers, poll } = require('./_lib.cjs');

const PIN = '2580';
const WRONG = '1111';

function httpCall(port, method, route, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request(
      { host: '127.0.0.1', port, path: route, method, agent: false, timeout: 10_000, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), connection: 'close' } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            /* not json */
          }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on('error', (err) => resolve({ status: 0, error: String(err) }));
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(payload);
  });
}

module.exports = {
  id: 'lockscreen',
  title: 'Lockscreen: PIN, every guarded path, backoff, unlock',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const status = () => ctx.e2e('status');
    const winByUrl = async (re) => (await status()).windows.filter((w) => re.test(w.url));
    const gateLog = () => {
      try {
        return fs.readFileSync(path.join(ctx.profile, 'logs', 'main.log'), 'utf8');
      } catch {
        return '';
      }
    };
    const typePin = async (pin) => {
      for (const digit of pin) await ctx.request('/key', { window: 'main', key: digit });
      await ctx.sleep(900);
    };
    const lockText = () => ev(`(() => { const l = document.querySelector('.lockscreen[role=dialog]'); return l ? l.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);

    // --- 1. Set a PIN and enable the lock in Settings → Lockscreen ---------------------
    await ev(`__e2e.open('settings')`);
    await ctx.sleep(400);
    await ev(`(window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'lockscreen', settingId: 'lockscreen-pin' } })), true)`);
    const pinInputs = await poll(ctx, `document.querySelectorAll('input[autocomplete="new-password"]').length >= 2 || null`, 15000);
    result.check('Settings → Lockscreen shows the passcode fields', Boolean(pinInputs));
    await ev(`(() => { const [a, b] = document.querySelectorAll('input[autocomplete="new-password"]'); __e2e.fill(a, ${JSON.stringify(PIN)}); __e2e.fill(b, ${JSON.stringify(PIN)}); __e2e.click(a.closest('.os-viz-row').querySelector('.btn.primary')); return true; })()`);
    const hashed = await poll(ctx, `(() => { const s = JSON.parse(localStorage.getItem('jp-study-lockscreen-v1') || '{}'); return /^scrypt1:/.test(s.pinHash || '') || null; })()`, 10000);
    result.check('the PIN is stored as main\'s scrypt hash (never the digits)', Boolean(hashed));
    await ev(`(() => { const box = [...document.querySelectorAll('.os-check-row input[type=checkbox]')].find((x) => /launch/i.test(x.closest('label')?.innerText || '')); if (box && !box.checked) box.click(); return !!box; })()`);
    const enabled = await poll(ctx, `JSON.parse(localStorage.getItem('jp-study-lockscreen-v1') || '{}').enabled === true || null`, 5000);
    result.check('the lock is enabled', Boolean(enabled));
    await ctx.shot('settings');
    result.check('the app is still unlocked', (await ev(`window.api.lockscreenIsLocked()`, { await: true })) === false);

    // --- 2. Content open before the lock: an app pop-out and Blanc ---------------------
    await ev(`window.api.popOut('dictionary')`, { await: true });
    const popout = await poll(ctx, `true`, 500).then(async () => {
      for (let i = 0; i < 40; i++) {
        const w = (await winByUrl(/popout=dictionary/))[0];
        if (w && w.shown) return w;
        await ctx.sleep(250);
      }
      return null;
    });
    result.check('a pop-out (Dictionary) is open and shown', Boolean(popout), popout);
    await ctx.e2e('clickTray', { label: 'Open Blanc' });
    let blanc = null;
    for (let i = 0; i < 60 && !blanc; i++) {
      blanc = (await winByUrl(/blanc/i))[0] ?? null;
      if (!blanc) await ctx.sleep(250);
    }
    result.check('the tray row "Open Blanc" opens Blanc while unlocked', Boolean(blanc), blanc);
    await poll(ctx, `true`, 100);
    const blancReady = blanc ? await (async () => {
      for (let i = 0; i < 60; i++) {
        const r = await ctx.request('/eval', { window: blanc.id, js: `document.readyState === 'complete' && !!document.querySelector('#root, body > div')` });
        if (r.ok && r.result) return true;
        await ctx.sleep(500);
      }
      return false;
    })() : false;

    // --- 3. Lock ---------------------------------------------------------------------
    const locked = await ev(`window.api.lockscreenLock()`, { await: true });
    result.check('arming the lock succeeds (a PIN is set)', locked?.locked === true, locked);
    const mainLock = await poll(ctx, `!!document.querySelector('.lockscreen[role=dialog]') || null`, 10000);
    result.check('the Study OS window renders its PIN pad (lock surface, gated)', Boolean(mainLock), await lockText());
    await ctx.shot('locked-main');
    if (blancReady) {
      let blancLock = false;
      for (let i = 0; i < 40 && !blancLock; i++) {
        const r = await ctx.request('/eval', { window: blanc.id, js: `!!document.querySelector('.blanc-lock')` });
        blancLock = Boolean(r.ok && r.result);
        if (!blancLock) await ctx.sleep(250);
      }
      result.check("Blanc shows its own lock (gated surface)", blancLock);
      await ctx.shot('locked-blanc', { window: blanc.id });
    } else {
      result.check('Blanc loaded before the lock', false);
    }
    const hiddenPopout = (await winByUrl(/popout=dictionary/))[0];
    result.check('the open pop-out (content) was hidden by the guard', Boolean(hiddenPopout) && hiddenPopout.shown === false && hiddenPopout.visible === false, hiddenPopout);

    // Pop-out IPC: refused, no window.
    const popRefused = await ev(`window.api.popOut('grammar')`, { await: true });
    await ctx.sleep(800);
    result.check('the pop-out IPC is refused while locked (no window)', popRefused === false && (await winByUrl(/popout=grammar/)).length === 0, popRefused);

    // A global chord, delivered as Windows would: Ctrl+Alt+B is "Open Blanc Toolbox".
    const before = gateLog().length;
    const fired = await ctx.e2e('fireShortcut', { accelerator: 'Ctrl+Alt+B' });
    await ctx.sleep(600);
    result.check('a global command is refused by the gate (command:toolbox.open)', fired.ok === true && gateLog().slice(before).includes('refused command:toolbox.open'), gateLog().slice(before).slice(-400));

    // A tray row: refused (tray:openBlanc), and the refusal reaches the lock screen.
    const before2 = gateLog().length;
    await ctx.e2e('clickTray', { label: 'Open Blanc' });
    await ctx.sleep(600);
    result.check('a tray row is refused by the gate (tray:openBlanc)', gateLog().slice(before2).includes('refused tray:openBlanc'), gateLog().slice(before2).slice(-400));
    const toast = await poll(ctx, `(() => { const t = [...document.querySelectorAll('[class*=toast]')].map((x) => (x.innerText || '').replace(/\\s+/g, ' ').trim()).filter((x) => x.length > 2).sort((a, b) => b.length - a.length); return t[0] || null; })()`, 3000);
    result.check('the refusal is announced on the lock screen', Boolean(toast), toast);

    // A second launch with --open=: queued, nothing opens while locked.
    const second = await ctx.secondInstance(['--open=library']);
    await ctx.sleep(1500);
    result.check('a second launch with --open=library exits and opens nothing while locked', second.code === 0 && (await winByUrl(/popout=library/)).length === 0, { code: second.code, skipped: second.skipped });

    // The extension server: content routes answer 423, liveness still answers.
    const ext = await httpCall(ctx.extensionPort, 'POST', '/v1/lookup', { text: '猫' });
    const live = await httpCall(ctx.extensionPort, 'GET', '/health');
    result.check('an extension request is refused with 423 { code: locked }', ext.status === 423 && ext.json?.code === 'locked', ext);
    result.check('the extension liveness route still answers while locked', live.status === 200, { status: live.status });

    // Nothing reached the desktop; the guard hid, the harness kept it all off-screen.
    const mid = await status();
    result.check('no window on the desktop while locked', mid.visibleWindows === 0 && mid.violations.length === 0, mid.windows);

    // --- 4. Wrong PINs: main's backoff --------------------------------------------------
    for (let i = 0; i < 5; i++) await typePin(WRONG);
    const afterFive = await lockText();
    result.check('after five wrong PINs the lock says how long to wait', /Try again in \d+ seconds?/.test(afterFive ?? ''), afterFive);
    await ctx.shot('backoff');
    await typePin(PIN);
    const stillLocked = await ev(`window.api.lockscreenIsLocked()`, { await: true });
    result.check('the right PIN typed during the wait does not unlock (entry paused)', stillLocked === true);
    const waited = await poll(ctx, `(() => { const t = document.querySelector('.lockscreen[role=dialog]')?.innerText || ''; return /Try again in/.test(t) ? null : true; })()`, 40_000, 500);
    result.check('the wait ends on its own (30 s)', Boolean(waited));

    // --- 5. The right PIN unlocks and restores --------------------------------------
    await typePin(PIN);
    const unlocked = await poll(ctx, `(async () => (await window.api.lockscreenIsLocked()) === false || null)()`, 10000);
    // `poll` evaluates synchronously; ask again with await for the real answer.
    const isLocked = await ev(`window.api.lockscreenIsLocked()`, { await: true });
    result.check('the right PIN unlocks main\'s lock', isLocked === false, { unlocked, isLocked });
    const desk = await poll(ctx, `(!!document.querySelector('.desktop-root') && !document.querySelector('.lockscreen[role=dialog]')) || null`, 10000);
    result.check('the Study OS desktop is back', Boolean(desk));
    if (blancReady) {
      let blancFree = false;
      for (let i = 0; i < 40 && !blancFree; i++) {
        const r = await ctx.request('/eval', { window: blanc.id, js: `!document.querySelector('.blanc-lock')` });
        blancFree = Boolean(r.ok && r.result);
        if (!blancFree) await ctx.sleep(250);
      }
      result.check('Blanc unlocks with it', blancFree);
    }
    let restored = null;
    for (let i = 0; i < 20 && !restored; i++) {
      const w = (await winByUrl(/popout=dictionary/))[0];
      if (w?.shown) restored = w;
      else await ctx.sleep(250);
    }
    result.check('the pop-out the lock hid is restored', Boolean(restored), restored);
    let queued = null;
    for (let i = 0; i < 40 && !queued; i++) {
      queued = (await winByUrl(/popout=library/))[0] ?? null;
      if (!queued) await ctx.sleep(250);
    }
    result.check('the --open=library launch queued while locked opens now', Boolean(queued), queued);
    const extAfter = await httpCall(ctx.extensionPort, 'POST', '/v1/lookup', { text: '猫' });
    result.check('the extension server no longer answers 423', extAfter.status !== 423, { status: extAfter.status });
    const end = await status();
    result.check('still nothing on the desktop', end.visibleWindows === 0 && end.violations.length === 0, end.windows);
    await ctx.shot('unlocked');

    // Leave the profile unlocked and without a lock for whatever runs next.
    await ev(`(() => { localStorage.setItem('jp-study-lockscreen-v1', JSON.stringify({ enabled: false, pinHash: '', tint: 'auto' })); return true; })()`);
    await ev(`window.api.lockscreenSyncConfig({ enabled: false, pinHash: '' }, false)`, { await: true }).catch(() => null);
    for (const w of (await status()).windows.filter((x) => /popout=|blanc/i.test(x.url))) {
      await ctx.request('/eval', { window: w.id, js: 'window.close(), true' }).catch(() => null);
    }
  },
};
