'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Updates (Settings → Help → Updates, `UpdatePanel.tsx`), as an INSTALLED copy.
 *
 * The flow opts into `world: { updateInstall: true }`: headless mode then treats this
 * unpackaged build as installed (main/release.ts, honoured only under the harness and with
 * the fake feed), gives the update controller Gum's own downloader pointed at the world's
 * fake feed, and a stand-in Update.exe (main/updateHarnessSquirrel.ts) that reads the
 * staging folder, checks its SHA1 and answers with Squirrel's events — every call it makes
 * still goes through the headless-stubbed `autoUpdater`, which records it and installs
 * nothing. The profile last ran Gum 0.9.0 (world.seedProfile), so this start is an update.
 *
 * Asserted, in order:
 *  - opening the panel is idle and touches NO update endpoint; Squirrel is never asked to check;
 *  - "What's new" is shown once: its notice was posted at boot, the card is in the panel;
 *  - "Check for updates automatically" turns off and on in main; "Pause updates for 7 days"
 *    is kept by main and shown with its end date, and "Resume updates" ends it;
 *  - "Check now" on Stable (while paused) reaches the fake feed (never api.github.com) and
 *    says up to date;
 *  - Beta finds the pre-release and DOWNLOADS it with real byte progress; the fake cuts the
 *    first response at 1 MiB and the download resumes with a Range request by itself;
 *  - Cancel pauses with the bytes kept; Resume continues with a Range request, verifies the
 *    SHA1, and hands the staging folder to "Update.exe", which reports it downloaded;
 *  - "Restart to update" refuses while windows report unsaved work and lists it; nothing quits;
 *  - What's new's release notes render the safe Markdown subset: `<script>` / `<img onerror>`
 *    are text, only the project's GitHub link is a link, and it opens through main;
 *  - the update history lists 0.9.0 → this version.
 */
const { installHelpers, poll, pollAsync } = require('./_lib.cjs');

