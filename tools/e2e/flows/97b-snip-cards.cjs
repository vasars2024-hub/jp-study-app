'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Snip to cards, end to end, headless.
 *
 * A "Win+Shift+S snip" is a picture that appears on the clipboard. The harness's clipboard
 * is in memory (src/main/e2eHeadless.ts), so the flow puts a rendered picture of Japanese
 * text there — exactly what the Snipping Tool leaves — and asserts that the running app:
 *
 *  - notices it (Snip to cards is ON by default) and reads it — in a fresh profile with the
 *    bundled offline recognizer, since no OCR model is installed (none is downloaded);
 *  - adds the unknown words as cards in the deck ("Snips" folder) and as notes in the fake
 *    AnkiConnect;
 *  - records a history entry, and renders the Snips analysis view (breakdown, cards);
 *  - shows the toast, whose Undo removes exactly those cards and notes;
 *  - never reads the same picture twice.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ensureDictionaryReady, installHelpers, poll, pollAsync, DECK } = require('./_lib.cjs');

const SNIP_TEXT = '窓辺の猫は静かに眠っていた。';
const TOAST = 'snipToast=1';

/** The snip: one line of Japanese on white, the size of a typical text snip. */
async function renderSnip(dir) {
  const world = require('../world.cjs');
  const file = path.join(dir, 'snip-cards.png');
  const textFile = path.join(dir, 'snip-cards.txt');
  fs.writeFileSync(textFile, SNIP_TEXT, 'utf8');
  await world.ffmpeg([
    '-f', 'lavfi', '-i', 'color=c=white:s=1240x200',
    '-frames:v', '1',
    '-vf', `drawtext=fontfile='${world.filterPath(world.FONT)}':textfile='${world.filterPath(textFile)}':x=40:y=56:fontsize=80:fontcolor=black`,
    file,
  ]);
  return file;
}

