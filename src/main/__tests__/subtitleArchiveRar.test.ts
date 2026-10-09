// @vitest-environment node
//
// Jimaku season packs filed as `.rar`: the bundled 7-Zip build has the RAR
// decoders, so the Jimaku route opens them (the Nyaa route keeps its set). The
// archive is built here byte by byte (RAR 1.5-4.x, "store" method), because no
// RAR writer is available — 7-Zip only reads the format.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractSubtitlesFromArchive, isExtractableArchive } from '../subtitleArchive';

function crc32(buf: Buffer): number {
  const native = (zlib as unknown as { crc32?: (b: Buffer) => number }).crc32;
  if (native) return native(buf) >>> 0;
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** A header block: its CRC is the low 16 bits of the CRC32 of everything after the CRC field. */
function block(body: Buffer): Buffer {
  const crc = Buffer.alloc(2);
  crc.writeUInt16LE(crc32(body) & 0xffff);
  return Buffer.concat([crc, body]);
}

function storedRar(files: Array<{ name: string; data: Buffer }>): Buffer {
  const marker = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);
  const main = Buffer.alloc(11);
  main.writeUInt8(0x73, 0);
  main.writeUInt16LE(0, 1);
  main.writeUInt16LE(13, 3);
  const parts: Buffer[] = [marker, block(main)];
  for (const file of files) {
    const name = Buffer.from(file.name, 'latin1');
    const head = Buffer.alloc(30 + name.length);
    head.writeUInt8(0x74, 0);
    head.writeUInt16LE(0x8000, 1);
    head.writeUInt16LE(32 + name.length, 3);
    head.writeUInt32LE(file.data.length, 5); // packed
    head.writeUInt32LE(file.data.length, 9); // unpacked
    head.writeUInt8(2, 13); // Windows
    head.writeUInt32LE(crc32(file.data), 14);
    head.writeUInt32LE(0x5a6b0000, 18); // DOS time
    head.writeUInt8(29, 22); // needs RAR 2.9 to unpack
    head.writeUInt8(0x30, 23); // store
    head.writeUInt16LE(name.length, 24);
    head.writeUInt32LE(0x20, 26);
    name.copy(head, 30);
    parts.push(block(head), file.data);
  }
  parts.push(Buffer.from([0xc4, 0x3d, 0x7b, 0x00, 0x40, 0x07, 0x00]));
  return Buffer.concat(parts);
}

let dir = '';

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-rar-'));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('.rar subtitle archives', () => {
  it('is opened only where a caller asks for it (Jimaku), the Nyaa set unchanged', () => {
    expect(isExtractableArchive('Show S1.rar')).toBe(false);
    expect(isExtractableArchive('Show S1.RAR', { rar: true })).toBe(true);
    expect(isExtractableArchive('Show S1.7z', { rar: true })).toBe(true);
    expect(isExtractableArchive('Show - 01.ass', { rar: true })).toBe(false);
  });

  it('extracts the subtitle members of a real RAR archive with the bundled 7-Zip, and nothing else', async () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nこんにちは\r\n';
    const at = path.join(dir, 'pack.rar');
    fs.writeFileSync(at, storedRar([
      { name: 'Show - 01.ja.srt', data: Buffer.from(srt, 'utf8') },
      { name: 'Show - 02.ja.srt', data: Buffer.from(srt.replace('こんにちは', 'さようなら'), 'utf8') },
      { name: 'readme.exe', data: Buffer.from('MZ not a program') },
    ]));
    const out = await extractSubtitlesFromArchive(at, { extensions: ['.srt', '.ass'], maxUnpackedBytes: 1024 * 1024 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.files.map((f) => f.name).sort()).toEqual(['Show - 01.ja.srt', 'Show - 02.ja.srt']);
    expect(out.files.find((f) => f.name.includes('02'))?.text).toContain('さようなら');
    expect(out.skippedNonSubtitle).toBe(1);
  }, 60_000);
});
