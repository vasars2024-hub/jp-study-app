// @vitest-environment node
/**
 * The installed copy's updater with the release feed in front of Squirrel:
 * nothing newer (or only the skipped version) never starts Update.exe, beta
 * points Squirrel at the picked pre-release, a channel switch drops a stale
 * answer, prefs survive a restart, and "Restart to update" asks first when it
 * would cut a recording short.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createAppUpdateController, SQUIRREL_FEED_URL } from '../squirrelUpdater';
import type { FeedFetch } from '../releaseFeed';
import type { AppUpdatePrefs, AppUpdateUnsavedKind } from '../../shared/appUpdate';
import type { ReleaseChannel } from '../../shared/release';

function fakeUpdater() {
  return Object.assign(new EventEmitter(), {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  });
}

const ok = (version: string, prerelease = false): FeedFetch => ({
  kind: 'ok',
  release: { tag: `v${version}`, version, name: `v${version}`, body: '', url: '', prerelease },
});

function harness(opts: {
  answer?: (channel: ReleaseChannel) => Promise<FeedFetch>;
  prefs?: AppUpdatePrefs;
  unsaved?: AppUpdateUnsavedKind[];
} = {}) {
  const updater = fakeUpdater();
  let saved: AppUpdatePrefs | null = opts.prefs ?? null;
  const asked: ReleaseChannel[] = [];
  const c = createAppUpdateController({
    install: 'installed',
    updater,
    currentVersion: '1.0.1',
    broadcast: () => undefined,
    setTimer: () => undefined,
    prefsStore: { load: () => saved ?? { channel: 'stable', skippedVersion: null }, save: (p) => void (saved = p) },
    resolveRelease: (channel) => {
      asked.push(channel);
      return opts.answer ? opts.answer(channel) : Promise.resolve(ok('1.0.1'));
    },
    unsavedWork: () => opts.unsaved ?? [],
  });
  c.start();
  updater.setFeedURL.mockClear();
  return { c, updater, asked, saved: () => saved };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('release feed before Squirrel', () => {
  it('nothing newer: Update.exe is never started', async () => {
    const h = harness();
    h.c.checkNow();
    expect(h.c.status().state).toBe('checking');
    await settle();
    expect(h.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(h.c.details()).toMatchObject({ state: 'idle', latestVersion: '1.0.1' });
  });

  it('a newer stable release goes to Squirrel on the latest-release feed', async () => {
    const h = harness({ answer: async () => ok('1.1.0') });
    h.c.checkNow();
    await settle();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(h.updater.setFeedURL).not.toHaveBeenCalled();
    expect(h.c.details().feedUrl).toBe(SQUIRREL_FEED_URL);
  });

  it('the skipped version is neither offered nor downloaded', async () => {
    const h = harness({ answer: async () => ok('1.1.0'), prefs: { channel: 'stable', skippedVersion: '1.1.0' } });
    h.c.checkNow();
    await settle();
    expect(h.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(h.c.details()).toMatchObject({ state: 'idle', skippedVersion: '1.1.0', latestVersion: '1.1.0' });
    // Un-skip: the next check downloads it.
    h.c.setPrefs({ skippedVersion: null });
    h.c.checkNow();
    await settle();
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('beta pins Squirrel to the picked pre-release\'s assets', async () => {
    const h = harness({ answer: async (ch) => (ch === 'beta' ? ok('1.2.0-beta.1', true) : ok('1.0.1')) });
    expect(h.c.setPrefs({ channel: 'beta' }).channel).toBe('beta');
    expect(h.saved()).toEqual({ channel: 'beta', skippedVersion: null });
    h.c.checkNow();
    await settle();
    expect(h.asked).toEqual(['beta']);
    expect(h.updater.setFeedURL).toHaveBeenCalledWith({
      url: 'https://github.com/vasars2024-hub/jp-study-app/releases/download/v1.2.0-beta.1',
    });
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('an answer for the old channel is dropped after a switch', async () => {
    let release: (f: FeedFetch) => void = () => undefined;
    const h = harness({ answer: () => new Promise<FeedFetch>((r) => (release = r)) });
    h.c.checkNow();
    h.c.setPrefs({ channel: 'beta' });
    release(ok('9.0.0'));
    await settle();
    expect(h.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(h.c.details().latestVersion).toBeUndefined();
  });

  it('a rate-limited feed still lets stable ask Squirrel; beta reports it', async () => {
    const limited: FeedFetch = { kind: 'failed', reason: 'rate-limited' };
    const stable = harness({ answer: async () => limited });
    stable.c.checkNow();
    await settle();
    expect(stable.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    const beta = harness({ answer: async () => limited, prefs: { channel: 'beta', skippedVersion: null } });
    beta.c.checkNow();
    await settle();
    expect(beta.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(beta.c.details().state).toBe('error');
  });

  it('prefs from disk are validated', () => {
    const h = harness({ prefs: { channel: 'nightly' as ReleaseChannel, skippedVersion: '<script>' } });
    expect(h.c.prefs()).toEqual({ channel: 'stable', skippedVersion: null });
  });
});

describe('restart to update', () => {
  it('asks first while a recording would be cut short, restarts on force', () => {
    const h = harness({ unsaved: ['recording'] });
    expect(h.c.requestRestart()).toEqual({ ok: false, reason: 'not-downloaded' });
    h.updater.emit('update-downloaded', {}, '', '1.1.0');
    expect(h.c.requestRestart()).toEqual({ ok: false, reason: 'unsaved', unsaved: ['recording'] });
    expect(h.updater.quitAndInstall).not.toHaveBeenCalled();
    expect(h.c.requestRestart(true)).toEqual({ ok: true });
    expect(h.updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('restarts at once when nothing would be lost', () => {
    const h = harness();
    h.updater.emit('update-downloaded', {}, '', '1.1.0');
    expect(h.c.requestRestart()).toEqual({ ok: true });
    expect(h.updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
