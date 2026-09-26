/**
 * The system-audio / live-captions pipeline in main, end to end against fake
 * windows: capture on → "mine the last N s" asks the hidden capture window for
 * a cut → the clip is encoded → a draft (with Whisper's transcript) reaches the
 * overlay → confirming forwards one card, audio included, to the MAIN window
 * (where `mineToStudy` lives) and resolves on its reply. Caption lines mine the
 * same way with their own audio cut by timestamp, and the display-media grant
 * goes to the capture window's frame and nobody else.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Sent = { channel: string; payload: unknown };
type Listener = (event: { sender?: unknown }, ...args: unknown[]) => unknown;

const h = vi.hoisted(() => ({
  handlers: new Map<string, Listener>(),
  listeners: new Map<string, Listener>(),
  windows: [] as Array<{ destroyed: boolean; url?: string; webContents: { sent: Sent[] } }>,
  userData: '',
  onSend: null as null | ((wc: unknown, channel: string, payload: unknown) => void),
  displayHandler: null as null | ((request: unknown, callback: (streams: unknown) => void) => void),
}));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  let nextId = 1;
  class FakeWebContents extends EventEmitter {
    id = nextId++;
    sent: Sent[] = [];
    mainFrame = { processId: 7, routingId: this.id };
    executeJavaScript = vi.fn(async (code: string) => (code.startsWith('typeof') ? true : { ok: true }));
    send(channel: string, payload: unknown): void {
      this.sent.push({ channel, payload });
      h.onSend?.(this, channel, payload);
    }
  }
  class FakeWindow extends EventEmitter {
    static getAllWindows(): FakeWindow[] {
      return (h.windows as unknown as FakeWindow[]).filter((w) => !w.destroyed);
    }
    webContents = new FakeWebContents();
    destroyed = false;
    visible = false;
    url = '';
    bounds: { x: number; y: number; width: number; height: number };
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      this.bounds = {
        x: Number(options.x ?? 0),
        y: Number(options.y ?? 0),
        width: Number(options.width ?? 800),
        height: Number(options.height ?? 600),
      };
      h.windows.push(this as never);
    }
    loadURL(url: string): Promise<void> {
      this.url = url;
      setTimeout(() => this.webContents.emit('did-finish-load'), 0);
      return Promise.resolve();
    }
    isDestroyed(): boolean { return this.destroyed; }
    destroy(): void { this.destroyed = true; this.emit('closed'); }
    setAlwaysOnTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    showInactive(): void { this.visible = true; }
    show(): void { this.visible = true; }
    hide(): void { this.visible = false; }
    focus = vi.fn();
    restore = vi.fn();
    isVisible(): boolean { return this.visible; }
    isMinimized(): boolean { return false; }
    getBounds(): { x: number; y: number; width: number; height: number } { return this.bounds; }
    setBounds(b: { x: number; y: number; width: number; height: number }): void { this.bounds = b; }
  }
  return {
    app: { getPath: () => h.userData, on: vi.fn() },
    BrowserWindow: FakeWindow,
    ipcMain: {
      handle: (channel: string, fn: Listener) => h.handlers.set(channel, fn),
      on: (channel: string, fn: Listener) => h.listeners.set(channel, fn),
    },
    desktopCapturer: { getSources: vi.fn(async () => [{ id: 'screen:1:0', display_id: '1', name: 'Screen 1' }]) },
    Menu: { buildFromTemplate: vi.fn(() => ({})) },
    nativeImage: { createFromBitmap: vi.fn(() => ({})) },
    screen: {
      getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
      getPrimaryDisplay: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
    },
    session: {
      defaultSession: {
        setDisplayMediaRequestHandler: (fn: typeof h.displayHandler) => { h.displayHandler = fn; },
      },
    },
    Tray: class {
      setToolTip = vi.fn();
      setContextMenu = vi.fn();
      on = vi.fn();
      destroy = vi.fn();
    },
    globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
  };
});

vi.mock('../liveCaptions', () => ({
  feedLiveCaptionsPollerLine: vi.fn(),
  getLiveCaptionsStatus: () => ({ capturing: false, attached: false }),
  onLiveCaptionsEvent: vi.fn(() => () => undefined),
  releaseLiveCaptionsForOverlay: vi.fn(),
  startLiveCaptionsCapture: vi.fn(() => ({ ok: true })),
}));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => 'zh' }));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));
vi.mock('../foregroundWindow', () => ({ foregroundWindowTitle: vi.fn(async () => '上海 vlog - Bilibili') }));
vi.mock('../captionAudioEncode', () => ({
  encodeWavToMp3: vi.fn(async () => ({ ok: true, bytes: Buffer.alloc(4096, 0x4d) })),
}));
vi.mock('../securityHardening', () => ({ allowDisplayCapture: vi.fn(() => () => undefined) }));

import { BrowserWindow } from 'electron';
import {
  configureSystemAudioCapture,
  getCaptionsState,
  ingestWindowsLines,
  registerSystemAudioCaptureIpc,
  resolveBarBounds,
} from '../systemAudioCapture';
import { bytesToBase64, encodeWav } from '../../shared/systemAudioRing';
import type { CaptionDraft, CaptionMinePayload, CaptionOverlayLine } from '../../shared/captionsOverlay';

type FakeWin = InstanceType<typeof BrowserWindow> & {
  url: string;
  webContents: { sent: Sent[] };
  destroyed: boolean;
  options: Record<string, unknown>;
};

let mainWin: FakeWin;
const hostCommands: Array<Record<string, unknown>> = [];
const mineRequests: CaptionMinePayload[] = [];

const tone = encodeWav(Int16Array.from({ length: 24_000 * 8 }, (_, i) => Math.round(Math.sin(i / 4) * 5000)), 24_000);

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
  Promise.resolve(h.handlers.get(channel)!({ sender: undefined }, ...args));

const until = async (cond: () => boolean, ms = 2000): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

const byUrl = (part: string): FakeWin | undefined =>
  (BrowserWindow.getAllWindows() as FakeWin[]).find((w) => w.url.includes(part));

function lastSent<T>(win: FakeWin | undefined, channel: string): T | undefined {
  const rows = win?.webContents.sent.filter((s) => s.channel === channel) ?? [];
  return rows.at(-1)?.payload as T | undefined;
}

beforeAll(() => {
  h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-captions-main-'));
  mainWin = new BrowserWindow({}) as FakeWin;
  mainWin.url = 'app://bundle/index.html';
  configureSystemAudioCapture({
    rendererUrl: (q = '') => `app://bundle/index.html?${q}`,
    getMainWindow: () => mainWin as never,
    isDevServer: false,
  });
  // The fake capture host and main window answer what main sends them.
  h.onSend = (wc, channel, payload) => {
    if (channel === 'captions:host-command') {
      const cmd = payload as Record<string, unknown> & { id: string };
      hostCommands.push(cmd);
      let reply: Record<string, unknown> = { ok: true };
      if (cmd.type === 'cut') {
        const startMs = cmd.mode === 'range' ? Number(cmd.startMs) : Date.now() - 8000;
        reply = {
          ok: true,
          sliceId: `s${hostCommands.length}`,
          wavBase64: bytesToBase64(tone),
          startMs,
          endMs: startMs + 8000,
          durationMs: 8000,
          silent: false,
        };
      } else if (cmd.type === 'transcribe') {
        reply = { ok: true, text: '今天天气很好' };
      }
      setTimeout(() => h.listeners.get('captions:host-reply')!({ sender: wc }, { id: cmd.id, ...reply }), 0);
    }
    if (channel === 'captions:mine-request') {
      const p = payload as CaptionMinePayload;
      mineRequests.push(p);
      setTimeout(() => h.listeners.get('captions:mine-reply')!({}, { requestId: p.requestId, ok: true, created: true, cardId: 'c1' }), 0);
    }
  };
  registerSystemAudioCaptureIpc();
});

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

describe('system-audio capture in main', () => {
  it('is off until the user turns it on, and mining then says so', async () => {
    expect(getCaptionsState().capture).toBe('off');
    const r = (await invoke('captions:mineRecent')) as { ok: boolean; errorKey?: string };
    expect(r).toEqual({ ok: false, errorKey: 'captions.notice.captureOff' });
    expect(byUrl('audioCapture=1')).toBeUndefined();
  });

  it('turning it on opens the hidden capture window and starts the stream with a user gesture', async () => {
    const state = (await invoke('captions:setCapture', true)) as { capture: string };
    expect(state.capture).toBe('on');
    const capture = byUrl('audioCapture=1')!;
    expect(capture.options.show).toBe(false);
    const start = vi.mocked((capture.webContents as unknown as { executeJavaScript: (c: string, g?: boolean) => unknown }).executeJavaScript)
      .mock.calls.find(([code]) => code.startsWith('window.__gumCaptureStart'));
    expect(start?.[1]).toBe(true);
    expect(start?.[0]).toContain('"seconds":60');
  });

  it('grants the loopback stream to the capture window\'s frame only', async () => {
    const capture = byUrl('audioCapture=1')! as unknown as { webContents: { mainFrame: { processId: number; routingId: number } } };
    const denied = vi.fn();
    h.displayHandler!({ frame: { processId: 7, routingId: 999 } }, denied);
    expect(denied).toHaveBeenCalledWith({});
    const granted = await new Promise<unknown>((resolve) => h.displayHandler!({ frame: capture.webContents.mainFrame }, resolve));
    const platformGrant = process.platform === 'win32'
      ? { video: expect.objectContaining({ display_id: '1' }), audio: 'loopback' }
      : {};
    expect(granted).toEqual(platformGrant);
  });

  it('"mine the last N s" → cut → encoded draft with transcript in the overlay → card with audio in the main window', async () => {
    const r = (await invoke('captions:mineRecent')) as { ok: boolean; draftId: string };
    expect(r.ok).toBe(true);
    expect(hostCommands.find((c) => c.type === 'cut')).toMatchObject({ mode: 'last', seconds: 8 });
    const overlay = byUrl('captionsOverlay=1')!;
    expect(overlay).toBeDefined();
    await until(() => lastSent<{ drafts: CaptionDraft[] }>(overlay, 'captions:drafts')?.drafts[0]?.transcript === 'done');
    const draft = lastSent<{ drafts: CaptionDraft[] }>(overlay, 'captions:drafts')!.drafts[0]!;
    expect(draft.text).toBe('今天天气很好');
    expect(draft.audioFilename).toMatch(/^gum-captions-\d{8}-\d{6}\.mp3$/);
    expect(draft.audioMime).toBe('audio/mpeg');
    expect(draft.sourceTitle).toBe('上海 vlog - Bilibili');
    expect(draft.studyLang).toBe('zh');
    expect(hostCommands.find((c) => c.type === 'transcribe')).toMatchObject({ sliceId: expect.any(String), lang: 'zh' });

    const reply = (await invoke('captions:confirmDraft', r.draftId, { text: '今天天气很好。' })) as { ok: boolean };
    expect(reply.ok).toBe(true);
    const sentToMain = mainWin.webContents.sent.filter((s) => s.channel === 'captions:mine-request');
    expect(sentToMain).toHaveLength(1);
    const card = mineRequests[0]!;
    expect(card).toMatchObject({
      sentence: '今天天气很好。',
      studyLang: 'zh',
      textProvenance: 'transcript',
      sourceTitle: '上海 vlog - Bilibili',
      audioFilename: draft.audioFilename,
    });
    expect(Buffer.from(card.audioBase64!, 'base64').length).toBe(4096);
    // The draft is gone once added.
    expect(lastSent<{ drafts: CaptionDraft[] }>(overlay, 'captions:drafts')!.drafts).toEqual([]);
    expect(((await invoke('captions:getDrafts')) as { drafts: CaptionDraft[] }).drafts).toEqual([]);
  });

  it('a draft pushed before the bar loaded can be pulled by it', async () => {
    const r = (await invoke('captions:mineRecent')) as { ok: boolean; draftId: string };
    const pulled = (await invoke('captions:getDrafts')) as { drafts: CaptionDraft[]; notices: unknown[] };
    expect(pulled.drafts.map((d) => d.id)).toContain(r.draftId);
    await invoke('captions:discardDraft', r.draftId);
  });

  it('a caption line mines with the audio cut by its own timestamps', async () => {
    await invoke('captions:toggleOverlay', true);
    const t0 = Date.now();
    ingestWindowsLines([{ text: '你好，世界', ts: t0 }, { text: '下一句', ts: t0 + 4000 }], t0 + 3000, 'Some Player');
    const overlay = byUrl('captionsOverlay=1')!;
    const lines = lastSent<CaptionOverlayLine[]>(overlay, 'captions:lines')!;
    expect(lines.map((l) => l.text)).toEqual(['你好，世界', '下一句']);
    expect(lines[0]).toMatchObject({ startMs: t0, endMs: t0 + 3000, final: true, windowTitle: 'Some Player' });

    const reply = (await invoke('captions:mineLine', lines[0]!.id)) as { ok: boolean };
    expect(reply.ok).toBe(true);
    const cut = hostCommands.filter((c) => c.type === 'cut').at(-1)!;
    expect(cut).toMatchObject({ mode: 'range', startMs: t0 - 1500 });
    expect(Number(cut.endMs)).toBeLessThanOrEqual(t0 + 4000);
    const card = mineRequests.at(-1)!;
    expect(card).toMatchObject({ sentence: '你好，世界', textProvenance: 'auto-captions', sourceTitle: 'Some Player' });
    expect(card.audioBase64).toBeTruthy();
  });

  it('a revision keeps the line\'s start and moves its end', () => {
    const t0 = Date.now() + 10_000;
    ingestWindowsLines([{ text: '我们', ts: t0 }], t0 + 500, '');
    ingestWindowsLines([{ text: '我们走吧', ts: t0 }], t0 + 1800, '');
    const overlay = byUrl('captionsOverlay=1')!;
    const line = lastSent<CaptionOverlayLine[]>(overlay, 'captions:lines')!.find((l) => l.startMs === t0)!;
    expect(line).toMatchObject({ text: '我们走吧', endMs: t0 + 1800, final: false });
  });

  it('a word from the dictionary pop-up mines as the card front with its line', async () => {
    const overlay = byUrl('captionsOverlay=1')!;
    const line = lastSent<CaptionOverlayLine[]>(overlay, 'captions:lines')![0]!;
    await invoke('captions:mineLine', line.id, { word: '世界' });
    expect(mineRequests.at(-1)).toMatchObject({ word: '世界', sentence: '你好，世界' });
  });

  it('turning capture off destroys the capture window (and the audio in it)', async () => {
    const capture = byUrl('audioCapture=1')!;
    const state = (await invoke('captions:setCapture', false)) as { capture: string; bufferedMs: number };
    expect(state.capture).toBe('off');
    expect(state.bufferedMs).toBe(0);
    expect(capture.destroyed).toBe(true);
    // A line mined now is added without audio, and says why.
    const line = lastSent<CaptionOverlayLine[]>(byUrl('captionsOverlay=1'), 'captions:lines')![0]!;
    const before = hostCommands.length;
    await invoke('captions:mineLine', line.id);
    expect(hostCommands.length).toBe(before);
    expect(mineRequests.at(-1)!.audioBase64).toBeUndefined();
  });

  it('a quick on → off → on ends on with one capture window; on → off ends off, not "error"', async () => {
    const captureWindows = (): FakeWin[] => (BrowserWindow.getAllWindows() as FakeWin[]).filter((w) => w.url.includes('audioCapture=1'));
    const first = invoke('captions:setCapture', true);
    const off = invoke('captions:setCapture', false);
    const again = invoke('captions:setCapture', true);
    await Promise.all([first, off, again]);
    await until(() => getCaptionsState().capture !== 'starting');
    await new Promise((r) => setTimeout(r, 20));
    expect(getCaptionsState().capture).toBe('on');
    expect(captureWindows()).toHaveLength(1);

    await invoke('captions:setCapture', false);
    const withdrawn = invoke('captions:setCapture', true);
    await invoke('captions:setCapture', false);
    await withdrawn;
    await new Promise((r) => setTimeout(r, 20));
    expect(getCaptionsState().capture).toBe('off');
    expect(getCaptionsState().captureErrorKey).toBeUndefined();
    expect(captureWindows()).toHaveLength(0);
  });

  it('settings are clamped and persisted without any audio', async () => {
    await invoke('captions:setSettings', { captureSeconds: 500, source: 'gum' });
    expect(getCaptionsState().settings).toMatchObject({ captureSeconds: 120, source: 'gum' });
    await until(() => fs.existsSync(path.join(h.userData, 'live-captions', 'overlay.json')));
    const stored = JSON.parse(fs.readFileSync(path.join(h.userData, 'live-captions', 'overlay.json'), 'utf8'));
    expect(Object.keys(stored).sort()).toEqual(
      ['bounds', 'captureSeconds', 'fontSize', 'mineSeconds', 'overlayOpacity', 'source', 'transcribeMined'],
    );
  });
});

describe('resolveBarBounds', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1040 };
  it('centres a new bar near the bottom of the primary display', () => {
    expect(resolveBarBounds(null, [primary], primary)).toEqual({ x: 520, y: 1040 - 132 - 56, width: 880, height: 132 });
  });
  it('keeps a saved position that is still on a display, and drops one that is not', () => {
    const saved = { x: 100, y: 700, width: 900, height: 140 };
    expect(resolveBarBounds(saved, [primary], primary)).toEqual(saved);
    expect(resolveBarBounds({ ...saved, x: 5000 }, [primary], primary).x).toBe(520);
  });
});
