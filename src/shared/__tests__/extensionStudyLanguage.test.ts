// The browser extension reads Chinese and Russian pages in their own language:
// a hover over a Cyrillic word finds the word, the lookup tells the app the
// page's language, and the pop-up speaks with that language's voice. The
// in-app copy of the extension stays byte-identical to extension/.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootBackground, readExtensionFile } from './extensionHarness';

const ROOT = path.join(__dirname, '..', '..', '..');

describe('extension lookups carry the page language', () => {
  it('the background bridge forwards the lang the content script sends', async () => {
    const h = bootBackground({ responder: () => ({ status: 200, json: { ok: true, entries: [] } }) });
    await h.send({ type: 'lookup', query: 'книги', lang: 'ru' });
    const call = h.fetches.find((entry) => entry.url.endsWith('/v1/lookup'));
    expect(JSON.parse(String(call?.body))).toEqual({ query: 'книги', lang: 'ru' });
  });

  it('the content script accepts Cyrillic words and speaks each language with its voice', () => {
    const content = readExtensionFile('content.js');
    const wordChar = content.match(/function isLatinWordChar\(ch\) \{\s*return (\/[^\n]+\/u)\.test/);
    expect(wordChar).toBeTruthy();
    // eslint-disable-next-line no-new-func -- evaluates the literal exactly as the extension ships it
    const re = new Function(`return ${(wordChar as RegExpMatchArray)[1]};`)() as RegExp;
    expect(re.test('к')).toBe(true);
    expect(re.test('é')).toBe(true);
    expect(re.test(' ')).toBe(false);
    expect(content).toContain("lang === 'zh' ? 'zh-CN' : lang === 'ru' ? 'ru-RU' : 'ja-JP'");
    expect(content).not.toContain("u.lang = /[぀-ヿ]/.test(text) ? 'ja-JP' : 'ja-JP'");
  });

  it('the in-app copy is byte-identical', () => {
    for (const file of ['content.js', 'background.js']) {
      const a = readFileSync(path.join(ROOT, 'extension', file));
      const b = readFileSync(path.join(ROOT, 'src', 'main', 'chrome-extension', file));
      expect(a.equals(b), file).toBe(true);
    }
  });
});
