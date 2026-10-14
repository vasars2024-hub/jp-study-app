'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * SRS: 30 cards pasted into the Flashcards importer, reviewed with learning steps on.
 *
 *  - ordering: an Again card waits for its 1-minute step (fresh cards come first), then
 *    returns AHEAD of fresh cards once due (`shared/reviewSessionQueue.ts`'s rule 1);
 *  - undo puts the card back with its previous step;
 *  - leech: one card lapses for real, twice, through the review UI (threshold 2);
 *  - the FSRS optimizer worker runs on a synthetic 1,200-row log: progress shows; Cancel
 *    pressed while the log is still loading starts no worker; Cancel mid-fit terminates
 *    the worker (its final reply is withheld until then, so the race is gone) and a late
 *    reply is ignored; a further run finishes with the held-out decision;
 *  - review history round-trips through .apkg: "Export deck and audio" writes every
 *    scheduled card's graded answers as Anki `revlog` rows (read back here with sql.js),
 *    and the app's own .apkg reader brings the same answers back;
 *  - FSRS-6 and presets: the version is chosen in the panel and the next review obeys
 *    it (a new card's first Good gets FSRS-6's initial stability); a preset is made,
 *    renamed and deleted (two presses) through the panel.
 *
 * Time: same-day steps are minutes and lapses need days, so the page clock is moved with
 * a Date.now offset (`__e2eClock`) — the scheduler reads Date.now for every grade. Nothing
 * else about the review is simulated.
 */
const fs = require('node:fs');
const path = require('node:path');
const { installHelpers, poll } = require('./_lib.cjs');

const WORDS = [
  ['春', 'はる', 'spring'], ['夏', 'なつ', 'summer'], ['秋', 'あき', 'autumn'], ['冬', 'ふゆ', 'winter'],
  ['山', 'やま', 'mountain'], ['川', 'かわ', 'river'], ['海', 'うみ', 'sea'], ['空', 'そら', 'sky'],
  ['雨', 'あめ', 'rain'], ['雪', 'ゆき', 'snow'], ['風', 'かぜ', 'wind'], ['花', 'はな', 'flower'],
  ['木', 'き', 'tree'], ['森', 'もり', 'forest'], ['町', 'まち', 'town'], ['道', 'みち', 'road'],
  ['駅', 'えき', 'station'], ['店', 'みせ', 'shop'], ['本', 'ほん', 'book'], ['机', 'つくえ', 'desk'],
  ['椅子', 'いす', 'chair'], ['窓', 'まど', 'window'], ['扉', 'とびら', 'door'], ['鍵', 'かぎ', 'key'],
  ['鳥', 'とり', 'bird'], ['魚', 'さかな', 'fish'], ['犬', 'いぬ', 'dog'], ['馬', 'うま', 'horse'],
  ['牛', 'うし', 'cow'], ['羊', 'ひつじ', 'sheep'],
];
const DECK = 'E2E SRS';
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

module.exports = {
  id: 'srs',
  title: 'SRS session, undo, leech, FSRS optimizer',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    await ev(`(() => {
      if (!window.__e2eClock) {
        const real = Date.now.bind(Date);
        window.__e2eClock = { offset: 0 };
        Date.now = () => real() + window.__e2eClock.offset;
      }
      return true;
    })()`);
    // Moving the clock is "time passes"; the focus event is the user coming back to the
    // window, which is when an open Flashcards window re-reads what is due (useDueClock).
    const advance = (ms) => ev(`(window.__e2eClock.offset += ${ms}, window.dispatchEvent(new Event('focus')), window.__e2eClock.offset)`);

    // Scheduling: FSRS, Anki's learning steps, one 10-minute relearning step, leech at 2.
    await ev(`(() => {
      const key = 'jp-flashcard-scheduling-v1';
      const cur = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...cur, algorithm: 'fsrs', learningStepsMinutes: [1, 10], relearningStepsMinutes: [10], leechThreshold: 2, leechAction: 'tag' }));
      return true;
    })()`);

    await ev(`__e2e.open('flashcards')`);
    const paste = await poll(ctx, `!!document.querySelector('.deck-import-paste')`, 20000);
    result.check('Flashcards opens with the deck importer', paste);
    const tsv = WORDS.map((w) => w.join('\t')).join('\n');
    await ev(`(() => {
      const name = document.querySelector('.deck-import-panel input[type=text]');
      __e2e.fill(name, ${JSON.stringify(DECK)});
      const area = document.querySelector('.deck-import-paste');
      const dt = new DataTransfer();
      dt.setData('text/plain', ${JSON.stringify(tsv)});
      area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return true;
    })()`);
    const imported = await poll(ctx, `document.querySelector('.deck-import-status.ok')?.textContent`, 10000);
    result.check('30 cards imported by paste', Boolean(imported) && /30/.test(imported), imported);

    const startLabel = await poll(ctx, `__e2e.byText('button', /^Start review \\(\\d+\\)$/)?.textContent`, 10000);
    result.check('"Start review (N)" offers the new cards', Boolean(startLabel), startLabel);
    await ev(`__e2e.click(__e2e.byText('button', /^Start review \\(\\d+\\)$/))`);
    await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-card')`, 10000);

    const words = new Map(WORDS.map(([w, , m]) => [m, w]));
    const current = async () => {
      const raw = await ev(`(() => { const c = document.querySelector('.flash-review-shell .flash-card'); return c ? (c.querySelector('.flash-word')?.textContent || c.querySelector('.flash-recall-prompt')?.textContent || '').trim() : null; })()`);
      return words.get(raw) ?? raw;
    };
    const grade = async (rating) => {
      await ev(`(() => { const b = document.querySelector('.flash-review-shell .flash-actions .btn.primary'); if (b && !document.querySelector('.flash-review-shell .flash-again')) b.click(); return true; })()`);
      await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-${rating === 'good' ? 'got' : rating}')`, 5000);
      const hint = await ev(`document.querySelector('.flash-review-shell .flash-${rating === 'good' ? 'got' : rating} .flash-srs-hint')?.textContent ?? null`);
      await ev(`__e2e.click(document.querySelector('.flash-review-shell .flash-${rating === 'good' ? 'got' : rating}'))`);
      await ctx.sleep(250);
      return hint;
    };

    // --- ordering with steps -------------------------------------------------------
    const a = await current();
    const againHint = await grade('again');
    const b = await current();
    result.check('Again on a new card waits for its 1-minute step: a fresh card is next', Boolean(a) && b !== a, { a, againHint, b });
    await grade('good');
    const c = await current();
    result.check('Good moves a new card into its next step; another fresh card follows', c !== a && c !== b, { b, c });
    await advance(61_000);
    await grade('good');
    const back = await current();
    result.check('once its step is due, the Again card returns ahead of fresh cards', back === a, { expected: a, got: back });
    await ctx.shot('step-return');

    // --- undo ----------------------------------------------------------------------
    const goodHintBefore = await grade('good');
    const afterGood = await current();
    await ev(`__e2e.click(document.querySelector('.flash-review-shell .flash-undo'))`);
    await ctx.sleep(300);
    const undone = await current();
    await ev(`(() => { const b = document.querySelector('.flash-review-shell .flash-actions .btn.primary'); if (b && !document.querySelector('.flash-review-shell .flash-again')) b.click(); return true; })()`);
    const goodHintAfter = await poll(ctx, `document.querySelector('.flash-review-shell .flash-got .flash-srs-hint')?.textContent`, 3000);
    result.check('Undo brings the same card back with the same next step', undone === a && afterGood !== a && goodHintAfter === goodHintBefore, { a, afterGood, undone, goodHintBefore, goodHintAfter });
    await grade('easy');
    result.note(`${a} graduated with Easy (it is the leech candidate)`);

    // --- leech after real lapses ---------------------------------------------------
    const lapse = async (n) => {
      await ev(`__e2e.clickText('.flash-review-shell button', 'Exit')`);
      await poll(ctx, `!document.querySelector('.flash-review-shell')`, 5000);
      // A sitting that ran out of cards ends on its summary instead: leave it with Done.
      await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => __e2e.vis(x) && x.innerText.trim() === 'Done' && [...(x.parentElement?.querySelectorAll('button') ?? [])].some((y) => y.innerText.trim() === 'Review again')); if (b) b.click(); return !!b; })()`);
      await advance(40 * DAY);
      const start = await poll(ctx, `__e2e.byText('button', /^Start review \\(\\d+\\)$/) ? true : null`, 10000);
      if (!start) return { error: 'no review offered' };
      await ev(`__e2e.click(__e2e.byText('button', /^Start review \\(\\d+\\)$/))`);
      await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-card')`, 10000);
      // Everything else in the sitting is graduated out of the way with Easy.
      for (let i = 0; i < 40; i++) {
        const now = await current();
        if (now === a) break;
        if (!now) return { error: 'session ended before the candidate came up' };
        await grade('easy');
      }
      if ((await current()) !== a) return { error: 'candidate never came up' };
      await grade('again');
      const notice = await poll(ctx, `(() => { const n = [...document.querySelectorAll('.flash-review-shell [role=status]')].map((x) => x.textContent).find((t) => /Leech/.test(t)); return n || null; })()`, n === 2 ? 5000 : 1200);
      if (n === 1) {
        // Relearning step (10 min), then Good graduates it back to review.
        await advance(11 * MIN);
        for (let i = 0; i < 40; i++) {
          const now = await current();
          if (now === a || !now) break;
          await grade('easy');
        }
        if ((await current()) === a) await grade('good');
      }
      return { notice };
    };
    const first = await lapse(1);
    result.check('lapse 1 (real, through the review UI) is not yet a leech', !first.error && !first.notice, first);
    const second = await lapse(2);
    result.check('lapse 2 makes it a leech: the review says so', !second.error && Boolean(second.notice) && second.notice.includes(a), second);
    await ctx.shot('leech');
    await ev(`(__e2e.clickText('.flash-review-shell button', 'Exit'), true)`);
    await poll(ctx, `!document.querySelector('.flash-review-shell')`, 5000);
    // The tag is on the card: the deck's own "is:leech" search finds it.
    const search = await ev(`(() => { const i = [...document.querySelectorAll('input')].find((x) => /search|find/i.test(x.placeholder || x.getAttribute('aria-label') || '')); if (!i) return null; __e2e.fill(i, 'is:leech'); return true; })()`);
    const leechRow = search ? await poll(ctx, `(() => { const t = document.body.innerText; return t.includes(${JSON.stringify(a)}) ? true : null; })()`, 5000) : null;
    result.check('"is:leech" finds the card (leech tag written)', Boolean(leechRow), { search });
    await ev(`(() => { const i = [...document.querySelectorAll('input')].find((x) => /search|find/i.test(x.placeholder || x.getAttribute('aria-label') || '')); if (i) __e2e.fill(i, ''); return true; })()`);

    // --- FSRS optimizer on a synthetic log -----------------------------------------
    const seeded = await ev(`(async () => {
      const rows = [];
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const start = Date.now() - 400 * ${DAY};
      for (let c = 0; c < 180; c++) {
        let at = start + c * 20 * 60 * 60 * 1000;
        let interval = 0;
        for (let r = 0; r < 20; r++) {
          const recall = r === 0 ? rnd() > 0.3 : rnd() > 0.12;
          const rating = !recall ? 'again' : rnd() < 0.15 ? 'hard' : rnd() < 0.85 ? 'good' : 'easy';
          const prev = interval;
          interval = rating === 'again' ? 1 : Math.max(1, Math.round((interval || 1) * (rating === 'hard' ? 1.2 : rating === 'good' ? 2.5 : 3.5)));
          rows.push({ id: 'e2e-' + c + '-' + r, at, mode: 'review', cardId: 'e2e-card-' + c, word: 'w' + c, rating, correct: rating !== 'again', prevIntervalDays: prev, intervalDays: interval, ...(r === 0 ? { isNew: true } : {}) });
          at += interval * ${DAY} + Math.floor(rnd() * 6 * 60 * 60 * 1000);
          if (at > Date.now() - ${DAY}) break;
        }
      }
      const db = await new Promise((res, rej) => { const q = indexedDB.open('jp-study-db'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        for (const row of rows) store.put(row, 'review-log-row:' + row.id);
        tx.oncomplete = () => res(true);
        tx.onerror = () => rej(tx.error);
      });
      db.close();
      return rows.length;
    })()`, { await: true });
    result.check('a synthetic review log of >= 1,000 rows is stored', seeded >= 1000, seeded);
    // The review log is read once per window and cached: reload so the optimizer sees it.
    await ctx.request('/reload', { window: 'main' });
    await ctx.sleep(4000);
    await poll(ctx, `!!(window.api && document.readyState === 'complete')`, 60000);
    await installHelpers(ctx);
    await ev(`__e2e.open('flashcards')`);
    await poll(ctx, `!!document.querySelector('details.flash-deck-prefs')`, 20000);
    await ev(`(() => { const d = document.querySelector('details.flash-deck-prefs'); d.open = true; d.scrollIntoView(); return true; })()`);
    const runBtn = await poll(ctx, `!!document.querySelector('.srs2-optimizer .btn')`, 10000);
    result.check('the FSRS optimizer is offered (algorithm FSRS)', runBtn);

    // Run until the worker reports progress, then cancel it mid-fit. The first run of a
    // session also reads the whole log from IndexedDB before the worker starts, so a run
    // that finishes before any progress was seen is simply started again.
    // The progress bar is sampled IN the page (every animation frame plus a mutation
    // observer), because a fit on a fast machine can show and finish between two bridge
    // round trips — three attempts in a row did, and read as "no progress".
    await ev(`(() => {
      window.__e2eOpt = { shown: false, max: 0 };
      const sample = () => { const p = document.querySelector('.srs3-optimizer-progress progress'); if (p) { window.__e2eOpt.shown = true; window.__e2eOpt.max = Math.max(window.__e2eOpt.max, Number(p.value) || 0); } };
      if (!window.__e2eOptObs) {
        window.__e2eOptObs = new MutationObserver(sample);
        window.__e2eOptObs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      }
      return true;
    })()`);
    let shown = null;
    let moved = null;
    for (let attempt = 0; attempt < 3 && moved === null; attempt++) {
      await ev(`__e2e.click(document.querySelector('.srs2-optimizer .btn'))`);
      shown = shown || (await poll(ctx, `window.__e2eOpt.shown || null`, 10000, 50));
      moved = await poll(ctx, `(() => { const p = document.querySelector('.srs3-optimizer-progress progress'); if (window.__e2eOpt.max > 0) return window.__e2eOpt.max; return p ? null : 'finished'; })()`, 60000, 50);
      if (moved === 'finished') {
        result.note(`optimizer attempt ${attempt + 1} finished before any progress was seen; running it again`);
        moved = null;
      }
    }
    await ev(`(window.__e2eOptObs?.disconnect(), delete window.__e2eOptObs, true)`);
    result.check('a run shows progress that moves (worker reports back)', Boolean(shown) && moved !== null, { shown, percent: moved });
    // Cancel, made deterministic. A fit on a fast machine finishes in about a second, so
    // "press Cancel before it ends" was a race the harness kept losing (sampled at 93 %,
    // done before the click landed). The page's Worker is wrapped for the rest of this
    // section: the optimizer worker is the real one and runs the real fit, but once the
    // panel shows a whole percent of progress, every further reply (later progress, and
    // the final "done" / "error") is held back until Cancel has been pressed, so the panel
    // is mid-fit when Cancel lands and the run cannot end first. What the check proves is
    // unchanged and now observed directly: the worker was terminated, the panel says the
    // run was cancelled, and the held replies, delivered afterwards as a late worker would
    // send them, are ignored (no decision appears).
    await poll(ctx, `!__e2e.byText('.srs2-optimizer button', 'Cancel') || null`, 120000, 200);
    await ev(`(() => {
      const Real = window.__e2eRealWorker || window.Worker;
      window.__e2eRealWorker = Real;
      const gate = { spawned: 0, terminated: 0, held: [], workers: [], progress: 0, releasing: false };
      window.__e2eOptGate = gate;
      window.Worker = class extends Real {
        constructor(url, opts) {
          super(url, opts);
          if (!/fsrsOptimizer/i.test(String(url))) return;
          gate.spawned++;
          gate.workers.push(this);
          // Added before the app sets onmessage, so it runs first and can withhold a reply.
          this.addEventListener('message', (event) => {
            const reply = event.data;
            if (gate.releasing || !reply) return;
            // Progress reaches the panel until it shows a whole percent (the bar rounds);
            // from then on everything is withheld.
            if (reply.kind === 'progress' && !(gate.progress >= 0.01)) {
              gate.progress = Math.max(gate.progress, Number(reply.fraction) || 0);
              return;
            }
            event.stopImmediatePropagation();
            gate.held.push({ worker: this, reply });
          });
        }
        terminate() {
          if (gate.workers.includes(this)) gate.terminated++;
          return super.terminate();
        }
      };
      return true;
    })()`);
    const cancelReport = `(() => { const r = document.querySelector('.srs2-optimizer .auto-reading-options__report'); return r && /cancel/i.test(r.textContent) ? r.textContent : null; })()`;
    const decisionShown = `(() => { const r = document.querySelector('.srs2-optimizer .auto-reading-options__report'); return !!(r && !/cancel/i.test(r.textContent) && r.textContent.trim()); })()`;

    // 1. Cancel pressed the instant it appears — while the whole history is still being
    //    read from IndexedDB, before any worker exists. The button is on screen then, so
    //    the press must count: no worker is started and the panel says so. (The observer
    //    runs in the click's own microtasks; the IndexedDB read answers in a later task.)
    await ev(`(() => {
      const rec = { clicked: false };
      rec.obs = new MutationObserver(() => {
        if (rec.clicked) return;
        const b = __e2e.byText('.srs2-optimizer button', 'Cancel');
        if (!b) return;
        rec.clicked = true;
        rec.spawnedAtClick = window.__e2eOptGate.spawned;
        rec.obs.disconnect();
        b.click();
      });
      rec.obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      window.__e2eOptEarly = rec;
      __e2e.click(document.querySelector('.srs2-optimizer .btn'));
      return true;
    })()`);
    const earlyMsg = await poll(ctx, cancelReport, 15000, 50);
    await ctx.sleep(1500); // room for a wrongly started worker to show itself
    const early = await ev(`(() => { const r = window.__e2eOptEarly; r.obs.disconnect(); return { clicked: r.clicked, spawnedAtClick: r.spawnedAtClick, spawned: window.__e2eOptGate.spawned, cancelShown: !!__e2e.byText('.srs2-optimizer button', 'Cancel') }; })()`);
    result.check('Cancel pressed before the worker starts is honoured (no worker started)',
      Boolean(earlyMsg) && early.clicked && early.spawnedAtClick === 0 && early.spawned === 0 && !early.cancelShown,
      { earlyMsg, ...early });

    // 2. Cancel mid-fit: the panel shows the worker's first whole percent; the rest is held.
    await ev(`__e2e.click(document.querySelector('.srs2-optimizer .btn'))`);
    const midFit = await poll(ctx, `(() => {
      const g = window.__e2eOptGate;
      const p = document.querySelector('.srs3-optimizer-progress progress');
      return g.spawned === 1 && g.progress >= 0.01 && p && Number(p.value) > 0 && Number(p.value) < 100 ? { percent: Number(p.value) } : null;
    })()`, 120000, 100);
    const clicked = midFit ? await ev(`__e2e.clickText('.srs2-optimizer button', 'Cancel')`) : false;
    const cancelMsg = clicked ? await poll(ctx, cancelReport, 15000, 50) : null;
    // Deliver the withheld replies now, as late worker messages would arrive: they must
    // not turn the cancelled run into a result.
    const held = await ev(`(() => {
      const g = window.__e2eOptGate;
      g.releasing = true;
      for (const { worker, reply } of g.held) worker.dispatchEvent(new MessageEvent('message', { data: reply }));
      return g.held.length;
    })()`);
    await ctx.sleep(1000);
    const after = await ev(`(() => ({ terminated: window.__e2eOptGate.terminated, decision: ${decisionShown}, stillCancelled: ${cancelReport} !== null, cancelShown: !!__e2e.byText('.srs2-optimizer button', 'Cancel') }))()`);
    await ev(`(window.Worker = window.__e2eRealWorker, delete window.__e2eOptGate, true)`);
    result.check('Cancel stops the worker and says so',
      Boolean(midFit) && Boolean(cancelMsg) && after.terminated === 1 && !after.decision && after.stillCancelled && !after.cancelShown,
      { cancelMsg, panelPercentAtCancel: midFit?.percent, heldReplies: held, ...after });

    await ev(`__e2e.click(document.querySelector('.srs2-optimizer .btn'))`);
    const decision = await poll(ctx, `(() => { const r = document.querySelector('.srs2-optimizer .auto-reading-options__report'); return r && !/cancel/i.test(r.textContent) && r.textContent.trim() ? r.innerText : null; })()`, 180000, 500);
    const apply = await ev(`!!__e2e.byText('.srs2-optimizer button', /Use these|Apply/i)`);
    result.check('a full run ends in a held-out decision', Boolean(decision) && /held|later|latest|predict|reviews/i.test(decision), { decision, apply });
    result.note(`optimizer decision: ${String(decision).replace(/\s+/g, ' ').slice(0, 300)}`);
    await ctx.shot('optimizer');
    await ev(`(window.__e2eClock && (window.__e2eClock.offset = 0), true)`);

    // --- review history through .apkg -----------------------------------------------
    const kvRows = (prefix) => `(async () => {
      const db = await new Promise((res, rej) => { const q = indexedDB.open('jp-study-db'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      const rows = await new Promise((res) => { const out = []; const r = db.transaction('kv').objectStore('kv').openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return res(out); if (String(c.key).startsWith(${JSON.stringify(prefix)})) out.push(c.value); c.continue(); }; r.onerror = () => res(out); });
      db.close();
      return rows;
    })()`;
    const deckCards = await ev(`(() => { const d = JSON.parse(localStorage.getItem('jp-flashcard-deck') || '{"cards":[]}'); return (d.cards || d).map((c) => ({ id: c.id, word: c.word, scheduled: !!c.srs })); })()`);
    const scheduledIds = new Set((deckCards ?? []).filter((c) => c.scheduled).map((c) => c.id));
    const gumRows = ((await ev(kvRows('review-log-row:'), { await: true })) ?? [])
      .filter((row) => row && row.mode === 'review' && !row.source && row.rating && scheduledIds.has(row.cardId));
    result.check('the SRS session left graded answers in the review log', gumRows.length >= 5, gumRows.length);
    const exportClicked = await ev(`__e2e.clickText('button', 'Export deck and audio')`);
    const exported = await poll(ctx, `(() => { const r = [...document.querySelectorAll('.auto-reading-options__report')].map((x) => x.textContent).find((t) => /^Exported \\d+ cards/.test(t || '')); return r || null; })()`, 60000, 250);
    result.check('"Export deck and audio" writes the package and says it carries the review history',
      Boolean(exportClicked) && Boolean(exported) && /past answers? go(es)? with them/.test(exported), exported);
    const exportsDir = path.join(ctx.profile, 'exports');
    const latest = fs.existsSync(exportsDir)
      ? fs.readdirSync(exportsDir).filter((d) => d.startsWith('deck-')).sort().pop()
      : null;
    const pkg = latest ? path.join(exportsDir, latest, 'deck.apkg') : null;
    let revlog = [];
    if (pkg && fs.existsSync(pkg)) {
      const AdmZip = require('adm-zip');
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')) });
      const db = new SQL.Database(new AdmZip(pkg).getEntry('collection.anki2').getData());
      revlog = (db.exec('SELECT id, cid, ease, type FROM revlog ORDER BY cid, id')[0]?.values ?? []).map(([id, cid, ease, type]) => ({ id, cid, ease, type }));
      db.close();
    }
    const answers = revlog.filter((r) => r.ease >= 1 && r.ease <= 4);
    const kinds = new Set(answers.map((r) => r.type));
    result.check('the package\'s revlog holds every graded answer of the scheduled cards (learn and review kinds)',
      answers.length === gumRows.length && kinds.has(0) && kinds.has(1),
      { pkg, revlog: answers.length, gumRows: gumRows.length, kinds: [...kinds] });
    const reread = pkg ? await ev(`window.api.importApkgCards(${JSON.stringify(pkg)})`, { await: true }) : null;
    // Per Anki card: the answers the reader returns are exactly the package's, in order.
    // The importer folds a note with the same word and reading as an earlier one (this run
    // both mines 窓 from the dictionary and pastes it here); the folded note's answers are
    // not read twice, and the report says a note was folded.
    const answersOf = (cid) => answers.filter((r) => r.cid === cid).map((r) => `${r.id}:${r.ease}`).join(',');
    const perCard = (reread?.cards ?? []).filter((c) => c.history?.length).map((c) => ({
      word: c.word,
      same: c.history.filter((r) => r.ease >= 1 && r.ease <= 4 && r.type < 4).map((r) => `${r.id}:${r.ease}`).join(',') === answersOf(c.ankiCardId),
    }));
    const readBack = reread?.report?.historyReviews ?? 0;
    const folded = reread?.report?.duplicateNotes ?? 0;
    result.check('the app\'s own .apkg reader brings each card\'s answers back exactly, in order',
      Boolean(reread?.ok) && perCard.length > 0 && perCard.every((c) => c.same)
        && (readBack === answers.length || (folded > 0 && readBack < answers.length)),
      { ok: reread?.ok, historyReviews: readBack, inPackage: answers.length, foldedDuplicateNotes: folded, perCard });

    // --- FSRS-6 and presets ----------------------------------------------------------
    await ev(`(() => { const d = document.querySelector('details.flash-deck-prefs'); if (d) { d.open = true; d.scrollIntoView(); } return true; })()`);
    const versionSelect = `document.querySelector('select[aria-describedby="srs5-fsrs-version-help"]')`;
    const hasVersion = await poll(ctx, `!!${versionSelect}`, 10000);
    await ev(`(() => { const s = ${versionSelect}; s.value = '6'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    const v6 = await poll(ctx, `JSON.parse(localStorage.getItem('jp-flashcard-scheduling-v1') || '{}').fsrsVersion === 6 ? true : null`, 5000);
    result.check('FSRS-6 is chosen in the scheduling panel and saved', Boolean(hasVersion) && Boolean(v6));
    await ctx.shot('fsrs6');

    // A new card's first Good under FSRS-6: FSRS-6's initial stability (w2 = 2.3065).
    await ev(`(() => {
      const name = document.querySelector('.deck-import-panel input[type=text]');
      __e2e.fill(name, 'E2E FSRS6');
      const area = document.querySelector('.deck-import-paste');
      const dt = new DataTransfer();
      dt.setData('text/plain', '星\\tほし\\tstar');
      area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return true;
    })()`);
    const pasted = await poll(ctx, `(() => { const t = document.querySelector('.deck-import-status.ok')?.textContent || ''; return /\\b1\\b/.test(t) ? t : null; })()`, 10000);
    const startNew = await poll(ctx, `__e2e.byText('button', /^Start review \\(\\d+\\)$/)?.textContent ?? null`, 10000);
    const faces = [];
    let star = null;
    if (startNew) {
      await ev(`__e2e.click(__e2e.byText('button', /^Start review \\(\\d+\\)$/))`);
      await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-card')`, 10000);
      for (let i = 0; i < 20; i++) {
        const now = await current();
        faces.push(now);
        if (!now) break;
        if (now === 'star' || now === '星') {
          await grade('good');
          break;
        }
        await grade('easy');
      }
      await ev(`(__e2e.clickText('.flash-review-shell button', 'Exit'), true)`);
      await poll(ctx, `!document.querySelector('.flash-review-shell')`, 5000);
      // The whole-deck copy in localStorage is written after the card's own durable write.
      star = await poll(ctx, `(() => { const d = JSON.parse(localStorage.getItem('jp-flashcard-deck') || '{"cards":[]}'); return (d.cards || d).find((c) => c.word === '星')?.srs ?? null; })()`, 15000);
    }
    result.check('under FSRS-6 a new card\'s first Good gets FSRS-6\'s initial stability (2.3065, FSRS-5 would give 3.173)',
      Boolean(star) && Math.abs((star?.stability ?? 0) - 2.3065) < 1e-6, { star, pasted, startNew, faces });

    await ev(`(() => { const d = document.querySelector('details.flash-deck-prefs'); if (d) { d.open = true; d.scrollIntoView(); } return true; })()`);
    await ev(`__e2e.clickText('.srs5-presets button', 'New preset')`);
    const preset = await poll(ctx, `(() => { const c = JSON.parse(localStorage.getItem('jp-flashcard-scheduling-v1') || '{}'); return c.presets && c.presets.length === 1 ? c.presets[0] : null; })()`, 5000);
    const editing = await ev(`document.querySelector('select[aria-describedby="srs5-preset-help"]')?.value ?? null`);
    await ev(`(() => { const i = [...document.querySelectorAll('.srs5-presets input[type=text]')][0]; if (!i) return false; __e2e.fill(i, 'Kanji'); i.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return true; })()`);
    const renamed = await poll(ctx, `(() => { const c = JSON.parse(localStorage.getItem('jp-flashcard-scheduling-v1') || '{}'); return c.presets?.[0]?.name === 'Kanji' ? true : null; })()`, 5000);
    result.check('a preset is made in the panel, edited there, and renamed', Boolean(preset) && editing === preset?.id && Boolean(renamed), { preset, editing, renamed });
    await ctx.shot('preset');
    await ev(`__e2e.clickText('.srs5-presets button', 'Delete preset')`);
    const stillThere = await ev(`JSON.parse(localStorage.getItem('jp-flashcard-scheduling-v1') || '{}').presets?.length ?? 0`);
    await ev(`(() => { const b = [...document.querySelectorAll('.srs5-presets button')].find((x) => /Kanji/.test(x.textContent || '')); if (b) b.click(); return !!b; })()`);
    const gone = await poll(ctx, `(JSON.parse(localStorage.getItem('jp-flashcard-scheduling-v1') || '{}').presets ?? []).length === 0 ? true : null`, 5000);
    result.check('deleting a preset takes two presses', stillThere === 1 && Boolean(gone), { stillThere, gone });
  },
};
