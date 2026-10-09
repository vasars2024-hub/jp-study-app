// @vitest-environment node
/**
 * files2 — the async sampled digest reads exactly what the sync one reads, so
 * moving the Duplicates view off the main thread cannot change its groups.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sampledFileDigest, sampledFileDigestAsync } from '../filesApp/preview';

const dir = mkdtempSync(join(tmpdir(), 'gum-digest-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('sampledFileDigestAsync', () => {
  it('matches the sync digest for small and large files', async () => {
    const small = join(dir, 'small.bin');
    const large = join(dir, 'large.bin');
    writeFileSync(small, Buffer.from('hello'));
    const big = Buffer.alloc(200 * 1024);
    for (let i = 0; i < big.length; i += 1) big[i] = i % 251;
    writeFileSync(large, big);
    expect(await sampledFileDigestAsync(small, 5)).toBe(sampledFileDigest(small, 5));
    expect(await sampledFileDigestAsync(large, big.length)).toBe(sampledFileDigest(large, big.length));
  });

  it('answers null for a missing file instead of throwing', async () => {
    expect(await sampledFileDigestAsync(join(dir, 'nope.bin'), 10)).toBeNull();
  });
});
