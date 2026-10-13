'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Dictionary page: 食べる → entries with a pitch contour, frequency chips, POS tooltips,
 * the kanji breakdown, i+1 examples, and the "in deck" marker after adding the word.
 */
const { installHelpers, poll, ensureDictionaryReady } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');

module.exports = {
  id: 'dictionary',
  title: 'Dictionary page (食べる)',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);

    // A fresh profile has JMdict only: no frequency corpus and no KANJIDIC2, so the chips
    // and the kanji facts are (correctly) absent. Install both the way a user does —
    // a Yomitan frequency zip and a KANJIDIC2 file through the dictionary importers.
    const freqZip = fixtures.yomitanFrequencyZip(ctx.mediaDir);
    const kanjidic = fixtures.kanjidicXml(ctx.mediaDir);
    const freq = await ev(`window.api.dictImportYomitan(${JSON.stringify(freqZip)})`, { await: true });
    result.check('frequency dictionary imports (Yomitan zip)', freq?.ok === true, freq);
    // One import job at a time: the Yomitan import above runs as one, so wait it out.
    const idle = async () => {
      for (let i = 0; i < 240; i++) {
        const s = await ev(`window.api.dictImportStatus()`, { await: true });
        if (!s || s.status !== 'running') return s;
        await ctx.sleep(500);
      }
      return null;
    };
    await idle();
    const start = await ev(`window.api.dictImportStart({ kind: 'kanjidic', filePath: ${JSON.stringify(kanjidic)} })`, { await: true });
    const job = start?.ok ? await idle() : start;
    result.check('KANJIDIC2 excerpt imports (job committed)', start?.ok === true && job?.jobId === start.snapshot?.jobId && job?.status === 'committed', { start, job });

    // A fresh profile (first boot of a new snapshot) may still be loading the built-in
    // dictionary: the search below must not race it (seen once in a full run: no entries).
    const dict = await ensureDictionaryReady(ctx, { word: '食べる' });
    result.check('the built-in dictionary answers a lookup', dict.ready, dict);
    await ev(`__e2e.open('dictionary')`);
    const input = await poll(ctx, `!!document.querySelector('form.dict-search input')`, 20000);
    result.check('dictionary app opens with a search box', input);

    await ev(`(() => { const i = document.querySelector('form.dict-search input'); __e2e.fill(i, '食べる'); i.form.requestSubmit(); return true; })()`);
    const entries = await poll(ctx, `document.querySelectorAll('.dict-entry').length`, 60000);
    const first = await ev(`(() => { const e = document.querySelector('.dict-entry'); return e && { word: e.querySelector('.dict-word')?.textContent, reading: e.querySelector('.dict-reading')?.textContent }; })()`);
    result.check('search returns entries, first is 食べる/たべる', entries > 0 && first?.word === '食べる', { entries, first });

    const pitch = await poll(ctx, `(() => { const e = document.querySelector('.dict-entry'); const c = e?.querySelector('.pitch-contour'); return c ? { moras: c.querySelectorAll('.pitch-mora').length, svg: !!c.querySelector('svg') || c.tagName === 'svg' } : null; })()`, 15000);
    result.check('pitch graph rendered on the first entry', Boolean(pitch && pitch.moras > 0), pitch);

    const chips = await poll(ctx, `(() => { const c = [...document.querySelectorAll('.dict-entry')][0]?.querySelectorAll('.dict-freq-chip'); return c && c.length ? [...c].map((x) => ({ text: x.textContent.trim(), title: x.title })) : null; })()`, 15000);
    result.check('frequency chips on the first entry (rank from the imported corpus)', Boolean(chips && chips.some((c) => /245/.test(c.text))), chips);

    const pos = await ev(`[...document.querySelectorAll('.dict-entry')][0] ? [...[...document.querySelectorAll('.dict-entry')][0].querySelectorAll('abbr.dict-pos-tag')].map((a) => ({ code: a.textContent, title: a.title })) : []`);
    result.check('POS tags carry a tooltip (abbr title)', pos.length > 0 && pos.every((p) => p.title && p.title !== p.code), pos);

    await ev(`__e2e.click(document.querySelector('.dict-entry .dict-kanji-toggle'))`);
    const kanji = await poll(ctx, `(() => { const rows = document.querySelectorAll('.dict-entry .dict-kanji-row'); return rows.length ? [...rows].map((r) => ({ glyph: r.querySelector('.dict-kanji-glyph')?.textContent, meanings: r.querySelector('.dict-kanji-meanings')?.textContent ?? r.querySelector('.dict-kanji-facts')?.textContent })) : null; })()`, 15000);
    result.check('kanji breakdown opens with 食', Boolean(kanji && kanji.some((k) => k.glyph === '食')), kanji);
    await ctx.shot('entry');

    // Examples: load, then look for the i+1 standing.
    await ev(`__e2e.click(document.querySelector('.dict-examples .dict-ex-btn'))`);
    const exState = await poll(ctx, `(() => { const ex = document.querySelector('.dict-examples'); if (!ex) return null; if (ex.querySelector('.dict-ex-list')) return { n: ex.querySelectorAll('.dict-ex-list > *').length, iplus1: ex.querySelectorAll('.dict-ex-standing.is-iplus1').length, standings: [...ex.querySelectorAll('.dict-ex-standing')].slice(0, 5).map((s) => s.textContent) }; const st = ex.querySelector('.dict-ex-status'); return st && !/Searching/i.test(st.textContent) ? { status: st.textContent } : null; })()`, 60000);
    result.check('examples load', Boolean(exState && exState.n > 0), exState);
    result.check('at least one example is marked i+1', Boolean(exState && exState.iplus1 > 0), exState);
    await ev(`(document.querySelector('.dict-ex-list')?.scrollIntoView({ block: 'center' }), true)`);
    await ctx.sleep(300);
    await ctx.shot('examples');

    // Add the first entry, then the "in deck" marker.
    const before = await ev(`!!document.querySelector('.dict-entry .dict-presence.in-deck')`);
    result.check('no "in deck" marker before adding', before === false);
    await ev(`__e2e.click(document.querySelector('.dict-entry .dict-add'))`);
    const added = await poll(ctx, `(() => { const b = document.querySelector('.dict-entry .dict-add'); return b && b.classList.contains('done') ? b.textContent : null; })()`, 30000);
    const err = await ev(`document.querySelector('.dict-entry .dict-add-err')?.textContent ?? null`);
    result.check('add button completes', Boolean(added), { added, err });
    const marker = await poll(ctx, `document.querySelector('.dict-entry .dict-presence.in-deck')?.textContent`, 20000);
    result.check('"in deck" marker shows after adding', Boolean(marker), marker);
    await ctx.shot('in-deck');

    // Popup round 4 (10ten / Yomitan parity), through the real preload and database:
    // the longest word across the cursor, the other kana script, keyboard grading.
    const scan = await ev(`window.api.dictScanLongest('食べ物を買う', 'ja')`, { await: true });
    result.check('popup scan: the longest word at the cursor (食べ → 食べ物)', scan?.matched === '食べ物', scan);
    const kana = await ev(`window.api.lookupTerm('タベル', 8, 'ja').then((r) => r.entries.map((e) => e.word))`, { await: true });
    result.check('kana variant: katakana タベル finds 食べる', Array.isArray(kana) && kana.includes('食べる'), kana);
    await ev(`(window.dispatchEvent(new CustomEvent('dict:lookup', { detail: { query: '食べ', context: '食べ物を買う', scan: true } })), true)`);
    const head = await poll(ctx, `(() => { const q = document.querySelector('.dict-popup .dict-q')?.textContent; const opts = [...document.querySelectorAll('.dict-popup .dict-scan-opt')].map((b) => b.textContent); return q === '食べ物' ? { q, opts } : null; })()`, 20000);
    result.check('popup opens on the longest match, the clicked word one click away', Boolean(head && head.opts.includes('食べ')), head);
    await ev(`(() => { const p = document.querySelector('.dict-popup'); p.focus(); p.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true })); return true; })()`);
    const known = await poll(ctx, `document.querySelector('.dict-popup .wk-grade-btn.wk-g-3')?.getAttribute('aria-pressed') === 'true' || null`, 5000);
    result.check('popup: the 4 key grades the word Known', known === true, known);
    await ctx.shot('popup-longest');
    await ev(`(() => { const p = document.querySelector('.dict-popup'); p?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
    const closed = await poll(ctx, `!document.querySelector('.dict-popup') || null`, 5000);
    result.check('popup closes on Escape', closed === true, closed);
  },
};
