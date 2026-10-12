'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * YouTube: a local fixture video stands in for a finished download — `<title> [<id>].mp4`
 * with its `.ja.srt`, exactly where yt-dlp leaves one — registered in the library and in
 * the YouTube store (`yt-playlists.json`) as a downloaded video of a playlist. No yt-dlp,
 * no youtube.com: the store says the playlist was just checked and does not auto-update.
 *
 * A second "download" carries only YouTube's auto-captions (`.ja.vtt` in the rolling form
 * yt-dlp saves: spacer line, the previous line repeated, word-timing tags, 10 ms carry
 * cues). The study path is the user's: the playlist's study progress → "Next" → the study
 * player with the subtitle → C mines the line on screen; then the auto-caption video plays
 * one line at a time, warns that the captions are machine-made, and mines a single line.
 */
const fs = require('node:fs');
const path = require('node:path');
const { installHelpers, poll, pollAsync, DECK } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');

const AUTO_ID = 'E2Eyt0002bb';
const AUTO_TITLE = '自動字幕 E2E';
const SP = ' ';
/** YouTube's rolling auto-caption VTT, spacer lines included. */
const AUTO_VTT = [
  'WEBVTT', 'Kind: captions', 'Language: ja', '',
  '00:00:01.000 --> 00:00:04.990 align:start position:0%', SP, '皆さん<00:00:01.600><c>こんにちは</c>', '',
  '00:00:04.990 --> 00:00:05.000 align:start position:0%', '皆さんこんにちは', SP, '',
  '00:00:05.000 --> 00:00:09.990 align:start position:0%', '皆さんこんにちは', '日本語の<00:00:05.800><c>勉強を</c><00:00:06.600><c>しましょう</c>', '',
  '00:00:09.990 --> 00:00:10.000 align:start position:0%', '日本語の勉強をしましょう', SP, '',
  '00:00:10.000 --> 00:00:14.000 align:start position:0%', '日本語の勉強をしましょう', 'まず<00:00:10.600><c>ひらがなから</c>', '',
].join('\n');
const AUTO_LINE = '日本語の勉強をしましょう';

const rowText = (title) => `(() => { const r = [...document.querySelectorAll('.yt-row')].find((x) => x.innerText.includes(${JSON.stringify(title)})); return r ? r.innerText.replace(/\\s+/g, ' ').slice(0, 160) : null; })()`;
const openRow = (title) => `(() => { const r = [...document.querySelectorAll('.yt-row')].find((x) => x.innerText.includes(${JSON.stringify(title)})); const b = r && [...r.querySelectorAll('button')].find((x) => /Open in Video/i.test(x.innerText || x.getAttribute('aria-label') || '')); if (b) { b.click(); return 'button'; } if (r) { r.click(); return 'row'; } return null; })()`;
const progressText = `(() => { const p = document.querySelector('[data-yt5-progress]'); return p ? p.innerText.replace(/\\s+/g, ' ').trim() : null; })()`;
const closePlayer = `(document.querySelector('video')?.pause(), window.dispatchEvent(new CustomEvent('seanime:media-workspace-close')), true)`;

