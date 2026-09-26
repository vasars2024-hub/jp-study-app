// @vitest-environment node
/**
 * The desktop companion's forward of a mine to the main window: a card made in
 * the preview (or by "mine the last lookup") is mined by the main window's
 * renderer, which owns the deck. Electron is stubbed; no window is shown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  class FakeWebContents {
    static next = 1;
    id = FakeWebContents.next++;
    sent: Array<{ channel: string; payload: unknown[] }> = [];
    send = (channel: string, ...payload: unknown[]): void => {
      this.sent.push({ channel, payload });
    };
    on = (): void => undefined;
  }
  class FakeWindow {
    static all: FakeWindow[] = [];
    destroyed = false;
    visible = false;
    webContents = new FakeWebContents();
    constructor(public opts: Record<string, unknown> = {}) {
      FakeWindow.all.push(this);
    }
    isDestroyed = (): boolean => this.destroyed;
    isVisible = (): boolean => this.visible;
    setAlwaysOnTop = (): void => undefined;
    setVisibleOnAllWorkspaces = (): void => undefined;
    setIgnoreMouseEvents = (): void => undefined;
    setBounds = (): void => undefined;
    once = (): void => undefined;
    on = (): void => undefined;
    loadURL = async (): Promise<void> => undefined;
    show = (): void => {
      this.visible = true;
    };
    showInactive = (): void => {
      this.visible = true;
    };
    focus = (): void => undefined;
    hide = (): void => {
      this.visible = false;
    };
    destroy = (): void => {
      this.destroyed = true;
    };
  }
  return { handlers, FakeWindow, main: null as FakeWindow | null, ensureCalls: 0 };
});

vi.mock('electron', () => {
  const BrowserWindow = h.FakeWindow as unknown as { getAllWindows: () => unknown[] };
  BrowserWindow.getAllWindows = () => h.FakeWindow.all.filter((w) => !w.destroyed);
  return {
    app: { getPath: () => '' },
    BrowserWindow,
    clipboard: { readText: () => '', writeText: () => undefined },
    globalShortcut: { register: () => true, unregister: () => undefined },
    ipcMain: {
      handle: (ch: string, fn: (...a: unknown[]) => unknown) => h.handlers.set(ch, fn),
      on: () => undefined,
    },
    screen: {
      getCursorScreenPoint: () => ({ x: 400, y: 300 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
    },
  };
});
vi.mock('../systemDictionary', () => ({ lookUpSelection: async () => true }));
vi.mock('../readingLens', () => ({ openReadingLens: async () => undefined }));
vi.mock('../atomicJson', () => ({ readJsonSync: () => ({}), writeJsonAtomicSync: () => undefined }));

async function load() {
  vi.resetModules();
  h.handlers.clear();
  h.FakeWindow.all.length = 0;
  h.ensureCalls = 0;
  const m = await import('../companion');
  m.configureCompanion({
    rendererUrl: (q = '') => `app://bundle/index.html?${q}`,
    isDevServer: false,
    getMainWindow: () => h.main as unknown as Electron.BrowserWindow,
    ensureMainWindow: () => {
      h.ensureCalls += 1;
      h.main = new h.FakeWindow();
    },
  });
  m.registerCompanionIpc();
  return m;
}

const DRAFT = { id: 'cd-1', kind: 'word', word: '猫', sentence: '猫が寝る。', sourceTitle: 'Game', origin: 'selection', createdAt: 1 };

function minesSentTo(win: InstanceType<typeof h.FakeWindow>): Array<{ requestId: string; request: { draft: { word: string } } }> {
  return win.webContents.sent
    .filter((m) => m.channel === 'companion:mine')
    .map((m) => m.payload[0] as { requestId: string; request: { draft: { word: string } } });
}

beforeEach(() => {
  h.main = null;
});

describe('forwarding a mine to the main window', () => {
  it('sends the draft to a ready main window and answers the preview with its result', async () => {
    await load();
    h.main = new h.FakeWindow();
    await h.handlers.get('companion:ready')!({ sender: h.main.webContents });
    const pending = h.handlers.get('companion:mine')!({}, { draft: DRAFT, attachImage: true }) as Promise<unknown>;
    const sent = minesSentTo(h.main);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.request.draft.word).toBe('猫');
    await h.handlers.get('companion:mineResult')!({}, sent[0]!.requestId, { status: 'added', anki: 'queued' });
    await expect(pending).resolves.toEqual({ status: 'added', anki: 'queued' });
  });

  it('holds a mine while the main window is not ready and sends it once it says so', async () => {
    await load();
    h.main = new h.FakeWindow();
    const pending = h.handlers.get('companion:mine')!({}, { draft: DRAFT, attachImage: false }) as Promise<unknown>;
    expect(minesSentTo(h.main)).toHaveLength(0);
    await h.handlers.get('companion:ready')!({ sender: h.main.webContents });
    const sent = minesSentTo(h.main);
    expect(sent).toHaveLength(1);
    await h.handlers.get('companion:mineResult')!({}, sent[0]!.requestId, { status: 'exists' });
    await expect(pending).resolves.toEqual({ status: 'exists' });
  });

  it('starts a main window when there is none, rather than dropping the card', async () => {
    await load();
    void h.handlers.get('companion:mine')!({}, { draft: DRAFT, attachImage: true });
    expect(h.ensureCalls).toBe(1);
  });

  it('a pop-out saying "ready" does not steal the forward from the main window', async () => {
    await load();
    h.main = new h.FakeWindow();
    const popout = new h.FakeWindow();
    await h.handlers.get('companion:ready')!({ sender: popout.webContents });
    void h.handlers.get('companion:mine')!({}, { draft: DRAFT, attachImage: true });
    expect(minesSentTo(popout)).toHaveLength(0);
    expect(minesSentTo(h.main)).toHaveLength(0);
  });

  it('refuses a draft that cannot make a card without bothering the main window', async () => {
    await load();
    h.main = new h.FakeWindow();
    await h.handlers.get('companion:ready')!({ sender: h.main.webContents });
    await expect(h.handlers.get('companion:mine')!({}, { draft: { word: '' } })).resolves.toMatchObject({ status: 'failed' });
    expect(minesSentTo(h.main)).toHaveLength(0);
  });

  it('answers "waiting" after the timeout, and still mines when the window comes up', async () => {
    vi.useFakeTimers();
    try {
      await load();
      h.main = new h.FakeWindow();
      const pending = h.handlers.get('companion:mine')!({}, { draft: DRAFT, attachImage: true }) as Promise<unknown>;
      await vi.advanceTimersByTimeAsync(20_001);
      await expect(pending).resolves.toEqual({ status: 'waiting' });
      await h.handlers.get('companion:ready')!({ sender: h.main.webContents });
      expect(minesSentTo(h.main)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the card preview window', () => {
  it('opens on a draft from another overlay and hands that draft to its renderer', async () => {
    await load();
    expect(await h.handlers.get('companion:openPreview')!({}, DRAFT)).toBe(true);
    const preview = h.FakeWindow.all.find((w) => String((w.opts as { focusable?: boolean }).focusable) === 'true');
    expect(preview).toBeTruthy();
    expect(await h.handlers.get('companion:getPreview')!({})).toMatchObject({ word: '猫', sourceTitle: 'Game' });
  });

  it('refuses a draft with no word', async () => {
    await load();
    expect(await h.handlers.get('companion:openPreview')!({}, { word: '' })).toBe(false);
  });
});

describe('mine the last lookup', () => {
  it('mines the word last opened in the Lens word panel, with its line and source window', async () => {
    const m = await load();
    h.main = new h.FakeWindow();
    await h.handlers.get('companion:ready')!({ sender: h.main.webContents });
    await h.handlers.get('companion:noteLookup')!({}, {
      text: ' книга ',
      sentence: 'Я читаю книгу.',
      sourceTitle: 'Reader — chapter 1',
      sourceApp: 'SumatraPDF',
      extra: 'ignored',
    });
    m.startCompanion();
    expect((await import('../globalCommands')).runGlobalCommand('companion.mineLast')).toBe(true);
    await vi.waitFor(() => expect(minesSentTo(h.main!)).toHaveLength(1));
    const request = (minesSentTo(h.main!)[0]! as unknown as { request: { draft: Record<string, unknown>; attachImage: boolean } }).request;
    expect(request.draft).toMatchObject({
      word: 'книга',
      sentence: 'Я читаю книгу.',
      sourceTitle: 'Reader — chapter 1',
      sourceApp: 'SumatraPDF',
      origin: 'last',
    });
    expect(request.attachImage).toBe(false);
  });

  it('ignores an empty lookup instead of replacing the last real one', async () => {
    const m = await load();
    m.startCompanion();
    h.main = new h.FakeWindow();
    await h.handlers.get('companion:ready')!({ sender: h.main.webContents });
    await h.handlers.get('companion:noteLookup')!({}, { text: '猫' });
    await h.handlers.get('companion:noteLookup')!({}, { text: '   ' });
    await h.handlers.get('companion:noteLookup')!({}, null);
    (await import('../globalCommands')).runGlobalCommand('companion.mineLast');
    await vi.waitFor(() => expect(minesSentTo(h.main!)).toHaveLength(1));
    expect(minesSentTo(h.main!)[0]!.request.draft.word).toBe('猫');
  });
});
