// `.torrent` files: read one, and build the multipart form qBittorrent's
// `torrents/add` takes them in.
//
// A magnet only names a torrent; a `.torrent` IS the torrent's metadata, which
// is what a private tracker hands out and what a user has on disk after saving
// one from a browser. qBittorrent accepts it as a `torrents` file part of a
// multipart/form-data `torrents/add`, next to the same fields a magnet add
// sends (category, save path, …).
//
// The file is parsed here before anything is sent, for two reasons: a random
// file renamed `.torrent` is refused with a sentence rather than with
// qBittorrent's bare `Fails.`, and the v1 info hash (SHA-1 of the bencoded
// `info` dictionary, byte for byte as the file has it) is what the transfer
// list, the ingest ledger and `settleAddedRows` match on.
//
// The bencode reader is small on purpose and strict: integers must be
// canonical, strings must fit inside the buffer, nesting is bounded, and
// dictionaries keep their raw byte spans so the info hash is computed over the
// original bytes rather than a re-encoding.

import { createHash, randomBytes } from 'node:crypto';

/** A `.torrent` larger than this is refused (real ones are kilobytes; a few huge batches reach a few MB). */
export const MAX_TORRENT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DEPTH = 64;

export type BencodeValue = number | Buffer | BencodeValue[] | BencodeDict;
export interface BencodeDict {
  [key: string]: BencodeValue;
}

class BencodeError extends Error {}

interface Cursor {
  buf: Buffer;
  pos: number;
  /** Raw byte span of each top-level dictionary key's value, when asked for. */
  spans?: Map<string, [number, number]>;
}

function readValue(c: Cursor, depth: number, recordSpans: boolean): BencodeValue {
  if (depth > MAX_DEPTH) throw new BencodeError('nested too deeply');
  const ch = c.buf[c.pos];
  if (ch === undefined) throw new BencodeError('unexpected end');
  if (ch === 0x69) {
    // i<digits>e
    const end = c.buf.indexOf(0x65, c.pos + 1);
    if (end < 0) throw new BencodeError('unterminated integer');
    const text = c.buf.toString('latin1', c.pos + 1, end);
    if (!/^(0|-?[1-9]\d{0,17})$/.test(text)) throw new BencodeError('bad integer');
    c.pos = end + 1;
    return Number(text);
  }
  if (ch === 0x6c) {
    c.pos += 1;
    const list: BencodeValue[] = [];
    while (c.buf[c.pos] !== 0x65) {
      if (c.pos >= c.buf.length) throw new BencodeError('unterminated list');
      list.push(readValue(c, depth + 1, false));
    }
    c.pos += 1;
    return list;
  }
  if (ch === 0x64) {
    c.pos += 1;
    const dict: BencodeDict = Object.create(null) as BencodeDict;
    while (c.buf[c.pos] !== 0x65) {
      if (c.pos >= c.buf.length) throw new BencodeError('unterminated dictionary');
      const key = readValue(c, depth + 1, false);
      if (!Buffer.isBuffer(key)) throw new BencodeError('dictionary key is not a string');
      const name = key.toString('utf8');
      const start = c.pos;
      dict[name] = readValue(c, depth + 1, false);
      if (recordSpans) c.spans?.set(name, [start, c.pos]);
    }
    c.pos += 1;
    return dict;
  }
  if (ch >= 0x30 && ch <= 0x39) {
    const colon = c.buf.indexOf(0x3a, c.pos);
    if (colon < 0 || colon - c.pos > 10) throw new BencodeError('bad string length');
    const lengthText = c.buf.toString('latin1', c.pos, colon);
    if (!/^(0|[1-9]\d*)$/.test(lengthText)) throw new BencodeError('bad string length');
    const length = Number(lengthText);
    const start = colon + 1;
    if (start + length > c.buf.length) throw new BencodeError('string runs past the end');
    c.pos = start + length;
    return c.buf.subarray(start, start + length);
  }
  throw new BencodeError(`unexpected byte 0x${ch.toString(16)}`);
}

/** Decode one bencoded value that must fill `buf` exactly. Throws on anything malformed. */
export function decodeBencode(buf: Uint8Array): { value: BencodeValue; spans: Map<string, [number, number]> } {
  const cursor: Cursor = { buf: Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), pos: 0, spans: new Map() };
  const value = readValue(cursor, 0, true);
  if (cursor.pos !== cursor.buf.length) throw new BencodeError('trailing bytes');
  return { value, spans: cursor.spans ?? new Map() };
}

export type TorrentFileProblem = 'empty' | 'too-large' | 'not-bencode' | 'no-info' | 'no-name' | 'no-pieces';

