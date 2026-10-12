'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Lockscreen, round 3 (lock3), driven end to end on the real app, headless.
 *
 * What `95-lockscreen` does not cover:
 *  - the first PIN comes with a recovery code, shown once in Settings;
 *  - changing the PIN / turning the launch lock off needs the current PIN (main refuses);
 *  - while locked, a data IPC call from the window behind the lock is HELD (not answered)
 *    and answered after the unlock; the lock's own calls still answer;
 *  - a renderer that flips its own state (session flag + reload) gets the PIN pad back;
 *  - "Lock Gum now" from the tray row and from the command;
 *  - toasts raised while locked stay off the lock screen and arrive after it;
 *  - each skin (Study OS, Aero, WIRED, Blanc) draws its clock, the study panel and the
 *    "Forgot your PIN?" link; WIRED ticks seconds;
 *  - "answer a card to unlock" comes before the PIN pad, and the PIN is still needed;
 *  - the recovery code unlocks once and removes the PIN.
 *
 * Not drivable here (no hook in the harness): real sleep / Win+L / system idle for
 * auto-lock (powerMonitor), and a moved Windows clock. Those are unit-tested
 * (lockAutoArm.test.ts, lockscreenPin.test.ts "clock changes").
 */
const fs = require('node:fs');
const path = require('node:path');
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');

const PIN = '4826';
const PIN2 = '7391';

