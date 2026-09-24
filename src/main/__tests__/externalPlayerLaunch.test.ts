// @vitest-environment node
//
// `media:handoff` — the launcher only starts a saved profile (looked up by id,
// never the path in the request), survives a player that is not on disk, and
// remembers the player last used.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const picked = vi.hoisted(() => ({ file: null as string | null }));

vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
  // The main-process "choose a program" dialog; `picked.file` is what the user picks.
  dialog: { showOpenDialog: async () => (picked.file ? { canceled: false, filePaths: [picked.file] } : { canceled: true, filePaths: [] }) },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
}));

import {
  __setExternalPlayerDepsForTests,
  chooseExternalPlayerExecutable,
  externalPlayerPathProblem,
  launchExternalPlayer,
  readExternalPlayerPreferences,
  saveExternalPlayerPreferencesMain,
} from '../externalPlayer';
import type { ExternalPlayerProfile, PlaybackHandoff } from '../../shared/externalPlayer';

let dir: string;
let player: string;
let media: string;
let calls: { command: string; args: readonly string[] }[];
/** What the fake child does after spawn() returns: emit `spawn`, or `error`. */
let behaviour: 'spawn' | 'enoent';

let spawnOptions: unknown[] = [];

function fakeSpawn(command: string, args: readonly string[], options?: unknown) {
  calls.push({ command, args });
  spawnOptions.push(options);
  const child = new EventEmitter() as EventEmitter & { unref: () => void };
  child.unref = () => undefined;
  setTimeout(() => {
    if (behaviour === 'spawn') child.emit('spawn');
    else child.emit('error', Object.assign(new Error(`spawn ${command} ENOENT`), { code: 'ENOENT' }));
  }, 0);
  return child as never;
}

const profile = (over: Partial<ExternalPlayerProfile> = {}): ExternalPlayerProfile => ({
  id: 'vlc',
  name: 'VLC',
  executablePath: player,
  os: 'all',
  contentType: 'video',
  arguments: ['{media}', '--start-time={position}', '--sub-file={subtitle}'],
  supportsSubtitles: true,
  supportsResume: true,
  ...over,
});

const handoff = (over: Partial<PlaybackHandoff> = {}): PlaybackHandoff => ({
  mediaPath: media,
  title: 'Episode 1',
  episodeNumber: 1,
  subtitlePath: null,
  audioPreference: null,
  metadata: {},
  resumePositionSec: 125.7,
  ...over,
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extplayer-'));
  player = path.join(dir, process.platform === 'win32' ? 'vlc.exe' : 'vlc');
  media = path.join(dir, 'show.mkv');
  fs.writeFileSync(player, '');
  fs.writeFileSync(media, '');
  calls = [];
  spawnOptions = [];
  behaviour = 'spawn';
  __setExternalPlayerDepsForTests({
    store: () => path.join(dir, 'external-players.json'),
    trust: () => path.join(dir, 'external-player-trust.json'),
    spawn: fakeSpawn,
  });
  // The user picks the player in the app's own dialog, which confirms it.
  picked.file = player;
  expect(await chooseExternalPlayerExecutable()).toBe(player);
  picked.file = null;
});

