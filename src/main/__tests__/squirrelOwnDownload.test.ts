// @vitest-environment node
/**
 * The update controller with Gum's own downloader (main/squirrelUpdater.ts +
 * `downloader`): byte progress reaches the panel (throttled), Cancel pauses with
 * the bytes kept and only "Check now" resumes, a verified download is handed to
 * Update.exe as a local feed folder and its events read as "installing", a delta
 * that fails to apply is fetched again as the full package, a RELEASES the
 * downloader cannot handle falls back to Squirrel's own download, and a restart
 * lists every kind of unsaved work. Electron's `autoUpdater` and the network are
 * both fakes.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { describeAppUpdate, type AppUpdateDetails, type AppUpdateUnsavedKind } from '../../shared/appUpdate';
import type { FeedRelease } from '../../shared/release';
import type { FeedFetch } from '../releaseFeed';
import { createAppUpdateController, PROGRESS_PUSH_MS, SQUIRREL_FEED_URL, type UpdateDownloaderLike } from '../squirrelUpdater';
import type { UpdateDownloadProgress, UpdateDownloadResult } from '../updateDownloader';

const RELEASE: FeedRelease = {
  tag: 'v1.1.0',
  version: '1.1.0',
  name: 'Gum 1.1.0',
  body: '',
  url: 'https://github.com/vasars2024-hub/jp-study-app/releases/tag/v1.1.0',
  prerelease: false,
};
const STAGING = 'C:\\Users\\me\\AppData\\Local\\jp-study-app\\packages\\gum-staged';

function fakeUpdater() {
  return Object.assign(new EventEmitter(), {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  });
}

interface FakeJob {
  progress: (p: UpdateDownloadProgress) => void;
  finish: (r: UpdateDownloadResult) => void;
  cancel: ReturnType<typeof vi.fn<() => void>>;
  fullOnly: boolean;
}

function fakeDownloader() {
  const jobs: FakeJob[] = [];
  const clear = vi.fn();
  const downloader: UpdateDownloaderLike = {
    start: ({ onProgress, fullOnly }) => {
      let finish!: (r: UpdateDownloadResult) => void;
      const done = new Promise<UpdateDownloadResult>((resolve) => (finish = resolve));
      const job: FakeJob = { progress: onProgress, finish, fullOnly, cancel: vi.fn<() => void>() };
      job.cancel.mockImplementation(() => finish({ ok: false, code: 'canceled', message: 'canceled', received: 1234, total: 5000 }));
      jobs.push(job);
      return { done, cancel: () => void job.cancel() };
    },
    clear,
  };
  return { downloader, jobs, clear };
}

function harness(opts: { unsaved?: AppUpdateUnsavedKind[]; release?: FeedRelease; resolveRelease?: () => Promise<FeedFetch> } = {}) {
  const updater = fakeUpdater();
  const dl = fakeDownloader();
  const timers: Array<{ fn: () => void; ms: number; repeat: boolean }> = [];
  const pushed: AppUpdateDetails[] = [];
  let clock = 1_700_000_000_000;
  const controller = createAppUpdateController({
    install: 'installed',
    updater,
    currentVersion: '1.0.2',
    broadcast: () => undefined,
    broadcastDetails: (d) => pushed.push(d),
    setTimer: (fn, ms, repeat) => void timers.push({ fn, ms, repeat }),
    now: () => clock,
    resolveRelease: opts.resolveRelease ?? (async () => ({ kind: 'ok', release: opts.release ?? RELEASE })),
    downloader: dl.downloader,
    unsavedWork: () => opts.unsaved ?? [],
    markQuitting: vi.fn(),
    history: () => ({ history: [{ version: '1.0.2', at: 1, from: '1.0.1' }], whatsNew: { version: '1.0.2', from: '1.0.1' } }),
  });
  controller.start();
  return {
    updater,
    controller,
    jobs: dl.jobs,
    clear: dl.clear,
    pushed,
    timers,
    advance: (ms: number) => {
      clock += ms;
    },
    view: () => describeAppUpdate(controller.details()),
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("Gum's own update download", () => {
  it('check -> manifest -> bytes -> verifying -> handed to Update.exe -> ready', async () => {
    const h = harness();
    h.controller.checkNow();
    await flush();
    expect(h.jobs).toHaveLength(1);
    expect(h.controller.details().state).toBe('downloading');
    expect(h.view()).toMatchObject({ messageKey: 'upd3.state.preparing', progress: 'indeterminate', canCancel: true });
    // Squirrel is not asked to download anything itself.
    expect(h.updater.checkForUpdates).not.toHaveBeenCalled();

    h.jobs[0]!.progress({ phase: 'package', received: 1000, total: 5000 });
    expect(h.view()).toMatchObject({ messageKey: 'upd3.state.downloading', progress: 'determinate', bytes: { received: 1000, total: 5000 }, canCancel: true });
    expect(h.controller.details().download).toMatchObject({ phase: 'package', version: '1.1.0', received: 1000, total: 5000 });

    h.jobs[0]!.progress({ phase: 'verifying', received: 5000, total: 5000 });
    expect(h.view().messageKey).toBe('upd3.state.verifying');
    expect(h.view().canCancel).toBeFalsy();
    expect(h.controller.cancelDownload()).toBe(false);

    h.jobs[0]!.finish({ ok: true, stagingDir: STAGING, version: '1.1.0', deltas: false, bytes: 5000 });
    await flush();
    // The verified folder becomes Squirrel's feed: it copies and applies from disk.
    expect(h.updater.setFeedURL).toHaveBeenLastCalledWith({ url: STAGING });
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(h.view().messageKey).toBe('upd3.state.installing');
    expect(h.view().canCancel).toBeFalsy();

    // Update.exe's own steps do not look like a new check.
    h.updater.emit('checking-for-update');
    h.updater.emit('update-available');
    expect(h.controller.details().download?.phase).toBe('installing');

    h.updater.emit('update-downloaded', {}, '', '1.1.0', new Date(), '');
    expect(h.controller.details()).toMatchObject({ state: 'downloaded', version: '1.1.0' });
    expect(h.controller.details().download).toBeUndefined();
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.view().canRestart).toBe(true);
  });

  it('the panel hears byte progress at most every PROGRESS_PUSH_MS, phase changes at once', async () => {
    const h = harness();
    h.controller.checkNow();
    await flush();
    const before = h.pushed.length;
    h.jobs[0]!.progress({ phase: 'package', received: 1, total: 5000 }); // phase change: pushed
    h.jobs[0]!.progress({ phase: 'package', received: 2, total: 5000 }); // too soon
    h.jobs[0]!.progress({ phase: 'package', received: 3, total: 5000 }); // too soon
    expect(h.pushed.length - before).toBe(1);
    h.advance(PROGRESS_PUSH_MS);
    h.jobs[0]!.progress({ phase: 'package', received: 4, total: 5000 });
    expect(h.pushed.length - before).toBe(2);
    expect(h.pushed[h.pushed.length - 1]!.download?.received).toBe(4);
    h.jobs[0]!.progress({ phase: 'package', received: 5000, total: 5000 }); // the end always goes
    expect(h.pushed[h.pushed.length - 1]!.download?.received).toBe(5000);
  });

  it('Cancel pauses with the bytes kept; the timer does not resume it, Check now does', async () => {
    const h = harness();
    h.controller.checkNow();
    await flush();
    h.jobs[0]!.progress({ phase: 'package', received: 1234, total: 5000 });
    expect(h.controller.cancelDownload()).toBe(true);
    await flush();
    const d = h.controller.details();
    expect(d.state).toBe('idle');
    expect(d.paused).toEqual({ version: '1.1.0', received: 1234, total: 5000 });
    expect(h.view()).toMatchObject({ messageKey: 'upd3.state.paused', resumes: true, canCheck: true });

    // The six-hourly check leaves a download the user paused alone.
    h.timers.find((t) => t.repeat)!.fn();
    await flush();
    expect(h.jobs).toHaveLength(1);

    h.controller.checkNow();
    await flush();
    expect(h.jobs).toHaveLength(2);
    expect(h.controller.details().paused).toBeUndefined();
  });

  it('a failed download says why, and keeps the bytes for "Try again"', async () => {
    const h = harness();
    h.controller.checkNow();
    await flush();
    h.jobs[0]!.finish({ ok: false, code: 'network', message: 'network: ECONNRESET', received: 2048, total: 5000 });
    await flush();
    expect(h.controller.details()).toMatchObject({ state: 'error', error: 'network', partialBytes: 2048 });
    expect(h.view()).toMatchObject({ messageKey: 'upd2.error.network', resumes: true });

    const h2 = harness();
    h2.controller.checkNow();
    await flush();
    h2.jobs[0]!.finish({ ok: false, code: 'checksum', message: 'checksum', received: 5000, total: 5000 });
    await flush();
    expect(h2.controller.details()).toMatchObject({ state: 'error', error: 'checksum' });
    expect(h2.controller.details().partialBytes).toBeUndefined();
  });

  it('deltas that Update.exe cannot apply are fetched again as the full package', async () => {
    const h = harness();
    h.controller.checkNow();
    await flush();
    h.jobs[0]!.finish({ ok: true, stagingDir: STAGING, version: '1.1.0', deltas: true, bytes: 300 });
    await flush();
    expect(h.view().messageKey).toBe('upd3.state.installing');
    h.updater.emit('error', new Error('Failed to apply delta'));
    expect(h.jobs).toHaveLength(2);
    expect(h.jobs[1]!.fullOnly).toBe(true);
    expect(h.controller.details().state).toBe('downloading');
    // The full package failing too is an error, not another loop.
    h.jobs[1]!.finish({ ok: true, stagingDir: STAGING, version: '1.1.0', deltas: false, bytes: 5000 });
    await flush();
    h.updater.emit('error', new Error('Update.exe exited with 1'));
    expect(h.jobs).toHaveLength(2);
    expect(h.controller.details().state).toBe('error');
  });

  it('a RELEASES the downloader does not handle leaves the download to Squirrel, as before', async () => {
    const h = harness();
    h.controller.checkNow();
    await flush();
    h.jobs[0]!.finish({ ok: false, code: 'unsupported', message: 'absolute URL', received: 0, total: null });
    await flush();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    h.updater.emit('checking-for-update');
    h.updater.emit('update-available');
    // No bytes: the indeterminate bar of Squirrel's own download.
    expect(h.view()).toMatchObject({ messageKey: 'upd2.state.downloading', progress: 'indeterminate' });
  });

  it('not a byte through (a proxy only Windows knows?): Update.exe gets one try with its own client', async () => {
    const h = harness();
    h.controller.checkNow();
    await flush();
    h.jobs[0]!.finish({ ok: false, code: 'network', message: 'network: ECONNREFUSED', received: 0, total: null });
    await flush();
    expect(h.updater.setFeedURL).toHaveBeenLastCalledWith({ url: 'https://github.com/vasars2024-hub/jp-study-app/releases/latest/download' });
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    h.updater.emit('error', new Error('getaddrinfo ENOTFOUND github.com'));
    expect(h.controller.details()).toMatchObject({ state: 'error', error: 'network' });
  });

  it('switching channel stops the other channel\'s download without keeping it', async () => {
    const h = harness();
    h.controller.checkNow();
    await flush();
    h.jobs[0]!.progress({ phase: 'package', received: 10, total: 5000 });
    h.controller.setPrefs({ channel: 'beta' });
    await flush();
    expect(h.jobs[0]!.cancel).toHaveBeenCalled();
    expect(h.controller.details()).toMatchObject({ state: 'idle' });
    expect(h.controller.details().paused).toBeUndefined();
  });

  it('Update.exe finding nothing to apply in the staged folder is an error, and the folder is cleared', async () => {
    const h = harness();
    h.controller.checkNow();
    await flush();
    h.jobs[0]!.finish({ ok: true, stagingDir: STAGING, version: '1.1.0', deltas: false, bytes: 5000 });
    await flush();
    h.updater.emit('update-not-available');
    expect(h.controller.details()).toMatchObject({ state: 'error', error: 'no-feed' });
    expect(h.clear).toHaveBeenCalled();
  });

  it('a failed stable lookup after a hand-off asks Squirrel on the stable feed, not the cleared staging folder', async () => {
    // Bug 35: the fallback called checkForUpdates() with the feed still pointing at
    // the staging folder from the last hand-off, which clear() may have deleted.
    const answers: FeedFetch[] = [
      { kind: 'ok', release: RELEASE },
      { kind: 'failed', reason: 'rate-limited' },
    ];
    const h = harness({ resolveRelease: async () => answers.shift() ?? { kind: 'failed', reason: 'offline' } });
    h.controller.checkNow();
    await flush();
    h.jobs[0]!.finish({ ok: true, stagingDir: STAGING, version: '1.1.0', deltas: false, bytes: 5000 });
    await flush();
    expect(h.updater.setFeedURL).toHaveBeenLastCalledWith({ url: STAGING });
    h.updater.emit('update-not-available');
    expect(h.clear).toHaveBeenCalled();
    expect(h.controller.details().state).toBe('error');
    h.updater.checkForUpdates.mockClear();
    h.updater.setFeedURL.mockClear();

    h.controller.checkNow();
    await flush();
    expect(h.updater.setFeedURL).toHaveBeenCalledWith({ url: SQUIRREL_FEED_URL });
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(h.updater.setFeedURL.mock.invocationCallOrder[0]!).toBeLessThan(h.updater.checkForUpdates.mock.invocationCallOrder[0]!);
    expect(h.controller.details().feedUrl).toBe(SQUIRREL_FEED_URL);
  });

  it('a failed stable lookup with the feed already on stable does not re-set it', async () => {
    const h = harness({ resolveRelease: async () => ({ kind: 'failed', reason: 'offline' }) });
    h.updater.setFeedURL.mockClear();
    h.controller.checkNow();
    await flush();
    expect(h.updater.setFeedURL).not.toHaveBeenCalled();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('restart lists every kind of unsaved work and goes ahead only when forced', async () => {
    const h = harness({ unsaved: ['note-editor', 'card-editor', 'recording'] });
    h.controller.checkNow();
    await flush();
    h.jobs[0]!.finish({ ok: true, stagingDir: STAGING, version: '1.1.0', deltas: false, bytes: 5000 });
    await flush();
    h.updater.emit('update-downloaded', {}, '', '1.1.0', new Date(), '');
    expect(h.controller.requestRestart()).toEqual({ ok: false, reason: 'unsaved', unsaved: ['note-editor', 'card-editor', 'recording'] });
    expect(h.updater.quitAndInstall).not.toHaveBeenCalled();
    expect(h.controller.requestRestart(true)).toEqual({ ok: true });
    expect(h.updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('details carry the update history and "What\'s new"', () => {
    const h = harness();
    expect(h.controller.details()).toMatchObject({
      history: [{ version: '1.0.2', from: '1.0.1' }],
      whatsNew: { version: '1.0.2', from: '1.0.1' },
    });
    expect(h.controller.refresh().whatsNew).toEqual({ version: '1.0.2', from: '1.0.1' });
  });
});
