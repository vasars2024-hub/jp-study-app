/**
 * The Region Recorder controller, round 2, against fake windows (Electron
 * stubbed as in regionRecorder.test.ts):
 *
 * - window recording: the topmost foreign window is chosen and granted, no
 *   border is drawn, the window closing stops it with its own reason, and the
 *   finish fits the frames to the first one;
 * - the encoder choice reaches the finish (detected hardware, software only, a
 *   named encoder that is not usable here);
 * - every finished recording lands in the persisted history, which can open,
 *   re-transcribe and delete (to the Recycle Bin) by id;
 * - a missing speech model queues the transcription, and a model download
 *   anywhere starts it — also for a recording only the history remembers;
 * - each recording is filed under its study day by the main window, once.
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
  startResult: { ok: true, mime: 'video/webm', liveCrop: true, crop: null, hasAudio: true, systemAudio: true, mic: false } as Record<string, unknown>,
  progressListener: null as null | ((p: unknown) => void),
  windowSources: [] as Array<{ id: string; name: string }>,
  modelReady: true,
  studyTagAnswer: true as boolean | null,
  trashItem: vi.fn(async (_p: string) => undefined),
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
    isDestroyed(): boolean { return false; }
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
    constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      h.windows.push(this as never);
    }
    loadURL(url: string): Promise<void> {
      this.url = url;
      this.webContents.loading = true;
      setTimeout(() => {
        this.webContents.loading = false;
        this.webContents.emit('did-finish-load');
        this.emit('ready-to-show');
      }, 0);
      return Promise.resolve();
    }
    getMediaSourceId(): string { return `window:${9000 + this.webContents.id}:0`; }
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
    getBounds() { return { x: 0, y: 0, width: 360, height: 120 }; }
    setBounds = vi.fn();
  }
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 };
  const image = { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,AAAA', getSize: () => ({ width: 256, height: 144 }) };
  return {
    app: { getPath: () => h.userData, on: vi.fn() },
    BrowserWindow: FakeWindow,
    ipcMain: {
      handle: (channel: string, fn: Listener) => h.handlers.set(channel, fn),
      on: (channel: string, fn: Listener) => h.listeners.set(channel, fn),
    },
    desktopCapturer: {
      getSources: vi.fn(async (opts: { types: string[] }) => (opts.types.includes('window')
        ? h.windowSources.map((s) => ({ ...s, display_id: '', thumbnail: image }))
        : [{ id: 'screen:1:0', display_id: '1', name: 'Screen 1', thumbnail: image }])),
    },
    dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
    shell: { openPath: vi.fn(async () => ''), showItemInFolder: vi.fn(), trashItem: h.trashItem },
    screen: {
      getAllDisplays: () => [display],
      getPrimaryDisplay: () => display,
      getDisplayNearestPoint: () => display,
      getCursorScreenPoint: () => ({ x: 10, y: 10 }),
      on: vi.fn(),
    },
    session: { defaultSession: { setDisplayMediaRequestHandler: (fn: typeof h.displayHandler) => { h.displayHandler = fn; } } },
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
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => 'ja' }));
vi.mock('../mediaIngest', () => ({ ingestMediaPaths: vi.fn(async () => [{ id: 'media-r2' }]) }));
vi.mock('../transcriptionJobs', () => ({
  enqueueTranscription: vi.fn(() => ({ ok: true, mediaId: 'media-r2' })),
  onMainTranscriptionProgress: vi.fn((fn: (p: unknown) => void) => {
    h.progressListener = fn;
    return () => undefined;
  }),
}));
vi.mock('../recordingFinalize', () => ({
  finalizeRecording: vi.fn((request: { output: string; encoder?: string }) => {
    fs.mkdirSync(path.dirname(request.output), { recursive: true });
    fs.writeFileSync(request.output, 'mp4 bytes');
    return {
      done: Promise.resolve({
        ok: true, output: request.output, durationSec: 3, hasAudio: true, width: 640, height: 360,
        encoder: request.encoder ?? 'libx264', fellBack: false,
      }),
      cancel: vi.fn(),
    };
  }),
}));

import { BrowserWindow } from 'electron';
import { enqueueTranscription } from '../transcriptionJobs';
import { finalizeRecording } from '../recordingFinalize';
import {
  __regionRecorderTestables as T,
  configureRegionRecorder,
  getRecorderState,
  registerRegionRecorderIpc,
  startRecorder,
} from '../regionRecorder';
import type { RecorderEncoderReport, RecorderHistoryEntry } from '../../shared/regionRecorder';

type FakeWin = InstanceType<typeof BrowserWindow> & { url: string; webContents: { sent: Sent[]; mainFrame: { processId: number; routingId: number } } };

let mainWin: FakeWin;
const detector = vi.fn(async (): Promise<RecorderEncoderReport> => ({ listed: ['nvenc', 'qsv'], usable: ['nvenc'], probedAt: 1 }));

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
  Promise.resolve(h.handlers.get(channel)!({ sender: undefined }, ...args));
const live = (part: string): FakeWin[] => (BrowserWindow.getAllWindows() as FakeWin[]).filter((w) => w.url.includes(part));
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
const historyFile = (): RecorderHistoryEntry[] => JSON.parse(fs.readFileSync(path.join(h.userData, 'recordings-history.json'), 'utf8'));

/** One short recording, stopped, through to its job. */
async function recordOnce(mode: 'full' | 'window' = 'full'): Promise<string> {
  await startRecorder(mode);
  const host = live('regionRecorder=host').at(-1)!;
  chunk(host, 0, 'webm');
  await invoke('recorder:stop');
  await until(() => vi.mocked(finalizeRecording).mock.calls.length > 0);
  const id = getRecorderState().jobs.at(-1)!.id;
  await until(() => ['ready', 'transcribing'].includes(getRecorderState().jobs.at(-1)?.phase ?? ''));
  return id;
}

