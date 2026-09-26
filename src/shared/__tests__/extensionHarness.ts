/*
 * Loading the Chrome extension's plain-JS sources into a test.
 *
 * `extension/*.js` are classic browser scripts and an MV3 service-worker
 * module — no build step reaches them, and none of them export anything. They
 * publish onto `globalThis` (shared.js → jpStudyShared, settings.js →
 * jpStudySettings) or, in background.js's case, onto the `chrome.*` listener
 * registry. So the only honest way to test them is the one
 * extensionCaptureParity.test.ts already established: read the file, evaluate
 * it in a `node:vm` context we control, and reach the code through the same
 * surface the browser reaches it through.
 *
 * Nothing here modifies the extension. If a helper is closure-private and has
 * no listener/message path out of its file, it is not testable from here and
 * we say so in the test rather than restructuring 141 KB of working code.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/** The shipped extension folder (the one a user loads unpacked). */
export const EXTENSION_DIR = path.join(__dirname, '..', '..', '..', 'extension');
/** The bundled mirror used as an install fallback — must stay byte-identical. */
export const MIRROR_DIR = path.join(__dirname, '..', '..', 'main', 'chrome-extension');

export function readExtensionFile(name: string): string {
  return readFileSync(path.join(EXTENSION_DIR, name), 'utf8');
}

/* ------------------------------ chrome stubs ------------------------------ */

export interface I18nStub {
  getMessage(key: string, substitutions?: string | string[]): string;
  getUILanguage(): string;
}

/**
 * chrome.i18n over the shipped _locales/<locale>/messages.json, faithful on
 * what the extension relies on: an unknown key returns "", and $1…$9 in a
 * message are filled from the substitutions ($$ is a literal dollar).
 */
export function createI18nStub(locale = 'en'): I18nStub {
  const file = path.join(EXTENSION_DIR, '_locales', locale, 'messages.json');
  const catalogue = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { message: string }>;
  return {
    getMessage(key, substitutions) {
      const entry = catalogue[key];
      if (!entry) return '';
      const subs = substitutions == null ? [] : ([] as string[]).concat(substitutions);
      return entry.message.replace(/\$(\$|[1-9])/g, (_m, d: string) => (d === '$' ? '$' : (subs[Number(d) - 1] ?? '')));
    },
    getUILanguage: () => locale.replace('_', '-'),
  };
}

/** One catalogue message as the extension would show it ("" if the key is missing). */
export function extensionMessage(key: string, substitutions?: string[], locale = 'en'): string {
  return createI18nStub(locale).getMessage(key, substitutions);
}

type StorageQuery = string | string[] | Record<string, unknown> | null | undefined;

