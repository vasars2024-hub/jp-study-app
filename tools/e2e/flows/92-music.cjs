'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Music: generated songs (tones, AAC) with a synced `.lrc` beside each are added to
 * the library, one is played and the other queued from the song menu; the lyrics come
 * from the `.lrc` (no LRCLIB lookup), and a lyric line is studied — seek to it, replay
 * it, loop it with "Repeat line" — and mined into the deck. "Next" then plays the queue:
 * an enhanced-LRC song that fills in word by word and lights nothing through its
 * instrumental break, whose timing is nudged and reset. A third song finds its `.lrc`
 * in a `Lyrics` folder beside it (offline folder match). The library holds three songs.
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
    // Responsiveness across the whole flow. The karaoke check below samples a 12 s song
    // through the bridge, and in every run one sample used to arrive 6-8 s late. That
    // was not the renderer: Electron's MAIN process sat in one 5-8 s garbage collection
    // of the ~900 MB the first-boot dictionary provisioning had left in its heap, and
    // every bridge call waited behind it (measured 2026-10-13: a main-process /health
    // probe took 6.5-8.3 s while the page's own 50 ms heartbeat never missed a beat).
    // Provisioning now runs in the dictionary utility process (yomitanStoreHost.ts);
    // these two watchers keep either kind of stall from coming back unnoticed.
    await ev(`(() => { window.__e2eLongTasks = []; try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__e2eLongTasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) }); }).observe({ type: 'longtask' }); } catch { /* no long-task timing here */ } return true; })()`);
    const mainStalls = [];
    let watchingMain = true;
    // Bounded, so a flow that throws midway cannot leave the probe running after teardown.
    const watchUntil = Date.now() + 180_000;
    const mainWatch = (async () => {
      while (watchingMain && Date.now() < watchUntil) {
        const t0 = Date.now();
        try {
          await ctx.request('/health', {}, 30000);
        } catch {
          /* a refused probe is not a stall; the flow's own checks catch a dead bridge */
        }
        const ms = Date.now() - t0;
        if (ms > 2000) mainStalls.push({ atMs: t0, ms });
        await ctx.sleep(200);
      }
    })();
    const items = await ev(`window.api.addMediaPaths(${JSON.stringify(songs.map((s) => s.file))})`, { await: true });
    result.check('the songs are added to the library', Array.isArray(items) && songs.every((s) => items.some((i) => i.path === s.file)), Array.isArray(items) ? items.length : items);

    await ev(`__e2e.open('music')`);
    const rows = await poll(ctx, `(() => { const r = [...document.querySelectorAll('.music-row.music-song')].map((x) => x.innerText); return ${JSON.stringify(songs.map((s) => s.title))}.every((t) => r.some((x) => x.includes(t))) ? r.length : null; })()`, 20000);
    result.check('the Music app lists the songs', Boolean(rows), rows);
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

    // Karaoke on the enhanced-LRC song: line 0 fills in word by word (1-4 s), nothing is
    // lit through the instrumental break (4-8 s) while the view stays anchored on line 0,
    // then line 1 lights at 8 s. Known-word colouring is on by default, so the word fill
    // is the CSS highlight over the tokens; with it off, it is per-word spans.
    // Known-word colouring needs the tokenizer (built at boot, off the critical path, in
    // ~0.4-1 s without a long task); wait for the tokenised lines before timing anything.
    await poll(ctx, `document.querySelectorAll('.music-lyrics .music-line .music-line-tokens').length >= 2 || null`, 30000, 200);
    const lineZero = `[...document.querySelectorAll('.music-lyrics .music-line')].find((l) => l.getAttribute('data-lyric-line') === '0')`;
    const sample = () => ev(`(() => {
      const a = document.querySelector('.music-lyrics .music-line.active');
      const h = window.CSS && CSS.highlights && CSS.highlights.get('music-karaoke-ahead');
      const ahead = h ? [...h].map((r) => r.toString().replace(/\\s+/g, '')).join('|') : null;
      const singing = a ? a.querySelector('.music-word.is-singing')?.textContent ?? null : null;
      return { t: Number(document.querySelector('.mc-player-seek')?.value ?? -1), active: a ? a.getAttribute('data-lyric-line') : null, anchor: document.querySelector('.music-lyrics .music-line.anchor')?.getAttribute('data-lyric-line') ?? null, ahead, singing };
    })()`);
    // Judged by the player's own clock, so a slow sample never counts as a wrong one.
    // One pass: the retries this used to allow only covered the main-process GC stall above.
    // The 12 s song may have ended while the lyrics were tokenised: play it again first.
    await ev(`(() => { const b = document.querySelector('.mc-player-play'); const l = b ? (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '') : ''; if (b && !/Pause/i.test(l)) b.click(); return l; })()`);
    await poll(ctx, `/Pause/i.test(document.querySelector('.mc-player-play')?.getAttribute('aria-label') || document.querySelector('.mc-player-play')?.getAttribute('title') || '') || null`, 3000, 50);
    await ev(`(${lineZero}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    await poll(ctx, `Number(document.querySelector('.mc-player-seek')?.value ?? 99) < 1.5 || null`, 3000, 50);
    const samples2 = [];
    for (let i = 0; i < 140; i++) {
      const s = await sample();
      samples2.push(s);
      if (s.t >= 8.3) break;
      await ctx.sleep(100);
    }
    const sung = samples2.filter((s) => s.t >= 1.1 && s.t <= 3.9);
    const gap = samples2.filter((s) => s.t >= 4.15 && s.t <= 7.85);
    const after = samples2.filter((s) => s.t >= 8.1 && s.t <= 10.9);
    const verdict = {
      ok: sung.length >= 3 && sung.every((s) => s.active === '0')
        && gap.length >= 3 && gap.every((s) => s.active === null && s.anchor === '0')
        && after.length >= 1 && after.every((s) => s.active === '1'),
      sung: sung.length,
      gap: gap.length,
      after: after.length,
      trace: samples2.map((s) => `${s.t.toFixed(1)}:${s.active ?? '-'}`).join(' '),
    };
    const onZero = samples2.filter((s) => s.active === '0');
    const filled = (onZero.some((s) => s.ahead === '新しい朝') && onZero.some((s) => s.ahead === '朝'))
      || (onZero.some((s) => s.singing === 'おはよう、') && onZero.some((s) => s.singing === '新しい'));
    result.check('word-timed lyrics fill in word by word on the sung line', filled, onZero.slice(0, 12));
    result.check('nothing is lit through the instrumental break; the view stays anchored on the line just sung, then the next line lights',
      verdict.ok,
      verdict);

    // Timing nudge: +0.1 s per press, saved for this song; the readout resets it.
    for (let i = 0; i < 3; i++) await ev(`document.querySelector('.music-lyrics-offset-later').click()`);
    const nudged = await poll(ctx, `(() => { const v = document.querySelector('.music-lyrics-offset-value')?.textContent?.trim(); const k = Object.keys(localStorage).find((x) => x.startsWith('jp-lyric-offset-ms:')); return v === '+0.3 s' && k && localStorage.getItem(k) === '300' ? { v, k } : null; })()`, 3000);
    await ev(`document.querySelector('.music-lyrics-offset-value').click()`);
    const unnudged = await poll(ctx, `(() => { const v = document.querySelector('.music-lyrics-offset-value')?.textContent?.trim(); const k = Object.keys(localStorage).find((x) => x.startsWith('jp-lyric-offset-ms:')); return v === '0.0 s' && !k ? v : null; })()`, 3000);
    result.check('the lyric timing nudge steps 0.1 s, is saved per song, and resets', Boolean(nudged) && Boolean(unnudged), { nudged, unnudged });

    // Offline lyrics folder: the third song has no sidecar; its .lrc is in Lyrics/ beside it.
    const night = songs[2];
    await ev(`(${row(night.title)}).click()`);
    const fromFolder = await poll(ctx, `(() => { const i = document.querySelector('.mc-player-info')?.innerText || ''; const src = document.querySelector('.music-lyrics-source')?.textContent || ''; const l = [...document.querySelectorAll('.music-lyrics .music-line .music-line-text')].map((x) => x.textContent.trim()); return i.includes(${JSON.stringify(night.title)}) && /lyrics folder/i.test(src) && l[0] === ${JSON.stringify(night.lines[0][1])} ? { src: src.replace(/\\s+/g, ' '), first: l[0] } : null; })()`, 15000);
    result.check('a song with no sidecar finds its .lrc in a Lyrics folder beside it', Boolean(fromFolder), fromFolder);
    await ev(`(() => { const b = document.querySelector('.mc-player-play'); if (b && /Pause/i.test(b.getAttribute('aria-label') || b.textContent || '')) b.click(); return true; })()`);

    watchingMain = false;
    await mainWatch;
    const longTasks = await ev(`(window.__e2eLongTasks || []).filter((t) => t.ms >= 1000)`);
    result.check('the main process answered within 2 s throughout (no multi-second stall)', mainStalls.length === 0, mainStalls);
    result.check('the page ran no task of 1 s or longer during the flow', Array.isArray(longTasks) && longTasks.length === 0, longTasks);
  },
};
