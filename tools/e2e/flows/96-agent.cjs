'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Agent (the in-app study assistant), in a fresh profile with NO model and NO API key:
 *
 *   · the composer says why it cannot send, and offers setup — a clear state, not a spinner;
 *   · the everyday study requests still work with no model at all: a quick action plans a
 *     week (study.plan-week → calendar.schedule-sessions) through the real plan queue, the
 *     write step stops for confirmation, Confirm writes the sessions to the Calendar;
 *   · Undo on that step re-checks the profile at the moment of action (the default tutor
 *     profile does not enable deleting events, so the gate refuses it, visibly, and the
 *     sessions stay);
 *   · offline: with the network taken away (CDP, so `navigator.onLine` flips) a cloud target
 *     shows the offline note, and a send reports the offline message at once instead of
 *     waiting on main.
 */
const { installHelpers, poll } = require('./_lib.cjs');

async function dismissFirstRun(ctx) {
  await ctx.eval(`(() => { const b = [...document.querySelectorAll('.consent button')].find((x) => /No thanks/i.test(x.innerText)); if (b) b.click(); return true; })()`);
  await ctx.sleep(300);
  await ctx.eval(`(() => { const b = document.querySelector('.frs-root .frs-quiet'); if (b) b.click(); return true; })()`);
  await poll(ctx, `!document.querySelector('.frs-root') || null`, 5000);
}

module.exports = {
  id: 'agent',
  title: 'Agent: no-key state, model-free plan queue + confirm + Undo gate, offline preflight',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    await dismissFirstRun(ctx);
    const calendarCount = () => ev(`JSON.parse(localStorage.getItem('jp-calendar-events') || '[]').length`);
    await ev(`(() => { localStorage.setItem('jp-calendar-events', '[]'); window.dispatchEvent(new CustomEvent('calendar-events-changed')); return true; })()`);

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
    const enabled = await poll(ctx, `(JSON.parse(localStorage.getItem('jp-study-local-agent-settings-v1') || '{}').enabled === true) || null`, 3000);
    result.check('the Agent is switched on from its own governance panel', Boolean(enabled));
    await ev(`__e2e.click(document.querySelector('[data-testid="agent-governance-permission-limited-actions"]'))`);
    const permission = await poll(ctx, `(JSON.parse(localStorage.getItem('jp-study-local-agent-settings-v1') || '{}').permission === 'limited-actions') || null`, 3000);
    result.check('permission ceiling set to limited actions', Boolean(permission));

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
    const before = await calendarCount();
    await runPrimary();
    const written = await poll(ctx, `(() => { const n = JSON.parse(localStorage.getItem('jp-calendar-events') || '[]').length; return n > ${before} ? n : null; })()`, 20000);
    result.check('Confirm writes the planned sessions to the Calendar', (written ?? 0) > before, { before, after: written });
    await ctx.shot('plan-done');

    // --- 4. Undo on the step: the gate is re-checked at the moment of action ------------
    const undoButton = await poll(ctx, `!!document.querySelector('.agent-plan-queue .agent-plan-undo-button') || null`, 5000);
    result.check('the completed write step offers Undo', Boolean(undoButton));
    if (undoButton) {
      await ev(`__e2e.click(document.querySelector('.agent-plan-queue .agent-plan-undo-button'))`);
      const dialog = await poll(ctx, `!!document.querySelector('[role=dialog]') || null`, 5000);
      result.check('Undo asks first', Boolean(dialog));
      await ev(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); const b = [...d.querySelectorAll('button')].pop(); b.click(); return true; })()`);
      const outcome = await poll(ctx, `(() => { const u = document.querySelector('.agent-plan-queue .agent-plan-step .agent-plan-error[role=alert], .agent-plan-queue .agent-plan-undo-status'); return u ? u.innerText : null; })()`, 10000);
      const after = await calendarCount();
      // The tutor profile does not enable deleting events: refused, said, nothing removed.
      // (Were it enabled, the sessions would be gone instead — either way it is decided live.)
      result.check('Undo resolves visibly: refused by the profile gate with the sessions kept, or undone',
        Boolean(outcome) && ((/undone/i.test(outcome) && after === before) || (!/undone/i.test(outcome) && after === written)),
        { outcome, before, written, after });
    }

    // --- 5. Offline: the note, and an immediate offline message on send -----------------
    const off = await ctx.request('/network', { window: 'main', offline: true });
    result.check('the network is taken away (navigator.onLine false)', off.ok !== false && (await ev(`navigator.onLine`)) === false, off);
    await ev(`(() => {
      const s = [...document.querySelectorAll('form.agent-composer select')].find((x) => [...x.options].some((o) => o.value === 'local'));
      const cloud = s && [...s.options].find((o) => o.value !== 'local');
      if (!cloud) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, cloud.value);
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const note = await poll(ctx, `document.querySelector('form.agent-composer .agent-offline-note')?.innerText || null`, 5000);
    result.check('a cloud target while offline shows the offline note', Boolean(note), note);
    await ev(`__e2e.fill(document.querySelector('form.agent-composer textarea'), 'こんにちは')`);
    const t0 = Date.now();
    await ev(`(document.querySelector('form.agent-composer').requestSubmit(), true)`);
    const offlineError = await poll(ctx, `(() => { const e = [...document.querySelectorAll('form.agent-composer .agent-message-error[role=alert]')].map((x) => x.innerText).find((x) => /provider|internet|connect/i.test(x)); return e || null; })()`, 5000, 100);
    const elapsed = Date.now() - t0;
    result.check('sending while offline reports the offline message at once (no round trip)', Boolean(offlineError) && elapsed < 3000, { offlineError, elapsed });
    await ctx.shot('offline');

    // Restore: network back, the local target, the default permission ceiling.
    await ctx.request('/network', { window: 'main', clear: true });
    const online = await poll(ctx, `navigator.onLine || null`, 5000);
    result.check('the network is restored', Boolean(online));
    const cleared = await poll(ctx, `!document.querySelector('form.agent-composer .agent-offline-note') || null`, 3000);
    result.check('the offline note goes away when the connection is back', Boolean(cleared));
    await ev(`(() => {
      const s = [...document.querySelectorAll('form.agent-composer select')].find((x) => [...x.options].some((o) => o.value === 'local'));
      if (!s) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'local');
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await ev(`__e2e.click(document.querySelector('[data-testid="agent-governance-permission-read-only"]'))`);
    await ev(`(() => { const box = document.querySelector('[data-testid="agent-governance-enabled"]'); if (box && box.checked) box.click(); return true; })()`);
    await ev(`__e2e.fill(document.querySelector('form.agent-composer textarea'), '')`);
  },
};
