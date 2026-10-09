// Builds real `.torrent` files for tests: a minimal bencode encoder, and the
// v1 info hash computed independently of the code under test.
import crypto from 'node:crypto';

export type BValue = number | string | Buffer | BValue[] | { [key: string]: BValue };

export function bencode(value: BValue): Buffer {
  if (typeof value === 'number') return Buffer.from(`i${Math.trunc(value)}e`);
  if (typeof value === 'string') return bencode(Buffer.from(value, 'utf8'));
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  if (Array.isArray(value)) return Buffer.concat([Buffer.from('l'), ...value.map(bencode), Buffer.from('e')]);
  const keys = Object.keys(value).sort();
  return Buffer.concat([Buffer.from('d'), ...keys.flatMap((k) => [bencode(k), bencode(value[k])]), Buffer.from('e')]);
}

export interface TorrentFixture {
  bytes: Buffer;
  infoHash: string;
  name: string;
}

/** A single-file torrent, or a multi-file one when `files` is given. */
export function makeTorrent(name: string, options: { length?: number; files?: Array<{ path: string[]; length: number }>; announce?: string; private?: boolean } = {}): TorrentFixture {
  const info: Record<string, BValue> = {
    name,
    'piece length': 262_144,
    pieces: crypto.createHash('sha1').update(name).digest(),
    ...(options.files ? { files: options.files.map((f) => ({ length: f.length, path: f.path })) } : { length: options.length ?? 1_000_000 }),
    ...(options.private ? { private: 1 } : {}),
  };
  const encodedInfo = bencode(info);
  const bytes = bencode({ announce: options.announce ?? 'http://tracker.invalid/announce', 'creation date': 1_700_000_000, info });
  return { bytes, infoHash: crypto.createHash('sha1').update(encodedInfo).digest('hex'), name };
}
