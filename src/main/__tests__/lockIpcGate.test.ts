// @vitest-environment node
/**
 * lock3 — the lock at the IPC layer (main/lockIpcGate.ts).
 *
 *  1. STATIC: main.ts installs the gate before any handler is registered, right
 *     after the sender guard.
 *  2. THE WALK: every channel main registers (literal `ipcMain.handle/on(...)`
 *     names under src/main.ts and src/main/, plus every channel the preload
 *     bridge calls) is registered through a real gate on a fake `ipcMain`, the
 *     app is locked, and each one is invoked. A handler that is not on the
 *     reviewed open list must not run while locked; it runs after the unlock.
 *  3. HYGIENE: every open-list entry names a channel that exists, has a reason,
 *     and none of them is a data channel. A new `lockscreen:*` channel needs a
 *     review here before it can ride the prefix.
 *  4. BEHAVIOUR: held invokes resolve on unlock in order, a re-lock keeps them
 *     held, the cap rejects, a closed window's calls are dropped, and a `send`
 *     keeps only its latest message per window and channel (snapshot channels;
 *     every reply and ack is kept, in order).
 */
import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  HELD_DRAIN_CONCURRENCY,
  HELD_SLOT_RELEASE_MS,
  installIpcLockGate,
  ipcChannelOpenWhileLocked,
  IPC_LOCKED_MESSAGE,
  IPC_OPEN_WHILE_LOCKED,
  IPC_OPEN_WHILE_LOCKED_PREFIXES,
  ipcSendIsSnapshot,
  MAX_HELD_INVOKES,
  MAX_HELD_MESSAGES,
} from '../lockIpcGate';