beforeAll(() => {
  h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-region-recorder-r2-'));
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
      setTimeout(() => h.listeners.get('recorder:host-event')!({ sender: wc }, { type: 'stopped', lastSeq: 0 }), 0);
    }
    if (channel === 'recorder:model-check') {
      setTimeout(() => h.listeners.get('recorder:model-check-reply')!({ sender: wc }, { requestId: p.requestId, ready: h.modelReady }), 0);
    }
    if (channel === 'recorder:open-in-player') {
      setTimeout(() => h.listeners.get('recorder:open-in-player-reply')!({ sender: wc }, { requestId: p.requestId, reach: 'ready' }), 0);
    }
    if (channel === 'recorder:study-tag' && h.studyTagAnswer !== null) {
      setTimeout(() => h.listeners.get('recorder:study-tag-reply')!({ sender: wc }, { requestId: p.requestId, ok: h.studyTagAnswer }), 0);
    }
  };
  registerRegionRecorderIpc();
});

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

beforeEach(async () => {
  T.reset();
  T.setFreeBytesProbe(async () => 50 * 1024 ** 3);
  T.setEncoderDetector(detector);
  detector.mockClear();
  h.modelReady = true;
  h.studyTagAnswer = true;
  h.windowSources = [];
  vi.mocked(finalizeRecording).mockClear();
  vi.mocked(enqueueTranscription).mockClear();
  h.trashItem.mockClear();
  // atomicJson keeps a last-good `.bak` and reads it when the file is gone.
  fs.rmSync(path.join(h.userData, 'recordings-history.json'), { force: true });
  fs.rmSync(path.join(h.userData, 'recordings-history.json.bak'), { force: true });
  await invoke('recorder:set-settings', { encoder: 'auto', autoTranscribe: true, studyTag: true, autoOpen: false });
});

