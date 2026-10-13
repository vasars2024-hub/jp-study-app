// @vitest-environment node
/**
 * VN capture through the real IPC handlers (Electron mocked, a temp profile,
 * the in-memory clipboard fake and the texthooker WebSocket fixture — never a
 * real game or hook):
 *
 *   - bug 25: a hook file keeps a line the game says twice (はい。 / はい。);
 *   - bug 26: a UTF-16LE hook file (BOM at the top, reading starts at the end)
 *     decodes, a UTF-8 character split across two reads is joined, and a
 *     Shift-JIS file decodes;
 *   - bug 24: "Test" over a running capture is refused with a code, and the
 *     capture keeps running;
 *   - bug 27: a clipboard line is captured while the VN reader has focus;
 *   - binary frames from a real local WebSocket are captured;
 *   - failures carry an `errorCode` the renderer translates.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTexthooker, type TexthookerServer } from './e2eFixtures/texthooker';

const fixture = vi.hoisted(() => ({
  root: '',
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  sent: [] as Array<{ channel: string; payload: unknown }>,
  clipboard: '',
  pick: '',
  focusedUrl: null as string | null,
}));

vi.mock('electron', () => ({
  app: { getPath: () => fixture.root, once: vi.fn() },
  BrowserWindow: {
    getFocusedWindow: () => (fixture.focusedUrl === null
      ? null
      : { webContents: { getURL: () => fixture.focusedUrl } }),
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: { send: (channel: string, payload: unknown) => fixture.sent.push({ channel, payload }) },
    }],
  },
  clipboard: { readText: () => fixture.clipboard },
  dialog: { showOpenDialog: async () => ({ canceled: !fixture.pick, filePaths: fixture.pick ? [fixture.pick] : [] }) },
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => fixture.handlers.set(channel, fn) },
  shell: { openPath: vi.fn(async () => '') },
}));

vi.mock('node:child_process', () => ({ spawn: vi.fn(), execFile: vi.fn() }));

vi.mock('../immersion/visualNovelReaderWindow', () => ({
  openVisualNovelReader: vi.fn(),
  closeVisualNovelReader: vi.fn(),
  readerTarget: () => '',
  setReaderOpacity: vi.fn(),
}));

vi.mock('../globalCommands', () => ({ registerGlobalCommand: vi.fn() }));
vi.mock('../companion', () => ({ showCompanionNotice: vi.fn() }));

import { registerVisualNovelIpc } from '../immersion/visualNovels';

const invoke = (channel: string, ...args: unknown[]): Promise<any> => {
  const handler = fixture.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return Promise.resolve(handler({}, ...args));
};

let hooker: TexthookerServer | null = null;

beforeEach(() => {
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), 'vn-hookfile-'));
  fixture.handlers.clear();
  fixture.sent.length = 0;
  fixture.clipboard = '';
  fixture.pick = '';
  fixture.focusedUrl = null;
  registerVisualNovelIpc();
});

afterEach(async () => {
  await invoke('visual-novel:captureStop').catch(() => undefined);
  const db = await invoke('visual-novel:list');
  for (const entry of db.entries) await invoke('visual-novel:stopHook', entry.id);
  await hooker?.close();
  hooker = null;
  // Only this test's temporary profile.
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

async function addNovel(title = '窓辺の物語'): Promise<string> {
  const added = await invoke('visual-novel:add', { title });
  expect(added.ok).toBe(true);
  return (added.database.entries as Array<{ id: string; title: string }>).find((entry) => entry.title === title)!.id;
}

async function hookLines(id: string): Promise<string[]> {
  const db = await invoke('visual-novel:list');
  return (db.captures as Array<{ visualNovelId: string; japanese: string; capturedAt: number; source: string }>)
    .filter((capture) => capture.visualNovelId === id && capture.source === 'hook')
    .sort((a, b) => a.capturedAt - b.capturedAt)
    .map((capture) => capture.japanese);
}

/** Start the relay on `file` through the real `visual-novel:startHook` handler. */
async function startHook(id: string, file: string): Promise<void> {
  fixture.pick = file;
  const started = await invoke('visual-novel:startHook', id);
  expect(started).toMatchObject({ ok: true, state: { active: true } });
}

