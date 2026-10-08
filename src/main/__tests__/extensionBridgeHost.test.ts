// @vitest-environment node
/**
 * One window answers the extension, and a mine survives until it is acked.
 *
 * Main used to send every extension request to every window; each Study OS
 * pop-out (and Blanc) runs the same bridges, so a mined word was added to the
 * deck once per window and Whisper ran once per window. A mine sent while no
 * window was open was lost although `/v1/mine` reported it saved.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-exthost-'));

type Listener = (event: unknown, payload?: unknown) => void;

interface FakeWin {
  name: string;
  destroyed: boolean;
  onTop: boolean;
  webContents: { send: (channel: string, payload: unknown) => void; isDestroyed: () => boolean };
  isDestroyed: () => boolean;
  isAlwaysOnTop: () => boolean;
}

const h = vi.hoisted(() => ({
  sent: [] as Array<{ win: string; channel: string; payload: Record<string, unknown> }>,
  listeners: new Map<string, (event: unknown, payload?: unknown) => void>(),
  windows: [] as unknown[],
  /** Ack every `extension:mined` a window receives, as the renderer would. */
  autoAck: false,
}));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: {
    handle: () => undefined,
    on: (channel: string, fn: (event: unknown, payload?: unknown) => void) => {
      h.listeners.set(channel, fn);
    },
  },
  BrowserWindow: { getAllWindows: () => h.windows },
}));

type Mod = typeof import('../extensionBridgeHost');
let mod: Mod;

function makeWin(name: string, opts: { onTop?: boolean } = {}): FakeWin {
  const win: FakeWin = {
    name,
    destroyed: false,
    onTop: !!opts.onTop,
    webContents: {
      send: (channel, payload) => {
        h.sent.push({ win: name, channel, payload: payload as Record<string, unknown> });
        if (h.autoAck && channel === 'extension:mined') {
          const mineId = (payload as { mineId?: string }).mineId;
          setTimeout(() => emit('extension:mined-ack', { sender: win.webContents }, { mineId, ok: true }), 1);
        }
      },
      isDestroyed: () => win.destroyed,
    },
    isDestroyed: () => win.destroyed,
    isAlwaysOnTop: () => win.onTop,
  };
  return win;
}

function emit(channel: string, event: unknown, payload?: unknown): void {
  const fn = h.listeners.get(channel) as Listener | undefined;
  if (!fn) throw new Error(`no listener for ${channel}`);
  fn(event, payload);
}

function storePath(): string {
  return path.join(tmpRoot, 'extension-pending-mines.json');
}

function readStore(): Array<{ mineId: string; payload: Record<string, unknown>; sidecar?: boolean }> {
  return JSON.parse(fs.readFileSync(storePath(), 'utf8'));
}

const mined = <T extends { channel: string }>(sent: T[]): T[] => sent.filter((e) => e.channel === 'extension:mined');

beforeAll(async () => {
  mod = await import('../extensionBridgeHost');
  mod.registerExtensionBridgeHostIpc();
  mod.registerExtensionBridgeHostIpc(); // idempotent
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  mod.__resetExtensionBridgeHostForTests();
  for (const name of fs.readdirSync(tmpRoot)) fs.rmSync(path.join(tmpRoot, name), { recursive: true, force: true });
  h.sent.length = 0;
  h.windows.length = 0;
  h.autoAck = false;
});

describe('host window', () => {
  it('sends a mine only to the host window, not to pop-outs', async () => {
    const main = makeWin('main');
    const popout = makeWin('popout');
    h.windows.push(popout, main);
    mod.setExtensionBridgeHostResolver(() => main as never);
    h.autoAck = true;
    const result = await mod.deliverMined({ term: '猫', text: '猫' });
    expect(result).toMatchObject({ delivered: true, pending: false });
    expect(mined(h.sent).map((e) => e.win)).toEqual(['main']);
    expect(mod.bridgeTargets()).toEqual([main]);
  });

  it('the default host is the first live window that is not always-on-top', () => {
    const widget = makeWin('widget', { onTop: true });
    const gone = makeWin('gone');
    gone.destroyed = true;
    const main = makeWin('main');
    h.windows.push(widget, gone, main);
    expect(mod.bridgeHostWindow()).toBe(main);
    main.destroyed = true;
    expect(mod.bridgeHostWindow()).toBeNull();
    expect(mod.bridgeTargets()).toEqual([]);
  });

  it('a destroyed window from the resolver is no host', () => {
    const main = makeWin('main');
    main.destroyed = true;
    mod.setExtensionBridgeHostResolver(() => main as never);
    expect(mod.bridgeHostWindow()).toBeNull();
  });
});

