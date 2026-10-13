'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Video study through the Seanime sidecar (SEANIME_EXE): a generated 20 s clip with a
 * `.ja.srt` beside it is opened in the study player, the subtitle is discovered, and the
 * study keys are pressed for real (CDP key events): U auto-pause, R replay line, L line
 * loop, C mine the line — which must make a card from the line on screen.
 *
 * Video study round 2: "?" opens the keyboard help (#study-sheet-keys, listing the
 * "line starts now" and condensed-audio rows), the lead-in set in the Study sheet
 * (`clipPadBeforeMs`) is what the mined card's cut asks for (read back from the headless
 * witness in main/videoClip.ts), and "Condensed audio" saves a `(condensed).mp3` download.
 */
const fs = require('node:fs');
const { installHelpers, poll } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');

/** The lead-in the flow sets: not the 250 ms default, and inside the 0.5 s gap between lines. */
const PAD_BEFORE_MS = 400;
const PAD_DEFAULT_MS = 250;
const CONDENSED_RE = /\(condensed\)\.mp3$/;

/** Open (or close) one of the study bar's sheets by its toggle. */
const toggleSheet = (category) => `(() => { const b = document.querySelector('[data-study-sheet-toggle="${category}"]'); if (!b) return false; b.click(); return true; })()`;

/** Set the Study sheet's lead-in (a React-controlled number input), then leave the field so keys reach the player. */
const setPadBefore = (ms) => `(() => {
  const input = document.querySelector('#study-sheet-study [data-study-pref="clipPadBeforeMs"]');
  if (!input) return null;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(${ms}));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.blur();
  return input.value;
})()`;

const DECK = `(() => { const d = JSON.parse(localStorage.getItem('jp-flashcard-deck') || '{"cards":[]}'); return d.cards || d; })()`;

