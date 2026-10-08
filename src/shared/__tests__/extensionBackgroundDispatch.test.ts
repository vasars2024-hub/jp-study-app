/*
 * extension/background.js — the MV3 service worker, driven through its own
 * public surface.
 *
 * Nothing in background.js is exported: it is a module whose entire API is the
 * `chrome.runtime.onMessage` listener it registers at load. So the harness
 * hands it a `chrome` stub, lets it register, and then sends it the same
 * messages the popup and the content script send. No production code moved.
 *
 * Three things are worth this effort:
 *
 *  1. `runCommand` is the single dispatch every surface funnels through. An id
 *     that stops routing does not fail at load — it throws "Unhandled command"
 *     the first time a user presses that wheel position. The file's own header
 *     records this class of bug shipping once already ("S.resolveCommandId is
 *     not a function" on every command, from an importScripts() mistake).
 *
 *  2. `isScriptableUrl` decides where the companion may act at all. It is
 *     reachable through the `list-tabs` message, which is how the reading list
 *     greys out a chrome:// tab.
 *
 *  3. `normalizeSrc` and the rest of the long-strip scanner live inside the
 *     function object handed to `chrome.scripting.executeScript`. That makes
 *     them unreachable by import — but the stub receives that function, and its
 *     free variables (`document`, `window`, `location`, `fetch`) resolve
 *     against the sandbox global. Installing a fake page there and calling it
 *     runs the real panel-collection logic against a page we control, which is
 *     the only way this code has ever been checked other than by loading a
 *     webtoon and squinting.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createChromeStub,
  evaluateBackground,
  loadExtensionSandbox,
  sendBackgroundMessage,
  type ChromeStub,
  type ExtensionSandbox,
  type JpStudySharedModule,
} from './extensionHarness';

/* ------------------------------- fake page -------------------------------- */

const PAGE_URL = 'https://reader.example/chapter/7/index.html';

interface Rect {
  top: number;
  width: number;
  height: number;
}

/** Minimal stand-in for a DOM element — only what the scanner actually reads. */
class FakeElement {
  tagName: string;
  attrs: Record<string, string>;
  rect: Rect;
  overflowY = 'visible';
  backgroundImage = 'none';
  scrollHeight = 0;
  clientHeight = 0;
  scrollTop = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  currentSrc = '';
  src = '';
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;

  constructor(tagName: string, init: Partial<FakeElement> & { attrs?: Record<string, string> } = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = init.attrs ?? {};
    this.rect = init.rect ?? { top: 0, width: 0, height: 0 };
    Object.assign(this, { ...init, attrs: this.attrs, rect: this.rect });
  }

  getAttribute(name: string): string | null {
    return name in this.attrs ? this.attrs[name] : null;
  }

  getBoundingClientRect(): { top: number; left: number; width: number; height: number } {
    return { top: this.rect.top, left: 0, width: this.rect.width, height: this.rect.height };
  }

  closest(selector: string): FakeElement | null {
    let node: FakeElement | null = this.parentElement;
    while (node) {
      if (node.tagName.toLowerCase() === selector) return node;
      node = node.parentElement;
    }
    return null;
  }

  querySelector(selector: string): FakeElement | null {
    return this.children.find((c) => c.tagName.toLowerCase() === selector) ?? null;
  }
}

function img(top: number, width: number, height: number, init: Partial<FakeElement> = {}): FakeElement {
  return new FakeElement('img', { rect: { top, width, height }, ...init });
}

/**
 * The page the scanner will walk. Tops are spaced so the expected output order
 * is unambiguous, and every entry exercises one branch of normalizeSrc.
 */
