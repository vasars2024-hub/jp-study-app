// Decoding a fetched web page in the charset it was written in.
//
// `Response.text()` always decodes UTF-8. Much of the web a learner reads is
// not: Chinese sites in GBK / GB18030 or Big5, Russian ones in windows-1251 or
// KOI8-R, older Japanese ones in Shift_JIS or EUC-JP. Decoded as UTF-8 they
// come out as replacement characters, and Reader Mode showed mojibake.

/** Labels the WHATWG Encoding Standard knows, normalised to what TextDecoder accepts. */
const ALIASES: Readonly<Record<string, string>> = {
  gb2312: 'gbk',
  'x-gbk': 'gbk',
  cp936: 'gbk',
  'big5-hkscs': 'big5',
  cp1251: 'windows-1251',
  'win-1251': 'windows-1251',
  sjis: 'shift_jis',
  'x-sjis': 'shift_jis',
  'ms932': 'shift_jis',
  'windows-31j': 'shift_jis',
};

function supported(label: string): string | null {
  const name = ALIASES[label] ?? label;
  try {
    return new TextDecoder(name).encoding;
  } catch {
    return null;
  }
}

/** The charset a Content-Type header names, if any. */
export function charsetFromContentType(contentType: string | null | undefined): string | null {
  const match = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? '');
  return match ? supported(match[1].toLowerCase()) : null;
}

/** The charset a page's own `<meta>` declares, from its first bytes. */
export function charsetFromMeta(head: string): string | null {
  const direct = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head);
  if (direct) return supported(direct[1].toLowerCase());
  return null;
}

/**
 * Decode an HTML response: a byte-order mark first, then the Content-Type
 * header, then the page's `<meta charset>` (read from its first 4 KB as
 * Latin-1, which every charset's ASCII range survives), else UTF-8.
 */
export function decodeHtmlBytes(bytes: Uint8Array, contentType?: string | null): { text: string; charset: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes), charset: 'utf-8' };
  }
  const fromHeader = charsetFromContentType(contentType);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const charset = fromHeader ?? charsetFromMeta(head) ?? 'utf-8';
  return { text: new TextDecoder(charset).decode(bytes), charset };
}
