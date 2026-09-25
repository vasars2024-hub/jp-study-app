import { describe, expect, it } from 'vitest';
import { charsetFromContentType, charsetFromMeta, decodeHtmlBytes } from '../htmlCharset';

const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));

describe('decodeHtmlBytes — Reader Mode reads a page in its own charset', () => {
  it('GBK from the <meta> tag (中文)', () => {
    const bytes = new Uint8Array([...ascii('<html><head><meta charset="gb2312"></head><body>'), 0xd6, 0xd0, 0xce, 0xc4, ...ascii('</body>')]);
    const out = decodeHtmlBytes(bytes, 'text/html');
    expect(out.charset).toBe('gbk');
    expect(out.text).toContain('中文');
  });

  it('windows-1251 from the Content-Type header (Привет)', () => {
    const bytes = new Uint8Array([...ascii('<p>'), 0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, ...ascii('</p>')]);
    expect(decodeHtmlBytes(bytes, 'text/html; charset=windows-1251').text).toBe('<p>Привет</p>');
  });

  it('Big5 from an http-equiv meta (中文)', () => {
    const bytes = new Uint8Array([...ascii('<meta http-equiv="Content-Type" content="text/html; charset=big5">'), 0xa4, 0xa4, 0xa4, 0xe5]);
    expect(decodeHtmlBytes(bytes).text).toContain('中文');
  });

  it('UTF-8 by default, and a BOM wins over a wrong header', () => {
    const utf8 = new TextEncoder().encode('<p>日本語</p>');
    expect(decodeHtmlBytes(utf8).text).toBe('<p>日本語</p>');
    expect(decodeHtmlBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]), 'text/html; charset=gbk').text).toBe('<p>日本語</p>');
  });

  it('ignores a label no decoder knows', () => {
    expect(charsetFromContentType('text/html; charset=nonsense')).toBeNull();
    expect(charsetFromMeta('<meta charset="shift_jis">')).toBe('shift_jis');
  });
});
