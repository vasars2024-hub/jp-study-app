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
 *  - the recovery code unlocks once and removes the PIN;
 *  - lock4: auto-lock through Electron's REAL powerMonitor: the harness (debug bridge
 *    `/e2e` action `power`, headless only) emits `suspend` / `lock-screen` on it and
 *    overrides the system idle time the 15 s auto-lock poll reads. Nothing reaches
 *    Windows: the PC never sleeps and the session is never locked;
 *  - lock4: an 8-digit PIN (the pad gains an Enter key) and a passphrase typed on the
 *    keyboard into a labelled field on every skin (Study OS, WIRED, Aero, Blanc).
 *
 * Not drivable here: a Windows clock moved while Gum is closed (the harness may not
 * change the system clock). That is unit-tested (lockscreenPin.test.ts "lock4: the
 * clock moved forward while Gum was closed").
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

    // --- 7b. Auto-lock through Electron's REAL powerMonitor (lock4) -----------------------
    // The harness emits `suspend` / `lock-screen` on the real powerMonitor object (what
    // Windows' notification makes Electron do) and overrides the idle time the auto-lock
    // poll reads. Nothing reaches Windows: the PC does not sleep, its session is not locked.
    // The idle reading is pinned to 0 first, so the owner walking away mid-run cannot
    // trip the 1-minute idle lock early and make a check below pass by accident.
    await ctx.e2e('power', { idleSeconds: 0 });
    const autoOn = await ev(`window.api.lockscreenSetAutoLock({ idleMinutes: 1, onSleep: true, onScreenLock: true })`, { await: true });
    result.check('auto-lock is set in main (idle 1 min, on sleep, on Windows lock)', autoOn?.ok === true && autoOn?.status?.autoLock?.onSleep === true && autoOn?.status?.autoLock?.onScreenLock === true, autoOn?.status?.autoLock);
    const lockedNow = () => pollAsync(ctx, `(async () => (await window.api.lockscreenIsLocked()) === true || null)()`, 8000).catch(() => null);
    const logSays = async (mark, needle) => {
      for (let i = 0; i < 20; i++) {
        if (mainLog().slice(mark).includes(needle)) return true;
        await ctx.sleep(150);
      }
      return false;
    };
    let mark = mainLog().length;
    const suspend = await ctx.e2e('power', { event: 'suspend' });
    const bySleep = await lockedNow();
    result.check('a powerMonitor "suspend" arms the lock (auto-lock: sleep)', suspend.ok === true && Boolean(bySleep) && (await logSays(mark, 'auto-lock: sleep')), { suspend: suspend.ok, power: suspend.power });
    await poll(ctx, `!!document.querySelector('.lockscreen[role=dialog]') || null`, 10000);
    result.check('...and the PIN pad comes up', true);
    await unlockWith(PIN2);
    await ev(`window.api.lockscreenSetAutoLock({ onSleep: false })`, { await: true });
    await ctx.e2e('power', { event: 'suspend' });
    await ctx.sleep(1200);
    result.check('with "on sleep" off, a suspend leaves Gum unlocked', (await isLocked()) === false);
    mark = mainLog().length;
    const winL = await ctx.e2e('power', { event: 'lock-screen' });
    const byWinL = await lockedNow();
    result.check('a powerMonitor "lock-screen" (Win+L) arms the lock (auto-lock: screen-lock)', winL.ok === true && Boolean(byWinL) && (await logSays(mark, 'auto-lock: screen-lock')));
    await unlockWith(PIN2);
    // Idle: the real 15 s poll reads the (overridden) system idle time.
    mark = mainLog().length;
    const idle = await ctx.e2e('power', { idleSeconds: 61 });
    const byIdle = await pollAsync(ctx, `(async () => (await window.api.lockscreenIsLocked()) === true || null)()`, 25000, 500).catch(() => null);
    result.check('61 s of system idle with "after 1 minute" set: the auto-lock poll arms the lock (auto-lock: idle)', idle.ok === true && Boolean(byIdle) && (await logSays(mark, 'auto-lock: idle')), idle.power);
    // Back to "nobody idle" BEFORE the unlock, or the next poll locks again at once.
    await ctx.e2e('power', { idleSeconds: 0 });
    await unlockWith(PIN2);
    const autoOff = await ev(`window.api.lockscreenSetAutoLock({ idleMinutes: 0, onSleep: false, onScreenLock: false })`, { await: true });
    await ctx.e2e('power', { idleSeconds: null });
    result.check('auto-lock off again; Gum unlocked', autoOff?.ok === true && (await isLocked()) === false);
    const refused = await ctx.e2e('power', { event: 'resume' });
    result.check('the harness only fires the two events auto-lock arms on', refused.ok === false, refused.error);

    // --- 7c. A longer PIN (lock4): the pad gains an Enter key ------------------------------
    const LONG = '24681357';
    const toLong = await ev(`window.api.lockscreenSetPin(${JSON.stringify(PIN2)}, ${JSON.stringify(LONG)})`, { await: true });
    result.check('an 8-digit PIN is accepted by main (kind "pin", the recovery code kept)', toLong?.ok === true && toLong?.status?.secretKind === 'pin' && toLong?.status?.hasRecovery === true, toLong?.status);
    await ev(`window.api.lockscreenLock()`, { await: true });
    const longPad = await poll(ctx, `(() => { const pad = document.querySelector('.lockscreen-win11-pad'); const enter = pad && [...pad.querySelectorAll('button')].find((b) => b.textContent === 'Enter'); return enter ? enter.getBoundingClientRect().height : null; })()`, 10000);
    result.check('Study OS lock: the pad has an Enter key (>= 24 px) for a longer PIN', Number(longPad) >= 24, longPad);
    await typePin(LONG);
    result.check('typing 8 digits does not submit by itself', (await isLocked()) === true);
    const dots = await ev(`document.querySelectorAll('.lockscreen-win11-dot.is-filled').length`);
    result.check('...and shows 8 filled dots', dots === 8, dots);
    await ctx.request('/key', { window: 'main', key: 'Enter' });
    const longOpen = await pollAsync(ctx, `(async () => (await window.api.lockscreenIsLocked()) === false || null)()`, 10000).catch(() => null);
    result.check('Enter submits the longer PIN and unlocks', Boolean(longOpen));

    // --- 7d. A passphrase (lock4): every skin draws a labelled text field -------------------
    const PASS = 'river stone 9';
    const toPass = await ev(`window.api.lockscreenSetPin(${JSON.stringify(LONG)}, ${JSON.stringify(PASS)})`, { await: true });
    result.check('a passphrase is accepted by main (kind "passphrase")', toPass?.ok === true && toPass?.status?.secretKind === 'passphrase', toPass?.status);
    const mirror = await ev(`JSON.parse(localStorage.getItem('jp-study-lockscreen-v1') || '{}')`);
    // Set through the bridge, not Settings, so the mirror's kind is stale on purpose: the lock
    // screens below must take the kind from main, not from this window's copy.
    result.check('the renderer mirror never holds the passphrase (and its kind is stale: not "passphrase" yet)', mirror?.secretKind !== 'passphrase' && !JSON.stringify(mirror).includes('river'), { secretKind: mirror?.secretKind });
    const typeSecret = async (text, win = 'main') => {
      await ctx.request('/type', { window: win, text });
      await ctx.request('/key', { window: win, key: 'Enter' });
      await ctx.sleep(700);
    };
    const passSkins = [
      ['studyos', null, '.lockscreen-pass-input'],
      ['wired', 'wired', '#wired-access-code'],
      ['aero', 'aero', '.lockscreen-aero-pass'],
    ];
    for (const [label, material, field] of passSkins) {
      if (material) await ev(`(document.documentElement.setAttribute('data-materials', ${JSON.stringify(material)}), true)`);
      await ev(`window.api.lockscreenLock()`, { await: true });
      // The first frame draws from this window's (stale) mirror; main's answer follows a
      // moment later. Wait for the passphrase field, then for the entrance animation.
      await poll(ctx, `(() => { const f = document.querySelector(${JSON.stringify(field)}); return f && f.inputMode === 'text' ? true : null; })()`, 10000).catch(() => null);
      await ctx.sleep(900);
      const info = await poll(ctx, `(() => { const f = document.querySelector(${JSON.stringify(field)}); if (!f) return null; const go = f.form && f.form.querySelector('button[type=submit]'); return { label: f.getAttribute('aria-label'), mode: f.inputMode, max: f.maxLength, focused: document.activeElement === f, go: go ? Math.min(go.getBoundingClientRect().width, go.getBoundingClientRect().height) : 0, goName: go ? (go.getAttribute('aria-label') || go.textContent.trim()) : '', sheet: go ? getComputedStyle(go).borderTopLeftRadius === '50%' : false, pad: !!document.querySelector('.lockscreen-win11-pad, .lockscreen-pad') }; })()`, 10000);
      // Setting `data-materials` by hand does not load Aero's lazy sheet (aero-vista.css: the
      // round 32 px orb). Then the orb is an unstyled button and its size says nothing about
      // the real skin; the CSS floor is hitTargetFloor24's job. Said, not hidden.
      const sizeOk = info?.go >= 24 || (label === 'aero' && info?.sheet === false);
      if (label === 'aero' && info?.sheet === false) result.note(`aero: lazy theme sheet not loaded by the attribute; orb measured unstyled (${info?.go} px), size left to hitTargetFloor24`);
      result.check(`${label} lock: a focused, labelled passphrase field (text, 64 chars) with a named >= 24 px submit, no digit pad`, info?.label === 'Passphrase' && info?.mode === 'text' && info?.max === 64 && info?.focused === true && sizeOk && Boolean(info?.goName) && info?.pad === false, info);
      await typeSecret('river stone 8');
      result.check(`${label} lock: a wrong passphrase does not unlock`, (await isLocked()) === true);
      await ctx.sleep(400);
      await ctx.shot(`passphrase-${label}`);
      await typeSecret(PASS);
      const open = await pollAsync(ctx, `(async () => (await window.api.lockscreenIsLocked()) === false || null)()`, 10000).catch(() => null);
      result.check(`${label} lock: the passphrase typed on the keyboard (Enter) unlocks`, Boolean(open));
      if (material) await ev(`(document.documentElement.removeAttribute('data-materials'), true)`);
      await poll(ctx, `!document.querySelector('.lockscreen[role=dialog]') || null`, 8000);
      if (!material) {
        const fixed = await ev(`JSON.parse(localStorage.getItem('jp-study-lockscreen-v1') || '{}').secretKind`);
        result.check('the lock screen corrected the stale mirror from main (next first frame is right)', fixed === 'passphrase', fixed);
      }
    }
    // Blanc: its own lock, the same passphrase.
    await ctx.e2e('clickTray', { label: 'Open Blanc' });
    let blancP = null;
    for (let i = 0; i < 60 && !blancP; i++) {
      blancP = (await status()).windows.find((w) => /blanc/i.test(w.url)) ?? null;
      if (!blancP) await ctx.sleep(250);
    }
    if (blancP) {
      for (let i = 0; i < 40; i++) {
        const r = await ctx.request('/eval', { window: blancP.id, js: `document.readyState === 'complete' && !!document.querySelector('#root > *')` });
        if (r.ok && r.result) break;
        await ctx.sleep(400);
      }
      await ev(`window.api.lockscreenLock()`, { await: true });
      let blancInfo = null;
      for (let i = 0; i < 40 && !blancInfo; i++) {
        const r = await ctx.request('/eval', { window: blancP.id, js: `(() => { const f = document.querySelector('.blanc-lock input.is-passphrase'); const b = document.querySelector('.blanc-lock-submit'); if (!f || !b) return null; return { label: f.closest('label')?.textContent?.trim() || '', mode: f.inputMode, focused: document.activeElement === f, button: Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height), dots: !!document.querySelector('.blanc-lock-dots') }; })()` });
        blancInfo = r.ok ? r.result : null;
        if (!blancInfo) await ctx.sleep(250);
      }
      result.check('Blanc lock: a labelled, focused passphrase field and an Unlock button (>= 24 px), no dots', Boolean(blancInfo) && /Passphrase/.test(blancInfo.label) && blancInfo.mode === 'text' && blancInfo.focused === true && blancInfo.button >= 24 && blancInfo.dots === false, blancInfo);
      await ctx.shot('passphrase-blanc', { window: blancP.id });
      await typeSecret(PASS, blancP.id);
      const blancOpen = await pollAsync(ctx, `(async () => (await window.api.lockscreenIsLocked()) === false || null)()`, 10000).catch(() => null);
      result.check('Blanc lock: the passphrase (Enter) unlocks', Boolean(blancOpen));
      await ctx.request('/eval', { window: blancP.id, js: 'window.close(), true' }).catch(() => null);
    } else {
      result.check('Blanc opened for the passphrase check', false);
    }

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
