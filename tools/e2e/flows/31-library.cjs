'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Library management (main/library.ts, libraryImportJob.ts, libraryTrash.ts and the
 * shelf's LibraryRemovedBar / LibraryImportStatus / LibraryMetaEditor), through the
 * shelf's own buttons:
 *
 *  - Remove + Undo: the item leaves the shelf for the library trash and comes back under
 *    the SAME id with its reading progress;
 *  - Recently removed: removed again, restored from the list;
 *  - Edit details: title, authors, series, number and tags survive a reload, and the
 *    series group orders #9 before #10;
 *  - a folder of 30 books and manga imported as a job: progress, Stop part-way, Resume,
 *    and a receipt whose counts add up (imported / already in the library / not imported);
 *  - the same file imported again is reported as already in the library;
 *  - a stored copy deleted behind the app's back shows "File missing" and "Locate file…";
 *  - "Move all to the Recycle Bin" stays inside the run (headless mode's shell.trashItem
 *    moves into the profile; anything outside the run is a violation that fails the run).
 *
 * Every file is generated per run into the run's media folder (fixtures.libraryCollection),
 * with titles no other flow uses, so this flow runs alone or after any other. The shelf's
 * remembered view (grid, no grouping) is put back at the end: other flows click covers.
 */
const fs = require('node:fs');
const path = require('node:path');
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');
const fixtures = require('../fixtures.cjs');

const VIEW_KEY = 'jp-library-view';
const DEFAULT_VIEW = { folder: 'all', group: 'none', layout: 'grid', lang: 'all', level: 'all' };
const SERIES = 'E2E 雨の書';
const PROGRESS = { location: 'p:0:0.42', percent: 0.42 };

const q = (s) => JSON.stringify(s);
const cardSel = (title) => `.card[aria-label=${q(title)}]`;

/** True when `p` is `root` or inside it (case-insensitive, Windows paths). */
function inside(p, root) {
  const a = path.resolve(p).toLowerCase();
  const r = path.resolve(root).toLowerCase();
  return a === r || a.startsWith(r + path.sep);
}

