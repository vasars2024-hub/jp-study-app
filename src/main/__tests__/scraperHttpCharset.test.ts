// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { encodeLegacy } from './e2eFixtures/texts';
import { charsetOf, decodeBody } from '../scraper/http';

// Hoisted above the imports by vitest.
vi.mock('electron', () => ({
  app: { getAppMetrics: () => [] },
  ipcMain: { handle: () => undefined },
}));

const TITLE = 'はじめての朝';

const html = (head: string): string =>
  `<!doctype html><html><head>${head}<title>${TITLE}</title></head><body></body></html>`;

describe('charsetOf', () => {
  it.each([
    ['text/html; charset=Shift_JIS', 'shift_jis'],
    ['text/html; charset=sjis', 'shift_jis'],
    ['text/html; charset=x-sjis', 'shift_jis'],
    ['text/html; charset=Windows-31J', 'shift_jis'],
    ['text/html; charset=CP932', 'shift_jis'],
    ['text/html; charset="EUC-JP"', 'euc-jp'],
    ['text/html; charset=x-euc-jp', 'euc-jp'],
    ['text/html; charset=ISO-2022-JP', 'iso-2022-jp'],
    ['text/html; charset=UTF8', 'utf-8'],
    ['text/html', 'utf-8'],
    [undefined, 'utf-8'],
  ])('%s -> %s', (contentType, expected) => {
    expect(charsetOf(contentType)).toBe(expected);
  });
});

describe('decodeBody', () => {
  const cases: Array<{ name: string; bytes: Buffer; contentType: string | undefined }> = [
    { name: 'charset in the Content-Type header', bytes: encodeLegacy(html(''), 'shift_jis'), contentType: 'text/html; charset=Shift_JIS' },
    { name: 'an alias in the header', bytes: encodeLegacy(html(''), 'shift_jis'), contentType: 'text/html; charset=windows-31j' },
    { name: '<meta charset>', bytes: encodeLegacy(html('<meta charset="Shift_JIS">'), 'shift_jis'), contentType: 'text/html' },
    { name: 'unquoted <meta charset>', bytes: encodeLegacy(html('<meta charset=euc-jp>'), 'euc-jp'), contentType: 'text/html' },
    {
      name: '<meta http-equiv content>',
      bytes: encodeLegacy(html('<meta http-equiv="Content-Type" content="text/html; charset=x-sjis">'), 'shift_jis'),
      contentType: 'text/html',
    },
    {
      name: '<?xml encoding?>',
      bytes: encodeLegacy(`<?xml version="1.0" encoding="EUC-JP"?><rss><title>${TITLE}</title></rss>`, 'euc-jp'),
      contentType: 'application/rss+xml',
    },
    { name: 'no declaration at all (UTF-8)', bytes: Buffer.from(html(''), 'utf-8'), contentType: undefined },
    {
      name: 'a UTF-8 BOM that overrides a wrong header',
      bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(html(''), 'utf-8')]),
      contentType: 'text/html; charset=shift_jis',
    },
    {
      name: 'a UTF-16 LE BOM',
      bytes: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(html(''), 'utf16le')]),
      contentType: 'text/html',
    },
    {
      name: 'a header charset that wins over a conflicting <meta>',
      bytes: encodeLegacy(html('<meta charset="euc-jp">'), 'shift_jis'),
      contentType: 'text/html; charset=shift_jis',
    },
    {
      name: 'a <meta> that claims UTF-16 (read as UTF-8)',
      bytes: Buffer.from(html('<meta charset="utf-16">'), 'utf-8'),
      contentType: 'text/html',
    },
    {
      name: 'an unknown label (falls back to UTF-8)',
      bytes: Buffer.from(html(''), 'utf-8'),
      contentType: 'text/html; charset=x-made-up',
    },
  ];

  it.each(cases)('decodes $name', ({ bytes, contentType }) => {
    const text = decodeBody(bytes, contentType);
    expect(text).toContain(`<title>${TITLE}</title>`);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('ignores a declaration past the first 1024 bytes', () => {
    const padded = html(`${' '.repeat(1100)}<meta charset="shift_jis">`);
    const text = decodeBody(encodeLegacy(padded, 'shift_jis'), 'text/html');
    expect(text).not.toContain(TITLE);
  });
});
