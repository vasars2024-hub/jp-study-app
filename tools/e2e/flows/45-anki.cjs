'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Anki two-way sync against the harness's fake AnkiConnect (tools/e2e/world.cjs): never
 * the owner's Anki. The app's `ankiUrl` points at the fake (profiles.json), and headless
 * mode remaps 8765 onto it as well.
 *
 *  - mine: two words from the dictionary page ("+ Add to Anki") become notes in the fake
 *    (deck + note type created on the way), and the Gum cards carry the note ids;
 *  - review in Gum with "Send my Gum reviews to Anki" on: the linked cards are graded
 *    through the real review UI, "Sync now" pushes them, and the fake receives the
 *    answers — one per note, with the Gum ease, in the order they were given;
 *  - with Anki owning scheduling, "Sync now" mirrors Anki's schedule, and a card Anki
 *    has due tomorrow is dated at the start of tomorrow's STUDY day: the study day is
 *    set to start an hour from now, so "now" is still in yesterday's study day and a
 *    midnight anchor would be a whole day off.
 */
const { installHelpers, poll, ensureDictionaryReady } = require('./_lib.cjs');

const WORDS = ['飲む', '窓'];
const PLAN = ['good', 'hard', 'easy', 'good', 'good'];
const EASE = { again: 1, hard: 2, good: 3, easy: 4 };
const DECK = `(() => { const d = JSON.parse(localStorage.getItem('jp-flashcard-deck') || '{"cards":[]}'); return d.cards || d; })()`;