afterEach(() => {
  __setExternalPlayerDepsForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('external player launcher', () => {
  it('launches the saved profile with position and subtitle, and remembers it', async () => {
    const subtitle = path.join(dir, 'show.ja.srt');
    fs.writeFileSync(subtitle, '1');
    saveExternalPlayerPreferencesMain({ profiles: [profile()], defaultProfileId: 'vlc' });
    const error = await launchExternalPlayer(handoff({ subtitlePath: subtitle }), { id: 'vlc' });
    expect(error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([media, '--start-time=125', `--sub-file=${subtitle}`]);
    expect(readExternalPlayerPreferences().lastUsedProfileId).toBe('vlc');
  });

  it('ignores the executable path that arrives with the request', async () => {
    saveExternalPlayerPreferencesMain({ profiles: [profile()] });
    await launchExternalPlayer(handoff(), { ...profile(), executablePath: 'C:/Windows/System32/cmd.exe', arguments: ['/c', 'calc'] });
    expect(calls[0].command).toBe(player);
    expect(calls[0].args).not.toContain('/c');
  });

  it('refuses a profile id that is not configured, without spawning', async () => {
    const error = await launchExternalPlayer(handoff(), profile({ id: 'rogue', executablePath: player }));
    expect(error).toMatch(/not set up/);
    expect(calls).toHaveLength(0);
  });

  it('reports a player that vanished instead of crashing on the error event', async () => {
    saveExternalPlayerPreferencesMain({ profiles: [profile()] });
    behaviour = 'enoent';
    const error = await launchExternalPlayer(handoff(), { id: 'vlc' });
    expect(error).toMatch(/was not found/);
    fs.rmSync(player);
    calls = [];
    const again = await launchExternalPlayer(handoff(), { id: 'vlc' });
    expect(again).toMatch(/was not found/);
    expect(calls, 'a missing program is caught before spawn').toHaveLength(0);
  });

  it('drops placeholder arguments that have no value and refuses scripts on save', async () => {
    saveExternalPlayerPreferencesMain({ profiles: [profile({ supportsResume: false })] });
    await launchExternalPlayer(handoff({ resumePositionSec: null }), { id: 'vlc' });
    expect(calls[0].args).toEqual([media]);
    const script = path.join(dir, 'run.bat');
    fs.writeFileSync(script, '');
    if (process.platform === 'win32') {
      const saved = saveExternalPlayerPreferencesMain({ profiles: [profile({ id: 'bat', executablePath: script })] });
      expect(saved.rejected).toEqual([{ id: 'bat', problem: 'not-executable' }]);
      expect(saved.preferences.profiles).toHaveLength(0);
    }
    expect(externalPlayerPathProblem('relative/vlc.exe')).toBe('not-absolute');
    expect(externalPlayerPathProblem(path.join(dir, 'nope.exe'))).toBe('missing');
  });

  it('refuses a media file that does not exist', async () => {
    saveExternalPlayerPreferencesMain({ profiles: [profile()] });
    const error = await launchExternalPlayer(handoff({ mediaPath: path.join(dir, 'gone.mkv') }), { id: 'vlc' });
    expect(error).toMatch(/not on disk/);
    expect(calls).toHaveLength(0);
  });

  it('spawns without a shell', async () => {
    saveExternalPlayerPreferencesMain({ profiles: [profile()] });
    await launchExternalPlayer(handoff(), { id: 'vlc' });
    expect(spawnOptions[0]).toMatchObject({ shell: false });
  });
});

describe('only programs the user picked in the app can be stored or started', () => {
  it('refuses a path the renderer saved without the dialog', async () => {
    const other = path.join(dir, process.platform === 'win32' ? 'other.exe' : 'other');
    fs.writeFileSync(other, '');
    const saved = saveExternalPlayerPreferencesMain({ profiles: [profile({ id: 'sneaky', executablePath: other })] });
    expect(saved.rejected).toEqual([{ id: 'sneaky', problem: 'not-confirmed' }]);
    expect(saved.preferences.profiles).toHaveLength(0);
  });

  it('refuses a stored profile whose program was never confirmed, at launch', async () => {
    const other = path.join(dir, process.platform === 'win32' ? 'other.exe' : 'other');
    fs.writeFileSync(other, '');
    // Written straight to the store, as a compromised renderer's save would.
    fs.writeFileSync(path.join(dir, 'external-players.json'), JSON.stringify({ profiles: [profile({ id: 'sneaky', executablePath: other })] }));
    const error = await launchExternalPlayer(handoff(), { id: 'sneaky' });
    expect(error).toMatch(/Browse/);
    expect(calls).toHaveLength(0);
  });

  it('refuses script hosts and network paths even when picked in the dialog', async () => {
    const shells = ['cmd.exe', 'powershell.exe', 'pwsh.exe', 'wscript.exe', 'cscript.exe', 'mshta.exe', 'rundll32.exe', 'regsvr32.exe'];
    for (const name of shells) {
      const file = path.join(dir, name);
      fs.writeFileSync(file, '');
      expect(externalPlayerPathProblem(file), name).toBe('interpreter');
      picked.file = file;
      await chooseExternalPlayerExecutable();
      const saved = saveExternalPlayerPreferencesMain({ profiles: [profile({ id: name, executablePath: file })] });
      expect(saved.rejected[0]?.problem, name).toBe('interpreter');
    }
    expect(externalPlayerPathProblem(String.raw`\\server\share\vlc.exe`, 'win32')).toBe('network');
    expect(externalPlayerPathProblem('//server/share/vlc.exe', 'win32')).toBe('network');
  });

  it('keeps players configured before this version working (carried over once)', async () => {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extplayer-legacy-'));
    try {
      const legacyPlayer = path.join(legacyDir, process.platform === 'win32' ? 'mpv.exe' : 'mpv');
      fs.writeFileSync(legacyPlayer, '');
      fs.writeFileSync(path.join(legacyDir, 'external-players.json'), JSON.stringify({ profiles: [profile({ id: 'mpv', executablePath: legacyPlayer })] }));
      __setExternalPlayerDepsForTests({
        store: () => path.join(legacyDir, 'external-players.json'),
        trust: () => path.join(legacyDir, 'external-player-trust.json'),
        spawn: fakeSpawn,
      });
      expect(await launchExternalPlayer(handoff(), { id: 'mpv' })).toBeNull();
      expect(calls[0].command).toBe(legacyPlayer);
    } finally {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
  });
});
