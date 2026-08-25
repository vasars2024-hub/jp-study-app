// The dictionary page warm-up: what it does, and the three ways it declines to.
//
// The value it delivers -- a cold `lookup()` no longer blocking Electron's main loop
// for 1.5 s -- cannot be asserted here, because it is a property of the OS file
// cache and is measured live (`debug/lq-mainloop-harness.ps1`, recorded in the L5
// entry of the transformation plan). What IS asserted here is everything a future
// edit could break silently: that it reads the whole file, that it reads it exactly
// once per process, that an oversized or absent file is a named refusal rather than
// a thrown error or a false success, and that cancellation stops it.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DICT_WARM_MAX_BYTES,
  cancelDictionaryWarmup,
  resetDictionaryWarmupForTests,
  warmDictionaryPages,
} from '../dictionary/warmup';

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dictwarm-'));
  resetDictionaryWarmupForTests();
});

afterEach(() => {
  resetDictionaryWarmupForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeDb(bytes: number): void {
  fs.writeFileSync(path.join(dir, 'dict.db'), Buffer.alloc(bytes, 7));
}

describe('warmDictionaryPages', () => {
  it('reads the whole file and reports the byte count, not a boolean', async () => {
    writeDb(9 * 1024 * 1024 + 137);
    const result = await warmDictionaryPages(dir);
    expect(result.status).toBe('warmed');
    expect(result.bytesRead).toBe(9 * 1024 * 1024 + 137);
    expect(result.bytesRead).toBe(result.fileBytes);
  });

  it('reads an empty database without spinning', async () => {
    writeDb(0);
    const result = await warmDictionaryPages(dir);
    expect(result.status).toBe('warmed');
    expect(result.bytesRead).toBe(0);
  });

  it('is one warm-up per process: a second call joins the first, it does not re-read', async () => {
    writeDb(1024);
    const openSpy = vi.spyOn(fs.promises, 'open');
    const first = warmDictionaryPages(dir);
    const second = warmDictionaryPages(dir);
    expect(second).toBe(first);
    await first;
    await warmDictionaryPages(dir);
    expect(openSpy.mock.calls.length).toBe(1);
    openSpy.mockRestore();
  });

  it('declines a missing database by name, and never throws', async () => {
    const result = await warmDictionaryPages(dir);
    expect(result.status).toBe('missing');
    expect(result.bytesRead).toBe(0);
  });

  it('declines a file larger than the budget rather than flushing the cache with it', async () => {
    writeDb(2048);
    const statSpy = vi.spyOn(fs.promises, 'stat').mockResolvedValue({
      size: DICT_WARM_MAX_BYTES + 1,
    } as unknown as fs.Stats);
    const openSpy = vi.spyOn(fs.promises, 'open');
    const result = await warmDictionaryPages(dir);
    expect(result.status).toBe('too-large');
    expect(result.fileBytes).toBe(DICT_WARM_MAX_BYTES + 1);
    // The refusal has to be a refusal: nothing may be read.
    expect(openSpy).not.toHaveBeenCalled();
    statSpy.mockRestore();
    openSpy.mockRestore();
  });

  it('stops at the next chunk boundary when cancelled', async () => {
    // Larger than one 4 MB chunk, so there is a boundary to stop at.
    writeDb(20 * 1024 * 1024);
    const pending = warmDictionaryPages(dir);
    cancelDictionaryWarmup();
    const result = await pending;
    expect(result.status).toBe('cancelled');
    expect(result.bytesRead).toBeLessThan(result.fileBytes);
  });

  it('reports a read failure as failed, with the message, and closes the handle', async () => {
    writeDb(8 * 1024 * 1024);
    const openSpy = vi.spyOn(fs.promises, 'open');
    const closed = { count: 0 };
    openSpy.mockImplementation(async () => ({
      read: async () => { throw new Error('EIO simulated'); },
      close: async () => { closed.count += 1; },
    }) as unknown as fs.promises.FileHandle);
    const result = await warmDictionaryPages(dir);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('EIO simulated');
    expect(closed.count).toBe(1);
    openSpy.mockRestore();
  });
});
