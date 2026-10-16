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
  /** `raw`: the bytes of the registered "PNG" format, when the snipping app wrote one. */
  const clip = { image: null as FakeImage | null, text: '', raw: '' };
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
    manga: false,
    ocrCalls: 0,
    routerCalls: [] as Array<{ langs: readonly string[]; purpose: string }>,
    router: null as null | Record<string, unknown>,
    installed: new Set<string>(),
    started: [] as string[],
    installedListener: null as null | ((id: string) => void),
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
      readBuffer: (format: string) => (format === 'PNG' && h.clip.raw ? Buffer.from(h.clip.raw) : Buffer.alloc(0)),
      readText: () => h.clip.text,
    },
    nativeImage: {
      createFromPath: (p: string) => new h.FakeImage(fs.existsSync(p) ? 'stored' : ''),
      createFromBuffer: (b: Buffer) => new h.FakeImage(b.length ? 'stored' : ''),
    },
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
/** "Read text with AI": the plan main would resolve, and what the model call saw and answers. */
const ai = vi.hoisted(() => ({
  plan: null as null | { mode: 'unsure' | 'always' | 'check'; providerId: string },
  asked: [] as Array<{ check?: boolean }>,
  calls: [] as Array<{ kind: 'check' | 'always'; providerId: string; local: unknown }>,
  read: null as null | Record<string, unknown>,
}));
vi.mock('../aiOcrVisionStore', () => ({
  resolveAiOcrVisionPlan: (opts: { check?: boolean } = {}) => {
    ai.asked.push(opts);
    if (!ai.plan) return null;
    return opts.check ? { ...ai.plan, mode: 'check' } : ai.plan.mode === 'check' ? null : ai.plan;
  },
}));
vi.mock('../ocrAiVisionProvider', () => ({
  defaultAiVisionDeps: () => ({}),
  checkWithAiVision: async (_image: unknown, _opts: unknown, local: Record<string, unknown>, providerId: string) => {
    ai.calls.push({ kind: 'check', providerId, local });
    return ai.read ?? local;
  },
  withAiVision: async (_image: unknown, _opts: unknown, _deps: unknown, _run: unknown, deps: { plan: () => { providerId: string } }) => {
    ai.calls.push({ kind: 'always', providerId: deps.plan().providerId, local: null });
    return ai.read;
  },
}));
vi.mock('../lockGuard', () => ({ appLocked: () => h.locked }));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => h.lang }));
vi.mock('../paddleOcr', () => ({
  isInstalledPaddleDetector: () => h.paddleLangs.length > 0,
  installedPaddleLangs: () => h.paddleLangs,
}));
vi.mock('../mangaOcr', () => ({ mangaOcrAvailable: () => h.manga }));
vi.mock('../screenOcr', () => ({
  boundedScreenshotDataUrl: () => 'data:image/jpeg;base64,SlBFRw==',
}));
vi.mock('../ocrRouter', () => ({
  routerImageFromNative: (image: unknown) => image,
  defaultRouterDeps: () => ({ providers: [], detectLang: () => 'ja' }),
  recognizeWithRouter: async (_image: unknown, opts: { langs: readonly string[]; purpose: string }) => {
    h.ocrCalls += 1;
    h.routerCalls.push({ langs: opts.langs, purpose: opts.purpose });
    return h.router ?? {
      ok: true, text: '今天天气很好', lines: [{ text: '今天天气很好', corrected: 0 }], engine: 'web', engines: ['web'], lang: 'zh', confidence: 0.93, unsure: [],
    };
  },
}));
vi.mock('../downloads', () => ({
  isInstalled: (id: string) => h.installed.has(id),
  assetPath: (id: string) => (h.installed.has(id) ? `C:/models/${id}/${id.replace('tessdata-', '')}.traineddata` : null),
  onAssetInstalled: (fn: (id: string) => void) => {
    h.installedListener = fn;
    return () => {
      h.installedListener = null;
    };
  },
  startDownload: async (id: string) => {
    h.started.push(id);
    return { ok: true };
  },
}));
vi.mock('../library', () => ({ localFileUrl: (p: string) => `localfile://wall/token-${path.basename(p)}` }));
vi.mock('../e2eHeadless', () => ({ isE2eHeadless: () => false }));
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
  h.routerCalls = [];
  h.router = null;
  h.installed = new Set();
  h.started = [];
  h.installedListener = null;
  h.manga = false;
  h.locked = false;
  h.lang = 'ja';
  h.paddleLangs = [];
  h.clip.image = null;
  h.clip.text = '';
  h.clip.raw = '';
  clock = Date.now();
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
  m.__snipToCardsTestables.primeProbe(clock);
  return m;
}

