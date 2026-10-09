'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Updates (Settings → Help → Updates, `UpdatePanel.tsx`).
 *
 * The harness runs an unpackaged build, so `detectInstallKind` answers `dev` — the
 * "not installed through the installer" state: the copy does not update itself and Squirrel
 * is never started (headless mode also stubs `autoUpdater`, recording any call). Asserted:
 * opening the panel is idle and touches NO network (main's fetch and Chromium's requests
 * are both witnessed by headless mode); "Check now" is the first and only thing that
 * reaches out (the read-only GitHub release check), and the panel reports its answer.
 */
const { installHelpers, poll } = require('./_lib.cjs');

module.exports = {
  id: 'updates',
  title: 'Updates panel: idle, no network until "Check now"',
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);

    const details = await ev(`window.api.appUpdateDetails()`, { await: true });
    result.check('main reports a dev (not installer) copy, idle, never checked', details?.install === 'dev' && details?.state === 'idle' && details?.lastCheckedAt === null, details);

    await ctx.e2e('clear');
    await ev(`__e2e.open('settings')`);
    await ctx.sleep(400);
    await ev(`(window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'help', settingId: 'updates' } })), true)`);
    const panel = await poll(ctx, `(() => { const f = document.querySelector('.upd2-facts'); return f ? f.closest('section, [id]')?.innerText.replace(/\\s+/g, ' ').trim() : null; })()`, 15000);
    result.check('the Updates panel opens', Boolean(panel), panel);
    // The facts fill in once main's details arrive (one IPC round trip).
    await poll(ctx, `document.querySelector('.upd2-state')?.textContent || null`, 10000);
    const facts = await ev(`(() => { const dd = [...document.querySelectorAll('.upd2-facts dd')].map((d) => d.textContent.trim()); return { dd, state: document.querySelector('.upd2-state')?.textContent ?? null, check: [...document.querySelectorAll('.fm-actions button')].map((b) => ({ t: b.textContent.trim(), disabled: b.disabled })) }; })()`);
    result.check('install shows "Development build" and the state says it does not update itself', facts.dd.includes('Development build') && /does not update itself/i.test(facts.state ?? ''), facts);
    result.check('last check: "Not yet"; "Check now" is offered and enabled', facts.dd.includes('Not yet') && facts.check.some((b) => b.t === 'Check now' && !b.disabled), facts);
    result.check('no raw i18n keys on the panel', !/\bupd2\.|help\.update\./.test(panel ?? ''), panel);
    await ctx.shot('idle');

    // Idle means idle: let it sit, then look at everything that went out.
    await ctx.sleep(3000);
    const idle = await ctx.e2e('status');
    // Background jobs of other features may fetch at any moment; the claim under test is
    // about THIS panel, so release/update endpoints are what must be absent. Anything
    // else is reported, not hidden.
    const updateCalls = idle.network.filter((n) => /github|releases|RELEASES|nupkg/i.test(n.detail));
    result.check('opening the panel made no update request (main fetch + Chromium witnessed)', updateCalls.length === 0, updateCalls);
    if (idle.network.length) result.note(`other requests while the panel sat idle: ${idle.network.map((n) => n.detail).join(', ')}`);
    else result.note('no request of any kind while the panel sat idle');
    result.check('the Squirrel updater was never called', !idle.calls.some((c) => /^autoUpdater\./.test(c.api)), idle.calls.filter((c) => /autoUpdater/.test(c.api)));

    // "Check now": the first request, and the panel answers.
    await ev(`__e2e.click(__e2e.byText('.fm-actions button', 'Check now'))`);
    const line = await poll(ctx, `(() => { const s = [...document.querySelectorAll('[role=status]')].map((x) => x.textContent.trim()).filter((t) => t && !/does not update itself/.test(t)); const last = s.find((t) => /latest|newer|current|unavailable|could not|no releases|publishes|up to date|available/i.test(t)); return last && !/Checking/i.test(last) ? last : null; })()`, 30000, 500);
    const after = await ctx.e2e('status');
    const github = after.network.filter((n) => /github\.com/.test(n.detail));
    result.check('"Check now" is what reaches out: the GitHub release check', github.length >= 1, after.network);
    result.check('the panel reports the check\'s answer', Boolean(line), line);
    const lastCheck = await ev(`[...document.querySelectorAll('.upd2-facts dd')].map((d) => d.textContent.trim())[3] ?? null`);
    result.check('"Last check" now has a time', Boolean(lastCheck) && lastCheck !== 'Not yet', lastCheck);
    result.check('still no Squirrel call (this copy cannot self-update)', !after.calls.some((c) => /^autoUpdater\./.test(c.api)));
    await ctx.shot('checked');
  },
};