module.exports = {
  id: 'updates',
  title: 'Updates panel: installed copy, own download with progress/cancel/resume, restart guard, notes',
  /** An "installed" copy against the fake feed (tools/e2e/world.cjs). */
  world: { updateInstall: true },
  async run(ctx) {
    const { eval: ev, result } = ctx;
    await installHelpers(ctx);
    const feed = ctx.world?.updateFeed;
    // Run on its own, the fresh profile still shows the country-ping consent over
    // everything; the privacy-preserving answer is "No thanks" (as 10-setup does).
    await ev(`(() => { const b = [...document.querySelectorAll('.consent button')].find((x) => /No thanks/i.test(x.innerText)); if (b) b.click(); return true; })()`);
    // …and first-run setup after it: "Later" changes nothing (the next start resumes it).
    await poll(ctx, `document.querySelector('.frs-root') ? true : null`, 3000, 250);
    await ev(`(() => { const b = [...document.querySelectorAll('.frs-root button')].find((x) => x.innerText.trim() === 'Later'); if (b) b.click(); return true; })()`);

    const details = await ev(`window.api.appUpdateDetails()`, { await: true });
    result.check(
      'main reports an installed copy (harness stand-in), idle, never checked',
      details?.install === 'installed' && details?.state === 'idle' && details?.lastCheckedAt === null,
      details,
    );
    result.check(
      'this start is an update from 0.9.0: history recorded, "What\'s new" armed',
      Array.isArray(details?.history) && details.history.some((h) => h.version === '0.9.0')
        && details.history[0]?.from === '0.9.0' && details?.whatsNew?.from === '0.9.0',
      { history: details?.history, whatsNew: details?.whatsNew },
    );
    const announced = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => d.whatsNew && d.whatsNew.announced ? d.whatsNew : null)`, 15000);
    result.check('the "What\'s new" notice was posted once at boot (main recorded it)', Boolean(announced), announced);

    await ctx.e2e('clear');
    await ev(`__e2e.open('settings')`);
    await ctx.sleep(400);
    await ev(`(window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'help', settingId: 'updates' } })), true)`);
    const panel = await poll(ctx, `(() => { const f = document.querySelector('.upd2-facts'); return f ? f.closest('section, [id]')?.innerText.replace(/\\s+/g, ' ').trim() : null; })()`, 15000);
    result.check('the Updates panel opens', Boolean(panel), panel);
    await poll(ctx, `document.querySelector('.upd2-state')?.textContent || null`, 10000);
    const facts = await ev(`(() => { const dd = [...document.querySelectorAll('.upd2-facts dd')].map((d) => d.textContent.trim()); return { dd, state: document.querySelector('.upd2-state')?.textContent ?? null, buttons: [...document.querySelectorAll('.fm-actions button')].map((b) => ({ t: b.textContent.trim(), disabled: b.disabled })) }; })()`);
    result.check('install shows "Installed (updates itself)"; last check "Not yet"', facts.dd.includes('Installed (updates itself)') && facts.dd.includes('Not yet'), facts);
    result.check('"Check now" is offered and enabled', facts.buttons.some((b) => b.t === 'Check now' && !b.disabled), facts.buttons);
    result.check('no raw i18n keys on the panel', !/\bupd[23]\.|help\.update\./.test(panel ?? ''), panel);
    const whatsNewCard = await ev(`document.querySelector('.upd3-whats-new')?.innerText.replace(/\\s+/g, ' ').trim() ?? null`);
    result.check('the "What\'s new" card is in the panel', Boolean(whatsNewCard) && /What.s new in Gum/.test(whatsNewCard) && whatsNewCard.includes('0.9.0'), whatsNewCard);
    const historyText = await ev(`[...document.querySelectorAll('.upd3-history-list li')].map((li) => li.textContent.trim())`);
    result.check('the update history lists 0.9.0 and this version', historyText.length >= 2 && /updated from 0\.9\.0/.test(historyText[0] ?? '') && /running now/.test(historyText[0] ?? ''), historyText);
    await ctx.shot('idle');

    // Idle means idle: let it sit, then look at everything that went out.
    const feedHitsAtOpen = feed ? feed.hits.length : 0;
    await ctx.sleep(3000);
    const idle = await ctx.e2e('status');
    const updateCalls = idle.network.filter((n) => /github|releases|RELEASES|nupkg/i.test(n.detail));
    result.check('opening the panel made no update request (main fetch + Chromium witnessed, fake feed untouched)', updateCalls.length === 0 && (!feed || feed.hits.length === feedHitsAtOpen), { updateCalls, feedHits: feed?.hits.slice(feedHitsAtOpen) });
    if (idle.network.length) result.note(`other requests while the panel sat idle: ${idle.network.map((n) => n.detail).join(', ')}`);
    result.check('Squirrel was never asked to check', !idle.calls.some((c) => c.api === 'autoUpdater.checkForUpdates'), idle.calls.filter((c) => /autoUpdater/.test(c.api)));

    // "Check for updates automatically" and "Pause updates": both kept by main, the
    // background check honours them (squirrelUpdateAutoCheck.test.ts; the harness never
    // checks on a timer), and "Check now" below still reads the feed while paused.
    const autoBox = `document.querySelector('.upd3-auto input[type=checkbox]')`;
    result.check('"Check for updates automatically" is on by default', (await ev(`${autoBox}?.checked ?? null`)) === true && details?.autoCheck === true, details?.autoCheck);
    await ev(`(${autoBox}.click(), true)`);
    const autoOff = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => (d.autoCheck === false ? d : null))`, 5000);
    const autoOffUi = await poll(ctx, `(${autoBox}.checked === false && !document.querySelector('.upd3-pause')) || null`, 5000);
    result.check('turning it off reaches main, and the pause option goes away with it', Boolean(autoOff) && Boolean(autoOffUi), autoOff?.autoCheck);
    await ev(`(${autoBox}.click(), true)`);
    const autoOn = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => (d.autoCheck === true ? true : null))`, 5000);
    result.check('turning it back on reaches main', Boolean(autoOn));
    const pauseLabel = await poll(ctx, `document.querySelector('.upd3-pause')?.textContent.trim() || null`, 5000);
    result.check('"Pause updates for 7 days" is offered', pauseLabel === 'Pause updates for 7 days', pauseLabel);
    const pauseClickedAt = Date.now();
    await ev(`__e2e.click(document.querySelector('.upd3-pause'))`);
    const pausedPrefs = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => (typeof d.pausedUntil === 'number' ? d : null))`, 5000);
    const week = 7 * 24 * 60 * 60 * 1000;
    result.check('main keeps the pause for a week', Boolean(pausedPrefs) && Math.abs(pausedPrefs.pausedUntil - (pauseClickedAt + week)) < 60_000, pausedPrefs?.pausedUntil);
    const pausedNote = await poll(ctx, `(() => { const p = document.querySelector('.upd3-paused-until'); return p && __e2e.byText('.upd3-paused-until button', 'Resume updates') ? p.textContent.replace(/\\s+/g, ' ').trim() : null; })()`, 5000);
    result.check('the panel says until when, and offers "Resume updates"', Boolean(pausedNote) && /Updates are paused until/.test(pausedNote) && !/\bupd3\./.test(pausedNote), pausedNote);
    await ctx.shot('updates-paused');

    // "Check now" on Stable (still paused: the user's own check is never held): the fake
    // says this build is the latest.
    const feedHitsBefore = feed ? feed.hits.length : 0;
    await ev(`__e2e.click(__e2e.byText('.fm-actions button', 'Check now'))`);
    const upToDate = await poll(ctx, `(() => { const t = document.querySelector('.upd2-state')?.textContent ?? ''; return /up to date/i.test(t) ? t : null; })()`, 20000, 300);
    const after = await ctx.e2e('status');
    result.check('"Check now" reads the fake feed\'s /releases/latest', !feed || feed.hits.slice(feedHitsBefore).some((h) => /\/releases\/latest$/.test(h)), feed?.hits.slice(feedHitsBefore));
    result.check('no update request reached the real api.github.com', !after.network.some((n) => /api\.github\.com/.test(n.detail)), after.network.filter((n) => /github/.test(n.detail)));
    result.check('the panel says this version is up to date', Boolean(upToDate) && (!feed || upToDate.includes(feed.version)), upToDate);
    await ev(`__e2e.click(__e2e.byText('.upd3-paused-until button', 'Resume updates'))`);
    const resumedPrefs = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => (d.pausedUntil === undefined && !document.querySelector('.upd3-paused-until') && document.querySelector('.upd3-pause') ? true : null))`, 5000);
    result.check('"Resume updates" ends the pause at once', Boolean(resumedPrefs));

    // Beta: the pre-release is newer, so Gum downloads it itself, with bytes.
    await ev(`(() => { const s = document.querySelector('select.upd2-channel'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'beta'); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    const channel = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => (d.channel === 'beta' ? d.channel : null))`, 5000);
    result.check('the channel select switches main to Beta', channel === 'beta', channel);
    await ev(`__e2e.click(__e2e.byText('.fm-actions button', 'Check now'))`);
    const dropAfter = feed?.pkg?.dropAfter ?? 1024 * 1024;
    // Past the cut: the first response was dropped at 1 MiB and the download carried on.
    const resumedAuto = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => d.download && d.download.phase === 'package' && d.download.received > ${dropAfter + 256 * 1024} ? d.download : null)`, 30000, 100);
    const progressUi = await ev(`(() => { const p = document.querySelector('.upd2-progress progress'); return p ? { value: p.getAttribute('value'), max: p.getAttribute('max'), valuetext: p.getAttribute('aria-valuetext'), bytes: document.querySelector('.upd3-bytes')?.textContent ?? null, state: document.querySelector('.upd2-state')?.textContent ?? null, cancel: !!__e2e.byText('button', 'Cancel download') } : null; })()`);
    result.check('the download reports real bytes of a known total (not an invented number)', Boolean(resumedAuto) && resumedAuto.total === feed?.pkg?.size && resumedAuto.version === feed?.beta, resumedAuto);
    result.check('the panel shows a determinate bar, "x% · a of b", and Cancel', Boolean(progressUi?.max) && Number(progressUi.value) > 0 && /%/.test(progressUi.bytes ?? '') && progressUi.cancel && /Downloading Gum/.test(progressUi.state ?? ''), progressUi);
    await ctx.shot('downloading');
    const firstTwo = (feed?.downloads ?? []).slice(0, 2);
    result.check('a dropped connection resumed with a Range request by itself (no restart from zero)', firstTwo.length === 2 && firstTwo[0].cut === true && firstTwo[0].range === null && firstTwo[1].status === 206 && /^bytes=\d+-$/.test(firstTwo[1].range ?? ''), feed?.downloads);

    // Cancel: paused, bytes kept.
    await ev(`__e2e.click(__e2e.byText('button', 'Cancel download'))`);
    const paused = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => d.state === 'idle' && d.paused ? d.paused : null)`, 10000, 200);
    result.check('Cancel pauses the download with the bytes kept', Boolean(paused) && paused.received > dropAfter && paused.version === feed?.beta, paused);
    const pausedUi = await poll(ctx, `(() => { const b = __e2e.byText('.fm-actions button', 'Resume download'); const n = document.querySelector('.upd3-paused')?.textContent; return b && n ? { note: n, state: document.querySelector('.upd2-state')?.textContent } : null; })()`, 5000);
    result.check('the panel says it is paused, what is kept, and offers "Resume download"', Boolean(pausedUi) && /paused/i.test(pausedUi.state ?? ''), pausedUi);
    await ctx.shot('paused');

    // Resume: continues from the kept bytes, verifies, hands over to "Update.exe".
    const dlBefore = feed?.downloads?.length ?? 0;
    await ev(`__e2e.click(__e2e.byText('.fm-actions button', 'Resume download'))`);
    const done = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => d.state === 'downloaded' || d.state === 'error' ? d : null)`, 60000, 250);
    const resumeReq = (feed?.downloads ?? [])[dlBefore];
    result.check('Resume continued with a Range request from the kept bytes', Boolean(resumeReq) && resumeReq.status === 206 && Number(/bytes=(\d+)-/.exec(resumeReq.range ?? '')?.[1]) >= (paused?.received ?? 1), { resumeReq, paused });
    result.check('the verified download was handed to Update.exe and is ready', done?.state === 'downloaded' && done?.version === feed?.beta, done);
    const handed = await ctx.e2e('status');
    const feedCalls = handed.calls.filter((c) => c.api === 'autoUpdater.setFeedURL').map((c) => c.detail);
    result.check('Squirrel was pointed at the local staging folder (not the network) and asked once', feedCalls.some((d) => /update-staging/.test(d)) && handed.calls.filter((c) => c.api === 'autoUpdater.checkForUpdates').length === 1, { feedCalls, checks: handed.calls.filter((c) => c.api === 'autoUpdater.checkForUpdates').length });
    const readyUi = await poll(ctx, `(() => { const t = document.querySelector('.upd2-state')?.textContent ?? ''; return /has downloaded/.test(t) && __e2e.byText('.fm-actions button', 'Restart to update') ? t : null; })()`, 5000);
    result.check('the panel offers "Restart to update"', Boolean(readyUi), readyUi);

    // Restart while windows report unsaved work: refused, and the list says what.
    await ev(`(window.api.reportUnsavedWork(['note-editor', 'card-editor']), true)`);
    await ctx.sleep(300);
    await ev(`__e2e.click(__e2e.byText('.fm-actions button', 'Restart to update'))`);
    const warning = await poll(ctx, `(() => { const w = document.querySelector('.upd2-restart-warning'); return w ? [...w.querySelectorAll('li')].map((li) => li.textContent.trim()) : null; })()`, 5000);
    result.check('"Restart to update" lists the unsaved work and does not restart', Array.isArray(warning) && warning.some((t) => /note you are editing/.test(t)) && warning.some((t) => /card you are editing/.test(t)), warning);
    await ctx.shot('restart-warning');
    await ev(`__e2e.click(__e2e.byText('.upd2-restart-warning button', 'Not now'))`);
    await ev(`(window.api.reportUnsavedWork([]), true)`);
    const noQuit = await ctx.e2e('status');
    result.check('nothing was installed or quit', !noQuit.calls.some((c) => c.api === 'autoUpdater.quitAndInstall'), noQuit.calls.filter((c) => /quitAndInstall/.test(c.api)));

    // What's new: this version's notes, rendered safely.
    await ev(`__e2e.click(__e2e.byText('.upd3-whats-new button', /Show what.s new/))`);
    const notes = await poll(ctx, `(() => { const b = document.querySelector('.upd3-whats-new .upd2-notes-body'); if (!b) return null; return { h: b.querySelector('h5')?.textContent ?? null, strong: b.querySelector('strong')?.textContent ?? null, code: b.querySelector('code')?.textContent ?? null, links: [...b.querySelectorAll('a')].map((a) => a.getAttribute('href')), scripts: b.querySelectorAll('script, img, iframe').length, text: b.textContent }; })()`, 15000);
    result.check('"What\'s new" fetched this version\'s notes from the fake feed', !feed || feed.hits.some((h) => h.includes(`/releases/tags/v${feed.version}`)), feed?.hits.slice(-5));
    result.check('notes render headings, bold and code', notes?.h === 'Highlights' && notes?.strong === 'Bold words' && notes?.code === 'inline code', notes);
    result.check('<script> and <img onerror> are shown as text, never elements', notes?.scripts === 0 && /<script>alert\("not html"\)<\/script>/.test(notes?.text ?? '') && /<img src=x onerror=/.test(notes?.text ?? ''), notes);
    result.check('only the project\'s GitHub link is a link; the other shows its address as text', notes?.links?.length === 1 && /^https:\/\/github\.com\/vasars2024-hub\/jp-study-app\/issues\/1$/.test(notes.links[0]) && /Elsewhere \(https:\/\/evil\.example\/phish\)/.test(notes?.text ?? ''), notes);
    await ctx.shot('whats-new');
    await ctx.e2e('clear');
    await ev(`__e2e.click(document.querySelector('.upd3-whats-new .upd2-notes-body a'))`);
    await ctx.sleep(400);
    const opened = await ctx.e2e('status');
    const openCalls = opened.calls.filter((c) => c.api === 'shell.openExternal').map((c) => c.detail);
    result.check('the link opened through main\'s shell.openExternal (stubbed), the window did not navigate', openCalls.some((d) => d.includes('github.com/vasars2024-hub/jp-study-app/issues/1')) && (await ev(`location.href`)).indexOf('github.com') < 0, openCalls);

    await ev(`__e2e.click(__e2e.byText('.upd3-whats-new button', 'Dismiss'))`);
    const dismissed = await pollAsync(ctx, `window.api.appUpdateDetails().then((d) => d.whatsNew === null && !document.querySelector('.upd3-whats-new') ? true : null)`, 5000);
    result.check('"What\'s new" is dismissed for good', Boolean(dismissed));

    // Leave the profile as it was: stable channel, nothing skipped.
    await ev(`window.api.appUpdateSetPrefs({ channel: 'stable', skippedVersion: null, autoCheck: true, pausedUntil: null })`, { await: true });
  },
};
