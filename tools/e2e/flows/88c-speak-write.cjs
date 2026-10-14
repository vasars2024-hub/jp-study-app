'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Writing correction and shadowing feedback (src/renderer/components/speak/WritingCorrection.tsx,
 * ShadowingFeedback.tsx, src/main/aiSpeakAssist.ts), answered by the harness's fake
 * OpenAI-compatible server (tools/e2e/world.cjs `FAKE_AI_SPEAK_FEATURES`). Nothing reaches a
 * real AI API; no microphone is used.
 *
 *  1. Writing, through the real UI: a note with a doubled particle (私はは) is opened from
 *     Files in the note viewer, Edit → Writing help → "Correct my Japanese". The quick
 *     check (no AI) names the slip; the fake's edit is shown as a diff with its reason,
 *     streamed (the request asked for a stream), and NOTHING changes in the note until
 *     "Apply all" — after which the editor holds the corrected text.
 *  2. Journal grading: the due words are graded word by word by the fake (main's pipeline,
 *     validated), and the request streamed back to the window.
 *  3. Shadowing feedback: the text-only request (line, transcript, findings — never audio)
 *     goes through main to the fake and comes back validated; with nothing in the take
 *     missing, the summary is the fake's. The recording itself needs the local Whisper
 *     model, which a test profile never downloads, so the take is given as its transcript
 *     (OWNER O6 checks a real recording).
 *  4. With the writing helper's cloud opt-in off, nothing is sent and the panel says why.
 *
 * The profile is left as a run without the preset would have it: AI on, no provider
 * configured, the speaking helpers' cloud opt-ins off, no test note.
 */
const { installHelpers, poll } = require('./_lib.cjs');

const NOTE_ID = 'e2e-writing-note';
const NOTE_TITLE = 'E2E writing note';
const NOTE_TEXT = '私はは学生です。';
const FIXED_TEXT = '私は学生です。';

async function dismissFirstRun(ctx) {
  await ctx.eval(`(() => { const b = [...document.querySelectorAll('.consent button')].find((x) => /No thanks/i.test(x.innerText)); if (b) b.click(); return true; })()`);
  await ctx.sleep(300);
  await ctx.eval(`(() => { const b = document.querySelector('.frs-root .frs-quiet'); if (b) b.click(); return true; })()`);
  await poll(ctx, `!document.querySelector('.frs-root') || null`, 5000);
}

/** The note, put into the notes store the way another window would (its BroadcastChannel). */
const putNoteJs = (detail) => `(() => {
  const at = Date.now();
  const ch = new BroadcastChannel('gum-user-notes');
  ch.postMessage({ type: 'put', note: { id: ${JSON.stringify(NOTE_ID)}, stream: 'notes', title: ${JSON.stringify(NOTE_TITLE)}, detail: ${JSON.stringify(detail)}, ts: at, updatedAt: at, changedAt: at } });
  ch.close();
  return true;
})()`;

const DIALOG = '.note-viewer-edit';