export interface StorageAreaStub {
  /** The backing store, readable and writable straight from the test. */
  data: Record<string, unknown>;
  get(keys?: StorageQuery): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

/**
 * chrome.storage.local is JSON-backed: values must be JSON-serializable and
 * come back as fresh plain objects. A JSON round-trip models that exactly, and
 * unlike structuredClone it does not care which vm realm the object came from.
 */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * chrome.storage.local, faithful on the two details that matter here:
 *  - an array-of-keys `get` omits absent keys rather than setting them to
 *    undefined, which is what settings.js's `data[KEY] || {}` fallbacks assume;
 *  - values cross the boundary structured-cloned in both directions, so a
 *    caller that mutates what `get` handed back cannot reach into the store.
 *    jpLoadSettings does exactly that (`raw.token = data.jpStudyToken`), and a
 *    by-reference stub would hide it.
 */
export function createStorageStub(seed: Record<string, unknown> = {}): StorageAreaStub {
  const data: Record<string, unknown> = clone(seed);
  return {
    data,
    get(keys?: StorageQuery) {
      if (keys == null) return Promise.resolve(clone(data));
      const isDefaults = !Array.isArray(keys) && typeof keys === 'object';
      const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out: Record<string, unknown> = {};
      for (const key of names) {
        if (key in data) out[key] = clone(data[key]);
        else if (isDefaults) out[key] = clone((keys as Record<string, unknown>)[key]);
      }
      return Promise.resolve(out);
    },
    set(items: Record<string, unknown>) {
      Object.assign(data, clone(items));
      return Promise.resolve();
    },
    remove(keys: string | string[]) {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete data[key];
      return Promise.resolve();
    },
    clear() {
      for (const key of Object.keys(data)) delete data[key];
      return Promise.resolve();
    },
  };
}

/** One recorded `chrome.*` call, so a test can assert on what was dispatched. */
export interface ChromeCall {
  api: string;
  args: unknown[];
}

export interface ListenerRegistry {
  onMessage: Array<(msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown>;
  onCommand: Array<(command: string) => unknown>;
  onInstalled: Array<() => unknown>;
  onAlarm: Array<(alarm: { name: string }) => unknown>;
  onContextMenuClicked: Array<(info: unknown, tab: unknown) => unknown>;
}

export interface ChromeStub {
  calls: ChromeCall[];
  listeners: ListenerRegistry;
  storage: { local: StorageAreaStub; onChanged: { addListener(fn: unknown): void } };
  /** Overridable per test — the default resolves with an empty tab list. */
  tabs: Record<string, (...args: never[]) => unknown>;
  windows: Record<string, (...args: never[]) => unknown>;
  scripting: Record<string, (...args: never[]) => unknown>;
  runtime: Record<string, unknown>;
  action: Record<string, (...args: never[]) => unknown>;
  alarms: Record<string, unknown>;
  contextMenus: Record<string, unknown>;
  commands: Record<string, unknown>;
  i18n: I18nStub;
}

/**
 * A `chrome` object complete enough for background.js to reach the bottom of
 * its top-level code (which registers five listeners and fires
 * `void ensureFlushAlarm()`), and for a test to then drive those listeners.
 */
export function createChromeStub(seed: Record<string, unknown> = {}): ChromeStub {
  const calls: ChromeCall[] = [];
  const record = <T>(api: string, result: T) => {
    return (...args: unknown[]): Promise<T> => {
      calls.push({ api, args });
      return Promise.resolve(result);
    };
  };
  const listeners: ListenerRegistry = {
    onMessage: [],
    onCommand: [],
    onInstalled: [],
    onAlarm: [],
    onContextMenuClicked: [],
  };
  const stub: ChromeStub = {
    calls,
    listeners,
    storage: {
      local: createStorageStub(seed),
      onChanged: { addListener: () => undefined },
    },
    tabs: {
      query: record('tabs.query', [] as unknown[]),
      sendMessage: record('tabs.sendMessage', undefined),
      create: record('tabs.create', { id: 1 }),
      update: record('tabs.update', { id: 1 }),
      get: record('tabs.get', { id: 1 }),
      captureVisibleTab: record('tabs.captureVisibleTab', ''),
    },
    windows: {
      getAll: record('windows.getAll', [] as unknown[]),
      getLastFocused: record('windows.getLastFocused', null),
      create: record('windows.create', { id: 1 }),
      update: record('windows.update', { id: 1 }),
    },
    scripting: {
      executeScript: record('scripting.executeScript', [{ result: null }]),
      insertCSS: record('scripting.insertCSS', undefined),
    },
    runtime: {
      lastError: undefined,
      getURL: (p: string) => `chrome-extension://testtesttest/${p}`,
      sendMessage: record('runtime.sendMessage', undefined),
      openOptionsPage: record('runtime.openOptionsPage', undefined),
      onMessage: { addListener: (fn: ListenerRegistry['onMessage'][number]) => listeners.onMessage.push(fn) },
      onInstalled: { addListener: (fn: () => unknown) => listeners.onInstalled.push(fn) },
    },
    action: {
      setBadgeText: record('action.setBadgeText', undefined),
      setBadgeBackgroundColor: record('action.setBadgeBackgroundColor', undefined),
    },
    alarms: {
      create: record('alarms.create', undefined),
      onAlarm: { addListener: (fn: (a: { name: string }) => unknown) => listeners.onAlarm.push(fn) },
    },
    contextMenus: {
      create: record('contextMenus.create', undefined),
      removeAll: (cb?: () => void) => {
        calls.push({ api: 'contextMenus.removeAll', args: [] });
        if (cb) cb();
      },
      onClicked: {
        addListener: (fn: (info: unknown, tab: unknown) => unknown) =>
          listeners.onContextMenuClicked.push(fn),
      },
    },
    i18n: createI18nStub(),
    commands: {
      getAll: record('commands.getAll', [] as unknown[]),
      onCommand: { addListener: (fn: (c: string) => unknown) => listeners.onCommand.push(fn) },
    },
  };
  return stub;
}

/* --------------------------- the settings model --------------------------- */

/** The v2 settings shape jpNormalizeSettings guarantees. */
export interface JpSettings {
  version: number;
  token: string;
  port: number;
  aiOnHighlight: boolean;
  aiOnOcr: boolean;
  aiMinChars: number;
  hoverLookup: boolean;
  hoverKey: string;
  hoverDelayMs: number;
  closeOnRelease: boolean;
  clickLookup: boolean;
  scanLength: number;
  lookupInEditable: boolean;
  popupWidth: number;
  popupFontSize: number;
  popupCompact: boolean;
  popupPinOnClick: boolean;
  saveDestination: 'app' | 'both';
  folderLabel: string;
  confirmBeforeCard: boolean;
  youtubeMode: 'metadata' | 'download';
  youtubeAudioOnly: boolean;
  wheelEnabled: boolean;
  wheelSlots: string[];
  fabVisible: boolean;
  fabStartCollapsed: boolean;
  fabCorner: string;
  fabShowLevel: boolean;
  fabShowComprehensibility: boolean;
  fabShowTheme: boolean;
  fabShowHighlight: boolean;
  fabShowLearn: boolean;
  fabShowOcr: boolean;
  fabHiddenOrigins: string[];
  logImmersion: boolean;
  notes: string;
}

export interface JpStudySettingsModule {
  KEY: string;
  VERSION: number;
  DEFAULTS: JpSettings;
  WHEEL_POSITIONS: string[];
  DEFAULT_WHEEL_SLOTS: string[];
  HOVER_KEYS: string[];
  normalize(raw: unknown): JpSettings;
  migrate(raw: unknown): Record<string, unknown>;
  load(): Promise<JpSettings>;
  // A whole loaded JpSettings is a legal argument here — that is what
  // chrome.runtime.onInstalled passes — so the union, not just the index type.
  save(partial: Partial<JpSettings> | Record<string, unknown>): Promise<JpSettings>;
}

export interface JpCommand {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  category: string;
  contexts: string[];
  wheel: boolean;
  contextMenu: boolean;
}

export interface JpStudySharedModule {
  DEFAULT_PORT: number;
  NEWS_HOST_SUFFIXES: string[];
  NOVEL_HOST_SUFFIXES: string[];
  MANGA_HOST_SUFFIXES: string[];
  COMMANDS: JpCommand[];
  COMMAND_ALIASES: Record<string, string>;
  parseYoutubePlaylistId(url: string): string | null;
  parseYoutubeVideoId(url: string): string | null;
  detectPageKind(url: string): string;
  detectContentCategory(url: string, opts?: { title?: string; html?: string }): string;
  contentCategoryLabel(category: string): string;
  classifyMineSelection(text: string): string;
  primaryAction(kind: string): string;
  resolveCommandId(id: string): string | null;
  getCommand(id: string): JpCommand | null;
  wheelAssignableCommands(): JpCommand[];
  commandAvailableOnPage(id: string, pageKind: string, category: string): boolean;
  savePrimaryDestination(destination: string, forceAnki?: boolean): string;
  saveWorkingMessage(destination: string, forceAnki?: boolean): string;
  formatSaveResultMessage(res: unknown): string;
  formatClipboardResultMessage(res: unknown): string;
  formatCaptureResultMessage(res: unknown): string;
  detectSentenceBounds(text: string, offset: number): { start: number; end: number };
  sentenceAt(text: string, offset: number, maxLen?: number): string;
  langTagToOcrLang(tag: unknown): string;
  detectScriptLang(text: unknown): string;
  detectPageLangHint(opts: unknown): string;
}

export interface ExtensionSandbox extends Record<string, unknown> {
  jpStudyShared: JpStudySharedModule;
  jpStudySettings: JpStudySettingsModule;
}

export interface LoadOptions {
  /** Which extension scripts to evaluate, in order. Default: shared then settings. */
  files?: string[];
  /** Injected as `chrome` before any script runs. */
  chrome?: unknown;
  /** Extra globals the scripts (or a captured injected function) will read. */
  globals?: Record<string, unknown>;
}

/**
 * Evaluate extension scripts in one shared vm context, the way the manifest
 * loads them (shared.js first — settings.js reads globalThis.jpStudyShared).
 */
export function loadExtensionSandbox(options: LoadOptions = {}): ExtensionSandbox {
  const files = options.files ?? ['shared.js', 'settings.js'];
  const sandbox: Record<string, unknown> = {
    // shared.js parses URLs; settings.js and background.js do not inherit these
    // from the outer Node global, so hand them over explicitly.
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...(options.globals ?? {}),
  };
  sandbox.globalThis = sandbox;
  // Without a full stub the pages still get chrome.i18n, as every extension
  // context does, so shared.js resolves its strings to the English catalogue.
  sandbox.chrome = options.chrome ?? { i18n: createI18nStub() };
  vm.createContext(sandbox);
  for (const file of files) {
    const filePath = path.join(EXTENSION_DIR, file);
    vm.runInContext(readFileSync(filePath, 'utf8'), sandbox, { filename: filePath });
  }
  return sandbox as ExtensionSandbox;
}

/**
 * Read a module-private top-level `const` out of an already-loaded sandbox.
 *
 * Top-level `const`/`let` in a vm script land in the context's global *lexical*
 * scope, not on the global object — so `sandbox.JP_V1_SLOT_MAP` is undefined
 * but evaluating the bare identifier in the same context resolves it. This is
 * how a private constant gets pinned by a test without exporting it.
 */
export function evalInSandbox<T>(sandbox: ExtensionSandbox, expression: string): T {
  return vm.runInContext(expression, sandbox) as T;
}

/**
 * background.js is an ES module (`"type": "module"` in the manifest) whose only
 * imports are the two side-effect-only scripts we have already evaluated into
 * this context. Drop exactly those two lines and run the rest inside a function
 * wrapper — a module body is function-scoped anyway, so this is *more* faithful
 * than running it as a global script, and it keeps `const DEFAULT_PORT` from
 * colliding with shared.js's identically named global.
 *
 * The assertion on the import count is the point: if background.js ever grows a
 * real import, this fails loudly instead of silently testing a stale shape.
 */
export function evaluateBackground(sandbox: ExtensionSandbox): void {
  const filePath = path.join(EXTENSION_DIR, 'background.js');
  const source = readFileSync(filePath, 'utf8');
  const sideEffectImports = source.match(/^import '\.\/(?:shared|settings)\.js';$/gm) ?? [];
  if (sideEffectImports.length !== 2) {
    throw new Error(
      `extension/background.js: expected exactly 2 side-effect imports, found ${sideEffectImports.length}. ` +
        'If it now imports something with bindings, this harness needs updating.',
    );
  }
  const body = source.replace(/^import '\.\/(?:shared|settings)\.js';$/gm, '');
  vm.runInContext(`(function () {\n${body}\n})();`, sandbox, { filename: filePath });
}

/* ------------------------- a driveable worker boot ------------------------ */

/**
 * What the stubbed `fetch` should do for one call. `'network-error'` models the
 * only failure `fetch` itself produces — a rejected promise, which is what the
 * browser gives you when nothing is listening on 127.0.0.1 — and is therefore
 * the only way to reach apiFetch's `offline` branch.
 */
export type StubResponse =
  | 'network-error'
  | {
      status: number;
      json?: unknown;
      /** For `fetch(dataUrl)` — the OCR crop path reads the body as a blob. */
      blob?: unknown;
    };

export type Responder = (url: string, init: { method: string; body: unknown }) => StubResponse;

export interface FetchLog {
  url: string;
  method: string;
  body: unknown;
  /** Absent for the bare `fetch` calls that bypass apiFetch (the health probe). */
  headers?: Record<string, string>;
}

/** One entry of `chrome.storage.local.jpStudyRetryQueue`. */
export interface QueuedItem {
  kind: string;
  payload: Record<string, unknown>;
  at?: number;
  /** How many times the app answered and refused this item. Absent before the first. */
  attempts?: number;
}

export const RETRY_QUEUE_KEY = 'jpStudyRetryQueue';

export const DEFAULT_TAB = {
  id: 7,
  windowId: 1,
  url: 'https://example.com/article',
  title: 'An article',
  active: true,
};

export interface BootOptions {
  /** Extra chrome.storage.local seed, merged over the paired-app defaults. */
  seed?: Record<string, unknown>;
  /** The tab `chrome.tabs.query({active:true})` answers with. `null` for none. */
  tab?: Record<string, unknown> | null;
  /** Initial fetch behaviour; swap later with `respond()`. Default: 200 `{ok:true}`. */
  responder?: Responder;
  /** Replies for `chrome.tabs.sendMessage`, keyed off the message type. */
  onTabMessage?: (msg: { type: string } & Record<string, unknown>) => unknown;
  /** Extra sandbox globals (OffscreenCanvas, createImageBitmap, …). */
  globals?: Record<string, unknown>;
}

export interface BackgroundHarness {
  chrome: ChromeStub;
  sandbox: ExtensionSandbox;
  shared: JpStudySharedModule;
  /** Every request background.js made, in order. */
  fetches: FetchLog[];
  sentToTab: Array<{ tabId: number; type: string; msg: Record<string, unknown> }>;
  /** Swap the fetch behaviour mid-test (app goes down, token expires, …). */
  respond(fn: Responder): void;
  send(msg: unknown): Promise<unknown>;
  /** The retry queue as it sits in storage right now. */
  queue(): QueuedItem[];
  /** Plant a queue, the way an older build or an earlier session would have. */
  setQueue(items: QueuedItem[]): void;
  /** Text of the most recent `chrome.action.setBadgeText`, or null if never set. */
  badgeText(): string | null;
  /** Every badge text ever set, in order. */
  badgeHistory(): string[];
}

/**
 * Boot background.js against a `chrome` stub and a programmable `fetch`.
 *
 * This is the same shape extensionBackgroundDispatch.test.ts builds by hand;
 * the difference is that `respond()` lets a test change what the app does
 * between two messages, which is what the retry queue and the error taxonomy
 * both need (save while offline, then flush while online).
 */
export function bootBackground(options: BootOptions = {}): BackgroundHarness {
  const chromeStub = createChromeStub({
    jpStudyToken: 'tok',
    jpStudyPort: 18765,
    ...(options.seed ?? {}),
  });
  const fetches: FetchLog[] = [];
  const sentToTab: Array<{ tabId: number; type: string; msg: Record<string, unknown> }> = [];
  let responder: Responder = options.responder ?? (() => ({ status: 200, json: { ok: true } }));

  const tab = options.tab === undefined ? DEFAULT_TAB : options.tab;
  chromeStub.tabs.query = ((query: { url?: string }) => {
    // openTabPicker looks for its own already-open tab; everything else asks
    // for the active one.
    if (query && typeof query.url === 'string') return Promise.resolve([]);
    return Promise.resolve(tab ? [tab] : []);
  }) as ChromeStub['tabs']['query'];

  chromeStub.tabs.sendMessage = ((tabId: number, msg: { type: string } & Record<string, unknown>) => {
    sentToTab.push({ tabId, type: msg.type, msg });
    return Promise.resolve(options.onTabMessage?.(msg) ?? { ok: true });
  }) as ChromeStub['tabs']['sendMessage'];

  const fetchStub = (
    url: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) => {
    const call = { url, method: init.method ?? 'GET', body: init.body, headers: init.headers };
    fetches.push(call);
    const answer = responder(url, call);
    if (answer === 'network-error') {
      // Chrome rejects with a TypeError when the connection is refused; that
      // rejection is the whole of apiFetch's offline signal.
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: () =>
        answer.json === undefined
          ? Promise.reject(new SyntaxError('Unexpected end of JSON input'))
          : Promise.resolve(answer.json),
      blob: () =>
        answer.blob === undefined
          ? Promise.reject(new TypeError('no blob body in this stub response'))
          : Promise.resolve(answer.blob),
    });
  };