/** The poll's clock: each helper step is a few seconds later, past any back-off. */
let clock = 0;

/** Put a picture on the clipboard and let one poll see it. */
async function snip(content: string, size?: { width: number; height: number }): Promise<void> {
  h.clip.text = '';
  h.clip.image = new h.FakeImage(content, size?.width, size?.height);
  clock += 5000;
  mod.__snipToCardsTestables.tick(clock);
  await new Promise((r) => setTimeout(r, 0));
  await mod.__snipToCardsTestables.settled();
}

function clearClipboard(): void {
  h.clip.image = null;
  h.clip.text = 'text';
  h.clip.raw = '';
  clock += 5000;
  mod.__snipToCardsTestables.tick(clock);
}

const history = () => mod.__snipToCardsTestables.loadHistory();

beforeEach(async () => {
  ai.plan = null;
  ai.asked = [];
  ai.calls = [];
  ai.read = null;
  h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-snip-'));
  // Watching is off by default since v1: these tests run on a profile where the
  // learner turned it on (the migration has its own describe block below).
  fs.writeFileSync(path.join(h.userData, 'snip-to-cards.json'), JSON.stringify({ schema: 2, enabled: true }));
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
    clock += 5000;
    mod.__snipToCardsTestables.tick(clock);
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
  type Job = { entry: { lang: string; status: string }; ocr?: Record<string, unknown>; basicOcr?: Record<string, unknown> };
  const job = (): Job => mod.__snipToCardsTestables.pending()[0].payload as Job;

  it('Chinese with no reader at all: the bundled reader runs, with the Chinese reader offered, never downloaded', async () => {
    h.lang = 'zh';
    await snip('汉字');
    expect(h.ocrCalls).toBe(0);
    expect(job().basicOcr).toMatchObject({ langs: ['zh', 'ja'], offer: { zh: ['paddle-ocr-zh'], ru: ['paddle-ocr-ru'] }, models: {} });
    expect(job().basicOcr?.offer).not.toHaveProperty('ja');
    expect(h.started).toEqual([]);
  });

  it('Chinese with its model: read by the OCR router in every candidate language, confidence carried', async () => {
    h.lang = 'zh';
    h.paddleLangs = ['zh'];
    await snip('汉字');
    expect(h.routerCalls).toEqual([{ langs: ['zh'], purpose: 'snip' }]);
    expect(job().ocr).toEqual({ text: '今天天气很好', engine: 'web', confidence: 0.93 });
    expect(job().basicOcr).toBeUndefined();
  });

  it('a Japanese learner with the Chinese reader installed: a Chinese snip becomes a Chinese snip', async () => {
    h.lang = 'ja';
    h.paddleLangs = ['zh'];
    await snip('过度的崇拜');
    expect(h.routerCalls[0].langs).toEqual(['ja', 'zh']);
    expect(job().entry).toMatchObject({ lang: 'zh', status: 'processing' });
    expect(history()[0].lang).toBe('zh');
  });

  it('the router says the text is in a language with no reader: kept, and that reader offered', async () => {
    h.lang = 'ja';
    h.paddleLangs = ['ja'];
    h.router = {
      ok: true, text: '过度的崇拜', lines: [], engine: 'web', engines: ['web'], lang: 'zh', confidence: 0.6, unsure: [],
      missing: { lang: 'zh', assetIds: ['paddle-ocr-zh'] },
    };
    await snip('过度的崇拜');
    expect(history()[0]).toMatchObject({ status: 'error', error: 'models-missing', lang: 'zh', installIds: ['paddle-ocr-zh'], text: '过度的崇拜' });
    expect(h.started).toEqual([]);
  });

  it('unsure characters, dictionary corrections and second opinions travel with the read', async () => {
    h.paddleLangs = ['ja'];
    h.manga = true;
    h.router = {
      ok: true, text: '恐竜の魅力を語る', lines: [{ text: '恐竜の魅力を語る', corrected: 2 }], engine: 'web', engines: ['web', 'manga'], lang: 'ja', confidence: 0.7,
      unsure: [{ at: 6, ch: '語', p: 0.4, alts: ['話'] }],
    };
    await snip('thumb');
    expect(job().ocr).toEqual({
      text: '恐竜の魅力を語る', engine: 'web', confidence: 0.7, unsure: [{ at: 6, ch: '語', p: 0.4, alts: ['話'] }], corrected: 2, engines: ['web', 'manga'],
    });
  });

  it('installed Chinese Tesseract data is handed to the bundled reader by URL', async () => {
    h.lang = 'zh';
    h.installed = new Set(['tessdata-chi_sim']);
    await snip('汉字');
    expect(job().basicOcr).toMatchObject({ langs: ['zh', 'ja'], models: { chi_sim: 'localfile://wall/token-chi_sim.traineddata' } });
    expect((job().basicOcr?.offer as Record<string, unknown>).zh).toBeUndefined();
  });

  it('status reports the installed readers and the study language', async () => {
    h.paddleLangs = ['ja'];
    h.installed = new Set(['tessdata-chi_tra']);
    const status = (await h.handlers.get('snip:getStatus')!({})) as { readers: unknown; studyLang: string };
    expect(status.readers).toEqual({ det: true, paddle: ['ja'], manga: false, tess: ['chi_tra'] });
    expect(status.studyLang).toBe('ja');
  });
});