function buildPage(): { selectors: Record<string, FakeElement[]>; root: FakeElement } {
  const picture = new FakeElement('picture', { rect: { top: 6000, width: 800, height: 1200 } });
  const pictureImg = img(6000, 800, 1200);
  pictureImg.parentElement = picture;
  picture.children = [pictureImg];
  const pictureSource = new FakeElement('source', {
    attrs: { srcset: 'small.png 1x, large.png 3x' },
    rect: { top: 6000, width: 800, height: 1200 },
  });
  pictureSource.parentElement = picture;

  const images = [
    // 1. plain relative src → resolved against location.href
    img(0, 800, 1200, { src: 'panels/01.png' }),
    // 2. already absolute → passed through
    img(1200, 800, 1200, { src: 'https://cdn.example/p02.png' }),
    // 3. an SVG placeholder in src with the real panel in data-src: the
    //    lazy-loading trick normalizeSrc exists to see through
    img(2400, 800, 1200, {
      src: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      attrs: { 'data-src': 'panels/03.png' },
    }),
    // 4. srcset with width descriptors → the widest wins
    img(3600, 800, 1200, { attrs: { srcset: 'p04-320.png 320w, p04-1600.png 1600w, p04-800.png 800w' } }),
    // 5. a navigation icon → below the size floor, dropped
    img(100, 32, 32, { src: 'icons/next.png' }),
    // 6. the same URL as #2 further down the page → deduped to its topmost hit
    img(5000, 800, 1200, { src: 'https://cdn.example/p02.png' }),
    // 7. a blob panel → materialized into a data URL
    img(4800, 800, 1200, { src: 'blob:https://reader.example/good-blob' }),
    // 8. not yet decoded: zero size, source only in data-original
    img(4200, 0, 0, { attrs: { 'data-original': 'panels/08.png' } }),
    // 9. a blob too small to be a panel → materialize returns nothing
    img(7500, 800, 1200, { src: 'blob:https://reader.example/tiny-blob' }),
  ];

  const background = new FakeElement('div', {
    rect: { top: 7000, width: 800, height: 1200 },
    backgroundImage: 'url("panels/bg.png")',
    attrs: { style: 'background-image:url("panels/bg.png")' },
  });

  const root = new FakeElement('html', {
    rect: { top: 0, width: 1000, height: 800 },
    scrollHeight: 6000,
    clientHeight: 800,
  });

  return {
    root,
    selectors: {
      img: images,
      'picture source[srcset], source[data-srcset]': [pictureSource],
      '[style*="background"], [data-bg], [data-background]': [background],
      'div, main, section, article, ul, ol': [background],
    },
  };
}

interface BlobStub {
  size: number;
}

/** Globals the injected function will resolve against the sandbox. */
function pageGlobals(): Record<string, unknown> {
  const page = buildPage();
  const doc = {
    title: 'Chapter 7',
    scrollingElement: page.root,
    documentElement: page.root,
    body: page.root,
    querySelectorAll(selector: string): FakeElement[] {
      if (!(selector in page.selectors)) {
        throw new Error(`fake page has no answer for selector: ${selector}`);
      }
      return page.selectors[selector];
    },
  };
  class FakeFileReader {
    result = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL(blob: BlobStub): void {
      this.result = `data:image/png;base64,BLOB${blob.size}`;
      this.onload?.();
    }
  }
  return {
    Element: FakeElement,
    document: doc,
    location: { href: PAGE_URL },
    window: {
      innerWidth: 1000,
      innerHeight: 800,
      scrollY: 0,
      scrollTo: () => undefined,
    },
    getComputedStyle: (el: FakeElement) => ({
      overflowY: el.overflowY,
      backgroundImage: el.backgroundImage,
    }),
    FileReader: FakeFileReader,
    // The scanner sleeps between scroll steps; a pass-through timer keeps the
    // eight stagnant rounds it needs to settle from costing three real seconds.
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
  };
}

/* ------------------------------- the worker ------------------------------- */

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

interface Harness {
  chrome: ChromeStub;
  sandbox: ExtensionSandbox;
  shared: JpStudySharedModule;
  fetches: FetchCall[];
  sentToTab: Array<{ tabId: number; type: string }>;
  injected: Array<{ files?: string[]; hasFunc: boolean }>;
}

const ACTIVE_TAB = { id: 7, windowId: 1, url: 'https://example.com/article', title: 'An article', active: true };

