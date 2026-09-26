// @vitest-environment jsdom
/**
 * The content script, run for real in a DOM with a Japanese-UI chrome stub:
 * - "Translate" on a Russian selection asks the app for ru → ja (the reader's
 *   language), not the old fixed ja → en;
 * - a missing translation model (the app's 503) is named in the UI language;
 * - an OCR whose models are still downloading, or missing, says so in the UI
 *   language — the app's English `error` used to win over both;
 * - Chinese / Russian study text is marked with its own `lang` (it was `ja`
 *   everywhere, drawing Chinese with Japanese glyph shapes).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createI18nStub, EXTENSION_DIR } from './extensionHarness';

type Listener = (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;

const sent: Array<Record<string, unknown>> = [];
const listeners: Listener[] = [];
let reply: (msg: Record<string, unknown>) => unknown = () => ({ ok: true });
const ja = createI18nStub('ja');

function run(file: string): void {
  // eslint-disable-next-line no-new-func -- evaluates the shipped classic script as the page would
  new Function(readFileSync(path.join(EXTENSION_DIR, file), 'utf8')).call(globalThis);
}

function deliver(msg: Record<string, unknown>): void {
  for (const l of listeners) l(msg, {}, () => undefined);
}

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeAll(() => {
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
        getURL: (p: string) => p,
        onMessage: { addListener: (fn: Listener) => listeners.push(fn), removeListener: () => undefined },
        sendMessage: (msg: Record<string, unknown>, cb?: (r: unknown) => void) => {
          sent.push(msg);
          const out = reply(msg);
          if (cb) setTimeout(() => cb(out), 0);
          return Promise.resolve(out);
        },
      },
      storage: {
        local: { get: async () => ({}), set: async () => undefined },
        onChanged: { addListener: () => undefined, removeListener: () => undefined },
      },
      i18n: ja,
    },
  });
  Object.defineProperty(window.navigator, 'language', { value: 'ja-JP', configurable: true });
  run('shared.js');
  run('settings.js');
  run('content.js');
});

describe('content script — messages in the page and UI language', () => {
  it('translates a Russian selection from ru into the reader language', async () => {
    document.body.innerHTML = '<p id="p">Я читаю книгу.</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p') as HTMLElement);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    reply = (msg) => (msg.type === 'translate' ? { ok: true, text: '本を読んでいます。' } : { ok: true });
    deliver({ type: 'jp-translate' });
    await flush();
    const call = sent.find((m) => m.type === 'translate');
    expect(call).toMatchObject({ text: 'Я читаю книгу.', source: 'ru', target: 'ja' });
  });

  it('names a missing translation model in the UI language', async () => {
    sent.length = 0;
    reply = (msg) => (msg.type === 'translate' ? { ok: false, status: 503, error: 'Translation model not installed' } : { ok: true });
    deliver({ type: 'jp-translate' });
    await flush();
    const toast = document.getElementById('jp-study-toast')?.textContent ?? '';
    expect(toast).toContain(ja.getMessage('content_rpTranslateFailed'));
    expect(toast).not.toContain('Translation model not installed');
  });

  it('says in the UI language that OCR models are downloading or missing', () => {
    deliver({ type: 'jp-show-ocr', result: { ok: false, available: false, downloading: true, error: 'Downloading web OCR models — try again in a moment.' } });
    const hint = () => document.querySelector('.jp-ocr-hint')?.textContent ?? '';
    expect(hint()).toBe(ja.getMessage('content_ocrDownloading'));
    deliver({ type: 'jp-show-ocr', result: { ok: false, available: false, error: 'No OCR models are installed — open Settings.' } });
    expect(hint()).toBe(ja.getMessage('content_ocrNoModels'));
    deliver({ type: 'jp-show-ocr', result: { ok: false, available: true, error: 'boom' } });
    expect(hint()).toBe('boom');
  });

  it('names a refused or missing microphone in the UI language', async () => {
    const fail = (name: string) => {
      Object.defineProperty(window.navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => { throw new DOMException('Permission denied', name); } },
      });
    };
    const toast = () => document.getElementById('jp-study-toast')?.querySelector('.jp-toast-text')?.textContent ?? '';
    fail('NotAllowedError');
    deliver({ type: 'jp-record-toggle' });
    await flush();
    expect(toast()).toBe(ja.getMessage('content_micDenied'));
    fail('NotFoundError');
    deliver({ type: 'jp-record-toggle' });
    await flush();
    expect(toast()).toBe(ja.getMessage('content_micUnavailable'));
  });

  it('looks Chinese up in Chinese on a page that says zh, whatever the level badge inferred', async () => {
    document.documentElement.lang = 'zh-CN';
    // The badge's language comes from sample text; a quoted Japanese line made it 'ja'.
    const badge = document.getElementById('jp-study-level-badge') ?? document.body.appendChild(Object.assign(document.createElement('span'), { id: 'jp-study-level-badge' }));
    badge.dataset.lang = 'ja';
    sent.length = 0;
    reply = () => ({ ok: true, entries: [] });
    deliver({ type: 'jp-lookup-selection', text: '学习' });
    for (let i = 0; i < 20 && !sent.some((m) => m.type === 'lookup'); i++) await flush();
    expect(sent.filter((m) => m.type === 'lookup').map((m) => m.lang)).toContain('zh');
    expect(sent.filter((m) => m.type === 'lookup').map((m) => m.lang)).not.toContain('ja');
    badge.dataset.lang = '';
    document.documentElement.lang = '';
  });

  it('heads the popup with the word the dictionary matched, not the whole scan window', async () => {
    document.documentElement.lang = 'zh-CN';
    // The app's Chinese lookup segments the window itself: 学习中文 is answered with 学习.
    reply = (msg) =>
      msg.type === 'lookup'
        ? { ok: true, entries: String(msg.query).startsWith('学习') ? [{ word: '学习', reading: 'xué xí', meanings: ['to study'] }] : [] }
        : { ok: true };
    deliver({ type: 'jp-lookup-selection', text: '学习中文' });
    for (let i = 0; i < 20 && !document.querySelector('#jp-study-popup.open .rp-entry-word'); i++) await flush();
    expect(document.querySelector('#jp-study-popup .rp-term')?.textContent).toBe('学习');
    document.documentElement.lang = '';
  });

  it('marks Chinese and Russian study text with its own lang, not ja', async () => {
    document.documentElement.lang = 'zh-CN';
    reply = (msg) =>
      msg.type === 'lookup'
        ? { ok: true, entries: String(msg.query) === '学习' ? [{ word: '学习', reading: 'xuéxí', meanings: ['to study'] }] : [] }
        : { ok: true };
    deliver({ type: 'jp-lookup-selection', text: '学习' });
    for (let i = 0; i < 20 && !document.querySelector('#jp-study-popup .rp-entry-word'); i++) await flush();
    expect(document.querySelector('#jp-study-popup .rp-term')?.getAttribute('lang')).toBe('zh-cn');
    expect(document.querySelector('#jp-study-popup .rp-entry-word')?.getAttribute('lang')).toBe('zh-cn');

    deliver({ type: 'jp-show-ocr', result: { ok: true, text: '我喜欢学习', lang: 'zh', engine: 'web' } });
    expect(document.querySelector('.jp-ocr-body')?.getAttribute('lang')).toBe('zh-cn');
    deliver({ type: 'jp-show-ocr', result: { ok: true, text: 'Я читаю книгу', lang: 'ru', engine: 'web' } });
    expect(document.querySelector('.jp-ocr-body')?.getAttribute('lang')).toBe('ru');
    document.documentElement.lang = '';
  });
});