module.exports = {
  id: 'lockscreen-plus',
  title: 'Lockscreen lock3: recovery, IPC hold, study step, skins, lock now',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const status = () => ctx.e2e('status');
    const mainLog = () => {
      try {
        return fs.readFileSync(path.join(ctx.profile, 'logs', 'main.log'), 'utf8');
      } catch {
        return '';
      }
    };
    const typePin = async (pin, win = 'main') => {
      for (const digit of pin) await ctx.request('/key', { window: win, key: digit });
      await ctx.sleep(900);
    };
    const isLocked = () => ev('window.api.lockscreenIsLocked()', { await: true });
    const lockStatus = () => ev('window.api.lockscreenStatus()', { await: true });
    /** Race a data call against a timer: 'held' while the IPC gate holds it. */
    const raceLibrary = () =>
      ev(
        `(async () => Promise.race([Promise.resolve(window.api.listLibrary()).then(() => 'answered', () => 'rejected'), new Promise((r) => setTimeout(() => r('held'), 1500))]))()`,
        { await: true },
      );
    /** The PIN pad submits at four digits; the Aero / WIRED password fields want Enter. */
    const unlockWith = async (pin, { enter = false } = {}) => {
      await typePin(pin);
      if (enter) {
        await ctx.request('/key', { window: 'main', key: 'Enter' });
        await ctx.sleep(600);
      }
      return pollAsync(ctx, `(async () => (await window.api.lockscreenIsLocked()) === false || null)()`, 10000);
    };

    // --- 1. First PIN in Settings: a recovery code, shown once -----------------------
    const before = await lockStatus();
    result.check('starts without a PIN (95-lockscreen cleared it through main)', before && before.hasPin === false, before);
    await ev(`__e2e.open('settings')`);
    await ctx.sleep(400);
    await ev(`(window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'lockscreen', settingId: 'lockscreen-pin' } })), true)`);
    await poll(ctx, `document.querySelectorAll('input[autocomplete="new-password"]').length >= 2 || null`, 15000);
    await ev(`(() => { const [a, b] = document.querySelectorAll('input[autocomplete="new-password"]'); __e2e.fill(a, ${JSON.stringify(PIN)}); __e2e.fill(b, ${JSON.stringify(PIN)}); __e2e.click(a.closest('.os-viz-row').querySelector('.btn.primary')); return true; })()`);
    const code = await poll(ctx, `(() => { const el = document.querySelector('.lock3-recovery-code'); return el ? el.textContent.trim() : null; })()`, 10000);
    result.check('the first PIN shows a recovery code once (XXXX-XXXX-XXXX-XXXX)', /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(code || ''), code);
    await ctx.sleep(400);
    await ctx.shot('settings-recovery-code');
    const afterSet = await lockStatus();
    result.check('main holds the PIN and a recovery code; the status carries no recovery hash', afterSet?.hasPin === true && afterSet?.hasRecovery === true && !('recoveryHash' in (afterSet || {})), afterSet);
    await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => __e2e.vis(x) && /wrote it down/i.test(x.innerText)); if (b) b.click(); return !!b; })()`);

    // --- 2. Changes need the current PIN -----------------------------------------------
    const forged = await ev(`window.api.lockscreenSetPin(null, '0000')`, { await: true });
    result.check('a new PIN without the current one is refused by main', forged?.ok === false && forged?.error === 'wrong-pin', forged);
    const changed = await ev(`window.api.lockscreenSetPin(${JSON.stringify(PIN)}, ${JSON.stringify(PIN2)})`, { await: true });
    result.check('with the current PIN the change goes through, and keeps the recovery code', changed?.ok === true && !changed?.recoveryCode && changed?.status?.hasRecovery === true, changed);
    const enabled = await ev(`window.api.lockscreenSetEnabled(true)`, { await: true });
    const offNoPin = await ev(`window.api.lockscreenSetEnabled(false)`, { await: true });
    result.check('lock at launch turns on freely, but not off without the current PIN', enabled?.ok === true && offNoPin?.ok === false && (await lockStatus())?.enabled === true, { enabled, offNoPin });
    // The old renderer path (syncConfig) can no longer clear or swap anything.
    const sync = await ev(`window.api.lockscreenSyncConfig({ enabled: false, pinHash: '' }, false)`, { await: true });
    result.check('syncConfig cannot clear main\'s record any more', sync?.ok === false && (await lockStatus())?.hasPin === true, sync);

    // --- 3. Lock now (tray row), the IPC hold, toasts ------------------------------------
    await ev(`(window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: 'warm-up' } })), true)`);
    await ctx.e2e('clickTray', { label: 'Lock Gum now' });
    const lockedByTray = await poll(ctx, `!!document.querySelector('.lockscreen[role=dialog]') || null`, 10000);
    result.check('the tray row "Lock Gum now" locks main and brings up the PIN pad', Boolean(lockedByTray) && (await isLocked()) === true);
    result.check('the desktop is not mounted behind the lock', (await ev(`!document.querySelector('.os-taskbar, .os-desktop')`)) === true);
    const logBefore = mainLog().length;
    const held = await raceLibrary();
    result.check('a data call (library:list) from the window behind the lock is held, not answered', held === 'held', held);
    const unlockRefused = await ev(`window.api.lockscreenUnlock()`, { await: true });
    result.check('the renderer cannot lift the lock itself (lockscreen:unlock refuses)', unlockRefused?.ok === false && (await isLocked()) === true, unlockRefused);
    await ctx.sleep(300);
    result.check('main logs the held channel', mainLog().slice(logBefore).includes('held ipc library:list'), mainLog().slice(logBefore).slice(-300));
    // The study panel and the recovery link on the Study OS skin.
    const panel = await poll(ctx, `(() => { const p = document.querySelector('.lockscreen-study'); const r = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Forgot your PIN?'); return p && r ? p.innerText.trim() : null; })()`, 8000);
    result.check('Study OS lock: study panel (count only) and "Forgot your PIN?"', /due today|Nothing due/.test(panel || ''), panel);
    result.check('Study OS lock: a screen reader gets the time and date', (await ev(`[...document.querySelectorAll('.lockscreen .sr-only')].some((n) => /^It is /.test(n.textContent || ''))`)) === true);
    await ctx.sleep(400);
    await ctx.shot('studyos-locked');

    // --- 4. A renderer that flips its own state gets the PIN pad back ---------------------
    await ev(`(sessionStorage.setItem('jp-lockscreen-unlocked', '1'), location.reload(), true)`).catch(() => null);
    await ctx.sleep(2500);
    await installHelpers(ctx).catch(() => null);
    const relocked = await poll(ctx, `!!document.querySelector('.lockscreen[role=dialog]') || null`, 30000);
    result.check('a reload with a forged "unlocked" session flag shows the PIN pad again (main decides)', Boolean(relocked) && (await isLocked()) === true);
    const heldAfterReload = await raceLibrary();
    result.check('...and its data calls are still held', heldAfterReload === 'held', heldAfterReload);
    // A study toast raised now stays off the lock screen (held in this page until the unlock).
    await ev(`(window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: 'Mined 猫 (e2e lock3)' } })), true)`);
    await ctx.sleep(300);
    result.check('a study toast is not drawn on the lock screen', (await ev(`(document.querySelector('.os-toast-host')?.innerText || '').includes('e2e lock3')`)) === false);

    // --- 5. Unlock: the held work runs, the toast arrives --------------------------------
    const unlocked = await unlockWith(PIN2);
    result.check('the right PIN unlocks', Boolean(unlocked));
    const answered = await ev(`(async () => Promise.race([Promise.resolve(window.api.listLibrary()).then(() => 'answered'), new Promise((r) => setTimeout(() => r('held'), 3000))]))()`, { await: true });
    result.check('after the unlock data calls are answered again', answered === 'answered', answered);
    const toast = await poll(ctx, `(document.querySelector('.os-toast-host')?.innerText || '').includes('e2e lock3') || null`, 6000);
    result.check('the toast held during the lock is shown after it', Boolean(toast));
    await poll(ctx, `!!document.querySelector('.desktop-root') || null`, 10000);

    // --- 6. Each skin draws its clock, study panel and recovery link ---------------------
    const skins = [
      ['wired', '.lockscreen-wired', `[...document.querySelectorAll('.lockscreen-wired-clock-label')].map((n) => n.textContent).join('|') === 'PRESENT DAY|PRESENT TIME'`],
      ['aero', '.lockscreen-aero', `!!document.querySelector('.lockscreen-aero-clock time')`],
    ];
    for (const [material, selector, extra] of skins) {
      await ev(`(document.documentElement.setAttribute('data-materials', ${JSON.stringify(material)}), true)`);
      await ev(`window.api.globalCommandsRun('app.lock')`, { await: true });
      const drawn = await poll(ctx, `(() => { const l = document.querySelector(${JSON.stringify(selector)}); return l && l.querySelector('.lockscreen-study') && [...l.querySelectorAll('button')].some((b) => b.textContent === 'Forgot your PIN?') ? true : null; })()`, 10000);
      result.check(`${material} lock: skin, study panel and recovery link`, Boolean(drawn) && (await ev(extra)) === true);
      if (material === 'wired') {
        const t1 = await ev(`document.querySelector('.lockscreen-wired-clock time')?.textContent || ''`);
        await ctx.sleep(1300);
        const t2 = await ev(`document.querySelector('.lockscreen-wired-clock time')?.textContent || ''`);
        result.check('WIRED clock ticks seconds (HH:MM:SS)', /\d{2}:\d{2}:\d{2}/.test(t2) && t1 !== t2, { t1, t2 });
      }
      await ctx.sleep(400);
      await ctx.shot(`${material}-locked`);
      const open = await unlockWith(PIN2, { enter: true });
      result.check(`${material} lock: the PIN typed into its password field (Enter) unlocks`, Boolean(open));
      await ev(`(document.documentElement.removeAttribute('data-materials'), true)`);
      await poll(ctx, `!document.querySelector('.lockscreen[role=dialog]') || null`, 8000);
    }
    result.check('"Lock Gum now" from the command locks and unlocks cleanly twice', (await isLocked()) === false);

    // Blanc: its own minimal lock with the same study panel and recovery link.
    await ctx.e2e('clickTray', { label: 'Open Blanc' });
    let blanc = null;
    for (let i = 0; i < 60 && !blanc; i++) {
      blanc = (await status()).windows.find((w) => /blanc/i.test(w.url)) ?? null;
      if (!blanc) await ctx.sleep(250);
    }
    if (blanc) {
      for (let i = 0; i < 40; i++) {
        const r = await ctx.request('/eval', { window: blanc.id, js: `document.readyState === 'complete' && !!document.querySelector('#root > *')` });
        if (r.ok && r.result) break;
        await ctx.sleep(400);
      }
      await ev(`window.api.lockscreenLock()`, { await: true });
      let blancOk = false;
      for (let i = 0; i < 40 && !blancOk; i++) {
        const r = await ctx.request('/eval', { window: blanc.id, js: `(() => { const l = document.querySelector('.blanc-lock'); return !!(l && l.querySelector('.blanc-lock-time') && l.querySelector('.lockscreen-study--blanc') && [...l.querySelectorAll('button')].some((b) => b.textContent === 'Forgot your PIN?')); })()` });
        blancOk = Boolean(r.ok && r.result);
        if (!blancOk) await ctx.sleep(250);
      }
      result.check('Blanc lock: clock, study panel and recovery link', blancOk);
      await ctx.sleep(400);
      await ctx.shot('blanc-locked', { window: blanc.id });
      await unlockWith(PIN2);
      await ctx.request('/eval', { window: blanc.id, js: 'window.close(), true' }).catch(() => null);
    } else {
      result.check('Blanc opened for the skin check', false);
    }

    // --- 7. Answer a card before the PIN ------------------------------------------------
    await ev(`(() => { const s = JSON.parse(localStorage.getItem('jp-study-lockscreen-v1') || '{}'); s.answerToUnlock = true; s.study = 'card'; localStorage.setItem('jp-study-lockscreen-v1', JSON.stringify(s)); return true; })()`);
    await ev(`window.api.lockscreenLock()`, { await: true });
    const challenge = await poll(ctx, `!!document.querySelector('.lockscreen-challenge') || null`, 10000);
    result.check('with "answer a card" on, the card comes first and the PIN pad waits', Boolean(challenge) && (await ev(`!document.querySelector('.lockscreen-win11-pad')`)) === true);
    await ctx.sleep(400);
    await ctx.shot('challenge');
    // Answer it: the right choice from the deck, a self-check, or "Continue" on an empty deck.
    const answeredHow = await ev(`(() => {
      const front = document.querySelector('.lockscreen-challenge-front')?.textContent?.trim();
      const opts = [...document.querySelectorAll('.lockscreen-challenge-option')];
      if (opts.length) {
        const deck = JSON.parse(localStorage.getItem('jp-flashcard-deck') || '{"cards":[]}');
        const cards = deck.cards || deck;
        const strip = (s) => String(s || '').replace(/<[^>]*>/g, '').split(/[;\\n；]/)[0].replace(/\\s+/g, ' ').trim();
        const card = cards.find((c) => strip(c.word || c.front) === front);
        const meaning = card ? strip(card.meaning || card.back) : null;
        const pick = opts.find((b) => meaning && b.innerText.includes(meaning.slice(0, 20)));
        if (pick) { pick.click(); return 'choice'; }
        return 'no-match';
      }
      const show = [...document.querySelectorAll('.lockscreen-challenge button')].find((b) => /Show answer|Continue/.test(b.textContent));
      if (show) { show.click(); if (/Continue/.test(show.textContent)) return 'empty-deck'; }
      const ok = [...document.querySelectorAll('.lockscreen-challenge button')].find((b) => /remembered/.test(b.textContent));
      if (ok) { ok.click(); return 'self-check'; }
      return 'none';
    })()`);
    result.note(`challenge answered by: ${answeredHow}`);
    const pinStep = await poll(ctx, `!!document.querySelector('.lockscreen-win11-pad') || null`, 5000);
    result.check('after the card the PIN is still required (main still locked)', Boolean(pinStep) && (await isLocked()) === true, answeredHow);
    const cardOfDay = await ev(`document.querySelector('.lockscreen-study-front')?.textContent || null`);
    result.note(`card mode, after the challenge: card of the day ${cardOfDay ? 'shown' : 'absent (empty deck)'}`);
    await unlockWith(PIN2);
    await ev(`(() => { const s = JSON.parse(localStorage.getItem('jp-study-lockscreen-v1') || '{}'); s.answerToUnlock = false; s.study = 'count'; localStorage.setItem('jp-study-lockscreen-v1', JSON.stringify(s)); return true; })()`);

    // --- 8. Recovery code: unlocks once, removes the PIN ---------------------------------
    await ev(`window.api.lockscreenLock()`, { await: true });
    await poll(ctx, `[...document.querySelectorAll('button')].some((b) => b.textContent === 'Forgot your PIN?') || null`, 10000);
    await ev(`(() => { [...document.querySelectorAll('button')].find((b) => b.textContent === 'Forgot your PIN?').click(); return true; })()`);
    await poll(ctx, `!!document.querySelector('.lockscreen-recovery-input') || null`, 5000);
    await ev(`(() => { __e2e.fill('.lockscreen-recovery-input', 'ZZZZ-ZZZZ-ZZZZ-ZZZZ'); document.querySelector('.lockscreen-recovery').requestSubmit(); return true; })()`);
    const wrongCode = await poll(ctx, `(document.querySelector('.lockscreen-recovery-status')?.textContent || '').trim() || null`, 5000);
    result.check('a wrong recovery code is refused (and counts toward the backoff)', /not right|Try again in/.test(wrongCode || '') && (await isLocked()) === true, wrongCode);
    await ev(`(() => { __e2e.fill('.lockscreen-recovery-input', ${JSON.stringify((code || '').toLowerCase())}); document.querySelector('.lockscreen-recovery').requestSubmit(); return true; })()`);
    const recovered = await pollAsync(ctx, `(async () => (await window.api.lockscreenIsLocked()) === false || null)()`, 10000);
    const afterRecovery = await lockStatus();
    result.check('the recovery code (typed in lower case) unlocks and removes the PIN', Boolean(recovered) && afterRecovery?.hasPin === false && afterRecovery?.hasRecovery === false, afterRecovery);
    const recoveryToast = await poll(ctx, `(document.querySelector('.os-toast-host')?.innerText || '').includes('recovery code') || null`, 6000);
    result.check('after the recovery the desktop says the PIN was removed', Boolean(recoveryToast));
    const end = await status();
    result.check('nothing reached the desktop', end.visibleWindows === 0 && end.violations.length === 0, end.windows);
    await ctx.sleep(400);
    await ctx.shot('recovered');

    // Leave no lock behind.
    await ev(`(() => { localStorage.setItem('jp-study-lockscreen-v1', JSON.stringify({ enabled: false, pinHash: '', tint: 'auto' })); return true; })()`);
  },
};