export type TorrentFileInfo =
  | {
    ok: true;
    /** v1 info hash, lowercase hex (40). For a v2-only torrent, the v2 hash truncated to 40 as qBittorrent reports it. */
    infoHash: string;
    name: string;
    totalBytes: number;
    fileCount: number;
    isPrivate: boolean;
    trackers: string[];
    /** Hybrid / v2 torrents carry a SHA-256 hash too. */
    infoHashV2?: string;
  }
  | { ok: false; problem: TorrentFileProblem; detail?: string };

const text = (value: BencodeValue | undefined): string => (Buffer.isBuffer(value) ? value.toString('utf8') : '');
const isDict = (value: BencodeValue | undefined): value is BencodeDict =>
  !!value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);

/** Read a `.torrent`: its info hash, name, size and trackers, or why it is not one. */
export function parseTorrentFile(bytes: Uint8Array): TorrentFileInfo {
  if (!bytes || bytes.byteLength === 0) return { ok: false, problem: 'empty' };
  if (bytes.byteLength > MAX_TORRENT_FILE_BYTES) return { ok: false, problem: 'too-large' };
  let decoded: ReturnType<typeof decodeBencode>;
  try {
    decoded = decodeBencode(bytes);
  } catch (error) {
    return { ok: false, problem: 'not-bencode', detail: error instanceof Error ? error.message : String(error) };
  }
  const root = decoded.value;
  if (!isDict(root) || !isDict(root.info)) return { ok: false, problem: 'no-info' };
  const info = root.info;
  const span = decoded.spans.get('info');
  if (!span) return { ok: false, problem: 'no-info' };
  const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).subarray(span[0], span[1]);
  const name = text(info['name.utf-8']) || text(info.name);
  if (!name) return { ok: false, problem: 'no-name' };
  const v1 = Buffer.isBuffer(info.pieces);
  const v2 = isDict(info['file tree']) && Number(info['meta version']) === 2;
  if (!v1 && !v2) return { ok: false, problem: 'no-pieces' };

  let totalBytes = 0;
  let fileCount = 0;
  if (Array.isArray(info.files)) {
    for (const file of info.files) {
      if (!isDict(file)) continue;
      // BEP 47 padding files are not content.
      if (text(file.attr).includes('p')) continue;
      totalBytes += typeof file.length === 'number' ? file.length : 0;
      fileCount += 1;
    }
  } else if (typeof info.length === 'number') {
    totalBytes = info.length;
    fileCount = 1;
  }

  const trackers = new Set<string>();
  if (text(root.announce)) trackers.add(text(root.announce));
  if (Array.isArray(root['announce-list'])) {
    for (const tier of root['announce-list']) {
      if (!Array.isArray(tier)) continue;
      for (const url of tier) if (text(url)) trackers.add(text(url));
    }
  }
  const sha256 = v2 ? createHash('sha256').update(raw).digest('hex') : undefined;
  return {
    ok: true,
    infoHash: v1 ? createHash('sha1').update(raw).digest('hex') : (sha256 ?? '').slice(0, 40),
    name: name.slice(0, 500),
    totalBytes,
    fileCount,
    isPrivate: info.private === 1,
    trackers: [...trackers].slice(0, 50),
    ...(sha256 ? { infoHashV2: sha256 } : {}),
  };
}

/** One part of a multipart/form-data body. */
export type MultipartPart =
  | { name: string; value: string }
  | { name: string; fileName: string; contentType: string; data: Uint8Array };

/** A file name safe inside a `Content-Disposition` header (no quotes, CR/LF or path). */
function headerFileName(name: string): string {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/["\r\n\0]/g, '_').trim();
  return (clean || 'file.torrent').slice(0, 200);
}

/**
 * Encode parts as multipart/form-data. The boundary is random and checked
 * against the payload, so a file that happens to contain it cannot split the body.
 */
export function encodeMultipart(parts: readonly MultipartPart[], boundary = `----GumForm${randomBytes(12).toString('hex')}`): { body: Buffer; contentType: string } {
  const chunks: Buffer[] = [];
  const marker = Buffer.from(`--${boundary}`);
  for (const part of parts) {
    if ('data' in part && Buffer.from(part.data).includes(marker)) {
      return encodeMultipart(parts, `----GumForm${randomBytes(16).toString('hex')}`);
    }
  }
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if ('data' in part) {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"; filename="${headerFileName(part.fileName)}"\r\n`
        + `Content-Type: ${part.contentType}\r\n\r\n`,
      ));
      chunks.push(Buffer.from(part.data));
      chunks.push(Buffer.from('\r\n'));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
