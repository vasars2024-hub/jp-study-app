// @vitest-environment jsdom
//
// The dead-transport state, driven through the real `playerBus` singleton.
//
// Measured live on 2026-09-04: `player:getSnapshot` handed window 1 a snapshot whose
// `sourceId` was 3, a window that had already closed. `applySnapshot` set
// `remoteLeaderId = 3`, so `isLeader()` was false forever and every transport call took
// the `delegate` branch — a `player:command` broadcast that main forwards to every OTHER
// window, i.e. to nobody. The Music widget showed the title, `0:20 / 1:30` and a Pause
// icon while play, next, previous and seek all reached no one at all.
//
// The first two cases here reproduce that dead state, so the last two cannot pass by
// accident: a test that only asserts the repaired behaviour would also pass against a bus
// that never delegates anything.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { releasePlayerLeadership, type PlayerSnapshot } from '../../shared/playerSync';

type SyncHandler = (snap: PlayerSnapshot) => void;

const syncHandlers: SyncHandler[] = [];
const sentCommands: unknown[] = [];
const opened: string[] = [];

const TRACK = { id: 'm1', fileName: 'e2e-audio-ja.m4a' } as PlayerSnapshot['current'];

const leaderSnapshot = (): PlayerSnapshot => ({
  sourceId: 3,
  trackToken: 7,
  current: TRACK,
  playing: true,
  time: 20.7,
  duration: 90,
  volume: 1,
  shuffle: false,
  repeat: 'off',
  mediaUrl: 'media://gone/',
});

vi.stubGlobal('window', window);
Object.defineProperty(window, 'api', {
  configurable: true,
  value: {
    // This window is 1. The snapshot below names 3, which no longer exists.
    playerWindowId: (): Promise<number> => Promise.resolve(1),
    playerGetSnapshot: (): Promise<PlayerSnapshot | null> => Promise.resolve(null),
    playerPublish: (): void => undefined,
    playerSendCommand: (cmd: unknown): void => {
      sentCommands.push(cmd);
    },
    onPlayerSync: (cb: SyncHandler): (() => void) => {
      syncHandlers.push(cb);
      return () => undefined;
    },
    onPlayerCommand: (): (() => void) => () => undefined,
    openMedia: (id: string): Promise<null> => {
      opened.push(id);
      // A null return is the "file could not be opened" branch, which ends the call
      // without touching any browser API jsdom lacks. What this test asserts is that the
      // press REACHED main at all — the delegate branch never did.
      return Promise.resolve(null);
    },
    setMediaPosition: (): Promise<void> => Promise.resolve(),
  },
});

const bus = await import('../playerBus');

const pushSync = (snap: PlayerSnapshot): void => {
  for (const h of syncHandlers) h(snap);
};

describe('a player whose leader window closed', () => {
  beforeEach(() => {
    sentCommands.length = 0;
    opened.length = 0;
  });

  it('mirrors the departed leader and reports it as playing', () => {
    pushSync(leaderSnapshot());
    const s = bus.getState();
    expect(s.current?.id).toBe('m1');
    expect(s.playing).toBe(true);
  });

  it('DELEGATES the transport to a window that is gone — the defect', () => {
    pushSync(leaderSnapshot());
    bus.toggle();
    bus.next();
    // Three presses, three commands posted to a dead leader, and nothing opened here.
    bus.prev();
    expect(sentCommands).toHaveLength(3);
    expect(opened).toHaveLength(0);
  });

  it('takes leadership back when main releases the snapshot', () => {
    pushSync(leaderSnapshot());
    const released = releasePlayerLeadership(leaderSnapshot(), [1]);
    expect(released).not.toBeNull();
    pushSync(released!);
    const s = bus.getState();
    // The track survives so the user does not lose their place; the lie does not.
    expect(s.current?.id).toBe('m1');
    expect(s.playing).toBe(false);
  });

  it('makes Play reach the media again instead of a closed window', () => {
    pushSync(leaderSnapshot());
    pushSync(releasePlayerLeadership(leaderSnapshot(), [1])!);
    bus.toggle();
    expect(sentCommands).toHaveLength(0);
    expect(opened).toEqual(['m1']);
  });
});
