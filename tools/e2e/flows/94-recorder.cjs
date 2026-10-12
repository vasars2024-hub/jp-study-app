'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Screen recorder without the screen: headless mode answers every page's
 * `getDisplayMedia` with a synthetic testsrc-like canvas stream (colour bars, a moving
 * block, a frame counter) and refuses any display-media request that still reaches a
 * session, so nothing real is captured. The real recorder runs end to end on it: the
 * hidden host window records 3 s with MediaRecorder, main finalizes it with the bundled
 * ffmpeg into an MP4 in the run's folder, and the MP4 is imported into the library.
 * Deleting it from the history goes to the run's own trash, never the Recycle Bin.
 */
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installHelpers, pollAsync } = require('./_lib.cjs');

const FFMPEG = path.join(__dirname, '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const SCREENS = path.join(os.homedir(), 'Videos', 'Gum Showcase', 'screens');

/** Duration (s) and the video stream line of a media file, read with ffmpeg itself. */
function probe(file) {
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-i', file], { windowsHide: true }, (_err, _o, stderr) => {
      const text = String(stderr ?? '');
      const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
      resolve({
        seconds: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null,
        video: /Stream #\S+.*Video: ([^\n]+)/.exec(text)?.[1]?.slice(0, 120) ?? null,
      });
    });
  });
}

function frameTo(file, out, at = 1.5) {
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at), '-i', file, '-frames:v', '1', out], { windowsHide: true }, (err) => resolve(!err));
  });
}

module.exports = {
  id: 'recorder',
  title: 'Recorder: synthetic capture stream -> 3 s MP4 -> library',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const folder = path.join(ctx.runDir, 'recordings');
    fs.mkdirSync(folder, { recursive: true });
    const settings = await ev(`window.api.recorderSetSettings({ folder: ${JSON.stringify(folder)}, audio: 'none', encoder: 'software', autoOpen: false, autoTranscribe: false, fps: 30 })`, { await: true });
    result.check('recorder settings: the run\'s folder, no audio, software encoder', settings?.settings?.folder === folder, settings?.settings);
    const defaults = settings?.defaultFolder ?? '';
    result.note(`default folder under the harness: ${defaults}`);
    result.check('the default recordings folder is inside the temp profile, not the owner\'s Videos', !defaults || defaults.toLowerCase().startsWith(ctx.profile.toLowerCase()), defaults);

    // The window picker: headless mode's desktopCapturer lists no windows, so no title of
    // anything the owner has open can reach the app (or this report).
    const sourcesBefore = (await ctx.e2e('status')).isolation?.capture?.getSources ?? 0;
    const windows = await ev(`window.api.recorderListWindows()`, { await: true });
    const sourcesAfter = (await ctx.e2e('status')).isolation?.capture?.getSources ?? 0;
    result.check('"Choose a window" lists no real windows (desktopCapturer answered by the stub)', Array.isArray(windows) && windows.length === 0 && sourcesAfter > sourcesBefore, { windows: Array.isArray(windows) ? windows.length : windows, getSources: [sourcesBefore, sourcesAfter] });
    const statusBefore = (await ctx.e2e('status')).isolation ?? {};
    const started = await ev(`window.api.recorderStart('full')`, { await: true });
    const live = await pollAsync(ctx, `window.api.recorderGetState().then((s) => s && s.phase === 'recording' ? { phase: s.phase, startedAt: s.startedAt, source: s.source } : null)`, 20000, 200);
    result.check('"Record the whole screen" starts recording (on the synthetic stream)', Boolean(live), { started: started && { phase: started.phase, errorKey: started.errorKey, errorDetail: started.errorDetail }, live });
    if (!live) return;
    const t0 = Date.now();
    try {
      await ctx.shot('panel', { window: 'regionRecorder=panel' });
    } catch (err) {
      result.note(`no panel screenshot: ${err.message}`);
    }
    await ctx.sleep(Math.max(0, 3000 - (Date.now() - t0)));
    const stopped = await ev(`window.api.recorderStop()`, { await: true });
    const job = await pollAsync(ctx, `window.api.recorderGetState().then((s) => { const j = (s.jobs || [])[0]; return j && (j.phase === 'ready' || j.phase === 'error' || j.phase === 'transcribing') ? j : null; })`, 90000, 500);
    result.check('the recording is finalized (ffmpeg) without an error', job && job.phase !== 'error', job && { phase: job.phase, errorKey: job.errorKey, encoder: job.encoder, outputPath: job.outputPath, durationMs: job.durationMs, stopped: stopped?.phase });
    if (!job || !job.outputPath) return;

    const out = job.outputPath;
    const info = fs.existsSync(out) ? await probe(out) : null;
    result.check('an MP4 of about 3 s lands in the run\'s folder', Boolean(info) && path.dirname(out) === folder && /\.mp4$/i.test(out) && info.seconds >= 2 && info.seconds <= 5.5, { out, info });
    const frame = path.join(SCREENS, 'e2e-recorder-frame.png');
    if (await frameTo(out, frame)) {
      result.screens.push(frame);
      result.note('a frame of the recorded MP4 (synthetic bars, never the screen) is saved as e2e-recorder-frame.png');
    }
    const media = await pollAsync(ctx, `window.api.listMedia().then((l) => (l || []).find((m) => m.path === ${JSON.stringify(out)}) || null)`, 15000, 500);
    result.check('the recording is imported into the library', Boolean(media) && (!job.mediaId || media.id === job.mediaId), media && { id: media.id, title: media.title });

    const after = (await ctx.e2e('status')).isolation ?? {};
    const notes = (after.shimNotes ?? []).filter((n) => /getDisplayMedia/.test(n));
    result.check('the host window got the synthetic stream; no session display-media request was granted', notes.length > 0 && (after.capture?.displayMediaRefused ?? 0) === (statusBefore.capture?.displayMediaRefused ?? 0), { notes: notes.slice(-3), capture: after.capture });

    // History "Delete": the run's own trash, never the Recycle Bin.
    const history = await ev(`window.api.recorderHistory()`, { await: true });
    const entry = (history ?? []).find((h) => h.outputPath === out);
    if (entry) {
      // The import's own readers (probe, thumbnail) can hold the fresh MP4 open for a
      // moment, and Windows refuses to move an open file — the real Recycle Bin would
      // too. Like a user, try again shortly.
      let answer = null;
      for (let i = 0; i < 10; i++) {
        answer = await ev(`window.api.recorderHistoryAction(${JSON.stringify(entry.id)}, 'delete')`, { await: true });
        if (answer?.ok || !fs.existsSync(out)) break;
        await ctx.sleep(1000);
      }
      const calls = (await ctx.e2e('status')).calls ?? [];
      const trashed = calls.find((c) => c.api === 'shell.trashItem (moved inside the run)');
      result.check('"Delete" from the history goes to the run\'s trash (stubbed shell.trashItem)', !fs.existsSync(out) && Boolean(trashed) && /e2e-trash/.test(trashed.detail), { answer, trashed });
    } else {
      result.note('the recording is not in the history list; delete not exercised');
    }
  },
};