describe('hook file relay', () => {
  it('decodes a UTF-16LE file whose BOM is only at the top, and keeps a repeated line (bugs 25, 26)', async () => {
    const id = await addNovel();
    const file = path.join(fixture.root, 'textractor.txt');
    // What was in the file before: BOM + an old line. Reading starts after it.
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('昔の行です。\r\n', 'utf16le')]));
    await startHook(id, file);
    fs.appendFileSync(file, Buffer.from('【小町】おはようございます。\r\nはい。\r\nはい。\r\n', 'utf16le'));
    await vi.waitFor(async () => expect(await hookLines(id)).toEqual(['おはようございます。', 'はい。', 'はい。']), { timeout: 5_000, interval: 50 });
    const db = await invoke('visual-novel:list');
    expect(db.captures.find((capture: { japanese: string }) => capture.japanese === 'おはようございます。').speaker).toBe('小町');
  });

  it('joins a UTF-8 character split across two reads instead of garbling it (bug 26)', async () => {
    const id = await addNovel();
    const file = path.join(fixture.root, 'hook-utf8.txt');
    fs.writeFileSync(file, Buffer.from('前の行。\n', 'utf8'));
    await startHook(id, file);
    const line = Buffer.from('窓辺の猫が静かに眠っている。\n', 'utf8');
    const cut = 4; // inside 辺 (e8 be ba)
    fs.appendFileSync(file, line.subarray(0, cut));
    // Let the first, partial read happen before the rest arrives.
    await new Promise((resolve) => setTimeout(resolve, 400));
    fs.appendFileSync(file, line.subarray(cut));
    await vi.waitFor(async () => expect(await hookLines(id)).toEqual(['窓辺の猫が静かに眠っている。']), { timeout: 5_000, interval: 50 });
  });

  it('decodes a Shift-JIS hook file', async () => {
    const id = await addNovel();
    const file = path.join(fixture.root, 'hook-sjis.txt');
    // 「前の行。」 in Shift-JIS, already in the file.
    fs.writeFileSync(file, Buffer.from([0x91, 0x4f, 0x82, 0xcc, 0x8d, 0x73, 0x81, 0x42, 0x0d, 0x0a]));
    await startHook(id, file);
    // 「はい。」 twice: both are kept.
    fs.appendFileSync(file, Buffer.from([0x82, 0xcd, 0x82, 0xa2, 0x81, 0x42, 0x0d, 0x0a, 0x82, 0xcd, 0x82, 0xa2, 0x81, 0x42, 0x0d, 0x0a]));
    await vi.waitFor(async () => expect(await hookLines(id)).toEqual(['はい。', 'はい。']), { timeout: 5_000, interval: 50 });
  });

  it('a file that starts empty decides its encoding from its first bytes (UTF-16LE with BOM)', async () => {
    const id = await addNovel();
    const file = path.join(fixture.root, 'hook-empty.txt');
    fs.writeFileSync(file, '');
    await startHook(id, file);
    fs.appendFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('今日は雨ですね。\r\n', 'utf16le')]));
    await vi.waitFor(async () => expect(await hookLines(id)).toEqual(['今日は雨ですね。']), { timeout: 5_000, interval: 50 });
  });

  it('a picked folder is refused with a code', async () => {
    const id = await addNovel();
    fixture.pick = fixture.root;
    const started = await invoke('visual-novel:startHook', id);
    expect(started).toMatchObject({ ok: false, errorCode: 'not-a-file' });
  });
});

describe('capture session through IPC', () => {
  it('refuses Test while a real capture runs, with a code, and the capture keeps running (bug 24)', async () => {
    const id = await addNovel();
    const live = await invoke('visual-novel:captureStart', id);
    expect(live).toMatchObject({ ok: true, state: { active: true, test: false } });
    const test = await invoke('visual-novel:captureStart', id, { test: true });
    expect(test).toMatchObject({ ok: false, errorCode: 'capture-running' });
    expect(await invoke('visual-novel:captureState')).toMatchObject({ active: true, test: false, visualNovelId: id });
  });

  it('captures a clipboard line while the VN reader has focus, skips it in another app window (bug 27)', async () => {
    const id = await addNovel();
    await invoke('visual-novel:updateSettings', { websocketEnabled: false });
    await invoke('visual-novel:captureStart', id);
    fixture.focusedUrl = 'app://bundle/index.html?vnReader=1';
    fixture.clipboard = 'この行はリーダー表示中に来た。';
    await vi.waitFor(async () => {
      const db = await invoke('visual-novel:list');
      expect(db.captures.map((capture: { japanese: string }) => capture.japanese)).toContain('この行はリーダー表示中に来た。');
    }, { timeout: 3_000, interval: 100 });
    // A word copied out of the reader is not a line.
    fixture.clipboard = 'リーダー';
    await new Promise((resolve) => setTimeout(resolve, 900));
    // The main window: the user's own copy, skipped.
    fixture.focusedUrl = 'app://bundle/index.html';
    fixture.clipboard = '辞書からコピーした単語';
    await new Promise((resolve) => setTimeout(resolve, 900));
    const db = await invoke('visual-novel:list');
    expect(db.captures.map((capture: { japanese: string }) => capture.japanese)).toEqual(['この行はリーダー表示中に来た。']);
  });

  it('captures binary frames from a local texthooker (the WebSocket fixture)', async () => {
    hooker = await startTexthooker();
    const id = await addNovel();
    await invoke('visual-novel:updateSettings', { websocketEnabled: true, websocketUrl: hooker.url });
    await invoke('visual-novel:captureStart', id);
    await hooker.waitForClient(1, 10_000);
    hooker.sendBinary('【小町】バイナリの行です。');
    hooker.send('テキストの行です。');
    await vi.waitFor(async () => {
      const db = await invoke('visual-novel:list');
      const lines = (db.captures as Array<{ japanese: string; capturedAt: number }>)
        .sort((a, b) => a.capturedAt - b.capturedAt)
        .map((capture) => capture.japanese);
      expect(lines).toEqual(['バイナリの行です。', 'テキストの行です。']);
    }, { timeout: 5_000, interval: 50 });
  });

  it('a duplicate add answers with a code the renderer can translate', async () => {
    await invoke('visual-novel:add', { title: 'A', executablePath: path.join(fixture.root, 'a.exe') });
    const again = await invoke('visual-novel:add', { title: 'B', executablePath: path.join(fixture.root, 'a.exe') });
    expect(again).toMatchObject({ ok: false, errorCode: 'duplicate' });
    const missing = await invoke('visual-novel:captureText', { visualNovelId: 'nope', japanese: '行。' });
    expect(missing).toMatchObject({ ok: false, errorCode: 'not-found' });
  });
});
