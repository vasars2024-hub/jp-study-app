/**
 * The Region Recorder controller against fake windows (Electron stubbed): a
 * start opens the hidden host with a user gesture and the broker grants it the
 * monitor; chunks that arrive out of order land in order; Stop flushes, closes
 * the file and runs the job (finalize → library → model check → Whisper in the
 * study language → player); limits, a removed monitor and a second press while
 * starting all stop cleanly; a crash's partial file is offered and finishable;
 * a failed finish keeps the partial.
 *
 * Real capture, MediaRecorder and ffmpeg are not exercised here (see
 * recordingFinalize.test.ts for ffmpeg); this is the state machine and the wiring.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Sent = { channel: string; payload: unknown };
type Listener = (event: { sender?: unknown }, ...args: unknown[]) => unknown;

const h = vi.hoisted(() => ({
  handlers: new Map<string, Listener>(),
  listeners: new Map<string, Listener>(),
  windows: [] as Array<{ destroyed: boolean; url: string; webContents: { sent: Sent[] } }>,
  userData: '',
  onSend: null as null | ((wc: unknown, channel: string, payload: unknown) => void),
  displayHandler: null as null | ((request: unknown, callback: (streams: unknown) => void) => void),
  screenHandlers: {} as Record<string, (...args: unknown[]) => void>,
  startResult: { ok: true, mime: 'video/webm', liveCrop: true, crop: null, hasAudio: true, systemAudio: true, mic: false } as Record<string, unknown>,
  progressListener: null as null | ((p: unknown) => void),
  finalizeResult: { ok: true } as Record<string, unknown>,
  finalizedContent: '',
  openPath: vi.fn(async () => ''),
  readyBeforeLoad: false,
}));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  let nextId = 1;
  class FakeWebContents extends EventEmitter {
    id = nextId++;
    sent: Sent[] = [];
    loading = false;
    mainFrame = { processId: 3, routingId: this.id };
    executeJavaScript = vi.fn(async (code: string) => (code.startsWith('typeof') ? true : h.startResult));
    isLoading(): boolean { return this.loading; }
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
    options: Record<string, unknown>;
    bounds: { x: number; y: number; width: number; height: number };
    constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      this.bounds = { x: Number(options.x ?? 0), y: Number(options.y ?? 0), width: Number(options.width ?? 800), height: Number(options.height ?? 600) };
      h.windows.push(this as never);
    }
    loadURL(url: string): Promise<void> {
      this.url = url;
      this.webContents.loading = true;
      setTimeout(() => {
        if (h.readyBeforeLoad) {
          // Electron's order: ready-to-show and did-finish-load can both come while
          // `isLoading()` is still true; it clears only at did-stop-loading.
          this.emit('ready-to-show');
          this.webContents.emit('did-finish-load');
          this.webContents.loading = false;
          this.webContents.emit('did-stop-loading');
          return;
        }
        this.webContents.loading = false;
        this.webContents.emit('did-finish-load');
        this.emit('ready-to-show');
      }, 0);
      return Promise.resolve();
    }
    isDestroyed(): boolean { return this.destroyed; }
    destroy(): void { if (this.destroyed) return; this.destroyed = true; this.emit('closed'); }
    setAlwaysOnTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    setContentProtection = vi.fn();
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
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1.5 };
  return {
    app: { getPath: () => h.userData, on: vi.fn() },
    BrowserWindow: FakeWindow,
    ipcMain: {
      handle: (channel: string, fn: Listener) => h.handlers.set(channel, fn),
      on: (channel: string, fn: Listener) => h.listeners.set(channel, fn),
    },
    desktopCapturer: { getSources: vi.fn(async () => [{ id: 'screen:1:0', display_id: '1', name: 'Screen 1', thumbnail: { getSize: () => ({ width: 256, height: 144 }) } }]) },
    dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
    shell: { openPath: h.openPath, showItemInFolder: vi.fn() },
    screen: {
      getAllDisplays: () => [display],
      getPrimaryDisplay: () => display,
      getDisplayNearestPoint: () => display,
      getCursorScreenPoint: () => ({ x: 10, y: 10 }),
      on: (event: string, fn: (...args: unknown[]) => void) => { h.screenHandlers[event] = fn; },
    },
    session: {
      defaultSession: {
        setDisplayMediaRequestHandler: (fn: typeof h.displayHandler) => { h.displayHandler = fn; },
      },
    },
    Menu: { buildFromTemplate: vi.fn(() => ({})) },
    nativeImage: { createFromBitmap: vi.fn(() => ({})) },
    Tray: class {
      setToolTip = vi.fn();
      setContextMenu = vi.fn();
      on = vi.fn();
      destroy = vi.fn();
    },
  };
});

vi.mock('../securityHardening', () => ({ allowDisplayCapture: vi.fn(() => () => undefined) }));
vi.mock('../globalCommands', () => ({ registerGlobalCommand: vi.fn(() => () => undefined) }));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => 'zh' }));
vi.mock('../mediaIngest', () => ({ ingestMediaPaths: vi.fn(async () => [{ id: 'media-1' }]) }));
vi.mock('../transcriptionJobs', () => ({
  enqueueTranscription: vi.fn(() => ({ ok: true, mediaId: 'media-1' })),
  onMainTranscriptionProgress: vi.fn((fn: (p: unknown) => void) => {
    h.progressListener = fn;
    return () => undefined;
  }),
}));
vi.mock('../recordingFinalize', async () => {
  const fsMod = await import('node:fs');
  return {
  finalizeRecording: vi.fn((request: { input: string; output: string; onProgress?: (f: number) => void }) => {
    h.finalizedContent = fsMod.existsSync(request.input) ? fsMod.readFileSync(request.input, 'utf8') : '';
    request.onProgress?.(0.5);
    const result = h.finalizeResult.ok
      ? { ok: true, output: request.output, durationSec: 3, hasAudio: true, width: 640, height: 360 }
      : h.finalizeResult;
    return { done: Promise.resolve(result), cancel: vi.fn() };
  }),
  };
});

import { BrowserWindow } from 'electron';
import { ingestMediaPaths } from '../mediaIngest';
import { enqueueTranscription } from '../transcriptionJobs';
import { finalizeRecording } from '../recordingFinalize';
import {
  __regionRecorderTestables as T,
  configureRegionRecorder,
  getRecorderState,
  registerRegionRecorderIpc,
  scanRecoverable,
  startRecorder,
  startRegionRecorder,
} from '../regionRecorder';
import type { RecorderState } from '../../shared/regionRecorder';

type FakeWin = InstanceType<typeof BrowserWindow> & {
  url: string;
  destroyed: boolean;
  options: Record<string, unknown>;
  webContents: { sent: Sent[]; executeJavaScript: ReturnType<typeof vi.fn>; mainFrame: { processId: number; routingId: number } };
  setContentProtection: ReturnType<typeof vi.fn>;
};

let mainWin: FakeWin;
let lastStoppedSeq = 2;

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
  Promise.resolve(h.handlers.get(channel)!({ sender: undefined }, ...args));
const live = (part: string): FakeWin[] =>
  (BrowserWindow.getAllWindows() as FakeWin[]).filter((w) => w.url.includes(part));
const until = async (cond: () => boolean, ms = 3000): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};
const chunk = (host: FakeWin, seq: number, text: string): void => {
  h.listeners.get('recorder:host-chunk')!({ sender: host.webContents }, seq, new TextEncoder().encode(text));
};

beforeAll(() => {
  h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-region-recorder-'));
  mainWin = new BrowserWindow({}) as FakeWin;
  mainWin.url = 'app://bundle/index.html';
  configureRegionRecorder({
    rendererUrl: (q = '') => `app://bundle/index.html?${q}`,
    getMainWindow: () => mainWin as never,
    isDevServer: false,
  });
  h.onSend = (wc, channel, payload) => {
    const p = payload as Record<string, unknown>;
    if (channel === 'recorder:host-command' && p.type === 'stop') {
      setTimeout(() => h.listeners.get('recorder:host-event')!({ sender: wc }, { type: 'stopped', lastSeq: lastStoppedSeq }), 0);
    }
    if (channel === 'recorder:model-check') {
      setTimeout(() => h.listeners.get('recorder:model-check-reply')!({ sender: wc }, { requestId: p.requestId, ready: true }), 0);
    }
    if (channel === 'recorder:open-in-player') {
      setTimeout(() => h.listeners.get('recorder:open-in-player-reply')!({ sender: wc }, { requestId: p.requestId, reach: 'ready' }), 0);
    }
  };
  registerRegionRecorderIpc();
});

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

let freeBytes = 50 * 1024 ** 3;

beforeEach(() => {
  T.reset();
  freeBytes = 50 * 1024 ** 3;
  T.setFreeBytesProbe(async () => freeBytes);
  lastStoppedSeq = 2;
  h.finalizeResult = { ok: true };
  vi.mocked(finalizeRecording).mockClear();
  vi.mocked(enqueueTranscription).mockClear();
});

describe('region recorder', () => {
  it('starts: hidden host with a user gesture, the monitor granted to it alone, pill and border kept out of the video', async () => {
    const state = await startRecorder('full');
    expect(state.phase).toBe('recording');
    const host = live('regionRecorder=host').at(-1)!;
    expect(host.options.show).toBe(false);
    expect((host.options.webPreferences as Record<string, unknown>).backgroundThrottling).toBe(false);
    const start = host.webContents.executeJavaScript.mock.calls.find(([code]) => String(code).startsWith('window.__gumRecorderStart'));
    expect(start?.[1]).toBe(true);
    expect(String(start?.[0])).toContain('"fps":30');
    // The broker: the host's main frame gets the monitor (and loopback on Windows), a stranger nothing.
    const granted = await new Promise((resolve) => h.displayHandler!({ frame: host.webContents.mainFrame }, resolve));
    expect(granted).toMatchObject({ video: { id: 'screen:1:0' }, ...(process.platform === 'win32' ? { audio: 'loopback' } : {}) });
    const refused = vi.fn();
    h.displayHandler!({ frame: { processId: 3, routingId: 9999 } }, refused);
    expect(refused).toHaveBeenCalledWith({});
    await until(() => live('regionRecorder=frame').length === 1 && live('regionRecorder=panel').length === 1);
    expect(live('regionRecorder=frame')[0]!.setContentProtection).toHaveBeenCalledWith(true);
    expect(live('regionRecorder=panel')[0]!.setContentProtection).toHaveBeenCalledWith(true);
    // Stop, so the next test starts clean.
    await invoke('recorder:stop');
  });

  it('writes chunks in order, then Stop runs the whole pipeline into the player', async () => {
    await startRecorder('full');
    const host = live('regionRecorder=host').at(-1)!;
    const partial = T.session()!.partialPath;
    chunk(host, 2, 'C');
    chunk(host, 0, 'A');
    chunk(host, 1, 'B');
    // A stranger's chunk is ignored.
    h.listeners.get('recorder:host-chunk')!({ sender: mainWin.webContents }, 3, new TextEncoder().encode('X'));
    await invoke('recorder:stop');
    await until(() => vi.mocked(finalizeRecording).mock.calls.length === 1);
    expect(h.finalizedContent).toBe('ABC');
    expect(host.destroyed).toBe(true);
    expect(getRecorderState().phase).toBe('idle');
    await until(() => vi.mocked(enqueueTranscription).mock.calls.length === 1);
    expect(vi.mocked(finalizeRecording).mock.calls[0]![0]).toMatchObject({ input: partial, crop: null });
    expect(vi.mocked(ingestMediaPaths)).toHaveBeenCalledWith([expect.stringMatching(/Gum Recording .*\.mp4$/)], expect.any(Object), 'recording');
    expect(vi.mocked(enqueueTranscription).mock.calls[0]![0]).toMatchObject({ mediaId: 'media-1', lang: 'zh', cardOptions: { createCards: false } });
    // The partial is gone only now that the MP4 exists.
    expect(fs.existsSync(partial)).toBe(false);
    h.progressListener!({ mediaId: 'media-1', phase: 'transcribing', done: 1, total: 4 });
    expect(getRecorderState().jobs.at(-1)).toMatchObject({ phase: 'transcribing', transcript: 'running', transcriptDone: 1 });
    h.progressListener!({ mediaId: 'media-1', phase: 'done', done: 4, total: 4 });
    await until(() => mainWin.webContents.sent.some((s) => s.channel === 'recorder:open-in-player'));
    await until(() => getRecorderState().jobs.at(-1)?.playedDirect === false);
    expect(getRecorderState().jobs.at(-1)).toMatchObject({ phase: 'ready', transcript: 'done', mediaId: 'media-1' });
  });

  it('leaves nothing of a finished recording in .partial: no sidecar, no sidecar .bak', async () => {
    await startRecorder('full');
    const partial = T.session()!.partialPath;
    chunk(live('regionRecorder=host').at(-1)!, 0, 'x');
    lastStoppedSeq = 0;
    await invoke('recorder:stop');
    await until(() => getRecorderState().jobs.at(-1)?.phase === 'ready' || getRecorderState().jobs.at(-1)?.phase === 'transcribing');
    const sidecar = partial.replace(/\.webm$/, '.json');
    expect(fs.existsSync(partial)).toBe(false);
    expect(fs.existsSync(sidecar)).toBe(false);
    // atomicJson keeps `<file>.bak`; measured live 2026-10-08 it outlived every finished recording.
    expect(fs.existsSync(`${sidecar}.bak`)).toBe(false);
  });

  it('grows the pill from its fixed corner, whatever bounds the OS reports back', async () => {
    await startRecorder('full');
    await until(() => live('regionRecorder=panel').length === 1);
    const panel = live('regionRecorder=panel')[0]! as FakeWin & { bounds: { x: number; y: number; width: number; height: number } };
    const resize = (height: number): void => {
      h.listeners.get('recorder:panel-resize')!({ sender: panel.webContents }, height);
    };
    // Windows hands back a frameless window's bounds a few px off what was set. The old
    // read-modify-write fed that error back on every render: measured live, the pill
    // shrank to 32x56 and walked to y = -9928 within three minutes.
    panel.getBounds = () => ({ x: panel.bounds.x + 8, y: panel.bounds.y - 8, width: panel.bounds.width - 16, height: panel.bounds.height + 8 });
    for (let i = 0; i < 50; i += 1) resize(i % 2 ? 90 : 140);
    resize(140);
    // Work area 1920x1040, 16 px margin: right edge 1904, bottom edge 1024.
    expect(panel.bounds).toEqual({ x: 1904 - 360, y: 1024 - 140, width: 360, height: 140 });
    resize(5000);
    expect(panel.bounds).toEqual({ x: 1904 - 360, y: 1024 - 560, width: 360, height: 560 });
    await invoke('recorder:stop');
  });

  it('a host that never answers the start fails the start instead of staying in "starting"', async () => {
    const saved = h.startResult;
    // A host page that reloads mid-start leaves executeJavaScript unsettled (measured live).
    h.startResult = new Promise(() => undefined) as unknown as Record<string, unknown>;
    T.setHostStartTimeout(30);
    try {
      await startRecorder('full');
      expect(getRecorderState().phase).toBe('error');
      expect(getRecorderState().errorKey).toBe('recorder.error.hostFailed');
      expect(live('regionRecorder=host')).toHaveLength(0);
      expect(T.session()).toBeNull();
    } finally {
      h.startResult = saved;
      T.setHostStartTimeout(20_000);
    }
    await invoke('recorder:stop');
    expect(getRecorderState().phase).toBe('idle');
  });

  it('stops at the time limit, counting recorded time only', async () => {
    await startRecorder('full');
    const s = T.session()!;
    chunk(live('regionRecorder=host').at(-1)!, 0, 'x');
    lastStoppedSeq = 0;
    T.recorderTick(s.startedAt + 60 * 60_000);
    expect(T.session()).toBe(s);
    T.recorderTick(s.startedAt + 120 * 60_000);
    await until(() => getRecorderState().jobs.length === 1);
    expect(getRecorderState().jobs[0]!.stopReasonKey).toBe('recorder.stopped.limit');
  });

  it('stops when the recorded monitor goes away', async () => {
    await startRecorder('full');
    chunk(live('regionRecorder=host').at(-1)!, 0, 'x');
    lastStoppedSeq = 0;
    h.screenHandlers['display-removed']!({}, { id: 1 });
    await until(() => getRecorderState().jobs.length === 1);
    expect(getRecorderState().jobs[0]!.stopReasonKey).toBe('recorder.stopped.display');
  });

  it('a second press while still starting means stop: one host, stopped as soon as it runs', async () => {
    lastStoppedSeq = -1;
    const before = h.windows.filter((w) => w.url.includes('regionRecorder=host')).length;
    const first = startRecorder('full');
    await new Promise((r) => setTimeout(r, 0));
    expect(getRecorderState().phase).toBe('starting');
    await startRecorder('full');
    await first;
    await until(() => getRecorderState().phase === 'idle');
    expect(h.windows.filter((w) => w.url.includes('regionRecorder=host')).length - before).toBe(1);
    // Nothing reached the disk, so there is nothing to finish.
    expect(getRecorderState().jobs).toEqual([]);
    expect(live('regionRecorder=host')).toEqual([]);
  });

  it('refuses to start, and stops a running recording, with less than 1 GB free', async () => {
    freeBytes = 500 * 1024 ** 2;
    expect((await startRecorder('full')).errorKey).toBe('recorder.error.diskLow');
    await invoke('recorder:stop');
    freeBytes = 50 * 1024 ** 3;
    await startRecorder('full');
    chunk(live('regionRecorder=host').at(-1)!, 0, 'x');
    lastStoppedSeq = 0;
    freeBytes = 10;
    await T.diskTick();
    await until(() => getRecorderState().jobs.length === 1);
    expect(getRecorderState().jobs[0]!.stopReasonKey).toBe('recorder.stopped.disk');
  });

  it('a host that fails to start reports why and leaves no recording behind', async () => {
    h.startResult = { ok: false, errorKey: 'recorder.error.streamFailed', error: 'NotAllowedError' };
    try {
      const state = await startRecorder('full');
      expect(state).toMatchObject({ phase: 'error', errorKey: 'recorder.error.streamFailed', errorDetail: 'NotAllowedError' });
      expect(live('regionRecorder=host')).toEqual([]);
      expect(((await invoke('recorder:stop')) as RecorderState).phase).toBe('idle');
    } finally {
      h.startResult = { ok: true, liveCrop: false, crop: { x: 2, y: 2, width: 100, height: 50 }, hasAudio: false, systemAudio: false, mic: false };
    }
  });

  it('keeps the partial when the finish fails, and offers a crash\'s partial for recovery', async () => {
    h.finalizeResult = { ok: false, error: 'corrupt', detail: 'Invalid data' };
    await startRecorder('full');
    chunk(live('regionRecorder=host').at(-1)!, 0, 'data');
    lastStoppedSeq = 0;
    const partial = T.session()!.partialPath;
    await invoke('recorder:stop');
    await until(() => getRecorderState().jobs[0]?.phase === 'error');
    expect(getRecorderState().jobs[0]).toMatchObject({ errorKey: 'recorder.job.error.corrupt' });
    expect(fs.existsSync(partial)).toBe(true);
    // The live crop was unavailable: ffmpeg is asked to crop.
    expect(vi.mocked(finalizeRecording).mock.calls[0]![0]).toMatchObject({ crop: { x: 2, y: 2, width: 100, height: 50 } });

    // After a "restart", the same file is a recoverable recording.
    T.reset();
    const found = scanRecoverable();
    expect(found.map((r) => r.partialPath)).toContain(partial);
    h.finalizeResult = { ok: true };
    vi.mocked(finalizeRecording).mockClear();
    const id = found.find((r) => r.partialPath === partial)!.id;
    await invoke('recorder:recovery-action', id, 'finish');
    await until(() => vi.mocked(finalizeRecording).mock.calls.length === 1);
    expect(vi.mocked(finalizeRecording).mock.calls[0]![0]).toMatchObject({ input: partial });
    await until(() => !fs.existsSync(partial));
    expect(fs.existsSync(partial.replace(/\.webm$/, '.json'))).toBe(false);
  });

  it('removes an empty partial a dead start left behind instead of keeping it forever', () => {
    const dir = path.join(h.userData, 'empty-partials', '.partial');
    fs.mkdirSync(dir, { recursive: true });
    const empty = path.join(dir, 'rec-dead-start.webm');
    fs.writeFileSync(empty, '');
    const real = path.join(dir, 'rec-crashed.webm');
    fs.writeFileSync(real, 'webm bytes');
    return invoke('recorder:set-settings', { folder: path.dirname(dir) }).then(() => {
      const found = scanRecoverable().map((r) => r.partialPath);
      expect(found).toContain(real);
      expect(found).not.toContain(empty);
      expect(fs.existsSync(empty)).toBe(false);
    });
  });

  it('never offers a partial that already became an MP4: tidies it instead', async () => {
    h.finalizeResult = { ok: false, error: 'failed' };
    await startRecorder('full');
    chunk(live('regionRecorder=host').at(-1)!, 0, 'data');
    lastStoppedSeq = 0;
    const partial = T.session()!.partialPath;
    const sidecar = partial.replace(/\.webm$/, '.json');
    await invoke('recorder:stop');
    await until(() => getRecorderState().jobs[0]?.phase === 'error');
    T.reset();

    // The sidecar points at an MP4 that is gone: still offered.
    const meta = JSON.parse(fs.readFileSync(sidecar, 'utf8')) as Record<string, unknown>;
    const mp4 = path.join(path.dirname(path.dirname(partial)), 'finished.mp4');
    fs.writeFileSync(sidecar, JSON.stringify({ ...meta, finishedOutput: mp4 }));
    expect(scanRecoverable().map((r) => r.partialPath)).toContain(partial);

    // Once that MP4 exists (a finish whose delete failed), the partial is cleaned up, not offered.
    fs.writeFileSync(mp4, 'mp4 bytes');
    expect(scanRecoverable().map((r) => r.partialPath)).not.toContain(partial);
    expect(fs.existsSync(partial)).toBe(false);
    expect(fs.existsSync(sidecar)).toBe(false);
    expect(fs.existsSync(mp4)).toBe(true);
  });

  it('kills a finish still running when the app quits', async () => {
    const cancel = vi.fn();
    vi.mocked(finalizeRecording).mockImplementationOnce(() => {
      let settle: (r: never) => void = () => undefined;
      const done = new Promise<never>((resolve) => { settle = resolve; });
      cancel.mockImplementation(() => settle({ ok: false, error: 'cancelled' } as never));
      return { done, cancel };
    });
    await startRecorder('full');
    chunk(live('regionRecorder=host').at(-1)!, 0, 'data');
    lastStoppedSeq = 0;
    await invoke('recorder:stop');
    await until(() => getRecorderState().jobs[0]?.phase === 'finalizing');

    const { app } = await import('electron');
    const appOn = app.on as unknown as { mock: { calls: Array<[string, unknown]> } };
    const willQuit = appOn.mock.calls.filter(([event]) => event === 'will-quit');
    expect(willQuit).toHaveLength(1);
    (willQuit[0]![1] as () => void)();
    expect(cancel).toHaveBeenCalledTimes(1);
    await until(() => getRecorderState().jobs[0]?.phase === 'error');
    // A second quit signal finds nothing left to kill.
    (willQuit[0]![1] as () => void)();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('shows the crash-recovery offer at startup even when the panel paints before it finishes loading', async () => {
    for (const w of live('regionRecorder=panel')) (w as unknown as { destroy: () => void }).destroy();
    const dir = path.join(h.userData, 'startup-recovery', '.partial');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rec-killed.webm'), 'webm bytes');
    await invoke('recorder:set-settings', { folder: path.dirname(dir) });
    h.readyBeforeLoad = true;
    try {
      startRegionRecorder();
      await until(() => live('regionRecorder=panel').length === 1);
      // Measured live 2026-10-08: the offer existed but its window was never shown.
      await until(() => live('regionRecorder=panel')[0]!.isVisible());
      expect(getRecorderState().recoverable.map((r) => path.basename(r.partialPath))).toContain('rec-killed.webm');
    } finally {
      h.readyBeforeLoad = false;
    }
  });

  // Last: it closes the stand-in for the main window.
  it('a job card alone never keeps the app running once every app window is closed', async () => {
    await startRecorder('full');
    chunk(live('regionRecorder=host').at(-1)!, 0, 'data');
    lastStoppedSeq = 0;
    await invoke('recorder:stop');
    await until(() => getRecorderState().jobs.at(-1)?.phase === 'ready' || getRecorderState().jobs.at(-1)?.phase === 'transcribing');
    await until(() => live('regionRecorder=panel').length === 1);
    expect(live('regionRecorder=panel')[0]!.isVisible()).toBe(true);

    // Measured live 2026-10-08: with Study OS and Blanc closed the process stayed up
    // holding only this panel, so `window-all-closed` never fired.
    (mainWin as unknown as { destroy: () => void }).destroy();
    T.onAppWindowClosed();
    expect(live('regionRecorder=panel')).toHaveLength(0);
    expect(BrowserWindow.getAllWindows()).toHaveLength(0);
  });
});
