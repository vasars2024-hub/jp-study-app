// @vitest-environment node
/**
 * The reading loop's main-process half, driven through its IPC handlers:
 * Launch spawns a TRACKED game, starts capture and opens the reader; the
 * game's exit ends the session, books the playtime and queues study time for
 * the shared statistics. Before this, Launch was `shell.openPath` with no way
 * back, and the timer ran until Stop or app quit.
 */
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  root: '',
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  sent: [] as Array<{ channel: string; payload: unknown }>,
  clipboard: '',
  children: [] as Array<EventEmitter & { pid: number; unref: () => void }>,
  spawnCalls: [] as Array<{ command: string; args: string[] }>,
  readerOpened: [] as string[],
}));

vi.mock('electron', () => ({
  app: { getPath: () => fixture.root, once: vi.fn() },
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: { send: (channel: string, payload: unknown) => fixture.sent.push({ channel, payload }) },
    }],
  },
  clipboard: { readText: () => fixture.clipboard },
  dialog: {},
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => fixture.handlers.set(channel, fn) },
  shell: { openPath: vi.fn(async () => '') },
}));

vi.mock('node:child_process', () => ({
  spawn: (command: string, args: string[]) => {
    fixture.spawnCalls.push({ command, args });
    const child = Object.assign(new EventEmitter(), { pid: 9000 + fixture.children.length, unref: () => undefined });
    fixture.children.push(child);
    return child;
  },
  execFile: vi.fn(),
}));

vi.mock('../immersion/visualNovelReaderWindow', () => ({
  openVisualNovelReader: (id: string) => fixture.readerOpened.push(id),
  closeVisualNovelReader: vi.fn(),
  readerTarget: () => fixture.readerOpened[fixture.readerOpened.length - 1] ?? '',
  setReaderOpacity: vi.fn(),
}));

import { registerVisualNovelIpc } from '../immersion/visualNovels';

const invoke = (channel: string, ...args: unknown[]): Promise<any> => {
  const handler = fixture.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return Promise.resolve(handler({}, ...args));
};

let gameDir = '';

beforeEach(() => {
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), 'vn-launch-'));
  gameDir = path.join(fixture.root, 'games', 'SteinsGate');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'Steins;Gate.exe'), 'MZ');
  fixture.handlers.clear();
  fixture.sent.length = 0;
  fixture.children.length = 0;
  fixture.spawnCalls.length = 0;
  fixture.readerOpened.length = 0;
  fixture.clipboard = '';
  registerVisualNovelIpc();
});

afterEach(async () => {
  await invoke('visual-novel:captureStop').catch(() => undefined);
  vi.useRealTimers();
  // Only this test's temporary profile.
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

async function addNovel(): Promise<string> {
  const added = await invoke('visual-novel:add', {
    title: 'Steins;Gate',
    executablePath: path.join(gameDir, 'Steins;Gate.exe'),
  });
  expect(added.ok).toBe(true);
  return added.database.entries[0].id as string;
}

describe('Launch runs the reading loop and ends it with the game', () => {
  it('spawns the game as a tracked process, starts capture and opens the reader', async () => {
    const id = await addNovel();
    const launched = await invoke('visual-novel:launch', id);
    expect(launched.ok).toBe(true);
    expect(fixture.spawnCalls).toEqual([{ command: path.join(gameDir, 'Steins;Gate.exe'), args: [] }]);
    const capture = await invoke('visual-novel:captureState');
    expect(capture).toMatchObject({ active: true, visualNovelId: id, clipboard: 'listening', test: false });
    expect(fixture.readerOpened).toEqual([id]);
    const session = await invoke('visual-novel:sessionState', id);
    expect(session).toMatchObject({ visualNovelId: id, tracking: 'child' });
    expect(session.startedAt).toBeTypeOf('number');
  });

  it('stops the timer when the game exits, books the playtime and queues it for the study stats', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T20:00:00Z'));
    const id = await addNovel();
    await invoke('visual-novel:launch', id);
    // Forty minutes later the player closes the game.
    vi.setSystemTime(new Date('2026-09-24T20:40:00Z'));
    fixture.children[0].emit('exit', 0);

    const session = await invoke('visual-novel:sessionState', id);
    expect(session).toMatchObject({ startedAt: null, tracking: null });
    expect((await invoke('visual-novel:captureState')).active).toBe(false);
    const database = await invoke('visual-novel:list');
    expect(database.entries[0].totalPlaytimeSec).toBe(40 * 60);
    expect(fixture.sent.some((message) => message.channel === 'visual-novel:studyTime')).toBe(true);

    const drained = await invoke('visual-novel:drainStudyTime');
    expect(drained).toEqual([expect.objectContaining({ visualNovelId: id, title: 'Steins;Gate', seconds: 40 * 60 })]);
    // Drained exactly once, so two windows never record the same session.
    expect(await invoke('visual-novel:drainStudyTime')).toEqual([]);
  });

  it('saves clipboard lines with their speaker while the game runs', async () => {
    vi.useFakeTimers();
    const id = await addNovel();
    fixture.clipboard = 'copied before launch';
    await invoke('visual-novel:launch', id);
    fixture.clipboard = '紅莉栖「実験を始めよう。」';
    await vi.advanceTimersByTimeAsync(500);
    const database = await invoke('visual-novel:list');
    expect(database.captures).toEqual([
      expect.objectContaining({ visualNovelId: id, japanese: '実験を始めよう。', speaker: '紅莉栖', source: 'clipboard' }),
    ]);
  });

  it('launches through Locale Emulator when the user has set one', async () => {
    const id = await addNovel();
    await invoke('visual-novel:updateSettings', { localeEmulatorPath: 'D:/LE/LEProc.exe' });
    await invoke('visual-novel:launch', id);
    expect(fixture.spawnCalls[0]).toEqual({
      command: 'D:/LE/LEProc.exe',
      args: ['-run', path.join(gameDir, 'Steins;Gate.exe')],
    });
  });
});

describe('VNDB art goes through the vetted cache only', () => {
  it('refuses an image URL that neither the library nor a filtered search produced', async () => {
    const result = await invoke('visual-novel:art', 'https://t.vndb.org/sf/99/12345.jpg');
    expect(result.ok).toBe(false);
    const offHost = await invoke('visual-novel:art', 'https://example.com/a.jpg');
    expect(offHost.ok).toBe(false);
  });
});
