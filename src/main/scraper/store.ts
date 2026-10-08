// Small JSON files under userData/scraper.
//
// The scraper has several pieces of state that must outlive a restart — source
// health history, the job log, export records — and none of them is big enough
// to deserve a database. This is the shared read/write/atomic-replace helper so
// each of those does not hand-roll its own.
//
// Writes go to a temp file and are renamed into place: a crash mid-write leaves
// the previous file intact rather than a half-written one that fails to parse
// on next boot.

import path from 'node:path';
import { app } from 'electron';
import { readJson, readJsonSync, writeJsonAtomic } from '../atomicJson';

let overrideRoot: string | null = null;

/** Test seam — points the store at a temp directory. */
export function setScraperStoreRoot(root: string | null): void {
  overrideRoot = root;
}

export function scraperStoreRoot(): string {
  if (overrideRoot) return overrideRoot;
  return path.join(app.getPath('userData'), 'scraper');
}

export function scraperStorePath(name: string): string {
  return path.join(scraperStoreRoot(), name);
}

export async function readScraperJson<T>(name: string, fallback: T): Promise<T> {
  // Missing or corrupt both mean "no usable state" (a damaged file is set aside
  // and its last-good copy served first), and the caller's default is a better
  // answer than an exception on every read.
  try {
    return (await readJson<T | null>(scraperStorePath(name), fallback)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function readScraperJsonSync<T>(name: string, fallback: T): T {
  try {
    return readJsonSync<T | null>(scraperStorePath(name), fallback) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function writeScraperJson(name: string, value: unknown): Promise<void> {
  await writeJsonAtomic(scraperStorePath(name), value);
}

const fileChains = new Map<string, Promise<unknown>>();

/**
 * Runs `task` after every earlier task queued for the same file has settled.
 *
 * A read-modify-write (append an export record, append a history entry) that
 * two finishing jobs run at once would otherwise both read the same old file
 * and the second write would drop the first one's entry. A failed task does
 * not break the chain for the next one.
 */
export function withScraperFileQueue<T>(name: string, task: () => Promise<T>): Promise<T> {
  const key = scraperStorePath(name);
  const previous = fileChains.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.then(() => undefined, () => undefined);
  fileChains.set(key, settled);
  void settled.then(() => {
    if (fileChains.get(key) === settled) fileChains.delete(key);
  });
  return run;
}