describe('durable mines', () => {
  it('with no host the mine is persisted, not reported delivered', async () => {
    const result = await mod.deliverMined({ term: '犬', text: '犬' });
    expect(result).toMatchObject({ delivered: false, pending: true });
    expect(result.mineId).toMatch(/[0-9a-f-]{36}/);
    expect(readStore().map((m) => m.mineId)).toEqual([result.mineId]);
    expect(mod.pendingMineCount()).toBe(1);
    expect(h.sent).toEqual([]);
  });

  it('an ack resolves delivered and clears the store', async () => {
    const main = makeWin('main');
    h.windows.push(main);
    h.autoAck = true;
    const result = await mod.deliverMined({ term: '鳥', text: '鳥' });
    expect(result).toEqual({ delivered: true, pending: false, mineId: result.mineId });
    const sent = mined(h.sent)[0]?.payload as Record<string, unknown>;
    expect(sent).toMatchObject({ term: '鳥', mineId: result.mineId });
    expect(mod.pendingMineCount()).toBe(0);
    expect(readStore()).toEqual([]);
  });

  it('no ack in time keeps the mine pending; a late ack still clears it', async () => {
    h.windows.push(makeWin('main'));
    const result = await mod.deliverMined({ term: '魚', text: '魚' }, { ackTimeoutMs: 20 });
    expect(result).toMatchObject({ delivered: false, pending: true });
    expect(mod.pendingMineCount()).toBe(1);
    emit('extension:mined-ack', {}, { mineId: result.mineId, ok: true });
    expect(mod.pendingMineCount()).toBe(0);
  });

  it('survives a restart (the store is re-read from disk)', async () => {
    const { mineId } = await mod.deliverMined({ term: '馬', text: '馬' });
    mod.__resetExtensionBridgeHostForTests();
    expect(mod.pendingMineCount()).toBe(1);
    const main = makeWin('main');
    h.windows.push(main);
    h.autoAck = true;
    expect(await mod.replayPendingMines()).toBe(1);
    expect(mined(h.sent).map((e) => e.payload.mineId)).toEqual([mineId]);
    expect(mod.pendingMineCount()).toBe(0);
  });

  it('a renderer that could not save it acks ok:false: kept for a retry, dropped after three', async () => {
    const main = makeWin('main');
    h.windows.push(main);
    const p = mod.deliverMined({ term: '牛', text: '牛' });
    await new Promise((r) => setTimeout(r, 1));
    const mineId = mined(h.sent)[0]?.payload.mineId as string;
    emit('extension:mined-ack', {}, { mineId, ok: false, error: 'disk full' });
    expect(await p).toMatchObject({ delivered: true, pending: true, error: 'disk full' });
    emit('extension:mined-ack', {}, { mineId, ok: false });
    expect(mod.pendingMineCount()).toBe(1);
    emit('extension:mined-ack', {}, { mineId, ok: false });
    expect(mod.pendingMineCount()).toBe(0);
  });

  it('a huge mine keeps its audio in a sidecar and gets it back on replay', async () => {
    const audioDataUrl = `data:audio/webm;base64,${'A'.repeat(9 * 1024 * 1024)}`;
    const { mineId } = await mod.deliverMined({
      term: '声',
      text: '声',
      audioDataUrl,
      ankiRequest: { term: '声', audioBase64: 'QUJD' },
    });
    const stored = readStore()[0];
    expect(stored.sidecar).toBe(true);
    expect(stored.payload.audioDataUrl).toBeUndefined();
    expect(fs.statSync(storePath()).size).toBeLessThan(10_000);
    expect(fs.existsSync(path.join(tmpRoot, 'extension-pending-mines', `${mineId}.json`))).toBe(true);

    h.windows.push(makeWin('main'));
    h.autoAck = true;
    expect(await mod.replayPendingMines()).toBe(1);
    const sent = mined(h.sent)[0]?.payload as { audioDataUrl?: string; ankiRequest?: { audioBase64?: string } };
    expect(sent.audioDataUrl).toBe(audioDataUrl);
    expect(sent.ankiRequest?.audioBase64).toBe('QUJD');
    expect(fs.existsSync(path.join(tmpRoot, 'extension-pending-mines', `${mineId}.json`))).toBe(false);
  });
});

