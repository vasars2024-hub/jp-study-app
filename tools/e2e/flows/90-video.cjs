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
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');
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

/**
 * Click-to-first-frame, measured in the page: `__e2eOpenTimer.start(label)` stamps t0 and
 * records, against it, the first `loadeddata` (a frame is decoded) and `playing` of any
 * <video>, every distinct loading/state text the player host shows on the way, and any text
 * that reads as a server failure ("not running", "Start the media server", "offline"...).
 * The caller then performs the open (an event, a click) right after `start`.
 */
const OPEN_TIMER = `(() => {
  if (window.__e2eOpenTimer) return true;
  const BAD = /not running|not started|isn.t running|server (is )?(stopped|offline|failed)|media server (offline|is (stopped|offline|failed))|start the media server|sidecar|Video error|Unrecoverable/i;
  const textOf = (el) => (el ? String(el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  const api = {
    rec: null,
    start(label) {
      const rec = { label, t0: performance.now(), firstFrame: null, playing: null, states: [], bad: [] };
      api.rec = rec;
      const at = () => Math.round(performance.now() - rec.t0);
      const onMedia = (e) => {
        if (api.rec !== rec || !(e.target instanceof HTMLVideoElement)) return;
        if (e.type === 'loadeddata' && rec.firstFrame == null) rec.firstFrame = at();
        if (e.type === 'playing' && rec.playing == null) rec.playing = at();
      };
      document.addEventListener('loadeddata', onMedia, true);
      document.addEventListener('playing', onMedia, true);
      let last = '';
      const snap = () => {
        if (api.rec !== rec) return;
        const host = document.querySelector('.seanime-host') || document.querySelector('.blanc-study-player')?.closest('fieldset') || null;
        const parts = [];
        if (host) {
          const status = textOf(host.querySelector('.seanime-host-status'));
          if (status) parts.push('bar: ' + status);
          for (const el of host.querySelectorAll('.lq-loading, .seanime-host-state, [data-player-frame], .seanime-host-body > p, #media-workspace > p, #media-workspace > div > p, [data-study-player="loading"]')) {
            const t = textOf(el).slice(0, 140);
            if (t) parts.push(t);
          }
          const frame = host.querySelector('[data-player-frame]');
          if (frame) parts.push('frame:' + (frame.getAttribute('data-player-frame') || ''));
        }
        const now = parts.join(' | ');
        if (now !== last) { last = now; rec.states.push([at(), now]); }
        const scan = [textOf(host), ...[...document.querySelectorAll('[data-sonner-toaster], .toast, [class*="toast"]')].map(textOf)].join(' \\n ');
        const m = BAD.exec(scan);
        if (m && !rec.bad.some((b) => b[1] === m[0])) rec.bad.push([at(), m[0], scan.slice(Math.max(0, m.index - 60), m.index + 80)]);
      };
      const mo = new MutationObserver(snap);
      mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-player-frame', 'data-study-player', 'data-sidecar'] });
      rec.stop = () => { mo.disconnect(); document.removeEventListener('loadeddata', onMedia, true); document.removeEventListener('playing', onMedia, true); };
      snap();
      return true;
    },
    read() {
      const r = api.rec;
      if (!r) return null;
      return { label: r.label, firstFrame: r.firstFrame, playing: r.playing, states: r.states.slice(0, 40), bad: r.bad.slice(0, 10) };
    },
    stop() { const out = api.read(); api.rec?.stop?.(); api.rec = null; return out; },
  };
  window.__e2eOpenTimer = api;
  return true;
})()`;

const openEvent = (detail) => `(window.dispatchEvent(new CustomEvent('seanime:media-workspace-open', { detail: ${JSON.stringify(detail)} })), true)`;
const closePlayer = `(document.querySelectorAll('video').forEach((x) => x.pause()), window.dispatchEvent(new CustomEvent('seanime:media-workspace-close')), true)`;

/**
 * Time one open: install the timer, run `open` (page JS), wait for the first decoded frame
 * (and `playing`), and return `{ label, firstFrame, playing, states, bad }` (ms from t0).
 */
async function timeOpen(ctx, label, open, { timeout = 60000, window = 'main' } = {}) {
  const run = (js) => ctx.eval(js, { window });
  await run(OPEN_TIMER);
  await run(`window.__e2eOpenTimer.start(${JSON.stringify(label)})`);
  await run(open);
  const deadline = Date.now() + timeout;
  let rec = null;
  while (Date.now() < deadline) {
    rec = await run(`window.__e2eOpenTimer.read()`).catch(() => null);
    if (rec && rec.firstFrame != null && rec.playing != null) break;
    await ctx.sleep(50);
  }
  // A paused open (resume lands paused on some paths) has a frame but never `playing`.
  await ctx.sleep(400);
  return (await run(`window.__e2eOpenTimer.stop()`).catch(() => null)) ?? rec;
}

