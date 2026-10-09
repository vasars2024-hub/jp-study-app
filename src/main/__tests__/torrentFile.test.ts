// @vitest-environment node
//
// `.torrent` reading and the multipart body qBittorrent's `torrents/add` takes.
import { describe, expect, it } from 'vitest';
import { decodeBencode, encodeMultipart, MAX_TORRENT_FILE_BYTES, parseTorrentFile } from '../scraper/torrentFile';
import { bencode, makeTorrent } from './e2eFixtures/torrentFixture';

describe('parseTorrentFile', () => {
  it('reads name, size and the v1 info hash over the info dictionary\'s own bytes', () => {
    const t = makeTorrent('[Gum] Show - 01 (1080p).mkv', { length: 123_456 });
    const info = parseTorrentFile(t.bytes);
    expect(info).toMatchObject({ ok: true, infoHash: t.infoHash, name: t.name, totalBytes: 123_456, fileCount: 1, isPrivate: false });
    expect(info.ok && info.trackers).toEqual(['http://tracker.invalid/announce']);
  });

  it('sums a multi-file torrent, skips BEP 47 padding files, and reads the private flag', () => {
    const t = makeTorrent('Show S01', {
      private: true,
      files: [{ path: ['Show - 01.mkv'], length: 100 }, { path: ['Show - 02.mkv'], length: 200 }],
    });
    expect(parseTorrentFile(t.bytes)).toMatchObject({ ok: true, totalBytes: 300, fileCount: 2, isPrivate: true });
  });

  it('refuses what is not a torrent, by reason', () => {
    expect(parseTorrentFile(new Uint8Array(0))).toMatchObject({ ok: false, problem: 'empty' });
    expect(parseTorrentFile(Buffer.from('<html>not a torrent</html>'))).toMatchObject({ ok: false, problem: 'not-bencode' });
    expect(parseTorrentFile(bencode({ announce: 'x' }))).toMatchObject({ ok: false, problem: 'no-info' });
    expect(parseTorrentFile(bencode({ info: { length: 1, pieces: Buffer.alloc(20) } }))).toMatchObject({ ok: false, problem: 'no-name' });
    expect(parseTorrentFile(bencode({ info: { name: 'x', length: 1 } }))).toMatchObject({ ok: false, problem: 'no-pieces' });
    expect(parseTorrentFile(new Uint8Array(MAX_TORRENT_FILE_BYTES + 1))).toMatchObject({ ok: false, problem: 'too-large' });
  });

  it('the bencode reader is strict: trailing bytes, non-canonical integers, overruns and deep nesting fail', () => {
    expect(() => decodeBencode(Buffer.from('i1ei2e'))).toThrow();
    expect(() => decodeBencode(Buffer.from('i01e'))).toThrow();
    expect(() => decodeBencode(Buffer.from('i-0e'))).toThrow();
    expect(() => decodeBencode(Buffer.from('10:abc'))).toThrow();
    expect(() => decodeBencode(Buffer.from(`${'l'.repeat(100)}${'e'.repeat(100)}`))).toThrow();
    expect(decodeBencode(Buffer.from('li-5e3:abce')).value).toEqual([-5, Buffer.from('abc')]);
  });
});

describe('encodeMultipart', () => {
  it('writes file parts as raw bytes beside the form fields, with a boundary the payload does not contain', () => {
    const t = makeTorrent('a');
    const { body, contentType } = encodeMultipart([
      { name: 'torrents', fileName: 'C:\\dl\\evil"name.torrent', contentType: 'application/x-bittorrent', data: t.bytes },
      { name: 'category', value: 'anime' },
    ]);
    const boundary = /boundary=(.+)$/.exec(contentType)![1];
    expect(t.bytes.includes(Buffer.from(boundary))).toBe(false);
    const text = body.toString('latin1');
    expect(text).toContain('Content-Disposition: form-data; name="torrents"; filename="evil_name.torrent"');
    expect(text).toContain('name="category"\r\n\r\nanime\r\n');
    expect(body.includes(t.bytes)).toBe(true);
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });
});