const REPO = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue;
      sourceFiles(full, out);
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Literal channel names registered in main (the bulk of the ~800 handlers). */
function mainChannels(): Set<string> {
  const out = new Set<string>();
  for (const file of [resolve(REPO, 'src/main.ts'), ...sourceFiles(resolve(REPO, 'src/main'))]) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/ipcMain\.(?:handle|handleOnce|on|once)\(\s*['"`]([^'"`$]+)['"`]/g)) out.add(m[1]!);
  }
  return out;
}

/** Literal channel names the preload bridge calls: the whole renderer-reachable surface. */
function preloadChannels(): Set<string> {
  const out = new Set<string>();
  const src = read('src/preload.ts');
  for (const m of src.matchAll(/ipcRenderer\.(?:invoke|send|sendSync)\(\s*['"`]([^'"`$]+)['"`]/g)) out.add(m[1]!);
  return out;
}

class FakeIpc extends EventEmitter {
  handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
  handle(channel: string, fn: (e: unknown, ...a: unknown[]) => unknown) {
    this.handlers.set(channel, fn);
  }
  handleOnce(channel: string, fn: (e: unknown, ...a: unknown[]) => unknown) {
    this.handlers.set(channel, fn);
  }
}

function makeGate(opts: { log?: (m: string) => void } = {}) {
  const ipc = new FakeIpc();
  const state = { locked: false, deferred: new Map<string, () => void>() };
  const gate = installIpcLockGate(ipc as never, {
    isLocked: () => state.locked,
    deferUntilUnlocked: (key, fn) => {
      if (!state.locked) return false;
      state.deferred.set(key, fn);
      return true;
    },
    log: opts.log,
  });
  /** What lockGuard.release() does: run the deferred tasks once unlocked. */
  const unlock = () => {
    state.locked = false;
    const fns = [...state.deferred.values()];
    state.deferred.clear();
    for (const fn of fns) fn();
  };
  return { ipc, gate, state, unlock };
}

const sender = (id = 1, destroyed = false) => ({ sender: { id, isDestroyed: () => destroyed } });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('static: main.ts installs the IPC lock gate before any handler', () => {
  const main = read('src/main.ts');

  it('right after the sender guard, before the first handler registration', () => {
    const guard = main.indexOf('installIpcSenderGuard(ipcMain');
    const gate = main.indexOf('installIpcLockGate(ipcMain');
    expect(guard).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(guard);
    const firstHandle = main.search(/\n\s*ipcMain\.(handle|on)\(/);
    expect(firstHandle).toBeGreaterThan(gate);
    // Every `register*Ipc(` call in main.ts runs after the install line too.
    const firstRegister = main.search(/\n\s*register[A-Za-z]*Ipc\(/);
    expect(firstRegister).toBeGreaterThan(gate);
  });

  it('auto-lock is wired to main\'s record, and the app session denies clipboard reads while locked', () => {
    expect(main).toContain('installLockAutoArm({');
    expect(main).toContain('options: () => lockGate().autoLock()');
    expect(main).toMatch(/installPermissionPolicy\(session\.defaultSession, 'app', appOriginPolicy, onDenied, \{ isLocked: isAppLocked \}\)/);
  });
});

describe('the walk: every registered channel against the gate', () => {
  const registered = new Set([...mainChannels(), ...preloadChannels()]);

  it('sees the real surface (control)', () => {
    expect(mainChannels().size).toBeGreaterThan(500);
    expect(preloadChannels().size).toBeGreaterThan(500);
  });

  it('while locked, no handler outside the reviewed open list runs; all of them run after the unlock', async () => {
    const { ipc, gate, state, unlock } = makeGate();
    const ran: string[] = [];
    for (const channel of registered) {
      (ipc as unknown as { handle: FakeIpc['handle'] }).handle(channel, () => {
        ran.push(channel);
        return channel;
      });
    }
    expect(new Set(gate.registered())).toEqual(registered);
    state.locked = true;
    const answers = new Map<string, unknown>();
    const pending: Promise<void>[] = [];
    let refusedOutright = 0;
    for (const channel of registered) {
      let out: unknown;
      try {
        out = ipc.handlers.get(channel)!(sender());
      } catch (err) {
        // Past the held-call cap: refused with the lock error, never run.
        expect(String(err)).toContain(IPC_LOCKED_MESSAGE);
        refusedOutright += 1;
        continue;
      }
      if (out instanceof Promise) pending.push(out.then((v) => void answers.set(channel, v)));
      else answers.set(channel, out);
    }
    await tick();
    const ranWhileLocked = new Set(ran);
    const leaked = [...ranWhileLocked].filter((c) => !ipcChannelOpenWhileLocked(c));
    expect(leaked, 'handlers that ran for a renderer while locked').toEqual([]);
    // Everything held is still pending: nothing answered.
    const heldChannels = [...registered].filter((c) => !ipcChannelOpenWhileLocked(c));
    expect(heldChannels.length).toBeGreaterThan(500);
    for (const c of heldChannels.slice(0, 50)) expect(answers.has(c)).toBe(false);
    // The open list is small and every entry is used.
    expect(ranWhileLocked.size).toBeLessThan(60);
    // Unlock: the held calls run with their own answers. (The cap is 256, so only
    // the first 256 are held; the rest were refused outright, which is asserted below.)
    unlock();
    await Promise.allSettled(pending);
    const heldAndRun = heldChannels.filter((c) => answers.get(c) === c);
    expect(heldAndRun.length).toBe(Math.min(heldChannels.length, MAX_HELD_INVOKES));
    expect(refusedOutright).toBe(Math.max(0, heldChannels.length - MAX_HELD_INVOKES));
    // Nothing ran twice and nothing beyond the cap ran at all.
    expect(ran.length).toBe(ranWhileLocked.size + heldAndRun.length);
  });
});

describe('hygiene: the open list', () => {
  const live = new Set([...mainChannels(), ...preloadChannels()]);

  it('names only channels that exist, each with a reason', () => {
    for (const [channel, reason] of Object.entries(IPC_OPEN_WHILE_LOCKED)) {
      expect({ channel, exists: live.has(channel) }).toEqual({ channel, exists: true });
      expect({ channel, reason: reason.length > 20 }).toEqual({ channel, reason: true });
    }
    for (const [prefix, reason] of Object.entries(IPC_OPEN_WHILE_LOCKED_PREFIXES)) {
      expect([...live].some((c) => c.startsWith(prefix)), prefix).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('opens no channel that reads or writes study data', () => {
    const dataish = /(deck|library|dictionary|anki|book|note|history|clipboard|backup|profile|scrape|media|card|mine|export|import|read(?!y)|file)/i;
    const allowed = new Set(['recorder:host-chunk', 'captions:host-utterance', 'transcription:chunk-reply', 'diagnostics:logRendererError']);
    const offenders = Object.keys(IPC_OPEN_WHILE_LOCKED).filter((c) => dataish.test(c) && !allowed.has(c));
    expect(offenders).toEqual([]);
  });

  it('every lockscreen:* channel riding the prefix was reviewed here', () => {
    // Each enforces its own rule: reads of lock state, PIN / recovery checks on the
    // one persisted backoff, mutations that refuse while locked, the PIN widget.
    const reviewed = [
      'lockscreen:clearPin',
      'lockscreen:isLocked',
      'lockscreen:isOpen',
      'lockscreen:lock',
      'lockscreen:newRecoveryCode',
      'lockscreen:open',
      'lockscreen:recover',
      'lockscreen:setAutoLock',
      'lockscreen:setEnabled',
      'lockscreen:setPin',
      'lockscreen:setSize',
      'lockscreen:status',
      'lockscreen:syncConfig',
      'lockscreen:unlock',
      'lockscreen:verifyPin',
    ];
    const found = [...live].filter((c) => c.startsWith('lockscreen:')).sort();
    expect(found).toEqual(reviewed);
    // No hash-a-PIN-for-me oracle any more: setPin hashes in main.
    expect(found).not.toContain('lockscreen:hashPin');
  });
});

describe('behaviour', () => {
  it('a held invoke answers on unlock with the handler run THEN, in call order', async () => {
    const { ipc, state, unlock } = makeGate();
    let value = 'before';
    const order: string[] = [];
    ipc.handle('library:list', () => {
      order.push('list');
      return value;
    });
    ipc.handle('deck:save', (_e, n: unknown) => {
      order.push(`save${n}`);
      return n;
    });
    state.locked = true;
    const a = ipc.handlers.get('library:list')!(sender()) as Promise<unknown>;
    const b = ipc.handlers.get('deck:save')!(sender(), 7) as Promise<unknown>;
    await tick();
    expect(order).toEqual([]);
    value = 'after';
    unlock();
    await expect(a).resolves.toBe('after');
    await expect(b).resolves.toBe(7);
    expect(order).toEqual(['list', 'save7']);
    // Unlocked: straight through, synchronously.
    expect(ipc.handlers.get('library:list')!(sender())).toBe('after');
  });

  it('a re-lock before the deferred flush keeps holding', async () => {
    const { ipc, state, gate } = makeGate();
    const fn = vi.fn(() => 1);
    ipc.handle('library:list', fn);
    state.locked = true;
    const p = ipc.handlers.get('library:list')!(sender()) as Promise<unknown>;
    // The flush runs while still locked (re-locked meanwhile).
    const deferred = [...state.deferred.values()];
    state.deferred.clear();
    for (const d of deferred) d();
    expect(fn).not.toHaveBeenCalled();
    expect(gate.heldInvokes()).toBe(1);
    expect(state.deferred.size).toBe(1); // scheduled again
    state.locked = false;
    gate.flush();
    await expect(p).resolves.toBe(1);
  });

  it('past the cap a call is refused outright, and a closed window\'s calls are dropped', async () => {
    const { ipc, state, unlock } = makeGate();
    const fn = vi.fn(() => 'x');
    ipc.handle('library:list', fn);
    state.locked = true;
    const held: Promise<unknown>[] = [];
    for (let i = 0; i < MAX_HELD_INVOKES; i += 1) held.push(ipc.handlers.get('library:list')!(sender()) as Promise<unknown>);
    expect(() => ipc.handlers.get('library:list')!(sender())).toThrow(IPC_LOCKED_MESSAGE);
    const gone = ipc.handlers.get('library:list')!; // cap reached: still refused
    expect(() => gone(sender(2, true))).toThrow();
    unlock();
    await Promise.all(held);
    expect(fn).toHaveBeenCalledTimes(MAX_HELD_INVOKES);
  });

  it('a held call from a window closed before the unlock is rejected, not run', async () => {
    const { ipc, state, unlock } = makeGate();
    const fn = vi.fn(() => 'x');
    ipc.handle('library:list', fn);
    state.locked = true;
    let destroyed = false;
    const p = ipc.handlers.get('library:list')!({ sender: { id: 3, isDestroyed: () => destroyed } }) as Promise<unknown>;
    destroyed = true;
    unlock();
    await expect(p).rejects.toThrow(IPC_LOCKED_MESSAGE);
    expect(fn).not.toHaveBeenCalled();
  });

  it('a send keeps its latest message per window and channel, delivered on unlock', () => {
    const { ipc, state, unlock } = makeGate();
    const got: unknown[] = [];
    ipc.on('player:publish', (_e: unknown, snap: unknown) => void got.push(snap));
    state.locked = true;
    ipc.emit('player:publish', sender(1), 'a');
    ipc.emit('player:publish', sender(1), 'b');
    ipc.emit('player:publish', sender(2), 'c');
    expect(got).toEqual([]);
    unlock();
    expect(got).toEqual(['b', 'c']);
  });

  it('a reply or an ack is not a snapshot: every one is kept, in order, and delivered on unlock', () => {
    const { ipc, state, gate, unlock } = makeGate();
    const got: string[] = [];
    ipc.on('extension:annotate-reply', (_e: unknown, p: { id: number }) => void got.push(`reply ${p.id}`));
    ipc.on('extension:mined-ack', (_e: unknown, p: { mineId: number }) => void got.push(`ack ${p.mineId}`));
    ipc.on('player:publish', (_e: unknown, snap: string) => void got.push(`snap ${snap}`));
    state.locked = true;
    ipc.emit('extension:annotate-reply', sender(1), { id: 1 });
    ipc.emit('player:publish', sender(1), 'old');
    ipc.emit('extension:annotate-reply', sender(1), { id: 2 });
    ipc.emit('extension:mined-ack', sender(1), { mineId: 7 });
    ipc.emit('extension:mined-ack', sender(1), { mineId: 8 });
    ipc.emit('player:publish', sender(1), 'new');
    ipc.emit('extension:annotate-reply', sender(1), { id: 3 });
    expect(got).toEqual([]);
    // Two snapshots collapsed into one; five replies/acks kept.
    expect(gate.heldMessages()).toBe(6);
    unlock();
    expect(got).toEqual(['reply 1', 'reply 2', 'ack 7', 'ack 8', 'snap new', 'reply 3']);
    expect(gate.heldMessages()).toBe(0);
  });

  it('latest wins only on snapshot channels', () => {
    for (const ch of [
      'extension:annotate-reply',
      'extension:known-levels-reply',
      'extension:known-snapshot-reply',
      'extension:mined-ack',
      'recorder:model-check-reply',
      'recorder:open-in-player-reply',
      'recorder:study-tag-reply',
      'captions:mine-reply',
      'captions:host-reply',
      'transcription:chunk-reply',
    ]) {
      expect(ipcSendIsSnapshot(ch), ch).toBe(false);
    }
    for (const ch of ['player:publish', 'companionHost:pushState', 'lens:setInteractive', 'studyblock:publish', 'unsavedWork:report', 'buddyScheduler:sync']) {
      expect(ipcSendIsSnapshot(ch), ch).toBe(true);
    }
    // Every literal `ipcMain.on` channel in main that answers or acknowledges is held in full.
    const onChannels = new Set<string>();
    for (const file of [resolve(REPO, 'src/main.ts'), ...sourceFiles(resolve(REPO, 'src/main'))]) {
      for (const m of readFileSync(file, 'utf8').matchAll(/ipcMain\.(?:on|once)\(\s*['"`]([^'"`$]+)['"`]/g)) onChannels.add(m[1]!);
    }
    const answering = [...onChannels].filter((ch) => /(?:reply|ack)$/i.test(ch));
    expect(answering.length).toBeGreaterThanOrEqual(5);
    for (const ch of answering) expect(ipcSendIsSnapshot(ch), ch).toBe(false);
  });

  it('the cap counts held replies too', () => {
    const { ipc, state, gate, unlock } = makeGate();
    const got: number[] = [];
    ipc.on('extension:annotate-reply', (_e: unknown, id: number) => void got.push(id));
    state.locked = true;
    for (let i = 0; i < MAX_HELD_MESSAGES + 5; i += 1) ipc.emit('extension:annotate-reply', sender(1), i);
    expect(gate.heldMessages()).toBe(MAX_HELD_MESSAGES);
    unlock();
    expect(got).toEqual(Array.from({ length: MAX_HELD_MESSAGES }, (_, i) => i));
  });

  it('caps held sends, and passes the open plumbing channels straight through', () => {
    const { ipc, state } = makeGate();
    const got: unknown[] = [];
    ipc.on('recorder:host-chunk', (_e: unknown, seq: unknown) => void got.push(seq));
    state.locked = true;
    ipc.emit('recorder:host-chunk', sender(), 1);
    ipc.emit('recorder:host-chunk', sender(), 2);
    expect(got).toEqual([1, 2]); // a recording already running keeps every chunk
    const { ipc: ipc2, state: s2, gate: g2 } = makeGate();
    ipc2.on('player:publish', () => undefined);
    s2.locked = true;
    for (let i = 0; i < MAX_HELD_MESSAGES + 10; i += 1) ipc2.emit('player:publish', sender(i), i);
    expect(g2.heldMessages()).toBe(MAX_HELD_MESSAGES);
  });

  it('removeListener still finds a wrapped listener', () => {
    const { ipc } = makeGate();
    const listener = vi.fn();
    ipc.on('desk:drag', listener);
    ipc.removeListener('desk:drag', listener);
    expect(ipc.listenerCount('desk:drag')).toBe(0);
  });

  it('logs each refused channel once per lock, for the diagnostics log', () => {
    const lines: string[] = [];
    const { ipc, state, gate, unlock } = makeGate({ log: (m) => lines.push(m) });
    ipc.handle('library:list', () => 1);
    state.locked = true;
    void ipc.handlers.get('library:list')!(sender());
    void ipc.handlers.get('library:list')!(sender());
    expect(lines.filter((l) => l.includes('held ipc library:list'))).toHaveLength(1);
    expect(gate.refusedSinceUnlock()).toEqual(['library:list']);
    unlock();
    expect(gate.refusedSinceUnlock()).toEqual([]);
  });
});

describe('lock4: the drain after an unlock', () => {
  /** A handler that stays pending until the test settles it. */
  function deferredHandler() {
    const started: number[] = [];
    const settle = new Map<number, (v: unknown) => void>();
    const fn = (_e: unknown, n: unknown) => {
      started.push(n as number);
      return new Promise((resolve) => settle.set(n as number, resolve));
    };
    return { fn, started, settle };
  }

  it('runs held invokes in call order, at most HELD_DRAIN_CONCURRENCY at a time', async () => {
    const { ipc, state, gate, unlock } = makeGate();
    const h = deferredHandler();
    ipc.handle('deck:load', h.fn);
    state.locked = true;
    const calls = Array.from({ length: 10 }, (_, i) => ipc.handlers.get('deck:load')!(sender(), i) as Promise<unknown>);
    unlock();
    expect(h.started).toEqual([0, 1, 2, 3].slice(0, HELD_DRAIN_CONCURRENCY));
    expect(gate.heldInvokes()).toBe(10 - HELD_DRAIN_CONCURRENCY);
    // One settles: exactly one more starts, the next in line.
    h.settle.get(1)!('one');
    await tick();
    expect(h.started).toEqual([0, 1, 2, 3, 4]);
    // Settle everything as it starts; every caller gets its own answer, in order.
    for (let round = 0; round < 10; round += 1) {
      for (const n of [...h.started]) h.settle.get(n)?.(`r${n}`);
      await tick();
    }
    expect(h.started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await expect(Promise.all(calls)).resolves.toEqual(['r0', 'one', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9']);
    expect(gate.heldInvokes()).toBe(0);
  });

  it('a send is delivered in its place in line, and a superseded duplicate is dropped', async () => {
    const { ipc, state, unlock } = makeGate();
    const order: string[] = [];
    const h = deferredHandler();
    ipc.handle('deck:load', (e, n) => {
      order.push(`invoke${n as number}`);
      return h.fn(e, n);
    });
    ipc.on('player:publish', (_e: unknown, snap: unknown) => void order.push(`send:${String(snap)}`));
    state.locked = true;
    const calls: Promise<unknown>[] = [];
    for (let i = 0; i < HELD_DRAIN_CONCURRENCY; i += 1) calls.push(ipc.handlers.get('deck:load')!(sender(), i) as Promise<unknown>);
    ipc.emit('player:publish', sender(1), 'old');
    calls.push(ipc.handlers.get('deck:load')!(sender(), 99) as Promise<unknown>);
    ipc.emit('player:publish', sender(1), 'new'); // supersedes 'old': only this one is delivered
    unlock();
    // The slots are full, so nothing behind invoke 3 has run yet.
    expect(order).toEqual(['invoke0', 'invoke1', 'invoke2', 'invoke3']);
    h.settle.get(0)!(0);
    await tick();
    expect(order).toEqual(['invoke0', 'invoke1', 'invoke2', 'invoke3', 'invoke99', 'send:new']);
    for (const n of [1, 2, 3, 99]) h.settle.get(n)!(n);
    await Promise.all(calls);
  });

  it('a call made after the unlock waits behind the held ones instead of overtaking them', async () => {
    const { ipc, state, unlock } = makeGate();
    const h = deferredHandler();
    ipc.handle('deck:load', h.fn);
    state.locked = true;
    for (let i = 0; i < HELD_DRAIN_CONCURRENCY + 2; i += 1) void ipc.handlers.get('deck:load')!(sender(), i);
    unlock();
    const late = ipc.handlers.get('deck:load')!(sender(), 50);
    expect(late).toBeInstanceOf(Promise);
    expect(h.started).not.toContain(50);
    for (let round = 0; round < 6; round += 1) {
      for (const n of [...h.started]) h.settle.get(n)?.(n);
      await tick();
    }
    expect(h.started.at(-1)).toBe(50);
    await expect(late).resolves.toBe(50);
    // Line empty again: straight through, synchronously.
    expect(ipc.handlers.get('deck:load')!(sender(), 7)).toBeInstanceOf(Promise);
    expect(h.started.at(-1)).toBe(7);
  });

  it('a handler that never settles gives its slot up, so the line keeps moving', async () => {
    vi.useFakeTimers();
    try {
      const { ipc, state, unlock } = makeGate();
      const h = deferredHandler();
      ipc.handle('deck:load', h.fn);
      state.locked = true;
      for (let i = 0; i < HELD_DRAIN_CONCURRENCY + 1; i += 1) void ipc.handlers.get('deck:load')!(sender(), i);
      unlock();
      expect(h.started).toHaveLength(HELD_DRAIN_CONCURRENCY);
      await vi.advanceTimersByTimeAsync(HELD_SLOT_RELEASE_MS + 10);
      expect(h.started).toHaveLength(HELD_DRAIN_CONCURRENCY + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a re-lock in the middle of the drain stops it; the rest waits for the next unlock', async () => {
    const { ipc, state, gate, unlock } = makeGate();
    const h = deferredHandler();
    ipc.handle('deck:load', h.fn);
    state.locked = true;
    for (let i = 0; i < HELD_DRAIN_CONCURRENCY + 3; i += 1) void ipc.handlers.get('deck:load')!(sender(), i);
    unlock();
    expect(h.started).toHaveLength(HELD_DRAIN_CONCURRENCY);
    state.locked = true;
    h.settle.get(0)!(0);
    await tick();
    expect(h.started).toHaveLength(HELD_DRAIN_CONCURRENCY); // locked again: nothing new starts
    expect(gate.heldInvokes()).toBe(3);
    expect(state.deferred.size).toBe(1);
    unlock();
    expect(h.started).toHaveLength(HELD_DRAIN_CONCURRENCY + 1);
  });
});