module.exports = {
  id: 'youtube',
  title: 'YouTube: playlist progress -> study player -> mine; rolling auto-captions one line at a time',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const yt = await fixtures.youtubeDownload(ctx.mediaDir);
    // The auto-caption download: the same clip under its own yt-dlp name, with only a .ja.vtt.
    const autoBase = path.join(path.dirname(yt.mp4), `${AUTO_TITLE} [${AUTO_ID}]`);
    fs.copyFileSync(yt.mp4, `${autoBase}.mp4`);
    fs.writeFileSync(`${autoBase}.ja.vtt`, AUTO_VTT, 'utf8');

    const items = await ev(`window.api.addMediaPaths(${JSON.stringify([yt.mp4, `${autoBase}.mp4`])})`, { await: true });
    const item = Array.isArray(items) ? items.find((i) => i.path === yt.mp4) : null;
    const autoItem = Array.isArray(items) ? items.find((i) => i.path === `${autoBase}.mp4`) : null;
    result.check('the downloaded files are in the media library', Boolean(item && autoItem), item && { id: item.id, title: item.title, auto: autoItem?.title });
    if (!item) return;

    // The YouTube store, as finished downloads leave it (main re-reads it on every call).
    const now = Date.now();
    const store = {
      version: 1,
      folders: [],
      channels: [],
      playlists: [{
        id: 'pl-e2e', title: 'E2E 日本語リスニング', url: 'https://www.youtube.com/playlist?list=PLe2e0000', youtubePlaylistId: 'PLe2e0000',
        subscriptionStatus: 'subscribed', lang: 'ja', preferSubs: ['ja'], autoUpdate: false, lastSyncedAt: now, lastCheckedAt: now,
        updateFrequencyHours: 12, sortDefault: 'playlist', createdAt: now,
      }],
      videos: [{
        id: 'v-e2e-1', playlistId: 'pl-e2e', youtubeId: yt.id, title: yt.title, url: `https://www.youtube.com/watch?v=${yt.id}`,
        durationSec: 20, position: 0, firstSeenAt: now, publishedAt: now - 86_400_000,
        downloaded: true, mediaItemId: item.id, hasOfficialSubs: true, hasAutoSubs: false, transcribed: false,
      }, ...(autoItem ? [{
        id: 'v-e2e-2', playlistId: 'pl-e2e', youtubeId: AUTO_ID, title: AUTO_TITLE, url: `https://www.youtube.com/watch?v=${AUTO_ID}`,
        durationSec: 20, position: 1, firstSeenAt: now, publishedAt: now - 3_600_000,
        downloaded: true, mediaItemId: autoItem.id, hasOfficialSubs: false, hasAutoSubs: true, transcribed: false,
      }] : [])],
      lastNewsCheckedAt: now,
      lastNewsVideoIds: ['v-e2e-1'],
      planToWatchIds: [],
    };
    fs.writeFileSync(path.join(ctx.profile, 'yt-playlists.json'), JSON.stringify(store, null, 2));

    await ev(`__e2e.open('youtube')`);
    // The playlist itself (not the News tab): its rows and its study progress.
    await poll(ctx, `(() => { const p = [...document.querySelectorAll('.yt-pl-item')].find((x) => x.innerText.includes('E2E')); if (p) p.click(); return !!p; })()`, 10000);
    const rowEl = await poll(ctx, rowText(yt.title), 10000);
    result.check('the YouTube app lists the downloaded video', Boolean(rowEl), rowEl);
    const progress = await poll(ctx, progressText, 10000);
    result.check('the playlist shows its study progress: nothing watched yet, both videos downloaded, "Next" names the first', Boolean(progress)
      && /0 of 2 videos watched/.test(progress) && /2 of 2 downloaded/.test(progress) && progress.includes(`Next: ${yt.title}`), progress);
    await ctx.shot('list');
    const net = (await ctx.e2e('status')).network ?? [];
    result.check('opening the YouTube app fetched nothing from YouTube (store is fresh, no auto-update)', !net.some((n) => /youtube|ytimg|googlevideo/.test(n.detail)), net.map((n) => n.detail).slice(-10));

    let status = await ev(`window.api.seanimeStatus()`, { await: true });
    if (status?.kind === 'stopped') status = await ev(`window.api.seanimeStart()`, { await: true });
    if (status?.kind !== 'ready') {
      if (status?.errorCode === 'missing-exe') {
        result.note(`study player not reached: no Seanime sidecar binary (${status.error})`);
        return;
      }
      result.check('the Seanime sidecar starts', false, status);
      return;
    }

    // "Next" on the progress strip is the way in; the row's own button is the fallback.
    const viaNext = await ev(`__e2e.click('[data-yt5-action="continue"]')`);
    const opened = viaNext ? 'next' : await ev(openRow(yt.title));
    const playing = await poll(ctx, `(() => { const x = document.querySelector('video'); return x && x.readyState >= 2 && x.duration > 19 ? Math.round(x.duration) : null; })()`, 60000, 500);
    result.check('"Next" on the playlist progress opens the downloaded file in the study player', Boolean(opened) && playing === 20, { opened, playing });
    if (playing !== 20) return;
    await ev(`(() => { const x = document.querySelector('video'); x.currentTime = 4.8; x.play(); return true; })()`);
    const cue = await poll(ctx, `document.querySelector('.study-cue-text')?.innerText?.trim() || null`, 10000);
    result.check('its .ja.srt is picked up as the study subtitle', Boolean(cue) && cue.endsWith(fixtures.SUBS[1][2]), { cue, want: fixtures.SUBS[1][2] });
    await ctx.request('/click', { window: 'main', x: 640, y: 300 });
    await ev(`document.querySelector('video')?.pause()`);
    await ctx.sleep(800);
    await ctx.shot('study');
    const before = await ev(`${DECK}.map((c) => c.id)`);
    await ctx.request('/key', { window: 'main', key: 'c' });
    const mined = await poll(ctx, `(() => { const known = new Set(${JSON.stringify(before)}); const fresh = ${DECK}.filter((c) => !known.has(c.id)); return fresh.length ? fresh.map((c) => ({ word: c.word, sentence: c.sentence, source: c.source, bookId: c.bookId })) : null; })()`, 15000, 300);
    result.check('C mines the subtitle line of the downloaded video', Boolean(mined) && mined.some((c) => c.sentence === fixtures.SUBS[1][2]), mined);
    const linked = await pollAsync(ctx, `window.api.listMedia().then((l) => (l || []).find((m) => m.id === ${JSON.stringify(item.id)}) || null)`, 3000);
    result.note(`library item: ${JSON.stringify(linked && { title: linked.title, kind: linked.kind })}`);

    // The episode quiz (optional AI, docs/AI_AUDIT.md N9/N10) with "Use AI features" OFF: the
    // AI workspace still holds the quiz with its deterministic parts, and no AI control shows.
    await ev(`window.api.aiSetupSetEnabled(false)`, { await: true });
    const aiOff = await poll(ctx, `document.documentElement.hasAttribute('data-ai-off') ? true : null`, 8000);
    await ev(`(() => { const b = document.querySelector('[data-study-category="ai"]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); return !!b; })()`);
    const quizOpened = await poll(ctx, `(() => { const b = document.querySelector('[data-media-brief="post"] [data-media-brief-open]'); if (b) { b.click(); return 'opened'; } return document.querySelector('section[data-media-brief="post"]') ? 'open' : null; })()`, 10000);
    const quiz = quizOpened ? await poll(ctx, `(() => { const s = document.querySelector('section[data-media-brief="post"]'); if (!s) return null; const entries = [...s.querySelectorAll('[data-ai-entry]')]; return { aiEntries: entries.length, allHidden: entries.every((e) => getComputedStyle(e).display === 'none'), run: !!s.querySelector('[data-media-brief-run]'), text: s.innerText.replace(/\\s+/g, ' ').slice(0, 160) }; })()`, 15000) : null;
    result.check('with AI off the episode quiz opens in the AI workspace with no AI control on offer',
      Boolean(aiOff) && Boolean(quiz) && quiz.allHidden && !quiz.run, { aiOff, quizOpened, quiz });
    await ctx.shot('episode-quiz-ai-off');
    await ev(`window.api.aiSetupSetEnabled(true)`, { await: true });
    await ev(closePlayer);

    // Back in the playlist: the card just mined is counted for it.
    await ev(`__e2e.open('youtube')`);
    await poll(ctx, `(() => { const p = [...document.querySelectorAll('.yt-pl-item')].find((x) => x.innerText.includes('E2E')); if (p && !p.classList.contains('active')) p.click(); return !!p; })()`, 10000);
    const afterMine = await poll(ctx, `(() => { const t = ${progressText}; return t && /1 card mined/.test(t) ? t : null; })()`, 10000);
    result.check('the playlist progress counts the card mined from it', Boolean(afterMine), afterMine ?? await ev(progressText));

    // The auto-caption download: warned about, and played one line at a time.
    if (!autoItem) return;
    // The first video's element can outlive its workspace for a moment: tell the new one apart.
    await ev(`(document.querySelectorAll('video').forEach((x) => { x.dataset.e2eOld = x.currentSrc || x.src || '-'; }), true)`);
    const autoOpened = await poll(ctx, openRow(AUTO_TITLE), 10000);
    // The warning is a toast: read it while it is up, before waiting on the player.
    const warned = await poll(ctx, `(() => { const hit = [...document.querySelectorAll('body *')].find((x) => x.children.length === 0 && /speech recognition/.test(x.textContent || '')); return hit ? hit.textContent.trim().slice(0, 120) : null; })()`, 8000, 150);
    result.check('opening it warns that the captions are YouTube speech recognition', Boolean(warned), warned);
    const autoPlaying = await poll(ctx, `(() => { const x = [...document.querySelectorAll('video')].find((v) => v.dataset.e2eOld !== (v.currentSrc || v.src || '-') && v.readyState >= 2 && v.duration > 19); if (!x) return null; window.__e2eAutoVideo = x; return Math.round(x.duration); })()`, 60000, 500);
    result.check('the auto-caption video opens in the study player', Boolean(autoOpened) && Boolean(autoPlaying), { autoOpened, autoPlaying });
    if (!autoPlaying) return;
    // The sidecar is timed against the audio before it mounts, which takes a moment: hold the
    // playhead inside the second line (nudging it so every poll is a seek) until it shows.
    await ev(`(() => { const x = window.__e2eAutoVideo; x.pause(); x.currentTime = 7.2; return true; })()`);
    const autoCue = await poll(ctx, `(() => { const x = window.__e2eAutoVideo; const t = [...document.querySelectorAll('.study-cue-text')].map((c) => c.innerText.trim()).find((c) => c.includes('勉強')); if (!t && x) x.currentTime = x.currentTime < 7.25 ? 7.3 : 7.2; return t || null; })()`, 60000, 1000);
    result.check('a rolling auto-caption shows ONE line, not the previous line stacked above it',
      Boolean(autoCue) && autoCue.endsWith(AUTO_LINE) && !autoCue.includes('こんにちは'), { autoCue, want: AUTO_LINE });
    await ev(`window.__e2eAutoVideo?.pause()`);
    await ctx.sleep(600);
    await ctx.shot('auto-captions');
    const beforeAuto = await ev(`${DECK}.map((c) => c.id)`);
    await ctx.request('/click', { window: 'main', x: 640, y: 300 });
    await ev(`window.__e2eAutoVideo?.pause()`);
    await ctx.request('/key', { window: 'main', key: 'c' });
    const minedAuto = await poll(ctx, `(() => { const known = new Set(${JSON.stringify(beforeAuto)}); const fresh = ${DECK}.filter((c) => !known.has(c.id)); return fresh.length ? fresh.map((c) => ({ word: c.word, sentence: c.sentence })) : null; })()`, 15000, 300);
    result.check('C mines the single auto-caption line (no doubled sentence)', Boolean(minedAuto) && minedAuto.some((c) => c.sentence === AUTO_LINE), minedAuto);
    await ev(closePlayer);
  },
};
