// @vitest-environment node
/**
 * Snip to cards, main's half: the clipboard watch, the profile-only history and
 * the hand-off to the main window. Electron is stubbed (an in-memory clipboard
 * and pictures that are just strings); no window is shown, nothing is OCR'd.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  /** A picture: its "pixels" are the string it was made from. */
  class FakeImage {
    constructor(public content: string, public width = 600, public height = 120) {}
    isEmpty = (): boolean => !this.content;
    getSize = () => ({ width: this.width, height: this.height });
    toPNG = (): Buffer => Buffer.from(`png:${this.content}:${this.width}x${this.height}`);
    toBitmap = (): Buffer => Buffer.from(`bmp:${this.content}`);
    crop = (r: { x: number; y: number }) => ({ toBitmap: () => Buffer.from(`${this.content}@${r.x},${r.y}`) });
  }
  const clip = { image: null as FakeImage | null, text: '' };
  class FakeWebContents {
    static next = 1;
    id = FakeWebContents.next++;
    sent: Array<{ channel: string; payload: unknown }> = [];
    send = (channel: string, payload: unknown): void => {
      this.sent.push({ channel, payload });
    };
    on = (): void => undefined;
    once = (): void => undefined;
    isDestroyed = (): boolean => false;
  }
  class FakeWindow {
    static all: FakeWindow[] = [];
    destroyed = false;
    visible = false;
    focused = 0;
    webContents = new FakeWebContents();
    constructor(public opts: Record<string, unknown> = {}) {
      FakeWindow.all.push(this);
    }
    isDestroyed = (): boolean => this.destroyed;
    isVisible = (): boolean => this.visible;
    isMinimized = (): boolean => false;
    restore = (): void => undefined;
    setAlwaysOnTop = (): void => undefined;
    setVisibleOnAllWorkspaces = (): void => undefined;
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
    focus = (): void => {
      this.focused += 1;
    };
    hide = (): void => {
      this.visible = false;
    };
    destroy = (): void => {
      this.destroyed = true;
    };
  }
  return {
    handlers,
    FakeImage,
    FakeWindow,
    clip,
    userData: '',
    locked: false,
    lang: 'ja' as 'ja' | 'zh' | 'ru',
    paddleLangs: [] as string[],
    ocrCalls: 0,
    commands: new Map<string, () => void>(),
    main: null as FakeWindow | null,
    ensureCalls: 0,
  };
});

vi.mock('electron', () => {
  const BrowserWindow = h.FakeWindow as unknown as { getAllWindows: () => unknown[] };
  BrowserWindow.getAllWindows = () => h.FakeWindow.all.filter((w) => !w.destroyed);
  return {
    app: { getPath: () => h.userData },
    BrowserWindow,
    clipboard: {
      availableFormats: () => [...(h.clip.text ? ['text/plain'] : []), ...(h.clip.image ? ['image/png'] : [])],
      readImage: () => h.clip.image ?? new h.FakeImage(''),
      readText: () => h.clip.text,
    },
    nativeImage: { createFromPath: (p: string) => new h.FakeImage(fs.existsSync(p) ? 'stored' : '') },
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
vi.mock('../lockGuard', () => ({ appLocked: () => h.locked }));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => h.lang }));
vi.mock('../paddleOcr', () => ({
  paddleOcrAvailable: () => h.paddleLangs.length > 0,
  installedPaddleLangs: () => h.paddleLangs,
}));
vi.mock('../mangaOcr', () => ({ mangaOcrAvailable: () => false }));
vi.mock('../screenOcr', () => ({
  boundedScreenshotDataUrl: () => 'data:image/jpeg;base64,SlBFRw==',
  ocrClipboardImage: async () => {
    h.ocrCalls += 1;
    return { ok: true, text: '今天天气很好', engine: 'web', lang: 'zh', confidence: 0.93 };
  },
}));
vi.mock('../globalCommands', () => ({
  registerGlobalCommand: (id: string, fn: () => void) => {
    h.commands.set(id, fn);
    return () => undefined;
  },
  refreshGlobalCommands: () => undefined,
}));
vi.mock('../systemDictionary', () => ({ refreshAppTray: () => undefined }));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));

type Mod = typeof import('../snipToCards');
type Gum = typeof import('../gumClipboardWrites');
let mod: Mod;
let gum: Gum;

