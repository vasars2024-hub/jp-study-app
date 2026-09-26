// @vitest-environment jsdom
/**
 * The content script, run for real in a DOM with a Japanese-UI chrome stub:
 * - "Translate" on a Russian selection asks the app for ru → ja (the reader's
 *   language), not the old fixed ja → en;
 * - a missing translation model (the app's 503) is named in the UI language;
 * - an OCR whose models are still downloading, or missing, says so in the UI
 *   language — the app's English `error` used to win over both.
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
});