module.exports = {
  id: 'video',
  title: 'Video study (Seanime sidecar): U/R/L/C, ? keyboard help, clip lead-in, condensed audio',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const v = await fixtures.video(ctx.mediaDir);

    let status = await ev(`window.api.seanimeStatus()`, { await: true });
    if (status?.kind === 'stopped') status = await ev(`window.api.seanimeStart()`, { await: true });
    if (status?.kind !== 'ready') {
      if (status?.errorCode === 'missing-exe') {
        result.skip(`no Seanime sidecar binary (SEANIME_EXE): ${status.error}`);
        return;
      }
      result.check('the Seanime sidecar starts', false, status);
      return;
    }
    result.check('the Seanime sidecar is up (loopback, private datadir)', status.port > 0 && String(status.dataDir).includes('seanime-e2e'), { port: status.port, dataDir: status.dataDir, version: status.version });

    await ev(`(window.dispatchEvent(new CustomEvent('seanime:media-workspace-open', { detail: { localFilePath: ${JSON.stringify(v.mp4)} } })), true)`);
    const playing = await poll(ctx, `(() => { const x = document.querySelector('video'); return x && x.readyState >= 2 && x.duration > 19 ? Math.round(x.duration) : null; })()`, 60000, 500);
    result.check('the study player opens the local file (20 s)', playing === 20, playing);

    await ev(`(() => { const x = document.querySelector('video'); x.currentTime = 9.5; x.play(); return true; })()`);
    const cue = await poll(ctx, `document.querySelector('.study-cue-text')?.innerText?.trim() || null`, 10000);
    // The cue line may carry a grammar-level badge (e.g. "N5") in front of the text.
    result.check('the .ja.srt beside the video is discovered and shown', Boolean(cue) && cue.endsWith(fixtures.SUBS[2][2]), { cue, want: fixtures.SUBS[2][2] });
    // Let the seeked frame and the controls paint before the capture.
    await ctx.request('/click', { window: 'main', x: 640, y: 300 });
    await ctx.sleep(1500);
    await ctx.shot('cue');

    // Keyboard focus on the player surface, then the study keys.
    await ctx.request('/click', { window: 'main', x: 640, y: 300 });
    await ctx.sleep(400);
    // Toasts are recorded as they appear (never touched: they are React's nodes).
    await ev(`(() => {
      if (window.__e2eToastLog) return true;
      window.__e2eToastLog = [];
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) {
          if (n.nodeType === 1 && /toast/i.test(String(n.className))) window.__e2eToastLog.push(n.innerText || n.textContent || '');
        }
      }).observe(document.body, { childList: true, subtree: true });
      return true;
    })()`);
    const key = (k) => ctx.request('/key', { window: 'main', key: k });

    // A toggle: press until it reports "on" (a profile that already had it on says "off" first).
    const toggleOn = async (k, onRe, anyRe) => {
      const seen = [];
      for (let i = 0; i < 2; i++) {
        const from = await ev(`window.__e2eToastLog.length`);
        await key(k);
        const said = await poll(ctx, `window.__e2eToastLog.slice(${from}).find((x) => ${anyRe}.test(x)) || null`, 4000);
        seen.push(said);
        if (said && onRe.test(said)) return { on: true, seen };
      }
      return { on: false, seen };
    };
    const autoPause = await toggleOn('u', /Auto-pause on/, /Auto-pause (on|off)/);
    result.check('U toggles auto-pause (and says so)', autoPause.on, autoPause.seen);

    await ev(`(() => { const x = document.querySelector('video'); x.currentTime = 11.2; x.play(); return true; })()`);
    await ctx.sleep(300);
    await key('r');
    const replay = await poll(ctx, `(() => { const t = document.querySelector('video').currentTime; return t >= 8.4 && t < 10.5 ? Math.round(t * 10) / 10 : null; })()`, 3000, 100);
    result.check('R replays the line from its start (8.5 s)', replay !== null, replay);

    const loop = await toggleOn('l', /loop on/i, /loop (on|off)/i);
    result.check('L toggles the line loop (and says so)', loop.on, loop.seen);
    const looped = await poll(ctx, `(() => { const x = document.querySelector('video'); window.__e2eLoopMax = Math.max(window.__e2eLoopMax || 0, x.currentTime); return window.__e2eLoopMax > 11.5 && x.currentTime < 10 ? true : null; })()`, 8000, 100);
    result.check('the loop brings playback back to the start of the line', Boolean(looped));

    // "?" opens the keyboard help, with the round-2 rows in it; "?" again closes it.
    await ctx.request('/key', { window: 'main', key: '?', modifiers: ['shift'] });
    const help = await poll(ctx, `(() => { const sheet = document.querySelector('#study-sheet-keys'); if (!sheet) return null; return { prev: Boolean(sheet.querySelector('[data-command="video.alignPrevLine"]')), next: Boolean(sheet.querySelector('[data-command="video.alignNextLine"]')), condensed: Boolean(sheet.querySelector('[data-command="video.condensedAudio"]')) }; })()`, 4000).catch(() => null);
    result.check('? opens the keyboard help (#study-sheet-keys)', Boolean(help), help);
    if (help) result.check('the help lists "line starts now" and condensed audio', help.prev && help.next && help.condensed, help);
    await ctx.shot('keys-help');
    await ctx.request('/key', { window: 'main', key: '?', modifiers: ['shift'] });
    await poll(ctx, `!document.querySelector('#study-sheet-keys') || null`, 3000).catch(() => undefined);

    // The card's lead-in, set where the learner sets it (Study sheet › Card audio).
    await ev(toggleSheet('study'));
    await poll(ctx, `Boolean(document.querySelector('#study-sheet-study [data-study-pref="clipPadBeforeMs"]')) || null`, 4000).catch(() => undefined);
    const padSet = await ev(setPadBefore(PAD_BEFORE_MS));
    const padShown = await poll(ctx, `(() => { const i = document.querySelector('#study-sheet-study [data-study-pref="clipPadBeforeMs"]'); return i && Number(i.value) === ${PAD_BEFORE_MS} ? Number(i.value) : null; })()`, 3000).catch(() => null);
    result.check(`the Study sheet takes a ${PAD_BEFORE_MS} ms lead-in`, padShown === PAD_BEFORE_MS, { padSet, padShown });
    await ev(toggleSheet('study'));
    await ev(`(document.activeElement && document.activeElement !== document.body && document.activeElement.blur(), true)`);

    const before = await ev(`${DECK}.map((c) => c.id)`);
    const toastsFrom = await ev(`window.__e2eToastLog.length`);
    const clipsFrom = await ev(`Date.now()`);
    await key('c');
    const mined = await poll(ctx, `(() => { const known = new Set(${JSON.stringify(before)}); const fresh = ${DECK}.filter((c) => !known.has(c.id)); return fresh.length ? fresh.map((c) => ({ word: c.word, sentence: c.sentence, source: c.source, media: Boolean(c.audioPath || c.audioDataUrl || c.imagePath || c.clipPath), cue: c.cueStartSec ?? null })) : null; })()`, 15000, 300);
    const said = await ev(`window.__e2eToastLog.slice(${toastsFrom})`);
    result.check('C mines the line: one new card with the line as its sentence', Boolean(mined) && mined.length === 1 && mined[0].sentence === fixtures.SUBS[2][2], { mined, toasts: said });
    if (mined) result.check('the mined card carries the line\'s media (audio / still / clip)', mined[0].media === true, mined[0]);
    result.note(`mined card: ${JSON.stringify(mined)}`);
    await ctx.shot('mined');

    // The mined card's cut asked for the lead-in set above (headless witness, main/videoClip.ts).
    const clipRequests = async () => ((await ctx.e2e('status')).calls ?? [])
      .filter((c) => c.api === 'clip request' && c.ts >= clipsFrom)
      .map((c) => { try { return JSON.parse(c.detail); } catch { return { raw: c.detail }; } });
    let mineClips = [];
    for (let i = 0; i < 20 && !mineClips.some((c) => c.kind === 'audio'); i++) {
      mineClips = await clipRequests();
      if (!mineClips.some((c) => c.kind === 'audio')) await ctx.sleep(250);
    }
    const audioCut = mineClips.find((c) => c.kind === 'audio');
    result.check(
      `the mined card's clip request uses the ${PAD_BEFORE_MS} ms lead-in`,
      Boolean(audioCut) && Math.abs(audioCut.padBeforeSec - PAD_BEFORE_MS / 1000) < 0.001 && Math.abs(audioCut.startSec - fixtures.SUBS[2][0]) < 0.05,
      mineClips,
    );
    if (mineClips.some((c) => c.kind === 'video')) {
      result.check('…and so does its video clip', mineClips.filter((c) => c.kind === 'video').every((c) => Math.abs(c.padBeforeSec - PAD_BEFORE_MS / 1000) < 0.001), mineClips);
    }

    // Condensed audio: every line as one MP3, saved as a download the harness records.
    const downloads = async () => ((await ctx.e2e('status')).calls ?? [])
      .filter((c) => c.api === 'download (saved without a dialog)' && CONDENSED_RE.test(String(c.detail)))
      .map((c) => String(c.detail));
    const downloadsBefore = (await downloads()).length;
    await ev(toggleSheet('study'));
    const clicked = await poll(ctx, `(() => { const b = document.querySelector('#study-sheet-study [data-study-action="condensed-audio"]'); if (!b || b.disabled) return null; b.click(); return true; })()`, 4000).catch(() => null);
    result.check('the Study sheet offers Condensed audio for a local file', clicked === true, clicked);
    let saved = null;
    for (let i = 0; i < 120 && !saved; i++) {
      const all = await downloads();
      if (all.length > downloadsBefore) saved = all[all.length - 1];
      else await ctx.sleep(250);
    }
    let bytes = 0;
    for (let i = 0; saved && i < 40 && !bytes; i++) {
      try { bytes = fs.statSync(saved).size; } catch { bytes = 0; }
      if (!bytes) await ctx.sleep(250);
    }
    result.check('Condensed audio is saved as a "(condensed).mp3" download', Boolean(saved) && CONDENSED_RE.test(saved), { saved, bytes });
    if (saved) result.check('the condensed MP3 is not empty', bytes > 0, { saved, bytes });
    await ctx.shot('condensed');

    // Put the lead-in back for any later flow on this profile (the Study sheet is still open).
    await ev(setPadBefore(PAD_DEFAULT_MS)).catch(() => undefined);
    await ev(toggleSheet('study')).catch(() => undefined);
    await key('l');
    await key('u');
    await ev(`(document.querySelector('video')?.pause(), window.dispatchEvent(new CustomEvent('seanime:media-workspace-close')), true)`);
  },
};