module.exports = {
  id: 'speak-write',
  title: 'Writing correction (note UI, apply only on press), journal grading, shadowing feedback (fake AI)',
  world: { ai: true },
  async run(ctx) {
    const { eval: ev, result } = ctx;
    const ai = ctx.world && ctx.world.ai;
    if (!ai) {
      result.skip('the run did not start the fake AI server (world option `ai`)');
      return;
    }
    await installHelpers(ctx);
    await dismissFirstRun(ctx);

    const setup = await ev(`(async () => {
      await window.api.aiSetupSetEnabled(true);
      await window.api.aiSetupUpdate({ compatBaseUrl: ${JSON.stringify(ai.base)}, compatModel: ${JSON.stringify(ai.model)}, cloudFeatures: { writingCorrection: true, journalGrade: true, shadowingFeedback: true } });
      await window.api.aiSetProvider('openai-compatible');
      await window.api.aiSetEngine('cloud');
      const s = await window.api.aiSetupStatus();
      return { enabled: s.enabled, providerId: s.providerId, f: s.cloudFeatures };
    })()`, { await: true }).catch((err) => ({ error: String(err) }));
    result.check('AI on, the fake as the provider, the writing and shadowing helpers allowed',
      setup?.enabled === true && setup.providerId === 'openai-compatible' && setup.f?.writingCorrection === true && setup.f?.shadowingFeedback === true, setup);
    await ev(`(() => { window.__e2eStream = []; window.__e2eStreamOff = window.api.onAiStreamChunk((c) => window.__e2eStream.push(c)); return true; })()`);

    try {
      // --- 1. Writing correction through the note editor ---------------------------------------
      await ev(putNoteJs(NOTE_TEXT));
      await ev(`__e2e.open('files')`);
      const row = await poll(ctx, `(() => {
        const rows = [...document.querySelectorAll('.fa-row, [role="row"], li, button')].filter((el) => __e2e.vis(el) && (el.innerText || '').includes(${JSON.stringify(NOTE_TITLE)}));
        const pick = rows.sort((a, b) => a.innerText.length - b.innerText.length)[0];
        if (!pick) return null;
        pick.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        pick.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return pick.tagName + ':' + pick.className;
      })()`, 20000);
      result.check('the note is listed in Files', Boolean(row), row);
      const viewer = await poll(ctx, `(() => { const b = __e2e.byText('button', 'Edit'); return b && document.body.innerText.includes(${JSON.stringify(NOTE_TITLE)}) ? true : null; })()`, 10000);
      result.check('the note opens in the note viewer', Boolean(viewer));
      await ev(`__e2e.click(__e2e.byText('button', 'Edit'))`);
      const helpBtn = await poll(ctx, `__e2e.byText('${DIALOG} button', 'Writing help') ? true : null`, 10000);
      result.check('Edit offers Writing help under the text', Boolean(helpBtn));
      await ev(`__e2e.click(__e2e.byText('${DIALOG} button', 'Writing help'))`);
      const lint = await poll(ctx, `(() => { const t = document.querySelector('${DIALOG}')?.innerText || ''; return /Doubled word or particle/.test(t) ? t : null; })()`, 10000);
      result.check('the quick check (no AI) names the doubled particle', Boolean(lint) && lint.includes('はは'), lint && lint.slice(0, 300));
      const before = ai.count('writingCorrection');
      await ev(`__e2e.click(__e2e.byText('${DIALOG} button', 'Correct my Japanese'))`);
      const edits = await poll(ctx, `(() => { const s = document.querySelector('${DIALOG} .speak-edits'); return s && /doubled/.test(s.innerText) ? s.innerText.replace(/\\s+/g, ' ') : null; })()`, 20000);
      result.check("the fake's correction is shown as an edit with its reason", Boolean(edits) && edits.includes('E2E fake AI: doubled は.'), edits);
      result.check('one request reached the fake, as a stream', ai.count('writingCorrection') === before + 1 && ai.hits.filter((h) => h.feature === 'writingCorrection').pop()?.stream === true, ai.hits.filter((h) => h.feature === 'writingCorrection').map((h) => ({ status: h.status, stream: h.stream })));
      const streamed = await ev(`window.__e2eStream.filter((c) => c.text && c.text.includes('edits')).length`);
      result.check('the reply streamed back to the window', streamed > 0, streamed);
      const untouched = await ev(`document.querySelector('${DIALOG} textarea')?.value ?? null`);
      result.check('nothing in the note changed before Apply', untouched === NOTE_TEXT, untouched);
      await ctx.shot('writing-edits');
      await ev(`__e2e.click(__e2e.byText('${DIALOG} button', /^Apply all changes/))`);
      const applied = await poll(ctx, `(() => { const v = document.querySelector('${DIALOG} textarea')?.value; return v === ${JSON.stringify(FIXED_TEXT)} ? v : null; })()`, 5000);
      result.check('"Apply all" puts the corrected text in the editor', applied === FIXED_TEXT, await ev(`document.querySelector('${DIALOG} textarea')?.value ?? null`));
      await ctx.shot('writing-applied');
      await ev(`(() => { const b = __e2e.byText('button', 'Cancel'); if (b) b.click(); return true; })()`);
      await ev(`(() => { const b = __e2e.byText('button', 'Close'); if (b) b.click(); return true; })()`);

      // --- 2. Journal grading -------------------------------------------------------------------
      const journal = await ev(`window.api.aiSpeakJournal({
        requestId: 'e2e-journal-1',
        studyLang: 'ja',
        answerLang: 'en',
        text: '今日は電車で学校に行きました。公園で猫を見ました。',
        words: [{ word: '電車', reading: 'でんしゃ', meaning: 'train' }, { word: '公園', reading: 'こうえん', meaning: 'park' }],
      })`, { await: true }).catch((err) => ({ error: String(err) }));
      result.check('journal grading: each word graded by the fake, validated by main',
        journal?.ok === true && Array.isArray(journal.result?.words) && journal.result.words.length >= 1 && /E2E fake AI/.test(JSON.stringify(journal.result)), journal);
      const journalChunks = await ev(`window.__e2eStream.filter((c) => c.requestId === 'e2e-journal-1').length`);
      result.check('the journal reply streamed under its request id', journalChunks > 0, journalChunks);

      // --- 3. Shadowing feedback ----------------------------------------------------------------
      const shadow = await ev(`window.api.aiSpeakShadowing({
        requestId: 'e2e-shadow-1',
        lang: 'ja',
        answerLang: 'en',
        expected: 'いらっしゃいませ',
        heard: 'いらっしゃいませ',
        score: 100,
        pace: 'ok',
      })`, { await: true }).catch((err) => ({ error: String(err) }));
      result.check('shadowing feedback: text only, through main to the fake and back validated',
        shadow?.ok === true && /keep the pitch steady/.test(JSON.stringify(shadow.result ?? {})), shadow);
      const shadowHit = ai.hits.filter((h) => h.feature === 'shadowingFeedback').pop();
      result.check('the shadowing request carried text, never audio', Boolean(shadowHit) && typeof shadowHit.prompt === 'string' && !/base64|audio\/|data:/i.test(shadowHit.prompt), shadowHit && shadowHit.prompt && shadowHit.prompt.slice(0, 200));

      // --- 4. The cloud opt-in off: nothing sent ----------------------------------------------
      await ev(`window.api.aiSetupUpdate({ cloudFeatures: { writingCorrection: false } }).then(() => true)`, { await: true });
      const hitsBefore = ai.hits.length;
      const refused = await ev(`window.api.aiSpeakCorrect({ studyLang: 'ja', answerLang: 'en', text: ${JSON.stringify(NOTE_TEXT)} })`, { await: true }).catch((err) => ({ error: String(err) }));
      result.check('with the writing opt-in off, the request is refused as consent and nothing is sent',
        refused?.ok === false && refused.needsConsent === true && ai.hits.length === hitsBefore, refused);
    } finally {
      await ev(`(() => { try { window.__e2eStreamOff?.(); } catch {} return true; })()`).catch(() => undefined);
      await ev(`(() => { const ch = new BroadcastChannel('gum-user-notes'); ch.postMessage({ type: 'purge', id: ${JSON.stringify(NOTE_ID)}, at: Date.now() + 60000 }); ch.close(); return true; })()`).catch(() => undefined);
      const restored = await ev(`(async () => {
        await window.api.aiSetupSetEnabled(true);
        await window.api.aiSetupUpdate({ compatBaseUrl: '', compatModel: '', cloudFeatures: { conversationPartner: false, writingCorrection: false, journalGrade: false, shadowingFeedback: false } });
        await window.api.aiSetProvider('gemini-2.5-flash');
        const s = await window.api.aiSetupStatus();
        return { enabled: s.enabled, providerId: s.providerId, compatBaseUrl: s.compatBaseUrl };
      })()`, { await: true }).catch((err) => ({ error: String(err) }));
      result.check('the AI settings are put back (AI on, no provider configured)', restored?.enabled === true && restored.compatBaseUrl === '', restored);
    }
  },
};