module.exports = {
  id: 'anki',
  title: 'Anki sync (fake AnkiConnect): mine, review, answers in order',
  async run(ctx) {
    const { eval: ev, result, world } = ctx;
    if (!world) {
      result.skip('no fake AnkiConnect in this process (run it through npm run e2e or --serve)');
      return;
    }
    const fake = world.anki.fake;
    await installHelpers(ctx);

    // --- mine from the dictionary --------------------------------------------------------
    // A fresh profile may still be loading the built-in dictionary; wait for it here rather
    // than rely on the `dictionary` flow having run first.
    const dict = await ensureDictionaryReady(ctx, { word: WORDS[0] });
    result.check('the built-in dictionary is ready for lookups', dict.ready, dict);
    await ev(`__e2e.open('dictionary')`);
    await poll(ctx, `!!document.querySelector('form.dict-search input')`, 20000);
    for (const word of WORDS) {
      // The page may still be settling under the first search; the user would search
      // again, and so does the flow (for up to a minute).
      let first = null;
      for (const until = Date.now() + 60000; !first && Date.now() < until;) {
        await ev(`(() => { const i = document.querySelector('form.dict-search input'); __e2e.fill(i, ${JSON.stringify(word)}); i.form.requestSubmit(); return true; })()`);
        first = await poll(ctx, `(() => { const e = document.querySelector('.dict-entry'); const w = e?.querySelector('.dict-word')?.textContent; return w === ${JSON.stringify(word)} ? w : null; })()`, 10000);
      }
      if (!first) {
        result.check(`dictionary finds ${word}`, false, await ev(`document.querySelector('.dict-entry .dict-word')?.textContent ?? null`));
        continue;
      }
      const notesBefore = fake.notes.size;
      await ev(`__e2e.click(document.querySelector('.dict-entry .dict-add'))`);
      const done = await poll(ctx, `(() => { const b = document.querySelector('.dict-entry .dict-add'); return b && b.classList.contains('done') ? b.textContent : null; })()`, 30000);
      const err = await ev(`document.querySelector('.dict-entry .dict-add-err')?.textContent ?? null`);
      const deadline = Date.now() + 15000;
      while (fake.notes.size === notesBefore && Date.now() < deadline) await ctx.sleep(200);
      const note = [...fake.notes.values()].find((n) => Object.values(n.fields).includes(word));
      const card = note ? fake.cards.get(note.cards[0]) : null;
      result.check(`"+ Add to Anki" on ${word} makes a note in the fake AnkiConnect`, Boolean(done) && Boolean(note), { done, err, note: note && { model: note.modelName, fields: note.fields, tags: note.tags, deck: card?.deckName } });
      if (word === WORDS[0]) await ctx.shot('mined');
    }
    const actions = [...new Set(fake.calls.map((c) => c.action))];
    result.check('the mine created its deck and note type the way it does in a real Anki', actions.includes('createDeck') && actions.includes('createModel') && actions.includes('addNote'), actions);
    const firstNote = [...fake.notes.values()].find((n) => Object.values(n.fields).includes(WORDS[0]));
    result.check('the note carries the term, its reading and the Gum tags', Boolean(firstNote) && Object.values(firstNote.fields).some((v) => /のむ/.test(v)) && firstNote.tags.some((t) => /^jp-study-app/.test(t)), firstNote);

    // The note id is written onto the Gum card once addNote has answered.
    await poll(ctx, `(() => { const want = new Set(${JSON.stringify(WORDS)}); return ${DECK}.filter((c) => want.has(c.word) && c.ankiNoteId > 0).length === want.size; })()`, 15000);
    const linked = await ev(`${DECK}.filter((c) => typeof c.ankiNoteId === 'number' && c.ankiNoteId > 0).map((c) => ({ id: c.id, word: c.word, meaning: c.meaning || c.definition || '', reading: c.reading || '', noteId: c.ankiNoteId }))`);
    const mineLinked = linked.filter((c) => WORDS.includes(c.word));
    result.check('the Gum cards are linked to their Anki notes (ankiNoteId)', mineLinked.length === WORDS.length && mineLinked.every((c) => fake.notes.has(c.noteId)), linked);

    // --- turn "Send my Gum reviews to Anki" on, through the Anki app ---------------------
    await ev(`__e2e.open('anki')`);
    let panel = await poll(ctx, `!!document.querySelector('.anki-sync-status')`, 10000);
    if (!panel) {
      // The sync card sits on its own tab in some layouts.
      await ev(`(() => { const t = [...document.querySelectorAll('[role=tab], button')].find((b) => __e2e.vis(b) && /sync/i.test(b.textContent || '')); if (t) t.click(); return !!t; })()`);
      panel = await poll(ctx, `!!document.querySelector('.anki-sync-status')`, 10000);
    }
    result.check('the Anki app shows "Sync with Anki"', Boolean(panel));
    const toggled = await ev(`(() => {
      const label = [...document.querySelectorAll('.anki-sync-status label')].find((l) => /Send my Gum reviews to Anki/.test(l.textContent || ''));
      const box = label?.querySelector('input[type=checkbox]');
      if (!box) return 'no toggle';
      if (!box.checked) box.click();
      return box.checked;
    })()`);
    const pushOn = await poll(ctx, `localStorage.getItem('jp-anki-push-reviews') === '1'`, 5000);
    result.check('"Send my Gum reviews to Anki" is on', toggled === true && Boolean(pushOn), { toggled, pushOn });

    // --- review the linked cards in Gum --------------------------------------------------
    await ev(`__e2e.open('flashcards')`);
    const start = await poll(ctx, `__e2e.byText('button', /^Start review \\(\\d+\\)$/)?.textContent ?? null`, 20000);
    result.check('Flashcards offers a review that includes the mined cards', Boolean(start), start);
    if (!start) return;
    const startAt = await ev(`Date.now()`);
    await ev(`__e2e.click(__e2e.byText('button', /^Start review \\(\\d+\\)$/))`);
    await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-card')`, 10000);

    const byText = new Map();
    for (const c of linked) {
      byText.set(c.word, c);
      if (c.meaning) byText.set(c.meaning, c);
    }
    const current = async () => {
      const raw = await ev(`(() => { const c = document.querySelector('.flash-review-shell .flash-card'); return c ? (c.querySelector('.flash-word')?.textContent || c.querySelector('.flash-recall-prompt')?.textContent || c.innerText || '').trim() : null; })()`);
      if (raw === null) return null;
      for (const [text, card] of byText) if (raw === text || raw.includes(text)) return { raw, card };
      return { raw, card: null };
    };
    // A grade is complete when the review has moved on (the answer side is gone, or the
    // session ended), so the next read can never be the card just graded — reading it
    // mid-transition once sent the next card an Easy meant for an unlinked one.
    const grade = async (rating) => {
      const cls = rating === 'good' ? 'got' : rating;
      await ev(`(() => { const b = document.querySelector('.flash-review-shell .flash-actions .btn.primary'); if (b && !document.querySelector('.flash-review-shell .flash-again')) b.click(); return true; })()`);
      await poll(ctx, `!!document.querySelector('.flash-review-shell .flash-${cls}')`, 5000);
      const before = await ev(`(document.querySelector('.flash-review-shell .flash-card')?.innerText || '')`);
      await ev(`__e2e.click(document.querySelector('.flash-review-shell .flash-${cls}'))`);
      await poll(ctx, `(() => { const c = document.querySelector('.flash-review-shell .flash-card'); return !c || !document.querySelector('.flash-review-shell .flash-${cls}') || (c.innerText || '') !== ${JSON.stringify(before)} ? true : null; })()`, 5000, 50);
      await ctx.sleep(150);
    };
    const given = [];
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const now = await current();
      if (!now) break;
      if (now.card && !seen.has(now.card.id)) {
        const rating = PLAN[given.length] ?? 'good';
        seen.add(now.card.id);
        given.push({ word: now.card.word, noteId: now.card.noteId, rating, ease: EASE[rating] });
        await grade(rating);
        if (given.length === 1) await ctx.shot('review');
      } else {
        await grade('easy');
      }
      // Stop once Gum's own log has every linked card graded (an on-screen guess alone can
      // mistake the EPUB's unlinked 食べる card for the linked one).
      if (linked.every((c) => seen.has(c.id))) {
        const done = await ev(`(async () => {
          const db = await new Promise((res, rej) => { const q = indexedDB.open('jp-study-db'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
          const ids = await new Promise((res) => { const out = new Set(); const r = db.transaction('kv').objectStore('kv').openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return res([...out]); if (String(c.key).startsWith('review-log-row:') && c.value && c.value.at >= ${startAt}) out.add(c.value.cardId); c.continue(); }; r.onerror = () => res([...out]); });
          db.close();
          return ids;
        })()`, { await: true });
        if (linked.every((c) => (done ?? []).includes(c.id))) break;
      }
    }
    // Leave the review the way a user does: Exit mid-session, or Done on the summary.
    await ev(`(__e2e.clickText('.flash-review-shell button', 'Exit'), true)`);
    await poll(ctx, `!document.querySelector('.flash-review-shell')`, 5000);
    await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => __e2e.vis(x) && x.innerText.trim() === 'Done' && [...(x.parentElement?.querySelectorAll('button') ?? [])].some((y) => y.innerText.trim() === 'Review again')); if (b) b.click(); return !!b; })()`);
    // What was ACTUALLY graded, from Gum's own review log — the truth the push must
    // reproduce. (The on-screen guess above can confuse two cards with the same word:
    // the EPUB flow mines a 食べる card too, unlinked.)
    const log = await ev(`(async () => {
      const db = await new Promise((res, rej) => { const q = indexedDB.open('jp-study-db'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      const rows = await new Promise((res) => {
        const out = [];
        const r = db.transaction('kv').objectStore('kv').openCursor();
        r.onsuccess = () => { const c = r.result; if (!c) return res(out); if (String(c.key).startsWith('review-log-row:')) out.push(c.value); c.continue(); };
        r.onerror = () => res(out);
      });
      db.close();
      return rows.filter((x) => x && x.at >= ${startAt} && x.mode === 'review').sort((a, b) => a.at - b.at).map((x) => ({ id: x.id, cardId: x.cardId, rating: x.rating, at: x.at }));
    })()`, { await: true });
    const linkedById = new Map(linked.map((c) => [c.id, c]));
    const truth = (log ?? []).filter((x) => linkedById.has(x.cardId)).map((x) => ({ word: linkedById.get(x.cardId).word, noteId: linkedById.get(x.cardId).noteId, rating: x.rating, ease: EASE[x.rating] }));
    result.check('every linked card came up in the Gum review and was graded', linked.every((c) => truth.some((t) => t.noteId === c.noteId)), { log: truth, guessed: given, linked: linked.map((c) => c.word) });
    result.check('the linked cards were graded with different buttons (so order is observable)', new Set(truth.map((t) => t.ease)).size >= 2, truth.map((t) => t.rating));
    const outbox = await ev(`(async () => { const db = await new Promise((res, rej) => { const q = indexedDB.open('jp-study-db'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); const v = await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get('anki-review-outbox-v1'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); db.close(); return v ? Object.keys(typeof v === 'string' ? JSON.parse(v) : v).length : 0; })()`, { await: true });
    result.check('the graded answers wait in the outbox (one per linked review)', outbox === truth.length, { outbox, reviews: truth.length });

    // --- Sync now: the answers arrive in Anki, in order ----------------------------------
    const answersBefore = fake.calls.filter((c) => c.action === 'answerCards').length;
    await ev(`__e2e.open('anki')`);
    await poll(ctx, `!!document.querySelector('.anki-sync-status')`, 10000);
    const clicked = await ev(`__e2e.clickText('.anki-sync-status button', 'Sync now')`);
    const deadline = Date.now() + 30000;
    while (fake.calls.filter((c) => c.action === 'answerCards').length === answersBefore && Date.now() < deadline) await ctx.sleep(250);
    const answers = fake.calls.filter((c) => c.action === 'answerCards').slice(answersBefore).flatMap((c) => c.params.answers ?? []);
    const arrived = answers.map((a) => {
      const card = fake.cards.get(a.cardId);
      const note = card ? fake.notes.get(card.note) : null;
      return { noteId: note?.noteId ?? null, ease: a.ease };
    });
    // One answer per note (a second review of the same note in one push collapses into the
    // later one), in the order Gum's log has them.
    const lastPerNote = new Map();
    truth.forEach((t, i) => lastPerNote.set(t.noteId, i));
    const wanted = truth.filter((t, i) => lastPerNote.get(t.noteId) === i).map((t) => ({ noteId: t.noteId, ease: t.ease }));
    result.check('"Sync now" pushes the answers to Anki (answerCards)', Boolean(clicked) && answers.length > 0, { clicked, answers });
    result.check('the answers arrive in the order given, with the Gum ease, one per note', JSON.stringify(arrived) === JSON.stringify(wanted), { arrived, wanted, words: truth.map((g) => g.word) });
    const reviewed = truth.filter((t, i) => lastPerNote.get(t.noteId) === i).map((g) => {
      const note = fake.notes.get(g.noteId);
      const card = note ? fake.cards.get(note.cards[0]) : null;
      return { word: g.word, reps: card?.reps, type: card?.type };
    });
    result.check("the answered cards moved in Anki's scheduler (reps 1, review state)", reviewed.every((r) => r.reps === 1 && r.type === 2), reviewed);
    const waiting = await poll(ctx, `(() => { const dd = [...document.querySelectorAll('.anki-sync-facts dd')].map((d) => d.textContent); return dd.length ? dd : null; })()`, 5000);
    result.note(`sync facts after the push: ${JSON.stringify(waiting)}`);
    await ctx.shot('synced');

    // --- the mirror: Anki's due days on the user's study day ---------------------------
    // The answered cards are due on Anki's day 501 (the fake's "today" is 500). The study
    // day starts at the next whole hour, so right now it is still yesterday's study day.
    const hour = (new Date().getHours() + 1) % 24;
    const studyBase = new Date();
    studyBase.setHours(0, 0, 0, 0);
    if (new Date().getHours() < hour) studyBase.setDate(studyBase.getDate() - 1);
    const expectedDue = new Date(studyBase.getFullYear(), studyBase.getMonth(), studyBase.getDate() + 1, hour).getTime();
    await ev(`(() => {
      const key = 'jp-flashcard-scheduling-v1';
      const cur = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...cur, dayStartHour: ${hour} }));
      localStorage.setItem('jp-anki-owns-scheduling', '1');
      window.dispatchEvent(new CustomEvent('jp-anki-owns-scheduling-changed', { detail: true }));
      return true;
    })()`);
    const pullsBefore = fake.calls.filter((c) => c.action === 'cardsInfo').length;
    await ev(`__e2e.clickText('.anki-sync-status button', 'Sync now')`);
    const mirrorJs = `(async () => {
      const db = await new Promise((res, rej) => { const q = indexedDB.open('jp-study-db'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      const v = await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get('anki-schedule-mirror-v1'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      db.close();
      const m = typeof v === 'string' ? JSON.parse(v) : v;
      return m ? Object.values(m).filter((e) => e && typeof e.dueAt === 'number').map((e) => ({ noteId: e.noteId, dueAt: e.dueAt, state: e.state })) : [];
    })()`;
    let mirrored = [];
    for (const until = Date.now() + 20000; Date.now() < until;) {
      mirrored = (await ev(mirrorJs, { await: true })) ?? [];
      if (mirrored.length >= wanted.length) break;
      await ctx.sleep(300);
    }
    result.check('with Anki owning scheduling, "Sync now" mirrors Anki\'s schedule for the linked cards',
      mirrored.length >= wanted.length && fake.calls.filter((c) => c.action === 'cardsInfo').length > pullsBefore, { mirrored, wanted });
    const mirroredDue = mirrored.filter((m) => wanted.some((w) => w.noteId === m.noteId));
    result.check(`a card due tomorrow in Anki is dated at ${hour}:00 of the next study day, not at midnight`,
      mirroredDue.length > 0 && mirroredDue.every((m) => m.dueAt === expectedDue),
      { expectedDue: new Date(expectedDue).toString(), got: mirroredDue.map((m) => new Date(m.dueAt).toString()), hour });
    // Back to Gum owning scheduling and the default 4 am day for the flows after this one.
    await ev(`(() => {
      const key = 'jp-flashcard-scheduling-v1';
      const cur = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...cur, dayStartHour: 4 }));
      localStorage.setItem('jp-anki-owns-scheduling', '0');
      window.dispatchEvent(new CustomEvent('jp-anki-owns-scheduling-changed', { detail: false }));
      return true;
    })()`);
  },
};
