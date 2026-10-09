/*
 * extension/content.js, run for real in a fresh jsdom page per test.
 *
 * `runScripts: 'outside-only'` evaluates shared.js, settings.js and content.js
 * into ONE window, the way the manifest injects them (extensionHarness.ts
 * explains why a per-file wrapper would break their shared globals). The
 * chrome stub answers `chrome.runtime.sendMessage` in its callback form, the
 * one content.js uses, with a per-message reply and an optional per-message
 * delay — which is what lets a test reorder two lookups in flight.
 *
 * jsdom has no layout, so pointing at text is stubbed where the browser would
 * compute it: `document.caretRangeFromPoint` returns whatever node/offset the
 * last `hover()` named. The CSS Custom Highlight API is stubbed as a Map so a
 * test can see the highlight content.js registers without the page changing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createI18nStub, EXTENSION_DIR } from './extensionHarness';

export interface ContentMessage {
  type?: string;
  [key: string]: unknown;
}

export interface ContentHarnessOptions {
  /** Page body markup. */
  html: string;
  /** Answers a runtime message. Undefined → `{ ok: true }`. */
  reply?: (msg: ContentMessage) => unknown;
  /** Milliseconds before a message is answered (default 0). */
  delayMs?: (msg: ContentMessage) => number;
  /** Stored jpStudySettings (normalized by settings.js). */
  settings?: Record<string, unknown>;
  /** Extra chrome.storage.local keys (e.g. `jpLearn:<origin>`). */
  storage?: Record<string, unknown>;
  /** Runs on the window before the extension scripts (stub IntersectionObserver, …). */
  beforeScripts?: (win: Window & typeof globalThis & Record<string, unknown>) => void;
  url?: string;
}

export interface ContentHarness {
  window: Window & typeof globalThis;
  document: Document;
  /** Every runtime message content.js sent, in order. */
  sent: ContentMessage[];
  /** Deliver a message to content.js's runtime listener; resolves with its response. */
  deliver(msg: ContentMessage): Promise<unknown>;
  /** Write jpStudySettings the way the options page does, firing chrome.storage.onChanged. */
  changeSettings(next: Record<string, unknown>): void;
  /** Point at `node` (a text node) at `offset` with the hover key held. */
  hover(node: Node, offset: number, opts?: { holdKey?: boolean }): void;
  /** Hover-key + click at `node`/`offset`. */
  click(node: Node, offset: number, opts?: { withKey?: boolean }): MouseEvent;
  keyDown(key: string, init?: KeyboardEventInit, target?: EventTarget): KeyboardEvent;
  keyUp(key: string, init?: KeyboardEventInit): void;
  waitFor<T>(fn: () => T | null | undefined | false, timeoutMs?: number): Promise<T>;
  /** The popup element, when open. */
  popup(): HTMLElement | null;
  popupTerm(): string;
  /** The popup's closed shadow root (via the test hook). */
  popupRoot(): ShadowRoot | null;
  highlights(): Map<string, unknown>;
  hooks(): {
    lastHoverLatencyMs(): number;
    sanitizeDictHtml(html: string): string;
    popup(): HTMLElement | null;
    popupRoot(): ShadowRoot | null;
    [name: string]: unknown;
  };
  dispose(): void;
}

/** Pay jsdom's first-load cost in a beforeAll with its own timeout. */
export function warmContentDom(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM } = require('jsdom') as typeof import('jsdom');
  new JSDOM('<!doctype html><p></p>', { pretendToBeVisual: true }).window.close();
}

