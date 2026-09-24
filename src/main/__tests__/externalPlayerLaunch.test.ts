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

vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
}));

import {
  __setExternalPlayerDepsForTests,
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

function fakeSpawn(command: string, args: readonly string[]) {
  calls.push({ command, args });
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

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-extplayer-'));
  player = path.join(dir, process.platform === 'win32' ? 'vlc.exe' : 'vlc');
  media = path.join(dir, 'show.mkv');
  fs.writeFileSync(player, '');
  fs.writeFileSync(media, '');
  calls = [];
  behaviour = 'spawn';
  __setExternalPlayerDepsForTests({ store: () => path.join(dir, 'external-players.json'), spawn: fakeSpawn });
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
});