describe('replay on extension:bridge-ready', () => {
  it('the host replays every pending mine exactly once, even on concurrent ready signals', async () => {
    const ids = [
      (await mod.deliverMined({ term: 'a', text: 'a' })).mineId,
      (await mod.deliverMined({ term: 'b', text: 'b' })).mineId,
      (await mod.deliverMined({ term: 'c', text: 'c' })).mineId,
    ];
    const main = makeWin('main');
    h.windows.push(main);
    h.autoAck = true;
    emit('extension:bridge-ready', { sender: main.webContents });
    emit('extension:bridge-ready', { sender: main.webContents });
    const joined = mod.replayPendingMines();
    expect(await joined).toBe(3);
    expect(mined(h.sent).map((e) => e.payload.mineId)).toEqual(ids);
    expect(mod.pendingMineCount()).toBe(0);
  });

  it('a live delivery still waiting for its ack is not sent again by a replay', async () => {
    const main = makeWin('main');
    h.windows.push(main);
    const live = mod.deliverMined({ term: 'd', text: 'd' }, { ackTimeoutMs: 200 });
    await new Promise((r) => setTimeout(r, 1));
    const replay = mod.replayPendingMines({ ackTimeoutMs: 200 });
    const mineId = mined(h.sent)[0]?.payload.mineId as string;
    emit('extension:mined-ack', {}, { mineId, ok: true });
    expect(await live).toMatchObject({ delivered: true });
    expect(await replay).toBe(1);
    expect(mined(h.sent)).toHaveLength(1);
  });

  it('a ready signal from a window that is not the host replays nothing', async () => {
    await mod.deliverMined({ term: 'e', text: 'e' });
    const main = makeWin('main');
    const popout = makeWin('popout');
    h.windows.push(main, popout);
    mod.setExtensionBridgeHostResolver(() => main as never);
    h.autoAck = true;
    emit('extension:bridge-ready', { sender: popout.webContents });
    await new Promise((r) => setTimeout(r, 10));
    expect(mined(h.sent)).toEqual([]);
    expect(mod.pendingMineCount()).toBe(1);
  });

  it('stops at the first mine the host does not ack', async () => {
    await mod.deliverMined({ term: 'f', text: 'f' });
    await mod.deliverMined({ term: 'g', text: 'g' });
    h.windows.push(makeWin('main'));
    expect(await mod.replayPendingMines({ ackTimeoutMs: 10 })).toBe(0);
    expect(mined(h.sent)).toHaveLength(1);
    expect(mod.pendingMineCount()).toBe(2);
  });
});

describe('known-word snapshot', () => {
  it('asks the host only and caches a good reply', async () => {
    const main = makeWin('main');
    const popout = makeWin('popout');
    h.windows.push(main, popout);
    mod.setExtensionBridgeHostResolver(() => main as never);
    const p = mod.requestKnownSnapshot();
    const req = h.sent.filter((e) => e.channel === 'extension:known-snapshot-request');
    expect(req.map((e) => e.win)).toEqual(['main']);
    expect(mod.getCachedKnownSnapshot()).toBeNull();
    emit('extension:known-snapshot-reply', {}, { id: req[0].payload.id, words: { 猫: 3, 犬: 1, bad: 'x' }, lang: 'ja' });
    expect(await p).toEqual({ ok: true, words: { 猫: 3, 犬: 1 }, lang: 'ja' });
    expect(mod.getCachedKnownSnapshot()).toEqual({ ok: true, words: { 猫: 3, 犬: 1 }, lang: 'ja' });
    expect(mod.getCachedKnownSnapshot(Date.now() + 31_000)).toBeNull();
    mod.invalidateKnownSnapshotCache();
    expect(mod.getCachedKnownSnapshot()).toBeNull();
  });

  it('times out, and answers at once with no host', async () => {
    expect(await mod.requestKnownSnapshot()).toMatchObject({ ok: false, words: {} });
    h.windows.push(makeWin('main'));
    expect(await mod.requestKnownSnapshot({ timeoutMs: 10 })).toEqual({ ok: false, words: {}, error: 'timeout' });
    expect(mod.getCachedKnownSnapshot()).toBeNull();
  });

  it('caps a reply at 200k words', async () => {
    h.windows.push(makeWin('main'));
    const p = mod.requestKnownSnapshot();
    const id = h.sent.find((e) => e.channel === 'extension:known-snapshot-request')?.payload.id;
    const words: Record<string, number> = {};
    for (let i = 0; i < 200_010; i++) words[`w${i}`] = 1;
    emit('extension:known-snapshot-reply', {}, { id, words });
    expect(Object.keys((await p).words)).toHaveLength(200_000);
  });
});
