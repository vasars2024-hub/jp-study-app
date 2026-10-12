/**
 * The headless E2E harness's stand-in for Update.exe — never used outside it.
 *
 * The harness runs an unpackaged build, so no copy there can update itself, and
 * Update.exe must never run on the owner's machine. With
 * `GUM_E2E_UPDATE_INSTALL=1` (honoured only under `GUM_E2E_HEADLESS` and with the
 * fake feed) main/release.ts treats the copy as installed and gives the update
 * controller this object instead of Electron's `autoUpdater`. Every call is
 * still passed to the real (headless-stubbed) `autoUpdater`, so the run records
 * exactly what Squirrel would have been asked; then this does what Update.exe
 * does with a LOCAL feed folder — read its RELEASES, check that the package it
 * would apply is there with the SHA1 and size RELEASES names — and answers with
 * Squirrel's events. It applies nothing and never quits the app.
 */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { compareVersions } from '../shared/release';
import type { UpdaterLike } from './squirrelUpdater';
import { parseSquirrelReleases, planSquirrelDownload, squirrelVersionOf } from './updateDownloader';

export const E2E_UPDATE_INSTALL_ENV = 'GUM_E2E_UPDATE_INSTALL';

export function createHarnessSquirrel(real: UpdaterLike, currentVersion: string): UpdaterLike {
  const events = new EventEmitter();
  let feed = '';
  const emitSoon = (...args: [string, ...unknown[]]) => setTimeout(() => events.emit(...args), 50);
  return {
    on(event, listener) {
      events.on(event, listener);
      return this;
    },
    setFeedURL(options) {
      real.setFeedURL(options);
      feed = options.url;
    },
    checkForUpdates() {
      real.checkForUpdates();
      emitSoon('checking-for-update');
      if (/^https?:/i.test(feed) || !feed) {
        // Update.exe would download from the network here; the harness never does.
        emitSoon('error', new Error('harness Update.exe: refusing to download from the network'));
        return;
      }
      let entries;
      try {
        entries = parseSquirrelReleases(fs.readFileSync(path.join(feed, 'RELEASES'), 'utf8'));
      } catch (err) {
        emitSoon('error', new Error(`harness Update.exe: no RELEASES in ${feed}: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }
      const plan = entries ? planSquirrelDownload(entries, null) : null;
      if (!plan || compareVersions(plan.version, squirrelVersionOf(currentVersion)) <= 0) {
        emitSoon('update-not-available');
        return;
      }
      for (const file of plan.files) {
        const p = path.join(feed, file.filename);
        let digest = '';
        try {
          digest = createHash('sha1').update(fs.readFileSync(p)).digest('hex').toUpperCase();
        } catch {
          /* missing */
        }
        if (digest !== file.sha1) {
          emitSoon('error', new Error(`harness Update.exe: checksum of ${file.filename} does not match RELEASES`));
          return;
        }
      }
      emitSoon('update-available');
      setTimeout(() => events.emit('update-downloaded', {}, '', plan.version, new Date(), ''), 150);
    },
    quitAndInstall() {
      // Recorded by the headless stub; the app keeps running.
      real.quitAndInstall();
    },
  };
}
