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

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

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
  try {
    const raw = await fsp.readFile(scraperStorePath(name), 'utf-8');
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    // Missing or corrupt both mean "no usable state", and the caller's default
    // is a better answer than an exception on every read.
    return fallback;
  }
}

export function readScraperJsonSync<T>(name: string, fallback: T): T {
  try {
    return (JSON.parse(fs.readFileSync(scraperStorePath(name), 'utf-8')) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function writeScraperJson(name: string, value: unknown): Promise<void> {
  const target = scraperStorePath(name);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(value, null, 2), 'utf-8');
  await fsp.rename(temp, target);
}
