import { describe, expect, it } from 'vitest';
import {
  ASSET_CATALOG,
  REGISTRY_SCHEMA,
  SIZE_TOLERANCE,
  TEMP_OVERHEAD_FACTOR,
  assetPinCoverage,
  assetsForLang,
  canTransition,
  findAsset,
  formatBytes,
  isBusy,
  isResumable,
  mergeRegistry,
  preflightDiskSpace,
  starterAssetIds,
  starterAssetsForLang,
  totalSize,
  verifyAsset,
  type AssetSpec,
  type AssetStatus,
} from '../assetRegistry';

const spec = (over: Partial<AssetSpec> = {}): AssetSpec => ({
  id: 'test-asset',
  name: 'Test asset',
  description: 'A test asset',
  kind: 'whisper',
  lang: 'any',
  url: 'https://example.com/model.bin',
  sizeBytes: 1000,
  version: '1',
  installDir: 'test-asset',
  ...over,
});

const status = (over: Partial<AssetStatus> = {}): AssetStatus => ({
  id: 'test-asset',
  state: 'not-installed',
  receivedBytes: 0,
  totalBytes: 1000,
  bytesPerSecond: 0,
  ...over,
});

describe('catalog', () => {
  it('has unique ids and install dirs', () => {
    const ids = ASSET_CATALOG.map((a) => a.id);
    const dirs = ASSET_CATALOG.map((a) => a.installDir);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it('gives every non-archive asset a filename to install as', () => {
    for (const asset of ASSET_CATALOG) {
      if (asset.archive !== 'zip') expect(asset.file, asset.id).toBeTruthy();
    }
  });

  it('never ships a malformed pinned hash', () => {
    for (const asset of ASSET_CATALOG) {
      if (asset.sha256) expect(asset.sha256, asset.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('preflightDiskSpace', () => {
  it('requires room for the payload plus its temp copy', () => {
    const result = preflightDiskSpace(1000, 10_000);
    expect(result.requiredBytes).toBe(Math.ceil(1000 * TEMP_OVERHEAD_FACTOR));
    expect(result.ok).toBe(true);
    expect(result.shortfallBytes).toBe(0);
  });

  it('blocks when free space covers the file but not the temp copy', () => {
    // The trap this guards: 1200 bytes free "fits" a 1000-byte model, then the
    // install dies at the copy step.
    const result = preflightDiskSpace(1000, 1200);
    expect(result.ok).toBe(false);
    expect(result.shortfallBytes).toBe(Math.ceil(1000 * TEMP_OVERHEAD_FACTOR) - 1200);
  });

  it('reports the exact shortfall so the warning can name a number', () => {
    const result = preflightDiskSpace(1_000_000_000, 0);
    expect(result.shortfallBytes).toBe(result.requiredBytes);
  });
});

describe('verifyAsset', () => {
  it('accepts a matching pinned hash', () => {
    const s = spec({ sha256: 'a'.repeat(64) });
    const outcome = verifyAsset(s, 'A'.repeat(64), 1000);
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe('sha256');
  });

  it('rejects a mismatched pinned hash even when the size is right', () => {
    const s = spec({ sha256: 'a'.repeat(64) });
    const outcome = verifyAsset(s, 'b'.repeat(64), 1000);
    expect(outcome.ok).toBe(false);
    expect(outcome.mode).toBe('sha256');
    // main composes {key, vars}, never a sentence — only the renderer,
    // which knows the active language, ever calls t() on it.
    expect(outcome.reason).toEqual({ key: 'assetError.checksumMismatch' });
  });

  it('falls back to a size check when no hash is pinned', () => {
    const outcome = verifyAsset(spec(), 'c'.repeat(64), 1000);
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe('size');
    // The computed hash is still recorded, so later integrity checks have a baseline.
    expect(outcome.actualSha256).toBe('c'.repeat(64));
  });

  it('rejects an empty or HTML-sized body when the catalog expects a large file', () => {
    const large = spec({ sizeBytes: 50_000_000 });
    const outcome = verifyAsset(large, 'c'.repeat(64), 2_000);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason?.key).toBe('assetError.sizeMismatch');
  });

  it('rejects a fully empty download', () => {
    const outcome = verifyAsset(spec({ sizeBytes: 50_000_000 }), 'c'.repeat(64), 0);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason?.key).toBe('assetError.sizeMismatch');
  });

  it('allows size drift on unpinned assets (GitHub latest / HF remuxes)', () => {
    // Catalog listed ~63 MB; current JMdict zip is ~15 MB — still a real payload.
    const outcome = verifyAsset(spec({ sizeBytes: 62_914_560 }), 'c'.repeat(64), 15_487_771);
    expect(outcome.ok).toBe(true);
  });

  it('tolerates small upstream size drift', () => {
    const withinTolerance = Math.round(1000 * (1 + SIZE_TOLERANCE / 2));
    expect(verifyAsset(spec(), 'c'.repeat(64), withinTolerance).ok).toBe(true);
  });
});

describe('state machine', () => {
  it('allows the happy path', () => {
    expect(canTransition('not-installed', 'queued')).toBe(true);
    expect(canTransition('queued', 'downloading')).toBe(true);
    expect(canTransition('downloading', 'verifying')).toBe(true);
    expect(canTransition('verifying', 'installed')).toBe(true);
  });

  it('allows pause and resume', () => {
    expect(canTransition('downloading', 'paused')).toBe(true);
    expect(canTransition('paused', 'queued')).toBe(true);
  });

  it('allows delete and re-download from installed', () => {
    // The core acceptance criterion of Phase 6.
    expect(canTransition('installed', 'not-installed')).toBe(true);
    expect(canTransition('not-installed', 'queued')).toBe(true);
    expect(canTransition('installed', 'queued')).toBe(true);
  });

  it('never rewinds a failed verification into downloading', () => {
    expect(canTransition('verifying', 'downloading')).toBe(false);
    expect(canTransition('verifying', 'failed')).toBe(true);
    expect(canTransition('failed', 'queued')).toBe(true);
  });

  it('cannot jump straight from not-installed to installed', () => {
    expect(canTransition('not-installed', 'installed')).toBe(false);
    expect(canTransition('downloading', 'installed')).toBe(false);
  });

  it('marks in-flight states as busy', () => {
    expect(isBusy('queued')).toBe(true);
    expect(isBusy('downloading')).toBe(true);
    expect(isBusy('verifying')).toBe(true);
    expect(isBusy('paused')).toBe(false);
    expect(isBusy('installed')).toBe(false);
  });

  it('only treats a paused download with bytes on disk as resumable', () => {
    expect(isResumable(status({ state: 'paused', receivedBytes: 500 }))).toBe(true);
    expect(isResumable(status({ state: 'paused', receivedBytes: 0 }))).toBe(false);
    expect(isResumable(status({ state: 'failed', receivedBytes: 500 }))).toBe(false);
  });
});

describe('mergeRegistry', () => {
  const bundled = [spec({ id: 'a' }), spec({ id: 'b', installDir: 'b' })];

  it('lets a remote entry replace a bundled one by id', () => {
    const merged = mergeRegistry(bundled, {
      schema: REGISTRY_SCHEMA,
      assets: [spec({ id: 'a', url: 'https://cdn.example.com/moved.bin', version: '2' })],
    });
    expect(findAsset(merged, 'a')?.url).toBe('https://cdn.example.com/moved.bin');
    expect(findAsset(merged, 'a')?.version).toBe('2');
    expect(findAsset(merged, 'b')).toBeTruthy();
  });

  it('adds assets the shipped build never knew about', () => {
    const merged = mergeRegistry(bundled, {
      schema: REGISTRY_SCHEMA,
      assets: [spec({ id: 'c', installDir: 'c' })],
    });
    expect(merged).toHaveLength(3);
  });

  it('lets a remote entry pin a hash the bundled catalog lacks', () => {
    const merged = mergeRegistry(bundled, {
      schema: REGISTRY_SCHEMA,
      assets: [spec({ id: 'a', sha256: 'd'.repeat(64) })],
    });
    expect(findAsset(merged, 'a')?.sha256).toBe('d'.repeat(64));
  });

  it('ignores a registry from a schema it does not understand', () => {
    const merged = mergeRegistry(bundled, {
      schema: REGISTRY_SCHEMA + 1,
      assets: [spec({ id: 'a', url: 'https://evil.example.com/x.bin' })],
    });
    expect(merged).toEqual(bundled);
  });

  it('drops malformed entries rather than trusting them', () => {
    const merged = mergeRegistry(bundled, {
      schema: REGISTRY_SCHEMA,
      assets: [
        { ...spec({ id: 'a' }), url: 'http://insecure.example.com/x.bin' },
        { ...spec({ id: 'b' }), sha256: 'not-a-hash' },
        { ...spec({ id: 'c' }), installDir: '../../escape' },
        { ...spec({ id: '../evil' }) },
        { ...spec({ id: 'd', installDir: 'd' }), sizeBytes: 0 },
      ],
    });
    // Every one of those is rejected, so the bundled catalog stands untouched.
    expect(merged).toEqual(bundled);
  });

  it('falls back to the bundled catalog on junk input', () => {
    expect(mergeRegistry(bundled, null)).toEqual(bundled);
    expect(mergeRegistry(bundled, 'nope')).toEqual(bundled);
    expect(mergeRegistry(bundled, { schema: REGISTRY_SCHEMA })).toEqual(bundled);
  });
});

describe('language sets', () => {
  it('includes language-neutral assets in each language set', () => {
    const ja = assetsForLang(ASSET_CATALOG, 'ja');
    expect(ja.some((a) => a.id === 'jmdict-yomitan')).toBe(true);
    expect(ja.some((a) => a.id === 'whisper-base')).toBe(true);
    expect(ja.some((a) => a.id === 'cc-cedict')).toBe(false);
  });

  it('sums the download size of a setup bundle', () => {
    expect(totalSize(ASSET_CATALOG, ['whisper-tiny', 'whisper-base'])).toBe(
      77_691_713 + 147_951_465,
    );
    expect(totalSize(ASSET_CATALOG, ['nope'])).toBe(0);
  });

  it('starter set excludes whispers and is ZH-only for Phase 8', () => {
    expect(starterAssetIds('ja')).toEqual([]);
    expect(starterAssetIds('zh')).toEqual(['cc-cedict']);
    expect(starterAssetsForLang(ASSET_CATALOG, 'zh').map((a) => a.id)).toEqual(['cc-cedict']);
    expect(starterAssetsForLang(ASSET_CATALOG, 'ja')).toEqual([]);
  });
});

describe('formatBytes', () => {
  it('formats the sizes users actually see', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(-5)).toBe('0 MB');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(147_951_465)).toBe('141 MB');
    expect(formatBytes(1_533_763_059)).toBe('1.4 GB');
  });
});

describe('sha256 pin coverage (audit T6)', () => {
  /*
   * `AssetSpec.sha256` is optional on purpose — a wrong pin fails every install
   * unrecoverably, so an unconfirmed hash is omitted rather than guessed. The
   * cost of that design is that the catalog can drift to entirely unpinned
   * without a single test failing, and it did: 0 of 21 when T6 was measured on
   * 2026-08-04, so every real install verified by plausible size and the strong
   * path was exercised only by the fixtures in this file.
   *
   * **Raised to 1 on 2026-08-05 (C1-6).** `comic-text-detector` is now pinned.
   * Its hash was not guessed — it was recorded from three sources that agree: a
   * fresh download from the URL, the sha256 of the installed copy on disk, and
   * the hash already in the install record. See the comment on that spec.
   *
   * **1 of 21 is the correct ceiling here, not a shortfall.** The other 20 URLs
   * are mutable (HuggingFace `/resolve/main/`, GitHub `raw/main/` and
   * `releases/latest/`, regenerated MDBG and Tatoeba exports), and pinning a
   * moving target turns every legitimate upstream release into a
   * `checksumMismatch` on a good file — a recurring tax that ends with the check
   * switched off. `comic-text-detector` is the only spec whose URL names an
   * immutable release tag. Do not "improve" this number by pinning the rest;
   * `assetsReverify` / `assetsIntegrity` in main/downloads.ts are what cover
   * those, by comparing against what was actually installed.
   *
   * This is a ratchet, not a target: it guarantees the number only ever moves
   * the right way.
   */
  const PINNED_BASELINE = 1;

  it('never loses a pin it already had', () => {
    const { pinned, total, unpinned } = assetPinCoverage();
    expect(total).toBeGreaterThan(0);
    expect(
      pinned,
      `pin coverage fell to ${pinned}/${total}. Unpinned: ${unpinned.join(', ')}`,
    ).toBeGreaterThanOrEqual(PINNED_BASELINE);
  });

  it('states the pinned count honestly rather than implying the strong path is live', () => {
    // If this fails because someone pinned an asset: good — raise
    // PINNED_BASELINE to the new number and update the comment above.
    const { pinned, total } = assetPinCoverage();
    expect({ pinned, total }).toEqual({ pinned: 1, total: 21 });
  });
});