describe('recording a window', () => {
  it('records the topmost window that is not Gum\'s own, without a border, and names it', async () => {
    // Gum's own main window is on top of the z-order (it was clicked): it is skipped.
    h.windowSources = [
      { id: (mainWin as unknown as { getMediaSourceId(): string }).getMediaSourceId(), name: 'Gum' },
      { id: 'window:4242:0', name: 'NHK News - Browser' },
      { id: 'window:4343:0', name: 'Notepad' },
    ];
    const state = await startRecorder('window');
    expect(state).toMatchObject({ phase: 'recording', source: 'window', windowName: 'NHK News - Browser' });
    const host = live('regionRecorder=host').at(-1)!;
    const granted = await new Promise((resolve) => h.displayHandler!({ frame: host.webContents.mainFrame }, resolve));
    expect(granted).toMatchObject({ video: { id: 'window:4242:0' } });
    const start = vi.mocked((host.webContents as unknown as { executeJavaScript: ReturnType<typeof vi.fn> }).executeJavaScript)
      .mock.calls.find(([code]) => String(code).startsWith('window.__gumRecorderStart'));
    expect(String(start?.[0])).toContain('"fullFrame":true');
    await new Promise((r) => setTimeout(r, 20));
    expect(live('regionRecorder=frame')).toHaveLength(0);

    // The window closes: the track ends, and the stop says so.
    chunk(host, 0, 'webm');
    h.listeners.get('recorder:host-event')!({ sender: host.webContents }, { type: 'ended', reason: 'track-ended' });
    await until(() => getRecorderState().jobs.length === 1);
    expect(getRecorderState().jobs[0]).toMatchObject({ source: 'window', stopReasonKey: 'rec2.stopped.windowClosed' });
    await until(() => vi.mocked(finalizeRecording).mock.calls.length === 1);
    expect(vi.mocked(finalizeRecording).mock.calls[0]![0]).toMatchObject({ fitToFirstFrame: true });
  });

  it('records the window the picker named, and refuses one that is gone', async () => {
    h.windowSources = [{ id: 'window:1:0', name: 'Top' }, { id: 'window:2:0', name: 'Chosen' }];
    const listed = await invoke('recorder:list-windows') as Array<{ id: string; thumbnail: string }>;
    expect(listed.map((w) => w.id)).toEqual(['window:1:0', 'window:2:0']);
    expect(listed[0].thumbnail).toMatch(/^data:image\/png/);
    expect(await invoke('recorder:start', 'window', 'window:2:0')).toMatchObject({ windowName: 'Chosen' });
    await invoke('recorder:stop');
    await until(() => getRecorderState().phase === 'idle');
    expect(await invoke('recorder:start', 'window', 'window:999:0')).toMatchObject({ phase: 'error', errorKey: 'rec2.error.noWindow' });
    await invoke('recorder:stop');
  });
});

describe('encoder choice', () => {
  it('auto: the detected hardware encoder finishes the recording, and the job says which', async () => {
    await recordOnce();
    expect(detector).toHaveBeenCalled();
    expect(vi.mocked(finalizeRecording).mock.calls[0]![0]).toMatchObject({ encoder: 'h264_nvenc' });
    expect(getRecorderState().jobs.at(-1)).toMatchObject({ encoder: 'h264_nvenc' });
    expect(getRecorderState().encoders).toMatchObject({ usable: ['nvenc'] });
  });

  it('software never pays for detection; a named encoder that does not work here falls back to x264, visibly', async () => {
    await invoke('recorder:set-settings', { encoder: 'software' });
    await recordOnce();
    expect(detector).not.toHaveBeenCalled();
    expect(vi.mocked(finalizeRecording).mock.calls[0]![0]).toMatchObject({ encoder: 'libx264' });

    vi.mocked(finalizeRecording).mockClear();
    await invoke('recorder:set-settings', { encoder: 'qsv' });
    await recordOnce();
    expect(vi.mocked(finalizeRecording).mock.calls[0]![0]).toMatchObject({ encoder: 'libx264' });
    expect(getRecorderState().jobs.at(-1)).toMatchObject({ encoderFellBack: true });
  });

  it('Settings can ask for detection again', async () => {
    const state = await invoke('recorder:detect-encoders', true);
    expect(detector).toHaveBeenCalledWith(true);
    expect(state).toMatchObject({ encoders: { listed: ['nvenc', 'qsv'] } });
  });
});

describe('history', () => {
  it('keeps every finished recording on disk with its study day, and acts on it by id', async () => {
    const id = await recordOnce();
    const rows = await invoke('recorder:history-list') as Array<RecorderHistoryEntry & { missing: boolean }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, mediaId: 'media-r2', missing: false, source: 'monitor', hasAudio: true });
    expect(rows[0].studyDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(historyFile()[0].id).toBe(id);

    // Survives a restart (the in-memory list is dropped, the file is read again).
    T.reset();
    expect((await invoke('recorder:history-list') as unknown[]).length).toBe(1);

    // Open goes to the player; transcribe queues Whisper for the library item.
    mainWin.webContents.sent.length = 0;
    expect(await invoke('recorder:history-action', id, 'open')).toEqual({ ok: true });
    expect(mainWin.webContents.sent.some((s) => s.channel === 'recorder:open-in-player')).toBe(true);
    vi.mocked(enqueueTranscription).mockClear();
    await invoke('recorder:history-action', id, 'transcribe');
    expect(enqueueTranscription).toHaveBeenCalledWith(expect.objectContaining({ mediaId: 'media-r2', lang: 'ja' }));

    // Delete: the file goes to the Recycle Bin, never unlinked; the row goes; the media id comes back.
    const out = rows[0].outputPath;
    expect(await invoke('recorder:history-action', id, 'delete')).toEqual({ ok: true, mediaId: 'media-r2' });
    expect(h.trashItem).toHaveBeenCalledWith(out);
    expect(await invoke('recorder:history-list')).toEqual([]);
    expect(await invoke('recorder:history-action', id, 'open')).toMatchObject({ ok: false, errorKey: 'rec2.history.error.gone' });
  });

  it('a recording whose file was moved away is marked missing and will not open', async () => {
    const id = await recordOnce();
    const [row] = await invoke('recorder:history-list') as Array<RecorderHistoryEntry & { missing: boolean }>;
    fs.rmSync(row.outputPath, { force: true });
    expect((await invoke('recorder:history-list') as Array<{ missing: boolean }>)[0].missing).toBe(true);
    expect(await invoke('recorder:history-action', id, 'open')).toMatchObject({ ok: false, errorKey: 'rec2.history.error.missing' });
  });
});