module.exports = {
  id: 'snip-cards',
  title: 'Snip to cards: clipboard snip -> OCR -> cards + Anki -> analysis -> Undo',
  async run(ctx) {
    const { eval: ev, result, world } = ctx;
    await installHelpers(ctx);
    if (!world?.anki) {
      result.skip('needs the harness world (fake AnkiConnect); run the full harness');
      return;
    }
    const fake = world.anki.fake;
    // Unknown words are found with the built-in dictionary: wait for it here rather than
    // rely on the `dictionary` flow having run first in this profile.
    const dict = await ensureDictionaryReady(ctx);
    result.check('the built-in dictionary is ready for lookups', dict.ready, dict);

    // --- On by default, nothing read yet ----------------------------------------------------
    const status = await ev(`window.api.snipGetStatus()`, { await: true });
    result.check('Snip to cards is on by default in a fresh profile', status?.enabled === true && status?.autoAdd === true && status?.maxWords === 12, status);
    const engines = await ev(`window.api.lensOcrEngineStatus()`, { await: true });
    result.note(`OCR engines: ${JSON.stringify(engines)} (none installed means the bundled offline recognizer reads the snip)`);
    const historyBefore = (await ev(`window.api.snipHistoryList({})`, { await: true })) ?? [];

    let image;
    try {
      image = await renderSnip(ctx.mediaDir);
    } catch (err) {
      result.note(`could not render the snip picture (${err.message}); using the synthetic screen`);
      image = world.screen?.file;
    }
    if (!image || !fs.existsSync(image)) {
      result.check('a snip picture exists to put on the clipboard', false, { image });
      return;
    }
    const notesBefore = new Set(fake.notes.keys());

    // --- The snip lands on the clipboard ----------------------------------------------------
    const clip = await ctx.e2e('clipboard', { set: { imagePath: image } });
    result.check('the snip picture is on the (in-memory) clipboard', clip?.clipboard?.hasImage === true, clip?.clipboard);

    const entry = await pollAsync(ctx, `window.api.snipHistoryList({}).then((list) => {
      const fresh = (list || []).filter((e) => !${JSON.stringify(historyBefore.map((e) => e.id))}.includes(e.id));
      const done = fresh.find((e) => e.status !== 'processing');
      return done || null;
    })`, 240000, 500);
    result.check('the snip was noticed and read (history entry finished)', Boolean(entry), entry ? { id: entry.id, status: entry.status, error: entry.error } : 'no entry');
    if (!entry) return;
    result.note(`read by ${entry.engine} (confidence ${entry.confidence ?? 'n/a'}): ${JSON.stringify(entry.text)}`);
    result.check('the OCR read the snipped Japanese', entry.status === 'done' && /猫|窓|眠|静/.test(entry.text), { status: entry.status, error: entry.error, text: entry.text });
    const added = (entry.words || []).filter((w) => w.status === 'added');
    result.note(`words: ${(entry.words || []).map((w) => `${w.surface}:${w.status}`).join(' ')}`);
    result.check('the unknown words became cards (particles and auxiliaries skipped)',
      added.length >= 1 && entry.cardIds.length === added.length
        && !(entry.words || []).some((w) => w.status === 'added' && /^(の|は|に|た|て|を|が)$/.test(w.surface)),
      { added: added.map((w) => w.lemma), cardIds: entry.cardIds });

    // --- Cards in the deck ------------------------------------------------------------------
    const deck = await poll(ctx, `(() => { const ids = ${JSON.stringify(entry.cardIds)}; const cards = ${DECK}.filter((c) => ids.includes(c.id)); return cards.length === ids.length && ids.length ? cards.map((c) => ({ id: c.id, word: c.word, folder: c.folder, sentence: c.sentence, image: Boolean(c.imagePath), anki: c.ankiNoteId || null })) : null; })()`, 20000);
    result.check('the cards are in the deck, in the "Snips" deck, with the OCR sentence and the picture',
      Boolean(deck) && deck.every((c) => c.folder === 'Snips' && c.sentence && c.image), deck);

    // --- Notes in (fake) Anki -----------------------------------------------------------------
    const newNotes = [...fake.notes.values()].filter((n) => !notesBefore.has(n.noteId));
    result.check('the fake AnkiConnect received the notes (one per card)',
      newNotes.length >= 1 && entry.ankiNoteIds.length === newNotes.length
        && entry.ankiNoteIds.every((id) => fake.notes.has(id)),
      { notes: newNotes.map((n) => ({ id: n.noteId, first: Object.values(n.fields)[0] })), recorded: entry.ankiNoteIds });

    // --- The analysis view --------------------------------------------------------------------
    // It comes forward by itself when the window is on screen; open it explicitly otherwise.
    let view = await poll(ctx, `!!document.querySelector('.snip-app .snip-words tbody tr')`, 8000);
    if (!view) {
      await ev(`__e2e.open('snips')`);
      view = await poll(ctx, `!!document.querySelector('.snip-app .snip-words tbody tr')`, 20000);
    }
    const rendered = await ev(`(() => {
      const app = document.querySelector('.snip-app');
      if (!app) return null;
      return {
        history: app.querySelectorAll('.snip-history-item').length,
        rows: app.querySelectorAll('.snip-words tbody tr').length,
        added: app.querySelectorAll('.snip-words tr.is-added').length,
        ruby: app.querySelectorAll('.snip-text ruby').length,
        image: Boolean(app.querySelector('img.snip-image')),
        text: (app.querySelector('.snip-text')?.textContent || '').slice(0, 60),
      };
    })()`);
    result.check('the Snips view renders the history entry and the word-by-word analysis',
      Boolean(view) && rendered?.history >= 1 && rendered?.rows >= 1 && rendered?.added === added.length,
      rendered);
    try {
      await ctx.shot('analysis');
    } catch (err) {
      result.note(`no analysis screenshot: ${err.message}`);
    }

    // --- The toast, and Undo -----------------------------------------------------------------
    const toast = await poll({ ...ctx, eval: (js) => ctx.eval(js, { window: TOAST }) }, `(() => { const m = document.querySelector('.snip-toast-message'); return m ? { text: m.textContent, undo: Boolean(document.querySelector('.snip-toast-undo')) } : null; })()`, 10000);
    result.note(toast ? `toast: ${toast.text}` : 'no background toast (the in-app toast was used)');
    let undoVia = '';
    if (toast?.undo) {
      try {
        await ctx.shot('toast', { window: TOAST });
      } catch (err) {
        result.note(`no toast screenshot: ${err.message}`);
      }
      await ctx.eval(`document.querySelector('.snip-toast-undo').click()`, { window: TOAST });
      undoVia = 'toast';
    } else {
      undoVia = (await ev(`(() => { const b = [...document.querySelectorAll('.snip-app .snip-section-head .snip-btn')].find((x) => /Undo/.test(x.textContent)); if (b) { b.click(); return 'view'; } return ''; })()`)) || '';
    }
    result.check('the toast says what was added, and offers Undo', toast ? /Added \d+ words? from snip/.test(toast.text) && toast.undo : undoVia === 'view', { toast, undoVia });

    const undone = await pollAsync(ctx, `window.api.snipHistoryGet(${JSON.stringify(entry.id)}).then((e) => e && e.undone ? e : null)`, 30000, 400);
    const deckAfter = await ev(`(() => { const ids = ${JSON.stringify(entry.cardIds)}; return ${DECK}.filter((c) => ids.includes(c.id)).length; })()`);
    const notesLeft = entry.ankiNoteIds.filter((id) => fake.notes.has(id));
    result.check(`Undo (from the ${undoVia || 'nowhere'}) removed exactly this snip's cards and Anki notes`,
      Boolean(undone) && deckAfter === 0 && notesLeft.length === 0 && undone.cardIds.length === 0,
      { undone: Boolean(undone), cardsLeft: deckAfter, notesLeft, otherNotes: fake.notes.size });

    // --- The same picture is never read twice ------------------------------------------------
    await ctx.e2e('clipboard', { set: { text: 'x' } });
    await ctx.sleep(1200);
    await ctx.e2e('clipboard', { set: { imagePath: image } });
    await ctx.sleep(2500);
    const historyAfter = (await ev(`window.api.snipHistoryList({})`, { await: true })) ?? [];
    result.check('the same picture put back on the clipboard is not read again', historyAfter.length === historyBefore.length + 1, { before: historyBefore.length, after: historyAfter.length });

    // Leave the clipboard without a picture for the flows after this one.
    await ctx.e2e('clipboard', { set: { text: '' } });
  },
};