async function load(): Promise<Mod> {
  vi.resetModules();
  h.handlers.clear();
  h.commands.clear();
  h.FakeWindow.all.length = 0;
  h.main = null;
  h.ensureCalls = 0;
  h.ocrCalls = 0;
  h.locked = false;
  h.lang = 'ja';
  h.paddleLangs = [];
  h.clip.image = null;
  h.clip.text = '';
  const m = await import('../snipToCards');
  gum = await import('../gumClipboardWrites');
  m.configureSnipToCards({
    rendererUrl: (q = '') => `app://bundle/index.html?${q}`,
    isDevServer: false,
    getMainWindow: () => h.main as unknown as Electron.BrowserWindow,
    ensureMainWindow: () => {
      h.ensureCalls += 1;
    },
  });
  m.registerSnipToCardsIpc();
  m.__snipToCardsTestables.setStarted(true);
  m.__snipToCardsTestables.primeProbe();
  return m;
}

/** Put a picture on the clipboard and let one poll see it. */
async function snip(content: string, size?: { width: number; height: number }): Promise<void> {
  h.clip.text = '';
  h.clip.image = new h.FakeImage(content, size?.width, size?.height);
  mod.__snipToCardsTestables.tick();
  await new Promise((r) => setTimeout(r, 0));
  await mod.__snipToCardsTestables.settled();
}

function clearClipboard(): void {
  h.clip.image = null;
  h.clip.text = 'text';
  mod.__snipToCardsTestables.tick();
}

const history = () => mod.__snipToCardsTestables.loadHistory();

beforeEach(async () => {
  h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-snip-'));
  mod = await load();
});

afterEach(() => {
  mod.stopSnipToCards();
  fs.rmSync(h.userData, { recursive: true, force: true });
});

describe('watching the clipboard', () => {
  it('a picture already on the clipboard when watching starts is not a snip', async () => {
    h.clip.image = new h.FakeImage('old');
    mod.__snipToCardsTestables.primeProbe();
    mod.__snipToCardsTestables.tick();
    await mod.__snipToCardsTestables.settled();
    expect(history()).toHaveLength(0);
  });

  it('a new picture is stored in the profile and handed to the main window (opened hidden if absent)', async () => {
    await snip('猫');
    const [entry] = history();
    expect(entry).toMatchObject({ status: 'processing', lang: 'ja', width: 600, height: 120 });
    expect(fs.existsSync(path.join(h.userData, 'snips', `${entry.id}.png`))).toBe(true);
    const pending = mod.__snipToCardsTestables.pending();
    expect(pending).toHaveLength(1);
    // No accurate engine for Japanese: the bundled offline recognizer reads the lossless PNG.
    expect(pending[0]).toMatchObject({ kind: 'process', payload: { entry: { id: entry.id }, basicOcr: { width: 600, height: 120 } } });
    expect((pending[0].payload as { cardImage?: { filename: string } }).cardImage?.filename).toBe(`gum-snip-${entry.id}.jpg`);
    expect(h.ensureCalls).toBe(1);
  });

  it('never reads the same picture twice', async () => {
    await snip('猫');
    clearClipboard();
    await snip('猫');
    expect(history()).toHaveLength(1);
  });

  it('ignores icon-sized pictures, pictures while locked, and Gum\'s own clipboard writes', async () => {
    await snip('icon', { width: 16, height: 16 });
    h.locked = true;
    await snip('while-locked');
    h.locked = false;
    // Still the same picture after the unlock: seen, never read.
    mod.__snipToCardsTestables.tick();
    await mod.__snipToCardsTestables.settled();
    gum.noteGumClipboardWrite();
    await snip('restored-by-gum');
    expect(history()).toHaveLength(0);
  });

  it('paused: nothing is read, and resuming does not read the picture already there', async () => {
    await h.handlers.get('snip:setSettings')!({}, { enabled: false });
    await snip('during-pause');
    expect(history()).toHaveLength(0);
    await h.handlers.get('snip:setSettings')!({}, { enabled: true });
    mod.__snipToCardsTestables.tick();
    await mod.__snipToCardsTestables.settled();
    expect(history()).toHaveLength(0);
    await snip('after-resume');
    expect(history()).toHaveLength(1);
  });

  it('the global command pauses and resumes, and the setting persists in the profile', async () => {
    expect(h.commands.has('snip.toggle')).toBe(true);
    h.commands.get('snip.toggle')!();
    const stored = JSON.parse(fs.readFileSync(path.join(h.userData, 'snip-to-cards.json'), 'utf8'));
    expect(stored.enabled).toBe(false);
    h.commands.get('snip.toggle')!();
    expect((await h.handlers.get('snip:getStatus')!({})) as { enabled: boolean }).toMatchObject({ enabled: true });
  });

  it('the tray offers a checkbox that follows the setting', async () => {
    const [watch] = mod.snipTrayItems();
    expect(watch).toMatchObject({ type: 'checkbox', checked: true });
    (watch.click as () => void)();
    expect(mod.snipTrayItems()[0].checked).toBe(false);
  });
});

