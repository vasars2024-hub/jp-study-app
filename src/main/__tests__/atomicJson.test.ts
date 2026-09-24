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

  it('a missing primary is a first run, not damage: .bak is not resurrected', () => {
    fs.writeFileSync(`${file}.bak`, '["deleted on purpose"]');
    const result = readJsonDetailedSync(file, []);
    expect(result).toEqual({ value: [], source: 'missing' });
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

  it('drops held writes when the restore committed', async () => {
    writeJsonAtomicSync(file, { v: 1 });
    freezeAtomicWrites();
    await writeJsonAtomic(file, { v: 'stale in-memory copy' });
    thawAtomicWrites({ replay: false });
    expect(readJsonSync(file, null)).toEqual({ v: 1 });
  });
});
