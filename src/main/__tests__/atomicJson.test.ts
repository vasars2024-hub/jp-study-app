// @vitest-environment node
/**
 * The shared JSON store helper (audit robust #3). Every property here is one a
 * store used to lack: in-place writes, "parse failed → []" followed by an
 * overwrite, and no previous copy to fall back to.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetAtomicJsonForTests,
  drainAtomicWrites,
  freezeAtomicWrites,
  readJsonDetailedSync,
  readJsonDetailed,
  readJsonSync,
  removeJsonStore,
  setAtomicJsonLogger,
  thawAtomicWrites,
  writeJsonAtomic,
  writeJsonAtomicSync,
} from '../atomicJson';

let dir: string;
let file: string;
const logs: string[] = [];

beforeEach(() => {
  __resetAtomicJsonForTests();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-json-'));
  file = path.join(dir, 'library.json');
  logs.length = 0;
  setAtomicJsonLogger((sev, op, detail) => logs.push(`${sev}:${op}:${detail}`));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

const listDir = () => fs.readdirSync(dir).sort();

describe('writes', () => {
  it('writes atomically and keeps the previous version as .bak', () => {
    writeJsonAtomicSync(file, [{ id: 'a' }]);
    writeJsonAtomicSync(file, [{ id: 'a' }, { id: 'b' }]);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'))).toEqual([{ id: 'a' }]);
    expect(listDir()).toEqual(['library.json', 'library.json.bak']);
  });

  it('never promotes a damaged file it did not write to .bak', () => {
    fs.writeFileSync(`${file}.bak`, JSON.stringify([{ id: 'good' }]));
    fs.writeFileSync(file, '[{"id":"half-writ');
    writeJsonAtomicSync(file, [{ id: 'new' }]);
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'))).toEqual([{ id: 'good' }]);
    // The damaged bytes were moved aside, not destroyed.
    const aside = listDir().filter((n) => n.startsWith('library.json.corrupt-'));
    expect(aside).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, aside[0]), 'utf8')).toBe('[{"id":"half-writ');
  });

  it('retries a rename that Windows refuses while a scanner holds the file', () => {
    const real = fs.renameSync;
    let calls = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      calls += 1;
      if (calls <= 2) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      return real(from, to);
    });
    writeJsonAtomicSync(file, { ok: true });
    expect(calls).toBe(3);
    expect(readJsonSync(file, null)).toEqual({ ok: true });
  });

  it('leaves no temp files behind and keeps the target intact when the write fails', () => {
    writeJsonAtomicSync(file, { v: 1 });
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    });
    expect(() => writeJsonAtomicSync(file, { v: 2 })).toThrow(/ENOSPC/);
    vi.restoreAllMocks();
    expect(readJsonSync(file, null)).toEqual({ v: 1 });
    expect(listDir().filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('serialises overlapping async writes; the last one wins', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((v) => writeJsonAtomic(file, { v })));
    expect(readJsonSync(file, null)).toEqual({ v: 5 });
    expect(listDir().filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});

describe('reads', () => {
  it('serves the last-good copy when the primary is damaged, and reinstates it', () => {
    writeJsonAtomicSync(file, [{ id: 'a' }]);
    writeJsonAtomicSync(file, [{ id: 'a' }, { id: 'b' }]);
    fs.writeFileSync(file, '{"trunc');
    const result = readJsonDetailedSync<unknown[]>(file, []);
    expect(result.source).toBe('backup');
    expect(result.value).toEqual([{ id: 'a' }]);
    expect(result.quarantinedTo).toMatch(/library\.json\.corrupt-/);
    expect(fs.readFileSync(result.quarantinedTo!, 'utf8')).toBe('{"trunc');
    // Reinstated: the next plain read is a primary hit.
    expect(readJsonDetailedSync(file, []).source).toBe('primary');
    expect(logs.some((l) => l.includes('json-restored-from-last-good'))).toBe(true);
  });

  it('falls back only when both copies are unusable — and the damaged file survives the next write', () => {
    fs.writeFileSync(file, 'not json');
    const result = readJsonDetailedSync(file, () => ['default']);
    expect(result.source).toBe('fallback');
    expect(result.value).toEqual(['default']);
    writeJsonAtomicSync(file, ['fresh']);
    const aside = listDir().filter((n) => n.startsWith('library.json.corrupt-'));
    expect(aside).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, aside[0]), 'utf8')).toBe('not json');
  });

  it('a missing primary with no .bak is a first run', () => {
    const result = readJsonDetailedSync(file, []);
    expect(result).toEqual({ value: [], source: 'missing' });
  });

  it('a missing primary next to a good .bak is damage: the .bak is served and reinstated', () => {
    fs.writeFileSync(`${file}.bak`, '["last good"]');
    const result = readJsonDetailedSync(file, []);
    expect(result.source).toBe('backup');
    expect(result.value).toEqual(['last good']);
    expect(readJsonDetailedSync(file, []).source).toBe('primary');
  });

  it('a failed copy-back leaves the damaged primary in place, and a later write never overwrites the good .bak', () => {
    writeJsonAtomicSync(file, ['good']);
    writeJsonAtomicSync(file, ['good', 'newer']);
    fs.writeFileSync(file, '{"trunc');
    const real = fs.renameSync;
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to) === file) throw Object.assign(new Error('EXDEV: cross-device link'), { code: 'EXDEV' });
      return real(from, to);
    });
    const first = readJsonDetailedSync<string[]>(file, []);
    expect(first.source).toBe('backup');
    expect(first.value).toEqual(['good']);
    // Before: the primary had been renamed away, so this read returned the
    // fallback and the next two writes overwrote the only good copy.
    expect(fs.existsSync(file)).toBe(true);
    spy.mockRestore();
    const second = readJsonDetailedSync<string[]>(file, []);
    expect(second.source).toBe('backup');
    expect(second.value).toEqual(['good']);
    expect(fs.readFileSync(`${file}.bak`, 'utf8')).toContain('good');
  });

  it('a write that finds only a .bak keeps a copy of it before the next write can replace it', () => {
    fs.writeFileSync(`${file}.bak`, '["only good copy"]');
    writeJsonAtomicSync(file, ['fresh 1']);
    writeJsonAtomicSync(file, ['fresh 2']);
    const kept = listDir().filter((n) => n.startsWith('library.json.bak.corrupt-'));
    expect(kept).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, kept[0]), 'utf8')).toBe('["only good copy"]');
  });

  it('retries a read a scanner briefly locks, and never quarantines the healthy file', () => {
    writeJsonAtomicSync(file, { v: 1 });
    const real = fs.readFileSync;
    let locked = 2;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((p: fs.PathOrFileDescriptor, o?: unknown) => {
      if (String(p) === file && locked-- > 0) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return real(p, o as BufferEncoding);
    }) as typeof fs.readFileSync);
    expect(readJsonDetailedSync(file, null)).toEqual({ value: { v: 1 }, source: 'primary' });
    expect(listDir().filter((n) => n.includes('.corrupt-'))).toEqual([]);
  });

  it('a lock that persists is answered from .bak and the primary stays where it is', async () => {
    writeJsonAtomicSync(file, { v: 1 });
    writeJsonAtomicSync(file, { v: 2 });
    const realAsync = fs.promises.readFile;
    vi.spyOn(fs.promises, 'readFile').mockImplementation((async (p: fs.PathLike, o?: unknown) => {
      if (String(p) === file) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      return realAsync(p, o as BufferEncoding);
    }) as typeof fs.promises.readFile);
    const result = await readJsonDetailed(file, null);
    expect(result.source).toBe('backup');
    expect(result.value).toEqual({ v: 1 });
    expect(result.quarantinedTo).toBeUndefined();
    vi.restoreAllMocks();
    expect(readJsonSync(file, null)).toEqual({ v: 2 });
    expect(listDir().filter((n) => n.includes('.corrupt-'))).toEqual([]);
  });

  it('treats a value that fails validate like a parse failure', async () => {
    writeJsonAtomicSync(file, { items: [1] });
    writeJsonAtomicSync(file, { items: [1, 2] });
    fs.writeFileSync(file, '{}');
    const validate = (v: unknown) => Boolean(v && typeof v === 'object' && Array.isArray((v as { items?: unknown }).items));
    const result = await readJsonDetailed(file, { items: [] as number[] }, { validate });
    expect(result.source).toBe('backup');
    expect(result.value).toEqual({ items: [1] });
  });

  it('removeJsonStore deletes the store and its last-good copy together', () => {
    writeJsonAtomicSync(file, [1]);
    writeJsonAtomicSync(file, [2]);
    removeJsonStore(file);
    expect(listDir()).toEqual([]);
  });

  it('a leftover temp file from a crash does not affect reads', () => {
    writeJsonAtomicSync(file, { v: 1 });
    fs.writeFileSync(`${file}.1234.abc.tmp`, '{"v":');
    expect(readJsonSync(file, null)).toEqual({ v: 1 });
  });
});

describe('freeze (restore)', () => {
  it('holds writes while frozen and replays the newest on rollback', () => {
    writeJsonAtomicSync(file, { v: 1 });
    freezeAtomicWrites();
    writeJsonAtomicSync(file, { v: 2 });
    writeJsonAtomicSync(file, { v: 3 });
    expect(readJsonSync(file, null)).toEqual({ v: 1 });
    thawAtomicWrites({ replay: true });
    expect(readJsonSync(file, null)).toEqual({ v: 3 });
  });

  it('holds an async write a freeze overtook while it was on its way to disk', async () => {
    writeJsonAtomicSync(file, { v: 1 });
    const realMkdir = fs.promises.mkdir;
    vi.spyOn(fs.promises, 'mkdir').mockImplementation((async (...args: Parameters<typeof fs.promises.mkdir>) => {
      const out = await realMkdir(...args);
      freezeAtomicWrites(); // the restore starts while this write is in flight
      return out;
    }) as typeof fs.promises.mkdir);
    const write = writeJsonAtomic(file, { v: 'stale in-memory copy' });
    expect(await drainAtomicWrites()).toBe(true);
    await write;
    expect(readJsonSync(file, null)).toEqual({ v: 1 });
    thawAtomicWrites({ replay: false });
    expect(readJsonSync(file, null)).toEqual({ v: 1 });
    expect(listDir().filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('drops held writes when the restore committed', async () => {
    writeJsonAtomicSync(file, { v: 1 });
    freezeAtomicWrites();
    await writeJsonAtomic(file, { v: 'stale in-memory copy' });
    thawAtomicWrites({ replay: false });
    expect(readJsonSync(file, null)).toEqual({ v: 1 });
  });
});
