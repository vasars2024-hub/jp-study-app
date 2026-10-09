/**
 * Anki media uploads that happen once per file, not once per mine or sync.
 *
 * Every mining path names its media by content (`jsa-<md5>.png`,
 * `jsa-vn-<md5>.jpg`, `jsa-tts-ja-<md5>.mp3`, the dictionary's `<md5>` audio),
 * so the same screenshot or clip mined twice is the same Anki file. But every
 * mine still sent the full base64 to `storeMediaFile`, and a queued note
 * replayed after an outage sent it again. This module keeps a small index of
 * what each Anki profile already holds (`userData/anki-media-index.json`,
 * profile -> filename -> md5) and skips an upload whose bytes are already
 * there — after a name-only `getMediaFilesNames` lookup confirms the file was
 * not deleted since (Anki's Check Media). A content-addressed name that is not
 * in the index is looked up the same way: a file synced in from another machine
 * via AnkiWeb is then recorded rather than uploaded again.
 *
 * Index per Anki profile: each profile has its own media folder, so a file
 * stored under one says nothing about another.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { app } from 'electron';
import { readJsonSync, writeJsonAtomic } from '../atomicJson';
import { invoke } from './client';

const INDEX_FILE = 'anki-media-index.json';
/** A profile switch in Anki is noticed within this long. */
const PROFILE_TTL_MS = 10_000;
/** Filenames remembered per profile; the oldest are forgotten beyond this. */
const INDEX_CAP = 20_000;

interface AnkiMediaIndex {
  version: 1;
  profiles: Record<string, Record<string, string>>;
}

let index: AnkiMediaIndex | null = null;
let indexFileOverride: string | null = null;
let profileCache: { name: string; at: number } | null = null;

function indexFile(): string {
  return indexFileOverride ?? path.join(app.getPath('userData'), INDEX_FILE);
}

function loadIndex(): AnkiMediaIndex {
  if (index) return index;
  const raw = readJsonSync<unknown>(indexFile(), null);
  const profiles = raw && typeof raw === 'object' && (raw as AnkiMediaIndex).version === 1
    && (raw as AnkiMediaIndex).profiles && typeof (raw as AnkiMediaIndex).profiles === 'object'
    ? (raw as AnkiMediaIndex).profiles
    : {};
  index = { version: 1, profiles: { ...profiles } };
  return index;
}

function saveIndex(): void {
  if (!index) return;
  void writeJsonAtomic(indexFile(), index).catch(() => undefined);
}

/** md5 of the decoded bytes, hex. */
export function ankiMediaContentHash(base64: string): string {
  return crypto.createHash('md5').update(Buffer.from(base64, 'base64')).digest('hex');
}

/** The review sync already knows the active profile; it shares it so mining does not ask again. */
export function noteAnkiActiveProfile(name: string | undefined): void {
  if (typeof name === 'string') profileCache = { name, at: Date.now() };
}

async function activeProfileKey(): Promise<string> {
  const now = Date.now();
  if (profileCache && now - profileCache.at < PROFILE_TTL_MS) return profileCache.name;
  try {
    const name = await invoke('getActiveProfile', undefined);
    profileCache = { name: typeof name === 'string' ? name : '', at: now };
  } catch {
    // An AnkiConnect without the action: one shared bucket, still correct for
    // the single-profile setups that add-on version implies.
    profileCache = { name: '', at: now };
  }
  return profileCache.name;
}

function record(profile: string, filename: string, hash: string): void {
  const idx = loadIndex();
  const bucket = idx.profiles[profile] ?? {};
  delete bucket[filename];
  bucket[filename] = hash;
  const names = Object.keys(bucket);
  if (names.length > INDEX_CAP) {
    for (const name of names.slice(0, names.length - INDEX_CAP)) delete bucket[name];
  }
  idx.profiles[profile] = bucket;
  saveIndex();
}

export type AnkiMediaStoreOutcome = 'stored' | 'already-there';

/**
 * `storeMediaFile`, skipped when this profile already holds these exact bytes
 * under this name. Throws what `invoke` throws, exactly like the call it wraps.
 */
export async function storeAnkiMediaOnce(filename: string, base64: string): Promise<AnkiMediaStoreOutcome> {
  const data = base64.trim();
  const hash = ankiMediaContentHash(data);
  const profile = await activeProfileKey();
  const known = loadIndex().profiles[profile]?.[filename];
  // Only a name that carries its own content hash can be trusted from its name
  // alone; any other name may hold different bytes, so it is (re)written unless
  // the index says these exact bytes went up under it.
  const sameBytes = known === hash || (known === undefined && filename.includes(hash.slice(0, 12)));
  if (sameBytes) {
    // Still there? "Check Media" in Anki may have deleted it since; a skipped
    // upload would then leave the note pointing at nothing.
    const present = await mediaPresent(filename);
    if (present === true || (present === null && known === hash)) {
      if (known !== hash) record(profile, filename, hash);
      return 'already-there';
    }
  }
  await invoke('storeMediaFile', { filename, data });
  record(profile, filename, hash);
  return 'stored';
}

/** true / false from Anki's media folder; null when this AnkiConnect cannot say. */
async function mediaPresent(filename: string): Promise<boolean | null> {
  try {
    const names = await invoke('getMediaFilesNames', { pattern: filename });
    return Array.isArray(names) ? names.includes(filename) : null;
  } catch {
    return null;
  }
}

/** A file Gum deleted from Anki's media folder is no longer there in any profile Gum knows. */
export function forgetAnkiMedia(filename: string): void {
  const idx = loadIndex();
  let changed = false;
  for (const bucket of Object.values(idx.profiles)) {
    if (filename in bucket) {
      delete bucket[filename];
      changed = true;
    }
  }
  if (changed) saveIndex();
}

/** Test seam: a fresh index at `file` (or the default location) and no cached profile. */
export function resetAnkiMediaIndexForTests(file: string | null = null): void {
  index = null;
  indexFileOverride = file;
  profileCache = null;
}
