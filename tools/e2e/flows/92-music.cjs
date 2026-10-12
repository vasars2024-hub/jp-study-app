'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Music: two generated songs (tones, AAC) with a synced `.lrc` beside each are added to
 * the library, one is played and the other queued from the song menu; the lyrics come
 * from the `.lrc` (no LRCLIB lookup), and a lyric line is studied — seek to it, replay
 * it, loop it with "Repeat line" — and mined into the deck. "Next" then plays the queue.
 */
const { installHelpers, poll, DECK } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');

module.exports = {
  id: 'music',
  title: 'Music: queue + lyric line study (.lrc)',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const songs = await fixtures.music(ctx.mediaDir);
    const [rain, morning] = songs;
    const items = await ev(`window.api.addMediaPaths(${JSON.stringify(songs.map((s) => s.file))})`, { await: true });
    result.check('two songs are added to the library', Array.isArray(items) && songs.every((s) => items.some((i) => i.path === s.file)), Array.isArray(items) ? items.length : items);

    await ev(`__e2e.open('music')`);
    const rows = await poll(ctx, `(() => { const r = [...document.querySelectorAll('.music-row.music-song')].map((x) => x.innerText); return ${JSON.stringify(songs.map((s) => s.title))}.every((t) => r.some((x) => x.includes(t))) ? r.length : null; })()`, 20000);
    result.check('the Music app lists both songs', Boolean(rows), rows);
    const row = (title) => `[...document.querySelectorAll('.music-row.music-song')].find((r) => r.innerText.includes(${JSON.stringify(title)}))`;

    await ev(`(${row(rain.title)}).click()`);
    const playing = await poll(ctx, `(() => { const i = document.querySelector('.mc-player-info')?.innerText || ''; const lines = document.querySelectorAll('.music-lyrics .music-line').length; return i.includes(${JSON.stringify(rain.title)}) && lines ? { info: i.replace(/\\s+/g, ' '), lines } : null; })()`, 15000);
    result.check('clicking a song plays it (now playing + its lyrics)', Boolean(playing), playing);

    // Queue the second song from the song menu.
    await ev(`(() => { const r = ${row(morning.title)}; const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 20, clientY: b.top + 5 })); return true; })()`);
    const queued = await poll(ctx, `(() => { const m = [...document.querySelectorAll('[role=menuitem]')].find((x) => __e2e.vis(x) && x.innerText.trim() === 'Add to queue'); if (!m) return null; m.click(); return true; })()`, 5000);
    const queue = await poll(ctx, `(() => { const q = [...document.querySelectorAll('.mc-track-row')].map((x) => x.innerText.replace(/\\s+/g, ' ').trim()); return q.length >= 2 ? q : null; })()`, 5000);
    result.check('"Add to queue" from the song menu queues the second song', Boolean(queued) && Boolean(queue) && queue.slice(1).some((x) => x.includes(morning.title)), queue);

    // Lyrics from the .lrc beside the song, line by line.
    const lyr = await ev(`({ source: document.querySelector('.music-lyrics-source')?.textContent ?? '', lines: [...document.querySelectorAll('.music-lyrics .music-line .music-line-text')].map((x) => x.textContent.trim()) })`);
    result.check('the lyrics are the .lrc next to the song (no network lookup)', /\.lrc/.test(lyr.source) && JSON.stringify(lyr.lines) === JSON.stringify(rain.lines.map(([, l]) => l)), lyr);

    // Study one line: seek to it (double-click), replay it, loop it.
    const target = rain.lines[1][1];
    const lineSel = `[...document.querySelectorAll('.music-lyrics .music-line')].find((l) => l.querySelector('.music-line-text')?.textContent.trim() === ${JSON.stringify(target)})`;
    await ev(`(${lineSel}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    const onLine = await poll(ctx, `(${lineSel})?.classList.contains('active') || null`, 5000, 100);
    result.check('double-clicking a lyric line seeks to it (it becomes the active line)', Boolean(onLine));
    await ctx.shot('lyrics');
    await ev(`__e2e.clickText('.music-study-bar button', 'Repeat line')`);
    const repeatOn = await poll(ctx, `__e2e.byText('.music-study-bar button', 'Repeat line')?.getAttribute('aria-pressed') === 'true' || null`, 3000);
    // The line runs 4.0-8.0 s: past its end the loop must bring it back instead of moving on.
    const samples = [];
    for (let i = 0; i < 12; i++) {
      samples.push(await ev(`[...document.querySelectorAll('.music-lyrics .music-line')].findIndex((l) => l.classList.contains('active'))`));
      await ctx.sleep(500);
    }
    result.check('"Repeat line" keeps playback on the studied line past its end', Boolean(repeatOn) && samples.every((s) => s === 1), { repeatOn, samples });
    await ev(`__e2e.clickText('.music-study-bar button', 'Repeat line')`);
    await ev(`__e2e.clickText('.music-cue-nav button', 'Replay line')`);
    const replay = await poll(ctx, `(${lineSel})?.classList.contains('active') || null`, 3000, 100);
    result.check('"Replay line" stays on (restarts) the line', Boolean(replay));

    // Mine it.
    const before = await ev(`${DECK}.map((c) => c.id)`);
    await ev(`(${lineSel}).querySelector('.music-line-mine').click()`);
    const mined = await poll(ctx, `(() => { const known = new Set(${JSON.stringify(before)}); const fresh = ${DECK}.filter((c) => !known.has(c.id)); return fresh.length ? fresh.map((c) => ({ word: c.word, sentence: c.sentence, source: c.source, folder: c.folder, audio: Boolean(c.audioPath || c.audioDataUrl) })) : null; })()`, 20000, 300);
    const label = await poll(ctx, `(() => { const t = (${lineSel})?.querySelector('.music-line-mine')?.textContent?.trim(); return t && !/…|\\.\\.\\./.test(t) && t !== 'Mine' ? t : null; })()`, 20000, 300);
    result.check('"Mine" on the lyric line makes a card with the line as its sentence', Boolean(mined) && mined.some((c) => (c.sentence || c.word || '').includes(target)), { mined, label });
    await ctx.shot('mined');

    // The queue: Next plays the queued song, with its own .lrc. The player bar's own Next
    // (icon-only, named by its title): an unscoped `[aria-label=Next]` matched nothing here
    // and instead clicked the Calendar's "next month" when an earlier flow left it open.
    const nextClicked = await ev(`(() => { const bar = document.querySelector('.mc-playerbar .mc-player-transport'); const b = bar && [...bar.querySelectorAll('button')].find((x) => __e2e.vis(x) && (x.getAttribute('title') === 'Next' || x.getAttribute('aria-label') === 'Next')); if (b) b.click(); return !!b; })()`);
    result.check('the player bar offers its own Next button', nextClicked === true);
    const next = await poll(ctx, `(() => { const i = document.querySelector('.mc-player-info')?.innerText || ''; const l = [...document.querySelectorAll('.music-lyrics .music-line-text')].map((x) => x.textContent.trim()); return i.includes(${JSON.stringify(morning.title)}) && l[0] === ${JSON.stringify(morning.lines[0][1])} ? { info: i.replace(/\\s+/g, ' '), first: l[0] } : null; })()`, 10000);
    result.check('"Next" plays the queued song with its own lyrics', Boolean(next), next);
    await ev(`(() => { const b = document.querySelector('.mc-player-play'); if (b && /Pause/i.test(b.getAttribute('aria-label') || b.textContent || '')) b.click(); return true; })()`);
  },
};
