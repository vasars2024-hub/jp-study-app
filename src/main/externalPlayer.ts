/**
 * External player profiles and the launcher — the main-process half.
 *
 * `<userData>/external-players.json` is the one list of players this app may
 * start. The renderer edits it through `externalPlayer:save` (the Settings
 * panel), and `media:handoff` looks the profile up **by id** here: the
 * executable path and arguments the renderer sends along with a launch are
 * ignored. So a launch can only ever start a program the user configured, never
 * a path smuggled in with the request.
 *
 * A spawn that fails — a player that was uninstalled, a path on a drive that is
 * not mounted — raises `error` on the child *asynchronously*. Without a
 * listener that is an uncaught exception in the main process, i.e. the whole
 * app going down because VLC moved. The launcher waits for `spawn` or `error`
 * and reports the latter to the caller instead.
 */

import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildExternalPlayerArguments,
  createEmptyExternalPlayerPreferences,
  normalizeExternalPlayerPreferences,
  type ExternalPlayerPreferences,
  type ExternalPlayerProfile,
  type PlaybackHandoff,
} from '../shared/externalPlayer';
import { mt } from './i18n';

const STORE_FILE = 'external-players.json';

const defaultStorePath = (): string => path.join(app.getPath('userData'), STORE_FILE);
let storePath: () => string = defaultStorePath;
type Spawner = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
let spawner: Spawner = nodeSpawn;

export function __setExternalPlayerDepsForTests(next: { store?: () => string; spawn?: Spawner } | null): void {
  storePath = next?.store ?? defaultStorePath;
  spawner = next?.spawn ?? nodeSpawn;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function readExternalPlayerPreferences(): ExternalPlayerPreferences {
  try {
    return normalizeExternalPlayerPreferences(JSON.parse(fs.readFileSync(storePath(), 'utf-8')));
  } catch {
    return createEmptyExternalPlayerPreferences();
  }
}

function writeExternalPlayerPreferences(preferences: ExternalPlayerPreferences): void {
  const target = storePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(preferences, null, 2), 'utf-8');
  fs.renameSync(temp, target);
}

function broadcast(preferences: ExternalPlayerPreferences): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('externalPlayer:changed', preferences);
  }
}

/** Script hosts are not players: on Windows a `.bat` would need a shell, which is the injection surface. */
const WINDOWS_EXECUTABLE = /\.(exe|com)$/i;

/** A macOS `.app` bundle is a directory; its binary is `Contents/MacOS/<name>`. */
function resolveBundle(executable: string): string {
  if (!/\.app\/?$/i.test(executable)) return executable;
  const macos = path.join(executable, 'Contents', 'MacOS');
  const named = path.join(macos, path.basename(executable).replace(/\.app\/?$/i, ''));
  if (fs.existsSync(named)) return named;
  try {
    const first = fs.readdirSync(macos).find((name) => fs.statSync(path.join(macos, name)).isFile());
    return first ? path.join(macos, first) : executable;
  } catch {
    return executable;
  }
}

export type ExternalPlayerPathProblem = 'not-absolute' | 'missing' | 'not-executable';

/** Why a profile's executable cannot be launched, or null when it can. */
export function externalPlayerPathProblem(executablePath: string, platform: NodeJS.Platform = process.platform): ExternalPlayerPathProblem | null {
  if (!executablePath || !path.isAbsolute(executablePath)) return 'not-absolute';
  const resolved = resolveBundle(executablePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return 'missing';
  }
  if (!stat.isFile()) return 'not-executable';
  if (platform === 'win32' && !WINDOWS_EXECUTABLE.test(resolved)) return 'not-executable';
  return null;
}

export interface ExternalPlayerSaveResult {
  preferences: ExternalPlayerPreferences;
  /** Profiles refused (not stored), by id, with the reason. */
  rejected: { id: string; problem: ExternalPlayerPathProblem }[];
}

/**
 * Stores the list the Settings panel edited. A profile whose executable is not
 * an existing absolute program path is refused, not stored — the launcher must
 * never be one save away from running a script or a missing path.
 */
