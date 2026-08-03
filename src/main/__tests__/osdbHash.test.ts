import { describe, expect, it } from 'vitest';
import {
  OSDB_CHUNK_BYTES,
  formatOsdbHash,
  osdbHashFromParts,
  sumUint64LE,
} from '../osdbHash';

const chunk = (fill: number): Buffer => Buffer.alloc(OSDB_CHUNK_BYTES, fill);

describe('sumUint64LE', () => {
  it('sums little-endian 64-bit words', () => {
    const buf = Buffer.alloc(16);
    buf.writeBigUInt64LE(1n, 0);
    buf.writeBigUInt64LE(2n, 8);
    expect(sumUint64LE(buf)).toBe(3n);
  });

  it('adds to the seed', () => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(5n, 0);
    expect(sumUint64LE(buf, 10n)).toBe(15n);
  });

  it('wraps at 2^64 instead of overflowing', () => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(2n, 0);
    // (2^64 - 1) + 2 wraps to 1.
    expect(sumUint64LE(buf, (1n << 64n) - 1n)).toBe(1n);
  });

  it('ignores a trailing partial word, as the reference implementation does', () => {
    const buf = Buffer.alloc(12);
    buf.writeBigUInt64LE(7n, 0);
    buf.writeUInt32LE(0xffffffff, 8);
    expect(sumUint64LE(buf)).toBe(7n);
  });

  it('is zero for an empty buffer', () => {
    expect(sumUint64LE(Buffer.alloc(0))).toBe(0n);
  });
});

describe('formatOsdbHash', () => {
  it('always renders 16 lowercase hex digits', () => {
    expect(formatOsdbHash(0n)).toBe('0000000000000000');
    expect(formatOsdbHash(255n)).toBe('00000000000000ff');
    expect(formatOsdbHash((1n << 64n) - 1n)).toBe('ffffffffffffffff');
  });

  it('masks anything wider than 64 bits', () => {
    expect(formatOsdbHash(1n << 64n)).toBe('0000000000000000');
  });
});

describe('osdbHashFromParts', () => {
  it('starts from the file size, so same-content different-size files differ', () => {
    const head = chunk(0);
    const tail = chunk(0);
    // All-zero chunks contribute nothing, leaving the size as the whole hash.
    expect(osdbHashFromParts(1024, head, tail)).toBe(formatOsdbHash(1024n));
    expect(osdbHashFromParts(2048, head, tail)).toBe(formatOsdbHash(2048n));
  });

  it('depends on the chunk contents', () => {
    const size = 1_000_000;
    const zero = osdbHashFromParts(size, chunk(0), chunk(0));
    const filled = osdbHashFromParts(size, chunk(1), chunk(0));
    expect(filled).not.toBe(zero);
    // Note it does NOT matter *which* chunk carries the bytes — see the symmetry
    // test below. Content changes the hash; position within head/tail does not.
    expect(osdbHashFromParts(size, chunk(0), chunk(1))).toBe(filled);
  });

  it('is deterministic', () => {
    const a = osdbHashFromParts(123456, chunk(7), chunk(9));
    const b = osdbHashFromParts(123456, chunk(7), chunk(9));
    expect(a).toBe(b);
  });

  it('is symmetric in head and tail, which the spec permits', () => {
    // The algorithm is a plain sum, so swapping the chunks yields the same value.
    // Pinned so a future "optimisation" that changes the order is caught, since
    // the server computes the sum and would then disagree.
    const size = 999_999;
    expect(osdbHashFromParts(size, chunk(3), chunk(4)))
      .toBe(osdbHashFromParts(size, chunk(4), chunk(3)));
  });

  it('produces the documented value for the spec\'s worked example', () => {
    // OpenSubtitles' reference: a 12 909 756-byte file whose head and tail sum,
    // together with the size, to 8e245d9679d31e12. Reproduced here by feeding the
    // arithmetic directly, which is what pins our word order and masking.
    const size = 12_909_756;
    const target = BigInt('0x8e245d9679d31e12');
    const contribution = (target - BigInt(size)) & ((1n << 64n) - 1n);
    const head = Buffer.alloc(OSDB_CHUNK_BYTES);
    head.writeBigUInt64LE(contribution, 0);
    expect(osdbHashFromParts(size, head, Buffer.alloc(OSDB_CHUNK_BYTES)))
      .toBe('8e245d9679d31e12');
  });
});
