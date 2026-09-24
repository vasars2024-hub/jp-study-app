// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  FIND_GAME_MS,
  IDLE_TIMEOUT_MS,
  LAUNCHER_GRACE_MS,
  PROCESS_POLL_MS,
  candidateGameNames,
  launchCommand,
  parseTasklistCsv,
  trackGame,
  type GameTrackingMode,
} from '../immersion/visualNovelProcess';

function harness(running: () => Set<string>) {
  let now = 0;
  let nextHandle = 1;
  const intervals = new Map<number, () => void>();
  const spawned: Array<{ command: string; args: string[] }> = [];
  const child = new EventEmitter() as ChildProcess & EventEmitter;
  (child as { pid?: number }).pid = 4242;
  (child as { unref?: () => void }).unref = () => undefined;
  const exits: GameTrackingMode[] = [];
  const game = (launch: Parameters<typeof trackGame>[0]) => trackGame(launch, {
    spawn: (command, args) => {
      spawned.push({ command, args });
      return child;
    },
    listProcessNames: async () => running(),
    now: () => now,
    setInterval: (fn) => {
      const handle = nextHandle++;
      intervals.set(handle, fn);
      return handle;
    },
    clearInterval: (handle) => intervals.delete(handle as number),
  }, (mode) => exits.push(mode));
  return {
    child,
    spawned,
    exits,
    game,
    intervals,
    setNow: (value: number) => {
      now = value;
    },
    tick: async () => {
      for (const fn of [...intervals.values()]) fn();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

const launch = { executablePath: 'C:/Games/SG/Steins;Gate.exe', candidateNames: ['steins;gate.exe', 'game.exe'] };

describe('the running game is tracked, not assumed', () => {
  it('ends the session when the game process exits', () => {
    const h = harness(() => new Set());
    const game = h.game(launch);
    expect(game.pid).toBe(4242);
    expect(game.mode()).toBe('child');
    h.setNow(LAUNCHER_GRACE_MS + 60_000);
    h.child.emit('exit', 0);
    expect(h.exits).toEqual(['child']);
  });

  it('follows a launcher that exits at once to the real game, and ends when that closes', async () => {
    let running = new Set<string>(['game.exe']);
    const h = harness(() => running);
    const game = h.game(launch);
    h.setNow(3_000);
    h.child.emit('exit', 0);
    expect(game.mode()).toBe('process-name');
    expect(h.exits).toEqual([]);
    await h.tick();
    expect(h.exits).toEqual([]);
    running = new Set();
    h.setNow(3_000 + PROCESS_POLL_MS);
    await h.tick();
    expect(h.exits).toEqual(['process-name']);
    expect(h.intervals.size).toBe(0);
  });

  it('falls back to capture inactivity when the real game cannot be found', async () => {
    const h = harness(() => new Set(['explorer.exe']));
    const game = h.game(launch);
    h.setNow(2_000);
    h.child.emit('exit', 0);
    h.setNow(2_000 + FIND_GAME_MS + 1);
    await h.tick();
    expect(game.mode()).toBe('idle');
    h.setNow(2_000 + FIND_GAME_MS + IDLE_TIMEOUT_MS / 2);
    game.noteActivity();
    await h.tick();
    expect(h.exits).toEqual([]);
    h.setNow(2_000 + FIND_GAME_MS + IDLE_TIMEOUT_MS / 2 + IDLE_TIMEOUT_MS);
    await h.tick();
    expect(h.exits).toEqual(['idle']);
  });

  it('dispose stops watching without reporting an exit', () => {
    const h = harness(() => new Set());
    const game = h.game(launch);
    game.dispose();
    h.setNow(LAUNCHER_GRACE_MS * 2);
    h.child.emit('exit', 0);
    expect(h.exits).toEqual([]);
  });
});

describe('launch helpers', () => {
  it('starts through a user-installed Locale Emulator only when one is set', () => {
    expect(launchCommand(launch)).toEqual({ command: launch.executablePath, args: [] });
    expect(launchCommand({ ...launch, localeEmulatorPath: 'D:/Tools/LE/LEProc.exe' })).toEqual({
      command: 'D:/Tools/LE/LEProc.exe',
      args: ['-run', launch.executablePath],
    });
    // Anything that is not LEProc.exe is ignored rather than executed.
    expect(launchCommand({ ...launch, localeEmulatorPath: 'D:/evil.exe' }).command).toBe(launch.executablePath);
  });

  it('parses tasklist output and picks candidate game executables', () => {
    const names = parseTasklistCsv('"System Idle Process","0","Services","0","8 K"\r\n"Game.exe","123","Console","1","90,000 K"\r\n');
    expect(names.has('game.exe')).toBe(true);
    expect(names.has('system idle process')).toBe(true);
    expect(candidateGameNames('C:/g/launcher.exe', ['launcher.exe', 'bin/Game.exe', 'unins000.exe', 'LEProc.exe', 'data.xp3']))
      .toEqual(['launcher.exe', 'game.exe']);
  });
});
