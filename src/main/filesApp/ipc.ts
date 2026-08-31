/**
 * The Files app — main-process IPC.
 *
 * Two handlers and one cache. The index is built by walking real directories
 * and a SQLite table, so rebuilding it on every keystroke in the search box
 * would put a disk walk on the render path; it is cached and invalidated by
 * time or by an explicit refresh, and the snapshot says when it was built so
 * the UI can show that rather than implying it is live.
 *
 * `filesapp:reveal` is separate from the index on purpose. The plan's gate 12
 * requires a non-file-backed item to refuse *honestly* rather than open the
 * wrong folder, and the only way to guarantee that is for the reveal path to
 * consult `revealTargetFor` — the same function the renderer uses to decide
 * whether to offer the action — instead of trusting whatever path a caller
 * hands it.
 */
import fs from 'node:fs';
import { app, ipcMain, shell } from 'electron';
import { dictionaryDb } from '../dictionary/db';
import { revealTargetFor, type FilesIndexSnapshot, type FilesLocation } from '../../shared/filesApp/catalog';
import type { FilesMineSourceResult } from '../../shared/filesApp/mining';
import { buildFilesIndex, type FilesEnumeratorContext, type FilesSqliteLike } from './enumerators';
import { readFilesMineSource } from './mineSource';

/** How long a built index is served before the next request rebuilds it. */
const INDEX_TTL_MS = 15_000;

let cached: FilesIndexSnapshot | null = null;

export function defaultFilesContext(): FilesEnumeratorContext {
  return {
    userDataPath: app.getPath('userData'),
    openDictionary: () => {
      try {
        return dictionaryDb() as unknown as FilesSqliteLike;
      } catch {
        // No dictionary database yet is an ordinary state on a fresh profile.
        // The enumerator reports zero dictionaries; it does not fail the index.
        return null;
      }
    },
  };
}

/** Drop the cache. Called by whatever changes a store the index reads. */
export function invalidateFilesIndex(): void {
  cached = null;
}

export function getFilesIndex(force = false): FilesIndexSnapshot {
  if (!force && cached && Date.now() - cached.builtAt < INDEX_TTL_MS) return cached;
  cached = buildFilesIndex(defaultFilesContext());
  return cached;
}

export interface FilesRevealResult {
  ok: boolean;
  /** i18n key naming why a refusal happened. Never a bare `false`. */
  reasonKey?: string;
}

export function registerFilesAppIpc(): void {
  ipcMain.handle('filesapp:index', (_e, force: unknown): FilesIndexSnapshot =>
    getFilesIndex(force === true),
  );

  ipcMain.handle('filesapp:reveal', (_e, location: unknown): FilesRevealResult => {
    if (!location || typeof location !== 'object') {
      return { ok: false, reasonKey: 'filesApp.reveal.noLocation' };
    }
    const target = revealTargetFor(location as FilesLocation);
    if (!target) {
      // Gate 12's honest half: a dictionary row has no folder, and opening
      // userData "so something happens" would be the wrong folder presented
      // as a success.
      return { ok: false, reasonKey: 'filesApp.reveal.notFileBacked' };
    }
    /*
     * Gate 12's other wrong folder, and the one that was still open.
     *
     * `brokenLink` is a flag the index already sets — a record whose backing
     * file is gone — and those rows ARE file-backed, so `revealTargetFor`
     * returns a path for them and this handler used to reveal it and answer
     * `ok: true`. What Explorer does with a path that no longer exists is
     * open the nearest ancestor that does, silently, which is a different
     * folder than the one the user asked for, reported as a success. That is
     * the exact shape the gate forbids.
     *
     * Checked here rather than trusting the flag: the index is cached for 15
     * seconds and the file may have gone in between, so the flag is a hint and
     * the filesystem is the answer.
     */
    if (!fs.existsSync(target)) {
      return { ok: false, reasonKey: 'filesApp.reveal.missing' };
    }
    shell.showItemInFolder(target);
    return { ok: true };
  });

  /**
   * Gate 3's read half. Main hands back *passages*, never cards: the deck is
   * renderer-owned localStorage, so a main-side "mine" handler would have
   * nowhere to write. Splitting it here keeps one writer for the deck and
   * leaves this handler pure enough to test against a fixture directory.
   *
   * The location is validated the same way `filesapp:reveal` validates it —
   * through `revealTargetFor` — so a caller cannot hand this handler an
   * arbitrary path and have it read a file the catalogue never indexed.
   */
  ipcMain.handle(
    'filesapp:mine-source',
    (_e, location: unknown, kind: unknown): FilesMineSourceResult => {
      if (!location || typeof location !== 'object') {
        return { ok: false, reasonKey: 'filesApp.mine.refuse.notFileBacked' };
      }
      const target = revealTargetFor(location as FilesLocation);
      if (!target) {
        return { ok: false, reasonKey: 'filesApp.mine.refuse.notFileBacked' };
      }
      if (kind !== 'transcript' && kind !== 'subtitle' && kind !== 'book') {
        return { ok: false, reasonKey: 'filesApp.mine.refuse.kindHasNoText' };
      }
      try {
        return readFilesMineSource(target, kind);
      } catch (err) {
        // A reader that throws must still answer. An unhandled rejection here
        // would leave the button spinning with no message at all.
        return {
          ok: false,
          reasonKey: 'filesApp.mine.refuse.unreadable',
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
}
