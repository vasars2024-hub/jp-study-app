/**
 * The OpenSubtitles (OSDb) file hash.
 *
 * Why hashing at all: matching subtitles by title and episode number gets you a
 * subtitle for the right *episode*, but not necessarily one timed to *your*
 * release — a BD rip and a TV rip of the same episode differ by seconds, which is
 * enough to make a subtitle useless. The OSDb hash identifies the exact file, so a
 * hit is guaranteed to be in sync.
 *
 * The algorithm is defined by OpenSubtitles: a 64-bit little-endian sum of the file
 * size and every 64-bit word in the first and last 64 KiB, rendered as 16 lowercase
 * hex digits. It is not a cryptographic digest and cannot be swapped for one — the
 * server computes the same thing, so this must match it bit for bit.
 */

import fs from 'node:fs';

/** Both the head and tail chunk size, per the OSDb spec. */
export const OSDB_CHUNK_BYTES = 64 * 1024;

/**
 * The spec's own lower bound. A file smaller than one chunk cannot be hashed this
 * way, and OpenSubtitles rejects such hashes rather than treating them as valid.
 */
export const OSDB_MIN_BYTES = OSDB_CHUNK_BYTES;

const MASK_64 = (1n << 64n) - 1n;

/** Sums the buffer as little-endian unsigned 64-bit words, wrapping at 2^64. */
export function sumUint64LE(buffer: Buffer, seed = 0n): bigint {
  let total = seed & MASK_64;
  // A trailing partial word cannot occur for a 64 KiB chunk, and the reference
  // implementation ignores one, so whole words only.
  const words = Math.floor(buffer.length / 8);
  for (let i = 0; i < words; i += 1) {
    total = (total + buffer.readBigUInt64LE(i * 8)) & MASK_64;
  }
  return total;
}

/** Renders the 64-bit hash the way OpenSubtitles expects it: 16 lowercase hex digits. */
export function formatOsdbHash(value: bigint): string {
  return (value & MASK_64).toString(16).padStart(16, '0');
}

/**
 * Computes the hash from the file's size and its head and tail chunks. Pure
 * arithmetic given those three inputs, so it is testable without touching a disk.
 */
export function osdbHashFromParts(sizeBytes: number, head: Buffer, tail: Buffer): string {
  let hash = BigInt(sizeBytes) & MASK_64;
  hash = sumUint64LE(head, hash);
  hash = sumUint64LE(tail, hash);
  return formatOsdbHash(hash);
}

export interface OsdbHashResult {
  hash: string;
  sizeBytes: number;
}

/**
 * Hashes a media file. Returns null when the file is too small to hash or cannot
 * be read — a missing hash is fine, it just means matching falls back to title
 * and episode.
 */
export async function osdbHashFile(file: string): Promise<OsdbHashResult | null> {
  let handle: fs.promises.FileHandle | null = null;
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile() || stat.size < OSDB_MIN_BYTES) return null;

    handle = await fs.promises.open(file, 'r');
    const head = Buffer.alloc(OSDB_CHUNK_BYTES);
    const tail = Buffer.alloc(OSDB_CHUNK_BYTES);
    const headRead = await handle.read(head, 0, OSDB_CHUNK_BYTES, 0);
    const tailRead = await handle.read(tail, 0, OSDB_CHUNK_BYTES, stat.size - OSDB_CHUNK_BYTES);
    if (headRead.bytesRead < OSDB_CHUNK_BYTES || tailRead.bytesRead < OSDB_CHUNK_BYTES) return null;

    return { hash: osdbHashFromParts(stat.size, head, tail), sizeBytes: stat.size };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