module.exports = {
  id: 'library',
  title: 'Library: remove/undo/restore, details, folder import with stop/resume, duplicates, missing files, trash',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const media = fixtures.libraryCollection(ctx.mediaDir);
    const libraryRoot = path.join(ctx.profile, 'library');
    const trashRoot = path.join(ctx.profile, 'library-trash');

    const list = () => ev(`window.api.listLibrary()`, { await: true });
    const byId = async (id) => ((await list()) ?? []).find((it) => it.id === id) ?? null;
    const status = () => ev(`window.api.libraryImportStatus()`, { await: true });
    const confirmRemove = async () => {
      const dialog = await poll(ctx, `(() => { const d = [...document.querySelectorAll('.ui-dialog')].find((x) => __e2e.vis(x) && /Recently removed/.test(x.innerText)); return d ? d.innerText : null; })()`, 5000);
      await ev(`__e2e.clickText('.ui-dialog button', 'Remove')`);
      return dialog;
    };
    const openLibrary = async () => {
      await ev(`__e2e.open('library')`);
      return poll(ctx, `!!document.querySelector('.library .lib-folder-chip, .library .card, .library [data-library-row]')`, 20000);
    };
    const reload = async () => {
      await ev(`(window.__e2eLibraryBeforeReload = true)`);
      await ctx.request('/reload', { window: 'main' });
      await poll(ctx, `!window.__e2eLibraryBeforeReload && !!(window.api && document.readyState === 'complete' && document.querySelector('.desktop-root'))`, 60000, 500);
      await installHelpers(ctx);
    };
    const setLayout = async (mode) => {
      await ev(`__e2e.click('[data-library-layout=${mode}]')`);
      return poll(ctx, `document.querySelector('[data-library-layout=${mode}]')?.getAttribute('aria-pressed') === 'true' || null`, 5000);
    };
    const selectRow = (id) => ev(`(() => { const r = document.querySelector('[data-library-row=${q(id)}]'); if (!r) return false; if (r.getAttribute('aria-pressed') !== 'true') r.click(); return true; })()`);

    // The shelf opens on its default view whatever an earlier run of this profile left.
    const savedView = await ev(`localStorage.getItem(${q(VIEW_KEY)})`);
    await ev(`(localStorage.setItem(${q(VIEW_KEY)}, ${q(JSON.stringify(DEFAULT_VIEW))}), true)`);

    try {
      // --- two books to work on -------------------------------------------------------------
      const [ko, otsu] = media.shelf;
      const imported = await ev(`window.api.importPaths(${q(media.shelf.map((b) => b.file))})`, { await: true });
      const koItem = (imported ?? []).find((it) => it.title === ko.title);
      const otsuItem = (imported ?? []).find((it) => it.title === otsu.title);
      result.check('two books import onto the shelf', Boolean(koItem && otsuItem), (imported ?? []).slice(0, 5).map((it) => it.title));
      if (!koItem || !otsuItem) return;
      await ev(`window.api.setProgress(${q(koItem.id)}, ${q(PROGRESS)})`, { await: true });

      result.check('the Library opens', Boolean(await openLibrary()));
      const card = await poll(ctx, `!!document.querySelector(${q(cardSel(ko.title))})`, 15000);
      result.check('the book is on the shelf', Boolean(card));

      // --- Remove, then Undo ----------------------------------------------------------------
      await ev(`__e2e.click(document.querySelector(${q(`${cardSel(ko.title)} .card-remove`)}))`);
      const confirmText = await confirmRemove();
      result.check('Remove asks first and says the item stays in Recently removed', /30 days/.test(confirmText ?? ''), confirmText);
      const undoBar = await poll(ctx, `(() => { const u = document.querySelector('.lib-removed__undo'); return u && !document.querySelector(${q(cardSel(ko.title))}) ? u.innerText : null; })()`, 10000);
      result.check('the book leaves the shelf and the Undo bar names it', Boolean(undoBar) && undoBar.includes(ko.title) && /Undo/.test(undoBar), undoBar);
      const trashed = fs.existsSync(path.join(trashRoot, koItem.id)) && !fs.existsSync(path.join(libraryRoot, koItem.id));
      result.check("the removed item's folder waits in the profile's library trash", trashed && inside(trashRoot, ctx.runDir), { trashRoot });
      await ctx.shot('undo-bar');

      await ev(`__e2e.clickText('.lib-removed__undo button', 'Undo')`);
      const back = await poll(ctx, `(!!document.querySelector(${q(cardSel(ko.title))}) && !document.querySelector('.lib-removed__undo')) || null`, 10000);
      const afterUndo = await byId(koItem.id);
      result.check('Undo puts it back on the shelf and the bar goes', Boolean(back));
      result.check('…under the same id, with its reading progress', Boolean(afterUndo) && afterUndo.progress?.percent === PROGRESS.percent && afterUndo.progress?.location === PROGRESS.location,
        afterUndo && { id: afterUndo.id, progress: afterUndo.progress });
      result.check('…and its folder is back in the library', fs.existsSync(path.join(libraryRoot, koItem.id)) && !fs.existsSync(path.join(trashRoot, koItem.id)));
      const trashAfterUndo = await ev(`window.api.listLibraryTrash()`, { await: true });
      result.check('Recently removed no longer lists it', Array.isArray(trashAfterUndo) && !trashAfterUndo.some((e) => e.id === koItem.id), trashAfterUndo);

      // --- Remove again, Restore from "Recently removed" -----------------------------------
      await ev(`__e2e.click(document.querySelector(${q(`${cardSel(ko.title)} .card-remove`)}))`);
      await confirmRemove();
      await poll(ctx, `!!document.querySelector('.lib-removed__undo') || null`, 10000);
      // Close the Undo bar: what is left is the list.
      await ev(`__e2e.click(document.querySelector('.lib-removed__undo button[aria-label]'))`);
      const listed = await poll(ctx, `(() => { if (document.querySelector('.lib-removed__undo')) return null; const d = document.querySelector('details.lib-removed__list'); if (!d) return null; d.open = true; return d.querySelector('summary')?.innerText ?? null; })()`, 10000);
      result.check('with the Undo bar closed, "Recently removed" lists it', Boolean(listed) && /Recently removed \(\d+\)/.test(listed), listed);
      await ctx.shot('recently-removed');
      await ev(`__e2e.click(document.querySelector(${q(`details.lib-removed__list button[aria-label=${q(`Restore ${ko.title}`)}]`)}))`);
      const restored = await poll(ctx, `!!document.querySelector(${q(cardSel(ko.title))}) || null`, 10000);
      const afterRestore = await byId(koItem.id);
      result.check('Restore from the list puts it back, same id and progress', Boolean(restored) && afterRestore?.progress?.percent === PROGRESS.percent,
        afterRestore && { id: afterRestore.id, progress: afterRestore.progress });

      // --- Edit details ----------------------------------------------------------------------
      // Without a series, the shelf shows the newer book first; the first one gets #10, so
      // only a real series order can put #9 in front of it.
      const shelfOrder = await ev(`[...document.querySelectorAll('.card')].map((c) => c.getAttribute('aria-label')).filter((t) => t === ${q(ko.title)} || t === ${q(otsu.title)})`);
      const [firstTitle, secondTitle] = shelfOrder?.length === 2 ? shelfOrder : [ko.title, otsu.title];
      const firstId = firstTitle === ko.title ? koItem.id : otsuItem.id;
      const secondId = firstId === koItem.id ? otsuItem.id : koItem.id;
      const edited = {
        title: `${firstTitle}（改訂版）`,
        author: '山田 太郎 & 佐藤 花子',
        series: SERIES,
        seriesIndex: '10',
        tags: 'e2e, 小説, 再読',
      };
      result.check('the List layout is offered', Boolean(await setLayout('list')));
      const editDetails = async (id, values) => {
        await selectRow(id);
        const drawer = await poll(ctx, `__e2e.byText('.lib-drawer-actions button', 'Edit details') ? true : null`, 8000);
        if (!drawer) return { drawer: false };
        await ev(`__e2e.clickText('.lib-drawer-actions button', 'Edit details')`);
        const form = await poll(ctx, `!!document.querySelector('.lib-meta-editor [id$="-title"]') || null`, 5000);
        if (!form) return { drawer: true, form: false };
        await ev(`(() => {
          const set = (field, value) => __e2e.fill(document.querySelector('.lib-meta-editor [id$="-' + field + '"]'), value);
          const v = ${q(values)};
          for (const k of Object.keys(v)) set(k, v[k]);
          return true;
        })()`);
        await ev(`__e2e.clickText('.lib-meta-editor .ui-dialog__foot button', 'Save')`);
        const closed = await poll(ctx, `!document.querySelector('.lib-meta-editor') || null`, 8000);
        const error = closed ? null : await ev(`document.querySelector('.lib-meta-editor [role=alert]')?.textContent ?? null`);
        return { drawer: true, form: true, closed: Boolean(closed), error };
      };
      const firstEdit = await editDetails(firstId, edited);
      result.check('Edit details opens from the drawer and saves', Boolean(firstEdit.closed), firstEdit);
      const drawerMeta = await poll(ctx, `(() => { const m = document.querySelector('.lib-drawer-meta'); return m && m.innerText.includes(${q(SERIES)}) ? m.innerText : null; })()`, 5000);
      result.check('the drawer shows the authors, "series, #10" and the tags', Boolean(drawerMeta) && drawerMeta.includes('山田 太郎 & 佐藤 花子') && drawerMeta.includes(`${SERIES}, #10`) && /小説/.test(drawerMeta) && /再読/.test(drawerMeta), drawerMeta);
      await ctx.shot('details');
      const secondEdit = await editDetails(secondId, { series: SERIES, seriesIndex: '9' });
      result.check('the second book joins the series as #9', Boolean(secondEdit.closed), secondEdit);

      // Persisted: a reload re-reads main's library, and library.json on disk agrees.
      await reload();
      result.check('the Library opens again after a reload', Boolean(await openLibrary()));
      const firstAfter = await byId(firstId);
      const secondAfter = await byId(secondId);
      const wantFirst = { title: edited.title, author: '山田 太郎 & 佐藤 花子', series: SERIES, seriesIndex: 10, tags: ['e2e', '小説', '再読'] };
      const pick = (it) => it && { title: it.title, author: it.author, series: it.series, seriesIndex: it.seriesIndex, tags: it.tags };
      result.check('after a reload the edited title, authors, series, number and tags are kept', JSON.stringify(pick(firstAfter)) === JSON.stringify(wantFirst), { got: pick(firstAfter), want: wantFirst });
      result.check('…and the second book keeps its own title, in the series as #9', secondAfter?.title === secondTitle && secondAfter?.series === SERIES && secondAfter?.seriesIndex === 9, pick(secondAfter));
      let onDisk = null;
      try {
        const rows = JSON.parse(fs.readFileSync(path.join(ctx.profile, 'library.json'), 'utf8'));
        onDisk = pick(rows.find((it) => it.id === firstId));
      } catch (err) {
        onDisk = String(err);
      }
      result.check("library.json in the profile holds the edit", JSON.stringify(onDisk) === JSON.stringify(wantFirst), onDisk);

      // Series grouping on the covers: #9 before #10.
      await setLayout('grid');
      await ev(`(() => { const s = document.querySelector('#lib-group, #aero-lib-group'); s.value = 'series'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      const group = await poll(ctx, `(() => { const g = [...document.querySelectorAll('.lib-group')].find((x) => x.querySelector('.lib-group-head')?.textContent === ${q(SERIES)}); return g ? [...g.querySelectorAll('.card')].map((c) => c.getAttribute('aria-label')) : null; })()`, 8000);
      result.check(`grouped by series, "${SERIES}" lists #9 before #10`, JSON.stringify(group) === JSON.stringify([secondTitle, edited.title]), { group, want: [secondTitle, edited.title] });
      await ctx.shot('series');
      // The shelf search reaches tags.
      await ev(`__e2e.fill(document.querySelector('#lib-search, #aero-lib-search'), '再読')`);
      const searched = await poll(ctx, `(() => { const t = [...document.querySelectorAll('.card')].map((c) => c.getAttribute('aria-label')); return t.length === 1 ? t : null; })()`, 5000);
      result.check('the shelf search finds the book by its tag', JSON.stringify(searched) === JSON.stringify([edited.title]), searched);
      await ev(`__e2e.fill(document.querySelector('#lib-search, #aero-lib-search'), '')`);
      await ev(`(() => { const s = document.querySelector('#lib-group, #aero-lib-group'); s.value = 'none'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);

      // --- a folder of 30 books and manga: progress, Stop, Resume ---------------------------
      // A page-side watcher presses the strip's Stop as soon as a few files are in (a
      // bridge round trip per poll would be slower than the import), and records what the
      // strip showed while it ran.
      await ev(`(() => {
        window.__e2eLibImport?.observer?.disconnect();
        window.__e2eLibImport?.off?.();
        const rec = { running: [], bar: null, stoppedAt: null, events: [] };
        rec.off = window.api.onLibraryImportProgress((p) => rec.events.push({ state: p.state, done: p.done, total: p.total }));
        rec.observer = new MutationObserver(() => {
          const strip = document.querySelector('.lib-import-status[data-import-state="running"]');
          if (!strip) return;
          const bar = strip.querySelector('progress');
          const line = strip.innerText.replace(/\\s+/g, ' ').trim();
          if (rec.running.length < 40 && rec.running[rec.running.length - 1] !== line) rec.running.push(line);
          if (bar) rec.bar = { value: Number(bar.value), max: Number(bar.max) };
          const done = Number(bar?.value ?? 0);
          if (rec.stoppedAt === null && done >= 3) {
            const stop = [...strip.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Stop' && !b.disabled);
            if (stop) {
              stop.click();
              rec.stoppedAt = done;
            }
          }
        });
        rec.observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        window.__e2eLibImport = rec;
        return true;
      })()`);
      await ctx.e2e('queueDialog', { kind: 'open', result: { canceled: false, filePaths: [media.collectionDir] } });
      await ev(`(() => { const d = document.querySelector('details.lib-more'); if (d) d.open = true; return true; })()`);
      const clicked = await ev(`__e2e.clickText('.lib-more-body button', 'Import a folder of books')`);
      result.check('"Import a folder of books" is offered (More imports)', clicked === true);
      const stoppedStrip = await poll(ctx, `(() => { const s = document.querySelector('.lib-import-status[data-import-state="cancelled"], .lib-import-status[data-import-state="done"]'); return s ? { state: s.dataset.importState, text: s.innerText.replace(/\\s+/g, ' ') } : null; })()`, 60000, 200);
      const rec1 = await ev(`(() => { const r = window.__e2eLibImport; return { running: r.running, bar: r.bar, stoppedAt: r.stoppedAt, events: r.events.length, maxDone: Math.max(0, ...r.events.filter((e) => e.state === 'running').map((e) => e.done)) }; })()`);
      const first = (await status())?.progress ?? null;
      const resumable = (await status())?.resumable ?? 0;
      result.check('the import shows its progress ("Importing N of 30", a progress bar, the file now)',
        rec1.running.some((l) => /Importing \d+ of 30/.test(l)) && rec1.bar?.max === 30 && rec1.running.some((l) => /Now: .+\.(epub|cbz)/.test(l)), rec1);
      result.check('Stop part-way stops the job with files left',
        stoppedStrip?.state === 'cancelled' && first?.state === 'cancelled' && first.done > 0 && first.done < 30 && first.remaining === 30 - first.done && resumable === first.remaining,
        { strip: stoppedStrip, progress: first && { state: first.state, done: first.done, imported: first.imported, remaining: first.remaining }, resumable, pressedAt: rec1.stoppedAt });
      result.check('the stopped strip says so and offers Resume', /Import stopped\./.test(stoppedStrip?.text ?? '') && /Not reached: \d+/.test(stoppedStrip?.text ?? '') && /Resume/.test(stoppedStrip?.text ?? ''), stoppedStrip?.text);
      await ctx.shot('import-stopped');
      const partial = ((await list()) ?? []).filter((it) => /^E2E 蔵書 \d\d$|^\d\d-manga-e2e-\d\d$/.test(it.title)).length;
      result.check('what was imported before Stop is already on the shelf', first ? partial === first.imported : false, { onShelf: partial, imported: first?.imported });

      await ev(`(window.__e2eLibImport.observer.disconnect(), true)`);
      await ev(`__e2e.clickText('.lib-import-status button', 'Resume')`);
      const doneStrip = await poll(ctx, `(() => { const s = document.querySelector('.lib-import-status[data-import-state="done"]'); return s ? s.innerText.replace(/\\s+/g, ' ') : null; })()`, 120000, 300);
      const second = (await status())?.progress ?? null;
      const sum = (k) => (first?.[k] ?? 0) + (second?.[k] ?? 0);
      result.check('Resume imports the rest and finishes', Boolean(doneStrip) && second?.state === 'done' && second.remaining === 0 && first && second.jobId !== first.jobId,
        second && { state: second.state, total: second.total, done: second.done, remaining: second.remaining });
      result.check('the two runs together met every file once',
        sum('done') === media.expected.total && second?.total === first?.remaining,
        { firstDone: first?.done, secondDone: second?.done, secondTotal: second?.total, expected: media.expected.total });
      result.check(`summary counts: ${media.expected.imported} added, ${media.expected.duplicates} already in the library, ${media.expected.failed} not imported`,
        sum('imported') === media.expected.imported && sum('duplicates') === media.expected.duplicates && sum('failed') === media.expected.failed,
        { imported: sum('imported'), duplicates: sum('duplicates'), failed: sum('failed'), expected: media.expected });
      const receiptOk = Boolean(doneStrip) && second
        && doneStrip.includes('Import finished.') && doneStrip.includes(`Added: ${second.imported}`)
        && (second.duplicates ? doneStrip.includes(`Already in the library: ${second.duplicates}`) : !doneStrip.includes('Already in the library'))
        && (second.failed ? doneStrip.includes(`Not imported: ${second.failed}`) : !doneStrip.includes('Not imported'));
      result.check("the receipt shows the resumed job's counts", receiptOk, doneStrip);
      const failures = [...(first?.failures ?? []), ...(second?.failures ?? [])];
      result.check('the broken archive is the one failure, named, as "no images"', failures.length === 1 && failures[0].name === path.basename(media.broken) && failures[0].errorCode === 'no-pages', failures);
      const shelfTitles = new Set(((await list()) ?? []).map((it) => it.title));
      const missingTitles = [...media.books, ...media.manga].map((b) => b.title).filter((t) => !shelfTitles.has(t));
      result.check('every book and manga of the folder is on the shelf', missingTitles.length === 0, missingTitles);
      await ctx.shot('import-done');
      await ev(`(window.__e2eLibImport.off?.(), true)`);

      // --- the same file again: already in the library --------------------------------------
      const countBefore = ((await list()) ?? []).length;
      const lastJob = second?.jobId ?? first?.jobId ?? null;
      // Dismiss the folder's receipt, so the strip that comes next is this import's.
      await ev(`__e2e.clickText('.lib-import-status button', 'Dismiss')`);
      await poll(ctx, `!document.querySelector('.lib-import-status') || null`, 5000);
      await ctx.e2e('queueDialog', { kind: 'open', result: { canceled: false, filePaths: [ko.file] } });
      await ev(`__e2e.clickText('.library .actions button', 'Import files')`);
      const dupStrip = await poll(ctx, `(() => { const s = document.querySelector('.lib-import-status[data-import-state="done"]'); return s ? s.innerText.replace(/\\s+/g, ' ') : null; })()`, 20000, 300);
      const dup = (await status())?.progress ?? null;
      const countAfter = ((await list()) ?? []).length;
      result.check('importing the same file again reports it as already in the library',
        Boolean(dupStrip) && /Already in the library: 1/.test(dupStrip) && /Added: 0/.test(dupStrip) && dup?.jobId !== lastJob && dup?.total === 1 && dup?.duplicates === 1 && dup?.imported === 0,
        { strip: dupStrip, progress: dup && { total: dup.total, imported: dup.imported, duplicates: dup.duplicates } });
      result.check('…and adds nothing to the shelf', countAfter === countBefore, { countBefore, countAfter });
      await ctx.shot('duplicate');

      // --- a stored copy deleted behind the app's back --------------------------------------
      const victim = ((await list()) ?? []).find((it) => it.title === media.books[4].title);
      const storedFile = victim ? path.join(libraryRoot, victim.id, victim.epubFile ?? 'original.epub') : null;
      let deleted = false;
      if (storedFile && inside(storedFile, ctx.runDir) && fs.existsSync(storedFile)) {
        fs.rmSync(storedFile);
        deleted = true;
      }
      result.check('a stored copy inside the temp profile is deleted', deleted, storedFile);
      if (victim && deleted) {
        // The shelf checks for missing copies when its items change; a fresh window is
        // what a user would meet.
        await reload();
        await openLibrary();
        await setLayout('list');
        await poll(ctx, `!!document.querySelector('[data-library-row=${q(victim.id)}]') || null`, 10000);
        await selectRow(victim.id);
        const missing = await poll(ctx, `(() => { const m = document.querySelector('[data-library-missing=${q(victim.id)}]'); return m ? { text: m.innerText.replace(/\\s+/g, ' '), locate: [...m.querySelectorAll('button')].map((b) => b.innerText.trim()) } : null; })()`, 10000);
        result.check('the shelf marks it "File missing" and offers "Locate file…"', Boolean(missing) && /File missing/.test(missing.text) && missing.locate.includes('Locate file…'), missing);
        await ctx.shot('missing');
        // Locate it: the chosen copy goes back under the same item.
        const source = media.books[4].file;
        await ctx.e2e('queueDialog', { kind: 'open', result: { canceled: false, filePaths: [source] } });
        await ev(`__e2e.clickText(${q(`[data-library-missing=${q(victim.id)}] button`)}, 'Locate file…')`);
        const relinked = await poll(ctx, `(!document.querySelector('[data-library-missing=${q(victim.id)}]') && document.body.innerText.includes('Found — the item can be opened again.')) || null`, 10000);
        result.check('"Locate file…" puts the copy back and the marker goes', Boolean(relinked) && fs.existsSync(storedFile), { relinked, restoredCopy: fs.existsSync(storedFile) });
      }

      // --- the Recycle Bin stays inside the run ---------------------------------------------
      await setLayout('grid');
      const goner = media.books[17].title;
      await poll(ctx, `!!document.querySelector(${q(cardSel(goner))}) || null`, 10000);
      const gonerId = ((await list()) ?? []).find((it) => it.title === goner)?.id;
      await ev(`__e2e.click(document.querySelector(${q(`${cardSel(goner)} .card-remove`)}))`);
      await confirmRemove();
      await poll(ctx, `!!document.querySelector('details.lib-removed__list') || null`, 10000);
      // Judged from here on; earlier records (and any violation) stay for the harness's own check.
      const since = Date.now() - 50;
      await ev(`(() => { const d = document.querySelector('details.lib-removed__list'); d.open = true; return __e2e.clickText('details.lib-removed__list button', 'Move all to the Recycle Bin'); })()`);
      const confirmBin = await poll(ctx, `(() => { const d = [...document.querySelectorAll('.ui-dialog')].find((x) => __e2e.vis(x) && /Recycle Bin/.test(x.innerText)); return d ? d.innerText : null; })()`, 5000);
      await ev(`__e2e.clickText('.ui-dialog .ui-btn--danger', 'Move all to the Recycle Bin')`);
      const emptied = await pollAsync(ctx, `window.api.listLibraryTrash().then((l) => (Array.isArray(l) && l.length === 0) || null)`, 10000);
      const st = await ctx.e2e('status');
      const moves = (st.calls ?? []).filter((c) => c.ts >= since && /shell\.trashItem/.test(c.api));
      const binDir = path.join(ctx.profile, 'e2e-trash');
      const binned = fs.existsSync(binDir) ? fs.readdirSync(binDir).filter((n) => gonerId && n.endsWith(`-${gonerId}`)) : [];
      const outside = (st.violations ?? []).filter((v) => /trashItem/.test(v.api));
      result.check('"Move all to the Recycle Bin" asks first, then empties Recently removed', Boolean(confirmBin) && Boolean(emptied), { confirmBin, emptied });
      result.check("every Recycle Bin move stayed inside the run's temp folder",
        moves.length > 0 && moves.every((m) => /moved inside the run/.test(m.api) && inside(m.detail, ctx.runDir)) && outside.length === 0 && binned.length === 1 && inside(binDir, ctx.runDir),
        { moves, outside, binned, runDir: ctx.runDir });
      result.check("the item's folder left the library trash", Boolean(gonerId) && !fs.existsSync(path.join(trashRoot, gonerId)));
    } finally {
      // Leave the shelf as other flows expect it: covers, no grouping, nothing searched.
      try {
        await ev(`(() => { window.__e2eLibImport?.observer?.disconnect(); window.__e2eLibImport?.off?.(); return true; })()`);
        if (await ev(`!!document.querySelector('[data-library-layout=grid]')`)) await setLayout('grid');
        await ev(`(() => { const s = document.querySelector('#lib-group, #aero-lib-group'); if (s && s.value !== 'none') { s.value = 'none'; s.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`);
        await ev(`(() => { const i = document.querySelector('#lib-search, #aero-lib-search'); if (i && i.value) __e2e.fill(i, ''); return true; })()`);
        await ctx.sleep(300);
        await ev(savedView === null || savedView === undefined
          ? `(localStorage.setItem(${q(VIEW_KEY)}, ${q(JSON.stringify(DEFAULT_VIEW))}), true)`
          : `(localStorage.setItem(${q(VIEW_KEY)}, ${q(savedView)}), true)`);
      } catch (err) {
        result.note(`could not restore the shelf view: ${err}`);
      }
    }
  },
};