describe('turning it on offers the accurate reader', () => {
  it('turned on from the tray or the hotkey with no accurate reader: the toast offers the setup', async () => {
    await h.handlers.get('snip:setSettings')!({}, { enabled: false });
    h.commands.get('snip.toggle')!();
    expect(await h.handlers.get('snip:toast:get')!({})).toMatchObject({ kind: 'resumed', setup: true });
    h.commands.get('snip.toggle')!();
    h.paddleLangs = ['ja'];
    h.commands.get('snip.toggle')!();
    expect(await h.handlers.get('snip:toast:get')!({})).toEqual({ kind: 'resumed' });
  });
});

describe('read again', () => {
  it('re-reads the stored picture with the best reader now, clearing the old read', async () => {
    await snip('猫');
    const [entry] = history();
    await h.handlers.get('snip:history:update')!({}, entry.id, { status: 'error', error: 'garbage', text: 'しJ4', engine: 'basic', confidence: 0.53 });
    h.paddleLangs = ['ja'];
    h.router = { ok: true, text: '猫が好き', lines: [], engine: 'web', engines: ['web'], lang: 'ja', confidence: 0.95, unsure: [] };
    expect(await h.handlers.get('snip:action')!({}, { id: entry.id, action: 'reread' })).toBe(true);
    await mod.__snipToCardsTestables.settled();
    const after = history()[0];
    expect(after).toMatchObject({ id: entry.id, status: 'processing', text: '' });
    expect(after.error).toBeUndefined();
    expect(after.engine).toBeUndefined();
    const sent = mod.__snipToCardsTestables.pending().at(-1)!.payload as { entry: { id: string }; ocr: { text: string } };
    expect(sent).toMatchObject({ entry: { id: entry.id }, ocr: { text: '猫が好き' } });
  });

  it('is refused while the snip owns cards, or is still being read', async () => {
    await snip('猫');
    const [entry] = history();
    expect(await h.handlers.get('snip:action')!({}, { id: entry.id, action: 'reread' })).toBe(false);
    await h.handlers.get('snip:history:update')!({}, entry.id, { status: 'done', cardIds: ['c1'], words: [{ surface: '猫', lemma: '猫', status: 'added', cardId: 'c1' }] });
    expect(await h.handlers.get('snip:action')!({}, { id: entry.id, action: 'reread' })).toBe(false);
  });

  it('"Check with AI" is refused while AI may not read pictures, and never runs by itself', async () => {
    await snip('猫');
    const [entry] = history();
    await h.handlers.get('snip:history:update')!({}, entry.id, { status: 'done', text: '猫', engine: 'basic', confidence: 0.6 });
    expect(await h.handlers.get('snip:action')!({}, { id: entry.id, action: 'aiCheck' })).toBe(false);
    // The ordinary read asked for the mode only (no `check`), which was Off: nothing went to a model.
    expect(ai.asked.filter((opts) => !opts.check).length).toBeGreaterThan(0);
    expect(ai.asked.at(-1)).toEqual({ check: true });
    expect(ai.calls).toEqual([]);
  });

  it('"Check with AI": the local read, then one look by the model, whose read the snip gets', async () => {
    await snip('猫');
    const [entry] = history();
    await h.handlers.get('snip:history:update')!({}, entry.id, { status: 'done', text: '描', engine: 'web', confidence: 0.6 });
    h.paddleLangs = ['ja'];
    h.router = { ok: true, text: '描', lines: [], engine: 'web', engines: ['web'], lang: 'ja', confidence: 0.6, unsure: [] };
    ai.plan = { mode: 'check', providerId: 'claude-sonnet-5-5' };
    ai.read = { ok: true, text: '猫', lines: [], engine: 'ai:claude-sonnet-5-5', engines: ['web', 'ai:claude-sonnet-5-5'], lang: 'ja', confidence: 0.9, unsure: [] };
    expect(await h.handlers.get('snip:action')!({}, { id: entry.id, action: 'aiCheck' })).toBe(true);
    await mod.__snipToCardsTestables.settled();
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]).toMatchObject({ kind: 'check', providerId: 'claude-sonnet-5-5', local: { text: '描' } });
    const sent = mod.__snipToCardsTestables.pending().at(-1)!.payload as { ocr: { text: string; engine: string; engines: string[] } };
    expect(sent.ocr).toMatchObject({ text: '猫', engine: 'ai:claude-sonnet-5-5', engines: ['web', 'ai:claude-sonnet-5-5'] });
  });

  it('Always: the model reads even with no reader installed; when it fails, the bundled reader does, and the reason is kept', async () => {
    ai.plan = { mode: 'always', providerId: 'openai-compatible' };
    ai.read = { ok: true, text: '窓辺の猫', lines: [], engine: 'ai:openai-compatible', engines: ['ai:openai-compatible'], lang: 'ja', confidence: 0.9, unsure: [] };
    await snip('窓辺');
    let sent = mod.__snipToCardsTestables.pending().at(-1)!.payload as { ocr?: { text: string; engine: string }; basicOcr?: unknown };
    expect(ai.calls.map((c) => c.kind)).toEqual(['always']);
    expect(sent.ocr).toMatchObject({ text: '窓辺の猫', engine: 'ai:openai-compatible' });
    expect(sent.basicOcr).toBeUndefined();

    ai.read = { ok: false, text: '', lines: [], engine: 'none', engines: [], lang: 'ja', unsure: [], error: 'no-engine', aiError: 'network' };
    await snip('別');
    sent = mod.__snipToCardsTestables.pending().at(-1)!.payload as typeof sent;
    expect(sent.ocr).toBeUndefined();
    expect(sent.basicOcr).toBeTruthy();
    expect(history()[0].aiError).toBe('network');
  });

  it('Only when unsure: a sure local read is not sent to the model', async () => {
    h.paddleLangs = ['ja'];
    h.router = { ok: true, text: '猫が好き', lines: [], engine: 'web', engines: ['web'], lang: 'ja', confidence: 0.96, unsure: [] };
    ai.plan = { mode: 'unsure', providerId: 'gemini-2.5-flash' };
    await snip('猫');
    expect(ai.calls).toEqual([]);
    h.router = { ...h.router, confidence: 0.6 };
    await snip('犬');
    expect(ai.calls.map((c) => c.kind)).toEqual(['check']);
  });

  it('install and read again: downloads only what was clicked, and reads once everything is installed', async () => {
    await snip('过度');
    const [entry] = history();
    await h.handlers.get('snip:history:update')!({}, entry.id, { status: 'error', error: 'models-missing', lang: 'zh', installIds: ['paddle-ocr-zh'] });
    const pendingBefore = mod.__snipToCardsTestables.pending().length;
    expect(await h.handlers.get('snip:action')!({}, { id: entry.id, action: 'installReread', assets: ['paddle-ocr-zh', 'qwen3-1.7b'] })).toBe(true);
    // Only reader assets are accepted from IPC.
    expect(h.started).toEqual(['paddle-ocr-zh']);
    expect([...mod.__snipToCardsTestables.waitingForReaders().get(entry.id) ?? []].sort()).toEqual(['paddle-ocr-det', 'paddle-ocr-zh', 'paddle-ocr-zh-keys']);
    h.installed.add('paddle-ocr-zh');
    h.installedListener?.('paddle-ocr-zh');
    expect(mod.__snipToCardsTestables.pending()).toHaveLength(pendingBefore);
    h.installed = new Set(['paddle-ocr-zh', 'paddle-ocr-zh-keys', 'paddle-ocr-det']);
    h.paddleLangs = ['zh'];
    h.installedListener?.('paddle-ocr-det');
    await mod.__snipToCardsTestables.settled();
    expect(mod.__snipToCardsTestables.waitingForReaders().size).toBe(0);
    expect(mod.__snipToCardsTestables.pending().length).toBe(pendingBefore + 1);
    expect(history()[0]).toMatchObject({ id: entry.id, lang: 'zh', status: 'processing' });
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

describe('the poll does not decode a picture that sits on the clipboard (scorecard bug)', () => {
  it('bitmap only: re-checked on a back-off up to 2 s, not twice a second', async () => {
    await snip('猫');
    const after = mod.__snipToCardsTestables.decodes();
    // Ten seconds of 500 ms polls with the same picture still there.
    for (let i = 1; i <= 20; i += 1) mod.__snipToCardsTestables.tick(clock + i * 500);
    const extra = mod.__snipToCardsTestables.decodes() - after;
    // Was 20 (every poll). Back-off: 1 s, 2 s, 2 s, … → at most 6 in 10 s.
    expect(extra).toBeLessThanOrEqual(6);
    expect(extra).toBeGreaterThan(0);
    expect(history()).toHaveLength(1);
  });

  it('bitmap only: a new picture is still noticed within the back-off cap', async () => {
    await snip('猫');
    for (let i = 1; i <= 20; i += 1) mod.__snipToCardsTestables.tick(clock + i * 500);
    clock += 10_000;
    h.clip.image = new h.FakeImage('犬');
    // Same format list, so only the scheduled re-check can see it: within 2 s.
    for (let i = 1; i <= 4; i += 1) mod.__snipToCardsTestables.tick(clock + i * 500);
    await new Promise((r) => setTimeout(r, 0));
    await mod.__snipToCardsTestables.settled();
    expect(history()).toHaveLength(2);
  });

  it('with the raw PNG bytes: never decoded again while they stay, and a new snip is seen on the next poll', async () => {
    h.clip.raw = 'png-bytes-of-猫';
    await snip('猫');
    const after = mod.__snipToCardsTestables.decodes();
    for (let i = 1; i <= 40; i += 1) mod.__snipToCardsTestables.tick(clock + i * 500);
    expect(mod.__snipToCardsTestables.decodes()).toBe(after);
    clock += 20_000;
    h.clip.image = new h.FakeImage('犬');
    h.clip.raw = 'png-bytes-of-犬';
    mod.__snipToCardsTestables.tick(clock + 1);
    await new Promise((r) => setTimeout(r, 0));
    await mod.__snipToCardsTestables.settled();
    expect(mod.__snipToCardsTestables.decodes()).toBe(after + 1);
    expect(history()).toHaveLength(2);
  });

  it('no picture on the clipboard: nothing is decoded at all', () => {
    h.clip.text = 'just text';
    const before = mod.__snipToCardsTestables.decodes();
    for (let i = 1; i <= 10; i += 1) mod.__snipToCardsTestables.tick(clock + i * 500);
    expect(mod.__snipToCardsTestables.decodes()).toBe(before);
  });
});

describe('the first-run notice (shown once the learner has turned Snip to cards on)', () => {
  it('the first toast that reports cards carries the notice once, and main records it', async () => {
    expect((await h.handlers.get('snip:getStatus')!({})) as { notice: string }).toMatchObject({ enabled: true, autoAdd: true, notice: 'pending' });
    // A toast that added nothing does not use it up.
    await h.handlers.get('snip:toast:show')!({}, { id: 'snip-x', kind: 'none' });
    expect((await h.handlers.get('snip:toast:get')!({})) as { notice?: boolean }).not.toHaveProperty('notice');
    await h.handlers.get('snip:toast:show')!({}, { id: 'snip-x', kind: 'added', words: ['猫'], count: 1 });
    expect(await h.handlers.get('snip:toast:get')!({})).toMatchObject({ kind: 'added', notice: true });
    const stored = JSON.parse(fs.readFileSync(path.join(h.userData, 'snip-to-cards.json'), 'utf8'));
    expect(stored.notice).toBe('shown');
    await h.handlers.get('snip:toast:show')!({}, { id: 'snip-y', kind: 'added', words: ['犬'], count: 1 });
    expect((await h.handlers.get('snip:toast:get')!({})) as { notice?: boolean }).not.toHaveProperty('notice');
  });

  it('a renderer cannot force the notice, and Turn off answers it and stops watching', async () => {
    await h.handlers.get('snip:setSettings')!({}, { notice: 'answered' });
    await h.handlers.get('snip:toast:show')!({}, { id: 'snip-x', kind: 'added', count: 1, notice: true });
    expect((await h.handlers.get('snip:toast:get')!({})) as { notice?: boolean }).not.toHaveProperty('notice');
    const off = (await h.handlers.get('snip:setSettings')!({}, { enabled: false, notice: 'answered' })) as { enabled: boolean; notice: string; watching: boolean };
    expect(off).toMatchObject({ enabled: false, notice: 'answered', watching: false });
  });

  it('the notice toast is taller than a plain one (it carries the question)', async () => {
    await h.handlers.get('snip:toast:show')!({}, { id: 'snip-x', kind: 'added', words: ['猫'], count: 1 });
    const [toast] = h.FakeWindow.all;
    expect(Number(toast.opts.height)).toBeGreaterThan(200);
  });
});

describe('actions and patches are checked in main', () => {
  it('review, correction, re-analysis and deck actions are forwarded; malformed ones are refused', async () => {
    await snip('猫');
    const [entry] = history();
    h.main = new h.FakeWindow();
    await h.handlers.get('snip:ready')!({ sender: h.main.webContents });
    const act = (a: unknown) => h.handlers.get('snip:action')!({}, a);
    expect(await act({ id: entry.id, action: 'addWords', indices: [2, 0, 2, -1, 'x'] })).toBe(true);
    expect(await act({ id: entry.id, action: 'editWord', index: 0, reading: 'ねこ\u0007' })).toBe(true);
    expect(await act({ id: entry.id, action: 'reanalyze', text: '  未来の猫\r\n ' })).toBe(true);
    expect(await act({ id: entry.id, action: 'setDeck', deck: 'Manga::Vol 1' })).toBe(true);
    expect(await act({ id: entry.id, action: 'addWords', indices: [] })).toBe(false);
    expect(await act({ id: entry.id, action: 'editWord', index: 0 })).toBe(false);
    expect(await act({ id: entry.id, action: 'editWord', index: 0, lemma: '   ' })).toBe(false);
    expect(await act({ id: entry.id, action: 'reanalyze', text: '   ' })).toBe(false);
    expect(await act({ id: entry.id, action: 'removeWord', index: '1' })).toBe(false);
    expect(await act({ id: entry.id, action: 'format-disk' })).toBe(false);
    expect(h.main.webContents.sent.filter((s) => s.channel === 'snip:action').map((s) => s.payload)).toEqual([
      { id: entry.id, action: 'addWords', indices: [2, 0] },
      { id: entry.id, action: 'editWord', index: 0, reading: 'ねこ' },
      { id: entry.id, action: 'reanalyze', text: '未来の猫' },
      { id: entry.id, action: 'setDeck', deck: 'Manga::Vol 1' },
    ]);
  });

  it('a re-analysis can clear the old error; review, deck and the OCR text are kept', async () => {
    await snip('猫');
    const [entry] = history();
    const update = h.handlers.get('snip:history:update')!;
    await update({}, entry.id, { status: 'error', error: 'low-confidence', text: '末来' });
    const next = (await update({}, entry.id, {
      status: 'done', text: '未来', ocrText: '末来', review: 'manual', deck: 'Manga', clear: ['error', 'id'],
    })) as Record<string, unknown>;
    expect(next).toMatchObject({ status: 'done', text: '未来', ocrText: '末来', review: 'manual', deck: 'Manga' });
    expect(next).not.toHaveProperty('error');
    expect(next.id).toBe(entry.id);
  });
});

describe('v1 default: watching is off, older profiles are moved over once', () => {
  async function fresh(files: { settings?: unknown; index?: unknown; pictures?: string[] }): Promise<{ enabled: boolean; notice: string }> {
    fs.rmSync(h.userData, { recursive: true, force: true });
    fs.mkdirSync(h.userData, { recursive: true });
    if (files.settings !== undefined) fs.writeFileSync(path.join(h.userData, 'snip-to-cards.json'), JSON.stringify(files.settings));
    if (files.index !== undefined || files.pictures) {
      fs.mkdirSync(path.join(h.userData, 'snips'), { recursive: true });
      if (files.index !== undefined) fs.writeFileSync(path.join(h.userData, 'snips', 'index.json'), JSON.stringify(files.index));
      for (const name of files.pictures ?? []) fs.writeFileSync(path.join(h.userData, 'snips', name), 'png');
    }
    mod.stopSnipToCards();
    mod = await load();
    return (await h.handlers.get('snip:getStatus')!({})) as { enabled: boolean; notice: string };
  }
  const stored = () => JSON.parse(fs.readFileSync(path.join(h.userData, 'snip-to-cards.json'), 'utf8'));
  const oldEntry = { id: 'snip-old-1', createdAt: 1, lang: 'ja', status: 'done', width: 600, height: 120, bytes: 10, hash: 'h', text: '猫', words: [], cardIds: [], ankiNoteIds: [] };

  it('a new profile is off, nothing is read, and the decision is written once with the schema', async () => {
    expect(await fresh({})).toMatchObject({ enabled: false, notice: 'pending' });
    expect(stored()).toMatchObject({ schema: 2, enabled: false });
    await snip('猫');
    expect(history()).toHaveLength(0);
  });

  it('an old profile on by default that never snipped is turned off', async () => {
    expect(await fresh({ settings: { enabled: true, notice: 'pending', deck: 'Mine' } })).toMatchObject({ enabled: false });
    expect(stored()).toMatchObject({ schema: 2, enabled: false, deck: 'Mine' });
  });

  it('an old profile with snip history keeps watching (file or no file)', async () => {
    expect(await fresh({ index: { version: 1, entries: [oldEntry] } })).toMatchObject({ enabled: true });
    expect(await fresh({ settings: { enabled: true }, index: { version: 1, entries: [oldEntry] } })).toMatchObject({ enabled: true });
    // The index is unreadable but the pictures are there: still used.
    expect(await fresh({ index: 'garbage', pictures: ['snip-abc-1.png'] })).toMatchObject({ enabled: true });
  });

  it('an old profile that answered or saw the notice keeps watching; one that turned it off stays off', async () => {
    expect(await fresh({ settings: { enabled: true, notice: 'answered' } })).toMatchObject({ enabled: true, notice: 'answered' });
    expect(await fresh({ settings: { enabled: true, notice: 'shown' } })).toMatchObject({ enabled: true });
    expect(await fresh({ settings: { enabled: false, notice: 'answered' }, index: { version: 1, entries: [oldEntry] } })).toMatchObject({ enabled: false });
  });

  it('a choice made under the new default is never re-decided', async () => {
    expect(await fresh({ settings: { schema: 2, enabled: true } })).toMatchObject({ enabled: true });
    expect(await fresh({ settings: { schema: 2, enabled: false }, index: { version: 1, entries: [oldEntry] } })).toMatchObject({ enabled: false });
  });

  it('turning it on (first-run setup, Settings, tray) starts watching and the first cards carry the notice', async () => {
    await fresh({});
    const on = (await h.handlers.get('snip:setSettings')!({}, { enabled: true })) as { enabled: boolean; notice: string; watching: boolean };
    expect(on).toMatchObject({ enabled: true, notice: 'pending', watching: true });
    expect(stored()).toMatchObject({ schema: 2, enabled: true });
    await h.handlers.get('snip:toast:show')!({}, { id: 'snip-x', kind: 'added', words: ['猫'], count: 1 });
    expect(await h.handlers.get('snip:toast:get')!({})).toMatchObject({ notice: true });
  });
});
