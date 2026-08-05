// @vitest-environment node
/**
 * Asset integrity — audit T6.
 *
 * Every install has always recorded the real sha256 of what it fetched
 * (`recordInstall` in downloads.ts). **Nothing ever read it back**, so the record
 * was write-only bookkeeping and there was no way to answer "is my copy still
 * what I installed?".
 *
 * Three behaviours are under test, and the third is the one that matters most:
 *
 *  1. `reverifyAsset` rehashes the file ON DISK against the record — the one
 *     integrity guarantee that needs no cooperation from upstream.
 *  2. `compareWithRecordedHash` reports upstream drift on a re-download. It must
 *     report, never throw and never block: on a mutable URL a changed file is
 *     usually a legitimate release, and a hard failure there is the same trap as
 *     pinning one.
 *  3. `listIntegrity` must surface `verifyMode` **verbatim**. An asset checked by
 *     size was never checksum-verified, and any collapse of the two modes into a
 *     single "verified" flag is exactly the dishonesty T6 is about.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Hoisted so a *static* import of the module under test works: the `vi.mock`
// factory runs during that import, before ordinary top-level consts initialise.
// `await import()` after the consts is the older idiom here but costs a TS1378
// top-level-await error under this tsconfig.
const { tmpRoot } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- hoisted above imports
  const nfs = require('node:fs') as typeof import('node:fs');
  const nos = require('node:os') as typeof import('node:os');
  const npath = require('node:path') as typeof import('node:path');
  return { tmpRoot: nfs.mkdtempSync(npath.join(nos.tmpdir(), 'downloads-integrity-')) };
});

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined, on: () => undefined },
}));

const CATALOG = [
  {
    id: 'pinned-asset',
    name: 'Pinned asset',
    description: 'immutable release tag',
    kind: 'ocr' as const,
    lang: 'any' as const,
    url: 'https://example.invalid/pinned.bin',
    sizeBytes: 11,
    version: '1',
    installDir: 'pinned-asset',
    file: 'pinned.bin',
    sha256: 'ignored-by-these-tests',
  },
  {
    id: 'floating-asset',
    name: 'Floating asset',
    description: 'resolve/main',
    kind: 'ocr' as const,
    lang: 'any' as const,
    url: 'https://example.invalid/floating.bin',
    sizeBytes: 11,
    version: '1',
    installDir: 'floating-asset',
    file: 'floating.bin',
  },
];

import {
  reverifyAsset,
  compareWithRecordedHash,
  listIntegrity,
  initDownloads,
} from '../downloads';
import { ASSET_CATALOG } from '../../shared/assetRegistry';

const modelsRoot = path.join(tmpRoot, 'models');
const statePath = () => path.join(modelsRoot, 'state.json');

const sha = (buf: Buffer | string): string =>
  crypto.createHash('sha256').update(buf).digest('hex');

function writeInstalled(id: string, dir: string, file: string, contents: string): string {
  const full = path.join(modelsRoot, dir);
  fs.mkdirSync(full, { recursive: true });
  const target = path.join(full, file);
  fs.writeFileSync(target, contents);
  return target;
}

function writeState(state: Record<string, unknown>): void {
  fs.mkdirSync(modelsRoot, { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  fs.rmSync(modelsRoot, { recursive: true, force: true });
  fs.mkdirSync(modelsRoot, { recursive: true });
  await initDownloads({ catalog: CATALOG as never });
});

describe('reverifyAsset', () => {
  it('confirms a file that still hashes to its recorded value', async () => {
    const body = 'hello world';
    writeInstalled('floating-asset', 'floating-asset', 'floating.bin', body);
    writeState({
      'floating-asset': {
        version: '1',
        sha256: sha(body),
        verifyMode: 'size',
        bytes: body.length,
        installedAt: 1,
      },
    });
    const out = await reverifyAsset('floating-asset');
    expect(out).toMatchObject({ id: 'floating-asset', state: 'ok', mode: 'size' });
    expect((out as { sha256: string }).sha256).toBe(sha(body));
  });

  // The point of the whole feature: catches local corruption and post-install
  // tampering, neither of which upstream can help with.
  it('detects a file whose bytes changed after installation', async () => {
    const original = 'hello world';
    writeInstalled('floating-asset', 'floating-asset', 'floating.bin', 'tampered!!!');
    writeState({
      'floating-asset': {
        version: '1',
        sha256: sha(original),
        verifyMode: 'size',
        bytes: original.length,
        installedAt: 1,
      },
    });
    const out = await reverifyAsset('floating-asset');
    expect(out.state).toBe('changed');
    expect(out).toMatchObject({ expected: sha(original), actual: sha('tampered!!!') });
  });

  it('reports a deleted file as missing rather than throwing', async () => {
    writeState({
      'floating-asset': { version: '1', sha256: sha('x'), verifyMode: 'size', bytes: 1, installedAt: 1 },
    });
    await expect(reverifyAsset('floating-asset')).resolves.toMatchObject({ state: 'missing' });
  });

  it('reports no-record for an asset installed before integrity records existed', async () => {
    writeInstalled('floating-asset', 'floating-asset', 'floating.bin', 'hello world');
    writeState({});
    await expect(reverifyAsset('floating-asset')).resolves.toMatchObject({ state: 'no-record' });
  });

  it('reports an unknown id as an error rather than throwing', async () => {
    await expect(reverifyAsset('no-such-asset')).resolves.toMatchObject({ state: 'error' });
  });

  it('is case-insensitive about the recorded hash', async () => {
    const body = 'hello world';
    writeInstalled('floating-asset', 'floating-asset', 'floating.bin', body);
    writeState({
      'floating-asset': {
        version: '1',
        sha256: sha(body).toUpperCase(),
        verifyMode: 'size',
        bytes: body.length,
        installedAt: 1,
      },
    });
    await expect(reverifyAsset('floating-asset')).resolves.toMatchObject({ state: 'ok' });
  });
});

describe('compareWithRecordedHash', () => {
  beforeEach(() => {
    writeState({
      'floating-asset': {
        version: '1',
        sha256: sha('old bytes'),
        verifyMode: 'size',
        bytes: 9,
        installedAt: 1,
      },
    });
  });

  it('reports unchanged when upstream serves the same bytes', () => {
    expect(compareWithRecordedHash('floating-asset', sha('old bytes'))).toMatchObject({
      changed: false,
    });
  });

  it('reports changed, and names both hashes so the warning can quote them', () => {
    const out = compareWithRecordedHash('floating-asset', sha('new bytes'));
    expect(out).toMatchObject({ changed: true, previous: sha('old bytes'), current: sha('new bytes') });
  });

  it('returns null when there is nothing to compare against', () => {
    expect(compareWithRecordedHash('pinned-asset', sha('anything'))).toBeNull();
  });

  it('ignores hash case on both sides', () => {
    expect(
      compareWithRecordedHash('floating-asset', sha('old bytes').toUpperCase()),
    ).toMatchObject({ changed: false });
  });
});

describe('listIntegrity — the honesty requirement', () => {
  it('never collapses size-verification into "verified"', async () => {
    writeInstalled('floating-asset', 'floating-asset', 'floating.bin', 'hello world');
    writeState({
      'floating-asset': {
        version: '1',
        sha256: sha('hello world'),
        verifyMode: 'size',
        bytes: 11,
        installedAt: 1,
      },
    });
    await initDownloads({ catalog: CATALOG as never });
    const row = listIntegrity().find((r) => r.id === 'floating-asset')!;

    // The mode is reported verbatim, and there is no boolean that would let a UI
    // render a size-checked asset as checksum-verified.
    expect(row.verifyMode).toBe('size');
    expect(row.pinned).toBe(false);
    expect(Object.keys(row)).not.toContain('verified');
  });

  it('reports `pinned` from the catalog, not from the install record', async () => {
    writeState({
      // recorded as size-verified even though the spec carries a hash
      'pinned-asset': { version: '1', sha256: sha('a'), verifyMode: 'size', bytes: 1, installedAt: 1 },
    });
    await initDownloads({ catalog: CATALOG as never });
    const rows = listIntegrity();
    expect(rows.find((r) => r.id === 'pinned-asset')!.pinned).toBe(true);
    expect(rows.find((r) => r.id === 'floating-asset')!.pinned).toBe(false);
  });

  it('returns a row for every catalog entry, installed or not', async () => {
    writeState({});
    await initDownloads({ catalog: CATALOG as never });
    const rows = listIntegrity();
    expect(rows.map((r) => r.id).sort()).toEqual(['floating-asset', 'pinned-asset']);
    for (const row of rows) {
      expect(row.verifyMode).toBeNull();
      expect(row.recordedSha256).toBeNull();
    }
  });
});

describe('the real catalog', () => {
  it('pins exactly the one immutable URL, and it is the comic-text-detector', () => {
    const pinned = ASSET_CATALOG.filter((s) => s.sha256);
    expect(pinned.map((s) => s.id)).toEqual(['comic-text-detector']);
    // The pin is only sound because the URL names an immutable release tag.
    expect(pinned[0].url).toContain('/releases/download/beta-0.2.1/');
    expect(pinned[0].sha256).toBe('1a86ace74961413cbd650002e7bb4dcec4980ffa21b2f19b86933372071d718f');
  });

  it('leaves every mutable URL unpinned, so a legitimate release is not a hard failure', () => {
    const mutable = ASSET_CATALOG.filter(
      (s) => /\/resolve\/main\/|\/raw\/main\/|\/releases\/latest\//.test(s.url),
    );
    expect(mutable.length).toBeGreaterThan(0);
    expect(mutable.filter((s) => s.sha256).map((s) => s.id)).toEqual([]);
  });
});

// Keep fsp referenced so the import is not dropped by a future edit that stops
// using it — the async access() path in reverifyAsset depends on it.
void fsp;