  const sandbox = loadExtensionSandbox({
    chrome: chromeStub,
    globals: { fetch: fetchStub, ...(options.globals ?? {}) },
  });
  evaluateBackground(sandbox);

  const badgeHistory = (): string[] =>
    chromeStub.calls
      .filter((c) => c.api === 'action.setBadgeText')
      .map((c) => String((c.args[0] as { text?: unknown })?.text ?? ''));

  return {
    chrome: chromeStub,
    sandbox,
    shared: sandbox.jpStudyShared,
    fetches,
    sentToTab,
    respond: (fn: Responder) => {
      responder = fn;
    },
    send: (msg: unknown) => sendBackgroundMessage(chromeStub, msg),
    queue: () => (chromeStub.storage.local.data[RETRY_QUEUE_KEY] as QueuedItem[]) ?? [],
    setQueue: (items: QueuedItem[]) => {
      chromeStub.storage.local.data[RETRY_QUEUE_KEY] = JSON.parse(JSON.stringify(items));
    },
    badgeText: () => {
      const history = badgeHistory();
      return history.length ? history[history.length - 1] : null;
    },
    badgeHistory,
  };
}

/** Send a message through background.js's `chrome.runtime.onMessage` listener. */
export function sendBackgroundMessage(chromeStub: ChromeStub, msg: unknown): Promise<unknown> {
  const listener = chromeStub.listeners.onMessage[0];
  if (!listener) throw new Error('background.js registered no onMessage listener');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no response for ${JSON.stringify(msg)}`)), 5000);
    const keepAlive = listener(msg, {}, (response: unknown) => {
      clearTimeout(timer);
      resolve(response);
    });
    // The listener returns true to keep the channel open for its async body;
    // anything else means it did not recognise the message.
    if (keepAlive !== true) {
      clearTimeout(timer);
      reject(new Error(`background.js did not claim message ${JSON.stringify(msg)}`));
    }
  });
}

/* ------------------------------ popup sandbox ------------------------------ */

/**
 * popup.js is the one extension surface a `node:vm` context cannot host: every
 * line of its top-level code is `document.getElementById(...)`, and its whole
 * output is DOM. So the existing sandbox could only ever assert on its SOURCE —
 * which is how three tests ended up grepping for a template literal instead of
 * checking what it renders.
 *
 * This loads the real popup.html and the real three scripts, in the manifest's
 * order, into one jsdom window, and lets a test read the DOM the user sees.
 * `runScripts: 'outside-only'` is what makes it faithful: every `window.eval`
 * shares ONE global scope, so `shared.js`'s top-level `const` is visible to
 * popup.js exactly as it is in a browser. (Wrapping each file in its own
 * function — the obvious alternative — silently breaks that and the scripts
 * stop seeing each other.)
 */
export interface PopupOptions {
  /** Answers `chrome.runtime.sendMessage`. Return undefined for "no response". */
  respond?: (msg: JpMessage) => unknown;
  /** Answers `chrome.tabs.sendMessage` — the content script's page scan. */
  tabRespond?: (msg: JpMessage) => unknown;
  /** What `chrome.tabs.query` resolves to. Default: one active tab, id 1. */
  tabs?: unknown[];
  /** Seed for `chrome.storage.local`, which settings.js reads on load. */
  seed?: Record<string, unknown>;
  /**
   * Collapse the window's `setTimeout` delays to 0.
   *
   * `followTranscription` sleeps `TRANSCRIBE_POLL_MS` (4 s) up to
   * `TRANSCRIBE_POLL_LIMIT` (300) times, so its loop is unreachable in a test at
   * real speed. Delays are collapsed rather than faked with a virtual clock
   * because popup.js reads `Date.now()` for the elapsed counter, and a virtual
   * clock that moved one but not the other would report times that cannot occur.
   * Ordering is preserved; only the waiting is removed.
   */
  fastPoll?: boolean;
}

export interface JpMessage {
  type?: string;
  [key: string]: unknown;
}

export interface PopupHarness {
  window: Window & typeof globalThis;
  document: Document;
  chrome: ChromeStub;
  /** Every message popup.js sent, in order — the request side of the contract. */
  sent: JpMessage[];
  /** Let the init IIFE and its awaited round trips run to completion. */
  settle(ticks?: number): Promise<void>;
  /** `textContent` of the first match, trimmed; '' when absent. */
  text(selector: string): string;
  /** The rendered `.pill` chips, in DOM order — what the popup actually shows. */
  pills(): string[];
  /** Click a rendered `button[data-action="…"]`; throws if it is not on screen. */
  clickAction(action: string): void;
  /** Close the window so `followTranscription`'s poll timer cannot outlive the test. */
  dispose(): void;
}

/**
 * Pay jsdom's one-time cost up front, in a hook with its own budget.
 *
 * The first `require('jsdom')` in a fresh worker measured 21 s on this machine
 * (647 of jsdom's own files plus undici/css-tree/parse5, read through the
 * worktree's node_modules junction and scanned by Defender), and the first
 * `new JSDOM(...)` another ~1 s. Charged to whichever test ran first, that
 * alone blew its 20 s timeout — `extensionPopup.test.ts:70` failed even when
 * run on its own. Call this from `beforeAll(..., generousTimeout)`.
 */
export function warmPopupDom(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM } = require('jsdom') as typeof import('jsdom');
  new JSDOM('<!doctype html><p></p>').window.close();
}

export function loadPopupSandbox(options: PopupOptions = {}): PopupHarness {
  // Required lazily: jsdom is heavy and every other consumer of this module
  // runs in a plain node context that must not pay for it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM } = require('jsdom') as typeof import('jsdom');
  const dom = new JSDOM(readExtensionFile('popup.html'), {
    runScripts: 'outside-only',
    url: 'chrome-extension://testtesttest/popup.html',
  });
  const win = dom.window as unknown as Window & typeof globalThis;
  const sent: JpMessage[] = [];
  const chromeStub = createChromeStub(options.seed ?? {});

  // popup.js uses the CALLBACK form of sendMessage and reads `runtime.lastError`
  // after it; createChromeStub's promise form would leave every `send()` pending
  // forever. Same object otherwise, so storage/listeners stay shared.
  chromeStub.runtime.sendMessage = (msg: JpMessage, cb?: (r: unknown) => void) => {
    chromeStub.calls.push({ api: 'runtime.sendMessage', args: [msg] });
    sent.push(msg);
    const res = options.respond?.(msg);
    // Asynchronous on purpose: a synchronous callback would hide any ordering
    // bug where popup.js reads the DOM before its own await resumes.
    if (cb) setTimeout(() => cb(res), 0);
    return undefined;
  };
  chromeStub.tabs.query = ((): Promise<unknown[]> =>
    Promise.resolve(options.tabs ?? [{ id: 1, active: true }])) as never;
  chromeStub.tabs.sendMessage = ((_tabId: number, msg: JpMessage): Promise<unknown> =>
    Promise.resolve(options.tabRespond?.(msg))) as never;

  (win as unknown as Record<string, unknown>).chrome = chromeStub;
  if (options.fastPoll) {
    const real = win.setTimeout.bind(win);
    (win as unknown as Record<string, unknown>).setTimeout = (fn: () => void, _ms?: number, ...rest: unknown[]) =>
      real(fn as never, 0, ...(rest as never[]));
  }
  for (const file of ['shared.js', 'settings.js', 'popup.js']) {
    win.eval(readExtensionFile(file));
  }

  const settle = async (ticks = 12) => {
    for (let i = 0; i < ticks; i += 1) await new Promise((r) => setTimeout(r, 0));
  };
  return {
    window: win,
    document: win.document,
    chrome: chromeStub,
    sent,
    settle,
    text: (selector) => win.document.querySelector(selector)?.textContent?.trim() ?? '',
    pills: () =>
      Array.from(win.document.querySelectorAll('.pill')).map((el) => (el.textContent ?? '').trim()),
    clickAction: (action) => {
      const btn = win.document.querySelector(`button[data-action="${action}"]`);
      if (!btn) {
        const offered = Array.from(win.document.querySelectorAll('button[data-action]'))
          .map((b) => (b as HTMLElement).dataset.action)
          .join(', ');
        // Naming what IS offered turns "the click did nothing" into a diagnosis:
        // renderActions is page-kind dependent and the fixture is usually why.
        throw new Error(`popup offers no "${action}" action. Rendered: [${offered || 'none'}]`);
      }
      (btn as HTMLElement).click();
    },
    dispose: () => win.close(),
  };
}
