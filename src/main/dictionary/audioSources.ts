// The ordered audio-source list: preferences on disk, local-folder indexes in
// memory, and the fallback chain a play request walks.
//
// The contract (source kinds, file layouts, key rules) is `shared/audioSources.ts`.
// This side touches the filesystem and nothing else: the CDN source is reached
// through a callback the caller supplies (`remote`), so this module never imports
// the database service or the Anki path and cannot form a cycle with either.
//
// Caching, by layer:
//   - a local folder is walked once and its file index kept in memory; Settings
//     invalidates it when the folder list changes, and it is rebuilt after
//     LOCAL_INDEX_TTL_MS so files the user adds later are found;
//   - the CDN keeps its own on-disk clip and negative cache (`dictionary/audio.ts`);
//   - which source last answered a word is remembered, so a replay goes straight
//     to it instead of re-walking the chain.

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from '../atomicJson';
import {
  audioSourceDisplayName,
  localAudioFileKeys,
  localAudioLookupKeys,
  localAudioMime,
  normalizeAudioSourcesPrefs,
  type AudioSourceAvailability,
  type AudioSourceConfig,
  type AudioSourcesPrefs,
} from '../../shared/audioSources';
import { normalizeAudioIdentity, type LexiconAudioIdentity, type LexiconAudioResult } from '../../shared/lexiconAudio';

export const AUDIO_SOURCES_FILE = 'audio-sources.json';

function defaultPrefsFile(): string {
  return path.join(app.getPath('userData'), AUDIO_SOURCES_FILE);
}

export function readAudioSourcesPrefs(file?: string): AudioSourcesPrefs {
  try {
    return normalizeAudioSourcesPrefs(readJsonSync<unknown>(file ?? defaultPrefsFile(), () => ({}), {}));
  } catch {
    // No userData (a headless test host): the default list, CDN only, as before.
    return normalizeAudioSourcesPrefs({});
  }
}

export function writeAudioSourcesPrefs(raw: unknown, file: string = defaultPrefsFile()): AudioSourcesPrefs {
  const prefs = normalizeAudioSourcesPrefs(raw);
  writeJsonAtomicSync(file, prefs, { space: 2 });
  invalidateLocalAudioIndex();
  answeredBy.clear();
  return prefs;
}

// ----- local folder index -----------------------------------------------------

/** Deep enough for `user_files/forvo_files/<user>/<word>.mp3`, shallow enough to stay bounded. */
const MAX_DEPTH = 6;
/** A full JapanesePod101 pack is ~110k files; this leaves room without letting a wrong folder (a whole drive) run away. */
const MAX_FILES = 400_000;
/** Entries handled between yields, so walking a big pack never blocks the main process for long. */
const YIELD_EVERY = 2_000;
const LOCAL_INDEX_TTL_MS = 10 * 60_000;

interface LocalIndex {
  builtAt: number;
  files: Map<string, string>;
  truncated: boolean;
}

const indexes = new Map<string, Promise<LocalIndex>>();

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Walk `folder` and map every audio file to the keys it answers to. First file (sorted) wins a key. */
export async function buildLocalAudioIndex(folder: string): Promise<LocalIndex> {
  const files = new Map<string, string>();
  let seen = 0;
  let truncated = false;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (truncated || depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (truncated) return;
      seen += 1;
      if (seen > MAX_FILES) {
        truncated = true;
        return;
      }
      if (seen % YIELD_EVERY === 0) await tick();
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name);
      if (!localAudioMime(ext)) continue;
      for (const key of localAudioFileKeys(entry.name.slice(0, -ext.length))) {
        if (!files.has(key)) files.set(key, full);
      }
    }
  };
  await walk(folder, 0);
  return { builtAt: Date.now(), files, truncated };
}

function localIndex(folder: string, now = Date.now()): Promise<LocalIndex> {
  const cached = indexes.get(folder);
  if (cached) {
    return cached.then((index) => {
      if (now - index.builtAt < LOCAL_INDEX_TTL_MS) return index;
      indexes.delete(folder);
      return localIndex(folder, now);
    });
  }
  const building = buildLocalAudioIndex(folder).catch(() => ({ builtAt: Date.now(), files: new Map<string, string>(), truncated: false }));
  indexes.set(folder, building);
  return building;
}

/** Forget every folder index (or one), so the next play walks the folder again. */
export function invalidateLocalAudioIndex(folder?: string): void {
  if (folder) indexes.delete(folder);
  else indexes.clear();
}

/** The file in `folder` that pronounces this word, or null. */
export async function findLocalAudioFile(folder: string, term: string, reading?: string): Promise<string | null> {
  const index = await localIndex(folder);
  for (const key of localAudioLookupKeys(term, reading)) {
    const hit = index.files.get(key);
    if (hit) return hit;
  }
  return null;
}

/** How many recordings a folder holds, for Settings ("1,234 recordings found"). */
export async function localAudioFolderStats(folder: string): Promise<{ files: number; truncated: boolean; exists: boolean }> {
  let exists = false;
  try {
    exists = fs.statSync(folder).isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) return { files: 0, truncated: false, exists };
  invalidateLocalAudioIndex(folder);
  const index = await localIndex(folder);
  return { files: new Set(index.files.values()).size, truncated: index.truncated, exists };
}

