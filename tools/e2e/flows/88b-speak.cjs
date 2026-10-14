'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * The conversation partner (src/renderer/components/speak/ConversationPartner.tsx) through
 * the real UI, answered by the harness's fake OpenAI-compatible server (tools/e2e/world.cjs,
 * `FAKE_AI_SPEAK_FEATURES`). Nothing reaches a real AI API; no microphone is used.
 *
 *  1. Start: the partner opens (the fake's line), and the opening was asked afresh.
 *  2. A message with a mistake: the reply arrives, the learner's own text stays beside the
 *     correction, and "Mine the corrected sentence" saves a card whose back carries the
 *     reason and what the learner wrote.
 *  3. A reply that fails (the fake answers 500): the message keeps a Retry, which answers it
 *     without sending it twice (docs/SCORECARD.md bug 44).
 *  4. Clear, Start again: a NEW request (not the cached opening, bug 44), and the words met
 *     in the first conversation (改札) are shown to bring back — but with study data kept
 *     on the device (the default) they are NOT in the prompt sent to the server.
 *  5. With study data allowed to leave the device (Agent settings), the next conversation's
 *     prompt names them.
 *  6. The replies are asked for as a stream (the partner's line is drafted as it arrives),
 *     and voice input offers a hands-free mode beside push-to-talk (the microphone itself
 *     is not opened here: OWNER O6 checks a real one).
 *
 * The profile is left as a run without the preset would have it: AI on, no provider
 * configured, the speaking helpers' cloud opt-ins off, the Agent's study-data setting and
 * the conversation as they were.
 */
const { installHelpers, poll, DECK } = require('./_lib.cjs');

const AGENT_KEY = 'jp-study-local-agent-settings-v1';
const MISTAKE = '水がください';
const CORRECTED = '水をください';

async function dismissFirstRun(ctx) {
  await ctx.eval(`(() => { const b = [...document.querySelectorAll('.consent button')].find((x) => /No thanks/i.test(x.innerText)); if (b) b.click(); return true; })()`);
  await ctx.sleep(300);
  await ctx.eval(`(() => { const b = document.querySelector('.frs-root .frs-quiet'); if (b) b.click(); return true; })()`);
  await poll(ctx, `!document.querySelector('.frs-root') || null`, 5000);
}

const PANEL = '[data-conversation-partner]';
const turnsJs = `(() => {
  const p = document.querySelector('${PANEL}');
  if (!p) return null;
  return [...p.querySelectorAll('.speak-turn')].map((li) => ({
    role: li.classList.contains('is-user') ? 'user' : 'partner',
    text: (li.querySelector('.speak-bubble > p') || li.querySelector('.speak-bubble'))?.innerText.replace(/\\s+/g, '') ?? '',
    correction: li.querySelector('.speak-correction')?.innerText.replace(/\\s+/g, ' ') ?? '',
  }));
})()`;

module.exports = {
  id: 'speak',
  title: 'Conversation partner (fake AI): reply, correction card, Retry, fresh opening, memory and its study-data gate',
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
    const agentBefore = await ev(`localStorage.getItem(${JSON.stringify(AGENT_KEY)})`);

    // The preset may have been put back by an earlier flow (ai-study): point the app at the fake.
    const setup = await ev(`(async () => {
      await window.api.aiSetupSetEnabled(true);
      await window.api.aiSetupUpdate({ compatBaseUrl: ${JSON.stringify(ai.base)}, compatModel: ${JSON.stringify(ai.model)}, cloudFeatures: { conversationPartner: true } });
      await window.api.aiSetProvider('openai-compatible');
      const engine = await window.api.aiSetEngine('cloud');
      const s = await window.api.aiSetupStatus();
      return { enabled: s.enabled, providerId: s.providerId, engine: engine && engine.engine, allowed: s.cloudFeatures && s.cloudFeatures.conversationPartner };
    })()`, { await: true }).catch((err) => ({ error: String(err) }));
    result.check('AI on, the fake as a local compatible server, the conversation partner allowed to use it',
      setup?.enabled === true && setup.providerId === 'openai-compatible' && setup.allowed === true, setup);

    const sendText = async (text) => {
      await ev(`__e2e.fill(document.querySelector('${PANEL} textarea'), ${JSON.stringify(text)})`);
      await ev(`__e2e.click(__e2e.byText('${PANEL} .speak-composer button', 'Send'))`);
    };
    const clearAndStart = async () => {
      await ev(`__e2e.clickText('${PANEL} button', 'Clear conversation')`);
      await ev(`__e2e.clickText('${PANEL} button', 'Press again to clear')`);
      await poll(ctx, `document.querySelectorAll('${PANEL} .speak-turn').length === 0 || null`, 5000);
      await ev(`__e2e.clickText('${PANEL} button', 'Start the conversation')`);
    };

    try {
      // Opened fresh, so the AI readiness the view reads is the one just set.
      await ev(`__e2e.open('conversation')`);
      const opened = await poll(ctx, `(() => { const p = document.querySelector('${PANEL}'); return p && __e2e.vis(p) ? p.innerText.replace(/\\s+/g, ' ').slice(0, 200) : null; })()`, 20000);
      result.check('the Conversation app opens', Boolean(opened), opened);
      // A conversation left by an earlier run of this profile starts over.
      const leftover = await ev(`document.querySelectorAll('${PANEL} .speak-turn').length`);
      if (leftover) await clearAndStart();
      else await ev(`__e2e.clickText('${PANEL} button', 'Start the conversation')`);

      // --- 1. the opening ---------------------------------------------------------------------
      const before1 = ai.count('conversationPartner');
      const opening = await poll(ctx, `(() => { const t = ${turnsJs}; return t && t.some((x) => x.role === 'partner' && x.text.includes('改札')) ? t : null; })()`, 20000);
      result.check('Start: the partner opens with the fake\'s line', Boolean(opening), opening);
      result.check('the opening reached the fake once', ai.count('conversationPartner') >= before1 && ai.count('conversationPartner') >= 1, ai.count('conversationPartner'));
      await ctx.shot('opening');

      // --- 2. a mistake, its correction, the correction card ----------------------------------
      // Wait for the knowledge colouring (kuromoji) so the opening's new words are remembered.
      await poll(ctx, `document.querySelector('${PANEL} .speak-word') ? true : null`, 30000);
      await sendText(MISTAKE);
      const corrected = await poll(ctx, `(() => { const t = ${turnsJs}; const u = t && t.find((x) => x.role === 'user'); return u && u.correction && t.filter((x) => x.role === 'partner').length >= 2 ? t : null; })()`, 20000);
      const user = corrected && corrected.find((x) => x.role === 'user');
      result.check('the learner\'s own text stays, with the AI correction beside it',
        Boolean(user) && user.text === MISTAKE && /を/.test(user.correction) && /AI suggestion/.test(user.correction), corrected);
      const prompts = ai.prompts('conversationPartner');
      result.check('the message reached the fake as the learner\'s last line', prompts.some((p) => p.includes(`Learner: ${MISTAKE}`)), prompts.length);
      await ev(`__e2e.clickText('${PANEL} .speak-correction button', 'Mine the corrected sentence')`);
      const card = await poll(ctx, `(() => { const c = ${DECK}.find((x) => x.word === ${JSON.stringify(CORRECTED)}); return c ? { word: c.word, meaning: c.meaning, sentence: c.sentence } : null; })()`, 10000);
      result.check('the correction is saved as a card: corrected sentence in front, reason and the learner\'s text on the back',
        Boolean(card) && card.meaning.includes('ください takes を') && card.meaning.includes(`You wrote: ${MISTAKE}`), card);

      // --- 3. a failed reply and its Retry ------------------------------------------------------
      ai.failNext('conversationPartner');
      const failedBefore = ai.count('conversationPartner');
      await sendText('ありがとう');
      const retry = await poll(ctx, `(() => { const b = __e2e.byText('${PANEL} [data-conversation-retry] button', 'Retry the reply'); return b ? true : null; })()`, 20000);
      result.check('a failed reply leaves the message with a Retry', Boolean(retry), ai.hits.slice(-2).map((h) => `${h.feature}:${h.status}`));
      await ctx.shot('retry');
      await ev(`__e2e.clickText('${PANEL} [data-conversation-retry] button', 'Retry the reply')`);
      const answered = await poll(ctx, `(() => { const t = ${turnsJs}; return t && t[t.length - 1].role === 'partner' && t.filter((x) => x.role === 'user').length === 2 ? t : null; })()`, 20000);
      result.check('Retry answers it, and the message is not sent twice', Boolean(answered) && ai.count('conversationPartner') === failedBefore + 2, { turns: answered, requests: ai.count('conversationPartner') - failedBefore });
      result.check('the retried request carried the same message', (ai.prompts('conversationPartner').pop() || '').includes('Learner: ありがとう'));

      // --- 4. Clear → Start: fresh, recalls 改札, withholds it from the cloud prompt ------------
      const before4 = ai.count('conversationPartner');
      await clearAndStart();
      const recall = await poll(ctx, `(() => { const r = document.querySelector('${PANEL} [data-conversation-recall]'); const t = ${turnsJs}; return r && t && t.some((x) => x.role === 'partner') ? r.innerText : null; })()`, 20000);
      result.check('Start after Clear is a new request, not the cached opening', ai.count('conversationPartner') === before4 + 1, ai.count('conversationPartner') - before4);
      result.check('the new conversation shows the words met before to bring back (改札)', Boolean(recall) && recall.includes('改札'), recall);
      const withheld = ai.prompts('conversationPartner').pop() || '';
      result.check('with study data kept on the device, the cloud prompt does not carry them', !withheld.includes('earlier conversations'), withheld.slice(0, 300));

      // --- 5. study data allowed: the prompt names them ------------------------------------------
      // A partial document is fine: the settings normalizer fills every absent field from its
      // default (an absent backend is no longer read as "disabled").
      await ev(`(() => { const cur = JSON.parse(localStorage.getItem(${JSON.stringify(AGENT_KEY)}) || '{}'); localStorage.setItem(${JSON.stringify(AGENT_KEY)}, JSON.stringify({ ...cur, agentCloudShareStudyData: 'allow' })); return true; })()`);
      await clearAndStart();
      await poll(ctx, `(() => { const t = ${turnsJs}; return t && t.some((x) => x.role === 'partner') ? true : null; })()`, 20000);
      const sent = ai.prompts('conversationPartner').pop() || '';
      result.check('with study data allowed, the prompt asks the partner to bring 改札 back', /earlier conversations[^\n]*改札/.test(sent), sent.slice(0, 400));
      await ctx.shot('recall');

      // --- 6. streamed replies; the hands-free voice mode ----------------------------------------
      const streamedHits = ai.hits.filter((h) => h.feature === 'conversationPartner' && h.status === 200);
      result.check('every conversation reply was asked for as a stream', streamedHits.length > 0 && streamedHits.every((h) => h.stream === true), streamedHits.map((h) => h.stream));
      const handsFree = await ev(`(() => {
        const s = document.querySelector('${PANEL} select[data-speak-voice-mode]');
        if (!s) return null;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'handsFree');
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      const startBtn = handsFree && await poll(ctx, `__e2e.byText('${PANEL} .speak-composer button', 'Start hands-free') ? true : null`, 5000);
      result.check('voice input offers hands-free beside push-to-talk', Boolean(startBtn));
      await ev(`(() => {
        const s = document.querySelector('${PANEL} select[data-speak-voice-mode]');
        if (!s) return false;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'push');
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      result.note(`fake AI requests: ${JSON.stringify(ai.hits.filter((h) => h.feature === 'conversationPartner').map((h) => h.status))}`);
    } finally {
      await ev(`(() => {
        const before = ${JSON.stringify(agentBefore)};
        // "No settings yet" is put back as a removed key: the renderer's store re-reads the
        // key on every load and treats a missing one as the defaults (localAgentSettingsStore.ts).
        if (before === null) localStorage.removeItem(${JSON.stringify(AGENT_KEY)});
        else localStorage.setItem(${JSON.stringify(AGENT_KEY)}, before);
        for (const k of Object.keys(localStorage)) if (k.startsWith('jp-study.conversation.')) localStorage.removeItem(k);
        return true;
      })()`).catch(() => undefined);
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
