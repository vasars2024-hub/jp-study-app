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
 * reaches out (the read-only release check), and the panel reports its answer.
 *
 * The release feed is the world's fake (`GUM_UPDATE_FEED_URL`, honoured only under the
 * harness): no request of the run may reach the real api.github.com. The Beta channel
 * reads the release list (a pre-release, a draft that must never show), and "Skip"
 * records the version.
 */
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');

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

    // "Check now": the first request, and the panel answers. Under the harness the
    // release feed is the world's fake (GUM_UPDATE_FEED_URL), never api.github.com.
    const feed = ctx.world?.updateFeed;
    const feedHitsBefore = feed ? feed.hits.length : 0;
    const latestHits = () => (feed ? feed.hits.slice(feedHitsBefore).filter((h) => /\/releases\/latest$/.test(h)).length : 0);
    const STATUS_LINE = `(() => { const s = [...document.querySelectorAll('[role=status]')].map((x) => x.textContent.trim()).filter((t) => t && !/does not update itself/.test(t)); const last = s.find((t) => /latest|newer|current|unavailable|could not|no releases|publishes|up to date|available|skip/i.test(t)); return last && !/Checking/i.test(last) ? last : null; })()`;
    await ev(`__e2e.click(__e2e.byText('.fm-actions button', 'Check now'))`);
    const line = await poll(ctx, STATUS_LINE, 30000, 500);
    const after = await ctx.e2e('status');
    const github = after.network.filter((n) => /github\.com/.test(n.detail));
    result.check('"Check now" is what reaches out: the release check, answered by the fake feed', latestHits() >= 1, feed ? feed.hits : 'no fake feed');
    result.check('no update request reached the real api.github.com', !after.network.some((n) => /api\.github\.com/.test(n.detail)), github);
    result.check('the panel reports the check\'s answer: this build is the latest stable', Boolean(line) && feed ? line.includes(feed.version) && /latest/i.test(line) : Boolean(line), line);
    const lastCheck = await ev(`[...document.querySelectorAll('.upd2-facts dd')].map((d) => d.textContent.trim())[3] ?? null`);
    result.check('"Last check" now has a time', Boolean(lastCheck) && lastCheck !== 'Not yet', lastCheck);
    result.check('still no Squirrel call (this copy cannot self-update)', !after.calls.some((c) => /^autoUpdater\./.test(c.api)));
    await ctx.shot('checked');

    // Channel: Beta follows the release LIST and finds the newer pre-release.
    const switched = await ev(`(() => { const s = document.querySelector('select.upd2-channel'); if (!s) return null; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'beta'); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    const channel = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => (d.channel === 'beta' ? d.channel : null))`, 5000);
    result.check('the channel select switches main to Beta', Boolean(switched) && channel === 'beta', { switched, channel });
    await ev(`__e2e.click(__e2e.byText('.fm-actions button', 'Check now'))`);
    const betaLine = await poll(ctx, `(() => { const t = ${STATUS_LINE}; return t && ${JSON.stringify(feed ? feed.beta : 'beta')} && t.includes(${JSON.stringify(feed ? feed.beta : '-beta')}) ? t : null; })()`, 15000, 300);
    result.check('Beta reports the pre-release (drafts never), from /releases', Boolean(betaLine) && (!feed || feed.hits.some((h) => /\/releases\?per_page=/.test(h))), { betaLine, hits: feed?.hits });

    // Skip this version: the offer goes away and the panel says it is skipped.
    const skipLabel = feed ? `Skip ${feed.beta}` : 'Skip';
    const clicked = await ev(`__e2e.click(__e2e.byText('.fm-actions button', ${JSON.stringify(skipLabel)}))`);
    const skipped = await poll(ctx, `(() => { const t = ${STATUS_LINE}; return t && /skip/i.test(t) ? t : null; })()`, 5000, 250);
    const prefs = await ev(`window.api.appUpdateDetails()`, { await: true });
    result.check('"Skip" records the version and the panel says it is skipped', Boolean(clicked) && Boolean(skipped) && (!feed || prefs?.skippedVersion === feed.beta), { skipped, skippedVersion: prefs?.skippedVersion });
    await ctx.shot('skipped');

    // Leave the profile as it was: stable channel, nothing skipped.
    await ev(`window.api.appUpdateSetPrefs({ channel: 'stable', skippedVersion: null })`, { await: true });
  },
};