describe('a missing speech model', () => {
  it('queues the recording, and a download anywhere in the app starts it on its own', async () => {
    h.modelReady = false;
    const id = await recordOnce();
    await until(() => getRecorderState().jobs.at(-1)?.transcript === 'waiting-model');
    expect(enqueueTranscription).not.toHaveBeenCalled();
    expect(getRecorderState().waitingForModel).toBe(1);
    expect(historyFile().find((e) => e.id === id)?.transcript).toBe('waiting-model');

    // Still missing: nothing starts.
    await T.onModelChanged(mainWin.webContents as never);
    expect(enqueueTranscription).not.toHaveBeenCalled();

    // The model arrived (the main window heard the download and said so).
    h.modelReady = true;
    h.listeners.get('recorder:model-changed')!({ sender: mainWin.webContents });
    await until(() => vi.mocked(enqueueTranscription).mock.calls.length === 1);
    expect(getRecorderState().jobs.at(-1)).toMatchObject({ transcript: 'queued' });
    // Two windows hearing the same download do not queue it twice.
    await Promise.all([T.onModelChanged(mainWin.webContents as never), T.onModelChanged(mainWin.webContents as never)]);
    expect(enqueueTranscription).toHaveBeenCalledTimes(1);
  });

  it('a recording only the history remembers (the app restarted) starts too', async () => {
    h.modelReady = false;
    const id = await recordOnce();
    await until(() => getRecorderState().jobs.at(-1)?.transcript === 'waiting-model');
    T.reset();
    expect(getRecorderState().jobs).toEqual([]);
    h.modelReady = true;
    await T.onModelChanged(mainWin.webContents as never);
    expect(enqueueTranscription).toHaveBeenCalledWith(expect.objectContaining({ mediaId: 'media-r2' }));
    expect(historyFile().find((e) => e.id === id)?.transcript).toBe('queued');
    h.progressListener!({ mediaId: 'media-r2', phase: 'done', done: 3, total: 3 });
    expect(historyFile().find((e) => e.id === id)?.transcript).toBe('done');
  });
});

describe('study day', () => {
  it('asks the main window to file the recording under its day, once', async () => {
    const id = await recordOnce();
    await until(() => historyFile().find((e) => e.id === id)?.studyTagged === true);
    const requests = mainWin.webContents.sent.filter((s) => s.channel === 'recorder:study-tag');
    const request = requests.at(-1)!.payload as Record<string, unknown>;
    expect(request).toMatchObject({ id, seconds: 3, mediaId: 'media-r2' });
    expect(request.studyDay).toBe(historyFile()[0].studyDay);
    const before = mainWin.webContents.sent.filter((s) => s.channel === 'recorder:study-tag').length;
    await T.retryStudyTags();
    expect(mainWin.webContents.sent.filter((s) => s.channel === 'recorder:study-tag').length).toBe(before);
  });

  it('an unanswered request is retried later; the switch turns it off', async () => {
    h.studyTagAnswer = false;
    const id = await recordOnce();
    await until(() => mainWin.webContents.sent.some((s) => s.channel === 'recorder:study-tag' && (s.payload as { id: string }).id === id));
    await new Promise((r) => setTimeout(r, 20));
    expect(historyFile().find((e) => e.id === id)?.studyTagged).toBe(false);
    h.studyTagAnswer = true;
    await T.retryStudyTags();
    expect(historyFile().find((e) => e.id === id)?.studyTagged).toBe(true);

    await invoke('recorder:set-settings', { studyTag: false });
    mainWin.webContents.sent.length = 0;
    await recordOnce();
    await new Promise((r) => setTimeout(r, 20));
    expect(mainWin.webContents.sent.some((s) => s.channel === 'recorder:study-tag')).toBe(false);
  });
});