function bootWorker(overrides: { tabs?: unknown[] } = {}): Harness {
  const chrome = createChromeStub({ jpStudyToken: 'tok', jpStudyPort: 18765 });
  const fetches: FetchCall[] = [];
  const sentToTab: Array<{ tabId: number; type: string }> = [];
  const injected: Array<{ files?: string[]; hasFunc: boolean }> = [];

  chrome.tabs.query = ((query: { url?: string }) => {
    // openTabPicker looks for its own already-open tab; everything else asks
    // for the active one.
    if (query && typeof query.url === 'string') return Promise.resolve([]);
    return Promise.resolve(overrides.tabs ?? [ACTIVE_TAB]);
  }) as Harness['chrome']['tabs']['query'];

  chrome.tabs.sendMessage = ((tabId: number, msg: { type: string }) => {
    sentToTab.push({ tabId, type: msg.type });
    if (msg.type === 'jp-get-save-payload') return Promise.resolve({ text: '猫が好き', mode: 'word' });
    if (msg.type === 'jp-get-audio-clipboard') {
      return Promise.resolve({ dataUrl: 'data:audio/webm;base64,AAAA', mimeType: 'audio/webm' });
    }
    return Promise.resolve({ ok: true });
  }) as Harness['chrome']['tabs']['sendMessage'];

  const sandbox = loadExtensionSandbox({
    chrome,
    globals: {
      fetch: (url: string, init?: { method?: string; body?: unknown }) => {
        fetches.push({ url, method: init?.method ?? 'GET', body: init?.body });
        if (url.startsWith('blob:')) {
          const size = url.endsWith('tiny-blob') ? 10 : 5000;
          return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve({ size }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      },
    },
  });

  chrome.scripting.executeScript = ((opts: {
    files?: string[];
    func?: () => Promise<unknown>;
  }) => {
    injected.push({ files: opts.files, hasFunc: typeof opts.func === 'function' });
    if (!opts.func) return Promise.resolve(undefined);
    // Run the injected function right here: its free variables resolve against
    // the sandbox global, where pageGlobals() has installed a fake page.
    return Promise.resolve(opts.func()).then((result) => [{ result }]);
  }) as Harness['chrome']['scripting']['executeScript'];

  evaluateBackground(sandbox);
  return { chrome, sandbox, shared: sandbox.jpStudyShared, fetches, sentToTab, injected };
}

describe('background service worker — it boots the way MV3 expects', () => {
  const h = bootWorker();

  it('registers exactly one handler for each browser event it needs', () => {
    expect(h.chrome.listeners.onMessage).toHaveLength(1);
    expect(h.chrome.listeners.onCommand).toHaveLength(1);
    expect(h.chrome.listeners.onInstalled).toHaveLength(1);
    expect(h.chrome.listeners.onAlarm).toHaveLength(1);
    expect(h.chrome.listeners.onContextMenuClicked).toHaveLength(1);
  });

  it('arms the retry-queue alarm on every wake, not just on install', () => {
    // The queue flush is the only thing that drains an offline save, so it must
    // be re-armed by top-level code — an onInstalled-only alarm dies with the
    // first service-worker eviction.
    expect(h.chrome.calls.filter((c) => c.api === 'alarms.create').length).toBeGreaterThan(0);
  });

  it('rebuilds the context menu from scratch on install', async () => {
    await h.chrome.listeners.onInstalled[0]();
    expect(h.chrome.calls.some((c) => c.api === 'contextMenus.removeAll')).toBe(true);
    expect(h.chrome.calls.filter((c) => c.api === 'contextMenus.create').length).toBeGreaterThan(0);
  });

  it('answers an unrecognised message instead of leaving the channel open', async () => {
    await expect(sendBackgroundMessage(h.chrome, { type: 'no-such-message' })).resolves.toEqual({
      ok: false,
      error: 'Unknown message',
    });
  });
});

describe('background service worker — every command still routes', () => {
  let h: Harness;
  beforeEach(() => {
    h = bootWorker();
  });

  const run = async (command: string): Promise<{ ok?: boolean; error?: string }> =>
    (await sendBackgroundMessage(h.chrome, { type: 'run-command', command })) as {
      ok?: boolean;
      error?: string;
    };

  it('dispatches every command in the registry', async () => {
    const unrouted: string[] = [];
    for (const cmd of h.shared.COMMANDS) {
      const res = await run(cmd.id);
      // A command may still fail for want of a page, a selection or the app —
      // what it must never do is fall off the end of the dispatch switch.
      if (/Unhandled command|Unknown command/.test(res.error ?? '')) unrouted.push(cmd.id);
    }
    expect(unrouted).toEqual([]);
  });

  it('actually completes every command that does not need a real page', async () => {
    // Without this the test above would still pass if each command failed for
    // some other reason. Two commands read the live DOM through an injected
    // function (no fake page installed in this describe block) and two need a
    // YouTube tab — `media.download` and, since MINING gate 11,
    // `media.transcribe`; the rest must come back ok.
    const needsRealPage = new Set([
      'capture.page',
      'capture.manga',
      'media.download',
      'media.transcribe',
    ]);
    const failures: Array<{ id: string; error?: string }> = [];
    for (const cmd of h.shared.COMMANDS) {
      if (needsRealPage.has(cmd.id)) continue;
      const res = await run(cmd.id);
      if (res.ok !== true) failures.push({ id: cmd.id, error: res.error });
    }
    expect(failures).toEqual([]);
  });

  it('declines Download video on a page that has no video', async () => {
    expect((await run('media.download')).error).toBe('Open a YouTube video or playlist tab first');
  });

  it('dispatches every legacy alias a stored wheel layout can still hold', async () => {
    const unrouted: string[] = [];
    for (const alias of Object.keys(h.shared.COMMAND_ALIASES)) {
      const res = await run(alias);
      if (/Unhandled command|Unknown command/.test(res.error ?? '')) unrouted.push(alias);
    }
    expect(unrouted).toEqual([]);
  });

  it('rejects an id that is not a command at all', async () => {
    expect((await run('ghost.command')).error).toBe('Unknown command: ghost.command');
    expect((await run('')).error).toBe('Unknown command: ');
  });

  it('forwards each page-side command as its own content-script message', async () => {
    const expected: Record<string, string> = {
      'lookup.selection': 'jp-lookup-selection',
      'translate.selection': 'jp-translate',
      'grammar.match': 'jp-grammar',
      'reader.theme': 'jp-toggle-theme',
      'reader.highlight': 'jp-highlight-mode-toggle',
      'reader.knownTint': 'jp-learning-toggle',
      'capture.ocr': 'jp-start-ocr-select',
      'capture.audio.record': 'jp-record-toggle',
      'wheel.more': 'jp-more-menu',
    };
    for (const [command, type] of Object.entries(expected)) {
      const fresh = bootWorker();
      const res = (await sendBackgroundMessage(fresh.chrome, { type: 'run-command', command })) as {
        ok?: boolean;
      };
      expect({ command, ok: res.ok }).toEqual({ command, ok: true });
      expect({ command, sent: fresh.sentToTab.map((s) => s.type) }).toEqual({
        command,
        sent: ['jp-ping', type],
      });
    }
  });

  it('routes the old "mine" ids onto the Save model, not somewhere new', async () => {
    for (const alias of ['mine', 'mine-auto', 'mine-word']) {
      const fresh = bootWorker();
      await sendBackgroundMessage(fresh.chrome, { type: 'run-command', command: alias });
      const posted = fresh.fetches.filter((f) => f.url.includes('/v1/mine'));
      expect({ alias, path: posted[0]?.url }).toEqual({
        alias,
        path: 'http://127.0.0.1:18765/v1/mine',
      });
      expect({ alias, mode: JSON.parse(String(posted[0]?.body)).mode }).toEqual({ alias, mode: 'word' });
    }
  });

  it('refuses a page-side command when there is no tab to send it to', async () => {
    const noTab = bootWorker({ tabs: [] });
    const res = (await sendBackgroundMessage(noTab.chrome, {
      type: 'run-command',
      command: 'lookup.selection',
    })) as { error?: string };
    expect(res.error).toBe('No active tab');
  });

  it('reaches the app over the pairing port with the stored token', async () => {
    await run('app.open');
    const call = h.fetches.find((f) => f.url.includes('/v1/ui/open'));
    expect(call?.url).toBe('http://127.0.0.1:18765/v1/ui/open');
    expect(JSON.parse(String(call?.body))).toEqual({ target: 'inbox' });
  });

  it('injects the same scripts the manifest declares when a page has none', async () => {
    // A tab that predates the install gets its content scripts programmatically;
    // if this list drifts from manifest content_scripts, those tabs run a
    // different extension from every other tab.
    const fresh = bootWorker();
    fresh.chrome.tabs.sendMessage = (() => Promise.reject(new Error('no receiver'))) as never;
    await sendBackgroundMessage(fresh.chrome, { type: 'run-command', command: 'reader.theme' });
    // First a probe (is content.js already there?), then the files, once.
    expect(fresh.injected[0]).toMatchObject({ hasFunc: true });
    const fileInjections = fresh.injected.filter((i) => i.files);
    expect(fileInjections).toHaveLength(1);
    expect(fileInjections[0].files).toEqual(['shared.js', 'settings.js', 'popup-css.js', 'content.js']);
  });
});

describe('background service worker — where the companion may act', () => {
  it('marks only http(s) tabs as selectable in the reading list', async () => {
    const h = bootWorker();
    h.chrome.windows.getLastFocused = (() =>
      Promise.resolve({
        tabs: [
          { id: 1, url: 'https://ncode.syosetu.com/n1234ab/', title: 'A novel' },
          { id: 2, url: 'http://example.com/', title: 'Plain http' },
          { id: 3, url: 'chrome://extensions', title: 'Extensions' },
          { id: 4, url: 'chrome-extension://abc/page.html', title: 'Another extension' },
          { id: 5, url: 'about:blank', title: 'Blank' },
          { id: 6, url: 'devtools://devtools/bundled/x.html', title: 'DevTools' },
          { id: 7, url: 'view-source:https://example.com/', title: 'Source' },
          { id: 8, url: 'https://chrome.google.com/webstore/detail/x', title: 'Web Store' },
          { id: 9, url: '', title: 'No URL yet' },
          { id: 10, url: 'file:///C:/book.html', title: 'Local file' },
        ],
      })) as never;

    const res = (await sendBackgroundMessage(h.chrome, { type: 'list-tabs' })) as {
      tabs: Array<{ id: number; selectable: boolean; category: string }>;
    };
    expect(res.tabs.map((t) => [t.id, t.selectable])).toEqual([
      [1, true],
      [2, true],
      [3, false],
      [4, false],
      [5, false],
      [6, false],
      [7, false],
      [8, false],
      [9, false],
      [10, false],
    ]);
  });

  it('does not classify a page it is not allowed to read', async () => {
    const h = bootWorker();
    h.chrome.windows.getLastFocused = (() =>
      Promise.resolve({
        tabs: [
          { id: 1, url: 'https://comic-days.com/episode/1', title: 'Manga' },
          { id: 2, url: 'chrome://extensions', title: 'manga' },
        ],
      })) as never;
    const res = (await sendBackgroundMessage(h.chrome, { type: 'list-tabs' })) as {
      tabs: Array<{ category: string; categoryLabel: string }>;
    };
    expect(res.tabs[0]).toMatchObject({ category: 'manga', categoryLabel: 'Manga' });
    // The chrome:// tab's title would otherwise trip the manga heuristic.
    expect(res.tabs[1]).toMatchObject({ category: 'other', categoryLabel: 'Webpage' });
  });

  it('hides the extension own pages from its reading list', async () => {
    const h = bootWorker();
    h.chrome.windows.getLastFocused = (() =>
      Promise.resolve({
        tabs: [
          { id: 1, url: 'https://example.com/', title: 'A page' },
          { id: 2, url: 'chrome-extension://testtesttest/tabs.html', title: 'Reading list' },
        ],
      })) as never;
    const res = (await sendBackgroundMessage(h.chrome, { type: 'list-tabs' })) as {
      tabs: Array<{ id: number }>;
    };
    expect(res.tabs.map((t) => t.id)).toEqual([1]);
  });
});

describe('background service worker — long-strip panel collection', () => {
  /** Run the real injected scanner against the fake page. */
  async function scan(): Promise<{ images: string[]; scanned: number; isLongStrip: boolean }> {
    const chrome = createChromeStub({ jpStudyToken: 'tok', jpStudyPort: 18765 });
    chrome.tabs.query = (() => Promise.resolve([ACTIVE_TAB])) as never;
    chrome.tabs.sendMessage = (() => Promise.resolve({ ok: true })) as never;
    const sandbox = loadExtensionSandbox({
      chrome,
      globals: {
        ...pageGlobals(),
        fetch: (url: string) => {
          if (url.startsWith('blob:')) {
            const size = url.endsWith('tiny-blob') ? 10 : 5000;
            return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve({ size }) });
          }
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
        },
      },
    });
    let scanResult: { images: string[]; scanned: number; isLongStrip: boolean } | null = null;
    chrome.scripting.executeScript = ((opts: { func?: () => Promise<unknown> }) => {
      if (!opts.func) return Promise.resolve(undefined);
      return Promise.resolve(opts.func()).then((result) => {
        scanResult = result as typeof scanResult;
        return [{ result }];
      });
    }) as never;
    evaluateBackground(sandbox);
    await sendBackgroundMessage(chrome, { type: 'scan-strip' });
    if (!scanResult) throw new Error('the injected scanner never ran');
    return scanResult;
  }

  it('collects the panels top to bottom, resolving every source shape', async () => {
    const { images } = await scan();
    expect(images).toEqual([
      // relative → absolute against the chapter URL
      'https://reader.example/chapter/7/panels/01.png',
      // absolute, and deduped against the identical img lower down the page
      'https://cdn.example/p02.png',
      // the SVG placeholder was skipped in favour of data-src
      'https://reader.example/chapter/7/panels/03.png',
      // widest srcset candidate
      'https://reader.example/chapter/7/p04-1600.png',
      // undecoded lazy node, source from data-original
      'https://reader.example/chapter/7/panels/08.png',
      // blob → data URL
      'data:image/png;base64,BLOB5000',
      // <picture><source srcset> with x descriptors → highest density
      'https://reader.example/chapter/7/large.png',
      // CSS url("…") background, unwrapped and resolved
      'https://reader.example/chapter/7/panels/bg.png',
    ]);
  });

  it('drops an SVG placeholder rather than importing a blank panel', async () => {
    const { images } = await scan();
    expect(images.some((src) => src.startsWith('data:image/svg'))).toBe(false);
  });

  it('drops navigation icons but keeps zero-sized lazy nodes', async () => {
    const { images } = await scan();
    expect(images.some((src) => src.includes('icons/next.png'))).toBe(false);
    expect(images).toContain('https://reader.example/chapter/7/panels/08.png');
  });

  it('keeps a repeated panel once, at its topmost position', async () => {
    const { images } = await scan();
    expect(images.filter((src) => src === 'https://cdn.example/p02.png')).toHaveLength(1);
    expect(images.indexOf('https://cdn.example/p02.png')).toBe(1);
  });

  it('discards a blob too small to be a real panel', async () => {
    const { images } = await scan();
    expect(images).not.toContain('data:image/png;base64,BLOB10');
  });

  it('recognises the page as a long strip and reports what it saw', async () => {
    const result = await scan();
    expect(result.isLongStrip).toBe(true);
    // Two of the collected URLs never became images (the tiny blob, and the
    // duplicate collapsed on the way in), so `scanned` is the wider count.
    expect(result.scanned).toBeGreaterThanOrEqual(result.images.length);
  });

  it('refuses the import rather than posting an empty page', async () => {
    const chrome = createChromeStub();
    chrome.tabs.query = (() => Promise.resolve([ACTIVE_TAB])) as never;
    const sandbox = loadExtensionSandbox({
      chrome,
      globals: { fetch: () => Promise.reject(new Error('should not be called')) },
    });
    chrome.scripting.executeScript = (() => Promise.resolve([{ result: null }])) as never;
    evaluateBackground(sandbox);
    const res = (await sendBackgroundMessage(chrome, { type: 'scan-strip' })) as { error?: string };
    expect(res.error).toBe('Could not scan this page');
  });
});