// ----- the chain --------------------------------------------------------------

export type RemoteAudio = (identity: LexiconAudioIdentity, options: { cacheOnly?: boolean }) => Promise<LexiconAudioResult>;

export interface AudioChainQuery {
  lang: string;
  term: string;
  reading?: string;
  /** Ask only this source (the per-entry picker); omitted = the ordered fallback chain. */
  sourceId?: string;
  cacheOnly?: boolean;
}

export interface AudioChainResult extends LexiconAudioResult {
  /** The source that answered, when one did. */
  sourceId?: string;
}

/** Which source answered which word last; bounded. */
const answeredBy = new Map<string, string>();
const MAX_ANSWERED = 500;

function rememberAnswer(identity: LexiconAudioIdentity, sourceId: string): void {
  const key = `${identity.term}\u0001${identity.reading}`;
  answeredBy.delete(key);
  answeredBy.set(key, sourceId);
  if (answeredBy.size > MAX_ANSWERED) {
    const oldest = answeredBy.keys().next().value;
    if (oldest !== undefined) answeredBy.delete(oldest);
  }
}

async function playLocal(source: AudioSourceConfig, identity: LexiconAudioIdentity): Promise<AudioChainResult | null> {
  if (!source.folder) return null;
  const file = await findLocalAudioFile(source.folder, identity.term, identity.reading);
  if (!file) return null;
  const mimeType = localAudioMime(path.extname(file));
  if (!mimeType) return null;
  try {
    const data = await fs.promises.readFile(file);
    if (!data.length) return null;
    return {
      query: identity.term,
      status: 'ready',
      sourceId: source.id,
      clip: { provider: audioSourceDisplayName(source), mimeType, dataBase64: data.toString('base64'), cached: true },
    };
  } catch {
    return null;
  }
}

/**
 * Play a word from the user's sources: the picked one only, or each enabled one
 * in order until one has it. A local miss falls through silently; the CDN's
 * `offline` is remembered so the final answer says "retry" rather than "none"
 * when the only source that might have it could not be reached.
 */
export async function resolveAudioChain(
  query: AudioChainQuery,
  prefs: AudioSourcesPrefs,
  remote: RemoteAudio,
): Promise<AudioChainResult> {
  const identity = normalizeAudioIdentity(query);
  const label = query.term.trim();
  if (!identity) return { query: label, status: 'unsupported' };
  const enabled = prefs.sources.filter((source) => source.enabled);
  let chain = query.sourceId
    ? prefs.sources.filter((source) => source.id === query.sourceId)
    : enabled;
  if (!query.sourceId) {
    const last = answeredBy.get(`${identity.term}\u0001${identity.reading}`);
    const preferred = last ? chain.find((source) => source.id === last) : undefined;
    if (preferred) chain = [preferred, ...chain.filter((source) => source !== preferred)];
  }
  if (!chain.length) return { query: label, status: 'none' };
  let sawOffline = false;
  for (const source of chain) {
    if (source.kind === 'local') {
      const hit = await playLocal(source, identity);
      if (hit) {
        rememberAnswer(identity, source.id);
        return { ...hit, query: label };
      }
      continue;
    }
    const result = await remote(identity, { cacheOnly: query.cacheOnly });
    if (result.status === 'ready') {
      rememberAnswer(identity, source.id);
      return { ...result, query: label, sourceId: source.id };
    }
    if (result.status === 'offline') sawOffline = true;
  }
  return { query: label, status: sawOffline ? 'offline' : 'none' };
}

/**
 * What each source can say about a word without playing it — for the picker.
 * A local folder answers from its index; the CDN answers from its cache only
 * (`cacheOnly`), so opening the picker never sends the word anywhere.
 */
export async function audioSourceAvailability(
  query: { lang: string; term: string; reading?: string },
  prefs: AudioSourcesPrefs,
  remote: RemoteAudio,
): Promise<AudioSourceAvailability[]> {
  const identity = normalizeAudioIdentity(query);
  if (!identity) return [];
  const out: AudioSourceAvailability[] = [];
  for (const source of prefs.sources) {
    if (!source.enabled) continue;
    const name = audioSourceDisplayName(source);
    if (source.kind === 'local') {
      const file = source.folder ? await findLocalAudioFile(source.folder, identity.term, identity.reading) : null;
      out.push({ id: source.id, kind: source.kind, name, available: file ? 'yes' : 'no' });
      continue;
    }
    const cached = await remote(identity, { cacheOnly: true }).catch(() => null);
    out.push({
      id: source.id,
      kind: source.kind,
      name,
      available: cached?.status === 'ready' ? 'yes' : cached?.status === 'none' ? 'no' : 'unknown',
    });
  }
  return out;
}

/** Tests only. */
export function resetAudioSourcesForTests(): void {
  indexes.clear();
  answeredBy.clear();
}