describe('languages and engines', () => {
  it('Chinese with no model installed: an error with the install offer, never a download', async () => {
    h.lang = 'zh';
    await snip('汉字');
    const [entry] = history();
    expect(entry).toMatchObject({ status: 'error', error: 'models-missing', installIds: ['paddle-ocr-zh'] });
    expect(h.ocrCalls).toBe(0);
  });

  it('Chinese with its model: read in main with the accurate engine, confidence carried', async () => {
    h.lang = 'zh';
    h.paddleLangs = ['zh'];
    await snip('汉字');
    const job = mod.__snipToCardsTestables.pending()[0].payload as { ocr?: unknown; basicOcr?: unknown };
    expect(job.ocr).toEqual({ text: '今天天气很好', engine: 'web', confidence: 0.93 });
    expect(job.basicOcr).toBeUndefined();
  });
});

describe('the main window and the history', () => {
  it('a waiting snip is sent once the main window says it is ready', async () => {
    await snip('猫');
    h.main = new h.FakeWindow();
    await h.handlers.get('snip:ready')!({ sender: h.main.webContents });
    expect(h.main.webContents.sent.map((s) => s.channel)).toEqual(['snip:process']);
    expect(mod.__snipToCardsTestables.pending()).toHaveLength(0);
  });

  it('the pipeline patches an entry, but never its identity, size or hash', async () => {
    await snip('猫');
    const [entry] = history();
    const next = (await h.handlers.get('snip:history:update')!({}, entry.id, {
      status: 'done',
      text: '猫',
      hash: 'forged',
      bytes: 1,
      cardIds: ['c1'],
      words: [{ surface: '猫', lemma: '猫', status: 'added', cardId: 'c1' }],
    })) as { hash: string; bytes: number; status: string; cardIds: string[] };
    expect(next).toMatchObject({ status: 'done', cardIds: ['c1'] });
    expect(next.hash).toBe(entry.hash);
    expect(next.bytes).toBe(entry.bytes);
  });

  it('Undo / word toggles go to the main window; unknown snips are refused', async () => {
    await snip('猫');
    const [entry] = history();
    h.main = new h.FakeWindow();
    await h.handlers.get('snip:ready')!({ sender: h.main.webContents });
    expect(await h.handlers.get('snip:action')!({}, { id: entry.id, action: 'undo' })).toBe(true);
    expect(await h.handlers.get('snip:action')!({}, { id: entry.id, action: 'removeWord', index: 2 })).toBe(true);
    expect(await h.handlers.get('snip:action')!({}, { id: 'snip-nope', action: 'undo' })).toBe(false);
    expect(h.main.webContents.sent.filter((s) => s.channel === 'snip:action').map((s) => s.payload)).toEqual([
      { id: entry.id, action: 'undo' },
      { id: entry.id, action: 'removeWord', index: 2 },
    ]);
  });

  it('search, delete and clear; a deleted snip takes its picture with it', async () => {
    await snip('猫');
    clearClipboard();
    await snip('犬');
    const [newest, oldest] = history();
    await h.handlers.get('snip:history:update')!({}, oldest.id, { status: 'done', text: '猫が寝る' });
    expect(((await h.handlers.get('snip:history:list')!({}, { search: '猫' })) as unknown[]).length).toBe(1);
    expect(await h.handlers.get('snip:history:remove')!({}, newest.id)).toBe(1);
    expect(fs.existsSync(path.join(h.userData, 'snips', `${newest.id}.png`))).toBe(false);
    expect(await h.handlers.get('snip:history:clear')!({})).toBe(1);
    expect(fs.existsSync(path.join(h.userData, 'snips', `${oldest.id}.png`))).toBe(false);
    expect(history()).toHaveLength(0);
  });

  it('the history survives a restart; a snip cut off mid-read is marked, not left reading', async () => {
    await snip('猫');
    mod.stopSnipToCards();
    mod = await load();
    const [entry] = history();
    expect(entry).toMatchObject({ status: 'error', error: 'cancelled' });
  });

  it('the toast is a non-focusing window, and Open brings Gum forward on the view', async () => {
    expect(await h.handlers.get('snip:toast:show')!({}, { id: 'snip-x', kind: 'added', words: ['猫'], count: 1 })).toBe(true);
    const [toast] = h.FakeWindow.all;
    expect(toast?.opts).toMatchObject({ show: false, alwaysOnTop: true, skipTaskbar: true });
    expect(toast!.focused).toBe(0);
    expect(await h.handlers.get('snip:toast:get')!({})).toMatchObject({ kind: 'added', count: 1 });
    h.main = new h.FakeWindow();
    await h.handlers.get('snip:ready')!({ sender: h.main.webContents });
    await h.handlers.get('snip:open')!({}, 'snip-x');
    expect(h.main.visible).toBe(true);
    expect(h.main.webContents.sent.at(-1)).toEqual({ channel: 'snip:open', payload: { id: 'snip-x' } });
  });
});