module.exports = {
  /** Shared with 91-youtube.cjs: the in-page click-to-first-frame timer. */
  timing: { OPEN_TIMER, timeOpen },
  id: 'video',
  title: 'Video study (Seanime sidecar): U/R/L/C, ? keyboard help, clip lead-in, condensed audio',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const v = await fixtures.video(ctx.mediaDir);

    // ---- Click-to-first-frame, every way in that reaches the player ------------------------
    // Seamless playback (2026-10-13): every open is timed from the request to the <video>'s
    // first decoded frame, against a budget, and no loading state may ever read as a server
    // problem ("Media server stopped", "not running", "offline", "Start the media server").
    const timings = [];
    const timed = async (label, open, { budgetMs, keepOpen = false, ...opts } = {}) => {
      const rec = await timeOpen(ctx, label, open, opts);
      timings.push({ ...rec, budgetMs });
      result.note(`timing ${label}: firstFrame=${rec?.firstFrame ?? 'none'} ms, playing=${rec?.playing ?? 'none'} ms; states=${JSON.stringify(rec?.states ?? [])}; bad=${JSON.stringify(rec?.bad ?? [])}`);
      if (budgetMs) result.check(`${label}: first frame within ${budgetMs} ms`, rec?.firstFrame != null && rec.firstFrame <= budgetMs, { firstFrame: rec?.firstFrame, playing: rec?.playing, states: rec?.states });
      result.check(`${label}: no "server not started" / error text on the way`, (rec?.bad ?? []).length === 0, rec?.bad);
      if (!keepOpen) {
        await ev(closePlayer);
        await ctx.sleep(600);
      }
      return rec;
    };
    const sidecar = () => ev(`window.api.seanimeStatus()`, { await: true });
    const waitSidecar = (want, timeout = 20000) => pollAsync(ctx, `window.api.seanimeStatus().then((s) => (${JSON.stringify(want)}.includes(s.kind) ? s : null))`, timeout, 100);
    const statusBefore = await sidecar();
    result.note(`sidecar before the first open: ${statusBefore?.kind}`);
    if (statusBefore?.errorCode === 'missing-exe') {
      result.check('a missing media server is known before any play (stated, not discovered on play)', statusBefore.kind === 'failed', statusBefore);
    } else {
      const libCopy = v.mp4.replace(/\.mp4$/, '-library.mp4');
      fs.copyFileSync(v.mp4, libCopy);
      fs.copyFileSync(v.srt, libCopy.replace(/\.mp4$/, '.ja.srt'));
      await ev(`window.api.addMediaPaths(${JSON.stringify([libCopy])})`, { await: true });

      // Cold: the media server is down when the video is picked (idle app, or a first open
      // right after boot) — the open itself has to bring it up.
      await ev(`window.api.seanimeStop()`, { await: true });
      await waitSidecar(['stopped'], 5000);
      // A file the library has never seen (Files app, drag-and-drop, "Open with Gum").
      await timed('cold: unknown file, media server stopped', openEvent({ localFilePath: v.mp4 }), { budgetMs: 4000 });
      await timed('warm: same file again (re-open / resume)', openEvent({ localFilePath: v.mp4 }), { budgetMs: 1500 });
      // A library item (Media Center play, Continue Watching, YouTube "Next").
      await timed('warm: library item', openEvent({ localFilePath: libCopy }), { budgetMs: 1500 });
      await timed('warm: Continue Watching (startAtSec 6)', openEvent({ localFilePath: libCopy, startAtSec: 6 }), { budgetMs: 1500 });
      await ev(`window.api.seanimeStop()`, { await: true });
      await waitSidecar(['stopped'], 5000);
      await timed('cold: library item, media server stopped', openEvent({ localFilePath: libCopy }), { budgetMs: 4000 });

      // A killed media server comes back by itself — never "offline" with a Start button.
      const up = await waitSidecar(['ready'], 15000);
      if (up?.pid) {
        await ev(`(() => { window.__e2eSidecarKinds = []; window.__e2eSidecarOff?.(); window.__e2eSidecarOff = window.api.onSeanimeStatus((s) => window.__e2eSidecarKinds.push(s.kind + (s.recovering ? ':recovering' : ''))); return true; })()`);
        try { process.kill(up.pid); } catch { /* already gone */ }
        const back = await pollAsync(ctx, `window.api.seanimeStatus().then((s) => (s.kind === 'ready' && s.pid && s.pid !== ${up.pid} ? s : null))`, 20000, 100);
        const kinds = await ev(`(window.__e2eSidecarOff?.(), window.__e2eSidecarKinds)`);
        result.check('a killed media server restarts by itself (new pid, ready)', Boolean(back), { before: up.pid, after: back?.pid, kinds });
        result.check('…and never reports itself offline or failed on the way', Array.isArray(kinds) && !kinds.some((k) => /^(offline|failed)/.test(k)), kinds);
        await timed('after a media-server crash: library item', openEvent({ localFilePath: libCopy }), { budgetMs: 1500 });

        // Killed WHILE a video plays: the player is rebuilt under the opening frame and the
        // video plays again from where it was, with no error and no button to press.
        await timed('crash mid-video: open', openEvent({ localFilePath: libCopy, startAtSec: 2 }), { budgetMs: 1500, keepOpen: true });
        await ctx.sleep(1200);
        const before = await ev(`(() => { const x = [...document.querySelectorAll('video')].find((v) => v.readyState >= 2); return x ? Math.round(x.currentTime * 10) / 10 : null; })()`);
        const mid = await sidecar();
        await ev(OPEN_TIMER);
        await ev(`window.__e2eOpenTimer.start('crash mid-video: recovery')`);
        try { process.kill(mid.pid); } catch { /* already gone */ }
        let recovered = null;
        for (let i = 0; i < 200 && !recovered; i++) {
          const rec = await ev(`window.__e2eOpenTimer.read()`).catch(() => null);
          if (rec && rec.playing != null) recovered = rec;
          else await ctx.sleep(100);
        }
        const recRead = (await ev(`window.__e2eOpenTimer.stop()`).catch(() => null)) ?? recovered;
        await ctx.sleep(500);
        const playingNow = await ev(`(() => { const x = [...document.querySelectorAll('video')].find((v) => v.readyState >= 2); return x ? { t: Math.round(x.currentTime * 10) / 10, paused: x.paused } : null; })()`);
        result.note(`timing crash mid-video: recovery: playing again after ${recRead?.playing ?? 'never'} ms; states=${JSON.stringify(recRead?.states ?? [])}; bad=${JSON.stringify(recRead?.bad ?? [])}`);
        result.check('a media server killed mid-video: playback resumes by itself within 8 s', Boolean(recovered) && recRead.playing <= 8000 && Boolean(playingNow), { playingAfterMs: recRead?.playing, now: playingNow });
        result.check('…with no error or server text on screen', (recRead?.bad ?? []).length === 0, recRead?.bad);
        result.check('…continuing from where it was, not from the open request start point', before != null && playingNow != null && playingNow.t >= before - 0.6, { before, now: playingNow });
        timings.push({ label: 'crash mid-video: back to playing', firstFrame: recRead?.firstFrame, playing: recRead?.playing, bad: recRead?.bad, budgetMs: 8000 });
        await ev(closePlayer);
        await ctx.sleep(600);
      } else {
        result.check('the media server is up for the crash test', false, up);
      }
      // Blanc's toolbox player: the Media tab, a library item clicked. Blanc never warms the
      // server at launch (lowest memory) — its Media tab does, the moment it is shown.
      await ctx.e2e('clickTray', { label: 'Open Blanc' });
      let blanc = null;
      for (let i = 0; i < 60 && !blanc; i++) {
        const wins = (await ctx.e2e('status')).windows ?? [];
        blanc = wins.find((w) => /blanc/i.test(w.url ?? '')) ?? null;
        if (!blanc) await ctx.sleep(250);
      }
      const bev = (js) => ctx.request('/eval', { window: blanc.id, js }).then((r) => (r.ok ? r.result : null));
      let blancTab = null;
      for (let i = 0; blanc && i < 60 && !blancTab; i++) {
        blancTab = await bev(`(() => { if (document.readyState !== 'complete') return null; window.dispatchEvent(new CustomEvent('os:open', { detail: 'media' })); return [...document.querySelectorAll('.media-card')].some((c) => c.innerText.includes('asa-no-kaiwa-e2e-library')) || null; })()`).catch(() => null);
        if (!blancTab) await ctx.sleep(500);
      }
      result.check('Blanc opens, and its Media tab lists the library item', Boolean(blancTab), { blanc, blancTab });
      if (blancTab) {
        await ctx.sleep(1500);
        await timed('Blanc: library item in the toolbox player', `(() => { const c = [...document.querySelectorAll('.media-card')].find((x) => x.innerText.includes('asa-no-kaiwa-e2e-library')); c?.click(); return Boolean(c); })()`, { budgetMs: 1500, window: blanc.id, keepOpen: true });
        await bev(`(document.querySelectorAll('video').forEach((x) => x.pause()), true)`);
      }

      result.note(`timings: ${JSON.stringify(timings.map((t) => ({ label: t?.label, firstFrame: t?.firstFrame, playing: t?.playing, budgetMs: t?.budgetMs, bad: (t?.bad ?? []).length })))}`);
    }

    let status = await ev(`window.api.seanimeStatus()`, { await: true });
    if (status?.kind !== 'ready' && status?.errorCode !== 'missing-exe') status = await ev(`window.api.seanimeStart()`, { await: true });
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
