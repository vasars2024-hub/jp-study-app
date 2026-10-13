'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Agent (the in-app study assistant), in a fresh profile:
 *
 *   1. No model and no key: the composer says why it cannot send, and offers setup — a clear
 *      state, not a spinner.
 *   2. Governance: the Agent switched on from its own panel, the ceiling raised to "limited
 *      actions" (the built-in Study Tutor's own level).
 *   3. The everyday study requests work with no model at all: a quick action plans a week
 *      (study.plan-week → calendar.schedule-sessions) through the real plan queue, the write
 *      step stops for confirmation, Confirm writes the sessions to the Calendar.
 *   4. Undo under the Tutor (scorecard bug 9: it was offered and then always refused, and this
 *      flow used to count the refusal as a pass). Now strictly:
 *        · the user edits one of the new sessions → Undo is refused with the "changed since"
 *          reason and deletes NONE of them (the edit is kept);
 *        · the edit is put back → Undo removes exactly the sessions it made, says "undone",
 *          and is not offered again.
 *   5. With the harness's fake OpenAI-compatible server (`world: { ai: true }`), the Agent
 *      aimed at it as the "local server" target:
 *        · a chat send streams the fake's reply and commits it as a complete answer;
 *        · Stop part-way keeps the text that had arrived, marked "stopped" (it used to be
 *          wiped), and the fake sees the request hang up;
 *        · a free-form plan from the cloud planner: the fake proposes a yearly reminder on
 *          the 2nd Tuesday (the calendar tool's new repeat options), the plan runs, the event
 *          is stored with exactly that rule, and Undo removes it.
 *   6. Offline: with the network taken away (CDP, so `navigator.onLine` flips) a cloud target
 *      shows the offline note, and a send reports the offline message at once instead of
 *      waiting on main.
 *
 * The profile is left as a run without the AI preset would have it: AI on, no provider
 * configured, the Agent off at read-only, the local target, the Calendar without this flow's
 * events.
 */
const { installHelpers, poll } = require('./_lib.cjs');
const {
  FAKE_AI_AGENT_MARK,
  FAKE_AI_AGENT_SLOW_MARK,
  FAKE_AI_PLAN_MARK,
  FAKE_AI_AGENT_REPLY,
  FAKE_AI_AGENT_PARTIAL,
} = require('../world.cjs');

const CALENDAR_KEY = 'jp-calendar-events';
const SETTINGS_KEY = 'jp-study-local-agent-settings-v1';

async function dismissFirstRun(ctx) {
  await ctx.eval(`(() => { const b = [...document.querySelectorAll('.consent button')].find((x) => /No thanks/i.test(x.innerText)); if (b) b.click(); return true; })()`);
  await ctx.sleep(300);
  await ctx.eval(`(() => { const b = document.querySelector('.frs-root .frs-quiet'); if (b) b.click(); return true; })()`);
  await poll(ctx, `!document.querySelector('.frs-root') || null`, 5000);
}

/** Leave the AI settings as the ai-study flow leaves them: AI on, no provider configured. */
const AI_SETTINGS_NONE = `(async () => {
  await window.api.aiSetupSetEnabled(true);
  await window.api.aiSetupUpdate({ compatBaseUrl: '', compatModel: '' });
  await window.api.aiSetProvider('gemini-2.5-flash');
  const s = await window.api.aiSetupStatus();
  return { enabled: s.enabled, providerId: s.providerId, compatBaseUrl: s.compatBaseUrl };
})()`;

/** Pick a target in the composer's provider select (it is a React-controlled element). */
const selectTarget = (value) => `(() => {
  const s = [...document.querySelectorAll('form.agent-composer select')].find((x) => [...x.options].some((o) => o.value === 'local'));
  const option = s && [...s.options].find((o) => ${value === null ? `o.value !== 'local' && o.value !== 'openai-compatible'` : `o.value === ${JSON.stringify(value)}`});
  if (!option) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, option.value);
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return option.value;
})()`;

module.exports = {
  id: 'agent',
  title: 'Agent: no-key state, plan queue + confirm, Undo that undoes (and refuses an edited event), fake-provider chat, Stop keeps text, cloud plan with a yearly repeat, offline preflight',
  /** Opt-in world: the fake OpenAI-compatible server, for the chat, Stop and planner steps. */
  world: { ai: true },
  async run(ctx) {
    const { eval: ev, result } = ctx;
    const ai = ctx.world && ctx.world.ai;
    await installHelpers(ctx);
    await dismissFirstRun(ctx);
    const calendar = () => ev(`JSON.parse(localStorage.getItem('${CALENDAR_KEY}') || '[]')`);
    await ev(`(() => { localStorage.setItem('${CALENDAR_KEY}', '[]'); window.dispatchEvent(new CustomEvent('calendar-events-changed')); return true; })()`);
    // The run's AI preset points the profile at the fake from the start; step 1 is about a
    // profile with nothing set up, so take it away first (step 5 puts it back).
    if (ai) await ev(AI_SETTINGS_NONE, { await: true }).catch(() => null);

    await ev(`__e2e.open('agent')`);
    const shell = await poll(ctx, `!!document.querySelector('.agent-shell') || null`, 20000);
    result.check('the Agent opens', Boolean(shell));
    // A fresh profile has no conversation: start one from the empty state.
    const phase = await poll(ctx, `document.querySelector('.agent-empty') ? 'empty' : document.querySelector('.agent-composer') ? 'ready' : null`, 15000);
    if (phase === 'empty') await ev(`__e2e.click(document.querySelector('.agent-empty .agent-action-primary'))`);
    const composer = await poll(ctx, `!!document.querySelector('form.agent-composer') || null`, 10000);
    result.check('a conversation is open with its composer', Boolean(composer), phase);

    // --- 1. No model, no key: a clear state --------------------------------------------
    await ev(`__e2e.fill(document.querySelector('form.agent-composer textarea'), 'Explain the difference between は and が')`);
    const noKey = await poll(ctx, `(() => {
      const f = document.querySelector('form.agent-composer');
      const send = f.querySelector('button[type=submit]');
      const plan = f.querySelector('.agent-plan-create');
      const prompt = f.querySelector('.ai-setup-prompt');
      return prompt && send.disabled ? { sendTitle: send.title, planTitle: plan?.title || '', prompt: prompt.innerText.replace(/\\s+/g, ' ').trim(), setupButtons: prompt.querySelectorAll('button').length } : null;
    })()`, 10000);
    result.check('Send is disabled and says why (nothing is set up), with a setup offer', Boolean(noKey) && noKey.sendTitle.length > 10 && noKey.setupButtons > 0, noKey);
    result.check('Create plan is disabled for a free-form request with no planner, also saying why', Boolean(noKey) && noKey.planTitle.length > 10, noKey?.planTitle);
    await ctx.shot('no-key');

    // --- 2. Governance: turn the Agent on (off by default) and raise the ceiling to
    //        "limited actions", so the week plan's write step exists ----------------------
    let limited = await poll(ctx, `document.querySelector('[data-testid="agent-governance-permission-limited-actions"]') ? true : null`, 1000);
    if (!limited) {
      await ev(`(() => { const b = document.querySelector('.agent-governance-open'); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } return !!b; })()`);
      limited = await poll(ctx, `document.querySelector('[data-testid="agent-governance-permission-limited-actions"]') ? true : null`, 5000);
    }
    result.check('the governance panel offers the on switch and the permission ceiling', Boolean(limited));
    await ev(`(() => { const box = document.querySelector('[data-testid="agent-governance-enabled"]'); if (box && !box.checked) box.click(); return !!box; })()`);
    const enabled = await poll(ctx, `(JSON.parse(localStorage.getItem('${SETTINGS_KEY}') || '{}').enabled === true) || null`, 3000);
    result.check('the Agent is switched on from its own governance panel', Boolean(enabled));
    await ev(`__e2e.click(document.querySelector('[data-testid="agent-governance-permission-limited-actions"]'))`);
    const permission = await poll(ctx, `(JSON.parse(localStorage.getItem('${SETTINGS_KEY}') || '{}').permission === 'limited-actions') || null`, 3000);
    result.check('permission ceiling set to limited actions', Boolean(permission));
    // The active profile is the built-in Study Tutor, which does NOT enable deleting events:
    // exactly the setup in which every calendar Undo used to be refused.
    const profile = await ev(`(() => { const s = JSON.parse(localStorage.getItem('jp-study-local-agent-profiles-v1') || 'null'); const id = s?.activeProfileId || 'study-tutor'; const p = s?.profiles?.find((x) => x.id === id); return { id, deleteEnabled: Boolean(p?.enabledOperations?.includes('calendar.delete-event')) }; })()`);
    result.check('the active profile is the Study Tutor, without "delete a calendar event"', profile?.id === 'study-tutor' && profile.deleteEnabled === false, profile);

    // --- 3. A model-free request through the real plan queue ----------------------------
    await ev(`__e2e.fill(document.querySelector('form.agent-composer textarea'), '')`);
    const quick = await ev(`(() => { const b = document.querySelectorAll('.agent-quick-actions .agent-quick-action'); return b.length; })()`);
    result.check('the study quick actions are offered with no model', quick >= 3, quick);
    // ORDER in AgentStudyQuickActions: recommend, quiz-mined, plan-week, …
    await ev(`__e2e.click(document.querySelectorAll('.agent-quick-actions .agent-quick-action')[2])`);
    const queued = await poll(ctx, `(() => { const i = document.querySelector('.agent-plan-queue .agent-plan-item'); return i ? { steps: i.querySelectorAll('.agent-plan-step').length, status: i.className } : null; })()`, 20000);
    result.check('a week plan is queued without any model (study recipe)', Boolean(queued) && queued.steps === 2, queued);
    await ctx.shot('plan-queued');

    const runPrimary = () => ev(`__e2e.click(document.querySelector('.agent-plan-queue .agent-plan-item .agent-plan-actions .agent-action-primary'))`);
    await runPrimary();
    const first = await poll(ctx, `(() => { const s = document.querySelectorAll('.agent-plan-queue .agent-plan-item .agent-plan-step-meta'); return s[0] && /complete|done/i.test(s[0].innerText) ? s[0].innerText : null; })()`, 20000);
    result.check('Run next runs the read step (study.plan-week)', Boolean(first), first);
    await runPrimary();
    const waiting = await poll(ctx, `(() => { const b = document.querySelector('.agent-plan-queue .agent-plan-item .agent-plan-actions .agent-action-primary'); const i = document.querySelector('.agent-plan-queue .agent-plan-item'); return b && /confirm/i.test(b.innerText) ? b.innerText : (i && /failed/.test(i.className) ? 'failed: ' + i.innerText.slice(0, 300) : null); })()`, 20000);
    result.check('the write step (schedule sessions) stops for confirmation', /confirm/i.test(waiting ?? ''), waiting);
    const before = await calendar();
    await runPrimary();
    const written = await poll(ctx, `(() => { const n = JSON.parse(localStorage.getItem('${CALENDAR_KEY}') || '[]').length; return n > ${before.length} ? n : null; })()`, 20000);
    result.check('Confirm writes the planned sessions to the Calendar', (written ?? 0) > before.length, { before: before.length, after: written });
    const afterWrite = await calendar();
    const beforeIds = new Set(before.map((e) => e.id));
    const createdIds = afterWrite.filter((e) => !beforeIds.has(e.id)).map((e) => e.id);
    await ctx.shot('plan-done');

    // --- 4. Undo under the Tutor: refused for an edited session, then really undone ------
    const undoButton = await poll(ctx, `!!document.querySelector('.agent-plan-queue .agent-plan-undo-button') || null`, 5000);
    result.check('the completed write step offers Undo', Boolean(undoButton));
    const clickUndoAndConfirm = async () => {
      await ev(`__e2e.click(document.querySelector('.agent-plan-queue .agent-plan-undo-button'))`);
      const dialog = await poll(ctx, `!!document.querySelector('[role=dialog]') || null`, 5000);
      await ev(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); const b = d && [...d.querySelectorAll('button')].pop(); if (b) b.click(); return !!b; })()`);
      return Boolean(dialog);
    };
    if (undoButton && createdIds.length) {
      // The user renames one of the new sessions in the Calendar after the Agent made it.
      const editedId = createdIds[0];
      const original = afterWrite.find((e) => e.id === editedId);
      await ev(`(() => {
        const list = JSON.parse(localStorage.getItem('${CALENDAR_KEY}') || '[]');
        const e = list.find((x) => x.id === ${JSON.stringify(editedId)});
        e.title = e.title + ' (with Aiko)';
        localStorage.setItem('${CALENDAR_KEY}', JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('calendar-events-changed'));
        return true;
      })()`);
      const asked = await clickUndoAndConfirm();
      result.check('Undo asks first', asked);
      const refused = await poll(ctx, `(() => { const e = document.querySelector('.agent-plan-queue .agent-plan-undo .agent-plan-error[role=alert]'); return e ? e.innerText : null; })()`, 10000);
      const keptAll = await calendar();
      result.check('Undo after the user edited a session is refused with the "changed since" reason, and deletes none of them',
        /changed after the Agent/i.test(refused ?? '') && createdIds.every((id) => keptAll.some((e) => e.id === id))
          && keptAll.find((e) => e.id === editedId)?.title === `${original.title} (with Aiko)`,
        { refused, kept: keptAll.length, created: createdIds.length });

      // The edit is put back: the event is again exactly what the Agent made.
      await ev(`(() => {
        const list = JSON.parse(localStorage.getItem('${CALENDAR_KEY}') || '[]');
        const e = list.find((x) => x.id === ${JSON.stringify(editedId)});
        e.title = ${JSON.stringify(original.title)};
        localStorage.setItem('${CALENDAR_KEY}', JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('calendar-events-changed'));
        return true;
      })()`);
      await clickUndoAndConfirm();
      const undone = await poll(ctx, `document.querySelector('.agent-plan-queue .agent-plan-undo-status')?.innerText || null`, 10000);
      const afterUndo = await calendar();
      result.check('Undo under the Study Tutor removes exactly the sessions it made, and says so',
        /undone/i.test(undone ?? '') && afterUndo.length === before.length && createdIds.every((id) => !afterUndo.some((e) => e.id === id)),
        { undone, before: before.length, written, after: afterUndo.length });
      const offeredAgain = await ev(`!!document.querySelector('.agent-plan-queue .agent-plan-undo-button')`);
      result.check('a step that was undone does not offer Undo again', offeredAgain === false);
      await ctx.shot('undone');
    } else {
      result.check('Undo could be exercised (a write step with new sessions)', false, { undoButton, createdIds });
    }

    // --- 5. The fake OpenAI-compatible server: chat, Stop, and a cloud plan --------------
    if (!ai) {
      result.skip('fake-provider chat, Stop and cloud plan: the run did not start the fake AI server (world option `ai`)');
    } else {
      const setup = await ev(`(async () => {
        await window.api.aiSetupSetEnabled(true);
        await window.api.aiSetupUpdate({ compatBaseUrl: ${JSON.stringify(ai.base)}, compatModel: ${JSON.stringify(ai.model)} });
        const s = await window.api.aiSetupStatus();
        return { enabled: s.enabled, compatBaseUrl: s.compatBaseUrl };
      })()`, { await: true }).catch((err) => ({ error: String(err) }));
      const picked = await ev(selectTarget('openai-compatible'));
      result.check('the Agent is aimed at the fake local server', setup?.compatBaseUrl === ai.base && picked === 'openai-compatible', { setup, picked });
      const sendReady = await poll(ctx, `(() => { const f = document.querySelector('form.agent-composer'); __e2e.fill(f.querySelector('textarea'), ${JSON.stringify(`Explain は and が ${FAKE_AI_AGENT_MARK}`)}); const b = f.querySelector('button[type=submit]'); return b && !b.disabled ? true : null; })()`, 10000);
      result.check('Send is enabled with a configured provider', Boolean(sendReady),
        await ev(`document.querySelector('form.agent-composer button[type=submit]')?.title || ''`));

      // a) A streamed reply, committed whole.
      const chatHits = ai.count('agentChat');
      await ev(`(document.querySelector('form.agent-composer').requestSubmit(), true)`);
      const reply = FAKE_AI_AGENT_REPLY.join('');
      const answered = await poll(ctx, `(() => {
        const m = [...document.querySelectorAll('.agent-messages .agent-message-assistant')].pop();
        if (!m || !m.innerText.includes(${JSON.stringify(FAKE_AI_AGENT_REPLY[2].trim())})) return null;
        return { text: m.innerText.replace(/\\s+/g, ' ').slice(0, 400), complete: !!m.querySelector('.agent-status-complete') };
      })()`, 30000);
      const chatHit = ai.hits.filter((h) => h.feature === 'agentChat').pop();
      result.check('a chat send streams the fake\'s reply and commits it as a complete answer',
        Boolean(answered?.complete) && answered.text.includes(reply.replace(/\s+/g, ' ').trim()) && ai.count('agentChat') === chatHits + 1 && chatHit?.stream === true,
        { answered, hit: chatHit });
      await ctx.shot('fake-chat');

      // b) Stop part-way keeps what had arrived, marked stopped.
      await ev(`__e2e.fill(document.querySelector('form.agent-composer textarea'), ${JSON.stringify(`Keep going ${FAKE_AI_AGENT_SLOW_MARK}`)})`);
      await ev(`(document.querySelector('form.agent-composer').requestSubmit(), true)`);
      const partial = FAKE_AI_AGENT_PARTIAL.trim();
      const streaming = await poll(ctx, `(() => { const b = document.querySelector('.agent-composer-actions .agent-action-danger'); const shown = (document.querySelector('.agent-shell')?.innerText || '').includes(${JSON.stringify(partial)}); return b && shown ? true : null; })()`, 20000, 100);
      result.check('the slow reply streams its first part while Stop is offered', Boolean(streaming));
      await ev(`__e2e.click(document.querySelector('.agent-composer-actions .agent-action-danger'))`);
      const stopped = await poll(ctx, `(() => {
        const m = document.querySelector('.agent-messages .agent-message-stopped');
        if (!m) return null;
        return { text: m.innerText.replace(/\\s+/g, ' ').slice(0, 400), note: !!m.querySelector('.agent-message-stopped-note') };
      })()`, 15000);
      await ctx.sleep(300);
      const slowHit = ai.hits.filter((h) => h.feature === 'agentChat').pop();
      result.check('Stop keeps the text that had arrived, marked stopped, and the request is really cancelled',
        Boolean(stopped?.note) && stopped.text.includes(partial) && !stopped.text.includes('which a Stop never receives') && slowHit?.aborted === true,
        { stopped, hit: slowHit });
      await ctx.shot('stopped');

      // c) A free-form plan from the cloud planner, with the calendar tool's yearly repeat.
      const planHits = ai.count('agentPlan');
      await ev(`__e2e.fill(document.querySelector('form.agent-composer textarea'), ${JSON.stringify(`Remind me every year to apply for the JLPT ${FAKE_AI_PLAN_MARK}`)})`);
      const planReady = await poll(ctx, `(() => { const b = document.querySelector('form.agent-composer .agent-plan-create'); return b && !b.disabled ? true : null; })()`, 10000);
      result.check('Create plan is offered with the fake as the planner', Boolean(planReady),
        await ev(`document.querySelector('form.agent-composer .agent-plan-create')?.title || ''`));
      await ev(`__e2e.click(document.querySelector('form.agent-composer .agent-plan-create'))`);
      const planned = await poll(ctx, `(() => { const i = document.querySelector('.agent-plan-queue .agent-plan-item'); return i && /yearly|JLPT/i.test(i.innerText) ? { steps: i.querySelectorAll('.agent-plan-step').length, text: i.innerText.replace(/\\s+/g, ' ').slice(0, 300) } : null; })()`, 30000);
      result.check('the fake\'s plan is validated and queued (one calendar step)', Boolean(planned) && planned.steps === 1 && ai.count('agentPlan') === planHits + 1, { planned, hits: ai.count('agentPlan') - planHits });
      const beforeReminder = (await calendar()).length;
      await runPrimary();
      const reminder = await poll(ctx, `(() => { const e = JSON.parse(localStorage.getItem('${CALENDAR_KEY}') || '[]').find((x) => x.title === 'E2E yearly JLPT reminder'); return e || null; })()`, 20000);
      result.check('the plan runs: a yearly reminder on the 2nd weekday of its month, stored with exactly that rule',
        reminder?.recurrence === 'yearly' && reminder.recurrenceNth === 2 && reminder.category === 'reminder', reminder);
      const reminderUndo = await poll(ctx, `!!document.querySelector('.agent-plan-queue .agent-plan-item .agent-plan-undo-button') || null`, 5000);
      if (reminderUndo) {
        await ev(`__e2e.click(document.querySelector('.agent-plan-queue .agent-plan-item .agent-plan-undo-button'))`);
        await poll(ctx, `!!document.querySelector('[role=dialog]') || null`, 5000);
        await ev(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); const b = d && [...d.querySelectorAll('button')].pop(); if (b) b.click(); return !!b; })()`);
      }
      const reminderGone = await poll(ctx, `(() => { const n = JSON.parse(localStorage.getItem('${CALENDAR_KEY}') || '[]'); return n.some((x) => x.title === 'E2E yearly JLPT reminder') ? null : { left: n.length }; })()`, 10000);
      result.check('Undo removes the reminder the plan made', Boolean(reminderUndo) && reminderGone?.left === beforeReminder, { reminderUndo, after: reminderGone, before: beforeReminder });
      await ctx.shot('fake-plan');
    }

    // --- 6. Offline: the note, and an immediate offline message on send -----------------
    const off = await ctx.request('/network', { window: 'main', offline: true });
    result.check('the network is taken away (navigator.onLine false)', off.ok !== false && (await ev(`navigator.onLine`)) === false, off);
    await ev(selectTarget(null));
    const note = await poll(ctx, `document.querySelector('form.agent-composer .agent-offline-note')?.innerText || null`, 5000);
    result.check('a cloud target while offline shows the offline note', Boolean(note), note);
    await ev(`__e2e.fill(document.querySelector('form.agent-composer textarea'), 'こんにちは')`);
    const t0 = Date.now();
    await ev(`(document.querySelector('form.agent-composer').requestSubmit(), true)`);
    const offlineError = await poll(ctx, `(() => { const e = [...document.querySelectorAll('form.agent-composer .agent-message-error[role=alert]')].map((x) => x.innerText).find((x) => /provider|internet|connect/i.test(x)); return e || null; })()`, 5000, 100);
    const elapsed = Date.now() - t0;
    result.check('sending while offline reports the offline message at once (no round trip)', Boolean(offlineError) && elapsed < 3000, { offlineError, elapsed });
    await ctx.shot('offline');

    // Restore: network back, the local target, the AI settings, the default permission ceiling.
    await ctx.request('/network', { window: 'main', clear: true });
    const online = await poll(ctx, `navigator.onLine || null`, 5000);
    result.check('the network is restored', Boolean(online));
    const cleared = await poll(ctx, `!document.querySelector('form.agent-composer .agent-offline-note') || null`, 3000);
    result.check('the offline note goes away when the connection is back', Boolean(cleared));
    await ev(selectTarget('local'));
    if (ai) {
      const restored = await ev(AI_SETTINGS_NONE, { await: true }).catch((err) => ({ error: String(err) }));
      result.check('the AI settings are put back (AI on, no provider configured)', restored?.enabled === true && restored.compatBaseUrl === '', restored);
    }
    await ev(`__e2e.click(document.querySelector('[data-testid="agent-governance-permission-read-only"]'))`);
    await ev(`(() => { const box = document.querySelector('[data-testid="agent-governance-enabled"]'); if (box && box.checked) box.click(); return true; })()`);
    await ev(`__e2e.fill(document.querySelector('form.agent-composer textarea'), '')`);
    const leftover = (await calendar()).length;
    result.check('the Calendar holds none of this flow\'s events', leftover === before.length, { leftover, before: before.length });
  },
};