export async function loadContent(opts: ContentHarnessOptions): Promise<ContentHarness> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM } = require('jsdom') as typeof import('jsdom');
  const dom = new JSDOM(`<!doctype html><html lang="ja"><body>${opts.html}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: opts.url ?? 'https://news.example.jp/article',
  });
  const win = dom.window as unknown as Window & typeof globalThis & Record<string, unknown>;
  const doc = win.document;
  const sent: ContentMessage[] = [];
  const listeners: Array<(msg: unknown, sender: unknown, respond: (r: unknown) => void) => unknown> = [];
  const store: Record<string, unknown> = { ...(opts.storage ?? {}), jpStudySettings: opts.settings ?? {} };
  const storageListeners: Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void> = [];

  win.chrome = {
    runtime: {
      id: 'testtesttest',
      lastError: undefined,
      getURL: (p: string) => `chrome-extension://testtesttest/${p}`,
      onMessage: {
        addListener: (fn: (typeof listeners)[number]) => listeners.push(fn),
        removeListener: () => undefined,
      },
      sendMessage: (msg: ContentMessage, cb?: (r: unknown) => void) => {
        sent.push(msg);
        const out = opts.reply?.(msg);
        const delay = opts.delayMs?.(msg) ?? 0;
        if (cb) win.setTimeout(() => cb(out === undefined ? { ok: true } : out), delay);
        return undefined;
      },
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const out: Record<string, unknown> = {};
          for (const k of typeof keys === 'string' ? [keys] : keys) if (k in store) out[k] = store[k];
          return JSON.parse(JSON.stringify(out));
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, JSON.parse(JSON.stringify(items)));
        },
      },
      onChanged: {
        addListener: (fn: (typeof storageListeners)[number]) => storageListeners.push(fn),
        removeListener: () => undefined,
      },
    },
    i18n: createI18nStub('en'),
  };
  win.__JP_STUDY_TEST__ = true;

  // The CSS Custom Highlight API, as a Map (jsdom has none).
  const highlightMap = new Map<string, unknown>();
  (win as Record<string, unknown>).CSS = { highlights: highlightMap };
  (win as Record<string, unknown>).Highlight = class {
    ranges: unknown[];
    constructor(...ranges: unknown[]) {
      this.ranges = ranges;
    }
  };

  let caret: { node: Node; offset: number } | null = null;
  (doc as unknown as Record<string, unknown>).caretRangeFromPoint = () => {
    if (!caret) return null;
    const range = doc.createRange();
    range.setStart(caret.node, caret.offset);
    return range;
  };

  opts.beforeScripts?.(win);
  for (const file of ['shared.js', 'settings.js', 'popup-css.js', 'content.js']) {
    win.eval(readFileSync(path.join(EXTENSION_DIR, file), 'utf8'));
  }
  // Let loadCfg() read the stored settings.
  await new Promise((r) => win.setTimeout(r, 10));

  const mouse = (type: string, init: MouseEventInit, target: EventTarget = doc.body) => {
    const ev = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY: 50, ...init });
    target.dispatchEvent(ev);
    return ev;
  };

  const harness: ContentHarness = {
    window: win,
    document: doc,
    sent,
    deliver(msg) {
      return new Promise((resolve) => {
        let answered = false;
        const respond = (r: unknown) => {
          answered = true;
          resolve(r);
        };
        let keep = false;
        for (const l of listeners) if (l(msg, { id: 'testtesttest' }, respond) === true) keep = true;
        if (!keep && !answered) resolve(undefined);
      });
    },
    changeSettings(next) {
      store.jpStudySettings = JSON.parse(JSON.stringify(next));
      for (const l of storageListeners) l({ jpStudySettings: { newValue: store.jpStudySettings } }, 'local');
    },
    hover(node, offset, hoverOpts = {}) {
      caret = { node, offset };
      if (hoverOpts.holdKey !== false) {
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true }));
      }
      mouse('mousemove', { shiftKey: hoverOpts.holdKey !== false }, node.parentElement ?? doc.body);
    },
    click(node, offset, clickOpts = {}) {
      caret = { node, offset };
      const target = node.parentElement ?? doc.body;
      mouse('pointerdown', {}, target);
      return mouse('click', { shiftKey: clickOpts.withKey !== false, button: 0 }, target);
    },
    keyDown(key, init = {}, target = doc.body) {
      const ev = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(ev);
      return ev;
    },
    keyUp(key, init = {}) {
      doc.dispatchEvent(new win.KeyboardEvent('keyup', { key, bubbles: true, ...init }));
    },
    async waitFor(fn, timeoutMs = 2000) {
      const start = Date.now();
      for (;;) {
        const v = fn();
        if (v) return v as never;
        if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
        await new Promise((r) => win.setTimeout(r, 2));
      }
    },
    // The popup is in a CLOSED shadow root: only the debug-flag test hook reaches it.
    popup() {
      const el = harness.hooks()?.popup() ?? null;
      return el && el.classList.contains('open') ? el : null;
    },
    popupTerm() {
      return harness.hooks()?.popup()?.querySelector('.rp-term')?.textContent ?? '';
    },
    popupRoot() {
      return harness.hooks()?.popupRoot() ?? null;
    },
    highlights: () => highlightMap,
    hooks: () => (win as Record<string, unknown>).__jpStudyTestHooks as ReturnType<ContentHarness['hooks']>,
    dispose: () => win.close(),
  };
  return harness;
}

/** A tiny dictionary scan, the shape /v1/scan answers with: longest known prefix wins. */
export function fakeScan(words: Record<string, Record<string, unknown>>) {
  return (msg: ContentMessage): unknown => {
    if (msg.type !== 'scan') return undefined;
    const text = String(msg.text ?? '');
    for (let len = text.length; len >= 1; len -= 1) {
      const q = text.slice(0, len);
      if (words[q]) return { ok: true, matched: q, via: 'exact', entries: [{ word: q, via: 'exact', ...words[q] }] };
    }
    return { ok: true, matched: '', entries: [] };
  };
}
