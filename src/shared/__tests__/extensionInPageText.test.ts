/*
 * The extension's in-page UI (the lookup popup, card preview, radial wheel, page tools,
 * OCR overlay and AI panel that content.js and shared.js draw INTO web pages) speaks the
 * browser's language through chrome.i18n, like the toolbar popup and options pages already
 * did. Before this, ~150 of its strings were English literals in the scripts.
 *
 * Two checks: the AI panel rendered with the Japanese catalogue is Japanese; and a scan
 * of both scripts finds no English text node, title, aria-label or placeholder left in
 * markup, nor an English sentence handed to the page as a message.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createI18nStub, EXTENSION_DIR } from './extensionHarness';

interface Shared {
  AI_CATEGORY_LABELS: Record<string, string>;
  aiPanelHtml: (state: Record<string, unknown>) => string;
}

function loadShared(locale: string): Shared {
  const file = path.join(EXTENSION_DIR, 'shared.js');
  const sandbox: Record<string, unknown> = { URL, chrome: { i18n: createI18nStub(locale) } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file });
  return sandbox.jpStudyShared as Shared;
}

const STATE = {
  text: '私は学生だ。',
  lang: 'ja',
  uiLang: 'ja',
  status: 'ready',
  selected: 0,
  showTranslations: false,
  mine: 'idle',
  snapshot: 'idle',
  error: '',
  result: {
    sentence: '私は学生だ。',
    translations: { en: 'I am a student.' },
    annotations: [{ text: '学生', category: 'vocabulary', meaning: 'student', start: 2, end: 4 }],
    structure: 'Topic は, then a copula.',
  },
};

describe('extension in-page text', () => {
  it('the AI panel is drawn in the catalogue language', () => {
    const ja = loadShared('ja');
    expect(ja.AI_CATEGORY_LABELS.grammar).toBe('文法');
    const doc = new JSDOM(`<div>${ja.aiPanelHtml(STATE)}</div>`).window.document;
    const text = doc.body.textContent ?? '';
    for (const english of ['Recognized sentence', 'Structure', 'Shortcuts', 'Copy', 'Listen', 'Save whole sentence']) {
      expect(text, english).not.toContain(english);
    }
    expect(text).toContain('認識した文');
    expect(text).toContain('ショートカット');
    expect(doc.querySelector('.ai-badge')?.textContent).toBe('語彙');
    expect(doc.querySelector('[data-act="mine"]')?.textContent).toBe('単語カードに追加');

    const ru = loadShared('ru');
    const ruDoc = new JSDOM(`<div>${ru.aiPanelHtml({ ...STATE, status: 'loading' })}</div>`).window.document;
    expect(ruDoc.querySelector('.ai-loading')?.textContent).toBe('Разбираю предложение…');
  });

  it('no English UI literal is left in the in-page scripts', () => {
    const found: string[] = [];
    for (const name of ['content.js', 'shared.js']) {
      const lines = readFileSync(path.join(EXTENSION_DIR, name), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || /console\./.test(line)) return;
        // The command registry names each command in English for code readers; shared.js
        // replaces label/shortLabel/description from the catalogue at load (cmd_* keys).
        if (/^(label|shortLabel|description): '/.test(t)) return;
        // Markup: a text node, title, aria-label or placeholder that is an English word or phrase.
        const markup = /(?:>[A-Z][a-z]+(?: [a-z]+)*[:…]?<|(?:title|aria-label|placeholder)="[A-Z][a-z]+[^"$]*")/.exec(line);
        // A message: a quoted English sentence (three or more words) outside markup.
        const sentence = /(['`])[A-Z][a-z]+(?: [a-z'’]+){2,}[^'`]*\1/.exec(line);
        if (markup || sentence) found.push(`${name}:${i + 1}: ${t.slice(0, 120)}`);
      });
    }
    // The one allowed: the reload notice's last-resort English, for when chrome.i18n died
    // together with the extension context it is reporting.
    expect(found.filter((f) => !f.includes("'Extension reloaded — refresh this tab'"))).toEqual([]);
  });
});
