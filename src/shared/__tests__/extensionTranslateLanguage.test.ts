// "Translate" and the Examples tab in the browser extension work in the page's
// language. Both used to be Japanese-only: every translation was requested as
// source 'ja' → 'en' (a Russian or Chinese sentence came back wrong or refused),
// and the Examples tab searched the Japanese corpus for a Russian word.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootBackground, loadExtensionSandbox, readExtensionFile } from './extensionHarness';

type TranslateLangs = (text: string, pageHint: string, uiLang: string) => { source: string; target: string };

function translateLangs(): TranslateLangs {
  const sandbox = loadExtensionSandbox({ files: ['shared.js'] });
  return (sandbox.jpStudyShared as unknown as { translateLangs: TranslateLangs }).translateLangs;
}

describe('extension translate languages', () => {
  it('takes the source from the text, not a fixed Japanese', () => {
    const langs = translateLangs();
    expect(langs('Я читаю книгу.', '', 'en')).toEqual({ source: 'ru', target: 'en' });
    expect(langs('我喜欢学习中文。', 'zh', 'en')).toEqual({ source: 'zh', target: 'en' });
    expect(langs('猫が好きです。', 'ja', 'en')).toEqual({ source: 'ja', target: 'en' });
    // Han alone follows the page, like the lookup does.
    expect(langs('学习', 'ja', 'en').source).toBe('ja');
    expect(langs('学习', 'zh', 'en').source).toBe('zh');
  });

  it("translates into the reader's language, and never into the source", () => {
    const langs = translateLangs();
    expect(langs('猫が好きです。', 'ja', 'ru-RU')).toEqual({ source: 'ja', target: 'ru' });
    expect(langs('Я читаю книгу.', 'ru', 'ru')).toEqual({ source: 'ru', target: 'en' });
    expect(langs('Я читаю книгу.', 'ru', 'de-DE')).toEqual({ source: 'ru', target: 'en' });
  });

  it('the content script no longer hard-codes ja → en', () => {
    const content = readExtensionFile('content.js');
    expect(content).not.toMatch(/type: 'translate'[^\n]*source: 'ja'/);
    expect(content.match(/S\.translateLangs\(/g)?.length).toBe(2);
    expect(content).toContain("type: 'examples', query, limit: 8, lang: lookupLangFor(query)");
  });

  it('the background forwards the Examples language and leaves an unknown source to the app', async () => {
    const h = bootBackground({ responder: () => ({ status: 200, json: { ok: true, examples: [] } }) });
    await h.send({ type: 'examples', query: 'книга', limit: 3, lang: 'ru' });
    const ex = h.fetches.find((entry) => entry.url.endsWith('/v1/examples'));
    expect(JSON.parse(String(ex?.body))).toEqual({ query: 'книга', limit: 3, lang: 'ru' });

    await h.send({ type: 'translate', text: 'Я читаю книгу.' });
    const tr = h.fetches.find((entry) => entry.url.endsWith('/v1/translate'));
    expect(JSON.parse(String(tr?.body))).toEqual({ text: 'Я читаю книгу.', source: '', target: 'en' });
  });

  it('the in-app copy is byte-identical', () => {
    const root = path.join(__dirname, '..', '..', '..');
    for (const file of ['content.js', 'background.js', 'shared.js']) {
      const a = readFileSync(path.join(root, 'extension', file));
      const b = readFileSync(path.join(root, 'src', 'main', 'chrome-extension', file));
      expect(a.equals(b), file).toBe(true);
    }
  });
});