export function saveExternalPlayerPreferencesMain(input: unknown): ExternalPlayerSaveResult {
  const next = normalizeExternalPlayerPreferences(input);
  const rejected: ExternalPlayerSaveResult['rejected'] = [];
  const profiles = next.profiles.filter((profile) => {
    const problem = externalPlayerPathProblem(profile.executablePath);
    if (problem) rejected.push({ id: profile.id, problem });
    return !problem;
  });
  const preferences = normalizeExternalPlayerPreferences({ ...next, profiles });
  writeExternalPlayerPreferences(preferences);
  broadcast(preferences);
  return { preferences, rejected };
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

function sanitizeHandoff(value: unknown): PlaybackHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r.mediaPath !== 'string' || !r.mediaPath.trim()) return null;
  return {
    mediaPath: r.mediaPath,
    title: typeof r.title === 'string' ? r.title.slice(0, 300) : path.basename(r.mediaPath),
    episodeNumber: typeof r.episodeNumber === 'number' && Number.isFinite(r.episodeNumber) ? r.episodeNumber : null,
    subtitlePath: typeof r.subtitlePath === 'string' && r.subtitlePath.trim() ? r.subtitlePath : null,
    audioPreference: typeof r.audioPreference === 'string' ? r.audioPreference : null,
    metadata: {},
    resumePositionSec: typeof r.resumePositionSec === 'number' && Number.isFinite(r.resumePositionSec) && r.resumePositionSec > 0
      ? r.resumePositionSec
      : null,
  };
}

function isExistingFile(file: string): boolean {
  try {
    return path.isAbsolute(file) && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Fills what the caller did not know: the library's own subtitle and resume point for this file. */
export type HandoffEnricher = (handoff: PlaybackHandoff) => PlaybackHandoff;

/**
 * Starts the configured player `profileRef.id` on `handoff.mediaPath`.
 * Resolves to null on success or a translated error message.
 */
export async function launchExternalPlayer(
  handoffInput: unknown,
  profileRef: unknown,
  enrich: HandoffEnricher = (handoff) => handoff,
): Promise<string | null> {
  const id = profileRef && typeof profileRef === 'object' && typeof (profileRef as { id?: unknown }).id === 'string'
    ? (profileRef as { id: string }).id
    : typeof profileRef === 'string' ? profileRef : '';
  const preferences = readExternalPlayerPreferences();
  const profile: ExternalPlayerProfile | undefined = preferences.profiles.find((entry) => entry.id === id);
  if (!profile) return mt('externalPlayer.error.notConfigured');

  let handoff = sanitizeHandoff(handoffInput);
  if (!handoff || !isExistingFile(handoff.mediaPath)) return mt('externalPlayer.error.mediaMissing');
  handoff = enrich(handoff);
  if (handoff.subtitlePath && !isExistingFile(handoff.subtitlePath)) handoff = { ...handoff, subtitlePath: null };

  const problem = externalPlayerPathProblem(profile.executablePath);
  if (problem) return mt(`externalPlayer.error.${problem}`, { name: profile.name, path: profile.executablePath });

  const args = buildExternalPlayerArguments(profile, handoff);
  let child: ChildProcess;
  try {
    child = spawner(resolveBundle(profile.executablePath), args, {
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: false,
    });
  } catch (error) {
    return mt('externalPlayer.error.launchFailed', { name: profile.name, detail: error instanceof Error ? error.message : String(error) });
  }
  // Kept for the life of the child: an `error` after `spawn` (rare, but a
  // kill() racing exit raises one) must not reach the process as uncaught.
  child.on('error', () => undefined);
  const outcome = await new Promise<string | null>((resolve) => {
    child.once('spawn', () => resolve(null));
    child.once('error', (error: NodeJS.ErrnoException) => resolve(
      error.code === 'ENOENT'
        ? mt('externalPlayer.error.missing', { name: profile.name, path: profile.executablePath })
        : mt('externalPlayer.error.launchFailed', { name: profile.name, detail: error.message }),
    ));
  });
  if (outcome !== null) return outcome;
  child.unref();
  if (preferences.lastUsedProfileId !== profile.id) {
    const next = { ...preferences, lastUsedProfileId: profile.id };
    try {
      writeExternalPlayerPreferences(next);
      broadcast(next);
    } catch {
      /* remembering the choice is a convenience; the player is already open */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

async function chooseExecutable(): Promise<string | null> {
  const owner = BrowserWindow.getFocusedWindow();
  const options: OpenDialogOptions = {
    title: mt('externalPlayer.chooseTitle'),
    properties: ['openFile'],
    filters: process.platform === 'win32'
      ? [{ name: mt('externalPlayer.filterPrograms'), extensions: ['exe', 'com'] }]
      : [],
  };
  const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
  return picked.canceled || !picked.filePaths[0] ? null : picked.filePaths[0];
}

/** `media:handoff` itself stays in `media.ts`, which knows the library the enricher reads. */
export function registerExternalPlayerIpc(): void {
  ipcMain.handle('externalPlayer:get', () => readExternalPlayerPreferences());
  ipcMain.handle('externalPlayer:save', (_event, input: unknown) => saveExternalPlayerPreferencesMain(input));
  ipcMain.handle('externalPlayer:chooseExecutable', () => chooseExecutable());
}
