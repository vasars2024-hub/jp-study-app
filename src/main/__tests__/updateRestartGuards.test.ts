// @vitest-environment node
/**
 * What "Restart to update" consults and what the Updates panel lists beside it:
 *  - the unsaved-work registry (main/unsavedWork.ts): a window's whole list
 *    replaces its last one, a closed window's entries go with it, main jobs hold
 *    and release, junk is ignored, the order is the warning's;
 *  - the update history (main/updateHistory.ts): first run, upgrade arms "What's
 *    new", a downgrade does not, junk on disk is dropped;
 *  - the release feed's tagged lookup and download base (main/releaseFeed.ts);
 *  - the harness's stand-in Update.exe (main/updateHarnessSquirrel.ts), which only
 *    ever reads a local folder and never touches the network.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetWindowUnsavedWork,
  holdUnsavedWork,
  listUnsavedWork,
  MAX_UNSAVED_PER_WINDOW,
  resetUnsavedWorkForTests,
  setWindowUnsavedWork,
} from '../unsavedWork';
import { historyForPanel, noteRunningVersion, readUpdateHistory, UPDATE_HISTORY_MAX } from '../updateHistory';
import { fetchTaggedRelease, resolveUpdateFeed, updateDownloadBase } from '../releaseFeed';
import { createHarnessSquirrel } from '../updateHarnessSquirrel';
import type { FeedRelease } from '../../shared/release';

afterEach(() => resetUnsavedWorkForTests());

describe('unsaved-work registry', () => {
  it('each window reports its whole list; the latest replaces the last; order is the warning order', () => {
    expect(setWindowUnsavedWork(7, ['card-editor', 'note-editor'])).toBe(true);
    expect(setWindowUnsavedWork(9, ['review-session'])).toBe(true);
    expect(listUnsavedWork()).toEqual(['note-editor', 'card-editor', 'review-session']);
    setWindowUnsavedWork(7, ['note-editor']);
    expect(listUnsavedWork()).toEqual(['note-editor', 'review-session']);
    setWindowUnsavedWork(7, []);
    expect(listUnsavedWork()).toEqual(['review-session']);
  });

  it('a window that closes takes its entries with it (a pop-out cannot leave a stale warning)', () => {
    setWindowUnsavedWork(12, ['note-editor']);
    forgetWindowUnsavedWork(12);
    expect(listUnsavedWork()).toEqual([]);
  });

  it('unknown kinds and malformed reports are ignored; a runaway list is capped', () => {
    expect(setWindowUnsavedWork(3, 'note-editor')).toBe(false);
    expect(setWindowUnsavedWork(0, ['note-editor'])).toBe(false);
    expect(setWindowUnsavedWork(3, ['rm -rf', 42, null, 'snip'])).toBe(true);
    expect(listUnsavedWork()).toEqual(['snip']);
    expect(setWindowUnsavedWork(4, Array.from({ length: MAX_UNSAVED_PER_WINDOW * 3 }, () => 'ai-job'))).toBe(true);
    expect(listUnsavedWork()).toEqual(['snip', 'ai-job']);
  });

  it('main jobs hold a kind until released; releasing twice is harmless', () => {
    const a = holdUnsavedWork('ai-job');
    const b = holdUnsavedWork('ai-job');
    expect(listUnsavedWork()).toEqual(['ai-job']);
    a();
    a();
    expect(listUnsavedWork()).toEqual(['ai-job']);
    b();
    expect(listUnsavedWork()).toEqual([]);
  });
});

describe('every code the panel builds a key from has a string', () => {
  it('unsaved kinds and error codes, in all four languages', async () => {
    const { APP_UPDATE_UNSAVED_KINDS } = await import('../../shared/appUpdate');
    const { en } = await import('../../shared/i18n/catalogs/en');
    const { ja } = await import('../../shared/i18n/catalogs/ja');
    const { zh } = await import('../../shared/i18n/catalogs/zh');
    const { ru } = await import('../../shared/i18n/catalogs/ru');
    const keys = [
      ...APP_UPDATE_UNSAVED_KINDS.map((k) => `upd2.unsaved.${k}`),
      ...['network', 'no-feed', 'updater-missing', 'checksum', 'disk', 'unknown'].map((c) => `upd2.error.${c}`),
    ];
    for (const catalog of [en, ja, zh, ru]) {
      expect(keys.filter((k) => !(k in catalog))).toEqual([]);
    }
  });
});

describe('update history', () => {
  it('the first run is recorded without "What\'s new"', () => {
    const r = noteRunningVersion({ history: [], whatsNew: null }, 'v1.0.1', 1000);
    expect(r).toEqual({ history: [{ version: '1.0.1', at: 1000 }], whatsNew: null, changed: true });
  });

  it('an upgrade is recorded with where it came from and arms "What\'s new"; the same version again changes nothing', () => {
    const first = noteRunningVersion({ history: [], whatsNew: null }, '1.0.1', 1000);
    const up = noteRunningVersion(first, '1.1.0', 2000);
    expect(up.history[1]).toEqual({ version: '1.1.0', at: 2000, from: '1.0.1' });
    expect(up.whatsNew).toEqual({ version: '1.1.0', from: '1.0.1' });
    expect(noteRunningVersion(up, '1.1.0', 3000).changed).toBe(false);
    expect(historyForPanel(up).map((e) => e.version)).toEqual(['1.1.0', '1.0.1']);
  });

  it('a downgrade is recorded but has nothing new to show', () => {
    const r = noteRunningVersion({ history: [{ version: '1.2.0', at: 1 }], whatsNew: null }, '1.1.0', 5);
    expect(r.whatsNew).toBeNull();
    expect(r.history[1]).toEqual({ version: '1.1.0', at: 5, from: '1.2.0' });
  });

  it('reads only what validates from disk, and keeps the last UPDATE_HISTORY_MAX', () => {
    const many = Array.from({ length: UPDATE_HISTORY_MAX + 5 }, (_, i) => ({ version: `1.0.${i}`, at: i + 1 }));
    const r = readUpdateHistory({
      history: [{ version: '<script>', at: 1 }, { version: '1.0.0', at: -1 }, ...many],
      whatsNew: { version: '1.0.9', from: '1.0.8', announced: true },
    });
    expect(r.history).toHaveLength(UPDATE_HISTORY_MAX);
    expect(r.history[r.history.length - 1]!.version).toBe(`1.0.${UPDATE_HISTORY_MAX + 4}`);
    expect(r.whatsNew).toEqual({ version: '1.0.9', from: '1.0.8', announced: true });
    expect(readUpdateHistory({ history: 'x', whatsNew: { version: 'nope', from: '1' } })).toEqual({ history: [], whatsNew: null });
  });
});

describe('release feed: one version, and where its packages are', () => {
  const FAKE = 'http://127.0.0.1:5123/repos/vasars2024-hub/jp-study-app';
  const release: FeedRelease = { tag: 'v1.1.0-beta.1', version: '1.1.0-beta.1', name: 'b', body: '', url: '', prerelease: true };

  it('downloads come from the pinned tag on github.com, or the harness fake; never with checks off', () => {
    expect(updateDownloadBase(resolveUpdateFeed({}, false), release)).toBe(
      'https://github.com/vasars2024-hub/jp-study-app/releases/download/v1.1.0-beta.1',
    );
    expect(updateDownloadBase(resolveUpdateFeed({ GUM_UPDATE_FEED_URL: FAKE }, true), release)).toBe(`${FAKE}/download/v1.1.0-beta.1`);
    expect(updateDownloadBase(resolveUpdateFeed({}, true), release)).toBeNull();
  });

  it('a tagged release: `v<version>` first, the bare tag on a 404, and the version must match', async () => {
    const urls: string[] = [];
    const answer = (status: number, body: unknown) => ({
      status,
      ok: status < 300,
      headers: { get: () => null },
      json: async () => body,
    });
    const fetchImpl = async (url: string) => {
      urls.push(url);
      return url.endsWith('/tags/v1.0.2')
        ? answer(404, {})
        : answer(200, { tag_name: '1.0.2', name: 'Gum 1.0.2', body: '- notes', html_url: 'https://github.com/vasars2024-hub/jp-study-app/releases/tag/1.0.2' });
    };
    const feed = resolveUpdateFeed({ GUM_UPDATE_FEED_URL: FAKE }, true);
    const r = await fetchTaggedRelease(feed, '1.0.2', fetchImpl);
    expect(r).toMatchObject({ kind: 'ok', release: { version: '1.0.2', body: '- notes' } });
    expect(urls).toEqual([`${FAKE}/releases/tags/v1.0.2`, `${FAKE}/releases/tags/1.0.2`]);
    expect(await fetchTaggedRelease(feed, 'not-a-version', fetchImpl)).toEqual({ kind: 'failed', reason: 'invalid' });
    expect(await fetchTaggedRelease(resolveUpdateFeed({}, true), '1.0.2', fetchImpl)).toEqual({ kind: 'failed', reason: 'disabled' });
  });
});

describe("the harness's stand-in Update.exe", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });
  const real = () => ({ on: vi.fn(), setFeedURL: vi.fn(), checkForUpdates: vi.fn(), quitAndInstall: vi.fn() });
  const events = (u: ReturnType<typeof createHarnessSquirrel>) => {
    const seen: unknown[][] = [];
    for (const e of ['checking-for-update', 'update-available', 'update-not-available', 'update-downloaded', 'error']) {
      u.on(e, (...args: unknown[]) => seen.push([e, ...args]));
    }
    return seen;
  };
  const settle = () => new Promise<void>((r) => setTimeout(r, 300));

  it('passes every call to the (stubbed) autoUpdater, reads the local folder, checks the SHA1, answers "downloaded"', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-harness-sq-'));
    dirs.push(dir);
    const body = Buffer.from('package bytes');
    const sha = createHash('sha1').update(body).digest('hex').toUpperCase();
    fs.writeFileSync(path.join(dir, 'gum-1.1.0-full.nupkg'), body);
    fs.writeFileSync(path.join(dir, 'RELEASES'), `${sha} gum-1.1.0-full.nupkg ${body.length}`);
    const r = real();
    const u = createHarnessSquirrel(r, '1.0.2');
    const seen = events(u);
    u.setFeedURL({ url: dir });
    u.checkForUpdates();
    await settle();
    expect(r.setFeedURL).toHaveBeenCalledWith({ url: dir });
    expect(r.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(seen.map((s) => s[0])).toEqual(['checking-for-update', 'update-available', 'update-downloaded']);
    expect(seen[2]![3]).toBe('1.1.0');
    u.quitAndInstall();
    expect(r.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('refuses a network feed and a package whose SHA1 does not match', async () => {
    const r = real();
    const u = createHarnessSquirrel(r, '1.0.2');
    const seen = events(u);
    u.setFeedURL({ url: 'https://github.com/vasars2024-hub/jp-study-app/releases/latest/download' });
    u.checkForUpdates();
    await settle();
    expect(seen.map((s) => s[0])).toEqual(['checking-for-update', 'error']);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-harness-sq-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'gum-1.1.0-full.nupkg'), 'tampered');
    fs.writeFileSync(path.join(dir, 'RELEASES'), `${'B'.repeat(40)} gum-1.1.0-full.nupkg 8`);
    const seen2 = events(u);
    u.setFeedURL({ url: dir });
    u.checkForUpdates();
    await settle();
    expect(seen2.map((s) => s[0])).toEqual(['checking-for-update', 'error']);
  });
});
